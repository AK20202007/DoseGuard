'use client';

import type { PipelineStep, StreamEvent } from '@/lib/types';

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: 'simplify', label: 'Source Analysis' },
  { key: 'translate', label: 'Translation' },
  { key: 'backTranslate', label: 'Back-Translation' },
  { key: 'extractSource', label: 'Extract Source Fields' },
  { key: 'extractBack', label: 'Extract Back-Translation Fields' },
  { key: 'analyze', label: 'Drift Analysis & Risk Scoring' },
  { key: 'teachBack', label: 'Teach-Back Question' },
];

type Props = {
  steps: Map<PipelineStep, StreamEvent>;
  isLoading: boolean;
};

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SpinIcon() {
  return (
    <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function StepProgress({ steps, isLoading }: Props) {
  if (!isLoading && steps.size === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Pipeline Progress
      </h3>
      <div className="space-y-2">
        {STEPS.map(({ key, label }) => {
          const event = steps.get(key);
          const status = event?.status ?? 'pending';
          return (
            <div key={key} className="flex items-center gap-2.5">
              <div className="w-5 h-5 flex-shrink-0">
                {status === 'complete' ? (
                  <CheckIcon />
                ) : status === 'running' ? (
                  <SpinIcon />
                ) : status === 'error' ? (
                  <ErrorIcon />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                )}
              </div>
              <span
                className={`text-sm ${
                  status === 'complete'
                    ? 'text-slate-600'
                    : status === 'running'
                      ? 'text-blue-700 font-medium'
                      : status === 'error'
                        ? 'text-red-600'
                        : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
