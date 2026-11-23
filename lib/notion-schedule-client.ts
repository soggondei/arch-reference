import type { ScheduleItem } from './types';

export async function patchNotionRegistrationDate(target: 'project' | 'schedule', notionPageId: string, registrationDate: string) {
  const result = await fetch('/api/notion-' + target, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notionPageId, registrationDate }),
  });
  if (!result.ok) throw new Error('등록 마감일 동기화 실패');
}

export async function syncNotionSchedule(projectName: string, item: ScheduleItem): Promise<ScheduleItem> {
  const { taskName, category, status, startDate, endDate, endTime } = item;
  const request = (method: 'PATCH' | 'POST') => fetch('/api/notion-schedule', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notionPageId: item.notionPageId, taskName, projectName, category, status, startDate, endDate, endTime }),
  });
  if (item.notionPageId) {
    const response = await request('PATCH');
    if (response.ok) return item;
    const result = await response.json();
    if (!result.notFound) throw new Error(result.error ?? 'Notion 일정 갱신 실패');
  }
  const response = await request('POST');
  const result = await response.json();
  if (!response.ok || !result.pageId) throw new Error(result.error ?? 'Notion 일정 생성 실패');
  return { ...item, notionPageId: result.pageId };
}

export async function autoSyncSchedulesToNotion(projectName: string, schedules: ScheduleItem[]) {
  const results = await Promise.allSettled(schedules.map(item => syncNotionSchedule(projectName, item)));
  return results.map((result, i) => result.status === 'fulfilled' ? result.value : schedules[i]);
}
