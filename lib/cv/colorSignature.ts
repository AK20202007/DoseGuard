import type { OvalMask } from './colorExtractor';

export interface LabColor {
  l: number;
  a: number;
  b: number;
}

export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

export interface ColorSignatureCluster {
  proportion: number;
  meanLab: LabColor;
  meanHsv: HsvColor;
  predictedLabel: string;
  labelScores: Array<{ label: string; score: number }>;
}

export interface ColorSignature {
  pixelCount: number;
  lightnessMean: number;
  chromaMean: number;
  neutralFraction: number;
  clusters: ColorSignatureCluster[];
}

const LABEL_ANCHORS: Array<{ label: string; lab: LabColor }> = [
  { label: 'WHITE', lab: { l: 95, a: 0, b: 0 } },
  { label: 'GRAY', lab: { l: 58, a: 0, b: 0 } },
  { label: 'BLACK', lab: { l: 14, a: 0, b: 0 } },
  { label: 'RED', lab: { l: 53, a: 80, b: 67 } },
  { label: 'ORANGE', lab: { l: 70, a: 40, b: 70 } },
  { label: 'YELLOW', lab: { l: 90, a: -5, b: 88 } },
  { label: 'GREEN', lab: { l: 48, a: -50, b: 35 } },
  { label: 'BLUE', lab: { l: 32, a: 50, b: -80 } },
  { label: 'PURPLE', lab: { l: 42, a: 55, b: -45 } },
  { label: 'PINK', lab: { l: 80, a: 35, b: 5 } },
  { label: 'BROWN', lab: { l: 38, a: 20, b: 30 } },
];

function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

function rgbToLab(r: number, g: number, b: number): LabColor {
  const sr = r / 255;
  const sg = g / 255;
  const sb = b / 255;

  const lin = (u: number): number => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
  const rr = lin(sr);
  const gg = lin(sg);
  const bb = lin(sb);

  const x = rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375;
  const y = rr * 0.2126729 + gg * 0.7151522 + bb * 0.072175;
  const z = rr * 0.0193339 + gg * 0.119192 + bb * 0.9503041;

  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;

  const f = (t: number): number => {
    const e = 216 / 24389;
    const k = 24389 / 27;
    return t > e ? Math.cbrt(t) : (k * t + 16) / 116;
  };

  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function insideMask(x: number, y: number, width: number, mask: OvalMask, maskBitmap?: Uint8Array): boolean {
  if (maskBitmap && maskBitmap.length > 0) {
    const idx = y * width + x;
    if (idx >= 0 && idx < maskBitmap.length) {
      return maskBitmap[idx] === 1;
    }
  }
  const dx = (x - mask.cx) / mask.rx;
  const dy = (y - mask.cy) / mask.ry;
  return dx * dx + dy * dy <= 1;
}

function distLab(a: LabColor, b: LabColor): number {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

function meanLab(points: LabColor[]): LabColor {
  if (points.length === 0) return { l: 0, a: 0, b: 0 };
  let l = 0;
  let a = 0;
  let b = 0;
  for (const p of points) {
    l += p.l;
    a += p.a;
    b += p.b;
  }
  return { l: l / points.length, a: a / points.length, b: b / points.length };
}

function meanHsv(points: HsvColor[]): HsvColor {
  if (points.length === 0) return { h: 0, s: 0, v: 0 };
  let sx = 0;
  let sy = 0;
  let s = 0;
  let v = 0;
  for (const p of points) {
    const rad = (p.h * Math.PI) / 180;
    sx += Math.cos(rad);
    sy += Math.sin(rad);
    s += p.s;
    v += p.v;
  }
  let h = (Math.atan2(sy, sx) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { h, s: s / points.length, v: v / points.length };
}

function scoreLabels(lab: LabColor): Array<{ label: string; score: number }> {
  const raw = LABEL_ANCHORS.map((anchor) => {
    const d = distLab(lab, anchor.lab);
    return { label: anchor.label, score: Math.exp(-d / 22) };
  });

  const total = raw.reduce((sum, x) => sum + x.score, 0) || 1;
  return raw
    .map((x) => ({ label: x.label, score: x.score / total }))
    .sort((a, b) => b.score - a.score);
}

export function extractColorSignature(imageData: ImageData, mask: OvalMask, maskBitmap?: Uint8Array): ColorSignature {
  const { width, height, data } = imageData;
  const resolvedMaskBitmap = maskBitmap && maskBitmap.length === width * height ? maskBitmap : undefined;
  const labPixels: LabColor[] = [];
  const hsvPixels: HsvColor[] = [];

  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 6500)));

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (!insideMask(x, y, width, mask, resolvedMaskBitmap)) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      labPixels.push(rgbToLab(r, g, b));
      hsvPixels.push(rgbToHsv(r, g, b));
    }
  }

  if (labPixels.length === 0) {
    return {
      pixelCount: 0,
      lightnessMean: 0,
      chromaMean: 0,
      neutralFraction: 0,
      clusters: [],
    };
  }

  let c1 = labPixels[0];
  let c2 = labPixels[Math.floor(labPixels.length / 2)] ?? labPixels[0];
  let idxA: number[] = [];
  let idxB: number[] = [];

  for (let iter = 0; iter < 8; iter++) {
    idxA = [];
    idxB = [];
    for (let i = 0; i < labPixels.length; i++) {
      const d1 = distLab(labPixels[i], c1);
      const d2 = distLab(labPixels[i], c2);
      if (d1 <= d2) idxA.push(i);
      else idxB.push(i);
    }

    if (idxA.length > 0) c1 = meanLab(idxA.map((i) => labPixels[i]));
    if (idxB.length > 0) c2 = meanLab(idxB.map((i) => labPixels[i]));
  }

  const clustersRaw = [idxA, idxB].filter((indices) => indices.length > 0);
  const clusters: ColorSignatureCluster[] = clustersRaw
    .map((indices) => {
      const labs = indices.map((i) => labPixels[i]);
      const hsvs = indices.map((i) => hsvPixels[i]);
      const mLab = meanLab(labs);
      const mHsv = meanHsv(hsvs);
      const scores = scoreLabels(mLab);
      return {
        proportion: indices.length / labPixels.length,
        meanLab: mLab,
        meanHsv: mHsv,
        predictedLabel: scores[0]?.label ?? 'UNKNOWN',
        labelScores: scores.slice(0, 4),
      };
    })
    .sort((a, b) => b.proportion - a.proportion);

  let lightnessSum = 0;
  let chromaSum = 0;
  let neutralCount = 0;
  for (let i = 0; i < labPixels.length; i++) {
    const p = labPixels[i];
    const chroma = Math.sqrt(p.a * p.a + p.b * p.b);
    lightnessSum += p.l;
    chromaSum += chroma;
    if (chroma < 10) neutralCount++;
  }

  return {
    pixelCount: labPixels.length,
    lightnessMean: lightnessSum / labPixels.length,
    chromaMean: chromaSum / labPixels.length,
    neutralFraction: neutralCount / labPixels.length,
    clusters,
  };
}
