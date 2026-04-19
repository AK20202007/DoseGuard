#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  detectPillOutline,
  detectShapeDebug,
  DEFAULT_OUTLINE_DETECTION_OPTIONS,
} = require('../.local-build/cv/shapeDetector.js');
const { extractColorDebug, DAILYMED_COLOR_LABELS } = require('../.local-build/cv/colorExtractor.js');

const COLOR_DEBUG_PALETTE = {
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

function run(cmd, args, input = null) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    input,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed:\n${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function identifyImage(inputPath) {
  const out = run('magick', ['identify', '-format', '%w %h', inputPath]).trim();
  const [width, height] = out.split(/\s+/).map(Number);
  if (!width || !height) throw new Error(`Unable to identify image dimensions: ${inputPath}`);
  return { width, height };
}

function loadRgba(inputPath, maxWidth = 640) {
  const original = identifyImage(inputPath);
  const scale = original.width > maxWidth ? maxWidth / original.width : 1;
  const width = Math.max(1, Math.round(original.width * scale));
  const height = Math.max(1, Math.round(original.height * scale));
  const tmpRaw = path.join('/tmp', `cvh-${process.pid}-${Date.now()}.rgba`);
  run('magick', [
    inputPath,
    '-auto-orient',
    '-resize',
    `${width}x${height}!`,
    '-depth',
    '8',
    `rgba:${tmpRaw}`,
  ]);
  const data = fs.readFileSync(tmpRaw);
  fs.unlinkSync(tmpRaw);
  if (data.length !== width * height * 4) {
    throw new Error(`RGBA byte length mismatch: got ${data.length}, expected ${width * height * 4}`);
  }
  return {
    width,
    height,
    data: new Uint8ClampedArray(data),
  };
}

function clampByte(v) {
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return Math.round(v);
}

function preprocessImageData(imageData, adjustments) {
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
  return {
    width: imageData.width,
    height: imageData.height,
    data: out,
  };
}

function isInsideMask(x, y, mask) {
  const dx = (x - mask.cx) / Math.max(1, mask.rx);
  const dy = (y - mask.cy) / Math.max(1, mask.ry);
  return dx * dx + dy * dy <= 1;
}

function maskAreaFraction(mask, width, height) {
  return (Math.PI * mask.rx * mask.ry) / Math.max(1, width * height);
}

function normalizeImprint(text) {
  return (text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / maxLen;
}

function makeOcrImage(imageData, mask) {
  const out = new Uint8ClampedArray(imageData.width * imageData.height * 4);

  let min = 255;
  let max = 0;
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      if (!isInsideMask(x, y, mask)) continue;
      const idx = (y * imageData.width + x) * 4;
      const g = Math.round(
        0.299 * imageData.data[idx] +
          0.587 * imageData.data[idx + 1] +
          0.114 * imageData.data[idx + 2],
      );
      if (g < min) min = g;
      if (g > max) max = g;
    }
  }
  const span = Math.max(1, max - min);

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const idx = (y * imageData.width + x) * 4;
      let v = 128;
      if (isInsideMask(x, y, mask)) {
        const g = Math.round(
          0.299 * imageData.data[idx] +
            0.587 * imageData.data[idx + 1] +
            0.114 * imageData.data[idx + 2],
        );
        const norm = ((g - min) / span) * 255;
        v = clampByte(norm);
      }
      out[idx] = v;
      out[idx + 1] = v;
      out[idx + 2] = v;
      out[idx + 3] = 255;
    }
  }
  return { width: imageData.width, height: imageData.height, data: out };
}

function rgbaToPng(imageData, outPath) {
  const tmpRaw = path.join('/tmp', `cvh-${process.pid}-${Math.random().toString(36).slice(2)}.rgba`);
  fs.writeFileSync(tmpRaw, Buffer.from(imageData.data));
  run('magick', ['-size', `${imageData.width}x${imageData.height}`, '-depth', '8', `rgba:${tmpRaw}`, outPath]);
  fs.unlinkSync(tmpRaw);
}

function drawPoint(rgba, width, height, x, y, color, size = 1) {
  for (let dy = -size; dy <= size; dy++) {
    for (let dx = -size; dx <= size; dx++) {
      const xx = Math.round(x + dx);
      const yy = Math.round(y + dy);
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
      const idx = (yy * width + xx) * 4;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = 255;
    }
  }
}

function drawEllipse(rgba, width, height, mask, color) {
  for (let t = 0; t < 360; t += 1) {
    const rad = (t * Math.PI) / 180;
    const x = mask.cx + Math.cos(rad) * mask.rx;
    const y = mask.cy + Math.sin(rad) * mask.ry;
    drawPoint(rgba, width, height, x, y, color, 1);
  }
}

