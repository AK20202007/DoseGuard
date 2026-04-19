// Layer 3 — Dynamic few-shot example selection.
// Given the input instruction, returns the k examples from the MENYO corpus
// that are most likely to help Claude produce a higher-quality translation.
//
// Strategy: keyword overlap + tag boosting.
//   1. Tokenise the instruction into meaningful words.
//   2. Score each example by how many of those words appear in its English text.
//   3. Boost examples whose tags match detected instruction categories.
//   4. Always include at least 2 core frequency/dosing examples so Claude always
//      sees correctly diacritized Yoruba number and timing words.

import { MENYO_EXAMPLES, type MenyoExample } from '@/data/menyo-examples';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with',
  'is', 'are', 'was', 'be', 'this', 'that', 'it', 'as', 'at', 'by',
  'on', 'if', 'you', 'your', 'my', 'not', 'no', 'do', 'will', 'may',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function detectTags(instruction: string): Set<string> {
  const lower = instruction.toLowerCase();
  const tags = new Set<string>();

  if (/\b(take|swallow|drink|administer)\b/.test(lower)) tags.add('instruction');
  if (/\b(daily|twice|three times|once|every \d+|times? a day|lẹ́ẹ̀)\b/.test(lower)) tags.add('frequency');
  if (/\b(morning|evening|night|before|after|bedtime)\b/.test(lower)) tags.add('timing');
  if (/\b(do not|avoid|stop|never|warning|caution)\b/.test(lower)) {
    tags.add('warning');
    tags.add('negation');
  }
  if (/\b(food|meal|eat|empty stomach|with water)\b/.test(lower)) tags.add('food');
  if (/\b(max|maximum|more than|exceed|limit|4000|24 hours?)\b/.test(lower)) tags.add('max-dose');
  if (/\b(seek|immediate|emergency|urgent|call)\b/.test(lower)) tags.add('emergency');
  if (/\b(mg|ml|tablet|capsule|pill|dose|dosage)\b/.test(lower)) tags.add('dosing');
  if (/\d/.test(lower)) tags.add('number');

  return tags;
}

// Minimum examples that should always appear to ground Yoruba number/timing words.
const ANCHOR_TAGS = ['frequency', 'negation', 'warning'];
const ANCHOR_COUNT = 2;

export function selectExamples(
  instruction: string,
  k = 8,
  pool: MenyoExample[] = MENYO_EXAMPLES,
): MenyoExample[] {
  const instrTokens = tokenize(instruction);
  const instrTags = detectTags(instruction);

  const scored = pool.map(ex => {
    const exTokens = tokenize(ex.en);
    const overlap = Array.from(instrTokens).filter(w => exTokens.has(w)).length;

    // Tag match bonus: +2 per matching tag
    const tagBonus = ex.tags.filter(t => instrTags.has(t)).length * 2;

    // Anchor bonus: always include at least some frequency + warning examples
    const anchorBonus = ex.tags.some(t => ANCHOR_TAGS.includes(t)) ? 1 : 0;

    return { ex, score: overlap + tagBonus + anchorBonus };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Always grab top k, but ensure we have at least ANCHOR_COUNT anchors
  const selected = scored.slice(0, k).map(s => s.ex);
  const hasAnchors = selected.filter(ex =>
    ex.tags.some(t => ANCHOR_TAGS.includes(t)),
  ).length;

  if (hasAnchors < ANCHOR_COUNT) {
    const anchors = scored
      .filter(s => s.ex.tags.some(t => ANCHOR_TAGS.includes(t)))
      .map(s => s.ex)
      .filter(ex => !selected.includes(ex))
      .slice(0, ANCHOR_COUNT - hasAnchors);
    selected.splice(selected.length - anchors.length, anchors.length, ...anchors);
  }

  return selected;
}
