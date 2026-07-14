'use client';

import { useState } from 'react';
import { Reference, LINK_CATEGORIES } from '@/lib/types';
import { addRef, updateRef, generateId } from '@/lib/store';

interface LinkFormProps {
  editRef?: Reference;
  onSave: () => void;
  onCancel: () => void;
}

export default function LinkForm({ editRef, onSave, onCancel }: LinkFormProps) {
  const [url, setUrl] = useState(editRef?.sourceUrl || '');
  const [title, setTitle] = useState(editRef?.title || '');
  const [category, setCategory] = useState(editRef?.tags.linkCategory || '');
  const [memo, setMemo] = useState(editRef?.description || '');
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleFetchTitle() {
    if (!url.trim()) return;
    setFetching(true);
    setError('');
    try {
      const res = await fetch(`/api/fetch-og?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '실패');
      if (data.title) setTitle(data.title);
    } catch {
      setError('URL 정보를 가져오지 못했습니다. 제목을 직접 입력해 주세요.');
    } finally {
      setFetching(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || !title.trim() || saving) return;
    setSaving(true);
    try {
      const tags = {
        program: [], material: [], mass: [], scale: '',
        designItem: [], site: [], region: '',
        linkCategory: category || undefined,
      };
      if (editRef) {
        await updateRef({
          ...editRef,
          title: title.trim(),
          sourceUrl: url.trim(),
          description: memo.trim() || undefined,
          tags: { ...editRef.tags, linkCategory: category || undefined },
        });
      } else {
        await addRef({
          id: generateId(),
          title: title.trim(),
          imageUrl: '',
          sourceUrl: url.trim(),
          refType: 'link',
          description: memo.trim() || undefined,
          tags,
          collectionIds: [],
          createdAt: new Date().toISOString(),
        });
      }
      onSave();
    } catch {
      setError('저장 실패 — 다시 시도해 주세요');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* URL */}
      <div>
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
          URL *
        </label>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={e => { setUrl(e.target.value); setError(''); }}
            placeholder="https://www.archdaily.com"
            className="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleFetchTitle(); }}}
          />
          <button
            type="button"
            onClick={() => void handleFetchTitle()}
            disabled={fetching || !url.trim()}
            className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-1.5"
          >
            {fetching ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                불러오는 중
              </>
            ) : '제목 자동입력'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
      </div>

      {/* 제목 */}
      <div>
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
          제목 *
        </label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="사이트 이름 또는 설명"
          required
          className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
        />
      </div>

      {/* 카테고리 */}
      <div>
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          카테고리
        </label>
        <div className="flex flex-wrap gap-2">
          {LINK_CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(prev => prev === cat ? '' : cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                category === cat
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 메모 */}
      <div>
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
          메모
        </label>
        <input
          value={memo}
          onChange={e => setMemo(e.target.value)}
          placeholder="간단한 설명 (선택)"
          className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
        />
      </div>

      <div className="flex gap-3 pt-2 border-t border-zinc-100">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 bg-zinc-900 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-zinc-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              저장 중
            </>
          ) : editRef ? '수정 저장' : '저장'}
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
