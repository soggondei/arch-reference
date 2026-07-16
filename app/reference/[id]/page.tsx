'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Reference, Collection, CompetitionStatus, COMPETITION_STATUSES, COMPETITION_STATUS_COLOR, JudgeMember, ScheduleItem, CompetitionFile } from '@/lib/types';
import { getRefs, getCollections, updateRef, deleteRef, updateCompetitionStatus, archiveRefNotionSchedules } from '@/lib/store';
import { generateScheduleTemplate } from '@/lib/schedule-template';
import { TAG_LABELS, TagCategory } from '@/lib/tags';
import TagBadge from '@/components/TagBadge';
import SimilarPanel from '@/components/SimilarPanel';
import ScheduleSection from '@/components/ScheduleSection';
import Link from 'next/link';

const TAG_CATEGORIES: TagCategory[] = ['program', 'material', 'mass', 'scale', 'designItem', 'site', 'region'];

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm leading-snug">
      <span className="text-zinc-400 shrink-0 w-20">{label}</span>
      <span className="text-zinc-700">{value}</span>
    </div>
  );
}

function getDDay(dateStr?: string): number | null {
  if (!dateStr) return null;
  const matches = dateStr.match(/\d{4}-\d{2}-\d{2}/g);
  if (!matches) return null;
  const deadline = new Date([...matches].sort().pop()! + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
}

function fileExt(name: string): string {
  return name.split('.').pop()?.toUpperCase() ?? 'FILE';
}

export default function ReferencePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ref_, setRef] = useState<Reference | null>(null);
  const [allRefs, setAllRefs] = useState<Reference[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [editingCompetition, setEditingCompetition] = useState(false);
  const [competitionForm, setCompetitionForm] = useState<Record<string, string>>({});
  const [notionSyncMsg, setNotionSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [refs, cols] = await Promise.all([getRefs(), getCollections()]);
    const found = refs.find(r => r.id === id) ?? null;
    setRef(found);
    setNoteValue(found?.description ?? '');
    setAllRefs(refs);
    setCollections(cols);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function saveNote() {
    if (!ref_) return;
    const updated = { ...ref_, description: noteValue };
    await updateRef(updated);
    setRef(updated);
    setEditingNote(false);
  }

  async function handleDelete() {
    if (!confirm('이 레퍼런스를 삭제하시겠습니까?')) return;
    await deleteRef(id);
    archiveRefNotionSchedules(ref_);
    router.push('/');
  }

  function startEditingCompetition() {
    const cd = ref_?.competitionData;
    setCompetitionForm({
      announcementDate: cd?.announcementDate ?? '',
      registrationDate: cd?.registrationDate ?? '',
      submissionDate: cd?.submissionDate ?? '',
      resultDate: cd?.resultDate ?? '',
      floorAreaText: cd?.floorAreaText ?? '',
      designFee: cd?.designFee ?? '',
      constructionCost: cd?.constructionCost ?? '',
      location: cd?.location ?? '',
      judgesText: cd?.judges ? judgesText(cd.judges) : '',
      submissions: cd?.submissions ?? '',
    });
    setEditingCompetition(true);
  }

  async function saveCompetitionData() {
    if (!ref_?.competitionData) return;
    const parsedJudges = parseJudgesFromText(competitionForm.judgesText || '');
    const updated = {
      ...ref_.competitionData,
      announcementDate: competitionForm.announcementDate || undefined,
      registrationDate: competitionForm.registrationDate || undefined,
      submissionDate: competitionForm.submissionDate || undefined,
      resultDate: competitionForm.resultDate || undefined,
      floorAreaText: competitionForm.floorAreaText || undefined,
      designFee: competitionForm.designFee || undefined,
      constructionCost: competitionForm.constructionCost || undefined,
      location: competitionForm.location || undefined,
      judges: parsedJudges.length > 0 ? parsedJudges : undefined,
      submissions: competitionForm.submissions || undefined,
    };
    await updateCompetitionStatus(id, updated);
    setRef(r => r ? { ...r, competitionData: updated } : r);
    setEditingCompetition(false);
  }

  async function handleScheduleUpdate(schedules: ScheduleItem[]) {
    if (!ref_?.competitionData) return;
    const updated = { ...ref_.competitionData, schedules };
    await updateCompetitionStatus(id, updated);
    setRef(r => r ? { ...r, competitionData: updated } : r);
  }

  async function autoSyncSchedulesToNotion(projectName: string, schedules: ScheduleItem[]): Promise<ScheduleItem[]> {
    const results = await Promise.allSettled(
      schedules.map(item =>
        fetch('/api/notion-schedule', {
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
        }).then(r => r.ok ? r.json() : null)
      )
    );
    return schedules.map((item, i) => {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value?.pageId) return { ...item, notionPageId: r.value.pageId as string };
      return item;
    });
  }

  async function handleStatusChange(status: CompetitionStatus) {
    if (!ref_?.competitionData) return;
    let updated = { ...ref_.competitionData, status };
    await updateCompetitionStatus(id, updated);
    setRef(r => r ? { ...r, competitionData: updated } : r);
    setShowStatusPicker(false);

    if (status === '등록완료' && (!updated.schedules || updated.schedules.length === 0)) {
      const schedules = generateScheduleTemplate({
        submissionDate: updated.submissionDate,
        registrationDate: updated.registrationDate,
        announcementDate: updated.announcementDate,
        resultDate: updated.resultDate,
      });
      if (schedules.length > 0) {
        const withSchedules = { ...updated, schedules };
        await updateCompetitionStatus(id, withSchedules);
        setRef(r => r ? { ...r, competitionData: withSchedules } : r);
        updated = withSchedules;

        // Notion 스케줄 자동 동기화
        setNotionSyncMsg('스케줄 Notion 동기화 중...');
        const synced = await autoSyncSchedulesToNotion(ref_.title, schedules);
        const withNotionIds = { ...updated, schedules: synced };
        await updateCompetitionStatus(id, withNotionIds);
        setRef(r => r ? { ...r, competitionData: withNotionIds } : r);
        updated = withNotionIds;
      }
    }

    if ((status === '등록예정' || status === '등록완료') && !updated.notionPageId) {
      setNotionSyncMsg('노션 등록 중...');
      try {
        const cd = updated;
        const res = await fetch('/api/notion-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: ref_.title,
            architect: ref_.architect,
            location: cd.location,
            submissionDate: cd.submissionDate,
            registrationDate: cd.registrationDate,
            announcementDate: cd.announcementDate,
            resultDate: cd.resultDate,
            designFee: cd.designFee,
            floorArea: cd.floorArea,
            sourceUrl: ref_.sourceUrl,
            submissions: cd.submissions,
          }),
        });
        const data = await res.json() as { url?: string; pageId?: string; error?: string };
        if (res.ok && data.url) {
          setNotionSyncMsg(`✓ 노션 PROJECT MASTER에 등록됨`);
          if (data.pageId) {
            const withId = { ...updated, notionPageId: data.pageId };
            await updateCompetitionStatus(id, withId);
            setRef(r => r ? { ...r, competitionData: withId } : r);
          }
        } else {
          setNotionSyncMsg(`노션 등록 실패: ${data.error ?? '알 수 없는 오류'}`);
        }
      } catch {
        setNotionSyncMsg('노션 연결 오류');
      }
      setTimeout(() => setNotionSyncMsg(null), 4000);
    }
  }

  if (!ref_) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <p className="text-zinc-400">레퍼런스를 찾을 수 없습니다.</p>
    </div>
  );

  const cardCollections = collections.filter(c => ref_.collectionIds.includes(c.id));
  const cd = ref_.competitionData;
  const ddayReg = getDDay(cd?.registrationDate);
  const ddaySub = getDDay(cd?.submissionDate);

  function judgesText(judges: JudgeMember[]): string {
    return judges.map(j => j.affiliation ? `${j.name} (${j.affiliation})` : j.name).join('\n');
  }

  function parseJudgesFromText(text: string): JudgeMember[] {
    return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const m = line.match(/^(.+?)\s*[（(]([^)）]+)[)）]\s*$/);
      if (m) return { name: m[1].trim(), affiliation: m[2].trim() };
      return { name: line };
    }).filter(j => j.name.length > 0);
  }

  function getTagValues(category: TagCategory): string[] {
    const val = ref_!.tags[category];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  }

  const hasTags = TAG_CATEGORIES.some(c => getTagValues(c).filter(Boolean).length > 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      {notionSyncMsg && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg text-white transition-all ${
          notionSyncMsg.startsWith('✓') ? 'bg-green-600' : notionSyncMsg.includes('중') ? 'bg-zinc-700' : 'bg-red-600'
        }`}>
          {notionSyncMsg}
        </div>
      )}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
        <div className="max-w-screen-lg mx-auto px-6 h-14 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-zinc-700 flex items-center gap-1.5 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            목록으로
          </Link>
          <span className="text-zinc-200">|</span>
          <h1 className="font-semibold text-zinc-900 text-sm truncate">{ref_.title}</h1>
          <button onClick={() => void handleDelete()} className="ml-auto text-xs text-zinc-400 hover:text-red-500 transition-colors">
            삭제
          </button>
        </div>
      </header>

      <div className="max-w-screen-lg mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          {/* 이미지 */}
          <div className="rounded-2xl overflow-hidden bg-zinc-100 aspect-[4/3]">
            {ref_.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ref_.imageUrl} alt={ref_.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-300">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
            )}
          </div>

          {/* 정보 */}
          <div className="flex flex-col gap-5">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {/* 공모전 상태 뱃지 */}
                {cd && (
                  <div className="relative">
                    <button
                      onClick={() => setShowStatusPicker(v => !v)}
                      className="flex items-center gap-1 text-xs font-bold text-white px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: COMPETITION_STATUS_COLOR[cd.status] }}
                    >
                      {cd.status}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {showStatusPicker && (
                      <div className="absolute left-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[130px]">
                        {COMPETITION_STATUSES.map(s => (
                          <button
                            key={s}
                            onClick={() => void handleStatusChange(s)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 text-left"
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COMPETITION_STATUS_COLOR[s] }} />
                            <span className={s === cd.status ? 'font-bold text-zinc-900' : 'text-zinc-600'}>{s}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* D-days */}
                {ddayReg !== null && (
                  <span className="flex items-center gap-1 text-xs font-bold text-white px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: ddayReg < 0 ? '#94a3b8' : ddayReg <= 7 ? '#ef4444' : ddayReg <= 30 ? '#f97316' : '#3b82f6' }}>
                    <span className="font-normal opacity-80">등록</span>
                    {ddayReg < 0 ? '마감' : ddayReg === 0 ? 'D-Day' : `D-${ddayReg}`}
                  </span>
                )}
                {ddaySub !== null && (
                  <span className="flex items-center gap-1 text-xs font-bold text-white px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: ddaySub < 0 ? '#94a3b8' : ddaySub <= 7 ? '#ef4444' : ddaySub <= 30 ? '#f97316' : '#3b82f6' }}>
                    <span className="font-normal opacity-80">제출</span>
                    {ddaySub < 0 ? '마감' : ddaySub === 0 ? 'D-Day' : `D-${ddaySub}`}
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 leading-tight">{ref_.title}</h2>
              {(ref_.architect || ref_.year) && (
                <p className="text-zinc-500 mt-1">{[ref_.architect, ref_.year].filter(Boolean).join(' · ')}</p>
              )}
            </div>

            {ref_.sourceUrl && (
              <a href={ref_.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm text-zinc-400 hover:text-zinc-700 underline truncate">
                {ref_.sourceUrl}
              </a>
            )}

            {/* 법규검토 연동 버튼 */}
            {!ref_.competitionData && ref_.refType !== 'link' && (() => {
              const PROGRAM_TO_USE: Record<string, string> = {
                '주거': '단독주택', '상업': '제1종근린생활시설', '업무': '업무시설',
                '문화': '문화 및 집회시설', '교육': '교육연구시설', '의료': '의료시설',
                '종교': '종교시설', '산업': '공장', '공공': '공공용시설',
              };
              const program = ref_.tags.program[0] || '';
              const lawUse = PROGRAM_TO_USE[program] || '';
              const params = new URLSearchParams();
              if (lawUse) params.set('use', lawUse);
              const qs = params.toString();
              return (
                <a
                  href={`https://law-review-web.vercel.app${qs ? `?${qs}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors w-fit"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  법규검토 열기
                  {program && <span className="opacity-60">({program})</span>}
                </a>
              );
            })()}

            {/* 공모전 상세 정보 */}
            {cd && (
              <div className="border border-zinc-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">공모전 정보</p>
                  {!editingCompetition ? (
                    <button onClick={startEditingCompetition} className="text-xs text-zinc-400 hover:text-zinc-700 underline">수정</button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => void saveCompetitionData()} className="text-xs bg-zinc-900 text-white px-2.5 py-1 rounded-lg hover:bg-zinc-700">저장</button>
                      <button onClick={() => setEditingCompetition(false)} className="text-xs text-zinc-400 hover:text-zinc-700">취소</button>
                    </div>
                  )}
                </div>
                {editingCompetition ? (
                  <div className="px-4 pb-4 pt-2 flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                      {[
                        { key: 'announcementDate', label: '공고일', placeholder: '2026-01-01' },
                        { key: 'floorAreaText', label: '연면적', placeholder: '3,600㎡' },
                        { key: 'registrationDate', label: '참가등록', placeholder: '2026-01-15' },
                        { key: 'designFee', label: '설계비', placeholder: '약 6.9억 원' },
                        { key: 'submissionDate', label: '작품접수', placeholder: '2026-02-01' },
                        { key: 'constructionCost', label: '공사비', placeholder: '약 50억 원' },
                        { key: 'resultDate', label: '심사일', placeholder: '2026-03-01' },
                        { key: 'location', label: '위치', placeholder: '서울시 종로구' },
                      ].map(({ key, label, placeholder }) => (
                        <div key={key} className="flex flex-col gap-1 mt-2">
                          <label className="text-[11px] text-zinc-400">{label}</label>
                          <input
                            type="text"
                            value={competitionForm[key] ?? ''}
                            onChange={e => setCompetitionForm(f => ({ ...f, [key]: e.target.value }))}
                            placeholder={placeholder}
                            className="border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-zinc-400"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1 mt-1">
                      <label className="text-[11px] text-zinc-400">제출물 (쉼표로 구분)</label>
                      <input
                        type="text"
                        value={competitionForm.submissions ?? ''}
                        onChange={e => setCompetitionForm(f => ({ ...f, submissions: e.target.value }))}
                        placeholder="배치도, 평면도, 입면도, 단면도, 투시도, 설계설명서"
                        className="border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-zinc-400"
                      />
                    </div>
                    <div className="flex flex-col gap-1 mt-1">
                      <label className="text-[11px] text-zinc-400">심사위원 (한 줄에 한 명, 형식: 이름 (소속))</label>
                      <textarea
                        rows={3}
                        value={competitionForm.judgesText ?? ''}
                        onChange={e => setCompetitionForm(f => ({ ...f, judgesText: e.target.value }))}
                        placeholder={'홍길동 (서울대학교)\n김철수 (연세대학교)'}
                        className="border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-zinc-400 resize-none"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
                      <div className="px-4 py-2 border-r-0 sm:border-r border-zinc-100 flex flex-col gap-2">
                        <InfoRow label="공고일"   value={cd.announcementDate} />
                        <InfoRow label="참가등록" value={cd.registrationDate} />
                        <InfoRow label="작품접수" value={cd.submissionDate} />
                        <InfoRow label="심사일"   value={cd.resultDate} />
                        {!cd.announcementDate && !cd.registrationDate && !cd.submissionDate && !cd.resultDate && (
                          <p className="text-xs text-zinc-300 py-1">일정 정보 없음</p>
                        )}
                      </div>
                      <div className="px-4 py-2 flex flex-col gap-2">
                        <InfoRow label="연면적"   value={cd.floorAreaText} />
                        <InfoRow label="설계비"   value={cd.designFee} />
                        <InfoRow label="공사비"   value={cd.constructionCost} />
                        <InfoRow label="위치"     value={cd.location} />
                        {!cd.floorAreaText && !cd.designFee && !cd.constructionCost && !cd.location && (
                          <p className="text-xs text-zinc-300 py-1">규모·비용 정보 없음</p>
                        )}
                      </div>
                    </div>
                    {cd.submissions && (
                      <div className="px-4 py-3 border-t border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">제출물</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cd.submissions.split(',').map((s, i) => (
                            <span key={i} className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">{s.trim()}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {cd.judges && cd.judges.length > 0 && (
                      <div className="px-4 py-3 border-t border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">심사위원</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                          {cd.judges.map((j: JudgeMember, i: number) => (
                            <div key={i} className="text-xs leading-snug">
                              <span className="font-medium text-zinc-700">{j.name}</span>
                              {j.affiliation && <span className="text-zinc-400 ml-1">({j.affiliation})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {cd.files && cd.files.length > 0 && (
                      <div className="px-4 py-3 border-t border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">관련 파일</p>
                        <div className="flex flex-col gap-1.5">
                          {cd.files.map((f: CompetitionFile, i: number) => (
                            <a
                              key={i}
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2.5 group hover:bg-zinc-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                            >
                              <span className="shrink-0 text-[9px] font-bold text-white px-1.5 py-0.5 rounded bg-zinc-400 group-hover:bg-zinc-600 transition-colors">
                                {fileExt(f.name)}
                              </span>
                              <span className="text-xs text-zinc-600 group-hover:text-zinc-900 truncate flex-1 transition-colors">
                                {f.name}
                              </span>
                              <svg className="shrink-0 text-zinc-300 group-hover:text-zinc-500 transition-colors" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                              </svg>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 스케줄 */}
            {cd && (
              <ScheduleSection
                refId={id}
                projectName={ref_.title}
                competitionData={cd}
                onUpdate={handleScheduleUpdate}
              />
            )}

            {/* 태그 (공모전이 아닌 경우 또는 공모전이어도 태그 있으면) */}
            {hasTags && (
              <div className="flex flex-col gap-3">
                {TAG_CATEGORIES.map(category => {
                  const values = getTagValues(category);
                  if (values.length === 0 || (values.length === 1 && !values[0])) return null;
                  return (
                    <div key={category} className="flex items-start gap-3">
                      <span className="text-xs text-zinc-400 w-20 shrink-0 pt-0.5">{TAG_LABELS[category]}</span>
                      <div className="flex flex-wrap gap-1">
                        {values.map(v => <TagBadge key={v} label={v} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {cardCollections.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 w-20 shrink-0">컬렉션</span>
                <div className="flex flex-wrap gap-2">
                  {cardCollections.map(c => (
                    <span key={c.id} className="flex items-center gap-1.5 text-sm text-zinc-600">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-zinc-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">메모</span>
                {!editingNote && (
                  <button onClick={() => setEditingNote(true)} className="text-xs text-zinc-400 hover:text-zinc-700 underline">
                    {ref_.description ? '수정' : '추가'}
                  </button>
                )}
              </div>
              {editingNote ? (
                <div className="flex flex-col gap-2">
                  <textarea value={noteValue} onChange={e => setNoteValue(e.target.value)}
                    rows={4} autoFocus
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => void saveNote()} className="text-sm bg-zinc-900 text-white px-4 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors">저장</button>
                    <button onClick={() => { setEditingNote(false); setNoteValue(ref_.description ?? ''); }}
                      className="text-sm text-zinc-500 hover:text-zinc-700">취소</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">
                  {ref_.description || <span className="text-zinc-300">메모 없음</span>}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 유사 레퍼런스 추천 */}
        <SimilarPanel
          target={ref_}
          allRefs={allRefs}
          collections={collections}
          onRefAdded={() => void load()}
        />
      </div>
    </div>
  );
}
