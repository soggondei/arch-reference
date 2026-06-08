'use client';

interface TagBadgeProps {
  label: string;
  onClick?: () => void;
  active?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

export default function TagBadge({ label, onClick, active, removable, onRemove, size = 'sm' }: TagBadgeProps) {
  const base = size === 'sm'
    ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors'
    : 'inline-flex items-center gap-1 px-3 py-1 rounded-md text-sm font-medium transition-colors';

  const style = active
    ? `${base} bg-zinc-900 text-white`
    : `${base} bg-zinc-100 text-zinc-600 hover:bg-zinc-200`;

  return (
    <span
      className={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {label}
      {removable && (
        <button
          onClick={e => { e.stopPropagation(); onRemove?.(); }}
          className="ml-0.5 hover:text-zinc-900"
        >
          ×
        </button>
      )}
    </span>
  );
}
