'use client';

import { useState, useEffect } from 'react';
import { Reference, Collection } from '@/lib/types';
import { getSimilarRefs, buildSearchQuery } from '@/lib/similarity';
import { SuggestedRef } from '@/app/api/suggest/route';
import { addRef, generateId } from '@/lib/store';
import TagBadge from './TagBadge';
import Link from 'next/link';

interface SimilarPanelProps {
  target: Reference;
  allRefs: Reference[];
  collections: Collection[];
  onRefAdded: () => void;
}

type Tab = 'collection' | 'web';

export default function SimilarPanel({ target, allRefs, collections, onRefAdded }: SimilarPanelProps) {
  const [tab, setTab] = useState<Tab>('collection');
  const [webResults, setWebResults] = useState<SuggestedRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());

  const inAppSimilar = getSimilarRefs(target, allRefs, 6);
  const searchQuery = buildSearchQuery(target);

  async function loadWebSuggestions() {
    if (webResults.length > 0) return;
    setLoading(true);
    setError('');
    try {
      // 용도+재료 태그를 RSS 피드 검색에 사용
      const allTags = [
        ...target.tags.program,
        ...target.tags.material,
        ...target.tags.mass,
      ].join(',');
      const params = new URLSearchParams({ tags: allTags, q: searchQuery });
      const res = await fetch(`/api/suggest?${params}`);
      const data = await res.json();
      setWebResults(data.results || []);
      if (!data.results?.length) setError('관련 RSS 피드에서 결과를 찾지 못했습니다');
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 실패');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'web') loadWebSuggestions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function quickSave(suggestion: SuggestedRef) {
    const ref: Reference = {
      id: generateId(),
      title: suggestion.title,
      imageUrl: suggestion.imageUrl,
      sourceUrl: suggestion.sourceUrl,
      architect: suggestion.architect || undefined,
      year: suggestion.year ? parseInt(suggestion.year) : undefined,
      tags: { ...target.tags },
      collectionIds: target.collectionIds,
      createdAt: new Date().toISOString(),
    };
    await addRef(ref);
    setAddedUrls(prev => new Set(prev).add(suggestion.sourceUrl));
    onRefAdded();
  }

  return (
    <div className="border-t border-zinc-100 pt-6">
      <h3 className="text-sm font-bold text-zinc-900 mb-4">유사 레퍼런스 추천</h3>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-zinc-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('collection')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            tab === 'collection' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          내 컬렉션 ({inAppSimilar.length})
        </button>
        <button
          onClick={() => setTab('web')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
            tab === 'web' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          ArchDaily 검색
          {tab === 'web' && loading && (
            <span className="w-3 h-3 border border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
          )}
        </button>
      </div>

      {/* 내 컬렉션 */}
      {tab === 'collection' && (
        <>
          {inAppSimilar.length === 0 ? (
            <div className="text-center py-8 text-zinc-400">
              <p className="text-sm">유사한 레퍼런스가 없습니다</p>
              <p className="text-xs mt-1">레퍼런스를 더 저장하면 자동으로 추천됩니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {inAppSimilar.map(({ ref, score }) => (
                <Link
                  key={ref.id}
                  href={`/reference/${ref.id}`}
                  className="group rounded-xl overflow-hidden border border-zinc-100 hover:border-zinc-300 hover:shadow-md transition-all"
                >
                  <div className="aspect-[4/3] bg-zinc-50 overflow-hidden">
                    {ref.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ref.imageUrl} alt={ref.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-300">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-zinc-800 leading-tight line-clamp-2">{ref.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-zinc-400">{ref.architect || ''}</p>
                      <span className="text-xs text-zinc-300">일치 {score.toFixed(0)}점</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {[...ref.tags.program, ...ref.tags.material].slice(0, 2).map(t => (
                        <TagBadge key={t} label={t} />
                      ))}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* ArchDaily 검색 결과 */}
      {tab === 'web' && (
        <>
          {loading && (
            <div className="flex items-center justify-center py-12 text-zinc-400 gap-2">
              <span className="w-4 h-4 border-2 border-zinc-200 border-t-zinc-500 rounded-full animate-spin" />
              <span className="text-sm">"{searchQuery}" 검색 중...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-sm text-zinc-400">{error}</p>
              <button
                onClick={() => { setError(''); setWebResults([]); loadWebSuggestions(); }}
                className="mt-2 text-xs text-zinc-500 underline hover:text-zinc-700"
              >
                다시 시도
              </button>
            </div>
          )}

          {!loading && !error && webResults.length === 0 && (
            <div className="text-center py-8 text-zinc-400">
              <p className="text-sm">검색 결과가 없습니다</p>
              <p className="text-xs mt-1">검색어: {searchQuery}</p>
            </div>
          )}

          {webResults.length > 0 && (
            <>
              <p className="text-xs text-zinc-400 mb-3">
                검색어: <span className="text-zinc-600 font-medium">"{searchQuery}"</span> — ArchDaily 결과
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {webResults.map((item, i) => {
                  const alreadySaved = allRefs.some(r => r.sourceUrl === item.sourceUrl);
                  const justAdded = addedUrls.has(item.sourceUrl);
                  return (
                    <div key={i} className="group rounded-xl overflow-hidden border border-zinc-100 hover:border-zinc-300 hover:shadow-md transition-all relative">
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                        <div className="aspect-[4/3] bg-zinc-50 overflow-hidden">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-300">
                              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-medium text-zinc-800 leading-tight line-clamp-2">{item.title}</p>
                          {item.architect && <p className="text-xs text-zinc-400 mt-0.5">{item.architect}</p>}
                          {item.year && <p className="text-xs text-zinc-300">{item.year}</p>}
                        </div>
                      </a>

                      {/* 저장 버튼 */}
                      <button
                        onClick={() => void quickSave(item)}
                        disabled={alreadySaved || justAdded}
                        className={`absolute top-2 right-2 w-7 h-7 rounded-full shadow flex items-center justify-center text-sm transition-all ${
                          alreadySaved || justAdded
                            ? 'bg-zinc-900 text-white cursor-default'
                            : 'bg-white/90 text-zinc-600 hover:bg-zinc-900 hover:text-white opacity-0 group-hover:opacity-100'
                        }`}
                        title={alreadySaved ? '이미 저장됨' : '저장'}
                      >
                        {alreadySaved || justAdded ? '✓' : '+'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
