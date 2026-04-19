import type { MedicationFields } from '@/lib/types';
import { getClient } from '@/lib/claude';
import { buildExtractPrompt } from '@/lib/prompts/extract';

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1];
  const bare = text.match(/\{[\s\S]*\}/);
  return bare ? bare[0] : text;
}

export function nullMedicationFields(): MedicationFields {
  return {
    medication_name: null,
    dosage_amount: null,
    dosage_unit: null,
    frequency: null,
    interval: null,
    route: null,
    duration: null,
    max_daily_dose: null,
    warnings: [],
    food_instruction: null,
    patient_group: null,
    conditionality: null,
    notes: null,
  };
}

export async function extractMedicationFields(
  text: string,
  role: 'source' | 'back-translation',
): Promise<MedicationFields> {
  if (!text) return nullMedicationFields();
  try {
    const client = getClient();
    const { system, user } = buildExtractPrompt(text, role);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(extractJSON(raw));
    return {
      medication_name: parsed.medication_name ?? null,
      dosage_amount: parsed.dosage_amount ?? null,
      dosage_unit: parsed.dosage_unit ?? null,
      frequency: parsed.frequency ?? null,
      interval: parsed.interval ?? null,
      route: parsed.route ?? null,
      duration: parsed.duration ?? null,
      max_daily_dose: parsed.max_daily_dose ?? null,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      food_instruction: parsed.food_instruction ?? null,
      patient_group: parsed.patient_group ?? null,
      conditionality: parsed.conditionality ?? null,
      notes: parsed.notes ?? null,
    };
  } catch {
    return nullMedicationFields();
  }
}
