import type { CompetitionData, WorkLog } from './types';

export type PhaseId = string;
export type Phase = { id: PhaseId; label: string };
export type Outcome = '제출완료' | '입선' | '탈락' | '드롭' | '종료';
export interface ReviewInput {
  id: string;
  day: string;
  outcome: Outcome;
  phase: PhaseId | null;
  reason: string;
  lesson: string;
  reusable: string;
  url: string;
  minutes: number | null;
}
export type Closeout = ReviewInput & { version: number };
export interface ProjectPlan {
  phases?: Phase[];
  budgets?: Record<PhaseId, number>;
  assignments?: Record<string, PhaseId | null>;
  closeouts?: Closeout[];
  currentCloseout?: string | null;
  lifecycleRevision?: number;
  archived?: boolean;
}
type Patch<T> = { key: string; before?: T; after?: T };
type PlanningEdit =
  | { kind: 'setPlan'; budgets: Patch<number>[]; assignments: Patch<PhaseId | null>[] }
  | { kind: 'addPhase'; phase: Phase }
  | { kind: 'saveReview'; review: ReviewInput; previousVersion: number | null; lifecycleRevision: number }
  | { kind: 'complete'; id: string; day: string; lifecycleRevision: number }
  | { kind: 'reopen'; lifecycleRevision: number };
export type PlanningChange = { type: 'planning'; edit: PlanningEdit };

const competitionPhases: Phase[] = [
  { id: 'research', label: '조사' }, { id: 'concept', label: '계획안' },
  { id: 'production', label: '도면·설명서' }, { id: 'submission', label: '제출' },
];
const contractPhases: Phase[] = [
  { id: 'brief', label: '기획' }, { id: 'scheme', label: '계획설계' }, { id: 'development', label: '중간설계' },
  { id: 'documents', label: '실시설계' }, { id: 'permits', label: '인허가' }, { id: 'delivery', label: '납품' },
];
// Only exact names from the competition template are suggested. Schedules,
// markers such as registration deadlines, and historical work logs stay intact.
const standardTaskPhases = new Map<string, string>([
  ['대지조사 및 사례조사', 'research'], ['사례조사 회의', 'research'],
  ['아이디어 회의', 'concept'], ['계획안 검토', 'concept'], ['계획안 회의', 'concept'], ['컨셉작업', 'concept'],
  ['도면작업', 'production'], ['모델링작업', 'production'], ['설명서 목업', 'production'],
  ['다이어그램 및 텍스트 작업', 'production'], ['다이어그램 스케치', 'production'],
  ['인쇄물 점검', 'submission'], ['제출물 제본', 'submission'], ['기타서류 점검', 'submission'], ['작품접수', 'submission'],
]);
const conflict = '다른 변경이 저장되었습니다. 최신 값을 확인한 뒤 다시 저장해 주세요.';

export function phasesFor(data: CompetitionData): Phase[] {
  return [...(data.workspaceKind ? contractPhases : competitionPhases), ...(data.planning?.phases ?? [])];
}

export function suggestedPhase(data: CompetitionData, taskName: string) {
  return data.workspaceKind ? null : standardTaskPhases.get(taskName.trim()) ?? null;
}

function own<T>(values: Record<string, T> | undefined, key: string) {
  return values && Object.hasOwn(values, key) ? values[key] : undefined;
}

export function assignedPhase(data: CompetitionData, id: string, name: string) {
  const override = own(data.planning?.assignments, id);
  return override === undefined ? suggestedPhase(data, name) : override;
}

