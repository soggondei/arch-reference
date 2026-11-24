-- Private office records use the existing paired-device identity.
create schema lv_register;
revoke all on schema lv_register from public, anon, authenticated;

create table lv_register.owners (employee_id uuid primary key references lv_attendance.employees(id));
create table lv_register.templates (
  id text primary key, owner_id uuid references lv_register.owners(employee_id),
  body jsonb not null check(jsonb_typeof(body)='object'), version integer not null default 1
);
create table lv_register.cases (
  id uuid primary key, serial bigint generated always as identity unique, owner_id uuid not null references lv_register.owners(employee_id),
  template_id text not null references lv_register.templates(id), blueprint jsonb not null,
  data jsonb not null, revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index register_cases_owner_serial on lv_register.cases(owner_id,serial);
create table lv_register.events (
  id uuid primary key, case_id uuid not null references lv_register.cases(id), body jsonb not null, created_at timestamptz not null default now()
);
create index register_events_case on lv_register.events(case_id,created_at);
create table lv_register.files (
  id uuid primary key, case_id uuid not null references lv_register.cases(id), doc_key text not null,
  object_path text not null unique default ('files/'||gen_random_uuid()::text), name text not null,
  size_bytes bigint not null check(size_bytes between 1 and 20971520), created_at timestamptz not null default now(), ready_at timestamptz, archived boolean not null default false
);
create index register_files_case on lv_register.files(case_id,doc_key);
create table lv_register.tickets (
  digest text primary key, file_id uuid not null references lv_register.files(id), purpose text not null check(purpose in ('upload','download')), expires_at timestamptz not null
);
create index register_tickets_file on lv_register.tickets(file_id);
create index register_tickets_expiry on lv_register.tickets(expires_at);
-- Reference documents are provisioned privately, outside the public source repository.
create table lv_register.asset_parts (asset text not null, part integer not null check(part>=0), content bytea not null, primary key(asset,part));

alter table lv_register.owners enable row level security;
alter table lv_register.templates enable row level security;
alter table lv_register.cases enable row level security;
alter table lv_register.events enable row level security;
alter table lv_register.files enable row level security;
alter table lv_register.tickets enable row level security;
alter table lv_register.asset_parts enable row level security;
revoke all on all tables in schema lv_register from public, anon, authenticated;
revoke all on all sequences in schema lv_register from public, anon, authenticated;

create function lv_register.member(p_key text) returns uuid language plpgsql security invoker set search_path='' as $$
declare k uuid := lv_attendance.personal_employee_id(p_key);
begin
  if not exists(select from lv_register.owners o where o.employee_id=k) then raise exception using errcode='42501',message='work register access required'; end if;
  return k;
end; $$;

create function lv_register.valid_template(t jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;
begin
  if jsonb_typeof(t) is distinct from 'object' or coalesce(length(btrim(t->>'name')),0) not between 1 and 90
    or length(t::text)>130000 then return false; end if;
  foreach k in array array['stages','checks','docs','terminal','events'] loop
    if jsonb_typeof(t->k) is distinct from 'array' or jsonb_array_length(t->k)>100 then return false; end if;
  end loop;
  if jsonb_array_length(t->'stages')<1 or jsonb_array_length(t->'events')<1 then return false; end if;
  if exists(select from jsonb_array_elements_text(t->'stages') s(v) where length(btrim(v)) not between 1 and 60)
    or exists(select from jsonb_array_elements_text(t->'terminal') s(v) where not ((t->'stages') ? v)) then return false; end if;
  foreach k in array array['checks','docs'] loop
    if exists(select from jsonb_array_elements(t->k) s(v) where coalesce(v->>'id','') !~ '^[a-zA-Z0-9_-]{1,70}$' or coalesce(length(btrim(v->>'name')),0) not between 1 and 160)
      or (select count(distinct v->>'id') from jsonb_array_elements(t->k) s(v))<>jsonb_array_length(t->k) then return false; end if;
  end loop;
  return true;
end; $$;

create function lv_register.finalize_files(p_case uuid) returns void language plpgsql security invoker set search_path='' as $$
declare f record;
begin
  for f in update lv_register.files a set ready_at=statement_timestamp() from storage.objects o
    where a.case_id=p_case and a.ready_at is null and o.bucket_id='lv-work-register' and o.name=a.object_path
      and o.metadata->>'size'=a.size_bytes::text returning a.doc_key loop
    update lv_register.cases c set data=case when coalesce(c.data->'docs'->f.doc_key->>'status','미요청') in ('미요청','요청','보완 요청') then
      jsonb_set(c.data,array['docs',f.doc_key],coalesce(c.data->'docs'->f.doc_key,'{}'::jsonb)||jsonb_build_object('status','수합','date',to_char(statement_timestamp() at time zone 'Asia/Seoul','YYYY-MM-DD')))
      else c.data end,revision=c.revision+1,updated_at=statement_timestamp() where c.id=p_case;
  end loop;
end; $$;

create function lv_register.detail(c lv_register.cases) returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',c.id,'serial',c.serial,'templateId',c.template_id,'blueprint',c.blueprint,'data',c.data,
    'revision',c.revision,'created',c.created_at,'updated',c.updated_at,
    'events',coalesce((select jsonb_agg(e.body||jsonb_build_object('id',e.id,'created',e.created_at) order by e.body->>'date' desc,e.created_at desc) from lv_register.events e where e.case_id=c.id),'[]'::jsonb),
    'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'doc',f.doc_key,'name',f.name,'size',f.size_bytes,'date',f.ready_at,'archived',f.archived) order by f.ready_at desc) from lv_register.files f where f.case_id=c.id and f.ready_at is not null),'[]'::jsonb))
$$;

create function lv_register.dispatch(p_key text,p_action text,p_case uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<register_action>>
declare owner_key uuid:=lv_register.member(p_key);
  c lv_register.cases; t lv_register.templates; f lv_register.files;
  data jsonb:=p_args->'data'; e jsonb:=p_args->'event'; b jsonb:=p_args->'template';
  tid text:=p_args->>'templateId'; doc text:=p_args->>'doc'; fid uuid; stamp text; result jsonb;
  last_serial bigint; next_serial bigint; stored bigint; op text; proj text;
begin
  if p_args is null or jsonb_typeof(p_args)<>'object' then raise exception using errcode='22023',message='invalid inputs'; end if;
  if p_action='catalog' then
    return jsonb_build_object('templates',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',version,'custom',owner_id is not null,'body',body) order by owner_id nulls first,body->>'order',body->>'name') from lv_register.templates where owner_id is null or owner_id=owner_key),'[]'::jsonb),
      'projects',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.title) order by r.title) from public.refs r where jsonb_typeof(r.competition_data)='object' and r.competition_data ? 'status' and coalesce(r.competition_data->>'workspaceKind','')<>'office'),'[]'::jsonb));
  elsif p_action='list' then
    last_serial:=coalesce((p_args->>'after')::bigint,0);
    with page as (select * from lv_register.cases where owner_id=owner_key and serial>last_serial order by serial limit 80)
    select coalesce(jsonb_agg(jsonb_build_object('id',c0.id,'serial',c0.serial,'type',c0.blueprint->>'name','templateId',c0.template_id,'title',c0.data->>'title','client',c0.data->>'client','address',c0.data->>'address','projectId',c0.data->>'projectId','stage',c0.data->>'stage','closed',(c0.blueprint->'terminal') ? (c0.data->>'stage'),'due',c0.data->>'due','nextAction',c0.data->>'nextAction','archived',c0.data->'archived','updated',c0.updated_at,'docsTotal',jsonb_array_length(c0.blueprint->'docs')-(select count(*) from jsonb_each(c0.data->'docs') d where d.value->>'status'='해당 없음'),'docsReceived',(select count(*) from jsonb_each(c0.data->'docs') d where d.value->>'status' in ('수합','검토 완료'))) order by c0.serial),'[]'::jsonb),case when count(*)=80 then max(serial) end into result,next_serial from page c0;
    return jsonb_build_object('items',result,'after',next_serial);
  elsif p_action='template' then
    if tid is null or tid !~ '^u-[0-9a-f-]{36}$' or not lv_register.valid_template(b) or coalesce((b->>'special')::boolean,false) then raise exception using errcode='22023',message='invalid template'; end if;
    if coalesce((p_args->>'version')::int,0)=0 then
      insert into lv_register.templates(id,owner_id,body) values(tid,owner_key,b) on conflict do nothing;
      if not found and not exists(select from lv_register.templates where id=tid and owner_id=owner_key and body=b) then raise exception using errcode='40001',message='template changed'; end if;
    else
      update lv_register.templates set body=b, version=version+1 where id=tid and owner_id=owner_key and version=(p_args->>'version')::int;
      if not found then raise exception using errcode='40001',message='template changed'; end if;
    end if;
    return jsonb_build_object('id',tid);
  elsif p_action='asset' then
    select encode(string_agg(content,''::bytea order by part),'base64') into stamp from lv_register.asset_parts where asset=p_args->>'asset';
    if stamp is null then raise exception using errcode='P0002',message='resource missing'; end if; return to_jsonb(stamp);
  end if;
  if p_case is null then raise exception using errcode='22023',message='case required'; end if;
  if p_action='create' then
    select * into t from lv_register.templates where id=tid and (owner_id is null or owner_id=owner_key);
    if t.id is null or coalesce(length(btrim(data->>'title')),0) not between 1 and 120 or jsonb_typeof(data) is distinct from 'object' or length(data::text)>22000 then raise exception using errcode='22023',message='invalid case'; end if;
    proj:=nullif(data->>'projectId','');
    if proj is not null and not exists(select from public.refs r where r.id=proj and r.competition_data ? 'status' and coalesce(r.competition_data->>'workspaceKind','')<>'office') then raise exception using errcode='22023',message='invalid project'; end if;
    insert into lv_register.cases(id,owner_id,template_id,blueprint,data) values(p_case,owner_key,tid,t.body,data||jsonb_build_object('stage',t.body->'stages'->>0,'archived',false,'checks','{}'::jsonb,'docs','{}'::jsonb)) on conflict(id) do nothing;
  end if;
  select * into c from lv_register.cases where id=p_case and owner_id=owner_key for update;
  if c.id is null then raise exception using errcode='P0002',message='case not found'; end if;
  if p_action in ('get','create') then
    perform lv_register.finalize_files(c.id);
  elsif p_action='update' then
    if e is not null and exists(select from lv_register.events h where h.case_id=c.id and h.id=(e->>'id')::uuid) then return lv_register.detail(c); end if;
    if c.revision is distinct from (p_args->>'revision')::int then raise exception using errcode='40001',message='case changed'; end if;
    if jsonb_typeof(data) is distinct from 'object' or coalesce(length(btrim(data->>'title')),0) not between 1 and 120
      or jsonb_typeof(data->'checks') is distinct from 'object' or jsonb_typeof(data->'docs') is distinct from 'object'
      or jsonb_typeof(data->'archived') is distinct from 'boolean' or not coalesce((c.blueprint->'stages') ? (data->>'stage'),false) or length(data::text)>700000 then
      raise exception using errcode='22023',message='invalid case data'; end if;
    proj:=nullif(data->>'projectId',''); if proj is not null and proj is distinct from nullif(c.data->>'projectId','') and not exists(select from public.refs r where r.id=proj and r.competition_data ? 'status' and coalesce(r.competition_data->>'workspaceKind','')<>'office') then raise exception using errcode='22023',message='invalid project'; end if;
    if e is not null then
      if jsonb_typeof(e) is distinct from 'object' or length(e::text)>13000 or coalesce(length(btrim(e->>'body')),0)=0 then raise exception using errcode='22023',message='invalid event'; end if;
      insert into lv_register.events(id,case_id,body) values((e->>'id')::uuid,c.id,e);
    end if;
    update lv_register.cases set data=register_action.data, revision=revision+1,updated_at=statement_timestamp() where id=c.id;
  elsif p_action in ('prepare','finish','download','fileArchive','fileRestore') then
    fid:=(p_args->>'fileId')::uuid;
    if fid is null or not exists(select from jsonb_array_elements(c.blueprint->'docs') x where x->>'id'=doc) then raise exception using errcode='22023',message='invalid document'; end if;
    select * into f from lv_register.files where id=fid and case_id=c.id and doc_key=doc for update;
    if p_action='prepare' then
      if coalesce(length(btrim(p_args->>'name')),0) not between 1 and 240 or p_args->>'name' ~ '[[:cntrl:]/]' or position(chr(92) in (p_args->>'name'))>0
        or coalesce(p_args->>'size','') !~ '^[1-9][0-9]{0,7}$' then raise exception using errcode='22023',message='invalid file'; end if;
      stored:=(p_args->>'size')::bigint;
      if stored>20971520 then raise exception using errcode='22023',message='file too large'; end if;
      if f.id is null then
        insert into lv_register.files(id,case_id,doc_key,name,size_bytes) values(fid,c.id,doc,p_args->>'name',stored) returning * into f;
      elsif f.name<>p_args->>'name' or f.size_bytes<>stored or f.archived then raise exception using errcode='40001',message='reservation changed'; end if;
    end if;
    if f.id is null then raise exception using errcode='P0002',message='file missing'; end if;
    if p_action in ('prepare','finish') then
      perform lv_register.finalize_files(c.id);
      select * into f from lv_register.files where id=fid;
      if f.ready_at is not null and p_action='prepare' then return '{"ready":true}'::jsonb; end if;
    end if;
    if p_action<>'prepare' and f.ready_at is null then raise exception using errcode='55000',message='upload incomplete'; end if;
    if p_action in ('prepare','download') then
      stamp:=p_args->>'ticketHash'; if coalesce(stamp,'') !~ '^[0-9a-f]{64}$' or (f.archived and p_action='download') then raise exception using errcode='22023',message='invalid file ticket'; end if;
      delete from lv_register.tickets where expires_at<=statement_timestamp();
      insert into lv_register.tickets(digest,file_id,purpose,expires_at) values(stamp,fid,case when p_action='prepare' then 'upload' else 'download' end,statement_timestamp()+interval '3 minutes');
      return jsonb_build_object('path',f.object_path,'name',f.name);
    elsif p_action in ('fileArchive','fileRestore') then
      update lv_register.files set archived=(p_action='fileArchive') where id=fid and archived is distinct from (p_action='fileArchive');
      if found then update lv_register.cases set revision=revision+1,updated_at=statement_timestamp() where id=c.id; end if;
    end if;
  else raise exception using errcode='22023',message='unknown action'; end if;
  select * into c from lv_register.cases where id=p_case and owner_id=owner_key;
  return lv_register.detail(c);
