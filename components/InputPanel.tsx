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
    <div className="space-y-5">
      <div>
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-4">Input</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Medication Instruction
            </label>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="e.g. Take 500mg amoxicillin twice daily for 7 days with food."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
              rows={6}
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Target Language
            </label>
            <select
              value={targetLanguage}
              onChange={e => setTargetLanguage(e.target.value as SupportedLanguage)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              disabled={isLoading}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.code}
                  {lang.qualityTier === 'low-resource' ? ' ⚠ Low-resource' : lang.qualityTier === 'medium' ? ' · Medium' : ''}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={useSimplification}
              onChange={e => setUseSimplification(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
              disabled={isLoading}
            />
            <div>
              <span className="text-sm text-slate-200 font-medium">Simplify before translation</span>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Expands abbreviations like TID, PRN, BID
              </p>
            </div>
          </label>

          <button
            onClick={onAnalyze}
            disabled={isLoading || !instruction.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing…
              </>
            ) : (
              'Analyze Translation Safety'
            )}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-800" />

      {/* Language quality info */}
      {LANGUAGES.find(l => l.code === targetLanguage)?.warningMessage && (
        <div className="bg-amber-950/50 border border-amber-800/50 rounded-lg p-3">
          <p className="text-xs text-amber-300 leading-relaxed">
            {LANGUAGES.find(l => l.code === targetLanguage)?.warningMessage}
          </p>
        </div>
      )}

      {simplificationResult && simplificationResult.ambiguity_flags.length > 0 && (
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-lg p-3">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2">
            Pre-Translation Notes
          </p>
          <ul className="space-y-1.5">
            {simplificationResult.ambiguity_flags.map((flag, i) => (
              <li key={i} className="text-xs text-blue-300/80 flex items-start gap-1.5 leading-relaxed">
                <span className="text-blue-500 flex-shrink-0 mt-0.5">ℹ</span>
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
