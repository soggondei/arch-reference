'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Reference, CompetitionData, CompetitionStatus, COMPETITION_STATUSES, COMPETITION_STATUS_COLOR } from '@/lib/types';
import { getRefs, updateCompetitionStatus } from '@/lib/store';

const STATUS_COLS: CompetitionStatus[] = ['관심', '등록예정', '등록완료', '작업중', '제출완료'];
const RESULT_COLS: CompetitionStatus[] = ['입선', '탈락'];

function getDDay(dateStr?: string): number | null {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const deadline = new Date(m[1]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
}

function formatDate(str?: string) {
  if (!str) return '';
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}` : str.slice(0, 10);
}

function DDayBadge({ dday }: { dday: number | null }) {
  if (dday === null) return null;
  const bg = dday < 0 ? '#94a3b8' : dday <= 7 ? '#ef4444' : dday <= 30 ? '#f97316' : '#3b82f6';
  const label = dday < 0 ? '마감' : dday === 0 ? 'D-Day' : `D-${dday}`;
  return (
    <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: bg }}>
      {label}
    </span>
  );
}

function MemoEditor({ value, onSave }: { value?: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full text-left text-xs text-zinc-400 hover:text-zinc-600 truncate mt-1 italic"
      >
        {value || '메모 추가...'}
      </button>
    );
  }
  return (
    <div className="mt-1">
      <textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        rows={2}
        className="w-full text-xs border border-zinc-200 rounded px-2 py-1 resize-none focus:outline-none focus:border-zinc-400"
      />
      <div className="flex gap-1 mt-1">
        <button onClick={() => { onSave(draft); setEditing(false); }} className="text-xs text-white bg-zinc-800 px-2 py-0.5 rounded hover:bg-zinc-600">저장</button>
        <button onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-600">취소</button>
      </div>
    </div>
  );
}

function CompetitionCard({
  ref_,
  onStatusChange,
  onMemoSave,
}: {
  ref_: Reference;
  onStatusChange: (id: string, status: CompetitionStatus) => void;
  onMemoSave: (id: string, memo: string) => void;
}) {
  const cd = ref_.competitionData!;
  const dday = getDDay(cd.submissionDate);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-zinc-100 hover:border-zinc-200 hover:shadow-sm transition-all p-3 flex flex-col gap-1.5">
      {/* 제목 + D-day */}
      <div className="flex items-start gap-2">
        <a href={ref_.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900 leading-snug hover:underline line-clamp-2">{ref_.title}</p>
        </a>
        <DDayBadge dday={dday} />
      </div>

      {/* 발주처·연도 */}
      {(ref_.architect || ref_.year) && (
        <p className="text-xs text-zinc-400 truncate">{[ref_.architect, ref_.year].filter(Boolean).join(' · ')}</p>
      )}

      {/* 날짜·비용 */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
        {cd.submissionDate && <span>접수 {formatDate(cd.submissionDate)}</span>}
        {cd.registrationDate && <span>등록 {formatDate(cd.registrationDate)}</span>}
        {cd.designFee && <span className="font-medium text-zinc-700">{cd.designFee}</span>}
        {cd.floorAreaText && <span>{cd.floorAreaText}</span>}
      </div>

      {/* 메모 */}
      <MemoEditor value={cd.memo} onSave={memo => onMemoSave(ref_.id, memo)} />

      {/* 상태 변경 */}
      <div className="relative pt-1 border-t border-zinc-50">
        <button
          onClick={() => setShowStatusPicker(v => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: COMPETITION_STATUS_COLOR[cd.status] }}
        >
          {cd.status}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {showStatusPicker && (
          <div className="absolute left-0 bottom-8 z-10 bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[120px]">
            {COMPETITION_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => { onStatusChange(ref_.id, s); setShowStatusPicker(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 text-left"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COMPETITION_STATUS_COLOR[s] }} />
                <span className={s === cd.status ? 'font-bold text-zinc-900' : 'text-zinc-600'}>{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  refs,
  onStatusChange,
  onMemoSave,
}: {
  status: CompetitionStatus;
  refs: Reference[];
  onStatusChange: (id: string, status: CompetitionStatus) => void;
  onMemoSave: (id: string, memo: string) => void;
}) {
  const totalFee = refs.reduce((sum, r) => sum + (r.competitionData?.designFeeAmount || 0), 0);

  return (
    <div className="flex flex-col min-w-[220px] max-w-[260px] w-full">
      {/* Column header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COMPETITION_STATUS_COLOR[status] }} />
          <span className="text-sm font-semibold text-zinc-700">{status}</span>
          <span className="text-xs text-zinc-400 bg-zinc-100 rounded-full px-1.5">{refs.length}</span>
        </div>
        {totalFee > 0 && (
          <span className="text-xs text-zinc-400">{totalFee.toFixed(1)}억</span>
        )}
      </div>
      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1">
        {refs.map(r => (
          <CompetitionCard key={r.id} ref_={r} onStatusChange={onStatusChange} onMemoSave={onMemoSave} />
        ))}
        {refs.length === 0 && (
          <div className="border-2 border-dashed border-zinc-100 rounded-xl py-6 text-center text-xs text-zinc-300">없음</div>
        )}
      </div>
    </div>
  );
}

export default function CompetitionsPage() {
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResults, setShowResults] = useState(false);

  const load = useCallback(async () => {
    const all = await getRefs();
    setRefs(all.filter(r => r.competitionData));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleStatusChange(id: string, status: CompetitionStatus) {
    const ref = refs.find(r => r.id === id);
    if (!ref?.competitionData) return;
    const updated = { ...ref.competitionData, status };
    await updateCompetitionStatus(id, updated);
    setRefs(prev => prev.map(r => r.id === id ? { ...r, competitionData: updated } : r));
  }

  async function handleMemoSave(id: string, memo: string) {
    const ref = refs.find(r => r.id === id);
    if (!ref?.competitionData) return;
    const updated = { ...ref.competitionData, memo };
    await updateCompetitionStatus(id, updated);
    setRefs(prev => prev.map(r => r.id === id ? { ...r, competitionData: updated } : r));
  }

  const byStatus = (s: CompetitionStatus) => refs.filter(r => r.competitionData?.status === s);
  const activeRefs = refs.filter(r => STATUS_COLS.includes(r.competitionData!.status));
  const totalActiveFee = activeRefs.reduce((sum, r) => sum + (r.competitionData?.designFeeAmount || 0), 0);
  const totalActive = activeRefs.length;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-zinc-700 flex items-center gap-1.5 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            목록으로
          </Link>
          <span className="text-zinc-200">|</span>
          <h1 className="font-semibold text-zinc-900 text-sm">공모전 트래커</h1>
          <div className="ml-auto flex items-center gap-3 text-xs text-zinc-400">
            {totalActive > 0 && <span>진행 중 {totalActive}건</span>}
            {totalActiveFee > 0 && <span>설계비 합계 약 {totalActiveFee.toFixed(1)}억</span>}
            <Link href="/scorer-import" className="text-zinc-400 hover:text-zinc-700 border border-zinc-200 px-3 py-1 rounded-lg">
              + 공모전 추가
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
          </div>
        ) : refs.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-zinc-500 font-medium mb-2">등록된 공모전이 없습니다</p>
            <p className="text-zinc-400 text-sm mb-6">스코어러에서 공모전을 가져와 관리해 보세요</p>
            <Link href="/scorer-import" className="bg-zinc-900 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-zinc-700 transition-colors">
              스코어러에서 가져오기
            </Link>
          </div>
        ) : (
          <>
            {/* 진행 중 칸반 */}
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4 min-w-max">
                {STATUS_COLS.map(status => (
                  <KanbanColumn
                    key={status}
                    status={status}
                    refs={byStatus(status)}
                    onStatusChange={handleStatusChange}
                    onMemoSave={handleMemoSave}
                  />
                ))}
              </div>
            </div>

            {/* 결과 섹션 */}
            {(byStatus('입선').length > 0 || byStatus('탈락').length > 0 || showResults) && (
              <div className="mt-8">
                <button
                  onClick={() => setShowResults(v => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-700 mb-4"
                >
                  결과 ({byStatus('입선').length + byStatus('탈락').length}건)
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${showResults ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {showResults && (
                  <div className="flex gap-4 overflow-x-auto pb-4">
                    {RESULT_COLS.map(status => (
                      <KanbanColumn
                        key={status}
                        status={status}
                        refs={byStatus(status)}
                        onStatusChange={handleStatusChange}
                        onMemoSave={handleMemoSave}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
