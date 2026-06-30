export type RefType = 'built' | 'winner' | 'entry' | 'idea';

export const REF_TYPE_LABEL: Record<RefType, string> = {
  built: '실현작',
  winner: '당선작',
  entry: '공모참가',
  idea: '아이디어',
};

export const REF_TYPE_COLOR: Record<RefType, string> = {
  built:  '#1d4ed8',
  winner: '#15803d',
  entry:  '#b45309',
  idea:   '#7c3aed',
};

export const COMPETITION_STATUSES = ['관심', '등록예정', '등록완료', '작업중', '제출완료', '입선', '탈락'] as const;
export type CompetitionStatus = typeof COMPETITION_STATUSES[number];

export const COMPETITION_STATUS_COLOR: Record<CompetitionStatus, string> = {
  '관심':    '#94a3b8',
  '등록예정': '#3b82f6',
  '등록완료': '#8b5cf6',
  '작업중':  '#f97316',
  '제출완료': '#eab308',
  '입선':    '#22c55e',
  '탈락':    '#ef4444',
};

export interface JudgeMember {
  name: string;
  affiliation?: string;
}

export interface CompetitionData {
  status: CompetitionStatus;
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
