import type { Reference } from './types';
import type { CalendarView } from './project-calendar';

export type ProjectSection = 'calendar' | 'schedule' | 'report' | 'references' | 'planning';

export function isWorkspaceProject(ref: Reference) {
  const data = ref.competitionData;
  return Boolean(data && (data.workspaceKind || data.status !== '관심' || data.schedules?.length ||
    data.workLogs?.length || data.feedback?.length || data.referenceLinks?.length));
}

export function projectHref(projectId: string, section: ProjectSection = 'schedule', taskId?: string) {
  const params = new URLSearchParams({ tab: 'projects', project: projectId, section });
  if (taskId) params.set('task', taskId);
  return '/?' + params.toString();
}

export function calendarHref(projectId: string | undefined, view: CalendarView, date: string, task?: { projectId: string; taskId: string }) {
  const params = new URLSearchParams({ tab: 'projects', section: 'calendar', view, date });
  if (projectId) params.set('project', projectId);
  if (task) {
    params.set('task', task.taskId);
    if (!projectId) params.set('taskProject', task.projectId);
  }
  return '/?' + params.toString();
}
