'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import {
  buildCalendarEvents, calendarBounds, calendarMonthDays, eventsInRange, isCalendarDate,
  nearestCalendarDate, shiftCalendar, type CalendarEvent, type CalendarView,
} from '@/lib/project-calendar';
import { SCHEDULE_STATUS_LABEL, type Reference } from '@/lib/types';
import { shiftDate, weekBounds } from '@/lib/weekly-report';
import styles from './ProjectCalendar.module.css';

interface Props {
  projects: Reference[];
  portfolio?: boolean;
  today: string;
  view: CalendarView;
  date: string;
  onNavigate: (view: CalendarView, date: string) => void;
  onOpenTask: (projectId: string, taskId: string) => void;
  onCreateTask: (date: string) => void;
}

const views: Record<CalendarView, string> = { day: '일간', week: '주간', month: '월간', year: '연간' };
const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
const kinds = { milestone: '주요 일정', external: '외부 일정', design: '설계', admin: '행정' };
const fullDay = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', dateStyle: 'full' });
const numDay = (day: string) => Number(day.slice(8));
const numMonth = (day: string) => Number(day.slice(5, 7));
const dayText = (day: string) => fullDay.format(new Date(day + 'T00:00:00Z'));
const monthDay = (day: string) => numMonth(day) + '월 ' + numDay(day) + '일';
const eventKind = (event: CalendarEvent) => event.milestone || event.officialField ? 'milestone' : event.category;

function periodTitle(view: CalendarView, date: string, bounds: [string, string]) {
  if (view === 'day') return dayText(date);
  if (view === 'year') return date.slice(0, 4) + '년';
  if (view === 'month') return date.slice(0, 4) + '년 ' + numMonth(date) + '월';
  const [start, end] = bounds;
  if (start.slice(0, 4) !== end.slice(0, 4)) {
    return start.slice(0, 4) + '년 ' + monthDay(start) + ' – ' + end.slice(0, 4) + '년 ' + monthDay(end);
  }
  return start.slice(0, 4) + '년 ' + monthDay(start) + ' – ' + (start.slice(0, 7) === end.slice(0, 7) ? numDay(end) + '일' : monthDay(end));
}

function eventRange(event: CalendarEvent) {
  const range = event.start === event.end ? event.end : event.start + ' ~ ' + event.end;
  return event.endTime ? range + ' ' + event.endTime : range;
}

type EventProps = { event: CalendarEvent; portfolio?: boolean; onOpenTask: Props['onOpenTask'] };

function EventAction({ event, portfolio, onOpenTask, className, children }: EventProps & {
  className: string; children: ReactNode;
}) {
  const name = [event.title, portfolio && event.projectTitle, eventRange(event), event.status && SCHEDULE_STATUS_LABEL[event.status],
    event.taskId ? '업무 열기' : '공모 상세 보기'].filter(Boolean).join(' · ');
  const attrs = {
    className, 'aria-label': name, title: name,
    'data-kind': eventKind(event), 'data-status': event.status,
  };
  const taskId = event.taskId;
  return taskId
    ? <button type="button" {...attrs} onClick={() => onOpenTask(event.projectId, taskId)}>{children}</button>
    : <Link href={'/reference/' + encodeURIComponent(event.projectId)} {...attrs}>{children}</Link>;
}

function Agenda({ events, date, portfolio, onOpenTask, onCreateTask, dayView }: {
  events: CalendarEvent[]; date: string; dayView: boolean;
} & Pick<Props, 'portfolio' | 'onOpenTask' | 'onCreateTask'>) {
  return <section className={styles.agenda} aria-label="선택한 날짜의 일정">
    <header className={styles.agendaHeader}>
      <h3>{dayView ? '업무 일정' : dayText(date)} <small>{events.length}건</small></h3>
      <button type="button" className={styles.add} onClick={() => onCreateTask(date)} aria-label="선택한 날짜에 업무 추가">+ 업무 추가</button>
    </header>
    {events.length ? <ul className={styles.agendaList}>{events.map(event => {
      const endsToday = event.end === date;
      const time = endsToday && event.endTime ? event.endTime : event.start !== event.end
        ? (endsToday ? '종료일' : date === event.start ? '시작일' : '기간 중') : '시간 미지정';
      return <li key={event.id}>
        <EventAction event={event} portfolio={portfolio} onOpenTask={onOpenTask} className={styles.agendaEvent}>
          <span className={styles.time}>{time}</span>
          <span className={styles.eventMain}>
            <span className={styles.eventName}>{event.title}</span>
            <span className={styles.eventMeta}>{[portfolio && event.projectTitle, kinds[eventKind(event)], event.start !== event.end && eventRange(event)].filter(Boolean).join(' · ')}</span>
          </span>
          <span className={styles.state}>{event.status ? SCHEDULE_STATUS_LABEL[event.status] : '공모 일정'}</span>
          <span className={styles.eventArrow} aria-hidden="true">›</span>
        </EventAction>
      </li>;
    })}</ul> : <p className={styles.empty}>이 날짜에 등록된 일정이 없습니다.</p>}
  </section>;
}

