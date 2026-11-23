import type { Reference } from './types';
import type { CalendarView } from './project-calendar';

export type ProjectSection = 'directory' | 'calendar' | 'schedule' | 'report' | 'references' | 'planning';
export type DirectoryGroup = 'active' | 'completed';
export type ScheduleLayout = 'calendar' | 'list';
export type ScheduleScope = 'active' | 'all';
type CalendarTask = { projectId: string; taskId: string };

export function isWorkspaceProject(ref: Pick<Reference, 'competitionData'>) {
  const data = ref.competitionData;
  return Boolean(data && (data.workspaceKind || data.status !== '관심' || data.schedules?.length ||
    data.workLogs?.length || data.feedback?.length || data.referenceLinks?.length));
}

export function isActiveWorkspaceProject(ref: Pick<Reference, 'competitionData'>) {
  const data = ref.competitionData;
  return Boolean(data && !data.planning?.archived &&
    (data.workspaceKind || !['드롭', '탈락', '입선'].includes(data.status)));
}

export function directoryGroupFor(ref: Pick<Reference, 'competitionData'>): DirectoryGroup | null {
  if (!isWorkspaceProject(ref) || ref.competitionData?.workspaceKind === 'office') return null;
  return isActiveWorkspaceProject(ref) ? 'active' : 'completed';
}

export function projectDirectoryHref(group: DirectoryGroup = 'active') {
  return group === 'completed' ? '/?tab=projects&group=completed' : '/?tab=projects';
}

export function workspaceSection(tab: string, query: Pick<URLSearchParams, 'get' | 'has'>): ProjectSection {
  if (tab !== 'projects') return 'calendar';
  const section = query.get('section');
  if (!query.get('project') && !query.get('task') && (!section || section === 'directory')) return 'directory';
  if (section === 'report' || section === 'references' || section === 'planning' || section === 'schedule') return section;
  return section !== 'calendar' && query.has('task') ? 'schedule' : 'calendar';
}

export function projectHref(projectId: string, section: ProjectSection = 'schedule', taskId?: string) {
  const params = new URLSearchParams({ tab: 'projects', project: projectId, section });
  if (taskId) params.set('task', taskId);
  return '/?' + params.toString();
}

function calendarSelection(params: URLSearchParams, projectId?: string, task?: CalendarTask) {
  if (projectId) params.set('project', projectId);
  if (task) {
    params.set('task', task.taskId);
    if (!projectId) params.set('taskProject', task.projectId);
  }
  return '/?' + params.toString();
}

export function calendarHref(projectId: string | undefined, view: CalendarView, date: string, task?: CalendarTask) {
  return calendarSelection(new URLSearchParams({ tab: 'projects', section: 'calendar', view, date }), projectId, task);
}

export function scheduleHref(projectId: string | undefined, view: CalendarView, date: string,
  layout: ScheduleLayout = 'calendar', task?: CalendarTask, scope: ScheduleScope = 'active') {
  const params = new URLSearchParams({ tab: 'schedule', view, date });
  if (layout === 'list') params.set('layout', layout);
  if (!projectId && scope === 'all') params.set('scope', scope);
  return calendarSelection(params, projectId, task);
}
