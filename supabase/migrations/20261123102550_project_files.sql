begin;

-- Pairing belongs to the owner, so their other paired devices see the same files.
-- Preserve the private record and original project ID if the public index changes.
create table lv_attendance.project_files (
  id uuid primary key,
  owner_id uuid not null references lv_attendance.employees(id),
  project_id text not null,
  object_path text not null unique default ('files/' || gen_random_uuid()::text),
  original_name text not null check (char_length(original_name) between 1 and 240
    and original_name !~ '[[:cntrl:]/]' and position(chr(92) in original_name) = 0),
  expected_size bigint not null check (expected_size between 1 and 52428800),
  stage text not null check (stage in ('reference','process','final')),
  kind text not null check (kind in ('image','drawing','model','document','other')),
  task_id text,
  task_name text,
  created_at timestamptz not null default statement_timestamp(),
  ready_at timestamptz,
  archived boolean not null default false,
  version integer not null default 1
);
create index project_files_owner_project on lv_attendance.project_files(owner_id, project_id, created_at desc, id);

create table lv_attendance.project_file_tickets (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  file_id uuid not null references lv_attendance.project_files(id) on delete cascade,
  purpose text not null check (purpose in ('upload','download')),
  expires_at timestamptz not null
);
create index project_file_tickets_expiry on lv_attendance.project_file_tickets(expires_at);
create index project_file_tickets_file on lv_attendance.project_file_tickets(file_id);
alter table lv_attendance.project_files enable row level security;
alter table lv_attendance.project_file_tickets enable row level security;
revoke all on lv_attendance.project_files, lv_attendance.project_file_tickets from public, anon, authenticated;

create function lv_attendance.project_files_rpc(
  p_device_key text, p_action text, p_project text, p_id uuid, p_values jsonb, p_ticket_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_key uuid := lv_attendance.personal_employee_id(p_device_key);
  project_data jsonb;
  file_row lv_attendance.project_files;
  task_key text := p_values->>'taskId';
  task_label text;
  attrs_stage text := p_values->>'stage';
  attrs_kind text := p_values->>'kind';
  file_name text := p_values->>'name';
  file_size bigint;
  file_version integer;
  result jsonb;
begin
  if p_project is null or char_length(p_project) not between 1 and 300 then
    raise exception using errcode='22023', message='invalid project';
  end if;
  select competition_data into project_data from public.refs where id = p_project;
  if project_data is null or jsonb_typeof(project_data) <> 'object' or not (project_data ? 'status') or project_data->>'workspaceKind' = 'office' then
    raise exception using errcode='P0002', message='project not found';
  end if;
  if p_action = 'list' then
    -- A successful direct upload may outlive the browser tab that started it.
    update lv_attendance.project_files f set ready_at=statement_timestamp()
      from storage.objects o where f.owner_id=owner_key and f.project_id=p_project and f.ready_at is null
      and o.bucket_id='lv-project-files' and o.name=f.object_path and (o.metadata->>'size')=f.expected_size::text;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',f.id,'projectId',f.project_id,'name',f.original_name,'size',f.expected_size,
      'stage',f.stage,'kind',f.kind,'taskId',f.task_id,'taskName',f.task_name,'createdAt',f.created_at,
      'archived',f.archived,'version',f.version
    ) order by f.created_at desc,f.id), '[]'::jsonb) into result
      from lv_attendance.project_files f where f.owner_id=owner_key and f.project_id=p_project and f.ready_at is not null;
    return result;
  end if;
  if p_id is null or p_action is null or p_action not in ('prepare','finish','download','edit','archive','restore') then
    raise exception using errcode='22023', message='invalid operation';
  end if;
  select * into file_row from lv_attendance.project_files where id=p_id and owner_id=owner_key and project_id=p_project for update;
  if file_row.id is null and p_action <> 'prepare' then
    raise exception using errcode='P0002', message='file not found';
  end if;
  if p_action in ('prepare','edit') then
    if attrs_stage is null or attrs_stage not in ('reference','process','final')
      or attrs_kind is null or attrs_kind not in ('image','drawing','model','document','other')
      or (task_key is not null and char_length(task_key) not between 1 and 300) then
      raise exception using errcode='22023', message='invalid attributes';
    end if;
    if task_key is not null then
      select item->>'taskName' into task_label from jsonb_array_elements(
        case when jsonb_typeof(project_data->'schedules')='array' then project_data->'schedules' else '[]'::jsonb end) item
        where item->>'id'=task_key and nullif(item->>'taskName','') is not null limit 1;
      -- Keeping a previously linked task is allowed after its removal from the schedule.
      if task_label is null and task_key=file_row.task_id then task_label := file_row.task_name; end if;
      if task_label is null then raise exception using errcode='22023', message='unknown project task'; end if;
    end if;
  end if;
  if p_action = 'prepare' then
    if nullif(btrim(file_name),'') is null or char_length(file_name)>240 or file_name in ('.','..')
      or file_name ~ '[[:cntrl:]/]' or position(chr(92) in file_name)>0
      or jsonb_typeof(p_values->'size') is distinct from 'number' or (p_values->>'size') !~ '^[1-9][0-9]{0,7}$' then
      raise exception using errcode='22023', message='invalid file';
    end if;
    file_size := (p_values->>'size')::bigint;
    if file_size>52428800 then raise exception using errcode='22023', message='file too large'; end if;
    if file_row.id is null then
      delete from lv_attendance.project_files f where f.owner_id=owner_key and f.project_id=p_project
        and f.ready_at is null and f.created_at<now()-interval '7 days' and not exists (
          select 1 from storage.objects o where o.bucket_id='lv-project-files' and o.name=f.object_path);
      insert into lv_attendance.project_files (id,owner_id,project_id,original_name,expected_size,stage,kind,task_id,task_name)
        values(p_id,owner_key,p_project,file_name,file_size,attrs_stage,attrs_kind,task_key,task_label) returning * into file_row;
    elsif (file_row.original_name,file_row.expected_size,file_row.stage,file_row.kind,file_row.task_id)
      is distinct from (file_name,file_size,attrs_stage,attrs_kind,task_key) then
      raise exception using errcode='40001', message='file reservation differs';
    end if;
  end if;
  if file_row.ready_at is null and p_action in ('prepare','finish') then
    update lv_attendance.project_files f set ready_at=statement_timestamp()
      from storage.objects o where f.id=p_id and f.ready_at is null and o.bucket_id='lv-project-files'
      and o.name=f.object_path and (o.metadata->>'size')=f.expected_size::text
      returning f.* into file_row;
    if file_row.id is null then
      select * into strict file_row from lv_attendance.project_files where id=p_id and owner_id=owner_key and project_id=p_project;
    end if;
  end if;
  if p_action='prepare' and file_row.ready_at is not null then return '{"ready":true}'::jsonb; end if;
  if p_action <> 'prepare' and file_row.ready_at is null then
    raise exception using errcode='55000', message='upload incomplete';
  end if;
  if p_action in ('prepare','download') then
    if p_ticket_hash is null or p_ticket_hash !~ '^[a-f0-9]{64}$' then
      raise exception using errcode='22023', message='invalid ticket';
    end if;
    delete from lv_attendance.project_file_tickets where expires_at<=statement_timestamp();
    insert into lv_attendance.project_file_tickets(token_hash,file_id,purpose,expires_at)
      values(p_ticket_hash,p_id,case when p_action='prepare' then 'upload' else 'download' end,statement_timestamp()+interval '5 minutes');
    return jsonb_build_object('path',file_row.object_path,'name',file_row.original_name);
  end if;
  if p_action in ('edit','archive','restore') then
    if jsonb_typeof(p_values->'version') is distinct from 'number' or (p_values->>'version') !~ '^[1-9][0-9]{0,9}$'
      or (p_values->>'version')::numeric>2147483647 then raise exception using errcode='22023', message='invalid version'; end if;
    file_version := (p_values->>'version')::integer;
    if p_action='edit' and (file_row.stage,file_row.kind,file_row.task_id) is not distinct from (attrs_stage,attrs_kind,task_key)
      or p_action in ('archive','restore') and file_row.archived=(p_action='archive') then
      return '{"ok":true}'::jsonb;
    end if;
    if file_version<>file_row.version then raise exception using errcode='40001', message='file changed'; end if;
    if p_action='edit' then
      update lv_attendance.project_files set stage=attrs_stage,kind=attrs_kind,task_id=task_key,task_name=task_label,version=version+1 where id=p_id;
    else
      update lv_attendance.project_files set archived=(p_action='archive'),version=version+1 where id=p_id;
    end if;
  end if;
  return '{"ok":true}'::jsonb;
