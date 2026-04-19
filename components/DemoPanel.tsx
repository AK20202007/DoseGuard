'use client';

import type { DemoCase, RiskLevel } from '@/lib/types';
import { DEMO_CASES } from '@/data/demo-cases';

type Props = {
  onSelectDemo: (demo: DemoCase) => void;
  activeDemoId: string | null;
};

const RISK_DOT: Record<RiskLevel, string> = {
  low: 'bg-green-500',
  medium: 'bg-amber-500',
  high: 'bg-red-500',
};

export function DemoPanel({ onSelectDemo, activeDemoId }: Props) {
  return (
    <div className="border-t border-slate-200/60 bg-surface-container-lowest px-5 py-4">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="material-symbols-outlined text-on-surface-variant"
            style={{ fontSize: '16px' }}
          >
            science
          </span>
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label">
            Demo Cases
          </p>
          <span className="text-[10px] text-slate-400 ml-1 font-label">
            — select to pre-fill the form, then click Analyze
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {DEMO_CASES.map(demo => (
            <button
              key={demo.id}
              onClick={() => onSelectDemo(demo)}
              title={demo.description}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-all font-label ${
                activeDemoId === demo.id
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-primary hover:text-primary'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${RISK_DOT[demo.expectedRisk]}`} />
              {demo.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
