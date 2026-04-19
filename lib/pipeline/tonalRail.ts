import {
  YORUBA_NUMERALS,
  ENGLISH_FREQ_MAP,
  ENGLISH_NUMBER_WORDS,
  getNumeralByStripped,
  getNumeralByDigit,
  stripDiacritics,
} from '@/data/yoruba-numerals';
import type { TonalIssue, TonalRailResult } from '@/lib/types';

const HF_MODEL = 'Davlan/mT5_base_yoruba_adr';
const HF_API = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

// Warm-up call — fire and forget at pipeline start so model is loaded by the time we need it
export function warmMT5(): void {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) return;
  fetch(HF_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: 'mu oogun' }),
  }).catch(() => {});
}

async function callMT5(strippedText: string): Promise<string | null> {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(HF_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: strippedText }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) return null;
    const data = await res.json();

    // HF text2text-generation returns [{ generated_text: "..." }]
    if (Array.isArray(data) && data[0]?.generated_text) {
      return data[0].generated_text as string;
    }
    return null;
  } catch {
    return null;
  }
}

// Patterns where numbers stay as Arabic numerals in Yoruba — do NOT check as word forms
const ARABIC_NUMERAL_PATTERNS = [
  /every\s+\d+\s+hours?/,
  /every\s+\d+\s+minutes?/,
  /\d+[\s-]?hours?/,
  /\d+[\s-]?minutes?/,
  /\d+\s*mg\b/,
  /\d+\s*ml\b/,
  /\d+\s*mcg\b/,
  /\d+\s*g\b/,
  /in\s+\d+\s+hours?/,
  /\d+[\s-]hour/,
  /24\s*hours?/,
];

// Only check digits that appear in contexts where Yoruba uses word forms:
// frequency (once/twice/N times), dose count (N tablets/doses/drops), duration in days/weeks
const WORD_FORM_PATTERNS = [
  /\b(\d+)\s+(?:tablets?|capsules?|drops?|doses?|pills?)\b/,
  /\b(\d+)\s+(?:days?|weeks?)\b/,
  /\btake\s+(\d+)\b/,
  /\bfor\s+(\d+)\s+days?\b/,
  /\b(\d+)\s+times?\s+(?:a\s+)?(?:day|daily|week)\b/,
];

// Extract expected digits from English source — only those that will appear as Yoruba word forms
function extractExpectedDigits(sourceText: string): number[] {
  const digits: Set<number> = new Set();
  const lower = sourceText.toLowerCase();

  // Remove substrings that will stay as Arabic numerals in Yoruba
  let filtered = lower;
  for (const pattern of ARABIC_NUMERAL_PATTERNS) {
    filtered = filtered.replace(pattern, ' ');
  }

  // Extract digits only from word-form contexts
  for (const pattern of WORD_FORM_PATTERNS) {
    const m = lower.match(new RegExp(pattern.source, 'g'));
    if (m) {
      for (const match of m) {
        const numMatch = match.match(/\d+/);
        if (numMatch) {
          const n = parseInt(numMatch[0], 10);
          if (n >= 1 && n <= 10) digits.add(n);
        }
      }
    }
  }

  // Match English frequency words (once, twice, three times…)
  for (const [phrase, digit] of Object.entries(ENGLISH_FREQ_MAP)) {
    if (filtered.includes(phrase)) digits.add(digit);
  }

  // Match English number words only in the filtered (Arabic-removed) text
  for (const [word, digit] of Object.entries(ENGLISH_NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(filtered)) digits.add(digit);
  }

  return Array.from(digits);
}

