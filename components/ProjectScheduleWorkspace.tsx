'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  buildCalendarEvents, calendarBounds, eventsInRange, isCalendarDate, nearestCalendarDate, shiftCalendar,
  type CalendarEvent, type CalendarView,
} from '@/lib/project-calendar';
import { projectColor, projectColorName } from '@/lib/project-color';
import { SCHEDULE_CATEGORY_LABEL, SCHEDULE_STATUS_LABEL, type Reference, type ScheduleStatus } from '@/lib/types';
import { calendarHref, isActiveWorkspaceProject } from '@/lib/workspace-navigation';
import ProjectCalendar from './ProjectCalendar';
import styles from './ProjectScheduleWorkspace.module.css';

type Layout = 'calendar' | 'list';
type StatusFilter = 'all' | 'official' | ScheduleStatus;
type ScopeProps = {
  projects: Reference[];
  view: CalendarView;
  date: string;
  today: string;
  onNavigate: (view: CalendarView, date: string) => void;
  onOpenTask: (projectId: string, taskId: string) => void;
  onCreateTask: (date: string) => void;
};
interface Props extends ScopeProps {
  scope: string;
  layout: Layout;
  onScopeChange: (scope: string) => void;
  onLayoutChange: (layout: Layout) => void;
}

const periods: Record<CalendarView, string> = { day: '일간', week: '주간', month: '월간', year: '연간' };
const statuses: Record<StatusFilter, string> = { all: '전체 상태', ...SCHEDULE_STATUS_LABEL, official: '공모 공식 일정' };
const longDay = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

function periodLabel(view: CalendarView, date: string, start: string, end: string) {
  if (view === 'day') return longDay.format(new Date(date + 'T00:00:00Z'));
  if (view === 'week') return start.replaceAll('-', '.') + ' – ' + end.replaceAll('-', '.');
  if (view === 'month') return date.slice(0, 4) + '년 ' + Number(date.slice(5, 7)) + '월';
  return date.slice(0, 4) + '년';
}

function projectOption(project: Reference) {
  const data = project.competitionData;
  const state = data?.workspaceKind ? (data.planning?.archived ? '종료' : undefined) : data?.status;
  return [project.title, state, projectColorName(project)].filter(Boolean).join(' · ');
}

function Row({ event, color, onOpenTask }: {
  event: CalendarEvent; color: string; onOpenTask: ScopeProps['onOpenTask'];
}) {
  const status = event.status ? SCHEDULE_STATUS_LABEL[event.status] : '공식 일정';
  const range = event.start === event.end ? event.end : event.start + ' ~ ' + event.end;
  const title = [event.title, event.projectTitle, range, event.endTime, status, event.taskId ? '업무 열기' : '공모 상세 보기'].filter(Boolean).join(' · ');
  const content = <>
    <span className={styles.due}><time dateTime={event.end}>{event.end}</time>{event.endTime && <small>{event.endTime}</small>}</span>
    <span className={styles.task}>
      <strong>{event.title}</strong>
      <small>{[event.milestone && '주요 일정', SCHEDULE_CATEGORY_LABEL[event.category],
        event.start !== event.end && (event.start + ' ~ ' + event.end)].filter(Boolean).join(' · ')}</small>
    </span>
    <span className={styles.project}><i aria-hidden="true" style={{ backgroundColor: color }} />{event.projectTitle}</span>
    <span className={styles.status} data-status={event.status}>{status}</span>
  </>;
  const taskId = event.taskId;
  return <li>{taskId
    ? <button type="button" className={styles.row} onClick={() => onOpenTask(event.projectId, taskId)} aria-label={title}>{content}</button>
    : <Link href={'/reference/' + encodeURIComponent(event.projectId)} className={styles.row} aria-label={title}>{content}</Link>}
  </li>;
}

