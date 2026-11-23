'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { attendanceClient } from '@/lib/attendance-client';
import { attendanceDate, attendanceTime, durationLabel, shiftMilliseconds, type AttendanceDashboard, type AttendanceEmployee, type AttendanceShift } from '@/lib/attendance';
import styles from './AttendanceWorkspace.module.css';

type Identity = { id: string; email?: string };
type PersonalStatus = Pick<AttendanceDashboard, 'employee' | 'open_shift'>;
type ReadResult<T> = { data: T | null; error: { code: string; message: string } | null };
const connectionIssue = '근태 정보를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';

function displayError(error: { code?: string; message?: string } | null, fallback: string) {
  if (error?.code === 'PGRST202' || error?.code === '42883') return '근태 저장소 설정이 필요합니다. 관리자에게 알려 주세요.';
  if (error?.message && /[가-힣]/.test(error.message)) return error.message;
  return fallback;
}

function useIdentity() {
  const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
  useEffect(() => {
    const { data } = attendanceClient.auth.onAuthStateChange((_event, session) => {
      setIdentity(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return identity;
}

function useAttendanceRead<T>(key: string, read: () => PromiseLike<ReadResult<T>>) {
  const [result, setResult] = useState<{ key: string; data?: T; error?: string; denied?: boolean } | null>(null);
  const sequence = useRef(0);
  const activeSource = useRef<{ key: string; read: typeof read } | null>(null);
  const refresh = useCallback(async () => {
    const source = activeSource.current;
    if (!source) return;
    const request = ++sequence.current;
    try {
      const { data, error } = await source.read();
      if (request !== sequence.current || activeSource.current !== source) return;
      if (error || !data) {
        setResult({ key: source.key, error: displayError(error, connectionIssue), denied: error?.code === '42501' && error.message.includes('재직 직원') });
      } else {
        setResult({ key: source.key, data });
      }
    } catch {
      if (request === sequence.current && activeSource.current === source) setResult({ key: source.key, error: connectionIssue });
    }
  }, []);
  useEffect(() => {
    activeSource.current = { key, read };
    queueMicrotask(refresh);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === 'lv-attendance-refresh') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    return () => {
      activeSource.current = null;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh, key, read]);
  return { result: result?.key === key ? result : null, lastData: result?.data, refresh };
}

function notifyOtherTabs() {
  try { localStorage.setItem('lv-attendance-refresh', crypto.randomUUID()); } catch { /* storage can be disabled */ }
}

function AuthPanel() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get('email')).trim();
    const password = String(fields.get('password'));
    lock.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = mode === 'signin'
        ? await attendanceClient.auth.signInWithPassword({ email, password })
        : await attendanceClient.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/attendance' } });
      if (response.error) {
        const code = response.error.code;
        if (code === 'email_not_confirmed') setError('이메일 인증 후 로그인해 주세요. 가입한 주소의 받은편지함을 확인해 주세요.');
        else if (code === 'invalid_credentials') setError('이메일 또는 비밀번호를 확인해 주세요.');
        else if (code === 'weak_password') setError('보안 기준에 맞도록 비밀번호를 더 길게 설정해 주세요.');
        else if (code === 'email_address_not_authorized') setError('이 주소로 인증 메일을 보낼 수 없습니다. 사무소 관리자에게 인증 메일 발송 설정을 확인해 달라고 요청해 주세요.');
        else if (response.error.status === 429) setError('잠시 후 다시 시도해 주세요.');
        else setError('계정 요청을 처리하지 못했습니다. 입력한 정보와 연결 상태를 확인해 주세요.');
      } else if (mode === 'signup' && !response.data.session) {
        form.reset();
        setMode('signin');
        setMessage('가입한 주소로 온 메일에서 인증을 마친 뒤 이 화면으로 돌아와 로그인하세요. 이미 인증한 계정은 바로 로그인할 수 있습니다.');
      }
    } catch { setError('계정 서비스에 연결할 수 없습니다. 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={styles.authCard} aria-labelledby="attendance-login-title">
    <h2 id="attendance-login-title">{mode === 'signin' ? '직원 로그인' : '직원 계정 만들기'}</h2>
    <p className={styles.hint}>직원 명단에 등록된 이메일로 출퇴근을 기록하고 근무 내역을 조회하세요.</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className={styles.formStack}>
        <label>이메일<input name="email" type="email" autoComplete="email" required /></label>
        <label>비밀번호<input key={mode} name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 8 : undefined} required /></label>
        {mode === 'signup' && <span className={styles.hint}>비밀번호는 8자 이상 입력해 주세요.</span>}
        <button type="submit" className={styles.primary}>{busy ? '처리 중…' : mode === 'signin' ? '로그인' : '인증 메일 받기'}</button>
        <button type="button" className={styles.textButton} onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage('');
        }}>{mode === 'signin' ? '처음 이용하시나요? 계정 만들기' : '로그인으로 돌아가기'}</button>
      </fieldset>
    </form>
    {message && <p role="status" className={styles.success}>{message}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}

function PunchPanel({ current, refresh, compact = false }: { current: PersonalStatus; refresh: () => Promise<void>; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const request = useRef<{ action: 'in' | 'out'; id: string; shift: string | null } | null>(null);
  const lock = useRef(false);
  const open = current.open_shift;
  async function punch() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setError('');
    const action = open ? 'out' : 'in';
    const shift = open?.id ?? null;
    try {
      if (request.current?.action !== action || request.current.shift !== shift) {
        request.current = { action, id: crypto.randomUUID(), shift };
      }
      const { error } = await attendanceClient.rpc('lv_attendance_punch', {
        p_action: action, p_request_id: request.current.id, p_shift_id: shift,
      });
      if (error) {
        setError(displayError(error, '처리 결과를 확인하지 못했습니다. 근무 상태를 확인하고 다시 시도해 주세요.'));
      } else {
        request.current = null;
        setMessage(action === 'in' ? '출근을 기록했습니다.' : '퇴근을 기록했습니다.');
        notifyOtherTabs();
      }
    } catch { setError('처리 결과를 확인하지 못했습니다. 근무 상태를 확인하고 다시 시도해 주세요.'); }
    finally { await refresh(); lock.current = false; setBusy(false); }
  }
  return <section className={styles.punch} data-compact={compact} aria-label="나의 출퇴근">
    <div className={styles.punchMain}>
      <div>
        <span className={styles.kicker}>{current.employee.name} · 나의 출퇴근</span>
        <h2>{open ? '근무 중' : '출근 가능'}</h2>
        {open && <p>{attendanceDate(open.clock_in)} {attendanceTime(open.clock_in)} 출근</p>}
      </div>
      <div className={styles.punchActions}>
        <button type="button" disabled={busy} className={styles.primary} onClick={punch}>{busy ? '기록 중…' : open ? '퇴근' : '출근'}</button>
        {compact && <Link href="/attendance" className={styles.inlineLink}>근태 내역</Link>}
      </div>
    </div>
    {message && <p role="status" className={styles.success}>{message}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}

function PersonalQuickAction() {
  const read = useCallback(() => attendanceClient.rpc('lv_attendance_me'), []);
  const { result, refresh } = useAttendanceRead<PersonalStatus>('me', read);
  if (result?.data) return <PunchPanel current={result.data} refresh={refresh} compact />;
  return <Link href="/attendance" className={styles.quickLink}>출퇴근 기록 및 내역 보기 →</Link>;
}

export function AttendanceQuickAction() {
  const identity = useIdentity();
  if (identity) return <PersonalQuickAction key={identity.id} />;
  return <Link href="/attendance" className={styles.quickLink}>직원 로그인 · 출퇴근 기록 →</Link>;
}

function EmployeeDirectory({ data, refresh }: { data: AttendanceDashboard; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<AttendanceEmployee | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const employee = editing && editing !== 'new' ? editing : null;
  function edit(value: typeof editing) { setEditing(value); setMessage(''); setError(''); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setError('');
    const fields = new FormData(event.currentTarget);
    try {
      const { error } = await attendanceClient.rpc('lv_attendance_save_employee', {
        p_id: employee?.id ?? null, p_name: String(fields.get('name')).trim(), p_email: String(fields.get('email')).trim(),
        p_active: fields.get('active') !== 'inactive',
      });
      if (error) { setError(displayError(error, '직원 정보를 저장하지 못했습니다. 다시 시도해 주세요.')); return; }
      setMessage(employee ? '직원 정보를 수정했습니다.' : '직원을 등록했습니다.');
      setEditing(null); notifyOtherTabs(); await refresh();
    } catch { setError('직원 정보를 저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={styles.panel} aria-label="직원 관리">
    <div className={styles.panelHeader}><h2>직원 관리 <small>{data.employees.length}명</small></h2>
      {!editing && <button type="button" className={styles.secondary} onClick={() => edit('new')}>직원 등록</button>}
    </div>
    {editing && <form onSubmit={save} className={styles.employeeForm} key={employee?.id ?? 'new'}>
      <fieldset disabled={busy}>
        <legend>{employee ? '직원 정보 수정' : '직원 등록'}</legend>
        <label>이름<input name="name" defaultValue={employee?.name} required maxLength={100} /></label>
        <label>직원 이메일<input name="email" type="email" defaultValue={employee?.email} readOnly={Boolean(employee && !employee.email_editable)} required /></label>
        {employee && <label>재직 상태<select name="active" defaultValue={employee.active ? 'active' : 'inactive'}>
          <option value="active">재직</option><option value="inactive">비활성</option></select></label>}
        <div className={styles.formActions}><button type="button" className={styles.secondary} onClick={() => edit(null)}>취소</button>
          <button type="submit" className={styles.primary}>{busy ? '저장 중…' : '저장'}</button></div>
      </fieldset>
    </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.success}>{message}</p>}
    <ul className={styles.people}>{data.employees.map(person => <li key={person.id}>
      <div><strong>{person.name}</strong> <small>{person.role === 'admin' ? '관리자 · ' : ''}{person.active ? '재직' : '비활성'}</small><p>{person.email}</p></div>
      <button type="button" className={styles.secondary} disabled={Boolean(editing)} aria-label={person.name + ' 직원 정보 수정'} onClick={() => edit(person)}>수정</button>
    </li>)}</ul>
  </section>;
}

function ShiftHistory({ data, month, setMonth, loading }: { data: AttendanceDashboard; month: string; setMonth: (value: string) => void; loading: boolean }) {
  const [selection, setSelection] = useState(data.employee.id);
  const isAdmin = data.employee.role === 'admin';
  const selected = isAdmin ? selection : data.employee.id;
  const shifts = data.shifts.filter(shift => selected === 'all' || shift.employee_id === selected);
  const names = new Map(data.employees.map(e => [e.id, e.name]));
  const total = shifts.reduce((sum, shift) => sum + shiftMilliseconds(shift), 0);
  function clockOut(shift: AttendanceShift) {
    if (!shift.clock_out) return '근무 중';
    const day = attendanceDate(shift.clock_out);
    return (day !== attendanceDate(shift.clock_in) ? day + ' ' : '') + attendanceTime(shift.clock_out);
  }
  return <section className={styles.panel} aria-label="월별 근무 기록">
    <div className={styles.panelHeader}><h2>월별 근무 기록</h2>
      <div className={styles.filters}>
        <label>조회 월<input type="month" value={month} onChange={e => {
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value);
        }} /></label>
        {isAdmin && <label>직원<select value={selected} onChange={e => setSelection(e.target.value)}>
          <option value="all">전체 직원</option>
          {data.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.id === data.employee.id ? ' (나)' : ''}{employee.active ? '' : ' · 비활성'}</option>)}
        </select></label>}
      </div>
    </div>
    {loading ? <p role="status" className={styles.empty}>선택한 달의 기록을 불러오는 중…</p> : <>
    <div className={styles.summary}><div><span>근무시간 합계</span><strong>{durationLabel(total)}</strong></div>
      <p>한국시간 · 출근일 기준<br />퇴근한 기록의 경과시간을 합산합니다.</p></div>
    {shifts.length === 0 ? <p className={styles.empty}>이 달에 기록된 출퇴근이 없습니다.</p> :
      <div className={styles.tableScroll}><table className={styles.history}>
        <caption className={styles.sr}>{month} 출퇴근 기록</caption>
        <thead><tr><th scope="col">출근일</th>{isAdmin && <th scope="col">직원</th>}<th scope="col">출근</th><th scope="col">퇴근</th><th scope="col">근무시간</th></tr></thead>
        <tbody>{shifts.map(shift => <tr key={shift.id}>
          <td>{attendanceDate(shift.clock_in)}</td>
          {isAdmin && <td>{names.get(shift.employee_id) ?? '직원'}</td>}
          <td>{attendanceTime(shift.clock_in)}</td>
          <td>{clockOut(shift)}</td>
          <td>{shift.clock_out ? durationLabel(shiftMilliseconds(shift)) : '집계 대기'}</td>
        </tr>)}</tbody>
      </table></div>}</>}
  </section>;
}

function SignedIn({ identity }: { identity: Identity }) {
  const [month, setMonth] = useState(() => attendanceDate(new Date()).slice(0, 7));
  const read = useCallback(() => attendanceClient.rpc('lv_attendance_dashboard', { p_month: month + '-01' }), [month]);
  const { result, lastData, refresh } = useAttendanceRead<AttendanceDashboard>(month, read);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    setLeaving(true); setError('');
    try {
      const { error } = await attendanceClient.auth.signOut({ scope: 'local' });
      if (error) setError('로그아웃하지 못했습니다. 다시 시도해 주세요.');
    } catch { setError('로그아웃하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setLeaving(false); }
  }
  const data = result ? result.data : lastData;
  return <>
    <div className={styles.identity}><span>{identity.email}</span>
      <button type="button" className={styles.textButton} disabled={leaving} onClick={signOut}>로그아웃</button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!result && !data && <p role="status" className={styles.loading}>근무 기록을 불러오는 중…</p>}
    {result?.error && <section className={styles.panel} aria-label="근태 이용 안내">
      <h2>{result.denied ? '직원 등록 확인' : '근태 정보 연결'}</h2>
      <p role="alert" className={result.denied ? styles.hint : styles.error}>{result.denied
        ? '관리자가 이 이메일을 재직 직원으로 등록하면 출퇴근을 기록할 수 있습니다.' : result.error}</p>
      <button type="button" className={styles.secondary} onClick={refresh}>다시 확인</button>
    </section>}
    {data && <>
      <PunchPanel current={data} refresh={refresh} />
      <ShiftHistory data={data} month={month} setMonth={setMonth} loading={!result} />
      {data.employee.role === 'admin' && <EmployeeDirectory data={data} refresh={refresh} />}
    </>}
  </>;
}

export default function AttendanceWorkspace() {
  const identity = useIdentity();
  return <div className={styles.page}>
    <header className={styles.siteHeader}><div><Link href="/" aria-label="LV LAB 홈">LV LAB</Link><Link href="/">사무소 홈</Link></div></header>
    <main className={styles.main}>
      <h1>직원·근태 관리</h1>
      {identity === undefined ? <p role="status" className={styles.loading}>계정을 확인하는 중…</p>
        : identity ? <SignedIn key={identity.id} identity={identity} /> : <AuthPanel />}
    </main>
  </div>;
}
