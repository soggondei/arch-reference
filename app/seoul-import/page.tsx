'use client';

import { useState, useCallback, useMemo } from 'react';
import { Reference, RefType, REF_TYPE_LABEL, REF_TYPE_COLOR } from '@/lib/types';
import { addRef, generateId, getRefs } from '@/lib/store';
import { SeoulImportItem } from '@/app/api/seoul-import/route';
import Link from 'next/link';

interface ImportState { checked: boolean; saved: boolean; }
interface FilterState {
  programs: string[];
  scales:   string[];
  fees:     string[];
  regions:  string[];
  years:    string[];
}
const INIT_FILTER: FilterState = { programs: [], scales: [], fees: [], regions: [], years: [] };

const SCALE_OPTIONS = [
  { label: '소규모', desc: '<500㎡',      test: (n: number) => n > 0 && n < 500 },
  { label: '중규모', desc: '500~3,000㎡', test: (n: number) => n >= 500 && n < 3000 },
  { label: '대규모', desc: '3,000㎡+',   test: (n: number) => n >= 3000 },
];

// 서울 설계 공모는 규모가 큰 공공 프로젝트 중심 → 큰 단위 범위
const FEE_OPTIONS = [
  { label: '10억 미만',  test: (n: number) => n > 0 && n < 10 },
  { label: '10~30억',    test: (n: number) => n >= 10 && n < 30 },
  { label: '30~50억',    test: (n: number) => n >= 30 && n < 50 },
  { label: '50억 이상',  test: (n: number) => n >= 50 },
];

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-md text-xs font-semibold border transition-all"
      style={
        active
          ? { backgroundColor: '#18181b', color: '#fff', borderColor: '#18181b' }
          : { borderColor: '#e4e4e7', color: '#71717a', backgroundColor: '#fff' }
      }
    >
      {label}
    </button>
  );
}

