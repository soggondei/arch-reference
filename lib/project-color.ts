import type { CompetitionData, Reference } from './types';
import { isActiveWorkspaceProject } from './workspace-navigation';

type ColorProject = Pick<Reference, 'id' | 'competitionData'>;

export const PROJECT_COLORS = [
  { value: '#19675e', label: '청록' },
  { value: '#325da4', label: '파랑' },
  { value: '#a5431c', label: '주황' },
  { value: '#7945a3', label: '보라' },
  { value: '#a23b68', label: '자홍' },
  { value: '#587222', label: '올리브' },
  { value: '#287345', label: '초록' },
  { value: '#885c15', label: '황토' },
  { value: '#166c85', label: '바다색' },
  { value: '#98463e', label: '벽돌색' },
  { value: '#57549f', label: '남보라' },
  { value: '#536778', label: '청회색' },
] as const;

function paletteColor(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  return PROJECT_COLORS.find(color => color.value === normalized)?.value;
}

export function projectColor(project: ColorProject): string {
  const saved = paletteColor(project.competitionData?.projectColor);
  if (saved) return saved;

  // Legacy records get the same color on every screen and device, including
  // when opened by a deep link that contains only this project's ID.
  let hash = 2166136261;
  for (let i = 0; i < project.id.length; i++) {
    hash = Math.imul(hash ^ project.id.charCodeAt(i), 16777619);
  }
  return PROJECT_COLORS[(hash >>> 0) % PROJECT_COLORS.length].value;
}

export function projectColorName(project: ColorProject): string {
  const value = projectColor(project);
  return PROJECT_COLORS.find(color => color.value === value)!.label;
}

export function suggestedProjectColor(project: ColorProject, existingProjects: readonly ColorProject[]): string {
  const saved = paletteColor(project.competitionData?.projectColor);
  if (saved) return saved;
  const usage = new Map<string, { total: number; active: number }>();
  for (const other of existingProjects) {
    if (other.id === project.id) continue;
    const color = projectColor(other);
    const count = usage.get(color) ?? { total: 0, active: 0 };
    count.total++;
    if (isActiveWorkspaceProject(other)) count.active++;
    usage.set(color, count);
  }
  const preferred = projectColor(project);
  const start = PROJECT_COLORS.findIndex(color => color.value === preferred);
  let best = preferred;
  let fewestActive = Infinity;
  let fewestTotal = Infinity;
  for (let offset = 0; offset < PROJECT_COLORS.length; offset++) {
    const { value } = PROJECT_COLORS[(start + offset) % PROJECT_COLORS.length];
    const count = usage.get(value);
    if (!count) return value;
    if (count.active < fewestActive || (count.active === fewestActive && count.total < fewestTotal)) {
      best = value;
      fewestActive = count.active;
      fewestTotal = count.total;
    }
  }
  return best;
}

export function updateProjectColor(data: CompetitionData, value: string, previous?: string): CompetitionData {
  const color = paletteColor(value);
  if (!color) throw new Error('목록에서 프로젝트 색상을 선택해 주세요.');
  if (paletteColor(data.projectColor) === color) return data;
  if (data.projectColor !== previous) throw new Error('프로젝트 색상이 변경되었습니다. 최신 색상을 확인해 주세요.');
  return { ...data, projectColor: color };
}
