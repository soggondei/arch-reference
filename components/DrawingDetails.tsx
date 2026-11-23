'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { DrawingRecord, ProjectActivityChange, TaskFeedback } from '@/lib/types';
import { safeDrawingUrl } from '@/lib/project-activity';
import styles from './TaskJournal.module.css';

export function readDrawingFields(form: FormData): DrawingRecord | undefined {
  const get = (key: string) => String(form.get(key) ?? '').trim();
  const number = get('drawingNumber'), version = get('drawingVersion'), url = get('drawingUrl'), note = get('drawingNote');
  if (!number && !version && !url && !note) return;
  return { number, version, url, ...(note && { note }) };
}

export function DrawingFields({ value, result = false }: { value?: DrawingRecord; result?: boolean }) {
  return <>
    <label>도면 번호·이름<input name="drawingNumber" maxLength={160} placeholder="예: A-101 1층 평면" defaultValue={value?.number} /></label>
    <label>도면 버전<input name="drawingVersion" maxLength={100} placeholder="예: v03" defaultValue={value?.version} /></label>
    <label className={styles.full}>도면 링크<input name="drawingUrl" type="url" maxLength={2000} placeholder="https://" defaultValue={value?.url} /></label>
    {result && <label className={styles.full}>반영 내용<textarea name="drawingNote" rows={2} maxLength={1000} defaultValue={value?.note} /></label>}
  </>;
}

type Props = { item: TaskFeedback; field: 'reviewedDrawing' | 'resultDrawing'; save?: (change: ProjectActivityChange) => Promise<void> };
export default function DrawingDetails({ item, field, save }: Props) {
  const [editor, setEditor] = useState<{ previous?: DrawingRecord } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const value = item[field];
  const label = field === 'reviewedDrawing' ? '검토 도면' : '반영본';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !save || submitting.current) return;
    const drawing = readDrawingFields(new FormData(event.currentTarget));
    if (!drawing && !editor.previous) { setError('저장할 도면 정보를 입력해 주세요.'); return; }
    submitting.current = true; setBusy(true); setError('');
    try { await save({ type: 'drawing', feedbackId: item.id, field, value: drawing, previous: editor.previous }); setEditor(null); }
    catch (e) { setError(e instanceof Error ? e.message : '도면을 저장하지 못했습니다.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (!value && !save) return null;
  return <div className={styles.drawing}>
    {value && <div><b>{label}</b> {[value.number, value.version].filter(Boolean).join(' · ')}
      {value.url && safeDrawingUrl(value.url) && <a href={value.url} target="_blank" rel="noopener noreferrer">{label} 열기</a>}
      {value.note && <p>{value.note}</p>}
    </div>}
    {save && !editor && <button type="button" className={styles.textAction} onClick={() => { setError(''); setEditor({ previous: value }); }}>
      {label} {value ? '수정' : '등록'}
    </button>}
    {editor && <form className={styles.form} onSubmit={submit}>
      <fieldset disabled={busy}><legend>{label} {editor.previous ? '수정' : '등록'}</legend>
        <DrawingFields value={editor.previous} result={field === 'resultDrawing'} />
        <div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => setEditor(null)}>취소</button>
          <button type="submit" className={styles.primary}>{busy ? '저장 중…' : '저장'}</button></div>
      </fieldset>
    </form>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
