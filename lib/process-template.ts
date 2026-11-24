import type { CompetitionData, ScheduleItem } from './types';
import { getDeadlineDate } from './competition-dates';
import { isCalendarDate } from './project-calendar';
import { applyPlanning, assignedPhase } from './project-planning';
import { competitionProcessTemplate, offsetProcessDate, processStep } from './schedule-template';

export type ProcessCategory = 'design' | 'admin';
export interface ProcessDefaults {
  taskName: string;
  category: ProcessCategory;
  isMilestone: boolean;
}
export interface ProcessStep extends ProcessDefaults {
  id: string;
  daysBeforeDeadline: number;
  durationDays: number;
}
export interface ProcessTemplate { id: string; name: string; steps: ProcessStep[] }
export interface ProcessLibrary { revision: number; templates: ProcessTemplate[] }
export interface ProcessDraft extends ProcessDefaults {
  templateId: string;
  stepId: string;
  durationDays: number;
  defaults: ProcessDefaults & { durationDays: number };
}
export interface ProcessRow extends ProcessDefaults {
  stepId: string;
  taskId?: string;
  stored?: boolean;
  storedRange?: string;
  startDate: string;
  endDate: string;
  durationDays?: number;
}

export const DEFAULT_PROCESS_LIBRARY: ProcessLibrary = {
  revision: 0,
  templates: [
    competitionProcessTemplate,
    { id: 'private-design', name: '민간 설계', steps: [
      processStep('brief', '의뢰인 요구사항 정리', 'admin', 50, 2),
      processStep('site', '현장 조사 및 법규 검토', 'design', 45, 5),
      processStep('scheme', '계획설계', 'design', 32, 10),
      processStep('review', '건축주 협의', 'admin', 30, 1, true),
      processStep('design-development', '중간설계', 'design', 20, 10),
      processStep('documents', '실시설계', 'design', 5, 15),
      processStep('delivery', '도서 검토 및 납품', 'design', 0, 3, true),
    ] },
    { id: 'office-admin', name: '일반 행정업무', steps: [
      processStep('requirements', '요청 사항 확인', 'admin', 4),
      processStep('collect', '자료 수집', 'admin', 3),
      processStep('prepare', '서류 작성', 'admin', 1, 2),
      processStep('file', '검토 및 제출', 'admin', 0, 1, true),
    ] },
  ],
};

function validId(value: string) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
    && !['__proto__', 'constructor', 'prototype'].includes(value);
}

function checkedDetails(item: ProcessDefaults): ProcessDefaults {
  const name = item.taskName.trim();
  if (!name || name.length > 180) throw new Error('프로세스 항목명을 1~180자로 입력해 주세요.');
  if (!['design', 'admin'].includes(item.category) || typeof item.isMilestone !== 'boolean') throw new Error('항목의 구분과 주요 일정 표시를 확인해 주세요.');
  return { taskName: name, category: item.category, isMilestone: item.isMilestone };
}

function validDuration(value: number) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 36500;
}

export function checkedProcessTemplates(templates: ProcessTemplate[]): ProcessTemplate[] {
  const ids = new Set<string>(), names = new Set<string>();
  if (!templates.length) throw new Error('프로세스 유형을 하나 이상 남겨 주세요.');
  return templates.map(template => {
    const name = template.name.trim();
    if (!validId(template.id) || ids.has(template.id) || !name || name.length > 100 || names.has(name)) {
      throw new Error('프로세스 유형 이름을 1~100자로, 다른 유형과 구분되게 입력해 주세요.');
    }
    ids.add(template.id);
    names.add(name);
    const stepIds = new Set<string>();
    const steps = template.steps.map(step => {
      if (!validId(step.id) || stepIds.has(step.id)) throw new Error('중복된 프로세스 항목이 있습니다.');
      if (!validDuration(step.durationDays) || !Number.isSafeInteger(step.daysBeforeDeadline) || Math.abs(step.daysBeforeDeadline) > 36500) {
        throw new Error('프로세스 항목의 기준일과 기간을 확인해 주세요.');
      }
      stepIds.add(step.id);
      return { id: step.id, ...checkedDetails(step), daysBeforeDeadline: step.daysBeforeDeadline, durationDays: step.durationDays };
    });
    return { id: template.id, name, steps };
  });
}

