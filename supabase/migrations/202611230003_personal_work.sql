begin;

create table if not exists lv_attendance.personal_work_entries (
  employee_id uuid not null references lv_attendance.employees(id),
  id uuid not null,
  work_date date not null check (isfinite(work_date)),
  project_id text,
  task_id text,
  project_name text,
  task_name text not null check (length(task_name) > 0),
  minutes integer not null check (minutes between 1 and 1440),
  note text not null default '' check (length(note) <= 4000),
  version integer not null default 1 check (version > 0),
  deleted boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  primary key (employee_id, id),
  check ((project_id is null and task_id is null and project_name is null)
      or (project_id is not null and task_id is not null and project_name is not null))
);
create index if not exists personal_work_entries_day
  on lv_attendance.personal_work_entries(employee_id, work_date) where not deleted;
alter table lv_attendance.personal_work_entries enable row level security;
revoke all on lv_attendance.personal_work_entries from public, anon, authenticated;

-- Both regular projects and the office workspace keep their tasks in schedules.
create or replace view lv_attendance.work_targets with (security_invoker = true) as
select r.id::text as project_id, r.title as project_name, t.item->>'id' as task_id,
  t.item->>'taskName' as task_name
from public.refs r cross join lateral jsonb_array_elements(
  case when jsonb_typeof(r.competition_data->'schedules') = 'array' then r.competition_data->'schedules'
       else '[]'::jsonb end
) as t(item)
where nullif(btrim(r.title), '') is not null and nullif(btrim(t.item->>'id'), '') is not null
  and nullif(btrim(t.item->>'taskName'), '') is not null;
revoke all on lv_attendance.work_targets from public, anon, authenticated;

create or replace function public.lv_personal_work_targets(p_device_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform lv_attendance.personal_employee_id(p_device_key);
  return (select coalesce(jsonb_agg(to_jsonb(t) order by t.project_name, t.task_name, t.project_id, t.task_id), '[]')
    from lv_attendance.work_targets t);
end;
$$;

create or replace function public.lv_personal_work(p_device_key text, p_day date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := lv_attendance.personal_employee_id(p_device_key);
  day_entries jsonb;
  task_totals jsonb;
  closed_seconds bigint;
  day_open boolean;
begin
  if p_day is null or not isfinite(p_day) then
    raise exception using errcode = '22023', message = '조회할 날짜를 확인해 주세요.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id, 'work_date', w.work_date, 'project_id', w.project_id, 'task_id', w.task_id,
    'project_name', w.project_name, 'task_name', w.task_name, 'minutes', w.minutes,
    'note', w.note, 'version', w.version) order by w.created_at, w.id), '[]')
    into day_entries from lv_attendance.personal_work_entries w
    where w.employee_id = owner_id and w.work_date = p_day and not w.deleted;

  -- Each entry keeps its original labels. Use the most recently recorded labels
  -- to display a group even when the upstream schedule was renamed or removed.
  select coalesce(jsonb_agg(to_jsonb(g) order by g.minutes desc, g.task_name, g.project_id, g.task_id), '[]')
    into task_totals from (
      select w.project_id, w.task_id,
        (array_agg(w.project_name order by w.created_at desc, w.id))[1] as project_name,
        (array_agg(w.task_name order by w.created_at desc, w.id))[1] as task_name,
        sum(w.minutes) as minutes
      from lv_attendance.personal_work_entries w
      where w.employee_id = owner_id and not w.deleted
      group by w.project_id, w.task_id, case when w.task_id is null then lower(w.task_name) end
    ) g;

  select floor(coalesce(sum(extract(epoch from s.clock_out - s.clock_in)), 0))::bigint,
    coalesce(bool_or(s.clock_out is null), false)
    into closed_seconds, day_open from lv_attendance.shifts s
    where s.employee_id = owner_id and s.clock_in >= (p_day::timestamp at time zone 'Asia/Seoul')
      and s.clock_in < ((p_day::timestamp + interval '1 day') at time zone 'Asia/Seoul');
  return jsonb_build_object('entries', day_entries, 'totals', task_totals,
    'attendance_seconds', closed_seconds, 'open', day_open);
end;
$$;

create or replace function public.lv_personal_save_work(
  p_device_key text, p_id uuid, p_day date, p_project_id text, p_task_id text, p_task_name text,
  p_minutes integer, p_note text, p_version integer
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := lv_attendance.personal_employee_id(p_device_key);
  previous lv_attendance.personal_work_entries%rowtype;
  project_label text;
  task_label text;
  work_note text := btrim(coalesce(p_note, ''));
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
      task_id, project_name, task_name, minutes, note)
      values (owner_id, p_id, p_day, p_project_id, p_task_id, project_label, task_label, p_minutes, work_note);
    return;
  end if;
  -- Exact replays of creation or the latest edit succeed without incrementing
  -- the version. An older conflicting value cannot overwrite a later edit.
  if (previous.work_date, previous.project_id, previous.task_id, previous.task_name, previous.minutes, previous.note)
     is not distinct from (p_day, p_project_id, p_task_id, task_label, p_minutes, work_note)
     and (requested_version = previous.version or requested_version = previous.version - 1) then
    return;
  end if;
  if requested_version <> previous.version then
    raise exception using errcode = '40001', message = '다른 기기에서 기록이 바뀌었습니다. 새로고침 후 확인해 주세요.';
  end if;
  update lv_attendance.personal_work_entries set work_date = p_day, project_id = p_project_id,
    task_id = p_task_id, project_name = project_label, task_name = task_label, minutes = p_minutes,
    note = work_note, version = previous.version + 1 where employee_id = owner_id and id = p_id;
end;
$$;

create or replace function public.lv_personal_delete_work(p_device_key text, p_id uuid, p_version integer)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := lv_attendance.personal_employee_id(p_device_key);
  previous lv_attendance.personal_work_entries%rowtype;
begin
  if p_id is null or p_version is null or p_version < 1 then
    raise exception using errcode = '22023', message = '삭제할 업무 기록을 확인해 주세요.';
  end if;
  select w.* into previous from lv_attendance.personal_work_entries w
    where w.employee_id = owner_id and w.id = p_id for update;
  if previous.deleted and previous.version - 1 = p_version then return; end if;
  if previous.id is null or previous.deleted or previous.version <> p_version then
    raise exception using errcode = '40001', message = '기록이 바뀌었습니다. 새로고침 후 확인해 주세요.';
  end if;
  update lv_attendance.personal_work_entries set deleted = true, version = previous.version + 1
    where employee_id = owner_id and id = p_id;
end;
$$;

revoke all on function public.lv_personal_work(text,date), public.lv_personal_work_targets(text),
  public.lv_personal_save_work(text,uuid,date,text,text,text,integer,text,integer),
  public.lv_personal_delete_work(text,uuid,integer) from public, anon, authenticated;
grant execute on function public.lv_personal_work(text,date), public.lv_personal_work_targets(text),
  public.lv_personal_save_work(text,uuid,date,text,text,text,integer,text,integer),
  public.lv_personal_delete_work(text,uuid,integer) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
