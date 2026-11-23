import type { CompetitionData, ProjectActivityChange, ScheduleItem, TaskFeedback, WorkLog } from './types';

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
  const entries = data.feedback ?? [];
  const existing = entries.find(entry => entry.id === input.id);
  if (existing) {
    if (existing.taskId === input.taskId && existing.workLogId === input.workLogId && existing.date === input.date &&
      existing.author === author && existing.body === body) return data;
    throw new Error('이미 저장된 피드백입니다. 최신 내용을 확인해 주세요.');
  }
  if (input.workLogId && !data.workLogs?.some(log => log.id === input.workLogId && log.taskId === input.taskId)) {
    throw new Error('이 업무에서 연결할 일지를 찾을 수 없습니다.');
  }
  const feedback: TaskFeedback = {
    id: input.id, taskId: input.taskId, taskName: taskName(data, input.taskId), author, date: input.date, body,
    ...(input.workLogId && { workLogId: input.workLogId }),
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

export function applyProjectActivity(data: CompetitionData, change: ProjectActivityChange): CompetitionData {
  switch (change.type) {
    case 'saveLog': return saveLog(data, change.log, change.previous);
    case 'addFeedback': return addFeedback(data, change.feedback);
    case 'followUp': return createFollowUp(data, change.feedbackId, change.task);
    case 'linkReference':
    case 'unlinkReference': {
      const links = data.referenceLinks ?? [];
      const existing = links.find(item => item.referenceId === change.referenceId);
      if (change.type === 'unlinkReference') {
        if (!existing) return data;
        if (change.previousNote !== undefined && existing.note !== change.previousNote) {
          throw new Error('레퍼런스 메모가 변경되었습니다. 확인 후 연결을 해제해 주세요.');
        }
        return { ...data, referenceLinks: links.filter(item => item.referenceId !== change.referenceId) };
      }
      requireText(change.referenceId, '연결할 레퍼런스를 선택해 주세요.');
      const note = change.note.trim();
      if (existing?.note === note) return data;
      if (existing?.note !== change.previousNote) {
        throw new Error('레퍼런스 연결이 변경되었습니다. 최신 메모를 확인해 주세요.');
      }
      const link = { referenceId: change.referenceId, note };
      return { ...data, referenceLinks: existing ? links.map(item => item.referenceId === link.referenceId ? link : item) : [...links, link] };
    }
  }
}