type GridProps = { events: CalendarEvent[]; date: string; today: string; onSelect: (date: string) => void };

function MonthGrid({ events, date, today, onSelect, portfolio }: GridProps & Pick<Props, 'portfolio'>) {
  const grid = useRef<HTMLDivElement>(null);
  const keyboardDate = useRef('');
  useEffect(() => {
    if (keyboardDate.current === date) {
      grid.current?.querySelector<HTMLButtonElement>('[data-day="' + date + '"]')?.focus();
      keyboardDate.current = '';
    }
  }, [date]);
  function navigateDay(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: string;
    if (event.key === 'Home' || event.key === 'End') next = weekBounds(day)[event.key === 'Home' ? 0 : 1];
    else if (event.key in moves) next = shiftDate(day, moves[event.key]);
    else return;
    event.preventDefault();
    if (next !== day && isCalendarDate(next)) {
      keyboardDate.current = next;
      onSelect(next);
    }
  }
  return <div className={styles.month} ref={grid} role="group" aria-label="월간 달력">
    <div className={styles.weekdays} aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
    <div className={styles.monthCells}>{calendarMonthDays(date).map(day => {
      const items = eventsInRange(events, day);
      const first = items.slice(0, 2);
      return <button type="button" key={day} data-day={day} data-outside={day.slice(0, 7) !== date.slice(0, 7)}
        aria-pressed={day === date} aria-current={day === today ? 'date' : undefined} tabIndex={day === date ? 0 : -1}
        aria-label={dayText(day) + ', 일정 ' + items.length + '건'} className={styles.dayCell}
        onKeyDown={e => navigateDay(e, day)} onClick={() => onSelect(day)}>
        <span className={styles.dayTop}><span className={styles.dayNumber}>{numDay(day)}</span>
          {items.length > 0 && <span className={styles.compactCount}>{items.length}</span>}</span>
        <span className={styles.dayPreview} aria-hidden="true">{first.map(event =>
          <span className={styles.previewLine} key={event.id} data-kind={eventKind(event)} title={(portfolio ? event.projectTitle + ' · ' : '') + event.title}>{event.title}</span>)}
          {items.length > first.length && <span className={styles.overflow}>+{items.length - first.length}건</span>}
        </span>
        <span className={styles.mobileDots} aria-hidden="true">{Array.from(new Set(items.map(eventKind))).map(kind =>
          <i key={kind} data-kind={kind} />)}</span>
      </button>;
    })}</div>
  </div>;
}

function WeekChart({ events, date, today, onSelect, portfolio, onOpenTask }: GridProps & Pick<Props, 'portfolio' | 'onOpenTask'>) {
  const [start] = calendarBounds('week', date);
  const days = weekdays.map((_, i) => shiftDate(start, i)).filter(isCalendarDate);
  return <section className={styles.weekChart} aria-label="주간 일정표">
    <div className={styles.weekHeader}>
      <span className={styles.weekHeading}>업무 일정 <small>{events.length}건</small></span>
      <div className={styles.weekAxis}>{days.map((day, i) =>
        <button type="button" key={day} onClick={() => onSelect(day)} aria-current={day === today ? 'date' : undefined}
          aria-pressed={date === day} aria-label={dayText(day) + ', 일정 ' + eventsInRange(events, day).length + '건'}>
          <span>{weekdays[i]}</span><b>{numDay(day)}</b>
        </button>)}</div>
    </div>
    {events.length ? <ul>{events.map(event => {
      const left = days.findIndex(day => day >= event.start);
      const right = days.findLastIndex(day => day <= event.end);
      return <li key={event.id}><EventAction event={event} portfolio={portfolio} onOpenTask={onOpenTask} className={styles.weekEvent}>
        <span className={styles.weekName}><strong>{event.title}</strong><small>{portfolio ? event.projectTitle : kinds[eventKind(event)]}</small></span>
        <span className={styles.weekTrack} aria-hidden="true">
          <span className={styles.weekBar} data-milestone={eventKind(event) === 'milestone' && left === right}
            style={{ gridColumn: (left + 1) + ' / ' + (right + 2) }} />
        </span>
      </EventAction></li>;
    })}</ul> : <p className={styles.empty}>이 주에 등록된 일정이 없습니다.</p>}
  </section>;
}

