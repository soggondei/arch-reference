import type { CompetitionData, Reference } from './types';
import type { CalendarView } from './project-calendar';

export type ProjectSection = 'directory' | 'calendar' | 'schedule' | 'report' | 'references' | 'planning' | 'process' | 'files';
export const directoryGroups = ['active', 'candidate', 'completed', 'dropped'] as const;
export type DirectoryGroup = typeof directoryGroups[number];
export const directoryLabels: Record<DirectoryGroup, string> = {
  active: '진행 프로젝트', candidate: '검토 프로젝트', completed: '완료 프로젝트', dropped: '드롭 프로젝트',
};
export type ScheduleLayout = 'calendar' | 'list';
export type ScheduleScope = 'active' | 'all';
type CalendarTask = { projectId: string; taskId: string };

export function isWorkspaceProject(ref: Pick<Reference, 'competitionData'>) {
  const data = ref.competitionData;
  return Boolean(data && (data.workspaceKind || data.processTemplateId || data.status !== '관심' || data.schedules?.length ||
    data.workLogs?.length || data.feedback?.length || data.referenceLinks?.length));
}

export function projectLifecycleGroup(data: CompetitionData): DirectoryGroup {
  if (data.status === '드롭') return 'dropped';
  if (data.planning?.archived) {
    const current = data.planning.closeouts?.find(entry => entry.id === data.planning?.currentCloseout);
    return current?.outcome === '드롭' ? 'dropped' : 'completed';
  }
  if (data.workspaceKind) return 'active';
  if (data.status === '관심') return 'candidate';
  if (data.status === '입선' || data.status === '탈락') return 'completed';
  return 'active';
}

export function isActiveWorkspaceProject(ref: Pick<Reference, 'competitionData'>) {
  return Boolean(ref.competitionData && projectLifecycleGroup(ref.competitionData) === 'active');
}

export function projectStatusLabel(data: CompetitionData) {
  if (!data.workspaceKind) return data.status;
  if (data.workspaceKind === 'office') return '사무소 공통';
  const group = projectLifecycleGroup(data);
  return group === 'dropped' ? '드롭' : group === 'completed' ? '완료' : '진행 중';
}

export function directoryGroupFor(ref: Pick<Reference, 'competitionData'>): DirectoryGroup | null {
  if (!ref.competitionData || !isWorkspaceProject(ref) || ref.competitionData.workspaceKind === 'office') return null;
  return projectLifecycleGroup(ref.competitionData);
}

export function projectDirectoryHref(group: DirectoryGroup = 'active') {
  return group === 'active' ? '/?tab=projects' : '/?tab=projects&group=' + group;
}

export function parseDirectoryGroup(group: string | null): DirectoryGroup {
  return directoryGroups.find(key => key === group) ?? 'active';
}

export function workspaceSection(tab: string, query: Pick<URLSearchParams, 'get' | 'has'>): ProjectSection {
  if (tab !== 'projects') return 'calendar';
  const section = query.get('section');
  if (!query.get('project') && !query.get('task') && (!section || section === 'directory')) return 'directory';
  if (section === 'report' || section === 'references' || section === 'planning' || section === 'schedule' || section === 'process' || section === 'files') return section;
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
