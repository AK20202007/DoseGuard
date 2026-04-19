'use client';

import { useRef, useState } from 'react';
import type { SupportedLanguage, SimplificationResult } from '@/lib/types';
import { LANGUAGES } from '@/data/languages';
import { useLang } from '@/lib/i18nContext';

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
  const { t } = useLang();
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
      if (!res.ok) { setOcrState('error'); setOcrError(data.error ?? 'OCR failed'); return; }
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

      {/* Main input card */}
      <div className="bg-surface-container-lowest rounded-lg overflow-hidden border-l-4 border-primary shadow-sm">

        {/* Card header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
          <span
            className="material-symbols-outlined text-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            security
          </span>
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label">
              {t('safetyInput')}
            </p>
            <h2 className="text-sm font-bold text-on-surface leading-none mt-0.5">
              {t('medicationInstruction')}
            </h2>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* OCR zone */}
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label mb-2">
              {t('scanLabel')}{' '}
              <span className="font-normal normal-case tracking-normal text-slate-400">
                {t('scanLabelNote')}
              </span>
            </label>

            {previewUrl ? (
              <div className="relative rounded overflow-hidden border border-outline-variant">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Uploaded label"
                  className="w-full max-h-28 object-contain bg-surface-container-low"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                  {ocrState === 'loading' && (
                    <div className="flex items-center gap-2 text-xs text-on-surface bg-white rounded px-3 py-1.5 shadow font-label">
                      <svg className="w-3.5 h-3.5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('readingLabel')}
                    </div>
                  )}
                  {ocrState === 'done' && (
                    <div className="flex items-center gap-1.5 text-xs text-green-700 bg-white rounded px-3 py-1.5 shadow font-label font-semibold">
                      <span className="material-symbols-outlined text-green-500" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      {t('extracted')}
                    </div>
                  )}
                  {ocrState === 'error' && (
                    <div className="flex items-center gap-1.5 text-xs text-red-700 bg-white rounded px-3 py-1.5 shadow font-label">
                      <span className="material-symbols-outlined text-red-500" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>cancel</span>
                      {ocrError}
                    </div>
                  )}
                </div>
                <button
                  onClick={clearImage}
                  className="absolute top-1.5 right-1.5 bg-white/90 rounded w-5 h-5 flex items-center justify-center text-slate-400 hover:text-red-600 text-xs shadow"
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
                className={`rounded border-2 border-dashed px-4 py-4 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-primary bg-primary-fixed/30'
                    : disabled
                      ? 'border-slate-200 bg-surface-container-low cursor-not-allowed opacity-60'
                      : 'border-outline-variant hover:border-primary hover:bg-primary-fixed/20'
                }`}
              >
                <span className="material-symbols-outlined text-slate-300 block mb-1.5" style={{ fontSize: '28px' }}>
                  upload
                </span>
                <p className="text-xs text-on-surface-variant">
                  {t('dropPhoto')}{' '}
                  <span className="text-primary font-semibold underline">{t('browse')}</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 font-label">{t('fileTypes')}</p>
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

          {/* Instruction textarea */}
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label mb-2">
              {t('instructionLabel')}{' '}
              <span className="font-normal normal-case tracking-normal text-slate-400">{t('instructionLang')}</span>
            </label>
            <div className="p-4 bg-surface-container-low rounded border-l-2 border-outline-variant">
              <textarea
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                placeholder="e.g. Take 500mg amoxicillin twice daily for 7 days with food."
                className="w-full bg-transparent text-sm text-on-surface placeholder-slate-400 focus:outline-none resize-none font-body"
                rows={5}
                disabled={disabled}
              />
            </div>
          </div>

          {/* Language */}
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label mb-2">
              {t('targetLanguage')}
            </label>
            <div className="relative">
              <select
                value={targetLanguage}
                onChange={e => setTargetLanguage(e.target.value as SupportedLanguage)}
                className="w-full rounded border border-outline-variant px-3 py-2.5 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none font-body"
                disabled={disabled}
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.code}
                    {lang.qualityTier === 'low-resource'
                      ? ' — Low-resource language'
                      : lang.qualityTier === 'medium'
                        ? ' — Medium quality'
                        : ''}
                  </option>
                ))}
              </select>
              <span
                className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
                style={{ fontSize: '16px' }}
              >
                expand_more
              </span>
            </div>
          </div>

          {/* Simplification toggle */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={useSimplification}
                onChange={e => setUseSimplification(e.target.checked)}
                className="sr-only peer"
                disabled={disabled}
              />
              <div className="w-9 h-5 bg-slate-200 rounded-full peer-checked:bg-primary transition-colors peer-disabled:opacity-50" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <div>
              <span className="text-sm text-on-surface font-semibold">{t('simplifyToggle')}</span>
              <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                {t('simplifyDesc')}
              </p>
            </div>
          </label>

          {/* Analyze button */}
          <button
            onClick={onAnalyze}
            disabled={disabled || !instruction.trim()}
            className="w-full clinical-gradient text-white py-3 px-6 rounded flex items-center justify-center gap-2.5 font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
          >
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('analyzing')}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>
                  analytics
                </span>
                {t('analyzeButton')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Pre-translation notes */}
      {simplificationResult && simplificationResult.ambiguity_flags.length > 0 && (
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-blue-800/30 flex items-center gap-2">
            <span className="text-blue-400 text-sm">ℹ</span>
            <p className="text-[10px] font-bold text-blue-300/80 uppercase tracking-widest font-label">
              {t('preTranslationNotes')}
            </p>
          </div>
          <div className="p-5">
            <ul className="space-y-2">
              {simplificationResult.ambiguity_flags.map((flag, i) => (
                <li key={i} className="text-xs text-blue-200/80 flex items-start gap-2 leading-relaxed">
                  <span className="text-blue-400 flex-shrink-0 mt-0.5">•</span>
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
