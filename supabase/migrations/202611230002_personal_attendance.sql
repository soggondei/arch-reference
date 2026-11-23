begin;

-- A trusted operator associates a browser's public fingerprint with the
-- existing time sheet. The browser's random 256-bit key is never stored here.
create table if not exists lv_attendance.personal_devices (
  device_hash text primary key check (device_hash ~ '^[0-9a-f]{64}$'),
  employee_id uuid not null references lv_attendance.employees(id)
);
alter table lv_attendance.personal_devices enable row level security;
revoke all on lv_attendance.personal_devices from public, anon, authenticated;

create or replace function lv_attendance.personal_employee_id(p_device_key text)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if p_device_key ~ '^[0-9a-f]{64}$' then
    select e.id into owner_id from lv_attendance.personal_devices d
      join lv_attendance.employees e on e.id = d.employee_id
      where d.device_hash = encode(sha256(convert_to(p_device_key, 'UTF8')), 'hex')
        and e.active
      for update of e, d;
  end if;
  if owner_id is null then
    raise exception using errcode = '42501', message = '개인 근태에 연결된 기기가 아닙니다.';
  end if;
  return owner_id;
end;
$$;

create or replace function public.lv_personal_attendance(p_device_key text, p_month date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := lv_attendance.personal_employee_id(p_device_key);
  month_start timestamp;
  shifts jsonb := '[]'::jsonb;
  open_shift jsonb;
begin
  if p_month is not null then
    if not isfinite(p_month) then
      raise exception using errcode = '22023', message = '조회할 월을 확인해 주세요.';
    end if;
    month_start := date_trunc('month', p_month::timestamp);
    select coalesce(jsonb_agg(lv_attendance.shift_json(s) order by s.clock_in desc, s.id), '[]')
      into shifts from lv_attendance.shifts s
      where s.employee_id = owner_id
        and s.clock_in >= (month_start at time zone 'Asia/Seoul')
        and s.clock_in < ((month_start + interval '1 month') at time zone 'Asia/Seoul');
  end if;
  select lv_attendance.shift_json(s) into open_shift from lv_attendance.shifts s
    where s.employee_id = owner_id and s.clock_out is null;
  return jsonb_build_object('open_shift', open_shift, 'shifts', shifts);
end;
$$;

-- Both entry points lock the employee before calling this helper. Replaying
-- an earlier successful request must still work after another shift starts.
create or replace function lv_attendance.record_punch(
  p_employee_id uuid, p_action text, p_request_id uuid, p_shift_id uuid
)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  shift lv_attendance.shifts%rowtype;
begin
  if p_request_id is null or p_action is null or p_action not in ('in','out')
     or (p_action = 'in' and p_shift_id is not null) or (p_action = 'out' and p_shift_id is null) then
    raise exception using errcode = '22023', message = '출퇴근 요청을 확인해 주세요.';
  end if;
  select s.* into shift from lv_attendance.shifts s where s.employee_id = p_employee_id
    and (s.in_request_id = p_request_id or s.out_request_id = p_request_id);
  if found then
    if (p_action = 'in' and shift.in_request_id = p_request_id) or
       (p_action = 'out' and shift.out_request_id = p_request_id and shift.id = p_shift_id) then
      return;
    end if;
    raise exception using errcode = '22023', message = '이미 사용된 출퇴근 요청입니다. 기록을 새로고침해 주세요.';
  end if;
  select s.* into shift from lv_attendance.shifts s where s.employee_id = p_employee_id and s.clock_out is null;
  if p_action = 'in' then
    if shift.id is not null then
      raise exception using errcode = '22023', message = '이미 출근했습니다. 현재 근무 기록을 확인해 주세요.';
    end if;
    insert into lv_attendance.shifts(employee_id, clock_in, in_request_id)
      values (p_employee_id, clock_timestamp(), p_request_id);
  else
    if shift.id is distinct from p_shift_id then
      raise exception using errcode = '22023', message = '현재 근무 기록이 바뀌었습니다. 새로고침 후 확인해 주세요.';
    end if;
    update lv_attendance.shifts set clock_out = clock_timestamp(), out_request_id = p_request_id
      where id = shift.id;
  end if;
end;
$$;

create or replace function public.lv_personal_punch(
  p_device_key text, p_action text, p_request_id uuid, p_shift_id uuid default null
)
returns void language sql security definer set search_path = ''
as $$
  select lv_attendance.record_punch(lv_attendance.personal_employee_id(p_device_key),
    p_action, p_request_id, p_shift_id);
$$;

-- A connected owner can authorize another browser using only that browser's
-- public fingerprint. This endpoint cannot assign the first device.
create or replace function public.lv_personal_link_device(p_device_key text, p_fingerprint text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := lv_attendance.personal_employee_id(p_device_key);
begin
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = '새 기기에 표시된 연결 코드를 확인해 주세요.';
  end if;
  insert into lv_attendance.personal_devices(device_hash, employee_id) values (p_fingerprint, owner_id)
    on conflict (device_hash) do nothing;
  if not found and not exists (
    select 1 from lv_attendance.personal_devices d where d.device_hash = p_fingerprint and d.employee_id = owner_id
  ) then
    raise exception using errcode = '22023', message = '이 기기 연결 코드를 사용할 수 없습니다.';
  end if;
end;
$$;

create or replace function public.lv_attendance_punch(p_action text, p_request_id uuid, p_shift_id uuid default null)
returns void language sql security definer set search_path = ''
as $$
  select lv_attendance.record_punch((lv_attendance.current_employee()).id,
    p_action, p_request_id, p_shift_id);
$$;

revoke all on function lv_attendance.personal_employee_id(text),
  lv_attendance.record_punch(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.lv_attendance_me(), public.lv_attendance_dashboard(date),
  public.lv_attendance_punch(text, uuid, uuid),
  public.lv_attendance_save_employee(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.lv_personal_attendance(text, date),
  public.lv_personal_punch(text, text, uuid, uuid),
  public.lv_personal_link_device(text, text) from public, anon, authenticated;
grant execute on function public.lv_personal_attendance(text, date),
  public.lv_personal_punch(text, text, uuid, uuid),
  public.lv_personal_link_device(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
