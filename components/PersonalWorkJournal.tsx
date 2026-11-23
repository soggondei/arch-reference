'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { attendanceDate, durationLabel } from '@/lib/attendance';
import styles from './PersonalWorkJournal.module.css';

type Task = { project_id: string | null; task_id: string | null; project_name: string | null; task_name: string };
type Total = Task & { minutes: number };
type Entry = Total & { id: string; work_date: string; note: string; version: number };
type DayReport = { entries: Entry[]; totals: Total[]; attendance_seconds: number; open: boolean };
type Editor = { id: string; original?: Entry };

const endpoint = '/api/personal-work';
const workChanged = 'lv-personal-work-change';
const attendanceChanged = 'lv-personal-attendance-change';

function refresh() {
  window.dispatchEvent(new Event(workChanged));
}

async function request<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', cache: 'no-store',
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '기록을 불러오지 못했습니다. 다시 시도해 주세요.');
  return result as T;
}

function errorText(error: unknown) {
  return error instanceof Error && /[가-힣]/.test(error.message) ? error.message : '연결 상태를 확인하고 다시 시도해 주세요.';
}

function WorkForm({ editor, day, totals, cancel, saved }: {
  editor: Editor; day: string; totals: Total[]; cancel: () => void; saved: (workDate: string) => void;
}) {
  const entry = editor.original;
  const [linked, setLinked] = useState(Boolean(entry?.project_id));
  const [project, setProject] = useState(entry?.project_id ?? '');
  const [taskId, setTaskId] = useState(entry?.task_id ?? '');
  const [targets, setTargets] = useState<Task[] | null>(null);
  const [targetError, setTargetError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    if (!linked) return;
    let live = true;
    request<{targets: Task[]}>(endpoint + '?targets=1').then(({targets}) => {
      if (live) { setTargets(targets); setTargetError(''); }
    }).catch(e => { if (live) setTargetError(errorText(e)); });
    return () => { live = false; };
  }, [linked, attempt]);
  const choices = [...(targets ?? [])];
  if (entry?.project_id && !choices.some(t => t.project_id === entry.project_id && t.task_id === entry.task_id)) choices.push(entry);
  const projects = new Map(choices.map(t => [t.project_id, t.project_name]));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const fields = new FormData(event.currentTarget);
    const workDate = String(fields.get('day'));
    const minutes = Number(fields.get('hours')) * 60 + Number(fields.get('minutes'));
    const target = choices.find(t => t.project_id === project && t.task_id === taskId);
    const taskName = linked ? target?.task_name : String(fields.get('name') ?? '').trim();
    if (!taskName) { setError('기록할 업무를 선택하거나 입력해 주세요.'); return; }
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) { setError('투입시간은 1분부터 24시간까지 입력해 주세요.'); return; }
    saving.current = true; setBusy(true); setError('');
    try {
      await request(endpoint, { action: 'save', id: editor.id, day: workDate, projectId: linked ? project : null,
        taskId: linked ? taskId : null, taskName, minutes, note: String(fields.get('note') ?? '').trim(), version: entry?.version ?? null });
      saved(workDate);
    } catch (e) { setError(errorText(e)); }
    finally { saving.current = false; setBusy(false); }
  }
  return <form className={styles.form} onSubmit={submit} aria-label={entry ? '업무 기록 수정' : '업무 기록 추가'}>
    <fieldset disabled={busy}>
      <legend>{entry ? '업무 기록 수정' : '업무 기록 추가'}</legend>
      <div className={styles.fields}>
        <label>작업일<input name="day" type="date" required defaultValue={entry?.work_date ?? day} /></label>
        <label>업무 선택 방식<select value={linked ? 'project' : 'manual'} onChange={e => { setLinked(e.target.value === 'project'); setError(''); }}>
          <option value="manual">직접 입력</option><option value="project">프로젝트 업무 선택</option>
        </select></label>
        {linked ? <>
          <label>프로젝트<select value={project} required onChange={e => { setProject(e.target.value); setTaskId(''); }}>
            <option value="">{targets === null && !targetError ? '불러오는 중…' : '프로젝트 선택'}</option>
            {[...projects].map(([id, name]) => <option key={id} value={id ?? ''}>{name}</option>)}
          </select></label>
          <label>프로젝트 업무<select value={taskId} required onChange={e => setTaskId(e.target.value)}>
            <option value="">업무 선택</option>
            {choices.filter(t => t.project_id === project).map(t => <option key={t.task_id} value={t.task_id ?? ''}>{t.task_name}</option>)}
          </select></label>
          {targetError && <p className={styles.full} role="alert">{targetError} <button type="button" onClick={() => setAttempt(n => n + 1)}>다시 불러오기</button></p>}
        </> : <label className={styles.full}>업무명<input name="name" list="lv-personal-task-names" required maxLength={300} placeholder="예: 도면 검토" defaultValue={entry?.task_name ?? ''} />
          <datalist id="lv-personal-task-names">{totals.filter(a => !a.project_id).map(t => <option key={t.task_name} value={t.task_name} />)}</datalist>
        </label>}
        <label>시간<input name="hours" type="number" step="1" min="0" max="24" placeholder="0" defaultValue={entry ? Math.floor(entry.minutes / 60) : ''} /></label>
        <label>분<input name="minutes" type="number" step="1" min="0" max="59" placeholder="0" defaultValue={entry ? entry.minutes % 60 : ''} /></label>
        <label className={styles.full}>작업 메모 (선택)<textarea name="note" rows={2} maxLength={4000} defaultValue={entry?.note ?? ''} /></label>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><button type="button" className={styles.secondary} onClick={cancel}>취소</button>
        <button className={styles.primary} type="submit">{busy ? '저장 중…' : '저장'}</button></div>
    </fieldset>
  </form>;
}

