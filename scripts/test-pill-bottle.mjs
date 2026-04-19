/**
 * Backtest: All 55+ pill bottle statement types + high-risk warnings
 * Tests the drift analyzer against realistic source→back field pairs
 * Every "correct" translation should yield 0 issues.
 * Every "real drift" case should yield ≥1 issues.
 */

// ─── INLINE DRIFT LOGIC (mirrors driftAnalyzer.ts exactly) ───────────────────

function normalizeForComparison(value) {
  if (value === null) return null;
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalizeFieldValue(value, field) {
  const norm = normalizeForComparison(value);
  if (norm === null) return null;

  if (field === 'frequency' || field === 'interval') {
    const freqMap = [
      [/\b(once\s*(daily|a\s*day|per\s*day|every\s*day)|one\s*time\s*(daily|a\s*day)|1\s*x?\s*(daily|a\s*day)?|qd|q\.d\.)\b/i, 'once daily'],
      [/\b(twice\s*(daily|a\s*day|per\s*day)|two\s*times\s*(daily|a\s*day)|2\s*x?\s*(daily|a\s*day)?|every\s*12\s*hours?|bid|b\.i\.d\.)\b/i, 'twice daily'],
      [/\b(three\s*times\s*(daily|a\s*day|per\s*day)|3\s*x?\s*(daily|a\s*day)?|every\s*8\s*hours?|tid|t\.i\.d\.)\b/i, 'three times daily'],
      [/\b(four\s*times\s*(daily|a\s*day|per\s*day)|4\s*x?\s*(daily|a\s*day)?|every\s*6\s*hours?|qid|q\.i\.d\.)\b/i, 'four times daily'],
      [/\b(six\s*times\s*(daily|a\s*day)|6\s*x?\s*(daily|a\s*day)?|every\s*4\s*hours?)\b/i, 'six times daily'],
      [/\btwice\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?|every\s*(\d+|twenty[\s-]*four)\s*hours?)\b/i, 'twice daily'],
      [/\b(three|3)\s*times?\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?)\b/i, 'three times daily'],
      [/\b(four|4)\s*times?\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?)\b/i, 'four times daily'],
      [/\bonce\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?|every\s*(\d+|twenty[\s-]*four)\s*hours?)\b/i, 'once daily'],
      [/\b(no\s*more\s*than\s*once|not\s*more\s*than\s*once|at\s*most\s*once|maximum\s*once|once\s*maximum)\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'once daily'],
      [/\b(no\s*more\s*than\s*twice|not\s*more\s*than\s*twice|at\s*most\s*twice)\s*(a\s*day|daily|per\s*day)?\b/i, 'twice daily'],
      [/\bevery\s*(24|twenty[\s-]*four)\s*hours?\b/i, 'once daily'],
      [/\b(at\s*bedtime|before\s*bed(time)?|at\s*night|nightly|before\s*sleep|h\.s\.|^hs$)\b/i, 'once daily'],
      [/\b(in\s*the\s*morning|every\s*morning|once\s*(in\s*the\s*)?morning|each\s*morning|once\s*at\s*night|once\s*at\s*bedtime)\b/i, 'once daily'],
      [/^(once|one\s*time|single\s*dose?)$/i, 'once'],
      [/\b(every\s*2\s*hours?|once\s*every\s*2\s*hours?)\b/i, 'every 2 hours'],
      [/\b(every\s*3\s*hours?)\b/i, 'every 3 hours'],
      [/\b(every\s*4\s*hours?)\b/i, 'every 4 hours'],
      [/\b(every\s*6\s*hours?)\b/i, 'every 6 hours'],
      [/\b(every\s*8\s*hours?)\b/i, 'every 8 hours'],
      [/\b(every\s*12\s*hours?)\b/i, 'every 12 hours'],
    ];
    for (const [p, c] of freqMap) { if (p.test(norm)) return c; }
  }

  if (field === 'max_daily_dose') {
    const maxFreqMap = [
      [/\b(no\s*more\s*than\s*once|not\s*more\s*than\s*once|at\s*most\s*once|once\s*maximum|maximum\s*once)\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'once daily'],
      [/\bonce\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?|every\s*(\d+|twenty[\s-]*four)\s*hours?|a\s*day|daily|per\s*day)\b/i, 'once daily'],
      [/\b(no\s*more\s*than\s*twice|not\s*more\s*than\s*twice|at\s*most\s*twice)\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'twice daily'],
      [/\btwice\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?|every\s*(\d+|twenty[\s-]*four)\s*hours?|a\s*day|daily|per\s*day)\b/i, 'twice daily'],
      [/\b((no|not)\s*more\s*than\s*(three|3)|at\s*most\s*(three|3))\s*times?\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'three times daily'],
      [/\b((no|not)\s*more\s*than\s*(four|4)|at\s*most\s*(four|4))\s*times?\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'four times daily'],
    ];
    for (const [p, c] of maxFreqMap) { if (p.test(norm)) return c; }
  }

  if (field === 'conditionality') {
    if (/\b(as\s*needed|when\s*needed|if\s*needed|prn|as\s*required|when\s*necessary|if\s*necessary)\b/i.test(norm)) return 'as needed';
    if (/\b(unless\s*directed|unless\s*told|unless\s*instructed)\b/i.test(norm)) return 'unless directed otherwise';
  }

  if (field === 'food_instruction') {
    if (/\b(with\s*food|with\s*meal|with\s*meals|after\s*food|after\s*eating|after\s*meal)\b/i.test(norm)) return 'with food';
    if (/\b(without\s*food|on\s*an?\s*empty\s*stomach|before\s*food|before\s*meal|before\s*eating|before\s*breakfast)\b/i.test(norm)) return 'on empty stomach';
    if (/\b(with\s*(or\s*without|without\s*or\s*with)\s*food)\b/i.test(norm)) return 'with or without food';
    if (/\b(with\s*(a\s*)?(full\s*)?(glass|cup)\s*(of\s*)?water)\b/i.test(norm)) return 'with water';
  }

  if (field === 'duration') {
    return norm.replace(/^for\s+/, '').replace(/\bdays?\b/, 'day').replace(/\bweeks?\b/, 'week');
  }

  if (field === 'dosage_unit') {
    if (/^milligrams?$/.test(norm)) return 'mg';
    if (/^micrograms?$/.test(norm)) return 'mcg';
    if (/^milliliters?$/.test(norm)) return 'ml';
    if (/^grams?$/.test(norm)) return 'g';
    if (/^tablets?$/.test(norm)) return 'tablet';
    if (/^capsules?$/.test(norm)) return 'capsule';
  }

  if (field === 'dosage_amount') {
    const numWords = { one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10' };
    for (const [w, d] of Object.entries(numWords)) { if (norm === w) return d; }
  }

  if (field === 'route') {
    if (/\b(by\s*mouth|oral(ly)?|per\s*os|p\.o\.)\b/i.test(norm)) return 'by mouth';
    if (/\b(subcut(aneous(ly)?)?|s\.c\.|subcutaneously)\b/i.test(norm)) return 'subcutaneous';
    if (/\b(intravenous(ly)?|i\.v\.)\b/i.test(norm)) return 'intravenous';
    if (/\b(intramuscular(ly)?|i\.m\.)\b/i.test(norm)) return 'intramuscular';
    if (/\b(topical(ly)?|applied\s*to\s*skin)\b/i.test(norm)) return 'topical';
    if (/\b(sublingual(ly)?|under\s*the\s*tongue)\b/i.test(norm)) return 'sublingual';
    if (/\b(rectal(ly)?|per\s*rectum|suppository)\b/i.test(norm)) return 'rectal';
  }

  return norm;
}