end; $$;

create function public.lv_work_register(p_key text,p_action text,p_case uuid default null,p_args jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=''
return lv_register.dispatch(p_key,p_action,p_case,p_args);
revoke all on all functions in schema lv_register from public, anon, authenticated;
revoke all on function public.lv_work_register(text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function lv_register.dispatch(text,text,uuid,jsonb),public.lv_work_register(text,text,uuid,jsonb) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('lv-work-register','lv-work-register',false,20971520);
create function lv_register.allow_file(p_path text,p_purpose text) returns boolean language sql stable security definer set search_path='' as $$
  with h as(select nullif(current_setting('request.headers',true),'')::jsonb v),
  k as(select coalesce(nullif(v->>'x-lv-register-ticket',''),substring(v->>'x-client-info' from '^lv-register-ticket/([0-9a-f]{64})$')) secret from h)
  select exists(select from k join lv_register.tickets t on t.digest=encode(sha256(convert_to(k.secret,'UTF8')),'hex')
    join lv_register.files f on f.id=t.file_id where k.secret ~ '^[0-9a-f]{64}$' and t.expires_at>statement_timestamp() and t.purpose=p_purpose
    and f.object_path=p_path and not f.archived and ((p_purpose='upload' and f.ready_at is null) or (p_purpose='download' and f.ready_at is not null)))
$$;
revoke all on function lv_register.allow_file(text,text) from public,anon,authenticated;
grant execute on function lv_register.allow_file(text,text) to anon,authenticated;
create policy "Work register upload tickets" on storage.objects for insert to anon,authenticated with check
  (bucket_id='lv-work-register' and storage.allow_only_operation('storage.object.sign_upload_url') and lv_register.allow_file(name,'upload'));
create policy "Work register download tickets" on storage.objects for select to anon,authenticated using
  (bucket_id='lv-work-register' and storage.allow_only_operation('storage.object.sign') and lv_register.allow_file(name,'download'));
notify pgrst,'reload schema';
