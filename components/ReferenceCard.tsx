'use client';

import { useState, useRef, useEffect } from 'react';
import { Reference, Collection, REF_TYPE_LABEL, REF_TYPE_COLOR, RefType, COMPETITION_STATUS_COLOR } from '@/lib/types';
import TagBadge from './TagBadge';
import Link from 'next/link';

interface ReferenceCardProps {
  ref_: Reference;
  collections: Collection[];
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
  onCollectionToggle?: (refId: string, colId: string) => void;
}

export default function ReferenceCard({ ref_, collections, onDelete, onEdit, onCollectionToggle }: ReferenceCardProps) {
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [imgError, setImgError] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showFolderPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowFolderPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showFolderPicker]);
  const allTags = [
    ...ref_.tags.program,
    ...ref_.tags.material,
    ...ref_.tags.mass,
    ref_.tags.scale,
    ref_.tags.region,
  ].filter(Boolean);

  const cardCollections = collections.filter(c => ref_.collectionIds.includes(c.id));

  const cd = ref_.competitionData;
  const dday = (() => {
    if (!cd?.submissionDate) return null;
    const m = cd.submissionDate.match(/(\d{4}-\d{2}-\d{2})/);
    if (!m) return null;
    const deadline = new Date(m[1]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
  })();

  return (
    <div className="group relative bg-white rounded-xl overflow-hidden border border-zinc-100 hover:border-zinc-300 hover:shadow-lg transition-all duration-200">
      <Link href={`/reference/${ref_.id}`}>
        <div className="relative aspect-[4/3] bg-zinc-50 overflow-hidden">
          {ref_.imageUrl && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ref_.imageUrl}
              alt={ref_.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-300">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
          )}
          {/* 좌측 상단: 유형 뱃지 + 공모전 상태 */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {ref_.refType && (
              <span
                className="text-xs font-semibold text-white px-1.5 py-0.5 rounded shadow w-fit"
                style={{ backgroundColor: REF_TYPE_COLOR[ref_.refType as RefType] }}
              >
                {REF_TYPE_LABEL[ref_.refType as RefType]}
              </span>
            )}
            {cd?.status && (
              <span
                className="text-xs font-semibold text-white px-1.5 py-0.5 rounded shadow w-fit"
                style={{ backgroundColor: COMPETITION_STATUS_COLOR[cd.status] }}
              >
                {cd.status}
              </span>
            )}
            {cardCollections.length > 0 && (
              <div className="flex gap-1 mt-0.5">
                {cardCollections.map(c => (
                  <span key={c.id} className="w-2.5 h-2.5 rounded-full border-2 border-white shadow" style={{ backgroundColor: c.color }} />
                ))}
              </div>
            )}
          </div>
          {/* 우측 하단: D-day */}
          {dday !== null && (
            <span
              className="absolute bottom-2 right-2 text-xs font-bold text-white px-1.5 py-0.5 rounded shadow"
              style={{ backgroundColor: dday < 0 ? '#94a3b8' : dday <= 7 ? '#ef4444' : dday <= 30 ? '#f97316' : '#3b82f6' }}
            >
              {dday < 0 ? '마감' : dday === 0 ? 'D-Day' : `D-${dday}`}
            </span>
          )}
        </div>
      </Link>

      <div className="p-3">
        <Link href={`/reference/${ref_.id}`}>
          <h3 className="font-semibold text-zinc-900 text-sm leading-tight mb-1 hover:text-zinc-600 truncate">
            {ref_.title}
          </h3>
        </Link>

        {(ref_.architect || ref_.year) && (
          <p className="text-xs text-zinc-400 mb-2">
            {[ref_.architect, ref_.year].filter(Boolean).join(' · ')}
          </p>
        )}

        <div className="flex flex-wrap gap-1">
          {allTags.slice(0, 4).map(tag => (
            <TagBadge key={tag} label={tag} />
          ))}
          {allTags.length > 4 && (
            <span className="text-xs text-zinc-400">+{allTags.length - 4}</span>
          )}
        </div>
      </div>

      {/* Hover action buttons */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Folder button */}
        <div className="relative" ref={pickerRef}>
          <button
            onClick={e => { e.preventDefault(); setShowFolderPicker(v => !v); }}
            className="w-7 h-7 rounded-full bg-white/90 text-zinc-500 hover:text-zinc-900 hover:bg-white shadow flex items-center justify-center"
            title="폴더"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          {showFolderPicker && (
            <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[140px]">
              {collections.length === 0 ? (
                <p className="text-xs text-zinc-400 px-3 py-2">폴더 없음</p>
              ) : (
                collections.map(col => {
                  const active = ref_.collectionIds.includes(col.id);
                  return (
                    <button
                      key={col.id}
                      onClick={e => { e.preventDefault(); onCollectionToggle?.(ref_.id, col.id); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50 text-left"
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                      <span className="flex-1 truncate text-zinc-700">{col.name}</span>
                      {active && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-zinc-900 shrink-0">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
        {/* Edit button */}
        {onEdit && (
          <button
            onClick={e => { e.preventDefault(); onEdit(ref_.id); }}
            className="w-7 h-7 rounded-full bg-white/90 text-zinc-500 hover:text-zinc-900 hover:bg-white shadow flex items-center justify-center"
            title="수정"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
        {/* Delete button */}
        <button
          onClick={e => { e.preventDefault(); onDelete(ref_.id); }}
          className="w-7 h-7 rounded-full bg-white/90 text-zinc-500 hover:text-red-500 hover:bg-white shadow flex items-center justify-center text-sm"
          title="삭제"
        >
          ×
        </button>
      </div>
    </div>
  );
}
