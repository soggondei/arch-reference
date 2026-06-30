'use client';

import { useState, useRef, useEffect } from 'react';
import { Reference, Collection, RefType, REF_TYPE_LABEL, REF_TYPE_COLOR } from '@/lib/types';
import { TAGS, TAG_LABELS, COLLECTION_COLORS, TagCategory } from '@/lib/tags';
import { addRef, addCollection, generateId, uploadImage } from '@/lib/store';
import { SuggestedTags } from '@/lib/auto-tag';
import TagBadge from './TagBadge';

interface UploadFormProps {
  collections: Collection[];
  prefill?: Record<string, string> | null;
  onSave: () => void;
  onCancel: () => void;
}

type TagFields = Pick<Reference['tags'], 'program' | 'material' | 'mass' | 'designItem' | 'site'>;
const MULTI_TAG_CATEGORIES: (keyof TagFields)[] = ['program', 'material', 'mass', 'designItem', 'site'];

export default function UploadForm({ collections, prefill, onSave, onCancel }: UploadFormProps) {
  const initialSuggested: SuggestedTags | null = (() => {
    try { return prefill?._suggestedTags ? JSON.parse(prefill._suggestedTags) : null; } catch { return null; }
  })();

  const [title, setTitle] = useState(prefill?.title || '');
  const [imageUrl, setImageUrl] = useState(prefill?.imageUrl || '');
  const [sourceUrl, setSourceUrl] = useState(prefill?.sourceUrl || '');
  const [architect, setArchitect] = useState('');
  const [year, setYear] = useState('');
  const [description, setDescription] = useState(prefill?.description || '');
  const [scale, setScale] = useState(initialSuggested?.scale || '');
  const [region, setRegion] = useState(initialSuggested?.region || '');
  const [tags, setTags] = useState<TagFields>({
    program: initialSuggested?.program || [],
    material: initialSuggested?.material || [],
    mass: initialSuggested?.mass || [],
    designItem: initialSuggested?.designItem || [],
    site: initialSuggested?.site || [],
  });
  const [suggestedTags, setSuggestedTags] = useState<SuggestedTags | null>(initialSuggested);
  const [autoTagApplied, setAutoTagApplied] = useState(initialSuggested !== null);
  const [refType, setRefType] = useState<RefType | ''>('');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [newColName, setNewColName] = useState('');
  const [imagePreview, setImagePreview] = useState(prefill?.imageUrl || '');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [aiTagging, setAiTagging] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prefill?.sourceUrl) {
      void handleFetchOG();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFetchOG() {
    if (!sourceUrl.trim()) return;
    setFetching(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/fetch-og?url=${encodeURIComponent(sourceUrl.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '가져오기 실패');

      if (data.title) setTitle(data.title);
      if (data.imageUrl) { setImageUrl(data.imageUrl); setImagePreview(data.imageUrl); }
      if (data.description) setDescription(data.description);
      if (data.architect) setArchitect(data.architect);
      if (data.year) setYear(data.year);

      if (data.suggestedTags) {
        const s: SuggestedTags = data.suggestedTags;
        setTags({
          program: s.program || [],
          material: s.material || [],
          mass: s.mass || [],
          designItem: s.designItem || [],
          site: s.site || [],
        });
        if (s.scale) setScale(s.scale);
        if (s.region) setRegion(s.region);
        setSuggestedTags(s);
        setAutoTagApplied(true);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : '가져오기 실패');
    } finally {
      setFetching(false);
    }
  }

  function isSuggested(category: keyof TagFields | 'scale' | 'region', value: string): boolean {
    if (!suggestedTags) return false;
    if (category === 'scale') return suggestedTags.scale === value;
    if (category === 'region') return suggestedTags.region === value;
    return (suggestedTags[category as keyof TagFields] || []).includes(value);
  }

  function toggleTag(category: keyof TagFields, value: string) {
    setTags(prev => ({
      ...prev,
      [category]: prev[category].includes(value)
        ? prev[category].filter(v => v !== value)
        : [...prev[category], value],
    }));
  }

  async function handleAiTag() {
    if (!imageUrl || aiTagging) return;
    setAiTagging(true);
    setFetchError('');
    try {
      const res = await fetch('/api/ai-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI 분석 실패');
      const s = data.suggestedTags;
      if (s) {
        setTags({
          program: s.program || [],
          material: s.material || [],
          mass: s.mass || [],
          designItem: s.designItem || [],
          site: s.site || [],
        });
        if (s.scale) setScale(s.scale);
        if (s.region) setRegion(s.region);
        setSuggestedTags(s);
        setAutoTagApplied(true);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'AI 분석 실패');
    } finally {
      setAiTagging(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);
    setUploading(true);
    setFetchError('');
    try {
      const url = await uploadImage(file);
      setImageUrl(url);
      setImagePreview(url);
    } catch {
      setFetchError('이미지 업로드 실패');
      setImageUrl('');
      setImagePreview('');
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handleAddCollection() {
    if (!newColName.trim()) return;
    const col: Collection = {
      id: generateId(),
      name: newColName.trim(),
      color: COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length],
      createdAt: new Date().toISOString(),
    };
    await addCollection(col);
    setSelectedCollections(prev => [...prev, col.id]);
    setNewColName('');
    onSave();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const ref: Reference = {
        id: generateId(),
        title: title.trim(),
        imageUrl,
        sourceUrl: sourceUrl.trim() || undefined,
        architect: architect.trim() || undefined,
        year: year ? parseInt(year) : undefined,
        description: description.trim() || undefined,
        refType: refType || undefined,
        tags: { ...tags, scale, region },
        collectionIds: selectedCollections,
        createdAt: new Date().toISOString(),
      };
      await addRef(ref);
      onSave();
    } catch {
      setFetchError('저장 실패 — 다시 시도해 주세요');
    } finally {
      setSaving(false);
    }
  }

  const totalSuggested = suggestedTags
    ? [...(suggestedTags.program || []), ...(suggestedTags.material || []),
       ...(suggestedTags.mass || []), ...(suggestedTags.designItem || []),
       ...(suggestedTags.site || [])].length
      + (suggestedTags.scale ? 1 : 0)
      + (suggestedTags.region ? 1 : 0)
    : 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-2xl mx-auto">

      {/* URL 자동 파싱 */}
      <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          URL에서 자동 불러오기
        </label>
        <div className="flex gap-2">
          <input
            value={sourceUrl}
            onChange={e => { setSourceUrl(e.target.value); setFetchError(''); }}
            placeholder="https://www.archdaily.com/..."
            className="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 bg-white"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleFetchOG(); }}}
          />
          <button
            type="button"
            onClick={handleFetchOG}
            disabled={fetching || !sourceUrl.trim()}
            className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-2"
          >
            {fetching ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                분석 중
              </>
            ) : '자동 채우기'}
          </button>
        </div>
        {fetchError && <p className="text-xs text-red-500 mt-1.5">{fetchError}</p>}
        {autoTagApplied && totalSuggested > 0 && (
          <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
            <span>✓</span>
            태그 {totalSuggested}개 자동 분류됨 — 아래에서 확인 후 수정하세요
          </p>
        )}
        {!autoTagApplied && <p className="text-xs text-zinc-400 mt-1.5">ArchDaily, Archinect, Archello 등 지원</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">제목 *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="레퍼런스 제목"
            required
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">건축가/사무소</label>
          <input
            value={architect}
            onChange={e => setArchitect(e.target.value)}
            placeholder="Herzog & de Meuron"
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">연도</label>
          <input
            value={year}
            onChange={e => setYear(e.target.value)}
            placeholder="2023"
            type="number"
            min="1900"
            max="2099"
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
          />
        </div>
      </div>

      {/* 레퍼런스 유형 */}
      <div>
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">레퍼런스 유형</label>
        <div className="flex flex-wrap gap-2">
          {(['built', 'winner', 'entry', 'idea'] as RefType[]).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setRefType(prev => prev === type ? '' : type)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-all"
              style={refType === type
                ? { backgroundColor: REF_TYPE_COLOR[type], color: '#fff', borderColor: REF_TYPE_COLOR[type] }
                : { borderColor: '#e4e4e7', color: '#52525b' }
              }
            >
              {REF_TYPE_LABEL[type]}
            </button>
          ))}
        </div>
      </div>

      {/* 이미지 */}
      <div>
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">이미지</label>
        <div
          className="border-2 border-dashed border-zinc-200 rounded-xl p-4 text-center cursor-pointer hover:border-zinc-400 transition-colors relative"
          onClick={() => !uploading && fileRef.current?.click()}
        >
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="preview" className="max-h-48 mx-auto rounded-lg object-contain" />
          ) : (
            <div className="text-zinc-400 py-6">
              <p className="text-sm">클릭하여 이미지 업로드</p>
              <p className="text-xs mt-1">또는 아래 URL 직접 입력</p>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
              <span className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-700 rounded-full animate-spin" />
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={imageUrl.startsWith('data:') ? '' : imageUrl}
            onChange={e => { setImageUrl(e.target.value); setImagePreview(e.target.value); }}
            placeholder="이미지 URL"
            className="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
          />
          {imageUrl && (
            <button
              type="button"
              onClick={() => void handleAiTag()}
              disabled={aiTagging}
              title="이미지를 AI로 분석해 태그 자동 추천"
              className="px-3 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-1.5"
            >
              {aiTagging ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  분석 중
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                  </svg>
                  AI 태그
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 다중 태그 카테고리 */}
      {MULTI_TAG_CATEGORIES.map(category => (
        <div key={category}>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {TAG_LABELS[category as TagCategory]}
            </label>
            {suggestedTags && (suggestedTags[category] || []).length > 0 && (
              <span className="text-xs text-emerald-500 font-medium">
                ✓ {(suggestedTags[category] || []).length}개 자동분류
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAGS[category as TagCategory].map(tag => {
              const isActive = tags[category].includes(tag);
              const wasSuggested = isSuggested(category, tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(category, tag)}
                  className={`
                    inline-flex items-center gap-1 px-3 py-1 rounded-md text-sm font-medium transition-all
                    ${isActive
                      ? 'bg-zinc-900 text-white'
                      : wasSuggested
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }
                  `}
                >
                  {tag}
                  {wasSuggested && !isActive && <span className="text-emerald-400 text-xs">✦</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">규모</label>
            {suggestedTags?.scale && (
              <span className="text-xs text-emerald-500 font-medium">✓ 자동분류</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {TAGS.scale.map(s => {
              const wasSuggested = isSuggested('scale', s);
              return (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scale"
                    value={s}
                    checked={scale === s}
                    onChange={() => setScale(s)}
                    className="accent-zinc-900"
                  />
                  <span className={`text-sm ${wasSuggested ? 'text-emerald-700 font-medium' : 'text-zinc-600'}`}>
                    {s} {wasSuggested && scale === s && <span className="text-emerald-400 text-xs">✦</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">지역</label>
            {suggestedTags?.region && (
              <span className="text-xs text-emerald-500 font-medium">✓ 자동분류</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.region.map(r => {
              const isActive = region === r;
              const wasSuggested = isSuggested('region', r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRegion(prev => prev === r ? '' : r)}
                  className={`
                    inline-flex items-center gap-1 px-3 py-1 rounded-md text-sm font-medium transition-all
                    ${isActive
                      ? 'bg-zinc-900 text-white'
                      : wasSuggested
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }
                  `}
                >
                  {r}
                  {wasSuggested && !isActive && <span className="text-emerald-400 text-xs">✦</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 범례 */}
      {autoTagApplied && (
        <div className="flex items-center gap-4 text-xs text-zinc-400 -mt-2">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-zinc-900 inline-block" /> 선택됨
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200 inline-block" /> AI 추천
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-zinc-100 inline-block" /> 미선택
          </span>
        </div>
      )}

      {/* 메모 */}
      <div>
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">메모</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="이 레퍼런스에 대한 간단한 메모"
          className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 resize-none"
        />
      </div>

      {/* 컬렉션 */}
      <div>
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">컬렉션 추가</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {collections.map(col => (
            <button
              key={col.id}
              type="button"
              onClick={() => setSelectedCollections(prev =>
                prev.includes(col.id) ? prev.filter(id => id !== col.id) : [...prev, col.id]
              )}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selectedCollections.includes(col.id)
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
              {col.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newColName}
            onChange={e => setNewColName(e.target.value)}
            placeholder="새 컬렉션 이름"
            className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-400"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleAddCollection(); }}}
          />
          <button
            type="button"
            onClick={() => void handleAddCollection()}
            className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm text-zinc-700 transition-colors"
          >
            추가
          </button>
        </div>
      </div>

      <div className="flex gap-3 pt-2 border-t border-zinc-100">
        <button
          type="submit"
          disabled={saving || uploading}
          className="flex-1 bg-zinc-900 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-zinc-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              저장 중
            </>
          ) : '저장'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 border border-zinc-200 rounded-xl text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          취소
        </button>
      </div>
    </form>
  );
}
