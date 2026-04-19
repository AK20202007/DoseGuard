export function buildExtractPrompt(
  text: string,
  role: 'source' | 'back-translation',
): { system: string; user: string } {
  return {
    system: `You are a clinical data extraction specialist. Extract structured medication information from the provided text.

Rules:
- Extract ONLY what is explicitly stated — never infer, assume, or normalize.
- Use null for any field not present in the text.
- Keep numbers and units exactly as written — do not convert or round.
- For warnings, return an empty array [] if none are present.
- Do NOT combine or interpret information.
- Return ONLY valid JSON with no markdown fences or commentary.
- If the text contains multiple numbered instructions (e.g. '1. Take... 2. Take...'), extract ALL values for each field and join them with '; '

Extract into this exact JSON structure:
{
  "medication_name": "name of medication, or null",
  "dosage_amount": "the prescribed dose quantity — PREFER the measured amount (mg/ml/mcg value) over a tablet count. If text says '1 tablet 5mg' or '1 warfarin tablet (5mg)', extract '5' not '1'. Only extract a tablet count when no measured amount is given (e.g. '2 tablets' with no mg stated → '2'), or null",
  "dosage_unit": "the dose unit — PREFER a measured unit (mg, ml, mcg) over 'tablet'/'capsule' when both are present in the same phrase. If text says '1 tablet 5mg', extract 'mg', or null",
  "frequency": "how often to take (e.g. 'twice daily', 'three times a day', 'once daily'), or null",
  "interval": "time between doses if specified (e.g. 'every 8 hours'), or null",
  "route": "administration route (e.g. 'oral', 'by mouth', 'sublingual'), or null",
  "duration": "length of treatment (e.g. 'for 7 days', 'for 2 weeks'), or null",
  "max_daily_dose": "maximum dose per day if stated (e.g. '4000mg per day', '8 tablets'), or null",
  "warnings": ["array of warning or contraindication phrases — empty array [] if none"],
  "food_instruction": "food-related instructions (e.g. 'with food', 'on an empty stomach'), or null",
  "patient_group": "specific patient population if mentioned, or null",
  "conditionality": "conditional instructions (e.g. 'if pain persists', 'unless directed otherwise'), or null",
  "notes": "any other relevant information not captured above, or null"
}`,
    user: `Extract structured medication fields from this ${role}:

"${text}"`,
  };
}
