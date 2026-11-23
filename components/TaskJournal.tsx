'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { ProjectActivityChange, Reference, ScheduleItem, TaskFeedback, WorkLog } from '@/lib/types';
import DrawingDetails, { DrawingFields, readDrawingFields } from './DrawingDetails';
import TaskDeliverables from './TaskDeliverables';
import styles from './TaskJournal.module.css';

type Editor =
  | { kind: 'log'; id: string; previous?: WorkLog }
  | { kind: 'feedback'; id: string; workLogId?: string }
  | { kind: 'followUp'; id: string; feedback: TaskFeedback };

interface Props {
  project: Reference;
  task: ScheduleItem;
  member: string;
  sharedLogs?: WorkLog[];
  today: string;
  onActivity: (projectId: string, change: ProjectActivityChange) => Promise<void>;
  onOpenTask: (projectId: string, taskId: string) => void;
}

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours && hours + '시간', rest && rest + '분'].filter(Boolean).join(' ') || '0분';
}

function EntryForm({ editor, task, logs, member, today, save, close }: {
  editor: Editor;
  task: ScheduleItem;
  logs: WorkLog[];
  member: string;
  today: string;
  save: (change: ProjectActivityChange) => Promise<void>;
  close: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const previous = editor.kind === 'log' ? editor.previous : undefined;
  const title = editor.kind === 'followUp' ? '후속 업무 만들기' :
    editor.kind === 'feedback' ? '피드백 작성' : previous ? '업무일지 수정' : '업무일지 작성';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    const date = value('date');
    let change: ProjectActivityChange;
    if (editor.kind === 'followUp') {
      const name = value('name');
      if (!name || !date) { setError('업무명과 마감일을 입력해 주세요.'); return; }
      change = {
        type: 'followUp', feedbackId: editor.feedback.id,
        task: { id: editor.id, taskName: name, category: task.category === 'external' ? 'admin' : task.category,
          endDate: date, status: 'planned', assignee: value('assignee') || undefined },
      };
    } else {
      const author = value('author');
      const body = value('body');
      if (!author || !date || !body) { setError('작성자, 날짜, 내용을 모두 입력해 주세요.'); return; }
      const entry = { id: editor.id, taskId: task.id, taskName: task.taskName, author, date, body };
      if (editor.kind === 'log') {
        const hours = Number(value('hours'));
        const remainder = Number(value('minutes'));
        const minutes = hours * 60 + remainder;
        if (!Number.isInteger(hours) || !Number.isInteger(remainder) || hours < 0 ||
          remainder < 0 || remainder > 59 || minutes < 1 || minutes > 1440) {
          setError('투입시간은 1분부터 24시간까지 입력할 수 있습니다.'); return;
        }
        change = { type: 'saveLog', log: { ...entry, minutes }, previous };
      } else {
        change = { type: 'addFeedback', feedback: {
          ...entry, workLogId: value('logId') || undefined, reviewedDrawing: readDrawingFields(form),
        } };
      }
    }
    submitting.current = true;
    setSaving(true); setError('');
    try { await save(change); } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      submitting.current = false; setSaving(false);
    }
  }

  return (
    <form className={styles.form} aria-label={title} onSubmit={submit}>
      <fieldset disabled={saving}>
        <legend>{title}</legend>
        {editor.kind === 'followUp' ? <>
          <p className={styles.quote}>{editor.feedback.body}</p>
          <label className={styles.full}>업무명<input name="name" defaultValue={editor.feedback.body.split('\n')[0].slice(0, 180)} required maxLength={180} autoFocus /></label>
          <label>담당자<input name="assignee" list="lv-members" maxLength={80} defaultValue={task.assignee ?? ''} placeholder="미배정" /></label>
          <label>마감일<input type="date" name="date" required /></label>
        </> : <>
          <label>작성자<input name="author" maxLength={80} required list="lv-members" defaultValue={previous?.author ?? member} /></label>
          <label>{editor.kind === 'log' ? '작업일' : '피드백 날짜'}<input type="date" name="date" required defaultValue={previous?.date ?? today} /></label>
          {editor.kind === 'log' ? <div className={styles.time} role="group" aria-label="투입시간">
            <span>투입시간</span>
            <div>
              <label><input type="number" min="0" max="24" step="1" name="hours" defaultValue={Math.floor((previous?.minutes ?? 0) / 60)} />시간</label>
              <label><input type="number" min="0" max="59" step="1" name="minutes" defaultValue={(previous?.minutes ?? 0) % 60} />분</label>
            </div>
          </div> : logs.length > 0 && <label className={styles.full}>피드백 대상<select name="logId" defaultValue={editor.workLogId ?? ''}>
            <option value="">업무 전체</option>
            {logs.map(log => <option key={log.id} value={log.id}>{log.date} · {log.author} · {log.body.slice(0, 60)}</option>)}
          </select></label>}
          <label className={styles.full}>{editor.kind === 'log' ? '작업 내용' : '피드백 내용'}
            <textarea name="body" rows={3} maxLength={4000} required defaultValue={previous?.body ?? ''} />
          </label>
          {editor.kind === 'feedback' && <details className={styles.full}><summary>검토 도면 추가</summary><div className={styles.drawingInputs}><DrawingFields /></div></details>}
          <p className={`${styles.full} ${styles.meta}`}>저장한 기록은 이 앱을 열 수 있는 사람에게 표시됩니다.</p>
        </>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={close}>취소</button>
          <button type="submit" className={styles.primary}>{saving ? '저장 중…' : editor.kind === 'followUp' ? '후속 업무 생성' : '저장'}</button>
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </fieldset>
    </form>
  );
}

