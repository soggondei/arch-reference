'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Reference, Collection, FilterState } from '@/lib/types';
import { getRefs, getCollections, deleteRef } from '@/lib/store';
import { autoTag } from '@/lib/auto-tag';
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

// useSearchParams는 Suspense boundary 안에서만 사용 가능
function BookmarkletHandler({ onPrefill }: { onPrefill: (data: Record<string, string>) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      const title = searchParams.get('title') || '';
      const description = searchParams.get('description') || '';
      const bodyText = searchParams.get('bodyText') || '';
      const keywords = searchParams.get('keywords') || '';

      const suggested = autoTag(title, description, [bodyText, keywords]);

      onPrefill({
        title,
        imageUrl: searchParams.get('imageUrl') || '',
        description,
        sourceUrl: searchParams.get('sourceUrl') || '',
        _suggestedTags: JSON.stringify(suggested),
      });
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

  const load = useCallback(() => {
    setRefs(getRefs());
    setCollections(getCollections());
  }, []);

  useEffect(() => { load(); }, [load]);

  function handlePrefill(data: Record<string, string>) {
    setPrefill(data);
    setShowUpload(true);
  }

  function handleDelete(id: string) {
    if (!confirm('이 레퍼런스를 삭제하시겠습니까?')) return;
    deleteRef(id);
    load();
  }

  const filtered = refs.filter(ref => {
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
          <h1 className="font-bold text-zinc-900 text-base tracking-tight shrink-0">Arch Reference</h1>
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
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Link
              href="/seoul-import"
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block"
            >
              서울시 공모전
            </Link>
            <Link
              href="/scorer-import"
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block"
            >
              스코어러
            </Link>
            <Link
              href="/bookmarklet"
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors hidden sm:block"
            >
              북마클릿 설치
            </Link>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
            >
              <span className="text-lg leading-none">+</span>
              레퍼런스 추가
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-6 flex gap-8">
        {/* Filter sidebar */}
        <FilterPanel
          filters={filters}
          onFilterChange={setFilters}
          collections={collections}
          totalCount={refs.length}
          filteredCount={filtered.length}
        />

        {/* Main grid */}
        <main className="flex-1 min-w-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              {refs.length === 0 ? (
                <>
                  <div className="text-zinc-200 mb-4">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                  </div>
                  <p className="text-zinc-500 font-medium">레퍼런스가 없습니다</p>
                  <p className="text-zinc-400 text-sm mt-1">우측 상단 버튼으로 첫 레퍼런스를 추가해 보세요</p>
                  <button
                    onClick={() => setShowUpload(true)}
                    className="mt-4 bg-zinc-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
                  >
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
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Upload modal */}
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
              onSave={() => { load(); setShowUpload(false); setPrefill(null); }}
              onCancel={() => { setShowUpload(false); setPrefill(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
