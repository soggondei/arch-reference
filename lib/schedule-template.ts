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
  daysBeforeDeadline: number;
  durationDays?: number;
}

const DESIGN_TEMPLATE: TemplateEntry[] = [
  { taskName: '킥오프 미팅',    category: 'admin',   daysBeforeDeadline: 28 },
  { taskName: '현장 답사',      category: 'admin',   daysBeforeDeadline: 25 },
  { taskName: '개념 설계',      category: 'design',  daysBeforeDeadline: 21, durationDays: 7 },
  { taskName: '기본 설계',      category: 'design',  daysBeforeDeadline: 14, durationDays: 4 },
  { taskName: '도면 작업',      category: 'design',  daysBeforeDeadline: 10, durationDays: 3 },
  { taskName: '1차 내부 검토',  category: 'admin',   daysBeforeDeadline: 7 },
  { taskName: '모형 제작',      category: 'design',  daysBeforeDeadline: 5,  durationDays: 2 },
  { taskName: '패널 레이아웃',  category: 'design',  daysBeforeDeadline: 3,  durationDays: 1 },
  { taskName: '최종 검토',      category: 'admin',   daysBeforeDeadline: 2 },
  { taskName: '인쇄·출력',      category: 'admin',   daysBeforeDeadline: 1 },
];

export function generateScheduleTemplate(params: {
  submissionDate?: string;
  registrationDate?: string;
  announcementDate?: string;
  resultDate?: string;
}): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  // 외부 일정 (있는 것만)
  if (params.announcementDate) {
    items.push({
      id: generateId(),
      taskName: '공고',
      category: 'external',
      endDate: params.announcementDate,
      status: 'planned',
    });
  }
  if (params.registrationDate) {
    items.push({
      id: generateId(),
      taskName: '응모 등록 마감',
      category: 'external',
      endDate: params.registrationDate,
      status: 'planned',
    });
  }
  if (params.resultDate) {
    items.push({
      id: generateId(),
      taskName: '당선 발표',
      category: 'external',
      endDate: params.resultDate,
      status: 'planned',
    });
  }

  // 내부 작업 일정 (제출마감 기준 역산)
  if (params.submissionDate) {
    // 제출 당일
    items.push({
      id: generateId(),
      taskName: '작품 제출',
      category: 'external',
      endDate: params.submissionDate,
      status: 'planned',
    });

    // 템플릿 항목 역산
    for (const t of DESIGN_TEMPLATE) {
      const endDate = addDays(params.submissionDate, -t.daysBeforeDeadline);
      const startDate = t.durationDays
        ? addDays(endDate, -(t.durationDays - 1))
        : undefined;
      items.push({
        id: generateId(),
        taskName: t.taskName,
        category: t.category,
        endDate,
        startDate,
        status: 'planned',
      });
    }
  }

  // 날짜순 정렬
  return items.sort((a, b) => a.endDate.localeCompare(b.endDate));
}
