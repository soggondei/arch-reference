'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { getProcessLibrary, saveProcessLibrary, saveProjectProcess } from '@/lib/store';
import { processRows, type ProcessLibrary, type ProcessRow, type ProcessStep, type ProcessTemplate } from '@/lib/process-template';
import { isCalendarDate } from '@/lib/project-calendar';
import { offsetProcessDate } from '@/lib/schedule-template';
import { directoryGroupFor, projectLifecycleGroup } from '@/lib/workspace-navigation';
import { SCHEDULE_CATEGORY_LABEL, type Reference } from '@/lib/types';
import styles from './ProcessWorkspace.module.css';

type Saved = (project: Reference) => void;

function useProcessLibrary() {
  const [library, setLibrary] = useState<ProcessLibrary | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    getProcessLibrary().then(result => {
      if (current) setLibrary(result);
    }).catch(() => {
      if (current) setLoadError('기본 프로세스를 불러오지 못했습니다.');
    });
    return () => { current = false; };
  }, [attempt]);
  function reload() {
    setLibrary(null); setLoadError(''); setAttempt(value => value + 1);
  }
  return { library, setLibrary, loadError, reload };
}

function Loading({ error, retry }: { error: string; retry: () => void }) {
  return error ? <div className={styles.actions}><p role="alert" className={styles.error}>{error}</p>
    <button type="button" className={styles.quiet} onClick={retry}>다시 불러오기</button></div>
    : <p role="status" className={styles.hint}>기본 프로세스를 불러오는 중…</p>;
}

function newStep(): ProcessStep {
  return { id: crypto.randomUUID(), taskName: '', category: 'design', isMilestone: false, daysBeforeDeadline: 0, durationDays: 1 };
}

function projectProcessChanges(project: Reference, template: ProcessTemplate) {
  const data = project.competitionData!;
  const rows = processRows(data, template, '');
  const changes: string[] = [];
  for (const [index, row] of rows.entries()) {
    const step = template.steps[index];
    const task = data.schedules?.find(item => item.id === row.taskId);
    const draft = data.processDrafts?.find(item => item.templateId === template.id && item.stepId === row.stepId);
    const old = task ?? draft;
    const defaults = task?.processDefaults ?? draft?.defaults;
    if (!old) changes.push('추가 · ' + row.taskName);
    else if (old.taskName !== row.taskName) changes.push('이름 변경 · ' + old.taskName + ' → ' + row.taskName);
    else if (task && !task.processStepId) changes.push('기존 업무 연결 · ' + row.taskName);
    else if (old.category !== row.category || Boolean(old.isMilestone) !== row.isMilestone ||
      defaults?.taskName !== step.taskName || defaults?.category !== step.category || defaults?.isMilestone !== step.isMilestone ||
      draft && (draft.durationDays !== row.durationDays || draft.defaults.durationDays !== step.durationDays)) {
      changes.push('기본값 갱신 · ' + row.taskName);
    }
  }
  if (data.processTemplateId !== template.id) changes.push('템플릿 연결 · ' + template.name);
  const current = new Set(template.steps.map(step => step.id));
  const retired = [
    ...(data.schedules ?? []).filter(task => task.processTemplateId === template.id && task.processStepId && !current.has(task.processStepId)),
    ...(data.processDrafts ?? []).filter(step => step.templateId === template.id && !current.has(step.stepId)),
  ].map(item => item.taskName);
  return { project, rows, changes, retired };
}

