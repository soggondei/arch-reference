import type { CompetitionData, DrawingRecord, ProjectActivityChange, ScheduleItem, TaskDeliverable, TaskFeedback, WorkLog } from './types';

function requireDate(value: string) {
  const millis = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 10) !== value) {
    throw new Error('유효한 날짜를 입력해 주세요.');
  }
}

function requireText(value: string, message: string) {
  const text = value.trim();
  if (!text) throw new Error(message);
  return text;
}

function taskName(data: CompetitionData, id: string) {
  const task = data.schedules?.find(item => item.id === id);
  if (!task) throw new Error('업무를 찾을 수 없습니다. 최신 일정을 확인해 주세요.');
  return task.taskName;
}

export function safeDrawingUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}

function normalizeDrawing(input?: DrawingRecord): DrawingRecord | undefined {
  if (!input) return;
  const number = input.number.trim(), version = input.version.trim(), url = input.url.trim(), note = input.note?.trim();
  if (!number && !version && !url && !note) return;
  if (number.length > 160 || version.length > 100 || url.length > 2000 || (note?.length ?? 0) > 1000) {
    throw new Error('도면 번호, 버전, 링크 또는 확인 내용이 너무 깁니다.');
  }
  if (url && !safeDrawingUrl(url)) throw new Error('도면 링크는 http 또는 https 주소로 입력해 주세요.');
  return { number, version, url, ...(note && { note }) };
}

function sameDrawing(a?: DrawingRecord, b?: DrawingRecord) {
  return a?.number === b?.number && a?.version === b?.version && a?.url === b?.url && a?.note === b?.note;
}

function updateDrawing(data: CompetitionData, change: Extract<ProjectActivityChange, { type: 'drawing' }>) {
  const feedback = data.feedback?.find(item => item.id === change.feedbackId);
  if (!feedback) throw new Error('피드백을 찾을 수 없습니다. 새로고침해 주세요.');
  if (change.field === 'resultDrawing' && !feedback.followUpTaskId) throw new Error('후속 업무를 먼저 연결해 주세요.');
  const next = normalizeDrawing(change.value);
  if (sameDrawing(feedback[change.field], next)) return data;
  if (!sameDrawing(feedback[change.field], change.previous)) throw new Error('도면 정보가 변경되었습니다. 최신 내용을 확인해 주세요.');
  return { ...data, feedback: data.feedback!.map(item => item.id === feedback.id ? { ...item, [change.field]: next } : item) };
}

function sameDeliverable(a?: TaskDeliverable, b?: TaskDeliverable) {
  return a?.id === b?.id && a?.title === b?.title && a?.criteria === b?.criteria && a?.checked === b?.checked;
}

function updateDeliverable(data: CompetitionData, change: Extract<ProjectActivityChange, { type: 'deliverable' }>) {
  const schedules = data.schedules ?? [];
  const task = schedules.find(item => item.id === change.taskId);
  if (!task) throw new Error('제출물을 연결할 업무를 찾을 수 없습니다.');
  const items = task.deliverables ?? [];
  const current = items.find(item => item.id === change.id);
  let next: TaskDeliverable | undefined;
  if (change.value) {
    const title = requireText(change.value.title, '제출물 이름을 입력해 주세요.');
    const criteria = change.value.criteria.trim();
    if (!change.id || change.value.id !== change.id || typeof change.value.checked !== 'boolean' ||
        title.length > 160 || criteria.length > 500) throw new Error('제출물 이름과 완료 기준을 확인해 주세요.');
    next = { id: change.id, title, criteria, checked: change.value.checked };
  }
  if (sameDeliverable(current, next)) return data;
  if (!sameDeliverable(current, change.previous)) throw new Error('제출물이 변경되었습니다. 최신 내용을 확인해 주세요.');
  const deliverables = items.filter(item => item.id !== change.id);
  if (next) deliverables.splice(current ? items.indexOf(current) : deliverables.length, 0, next);
  return { ...data, schedules: schedules.map(item => item.id === task.id ? { ...item, deliverables } : item) };
}

function sameLog(a: WorkLog, b: WorkLog) {
  return a.id === b.id && a.taskId === b.taskId && a.date === b.date &&
    a.author === b.author && a.body === b.body && a.minutes === b.minutes;
}

function saveLog(data: CompetitionData, input: WorkLog, previous?: WorkLog): CompetitionData {
  requireText(input.id, '일지 ID가 필요합니다.');
  requireDate(input.date);
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440) {
    throw new Error('투입시간은 하루 기준 1분부터 1,440분까지 입력할 수 있습니다.');
  }
  const logs = data.workLogs ?? [];
  const existing = logs.find(log => log.id === input.id);
  if ((existing && existing.taskId !== input.taskId) || (previous && !existing)) {
    throw new Error('일지의 원래 업무가 변경되었습니다. 다시 열어 주세요.');
  }
  // Keep the original title even when a historic task was renamed or removed.
  const log: WorkLog = {
    id: input.id, taskId: input.taskId, taskName: existing?.taskName ?? taskName(data, input.taskId),
    author: requireText(input.author, '작성자를 입력해 주세요.'), date: input.date, minutes: input.minutes,
    body: requireText(input.body, '업무 내용을 입력해 주세요.'),
  };
  if (!existing) return { ...data, workLogs: [...logs, log] };
  if (sameLog(existing, log)) return data;
  if (!previous || !sameLog(existing, previous)) {
    throw new Error('다른 변경이 저장된 일지입니다. 최신 내용을 확인한 뒤 수정해 주세요.');
  }
  return { ...data, workLogs: logs.map(item => item.id === log.id ? log : item) };
}

