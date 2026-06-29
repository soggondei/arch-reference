'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { Reference, RefType, Collection } from '@/lib/types';
import { COLLECTION_COLORS } from '@/lib/tags';
import { addRef, generateId, getRefs, getCollections, addCollection } from '@/lib/store';
import { ScorerImportItem } from '@/app/api/scorer-import/route';
import Link from 'next/link';

interface ImportState {
  checked: boolean;
  saved: boolean;
}

interface FilterState {
  statuses: string[];
  categories: string[];
  scales: string[];
  fees: string[];
}

const INIT_FILTER: FilterState = { statuses: [], categories: [], scales: [], fees: [] };
const BATCH_PAGES = 5; // 한 번에 로드할 페이지 수 (5 × 20 = 100건)
const PAGE_UNIT = 20;

const STATUS_COLOR: Record<string, string> = {
  '예정': '#22c55e', '접수대기중': '#a855f7', '참가등록중': '#3b82f6',
  '작품접수중': '#f97316', '심사중': '#eab308', '완료': '#94a3b8',
};

const SCALE_OPTIONS = [
  { label: '소규모', desc: '<500㎡',      test: (n: number) => n > 0 && n < 500 },
  { label: '중규모', desc: '500~3,000㎡', test: (n: number) => n >= 500 && n < 3000 },
  { label: '대규모', desc: '3,000㎡+',   test: (n: number) => n >= 3000 },
];

const FEE_OPTIONS = [
  { label: '1억 미만', test: (n: number) => n > 0 && n < 1 },
  { label: '1~5억',   test: (n: number) => n >= 1 && n < 5 },
  { label: '5~10억',  test: (n: number) => n >= 5 && n < 10 },
  { label: '10억 이상', test: (n: number) => n >= 10 },
];

