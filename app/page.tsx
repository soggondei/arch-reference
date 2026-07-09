'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Reference, Collection, FilterState, CompetitionStatus, CompetitionData, COMPETITION_STATUSES, COMPETITION_STATUS_COLOR, ScheduleItem } from '@/lib/types';
import { COLLECTION_COLORS } from '@/lib/tags';
import { getRefs, getCollections, deleteRef, addCollection, deleteCollection, updateRef, generateId, updateCompetitionStatus, archiveRefNotionSchedules } from '@/lib/store';
import { autoTag } from '@/lib/auto-tag';
import { generateScheduleTemplate } from '@/lib/schedule-template';
import ReferenceCard from '@/components/ReferenceCard';
import FilterPanel from '@/components/FilterPanel';
import FilterSheet from '@/components/FilterSheet';
import UploadForm from '@/components/UploadForm';
import Link from 'next/link';

// ── 입찰정보 ────────────────────────────────────────────────────────────────
interface BidItem {
  id: string; 공고명: string; 공고기관: string; 공고번호: string;
  지역: string; 상태: string; 입찰방법: string; 예가방법: string;
  배정예산: number | null; 추천입찰가: number | null; 낙찰하한가: number | null;
  적용낙찰률: string; 실제낙찰금액: number | null; 실제낙찰률: number | null;
  낙찰업체: string; 공고일: string; 마감일: string; 개찰일: string; 공고URL: string;
}

