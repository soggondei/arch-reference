import type { CompetitionData, ScheduleItem } from './types';

// Diff the snapshot the user actually edited. A background Notion sync, for
// example, may have changed only notionPageId on a now-reassigned task.
function changedFields<T extends object>(before: T, after: T): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key] = after[key];
  }
  return changes;
}

function mergeSchedules(current: ScheduleItem[], before: ScheduleItem[], after: ScheduleItem[]) {
  const previous = new Map(before.map(item => [item.id, item]));
  const proposed = new Map(after.map(item => [item.id, item]));
  const existingIds = new Set(current.map(item => item.id));
  const added = after.filter(item => !previous.has(item.id) && !existingIds.has(item.id));
  // Two tabs can generate different IDs for the same template. Only the first
  // initialization should reach the linked Notion pages.
  if (!before.length && current.length && added.length > 1 && added.length === after.length) {
    throw new Error('다른 사용자가 일정을 먼저 등록했습니다. 새로고침 후 확인해 주세요.');
  }
  const merged = current.filter(item => !previous.has(item.id) || proposed.has(item.id)).map(item => {
    const old = previous.get(item.id);
    const next = proposed.get(item.id);
    return old && next ? { ...item, ...changedFields(old, next) } : item;
  });
  return [...merged, ...added].sort((a, b) => a.endDate.localeCompare(b.endDate));
}

export function mergeCompetitionEdit(current: CompetitionData, before: CompetitionData, after: CompetitionData): CompetitionData {
  const { schedules: previous, ...oldFields } = before;
  const { schedules: requested, ...newFields } = after;
  const changes = changedFields(oldFields, newFields);
  delete changes.scheduleRevision;
  const merged = { ...current, ...changes };
  if (JSON.stringify(previous) !== JSON.stringify(requested)) {
    merged.schedules = mergeSchedules(current.schedules ?? [], previous ?? [], requested ?? []);
  }
  return merged;
}
