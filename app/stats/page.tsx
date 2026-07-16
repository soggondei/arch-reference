import { createClient } from '@supabase/supabase-js';
import { TAGS, TAG_LABELS, TagCategory } from '@/lib/tags';
import Link from 'next/link';

export const revalidate = 3600;

const CATEGORY_COLORS: Record<TagCategory, string> = {
  program:    '#3b82f6',
  material:   '#8b5cf6',
  mass:       '#f97316',
  scale:      '#22c55e',
  designItem: '#ec4899',
  site:       '#14b8a6',
  region:     '#eab308',
};

type TagCounts = Record<TagCategory, Record<string, number>>;

export default async function StatsPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: rows } = await supabase.from('refs').select('tags, ref_type, competition_data, image_url');

  const allRows = rows ?? [];
  const totalCount = allRows.length;
  const competitionCount = allRows.filter(r => r.competition_data).length;
  const linkCount = allRows.filter(r => r.ref_type === 'link').length;
  const refCount = totalCount - linkCount;
  const untaggedCount = allRows.filter(r => {
    const t = r.tags ?? {};
    return r.ref_type !== 'link' && !r.competition_data && r.image_url &&
      (!t.program?.length && !t.material?.length);
  }).length;

  const counts: TagCounts = {} as TagCounts;
  for (const cat of Object.keys(TAGS) as TagCategory[]) {
    counts[cat] = {};
  }

  for (const row of allRows) {
    if (row.ref_type === 'link') continue;
    const tags = row.tags ?? {};
    for (const cat of Object.keys(TAGS) as TagCategory[]) {
      const vals: string[] = Array.isArray(tags[cat])
        ? tags[cat]
        : tags[cat] ? [tags[cat]] : [];
      for (const val of vals) {
        if (val) counts[cat][val] = (counts[cat][val] ?? 0) + 1;
      }
    }
  }

  const categories = Object.keys(TAGS) as TagCategory[];

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
        <div className="max-w-screen-lg mx-auto px-6 h-14 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-zinc-700 flex items-center gap-1.5 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            목록으로
          </Link>
          <span className="text-zinc-200">|</span>
          <h1 className="font-semibold text-zinc-900 text-sm">태그 통계</h1>
        </div>
      </header>

      <div className="max-w-screen-lg mx-auto px-6 py-8">
        {/* 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: '전체 레퍼런스', value: refCount, sub: `공모전 ${competitionCount}건 포함` },
            { label: '링크 즐겨찾기', value: linkCount, sub: '별도 카운트' },
            { label: 'AI 태깅 완료', value: refCount - competitionCount - untaggedCount, sub: `미태깅 ${untaggedCount}건 남음` },
            { label: '총 항목', value: totalCount, sub: '링크 포함 전체' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-white border border-zinc-100 rounded-2xl p-5">
              <p className="text-3xl font-bold text-zinc-900">{value}</p>
              <p className="text-sm font-medium text-zinc-700 mt-1">{label}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* 카테고리별 바 차트 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {categories.map(cat => {
            const catCounts = counts[cat];
            const entries = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
            const maxVal = entries[0]?.[1] ?? 1;
            const color = CATEGORY_COLORS[cat];

            return (
              <div key={cat} className="bg-white border border-zinc-100 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <h3 className="font-semibold text-zinc-900">{TAG_LABELS[cat]}</h3>
                  <span className="ml-auto text-xs text-zinc-400">
                    {entries.length}개 태그 · {entries.reduce((s, [, n]) => s + n, 0)}회 사용
                  </span>
                </div>

                {entries.length === 0 ? (
                  <p className="text-sm text-zinc-400 py-4 text-center">태그 없음</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {entries.map(([tag, count]) => (
                      <div key={tag} className="flex items-center gap-3">
                        <span className="text-sm text-zinc-600 w-24 shrink-0 truncate text-right">{tag}</span>
                        <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{ width: `${(count / maxVal) * 100}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="text-xs text-zinc-400 w-6 text-right shrink-0">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