function makeOverlayImage(analyzed, mask, shapeDebug) {
  const rgba = new Uint8ClampedArray(analyzed.data);
  drawEllipse(rgba, analyzed.width, analyzed.height, mask, [34, 197, 94]);

  if (shapeDebug.boundingBox) {
    const bb = shapeDebug.boundingBox;
    for (let x = bb.minX; x <= bb.maxX; x++) {
      drawPoint(rgba, analyzed.width, analyzed.height, x, bb.minY, [239, 68, 68]);
      drawPoint(rgba, analyzed.width, analyzed.height, x, bb.maxY, [239, 68, 68]);
    }
    for (let y = bb.minY; y <= bb.maxY; y++) {
      drawPoint(rgba, analyzed.width, analyzed.height, bb.minX, y, [239, 68, 68]);
      drawPoint(rgba, analyzed.width, analyzed.height, bb.maxX, y, [239, 68, 68]);
    }
  }

  const step = Math.max(1, Math.floor(shapeDebug.contour.length / 320));
  for (let i = 0; i < shapeDebug.contour.length; i += step) {
    const p = shapeDebug.contour[i];
    drawPoint(rgba, analyzed.width, analyzed.height, p.x, p.y, [250, 204, 21], 0);
  }
  return { width: analyzed.width, height: analyzed.height, data: rgba };
}

function makeMaskedImage(analyzed, mask) {
  const rgba = new Uint8ClampedArray(analyzed.data.length);
  for (let y = 0; y < analyzed.height; y++) {
    for (let x = 0; x < analyzed.width; x++) {
      const i = (y * analyzed.width + x) * 4;
      const factor = isInsideMask(x, y, mask) ? 1 : 0.15;
      rgba[i] = clampByte(analyzed.data[i] * factor);
      rgba[i + 1] = clampByte(analyzed.data[i + 1] * factor);
      rgba[i + 2] = clampByte(analyzed.data[i + 2] * factor);
      rgba[i + 3] = 255;
    }
  }
  return { width: analyzed.width, height: analyzed.height, data: rgba };
}

function makeColorMapImage(colorDebug) {
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
    const label = DAILYMED_COLOR_LABELS[idx] || 'GRAY';
    const [r, g, b] = COLOR_DEBUG_PALETTE[label] || COLOR_DEBUG_PALETTE.GRAY;
    rgba[j] = r;
    rgba[j + 1] = g;
    rgba[j + 2] = b;
    rgba[j + 3] = 255;
  }
  return { width: colorDebug.width, height: colorDebug.height, data: rgba };
}

function makeEdgeImage(shapeDebug, width, height) {
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
  return { width, height, data: rgba };
}

function runTesseractOnImage(imageData, outDir, prefix) {
  const pngPath = path.join(outDir, `${prefix}.png`);
  rgbaToPng(imageData, pngPath);

  const text = run('tesseract', [
    pngPath,
    'stdout',
    '--psm',
    '7',
    '-c',
    'tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
  ]).trim();

  return {
    path: pngPath,
    rawText: text,
    normalized: normalizeImprint(text),
  };
}

function evaluateCandidate(baseImage, adjustments, outlineOptions) {
  const analyzed = preprocessImageData(baseImage, adjustments);
  const outline = detectPillOutline(analyzed, undefined, outlineOptions);
  const mask = outline.mask;
  const colorDebug = extractColorDebug(analyzed, mask);
  const shapeDebug = detectShapeDebug(analyzed, mask);

  const areaFraction = maskAreaFraction(mask, analyzed.width, analyzed.height);
  const primary = colorDebug.result.primary;
  const secondary = colorDebug.result.secondary;
  const shape = shapeDebug.result.label;

  let score = 0;
  score += outline.confidence * 2.0;
  score += colorDebug.result.confidence * 1.5;
  score += shapeDebug.result.confidence * 1.2;

  if (primary === 'WHITE') score += 2.5;
  if (secondary === null) score += 0.6;
  if (shape === 'ROUND') score += 2.0;
  if (shape === 'OVAL') score += 0.5;

  if (areaFraction < 0.01) score -= 2.5;
  if (areaFraction > 0.35) score -= 2.5;
  if (shapeDebug.contour.length < 40) score -= 1.5;

  return {
    score,
    analyzed,
    outline,
    colorDebug,
    shapeDebug,
    adjustments,
    outlineOptions,
    areaFraction,
  };
}

