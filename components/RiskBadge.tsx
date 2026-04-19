import type { RiskLevel } from '@/lib/types';

type Props = {
  riskLevel: RiskLevel;
  score?: number;
  size?: 'sm' | 'md' | 'lg';
};

const CONFIG = {
  low: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-300',
    dot: 'bg-green-500',
    icon: 'check_circle',
    label: 'Low Risk',
  },
  medium: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-300',
    dot: 'bg-amber-500',
    icon: 'warning',
    label: 'Medium Risk',
  },
  high: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
    dot: 'bg-red-500',
    icon: 'dangerous',
    label: 'High Risk',
  },
};

export function RiskBadge({ riskLevel, score, size = 'md' }: Props) {
  const c = CONFIG[riskLevel];
  const sizeClass =
    size === 'lg'
      ? 'px-4 py-2 text-sm font-bold'
      : size === 'sm'
        ? 'px-2 py-0.5 text-xs'
        : 'px-3 py-1 text-sm font-medium';
  const iconSize = size === 'lg' ? '18px' : '14px';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${c.bg} ${c.text} ${c.border} ${sizeClass}`}
    >
      <span
        className="material-symbols-outlined flex-shrink-0"
        style={{ fontSize: iconSize, fontVariationSettings: "'FILL' 1" }}
      >
        {c.icon}
      </span>
      {c.label}
      {score !== undefined && (
        <span className="opacity-60 font-normal font-label">({score})</span>
      )}
    </span>
  );
}
