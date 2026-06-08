import { Reference } from './types';

function overlap(a: string[], b: string[]): number {
  return a.filter(v => b.includes(v)).length;
}

export function scoreSimilarity(target: Reference, other: Reference): number {
  if (target.id === other.id) return 0;
  let score = 0;
  // 용도 일치: 가장 중요
  score += overlap(target.tags.program, other.tags.program) * 4;
  // 재료 일치
  score += overlap(target.tags.material, other.tags.material) * 3;
  // 매스/형태 일치
  score += overlap(target.tags.mass, other.tags.mass) * 2;
  // 설계 아이템
  score += overlap(target.tags.designItem, other.tags.designItem) * 1;
  // 대지조건
  score += overlap(target.tags.site, other.tags.site) * 1;
  // 규모 일치
  if (target.tags.scale && target.tags.scale === other.tags.scale) score += 1;
  // 지역 일치
  if (target.tags.region && target.tags.region === other.tags.region) score += 0.5;
  return score;
}

export function getSimilarRefs(
  target: Reference,
  allRefs: Reference[],
  limit = 6,
): Array<{ ref: Reference; score: number }> {
  return allRefs
    .map(r => ({ ref: r, score: scoreSimilarity(target, r) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ArchDaily 검색 쿼리 생성
export function buildSearchQuery(ref: Reference): string {
  const parts: string[] = [];

  const programMap: Record<string, string> = {
    '주거': 'residential housing', '상업': 'commercial retail',
    '업무': 'office', '문화': 'cultural museum', '교육': 'school education',
    '의료': 'hospital medical', '공공': 'civic public', '복합': 'mixed-use',
    '종교': 'religious chapel', '산업': 'industrial',
  };
  const materialMap: Record<string, string> = {
    '콘크리트': 'concrete', '목재': 'wood timber', '강재': 'steel',
    '유리': 'glass', '벽돌': 'brick', '석재': 'stone',
    '복합패널': 'panel cladding', '테라코타': 'terracotta',
    '금속': 'metal aluminum', '타일': 'tile',
  };
  const massMap: Record<string, string> = {
    '코트야드형': 'courtyard', 'L형': 'l-shaped', 'U형': 'u-shaped',
    '선형': 'linear', '분절형': 'fragmented', '원형': 'circular',
    '비정형': 'organic',
  };

  ref.tags.program.slice(0, 1).forEach(p => { if (programMap[p]) parts.push(programMap[p]); });
  ref.tags.material.slice(0, 2).forEach(m => { if (materialMap[m]) parts.push(materialMap[m]); });
  ref.tags.mass.slice(0, 1).forEach(ms => { if (massMap[ms]) parts.push(massMap[ms]); });

  return parts.join(' ').trim() || ref.tags.program[0] || 'architecture';
}
