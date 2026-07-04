'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Reference, Collection, FilterState, CompetitionStatus, COMPETITION_STATUSES, COMPETITION_STATUS_COLOR, ScheduleItem } from '@/lib/types';
import { COLLECTION_COLORS } from '@/lib/tags';
import { getRefs, getCollections, deleteRef, addCollection, deleteCollection, updateRef, generateId, updateCompetitionStatus } from '@/lib/store';
import { autoTag } from '@/lib/auto-tag';
import { generateScheduleTemplate } from '@/lib/schedule-template';
import ReferenceCard from '@/components/ReferenceCard';
import FilterPanel from '@/components/FilterPanel';
import UploadForm from '@/components/UploadForm';
import Link from 'next/link';

const INIT_FILTERS: FilterState = {
  search: '',
  program: [], material: [], mass: [], scale: [],
  designItem: [], site: [], region: [], refType: [],
  collectionId: null,
};

function getDDay(dateStr?: string): number | null {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const deadline = new Date(m[1]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
}

function DDayBadge({ dday }: { dday: number | null }) {
  if (dday === null) return null;
  const bg = dday < 0 ? '#94a3b8' : dday <= 7 ? '#ef4444' : dday <= 30 ? '#f97316' : '#3b82f6';
  return (
    <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: bg }}>
      {dday < 0 ? '마감' : dday === 0 ? 'D-Day' : `D-${dday}`}
    </span>
  );
}

function DDayLabel({ label, dday }: { label: string; dday: number | null }) {
  if (dday === null) return null;
  const bg = dday < 0 ? '#94a3b8' : dday <= 7 ? '#ef4444' : dday <= 30 ? '#f97316' : '#3b82f6';
  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-[9px] text-zinc-400 font-medium leading-none">{label}</span>
      <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: bg }}>
        {dday < 0 ? '마감' : dday === 0 ? 'D-Day' : `D-${dday}`}
      </span>
    </div>
  );
}