function findTask(data: CompetitionData, template: ProcessTemplate, step: ProcessStep) {
  const tasks = data.schedules ?? [];
  const linked = tasks.find(task => task.processTemplateId === template.id && task.processStepId === step.id);
  if (linked) return linked;
  // Only infer links for the original competition generator. The task name used
  // for the match never changes, even after multiple office-wide template edits.
  if (template.id !== competitionProcessTemplate.id || data.workspaceKind) return;
  const original = competitionProcessTemplate.steps.find(item => item.id === step.id);
  if (!original) return;
  const unlinked = tasks.filter(task => !task.processStepId && !task.processTemplateId && task.category === original.category);
  const candidates = unlinked.filter(task => task.taskName === original.taskName);
  if (candidates.length) return candidates.length === 1 ? candidates[0] : undefined;
  // Before step IDs existed, changing a title left the historical title on
  // the journal or feedback. Adopt it only when that history is unambiguous.
  const standardNames = new Set(competitionProcessTemplate.steps.map(entry => entry.taskName));
  const history = [...(data.workLogs ?? []), ...(data.feedback ?? [])];
  const historical = unlinked.filter(task => {
    if (standardNames.has(task.taskName)) return false;
    const names = new Set(history.filter(entry => entry.taskId === task.id && standardNames.has(entry.taskName)).map(entry => entry.taskName));
    return names.size === 1 && names.has(original.taskName);
  });
  return historical.length === 1 ? historical[0] : undefined;
}

function inclusiveDays(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
}

export function processRows(data: CompetitionData, template: ProcessTemplate, deadline?: string): ProcessRow[] {
  const anchor = deadline ?? getDeadlineDate(data.submissionDate);
  if (anchor && !isCalendarDate(anchor)) throw new Error('프로세스 기준일을 확인해 주세요.');
  return template.steps.map(step => {
    const task = findTask(data, template, step);
    const draft = data.processDrafts?.find(item => item.templateId === template.id && item.stepId === step.id);
    const original = task && !task.processStepId && template.id === competitionProcessTemplate.id
      ? competitionProcessTemplate.steps.find(item => item.id === step.id) : undefined;
    const defaults = task?.processDefaults ?? original ?? draft?.defaults;
    const current = task ?? draft;
    const taskName = current && defaults && current.taskName !== defaults.taskName ? current.taskName : step.taskName;
    const category = current && defaults && current.category !== 'external' && current.category !== defaults.category ? current.category : step.category;
    const isMilestone = current && defaults && Boolean(current.isMilestone) !== defaults.isMilestone ? Boolean(current.isMilestone) : step.isMilestone;
    const duration = draft && draft.durationDays !== draft.defaults.durationDays ? draft.durationDays : step.durationDays;
    const endDate = task?.endDate ?? (anchor && (!draft || deadline !== undefined) ? offsetProcessDate(anchor, -step.daysBeforeDeadline) : '');
    const startDate = task ? (task.startDate || task.endDate) : endDate ? offsetProcessDate(endDate, 1 - duration) : '';
    const storedRange = task ? [task.startDate || task.endDate, task.endDate, inclusiveDays(task.startDate || task.endDate, task.endDate)].join('|')
      : draft ? '||' + duration : undefined;
    return { stepId: step.id, taskId: task?.id, stored: Boolean(current), storedRange, taskName, category, isMilestone, startDate, endDate,
      durationDays: endDate ? inclusiveDays(startDate, endDate) : duration };
  });
}

const conflict = '다른 곳에서 프로세스 설정을 변경했습니다. 최신 내용을 불러와 다시 저장해 주세요.';

function mergeField<T>(current: T, before: T, requested: T) {
  if (current === before || current === requested) return requested;
  if (before === requested) return current;
  throw new Error(conflict);
}

