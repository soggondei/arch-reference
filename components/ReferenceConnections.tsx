'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { ProjectActivityChange, Reference } from '@/lib/types';
import { isWorkspaceProject, projectHref } from '@/lib/workspace-navigation';
import { ProjectColorDot } from './ProjectColorPicker';
import styles from './ReferenceConnections.module.css';

interface Props {
  context: 'project' | 'reference';
  anchor: Reference;
  refs: Reference[];
  onActivity: (projectId: string, change: ProjectActivityChange) => Promise<void>;
}

export default function ReferenceConnections({ context, anchor, refs, onActivity }: Props) {
  const [editing, setEditing] = useState<{ id: string; previousNote: string; previousDecision?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const inProject = context === 'project';
  const candidates = refs.filter(r => inProject ? !r.competitionData && r.refType !== 'link' : isWorkspaceProject(r));
  const byId = new Map(candidates.map(r => [r.id, r]));
  const linked = inProject
    ? (anchor.competitionData?.referenceLinks ?? []).map(link => ({ id: link.referenceId, note: link.note, decision: link.decision }))
    : candidates.flatMap(project => (project.competitionData?.referenceLinks ?? [])
        .filter(link => link.referenceId === anchor.id).map(link => ({ id: project.id, note: link.note, decision: link.decision })));
  const linkedIds = new Set(linked.map(link => link.id));
  const available = candidates.filter(r => !linkedIds.has(r.id));
  const search = query.trim().toLocaleLowerCase('ko');
  const options = available.filter(r => [r.title, r.architect, ...r.tags.program].some(v => v?.toLocaleLowerCase('ko').includes(search)))
    .sort((a,b) => a.title.localeCompare(b.title, 'ko'));
  const subject = inProject ? '레퍼런스' : '프로젝트';

  function clearEditor() {
    setAdding(false); setEditing(null); setChoice(''); setQuery(''); setNote(''); setDecision('');
  }

  async function change(id: string, action: 'save' | 'remove', previousNote?: string, previousDecision?: string) {
    if (!id || busy) return;
    setBusy(true); setError(''); setMessage('');
    const projectId = inProject ? anchor.id : id;
    const referenceId = inProject ? id : anchor.id;
    try {
      await onActivity(projectId, action === 'save'
        ? { type: 'linkReference', referenceId, note: note.trim(), previousNote, decision, previousDecision }
        : { type: 'unlinkReference', referenceId, previousNote, previousDecision });
      clearEditor();
      setMessage(action === 'remove' ? '연결을 해제했습니다.' : '연결 정보를 저장했습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 정보를 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void change(editing?.id ?? choice, 'save', editing?.previousNote, editing?.previousDecision);
  }

  return <section className={styles.panel} aria-label={inProject ? '프로젝트 레퍼런스' : '연결된 프로젝트'}>
    <div className={styles.head}>
      <h3>{inProject ? '프로젝트 레퍼런스' : '연결된 프로젝트'} <span>{linked.length}</span></h3>
      {!adding && !editing && <button className={styles.primary} type="button" disabled={busy}
        onClick={() => { setAdding(true); setMessage(''); setError(''); }}>{subject} 연결</button>}
    </div>
    {(adding || editing) && <form className={styles.form} onSubmit={submit}>
      <fieldset disabled={busy}>
        {adding ? <>
          <label>{subject} 검색<input type="search" placeholder="이름으로 검색" value={query}
            onChange={e => { setQuery(e.target.value); setChoice(''); }} /></label>
          <label>연결할 {subject}<select value={choice} onChange={e => setChoice(e.target.value)} required>
            <option value="">{options.length ? '선택하세요' : '선택할 항목이 없습니다'}</option>
            {options.map(r => <option value={r.id} key={r.id}>{r.title}</option>)}
          </select></label>
        </> : <strong>{byId.get(editing!.id)?.title ?? '레퍼런스'}</strong>}
        <label>활용 메모 <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          maxLength={500} placeholder="예: 시장 방문객과 물류의 동선을 어떻게 분리했는가?" /></label>
        <label>설계 결정 · 반영 결과 <textarea value={decision} onChange={e => setDecision(e.target.value)} rows={2}
          maxLength={500} placeholder="예: 방문객 출입구와 물류 진입로를 분리하기로 했다." /></label>
        <div className={styles.buttons}>
          <button type="button" onClick={() => { clearEditor(); setError(''); }}>취소</button>
          <button type="submit" className={styles.primary} disabled={adding && !choice}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </fieldset>
    </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.message}>{message}</p>}
    {!linked.length && <p className={styles.empty}>아직 연결한 {subject}가 없습니다.</p>}
    <ul>{linked.map(link => {
      const ref = byId.get(link.id);
      return <li key={link.id}>
        <div className={styles.content}>
          {ref ? <Link href={inProject ? '/reference/' + encodeURIComponent(ref.id) : projectHref(ref.id, 'references')}>{!inProject && <ProjectColorDot project={ref} />}{ref.title}</Link>
            : <strong>원본을 찾을 수 없는 {subject}</strong>}
          {link.note && <p><b>활용 메모</b> · {link.note}</p>}
          {link.decision && <p><b>설계 결정</b> · {link.decision}</p>}
        </div>
        <div className={styles.buttons}>
          {ref && <button type="button" disabled={busy || adding || !!editing} onClick={() => {
            setEditing({ id: link.id, previousNote: link.note, previousDecision: link.decision });
            setNote(link.note); setDecision(link.decision ?? ''); setMessage(''); setError('');
          }}>메모 수정</button>}
          <button type="button" disabled={busy || adding || !!editing} onClick={() => void change(link.id, 'remove', link.note, link.decision)}>연결 해제</button>
        </div>
      </li>;
    })}</ul>
  </section>;
}