function extractNumbers(text) {
  const stripped = text.replace(/\b24[\s-]*hours?\b/gi, '');
  return (stripped.match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

function normalizeDosageMg(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|microgram|milligram|gram)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]), u = m[2].toLowerCase();
  if (u === 'g' || u === 'gram') return n * 1000;
  if (u === 'mg' || u === 'milligram') return n;
  if (u === 'mcg' || u === 'microgram') return n / 1000;
  return null;
}

function hasNegation(text) {
  return /\b(not|no|never|avoid|do not|don't|stop|contraindicated|prohibited)\b/i.test(text);
}

function semanticallySimilar(a, b) {
  const nA = normalizeForComparison(a) ?? '', nB = normalizeForComparison(b) ?? '';
  if (nA === nB) return true;
  const wA = nA.split(' ').filter(w => w.length > 3);
  const wB = nB.split(' ').filter(w => w.length > 3);
  if (!wA.length || !wB.length) return nA === nB;
  const [shorter, longerText] = wA.length <= wB.length ? [wA, nB] : [wB, nA];
  return shorter.filter(w => longerText.includes(w)).length / shorter.length >= 0.6;
}

function warningContentSimilar(a, b) {
  const strip = s => (normalizeForComparison(s) ?? '')
    .replace(/\b(avoid|do not|don t|not|never|no)\b/g, '').replace(/\s+/g, ' ').trim();
  return semanticallySimilar(strip(a), strip(b));
}

function fieldSeverity(field) {
  if (['dosage_amount','dosage_unit','frequency','max_daily_dose'].includes(field)) return 'high';
  if (['route','duration','warnings'].includes(field)) return 'medium';
  return 'low';
}

function nullFields() {
  return {
    medication_name: null, dosage_amount: null, dosage_unit: null,
    frequency: null, interval: null, route: null, duration: null,
    max_daily_dose: null, warnings: [], food_instruction: null,
    patient_group: null, conditionality: null, notes: null,
  };
}

function analyzeDrift(src, back) {
  const issues = [];
  const scalarFields = [
    'medication_name','dosage_amount','dosage_unit','frequency','interval',
    'route','duration','max_daily_dose','food_instruction','patient_group','conditionality',
  ];

  for (const field of scalarFields) {
    const sv = src[field], bv = back[field];
    if (sv === null && bv === null) continue;

    if (field === 'interval' && bv === null && src.frequency !== null) {
      if (canonicalizeFieldValue(sv,'interval') === canonicalizeFieldValue(src.frequency,'frequency')) continue;
      if (canonicalizeFieldValue(back.frequency,'frequency') === canonicalizeFieldValue(sv,'interval')) continue;
    }

    if (sv !== null && bv === null) {
      if (fieldSeverity(field) === 'low') continue;
      if (field === 'max_daily_dose') {
        const ns = extractNumbers(sv), nd = extractNumbers(src.dosage_amount ?? '');
        if (ns.length > 0 && nd.length > 0 && ns[0] === nd[0] && ns.length === 1) continue;
        const cm = canonicalizeFieldValue(sv,'max_daily_dose'), cf = canonicalizeFieldValue(back.frequency ?? '','frequency');
        if (cm && cf && cm === cf) continue;
      }
      issues.push({ field, type:'omitted', severity:fieldSeverity(field), sv, bv:null });
      continue;
    }

    if (sv === null) continue;

    const cSv = canonicalizeFieldValue(sv, field), cBv = canonicalizeFieldValue(bv, field);
    if (cSv === cBv) continue;

    if (field === 'dosage_amount' || field === 'max_daily_dose') {
      const mgS = normalizeDosageMg(sv), mgB = normalizeDosageMg(bv);
      if (mgS !== null && mgB !== null) {
        if (Math.abs(mgS - mgB) < 0.001) continue;
        issues.push({ field, type:'value_changed', severity:'high', sv, bv }); continue;
      }
      const nS = extractNumbers(sv), nB = extractNumbers(bv);
      if (nS.length > 0 && nB.length > 0 && nS[0] === nB[0]) continue;
      if (nS.length > 0 && nB.length > 0) { issues.push({ field, type:'value_changed', severity:'high', sv, bv }); continue; }
      if (nS.length > 0 && nB.length === 0) continue;
      if (!nS.length && !nB.length) continue;
    }

    const svN = hasNegation(sv), bvN = hasNegation(bv);
    if (svN !== bvN) { issues.push({ field, type:'negation_changed', severity:'high', sv, bv }); continue; }

    if (['low','medium'].includes(fieldSeverity(field)) && semanticallySimilar(sv, bv)) continue;

    issues.push({ field, type:'mismatch', severity:fieldSeverity(field), sv, bv });
  }

  for (const w of src.warnings) {
    const match = back.warnings.find(bw => semanticallySimilar(w, bw) || warningContentSimilar(w, bw));
    if (!match) {
      issues.push({ field:'warnings', type:'omitted', severity: hasNegation(w)?'high':'medium', sv:w, bv:null });
    } else if (hasNegation(w) && !hasNegation(match)) {
      issues.push({ field:'warnings', type:'negation_changed', severity:'high', sv:w, bv:match });
    }
  }

  return issues;
}

// ─── TEST CASES ───────────────────────────────────────────────────────────────

const tests = [

  // ══ TOP 20 MOST COMMON PILL BOTTLE STATEMENTS ══

  { name: '#1 Take 1 tablet once daily',
    src: { ...nullFields(), dosage_amount:'1', dosage_unit:'tablet', frequency:'once daily', route:'by mouth' },
    back: { ...nullFields(), dosage_amount:'1', dosage_unit:'tablet', frequency:'once a day', route:'oral' },
    expect: 0 },

  { name: '#2 Take 1 tablet twice daily',
    src: { ...nullFields(), dosage_amount:'1', dosage_unit:'tablet', frequency:'twice daily', route:'by mouth' },
    back: { ...nullFields(), dosage_amount:'1', dosage_unit:'tablet', frequency:'two times a day', route:'orally' },
    expect: 0 },

  { name: '#3 Take 1 tablet three times daily',
    src: { ...nullFields(), dosage_amount:'1', dosage_unit:'tablet', frequency:'three times daily', route:'by mouth' },
    back: { ...nullFields(), dosage_amount:'1', dosage_unit:'tablet', frequency:'three times a day', route:'by mouth' },
    expect: 0 },

  { name: '#4 Take 2 tablets every 6 hours PRN pain',
    src: { ...nullFields(), dosage_amount:'2', dosage_unit:'tablet', frequency:'every 6 hours', conditionality:'as needed' },
    back: { ...nullFields(), dosage_amount:'2', dosage_unit:'tablet', frequency:'four times daily', conditionality:'as needed' },
    expect: 0 },

  { name: '#5 Take 1 capsule at bedtime',
    src: { ...nullFields(), dosage_amount:'1', dosage_unit:'capsule', frequency:'at bedtime' },
    back: { ...nullFields(), dosage_amount:'1', dosage_unit:'capsule', frequency:'at bedtime' },
    expect: 0 },

  { name: '#5b at bedtime = once daily (back-translation rephrasing)',
    src: { ...nullFields(), dosage_amount:'1', dosage_unit:'capsule', frequency:'at bedtime' },
    back: { ...nullFields(), dosage_amount:'1', dosage_unit:'capsule', frequency:'once daily' },
    expect: 0 },

  { name: '#5c nightly = once a day',
    src: { ...nullFields(), dosage_amount:'1', dosage_unit:'tablet', frequency:'nightly' },
    back: { ...nullFields(), dosage_amount:'1', dosage_unit:'tablet', frequency:'once a day' },
    expect: 0 },

  { name: '#6 Take with food (food instruction only)',
    src: { ...nullFields(), food_instruction:'with food' },
    back: { ...nullFields(), food_instruction:'with meals' },
    expect: 0 },

  { name: '#7 Take on empty stomach',
    src: { ...nullFields(), food_instruction:'on an empty stomach' },
    back: { ...nullFields(), food_instruction:'without food' },
    expect: 0 },

  { name: '#8 Take with full glass of water',
    src: { ...nullFields(), food_instruction:'with a full glass of water' },
    back: { ...nullFields(), food_instruction:'with a cup of water' },
    expect: 0 },

  { name: '#9 Do not crush or chew (warning only)',
    src: { ...nullFields(), warnings:['Do not crush or chew'] },
    back: { ...nullFields(), warnings:['Do not crush or chew'] },
    expect: 0 },

  { name: '#10 May cause drowsiness (notes only)',
    src: { ...nullFields(), notes:'May cause drowsiness' },
    back: { ...nullFields(), notes:'May cause drowsiness' },
    expect: 0 },

  { name: '#11 Avoid alcohol (warning)',
    src: { ...nullFields(), warnings:['Avoid alcohol'] },
    back: { ...nullFields(), warnings:['Do not consume alcohol'] },
    expect: 0 },

  { name: '#12 Keep out of reach of children (storage)',
    src: { ...nullFields(), notes:'Keep out of reach of children' },
    back: { ...nullFields(), notes:'Keep away from children' },
    expect: 0 },

  { name: '#13 Store at room temperature (storage)',
    src: { ...nullFields(), notes:'Store at room temperature' },
    back: { ...nullFields(), notes:'Store at room temperature' },
    expect: 0 },

  { name: '#14 Do not use after expiration date',
    src: { ...nullFields(), warnings:['Do not use after expiration date'] },
    back: { ...nullFields(), warnings:['Do not use after expiry date'] },
    expect: 0 },

  { name: '#16 Take until all medication is gone',
    src: { ...nullFields(), notes:'Take until all medication is gone' },
    back: { ...nullFields(), notes:'Complete all the medication' },
    expect: 0 },

  { name: '#17 Skip missed dose if almost time for next dose',
    src: { ...nullFields(), notes:'Skip missed dose if almost time for next dose' },
    back: { ...nullFields(), notes:'Skip missed dose if close to next scheduled dose' },
    expect: 0 },

  { name: '#18 Do not double dose',
    src: { ...nullFields(), warnings:['Do not double dose'] },
    back: { ...nullFields(), warnings:['Do not take double dose'] },
    expect: 0 },

  { name: '#20 Stop use and seek emergency help if allergic reaction',
    src: { ...nullFields(), warnings:['Stop use and seek emergency help if allergic reaction occurs'] },
    back: { ...nullFields(), warnings:['Stop use and seek emergency help if allergic reaction occurs'] },
    expect: 0 },

  // ══ ANTIBIOTICS ══

  { name: 'Antibiotics: Take all medication even if you feel better',
    src: { ...nullFields(), notes:'Take all of this medication even if you feel better' },
    back: { ...nullFields(), notes:'Complete all doses even if feeling better' },
    expect: 0 },

  { name: 'Antibiotics: May cause diarrhea — contact doctor if severe',
    src: { ...nullFields(), warnings:['May cause diarrhea. Contact doctor if severe.'] },
    back: { ...nullFields(), warnings:['May cause diarrhea. Consult doctor if it is severe.'] },
    expect: 0 },

  { name: 'Antibiotics: Do not take with antacids (negation)',
    src: { ...nullFields(), warnings:['Do not take with antacids containing aluminum or magnesium'] },
    back: { ...nullFields(), warnings:['Do not take with aluminum or magnesium antacids'] },
    expect: 0 },

  // ══ PAIN / ANTI-INFLAMMATORY ══

  { name: 'Pain: Take with food or milk to avoid stomach upset',
    src: { ...nullFields(), food_instruction:'with food or milk' },
    back: { ...nullFields(), food_instruction:'with food' },
    expect: 0 },

  { name: 'Pain: Do not take more than 4 doses in 24 hours',
    src: { ...nullFields(), max_daily_dose:'not more than 4 doses in 24 hours', dosage_amount:'1' },
    back: { ...nullFields(), max_daily_dose:'no more than four times in any 24-hour period', dosage_amount:'1' },
    expect: 0 },

  { name: 'Pain: Do not take with other NSAIDs (negation warning)',
    src: { ...nullFields(), warnings:['Do not take with other NSAIDs'] },
    back: { ...nullFields(), warnings:['Do not use with other NSAIDs'] },
    expect: 0 },

  // ══ BLOOD PRESSURE ══

  { name: 'BP: Do not stop taking without consulting doctor (negation)',
    src: { ...nullFields(), warnings:['Do not stop taking without consulting your doctor'] },
    back: { ...nullFields(), warnings:['Do not stop without consulting your doctor'] },
    expect: 0 },

  { name: 'BP: Rise slowly to avoid dizziness',
    src: { ...nullFields(), notes:'Rise slowly from sitting or lying position to avoid dizziness' },
    back: { ...nullFields(), notes:'Rise slowly from sitting or lying down to prevent dizziness' },
    expect: 0 },

  // ══ DIABETES ══

  { name: 'Diabetes: Monitor blood sugar regularly',
    src: { ...nullFields(), notes:'Monitor your blood sugar regularly while taking this medication' },
    back: { ...nullFields(), notes:'Check your blood sugar levels regularly while on this medication' },
    expect: 0 },

  { name: 'Diabetes: Do not skip meals (negation)',
    src: { ...nullFields(), warnings:['Do not skip meals while taking this medication'] },
    back: { ...nullFields(), warnings:['Do not miss meals while on this medication'] },
    expect: 0 },

  { name: 'Diabetes: Store insulin in refrigerator — do not freeze (negation)',
    src: { ...nullFields(), warnings:['Store insulin in the refrigerator. Do not freeze.'] },
    back: { ...nullFields(), warnings:['Keep insulin in the refrigerator. Do not freeze.'] },
    expect: 0 },

  // ══ MENTAL HEALTH ══

  { name: 'MH: May take 2-4 weeks before full effects',
    src: { ...nullFields(), notes:'May take 2 to 4 weeks before full effects are felt' },
    back: { ...nullFields(), notes:'Full effect may take 2 to 4 weeks' },
    expect: 0 },

  { name: 'MH: Do not stop suddenly (negation)',
    src: { ...nullFields(), warnings:['Do not stop taking suddenly without consulting your doctor'] },
    back: { ...nullFields(), warnings:['Do not stop abruptly without consulting your doctor'] },
    expect: 0 },

  { name: 'MH: Do not take with MAO inhibitors (negation)',
    src: { ...nullFields(), warnings:['Do not take with MAO inhibitors'] },
    back: { ...nullFields(), warnings:['Do not use with MAO inhibitors'] },
    expect: 0 },

  { name: 'MH: Avoid grapefruit juice',
    src: { ...nullFields(), warnings:['Avoid grapefruit juice while taking this medication'] },
    back: { ...nullFields(), warnings:['Avoid grapefruit juice while on this medication'] },
    expect: 0 },

  // ══ THYROID ══

  { name: 'Thyroid: Take on empty stomach 30-60 min before breakfast',
    src: { ...nullFields(), food_instruction:'on an empty stomach 30 to 60 minutes before breakfast', frequency:'once daily' },
    back: { ...nullFields(), food_instruction:'on an empty stomach 30 minutes before breakfast', frequency:'once a day' },
    expect: 0 },

  { name: 'Thyroid: Do not take within 4 hours of calcium/iron',
    src: { ...nullFields(), warnings:['Do not take within 4 hours of calcium, iron, or antacids'] },
    back: { ...nullFields(), warnings:['Do not take within 4 hours of calcium, iron, or antacids'] },
    expect: 0 },

  // ══ STEROIDS ══

  { name: 'Steroids: Do not stop suddenly — must be tapered (negation)',
    src: { ...nullFields(), warnings:['Do not stop taking suddenly. Dose must be tapered gradually.'] },
    back: { ...nullFields(), warnings:['Do not stop suddenly. The dose must be reduced gradually.'] },
    expect: 0 },

  { name: 'Steroids: Take with food',
    src: { ...nullFields(), food_instruction:'with food' },
    back: { ...nullFields(), food_instruction:'after food' },
    expect: 0 },

  { name: 'Steroids: Avoid contact with chickenpox/measles',
    src: { ...nullFields(), warnings:['Avoid contact with people who have chickenpox or measles'] },
    back: { ...nullFields(), warnings:['Avoid contact with chickenpox or measles patients'] },
    expect: 0 },

  // ══ MALARIA ══

  { name: 'Malaria: Complete full course even after 1 day',
    src: { ...nullFields(), notes:'Complete the full course even if you feel better after 1 day' },
    back: { ...nullFields(), notes:'Finish all doses even if symptoms improve after 1 day' },
    expect: 0 },

  { name: 'Malaria: Return to doctor if vomiting within 1 hour',
    src: { ...nullFields(), notes:'Return to doctor immediately if vomiting occurs within 1 hour of dose' },
    back: { ...nullFields(), notes:'Go to doctor immediately if vomiting occurs within 1 hour of taking dose' },
    expect: 0 },

  { name: 'Malaria: Do not take on empty stomach (negation)',
    src: { ...nullFields(), food_instruction:'not on an empty stomach' },
    back: { ...nullFields(), food_instruction:'not on an empty stomach' },
    expect: 0 },

  // ══ EYE DROPS ══

  { name: 'Eye: Do not touch dropper tip (negation)',
    src: { ...nullFields(), warnings:['Do not touch dropper tip to eye or any surface'] },
    back: { ...nullFields(), warnings:['Do not touch dropper tip to eye or surface'] },
    expect: 0 },

  { name: 'Eye: Wait 5 minutes before second eye medication',
    src: { ...nullFields(), notes:'Wait 5 minutes before applying a second eye medication' },
    back: { ...nullFields(), notes:'Wait 5 minutes before using a second eye drop' },
    expect: 0 },

  // ══ TOPICAL ══

  { name: 'Topical: For external use only',
    src: { ...nullFields(), route:'topical', warnings:['For external use only'] },
    back: { ...nullFields(), route:'topical', warnings:['For external use only'] },
    expect: 0 },

  { name: 'Topical: Avoid contact with eyes, nose, mouth',
    src: { ...nullFields(), warnings:['Avoid contact with eyes, nose, and mouth'] },
    back: { ...nullFields(), warnings:['Avoid contact with eyes, nose and mouth'] },
    expect: 0 },

  { name: 'Topical: Apply thin layer to affected area only',
    src: { ...nullFields(), route:'topical', notes:'Apply a thin layer to affected area only' },
    back: { ...nullFields(), route:'topical', notes:'Apply a thin layer on the affected area only' },
    expect: 0 },

  { name: 'Topical: Do not use on broken skin (negation)',
    src: { ...nullFields(), warnings:['Do not use on broken or infected skin'] },
    back: { ...nullFields(), warnings:['Do not apply on broken or infected skin'] },
    expect: 0 },

  // ══ HIGH-RISK WARNING LABELS ══

  { name: 'HIGH-RISK: Liver damage if more than directed',
    src: { ...nullFields(), warnings:['WARNING: This medication can cause serious liver damage if more than directed is taken'] },
    back: { ...nullFields(), warnings:['WARNING: This medication can cause serious liver damage if more than directed is taken'] },
    expect: 0 },

  { name: 'HIGH-RISK: Risk of dependence — take only as prescribed',
    src: { ...nullFields(), warnings:['WARNING: Risk of dependence. Take only as prescribed.'] },
    back: { ...nullFields(), warnings:['WARNING: Risk of dependence. Take only as directed by your doctor.'] },
    expect: 0 },

  { name: 'HIGH-RISK: Do not take if pregnant — may cause birth defects (negation)',
    src: { ...nullFields(), warnings:['WARNING: Do not take if you are pregnant. May cause birth defects.'] },
    back: { ...nullFields(), warnings:['WARNING: Do not take if pregnant. May cause birth defects.'] },
    expect: 0 },

  { name: 'HIGH-RISK: May impair ability to drive',
    src: { ...nullFields(), warnings:['WARNING: This medication may impair your ability to drive'] },
    back: { ...nullFields(), warnings:['WARNING: This medication may affect your ability to drive'] },
    expect: 0 },

  { name: 'HIGH-RISK: Stop use immediately if rash or swelling (negation stop)',
    src: { ...nullFields(), warnings:['WARNING: Serious allergic reactions have been reported. Stop use immediately if rash or swelling occurs.'] },
    back: { ...nullFields(), warnings:['WARNING: Stop use immediately if rash or swelling occurs.'] },
    expect: 0 },

  // ══ MAX DAILY DOSE PATTERNS ══

  { name: 'Max dose: not more than 4 times in 24 hours',
    src: { ...nullFields(), dosage_amount:'1', max_daily_dose:'not more than 4 doses in 24 hours', frequency:'every 6 hours' },
    back: { ...nullFields(), dosage_amount:'1', max_daily_dose:'no more than four times in any 24-hour period', frequency:'four times daily' },
    expect: 0 },

  { name: 'Max dose: do not exceed 3000mg per day vs 3g per day',
    src: { ...nullFields(), dosage_amount:'500', dosage_unit:'mg', max_daily_dose:'3000mg per day' },
    back: { ...nullFields(), dosage_amount:'500', dosage_unit:'mg', max_daily_dose:'3g daily' },
    expect: 0 },

  { name: 'Max dose: not more than once daily ceiling',
    src: { ...nullFields(), frequency:'once in any 24-hour period', max_daily_dose:'not more than once in any 24-hour period' },
    back: { ...nullFields(), frequency:'once every twenty-four hours', max_daily_dose:'not more than once every twenty-four hours' },
    expect: 0 },

  // ══ REAL DRIFT — MUST BE CAUGHT ══

  { name: 'REAL DRIFT: Do not crush → Crush tablet (negation lost)',
    src: { ...nullFields(), warnings:['Do not crush or chew the tablet'] },
    back: { ...nullFields(), warnings:['Crush the tablet before taking'] },
    expect: 1 },

  { name: 'REAL DRIFT: Do not take if pregnant → Take if pregnant',
    src: { ...nullFields(), warnings:['Do not take if you are pregnant'] },
    back: { ...nullFields(), warnings:['Take if you are pregnant'] },
    expect: 1 },

  { name: 'REAL DRIFT: 4 times daily → 3 times daily',
    src: { ...nullFields(), dosage_amount:'1', frequency:'four times daily', max_daily_dose:'not more than 4 doses in 24 hours' },
    back: { ...nullFields(), dosage_amount:'1', frequency:'three times daily', max_daily_dose:'not more than 3 doses in 24 hours' },
    expect: 1 },

  { name: 'REAL DRIFT: 1000mg → 100mg (10x dosage error)',
    src: { ...nullFields(), dosage_amount:'1000', dosage_unit:'mg', frequency:'twice daily' },
    back: { ...nullFields(), dosage_amount:'100', dosage_unit:'mg', frequency:'twice daily' },
    expect: 1 },

  { name: 'REAL DRIFT: Do not freeze → freeze it',
    src: { ...nullFields(), warnings:['Store insulin in the refrigerator. Do not freeze.'] },
    back: { ...nullFields(), warnings:['Store insulin in the refrigerator. Freeze it.'] },
    expect: 1 },
];

// ─── RUNNER ──────────────────────────────────────────────────────────────────

const W = 72;
let passed = 0, failed = 0;

console.log('='.repeat(W));
console.log(`PILL BOTTLE STATEMENTS BACKTEST — ${tests.length} cases`);
console.log('='.repeat(W));

for (const t of tests) {
  const issues = analyzeDrift(t.src, t.back);
  const ok = t.expect === 0 ? issues.length === 0 : issues.length >= t.expect;

  if (ok) {
    passed++;
    const tag = t.expect > 0 ? ' [DRIFT CAUGHT]' : '';
    console.log(`✓ ${t.name}${tag}`);
  } else {
    failed++;
    console.log(`✗ ${t.name}`);
    if (t.expect === 0 && issues.length > 0) {
      for (const i of issues)
        console.log(`  FALSE POSITIVE field=${i.field} type=${i.type} sv="${i.sv}" bv="${i.bv}"`);
    } else {
      console.log(`  MISSED DRIFT — expected ≥${t.expect}, got ${issues.length}`);
    }
  }
}

console.log('='.repeat(W));
console.log(`RESULT: ${passed}/${tests.length} passed, ${failed} failed`);
console.log('='.repeat(W));
process.exit(failed > 0 ? 1 : 0);