export function phaseSummary(data: CompetitionData, sharedLogs: WorkLog[] = [], throughDay?: string) {
  const catalog = phasesFor(data);
  const schedule = new Map(data.schedules?.map(t => [t.id, t.taskName]));
  const logs = new Map([...(data.workLogs ?? []), ...sharedLogs].map(log => [log.id, log]));
  const totals = new Map<PhaseId | null, number>();
  const ids = new Set(catalog.map(p => p.id));
  let totalActual = 0;
  for (const log of logs.values()) {
    if (throughDay && log.date > throughDay) continue;
    const assigned = assignedPhase(data, log.taskId, schedule.get(log.taskId) ?? log.taskName);
    const id = assigned && ids.has(assigned) ? assigned : null;
    totals.set(id, (totals.get(id) ?? 0) + log.minutes);
    totalActual += log.minutes;
  }
  const rows: { id: PhaseId | null; label: string; plannedMinutes: number | null; actualMinutes: number }[] =
    catalog.map(phase => ({ ...phase, plannedMinutes: own(data.planning?.budgets, phase.id) ?? null, actualMinutes: totals.get(phase.id) ?? 0 }));
  rows.push({ id: null, label: '미분류', plannedMinutes: null, actualMinutes: totals.get(null) ?? 0 });
  return { rows, totalActual, totalPlanned: rows.reduce((sum, r) => sum + (r.plannedMinutes ?? 0), 0),
    hasPlan: rows.some(r => r.plannedMinutes !== null) };
}

function terminal(status: string): status is Exclude<Outcome, '종료'> {
  return ['제출완료', '입선', '탈락', '드롭'].includes(status);
}

// This runs inside the same compare-and-swap as the competition status change.
// A later transition starts a new entry; reopening keeps previous reviews.
export function trackCompetitionTransition(before: CompetitionData, next: CompetitionData, id: string, day: string): CompetitionData {
  if (next.workspaceKind || before.status === next.status) return next;
  const p = next.planning ?? {};
  if (!terminal(next.status) && !terminal(before.status) && !p.currentCloseout) return next;
  const lifecycleRevision = (p.lifecycleRevision ?? 0) + 1;
  if (!terminal(next.status)) return { ...next, planning: { ...p, lifecycleRevision, currentCloseout: null } };
  const pending: Closeout = { id, day, outcome: next.status, phase: null, reason: '', lesson: '', reusable: '', url: '', minutes: null, version: 1 };
  return { ...next, planning: { ...p, lifecycleRevision, currentCloseout: id, closeouts: [...(p.closeouts ?? []), pending] } };
}

function safeKey(value: string) {
  return typeof value === 'string' && value.length > 0 && value.length <= 500 && !['__proto__', 'constructor', 'prototype'].includes(value);
}

function patchMap<T>(map: Record<string,T> | undefined, edits: Patch<T>[], valid: (key: string, value: T | undefined) => boolean) {
  let result = map;
  for (const {key, before, after} of edits) {
    if (!safeKey(key) || !valid(key, after)) throw new Error('단계 설정을 확인해 주세요.');
    const old = own(result, key);
    if (old === after) continue;
    if (old !== before) throw new Error(conflict);
    if (result === map) result = { ...map };
    if (after === undefined) delete result![key];
    else result![key] = after;
  }
  return result;
}

function checkedReview(data: CompetitionData, input: ReviewInput): ReviewInput {
  const timestamp = Date.parse(input.day);
  if (!safeKey(input.id) || !/^\d{4}-\d{2}-\d{2}$/.test(input.day) || !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString().slice(0,10) !== input.day) throw new Error('종료·드롭 날짜를 확인해 주세요.');
  const outcomes: Outcome[] = data.workspaceKind ? ['종료', '드롭'] : ['제출완료', '입선', '탈락', '드롭'];
  if (!outcomes.includes(input.outcome) || (input.phase !== null && !phasesFor(data).some(p => p.id === input.phase))) throw new Error('결과와 당시 단계를 확인해 주세요.');
  if (!Number.isSafeInteger(input.minutes) || input.minutes === null || input.minutes < 0) throw new Error('프로젝트 투입시간을 다시 불러와 주세요.');
  const reason=input.reason.trim(), lesson=input.lesson.trim(), reusable=input.reusable.trim(), url=input.url.trim();
  if (!reason) throw new Error('결과 또는 중단 이유를 입력해 주세요.');
  if ([reason,lesson,reusable,url].some(s => s.length>2000)) throw new Error('회고 항목은 2,000자 안으로 적어 주세요.');
  if (url && !URL.canParse(url)) throw new Error('자료 링크는 전체 웹 주소로 입력해 주세요.');
  if (url && !['https:', 'http:'].includes(new URL(url).protocol)) throw new Error('http 또는 https 자료 링크를 입력해 주세요.');
  return { ...input, reason, lesson, reusable, url };
}

