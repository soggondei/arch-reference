'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceDate, attendanceTime, durationLabel, shiftMilliseconds, type AttendanceDashboard, type AttendanceShift } from '@/lib/attendance';
import PersonalWorkJournal from './PersonalWorkJournal';
import styles from './AttendanceWorkspace.module.css';

const endpoint = '/api/personal-attendance';
const refreshKey = 'lv-personal-attendance-change';
const connectionError = '근태 정보를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
type Attendance = AttendanceDashboard | { connected: false };
type LoadResult = { url: string; data?: Attendance; error?: string };
type PunchRequest = { action: 'in' | 'out'; requestId: string; shiftId: string | null };

function notifyAttendanceChange() {
  window.dispatchEvent(new Event(refreshKey));
  try { localStorage.setItem(refreshKey, crypto.randomUUID()); } catch { /* Other tabs also refresh on focus. */ }
}

async function postAction(body: object) {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '처리하지 못했습니다. 다시 시도해 주세요.');
  return result;
}

function useAttendance(month?: string) {
  const url = month ? endpoint + '?month=' + month : endpoint;
  const [result, setResult] = useState<LoadResult | null>(null);
  const activeUrl = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const pendingPunchRef = useRef<PunchRequest | null>(null);
  const refresh = useCallback(async (): Promise<Attendance | undefined> => {
    const target = activeUrl.current;
    if (!target) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(target, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(connectionError);
      const data: Attendance = await response.json();
      if (data?.connected !== false && (data?.connected !== true || !Array.isArray(data.shifts))) throw new Error(connectionError);
      if (!controller.signal.aborted) {
        setResult({ url: target, data });
        return data;
      }
    } catch {
      if (!controller.signal.aborted) setResult({ url: target, error: connectionError });
    }
  }, []);
  useEffect(() => {
    activeUrl.current = url;
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === refreshKey) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('storage', onStorage);
    return () => {
      activeUrl.current = null;
      request.current?.abort();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('storage', onStorage);
    };
  }, [url, refresh]);
  return { result: result?.url === url ? result : null, previous: result?.data, pendingPunchRef, refresh };
}

function ConnectDevice({ refresh }: { refresh: () => Promise<Attendance | undefined> }) {
  const [fingerprint, setFingerprint] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const codeField = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  async function showCode() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await postAction({ action: 'device' });
      if (typeof data.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(data.fingerprint)) throw new Error();
      setFingerprint(data.fingerprint);
    } catch { setError('기기 연결 코드를 확인하지 못했습니다. 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(fingerprint);
      setMessage('연결 코드를 복사했습니다.');
    } catch {
      codeField.current?.select();
      setMessage('선택한 연결 코드를 복사해 주세요.');
    }
  }
  async function check() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setMessage('');
    try {
      const state = await refresh();
      if (state?.connected === false) setMessage('아직 이 기기가 연결되지 않았습니다.');
    } finally { lock.current = false; setBusy(false); }
  }
  return <section className={styles.panel} aria-labelledby="connect-title">
    <h2 id="connect-title">개인 기기 연결</h2>
    <p className={styles.hint}>이 브라우저를 연결하면 개인 근무 기록을 사용할 수 있습니다.</p>
    {fingerprint ? <>
      <label className={styles.codeField}>기기 연결 코드<input ref={codeField} value={fingerprint} readOnly spellCheck={false} /></label>
      <p className={styles.hint}>이미 연결한 기기에서 ‘내 근태’의 ‘내 다른 기기 연결’을 열고 이 코드를 입력하세요. 그런 다음 여기서 연결 확인을 누르세요.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={copy}>코드 복사</button>
        <button type="button" className={styles.primary} onClick={check} disabled={busy}>{busy ? '확인 중…' : '연결 확인'}</button>
      </div>
    </> : <button type="button" className={styles.primary} disabled={busy} onClick={showCode}>
      {busy ? '확인 중…' : '기기 연결 코드 확인'}
    </button>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.hint}>{message}</p>}
  </section>;
}

