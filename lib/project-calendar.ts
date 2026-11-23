import { competitionPeriod } from './competition-dates';
import type { CompetitionData, Reference, ScheduleCategory, ScheduleItem, ScheduleStatus } from './types';

export type CalendarView = 'day' | 'week' | 'month' | 'year';
type OfficialField = 'announcementDate' | 'registrationDate' | 'submissionDate' | 'resultDate';

export interface CalendarEvent {
  id: string;
  projectId: string;
  projectTitle: string;
  title: string;
  start: string;
  end: string;
  endTime?: string;
  category: ScheduleCategory;
  status?: ScheduleStatus;
  milestone: boolean;
  taskId?: string;
  officialField?: OfficialField;
}

const firstDay = '0001-01-01';
const lastDay = '9999-12-31';

function midnight(day: string) {
  return new Date(day + 'T00:00:00Z');
}

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < firstDay) return false;
  const date = midnight(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function civilDate(date: Date) {
  if (date.getUTCFullYear() < 1) return firstDay;
  if (date.getUTCFullYear() > 9999) return lastDay;
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, days: number) {
  const date = midnight(day);
  date.setUTCDate(date.getUTCDate() + days);
  return civilDate(date);
}

function lastInMonth(day: string) {
  const date = midnight(day);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return civilDate(date);
}

export function calendarBounds(view: CalendarView, day: string): [string, string] {
  if (view === 'year') return [day.slice(0, 4) + '-01-01', day.slice(0, 4) + '-12-31'];
  if (view === 'month') return [day.slice(0, 7) + '-01', lastInMonth(day)];
  if (view === 'week') {
    const sinceMonday = (midnight(day).getUTCDay() + 6) % 7;
    return [addDays(day, -sinceMonday), addDays(day, 6 - sinceMonday)];
  }
  return [day, day];
}

export function shiftCalendar(view: CalendarView, day: string, direction: -1 | 1) {
  if (view === 'day' || view === 'week') return addDays(day, direction * (view === 'day' ? 1 : 7));
  const date = midnight(day);
  const originalDay = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + direction * (view === 'month' ? 1 : 12), 1);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return day;
  const last = Number(lastInMonth(civilDate(date)).slice(-2));
  date.setUTCDate(Math.min(originalDay, last));
  return civilDate(date);
}

export function calendarMonthDays(day: string) {
  const [first, last] = calendarBounds('month', day);
  const start = calendarBounds('week', first)[0];
  const end = calendarBounds('week', last)[1];
  const count = (midnight(end).getTime() - midnight(start).getTime()) / 86400000 + 1;
  return Array.from({ length: count }, (_, offset) => addDays(start, offset));
}

const officialTitles: Record<OfficialField, string> = {
  announcementDate: '공고',
  registrationDate: '응모 등록 마감',
  submissionDate: '작품접수',
  resultDate: '당선 발표',
};

function officialDates(data: CompetitionData) {
  if (data.workspaceKind) return [];
  return (Object.keys(officialTitles) as OfficialField[]).flatMap(field => {
    const period = competitionPeriod(data[field]);
    if (!period) return [];
    const day = field === 'announcementDate' ? period.firstDate : period.endDate;
    if (!isCalendarDate(day)) return [];
    return [{ field, title: officialTitles[field], day, first: period.firstDate,
      time: day === period.endDate ? period.endTime : undefined }];
  });
}

type OfficialDate = ReturnType<typeof officialDates>[number];

function matchesOfficial(task: ScheduleItem, date: OfficialDate) {
  if (task.category !== 'external' || !task.isMilestone || task.startDate || task.taskName !== date.title) return false;
  // Imported registration tasks sometimes still hold the opening day or an old
  // closing time. This mirrors normalizeRegistrationSchedule in the store.
  if (date.field === 'registrationDate') return task.endDate === date.day || task.endDate === date.first;
  return task.endDate === date.day && (!task.endTime || !date.time || task.endTime === date.time);
}

