'use client';

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import CameraManager from '@/lib/camera/CameraManager';
import VideoFeed from '@/components/layer6/VideoFeed';
import LightingBanner from '@/components/layer6/LightingBanner';
import {
  DAILYMED_COLOR_LABELS,
  type ColorDebugResult,
  type OvalMask,
} from '@/lib/cv/colorExtractor';
import {
  DEFAULT_OUTLINE_DETECTION_OPTIONS,
  detectPillCandidates,
  type OutlineDetectionResult,
  type OutlineDetectionOptions,
  type ShapeDebugResult,
} from '@/lib/cv/shapeDetector';
import type { ColorSignature } from '@/lib/cv/colorSignature';
import type { CVResult } from '@/lib/cv/scorer';
import type { PrescriptionAttributes, ResolvedPrescription } from '@/lib/dailymed/types';
import {
  analyzePillCandidate,
  buildVariantOptions,
  fetchPrescriptionByDrugName,
  requestVlmBackup,
  shouldRunVlmBackup,
  type VariantSelectionMode,
  type VlmBackupResult,
} from '@/lib/pillcv';

const camera = new CameraManager();

const W = 640;
const H = 480;

interface DebugImage {
  title: string;
  src: string;
  caption: string;
}

interface AnalysisAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
}

const DEFAULT_ANALYSIS_ADJUSTMENTS: AnalysisAdjustments = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
};

const COLOR_DEBUG_PALETTE: Record<string, [number, number, number]> = {
  WHITE: [245, 245, 245],
  YELLOW: [253, 224, 71],
  ORANGE: [251, 146, 60],
  RED: [248, 113, 113],
  PINK: [244, 114, 182],
  PURPLE: [192, 132, 252],
  BLUE: [96, 165, 250],
  GREEN: [74, 222, 128],
  BROWN: [180, 83, 9],
  BLACK: [17, 24, 39],
  GRAY: [156, 163, 175],
};

