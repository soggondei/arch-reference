import { supabase } from './supabase';
import type { Reference, Collection, CompetitionData, BidParticipation, OfficeSchedulePatch, ScheduleItem, TaskDates, ProjectActivityChange } from './types';
import { isCalendarDate, isOfficialCalendarTask, redateOfficialCalendarTasks } from './project-calendar';
import { normalizeRegistrationSchedule } from './competition-dates';
import { mergeCompetitionEdit, recordTaskCompletions } from './competition-edits';
import { attendanceDate } from './attendance';
import { applyProjectActivity } from './project-activity';
import { applyPlanning, trackCompetitionTransition } from './project-planning';
import { suggestedProjectColor } from './project-color';
import { isWorkspaceProject } from './workspace-navigation';

// ── Row mappers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRef(row: any): Reference {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url ?? '',
    sourceUrl: row.source_url ?? undefined,
    refType: row.ref_type ?? undefined,
    architect: row.architect ?? undefined,
    year: row.year ?? undefined,
    description: row.description ?? undefined,
    tags: row.tags ?? { program: [], material: [], mass: [], scale: '', designItem: [], site: [], region: '' },
    collectionIds: row.collection_ids ?? [],
    createdAt: row.created_at,
    competitionData: row.competition_data ? normalizeRegistrationSchedule(row.competition_data) : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCollection(row: any): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color,
    createdAt: row.created_at,
  };
}

// ── References ──────────────────────────────────────────────────────────────

export async function getRefs({ includeOffice = false } = {}): Promise<Reference[]> {
  let query = supabase.from('refs').select('*');
  if (!includeOffice) query = query.is('competition_data->>workspaceKind', null);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRef);
}

function refRow(ref: Reference) {
  return {
    id: ref.id,
    title: ref.title,
    image_url: ref.imageUrl || null,
    source_url: ref.sourceUrl || null,
    ref_type: ref.refType || null,
    architect: ref.architect || null,
    year: ref.year || null,
    description: ref.description || null,
    tags: ref.tags,
    collection_ids: ref.collectionIds,
    created_at: ref.createdAt,
    competition_data: ref.competitionData ?? null,
  };
}

export async function addRef(ref: Reference): Promise<void> {
  const next = ref.competitionData && !ref.competitionData.projectColor && isWorkspaceProject(ref)
    ? { ...ref, competitionData: await assignProjectColor(ref.id, ref.competitionData) } : ref;
  const { error } = await supabase.from('refs').insert(refRow(next));
  if (error) throw error;
}

export async function updateRef(updated: Reference): Promise<void> {
  const { error } = await supabase
    .from('refs')
    .update({
      title: updated.title,
      image_url: updated.imageUrl || null,
      source_url: updated.sourceUrl || null,
      ref_type: updated.refType || null,
      architect: updated.architect || null,
      year: updated.year || null,
      description: updated.description || null,
      tags: updated.tags,
      collection_ids: updated.collectionIds,
    })
    .eq('id', updated.id);
  if (error) throw error;
}

async function assignProjectColor(id: string, competitionData: CompetitionData): Promise<CompetitionData> {
  const existing: Pick<Reference, 'id' | 'competitionData'>[] = [];
  const pageSize = 200;
  // Select only the color and active/archived markers of workspace projects.
  const scope = ['competition_data->>workspaceKind.not.is.null', 'competition_data->>status.neq.관심',
    ...['schedules', 'workLogs', 'feedback', 'referenceLinks'].map(key => 'competition_data->' + key + '->0.not.is.null')].join(',');
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('refs')
      .select('id,projectColor:competition_data->>projectColor,status:competition_data->>status,workspaceKind:competition_data->>workspaceKind,archived:competition_data->planning->archived')
      .or(scope).order('id').range(offset, offset + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      existing.push({ id: row.id, competitionData: {
        status: row.status as CompetitionData['status'], projectColor: row.projectColor,
        workspaceKind: row.workspaceKind as CompetitionData['workspaceKind'], planning: { archived: row.archived === true },
      } });
    }
    if (!data || data.length < pageSize) break;
  }
  return { ...competitionData, projectColor: suggestedProjectColor({ id, competitionData }, existing) };
}