export default function PersonalWorkJournal() {
  const [day, setDay] = useState(() => attendanceDate(new Date()));
  const [report, setReport] = useState<{day: string; data: DayReport} | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteLock = useRef(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    let active = true;
    let lastRequest = 0;
    function load() {
      const sequence = ++lastRequest;
      request<DayReport>(endpoint + '?day=' + encodeURIComponent(day)).then(data => {
        if (active && sequence === lastRequest) { setReport({day, data}); setError(''); }
      }).catch(e => {
        if (active && sequence === lastRequest) { setError(errorText(e)); setReport(null); }
      });
    }
    load();
    const visible = () => { if (document.visibilityState === 'visible') load(); };
    const storage = (e: StorageEvent) => { if (e.key === workChanged || e.key === attendanceChanged) load(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('storage', storage);
    window.addEventListener(attendanceChanged, load);
    window.addEventListener(workChanged, load);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('storage', storage);
      window.removeEventListener(attendanceChanged, load);
      window.removeEventListener(workChanged, load);
    };
  }, [day]);
  const data = report?.day === day ? report.data : null;
  const minutes = data?.entries.reduce((sum, r) => sum + r.minutes, 0) ?? 0;
  const minuteLabel = (m: number) => m ? durationLabel(m * 60000) : '0분';
  function updated(targetDay: string, message: string) {
    setEditor(null); setRemoving(null); setNotice(message);
    try { localStorage.setItem(workChanged, crypto.randomUUID()); } catch { /* another tab can also refresh on focus */ }
    if (targetDay === day) refresh(); else setDay(targetDay);
  }
  async function remove(entry: Entry) {
    if (deleteLock.current) return;
    deleteLock.current = true; setDeleting(true); setNotice('');
    try { await request(endpoint, {action:'delete', id:entry.id, version:entry.version}); updated(day, '업무 기록을 삭제했습니다.'); }
    catch (e) { setError(errorText(e)); }
    finally { deleteLock.current = false; setDeleting(false); }
  }
  const search = query.trim().toLocaleLowerCase('ko');
  const totals = data?.totals.filter(t => !search || [t.project_name, t.task_name].some(label => label?.toLocaleLowerCase('ko').includes(search))) ?? [];
  return <section className={styles.journal} aria-label="개인 업무 기록">
    <div className={styles.head}><h2>일별 업무 기록</h2>
      <label>작업일<input type="date" value={day} disabled={!!editor || !!removing} onChange={e => {
        if (e.target.validity.valid && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { setDay(e.target.value); setNotice(''); }
      }} /></label></div>
    {error && <p role="alert" className={styles.error}>{error} <button onClick={refresh} type="button">다시 불러오기</button></p>}
    {!data && !error && <p role="status" className={styles.muted}>업무 기록을 불러오는 중…</p>}
    {data && <>
      <dl className={styles.metrics}>
        <div><dt>퇴근한 근무시간</dt><dd>{durationLabel(data.attendance_seconds * 1000)}</dd></div>
        <div><dt>업무에 기록한 시간</dt><dd>{minuteLabel(minutes)}</dd></div>
      </dl>
      {data.open && <p className={styles.muted}>진행 중인 근무는 퇴근하면 근무시간에 합산됩니다.</p>}
      {!editor && <button className={styles.secondary} type="button" disabled={!!removing} onClick={() => { setNotice(''); setEditor({id:crypto.randomUUID()}); }}>+ 업무 기록</button>}
      {editor && <WorkForm key={editor.id} editor={editor} day={day} totals={data.totals} cancel={() => { setEditor(null); refresh(); }} saved={newDay => updated(newDay, '업무 기록을 저장했습니다.')} />}
      {notice && <p role="status" className={styles.muted}>{notice}</p>}
      <ul className={styles.entries}>{data.entries.map(entry => <li key={entry.id}>
        <div className={styles.itemHead}><div><strong>{entry.task_name}</strong>{entry.project_name && <small>{entry.project_name}</small>}</div>
          <b>{minuteLabel(entry.minutes)}</b></div>
        {entry.note && <p className={styles.note}>{entry.note}</p>}
        {removing?.id === entry.id ? <div className={styles.actions}>
          <span>이 기록을 삭제할까요?</span><button type="button" disabled={deleting} onClick={() => setRemoving(null)}>취소</button>
          <button type="button" disabled={deleting} onClick={() => void remove(entry)}>삭제 확인</button>
        </div> : <div className={styles.actions}><button type="button" disabled={!!editor || !!removing} onClick={() => { setNotice(''); setEditor({id:entry.id,original:entry}); }}>수정</button>
          <button type="button" disabled={!!editor || !!removing} onClick={() => { setNotice(''); setRemoving(entry); }}>삭제</button></div>}
      </li>)}</ul>
      {!data.entries.length && <p className={styles.muted}>이날 기록한 업무가 없습니다.</p>}
      <div className={styles.summary}><div className={styles.head}><h3>개인 업무별 누적시간 <small>전체 기간</small></h3>
        {!!data.totals.length && <input aria-label="누적 업무 검색" type="search" placeholder="프로젝트·업무 검색" value={query} onChange={e => setQuery(e.target.value)} />}</div>
        <p className={styles.muted}>내 근태에서 기록한 시간을 합산합니다. 기존 프로젝트 일지는 프로젝트 주간 리포트에서 볼 수 있습니다.</p>
        {totals.length ? <ul>{totals.map(t => <li className={styles.itemHead} key={JSON.stringify([t.project_id,t.task_id,t.task_id ? '' : t.task_name])}>
          <div><strong>{t.task_name}</strong>{t.project_name && <small>{t.project_name}</small>}</div><b>{minuteLabel(t.minutes)}</b>
        </li>)}</ul> : <p className={styles.muted}>{search ? '검색 결과가 없습니다.' : '업무를 기록하면 누적시간이 표시됩니다.'}</p>}
      </div>
    </>}
  </section>;
}
