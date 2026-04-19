'use client';

import { useRef, useState } from 'react';
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

type OcrState = 'idle' | 'loading' | 'done' | 'error';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ocrState, setOcrState] = useState<OcrState>('idle');
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function runOcr(file: File) {
    setOcrState('loading');
    setOcrError(null);
    setPreviewUrl(URL.createObjectURL(file));

    const form = new FormData();
    form.append('image', file);

    try {
      const res = await fetch('/api/ocr', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setOcrState('error');
        setOcrError(data.error ?? 'OCR failed');
        return;
      }
      setInstruction(data.text);
      setOcrState('done');
    } catch {
      setOcrState('error');
      setOcrError('Network error — could not reach OCR service');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) runOcr(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) runOcr(file);
  }

  function clearImage() {
    setPreviewUrl(null);
    setOcrState('idle');
    setOcrError(null);
  }

  const disabled = isLoading || ocrState === 'loading';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Input</h2>

        {/* Image OCR upload zone */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Scan Label <span className="text-slate-400">(optional — auto-fills text below)</span>
          </label>

          {previewUrl ? (
            <div className="relative rounded border border-slate-200 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Uploaded label"
                className="w-full max-h-32 object-contain bg-slate-50"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                {ocrState === 'loading' && (
                  <div className="flex items-center gap-2 text-xs text-slate-600 bg-white rounded-full px-3 py-1.5 shadow">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Reading label…
                  </div>
                )}
                {ocrState === 'done' && (
                  <div className="flex items-center gap-2 text-xs text-green-700 bg-white rounded-full px-3 py-1.5 shadow">
                    <span>✓</span> Extracted
                  </div>
                )}
                {ocrState === 'error' && (
                  <div className="flex items-center gap-2 text-xs text-red-700 bg-white rounded-full px-3 py-1.5 shadow">
                    <span>✕</span> {ocrError}
                  </div>
                )}
              </div>
              <button
                onClick={clearImage}
                className="absolute top-1.5 right-1.5 bg-white/90 rounded-full w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-600 text-xs shadow"
                title="Remove image"
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              onClick={() => !disabled && fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`rounded border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-400 bg-blue-50'
                  : disabled
                    ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
                    : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
              }`}
            >
              <div className="text-slate-300 text-2xl mb-1.5">⬆</div>
              <p className="text-xs text-slate-500">
                Drop a photo or <span className="text-blue-600 underline">browse</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">JPEG · PNG · WebP · up to 5 MB</p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled}
          />
        </div>

        {/* Text textarea */}
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
            disabled={disabled}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Target Language</label>
          <select
            value={targetLanguage}
            onChange={e => setTargetLanguage(e.target.value as SupportedLanguage)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={disabled}
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
            disabled={disabled}
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
          disabled={disabled || !instruction.trim()}
          className="w-full bg-blue-600 text-white rounded py-2.5 text-sm font-medium hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