export default function TaskJournal({ project, task, member, today, sharedLogs = [], onActivity, onOpenTask }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState('');
  const data = project.competitionData!;
  const shared = sharedLogs.filter(log => log.taskId === task.id);
  const sharedIds = new Set(shared.map(log => log.id));
  const logs = (data.workLogs ?? []).filter(log => log.taskId === task.id && !sharedIds.has(log.id));
  const allLogs = [...logs, ...shared].reverse().sort((a,b) => b.date.localeCompare(a.date));
  const feedback = (data.feedback ?? []).filter(item => item.taskId === task.id).reverse().sort((a,b) => b.date.localeCompare(a.date));
  const source = data.feedback?.find(item => item.followUpTaskId === task.id);
  const schedules = data.schedules ?? [];
  const totalMinutes = allLogs.reduce((sum, log) => sum + log.minutes, 0);
  const saveDetail = (change: ProjectActivityChange) => onActivity(project.id, change);
  const attendanceUrl = '/attendance?project=' + encodeURIComponent(project.id) + '&task=' + encodeURIComponent(task.id);

  function open(next: Editor) { setNotice(''); setEditor(next); }
  function addLog() { open({ kind: 'log', id: crypto.randomUUID() }); }
  function addFeedback(workLogId?: string) { open({ kind: 'feedback', id: crypto.randomUUID(), workLogId }); }
  async function save(change: ProjectActivityChange) {
    await onActivity(project.id, change);
    setEditor(null);
    setNotice(change.type === 'followUp' ? '후속 업무를 연결했습니다.' : change.type === 'saveLog' ? '업무일지를 저장했습니다.' : '피드백을 저장했습니다.');
  }
  const form = editor && <EntryForm key={editor.kind + editor.id} editor={editor} task={task} logs={logs}
    member={member} today={today} save={save} close={() => setEditor(null)} />;

  return (
    <div className={styles.journal}>
      {source && <div className={styles.origin}>
        <span>이 업무를 만든 피드백</span><p>{source.body}</p>
        <DrawingDetails item={source} field="reviewedDrawing" />
        <DrawingDetails item={source} field="resultDrawing" save={saveDetail} />
        {schedules.some(item => item.id === source.taskId) ?
          <button type="button" onClick={() => onOpenTask(project.id, source.taskId)}>원래 업무 열기 · {source.taskName}</button> :
          <small>원래 업무 · {source.taskName} (삭제됨)</small>}
      </div>}
      <TaskDeliverables task={task} save={saveDetail} />
      <section aria-label="업무일지">
        <div className={styles.head}><h3>업무일지 <small>{allLogs.length}건 · {duration(totalMinutes)}</small></h3>
          <Link className={styles.textAction} href={attendanceUrl}>내 근태와 함께 기록</Link>
          <button type="button" className={styles.secondary} disabled={!!editor} onClick={addLog}>일지 작성</button>
        </div>
        {editor?.kind === 'log' && form}
        {!allLogs.length && editor?.kind !== 'log' && <p className={styles.empty}>기록된 업무일지가 없습니다.</p>}
        {allLogs.map(log => <article className={styles.entry} key={log.id}>
          <div className={styles.meta}><time dateTime={log.date}>{log.date}</time><span>{log.author}</span>{sharedIds.has(log.id) && <span>내 근태에서 공유</span>}<b>{duration(log.minutes)}</b></div>
          <p className={styles.body}>{log.body}</p>
          {!sharedIds.has(log.id) && <div className={styles.entryActions}>
            <button type="button" disabled={!!editor} onClick={() => open({ kind: 'log', id: log.id, previous: log })}>일지 수정</button>
            <button type="button" disabled={!!editor} onClick={() => addFeedback(log.id)}>이 일지에 피드백</button>
          </div>}
        </article>)}
      </section>
      <section aria-label="피드백">
        <div className={styles.head}><h3>피드백 <small>{feedback.length}건</small></h3>
          <button type="button" className={styles.secondary} disabled={!!editor} onClick={() => addFeedback()}>피드백 작성</button>
        </div>
        {editor?.kind === 'feedback' && form}
        {!feedback.length && editor?.kind !== 'feedback' && <p className={styles.empty}>등록된 피드백이 없습니다.</p>}
        {feedback.map(item => {
          const log = logs.find(entry => entry.id === item.workLogId);
          const followUp = schedules.find(s => s.id === item.followUpTaskId);
          return <article key={item.id} className={styles.entry}>
            <div className={styles.meta}><time dateTime={item.date}>{item.date}</time><span>{item.author}</span></div>
            {log && <p className={styles.quote}>관련 일지 · {log.date} {log.author} · {log.body}</p>}
            <p className={styles.body}>{item.body}</p>
            <DrawingDetails item={item} field="reviewedDrawing" save={saveDetail} />
            <DrawingDetails item={item} field="resultDrawing" />
            <div className={styles.entryActions}>{followUp ?
              <button type="button" onClick={() => onOpenTask(project.id, followUp.id)}>후속 업무 열기 · {followUp.taskName}</button> :
              item.followUpTaskId ? <small>연결된 후속 업무가 삭제되었습니다.</small> :
              <button type="button" disabled={!!editor} onClick={() => open({ kind: 'followUp', id: crypto.randomUUID(), feedback: item })}>후속 업무 만들기</button>}
            </div>
            {editor?.kind === 'followUp' && editor.feedback.id === item.id && form}
          </article>;
        })}
      </section>
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
    </div>
  );
}