function fmtWon(n: number | null): string {
  if (!n) return '-';
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만`;
  return n.toLocaleString();
}

const BID_STATUS_COLOR: Record<string, string> = {
  '공고중': '#3b82f6', '낙찰': '#22c55e', '유찰': '#94a3b8',
};

function BidsView({ bids, loaded, statusFilter, onStatusFilter }: {
  bids: BidItem[]; loaded: boolean; statusFilter: string; onStatusFilter: (s: string) => void;
}) {
  const statuses = ['공고중', '낙찰', '유찰'];
  const counts = Object.fromEntries(statuses.map(s => [s, bids.filter(b => b.상태 === s).length]));
  const filtered = bids.filter(b => b.상태 === statusFilter);

  if (!loaded) {
    return <div className="flex-1 flex items-center justify-center py-24 text-zinc-400 text-sm">입찰정보 불러오는 중…</div>;
  }

  return (
    <div className="flex-1 min-w-0">
      {/* 상태 필터 */}
      <div className="flex gap-2 mb-5">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => onStatusFilter(s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${statusFilter === s ? 'text-white shadow-sm' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
            style={statusFilter === s ? { backgroundColor: BID_STATUS_COLOR[s] } : {}}
          >
            {s}
            <span className={`text-[10px] font-normal ${statusFilter === s ? 'text-white/80' : 'text-zinc-400'}`}>{counts[s]}</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-400 self-center">총 {bids.length}건</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-sm">해당 상태의 입찰 건이 없습니다</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(bid => (
            <div key={bid.id} className="bg-white border border-zinc-100 hover:border-zinc-200 hover:shadow-sm transition-all rounded-xl px-5 py-4">
              <div className="flex items-start gap-3">
                {/* 상태 뱃지 */}
                <span className="shrink-0 mt-0.5 text-[10px] font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: BID_STATUS_COLOR[bid.상태] ?? '#94a3b8' }}>
                  {bid.상태}
                </span>
                {/* 공고명 */}
                <div className="flex-1 min-w-0">
                  {bid.공고URL ? (
                    <a href={bid.공고URL} target="_blank" rel="noreferrer" className="text-sm font-semibold text-zinc-900 hover:text-blue-600 transition-colors line-clamp-2">
                      {bid.공고명}
                    </a>
                  ) : (
                    <p className="text-sm font-semibold text-zinc-900 line-clamp-2">{bid.공고명}</p>
                  )}
                  <p className="text-xs text-zinc-500 mt-0.5">{bid.공고기관}{bid.지역 && ` · ${bid.지역}`}</p>
                </div>
              </div>

              {/* 금액 정보 */}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                <div>
                  <span className="text-zinc-400">배정예산 </span>
                  <span className="font-semibold text-zinc-800">{fmtWon(bid.배정예산)}</span>
                </div>
                {bid.추천입찰가 && (
                  <div>
                    <span className="text-zinc-400">추천입찰가 </span>
                    <span className="font-semibold text-blue-600">{fmtWon(bid.추천입찰가)}</span>
                    {bid.적용낙찰률 && <span className="text-zinc-400 ml-1">({bid.적용낙찰률})</span>}
                  </div>
                )}
                {bid.실제낙찰금액 && (
                  <div>
                    <span className="text-zinc-400">낙찰금액 </span>
                    <span className="font-semibold text-green-600">{fmtWon(bid.실제낙찰금액)}</span>
                    {bid.실제낙찰률 && <span className="text-zinc-400 ml-1">({bid.실제낙찰률.toFixed(2)}%)</span>}
                  </div>
                )}
                {bid.낙찰업체 && (
                  <div>
                    <span className="text-zinc-400">낙찰업체 </span>
                    <span className="font-medium text-zinc-700">{bid.낙찰업체}</span>
                  </div>
                )}
              </div>

              {/* 날짜 + 방법 */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                {bid.공고일 && <span>공고 {bid.공고일}</span>}
                {bid.마감일 && <span>마감 {bid.마감일}</span>}
                {bid.개찰일 && <span>개찰 {bid.개찰일}</span>}
                {(bid.입찰방법 || bid.예가방법) && (
                  <span className="ml-auto">{[bid.입찰방법, bid.예가방법].filter(Boolean).join(' · ')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

function SearchInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="제목, 건축가, 태그 검색..."
        className="w-full pl-9 pr-3 py-1.5 bg-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300"
      />
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </div>
  );
}

function MobileMoreMenu() {
  const [open, setOpen] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsIOS(ios && !isStandalone);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative md:hidden" ref={menuRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="p-2 text-zinc-400 hover:text-zinc-700"
        aria-label="더보기"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[160px]">
          <Link href="/seoul-import" className="block px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50" onClick={() => setOpen(false)}>서울시 공모전</Link>
          <Link href="/scorer-import" className="block px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50" onClick={() => setOpen(false)}>스코어러</Link>
          <Link href="/bookmarklet" className="block px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50" onClick={() => setOpen(false)}>북마클릿</Link>
          {isIOS && (
            <div className="border-t border-zinc-100 mt-1 pt-2 px-3 pb-2 text-xs text-zinc-500 leading-relaxed">
              Safari 하단 공유 버튼을 누른 뒤 &quot;홈 화면에 추가&quot;를 선택하세요.
            </div>
          )}
        </div>
      )}
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
  const [editingRef, setEditingRef] = useState<Reference | null>(null);
  const [tab, setTab] = useState<'refs' | 'competitions' | 'bids'>('refs');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const syncingIds = useRef<Set<string>>(new Set());
  const [bids, setBids] = useState<BidItem[]>([]);
  const [bidsLoaded, setBidsLoaded] = useState(false);
  const [bidStatusFilter, setBidStatusFilter] = useState<string>('공고중');

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

  function handleEdit(id: string) {
    const ref = refs.find(r => r.id === id);
    if (ref) setEditingRef(ref);
  }

  async function handleDelete(id: string) {
    if (!confirm('이 레퍼런스를 삭제하시겠습니까?')) return;
    const ref = refs.find(r => r.id === id);
    await deleteRef(id);
    archiveRefNotionSchedules(ref);
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
    if (syncingIds.current.has(id)) return;
    const ref = refs.find(r => r.id === id);
    if (!ref?.competitionData) return;
    syncingIds.current.add(id);

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
      }).catch(() => {/* silent */}).finally(() => { syncingIds.current.delete(id); });
    } else {
      syncingIds.current.delete(id);
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

  const activeFilterCount =
    filters.program.length + filters.material.length + filters.mass.length + filters.scale.length +
    filters.designItem.length + filters.site.length + filters.region.length + filters.refType.length +
    (filters.collectionId ? 1 : 0);

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
            <div className="hidden md:block flex-1 max-w-md">
              <SearchInput value={filters.search} onChange={v => setFilters(f => ({ ...f, search: v }))} />
            </div>
          )}
          {tab === 'refs' && (
            <button
              onClick={() => setMobileSearchOpen(v => !v)}
              className="md:hidden p-2 text-zinc-400 hover:text-zinc-700 shrink-0"
              aria-label="검색"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <MobileMoreMenu />
            <Link href="/seoul-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden md:block">서울시 공모전</Link>
            <Link href="/scorer-import" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden md:block">스코어러</Link>
            <Link href="/bookmarklet" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden md:block">북마클릿</Link>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
            >
              <span className="text-lg leading-none">+</span>
              레퍼런스 추가
            </button>
          </div>
        </div>

        {tab === 'refs' && mobileSearchOpen && (
          <div className="md:hidden px-6 pb-3">
            <SearchInput value={filters.search} onChange={v => setFilters(f => ({ ...f, search: v }))} autoFocus />
          </div>
        )}

        {/* 탭 */}
        <div className="max-w-screen-xl mx-auto px-6 flex gap-0 border-t border-zinc-100 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setTab('refs')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${tab === 'refs' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            레퍼런스 {regularRefs.length > 0 && <span className="ml-1 text-xs text-zinc-400">{regularRefs.length}</span>}
          </button>
          <button
            onClick={() => setTab('competitions')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${tab === 'competitions' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            공모전 {competitionRefs.length > 0 && <span className="ml-1 text-xs text-zinc-400">{competitionRefs.length}</span>}
          </button>
          <button
            onClick={() => {
              setTab('bids');
              if (!bidsLoaded) {
                fetch('/api/bids').then(r => r.json()).then((data: BidItem[]) => {
                  setBids(data);
                  setBidsLoaded(true);
                }).catch(() => {});
              }
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'bids' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            입찰정보
          </button>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-6 flex gap-8">
        {tab === 'refs' ? (
          <>
            <div className="hidden md:flex">
              <FilterPanel
                filters={filters}
                onFilterChange={setFilters}
                collections={collections}
                totalCount={regularRefs.length}
                filteredCount={filtered.length}
                onCreateCollection={handleCreateCollection}
                onDeleteCollection={handleDeleteCollection}
              />
            </div>
            <main className="flex-1 min-w-0">
              <button
                onClick={() => setFilterSheetOpen(true)}
                className="md:hidden mb-4 flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-600 bg-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
                </svg>
                필터
                {activeFilterCount > 0 && (
                  <span className="bg-zinc-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
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
                      onEdit={handleEdit}
                      onCollectionToggle={handleCollectionToggle}
                    />
                  ))}
                </div>
              )}
            </main>
            <FilterSheet
              open={filterSheetOpen}
              onClose={() => setFilterSheetOpen(false)}
              filters={filters}
              onFilterChange={setFilters}
              collections={collections}
              totalCount={regularRefs.length}
              filteredCount={filtered.length}
              onCreateCollection={handleCreateCollection}
              onDeleteCollection={handleDeleteCollection}
            />
          </>
        ) : tab === 'competitions' ? (
          <CompetitionView
            refs={competitionRefs}
            onStatusChange={handleCompetitionStatusChange}
            onDelete={handleDelete}
            onAutoFill={handleAutoFill}
          />
        ) : (
          <BidsView bids={bids} loaded={bidsLoaded} statusFilter={bidStatusFilter} onStatusFilter={setBidStatusFilter} />
        )}
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center md:overflow-y-auto md:py-8">
          <div className="bg-white w-full h-full overflow-y-auto p-6 md:h-auto md:overflow-visible md:rounded-2xl md:shadow-2xl md:max-w-2xl md:mx-4">
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

      {editingRef && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-zinc-900">레퍼런스 수정</h2>
              <button onClick={() => setEditingRef(null)} className="text-zinc-400 hover:text-zinc-700 text-2xl leading-none">×</button>
            </div>
            <UploadForm
              collections={collections}
              editRef={editingRef}
              onSave={async () => { setEditingRef(null); await load(); }}
              onCancel={() => setEditingRef(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
