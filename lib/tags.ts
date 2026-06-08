export const TAGS = {
  program: ['주거', '상업', '업무', '문화', '교육', '의료', '종교', '산업', '복합', '공공'],
  material: ['콘크리트', '목재', '강재', '유리', '벽돌', '석재', '복합패널', '테라코타', '금속', '타일'],
  mass: ['단순박스', '복합매스', 'L형', 'U형', '코트야드형', '분절형', '선형', '원형', '비정형'],
  scale: ['소규모 (<500㎡)', '중규모 (500~3,000㎡)', '대규모 (3,000㎡+)'],
  designItem: ['파사드', '입면패턴', '코어', '평면', '단면', '구조', '조경', '디테일', '계단', '브리지'],
  site: ['도심', '코너', '경사지', '수변', '교외', '자연'],
  region: ['서울', '수도권', '충청', '호남', '영남', '강원', '제주', '해외'],
} as const;

export type TagCategory = keyof typeof TAGS;

export const TAG_LABELS: Record<TagCategory, string> = {
  program: '용도',
  material: '재료',
  mass: '매스/형태',
  scale: '규모',
  designItem: '설계 아이템',
  site: '대지조건',
  region: '지역',
};

export const COLLECTION_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#0ea5e9', '#64748b',
];