function ScheduleList({ projects, view, date, today, onNavigate, onOpenTask }: Omit<ScopeProps, 'onCreateTask'>) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [start, end] = calendarBounds(view, date);
  const events = useMemo(() => buildCalendarEvents(projects), [projects]);
  const colors = useMemo(() => new Map(projects.map(project => [project.id, projectColor(project)])), [projects]);
  const inPeriod = useMemo(() => eventsInRange(events, start, end), [events, start, end]);
  const needle = search.trim().toLocaleLowerCase('ko');
  const filtered = inPeriod.filter(event => {
    const matchesStatus = status === 'all' || (status === 'official' ? Boolean(event.officialField) : event.status === status);
    return matchesStatus && (!needle || (event.title + ' ' + event.projectTitle).toLocaleLowerCase('ko').includes(needle));
  });
  const nearest = inPeriod.length ? undefined : nearestCalendarDate(events, date);

  return <section className={styles.listPanel} aria-label="프로젝트 일정 목록">
    <div className={styles.periodToolbar}>
      <div className={styles.periodTitle}>
        <h2 aria-live="polite">{periodLabel(view, date, start, end)}</h2>
        <button type="button" aria-label="이전 기간" onClick={() => onNavigate(view, shiftCalendar(view, date, -1))}>‹</button>
        <button type="button" aria-label="다음 기간" onClick={() => onNavigate(view, shiftCalendar(view, date, 1))}>›</button>
      </div>
      <div role="group" aria-label="목록 기간" className={styles.segment}>
        {(Object.keys(periods) as CalendarView[]).map(period => <button type="button" key={period} aria-pressed={view === period}
          onClick={() => onNavigate(period, date)}>{periods[period]}</button>)}
      </div>
    </div>
    <div className={styles.filters}>
      <div className={styles.dateTools}>
        <button type="button" onClick={() => onNavigate(view, today)}>오늘</button>
        <input type="date" aria-label="기준 날짜" min="0001-01-01" max="9999-12-31" value={date}
          onChange={e => { if (isCalendarDate(e.target.value)) onNavigate(view, e.target.value); }} />
      </div>
      <div className={styles.searchTools}>
        <input type="search" aria-label="일정 검색" placeholder="업무명·프로젝트명 검색" value={search} onChange={e => setSearch(e.target.value)} />
        <select aria-label="일정 상태" value={status} onChange={e => setStatus(e.target.value as StatusFilter)}>
          {(Object.keys(statuses) as StatusFilter[]).map(value => <option key={value} value={value}>{statuses[value]}</option>)}
        </select>
      </div>
    </div>
    <div className={styles.listTitle}><h3>마감일순 일정</h3><span aria-live="polite">{filtered.length}건</span></div>
    {filtered.length ? <>
      <div aria-hidden="true" className={styles.columns}><span>마감일</span><span>업무 일정</span><span>프로젝트</span><span>상태</span></div>
      <ul className={styles.rows}>{filtered.map(event => <Row key={event.id} event={event} color={colors.get(event.projectId)!} onOpenTask={onOpenTask} />)}</ul>
    </> : <div className={styles.empty}>
      <p>{inPeriod.length ? '검색 조건에 맞는 일정이 없습니다.' : '이 기간에 등록된 일정이 없습니다.'}</p>
      {inPeriod.length > 0 && (needle || status !== 'all') && <button type="button" onClick={() => { setSearch(''); setStatus('all'); }}>검색 조건 지우기</button>}
      {nearest && <button type="button" onClick={() => onNavigate(view, nearest)}>가까운 일정으로 이동 · {nearest}</button>}
    </div>}
  </section>;
}

export default function ProjectScheduleWorkspace({ projects, scope, layout, view, date, today, onScopeChange, onLayoutChange, onNavigate, onOpenTask, onCreateTask }: Props) {
  const selected = projects.find(project => project.id === scope);
  const active = useMemo(() => projects.filter(isActiveWorkspaceProject), [projects]);
  const closed = useMemo(() => projects.filter(project => !isActiveWorkspaceProject(project)), [projects]);
  const visible = useMemo(() => selected ? [selected] : scope === 'all' ? projects : active, [selected, scope, projects, active]);
  const missing = scope !== 'all' && scope !== 'active' && !selected;

  return <div className={styles.workspace}>
    <div className={styles.scopeBar}>
      <label className={styles.scope}>프로젝트 범위
        <select aria-label="프로젝트 범위" value={scope} onChange={e => onScopeChange(e.target.value)}>
          <option value="active">진행 프로젝트 전체</option>
          <option value="all">모든 프로젝트 (종료·드롭 포함)</option>
          {missing && <option disabled value={scope}>찾을 수 없는 프로젝트</option>}
          {active.length > 0 && <optgroup label="진행 중">{active.map(project => <option key={project.id} value={project.id}>{projectOption(project)}</option>)}</optgroup>}
          {closed.length > 0 && <optgroup label="종료·드롭">{closed.map(project => <option key={project.id} value={project.id}>{projectOption(project)}</option>)}</optgroup>}
        </select>
      </label>
      {selected && <Link className={styles.projectLink} href={calendarHref(selected.id, view, date)}>프로젝트 열기 →</Link>}
      <div role="group" aria-label="일정 표시 방식" className={styles.segment}>
        <button type="button" aria-pressed={layout === 'calendar'} onClick={() => onLayoutChange('calendar')}>캘린더</button>
        <button type="button" aria-pressed={layout === 'list'} onClick={() => onLayoutChange('list')}>목록</button>
      </div>
    </div>
    {missing ? <p className={styles.empty}>프로젝트를 찾을 수 없습니다. 프로젝트 범위를 다시 선택해 주세요.</p> :
      layout === 'calendar' ? <ProjectCalendar projects={visible} portfolio={!selected} view={view} date={date} today={today}
        onNavigate={onNavigate} onOpenTask={onOpenTask} onCreateTask={onCreateTask} /> :
        <ScheduleList key={scope} projects={visible} view={view} date={date} today={today} onNavigate={onNavigate} onOpenTask={onOpenTask} />}
  </div>;
}
