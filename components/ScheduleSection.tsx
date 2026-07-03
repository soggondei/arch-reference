'use client';

import { useState } from 'react';
import {
  ScheduleItem, ScheduleCategory, ScheduleStatus,
  SCHEDULE_CATEGORY_LABEL, SCHEDULE_STATUS_LABEL,
  CompetitionData,
} from '@/lib/types';
import { generateScheduleTemplate } from '@/lib/schedule-template';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const CATEGORY_COLOR: Record<ScheduleCategory, string> = {
  external: '#8b5cf6',
  design:   '#ec4899',
  admin:    '#f59e0b',
};

const STATUS_COLOR: Record<ScheduleStatus, string> = {
  planned:      '#94a3b8',
  'in-progress': '#f97316',
  done:         '#22c55e',
  cancelled:    '#e2e8f0',
};

const STATUSES: ScheduleStatus[] = ['planned', 'in-progress', 'done', 'cancelled'];

interface Props {
  refId: string;
  projectName: string;
  competitionData: CompetitionData;
  onUpdate: (schedules: ScheduleItem[]) => Promise<void>;
}

export default function ScheduleSection({ refId, projectName, competitionData, onUpdate }: Props) {
  const schedules = competitionData.schedules ?? [];
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ taskName: '', category: 'design' as ScheduleCategory, startDate: '', endDate: '', status: 'planned' as ScheduleStatus });

  async function handleGenerateTemplate() {
    if (schedules.length > 0 && !confirm('기존 스케줄을 덮어씁니다. 계속할까요?')) return;
    const generated = generateScheduleTemplate({
      submissionDate: competitionData.submissionDate,
      registrationDate: competitionData.registrationDate,
      announcementDate: competitionData.announcementDate,
      resultDate: competitionData.resultDate,
    });
    await onUpdate(generated);
  }

  async function handleStatusCycle(item: ScheduleItem) {
    const idx = STATUSES.indexOf(item.status);
    const next = STATUSES[(idx + 1) % STATUSES.length];
    const updated = schedules.map(s => s.id === item.id ? { ...s, status: next } : s);
    await onUpdate(updated);

    // Notion 동기화 (notionPageId 있는 경우만 자동 업데이트)
    if (item.notionPageId) {
      fetch('/api/notion-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notionPageId: item.notionPageId,
          taskName: item.taskName,
          projectName,
          category: item.category,
          status: next,
          endDate: item.endDate,
          startDate: item.startDate,
        }),
      }).catch(() => {});
    }
  }

  async function handleDelete(item: ScheduleItem) {
    const updated = schedules.filter(s => s.id !== item.id);
    await onUpdate(updated);

    if (item.notionPageId) {
      fetch('/api/notion-schedule', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notionPageId: item.notionPageId }),
      }).catch(() => {});
    }
  }

  async function handleNotionSync() {
    setSyncing(true);
    setSyncMsg(null);
    let ok = 0; let fail = 0;

    const updatedSchedules = [...schedules];

    for (let i = 0; i < updatedSchedules.length; i++) {
      const item = updatedSchedules[i];
      try {
        if (item.notionPageId) {
          // 업데이트
          await fetch('/api/notion-schedule', {
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
            }),
          });
          ok++;
        } else {
          // 신규 생성
          const res = await fetch('/api/notion-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskName: item.taskName,
              projectName,
              category: item.category,
              status: item.status,
              endDate: item.endDate,
              startDate: item.startDate,
            }),
          });
          if (res.ok) {
            const data = await res.json() as { pageId?: string };
            if (data.pageId) updatedSchedules[i] = { ...item, notionPageId: data.pageId };
            ok++;
          } else {
            fail++;
          }
        }
      } catch {
        fail++;
      }
    }

    await onUpdate(updatedSchedules);
    setSyncing(false);
    setSyncMsg(fail > 0 ? `${ok}개 동기화, ${fail}개 실패` : `✓ ${ok}개 Notion 동기화 완료`);
    setTimeout(() => setSyncMsg(null), 3000);
  }

  async function handleAddSubmit() {
    if (!addForm.taskName || !addForm.endDate) return;
    const newItem: ScheduleItem = {
      id: generateId(),
      taskName: addForm.taskName,
      category: addForm.category,
      startDate: addForm.startDate || undefined,
      endDate: addForm.endDate,
      status: addForm.status,
    };
    await onUpdate([...schedules, newItem].sort((a, b) => a.endDate.localeCompare(b.endDate)));
    setAddForm({ taskName: '', category: 'design', startDate: '', endDate: '', status: 'planned' });
    setShowAddForm(false);
  }

  const hasSubmission = !!competitionData.submissionDate;
  const syncedCount = schedules.filter(s => s.notionPageId).length;

  return (
    <div className="border border-zinc-100 rounded-xl overflow-hidden mt-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 bg-zinc-50">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">스케줄</p>
          {schedules.length > 0 && (
            <span className="text-[10px] text-zinc-400">
              {schedules.length}개 {syncedCount > 0 && `· Notion ${syncedCount}개 동기화됨`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {schedules.length > 0 && (
            <button
              onClick={() => void handleNotionSync()}
              disabled={syncing}
              className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50 font-medium"
            >
              {syncing ? (
                <span className="w-3 h-3 border border-purple-400 border-t-purple-700 rounded-full animate-spin" />
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
              )}
              Notion 동기화
            </button>
          )}
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="text-xs text-zinc-400 hover:text-zinc-700"
          >
            + 항목 추가
          </button>
          {!hasSubmission ? null : schedules.length === 0 ? (
            <button
              onClick={() => void handleGenerateTemplate()}
              className="text-xs bg-zinc-900 text-white px-2.5 py-1 rounded-lg hover:bg-zinc-700"
            >
              템플릿 생성
            </button>
          ) : (
            <button
              onClick={() => void handleGenerateTemplate()}
              className="text-xs text-zinc-400 hover:text-zinc-600 underline"
            >
              재생성
            </button>
          )}
        </div>
      </div>

      {syncMsg && (
        <div className={`px-4 py-1.5 text-xs font-medium ${syncMsg.startsWith('✓') ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
          {syncMsg}
        </div>
      )}

      {/* 항목 추가 폼 */}
      {showAddForm && (
        <div className="px-4 py-3 border-t border-zinc-100 bg-zinc-50/50 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="태스크명"
              value={addForm.taskName}
              onChange={e => setAddForm(f => ({ ...f, taskName: e.target.value }))}
              className="border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm col-span-2 focus:outline-none focus:border-zinc-400"
            />
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-400">시작일 (선택)</label>
              <input type="date" value={addForm.startDate} onChange={e => setAddForm(f => ({ ...f, startDate: e.target.value }))}
                className="border border-zinc-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-400" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-400">마감일 *</label>
              <input type="date" value={addForm.endDate} onChange={e => setAddForm(f => ({ ...f, endDate: e.target.value }))}
                className="border border-zinc-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-400" />
            </div>
            <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value as ScheduleCategory }))}
              className="border border-zinc-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-400">
              {(Object.keys(SCHEDULE_CATEGORY_LABEL) as ScheduleCategory[]).map(c => (
                <option key={c} value={c}>{SCHEDULE_CATEGORY_LABEL[c]}</option>
              ))}
            </select>
            <select value={addForm.status} onChange={e => setAddForm(f => ({ ...f, status: e.target.value as ScheduleStatus }))}
              className="border border-zinc-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-400">
              {STATUSES.map(s => (
                <option key={s} value={s}>{SCHEDULE_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void handleAddSubmit()} className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-700">추가</button>
            <button onClick={() => setShowAddForm(false)} className="text-xs text-zinc-400 hover:text-zinc-700">취소</button>
          </div>
        </div>
      )}

      {/* 스케줄 목록 */}
      {schedules.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-zinc-300">
            {hasSubmission ? '"템플릿 생성"으로 자동 일정을 만들거나 직접 추가하세요' : '작품접수 날짜를 먼저 입력하면 템플릿을 자동 생성할 수 있습니다'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-50">
          {schedules.map(item => (
            <div
              key={item.id}
              className={`px-4 py-2.5 flex items-center gap-3 group transition-colors ${
                item.isMilestone ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-zinc-50/50'
              }`}
            >
              {/* 마일스톤 아이콘 또는 카테고리 도트 */}
              {item.isMilestone ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-amber-400">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              ) : (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLOR[item.category] }} />
              )}

              {/* 태스크명 */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${
                  item.status === 'done'
                    ? 'text-zinc-400 line-through'
                    : item.isMilestone
                    ? 'font-bold text-zinc-900'
                    : 'font-medium text-zinc-800'
                }`}>
                  {item.taskName}
                </p>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {item.startDate && item.startDate !== item.endDate
                    ? `${item.startDate} ~ ${item.endDate}`
                    : item.endDate}
                  {' · '}{SCHEDULE_CATEGORY_LABEL[item.category]}
                  {item.notionPageId && <span className="ml-1 text-purple-400">N</span>}
                </p>
              </div>

              {/* 상태 토글 */}
              <button
                onClick={() => void handleStatusCycle(item)}
                className="shrink-0 text-[10px] font-bold text-white px-2 py-0.5 rounded-full transition-colors"
                style={{ backgroundColor: STATUS_COLOR[item.status] }}
              >
                {SCHEDULE_STATUS_LABEL[item.status]}
              </button>

              {/* 삭제 */}
              <button
                onClick={() => void handleDelete(item)}
                className="shrink-0 text-zinc-200 hover:text-red-400 text-base leading-none opacity-0 group-hover:opacity-100 transition-all"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