function TemplateEditor({ template, onSave, cancel }: {
  template: ProcessTemplate;
  onSave: (template: ProcessTemplate) => Promise<void>;
  cancel: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [steps, setSteps] = useState(template.steps);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function update(id: string, patch: Partial<ProcessStep>) {
    setSteps(current => current.map(step => step.id === id ? { ...step, ...patch } : step));
  }
  function move(index: number, delta: number) {
    setSteps(current => {
      const reordered = current.slice();
      [reordered[index], reordered[index + delta]] = [reordered[index + delta], reordered[index]];
      return reordered;
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || steps.some(step => !step.taskName.trim())) { setError('템플릿명과 단계명을 입력해 주세요.'); return; }
    setBusy(true); setError('');
    try { await onSave({ ...template, name: name.trim(), steps: steps.map(step => ({ ...step, taskName: step.taskName.trim() })) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '템플릿을 저장하지 못했습니다.'); setBusy(false); }
  }
  return <form className={styles.editor} aria-label="프로세스 템플릿 편집" onSubmit={submit}>
    <fieldset disabled={busy}>
      <label className={styles.label}>템플릿명<input autoFocus required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
      <p className={styles.hint}>기준 마감일로부터 각 단계가 며칠 전에 끝나는지 지정하세요. 시작일은 기본 기간을 포함해 계산합니다.</p>
      <ol className={styles.steps}>{steps.map((step, index) => <li key={step.id} className={styles.step}>
        <div className={styles.stepHead}>
          <label className={styles.stepName}><span>{index + 1}단계</span><input aria-label={`${index + 1}단계 이름`} required
            maxLength={180} value={step.taskName} placeholder="단계명" onChange={e => update(step.id, { taskName: e.target.value })} /></label>
          <div className={styles.rowActions}>
            <button type="button" aria-label={`${index + 1}단계 위로`} title="위로" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" aria-label={`${index + 1}단계 아래로`} title="아래로" disabled={index === steps.length - 1} onClick={() => move(index, 1)}>↓</button>
            <button type="button" aria-label={`${index + 1}단계 삭제`} onClick={() => setSteps(current => current.filter(item => item.id !== step.id))}>삭제</button>
          </div>
        </div>
        <div className={styles.stepFields}>
          <label>업무 구분<select value={step.category} onChange={e => update(step.id, { category: e.target.value as ProcessStep['category'] })}>
            <option value="design">설계작업</option><option value="admin">행정</option></select></label>
          <label>마감 며칠 전<input type="number" required min={-36500} max={36500} step={1} aria-label={`${index + 1}단계 마감 며칠 전`}
            value={Number.isNaN(step.daysBeforeDeadline) ? '' : step.daysBeforeDeadline} onChange={e => update(step.id, { daysBeforeDeadline: e.target.valueAsNumber })} /></label>
          <label>기본 기간(일)<input type="number" required min={1} max={36500} step={1} aria-label={`${index + 1}단계 기본 기간`}
            value={Number.isNaN(step.durationDays) ? '' : step.durationDays} onChange={e => update(step.id, { durationDays: e.target.valueAsNumber })} /></label>
          <label className={styles.check}><input type="checkbox" checked={step.isMilestone} onChange={e => update(step.id, { isMilestone: e.target.checked })} />주요 일정</label>
        </div>
      </li>)}</ol>
      <div className={styles.bottom}><button type="button" className={styles.quiet} onClick={() => setSteps(current => [...current, newStep()])}>+ 단계 추가</button>
        <div className={styles.actions}><button type="button" className={styles.quiet} onClick={cancel}>취소</button>
          <button type="submit" className={styles.primary}>{busy ? '저장 중…' : '템플릿 저장'}</button></div>
      </div>
    </fieldset>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </form>;
}

function TemplateManager({ projects, onSaved }: { projects: Reference[]; onSaved: Saved }) {
  const { library, setLibrary, loadError, reload } = useProcessLibrary();
  const [selected, setSelected] = useState('');
  const [edit, setEdit] = useState<ProcessTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (!library) return <Loading error={loadError} retry={reload} />;
  const loaded = library;
  const current = loaded.templates.find(template => template.id === selected) ?? loaded.templates[0];
  const linked = current ? projects.filter(project => {
    const data = project.competitionData;
    return directoryGroupFor(project) === 'active' && data && (data.processTemplateId === current.id ||
      !data.processTemplateId && !data.workspaceKind && current.id === 'competition-design');
  }) : [];
  const previews = linked.map(project => projectProcessChanges(project, current));
  const pending = previews.filter(item => item.changes.length > 0);
  async function save(template: ProcessTemplate) {
    const templates = loaded.templates.some(item => item.id === template.id)
      ? loaded.templates.map(item => item.id === template.id ? template : item) : [...loaded.templates, template];
    const saved = await saveProcessLibrary(loaded.revision, templates);
    setLibrary(saved); setSelected(template.id); setEdit(null); setError(''); setMessage('템플릿을 저장했습니다.');
  }
  async function propagate() {
    if (saving || !current) return;
    setSaving(true); setError(''); setMessage('');
    const failed: string[] = [];
    let savedCount = 0;
    for (const { project, rows } of pending) {
      const data = project.competitionData!;
      try {
        onSaved(await saveProjectProcess(project.id, current, rows, rows, { expectedTemplateId: data.processTemplateId, startProject: false }));
        savedCount++;
      } catch { failed.push(project.title); }
    }
    setSaving(false); setMessage(`${savedCount}개 프로젝트에 적용했습니다.`);
    if (failed.length) setError('다시 적용할 프로젝트 · ' + failed.join(', '));
  }
  return <div className={styles.manager}>
    {edit ? <TemplateEditor key={edit.id} template={edit} onSave={save} cancel={() => { setEdit(null); setMessage(''); setError(''); reload(); }} /> : <>
      <div className={styles.controls}>
        <label className={styles.label}>프로세스 템플릿<select disabled={saving} value={current?.id ?? ''} onChange={e => { setSelected(e.target.value); setMessage(''); setError(''); }}>
          {loaded.templates.map(template => <option value={template.id} key={template.id}>{template.name}</option>)}
        </select></label>
        {current && <button type="button" className={styles.quiet} disabled={saving} onClick={() => { setEdit(current); setMessage(''); setError(''); }}>템플릿 편집</button>}
        <button type="button" className={styles.quiet} disabled={saving} onClick={() => { setEdit({ id: crypto.randomUUID(), name: '', steps: [newStep()] }); setMessage(''); setError(''); }}>새 템플릿</button>
      </div>
      {current && <>
        <div className={styles.preview} aria-label="기본 단계 목록">{current.steps.map((step, index) =>
          <span key={step.id}><small>{index + 1}</small>{step.taskName}</span>)}</div>
        {previews.length > 0 && <details className={styles.changes}><summary>프로젝트별 변경 미리보기 · {pending.length}개 프로젝트</summary>
          {previews.map(({ project, changes, retired }) => <div key={project.id}><strong>{project.title}</strong>
            <ul>{changes.length ? changes.map((change, i) => <li key={i}>{change}</li>) : <li>적용할 변경 없음</li>}
            {retired.map((name, i) => <li key={'r' + i}>템플릿에서 제외 · {name} (기존 기록 유지)</li>)}</ul></div>)}</details>}
        <div className={styles.bottom}><p className={styles.hint}>이 템플릿을 쓰는 진행 프로젝트의 날짜와 업무 기록은 유지됩니다. 새 단계는 날짜 미정으로 추가됩니다.</p>
          <button type="button" className={styles.quiet} disabled={saving || !pending.length} onClick={() => void propagate()}>
            {saving ? '적용 중…' : `진행 프로젝트 ${pending.length}개에 변경 적용`}</button></div>
      </>}
    </>}
    {message && <p role="status" className={styles.success}>{message}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}

export function ProcessTemplateLibrary(props: { projects: Reference[]; onSaved: Saved }) {
  const [panel, setPanel] = useState<'initial' | 'open' | 'closed'>('initial');
  const open = panel === 'open';
  return <section className={styles.library} aria-label="기본 프로세스 관리">
    <div className={styles.heading}><div><h2>기본 프로세스</h2><p className={styles.hint}>프로젝트 유형별 단계와 기본 기간을 관리합니다.</p></div>
      <button type="button" className={styles.quiet} aria-expanded={open} onClick={() => setPanel(open ? 'closed' : 'open')}>{open ? '템플릿 관리 닫기' : '템플릿 관리'}</button>
    </div>
    {panel !== 'initial' && <div hidden={!open}><TemplateManager {...props} /></div>}
  </section>;
}

function endAfter(start: string, duration: number) {
  if (!isCalendarDate(start) || !Number.isSafeInteger(duration) || duration < 1) return '';
  try { return offsetProcessDate(start, duration - 1); } catch { return ''; }
}

function rowDuration(row: ProcessRow, fallback: number) {
  if (row.startDate && row.endDate) {
    return Math.round((Date.parse(row.endDate + 'T00:00:00Z') - Date.parse(row.startDate + 'T00:00:00Z')) / 86400000) + 1;
  }
  return row.durationDays ?? fallback;
}

function ProjectDates({ project, template, changeDirty, onSaved, cancel, onRefresh }: {
  project: Reference; template: ProcessTemplate; changeDirty: (dirty: boolean) => void;
  onSaved: Saved; cancel: () => void; onRefresh: () => void;
}) {
  const [baseline] = useState(() => ({ data: project.competitionData!, template, rows: processRows(project.competitionData!, template) }));
  const [rows, setRows] = useState(baseline.rows);
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const startsProject = projectLifecycleGroup(baseline.data) === 'candidate';
  function changed() {
    setDirty(true); changeDirty(true); setError(''); setMessage('');
  }
  function update(stepId: string, patch: Partial<ProcessRow>) {
    changed();
    setRows(current => current.map(row => row.stepId === stepId ? { ...row, ...patch } : row));
  }
  function suggest() {
    if (!isCalendarDate(deadline)) { setError('날짜를 제안하려면 기준 마감일을 입력해 주세요.'); return; }
    let count = 0;
    let suggested: ProcessRow[];
    try { suggested = rows.map(row => {
      if (row.startDate || row.taskId) return row;
      const step = baseline.template.steps.find(item => item.id === row.stepId)!;
      const days = row.durationDays ?? step.durationDays;
      const endDate = offsetProcessDate(deadline, -step.daysBeforeDeadline);
      const startDate = offsetProcessDate(endDate, 1 - days);
      count++;
      return { ...row, startDate, endDate, durationDays: days };
    }); } catch (cause) { setError(cause instanceof Error ? cause.message : '기준 마감일과 기간을 확인해 주세요.'); return; }
    if (count) { changed(); setRows(suggested); }
    setMessage(count ? `${count}개 단계의 날짜를 채웠습니다.` : '날짜를 채울 단계가 없습니다.');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = rows.find(row => !row.taskName.trim() || (row.startDate && !isCalendarDate(row.endDate)) || (row.taskId && !row.startDate));
    if (invalid) { setError((invalid.taskName || '단계') + '의 이름, 시작일과 기간을 확인해 주세요.'); return; }
    setBusy(true); changeDirty(true); setError('');
    try {
      const result = await saveProjectProcess(project.id, baseline.template, rows.map(row => ({ ...row, taskName: row.taskName.trim() })), baseline.rows, {
        expectedTemplateId: baseline.data.processTemplateId, startProject: startsProject,
      });
      changeDirty(false); onSaved(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '진행 설정을 저장하지 못했습니다.');
      setBusy(false); changeDirty(dirty);
    }
  }
  return <form aria-label="단계별 일정 설정" onSubmit={submit} className={styles.editor}>
    <fieldset disabled={busy}>
      <div className={styles.anchor}>
        <label className={styles.label}>기준 마감일<input type="date" value={deadline} onChange={e => { setDeadline(e.target.value); setError(''); }} /></label>
        <button type="button" className={styles.quiet} onClick={suggest}>미정 단계 날짜 채우기</button>
      </div>
      <p className={styles.hint}>시작일과 기간으로 종료일을 계산합니다. 시작일을 비워 두면 날짜를 나중에 정할 수 있습니다.</p>
      <ol className={styles.dates}>{rows.map((row, index) => {
        const step = baseline.template.steps.find(item => item.id === row.stepId);
        const days = rowDuration(row, step?.durationDays ?? 1);
        return <li className={styles.dateRow} key={row.stepId}>
          <label className={styles.stage}><span>{index + 1}단계 · {SCHEDULE_CATEGORY_LABEL[row.category]}{row.isMilestone && ' · 주요 일정'}</span>
            <input aria-label={`${index + 1}단계 이름`} required maxLength={180} value={row.taskName}
              onChange={e => update(row.stepId, { taskName: e.target.value })} /></label>
          <div className={styles.dateFields}><label>시작일<input type="date" aria-label={row.taskName + ' 시작일'} required={Boolean(row.taskId)}
            value={row.startDate} onChange={e => update(row.stepId, { startDate: e.target.value, durationDays: days, endDate: endAfter(e.target.value, days) })} /></label>
          <label>기간(일)<input type="number" aria-label={row.taskName + ' 기간'} required min={1} max={36500} step={1}
            value={Number.isNaN(days) ? '' : days} onChange={e => update(row.stepId, { durationDays: e.target.valueAsNumber, endDate: endAfter(row.startDate, e.target.valueAsNumber) })} /></label>
          <span className={styles.endDate}>종료일<strong>{row.endDate || '미정'}</strong></span></div>
        </li>;
      })}</ol>
      {!rows.length && <p className={styles.hint}>등록된 단계가 없습니다. 프로젝트 관리의 템플릿 관리에서 단계를 추가할 수 있습니다.</p>}
      <div className={styles.actions}>
        {dirty && <button type="button" className={styles.quiet} onClick={cancel}>변경 취소</button>}
        <button type="submit" className={styles.primary}>{busy ? '저장 중…' : startsProject ? '프로젝트 진행 시작' : '진행 설정 저장'}</button>
      </div>
    </fieldset>
    {message && <p role="status" className={styles.success}>{message}</p>}
    {error && <div className={styles.actions}><p role="alert" className={styles.error}>{error}</p>
      <button type="button" className={styles.quiet} onClick={onRefresh}>최신 설정 다시 불러오기</button></div>}
  </form>;
}

export function ProjectProcessSetup({ project, onSaved }: { project: Reference; onSaved: Saved }) {
  const { library, loadError, reload } = useProcessLibrary();
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState('');
  const data = project.competitionData!;
  const id = selected ?? data.processTemplateId ?? (data.workspaceKind ? '' : 'competition-design');
  const template = library?.templates.find(item => item.id === id);
  const group = directoryGroupFor(project);
  const archived = group === 'completed' || group === 'dropped';
  function reset() { setDirty(false); setVersion(value => value + 1); setNotice(''); }
  return <section aria-label="프로젝트 진행 설정" className={styles.setup}>
    <div className={styles.heading}><div><h2>프로젝트 진행 설정</h2>
      <p className={styles.hint}>{archived ? (group === 'dropped' ? '드롭된 프로젝트입니다.' : '완료된 프로젝트입니다.') : '프로젝트에 사용할 프로세스를 선택하고 단계별 일정을 정하세요.'}</p></div></div>
    {!archived && (!library ? <Loading error={loadError} retry={reload} /> : <>
      <label className={styles.label}>적용할 템플릿<select disabled={dirty} value={id} onChange={e => { setSelected(e.target.value); reset(); }}>
        <option value="" disabled>템플릿 선택</option>
        {library.templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      {template && <ProjectDates key={template.id + '/' + version} project={project} template={template} changeDirty={setDirty}
        onSaved={saved => { onSaved(saved); setDirty(false); setVersion(value => value + 1); setNotice('프로젝트 진행 설정을 저장했습니다.'); }}
        cancel={reset} onRefresh={() => window.location.reload()} />}
      {notice && <p role="status" className={styles.success}>{notice}</p>}
    </>)}
  </section>;
}