end;
$$;

-- Bind the guarded private function when defining the wrapper. Data API roles
-- do not need USAGE on the schema containing the files and device credentials.
create function public.lv_project_files(p_device_key text,p_action text,p_project text,
  p_id uuid default null,p_values jsonb default '{}',p_ticket_hash text default null)
returns jsonb language sql security invoker set search_path=''
return lv_attendance.project_files_rpc(p_device_key,p_action,p_project,p_id,p_values,p_ticket_hash);
revoke all on function lv_attendance.project_files_rpc(text,text,text,uuid,jsonb,text),
  public.lv_project_files(text,text,text,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function lv_attendance.project_files_rpc(text,text,text,uuid,jsonb,text),
  public.lv_project_files(text,text,text,uuid,jsonb,text) to anon, authenticated;

-- Permit signing only for an exact object and a short-lived ticket issued
-- after checking its owner's paired device in the project-file RPC.
insert into storage.buckets (id, name, public, file_size_limit)
values ('lv-project-files', 'lv-project-files', false, 52428800)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit;

create or replace function lv_attendance.can_sign_project_file(p_path text, p_purpose text)
returns boolean language sql stable security definer set search_path = ''
as $$
  with request_headers as (
    select nullif(current_setting('request.headers', true), '')::jsonb as value
  ), ticket as (
    select coalesce(
      nullif(value ->> 'x-lv-file-ticket', ''),
      substring(value ->> 'x-client-info' from '^lv-file-ticket/([0-9a-f]{64})$')
    ) as secret from request_headers
  )
  select exists (
    select 1 from ticket
    join lv_attendance.project_file_tickets t
      on t.token_hash = encode(sha256(convert_to(ticket.secret, 'UTF8')), 'hex')
    join lv_attendance.project_files f on f.id = t.file_id
    where ticket.secret ~ '^[0-9a-f]{64}$' and t.expires_at > statement_timestamp()
      and t.purpose = p_purpose and f.object_path = p_path
      and ((p_purpose = 'upload' and f.ready_at is null and not f.archived)
        or (p_purpose = 'download' and f.ready_at is not null))
  )
$$;
revoke all on function lv_attendance.can_sign_project_file(text, text) from public, anon, authenticated;
grant execute on function lv_attendance.can_sign_project_file(text, text) to anon, authenticated;

create policy "LV project file upload signing" on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'lv-project-files'
  and storage.allow_only_operation('storage.object.sign_upload_url')
  and lv_attendance.can_sign_project_file(name, 'upload')
);

create policy "LV project file download signing" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'lv-project-files'
  and storage.allow_only_operation('storage.object.sign')
  and lv_attendance.can_sign_project_file(name, 'download')
);

notify pgrst, 'reload schema';
commit;
