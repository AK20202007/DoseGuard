# Pill CV Integration Module

This folder exposes a reusable integration surface so a host app can use the CV/lookup logic without depending on `components/demo/DemoApp.tsx`.

## Public entrypoint

Import from:

```ts
import {
  analyzePillCandidate,
  buildVariantOptions,
  scoreAgainstPrescriptionVariants,
  shouldRunVlmBackup,
  fetchPrescriptionByDrugName,
  requestVlmBackup,
} from '@/lib/pillcv';
```

## Typical host flow

1. Resolve DailyMed attributes:

```ts
const prescriptionMeta = await fetchPrescriptionByDrugName('acetaminophen');
```

2. Detect a pill candidate with `detectPillCandidates(...)`, then analyze:

```ts
const analysis = await analyzePillCandidate({
  analyzedImage,
  outline: candidates[selectedIndex],
  prescription: {
    color: prescriptionMeta.color,
    shape: prescriptionMeta.shape,
    imprint: prescriptionMeta.imprint,
  },
  prescriptionMeta,
  variantSelectionKey: 'auto', // or a key from buildVariantOptions(...)
});
```

3. Gate backup verification:

```ts
const runBackup = shouldRunVlmBackup(
  analysis.score.result,
  analysis.colorDebug.result.confidence,
  analysis.shapeDebug.result.confidence,
  analysis.imprintResult.text,
  analysis.imprintResult.confidence,
  Boolean(prescriptionMeta.imprint),
);
```

4. Optional VLM backup call:

```ts
const backup = await requestVlmBackup({
  imageDataUrl,
  prescription: {
    color: prescriptionMeta.color,
    shape: prescriptionMeta.shape,
    imprint: prescriptionMeta.imprint,
  },
  cv: {
    overallScore: analysis.score.result.overallScore,
    color: analysis.colorDebug.result,
    shape: {
      label: analysis.shapeDebug.result.label,
      confidence: analysis.shapeDebug.result.confidence,
    },
    imprint: analysis.imprintResult,
  },
});
```
