begin;

-- Only a deliberately published note can leave the attendance schema.
alter table lv_attendance.personal_work_entries
  add column if not exists project_note text check (project_note is null or (project_id is not null and length(project_note) <= 4000)),
  add column if not exists public_log_id uuid;
create unique index if not exists work_entries_public_id on lv_attendance.personal_work_entries(public_log_id)
  where public_log_id is not null;
create index if not exists work_entries_shared_project on lv_attendance.personal_work_entries(project_id,work_date)
  where project_note is not null and not deleted;

create or replace function lv_attendance.save_work(
  p_device_key text, p_id uuid, p_day date, p_project_id text, p_task_id text, p_task_name text,
  p_minutes integer, p_note text, p_version integer, p_update_share boolean, p_project_note text
)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  owner_id uuid := lv_attendance.personal_employee_id(p_device_key);
  previous lv_attendance.personal_work_entries%rowtype;
  project_label text;
  task_label text;
  work_note text := btrim(coalesce(p_note, ''));
  share_text text := btrim(p_project_note);
  requested_version integer := coalesce(p_version, 0);
begin
  if p_id is null or p_day is null or not isfinite(p_day) or p_minutes is null
    or p_minutes not between 1 and 1440 or length(work_note) > 4000 or requested_version < 0
    or (p_project_id is null) <> (p_task_id is null) then
    raise exception using errcode = '22023', message = '날짜, 업무 및 투입시간을 확인해 주세요.';
  end if;
  select w.* into previous from lv_attendance.personal_work_entries w
    where w.employee_id = owner_id and w.id = p_id for update;
  if previous.deleted or (previous.id is null and requested_version > 0) then
    raise exception using errcode = '40001', message = '기록이 바뀌었습니다. 새로고침 후 확인해 주세요.';
  end if;
  -- Older clients do not express consent to publish in a different project.
  if not p_update_share then
    if previous.project_note is not null and (p_project_id, p_task_id)
        is distinct from (previous.project_id, previous.task_id) then
      raise exception using errcode = '40001', message = '공유한 업무의 변경은 새 화면에서 확인해 주세요.';
    end if;
    share_text := previous.project_note;
  end if;
  if share_text is not null and (p_project_id is null or length(share_text) > 4000) then
    raise exception using errcode = '22023', message = '공유할 프로젝트와 작업 내용을 확인해 주세요.';
  end if;
  if p_project_id is null then
    task_label := btrim(regexp_replace(coalesce(p_task_name, ''), '[[:space:]]+', ' ', 'g'));
    if length(task_label) not between 1 and 300 then
      raise exception using errcode = '22023', message = '업무명은 1~300자로 입력해 주세요.';
    end if;
  elsif p_project_id = previous.project_id and p_task_id = previous.task_id then
    project_label := previous.project_name;
    task_label := previous.task_name;
  else
    select t.project_name, t.task_name into project_label, task_label from lv_attendance.work_targets t
      where t.project_id = p_project_id and t.task_id = p_task_id;
    if not found then
      raise exception using errcode = '22023', message = '프로젝트와 업무 목록을 다시 확인해 주세요.';
    end if;
  end if;
  if previous.id is null then
    insert into lv_attendance.personal_work_entries(employee_id, id, work_date, project_id,
      task_id, project_name, task_name, minutes, note, project_note, public_log_id)
      values (owner_id, p_id, p_day, p_project_id, p_task_id, project_label, task_label, p_minutes, work_note,
        share_text, case when share_text is not null then gen_random_uuid() end);
    return;
  end if;
  -- Exact replays of creation or the latest edit succeed without incrementing
  -- the version. An older conflicting value cannot overwrite a later edit.
  if (previous.work_date, previous.project_id, previous.task_id, previous.task_name, previous.minutes, previous.note, previous.project_note)
     is not distinct from (p_day, p_project_id, p_task_id, task_label, p_minutes, work_note, share_text)
     and (requested_version = previous.version or requested_version = previous.version - 1) then
    return;
  end if;
  if requested_version <> previous.version then
    raise exception using errcode = '40001', message = '다른 기기에서 기록이 바뀌었습니다. 새로고침 후 확인해 주세요.';
  end if;
  update lv_attendance.personal_work_entries set work_date = p_day, project_id = p_project_id,
    task_id = p_task_id, project_name = project_label, task_name = task_label, minutes = p_minutes,
    note = work_note, project_note = share_text,
    public_log_id = case when share_text is null then null else coalesce(previous.public_log_id, gen_random_uuid()) end,
    version = previous.version + 1 where employee_id = owner_id and id = p_id;
