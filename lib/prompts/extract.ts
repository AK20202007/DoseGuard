export function buildExtractPrompt(
  text: string,
  role: 'source' | 'back-translation',
): { system: string; user: string } {
  return {
    system: `You are a clinical data extraction specialist. Extract structured medication information from the provided text.

CRITICAL RULES:
- Extract ONLY what is explicitly stated — never infer, assume, or normalize.
- Use null for any field not present in the text.
- Keep numbers and units exactly as written — do not convert or round.
- For warnings, return an empty array [] if none are present.
- Return ONLY valid JSON with no markdown fences or commentary.
- If the text contains multiple numbered instructions (e.g. "1. Take... 2. Take..."), extract ALL values for each field and join them with "; ". For example if three frequencies appear, return "once daily; twice daily; three times daily" as a single string.

DOSAGE FIELDS — read carefully:
- "dosage_amount": The numeric drug concentration ONLY — the mg/g/ml/mcg number (e.g. "500" for 500mg, "220" for 220mg, "10" for 10mg). This is NEVER the tablet count or capsule count.
- "dosage_unit": The unit of drug concentration ONLY — must be one of: mg, g, ml, mcg, IU, mmol, mEq, units. NEVER use "tablet", "capsule", "drop", "teaspoon" — those are dosage forms, not units.
- If text says "take 1 tablet of 220mg" → dosage_amount="220", dosage_unit="mg". The "1 tablet" is NOT the dosage amount.
- If text says "take 500mg amoxicillin" → dosage_amount="500", dosage_unit="mg".
- If text says "1000mg Vitamin C" → dosage_amount="1000", dosage_unit="mg".

FREQUENCY vs INTERVAL:
- "frequency": How many times per day/week (e.g. "once daily", "twice daily", "three times daily", "every 6 hours").
- "interval": Only use if the text specifies a time gap between doses (e.g. "every 8 hours", "every 6 hours"). If "every X hours" is given, put it in BOTH frequency AND interval.

Extract into this exact JSON structure:
{
  "medication_name": "name of medication, or null",
  "dosage_amount": "numeric drug concentration only — NEVER tablet count (e.g. '500', '220', '10'), or null",
  "dosage_unit": "concentration unit only: mg/g/ml/mcg/IU — NEVER tablet/capsule/drop, or null",
  "frequency": "how often to take (e.g. 'once daily', 'twice daily', 'three times daily', 'every 6 hours'), or null",
  "interval": "time gap between doses if explicitly stated (e.g. 'every 6 hours', 'every 8 hours'), or null",
  "route": "administration route if stated (e.g. 'by mouth', 'oral', 'with water'), or null",
  "duration": "length of treatment (e.g. 'for 7 days', 'for 10 days'), or null",
  "max_daily_dose": "ONLY fill this if the instruction has a SEPARATE, EXPLICIT upper limit statement such as 'do not exceed 4000mg per day', 'maximum 8 tablets in 24 hours', 'not more than 4g daily'. Do NOT calculate or infer it from dose × frequency — if the text only says '10mg once daily', max_daily_dose is null. If the max is implied by frequency alone (e.g. 'not more than once daily'), put that in frequency, not here. Only extract a distinct explicit cap, or null",
  "warnings": ["array of warning or contraindication phrases — empty array [] if none"],
  "food_instruction": "food-related AND preparation instructions — includes: 'with food', 'on an empty stomach', 'dissolved in X of water', 'with a full glass of water', 'mixed with water', 'with or without food'. Capture ANY instruction about how to take relative to food OR water preparation, or null",
  "patient_group": "specific patient population if mentioned, or null",
  "conditionality": "conditional instructions (e.g. 'as needed', 'if pain persists', 'unless directed'), or null",
  "notes": "any other relevant information not captured above, or null"
}`,
    user: `Extract structured medication fields from this ${role}:

"${text}"`,
  };
}
