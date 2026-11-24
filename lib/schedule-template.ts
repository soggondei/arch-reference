import type { ScheduleItem } from './types';
import type { ProcessStep, ProcessTemplate } from './process-template';
import { competitionPeriod, getDeadlineDate } from './competition-dates';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function offsetProcessDate(date: string, days: number): string {
  const result = new Date(date + 'T00:00:00Z');
  result.setUTCDate(result.getUTCDate() + days);
  if (!Number.isFinite(result.getTime()) || result.getUTCFullYear() < 1 || result.getUTCFullYear() > 9999) {
    throw new Error('계산한 일정이 날짜 범위를 벗어납니다. 기준일 또는 기간을 확인해 주세요.');
  }
  return result.toISOString().slice(0, 10);
}

export function processStep(id: string, taskName: string, category: ProcessStep['category'], daysBeforeDeadline: number,
  durationDays = 1, isMilestone = false): ProcessStep {
  return { id, taskName, category, daysBeforeDeadline, durationDays, isMilestone };
}

export const competitionProcessTemplate: ProcessTemplate = {
  id: 'competition-design', name: '현상설계',
  steps: [
    processStep('kickoff', '킥오프', 'admin', 25, 1, true),
    processStep('site-research', '대지조사 및 사례조사', 'design', 23, 2),
    processStep('research-meeting', '사례조사 회의', 'admin', 22, 1, true),
    processStep('concept', '컨셉작업', 'design', 21, 2),
    processStep('ideas', '아이디어 회의', 'admin', 20, 1, true),
    processStep('plan-review', '계획안 검토', 'design', 18, 3),
    processStep('plan-meeting', '계획안 회의', 'admin', 17, 1, true),
    processStep('production-start', '제출물 작업시작', 'design', 16, 1, true),
    processStep('drawings', '도면작업', 'design', 5, 12),
    processStep('mockup', '설명서 목업', 'design', 14),
    processStep('model', '모델링작업', 'design', 12, 2),
    processStep('diagram-sketch', '다이어그램 스케치', 'design', 11),
    processStep('feedback', '제출물 1차 피드백', 'admin', 10, 1, true),
    processStep('diagram-text', '다이어그램 및 텍스트 작업', 'design', 7, 3),
    processStep('proof', '인쇄물 점검', 'admin', 4),
    processStep('final-revision', '최종수정', 'design', 3),
    processStep('binding', '제출물 제본', 'admin', 2),
    processStep('documents', '기타서류 점검', 'admin', 1),
  ],
};

export function generateScheduleTemplate(params: {
  submissionDate?: string;
  registrationDate?: string;
  announcementDate?: string;
  resultDate?: string;
}, template: ProcessTemplate | null = competitionProcessTemplate): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const submission = competitionPeriod(params.submissionDate);
  const registration = competitionPeriod(params.registrationDate);
  const announcementDate = competitionPeriod(params.announcementDate)?.firstDate;
  const resultDate = getDeadlineDate(params.resultDate);

  if (announcementDate) {
    items.push({ id: generateId(), taskName: '공고', category: 'external', endDate: announcementDate, status: 'planned', isMilestone: true });
  }
  if (registration) {
    items.push({ id: generateId(), taskName: '응모 등록 마감', category: 'external', endDate: registration.endDate, endTime: registration.endTime, status: 'planned', isMilestone: true });
  }
  if (resultDate) {
    items.push({ id: generateId(), taskName: '당선 발표', category: 'external', endDate: resultDate, status: 'planned', isMilestone: true });
  }
  if (submission) {
    items.push({ id: generateId(), taskName: '작품접수', category: 'external', endDate: submission.endDate, endTime: submission.endTime, status: 'planned', isMilestone: true });
    for (const step of template?.steps ?? []) {
      const endDate = offsetProcessDate(submission.endDate, -step.daysBeforeDeadline);
      const startDate = step.durationDays > 1 ? offsetProcessDate(endDate, 1 - step.durationDays) : undefined;
      const defaults = { taskName: step.taskName, category: step.category, isMilestone: step.isMilestone };
      items.push({ id: generateId(), ...defaults, startDate, endDate, status: 'planned',
        processTemplateId: template!.id, processStepId: step.id, processDefaults: defaults });
    }
  }
  return items.sort((a, b) => a.endDate.localeCompare(b.endDate));
}
