'use client';

import type { PipelineStep, StreamEvent } from '@/lib/types';

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: 'simplify', label: 'Source Analysis' },
  { key: 'translate', label: 'Translation' },
  { key: 'tonalRail', label: 'Tonal / Numeral Rail' },
  { key: 'backTranslate', label: 'Back-Translation' },
  { key: 'extractSource', label: 'Extract Source Fields' },
  { key: 'extractBack', label: 'Extract Back-Translation' },
  { key: 'analyze', label: 'Drift Analysis' },
  { key: 'teachBack', label: 'Teach-Back Question' },
];

type Props = {
  steps: Map<PipelineStep, StreamEvent>;
  isLoading: boolean;
};

export function StepProgress({ steps, isLoading }: Props) {
  if (!isLoading && steps.size === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Pipeline</p>
      <div className="space-y-2">
        {STEPS.map(({ key, label }) => {
          const status = steps.get(key)?.status ?? 'pending';
          return (
            <div key={key} className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                status === 'complete' ? 'bg-emerald-400' :
                status === 'running' ? 'bg-blue-400 animate-pulse' :
                status === 'error' ? 'bg-red-400' :
                'bg-slate-700'
              }`} />
              <span className={`text-xs ${
                status === 'complete' ? 'text-slate-400' :
                status === 'running' ? 'text-blue-300 font-semibold' :
                status === 'error' ? 'text-red-400' :
                'text-slate-600'
              }`}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
