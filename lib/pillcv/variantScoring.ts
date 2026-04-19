import { scoreMatch } from '@/lib/cv/scorer';
import type { PrescriptionAttributes } from '@/lib/dailymed/types';
import type { ScoreVariantsInput, ScoreVariantsOutput, VariantOption, VariantSelectionMode } from '@/lib/pillcv/types';

function buildPrimaryVariant(
  prescriptionMeta: NonNullable<ScoreVariantsInput['prescriptionMeta']>,
): VariantOption {
  return {
    key: `primary:${prescriptionMeta.setid}:${prescriptionMeta.ndc}`,
    label: `${prescriptionMeta.productName || prescriptionMeta.title} (${prescriptionMeta.ndc})`,
    attrs: {
      color: prescriptionMeta.color,
      shape: prescriptionMeta.shape,
      imprint: prescriptionMeta.imprint,
      sizeMm: prescriptionMeta.sizeMm,
      scoreMarkings: prescriptionMeta.scoreMarkings,
      dosageForm: prescriptionMeta.dosageForm,
    },
  };
}

function buildAlternativeVariants(
  alternatives: NonNullable<NonNullable<ScoreVariantsInput['prescriptionMeta']>['alternatives']>,
): VariantOption[] {
  return alternatives.map((alt, index) => ({
    key: `alt:${alt.setid}:${alt.ndc}:${index}`,
    label: `${alt.productName || alt.title} (${alt.ndc})`,
    attrs: alt,
  }));
}

export function buildVariantOptions(
  prescription: PrescriptionAttributes | null,
  prescriptionMeta?: ScoreVariantsInput['prescriptionMeta'],
): VariantOption[] {
  if (prescriptionMeta) {
    return [
      buildPrimaryVariant(prescriptionMeta),
      ...buildAlternativeVariants(prescriptionMeta.alternatives ?? []),
    ];
  }

  if (prescription) {
    return [
      {
        key: 'loaded:single',
        label: 'Loaded prescription',
        attrs: prescription,
      },
    ];
  }

  return [];
}

export function scoreAgainstPrescriptionVariants(input: ScoreVariantsInput): ScoreVariantsOutput {
  const options = buildVariantOptions(input.prescription, input.prescriptionMeta);
  const selectedKey = input.variantSelectionKey ?? 'auto';

  if (options.length === 0) {
    if (!input.prescription) {
      throw new Error('Cannot score variants without a prescription.');
    }
    return {
      result: scoreMatch(input.colorResult, input.shapeResult, input.imprintResult, input.prescription),
      label: 'Loaded prescription',
      mode: 'auto',
      options: [],
      selectedKey: 'auto',
    };
  }

  const forced = selectedKey !== 'auto' ? options.filter((option) => option.key === selectedKey) : [];
  const activeOptions = forced.length > 0 ? forced : options;
  const mode: VariantSelectionMode = forced.length > 0 ? 'manual' : 'auto';

  let best = {
    result: scoreMatch(input.colorResult, input.shapeResult, input.imprintResult, activeOptions[0].attrs),
    label: activeOptions[0].label,
  };

  for (let i = 1; i < activeOptions.length; i++) {
    const candidate = activeOptions[i];
    const evaluated = scoreMatch(input.colorResult, input.shapeResult, input.imprintResult, candidate.attrs);
    if (
      evaluated.overallScore > best.result.overallScore ||
      (evaluated.overallScore === best.result.overallScore &&
        (evaluated.matchBreakdown.shape > best.result.matchBreakdown.shape ||
          (evaluated.matchBreakdown.shape === best.result.matchBreakdown.shape &&
            evaluated.matchBreakdown.imprint > best.result.matchBreakdown.imprint) ||
          (best.result.hardStop && !evaluated.hardStop)))
    ) {
      best = { result: evaluated, label: candidate.label };
    }
  }

  return {
    ...best,
    mode,
    options,
    selectedKey,
  };
}
