'use client';

import type { ConfidenceScore } from '@/lib/types';

type Props = {
  confidence: ConfidenceScore;
};

const TIER_COLORS = {
  high:      { arc: '#22c55e', bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700' },
  good:      { arc: '#84cc16', bg: 'bg-lime-50',   border: 'border-lime-200',   text: 'text-lime-700'  },
  moderate:  { arc: '#f59e0b', bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700' },
  low:       { arc: '#f97316', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700'},
  very_low:  { arc: '#ef4444', bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700'   },
};

const BREAKDOWN_META = {
  translation_quality: { label: 'Translation Quality', max: 40 },
  language_tier:       { label: 'Language Tier',        max: 25 },
  field_extraction:    { label: 'Field Extraction',     max: 20 },
  back_translation:    { label: 'Back-Translation',     max: 15 },
};

export function ConfidenceGauge({ confidence }: Props) {
  const c = TIER_COLORS[confidence.tier];
  // Semi-circle arc: r=44, circumference for 180° = π×44 ≈ 138.2
  const ARC_LEN = 138.2;
  const offset = ARC_LEN - (confidence.score / 100) * ARC_LEN;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Confidence Score
      </h2>

      {/* Semi-circle gauge */}
      <div className="flex flex-col items-center">
        <svg width="120" height="68" viewBox="0 0 120 68" className="overflow-visible">
          {/* Background arc */}
          <path
            d="M 8 60 A 52 52 0 0 1 112 60"
            fill="none" stroke="#e2e8f0" strokeWidth="11" strokeLinecap="round"
          />
          {/* Colour arc */}
          <path
            d="M 8 60 A 52 52 0 0 1 112 60"
            fill="none"
            stroke={c.arc}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={ARC_LEN}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }}
          />
          {/* Score */}
          <text x="60" y="56" textAnchor="middle" fontSize="22" fontWeight="800"
            fill={c.arc} className="select-none">
            {confidence.score}
          </text>
        </svg>

        {/* Label badge */}
        <span className={`mt-1 px-3 py-0.5 rounded-full text-xs font-bold border ${c.bg} ${c.border} ${c.text}`}>
          {confidence.label}
        </span>
      </div>

      {/* Breakdown */}
      <div className="space-y-2 pt-1">
        {(Object.entries(confidence.breakdown) as [keyof typeof BREAKDOWN_META, number][]).map(
          ([key, pts]) => {
            const meta = BREAKDOWN_META[key];
            if (!meta) return null;
            const pct = Math.max(0, Math.min(100, (pts / meta.max) * 100));
            return (
              <div key={key}>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{meta.label}</span>
                  <span className="font-mono font-semibold" style={{ color: c.arc }}>
                    {pts}/{meta.max}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: c.arc }}
                  />
                </div>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
