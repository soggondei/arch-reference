'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Reference, Collection } from '@/lib/types';
import { getRefs, getCollections, updateRef, deleteRef } from '@/lib/store';
import { TAG_LABELS, TagCategory } from '@/lib/tags';
import TagBadge from '@/components/TagBadge';
import SimilarPanel from '@/components/SimilarPanel';
import Link from 'next/link';

const TAG_CATEGORIES: TagCategory[] = ['program', 'material', 'mass', 'scale', 'designItem', 'site', 'region'];

export default function ReferencePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ref_, setRef] = useState<Reference | null>(null);
  const [allRefs, setAllRefs] = useState<Reference[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState('');

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
    router.push('/');
  }

  if (!ref_) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <p className="text-zinc-400">레퍼런스를 찾을 수 없습니다.</p>
    </div>
  );

  const cardCollections = collections.filter(c => ref_.collectionIds.includes(c.id));

  function getTagValues(category: TagCategory): string[] {
    const val = ref_!.tags[category];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  }

  const hasTags = TAG_CATEGORIES.some(c => getTagValues(c).filter(Boolean).length > 0);

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
