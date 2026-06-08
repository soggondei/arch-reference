export type RefType = 'built' | 'winner' | 'entry' | 'idea';

export const REF_TYPE_LABEL: Record<RefType, string> = {
  built: '실현작',
  winner: '당선작',
  entry: '공모참가',
  idea: '아이디어',
};

export const REF_TYPE_COLOR: Record<RefType, string> = {
  built:  '#1d4ed8',  // 파랑
  winner: '#15803d',  // 초록
  entry:  '#b45309',  // 주황
  idea:   '#7c3aed',  // 보라
};

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