export default function DemoApp() {
  const [drugName, setDrugName] = useState('acetaminophen');
  const [prescription, setPrescription] = useState<PrescriptionAttributes | null>(null);
  const [prescriptionMeta, setPrescriptionMeta] = useState<ResolvedPrescription | null>(null);
  const [loadingPrescription, setLoadingPrescription] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [result, setResult] = useState<CVResult | null>(null);
  const [matchedVariant, setMatchedVariant] = useState<string | null>(null);
  const [variantSelectionKey, setVariantSelectionKey] = useState<string>('auto');
  const [variantSelectionMode, setVariantSelectionMode] = useState<VariantSelectionMode>('auto');
  const [outlineStatus, setOutlineStatus] = useState<{ confidence: number; usedFallback: boolean; method: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hardStopReason, setHardStopReason] = useState<string | null>(null);
  const [debugImages, setDebugImages] = useState<DebugImage[]>([]);
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const [vlmBackup, setVlmBackup] = useState<VlmBackupResult | null>(null);
  const [vlmPending, setVlmPending] = useState(false);
  const [candidateOverlaySrc, setCandidateOverlaySrc] = useState<string | null>(null);
  const [detectedCandidates, setDetectedCandidates] = useState<OutlineDetectionResult[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [analysisAdjustments, setAnalysisAdjustments] = useState<AnalysisAdjustments>(DEFAULT_ANALYSIS_ADJUSTMENTS);
  const [outlineOptions, setOutlineOptions] = useState<OutlineDetectionOptions>(DEFAULT_OUTLINE_DETECTION_OPTIONS);
  const lastRawImageRef = useRef<ImageData | null>(null);
  const lastAnalyzedImageRef = useRef<ImageData | null>(null);
  const lastCandidatesRef = useRef<OutlineDetectionResult[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => {
      camera.stopCamera();
    };
  }, []);

  async function startCamera() {
    try {
      const s = await camera.startCamera();
      setStream(s);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  function stopCamera() {
    camera.stopCamera();
    setStream(null);
    setResult(null);
    setMatchedVariant(null);
    setVariantSelectionMode('auto');
    setOutlineStatus(null);
    setHardStopReason(null);
    setDebugImages([]);
    setDebugLines([]);
    setVlmBackup(null);
    setVlmPending(false);
    setDetectedCandidates([]);
    setSelectedCandidateIndex(0);
    setCandidateOverlaySrc(null);
    lastRawImageRef.current = null;
    lastAnalyzedImageRef.current = null;
    lastCandidatesRef.current = [];
  }

  function toBasePrescriptionAttributes(meta: ResolvedPrescription): PrescriptionAttributes {
    return {
      color: meta.color,
      shape: meta.shape,
      imprint: meta.imprint,
    };
  }

  async function loadPrescription() {
    const trimmed = drugName.trim();
    if (!trimmed) {
      setError('Enter a prescribed drug name first.');
      return;
    }

    setLoadingPrescription(true);
    setError(null);

    try {
      const loadedMeta = await fetchPrescriptionByDrugName(trimmed);
      const loadedPrescription = toBasePrescriptionAttributes(loadedMeta);

      setPrescription(loadedPrescription);
      setPrescriptionMeta(loadedMeta);
      setResult(null);
      setMatchedVariant(null);
      setVariantSelectionKey('auto');
      setVariantSelectionMode('auto');
      setHardStopReason(null);
      setDebugImages([]);
      setDebugLines([]);
      setVlmBackup(null);
      setVlmPending(false);
      setDetectedCandidates([]);
      setSelectedCandidateIndex(0);
      setCandidateOverlaySrc(null);
      lastRawImageRef.current = null;
      lastAnalyzedImageRef.current = null;
      lastCandidatesRef.current = [];
    } catch (e) {
      setPrescription(null);
      setPrescriptionMeta(null);
      setMatchedVariant(null);
      setVariantSelectionKey('auto');
      setVariantSelectionMode('auto');
      setVlmBackup(null);
      setVlmPending(false);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingPrescription(false);
    }
  }

  async function runVlmBackup(
    analyzedImage: ImageData,
    cv: CVResult,
    colorDebug: ColorDebugResult,
    shapeDebug: ShapeDebugResult,
    imprintResult: { text: string; confidence: number },
  ): Promise<VlmBackupResult | null> {
    if (!prescription) return null;

    setVlmPending(true);
    try {
      const imageDataUrl = imageDataToJpegDataUrl(analyzedImage, 0.82);
      return await requestVlmBackup({
        imageDataUrl,
        prescription,
        cv: {
          overallScore: cv.overallScore,
          color: {
            primary: colorDebug.result.primary,
            secondary: colorDebug.result.secondary,
            confidence: colorDebug.result.confidence,
          },
          shape: {
            label: shapeDebug.result.label,
            confidence: shapeDebug.result.confidence,
          },
          imprint: {
            text: imprintResult.text,
            confidence: imprintResult.confidence,
          },
        },
      });
    } finally {
      setVlmPending(false);
    }
  }

  async function analyzeCandidate(
    imageData: ImageData,
    analyzedImage: ImageData,
    candidates: OutlineDetectionResult[],
    candidateIndex: number,
    variantSelectionOverride?: string,
  ) {
    const selectedIndex = Math.max(0, Math.min(candidates.length - 1, candidateIndex));
    const outline = candidates[selectedIndex];

    setDetectedCandidates(candidates);
    setSelectedCandidateIndex(selectedIndex);
    setCandidateOverlaySrc(candidateOverlayStage(analyzedImage, candidates, selectedIndex));
    setOutlineStatus({ confidence: outline.confidence, usedFallback: outline.usedFallback, method: outline.method });

    const analysis = await analyzePillCandidate({
      analyzedImage,
      outline,
      prescription: prescription!,
      prescriptionMeta,
      variantSelectionKey: variantSelectionOverride ?? variantSelectionKey,
      enableImprint: true,
    });

    const cv = analysis.score.result;
    setResult(cv);
    setMatchedVariant(analysis.score.label);
    setVariantSelectionMode(analysis.score.mode);
    setHardStopReason(cv.hardStop ? cv.hardStopReason ?? 'Hard stop triggered' : null);

    const runBackup = shouldRunVlmBackup(
      cv,
      analysis.colorDebug.result.confidence,
      analysis.shapeDebug.result.confidence,
      analysis.imprintResult.text,
      analysis.imprintResult.confidence,
      Boolean(prescription?.imprint),
    );

    let backupResult: VlmBackupResult | null = null;
    if (runBackup) {
      backupResult = await runVlmBackup(
        analyzedImage,
        cv,
        analysis.colorDebug,
        analysis.shapeDebug,
        analysis.imprintResult,
      );
    }
    setVlmBackup(backupResult);

    const debug = buildDebugPipeline(
      imageData,
      analyzedImage,
      analysis.mask,
      analysis.colorDebug,
      analysis.colorSignature,
      analysis.shapeDebug,
      analysis.imprintResult,
      cv,
      analysisAdjustments,
      outlineOptions,
      selectedIndex,
      candidates.length,
      backupResult,
      analysis.score.label,
      analysis.conformingMaskBitmap,
      analysis.score.mode,
    );
    setDebugImages(debug.images);
    setDebugLines(debug.lines);
  }

  async function selectCandidate(candidateIndex: number) {
    if (!prescription) return;
    const imageData = lastRawImageRef.current;
    const analyzedImage = lastAnalyzedImageRef.current;
    const candidates = lastCandidatesRef.current;
    if (!imageData || !analyzedImage || candidates.length === 0) return;

    setAnalyzing(true);
    setError(null);
    try {
      await analyzeCandidate(imageData, analyzedImage, candidates, candidateIndex);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCapture() {
    if (!videoRef.current || analyzing) return;
    if (!prescription) {
      setError('Load prescription attributes from DailyMed before capture.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setHardStopReason(null);
    setVlmBackup(null);
    setVlmPending(false);

    try {
      const imageData = camera.captureFrame(videoRef.current);
      const analyzedImage = preprocessImageData(imageData, analysisAdjustments);
      const candidates = detectPillCandidates(analyzedImage, undefined, outlineOptions, 5);
      const defaultCandidateIndex = pickDefaultCandidateIndex(candidates, analyzedImage.width, analyzedImage.height);

      lastRawImageRef.current = imageData;
      lastAnalyzedImageRef.current = analyzedImage;
      lastCandidatesRef.current = candidates;

      await analyzeCandidate(imageData, analyzedImage, candidates, defaultCandidateIndex);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  function clearHardStop() {
    setHardStopReason(null);
  }

  function resetAnalysisAdjustments() {
    setAnalysisAdjustments(DEFAULT_ANALYSIS_ADJUSTMENTS);
  }

  function resetOutlineOptions() {
    setOutlineOptions(DEFAULT_OUTLINE_DETECTION_OPTIONS);
  }

  function handleCandidateOverlayClick(event: MouseEvent<HTMLImageElement>) {
    const analyzedImage = lastAnalyzedImageRef.current;
    const candidates = lastCandidatesRef.current;
    if (!analyzedImage || candidates.length === 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * analyzedImage.width;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * analyzedImage.height;

    let selected = candidates.findIndex((candidate) => isInsideCandidate(x, y, candidate));
    if (selected < 0) {
      let bestDist = Infinity;
      let bestIdx = 0;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const dx = (x - c.mask.cx) / Math.max(1, c.mask.rx);
        const dy = (y - c.mask.cy) / Math.max(1, c.mask.ry);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      selected = bestIdx;
    }

    void selectCandidate(selected);
  }

  async function handleVariantSelectionChange(nextKey: string) {
    setVariantSelectionKey(nextKey);
    const imageData = lastRawImageRef.current;
    const analyzedImage = lastAnalyzedImageRef.current;
    const candidates = lastCandidatesRef.current;

    if (!imageData || !analyzedImage || candidates.length === 0 || !prescription) return;

    setAnalyzing(true);
    setError(null);
    try {
      await analyzeCandidate(imageData, analyzedImage, candidates, selectedCandidateIndex, nextKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  const variantOptions = buildVariantOptions(prescription, prescriptionMeta);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24, gap: 16 }}>
      <h1 style={{ margin: 0 }}>Pill CV Demo</h1>

      <LightingBanner message={stream ? 'Place a single pill in frame and press Capture Now.' : null} />

      <div style={{ display: 'flex', gap: 10, width: W, maxWidth: '100%' }}>
        <input
          value={drugName}
          onChange={(e) => setDrugName(e.target.value)}
          placeholder="Prescribed drug name (e.g., acetaminophen)"
          style={{
            flex: 1,
            borderRadius: 8,
            border: '1px solid #374151',
            background: '#111827',
            color: '#fff',
            padding: '10px 12px',
            fontSize: 14,
          }}
        />
        <button onClick={loadPrescription} disabled={loadingPrescription} style={btnStyle('#7c3aed')}>
          {loadingPrescription ? 'Loading...' : 'Load From DailyMed'}
        </button>
      </div>

      <div style={{ position: 'relative', width: W, height: H, background: '#000', borderRadius: 12, overflow: 'hidden' }}>
        <VideoFeed stream={stream} videoRef={videoRef} />
        {analyzing && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', fontSize: 18 }}>
            Analyzing...
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {!stream ? (
          <button onClick={startCamera} style={btnStyle('#2563eb')}>Start Camera</button>
        ) : (
          <>
            <button onClick={handleCapture} disabled={analyzing || loadingPrescription || !prescription} style={btnStyle('#16a34a')}>Capture Now</button>
            <button onClick={stopCamera} style={btnStyle('#dc2626')}>Stop</button>
          </>
        )}
      </div>

      <div style={{ width: W, maxWidth: '100%', border: '1px solid #1f2937', borderRadius: 10, padding: 12, background: '#0b1220', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Live Tuning</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Sliders affect analysis output</div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: '#d1d5db', fontWeight: 600 }}>Image Preprocessing</div>
        <SliderRow
          label="Brightness"
          min={-80}
          max={80}
          step={1}
          value={analysisAdjustments.brightness}
          onChange={(value) => setAnalysisAdjustments((prev) => ({ ...prev, brightness: value }))}
        />
        <SliderRow
          label="Contrast"
          min={0.6}
          max={1.8}
          step={0.02}
          value={analysisAdjustments.contrast}
          onChange={(value) => setAnalysisAdjustments((prev) => ({ ...prev, contrast: value }))}
        />
        <SliderRow
          label="Saturation"
          min={0}
          max={2}
          step={0.02}
          value={analysisAdjustments.saturation}
          onChange={(value) => setAnalysisAdjustments((prev) => ({ ...prev, saturation: value }))}
        />
        <button onClick={resetAnalysisAdjustments} style={{ ...btnStyle('#334155'), marginTop: 8, padding: '6px 10px', fontSize: 12 }}>Reset Image</button>

        <div style={{ marginTop: 14, fontSize: 12, color: '#d1d5db', fontWeight: 600 }}>Outline Detector</div>
        <SliderRow
          label="Edge Mean Mult"
          min={0.7}
          max={2}
          step={0.05}
          value={outlineOptions.edgeFloorMeanMultiplier}
          onChange={(value) => setOutlineOptions((prev) => ({ ...prev, edgeFloorMeanMultiplier: value }))}
        />
        <SliderRow
          label="Edge Max Ratio"
          min={0.04}
          max={0.3}
          step={0.01}
          value={outlineOptions.edgeFloorMaxRatio}
          onChange={(value) => setOutlineOptions((prev) => ({ ...prev, edgeFloorMaxRatio: value }))}
        />
        <SliderRow
          label="Radial Contrast W"
          min={0}
          max={2}
          step={0.05}
          value={outlineOptions.radialContrastWeight}
          onChange={(value) => setOutlineOptions((prev) => ({ ...prev, radialContrastWeight: value }))}
        />
        <SliderRow
          label="Radial Outward W"
          min={0}
          max={12}
          step={0.25}
          value={outlineOptions.radialOutwardBiasWeight}
          onChange={(value) => setOutlineOptions((prev) => ({ ...prev, radialOutwardBiasWeight: value }))}
        />
        <SliderRow
          label="Min Component Px"
          min={20}
          max={500}
          step={5}
          value={outlineOptions.minComponentArea}
          onChange={(value) => setOutlineOptions((prev) => ({ ...prev, minComponentArea: value }))}
        />
        <SliderRow
          label="Min Contour Pts"
          min={8}
          max={140}
          step={1}
          value={outlineOptions.minContourPoints}
          onChange={(value) => setOutlineOptions((prev) => ({ ...prev, minContourPoints: value }))}
        />
        <SliderRow
          label="Min Area Fraction"
          min={0.001}
          max={0.08}
          step={0.001}
          value={outlineOptions.minAreaFraction}
          onChange={(value) =>
            setOutlineOptions((prev) => ({
              ...prev,
              minAreaFraction: Math.min(value, prev.preferredMaxAreaFraction),
            }))
          }
        />
        <SliderRow
          label="Max Area Fraction"
          min={0.08}
          max={0.6}
          step={0.01}
          value={outlineOptions.preferredMaxAreaFraction}
          onChange={(value) =>
            setOutlineOptions((prev) => ({
              ...prev,
              preferredMaxAreaFraction: Math.max(value, prev.minAreaFraction),
            }))
          }
        />
        <button onClick={resetOutlineOptions} style={{ ...btnStyle('#334155'), marginTop: 8, padding: '6px 10px', fontSize: 12 }}>Reset Outline</button>
      </div>

      {error && <p style={{ color: '#f87171' }}>{error}</p>}

      {hardStopReason && (
        <div style={{ width: W, maxWidth: '100%', background: '#7f1d1d', color: '#fecaca', border: '1px solid #b91c1c', borderRadius: 8, padding: 10, boxSizing: 'border-box' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Hard Stop Triggered</div>
          <div style={{ fontSize: 13 }}>{hardStopReason}</div>
          <button onClick={clearHardStop} style={{ ...btnStyle('#991b1b'), marginTop: 8, padding: '6px 10px', fontSize: 12 }}>Dismiss</button>
        </div>
      )}

      {prescriptionMeta && (
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '10px 12px', width: W, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 13, color: '#d1d5db' }}>
            Prescription loaded: {prescriptionMeta.productName || prescriptionMeta.query}
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
            Colors: {prescriptionMeta.color.join('/') || 'N/A'} | Shape: {prescriptionMeta.shape} | Imprint: {prescriptionMeta.imprint ?? 'N/A'}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            Source: DailyMed {prescriptionMeta.queryMode === 'ndc' ? '(NDC query)' : '(drug-name query)'} NDC {prescriptionMeta.ndc} | Confidence {(prescriptionMeta.confidence * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            Dosage form: {prescriptionMeta.dosageForm ?? 'N/A'} | Size: {prescriptionMeta.sizeMm ?? 'N/A'} mm | Score marks: {prescriptionMeta.scoreMarkings ?? 'N/A'}
          </div>
          {variantOptions.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                Variant scoring mode
              </div>
              <select
                value={variantSelectionKey}
                onChange={(e) => void handleVariantSelectionChange(e.target.value)}
                style={{
                  width: '100%',
                  borderRadius: 8,
                  border: '1px solid #374151',
                  background: '#0f172a',
                  color: '#e5e7eb',
                  padding: '8px 10px',
                  fontSize: 12,
                }}
              >
                <option value="auto">Auto (best scoring variant)</option>
                {variantOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label} | shape={option.attrs.shape} | imprint={option.attrs.imprint ?? 'N/A'}
                  </option>
                ))}
              </select>
            </div>
          )}
          {prescriptionMeta.alternatives && prescriptionMeta.alternatives.length > 0 && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              Variants found: {prescriptionMeta.alternatives.length} additional profile(s) (for example different imprint/shape combinations).
            </div>
          )}
        </div>
      )}

      {result && <ResultPanel result={result} />}

      {matchedVariant && (
        <div style={{ width: W, maxWidth: '100%', border: '1px solid #1f2937', borderRadius: 10, padding: 10, background: '#0b1220', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            {variantSelectionMode === 'manual' ? 'Manually selected DailyMed variant' : 'Best matched DailyMed variant'}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: '#e5e7eb' }}>{matchedVariant}</div>
        </div>
      )}

      {(vlmPending || vlmBackup) && (
        <div style={{ width: W, maxWidth: '100%', border: '1px solid #1f2937', borderRadius: 10, padding: 10, background: '#0b1220', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb' }}>VLM Backup</div>
          {vlmPending && <div style={{ marginTop: 6, fontSize: 12, color: '#9ca3af' }}>Running backup verification...</div>}
          {!vlmPending && vlmBackup && (
            <>
              <div style={{ marginTop: 6, fontSize: 12, color: '#cbd5e1' }}>
                Verdict: <strong>{vlmBackup.verdict}</strong> ({(vlmBackup.confidence * 100).toFixed(0)}%)
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
                {vlmBackup.rationale || 'No rationale returned.'}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
                Extracted: color={vlmBackup.extracted.color ?? 'N/A'}, shape={vlmBackup.extracted.shape ?? 'N/A'}, imprint={vlmBackup.extracted.imprint ?? 'N/A'}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                {vlmBackup.model ? `Model: ${vlmBackup.model}` : 'Model: N/A'}{vlmBackup.error ? ` | Error: ${vlmBackup.error}` : ''}
              </div>
            </>
          )}
        </div>
      )}

      {outlineStatus && (
        <p style={{ margin: 0, color: '#9ca3af', fontSize: 13 }}>
          Outline confidence: {(outlineStatus.confidence * 100).toFixed(0)}% ({outlineStatus.method})
          {outlineStatus.usedFallback ? ' (fallback mask used)' : ''}
        </p>
      )}

      {candidateOverlaySrc && detectedCandidates.length > 0 && (
        <div style={{ width: W, maxWidth: '100%', border: '1px solid #1f2937', borderRadius: 10, padding: 10, background: '#0b1220', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 8 }}>
            Detected pills: {detectedCandidates.length}. Click a pill to re-run matching for that pill.
          </div>
          <img
            src={candidateOverlaySrc}
            alt="Detected pill candidates"
            onClick={handleCandidateOverlayClick}
            style={{ width: '100%', borderRadius: 8, cursor: 'crosshair', border: '1px solid #374151' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {detectedCandidates.map((candidate, index) => (
              <button
                key={`${candidate.mask.cx}-${candidate.mask.cy}-${index}`}
                onClick={() => void selectCandidate(index)}
                style={{
                  ...btnStyle(index === selectedCandidateIndex ? '#2563eb' : '#334155'),
                  padding: '6px 10px',
                  fontSize: 12,
                }}
              >
                Pill {index + 1} ({candidate.method}, {(candidate.confidence * 100).toFixed(0)}%)
              </button>
            ))}
          </div>
        </div>
      )}

      {debugImages.length > 0 && (
        <div style={{ width: 'min(100%, 880px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>CV Debug Pipeline</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {debugImages.map((img) => (
              <figure key={img.title} style={{ margin: 0, border: '1px solid #1f2937', borderRadius: 8, overflow: 'hidden', background: '#0f172a' }}>
                <img src={img.src} alt={img.title} style={{ width: '100%', display: 'block' }} />
                <figcaption style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb' }}>{img.title}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{img.caption}</div>
                </figcaption>
              </figure>
            ))}
          </div>
          <div style={{ background: '#0b1220', border: '1px solid #1f2937', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#e5e7eb' }}>Numeric Debug</div>
            {debugLines.map((line, index) => (
              <div key={`${index}-${line}`} style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.45 }}>{line}</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ color: '#6b7280', fontSize: 13, maxWidth: 500, textAlign: 'center' }}>
        Capture is manual: tune sliders, capture, inspect debug stages, then iterate.
      </div>
    </div>
  );
}

function ResultPanel({ result }: { result: CVResult }) {
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  const scoreColor = result.overallScore >= 0.7 ? '#4ade80' : result.overallScore >= 0.4 ? '#facc15' : '#f87171';
  return (
    <div style={{ background: '#1f2937', borderRadius: 10, padding: '16px 24px', minWidth: 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Match Result</span>
        <span style={{ fontSize: 24, fontWeight: 800, color: scoreColor }}>{pct(result.overallScore)}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <tbody>
          <Row label="Color" value={pct(result.matchBreakdown.color)} />
          <Row label="Shape" value={pct(result.matchBreakdown.shape)} />
          <Row label="Imprint" value={pct(result.matchBreakdown.imprint)} />
        </tbody>
      </table>
      {result.hardStop && (
        <div style={{ marginTop: 12, color: '#f87171', fontWeight: 600 }}>
          Hard Stop: {result.hardStopReason}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: '4px 0', color: '#9ca3af' }}>{label}</td>
      <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600 }}>{value}</td>
    </tr>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const decimals = step >= 1 ? 0 : Math.min(4, String(step).split('.')[1]?.length ?? 2);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1' }}>
        <span>{label}</span>
        <span>{value.toFixed(decimals)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}

function btnStyle(bg: string): CSSProperties {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 22px',
    fontSize: 15,
    cursor: 'pointer',
    fontWeight: 600,
  };
}

function clampByte(v: number): number {
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return Math.round(v);
}

function preprocessImageData(imageData: ImageData, adjustments: AnalysisAdjustments): ImageData {
  const { brightness, contrast, saturation } = adjustments;
  const out = new Uint8ClampedArray(imageData.data.length);

  for (let i = 0; i < imageData.data.length; i += 4) {
    let r = imageData.data[i];
    let g = imageData.data[i + 1];
    let b = imageData.data[i + 2];

    r = (r - 128) * contrast + 128 + brightness;
    g = (g - 128) * contrast + 128 + brightness;
    b = (b - 128) * contrast + 128 + brightness;

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * saturation;
    g = gray + (g - gray) * saturation;
    b = gray + (b - gray) * saturation;

    out[i] = clampByte(r);
    out[i + 1] = clampByte(g);
    out[i + 2] = clampByte(b);
    out[i + 3] = 255;
  }

  return new ImageData(out, imageData.width, imageData.height);
}

function isInsideMask(x: number, y: number, mask: OvalMask): boolean {
  const dx = (x - mask.cx) / mask.rx;
  const dy = (y - mask.cy) / mask.ry;
  return dx * dx + dy * dy <= 1;
}

function sortContourAsPolygon(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length === 0) return [];
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return points.slice().sort((a, b) => {
    const aa = Math.atan2(a.y - cy, a.x - cx);
    const ab = Math.atan2(b.y - cy, b.x - cx);
    return aa - ab;
  });
}

function pointInPolygon(px: number, py: number, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / Math.max(1e-6, yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function contourBounds(points: Array<{ x: number; y: number }>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function isInsideCandidate(x: number, y: number, candidate: OutlineDetectionResult): boolean {
  if (candidate.contour.length >= 6) {
    const polygon = sortContourAsPolygon(candidate.contour);
    if (polygon.length >= 3 && pointInPolygon(x, y, polygon)) {
      return true;
    }
    return false;
  }
  return isInsideMask(x, y, candidate.mask);
}

function pickDefaultCandidateIndex(
  candidates: OutlineDetectionResult[],
  width: number,
  height: number,
): number {
  if (candidates.length === 0) return 0;

  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const areaFraction = (Math.PI * c.mask.rx * c.mask.ry) / Math.max(1, width * height);
    const aspect = Math.max(c.mask.rx / Math.max(1, c.mask.ry), c.mask.ry / Math.max(1, c.mask.rx));

    const areaScore =
      areaFraction < 0.01 || areaFraction > 0.24
        ? 0
        : Math.max(0, 1 - Math.abs(areaFraction - 0.06) / 0.18);
    const aspectScore = aspect > 3.2 ? 0 : Math.max(0, 1 - (aspect - 1) / 2.2);
    const methodScore = c.method === 'edge' ? 0.85 : c.method === 'fallback' ? 0.1 : 1;
    const largeMaskPenalty = areaFraction > 0.12 ? 0.55 : 1;
    const extremeAspectPenalty = aspect > 2.3 ? 0.7 : 1;

    const score = c.confidence * 0.7 + areaScore * 0.2 + aspectScore * 0.1;
    const weighted = score * methodScore * largeMaskPenalty * extremeAspectPenalty;

    if (weighted > bestScore) {
      bestScore = weighted;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function imageDataToJpegDataUrl(imageData: ImageData, quality = 0.82): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imageDataToDataUrl(imageData);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', quality);
}

function maskedStage(imageData: ImageData, mask: OvalMask, maskBitmap?: Uint8Array): string {
  const out = new Uint8ClampedArray(imageData.data.length);
  const resolvedMaskBitmap =
    maskBitmap && maskBitmap.length === imageData.width * imageData.height ? maskBitmap : null;

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const i = (y * imageData.width + x) * 4;
      const inside = resolvedMaskBitmap ? resolvedMaskBitmap[y * imageData.width + x] === 1 : isInsideMask(x, y, mask);
      const factor = inside ? 1 : 0.15;

      out[i] = Math.round(imageData.data[i] * factor);
      out[i + 1] = Math.round(imageData.data[i + 1] * factor);
      out[i + 2] = Math.round(imageData.data[i + 2] * factor);
      out[i + 3] = 255;
    }
  }

  return imageDataToDataUrl(new ImageData(out, imageData.width, imageData.height));
}

function colorMapStage(colorDebug: ColorDebugResult): string {
  const rgba = new Uint8ClampedArray(colorDebug.width * colorDebug.height * 4);

  for (let i = 0; i < colorDebug.pixelLabelMap.length; i++) {
    const idx = colorDebug.pixelLabelMap[i];
    const j = i * 4;

    if (idx === 255) {
      rgba[j] = 10;
      rgba[j + 1] = 10;
      rgba[j + 2] = 10;
      rgba[j + 3] = 255;
      continue;
    }

    const label = DAILYMED_COLOR_LABELS[idx] ?? 'GRAY';
    const [r, g, b] = COLOR_DEBUG_PALETTE[label] ?? COLOR_DEBUG_PALETTE.GRAY;
    rgba[j] = r;
    rgba[j + 1] = g;
    rgba[j + 2] = b;
    rgba[j + 3] = 255;
  }

  return imageDataToDataUrl(new ImageData(rgba, colorDebug.width, colorDebug.height));
}

function splitStage(imageData: ImageData, mask: OvalMask, splitY: number, contour?: Array<{ x: number; y: number }>): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.putImageData(imageData, 0, 0);
  ctx.strokeStyle = 'rgba(14,165,233,0.9)';
  ctx.lineWidth = 2;
  let drewContour = false;
  if (contour && contour.length >= 6) {
    const polygon = sortContourAsPolygon(contour);
    if (polygon.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(polygon[0].x, polygon[0].y);
      for (let i = 1; i < polygon.length; i++) {
        ctx.lineTo(polygon[i].x, polygon[i].y);
      }
      ctx.closePath();
      ctx.stroke();
      drewContour = true;
    }
  }
  if (!drewContour) {
    ctx.beginPath();
    ctx.ellipse(mask.cx, mask.cy, mask.rx, mask.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(244,63,94,0.95)';
  ctx.lineWidth = 2;
  let splitMinX = mask.cx - mask.rx;
  let splitMaxX = mask.cx + mask.rx;
  if (contour && contour.length >= 6) {
    const bb = contourBounds(contour);
    splitMinX = bb.minX;
    splitMaxX = bb.maxX;
  }
  ctx.beginPath();
  ctx.moveTo(splitMinX, splitY);
  ctx.lineTo(splitMaxX, splitY);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

function edgeStage(shapeDebug: ShapeDebugResult, width: number, height: number): string {
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < shapeDebug.edges.length; i++) {
    const j = i * 4;
    const onEdge = shapeDebug.edges[i] === 1;
    const inMask = shapeDebug.maskBitmap[i] === 1;

    if (onEdge) {
      rgba[j] = 255;
      rgba[j + 1] = 255;
      rgba[j + 2] = 255;
      rgba[j + 3] = 255;
    } else if (inMask) {
      rgba[j] = 38;
      rgba[j + 1] = 38;
      rgba[j + 2] = 52;
      rgba[j + 3] = 255;
    } else {
      rgba[j] = 8;
      rgba[j + 1] = 8;
      rgba[j + 2] = 10;
      rgba[j + 3] = 255;
    }
  }

  return imageDataToDataUrl(new ImageData(rgba, width, height));
}

function outlineOverlayStage(
  imageData: ImageData,
  detectedMask: OvalMask,
  shapeDebug: ShapeDebugResult,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.putImageData(imageData, 0, 0);

  ctx.strokeStyle = 'rgba(34,197,94,0.95)';
  ctx.lineWidth = 2;
  let drewContour = false;
  if (shapeDebug.contour.length >= 6) {
    const polygon = sortContourAsPolygon(shapeDebug.contour);
    if (polygon.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(polygon[0].x, polygon[0].y);
      for (let i = 1; i < polygon.length; i++) {
        ctx.lineTo(polygon[i].x, polygon[i].y);
      }
      ctx.closePath();
      ctx.stroke();
      drewContour = true;
    }
  }
  if (!drewContour) {
    ctx.beginPath();
    ctx.ellipse(detectedMask.cx, detectedMask.cy, detectedMask.rx, detectedMask.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (shapeDebug.boundingBox) {
    ctx.strokeStyle = 'rgba(239,68,68,0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      shapeDebug.boundingBox.minX,
      shapeDebug.boundingBox.minY,
      shapeDebug.boundingBox.maxX - shapeDebug.boundingBox.minX,
      shapeDebug.boundingBox.maxY - shapeDebug.boundingBox.minY,
    );
  }

  if (shapeDebug.contour.length > 0) {
    ctx.fillStyle = 'rgba(250,204,21,0.85)';
    const step = Math.max(1, Math.floor(shapeDebug.contour.length / 300));
    for (let i = 0; i < shapeDebug.contour.length; i += step) {
      const p = shapeDebug.contour[i];
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    }
  }

  return canvas.toDataURL('image/png');
}

function candidateOverlayStage(
  imageData: ImageData,
  candidates: OutlineDetectionResult[],
  selectedIndex: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.putImageData(imageData, 0, 0);
  ctx.font = `${Math.max(12, Math.round(imageData.width * 0.03))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const isSelected = i === selectedIndex;

    ctx.strokeStyle = isSelected ? 'rgba(59,130,246,0.95)' : 'rgba(34,197,94,0.95)';
    ctx.lineWidth = isSelected ? 3 : 2;
    let badgeX = candidate.mask.cx;
    let badgeY = candidate.mask.cy - candidate.mask.ry - 14;
    let drewContour = false;
    if (candidate.contour.length >= 6) {
      const polygon = sortContourAsPolygon(candidate.contour);
      if (polygon.length >= 3) {
        const bb = contourBounds(polygon);
        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        for (let p = 1; p < polygon.length; p++) {
          ctx.lineTo(polygon[p].x, polygon[p].y);
        }
        ctx.closePath();
        ctx.stroke();
        badgeX = (bb.minX + bb.maxX) / 2;
        badgeY = bb.minY - 14;
        drewContour = true;
      }
    }
    if (!drewContour) {
      ctx.beginPath();
      ctx.ellipse(candidate.mask.cx, candidate.mask.cy, candidate.mask.rx, candidate.mask.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = isSelected ? 'rgba(59,130,246,0.95)' : 'rgba(15,23,42,0.9)';
    ctx.fillRect(badgeX - 13, badgeY - 9, 26, 18);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(i + 1), badgeX, badgeY);
  }

  return canvas.toDataURL('image/png');
}

function buildDebugPipeline(
  imageData: ImageData,
  analyzedImage: ImageData,
  detectedMask: OvalMask,
  colorDebug: ColorDebugResult,
  colorSignature: ColorSignature,
  shapeDebug: ShapeDebugResult,
  imprintResult: { text: string; confidence: number },
  cv: CVResult,
  adjustments: AnalysisAdjustments,
  outlineOptions: OutlineDetectionOptions,
  selectedCandidateIndex: number,
  candidateCount: number,
  vlmBackupResult: VlmBackupResult | null,
  matchedVariantLabel: string,
  conformingMaskBitmap?: Uint8Array,
  variantMode: 'auto' | 'manual' = 'auto',
): { images: DebugImage[]; lines: string[] } {
  const raw = imageDataToDataUrl(imageData);
  const analyzed = imageDataToDataUrl(analyzedImage);
  const outline = outlineOverlayStage(analyzedImage, detectedMask, shapeDebug);
  const masked = maskedStage(analyzedImage, detectedMask, conformingMaskBitmap);
  const split = splitStage(analyzedImage, detectedMask, colorDebug.splitY, shapeDebug.contour);
  const colorMap = colorMapStage(colorDebug);
  const edges = edgeStage(shapeDebug, analyzedImage.width, analyzedImage.height);

  const images: DebugImage[] = [
    { title: '1. Captured Frame', src: raw, caption: 'Raw static frame from camera capture.' },
    { title: '2. Analyzed Frame', src: analyzed, caption: 'Brightness/contrast/saturation adjusted frame used by CV.' },
    { title: '3. Outline Detection', src: outline, caption: 'Green=detected mask, red=bbox, yellow=contour pixels.' },
    { title: '4. Pill Mask Applied', src: masked, caption: 'Pixels outside detected pill mask are dimmed.' },
    { title: '5. Top/Bottom Split', src: split, caption: 'Red line is where color extractor splits the capsule halves.' },
    { title: '6. Color Label Map', src: colorMap, caption: 'Every mask pixel is mapped to a DailyMed color class.' },
    { title: '7. Canny Edge Map', src: edges, caption: 'White pixels are detected edges used for shape/contour.' },
  ];

  const lines = [
    `Selected pill: ${selectedCandidateIndex + 1} of ${candidateCount}`,
    `Image tuning: brightness=${adjustments.brightness.toFixed(0)}, contrast=${adjustments.contrast.toFixed(2)}, saturation=${adjustments.saturation.toFixed(2)}`,
    `Outline tuning: edgeMeanMult=${outlineOptions.edgeFloorMeanMultiplier.toFixed(2)}, edgeMaxRatio=${outlineOptions.edgeFloorMaxRatio.toFixed(2)}, radialContrastW=${outlineOptions.radialContrastWeight.toFixed(2)}, radialOutwardW=${outlineOptions.radialOutwardBiasWeight.toFixed(2)}, minComponent=${outlineOptions.minComponentArea.toFixed(0)}, minContour=${outlineOptions.minContourPoints.toFixed(0)}, minArea=${outlineOptions.minAreaFraction.toFixed(3)}, maxArea=${outlineOptions.preferredMaxAreaFraction.toFixed(2)}`,
    `Mask: cx=${detectedMask.cx.toFixed(1)}, cy=${detectedMask.cy.toFixed(1)}, rx=${detectedMask.rx.toFixed(1)}, ry=${detectedMask.ry.toFixed(1)}`,
    `Mask mode: ${conformingMaskBitmap ? 'contour-filled' : 'oval-fallback'}`,
    `Color result: primary=${colorDebug.result.primary}, secondary=${colorDebug.result.secondary ?? 'null'}, confidence=${(colorDebug.result.confidence * 100).toFixed(1)}%`,
    `Top half: dominant=${colorDebug.top.dominant ?? 'none'} (${(colorDebug.top.confidence * 100).toFixed(1)}%), total=${colorDebug.top.total}, white=${colorDebug.top.whiteCount}, gray=${colorDebug.top.grayCount}, black=${colorDebug.top.blackCount}, brown=${colorDebug.top.brownCount}`,
    `Bottom half: dominant=${colorDebug.bottom.dominant ?? 'none'} (${(colorDebug.bottom.confidence * 100).toFixed(1)}%), total=${colorDebug.bottom.total}, white=${colorDebug.bottom.whiteCount}, gray=${colorDebug.bottom.grayCount}, black=${colorDebug.bottom.blackCount}, brown=${colorDebug.bottom.brownCount}`,
    `Color signature: pixels=${colorSignature.pixelCount}, L*mean=${colorSignature.lightnessMean.toFixed(1)}, chromaMean=${colorSignature.chromaMean.toFixed(1)}, neutralFraction=${(colorSignature.neutralFraction * 100).toFixed(1)}%`,
    ...colorSignature.clusters.map(
      (c, i) =>
        `Cluster ${i + 1}: proportion=${(c.proportion * 100).toFixed(1)}%, Lab=(${c.meanLab.l.toFixed(1)},${c.meanLab.a.toFixed(1)},${c.meanLab.b.toFixed(1)}), HSV=(${c.meanHsv.h.toFixed(0)}deg,${(c.meanHsv.s * 100).toFixed(1)}%,${(c.meanHsv.v * 100).toFixed(1)}%), predicted=${c.predictedLabel}, top=${c.labelScores.map((x) => `${x.label}:${(x.score * 100).toFixed(0)}%`).join(' ')}`,
    ),
    `Shape result: label=${shapeDebug.result.label}, aspectRatio=${shapeDebug.result.aspectRatio.toFixed(3)}, solidity=${shapeDebug.result.solidity.toFixed(3)}, confidence=${(shapeDebug.result.confidence * 100).toFixed(1)}%, vertices=${shapeDebug.approxVertices}, contourPixels=${shapeDebug.contour.length}`,
    `Imprint OCR: text="${imprintResult.text || ''}", confidence=${(imprintResult.confidence * 100).toFixed(1)}%`,
    `Final score: ${(cv.overallScore * 100).toFixed(1)}%, hardStop=${cv.hardStop ? 'true' : 'false'}${cv.hardStopReason ? `, reason=${cv.hardStopReason}` : ''}`,
    `Matched variant (${variantMode}): ${matchedVariantLabel}`,
    vlmBackupResult
      ? `VLM backup: verdict=${vlmBackupResult.verdict}, confidence=${(vlmBackupResult.confidence * 100).toFixed(1)}%, available=${vlmBackupResult.available ? 'true' : 'false'}${vlmBackupResult.model ? `, model=${vlmBackupResult.model}` : ''}${vlmBackupResult.error ? `, error=${vlmBackupResult.error}` : ''}`
      : 'VLM backup: not triggered (CV confidence sufficient).',
    `Color palette mapping: ${DAILYMED_COLOR_LABELS.join(', ')}`,
  ];

  return { images, lines };
}