// Tokenize Yoruba text into words, stripping punctuation
function tokenize(text: string): string[] {
  return text
    .replace(/[.,;:!?()"""'']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Find a Yoruba numeral token in the translation (stripped match)
function findNumeralToken(
  tokens: string[],
  digit: number,
): { token: string; stripped: string } | null {
  const numeral = getNumeralByDigit(digit);
  if (!numeral) return null;

  const allForms = [numeral.canonical, numeral.frequencyForm, ...numeral.variants];
  const strippedForms = new Set(allForms.map(f => stripDiacritics(f)));

  for (const token of tokens) {
    const stripped = stripDiacritics(token);
    if (strippedForms.has(stripped)) return { token, stripped };
  }
  return null;
}

// Check if the digit appears as an Arabic numeral in the translation
// If so, the translator chose Arabic encoding — no tonal issue to check
function foundAsArabic(tokens: string[], digit: number): boolean {
  const digitStr = String(digit);
  return tokens.some(t => t === digitStr || t.startsWith(digitStr + ',') || t.startsWith(digitStr + '.'));
}

// Compare two diacritized forms — returns true if they match after NFC normalization
function formsMatch(a: string, b: string): boolean {
  return a.normalize('NFC') === b.normalize('NFC');
}

export async function runTonalRail(
  sourceText: string,
  yorubaTranslation: string,
): Promise<TonalRailResult> {
  const expectedDigits = extractExpectedDigits(sourceText);

  if (expectedDigits.length === 0) {
    return {
      ran: true,
      mT5Available: false,
      issues: [],
      checkedNumerals: [],
      numeralRows: [],
      passed: true,
      summary: 'No numerals detected in source — tonal rail skipped.',
    };
  }

  const tokens = tokenize(yorubaTranslation);
  const strippedTranslation = stripDiacritics(yorubaTranslation);

  // Call mT5 on stripped translation to get independently diacritized version
  const mT5Output = await callMT5(strippedTranslation);
  const mT5Available = mT5Output !== null;
  const mT5Tokens = mT5Output ? tokenize(mT5Output) : [];

  const issues: TonalIssue[] = [];
  const checkedNumerals: number[] = [];
  const numeralRows: import('@/lib/types').TonalNumeralRow[] = [];

  for (const digit of expectedDigits) {
    const numeral = getNumeralByDigit(digit);
    if (!numeral) continue;

    checkedNumerals.push(digit);

    const found = findNumeralToken(tokens, digit);

    if (!found) {
      if (foundAsArabic(tokens, digit)) {
        numeralRows.push({
          digit,
          claudeForm: String(digit),
          canonicalForm: numeral.canonical,
          encoding: 'arabic',
          status: 'pass',
        });
        continue;
      }
      const issue: TonalIssue = {
        expectedDigit: digit,
        foundStripped: '',
        claudeForm: '',
        mT5Form: null,
        canonicalForm: numeral.canonical,
        confusableWith: numeral.confusableWith,
        confusableCanonical: numeral.confusableCanonical,
        medicalRisk: numeral.medicalRisk,
        issueType: 'missing_numeral',
        explanation: `Expected numeral for ${digit} (${numeral.canonical}) not found in Yoruba translation.`,
      };
      issues.push(issue);
      numeralRows.push({ digit, claudeForm: '—', canonicalForm: numeral.canonical, encoding: 'yoruba', status: 'fail', issue });
      continue;
    }

    const claudeForm = found.token;
    const claudeStripped = found.stripped;
    const allAccepted = [numeral.canonical, numeral.frequencyForm, ...numeral.variants];
    const claudeOk = allAccepted.some(v => formsMatch(v, claudeForm));

    let mT5Form: string | null = null;
    if (mT5Available) {
      const mT5Found = findNumeralToken(mT5Tokens, digit);
      mT5Form = mT5Found?.token ?? null;
    }
    const mT5Ok = mT5Form ? allAccepted.some(v => formsMatch(v, mT5Form!)) : null;

    if (!claudeOk) {
      const otherNumeral = getNumeralByStripped(claudeStripped);
      const issue: TonalIssue = otherNumeral && otherNumeral.digit !== digit
        ? {
            expectedDigit: digit, foundStripped: claudeStripped, claudeForm, mT5Form,
            canonicalForm: numeral.canonical, confusableWith: numeral.confusableWith,
            confusableCanonical: numeral.confusableCanonical, medicalRisk: numeral.medicalRisk,
            issueType: 'wrong_numeral',
            explanation: `Claude wrote "${claudeForm}" which matches ${otherNumeral.digit} (${otherNumeral.canonical}) instead of ${digit} (${numeral.canonical}). Dosage confusion risk.`,
          }
        : {
            expectedDigit: digit, foundStripped: claudeStripped, claudeForm, mT5Form,
            canonicalForm: numeral.canonical, confusableWith: numeral.confusableWith,
            confusableCanonical: numeral.confusableCanonical, medicalRisk: numeral.medicalRisk,
            issueType: 'diacritic_mismatch',
            explanation: `Claude wrote "${claudeForm}" but canonical form is "${numeral.canonical}". Tonal diacritics differ — meaning may be ambiguous.`,
          };
      issues.push(issue);
      numeralRows.push({ digit, claudeForm, canonicalForm: numeral.canonical, encoding: 'yoruba', status: 'fail', issue });
    } else if (mT5Available && mT5Ok === false && mT5Form) {
      const issue: TonalIssue = {
        expectedDigit: digit, foundStripped: claudeStripped, claudeForm, mT5Form,
        canonicalForm: numeral.canonical, confusableWith: numeral.confusableWith,
        confusableCanonical: numeral.confusableCanonical, medicalRisk: numeral.medicalRisk,
        issueType: 'diacritic_mismatch',
        explanation: `Claude wrote "${claudeForm}" (accepted), but mT5 ADR produced "${mT5Form}". Independent model disagreement — review recommended.`,
      };
      issues.push(issue);
      numeralRows.push({ digit, claudeForm, canonicalForm: numeral.canonical, encoding: 'yoruba', status: 'fail', issue });
    } else {
      numeralRows.push({ digit, claudeForm, canonicalForm: numeral.canonical, encoding: 'yoruba', status: 'pass' });
    }
  }

  const criticalIssues = issues.filter(i => i.medicalRisk === 'critical');
  const passed = issues.length === 0;

  let summary: string;
  if (passed) {
    summary = `All ${checkedNumerals.length} numeral(s) verified.${mT5Available ? ' mT5 ADR confirmed.' : ' mT5 unavailable (cold start or missing key).'}`;
  } else if (criticalIssues.length > 0) {
    summary = `${criticalIssues.length} critical tonal issue(s) detected in ${checkedNumerals.length} numeral(s). Human review required.`;
  } else {
    summary = `${issues.length} tonal issue(s) detected in ${checkedNumerals.length} numeral(s). Use with caution.`;
  }

  return {
    ran: true,
    mT5Available,
    issues,
    checkedNumerals,
    numeralRows,
    passed,
    summary,
  };
}