function CompetitionRow({
  ref_,
  onStatusChange,
  onDelete,
}: {
  ref_: Reference;
  onStatusChange: (id: string, status: CompetitionStatus) => void;
  onDelete: (id: string) => void;
}) {
  const cd = ref_.competitionData!;
  const ddayReg = getDDay(cd.registrationDate);
  const ddaySub = getDDay(cd.submissionDate);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="bg-white border border-zinc-100 hover:border-zinc-200 hover:shadow-sm transition-all rounded-xl px-4 py-3 flex items-center gap-4">
      {/* 상태 */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowPicker(v => !v)}
          className="flex items-center gap-1 text-xs font-bold text-white px-2.5 py-1 rounded-full whitespace-nowrap"
          style={{ backgroundColor: COMPETITION_STATUS_COLOR[cd.status] }}
        >
          {cd.status}
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {showPicker && (
          <div className="absolute left-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[120px]">
            {COMPETITION_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => { onStatusChange(ref_.id, s); setShowPicker(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 text-left"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COMPETITION_STATUS_COLOR[s] }} />
                <span className={s === cd.status ? 'font-bold text-zinc-900' : 'text-zinc-600'}>{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* D-days */}
      <div className="shrink-0 flex flex-col items-end gap-0.5">
        <DDayLabel label="등록" dday={ddayReg} />
        <DDayLabel label="제출" dday={ddaySub} />
        {ddayReg === null && ddaySub === null && <DDayBadge dday={null} />}
      </div>

      {/* 제목 */}
      <Link href={`/reference/${ref_.id}`} className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-900 truncate hover:underline">{ref_.title}</p>
        {ref_.architect && <p className="text-xs text-zinc-400 truncate">{ref_.architect}</p>}
      </Link>

      {/* 날짜·비용 (넓은 화면) */}
      <div className="hidden md:flex items-center gap-5 shrink-0 text-xs text-zinc-500">
        {cd.registrationDate && (
          <div className="text-right">
            <p className="text-[10px] text-zinc-400">응모등록</p>
            <p>{cd.registrationDate.slice(0, 10)}</p>
          </div>
        )}
        {cd.submissionDate && (
          <div className="text-right">
            <p className="text-[10px] text-zinc-400">작품접수</p>
            <p>{cd.submissionDate.slice(0, 10)}</p>
          </div>
        )}
        {cd.designFee && (
          <div className="text-right">
            <p className="text-[10px] text-zinc-400">설계비</p>
            <p className="font-medium text-zinc-700">{cd.designFee}</p>
          </div>
        )}
        {cd.floorAreaText && (
          <div className="text-right">
            <p className="text-[10px] text-zinc-400">연면적</p>
            <p>{cd.floorAreaText}</p>
          </div>
        )}
      </div>

      {/* 삭제 */}
      <button
        onClick={() => onDelete(ref_.id)}
        className="shrink-0 text-zinc-300 hover:text-red-400 text-lg leading-none transition-colors"
        title="삭제"
      >
        ×
      </button>
    </div>
  );
}

function CompetitionView({
  refs,
  onStatusChange,
  onDelete,
  onAutoFill,
}: {
  refs: Reference[];
  onStatusChange: (id: string, status: CompetitionStatus) => void;
  onDelete: (id: string) => void;
  onAutoFill?: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CompetitionStatus | null>(null);
  const [filling, setFilling] = useState(false);

  const missingDataCount = refs.filter(r =>
    r.sourceUrl?.includes('scorer.co.kr') &&
    !r.competitionData?.submissionDate && !r.competitionData?.designFee
  ).length;

  async function handleAutoFill() {
    if (!onAutoFill) return;
    setFilling(true);
    try { await onAutoFill(); } finally { setFilling(false); }
  }

  const active = COMPETITION_STATUSES.slice(0, 5);
  const results = COMPETITION_STATUSES.slice(5);

  const filtered = refs.filter(r => {
    if (statusFilter && r.competitionData?.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![r.title, r.architect, r.competitionData?.location].join(' ').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalFee = refs
    .filter(r => active.includes(r.competitionData?.status as CompetitionStatus))
    .reduce((sum, r) => sum + (r.competitionData?.designFeeAmount || 0), 0);

  const byStatus = (s: CompetitionStatus) => filtered.filter(r => r.competitionData?.status === s);

  return (
    <div className="flex-1 min-w-0">
      {/* 검색 + 상태 필터 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="공모전 검색..."
          className="pl-3 pr-3 py-1.5 bg-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300 w-48"
        />
        <button
          onClick={() => setStatusFilter(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!statusFilter ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-500'}`}
        >
          전체 {refs.length}
        </button>
        {COMPETITION_STATUSES.map(s => {
          const cnt = refs.filter(r => r.competitionData?.status === s).length;
          if (cnt === 0) return null;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={statusFilter === s
                ? { backgroundColor: COMPETITION_STATUS_COLOR[s], color: '#fff', borderColor: COMPETITION_STATUS_COLOR[s] }
                : { borderColor: '#e4e4e7', color: '#71717a' }
              }
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusFilter === s ? '#fff' : COMPETITION_STATUS_COLOR[s] }} />
              {s} {cnt}
            </button>
          );
        })}
        {missingDataCount > 0 && onAutoFill && (
          <button
            onClick={() => void handleAutoFill()}
            disabled={filling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-500 hover:text-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {filling ? (
              <>
                <span className="w-3 h-3 border border-zinc-400 border-t-zinc-700 rounded-full animate-spin" />
                불러오는 중...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                자동 불러오기 ({missingDataCount}건)
              </>
            )}
          </button>
        )}
        {totalFee > 0 && (
          <span className="ml-auto text-xs text-zinc-400">진행 중 설계비 합계 약 {totalFee.toFixed(1)}억</span>
        )}
      </div>

      {refs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-zinc-500 font-medium">저장된 공모전이 없습니다</p>
          <p className="text-zinc-400 text-sm mt-1">스코어러에서 공모전을 가져와 저장해 보세요</p>
          <Link href="/scorer-import" className="mt-4 bg-zinc-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
            스코어러 가져오기
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-zinc-400 text-sm py-12 text-center">검색 결과가 없습니다</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* 진행 중 */}
          {active.some(s => byStatus(s).length > 0) && (
            <div className="flex flex-col gap-2">
              {active.map(s => byStatus(s).length > 0 && (
                <div key={s}>
                  {byStatus(s).map(r => (
                    <div key={r.id} className="mb-2">
                      <CompetitionRow ref_={r} onStatusChange={onStatusChange} onDelete={onDelete} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {/* 결과 */}
          {results.some(s => byStatus(s).length > 0) && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">결과</p>
              <div className="flex flex-col gap-2">
                {results.map(s => byStatus(s).map(r => (
                  <CompetitionRow key={r.id} ref_={r} onStatusChange={onStatusChange} onDelete={onDelete} />
                )))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BookmarkletHandler({ onPrefill }: { onPrefill: (data: Record<string, string>) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      const title       = searchParams.get('title')       || '';
      const description = searchParams.get('description') || '';
      const imageUrl    = searchParams.get('imageUrl')    || '';
      const sourceUrl   = searchParams.get('sourceUrl')   || '';
      const suggested = autoTag(title, description, []);
      onPrefill({ title, imageUrl, description, sourceUrl, _suggestedTags: JSON.stringify(suggested) });
      router.replace('/');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function Home() {
  const [refs, setRefs] = useState<Reference[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filters, setFilters] = useState<FilterState>(INIT_FILTERS);
  const [showUpload, setShowUpload] = useState(false);
  const [prefill, setPrefill] = useState<Record<string, string> | null>(null);
  const [tab, setTab] = useState<'refs' | 'competitions'>('refs');

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([getRefs(), getCollections()]);
    setRefs(r);
    setCollections(c);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handlePrefill(data: Record<string, string>) {
    setPrefill(data);
    setShowUpload(true);
  }

  async function handleDelete(id: string) {
    if (!confirm('이 레퍼런스를 삭제하시겠습니까?')) return;
    await deleteRef(id);
    void load();
  }

  async function handleCreateCollection(name: string) {
    const color = COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length];
    await addCollection({ id: generateId(), name, color, createdAt: new Date().toISOString() });
    void load();
  }

  async function handleDeleteCollection(id: string) {
    await deleteCollection(id);
    setFilters(f => ({ ...f, collectionId: f.collectionId === id ? null : f.collectionId }));
    void load();
  }

  async function handleCollectionToggle(refId: string, colId: string) {
    const ref = refs.find(r => r.id === refId);
    if (!ref) return;
    const collectionIds = ref.collectionIds.includes(colId)
      ? ref.collectionIds.filter(id => id !== colId)
      : [...ref.collectionIds, colId];
    await updateRef({ ...ref, collectionIds });
    void load();
  }

  async function handleAutoFill() {
    const missing = competitionRefs.filter(r =>
      r.sourceUrl?.includes('scorer.co.kr') &&
      !r.competitionData?.submissionDate && !r.competitionData?.designFee
    );
    const CONCURRENCY = 3;
    for (let i = 0; i < missing.length; i += CONCURRENCY) {
      await Promise.all(missing.slice(i, i + CONCURRENCY).map(async r => {
        try {
          const res = await fetch(`/api/scorer-fetch-one?url=${encodeURIComponent(r.sourceUrl!)}`);
          if (!res.ok) return;
          const { competitionData: fetched } = await res.json();
          if (!fetched) return;
          const updated = { ...r.competitionData!, ...fetched };
          await updateCompetitionStatus(r.id, updated);
          setRefs(prev => prev.map(x => x.id === r.id ? { ...x, competitionData: updated } : x));
        } catch { /* skip */ }
      }));
    }
  }

  async function autoSyncSchedulesToNotion(projectName: string, schedules: ScheduleItem[]): Promise<ScheduleItem[]> {
    const results = await Promise.allSettled(
      schedules.map(async item => {
        // notionPageId가 있으면 PATCH 먼저 시도, 실패 시(아카이브/삭제) POST로 신규 생성
        if (item.notionPageId) {
          const patchRes = await fetch('/api/notion-schedule', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              notionPageId: item.notionPageId,
              taskName: item.taskName,
              projectName,
              category: item.category,
              status: item.status,
              endDate: item.endDate,
              startDate: item.startDate,
              isMilestone: item.isMilestone,
            }),
          });
          if (patchRes.ok) return { pageId: item.notionPageId };
        }
        // notionPageId 없거나 PATCH 실패 → 신규 생성
        const postRes = await fetch('/api/notion-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskName: item.taskName,
            projectName,
            category: item.category,
            status: item.status,
            endDate: item.endDate,
            startDate: item.startDate,
            isMilestone: item.isMilestone,
          }),
        });
        return postRes.ok ? postRes.json() : null;
      })
    );
    return schedules.map((item, i) => {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value?.pageId) return { ...item, notionPageId: r.value.pageId as string };
      return item;
    });
  }

  async function handleCompetitionStatusChange(id: string, status: CompetitionStatus) {
    const ref = refs.find(r => r.id === id);
    if (!ref?.competitionData) return;

    // 1. 스케줄 생성 (동기 - DB 저장 전)
    let cd: CompetitionData = { ...ref.competitionData, status };
    if (status === '등록완료' && (!cd.schedules || cd.schedules.length === 0)) {
      const schedules = generateScheduleTemplate({
        submissionDate: cd.submissionDate,
        registrationDate: cd.registrationDate,
        announcementDate: cd.announcementDate,
        resultDate: cd.resultDate,
      });
      if (schedules.length > 0) cd = { ...cd, schedules };
    }

    // 2. Notion 프로젝트 생성/업데이트 (await - notionPageId 확보 후 저장)
    if (status === '등록예정' || status === '등록완료') {
      try {
        if (cd.notionPageId) {
          const r = await fetch('/api/notion-project', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notionPageId: cd.notionPageId, status }),
          });
          if (!r.ok) {
            const err = await r.json() as { notFound?: boolean };
            if (err.notFound) {
              const r2 = await fetch('/api/notion-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: ref.title, architect: ref.architect,
                  location: cd.location, submissionDate: cd.submissionDate,
                  registrationDate: cd.registrationDate, announcementDate: cd.announcementDate,
                  resultDate: cd.resultDate, designFee: cd.designFee,
                  floorArea: cd.floorArea, sourceUrl: ref.sourceUrl, submissions: cd.submissions,
                }),
              });
              if (r2.ok) {
                const data = await r2.json() as { pageId?: string };
                if (data.pageId) cd = { ...cd, notionPageId: data.pageId };
              }
            }
          }
        } else {
          const r = await fetch('/api/notion-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: ref.title, architect: ref.architect,
              location: cd.location, submissionDate: cd.submissionDate,
              registrationDate: cd.registrationDate, announcementDate: cd.announcementDate,
              resultDate: cd.resultDate, designFee: cd.designFee,
              floorArea: cd.floorArea, sourceUrl: ref.sourceUrl, submissions: cd.submissions,
            }),
          });
          if (r.ok) {
            const data = await r.json() as { pageId?: string };
            if (data.pageId) cd = { ...cd, notionPageId: data.pageId };
          }
        }
      } catch { /* silent */ }
    }

    // 3. 스케줄 + notionPageId 모두 포함해서 한 번에 저장
    await updateCompetitionStatus(id, cd);
    setRefs(prev => prev.map(r => r.id === id ? { ...r, competitionData: cd } : r));

    // 4. Notion 스케줄 동기화 (백그라운드 - cd 캡처해서 stale closure 방지)
    if (cd.schedules && cd.schedules.length > 0) {
      const snapshot = cd;
      autoSyncSchedulesToNotion(ref.title, snapshot.schedules!).then(async synced => {
        const withSynced = { ...snapshot, schedules: synced };
        await updateCompetitionStatus(id, withSynced);
        setRefs(prev => prev.map(x => x.id === id ? { ...x, competitionData: withSynced } : x));
      }).catch(() => {/* silent */});
    }
  }

  // 레퍼런스 vs 공모전 분리
  const regularRefs = refs.filter(r => !r.competitionData);
  const competitionRefs = refs.filter(r => r.competitionData);

  const filtered = regularRefs.filter(ref => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const text = [ref.title, ref.architect, ref.description, ...Object.values(ref.tags).flat()].join(' ').toLowerCase();
      if (!text.includes(q)) return false;
    }
    if (filters.collectionId && !ref.collectionIds.includes(filters.collectionId)) return false;
    if (filters.program.length && !filters.program.some(t => ref.tags.program.includes(t))) return false;
    if (filters.material.length && !filters.material.some(t => ref.tags.material.includes(t))) return false;
    if (filters.mass.length && !filters.mass.some(t => ref.tags.mass.includes(t))) return false;
    if (filters.scale.length && !filters.scale.includes(ref.tags.scale)) return false;
    if (filters.designItem.length && !filters.designItem.some(t => ref.tags.designItem.includes(t))) return false;
    if (filters.site.length && !filters.site.some(t => ref.tags.site.includes(t))) return false;
    if (filters.region.length && !filters.region.includes(ref.tags.region)) return false;
    if (filters.refType.length && (!ref.refType || !filters.refType.includes(ref.refType))) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-50">
      <Suspense>
        <BookmarkletHandler onPrefill={handlePrefill} />
      </Suspense>

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => { setTab('refs'); setFilters(INIT_FILTERS); }}
            className="font-bold text-zinc-900 text-base tracking-tight shrink-0 hover:text-zinc-600 transition-colors"
          >
            Arch Reference
          </button>

          {tab === 'refs' && (
            <div className="flex-1 relative max-w-md">
              <input
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder="제목, 건축가, 태그 검색..."
                className="w-full pl-9 pr-3 py-1.5 bg-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300"
              />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Link href="/seoul-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">서울시 공모전</Link>
            <Link href="/scorer-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">스코어러</Link>
            <Link href="/bookmarklet" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block">북마클릿</Link>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
            >
              <span className="text-lg leading-none">+</span>
              레퍼런스 추가
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div className="max-w-screen-xl mx-auto px-6 flex gap-0 border-t border-zinc-100">
          <button
            onClick={() => setTab('refs')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'refs' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            레퍼런스 {regularRefs.length > 0 && <span className="ml-1 text-xs text-zinc-400">{regularRefs.length}</span>}
          </button>
          <button
            onClick={() => setTab('competitions')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'competitions' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            공모전 {competitionRefs.length > 0 && <span className="ml-1 text-xs text-zinc-400">{competitionRefs.length}</span>}
          </button>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-6 flex gap-8">
        {tab === 'refs' ? (
          <>
            <FilterPanel
              filters={filters}
              onFilterChange={setFilters}
              collections={collections}
              totalCount={regularRefs.length}
              filteredCount={filtered.length}
              onCreateCollection={handleCreateCollection}
              onDeleteCollection={handleDeleteCollection}
            />
            <main className="flex-1 min-w-0">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  {regularRefs.length === 0 ? (
                    <>
                      <div className="text-zinc-200 mb-4">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                        </svg>
                      </div>
                      <p className="text-zinc-500 font-medium">레퍼런스가 없습니다</p>
                      <p className="text-zinc-400 text-sm mt-1">우측 상단 버튼으로 첫 레퍼런스를 추가해 보세요</p>
                      <button onClick={() => setShowUpload(true)} className="mt-4 bg-zinc-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
                        레퍼런스 추가
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-zinc-500 font-medium">검색 결과가 없습니다</p>
                      <p className="text-zinc-400 text-sm mt-1">필터 조건을 변경해 보세요</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filtered.map(ref => (
                    <ReferenceCard
                      key={ref.id}
                      ref_={ref}
                      collections={collections}
                      onDelete={handleDelete}
                      onCollectionToggle={handleCollectionToggle}
                    />
                  ))}
                </div>
              )}
            </main>
          </>
        ) : (
          <CompetitionView
            refs={competitionRefs}
            onStatusChange={handleCompetitionStatusChange}
            onDelete={handleDelete}
            onAutoFill={handleAutoFill}
          />
        )}
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-zinc-900">레퍼런스 추가</h2>
              <button onClick={() => setShowUpload(false)} className="text-zinc-400 hover:text-zinc-700 text-2xl leading-none">×</button>
            </div>
            <UploadForm
              collections={collections}
              prefill={prefill}
              onSave={async () => { setShowUpload(false); setPrefill(null); await load(); }}
              onCancel={() => { setShowUpload(false); setPrefill(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