function addFeedback(data: CompetitionData, input: TaskFeedback): CompetitionData {
  requireText(input.id, '피드백 ID가 필요합니다.');
  requireDate(input.date);
  const body = requireText(input.body, '피드백 내용을 입력해 주세요.');
  const author = requireText(input.author, '작성자를 입력해 주세요.');
  const reviewedDrawing = normalizeDrawing(input.reviewedDrawing);
  const entries = data.feedback ?? [];
  const existing = entries.find(entry => entry.id === input.id);
  if (existing) {
    if (existing.taskId === input.taskId && existing.workLogId === input.workLogId && existing.date === input.date &&
      existing.author === author && existing.body === body && sameDrawing(existing.reviewedDrawing, reviewedDrawing)) return data;
    throw new Error('이미 저장된 피드백입니다. 최신 내용을 확인해 주세요.');
  }
  if (input.workLogId && !data.workLogs?.some(log => log.id === input.workLogId && log.taskId === input.taskId)) {
    throw new Error('이 업무에서 연결할 일지를 찾을 수 없습니다.');
  }
  const feedback: TaskFeedback = {
    id: input.id, taskId: input.taskId, taskName: taskName(data, input.taskId), author, date: input.date, body,
    ...(input.workLogId && { workLogId: input.workLogId }),
    ...(reviewedDrawing && { reviewedDrawing }),
  };
  return { ...data, feedback: [...entries, feedback] };
}

function createFollowUp(data: CompetitionData, feedbackId: string, input: ScheduleItem): CompetitionData {
  const feedback = data.feedback?.find(item => item.id === feedbackId);
  if (!feedback) throw new Error('후속 업무로 연결할 피드백을 찾을 수 없습니다.');
  if (feedback.followUpTaskId) return data;

  requireText(input.id, '후속 업무 ID가 필요합니다.');
  requireDate(input.endDate);
  const schedules = data.schedules ?? [];
  if (schedules.some(item => item.id === input.id)) throw new Error('이미 등록된 업무 ID입니다.');
  if (!['admin', 'design', 'external'].includes(input.category)) throw new Error('업무 구분을 선택해 주세요.');
  const task: ScheduleItem = {
    id: input.id, taskName: requireText(input.taskName, '후속 업무명을 입력해 주세요.'),
    category: input.category, endDate: input.endDate, status: 'planned', assignee: input.assignee?.trim() || undefined,
  };
  return {
    ...data,
    schedules: [...schedules, task].sort((a, b) => a.endDate.localeCompare(b.endDate)),
    feedback: data.feedback!.map(item => item.id === feedbackId ? { ...item, followUpTaskId: task.id } : item),
  };
}

export function applyProjectActivity(data: CompetitionData, change: Exclude<ProjectActivityChange, { type: 'planning' }>): CompetitionData {
  switch (change.type) {
    case 'deliverable': return updateDeliverable(data, change);
    case 'drawing': return updateDrawing(data, change);
    case 'saveLog': return saveLog(data, change.log, change.previous);
    case 'addFeedback': return addFeedback(data, change.feedback);
    case 'followUp': return createFollowUp(data, change.feedbackId, change.task);
    case 'linkReference':
    case 'unlinkReference': {
      const links = data.referenceLinks ?? [];
      const existing = links.find(item => item.referenceId === change.referenceId);
      if (change.type === 'unlinkReference') {
        if (!existing) return data;
        if ((change.previousNote !== undefined && existing.note !== change.previousNote) || (existing.decision ?? '') !== (change.previousDecision ?? '')) {
          throw new Error('레퍼런스 메모가 변경되었습니다. 확인 후 연결을 해제해 주세요.');
        }
        return { ...data, referenceLinks: links.filter(item => item.referenceId !== change.referenceId) };
      }
      requireText(change.referenceId, '연결할 레퍼런스를 선택해 주세요.');
      const note = change.note.trim();
      const decision = change.decision === undefined ? existing?.decision : (change.decision.trim() || undefined);
      if (note.length > 500 || (decision?.length ?? 0) > 500) throw new Error('활용 메모와 설계 결정은 각각 500자까지 입력할 수 있습니다.');
      if (existing && existing.note === note && existing.decision === decision) return data;
      if (existing?.note !== change.previousNote ||
        (change.decision !== undefined && existing?.decision !== (change.previousDecision || undefined))) {
        throw new Error('레퍼런스 연결이 변경되었습니다. 최신 메모를 확인해 주세요.');
      }
      const link = { referenceId: change.referenceId, note, ...(decision && { decision }) };
      return { ...data, referenceLinks: existing ? links.map(item => item.referenceId === link.referenceId ? link : item) : [...links, link] };
    }
  }
}
