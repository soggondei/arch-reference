export const MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024;
export const projectFileStages = ['reference', 'process', 'final'] as const;
export const projectFileKinds = ['image', 'drawing', 'model', 'document', 'other'] as const;
export type ProjectFileStage = typeof projectFileStages[number];
export type ProjectFileKind = typeof projectFileKinds[number];

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  size: number;
  stage: ProjectFileStage;
  kind: ProjectFileKind;
  taskId: string | null;
  taskName: string | null;
  createdAt: string;
  archived: boolean;
  version: number;
}

type Attributes = Pick<ProjectFile, 'stage' | 'kind' | 'taskId'>;
export function fileAttributes(body: Record<string, unknown>): Attributes | null {
  const { stage, kind, taskId = null } = body;
  if (!projectFileStages.some(value => value === stage) || !projectFileKinds.some(value => value === kind) ||
      (taskId !== null && !validFileLink(taskId))) return null;
  return { stage: stage as ProjectFileStage, kind: kind as ProjectFileKind, taskId };
}

export function validFileLink(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 300 && value.trim().length > 0 && value === value.trim();
}

export function validFileName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && [...value].length <= 240 &&
    value !== '.' && value !== '..' && !Array.from(value).some(char => '/\\'.includes(char) || char.codePointAt(0)! < 32 || char === '\u007f');
}