function LinkDevice({ refresh }: { refresh: () => Promise<Attendance | undefined> }) {
  const [fingerprint, setFingerprint] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    setError(''); setMessage('');
    const code = fingerprint.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(code)) {
      setError('다른 기기에 표시된 연결 코드 64자리를 입력해 주세요.');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const data = await postAction({ action: 'link', fingerprint: code });
      if (data.ok !== true) throw new Error();
      setFingerprint('');
      setMessage('기기를 연결했습니다. 새 기기에서 연결 확인을 누르세요.');
    } catch (cause) {
      setError(cause instanceof Error && /[가-힣]/.test(cause.message) ? cause.message : '기기를 연결하지 못했습니다. 다시 시도해 주세요.');
      await refresh();
    } finally { lock.current = false; setBusy(false); }
  }
  return <details className={styles.deviceDetails}>
    <summary>내 다른 기기 연결</summary>
    <p className={styles.hint}>본인이 사용할 다른 기기에서 ‘내 근태’를 열고 기기 연결 코드를 확인하세요. 코드를 여기에 입력하면 그 기기에서도 같은 근무 기록을 사용할 수 있습니다.</p>
    <form onSubmit={submit}>
      <label className={styles.codeField}>다른 기기의 연결 코드
        <input value={fingerprint} onChange={event => { setFingerprint(event.target.value); setError(''); setMessage(''); }}
          required readOnly={busy} spellCheck={false} autoComplete="off" autoCapitalize="none" />
      </label>
      <button type="submit" className={styles.secondary} disabled={busy}>{busy ? '연결 중…' : '다른 기기 연결'}</button>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.success}>{message}</p>}
  </details>;
}