function YearGrid({ events, date, today, onSelect }: GridProps) {
  return <div className={styles.year} role="group" aria-label="연간 달력">{Array.from({ length: 12 }, (_, i) => {
    const month = date.slice(0, 4) + '-' + String(i + 1).padStart(2, '0');
    const first = month + '-01';
    const [start, end] = calendarBounds('month', first);
    const inMonth = eventsInRange(events, start, end);
    const milestone = inMonth.find(event => eventKind(event) === 'milestone' && event.end >= start && event.end <= end);
    const jump = month === date.slice(0, 7) ? date : nearestCalendarDate(inMonth, first) ?? first;
    return <button key={month} type="button" className={styles.monthCard} onClick={() => onSelect(jump)}
      aria-label={date.slice(0, 4) + '년 ' + (i + 1) + '월 열기, 일정 ' + inMonth.length + '건'}>
      <span className={styles.monthName}><b>{i + 1}월</b><small>{inMonth.length}건</small></span>
      <span className={styles.miniGrid} aria-hidden="true">
        {weekdays.map(w => <i className={styles.miniWeekday} key={w}>{w}</i>)}
        {calendarMonthDays(first).map(day => {
          if (!day.startsWith(month)) return <i key={day} />;
          const daily = eventsInRange(inMonth, day);
          return <i key={day} data-has-events={daily.length > 0} data-major={daily.some(event => eventKind(event) === 'milestone')}
            data-today={day === today}>{numDay(day)}</i>;
        })}
      </span>
      {milestone && <span className={styles.miniMilestone}>{numDay(milestone.end)}일 · {milestone.title}</span>}
    </button>;
  })}</div>;
}

export default function ProjectCalendar({ projects, portfolio, today, view, date, onNavigate, onOpenTask, onCreateTask }: Props) {
  const events = useMemo(() => buildCalendarEvents(projects), [projects]);
  const bounds = calendarBounds(view, date);
  const scoped = eventsInRange(events, ...bounds);
  const nearest = !scoped.length && nearestCalendarDate(events, date);
  const select = (next: string) => onNavigate(view, next);
  return <section className={styles.calendar} aria-label="프로젝트 캘린더">
    <header className={styles.toolbar}>
      <div className={styles.period}>
        <h2 aria-live="polite">{periodTitle(view, date, bounds)}</h2>
        <div role="group" aria-label="기간 이동" className={styles.arrows}>
          <button type="button" aria-label="이전 기간" onClick={() => select(shiftCalendar(view, date, -1))}><span aria-hidden="true">‹</span></button>
          <button type="button" aria-label="다음 기간" onClick={() => select(shiftCalendar(view, date, 1))}><span aria-hidden="true">›</span></button>
        </div>
      </div>
      <div className={styles.viewSwitch} role="group" aria-label="캘린더 보기">{(Object.keys(views) as CalendarView[]).map(mode =>
        <button key={mode} type="button" aria-pressed={view === mode} onClick={() => onNavigate(mode, date)}>{views[mode]}</button>)}</div>
    </header>
    <div className={styles.subbar}>
      <div className={styles.jumpControls}>
        <button type="button" onClick={() => select(today)}>오늘</button>
        <input type="date" value={date} aria-label="기준 날짜" min="0001-01-01" max="9999-12-31"
          onChange={e => { if (isCalendarDate(e.target.value)) select(e.target.value); }} />
      </div>
      <ul className={styles.legend} aria-label="일정 구분">{Object.entries(kinds).map(([key, name]) =>
        <li key={key} data-kind={key}>{name}</li>)}</ul>
    </div>
    {nearest && <div className={styles.nearest}>
      {view === 'month' || view === 'year' ? <span>{view === 'month' ? '이 달' : '이 해'}에 등록된 일정이 없습니다.</span> : null}
      <button type="button" aria-label="가까운 일정으로 이동" onClick={() => select(nearest)}>가까운 일정으로 이동 <span>{nearest} ›</span></button>
    </div>}
    {view === 'month' && <MonthGrid date={date} today={today} events={events} onSelect={select} portfolio={portfolio} />}
    {view === 'week' && <WeekChart date={date} today={today} events={scoped} onSelect={select} portfolio={portfolio} onOpenTask={onOpenTask} />}
    {view === 'year' ? <YearGrid date={date} today={today} events={scoped} onSelect={next => onNavigate('month', next)} /> :
      <Agenda date={date} dayView={view === 'day'} events={eventsInRange(scoped, date)} portfolio={portfolio} onOpenTask={onOpenTask} onCreateTask={onCreateTask} />}
  </section>;
}