export function isOfficialCalendarTask(project: Pick<Reference, 'competitionData'>, task: ScheduleItem) {
  return Boolean(project.competitionData && officialDates(project.competitionData).some(date => matchesOfficial(task, date)));
}

// When a competition announcement is amended, follow it with tasks that were
// already linked. A separately scheduled task of the same name keeps its date.
export function redateOfficialCalendarTasks(before: CompetitionData, next: CompetitionData): CompetitionData {
  if (!before.schedules?.length || !next.schedules?.length) return next;
  const revised = officialDates(next);
  const changes = officialDates(before).flatMap(previous => {
    const current = revised.find(date => date.field === previous.field);
    if (!current || (previous.day === current.day && previous.time === current.time)) return [];
    return [{ previous, current }];
  });
  if (!changes.length) return next;
  const oldTasks = new Map(before.schedules.map(task => [task.id, task]));
  let changed = false;
  const schedules = next.schedules.map(task => {
    const old = oldTasks.get(task.id);
    const revision = old && changes.find(({ previous }) => matchesOfficial(old, previous) && matchesOfficial(task, previous));
    if (!revision) return task;
    const { previous, current } = revision;
    const endTime = current.time ?? (previous.time ? undefined : task.endTime);
    if (task.endDate === current.day && task.endTime === endTime) return task;
    changed = true;
    return { ...task, endDate: current.day, endTime };
  });
  return changed ? { ...next, schedules } : next;
}

export function buildCalendarEvents(projects: readonly Reference[]): CalendarEvent[] {
  const events = new Map<string, CalendarEvent>();
  for (const project of projects) {
    const data = project.competitionData;
    if (!data) continue;
    const official = officialDates(data);
    const linked = new Set<OfficialField>();
    const projectInfo = { projectId: project.id, projectTitle: project.title };
    for (const task of data.schedules ?? []) {
      if (!task.id || !isCalendarDate(task.endDate)) continue;
      const match = official.find(date => matchesOfficial(task, date));
      if (match) linked.add(match.field);
      const end = match?.day ?? task.endDate;
      const endTime = match?.field === 'registrationDate' ? match.time : match?.time ?? task.endTime;
      const start = task.startDate && isCalendarDate(task.startDate) && task.startDate <= end ? task.startDate : end;
      const id = JSON.stringify([project.id, 'task', task.id]);
      events.set(id, { ...projectInfo, id, title: task.taskName, start, end, taskId: task.id,
        endTime, category: task.category, status: task.status,
        milestone: Boolean(task.isMilestone), officialField: match?.field });
    }
    for (const date of official) {
      if (linked.has(date.field)) continue;
      const id = JSON.stringify([project.id, 'official', date.field]);
      events.set(id, { ...projectInfo, id, title: date.title, start: date.day, end: date.day,
        endTime: date.time, category: 'external', milestone: true, officialField: date.field });
    }
  }
  return [...events.values()].sort((a, b) => a.end.localeCompare(b.end) ||
    (a.endTime ?? '').localeCompare(b.endTime ?? '') || a.title.localeCompare(b.title, 'ko') ||
    a.id.localeCompare(b.id));
}

export function eventsInRange(events: readonly CalendarEvent[], start: string, end = start) {
  return events.filter(event => event.start <= end && event.end >= start);
}

export function nearestCalendarDate(events: readonly CalendarEvent[], day: string) {
  let closest: string | undefined;
  let shortest = Infinity;
  const anchor = midnight(day).getTime();
  for (const event of events) {
    const candidate = day < event.start ? event.start : day > event.end ? event.end : day;
    if (candidate === day) return day;
    const distance = Math.abs(midnight(candidate).getTime() - anchor);
    if (distance < shortest || (distance === shortest && candidate > day)) {
      closest = candidate;
      shortest = distance;
    }
  }
  return closest;
}
