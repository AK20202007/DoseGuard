'use client';

import type { DemoCase, RiskLevel } from '@/lib/types';
import { DEMO_CASES } from '@/data/demo-cases';

type Props = { onSelectDemo: (demo: DemoCase) => void; activeDemoId: string | null };

const RISK_DOT: Record<RiskLevel, string> = {
  low: 'bg-emerald-400',
  medium: 'bg-amber-400',
  high: 'bg-red-400',
};

export function DemoPanel({ onSelectDemo, activeDemoId }: Props) {
  return (
    <div className="px-6 py-3 max-w-[1400px] mx-auto flex items-center gap-3 flex-wrap">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap">
        Demo Cases
      </span>
      {DEMO_CASES.map(demo => (
        <button
          key={demo.id}
          onClick={() => onSelectDemo(demo)}
          title={demo.description}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            activeDemoId === demo.id
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500 hover:text-white'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${RISK_DOT[demo.expectedRisk]}`} />
          {demo.label}
        </button>
      ))}
    </div>
  );
}