async function editCompetition(id: string, edit: (current: CompetitionData) => CompetitionData, newOfficeRecord = false): Promise<Reference> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error: readError } = await supabase.from('refs').select('*').eq('id', id).single();
    if (readError) throw readError;
    const ref = toRef(row);
    if (!ref.competitionData) throw new Error('프로젝트를 찾을 수 없습니다.');
    const edited = normalizeRegistrationSchedule(edit(ref.competitionData));
    let next = recordTaskCompletions(ref.competitionData, edited, attendanceDate(new Date()));
    if (!next.projectColor && (newOfficeRecord || (!isWorkspaceProject(ref) && isWorkspaceProject({ competitionData: next })))) {
      next = await assignProjectColor(id, next);
    }
    if (JSON.stringify(next) === JSON.stringify(row.competition_data)) return ref;

    const revision = ref.competitionData.scheduleRevision;
    const update = supabase.from('refs').update({
      competition_data: { ...next, scheduleRevision: (revision ?? 0) + 1 },
    }).eq('id', id);
    // Match the JSON revision in the UPDATE itself (including legacy NULL).
    // A competing writer wins the same revision once, then we reapply our edit.
    const guarded = revision === undefined
      ? update.is('competition_data->>scheduleRevision', null)
      : update.eq('competition_data->>scheduleRevision', String(revision));
    const { data: saved, error } = await guarded.select('*').maybeSingle();
    if (error) throw error;
    if (saved) return toRef(saved);
  }
  throw new Error('다른 변경사항과 겹쳐 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

export async function updateCompetitionStatus(id: string, next: CompetitionData, before: CompetitionData): Promise<CompetitionData> {
  const transition = before.status !== next.status
    ? { id: crypto.randomUUID(), day: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()) } : null;
  const saved = await editCompetition(id, current => {
    if (transition && current.status !== before.status && current.status !== next.status) {
      throw new Error('공모 상태가 변경되었습니다. 최신 상태를 확인해 주세요.');
    }
    const merged = redateOfficialCalendarTasks(current, mergeCompetitionEdit(current, before, next));
    return transition ? trackCompetitionTransition(current, merged, transition.id, transition.day) : merged;
  });
  return saved.competitionData!;
}

export async function saveProjectActivity(projectId: string, change: ProjectActivityChange): Promise<Reference> {
  if (change.type === 'planning') return editCompetition(projectId, current => applyPlanning(current, change.edit));
  if (change.type === 'linkReference') {
    const { data, error } = await supabase.from('refs').select('id, ref_type')
      .eq('id', change.referenceId).is('competition_data', null).maybeSingle();
    if (error) throw error;
    if (!data || data.ref_type === 'link') throw new Error('라이브러리에서 연결할 레퍼런스를 찾을 수 없습니다.');
  }
  return editCompetition(projectId, current => applyProjectActivity(current, change));
}

function checkTaskDates(task: TaskDates) {
  if (!isCalendarDate(task.endDate) || (task.startDate && (!isCalendarDate(task.startDate) || task.startDate > task.endDate))
    || (task.endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.endTime))) {
    throw new Error('시작일과 마감일, 마감 시각을 확인해 주세요.');
  }
}

export async function patchOfficeSchedule(id: string, scheduleId: string, patch: OfficeSchedulePatch, previousDates?: TaskDates): Promise<CompetitionData> {
  const saved = await editCompetition(id, current => {
    const schedules = current.schedules ?? [];
    const task = schedules.find(item => item.id === scheduleId);
    if (!task) throw new Error('해당 일정이 삭제되었습니다. 목록을 새로고침해 주세요.');
    const updated = { ...task, ...patch };
    const dateKeys = ['startDate', 'endDate', 'endTime'] as const;
    if (dateKeys.some(key => key in patch && task[key] !== updated[key])) {
      if (isOfficialCalendarTask({ competitionData: current }, task)) throw new Error('공식 일정 날짜는 공모 상세에서 수정해 주세요.');
      if (previousDates && dateKeys.some(key => task[key] !== previousDates[key])) throw new Error('다른 곳에서 일정 날짜를 변경했습니다. 업무를 다시 열어 확인해 주세요.');
      checkTaskDates(updated);
    }
    return {
      ...current,
      schedules: schedules.map(item => item.id === scheduleId ? updated : item),
    };
  });
  return saved.competitionData!;
}

