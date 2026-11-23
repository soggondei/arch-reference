import type { CompetitionData, ScheduleItem } from './types';

// Imported registration and submission fields contain either one date or a range,
// e.g. "2026-10-13 ~ 2026-10-20 (18:00)". The trailing time belongs to the closing date.
export function competitionPeriod(raw?: string) {
  const matches = Array.from((raw ?? '').matchAll(/\b\d{4}[-.]\d{2}[-.]\d{2}(?!\d)/g));
  if (!raw || !matches.length) return undefined;
  const dates = matches.map(match => match[0].replaceAll('.', '-'));
  if (dates.some(date => !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) return undefined;
  const last = matches[matches.length - 1];
  const trailing = raw.slice(last.index! + last[0].length);
  if (/^[\s.)]*(?:~|～|–|—)/.test(trailing)) return undefined;
  const times = Array.from(trailing.replace(/[+-]\d{2}:\d{2}\s*$/, '').matchAll(/(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)\b/g));
  const closingTime = times[times.length - 1];
  return {
    firstDate: dates[0],
    endDate: dates[dates.length - 1],
    endTime: closingTime ? `${closingTime[1].padStart(2, '0')}:${closingTime[2]}` : undefined,
  };
}

export function getDeadlineDate(raw?: string) {
  return competitionPeriod(raw)?.endDate;
}

export function deadlineLabel(raw?: string) {
  const period = competitionPeriod(raw);
  return period ? [period.endDate, period.endTime].filter(Boolean).join(' ') : raw;
}

export function notionDate(date: string, time?: string) {
  return time ? `${date}T${time}:00+09:00` : date;
}

export function notionClosingDate(raw?: string) {
  const period = competitionPeriod(raw);
  return period && { date: { start: notionDate(period.endDate, period.endTime) } };
}

export function getDDay(raw?: string, now = new Date()): number | null {
  const end = getDeadlineDate(raw);
  if (!end) return null;
  const todayInSeoul = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  return (Date.parse(end) - Date.parse(todayInSeoul)) / 86400000;
}

export function normalizeRegistrationSchedule(cd: CompetitionData, previousRegistrationDate?: string): CompetitionData {
  if (!cd.schedules?.length) return cd;
  const registration = competitionPeriod(cd.registrationDate);
  if (!registration) return cd;
  const oldRegistration = previousRegistrationDate ? competitionPeriod(previousRegistrationDate) : undefined;
  let changed = false;
  const schedules = cd.schedules.map((item: ScheduleItem) => {
    if (item.taskName !== '응모 등록 마감' || item.category !== 'external' || !item.isMilestone || item.startDate) return item;
    // Only repair known generated dates. Keep separately rescheduled items intact.
    const matchesOfficial = item.endDate === registration.endDate || item.endDate === registration.firstDate || item.endDate === oldRegistration?.endDate;
    if (!matchesOfficial || (item.endDate === registration.endDate && item.endTime === registration.endTime)) return item;
    changed = true;
    return { ...item, endDate: registration.endDate, endTime: registration.endTime };
  });
  return changed ? { ...cd, schedules } : cd;
}
