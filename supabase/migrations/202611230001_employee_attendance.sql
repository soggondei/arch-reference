begin;

create schema if not exists lv_attendance;
revoke all on schema lv_attendance from public, anon, authenticated;

create table if not exists lv_attendance.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  email text not null unique check (
    email = lower(btrim(email)) and char_length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  -- Retain the original binding if the auth account is deleted and its email reused.
  auth_user_id uuid unique,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  active boolean not null default true
);

create table if not exists lv_attendance.shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references lv_attendance.employees(id),
  clock_in timestamptz not null,
  clock_out timestamptz,
  in_request_id uuid not null,
  out_request_id uuid,
  unique (employee_id, in_request_id),
  unique (employee_id, out_request_id),
  check ((clock_out is null) = (out_request_id is null)),
  check (clock_out >= clock_in)
);
create unique index if not exists shifts_one_open_per_employee
  on lv_attendance.shifts(employee_id) where clock_out is null;
create index if not exists shifts_by_month on lv_attendance.shifts(clock_in);

alter table lv_attendance.employees enable row level security;
alter table lv_attendance.shifts enable row level security;
revoke all on lv_attendance.employees, lv_attendance.shifts from public, anon, authenticated;

-- Called only by the guarded RPCs below. The employee lock serializes punch
-- requests and roster changes for the same person through the end of the RPC.
create or replace function lv_attendance.current_employee()
returns lv_attendance.employees
language plpgsql security invoker set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  verified_email text;
  employee lv_attendance.employees%rowtype;
begin
  select lower(btrim(u.email)) into verified_email
    from auth.users u where u.id = caller and u.email_confirmed_at is not null;
  if verified_email is not null then
    select e.* into employee from lv_attendance.employees e
      where e.auth_user_id = caller or (e.auth_user_id is null and e.email = verified_email)
      order by (e.auth_user_id is not null) desc limit 1 for update;
  end if;
  if employee.id is null or not employee.active then
    raise exception using errcode = '42501', message = '등록된 재직 직원만 근태를 이용할 수 있습니다.';
  end if;
  if employee.auth_user_id is null then
    update lv_attendance.employees set auth_user_id = caller
      where id = employee.id returning * into employee;
  end if;
  return employee;
end;
$$;

create or replace function lv_attendance.employee_json(e lv_attendance.employees)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('id', e.id, 'name', e.name, 'email', e.email,
    'role', e.role, 'active', e.active, 'email_editable', e.auth_user_id is null);
$$;

create or replace function lv_attendance.shift_json(s lv_attendance.shifts)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('id', s.id, 'employee_id', s.employee_id,
    'clock_in', s.clock_in, 'clock_out', s.clock_out);
$$;

create or replace function public.lv_attendance_me()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor lv_attendance.employees%rowtype := lv_attendance.current_employee();
  open_shift jsonb;
begin
  select lv_attendance.shift_json(s) into open_shift from lv_attendance.shifts s
    where s.employee_id = actor.id and s.clock_out is null;
  return jsonb_build_object('employee', lv_attendance.employee_json(actor), 'open_shift', open_shift);
end;
$$;

