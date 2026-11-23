'use client';

import Link from 'next/link';
import { AttendanceQuickAction } from './AttendanceWorkspace';
import TaskJournal from './TaskJournal';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { isDroppedCompetition, SCHEDULE_CATEGORY_LABEL, SCHEDULE_STATUS_LABEL } from '@/lib/types';
import type { OfficeSchedulePatch, ProjectActivityChange, Reference, ScheduleCategory, ScheduleItem, ScheduleStatus, TaskDates } from '@/lib/types';
import ProjectCalendar from './ProjectCalendar';
import { isCalendarDate, isOfficialCalendarTask, type CalendarView } from '@/lib/project-calendar';
import ProjectWeeklyReport from './ProjectWeeklyReport';
import ProjectPlanning from './ProjectPlanning';
import { useProjectSharedLogs } from '@/lib/project-shared-work';
import ReferenceConnections from './ReferenceConnections';
import { calendarHref, isWorkspaceProject, projectHref, type ProjectSection } from '@/lib/workspace-navigation';
import { weekBounds } from '@/lib/weekly-report';
import styles from './OfficeWorkspace.module.css';

export type OfficeView = 'office' | 'projects' | 'tasks';

interface WorkspaceProps {
  view: OfficeView;
  refs: Reference[];
  routeProject?: string;
  routeTask?: string;
  section?: ProjectSection;
  calendarView?: CalendarView;
  calendarDate?: string;
  calendarTaskProject?: string;
  onActivity: (projectId: string, change: ProjectActivityChange) => Promise<void>;
  onUpdateTask: (refId: string, taskId: string, patch: OfficeSchedulePatch, previousDates?: TaskDates) => Promise<void>;
  onCreateProject: (name: string, pm: string, id: string) => Promise<string>;
  onCreateTask: (projectId: string | null, task: ScheduleItem) => Promise<string>;
}

type TaskRow = { project: Reference; task: ScheduleItem };
type Queue = 'all' | 'week' | 'overdue' | 'review' | 'waiting';
type Ownership = 'mine' | 'unassigned' | 'all';
const queueLabels: Record<Queue, string> = {
  all: '전체 일정', week: '이번 주 마감', overdue: '기한 경과', review: '검토 대기', waiting: '답변 대기',
};
const headings: Record<OfficeView, string> = { office: '사무소 홈', projects: '프로젝트', tasks: '내 업무' };
const memberKey = 'lv-lab:workspace-member';
let memoryMember = '';

function readMember() {
  try { return localStorage.getItem(memberKey) ?? memoryMember; } catch { return memoryMember; }
}

function subscribeMember(notify: () => void) {
  window.addEventListener('storage', notify);
  window.addEventListener(memberKey, notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener(memberKey, notify);
  };
}

function saveMember(value: string) {
  memoryMember = value;
  try { localStorage.setItem(memberKey, value); } catch { /* The name remains available for this session. */ }
  window.dispatchEvent(new Event(memberKey));
}

const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
const dayLabel = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
});

function openTask(task: ScheduleItem) {
  return task.status !== 'done' && task.status !== 'cancelled';
}

function overdue(task: ScheduleItem, today: string, time: string) {
  return openTask(task) && (task.endDate < today ||
    (task.endDate === today && Boolean(task.endTime && task.endTime < time)));
}

function activeProject(project: Reference) {
  if (project.competitionData?.planning?.archived) return false;
  return Boolean(project.competitionData?.workspaceKind) ||
    (!isDroppedCompetition(project.competitionData) && !['탈락', '입선'].includes(project.competitionData?.status ?? ''));
}

function projectKind(project: Reference) {
  const data = project.competitionData!;
  if (data.workspaceKind === 'office') return '공통 업무';
  if (data.workspaceKind === 'project') return data.planning?.archived ? '종료 프로젝트' : '사무소 프로젝트';
  return data.status;
}

function dueLabel(task: ScheduleItem) {
  return [task.endDate, task.endTime].filter(Boolean).join(' ');
}