function PunchPanel({ open, refresh, pendingPunchRef, compact = false }: {
  open: AttendanceShift | null; refresh: () => Promise<Attendance | undefined>;
  pendingPunchRef: React.RefObject<PunchRequest | null>; compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function punch() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setMessage(''); setError('');
    const action = open ? 'out' : 'in';
    const shiftId = open?.id ?? null;
    try {
      if (!pendingPunchRef.current || pendingPunchRef.current.action !== action || pendingPunchRef.current.shiftId !== shiftId) {
        pendingPunchRef.current = { action, requestId: crypto.randomUUID(), shiftId };
      }
      const data = await postAction(pendingPunchRef.current);
      if (data.ok !== true) throw new Error();
      pendingPunchRef.current = null;
      setMessage(action === 'in' ? '출근을 기록했습니다.' : '퇴근을 기록했습니다.');
      notifyAttendanceChange();
      await refresh();
    } catch (cause) {
      const latest = await refresh();
      if (latest?.connected && (latest.open_shift?.id ?? null) !== shiftId) {
        pendingPunchRef.current = null;
        setMessage('현재 근무 상태를 다시 확인했습니다.');
        notifyAttendanceChange();
      } else {
        const detail = cause instanceof Error && /[가-힣]/.test(cause.message) ? cause.message : '처리 결과를 확인하지 못했습니다. 다시 시도해 주세요.';
        setError(detail);
      }
    } finally { lock.current = false; setBusy(false); }
  }
  return <section className={styles.punch} data-compact={compact} aria-label="나의 출퇴근">
    <div className={styles.punchMain}>
      <div>
        <h2>{open ? '근무 중' : '출근 가능'}</h2>
        {open && <p>{attendanceDate(open.clock_in)} {attendanceTime(open.clock_in)} 출근</p>}
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={busy} className={styles.primary} onClick={punch}>{busy ? '기록 중…' : open ? '퇴근' : '출근'}</button>
        {compact && <Link href="/attendance" className={styles.inlineLink}>내 근태</Link>}
      </div>
    </div>
    {message && <p role="status" className={styles.success}>{message}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}

export function AttendanceQuickAction() {
  const { result, refresh, pendingPunchRef } = useAttendance();
  if (result?.data?.connected) return <PunchPanel open={result.data.open_shift} refresh={refresh} pendingPunchRef={pendingPunchRef} compact />;
  return <Link href="/attendance" className={styles.quickLink}>내 근태 →</Link>;
}

function clockOutLabel(shift: AttendanceShift) {
  if (!shift.clock_out) return '근무 중';
  const day = attendanceDate(shift.clock_out);
  return (day === attendanceDate(shift.clock_in) ? '' : day + ' ') + attendanceTime(shift.clock_out);
}

function ShiftHistory({ data, month, setMonth }: {
  data?: AttendanceDashboard; month: string; setMonth: (value: string) => void;
}) {
  return <section className={styles.panel} aria-label="월별 근무 기록">
    <div className={styles.panelHeader}><h2>월별 근무 기록</h2>
      <label>조회 월<input type="month" value={month} onChange={e => {
        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value);
      }} /></label>
    </div>
    {!data ? <p role="status" className={styles.empty}>선택한 달의 기록을 불러오는 중…</p> : <>
      <div className={styles.summary}><div><span>근무시간 합계</span>
        <strong>{durationLabel(data.shifts.reduce((sum, shift) => sum + shiftMilliseconds(shift), 0))}</strong></div>
        <p>한국시간 · 출근일 기준<br />퇴근한 기록의 경과시간을 합산합니다.</p></div>
      {data.shifts.length === 0 ? <p className={styles.empty}>이 달에 기록된 출퇴근이 없습니다.</p> :
        <div className={styles.tableScroll}><table className={styles.history}>
          <caption className={styles.sr}>{month} 출퇴근 기록</caption>
          <thead><tr><th scope="col">출근일</th><th scope="col">출근</th><th scope="col">퇴근</th><th scope="col">근무시간</th></tr></thead>
          <tbody>{data.shifts.map(shift => <tr key={shift.id}>
            <td>{attendanceDate(shift.clock_in)}</td><td>{attendanceTime(shift.clock_in)}</td>
            <td>{clockOutLabel(shift)}</td><td>{shift.clock_out ? durationLabel(shiftMilliseconds(shift)) : '집계 대기'}</td>
          </tr>)}</tbody>
        </table></div>}
    </>}
  </section>;
}

export default function AttendanceWorkspace() {
  const [month, setMonth] = useState(() => attendanceDate(new Date()).slice(0, 7));
  const { result, previous, refresh, pendingPunchRef } = useAttendance(month);
  const data = result?.data;
  const connected = data?.connected || (!result && previous?.connected);
  return <div className={styles.page}>
    <header className={styles.siteHeader}><div>
      <Link href="/" aria-label="LV LAB 홈">LV LAB</Link>
        <nav aria-label="사무소 메뉴"><Link href="/">사무소 홈</Link><Link href="/?tab=projects">프로젝트 관리</Link><Link href="/?tab=schedule">프로젝트 일정</Link></nav>
    </div></header>
    <main className={styles.main}>
      <h1>내 근태</h1>
      {result?.error ? <section className={styles.panel}><p role="alert" className={styles.error}>{result.error}</p>
        <button type="button" className={styles.secondary} onClick={refresh}>다시 확인</button></section>
        : data?.connected === false ? <ConnectDevice refresh={refresh} />
        : connected ? <>
          {data?.connected && <PunchPanel open={data.open_shift} refresh={refresh} pendingPunchRef={pendingPunchRef} />}
          <PersonalWorkJournal />
          <ShiftHistory data={data?.connected ? data : undefined} month={month} setMonth={setMonth} />
          <LinkDevice refresh={refresh} />
        </> : <p role="status" className={styles.loading}>근무 기록을 불러오는 중…</p>}
    </main>
  </div>;
}
