'use client';

import type { DemoCase, RiskLevel } from '@/lib/types';
import { DEMO_CASES } from '@/data/demo-cases';

type Props = {
  onSelectDemo: (demo: DemoCase) => void;
  activeDemoId: string | null;
};

const RISK_DOT: Record<RiskLevel, string> = {
  low: 'bg-green-400',
  medium: 'bg-amber-400',
  high: 'bg-red-400',
};

export function DemoPanel({ onSelectDemo, activeDemoId }: Props) {
  return (
    <div className="border-t border-slate-200 bg-white px-4 py-3">
      <div className="max-w-[1600px] mx-auto flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
          Demo Cases:
        </span>
        {DEMO_CASES.map(demo => (
          <button
            key={demo.id}
            onClick={() => onSelectDemo(demo)}
            title={demo.description}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              activeDemoId === demo.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:text-blue-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${RISK_DOT[demo.expectedRisk]}`} />
            {demo.label}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-2">
          Click a demo to pre-fill the form, then click Analyze
        </span>
      </div>
    </div>
  );
}
