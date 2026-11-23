import type { CompetitionData, TaskFeedback, WorkLog } from './types';

// Inputs are Korean calendar dates, not timestamps. UTC arithmetic keeps the
// Monday/Sunday boundaries independent of the device's local time zone.
export function shiftDate(day: string, days: number) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekBounds(day: string): [string, string] {
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  const monday = shiftDate(day, -((weekday + 6) % 7));
  return [monday, shiftDate(monday, 6)];
}

export function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return rest + '분';
  return hours + '시간' + (rest ? ' ' + rest + '분' : '');
}

function entriesInWeek<T extends WorkLog | TaskFeedback>(entries: T[], start: string, end: string) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  return [...byId.values()].filter(entry => entry.date >= start && entry.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

type TimeGroup = { key: string; label: string; minutes: number };

function addTime(groups: Map<string, TimeGroup>, key: string, label: string, minutes: number) {
  const total = (groups.get(key)?.minutes ?? 0) + minutes;
  groups.set(key, { key, label, minutes: total });
}

function byTime(groups: Map<string, TimeGroup>) {
  return [...groups.values()].sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label, 'ko'));
}

export function buildWeeklyReport(data: CompetitionData | undefined, day: string, sharedLogs: WorkLog[] = []) {
  const [start, end] = weekBounds(day);
  const logs = entriesInWeek([...(data?.workLogs ?? []), ...sharedLogs], start, end);
  const feedback = entriesInWeek(data?.feedback ?? [], start, end);
  const schedule = new Map((data?.schedules ?? []).map(task => [task.id, task]));
  const tasks = new Map<string, TimeGroup>();
  const authors = new Map<string, TimeGroup>();
  const days = new Map<string, { date: string; minutes: number; logs: WorkLog[] }>();
  let minutes = 0;
  for (const log of logs) {
    minutes += log.minutes;
    addTime(tasks, log.taskId, schedule.get(log.taskId)?.taskName ?? log.taskName, log.minutes);
    addTime(authors, log.author, log.author, log.minutes);
    const dayGroup = days.get(log.date) ?? { date: log.date, minutes: 0, logs: [] };
    dayGroup.minutes += log.minutes;
    dayGroup.logs.push(log);
    days.set(log.date, dayGroup);
  }
  return {
    start, end, minutes, logCount: logs.length,
    tasks: byTime(tasks), authors: byTime(authors), days: [...days.values()],
    feedback, schedule,
  };
}

export function weeklyDecisions(data: CompetitionData | undefined, day: string, today: string) {
  const [start, end] = weekBounds(day);
  const ordered = [...(data?.schedules ?? [])].sort((a, b) =>
    (a.endDate ?? '').localeCompare(b.endDate ?? '') || (a.endTime ?? '').localeCompare(b.endTime ?? '') ||
    a.taskName.localeCompare(b.taskName, 'ko'));
  const completed = ordered.flatMap(task => {
    const dates = task.completedDates?.filter(date => date >= start && date <= end).sort();
    return dates?.length ? [{ task, date: dates[dates.length - 1] }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
  const live = start <= today && today <= end && !data?.planning?.archived &&
    (Boolean(data?.workspaceKind) || !['드롭', '입선', '탈락'].includes(data?.status ?? ''));
  const open = live ? ordered.filter(task => task.status !== 'done' && task.status !== 'cancelled') : [];
  return {
    completed, live, waiting: open.filter(task => task.waitingFor?.trim()),
    actions: open.filter(task => task.nextAction?.trim()),
    nextDelivery: open.find(task => task.endDate >= today && (task.isMilestone || task.category === 'external' || task.deliverables?.length)),
  };
}
