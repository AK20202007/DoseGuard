'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { detectPillCandidates, DEFAULT_OUTLINE_DETECTION_OPTIONS } from '@/lib/cv/shapeDetector';
import {
  analyzePillCandidate,
  fetchPrescriptionByDrugName,
  requestVlmBackup,
  shouldRunVlmBackup,
} from '@/lib/pillcv';
import type { ResolvedPrescription } from '@/lib/dailymed/types';
import type { AnalyzePillCandidateOutput, VlmBackupResult } from '@/lib/pillcv/types';
import { useLang } from '@/lib/i18nContext';

type Mode = 'idle' | 'camera' | 'analyzing' | 'done' | 'error';

type ScanResult = {
  analysis: AnalyzePillCandidateOutput;
  vlm: VlmBackupResult | null;
  capturedUrl: string;
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.8 ? 'bg-green-500' : value >= 0.5 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div>
      <div className="flex justify-between text-[10px] text-on-surface-variant font-label mb-1">
        <span>{label}</span>
        <span className="font-mono font-bold">{pct}%</span>
      </div>
      <div className="w-full bg-surface-container-high rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

function ResultCard({ scanResult, prescription }: { scanResult: ScanResult; prescription: ResolvedPrescription }) {
  const { t } = useLang();
  const { analysis, vlm } = scanResult;
  const cv = analysis.score.result;
  const overallPct = Math.round(cv.overallScore * 100);

  const verdict: 'match' | 'uncertain' | 'mismatch' =
    cv.hardStop ? 'mismatch' :
    vlm?.verdict === 'non_match' ? 'mismatch' :
    vlm?.verdict === 'match' ? 'match' :
    cv.overallScore >= 0.8 ? 'match' :
    cv.overallScore >= 0.55 ? 'uncertain' : 'mismatch';

  const styles = {
    match:    { bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-900',  icon: 'verified',    label: t('pillVerified') },
    uncertain:{ bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-900',  icon: 'warning',     label: t('pillUncertain') },
    mismatch: { bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-900',    icon: 'gpp_bad',     label: t('pillMismatch') },
  }[verdict];

  return (
    <div className="space-y-3">
      <img
        src={scanResult.capturedUrl}
        alt="Captured pill"
        className="w-full rounded border border-slate-200 object-cover max-h-48"
      />

      <div className={`rounded border p-3 ${styles.bg} ${styles.border}`}>
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`material-symbols-outlined ${styles.text}`}
            style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}
          >
            {styles.icon}
          </span>
          <span className={`text-sm font-bold ${styles.text}`}>{styles.label}</span>
          <span className={`ml-auto text-sm font-black ${styles.text}`}>{overallPct}%</span>
        </div>
        {cv.hardStop && (
          <p className={`text-xs ${styles.text} leading-relaxed`}>{cv.hardStopReason}</p>
        )}
        {vlm?.rationale && (
          <p className={`text-xs ${styles.text} leading-relaxed mt-1`}>AI: {vlm.rationale}</p>
        )}
      </div>

      <div className="space-y-2">
        <ScoreBar label={t('colorMatch')} value={cv.matchBreakdown.color} />
        <ScoreBar label={t('shapeMatch')} value={cv.matchBreakdown.shape} />
        {prescription.imprint && (
          <ScoreBar label={t('imprintMatch')} value={cv.matchBreakdown.imprint} />
        )}
      </div>

      <div className="text-[10px] text-on-surface-variant font-label bg-surface-container-low rounded p-2 space-y-0.5">
        <div><span className="font-bold">{t('expectedColor')}</span> {prescription.color.join(', ')}</div>
        <div><span className="font-bold">{t('expectedShape')}</span> {prescription.shape}</div>
        {prescription.imprint && <div><span className="font-bold">{t('expectedImprint')}</span> {prescription.imprint}</div>}
      </div>

      {vlm && (
        <div className="text-[10px] text-on-surface-variant font-label">
          {t('aiVerification')} {vlm.model ?? 'Claude'} · {t('verdict')} {vlm.verdict} · {Math.round(vlm.confidence * 100)}% {t('confidence')}
        </div>
      )}
    </div>
  );
}

const MANUFACTURER_PREFIXES = new Set([
  'mylan', 'teva', 'sandoz', 'apotex', 'actavis', 'ranbaxy', 'aurobindo',
  'lupin', 'accord', 'ratio', 'apo', 'dom', 'novo', 'pms', 'jamp', 'mint',
  'pro', 'gen', 'ran', 'mar', 'nat', 'bio', 'zym', 'brand', 'pharma',
]);

function sanitizeDrugName(name: string): string {
  let s = name
    .replace(/\(.*?\)/g, '')        // remove (alprazolam), (500mg), etc.
    .replace(/[™®©℠]/g, '')         // remove trademark symbols
    .replace(/\b\w+-brand\b\s*/gi, '') // remove "Mylan-brand" style prefixes
    .trim();

  // Split on spaces and dashes, drop known manufacturer tokens, return first real word
  const parts = s.split(/[\s-]+/).filter(Boolean);
  const drug = parts.find(p => !MANUFACTURER_PREFIXES.has(p.toLowerCase())) ?? parts[0] ?? '';
  return drug.trim();
}

export function PillScanCard({ initialDrugName, instructionText }: { initialDrugName: string | null; instructionText?: string }) {
  const { t } = useLang();
  const [drugInput, setDrugInput] = useState(initialDrugName ? sanitizeDrugName(initialDrugName) : '');
  const [prescription, setPrescription] = useState<ResolvedPrescription | null>(null);
  const [loadingRx, setLoadingRx] = useState(false);
  const [rxError, setRxError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When analysis gives us a real extracted name, use it immediately
  useEffect(() => {
    if (initialDrugName && !prescription) setDrugInput(sanitizeDrugName(initialDrugName));
  }, [initialDrugName, prescription]);

  // When only instructionText is available (pre-analysis), ask Claude Haiku for the drug name
  useEffect(() => {
    if (initialDrugName || !instructionText || prescription) return;
    let cancelled = false;
    fetch('/api/extract-drug-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: instructionText }),
    })
      .then(r => r.json())
      .then(({ name }) => { if (!cancelled && name) setDrugInput(name); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [initialDrugName, instructionText, prescription]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const loadPrescription = useCallback(async () => {
    if (!drugInput.trim()) return;
    setLoadingRx(true);
    setRxError(null);
    setPrescription(null);
    setScanResult(null);
    try {
      const rx = await fetchPrescriptionByDrugName(sanitizeDrugName(drugInput));
      setPrescription(rx);
    } catch (e) {
      setRxError(e instanceof Error ? e.message : 'DailyMed lookup failed');
    } finally {
      setLoadingRx(false);
    }
  }, [drugInput]);

  const startCamera = useCallback(async () => {
    setScanResult(null);
    setMode('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setMode('error');
      setStatusMsg(t('cameraError'));
    }
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !prescription) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCamera();
    const capturedUrl = canvas.toDataURL('image/jpeg', 0.9);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    await runAnalysis(imageData, capturedUrl);
  }, [prescription, stopCamera]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !prescription || !canvasRef.current) return;
    setScanResult(null);
    setMode('analyzing');
    setStatusMsg(t('loadingImage'));

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const canvas = canvasRef.current!;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const capturedUrl = canvas.toDataURL('image/jpeg', 0.9);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      await runAnalysis(imageData, capturedUrl);
    };
    img.onerror = () => {
      setMode('error');
      setStatusMsg(t('couldNotLoad'));
    };
    img.src = url;
  }, [prescription]);

  const runAnalysis = useCallback(async (imageData: ImageData, capturedUrl: string) => {
    if (!prescription) return;
    setMode('analyzing');
    setStatusMsg(t('detectingPill'));

    const candidates = detectPillCandidates(imageData, undefined, DEFAULT_OUTLINE_DETECTION_OPTIONS, 3);
    const outline = candidates[0];
    if (!outline) {
      setMode('error');
      setStatusMsg(t('noPillDetected'));
      return;
    }

    setStatusMsg(t('analyzingPill'));
    let analysis: AnalyzePillCandidateOutput;
    try {
      analysis = await analyzePillCandidate({
        analyzedImage: imageData,
        outline,
        prescription,
        prescriptionMeta: null,
      });
    } catch (e) {
      setMode('error');
      setStatusMsg(e instanceof Error ? e.message : 'Analysis failed.');
      return;
    }

    const cv = analysis.score.result;
    const color = analysis.colorDebug.result;
    const shape = analysis.shapeDebug.result;
    const imprint = analysis.imprintResult;

    let vlm: VlmBackupResult | null = null;
    const needsVlm = shouldRunVlmBackup(
      cv,
      color.confidence,
      shape.confidence,
      imprint.text,
      imprint.confidence,
      prescription.imprint !== null,
    );
    if (needsVlm) {
      setStatusMsg(t('runningAI'));
      vlm = await requestVlmBackup({
        imageDataUrl: capturedUrl,
        prescription,
        cv: {
          overallScore: cv.overallScore,
          color: { primary: color.primary, secondary: color.secondary, confidence: color.confidence },
          shape: { label: shape.label, confidence: shape.confidence },
          imprint: { text: imprint.text, confidence: imprint.confidence },
        },
      });
    }

    setScanResult({ analysis, vlm, capturedUrl });
    setMode('done');
  }, [prescription]);

  const reset = useCallback(() => {
    stopCamera();
    setScanResult(null);
    setMode('idle');
    setStatusMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [stopCamera]);

  return (
    <div className="bg-surface-container-lowest rounded-lg overflow-hidden shadow-sm border border-slate-100">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
        >
          medication
        </span>
        <div>
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label">
            {t('physicalPillVerification')}
          </p>
          <h3 className="text-sm font-bold text-on-surface leading-none mt-0.5">
            {t('pillScanner')}
          </h3>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Drug name + DailyMed lookup */}
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label mb-1.5">
            {t('drugName')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={drugInput}
              onChange={e => { setDrugInput(sanitizeDrugName(e.target.value)); setPrescription(null); setScanResult(null); }}
              onKeyDown={e => e.key === 'Enter' && loadPrescription()}
              placeholder={t('drugNamePlaceholder')}
              className="flex-1 text-sm border border-outline-variant rounded px-3 py-2 bg-surface-container-low text-on-surface placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={loadPrescription}
              disabled={!drugInput.trim() || loadingRx}
              className="px-3 py-2 bg-primary text-white text-xs font-bold rounded disabled:opacity-40 transition-opacity"
            >
              {loadingRx ? '…' : t('lookup')}
            </button>
          </div>
          {rxError && <p className="text-xs text-red-600 mt-1">{rxError}</p>}
          {prescription && (
            <p className="text-[10px] text-green-700 font-label mt-1">
              ✓ {prescription.productName} · {prescription.color.join('/')} · {prescription.shape}
              {prescription.imprint ? ` · "${prescription.imprint}"` : ''}
            </p>
          )}
        </div>

        {/* Camera / Upload controls */}
        {prescription && mode === 'idle' && (
          <div className="flex gap-2">
            <button
              onClick={startCamera}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-primary text-primary text-sm font-semibold rounded hover:bg-primary/5 transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>photo_camera</span>
              {t('useCamera')}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-outline-variant text-on-surface text-sm font-semibold rounded hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload</span>
              {t('uploadPhoto')}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </div>
        )}

        {/* Camera view */}
        {mode === 'camera' && (
          <div className="space-y-3">
            <div className="relative rounded overflow-hidden bg-black aspect-video">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              {/* Oval guide overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-2/3 h-1/2 border-2 border-white/60 rounded-[50%]" />
              </div>
            </div>
            <p className="text-[10px] text-on-surface-variant text-center font-label">
              {t('centerPill')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={captureAndAnalyze}
                className="flex-1 py-2.5 bg-primary text-white text-sm font-bold rounded"
              >
                <span className="material-symbols-outlined align-middle mr-1" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>
                  camera
                </span>
                {t('captureAnalyze')}
              </button>
              <button onClick={reset} className="px-4 py-2.5 border border-outline-variant rounded text-sm text-on-surface">
                {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Analyzing spinner */}
        {mode === 'analyzing' && (
          <div className="flex items-center gap-3 py-4 justify-center">
            <svg className="w-5 h-5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-on-surface-variant">{statusMsg}</span>
          </div>
        )}

        {/* Error */}
        {mode === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-xs">
              <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>
                error
              </span>
              {statusMsg}
            </div>
            <button onClick={reset} className="w-full py-2 border border-outline-variant rounded text-sm text-on-surface">
              {t('tryAgain')}
            </button>
          </div>
        )}

        {/* Result */}
        {mode === 'done' && scanResult && prescription && (
          <div className="space-y-3">
            <ResultCard scanResult={scanResult} prescription={prescription} />
            <button onClick={reset} className="w-full py-2 border border-outline-variant rounded text-sm text-on-surface">
              {t('scanAgain')}
            </button>
          </div>
        )}

        {/* Hidden canvas for image processing */}
        <canvas ref={canvasRef} className="hidden" />

        {!prescription && mode === 'idle' && (
          <p className="text-xs text-on-surface-variant text-center py-2">
            {t('pillScanIdle')}
          </p>
        )}
      </div>
    </div>
  );
}
