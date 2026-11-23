'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { PROJECT_COLORS, projectColor, projectColorName } from '@/lib/project-color';
import type { ProjectActivityChange, Reference } from '@/lib/types';
import styles from './ProjectColorPicker.module.css';

export function ProjectColorDot({ project }: { project: Reference }) {
  return <i aria-hidden="true" className={styles.dot} style={{ backgroundColor: projectColor(project) }} />;
}

export default function ProjectColorPicker({ project, projects, onActivity }: {
  project: Reference;
  projects: Reference[];
  onActivity: (projectId: string, change: ProjectActivityChange) => Promise<void>;
}) {
  const formId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const saved = projectColor(project);
  const [edit, setEdit] = useState<{ value: string; previous?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const shared = edit ? projects.filter(other => other.id !== project.id && projectColor(other) === edit.value) : [];

  function close() {
    setEdit(null); setError('');
    trigger.current?.focus();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!edit || busy) return;
    setBusy(true); setError('');
    try {
      await onActivity(project.id, { type: 'projectColor', value: edit.value, previous: edit.previous });
      close();
      setMessage('프로젝트 색상을 저장했습니다.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '색상을 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally { setBusy(false); }
  }

  return <div className={styles.control}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label="프로젝트 색상 변경" aria-expanded={Boolean(edit)}
      aria-controls={edit ? formId : undefined} aria-disabled={busy} onClick={() => {
        if (busy) return;
        if (edit) { close(); return; }
        setMessage(''); setEdit({ value: saved, previous: project.competitionData?.projectColor });
      }}>
      <ProjectColorDot project={project} />{projectColorName(project)}<span>색상 변경</span>
    </button>
    {edit && <form id={formId} aria-label="프로젝트 색상 설정" className={styles.panel} onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>프로젝트 색상</legend>
        <div className={styles.palette}>{PROJECT_COLORS.map(color => <label className={styles.option} key={color.value}>
          <input type="radio" name={formId} aria-label={color.label} value={color.value} checked={edit.value === color.value}
            onChange={() => setEdit({ ...edit, value: color.value })} />
          <span><i className={styles.dot} aria-hidden="true" style={{ backgroundColor: color.value }} />{color.label}</span>
        </label>)}</div>
        {shared.length > 0 && <p className={styles.used}>같은 색을 쓰는 프로젝트 · {shared.slice(0, 2).map(other => other.title).join(', ')}{shared.length > 2 && ' 외 ' + (shared.length - 2) + '개'}</p>}
        <div className={styles.actions}>
          <button type="button" onClick={close}>취소</button>
          <button type="submit">{busy ? '저장 중…' : '색상 저장'}</button>
        </div>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </form>}
    <span className={styles.srOnly} role="status">{message}</span>
  </div>;
}