end;
$$;

create or replace function public.lv_personal_save_work(
  p_device_key text, p_id uuid, p_day date, p_project_id text, p_task_id text, p_task_name text,
  p_minutes integer, p_note text, p_version integer
) returns void language sql security definer set search_path = '' as $$
  select lv_attendance.save_work(p_device_key,p_id,p_day,p_project_id,p_task_id,p_task_name,p_minutes,p_note,p_version,false,null);
$$;

create or replace function public.lv_personal_save_shared_work(
  p_device_key text, p_id uuid, p_day date, p_project_id text, p_task_id text, p_task_name text,
  p_minutes integer, p_note text, p_version integer, p_project_note text
) returns void language sql security definer set search_path = '' as $$
  select lv_attendance.save_work(p_device_key,p_id,p_day,p_project_id,p_task_id,p_task_name,p_minutes,p_note,p_version,true,p_project_note);
$$;

-- Public project data is an explicit allow-list. Do not include employee IDs,
-- private entry IDs, private notes, timestamps, schedules or device identifiers.
create or replace function public.lv_project_shared_logs(p_project_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id','personal:' || w.public_log_id::text, 'taskId',w.task_id, 'taskName',w.task_name,
    'author','사무소 대표', 'date',w.work_date, 'minutes',w.minutes,
    'body',coalesce(nullif(w.project_note,''),'업무시간 기록')
  ) order by w.work_date,w.public_log_id), '[]'::jsonb)
  from lv_attendance.personal_work_entries w
  where w.project_id = p_project_id and not w.deleted and w.project_note is not null
    and exists (select 1 from public.refs r where r.id::text = w.project_id);
$$;

-- A claim is a private pointer to an existing project journal entry. Edits to
-- the original flow through automatically and its public report still counts it once.
create table if not exists lv_attendance.project_log_claims (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references lv_attendance.employees(id),
  project_id text not null,
  log_id text not null,
  unique(project_id,log_id)
);
create index if not exists project_log_claims_owner on lv_attendance.project_log_claims(employee_id);
alter table lv_attendance.project_log_claims enable row level security;
revoke all on lv_attendance.project_log_claims from public, anon, authenticated;

-- Match the weekly report's "last occurrence by ID" rule for older JSON data.
create or replace function lv_attendance.source_logs(data jsonb)
returns table(log_id text, task_id text, task_name text, author text, work_date text,
  minutes integer, body text, revision text)
language sql immutable security invoker set search_path = '' as $$
  with latest as (
    select distinct on (item->>'id') item
    from jsonb_array_elements(case when jsonb_typeof(data->'workLogs')='array'
      then data->'workLogs' else '[]'::jsonb end) with ordinality as a(item,position)
    where nullif(item->>'id','') is not null order by item->>'id',position desc
  )
  select item->>'id',item->>'taskId',coalesce(nullif(item->>'taskName',''),'이름 없는 업무'),
    coalesce(nullif(item->>'author',''),'작성자 미상'),item->>'date',
    (item->>'minutes')::integer,coalesce(item->>'body',''),md5(item::text)
  from latest where nullif(item->>'taskId','') is not null
    and item->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and case when item->>'minutes' ~ '^[1-9][0-9]{0,3}$' then (item->>'minutes')::integer <= 1440 else false end;
$$;

create or replace function public.lv_personal_work_sources(p_device_key text,p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform lv_attendance.personal_employee_id(p_device_key);
  if p_day is null or not isfinite(p_day) then raise exception using errcode='22023', message='조회할 날짜를 확인해 주세요.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('project_id',r.id,'project_name',r.title,'log_id',s.log_id,
      'task_name',s.task_name,'author',s.author,'minutes',s.minutes,'body',s.body,'revision',s.revision)
      order by r.title,s.task_name,s.log_id),'[]'::jsonb)
    from public.refs r cross join lateral lv_attendance.source_logs(r.competition_data) s
    where r.competition_data->'workLogs' @> jsonb_build_array(jsonb_build_object('date',p_day))
      and s.work_date=p_day::text
      and not exists (select 1 from lv_attendance.project_log_claims a where a.project_id=r.id::text and a.log_id=s.log_id));
end;
$$;