function TaskEditor({ row, member, update, close, onSaved }: {
  row: TaskRow; member: string; update: WorkspaceProps['onUpdateTask']; close: () => void; onSaved: (newDate?: string) => void;
}) {
  const [{ task, project }] = useState(row);
  const officialDate = isOfficialCalendarTask(project, task);
  const [startDate, setStartDate] = useState(task.startDate ?? '');
  const [endDate, setEndDate] = useState(task.endDate);
  const [endTime, setEndTime] = useState(task.endTime ?? '');
  const [status, setStatus] = useState(task.status);
  const [assignee, setAssignee] = useState(task.assignee ?? '');
  const [review, setReview] = useState(Boolean(task.reviewRequested));
  const [waiting, setWaiting] = useState(task.waitingFor ?? '');
  const [nextAction, setNextAction] = useState(task.nextAction ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closed = status === 'done' || status === 'cancelled';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const patch: OfficeSchedulePatch = {};
    if (!officialDate) {
      if (startDate !== (task.startDate ?? '')) patch.startDate = startDate || undefined;
      if (endDate !== task.endDate) patch.endDate = endDate;
      if (endTime !== (task.endTime ?? '')) patch.endTime = endTime || undefined;
    }
    if (status !== task.status) patch.status = status;
    if (assignee.trim() !== (task.assignee ?? '')) patch.assignee = assignee.trim();
    if (waiting.trim() !== (task.waitingFor ?? '')) patch.waitingFor = waiting.trim();
    if (nextAction.trim() !== (task.nextAction ?? '')) patch.nextAction = nextAction.trim();
    if ((!closed && review) !== Boolean(task.reviewRequested)) patch.reviewRequested = !closed && review;
    if (!Object.keys(patch).length) { close(); return; }
    setSaving(true);
    setError('');
    try {
      await update(project.id, task.id, patch, task);
      onSaved(patch.endDate);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '업무를 저장하지 못했습니다. 다시 시도해 주세요.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.editor} aria-label={task.taskName + ' 편집'}>
      <fieldset disabled={saving}>
        {officialDate ? <p className={styles.officialDate}>공식 일정 · {dueLabel(task)} <Link href={'/reference/' + encodeURIComponent(project.id)}>공모 상세에서 날짜 수정</Link></p> : <>
          <label>시작일<input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} /></label>
          <label>마감일<input type="date" required min={startDate || undefined} value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
          <label>마감 시각<input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></label>
        </>}
        <label>담당자
          <input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="미배정" list="lv-members" maxLength={80} />
        </label>
        {member && member !== assignee && <button className={styles.secondary} type="button" onClick={() => setAssignee(member)}>내게 배정</button>}
        <label>진행 상태
          <select value={status} onChange={e => setStatus(e.target.value as ScheduleStatus)}>
            {Object.entries(SCHEDULE_STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className={styles.check}><input type="checkbox" checked={!closed && review} disabled={closed} onChange={e => setReview(e.target.checked)} />검토 요청</label>
        <label>기다리는 답변<input value={waiting} onChange={e => setWaiting(e.target.value)} maxLength={300} placeholder="예: 구조팀 단면 검토 회신" /></label>
        <label>다음 행동<input value={nextAction} onChange={e => setNextAction(e.target.value)} maxLength={300} placeholder="예: 단면 수정본 전달" /></label>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={close}>취소</button>
          <button className={styles.primary} type="submit">{saving ? '저장 중…' : '저장'}</button>
        </div>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </form>
  );
}

function JournalWithSharedTime(props: React.ComponentProps<typeof TaskJournal>) {
  const shared = useProjectSharedLogs(props.project.id);
  return <>
    {shared.loading && <p className={styles.notice} role="status">공유 업무시간을 불러오는 중입니다.</p>}
    {shared.error && <p className={styles.error} role="alert">개인 근태에서 공유한 시간이 누계에서 빠져 있습니다. <button type="button" onClick={shared.retry}>다시 불러오기</button></p>}
    <TaskJournal {...props} sharedLogs={shared.logs} />
  </>;
}

function CalendarTaskDetail({ row, member, today, update, onActivity, onOpenTask, close, onSaved }: {
  row: TaskRow; member: string; today: string; update: WorkspaceProps['onUpdateTask']; onActivity: WorkspaceProps['onActivity'];
  onOpenTask: (projectId: string, taskId: string) => void; close: () => void; onSaved: (newDate?: string) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section className={styles.calendarDetail} aria-label="선택한 업무">
    <div className={styles.detailHeading}>
      <div><small>{row.project.title}</small><h3 ref={heading} tabIndex={-1}>{row.task.taskName}</h3></div>
      <button type="button" className={styles.secondary} onClick={close}>업무 닫기</button>
    </div>
    <TaskEditor row={row} member={member} update={update} close={close} onSaved={onSaved} />
    <JournalWithSharedTime project={row.project} task={row.task} today={today} member={member} onActivity={onActivity} onOpenTask={onOpenTask} />
  </section>;
}

function ProjectWorkView({ project, relatedProjects, section, today, onActivity, onOpenTask }: {
  project: Reference; relatedProjects: Reference[]; section: 'report' | 'planning'; today: string;
  onActivity: WorkspaceProps['onActivity']; onOpenTask: (id: string) => void;
}) {
  const shared = useProjectSharedLogs(project.id);
  if (section === 'planning') return <ProjectPlanning project={project} today={today} shared={shared} onActivity={onActivity} relatedProjects={relatedProjects} />;
  return <ProjectWeeklyReport project={project} today={today} onOpenTask={onOpenTask} shared={shared} />;
}

function TaskList({ rows, today, time, member, update, notify, onActivity, onOpenTask, initialTaskId }: {
  rows: TaskRow[]; today: string; time: string; member: string; update: WorkspaceProps['onUpdateTask']; notify: (message: string) => void;
  onActivity: WorkspaceProps['onActivity']; onOpenTask: (projectId: string, taskId: string) => void; initialTaskId?: string;
}) {
  const initialIndex = initialTaskId ? rows.findIndex(row => row.task.id === initialTaskId) : -1;
  const [editing, setEditing] = useState<TaskRow | null>(() => rows[initialIndex] ?? null);
  const [limit, setLimit] = useState(() => Math.max(30, initialIndex + 1));
  const initialRow = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    initialRow.current?.scrollIntoView?.({ block: 'center' });
    initialRow.current?.focus({ preventScroll: true });
  }, [initialTaskId]);
  if (!rows.length) return <p className={styles.empty}>표시할 일정이 없습니다.</p>;
  return (
    <div className={styles.list}>
      <div className={styles.tableHead} aria-hidden="true"><span>업무 / 프로젝트</span><span>마감</span><span>담당자</span><span>진행 상태</span></div>
      <ul>
        {rows.slice(0, limit).map(row => {
          const { task, project } = row;
          const isEditing = editing?.task.id === task.id && editing.project.id === project.id;
          const dropped = isDroppedCompetition(project.competitionData);
          const isActive = activeProject(project);
          const isLate = isActive && overdue(task, today, time);
          return (
            <li key={project.id + '/' + task.id}>
              <button type="button" className={styles.taskRow} aria-label={task.taskName + ' 편집, ' + project.title}
                ref={task.id === initialTaskId ? initialRow : undefined}
                aria-expanded={isEditing} onClick={() => setEditing(isEditing ? null : row)}>
                <span className={styles.taskName}>
                  <strong>{task.taskName}</strong>
                  <small>{project.title}{dropped && ' · 드롭'} · {SCHEDULE_CATEGORY_LABEL[task.category]} · 일지·피드백</small>
                </span>
                <span className={styles.deadline} data-late={isLate}>
                  {task.startDate && task.startDate !== task.endDate && <small>{task.startDate} ~ </small>}
                  {dueLabel(task)}{isLate && <small>기한 경과</small>}
                </span>
                <span className={styles.owner}>{task.assignee || '미배정'}</span>
                <span className={styles.statuses}>
                  <span className={styles.badge} data-status={task.status}>{SCHEDULE_STATUS_LABEL[task.status]}</span>
                  {isActive && task.reviewRequested && openTask(task) && <span className={styles.review}>검토 대기</span>}
                  {isActive && task.waitingFor && openTask(task) && <span className={styles.review}>답변 대기</span>}
                </span>
              </button>
              {isEditing && <>
                <TaskEditor row={editing} member={member} update={update} close={() => setEditing(null)}
                  onSaved={() => { setEditing(null); notify('업무를 저장했습니다.'); }} />
                <JournalWithSharedTime project={project} task={task} today={today} member={member} onActivity={onActivity} onOpenTask={onOpenTask} />
              </>}
            </li>
          );
        })}
      </ul>
      {rows.length > limit && <button className={styles.more} onClick={() => setLimit(n => n + 30)}>일정 더 보기 ({rows.length - limit}건 남음)</button>}
    </div>
  );
}

function CreateForm({ type, projects, defaultProject, defaultDate, member, createProject, createTask, onCreated, close }: {
  type: 'project' | 'task'; projects: Reference[]; defaultProject: string; defaultDate?: string; member: string;
  createProject: WorkspaceProps['onCreateProject']; createTask: WorkspaceProps['onCreateTask'];
  onCreated: (projectId: string | null, endDate?: string) => void; close: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(defaultDate ?? '');
  const [recordId] = useState(() => crypto.randomUUID());
  const isProject = type === 'project';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    if (!name) { setError('이름을 입력해 주세요.'); return; }
    setError(''); setSaving(true);
    try {
      if (isProject) {
        onCreated(await createProject(name, String(data.get('pm') ?? '').trim(), recordId));
      } else {
        const projectId = String(data.get('project') ?? '') || null;
        const task: ScheduleItem = {
          id: recordId, taskName: name, startDate: startDate || undefined, endDate, status: 'planned',
          endTime: String(data.get('endTime') ?? '') || undefined,
          category: data.get('category') as ScheduleCategory,
          assignee: String(data.get('assignee') ?? '').trim() || undefined,
        };
        const savedProjectId = await createTask(projectId, task);
        onCreated(savedProjectId, endDate);
      }
    } catch {
      setError('저장하지 못했습니다. 다시 시도해 주세요.');
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className={styles.create} aria-label={isProject ? '새 프로젝트' : '새 업무'}>
      <h2>{isProject ? '새 프로젝트' : '새 업무'}</h2>
      <fieldset disabled={saving}>
        <label>{isProject ? '프로젝트명' : '업무명'}<input name="name" maxLength={180} required autoFocus /></label>
        {isProject ? <label>PM <input name="pm" placeholder="선택" list="lv-members" maxLength={80} /></label> : <>
          <label>소속<select name="project" defaultValue={defaultProject}>
            <option value="">사무소 공통</option>
            {projects.filter(p => p.competitionData?.workspaceKind !== 'office').map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select></label>
          <label>시작일<input name="startDate" type="date" value={startDate} max={endDate || undefined} onChange={e => setStartDate(e.target.value)} /></label>
          <label>마감일<input name="date" type="date" required value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)} /></label>
          <label>마감 시각<input name="endTime" type="time" /></label>
          <label>구분<select name="category" defaultValue="design">
            {Object.entries(SCHEDULE_CATEGORY_LABEL).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          </select></label>
          <label>담당자<input name="assignee" defaultValue={member} placeholder="미배정" list="lv-members" maxLength={80} /></label>
        </>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={close}>취소</button>
          <button type="submit" className={styles.primary}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </form>
  );
}

export default function OfficeWorkspace({ view, refs, routeProject, routeTask, section = 'calendar', calendarView = 'month', calendarDate,
  calendarTaskProject, onActivity, onUpdateTask, onCreateProject, onCreateTask }: WorkspaceProps) {
  const member = useSyncExternalStore(subscribeMember, readMember, () => '');
  const [clock, setClock] = useState(() => new Date());
  const today = dateFormatter.format(clock);
  const selectedDate = calendarDate && isCalendarDate(calendarDate) ? calendarDate : today;
  const time = timeFormatter.format(clock);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [projectId, setProjectId] = useState<string | null>('');
  const [scope, setScope] = useState('active');
  const [homeQueue, setHomeQueue] = useState<Queue>('week');
  const [ownership, setOwnership] = useState<Ownership | null>(null);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState<{ view: OfficeView; type: 'task' | 'project'; date?: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [monday, sunday] = weekBounds(today);
  const projects = useMemo(() => refs.filter(isWorkspaceProject).sort((a, b) => {
    const rank = (p: Reference) => activeProject(p) ? (p.competitionData?.status === '작업중' ? 0 : 1) : 2;
    return rank(a) - rank(b) || a.title.localeCompare(b.title, 'ko');
  }), [refs]);
  const rows = useMemo(() => projects.flatMap(project =>
    (project.competitionData?.schedules ?? []).map(task => ({ project, task }))
  ).sort((a, b) => a.task.endDate.localeCompare(b.task.endDate) || (a.task.endTime ?? '').localeCompare(b.task.endTime ?? '')
    || a.task.taskName.localeCompare(b.task.taskName, 'ko')), [projects]);
  const names = [...new Set([member, ...rows.map(row => row.task.assignee), ...projects.map(p => p.competitionData?.pm)].filter(Boolean))] as string[];
  const selectedId = routeProject ?? projectId;
  const isCalendar = view === 'projects' && section === 'calendar';
  const portfolio = isCalendar && !routeProject;
  const currentProject = portfolio ? undefined : projects.find(p => selectedId === null ? p.competitionData?.workspaceKind === 'office' : p.id === selectedId)
    ?? (routeProject ? undefined : projects[0]);
  const calendarProjects = useMemo(() => portfolio ? projects.filter(activeProject) : currentProject ? [currentProject] : [], [projects, portfolio, currentProject]);
  const calendarRow = isCalendar && routeTask ? rows.find(({ project, task }) => task.id === routeTask &&
    project.id === (routeProject ?? calendarTaskProject) && calendarProjects.some(p => p.id === project.id)) : undefined;
  const ownershipFilter = ownership ?? (member ? 'mine' : 'unassigned');
  const projectRows = rows.filter(row => row.project.id === currentProject?.id);
  const nextTask = projectRows.find(({ task }) => openTask(task) && !overdue(task, today, time))?.task;
  const scoped = rows.filter(row => scope === 'all' || (scope === 'active' ? activeProject(row.project) : row.project.id === scope));
  const pending = scoped.filter(({ project, task }) => activeProject(project) && openTask(task));
  const byQueue: Record<Queue, TaskRow[]> = {
    all: scoped,
    week: pending.filter(({ task }) => task.endDate >= monday && task.endDate <= sunday),
    overdue: pending.filter(({ task }) => overdue(task, today, time)),
    review: pending.filter(({ task }) => task.reviewRequested),
    waiting: pending.filter(({ task }) => task.waitingFor?.trim()),
  };
  const owned = scoped.filter(({ task }) => ownershipFilter === 'all' ||
    (ownershipFilter === 'mine' ? Boolean(member) && task.assignee === member : !task.assignee));
  const visible = view === 'projects' ? projectRows : view === 'tasks' ? owned : byQueue[homeQueue];
  const needle = filter.trim().toLocaleLowerCase('ko');
  const results = visible.filter(({ task, project }) =>
    [task.taskName, task.assignee ?? '', project.title].some(value => value.toLocaleLowerCase('ko').includes(needle)));
  const newTaskProject = view === 'projects' ? currentProject : projects.find(p => p.id === scope);
  const formType = form?.view === view ? form.type : null;
  const title = view === 'projects' ? '프로젝트 일정' : view === 'office' ? queueLabels[homeQueue] : '업무 목록';
  function openForm(type: 'task' | 'project', date?: string) { setNotice(''); setForm({ view, type, date }); }
  function goCalendar(id: string | undefined, period: CalendarView, day: string, task?: { projectId: string; taskId: string }) {
    setFilter(''); setForm(null); setNotice('');
    const href = calendarHref(id, period, day, task);
    if (href !== window.location.pathname + window.location.search) window.history.pushState(null, '', href);
  }
  function openCalendarTask(id: string, taskId: string) {
    goCalendar(routeProject, calendarView, selectedDate, { projectId: id, taskId });
  }
  function navigateProject(id: string, nextSection: ProjectSection, taskId?: string) {
    if (nextSection === 'calendar') { goCalendar(id, calendarView, selectedDate); return; }
    setFilter(''); setProjectId(id); setForm(null);
    window.history.pushState(null, '', projectHref(id, nextSection, taskId));
  }

  return (
    <main className={styles.workspace}>
      <div className={styles.top}>
        <div><p className={styles.date}>{dayLabel.format(new Date(today + 'T00:00:00Z'))}</p><h1>{headings[view]}</h1></div>
        <div className={styles.actions}>
          {view === 'projects' && <button className={styles.secondary} onClick={() => openForm('project')}>+ 프로젝트 추가</button>}
          <button className={styles.primary} onClick={() => openForm('task', isCalendar ? selectedDate : undefined)}>+ 업무 추가</button>
        </div>
      </div>
      {view === 'office' && <AttendanceQuickAction />}
      {formType && <CreateForm key={[view, formType, form?.date, newTaskProject?.id].join('/')} type={formType} projects={projects} defaultDate={form?.date}
        defaultProject={newTaskProject?.competitionData?.workspaceKind === 'office' ? '' : newTaskProject?.id ?? ''}
        member={view === 'tasks' ? member : ''} createProject={onCreateProject} createTask={onCreateTask} close={() => setForm(null)}
        onCreated={(id, endDate) => {
          setProjectId(id);
          if (view === 'projects') {
            if (id && isCalendar) {
              const savedProject = projects.find(p => p.id === id);
              const stayInPortfolio = portfolio && formType === 'task' && (!savedProject || activeProject(savedProject));
              goCalendar(stayInPortfolio ? undefined : id, calendarView, endDate ?? selectedDate);
            } else if (id) navigateProject(id, 'schedule');
            else window.history.pushState(null, '', '/?tab=projects');
          }
          setForm(null); setFilter(''); setScope(id ?? 'all'); setHomeQueue('all'); setOwnership('all');
          setNotice(formType === 'project' ? '프로젝트를 추가했습니다.' : '업무를 추가했습니다.');
        }} />}
      {view === 'tasks' && <form className={styles.identity} key={member} onSubmit={event => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get('member') ?? '').trim();
        saveMember(name); setOwnership(name ? 'mine' : 'unassigned'); setNotice('담당자 보기를 변경했습니다.');
      }}>
        <label>이 기기의 담당자<input name="member" list="lv-members" defaultValue={member} maxLength={80} placeholder="이름 입력" /></label>
        <button className={styles.secondary} type="submit">적용</button>
      </form>}
      <datalist id="lv-members">{names.map(name => <option key={name} value={name} />)}</datalist>
      {view !== 'projects' && <div className={styles.scope}>
        <label>프로젝트 <select aria-label="프로젝트 범위" value={scope} onChange={e => setScope(e.target.value)}>
          <option value="active">진행 프로젝트와 사무소 공통</option>
          <option value="all">모든 프로젝트와 사무소 공통</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select></label>
      </div>}
      {view === 'office' && <div className={styles.cards}>
        {(['week', 'overdue', 'review', 'waiting', 'all'] as Queue[]).map(key => <button type="button" key={key} aria-pressed={homeQueue === key}
          className={styles.card} onClick={() => { setHomeQueue(key); setFilter(''); }}>
          <span>{queueLabels[key]}</span><strong>{byQueue[key].length}<small>건</small></strong>
          {key === 'week' && <small>{monday.slice(5).replace('-', '.')} – {sunday.slice(5).replace('-', '.')}</small>}
        </button>)}
      </div>}
      {view === 'tasks' && <div className={styles.ownerTabs} role="group" aria-label="담당 구분">
        {(['mine', 'unassigned', 'all'] as Ownership[]).map(mode => <button type="button" key={mode}
          aria-pressed={ownershipFilter === mode} disabled={mode === 'mine' && !member} onClick={() => { setOwnership(mode); setFilter(''); }}>
          {{ mine: '내 담당', unassigned: '미배정', all: '전체' }[mode]}
        </button>)}
      </div>}
      <div className={view === 'projects' ? styles.projectLayout : undefined}>
        {view === 'projects' && <aside className={styles.projectPicker} aria-label="프로젝트 선택">
          <h2>프로젝트 목록 <small>{projects.length}</small></h2>
          <select aria-label="프로젝트 선택" value={currentProject?.id ?? ''} onChange={e => e.target.value ? navigateProject(e.target.value, section) : goCalendar(undefined, calendarView, selectedDate)}>
            <option value="">진행 프로젝트 전체</option>
            {projects.map(p => <option value={p.id} key={p.id}>{p.title}</option>)}
          </select>
          <div className={styles.projectButtons}>
            <button type="button" aria-pressed={portfolio} onClick={() => goCalendar(undefined, calendarView, selectedDate)}><strong>진행 프로젝트 전체</strong></button>
            {projects.map(p => <button type="button" key={p.id}
            aria-pressed={currentProject?.id === p.id} onClick={() => navigateProject(p.id, section)}>
            <span>{projectKind(p)}</span><strong>{p.title}</strong>
          </button>)}</div>
        </aside>}
        <section className={styles.agenda}>
          {portfolio && <div className={styles.projectInfo}><h2>진행 프로젝트 전체</h2><p>진행 중인 프로젝트와 사무소 공통 업무</p></div>}
          {view === 'projects' && currentProject && <div className={styles.projectInfo}>
            <p>{projectKind(currentProject)}{currentProject.competitionData?.pm && ' · PM ' + currentProject.competitionData.pm}</p>
            <h2>{currentProject.title}</h2>
            {activeProject(currentProject) && <p className={styles.next}>다음 마감 <strong>{nextTask ? nextTask.taskName + ' · ' + dueLabel(nextTask) : '예정 없음'}</strong></p>}
            {!currentProject.competitionData?.workspaceKind && <Link href={'/reference/' + encodeURIComponent(currentProject.id)}>공모 상세 보기 →</Link>}
          </div>}
          {view === 'projects' && currentProject && <nav className={styles.projectSections} aria-label="프로젝트 상세 메뉴">
            {([['calendar','캘린더'], ['schedule','업무 일정'], ['report','주간 리포트'], ['planning','계획·회고'], ['references','레퍼런스']] as const).filter(([key]) => key !== 'planning' || currentProject.competitionData?.workspaceKind !== 'office').map(([key, label]) =>
              <Link key={key} href={projectHref(currentProject.id, key)} scroll={false} aria-current={section === key ? 'page' : undefined}>{label}</Link>
            )}
          </nav>}
          {isCalendar ? <>{!portfolio && !currentProject ? <p className={styles.empty}>프로젝트를 찾을 수 없습니다. 목록에서 프로젝트를 선택해 주세요.</p> :
            <ProjectCalendar projects={calendarProjects} portfolio={portfolio} today={today} view={calendarView} date={selectedDate}
              onNavigate={(period, day) => goCalendar(routeProject, period, day)} onOpenTask={openCalendarTask} onCreateTask={day => openForm('task', day)} />}
            {calendarRow && <CalendarTaskDetail key={calendarRow.project.id + '/' + calendarRow.task.id} row={calendarRow} member={member} today={today}
              update={onUpdateTask} onActivity={onActivity} onOpenTask={openCalendarTask} close={() => goCalendar(routeProject, calendarView, selectedDate)}
              onSaved={day => { goCalendar(routeProject, calendarView, day ?? selectedDate); setNotice('업무를 저장했습니다.'); }} />}</>
            : view === 'projects' && currentProject && (section === 'report' || section === 'planning')
            ? <ProjectWorkView key={currentProject.id} project={currentProject} relatedProjects={projects} section={section} today={today} onActivity={onActivity}
                onOpenTask={taskId => navigateProject(currentProject.id, 'schedule', taskId)} />
            : view === 'projects' && currentProject && section === 'references'
              ? <ReferenceConnections key={currentProject.id} context="project" anchor={currentProject} refs={refs} onActivity={onActivity} />
              : <><div className={styles.listTitle}>
            <h2>{title} <small>{results.length}</small></h2>
            <input aria-label="일정 검색" type="search" placeholder="업무·프로젝트·담당자 검색" value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <TaskList key={[view, scope, view === 'projects' ? currentProject?.id : '', view === 'office' ? homeQueue : '', ownershipFilter, filter, routeTask].join('/')}
            rows={results} today={today} time={time} member={member} update={onUpdateTask} notify={setNotice}
            onActivity={onActivity} initialTaskId={view === 'projects' && currentProject?.id === routeProject ? routeTask : undefined}
            onOpenTask={(id, taskId) => navigateProject(id, 'schedule', taskId)} /></>}
        </section>
      </div>
      <p role="status" className={styles.notice}>{notice}</p>
    </main>
  );
}