export default function SeoulImportPage() {
  const [items,    setItems]    = useState<SeoulImportItem[]>([]);
  const [states,   setStates]   = useState<Record<number, ImportState>>({});
  const [total,    setTotal]    = useState(0);
  const [query,    setQuery]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error,    setError]    = useState('');
  const [filters,  setFilters]  = useState<FilterState>(INIT_FILTER);
  const PAGE_UNIT = 20;

  // ── 필터 적용 ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => items.filter(item => {
    const { program, region } = item.suggestedTags;
    if (filters.programs.length && !filters.programs.some(p => program.includes(p))) return false;
    if (filters.scales.length) {
      if (!filters.scales.some(s => {
        const o = SCALE_OPTIONS.find(x => x.label === s);
        return o ? o.test(item.floorArea) : false;
      })) return false;
    }
    if (filters.fees.length) {
      if (!filters.fees.some(s => {
        const o = FEE_OPTIONS.find(x => x.label === s);
        return o ? o.test(item.designFeeAmt) : false;
      })) return false;
    }
    if (filters.regions.length && !filters.regions.includes(region)) return false;
    if (filters.years.length  && !filters.years.includes(String(item.year ?? ''))) return false;
    return true;
  }), [items, filters]);

  const availablePrograms = useMemo(() =>
    [...new Set(items.flatMap(i => i.suggestedTags.program))].filter(Boolean).sort(), [items]);
  // 실제 데이터가 있는 항목 기준으로만 규모/설계비 칩 표시
  const availableScales = useMemo(() =>
    SCALE_OPTIONS.filter(o => items.some(i => o.test(i.floorArea))), [items]);
  const availableFees = useMemo(() =>
    FEE_OPTIONS.filter(o => items.some(i => o.test(i.designFeeAmt))), [items]);
  const availableRegions = useMemo(() =>
    [...new Set(items.map(i => i.suggestedTags.region))].filter(Boolean).sort(), [items]);
  const availableYears = useMemo(() =>
    [...new Set(items.map(i => String(i.year ?? '')))].filter(Boolean).sort((a, b) => b.localeCompare(a)), [items]);

  function toggle<K extends keyof FilterState>(key: K, value: string) {
    setFilters(prev => {
      const arr = prev[key] as string[];
      return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  }
  const hasFilter = Object.values(filters).some(v => (v as string[]).length > 0);

  // ── 전체 누적 로드 ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    setItems([]);
    setStates({});
    setProgress(null);
    setFilters(INIT_FILTER);

    const existing    = getRefs();
    const existingUrls = new Set(existing.map(r => r.sourceUrl).filter(Boolean));

    try {
      const res1  = await fetch(`/api/seoul-import?page=1&pageUnit=${PAGE_UNIT}&q=${encodeURIComponent(q)}`);
      const data1 = await res1.json();
      if (!res1.ok) throw new Error(data1.error || '로드 실패');

      const totalItems = data1.total as number;
      const totalPages = Math.ceil(totalItems / PAGE_UNIT);
      setTotal(totalItems);

      let accumulated: SeoulImportItem[] = data1.items;
      const s: Record<number, ImportState> = {};
      for (const item of accumulated) {
        s[item.cpttMstSeq] = { checked: true, saved: existingUrls.has(item.sourceUrl) };
      }
      setItems([...accumulated]);
      setStates(s);
      setProgress({ loaded: accumulated.length, total: totalItems });

      for (let p = 2; p <= totalPages; p++) {
        const res  = await fetch(`/api/seoul-import?page=${p}&pageUnit=${PAGE_UNIT}&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!res.ok) continue;

        const added: SeoulImportItem[] = data.items;
        const addedStates: Record<number, ImportState> = {};
        for (const item of added) {
          addedStates[item.cpttMstSeq] = { checked: true, saved: existingUrls.has(item.sourceUrl) };
        }
        accumulated = [...accumulated, ...added];
        setItems([...accumulated]);
        setStates(prev => ({ ...prev, ...addedStates }));
        setProgress({ loaded: accumulated.length, total: totalItems });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '불러오기 실패');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadAll(query);
  }

  function toggleCheck(seq: number) {
    setStates(prev => ({ ...prev, [seq]: { ...prev[seq], checked: !prev[seq]?.checked } }));
  }
  function toggleAll(checked: boolean) {
    const next = { ...states };
    for (const item of filtered) {
      if (!next[item.cpttMstSeq]?.saved) next[item.cpttMstSeq] = { ...next[item.cpttMstSeq], checked };
    }
    setStates(next);
  }
  function importSelected() {
    const toImport = filtered.filter(i => states[i.cpttMstSeq]?.checked && !states[i.cpttMstSeq]?.saved);
    if (!toImport.length) return;
    const next = { ...states };
    for (const item of toImport) {
      const ref: Reference = {
        id: generateId(), title: item.title, imageUrl: item.imageUrl,
        sourceUrl: item.sourceUrl, architect: item.architect || undefined,
        year: item.year || undefined, refType: item.refType,
        tags: {
          program: item.suggestedTags.program || [], material: item.suggestedTags.material || [],
          mass: item.suggestedTags.mass || [], scale: item.suggestedTags.scale || '',
          designItem: item.suggestedTags.designItem || [], site: item.suggestedTags.site || [],
          region: item.suggestedTags.region || '',
        },
        collectionIds: [], createdAt: new Date().toISOString(),
      };
      addRef(ref);
      next[item.cpttMstSeq] = { checked: true, saved: true };
    }
    setStates(next);
  }

  const checkedCount = filtered.filter(i => states[i.cpttMstSeq]?.checked && !states[i.cpttMstSeq]?.saved).length;
  const hasAreaData  = items.some(i => i.floorArea > 0);
  const hasFeeData   = items.some(i => i.designFeeAmt > 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-zinc-700 flex items-center gap-1.5 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            목록으로
          </Link>
          <span className="text-zinc-200">|</span>
          <h1 className="font-semibold text-zinc-900 text-sm">서울시 설계공모 아카이빙 가져오기</h1>
          {total > 0 && <span className="text-xs text-zinc-400">총 {total}건</span>}
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-6">
        {/* 안내 */}
        <div className="bg-zinc-100 rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
          <svg className="mt-0.5 shrink-0 text-zinc-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-xs text-zinc-500 leading-relaxed">
            <span className="font-semibold text-zinc-700">서울시 설계공모 ARCHIVING 탭</span> 전체 데이터를 불러옵니다.
            연면적·설계비는 현재 서울시 API에서 데이터를 제공하는 항목에만 표시됩니다.
            총 403건 기준 약 1~2분 소요됩니다.
          </p>
        </div>

        {/* 검색 바 */}
        <form onSubmit={handleSearch} className="flex gap-3 mb-5">
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="공모전 이름으로 검색 (비워두면 전체 403건)"
            className="flex-1 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-400 bg-white"
          />
          <button type="submit" disabled={loading}
            className="px-5 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-medium hover:bg-zinc-700 disabled:opacity-40 transition-colors flex items-center gap-2">
            {loading
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />불러오는 중</>
              : '전체 불러오기'}
          </button>
        </form>

        {/* 진행 바 */}
        {progress && (
          <div className="mb-5">
            <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
              <span>데이터 불러오는 중... 필터는 이미 사용 가능합니다</span>
              <span>{progress.loaded} / {progress.total}건</span>
            </div>
            <div className="w-full bg-zinc-200 rounded-full h-1.5">
              <div className="bg-zinc-800 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((progress.loaded / progress.total) * 100)}%` }} />
            </div>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">{error}</div>}

        {items.length === 0 && !loading && !error && (
          <div className="text-center py-16 text-zinc-400">
            <svg className="w-12 h-12 mx-auto mb-3 text-zinc-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <p className="text-sm font-medium">불러오기 버튼으로 서울시 공모전 아카이빙을 가져오세요</p>
            <p className="text-xs mt-1">당선·우수·가작 등 수상 작품 총 403건이 포함되어 있습니다</p>
          </div>
        )}

        {items.length > 0 && (
          <>
            {/* 필터 패널 */}
            <div className="bg-white border border-zinc-100 rounded-xl p-4 mb-4 flex flex-col gap-3">
              {availablePrograms.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-xs font-semibold text-zinc-500 w-10 pt-0.5 shrink-0">용도</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availablePrograms.map(p => (
                      <Chip key={p} label={p} active={filters.programs.includes(p)} onClick={() => toggle('programs', p)} />
                    ))}
                  </div>
                </div>
              )}

              {availableScales.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-xs font-semibold text-zinc-500 w-10 pt-0.5 shrink-0">연면적</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableScales.map(o => (
                      <Chip key={o.label} label={`${o.label} (${o.desc})`}
                        active={filters.scales.includes(o.label)} onClick={() => toggle('scales', o.label)} />
                    ))}
                    {!hasAreaData && <span className="text-xs text-zinc-400 pt-0.5">면적 데이터 없음</span>}
                  </div>
                </div>
              )}

              {availableFees.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-xs font-semibold text-zinc-500 w-10 pt-0.5 shrink-0">설계비</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableFees.map(o => (
                      <Chip key={o.label} label={o.label}
                        active={filters.fees.includes(o.label)} onClick={() => toggle('fees', o.label)} />
                    ))}
                    {!hasFeeData && <span className="text-xs text-zinc-400 pt-0.5">설계비 데이터 없음</span>}
                  </div>
                </div>
              )}

              {availableRegions.length > 1 && (
                <div className="flex items-start gap-3">
                  <span className="text-xs font-semibold text-zinc-500 w-10 pt-0.5 shrink-0">지역</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableRegions.map(r => (
                      <Chip key={r} label={r} active={filters.regions.includes(r)} onClick={() => toggle('regions', r)} />
                    ))}
                  </div>
                </div>
              )}

              {availableYears.length > 1 && (
                <div className="flex items-start gap-3">
                  <span className="text-xs font-semibold text-zinc-500 w-10 pt-0.5 shrink-0">연도</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableYears.map(y => (
                      <Chip key={y} label={`${y}년`} active={filters.years.includes(y)} onClick={() => toggle('years', y)} />
                    ))}
                  </div>
                </div>
              )}

              {hasFilter && (
                <div className="pt-1 border-t border-zinc-100 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{filtered.length} / {items.length}건 표시
                    {(filters.scales.length > 0 || filters.fees.length > 0) &&
                      <span className="ml-1 text-zinc-300">· 면적/설계비 없는 항목 제외됨</span>}
                  </span>
                  <button onClick={() => setFilters(INIT_FILTER)}
                    className="text-xs text-zinc-400 hover:text-zinc-700 underline">필터 초기화</button>
                </div>
              )}
            </div>

            {/* 액션 바 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox"
                    checked={
                      filtered.filter(i => !states[i.cpttMstSeq]?.saved).length > 0 &&
                      filtered.filter(i => !states[i.cpttMstSeq]?.saved).every(i => states[i.cpttMstSeq]?.checked)
                    }
                    onChange={e => toggleAll(e.target.checked)} className="accent-zinc-900" />
                  전체 선택
                </label>
                <span className="text-sm text-zinc-400">
                  {hasFilter
                    ? `${filtered.length}건 필터됨 (로드 ${items.length}건)`
                    : `${items.length}건 로드됨`}
                  {checkedCount > 0 && ` · 선택 ${checkedCount}건`}
                </span>
              </div>
              <button onClick={importSelected} disabled={checkedCount === 0}
                className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                선택한 {checkedCount}건 저장
              </button>
            </div>

            {/* 카드 그리드 */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-zinc-400">
                <p className="text-sm">필터 조건에 맞는 항목이 없습니다.</p>
                <button onClick={() => setFilters(INIT_FILTER)} className="mt-2 text-xs underline hover:text-zinc-600">필터 초기화</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(item => {
                  const state = states[item.cpttMstSeq] || { checked: true, saved: false };
                  const color = REF_TYPE_COLOR[item.refType as RefType] || '#555';
                  const label = REF_TYPE_LABEL[item.refType as RefType] || item.refType;
                  return (
                    <div key={`${item.cpttMstSeq}-${item.rowNo}`}
                      className={`bg-white rounded-xl border overflow-hidden transition-all ${
                        state.saved ? 'border-zinc-200 opacity-60'
                          : state.checked ? 'border-zinc-900' : 'border-zinc-100'
                      }`}>
                      {/* 카드 헤더 */}
                      <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 border-b border-zinc-100">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={state.checked} disabled={state.saved}
                            onChange={() => toggleCheck(item.cpttMstSeq)} className="accent-zinc-900" />
                          <span className="text-xs font-semibold text-white px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: color }}>{label}</span>
                        </label>
                        {state.saved && <span className="text-xs text-zinc-400">저장됨 ✓</span>}
                      </div>

                      {/* 썸네일 */}
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                        <div className="aspect-[4/3] bg-zinc-100 overflow-hidden">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt={item.title}
                              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                              onError={e => {
                                (e.target as HTMLImageElement).parentElement!.innerHTML =
                                  '<div class="w-full h-full flex items-center justify-center text-zinc-300 text-xs">이미지 없음</div>';
                              }} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs">이미지 없음</div>
                          )}
                        </div>
                      </a>

                      {/* 정보 영역 */}
                      <div className="p-3">
                        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                          className="font-semibold text-zinc-900 text-sm leading-tight line-clamp-2 hover:underline block">
                          {item.title}
                        </a>
                        {item.architect && (
                          <p className="text-xs text-zinc-600 font-medium truncate mt-1">{item.architect}</p>
                        )}

                        {/* 연도 · 연면적 · 설계비 */}
                        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                          {item.year && (
                            <span className="text-xs text-zinc-400">{item.year}년</span>
                          )}
                          {item.floorArea > 0 && (
                            <span className="text-xs text-zinc-500">
                              연면적 {item.floorArea.toLocaleString()}㎡
                            </span>
                          )}
                          {item.designFee && (
                            <span className="text-xs font-medium text-zinc-700">
                              설계비 {item.designFee}
                            </span>
                          )}
                        </div>

                        {/* 자동 분류 태그 */}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {[...item.suggestedTags.program, item.suggestedTags.region]
                            .filter(Boolean).slice(0, 4).map((tag, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded">{tag}</span>
                            ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