function mergeRow(current: ProcessRow, before: ProcessRow | undefined, requested: ProcessRow): ProcessRow {
  if (requested.taskId && requested.taskId !== current.taskId || before?.stored && !current.stored) throw new Error(conflict);
  if (!before || !current.stored) return requested;
  const fields: (keyof ProcessDefaults)[] = ['taskName', 'category', 'isMilestone'];
  const result = { ...requested };
  for (const key of fields) {
    Object.assign(result, { [key]: mergeField(current[key], before[key], requested[key]) });
  }
  // A range is a single edit: never combine somebody's new start date with a
  // different person's end date. An unrelated assignee/journal/status edit is safe.
  const dateKey = (row: ProcessRow) => [row.startDate, row.endDate, row.durationDays ?? 1].join('|');
  const dates = mergeField(dateKey(current), before.storedRange ?? dateKey(before), dateKey(requested));
  if (dates === dateKey(current)) {
    result.startDate = current.startDate;
    result.endDate = current.endDate;
    result.durationDays = current.durationDays;
  }
  return result;
}

export function applyProcess(data: CompetitionData, template: ProcessTemplate, rows: ProcessRow[], previousRows?: ProcessRow[]): CompetitionData {
  if (data.workspaceKind === 'office' || data.planning?.archived || ['입선','탈락','드롭'].includes(data.status)) {
    throw new Error('진행할 프로젝트를 선택해 주세요. 완료 프로젝트의 일정은 보존됩니다.');
  }
  const live = new Map(processRows(data, template, '').map(row => [row.stepId, row]));
  const previous = new Map(previousRows?.map(row => [row.stepId, row]));
  const steps = new Map(template.steps.map(step => [step.id, step]));
  const seen = new Set<string>();
  let next = data;
  const tasks = new Map(data.schedules?.map(task => [task.id, task]));
  // Retired or deselected dated tasks remain available to work logs, Notion and reports.
  const drafts = [...(data.processDrafts ?? [])];
  for (const requested of rows) {
    const step = steps.get(requested.stepId), current = live.get(requested.stepId);
    if (!step || !current || seen.has(step.id)) throw new Error('적용할 프로세스 항목을 다시 확인해 주세요.');
    seen.add(step.id);
    const row = mergeRow(current, previous.get(step.id), requested);
    const details = checkedDetails(row);
    const defaults = checkedDetails(step);
    const existing = current.taskId ? tasks.get(current.taskId) : undefined;
    const draftIndex = drafts.findIndex(item => item.templateId === template.id && item.stepId === step.id);
    if (!row.startDate && !row.endDate) {
      if (existing) throw new Error('기존 업무의 날짜를 입력해 주세요.');
      const durationDays = row.durationDays ?? step.durationDays;
      if (!validDuration(durationDays)) throw new Error('항목의 기간을 1일 이상으로 입력해 주세요.');
      const draft = { templateId: template.id, stepId: step.id, ...details, durationDays, defaults: { ...defaults, durationDays: step.durationDays } };
      if (draftIndex < 0) drafts.push(draft);
      else drafts[draftIndex] = draft;
      continue;
    }
    if (!isCalendarDate(row.startDate) || !isCalendarDate(row.endDate) || row.startDate > row.endDate) {
      throw new Error('프로세스 항목의 시작일과 종료일을 확인해 주세요.');
    }
    if (draftIndex >= 0) drafts.splice(draftIndex, 1);
    const id = existing?.id ?? crypto.randomUUID();
    const task: ScheduleItem = { id, status: 'planned', ...existing, ...details,
      ...(existing?.category === 'external' && row.category === current.category ? { category: existing.category } : {}),
      startDate: row.startDate === row.endDate && !existing?.startDate ? undefined : row.startDate, endDate: row.endDate,
      processTemplateId: template.id, processStepId: step.id, processDefaults: defaults };
    if (existing && existing.taskName !== task.taskName) {
      const phase = assignedPhase(next, id, existing.taskName);
      if (phase !== assignedPhase(next, id, task.taskName)) {
        next = applyPlanning(next, { kind: 'setPlan', budgets: [], assignments: [{ key: id, after: phase }] });
      }
    }
    tasks.set(id, task);
  }
  return { ...next, processTemplateId: template.id, processDrafts: drafts,
    schedules: Array.from(tasks.values()).sort((a, b) => a.endDate.localeCompare(b.endDate)) };
}
