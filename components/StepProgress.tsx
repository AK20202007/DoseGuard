'use client';

import type { PipelineStep, StreamEvent } from '@/lib/types';
import type { TKey } from '@/lib/i18n';
import { useLang } from '@/lib/i18nContext';

type StepDef = { key: PipelineStep; labelKey: TKey; descKey: TKey; icon: string };

const STEPS: StepDef[] = [
  { key: 'simplify',      labelKey: 'stepSimplifyLabel',      descKey: 'stepSimplifyDesc',      icon: 'auto_fix_high' },
  { key: 'translate',     labelKey: 'stepTranslateLabel',     descKey: 'stepTranslateDesc',     icon: 'translate'     },
  { key: 'tonalRail',     labelKey: 'stepTonalRailLabel',     descKey: 'stepTonalRailDesc',     icon: 'spellcheck'    },
  { key: 'backTranslate', labelKey: 'stepBackTranslateLabel', descKey: 'stepBackTranslateDesc', icon: 'sync_alt'      },
  { key: 'extractSource', labelKey: 'stepExtractSourceLabel', descKey: 'stepExtractSourceDesc', icon: 'data_object'   },
  { key: 'extractBack',   labelKey: 'stepExtractBackLabel',   descKey: 'stepExtractBackDesc',   icon: 'data_object'   },
  { key: 'analyze',       labelKey: 'stepAnalyzeLabel',       descKey: 'stepAnalyzeDesc',       icon: 'analytics'     },
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
  const { t } = useLang();
  if (!isLoading && steps.size === 0) return null;

  const isDone = steps.get('done')?.status === 'complete';

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
          {t('pipelineProgress')}
        </p>
      </div>
      <div className="p-5 space-y-3">
        {STEPS.map(({ key, labelKey, descKey, icon }) => {
          const event = steps.get(key);
          const status = event?.status ?? 'pending';
          return (
            <div key={key} className="flex items-start gap-3">
              <div className="w-5 h-5 flex-shrink-0 mt-0.5 flex items-center justify-center">
                {status === 'complete' ? (
                  <span className="material-symbols-outlined text-green-500" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                ) : status === 'running' ? (
                  <Spinner />
                ) : status === 'error' ? (
                  <span className="material-symbols-outlined text-red-500" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>
                    cancel
                  </span>
                ) : (
                  <span className="material-symbols-outlined text-slate-300" style={{ fontSize: '20px' }}>
                    {icon}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-sm leading-tight block font-medium ${
                  status === 'complete' ? 'text-on-surface' :
                  status === 'running'  ? 'text-primary'    :
                  status === 'error'    ? 'text-red-600'    :
                  'text-slate-400'
                }`}>
                  {t(labelKey)}
                </span>
                {(status === 'running' || status === 'complete') && (
                  <span className="text-xs text-on-surface-variant leading-tight font-label">
                    {t(descKey)}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Pill scan CTA — appears after pipeline completes */}
        {isDone && (
          <button
            onClick={() =>
              document.getElementById('pill-scan-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className="flex items-start gap-3 w-full text-left group mt-1 pt-3 border-t border-slate-100"
          >
            <div className="w-5 h-5 flex-shrink-0 mt-0.5 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary animate-pulse" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>
                medication
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm leading-tight block font-medium text-primary group-hover:underline">
                {t('verifyPhysicalPill')}
              </span>
              <span className="text-xs text-on-surface-variant leading-tight font-label">
                {t('pillScanStepDesc')}
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
