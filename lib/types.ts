import type { PlanningChange, ProjectPlan } from './project-planning';

export type RefType = 'built' | 'winner' | 'entry' | 'idea' | 'link';

export const REF_TYPE_LABEL: Record<RefType, string> = {
  built: '실현작',
  winner: '당선작',
  entry: '공모참가',
  idea: '아이디어',
  link: '링크',
};

export const REF_TYPE_COLOR: Record<RefType, string> = {
  built:  '#1d4ed8',
  winner: '#15803d',
  entry:  '#b45309',
  idea:   '#7c3aed',
  link:   '#0891b2',
};

export const LINK_CATEGORIES = ['설계도구', '법규/정보', '재료/제품', '공모/입찰', '레퍼런스', '기타'] as const;
export type LinkCategory = typeof LINK_CATEGORIES[number];

export const ACTIVE_COMPETITION_STATUSES = ['관심', '등록예정', '등록완료', '작업중', '제출완료'] as const;
export const COMPETITION_RESULTS = ['입선', '탈락'] as const;
export const COMPETITION_STATUSES = [...ACTIVE_COMPETITION_STATUSES, ...COMPETITION_RESULTS, '드롭'] as const;
export type CompetitionStatus = typeof COMPETITION_STATUSES[number];

export const COMPETITION_STATUS_COLOR: Record<CompetitionStatus, string> = {
  '관심':    '#94a3b8',
  '등록예정': '#3b82f6',
  '등록완료': '#8b5cf6',
  '작업중':  '#f97316',
  '제출완료': '#eab308',
  '입선':    '#22c55e',
  '탈락':    '#ef4444',
  '드롭':    '#475569',
};

export function isDroppedCompetition(data?: CompetitionData) {
  return data?.status === '드롭' && !data.workspaceKind;
}

export const BID_PARTICIPATION_STATUSES = ['참가예정', '참가완료', '패스'] as const;
export type BidParticipationStatus = typeof BID_PARTICIPATION_STATUSES[number];

export const BID_PARTICIPATION_STATUS_COLOR: Record<BidParticipationStatus, string> = {
  '참가예정': '#f97316',
  '참가완료': '#22c55e',
  '패스': '#94a3b8',
};

export interface BidParticipation {
  bidNo: string;
  status: BidParticipationStatus;
  submittedPrice: number | null;
  submittedDate: string | null;
}

export interface CompetitionFile {
  name: string;
  url: string;
}

export interface JudgeMember {
  name: string;
  affiliation?: string;
}

export type ScheduleCategory = 'external' | 'design' | 'admin';
export type ScheduleStatus = 'planned' | 'in-progress' | 'done' | 'cancelled';

export const SCHEDULE_CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  external: '외부일정',
  design: '설계작업',
  admin: '행정',
};

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  planned: '예정',
  'in-progress': '진행중',
  done: '완료',
  cancelled: '취소',
};

export interface ScheduleItem {
  id: string;
  taskName: string;
  category: ScheduleCategory;
  startDate?: string;
  endDate: string;
  endTime?: string;
  status: ScheduleStatus;
  assignee?: string;
  reviewRequested?: boolean;
  completedDates?: string[];
  waitingFor?: string;
  nextAction?: string;
  isMilestone?: boolean;
  notionPageId?: string;
  deliverables?: TaskDeliverable[];
}

export interface TaskDeliverable {
  id: string;
  title: string;
  criteria: string;
  checked: boolean;
}

export interface DrawingRecord {
  number: string;
  version: string;
  url: string;
  note?: string;
}

export type TaskDates = Pick<ScheduleItem, 'startDate' | 'endDate' | 'endTime'>;
export type OfficeSchedulePatch = Partial<TaskDates & Pick<ScheduleItem, 'status' | 'assignee' | 'reviewRequested' | 'waitingFor' | 'nextAction'>>;

export interface WorkLog {
  id: string;
  taskId: string;
  taskName: string;
  author: string;
  date: string;
  minutes: number;
  body: string;
}

export interface TaskFeedback {
  id: string;
  taskId: string;
  taskName: string;
  author: string;
  date: string;
  body: string;
  workLogId?: string;
  followUpTaskId?: string;
  reviewedDrawing?: DrawingRecord;
  resultDrawing?: DrawingRecord;
}

export interface ProjectReferenceLink {
  referenceId: string;
  note: string;
  decision?: string;
}

export type ProjectActivityChange =
  | PlanningChange
  | { type: 'projectColor'; value: string; previous?: string }
  | { type: 'deliverable'; taskId: string; id: string; value?: TaskDeliverable; previous?: TaskDeliverable }
  | { type: 'drawing'; feedbackId: string; field: 'reviewedDrawing' | 'resultDrawing'; value?: DrawingRecord; previous?: DrawingRecord }
  | { type: 'saveLog'; log: WorkLog; previous?: WorkLog }
  | { type: 'addFeedback'; feedback: TaskFeedback }
  | { type: 'followUp'; feedbackId: string; task: ScheduleItem }
  | { type: 'linkReference'; referenceId: string; note: string; previousNote?: string; decision?: string; previousDecision?: string }
  | { type: 'unlinkReference'; referenceId: string; previousNote?: string; previousDecision?: string };

export interface CompetitionData {
  planning?: ProjectPlan;
  projectColor?: string;
  status: CompetitionStatus;
  workspaceKind?: 'project' | 'office';
  pm?: string;
  scheduleRevision?: number;
  memo?: string;
  submissionDate?: string;
  registrationDate?: string;
  announcementDate?: string;
  resultDate?: string;
  designFee?: string;
  designFeeAmount?: number;
  constructionCost?: string;
  floorArea?: number;
  floorAreaText?: string;
  location?: string;
  judges?: JudgeMember[];
  files?: CompetitionFile[];
  submissions?: string;
  notionPageId?: string;
  schedules?: ScheduleItem[];
  workLogs?: WorkLog[];
  feedback?: TaskFeedback[];
  referenceLinks?: ProjectReferenceLink[];
}

export interface Reference {
  id: string;
  title: string;
  imageUrl: string;
  sourceUrl?: string;
  refType?: RefType;
  tags: {
    program: string[];
    material: string[];
    mass: string[];
    scale: string;
    designItem: string[];
    site: string[];
    region: string;
    linkCategory?: string;
  };
  architect?: string;
  year?: number;
  description?: string;
  collectionIds: string[];
  createdAt: string;
  competitionData?: CompetitionData;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  color: string;
  createdAt: string;
}

export interface FilterState {
  search: string;
  program: string[];
  material: string[];
  mass: string[];
  scale: string[];
  designItem: string[];
  site: string[];
  region: string[];
  refType: RefType[];
  collectionId: string | null;
}