create or replace function public.lv_personal_claim_work(p_device_key text,p_project_id text,p_log_id text,p_revision text)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := lv_attendance.personal_employee_id(p_device_key);
begin
  if p_project_id is null or p_log_id is null or p_revision is null then
    raise exception using errcode='22023', message='연결할 원본을 선택해 주세요.';
  end if;
  if exists (select 1 from lv_attendance.project_log_claims a
      where a.project_id=p_project_id and a.log_id=p_log_id and a.employee_id=owner_id) then return; end if;
  perform 1 from public.refs r cross join lateral lv_attendance.source_logs(r.competition_data) s
    where r.id::text=p_project_id and s.log_id=p_log_id and s.revision=p_revision for share of r;
  if not found then raise exception using errcode='40001', message='원본 일지가 바뀌었습니다.'; end if;
  insert into lv_attendance.project_log_claims(employee_id,project_id,log_id) values(owner_id,p_project_id,p_log_id)
    on conflict(project_id,log_id) do nothing;
  if not found then raise exception using errcode='40001', message='이미 연결된 원본입니다.'; end if;
end;
$$;

create or replace function public.lv_personal_unclaim_work(p_device_key text,p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := lv_attendance.personal_employee_id(p_device_key);
begin
  delete from lv_attendance.project_log_claims where id=p_id and employee_id=owner_id;
end;
$$;

create or replace function public.lv_personal_work_journal(p_device_key text,p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := lv_attendance.personal_employee_id(p_device_key);
  day_entries jsonb; task_totals jsonb; closed_seconds bigint; day_open boolean;
begin
  if p_day is null or not isfinite(p_day) then raise exception using errcode='22023',message='조회할 날짜를 확인해 주세요.'; end if;
  with rows as materialized (
    select w.id,w.work_date::text,w.project_id,w.task_id,w.project_name,w.task_name,w.minutes,w.note,w.version,
      w.project_note,false as claimed,w.created_at as recorded
    from lv_attendance.personal_work_entries w where w.employee_id=owner_id and not w.deleted
    union all
    select a.id,s.work_date,a.project_id,s.task_id,r.title,s.task_name,s.minutes,''::text,1,
      s.body,true,null::timestamptz
    from lv_attendance.project_log_claims a join public.refs r on r.id::text=a.project_id
      cross join lateral lv_attendance.source_logs(r.competition_data) s
    where a.employee_id=owner_id and s.log_id=a.log_id
  ), grouped as (
    select project_id,task_id,
      (array_agg(project_name order by recorded desc nulls last,work_date desc,id))[1] as project_name,
      (array_agg(task_name order by recorded desc nulls last,work_date desc,id))[1] as task_name,sum(minutes) as minutes
    from rows group by project_id,task_id,case when task_id is null then lower(task_name) end
  )
  select (select coalesce(jsonb_agg(to_jsonb(w)-'recorded' order by w.recorded,w.id),'[]') from rows w where w.work_date=p_day::text),
    (select coalesce(jsonb_agg(to_jsonb(g) order by g.minutes desc,g.task_name,g.project_id,g.task_id),'[]') from grouped g)
    into day_entries,task_totals;
  select floor(coalesce(sum(extract(epoch from s.clock_out-s.clock_in)),0))::bigint,coalesce(bool_or(s.clock_out is null),false)
    into closed_seconds,day_open from lv_attendance.shifts s
    where s.employee_id=owner_id and s.clock_in >= (p_day::timestamp at time zone 'Asia/Seoul')
      and s.clock_in < ((p_day::timestamp + interval '1 day') at time zone 'Asia/Seoul');
  return jsonb_build_object('entries',day_entries,'totals',task_totals,'attendance_seconds',closed_seconds,'open',day_open);
end;
$$;

revoke all on function lv_attendance.save_work(text,uuid,date,text,text,text,integer,text,integer,boolean,text),
  lv_attendance.source_logs(jsonb) from public, anon, authenticated;
revoke all on function public.lv_personal_save_shared_work(text,uuid,date,text,text,text,integer,text,integer,text),
  public.lv_personal_work_sources(text,date),public.lv_personal_claim_work(text,text,text,text),
  public.lv_personal_unclaim_work(text,uuid),public.lv_personal_work_journal(text,date),
  public.lv_project_shared_logs(text) from public, anon, authenticated;
grant execute on function public.lv_personal_save_shared_work(text,uuid,date,text,text,text,integer,text,integer,text),
  public.lv_personal_work_sources(text,date),public.lv_personal_claim_work(text,text,text,text),
  public.lv_personal_unclaim_work(text,uuid),public.lv_personal_work_journal(text,date),
  public.lv_project_shared_logs(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