create or replace function public.lv_attendance_dashboard(p_month date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor lv_attendance.employees%rowtype := lv_attendance.current_employee();
  month_start timestamp := date_trunc('month', p_month::timestamp);
  employees jsonb := '[]'::jsonb;
  shifts jsonb;
  open_shift jsonb;
begin
  if p_month is null or not isfinite(p_month) then
    raise exception using errcode = '22023', message = '조회할 월을 선택해 주세요.';
  end if;
  if actor.role = 'admin' then
    select coalesce(jsonb_agg(lv_attendance.employee_json(e) order by e.active desc, e.name, e.id), '[]')
      into employees from lv_attendance.employees e;
  end if;
  -- The Seoul workday and its month belong to the clock-in, even after midnight.
  select coalesce(jsonb_agg(lv_attendance.shift_json(s) order by s.clock_in desc, s.id), '[]')
    into shifts from lv_attendance.shifts s
    where (actor.role = 'admin' or s.employee_id = actor.id)
      and s.clock_in >= (month_start at time zone 'Asia/Seoul')
      and s.clock_in < ((month_start + interval '1 month') at time zone 'Asia/Seoul');
  select lv_attendance.shift_json(s) into open_shift from lv_attendance.shifts s
    where s.employee_id = actor.id and s.clock_out is null;
  return jsonb_build_object('employee', lv_attendance.employee_json(actor),
    'employees', employees, 'shifts', shifts, 'open_shift', open_shift);
end;
$$;

create or replace function public.lv_attendance_punch(p_action text, p_request_id uuid, p_shift_id uuid default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor lv_attendance.employees%rowtype := lv_attendance.current_employee();
  shift lv_attendance.shifts%rowtype;
begin
  if p_request_id is null or p_action is null or p_action not in ('in','out')
     or (p_action = 'in' and p_shift_id is not null) or (p_action = 'out' and p_shift_id is null) then
    raise exception using errcode = '22023', message = '출퇴근 요청을 확인해 주세요.';
  end if;
  select s.* into shift from lv_attendance.shifts s where s.employee_id = actor.id
    and (s.in_request_id = p_request_id or s.out_request_id = p_request_id);
  if found then
    if (p_action = 'in' and shift.in_request_id = p_request_id) or
       (p_action = 'out' and shift.out_request_id = p_request_id and shift.id = p_shift_id) then
      return;
    end if;
    raise exception using errcode = '22023', message = '이미 사용된 출퇴근 요청입니다. 기록을 새로고침해 주세요.';
  end if;
  select s.* into shift from lv_attendance.shifts s where s.employee_id = actor.id and s.clock_out is null;
  if p_action = 'in' then
    if shift.id is not null then
      raise exception using errcode = '22023', message = '이미 출근했습니다. 현재 근무 기록을 확인해 주세요.';
    end if;
    insert into lv_attendance.shifts(employee_id, clock_in, in_request_id)
      values (actor.id, clock_timestamp(), p_request_id);
  else
    if shift.id is distinct from p_shift_id then
      raise exception using errcode = '22023', message = '현재 근무 기록이 바뀌었습니다. 새로고침 후 확인해 주세요.';
    end if;
    update lv_attendance.shifts set clock_out = clock_timestamp(), out_request_id = p_request_id
      where id = shift.id;
  end if;
end;
$$;

create or replace function public.lv_attendance_save_employee(p_id uuid, p_name text, p_email text, p_active boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor lv_attendance.employees%rowtype;
  target lv_attendance.employees%rowtype;
  new_name text := btrim(p_name);
  new_email text := lower(btrim(p_email));
begin
  -- Serialize roster edits before taking employee locks so two administrators
  -- cannot deactivate each other and leave the office without an administrator.
  perform pg_advisory_xact_lock(113409, 1);
  actor := lv_attendance.current_employee();
  if actor.role <> 'admin' then
    raise exception using errcode = '42501', message = '직원 관리 권한이 필요합니다.';
  end if;
  if new_name is null or char_length(new_name) not between 1 and 100 or new_email is null
     or char_length(new_email) > 254 or new_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or p_active is null then
    raise exception using errcode = '22023', message = '직원 이름, 이메일과 재직 상태를 확인해 주세요.';
  end if;
  if exists (select 1 from lv_attendance.employees e where e.email = new_email and e.id is distinct from p_id) then
    raise exception using errcode = '23505', message = '이미 등록된 직원 이메일입니다.';
  end if;
  if p_id is null then
    insert into lv_attendance.employees(name, email, active) values (new_name, new_email, p_active);
    return;
  end if;
  select e.* into target from lv_attendance.employees e where e.id = p_id for update;
  if not found then
    raise exception using errcode = '22023', message = '직원을 찾을 수 없습니다.';
  end if;
  if target.email <> new_email and target.auth_user_id is not null then
    raise exception using errcode = '22023', message = '로그인에 사용한 직원 이메일은 변경할 수 없습니다.';
  end if;
  if not p_active and target.active then
    if target.role = 'admin' and not exists (
      select 1 from lv_attendance.employees e where e.id <> p_id and e.role = 'admin' and e.active
    ) then
      raise exception using errcode = '22023', message = '재직 중인 관리자가 한 명 이상 필요합니다.';
    end if;
    if exists (select 1 from lv_attendance.shifts s where s.employee_id = p_id and s.clock_out is null) then
      raise exception using errcode = '22023', message = '퇴근 기록을 먼저 완료한 뒤 비활성화해 주세요.';
    end if;
  end if;
  update lv_attendance.employees set name = new_name, email = new_email, active = p_active where id = p_id;
end;
$$;

revoke all on all functions in schema lv_attendance from public, anon, authenticated;
revoke all on function public.lv_attendance_me(), public.lv_attendance_dashboard(date),
  public.lv_attendance_punch(text, uuid, uuid),
  public.lv_attendance_save_employee(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.lv_attendance_me(), public.lv_attendance_dashboard(date),
  public.lv_attendance_punch(text, uuid, uuid),
  public.lv_attendance_save_employee(uuid, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
