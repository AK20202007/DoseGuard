// Layer 4 — Yoruba tonal diacritic integrity check.
// Scans the Yoruba translation for bare (undiacritized) forms of known high-risk words.
// A bare numeral like "meta" (three) instead of "mẹ́ta" is not just a typo — it changes meaning
// and could be misread as "mẹ́fà" (six), creating a dangerous dose confusion.

import { DIACRITIC_CHECKLIST, type DiacriticEntry } from '@/data/yoruba-diacritic-checklist';

export type DiacriticIssue = {
  bare: string;
  canonical: string;
  meaning: string;
  confusableWith?: string;
  confusableMeaning?: string;
  severity: 'high' | 'medium';
  category: DiacriticEntry['category'];
  context: string;
};

function extractContext(text: string, matchIndex: number, length: number): string {
  const start = Math.max(0, matchIndex - 20);
  const end = Math.min(text.length, matchIndex + length + 20);
  const snippet = text.slice(start, end);
  return start > 0 ? `…${snippet}` : snippet;
}

export function validateDiacritics(yorubaText: string): DiacriticIssue[] {
  if (!yorubaText) return [];

  const issues: DiacriticIssue[] = [];
  const lowerText = yorubaText.toLowerCase();

  for (const entry of DIACRITIC_CHECKLIST) {
    // Require whole-word match to avoid "meta" matching inside "metabolism"
    const bareRegex = new RegExp(`(?<![\\w\u0300-\u036f])${entry.bare}(?![\\w\u0300-\u036f])`, 'i');
    const bareMatch = bareRegex.exec(yorubaText);
    if (!bareMatch) continue;

    // If the canonical diacritized form is already present, the translator got it right
    const canonicalRegex = new RegExp(`(?<![\\w\u0300-\u036f])${entry.canonical}(?![\\w\u0300-\u036f])`, 'i');
    if (canonicalRegex.test(yorubaText)) continue;

    issues.push({
      bare: entry.bare,
      canonical: entry.canonical,
      meaning: entry.meaning,
      confusableWith: entry.confusableWith,
      confusableMeaning: entry.confusableMeaning,
      severity: entry.severity,
      category: entry.category,
      context: extractContext(yorubaText, bareMatch.index, entry.bare.length),
    });
  }

  return issues;
}
