'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { ProjectActivityChange, ScheduleItem, TaskDeliverable } from '@/lib/types';
import styles from './TaskJournal.module.css';

type Editor = { id: string; previous?: TaskDeliverable };

export default function TaskDeliverables({ task, save }: { task: ScheduleItem; save: (change: ProjectActivityChange) => Promise<void> }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [removing, setRemoving] = useState<TaskDeliverable | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const entries = task.deliverables ?? [];
  const editingDisabled = busy || !!editor || entries.some(item => item.id === removing?.id);
  async function persist(id: string, previous?: TaskDeliverable, value?: TaskDeliverable) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await save({ type: 'deliverable', taskId: task.id, id, previous, value });
      setEditor(null); setRemoving(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '제출물을 저장하지 못했습니다.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const fields = new FormData(event.currentTarget);
    void persist(editor.id, editor.previous, {
      id: editor.id, title: String(fields.get('title') ?? '').trim(),
      criteria: String(fields.get('criteria') ?? '').trim(), checked: editor.previous?.checked ?? false,
    });
  }
  return <section aria-label="제출물과 완료 기준">
    <div className={styles.head}><h3>제출물 <small>확인 {entries.filter(i => i.checked).length} / {entries.length}</small></h3>
      <button className={styles.secondary} type="button" disabled={editingDisabled}
        onClick={() => { setError(''); setEditor({ id: crypto.randomUUID() }); }}>제출물 추가</button></div>
    {entries.map(item => <div key={item.id} className={styles.entry}>
      <label className={styles.checkItem}><input type="checkbox" disabled={editingDisabled}
        checked={item.checked} onChange={e => void persist(item.id, item, { ...item, checked: e.target.checked })} />
        {item.title}</label>
      {item.criteria && <p className={styles.body}>완료 기준 · {item.criteria}</p>}
      <div className={styles.entryActions}>
        {removing?.id === item.id ? <>
          <small>제출물 목록에서 지울까요?</small>
          <button type="button" disabled={busy} onClick={() => setRemoving(null)}>취소</button>
          <button type="button" disabled={busy} onClick={() => void persist(removing.id, removing)}>삭제 확인</button>
        </> : <>
          <button type="button" disabled={editingDisabled} onClick={() => { setError(''); setEditor({ id: item.id, previous: item }); }}>제출물 수정</button>
          <button type="button" disabled={editingDisabled} onClick={() => { setError(''); setRemoving(item); }}>제출물 삭제</button>
        </>}
      </div>
    </div>)}
    {editor && <form className={styles.form} onSubmit={submit} key={editor.id}>
      <fieldset disabled={busy}><legend>{editor.previous ? '제출물 수정' : '제출물 추가'}</legend>
        <label className={styles.full}>제출물 이름<input name="title" defaultValue={editor.previous?.title} maxLength={160} required placeholder="예: A1 설계 패널 PDF" /></label>
        <label className={styles.full}>완료 기준<textarea name="criteria" defaultValue={editor.previous?.criteria} maxLength={500} rows={2} placeholder="예: 규격, 페이지 수, 익명 표기 확인" /></label>
        <div className={styles.actions}><button className={styles.secondary} type="button" onClick={() => setEditor(null)}>취소</button>
          <button className={styles.primary} type="submit">{busy ? '저장 중…' : '저장'}</button></div>
      </fieldset>
    </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