function main() {
  const inputPath = process.argv[2] || path.join(process.cwd(), 'acetaminophen-325-mg-44-104-4411.jpg');
  const outDir = process.argv[3] || path.join(process.cwd(), 'artifacts', 'local-cv');
  fs.mkdirSync(outDir, { recursive: true });

  const baseImage = loadRgba(inputPath, 640);

  const brightnesses = [-30, -10, 0, 10, 24];
  const contrasts = [0.85, 1.0, 1.15, 1.3];
  const saturations = [0.5, 0.8, 1.0, 1.2];

  const edgeMeanMultipliers = [0.85, 1.0, 1.15, 1.3];
  const edgeMaxRatios = [0.07, 0.1, 0.12, 0.16];
  const radialContrastWeights = [0.3, 0.55, 0.8, 1.1];
  const radialOutwardWeights = [1.5, 3.5, 5, 7];
  const minComponentAreas = [60, 100, 140, 220];
  const minContourPoints = [12, 20, 28, 40];
  const minAreaFractions = [0.002, 0.005, 0.008, 0.015];
  const maxAreaFractions = [0.18, 0.24, 0.3, 0.36];

  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const candidates = [];
  const rounds = 180;
  for (let i = 0; i < rounds; i++) {
    const adjustments = {
      brightness: pick(brightnesses),
      contrast: pick(contrasts),
      saturation: pick(saturations),
    };
    const minAreaFraction = pick(minAreaFractions);
    const preferredMaxAreaFraction = Math.max(minAreaFraction, pick(maxAreaFractions));
    const outlineOptions = {
      ...DEFAULT_OUTLINE_DETECTION_OPTIONS,
      edgeFloorMeanMultiplier: pick(edgeMeanMultipliers),
      edgeFloorMaxRatio: pick(edgeMaxRatios),
      radialContrastWeight: pick(radialContrastWeights),
      radialOutwardBiasWeight: pick(radialOutwardWeights),
      minComponentArea: pick(minComponentAreas),
      minContourPoints: pick(minContourPoints),
      minAreaFraction,
      preferredMaxAreaFraction,
    };
    const evalResult = evaluateCandidate(baseImage, adjustments, outlineOptions);
    candidates.push(evalResult);
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 10);

  const targetImprint = '44104';
  let best = null;
  for (let i = 0; i < top.length; i++) {
    const c = top[i];
    const ocrInput = makeOcrImage(c.analyzed, c.outline.mask);
    const ocr = runTesseractOnImage(ocrInput, outDir, `ocr-input-${i + 1}`);
    const imprintScore = similarity(ocr.normalized, targetImprint);
    const finalScore = c.score + imprintScore * 2.2;
    if (!best || finalScore > best.finalScore) {
      best = { ...c, ocr, imprintScore, finalScore, ocrInput };
    }
  }

  if (!best) throw new Error('No candidate produced');

  const overlay = makeOverlayImage(best.analyzed, best.outline.mask, best.shapeDebug);
  const masked = makeMaskedImage(best.analyzed, best.outline.mask);
  const colorMap = makeColorMapImage(best.colorDebug);
  const edges = makeEdgeImage(best.shapeDebug, best.analyzed.width, best.analyzed.height);

  rgbaToPng(baseImage, path.join(outDir, '01-original.png'));
  rgbaToPng(best.analyzed, path.join(outDir, '02-analyzed.png'));
  rgbaToPng(overlay, path.join(outDir, '03-outline-overlay.png'));
  rgbaToPng(masked, path.join(outDir, '04-pill-mask-applied.png'));
  rgbaToPng(colorMap, path.join(outDir, '05-color-map.png'));
  rgbaToPng(edges, path.join(outDir, '06-edge-map.png'));
  rgbaToPng(best.ocrInput, path.join(outDir, '07-ocr-input-best.png'));

  const report = {
    inputPath,
    imageSize: { width: baseImage.width, height: baseImage.height },
    finalScore: best.finalScore,
    outline: {
      confidence: best.outline.confidence,
      method: best.outline.method,
      usedFallback: best.outline.usedFallback,
      mask: best.outline.mask,
      areaFraction: best.areaFraction,
      contourPoints: best.shapeDebug.contour.length,
    },
    color: {
      primary: best.colorDebug.result.primary,
      secondary: best.colorDebug.result.secondary,
      confidence: best.colorDebug.result.confidence,
      top: best.colorDebug.top,
      bottom: best.colorDebug.bottom,
    },
    shape: best.shapeDebug.result,
    imprint: {
      rawText: best.ocr.rawText,
      normalized: best.ocr.normalized,
      target: targetImprint,
      similarity: best.imprintScore,
    },
    adjustments: best.adjustments,
    outlineOptions: best.outlineOptions,
    artifacts: [
      '01-original.png',
      '02-analyzed.png',
      '03-outline-overlay.png',
      '04-pill-mask-applied.png',
      '05-color-map.png',
      '06-edge-map.png',
      '07-ocr-input-best.png',
      path.basename(best.ocr.path),
    ],
  };

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(outDir, 'report.txt'),
    [
      `Input: ${inputPath}`,
      `Outline: method=${report.outline.method}, confidence=${(report.outline.confidence * 100).toFixed(1)}%, area=${(report.outline.areaFraction * 100).toFixed(2)}%`,
      `Color: primary=${report.color.primary}, secondary=${report.color.secondary ?? 'null'}, confidence=${(report.color.confidence * 100).toFixed(1)}%`,
      `Shape: ${report.shape.label}, confidence=${(report.shape.confidence * 100).toFixed(1)}%, AR=${report.shape.aspectRatio.toFixed(3)}, solidity=${report.shape.solidity.toFixed(3)}`,
      `Imprint OCR: raw="${report.imprint.rawText}", normalized="${report.imprint.normalized}", target="${report.imprint.target}", similarity=${(report.imprint.similarity * 100).toFixed(1)}%`,
      '',
      `Artifacts: ${report.artifacts.join(', ')}`,
    ].join('\n'),
  );

  console.log(JSON.stringify(report, null, 2));
}

main();
