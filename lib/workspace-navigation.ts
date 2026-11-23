import type { Reference } from './types';

export type ProjectSection = 'schedule' | 'report' | 'references';

export function isWorkspaceProject(ref: Reference) {
  const data = ref.competitionData;
  return Boolean(data && (data.workspaceKind || data.status !== '관심' || data.schedules?.length ||
    data.workLogs?.length || data.feedback?.length || data.referenceLinks?.length));
}

export function projectHref(projectId: string, section: ProjectSection = 'schedule', taskId?: string) {
  const params = new URLSearchParams({ tab: 'projects', project: projectId });
  if (section !== 'schedule') params.set('section', section);
  if (taskId) params.set('task', taskId);
  return '/?' + params.toString();
}
