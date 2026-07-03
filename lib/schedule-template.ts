import { ScheduleItem, ScheduleCategory } from './types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface TemplateEntry {
  taskName: string;
  category: ScheduleCategory;
  daysBeforeDeadline: number;   // endDate 기준
  startDaysBeforeDeadline?: number; // startDate 기준 (없으면 단일 날짜)
  isMilestone?: boolean;
}

// 제출마감(D-0) 기준 역산
const DESIGN_TEMPLATE: TemplateEntry[] = [
  { taskName: '킥오프',                      category: 'admin',   daysBeforeDeadline: 25,                              isMilestone: true },
  { taskName: '대지조사 및 사례조사',          category: 'design',  daysBeforeDeadline: 23, startDaysBeforeDeadline: 24 },
  { taskName: '사례조사 회의',                category: 'admin',   daysBeforeDeadline: 22,                              isMilestone: true },
  { taskName: '컨셉작업',                     category: 'design',  daysBeforeDeadline: 21, startDaysBeforeDeadline: 22 },
  { taskName: '아이디어 회의',                category: 'admin',   daysBeforeDeadline: 20,                              isMilestone: true },
  { taskName: '계획안 검토',                  category: 'design',  daysBeforeDeadline: 18, startDaysBeforeDeadline: 20 },
  { taskName: '계획안 회의',                  category: 'admin',   daysBeforeDeadline: 17,                              isMilestone: true },
  { taskName: '제출물 작업시작',              category: 'design',  daysBeforeDeadline: 16,                              isMilestone: true },
  { taskName: '도면작업',                     category: 'design',  daysBeforeDeadline: 5,  startDaysBeforeDeadline: 16 },
  { taskName: '설명서 목업',                  category: 'design',  daysBeforeDeadline: 14 },
  { taskName: '모델링작업',                   category: 'design',  daysBeforeDeadline: 12, startDaysBeforeDeadline: 13 },
  { taskName: '다이어그램 스케치',            category: 'design',  daysBeforeDeadline: 11 },
  { taskName: '제출물 1차 피드백',            category: 'admin',   daysBeforeDeadline: 10,                              isMilestone: true },
  { taskName: '다이어그램 및 텍스트 작업',    category: 'design',  daysBeforeDeadline: 7,  startDaysBeforeDeadline: 9  },
  { taskName: '인쇄물 점검',                  category: 'admin',   daysBeforeDeadline: 4  },
  { taskName: '최종수정',                     category: 'design',  daysBeforeDeadline: 3  },
  { taskName: '제출물 제본',                  category: 'admin',   daysBeforeDeadline: 2  },
  { taskName: '기타서류 점검',               category: 'admin',   daysBeforeDeadline: 1  },
];

export function generateScheduleTemplate(params: {
  submissionDate?: string;
  registrationDate?: string;
  announcementDate?: string;
  resultDate?: string;
}): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  // 외부 일정
  if (params.announcementDate) {
    items.push({ id: generateId(), taskName: '공고',           category: 'external', endDate: params.announcementDate, status: 'planned', isMilestone: true });
  }
  if (params.registrationDate) {
    items.push({ id: generateId(), taskName: '응모 등록 마감', category: 'external', endDate: params.registrationDate, status: 'planned', isMilestone: true });
  }
  if (params.resultDate) {
    items.push({ id: generateId(), taskName: '당선 발표',      category: 'external', endDate: params.resultDate,      status: 'planned', isMilestone: true });
  }

  // 내부 작업 일정 (제출마감 기준 역산)
  if (params.submissionDate) {
    items.push({
      id: generateId(),
      taskName: '작품접수',
      category: 'external',
      endDate: params.submissionDate,
      status: 'planned',
      isMilestone: true,
    });

    for (const t of DESIGN_TEMPLATE) {
      const endDate   = addDays(params.submissionDate, -t.daysBeforeDeadline);
      const startDate = t.startDaysBeforeDeadline
        ? addDays(params.submissionDate, -t.startDaysBeforeDeadline)
        : undefined;
      items.push({
        id: generateId(),
        taskName: t.taskName,
        category: t.category,
        endDate,
        startDate,
        status: 'planned',
        isMilestone: t.isMilestone,
      });
    }
  }

  return items.sort((a, b) => a.endDate.localeCompare(b.endDate));
}