function parseDesignFee(feeStr: string): number {
  const m = feeStr.match(/([\d,.]+)억/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : 0;
}

function Chip({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-md text-xs font-semibold border transition-all"
      style={
        active
          ? { backgroundColor: color || '#18181b', color: '#fff', borderColor: color || '#18181b' }
          : { borderColor: '#e4e4e7', color: '#71717a', backgroundColor: '#fff' }
      }
    >
      {label}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-1.5 text-xs leading-snug">
      <span className="text-zinc-400 shrink-0 w-16">{label}</span>
      <span className="text-zinc-700 min-w-0">{value}</span>
    </div>
  );
}

function ScorerCard({ item, state, onToggle }: { item: ScorerImportItem; state: ImportState; onToggle: () => void }) {
  const statusColor = STATUS_COLOR[item.status] || '#94a3b8';
  return (
    <div className={`bg-white rounded-xl border overflow-hidden flex flex-col transition-all ${
      state.saved ? 'border-zinc-200 opacity-60' : state.checked ? 'border-zinc-900' : 'border-zinc-100'
    }`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-100 flex-wrap">
        <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
          <input type="checkbox" checked={state.checked} disabled={state.saved} onChange={onToggle} className="accent-zinc-900" />
        </label>
        <span className="text-xs font-bold text-white px-2 py-0.5 rounded" style={{ backgroundColor: statusColor }}>
          {item.status}
        </span>
        {item.category && <span className="text-xs font-semibold text-zinc-600 bg-zinc-200 px-2 py-0.5 rounded">{item.category}</span>}
        {item.competitionType && <span className="text-xs text-zinc-400">{item.competitionType}</span>}
        {item.projectScope && <span className="text-xs text-zinc-400">· {item.projectScope}</span>}
        {state.saved && <span className="ml-auto text-xs text-zinc-400 shrink-0">저장됨 ✓</span>}
      </div>

      <div className="px-3 pt-3 pb-2">
        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
          className="font-semibold text-zinc-900 text-sm leading-snug line-clamp-2 hover:underline block">
          {item.title}
        </a>
        {item.architect && <p className="text-xs text-zinc-500 mt-0.5 truncate">{item.architect}</p>}
      </div>

      <div className="grid grid-cols-2 gap-0 border-t border-zinc-100 flex-1">
        <div className="px-3 py-2.5 border-r border-zinc-100 flex flex-col gap-1">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">일정</p>
          <InfoRow label="공고일"   value={item.announcementDate} />
          <InfoRow label="참가등록" value={item.registrationDate} />
          <InfoRow label="등록방식" value={item.registrationMethod} />
          <InfoRow label="작품접수" value={item.submissionDate} />
          <InfoRow label="접수방식" value={item.submissionMethod} />
          <InfoRow label="제출물"   value={item.submissionFormat} />
          <InfoRow label="심사일"   value={item.judgeDate} />
          <InfoRow label="발표일"   value={item.resultDate} />
        </div>
        <div className="px-3 py-2.5 flex flex-col gap-1">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">규모 · 비용</p>
          <InfoRow label="용도"     value={item.usageType} />
          <InfoRow label="규모"     value={item.scaleText} />
          <InfoRow label="연면적"   value={item.floorAreaText} />
          <InfoRow label="대지면적" value={item.siteArea} />
          <InfoRow label="설계비"   value={item.designFee} />
          <InfoRow label="공사비"   value={item.constructionCost} />
        </div>
      </div>

      {item.location && (
        <div className="px-3 py-2 border-t border-zinc-100 text-xs text-zinc-500 truncate">
          📍 {item.location}
        </div>
      )}

      <div className="px-3 pb-3 pt-2 border-t border-zinc-100 flex flex-wrap gap-1">
        {[...item.suggestedTags.program, item.suggestedTags.scale, item.suggestedTags.region]
          .filter(Boolean)
          .map((tag, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded">{tag}</span>
          ))}
      </div>
    </div>
  );
}

export default function ScorerImportPage() {
  const [items, setItems] = useState<ScorerImportItem[]>([]);
  const [states, setStates] = useState<Record<number, ImportState>>({});
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FilterState>(INIT_FILTER);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedColId, setSelectedColId] = useState<string>('');
  const [newColName, setNewColName] = useState('');
  const [showNewCol, setShowNewCol] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const itemsRef = useRef<ScorerImportItem[]>([]); // stale closure 방지용 ref

  // 필터 적용
  const filtered = useMemo(() => items.filter(item => {
    if (filters.statuses.length && !filters.statuses.includes(item.status)) return false;
    if (filters.categories.length && !filters.categories.includes(item.category)) return false;
    if (filters.scales.length) {
      if (!filters.scales.some(s => {
        const o = SCALE_OPTIONS.find(x => x.label === s);
        return o ? o.test(item.floorArea) : false;
      })) return false;
    }
    if (filters.fees.length) {
      const fee = parseDesignFee(item.designFee);
      if (!filters.fees.some(s => {
        const o = FEE_OPTIONS.find(x => x.label === s);
        return o ? o.test(fee) : false;
      })) return false;
    }
    return true;
  }), [items, filters]);

  const availableStatuses  = useMemo(() => [...new Set(items.map(i => i.status))].filter(Boolean), [items]);
  const availableCategories = useMemo(() => [...new Set(items.map(i => i.category))].filter(Boolean).sort(), [items]);
  const hasFilter = Object.values(filters).some(v => (v as string[]).length > 0);

  function toggle<K extends keyof FilterState>(key: K, value: string) {
    setFilters(prev => {
      const arr = prev[key] as string[];
      return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  }

  // itemsRef를 state와 동기화
  const syncedSetItems = useCallback((newItems: ScorerImportItem[]) => {
    itemsRef.current = newItems;
    setItems(newItems);
  }, []);

  // BATCH_PAGES 페이지를 순차 로드해서 items에 누적
  const loadBatch = useCallback(async (startPage: number, isInitial: boolean) => {
    setLoading(true);
    setError('');

    const [existing, cols] = await Promise.all([getRefs(), getCollections()]);
    const existingUrls = new Set(existing.map(r => r.sourceUrl).filter(Boolean));
    setCollections(cols);

    try {
      if (isInitial) {
        itemsRef.current = [];
        setItems([]);
        setStates({});
        setFilters(INIT_FILTER);
      }

      let accumulated: ScorerImportItem[] = isInitial ? [] : [...itemsRef.current];
      let sitemapTotal = 0;
      const endPage = startPage + BATCH_PAGES - 1;

      for (let p = startPage; p <= endPage; p++) {
        const res = await fetch(`/api/scorer-import?page=${p}&pageUnit=${PAGE_UNIT}`);
        const data = await res.json();
        if (!res.ok) { if (p === startPage) throw new Error(data.error || '로드 실패'); break; }

        if (p === startPage || sitemapTotal === 0) {
          sitemapTotal = data.total;
          setTotal(data.total);
        }

        const newItems: ScorerImportItem[] = data.items;
        const addedStates: Record<number, ImportState> = {};
        for (const item of newItems) {
          addedStates[item.id] = { checked: true, saved: existingUrls.has(item.sourceUrl) };
        }

        accumulated = [...accumulated, ...newItems];
        syncedSetItems([...accumulated]);
        setStates(prev => ({ ...prev, ...addedStates }));
        setProgress({ loaded: accumulated.length, total: Math.min(sitemapTotal, endPage * PAGE_UNIT) });

        if (newItems.length < PAGE_UNIT) break;
      }

      setNextPage(endPage + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '불러오기 실패');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [syncedSetItems]);

  function toggleCheck(id: number) {
    setStates(prev => ({ ...prev, [id]: { ...prev[id], checked: !prev[id]?.checked } }));
  }

  function toggleAll(checked: boolean) {
    const next = { ...states };
    for (const item of filtered) {
      if (!next[item.id]?.saved) next[item.id] = { ...next[item.id], checked };
    }
    setStates(next);
  }

  async function handleCreateCollection() {
    if (!newColName.trim()) return;
    const col: Collection = {
      id: generateId(),
      name: newColName.trim(),
      color: COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length],
      createdAt: new Date().toISOString(),
    };
    await addCollection(col);
    setCollections(prev => [...prev, col]);
    setSelectedColId(col.id);
    setNewColName('');
    setShowNewCol(false);
  }

  async function importSelected() {
    const toImport = filtered.filter(item => states[item.id]?.checked && !states[item.id]?.saved);
    if (!toImport.length) return;

    setImportProgress({ done: 0, total: toImport.length });
    const newStates = { ...states };
    const CONCURRENCY = 3;

    for (let i = 0; i < toImport.length; i += CONCURRENCY) {
      const batch = toImport.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async item => {
        let imageUrl = '';
        try {
          const res = await fetch(`/api/fetch-og?url=${encodeURIComponent(item.sourceUrl)}`);
          if (res.ok) {
            const data = await res.json();
            imageUrl = data.imageUrl || '';
          }
        } catch { /* 이미지 없이 저장 */ }

        const ref: Reference = {
          id: generateId(),
          title: item.title,
          imageUrl,
          sourceUrl: item.sourceUrl,
          architect: item.architect || undefined,
          year: item.year ? parseInt(item.year) : undefined,
          refType: item.refType as RefType,
          tags: {
            program: item.suggestedTags.program || [],
            material: item.suggestedTags.material || [],
            mass: item.suggestedTags.mass || [],
            scale: item.suggestedTags.scale || '',
            designItem: item.suggestedTags.designItem || [],
            site: item.suggestedTags.site || [],
            region: item.suggestedTags.region || '',
          },
          collectionIds: selectedColId ? [selectedColId] : [],
          createdAt: new Date().toISOString(),
        };
        await addRef(ref);
        newStates[item.id] = { checked: true, saved: true };
        setImportProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null);
      }));
    }

    setStates({ ...newStates });
    setImportProgress(null);
  }

  const checkedCount = filtered.filter(item => states[item.id]?.checked && !states[item.id]?.saved).length;
  const hasMore = total > 0 && items.length < total;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-zinc-700 flex items-center gap-1.5 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            목록으로
          </Link>
          <span className="text-zinc-200">|</span>
          <h1 className="font-semibold text-zinc-900 text-sm">스코어러 공모전 가져오기</h1>
          {total > 0 && <span className="text-xs text-zinc-400">총 {total.toLocaleString()}건 (최근 순)</span>}
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-6">
        <div className="bg-zinc-100 rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
          <svg className="mt-0.5 shrink-0 text-zinc-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-xs text-zinc-500 leading-relaxed">
            <span className="font-semibold text-zinc-700">scorer.co.kr</span> 최신 공모전 100건씩 불러옵니다.
            불러온 항목 전체에 필터를 적용할 수 있으며, 더 불러오기로 추가 항목을 쌓을 수 있습니다.
            페이지당 약 10~20초 소요됩니다.
          </p>
        </div>

        {/* 초기 상태 */}
        {items.length === 0 && !loading && !error && (
          <div className="text-center py-16 text-zinc-400">
            <svg className="w-12 h-12 mx-auto mb-3 text-zinc-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
            </svg>
            <p className="text-sm font-medium mb-4">스코어러 최신 공모전 100건을 불러오세요</p>
            <button
              onClick={() => loadBatch(1, true)}
              className="px-6 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-medium hover:bg-zinc-700 transition-colors"
            >
              최신 100건 불러오기
            </button>
          </div>
        )}

        {/* 진행 표시 바 */}
        {progress && (
          <div className="mb-5">
            <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
              <span>공모요강 불러오는 중... 필터는 이미 사용 가능합니다</span>
              <span>{progress.loaded} / {progress.total}건</span>
            </div>
            <div className="w-full bg-zinc-200 rounded-full h-1.5">
              <div
                className="bg-zinc-800 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((progress.loaded / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {loading && !progress && (
          <div className="text-center py-12">
            <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-zinc-400">공모요강 정보를 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">{error}</div>
        )}

        {items.length > 0 && (
          <>
            {/* 필터 패널 */}
            <div className="bg-white border border-zinc-100 rounded-xl p-4 mb-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="text-xs font-semibold text-zinc-500 w-14 pt-0.5 shrink-0">진행 상태</span>
                <div className="flex flex-wrap gap-1.5">
                  {availableStatuses.map(s => (
                    <Chip key={s} label={s} active={filters.statuses.includes(s)} color={STATUS_COLOR[s]} onClick={() => toggle('statuses', s)} />
                  ))}
                </div>
              </div>

              {availableCategories.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-xs font-semibold text-zinc-500 w-14 pt-0.5 shrink-0">용도</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableCategories.map(c => (
                      <Chip key={c} label={c} active={filters.categories.includes(c)} onClick={() => toggle('categories', c)} />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <span className="text-xs font-semibold text-zinc-500 w-14 pt-0.5 shrink-0">연면적</span>
                <div className="flex flex-wrap gap-1.5">
                  {SCALE_OPTIONS.map(o => (
                    <Chip key={o.label} label={`${o.label} (${o.desc})`} active={filters.scales.includes(o.label)} onClick={() => toggle('scales', o.label)} />
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-xs font-semibold text-zinc-500 w-14 pt-0.5 shrink-0">설계비</span>
                <div className="flex flex-wrap gap-1.5">
                  {FEE_OPTIONS.map(o => (
                    <Chip key={o.label} label={o.label} active={filters.fees.includes(o.label)} onClick={() => toggle('fees', o.label)} />
                  ))}
                </div>
              </div>

              {hasFilter && (
                <div className="pt-1 border-t border-zinc-100 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{filtered.length} / {items.length}건 표시</span>
                  <button onClick={() => setFilters(INIT_FILTER)} className="text-xs text-zinc-400 hover:text-zinc-700 underline">
                    필터 초기화
                  </button>
                </div>
              )}
            </div>

            {/* 액션 바 */}
            <div className="flex flex-col gap-3 mb-4">
              {/* 컬렉션 선택 */}
              <div className="bg-white border border-zinc-100 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-zinc-500 shrink-0">프로젝트 폴더</span>
                <div className="flex flex-wrap gap-2 flex-1">
                  <button
                    onClick={() => setSelectedColId('')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      selectedColId === '' ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-500 hover:border-zinc-400'
                    }`}
                  >
                    폴더 없음
                  </button>
                  {collections.map(col => (
                    <button
                      key={col.id}
                      onClick={() => setSelectedColId(col.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        selectedColId === col.id ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                      {col.name}
                    </button>
                  ))}
                  {showNewCol ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={newColName}
                        onChange={e => setNewColName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void handleCreateCollection(); if (e.key === 'Escape') setShowNewCol(false); }}
                        placeholder="폴더 이름"
                        className="border border-zinc-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-zinc-500 w-32"
                      />
                      <button onClick={() => void handleCreateCollection()} className="text-xs text-zinc-900 font-medium hover:underline">추가</button>
                      <button onClick={() => setShowNewCol(false)} className="text-xs text-zinc-400 hover:text-zinc-600">취소</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewCol(true)}
                      className="px-3 py-1.5 rounded-lg text-xs border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-500 hover:text-zinc-600 transition-all"
                    >
                      + 새 폴더
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        filtered.filter(i => !states[i.id]?.saved).length > 0 &&
                        filtered.filter(i => !states[i.id]?.saved).every(i => states[i.id]?.checked)
                      }
                      onChange={e => toggleAll(e.target.checked)}
                      className="accent-zinc-900"
                    />
                    전체 선택
                  </label>
                  <span className="text-sm text-zinc-400">
                    {hasFilter
                      ? `${filtered.length}건 필터됨 (로드 ${items.length}건)`
                      : `${total.toLocaleString()}건 중 ${items.length}건 로드됨`}
                    {checkedCount > 0 && ` · 선택 ${checkedCount}건`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadBatch(1, true)}
                    disabled={loading}
                    className="px-3 py-2 border border-zinc-200 text-zinc-600 text-sm rounded-xl hover:bg-zinc-50 disabled:opacity-40 transition-colors"
                  >
                    새로고침
                  </button>
                  <button
                    onClick={() => void importSelected()}
                    disabled={checkedCount === 0 || !!importProgress}
                    className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[140px] text-center"
                  >
                    {importProgress
                      ? `저장 중... ${importProgress.done}/${importProgress.total}`
                      : selectedColId
                        ? `"${collections.find(c => c.id === selectedColId)?.name}"에 ${checkedCount}건 저장`
                        : `선택한 ${checkedCount}건 저장`}
                  </button>
                </div>
              </div>
            </div>

            {/* 카드 그리드 */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-zinc-400">
                <p className="text-sm">필터 조건에 맞는 항목이 없습니다.</p>
                <button onClick={() => setFilters(INIT_FILTER)} className="mt-2 text-xs underline hover:text-zinc-600">필터 초기화</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filtered.map(item => (
                  <ScorerCard
                    key={item.id}
                    item={item}
                    state={states[item.id] || { checked: true, saved: false }}
                    onToggle={() => toggleCheck(item.id)}
                  />
                ))}
              </div>
            )}

            {/* 더 불러오기 */}
            {hasMore && !loading && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => loadBatch(nextPage, false)}
                  className="px-6 py-2.5 border border-zinc-300 text-zinc-700 text-sm font-medium rounded-xl hover:bg-zinc-50 transition-colors"
                >
                  다음 100건 더 불러오기 ({items.length} / {total.toLocaleString()}건 로드됨)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
