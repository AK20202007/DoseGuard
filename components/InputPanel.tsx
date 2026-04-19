'use client';

import type { SupportedLanguage, SimplificationResult } from '@/lib/types';
import { LANGUAGES } from '@/data/languages';

type Props = {
  instruction: string;
  setInstruction: (v: string) => void;
  targetLanguage: SupportedLanguage;
  setTargetLanguage: (v: SupportedLanguage) => void;
  useSimplification: boolean;
  setUseSimplification: (v: boolean) => void;
  onAnalyze: () => void;
  isLoading: boolean;
  simplificationResult: SimplificationResult | null;
};

export function InputPanel({
  instruction,
  setInstruction,
  targetLanguage,
  setTargetLanguage,
  useSimplification,
  setUseSimplification,
  onAnalyze,
  isLoading,
  simplificationResult,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Input</h2>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Medication Instruction <span className="text-slate-400">(English)</span>
          </label>
          <textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="e.g. Take 500mg amoxicillin twice daily for 7 days with food."
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={5}
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Target Language</label>
          <select
            value={targetLanguage}
            onChange={e => setTargetLanguage(e.target.value as SupportedLanguage)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.code}
                {lang.qualityTier === 'low-resource'
                  ? ' ⚠ Low-resource'
                  : lang.qualityTier === 'medium'
                    ? ' · Medium quality'
                    : ''}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={useSimplification}
            onChange={e => setUseSimplification(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            disabled={isLoading}
          />
          <div>
            <span className="text-sm text-slate-700 font-medium">Simplify source before translation</span>
            <p className="text-xs text-slate-500 mt-0.5">
              Expands abbreviations (TID, PRN, BID) and clarifies ambiguous language before translating
            </p>
          </div>
        </label>

        <button
          onClick={onAnalyze}
          disabled={isLoading || !instruction.trim()}
          className="w-full bg-blue-600 text-white rounded py-2.5 text-sm font-medium hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Analyzing…
            </>
          ) : (
            'Analyze Translation Safety'
          )}
        </button>
      </div>

      {simplificationResult && simplificationResult.ambiguity_flags.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-amber-800 mb-2 uppercase tracking-wide">
            Source Ambiguity Detected
          </h3>
          <ul className="space-y-1.5">
            {simplificationResult.ambiguity_flags.map((flag, i) => (
              <li key={i} className="text-xs text-amber-900 flex items-start gap-1.5">
                <span className="text-amber-500 flex-shrink-0 mt-0.5">▲</span>
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