function sameReview(a: ReviewInput, b: ReviewInput) {
  return a.id===b.id && a.day===b.day && a.outcome===b.outcome && a.phase===b.phase && a.reason===b.reason &&
    a.lesson===b.lesson && a.reusable===b.reusable && a.url===b.url && a.minutes===b.minutes;
}

export function applyPlanning(data: CompetitionData, edit: PlanningEdit): CompetitionData {
  if (data.workspaceKind === 'office') throw new Error('프로젝트를 선택해 주세요.');
  const p = data.planning ?? {};
  const lifecycleRevision = p.lifecycleRevision ?? 0;
  if (edit.kind === 'complete') {
    if (data.workspaceKind !== 'project') throw new Error('일반 프로젝트를 선택해 주세요.');
    if (p.archived) return data;
    if (edit.lifecycleRevision !== lifecycleRevision || p.closeouts?.some(entry => entry.id === edit.id)) throw new Error(conflict);
    const stamp = Date.parse(edit.day);
    if (!safeKey(edit.id) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== edit.day) throw new Error('완료일을 확인해 주세요.');
    const entry: Closeout = { id: edit.id, day: edit.day, outcome: '종료', phase: null, reason: '', lesson: '', reusable: '', url: '', minutes: null, version: 1 };
    return { ...data, planning: { ...p, archived: true, lifecycleRevision: lifecycleRevision + 1,
      currentCloseout: entry.id, closeouts: [...(p.closeouts ?? []), entry] } };
  }
  if (edit.kind === 'setPlan') {
    const ids = new Set(phasesFor(data).map(phase => phase.id));
    const budgets = patchMap(p.budgets, edit.budgets, (key, n) => ids.has(key) && (n === undefined || Number.isSafeInteger(n) && n>=0));
    const assignments = patchMap(p.assignments, edit.assignments, (_key, id) => id === undefined || id === null || ids.has(id));
    return budgets === p.budgets && assignments === p.assignments ? data : { ...data, planning: { ...p, budgets, assignments } };
  }
  if (edit.kind === 'addPhase') {
    const {id} = edit.phase;
    const label = edit.phase.label.trim();
    if (!safeKey(id) || !label || label.length > 60) throw new Error('단계 이름을 1~60자로 입력해 주세요.');
    const phases = phasesFor(data);
    if (phases.some(phase => phase.id === id && phase.label === label)) return data;
    if (phases.some(phase => phase.id === id || phase.label === label)) throw new Error('이미 있는 단계입니다.');
    return { ...data, planning: { ...p, phases: [...(p.phases ?? []), {id, label}] } };
  }
  if (edit.kind === 'reopen') {
    if (!data.workspaceKind) throw new Error('공모 상태는 공모 상세에서 변경해 주세요.');
    if (!p.archived) return data;
    if (edit.lifecycleRevision !== lifecycleRevision) throw new Error(conflict);
    return { ...data, planning: { ...p, archived: false, currentCloseout: null, lifecycleRevision: lifecycleRevision + 1 } };
  }
  const review = checkedReview(data, edit.review);
  const old = p.closeouts?.find(r => r.id===review.id);
  if (old && sameReview(old, review)) return data;
  if ((old?.version ?? null) !== edit.previousVersion || (old && old.outcome !== review.outcome)) throw new Error(conflict);
  const entry: Closeout = { ...review, version: (old?.version ?? 0) + 1 };
  if (old) return { ...data, planning: { ...p, closeouts: p.closeouts!.map(r => r.id === old.id ? entry : r) } };
  if (edit.lifecycleRevision !== lifecycleRevision || p.currentCloseout || (terminal(data.status) && !data.workspaceKind && data.status !== entry.outcome)) throw new Error(conflict);
  return { ...data, ...(!data.workspaceKind && entry.outcome !== '종료' && {status: entry.outcome}), planning: { ...p,
    ...(data.workspaceKind && {archived:true}), currentCloseout: entry.id, lifecycleRevision: lifecycleRevision+1, closeouts: [...(p.closeouts ?? []),entry] } };
}