const COMMON_OFFICE_ID = 'lv-lab-office-common';

function officeProject(id: string, title: string, kind: 'project' | 'office', pm?: string): Reference {
  return {
    id, title, imageUrl: '', collectionIds: [], createdAt: new Date().toISOString(),
    tags: { program: [], material: [], mass: [], scale: '', designItem: [], site: [], region: '' },
    competitionData: { status: '작업중', workspaceKind: kind, pm: pm?.trim() || undefined, schedules: [] },
  };
}

async function insertOfficeRecord(ref: Reference) {
  const { error } = await supabase.from('refs').upsert(refRow(ref), { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function createOfficeProject(title: string, pm: string | undefined, id: string): Promise<Reference> {
  if (!title.trim()) throw new Error('프로젝트명을 입력해 주세요.');
  await insertOfficeRecord(officeProject(id, title.trim(), 'project', pm));
  return editCompetition(id, current => current, true);
}

export async function addOfficeTask(projectId: string | null, task: ScheduleItem): Promise<Reference> {
  checkTaskDates(task);
  if (projectId === null) {
    const common = officeProject(COMMON_OFFICE_ID, '사무소 공통 업무', 'office');
    await insertOfficeRecord(common);
  }
  return editCompetition(projectId ?? COMMON_OFFICE_ID, current => {
    const schedules = current.schedules ?? [];
    if (schedules.some(item => item.id === task.id)) return current;
    return { ...current, schedules: [...schedules, task].sort((a, b) => a.endDate.localeCompare(b.endDate)) };
  }, projectId === null);
}

export async function deleteRef(id: string): Promise<void> {
  const { error } = await supabase.from('refs').delete().eq('id', id);
  if (error) throw error;
}

// Notion 스케줄 페이지 아카이브 (백그라운드, fire-and-forget)
export function archiveRefNotionSchedules(ref: Reference | null | undefined): void {
  ref?.competitionData?.schedules
    ?.filter(s => s.notionPageId)
    .forEach(s => {
      fetch('/api/notion-schedule', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notionPageId: s.notionPageId }),
      }).catch(() => {});
    });
}

// ── Collections ─────────────────────────────────────────────────────────────

export async function getCollections(): Promise<Collection[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toCollection);
}

export async function addCollection(col: Collection): Promise<void> {
  const { error } = await supabase.from('collections').insert({
    id: col.id,
    name: col.name,
    description: col.description || null,
    color: col.color,
    created_at: col.createdAt,
  });
  if (error) throw error;
}

export async function deleteCollection(id: string): Promise<void> {
  const { error: e1 } = await supabase.from('collections').delete().eq('id', id);
  if (e1) throw e1;

  const { data: affected } = await supabase
    .from('refs')
    .select('id, collection_ids')
    .contains('collection_ids', [id]);

  if (affected && affected.length > 0) {
    await Promise.all(
      affected.map(r =>
        supabase
          .from('refs')
          .update({ collection_ids: (r.collection_ids as string[]).filter((cid: string) => cid !== id) })
          .eq('id', r.id)
      )
    );
  }
}

// ── Bid Participations ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBidParticipation(row: any): BidParticipation {
  return {
    bidNo: row.bid_no,
    status: row.status,
    submittedPrice: row.submitted_price ?? null,
    submittedDate: row.submitted_date ?? null,
  };
}

export async function getBidParticipations(): Promise<BidParticipation[]> {
  const { data, error } = await supabase.from('bid_participations').select('*');
  if (error) throw error;
  return (data ?? []).map(toBidParticipation);
}

export async function upsertBidParticipation(p: BidParticipation): Promise<void> {
  const { error } = await supabase.from('bid_participations').upsert({
    bid_no: p.bidNo,
    status: p.status,
    submitted_price: p.status === '참가완료' ? p.submittedPrice : null,
    submitted_date: p.status === '참가완료' ? p.submittedDate : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ── Image Upload ────────────────────────────────────────────────────────────

export async function uploadImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${generateId()}.${ext}`;
  const { error } = await supabase.storage
    .from('reference-images')
    .upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('reference-images').getPublicUrl(path);
  return data.publicUrl;
}

// ── Utils ────────────────────────────────────────────────────────────────────

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
