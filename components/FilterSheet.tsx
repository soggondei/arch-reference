'use client';

import FilterPanel, { FilterPanelProps } from './FilterPanel';

interface FilterSheetProps extends Omit<FilterPanelProps, 'variant'> {
  open: boolean;
  onClose: () => void;
}

export default function FilterSheet({ open, onClose, ...filterPanelProps }: FilterSheetProps) {
  return (
    <div className={`fixed inset-0 z-40 md:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="sticky top-0 bg-white flex flex-col items-center pt-2 pb-1 border-b border-zinc-100">
          <span className="w-10 h-1 rounded-full bg-zinc-200" />
        </div>
        <div className="p-4">
          <FilterPanel variant="sheet" {...filterPanelProps} />
        </div>
        <div className="sticky bottom-0 bg-white border-t border-zinc-100 p-4">
          <button
            onClick={onClose}
            className="w-full bg-zinc-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
