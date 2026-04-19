'use client';

import type { PipelineStep, StreamEvent } from '@/lib/types';

const STEPS: { key: PipelineStep; label: string; description: string }[] = [
  { key: 'simplify', label: 'Reading instruction', description: 'Expanding abbreviations and flagging ambiguous terms' },
  { key: 'translate', label: 'Translating', description: 'Converting to the target language' },
  { key: 'backTranslate', label: 'Re-reading the translation', description: 'Translating back to English to check for changes' },
  { key: 'extractSource', label: 'Parsing original', description: 'Pulling out dosage, frequency, warnings from the source' },
  { key: 'extractBack', label: 'Parsing re-read', description: 'Pulling out the same fields from the re-read version' },
  { key: 'analyze', label: 'Checking for errors', description: 'Comparing both versions field-by-field' },
  { key: 'teachBack', label: 'Generating patient question', description: 'Creating a question to confirm the patient understood' },
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
        {STEPS.map(({ key, label, description }) => {
          const event = steps.get(key);
          const status = event?.status ?? 'pending';
          return (
            <div key={key} className="flex items-start gap-2.5">
              <div className="w-5 h-5 flex-shrink-0 mt-0.5">
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
              <div>
                <span
                  className={`text-sm leading-tight block ${
                    status === 'complete'
                      ? 'text-slate-700'
                      : status === 'running'
                        ? 'text-blue-700 font-medium'
                        : status === 'error'
                          ? 'text-red-600'
                          : 'text-slate-400'
                  }`}
                >
                  {label}
                </span>
                {(status === 'running' || status === 'complete') && (
                  <span className="text-xs text-slate-400 leading-tight">{description}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
