'use client';

import { FilterState, Collection, RefType, REF_TYPE_LABEL, REF_TYPE_COLOR } from '@/lib/types';
import { TAGS, TAG_LABELS, TagCategory } from '@/lib/tags';
import TagBadge from './TagBadge';

interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  collections: Collection[];
  totalCount: number;
  filteredCount: number;
}

const MULTI_CATEGORIES: TagCategory[] = ['program', 'material', 'mass', 'scale', 'designItem', 'site', 'region'];

export default function FilterPanel({ filters, onFilterChange, collections, totalCount, filteredCount }: FilterPanelProps) {
  function toggle(category: keyof Omit<FilterState, 'search' | 'collectionId'>, value: string) {
    const current = filters[category] as string[];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onFilterChange({ ...filters, [category]: updated });
  }

  function reset() {
    onFilterChange({
      search: '',
      program: [], material: [], mass: [], scale: [],
      designItem: [], site: [], region: [], refType: [],
      collectionId: null,
    });
  }

  const hasFilter = MULTI_CATEGORIES.some(c => filters[c].length > 0) || filters.collectionId || filters.refType.length > 0;

  return (
    <aside className="w-56 shrink-0 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {filteredCount} / {totalCount}개
        </span>
        {hasFilter && (
          <button onClick={reset} className="text-xs text-zinc-400 hover:text-zinc-700 underline">
            초기화
          </button>
        )}
      </div>

      {/* 레퍼런스 유형 */}
      <section>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">유형</p>
        <div className="flex flex-wrap gap-1">
          {(['built', 'winner', 'entry', 'idea'] as RefType[]).map(type => {
            const active = filters.refType.includes(type);
            return (
              <button
                key={type}
                onClick={() => {
                  const updated = active
                    ? filters.refType.filter(t => t !== type)
                    : [...filters.refType, type];
                  onFilterChange({ ...filters, refType: updated });
                }}
                className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all border"
                style={active
                  ? { backgroundColor: REF_TYPE_COLOR[type], color: '#fff', borderColor: REF_TYPE_COLOR[type] }
                  : { borderColor: '#e4e4e7', color: '#71717a' }
                }
              >
                {REF_TYPE_LABEL[type]}
              </button>
            );
          })}
        </div>
      </section>

      {collections.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">컬렉션</p>
          <div className="flex flex-col gap-1">
            {collections.map(col => (
              <button
                key={col.id}
                onClick={() => onFilterChange({ ...filters, collectionId: filters.collectionId === col.id ? null : col.id })}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left ${
                  filters.collectionId === col.id
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                <span className="truncate">{col.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {MULTI_CATEGORIES.map(category => (
        <section key={category}>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            {TAG_LABELS[category]}
          </p>
          <div className="flex flex-wrap gap-1">
            {TAGS[category].map(tag => (
              <TagBadge
                key={tag}
                label={tag}
                active={filters[category].includes(tag)}
                onClick={() => toggle(category, tag)}
              />
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}
