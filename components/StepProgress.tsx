'use client';

import type { PipelineStep, StreamEvent } from '@/lib/types';

const STEPS: { key: PipelineStep; label: string; description: string; icon: string }[] = [
  { key: 'simplify',      label: 'Reading instruction',       icon: 'auto_fix_high',    description: 'Expanding abbreviations and flagging ambiguous terms' },
  { key: 'translate',     label: 'Translating',               icon: 'translate',        description: 'Converting to the target language' },
  { key: 'backTranslate', label: 'Re-reading the translation', icon: 'sync_alt',        description: 'Translating back to English to check for changes' },
  { key: 'extractSource', label: 'Parsing original',          icon: 'data_object',      description: 'Pulling out dosage, frequency, and warnings from the source' },
  { key: 'extractBack',   label: 'Parsing re-read version',   icon: 'data_object',      description: 'Pulling out the same fields from the re-read version' },
  { key: 'analyze',       label: 'Checking for errors',       icon: 'analytics',        description: 'Comparing both versions field-by-field with AI verification' },
  { key: 'teachBack',     label: 'Generating patient question', icon: 'quiz',           description: 'Creating a question to confirm the patient understood' },
];

type Props = {
  steps: Map<PipelineStep, StreamEvent>;
  isLoading: boolean;
};

function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function StepProgress({ steps, isLoading }: Props) {
  if (!isLoading && steps.size === 0) return null;

  return (
    <div className="bg-surface-container-lowest rounded-lg border-l-4 border-primary shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
        >
          graphic_eq
        </span>
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
          Pipeline Progress
        </p>
      </div>
      <div className="p-5 space-y-3">
        {STEPS.map(({ key, label, description, icon }) => {
          const event = steps.get(key);
          const status = event?.status ?? 'pending';
          return (
            <div key={key} className="flex items-start gap-3">
              <div className="w-5 h-5 flex-shrink-0 mt-0.5 flex items-center justify-center">
                {status === 'complete' ? (
                  <span
                    className="material-symbols-outlined text-green-500"
                    style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                ) : status === 'running' ? (
                  <Spinner />
                ) : status === 'error' ? (
                  <span
                    className="material-symbols-outlined text-red-500"
                    style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
                  >
                    cancel
                  </span>
                ) : (
                  <span
                    className="material-symbols-outlined text-slate-300"
                    style={{ fontSize: '20px' }}
                  >
                    {icon}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm leading-tight block font-medium ${
                    status === 'complete'
                      ? 'text-on-surface'
                      : status === 'running'
                        ? 'text-primary'
                        : status === 'error'
                          ? 'text-red-600'
                          : 'text-slate-400'
                  }`}
                >
                  {label}
                </span>
                {(status === 'running' || status === 'complete') && (
                  <span className="text-xs text-on-surface-variant leading-tight font-label">
                    {description}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
