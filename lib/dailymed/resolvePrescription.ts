import type { DailyMedColorLabel, DailyMedShapeLabel, PrescriptionCandidate, ResolvedPrescription } from './types';

const DAILYMED_BASE = 'https://dailymed.nlm.nih.gov/dailymed/services';
const MAX_ALTERNATIVES = 12;

interface SplListItem {
  setid: string;
  title: string;
}

interface SplAttributes {
  colors: DailyMedColorLabel[];
  shape: DailyMedShapeLabel | null;
  imprint: string | null;
  sizeMm: number | null;
  scoreMarkings: number | null;
  dosageForm: string | null;
  productName: string | null;
}

interface Candidate {
  setid: string;
  ndc: string;
  title: string;
  productName: string;
  colors: DailyMedColorLabel[];
  shape: DailyMedShapeLabel | null;
  imprint: string | null;
  sizeMm: number | null;
  scoreMarkings: number | null;
  dosageForm: string | null;
  score: number;
}

function candidateSignature(candidate: Candidate): string {
  const colors = candidate.colors.join('|');
  const shape = candidate.shape ?? '';
  const imprint = candidate.imprint ?? '';
  return `${colors}::${shape}::${imprint}`;
}

export class DailyMedLookupError extends Error {}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new DailyMedLookupError(`DailyMed request failed (${res.status}) for ${url}`);
    }

    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new DailyMedLookupError(`DailyMed request timed out for ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string): Promise<string> {
  const tryFetch = async (acceptHeader?: string): Promise<string> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const headers: Record<string, string> = {};
      if (acceptHeader) headers.Accept = acceptHeader;

      const res = await fetch(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new DailyMedLookupError(`DailyMed request failed (${res.status}) for ${url}`);
      }

      return await res.text();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DailyMedLookupError(`DailyMed request timed out for ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    // Preferred content negotiation.
    return await tryFetch('application/xml,text/xml');
  } catch (error) {
    // DailyMed returns 406 for some XML endpoints with strict Accept headers.
    if (error instanceof DailyMedLookupError && /request failed \(406\)/i.test(error.message)) {
      return await tryFetch('*/*');
    }
    throw error;
  }
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(text: string): string {
  return decodeXmlEntities(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeImprint(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .toUpperCase()
    .replace(/[;,:]+/g, ' ')
    .replace(/[^A-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function extractColors(raw: string | null | undefined): DailyMedColorLabel[] {
  if (!raw) return [];
  const value = raw.toUpperCase();
  const colors: DailyMedColorLabel[] = [];

  const push = (label: DailyMedColorLabel) => {
    if (!colors.includes(label)) colors.push(label);
  };

  if (/\bWHITE\b/.test(value)) push('WHITE');
  if (/\bYELLOW\b/.test(value)) push('YELLOW');
  if (/\bORANGE\b/.test(value)) push('ORANGE');
  if (/\bRED\b/.test(value)) push('RED');
  if (/\bPINK\b/.test(value)) push('PINK');
  if (/\bPURPLE\b|\bVIOLET\b/.test(value)) push('PURPLE');
  if (/\bBLUE\b/.test(value)) push('BLUE');
  if (/\bGREEN\b/.test(value)) push('GREEN');
  if (/\bBROWN\b|\bTAN\b/.test(value)) push('BROWN');
  if (/\bBLACK\b/.test(value)) push('BLACK');
  if (/\bGRAY\b|\bGREY\b/.test(value)) push('GRAY');

  return colors;
}

function mapShape(rawShape: string | null | undefined): DailyMedShapeLabel | null {
  if (!rawShape) return null;
  const value = rawShape.toUpperCase();

  if (/\bROUND\b/.test(value)) return 'ROUND';
  if (/\bOVAL\b/.test(value)) return 'OVAL';
  if (/\bOBLONG\b/.test(value)) return 'OBLONG';
  if (/\bCAPSULE\b|\bCAPLET\b/.test(value)) return 'CAPSULE';
  if (/\bTRIANGLE\b|\bTRIANGULAR\b/.test(value)) return 'TRIANGLE';
  if (/\bSQUARE\b/.test(value)) return 'SQUARE';
  if (/\bDIAMOND\b/.test(value)) return 'DIAMOND';
  if (/\bPENTAGON\b|\bFIVE\s*SIDED\b|\b5\s*SIDED\b/.test(value)) return 'PENTAGON';
  if (/\bRECTANGLE\b|\bRECTANGULAR\b/.test(value)) return 'OBLONG';

  return null;
}

function includesDrugName(drugName: string, haystack: string): boolean {
  return haystack.toUpperCase().includes(drugName.toUpperCase());
}

function extractAttributeValue(characteristicBlock: string): string | null {
  const selfClosing = characteristicBlock.match(/<value([^>]*)\/>/i);
  if (selfClosing) {
    const attrs = selfClosing[1] ?? '';
    const displayName = attrs.match(/displayName=\"([^\"]+)\"/i)?.[1];
    const code = attrs.match(/code=\"([^\"]+)\"/i)?.[1];
    return (displayName ?? code ?? '').trim() || null;
  }

  const normal = characteristicBlock.match(/<value([^>]*)>([\s\S]*?)<\/value>/i);
  if (!normal) return null;

  const attrs = normal[1] ?? '';
  const body = stripTags(normal[2] ?? '');
  const displayName = attrs.match(/displayName=\"([^\"]+)\"/i)?.[1]?.trim();
  const code = attrs.match(/code=\"([^\"]+)\"/i)?.[1]?.trim();

  return displayName || body || code || null;
}

function extractCharacteristicValues(xml: string, code: string): string[] {
  const values: string[] = [];
  const characteristicBlocks = xml.match(/<characteristic[\s\S]*?<\/characteristic>/gi) ?? [];

  for (const block of characteristicBlocks) {
    if (!new RegExp(`code=\"${code}\"`, 'i').test(block)) continue;
    const value = extractAttributeValue(block);
    if (value) values.push(value);
  }

  return values;
}

function parseNumeric(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(',', '.');
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseScoreMarkings(value: string | null | undefined): number | null {
  const parsed = parseNumeric(value);
  if (parsed === null) return null;
  const rounded = Math.round(parsed);
  if (rounded < 0 || rounded > 10) return null;
  return rounded;
}

function extractDosageForm(xml: string): string | null {
  const formCode = xml.match(/<formCode[^>]*displayName=\"([^\"]+)\"[^>]*\/?>/i)?.[1];
  if (formCode) return stripTags(formCode).trim().toUpperCase();
  return null;
}

function isSolidOralDosageForm(dosageForm: string | null): boolean {
  if (!dosageForm) return true;
  const value = dosageForm.toUpperCase();
  if (/\b(TABLET|CAPSULE|CAPLET|PILL|TROCHE|LOZENGE)\b/.test(value)) return true;
  if (/\b(LIQUID|SOLUTION|SUSPENSION|SYRUP|ELIXIR|INJECTION|CREAM|OINTMENT|LOTION|PATCH|SPRAY|DROPS)\b/.test(value)) return false;
  return true;
}

function extractProductName(xml: string): string | null {
  const manufacturedBlocks = xml.match(/<manufacturedProduct[\s\S]*?<\/manufacturedProduct>/gi) ?? [];

  for (const block of manufacturedBlocks) {
    if (!/code=\"SPL(COLOR|SHAPE|IMPRINT)\"/i.test(block)) continue;
    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/i);
    if (!nameMatch) continue;
    const name = stripTags(nameMatch[1]);
    if (name) return name;
  }

  return null;
}

function parseSplAttributesFromXml(xml: string): SplAttributes {
  const colorValues = extractCharacteristicValues(xml, 'SPLCOLOR');
  const shapeValues = extractCharacteristicValues(xml, 'SPLSHAPE');
  const imprintValues = extractCharacteristicValues(xml, 'SPLIMPRINT');
  const sizeValues = extractCharacteristicValues(xml, 'SPLSIZE');
  const scoreValues = extractCharacteristicValues(xml, 'SPLSCORE');

  const colors: DailyMedColorLabel[] = [];
  for (const value of colorValues) {
    for (const color of extractColors(value)) {
      if (!colors.includes(color)) colors.push(color);
    }
  }

  let shape: DailyMedShapeLabel | null = null;
  for (const value of shapeValues) {
    shape = mapShape(value);
    if (shape) break;
  }

  let imprint: string | null = null;
  for (const value of imprintValues) {
    imprint = normalizeImprint(value);
    if (imprint) break;
  }

  let sizeMm: number | null = null;
  for (const value of sizeValues) {
    const parsed = parseNumeric(value);
    if (parsed !== null) {
      sizeMm = parsed;
      break;
    }
  }

  let scoreMarkings: number | null = null;
  for (const value of scoreValues) {
    const parsed = parseScoreMarkings(value);
    if (parsed !== null) {
      scoreMarkings = parsed;
      break;
    }
  }

  const dosageForm = extractDosageForm(xml);

  return {
    colors,
    shape,
    imprint,
    sizeMm,
    scoreMarkings,
    dosageForm,
    productName: extractProductName(xml),
  };
}

function buildCandidate(
  attributes: SplAttributes,
  ndc: string,
  setid: string,
  title: string,
  drugName: string,
): Candidate | null {
  if (!isSolidOralDosageForm(attributes.dosageForm)) {
    return null;
  }

  if (attributes.colors.length === 0 && !attributes.shape && !attributes.imprint) {
    return null;
  }

  const productName = attributes.productName ?? title;

  let score = 0;
  if (attributes.colors.length > 0) score += 2;
  if (attributes.shape) score += 2;
  if (attributes.imprint) score += 1;
  if (attributes.sizeMm !== null) score += 0.5;
  if (attributes.scoreMarkings !== null) score += 0.5;
  if (attributes.dosageForm && isSolidOralDosageForm(attributes.dosageForm)) score += 1;
  if (includesDrugName(drugName, `${title} ${productName}`)) score += 1;

  return {
    setid,
    ndc,
    title,
    productName,
    colors: attributes.colors,
    shape: attributes.shape,
    imprint: attributes.imprint,
    sizeMm: attributes.sizeMm,
    scoreMarkings: attributes.scoreMarkings,
    dosageForm: attributes.dosageForm,
    score,
  };
}

function toPrescriptionCandidate(candidate: Candidate): PrescriptionCandidate {
  return {
    setid: candidate.setid,
    ndc: candidate.ndc,
    title: candidate.title,
    productName: candidate.productName,
    color: candidate.colors,
    shape: candidate.shape ?? 'OVAL',
    imprint: candidate.imprint,
    sizeMm: candidate.sizeMm,
    scoreMarkings: candidate.scoreMarkings,
    dosageForm: candidate.dosageForm,
    confidence: Math.min(1, candidate.score / 8),
  };
}

async function fetchSplsForDrugName(drugName: string): Promise<SplListItem[]> {
  const url = `${DAILYMED_BASE}/v2/spls.json?drug_name=${encodeURIComponent(drugName)}&name_type=both&pagesize=15`;
  const payload = await fetchJson<{ data?: Array<{ setid?: string; title?: string }> }>(url);

  const data = Array.isArray(payload.data) ? payload.data : [];

  return data
    .map((item) => ({
      setid: item.setid ?? '',
      title: item.title ?? '',
    }))
    .filter((item) => item.setid.length > 0);
}

function normalizeNdc(ndc: string): string {
  return ndc.replace(/[^0-9-]/g, '').trim();
}

async function fetchSplsForNdc(ndc: string): Promise<SplListItem[]> {
  const normalized = normalizeNdc(ndc);
  if (!normalized) return [];
  const url = `${DAILYMED_BASE}/v2/spls.json?ndc=${encodeURIComponent(normalized)}&pagesize=15`;
  const payload = await fetchJson<{ data?: Array<{ setid?: string; title?: string }> }>(url);
  const data = Array.isArray(payload.data) ? payload.data : [];

  return data
    .map((item) => ({
      setid: item.setid ?? '',
      title: item.title ?? '',
    }))
    .filter((item) => item.setid.length > 0);
}

async function fetchNdcsForSetid(setid: string): Promise<string[]> {
  const url = `${DAILYMED_BASE}/v2/spls/${encodeURIComponent(setid)}/ndcs.json?pagesize=100`;
  const payload = await fetchJson<{ data?: { ndcs?: Array<{ ndc?: string }> } }>(url);

  const ndcs = payload.data?.ndcs;
  if (!Array.isArray(ndcs)) return [];

  return ndcs
    .map((item) => item.ndc ?? '')
    .filter((ndc) => ndc.length > 0);
}

async function fetchSplAttributes(setid: string): Promise<SplAttributes> {
  const url = `${DAILYMED_BASE}/v2/spls/${encodeURIComponent(setid)}.xml`;
  const xml = await fetchText(url);
  return parseSplAttributesFromXml(xml);
}

export async function resolvePrescriptionFromDailyMed(
  drugName: string,
  options?: { ndc?: string | null },
): Promise<ResolvedPrescription> {
  const query = drugName.trim();
  if (!query) {
    throw new DailyMedLookupError('Drug name is required.');
  }

  const ndcQuery = options?.ndc ? normalizeNdc(options.ndc) : '';
  let queryMode: 'drug_name' | 'ndc' = 'drug_name';
  let spls = await fetchSplsForDrugName(query);

  if (ndcQuery) {
    const ndcSpls = await fetchSplsForNdc(ndcQuery);
    if (ndcSpls.length > 0) {
      queryMode = 'ndc';
      spls = ndcSpls;
    }
  }

  // If the exact query returned nothing, retry with just alphabetic characters
  // (handles residual punctuation) and then with lowercase
  if (spls.length === 0) {
    const alphaOnly = query.replace(/[^a-zA-Z]/g, '');
    if (alphaOnly && alphaOnly.toLowerCase() !== query.toLowerCase()) {
      spls = await fetchSplsForDrugName(alphaOnly);
    }
  }
  if (spls.length === 0) {
    const lower = query.toLowerCase();
    if (lower !== query) {
      spls = await fetchSplsForDrugName(lower);
    }
  }

  if (spls.length === 0) {
    if (ndcQuery) {
      throw new DailyMedLookupError(`No DailyMed SPL records found for ndc="${ndcQuery}" or drug name "${query}".`);
    }
    throw new DailyMedLookupError(`No DailyMed SPL records found for "${query}".`);
  }

  const candidates: Candidate[] = [];
  let parseFailures = 0;
  let ndcFailures = 0;
  let lastParseErrorMessage: string | null = null;

  for (const spl of spls.slice(0, 12)) {
    let attributes: SplAttributes;
    try {
      attributes = await fetchSplAttributes(spl.setid);
    } catch (error) {
      parseFailures += 1;
      lastParseErrorMessage = error instanceof Error ? error.message : String(error);
      continue;
    }

    let primaryNdc = 'UNKNOWN';
    try {
      const ndcs = await fetchNdcsForSetid(spl.setid);
      if (ndcs.length > 0) primaryNdc = ndcs[0];
    } catch {
      ndcFailures += 1;
    }

    const candidate = buildCandidate(
      attributes,
      primaryNdc,
      spl.setid,
      spl.title,
      query,
    );

    if (candidate) candidates.push(candidate);
  }

  if (candidates.length === 0) {
    if (parseFailures > 0) {
      const detail = lastParseErrorMessage ? ` Last parser/network error: ${lastParseErrorMessage}` : '';
      throw new DailyMedLookupError(
        `DailyMed returned SPLs for "${query}", but attribute extraction failed for ${parseFailures} SPL(s).${detail}`,
      );
    }
    throw new DailyMedLookupError(
      `DailyMed returned SPLs for "${query}", but no solid oral candidates with SPLCOLOR/SPLSHAPE/SPLIMPRINT were found in sampled v2 SPL XML records.`,
    );
  }

  candidates.sort((a, b) => b.score - a.score);

  const deduped: Candidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const signature = candidateSignature(candidate);
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(candidate);
  }

  const ranked = deduped.length > 0 ? deduped : candidates;
  const best = ranked[0];
  const alternatives = ranked.slice(1, 1 + MAX_ALTERNATIVES).map(toPrescriptionCandidate);

  return {
    source: 'DailyMed',
    query,
    queryMode,
    setid: best.setid,
    ndc: best.ndc,
    title: best.title,
    productName: best.productName,
    color: best.colors,
    shape: best.shape ?? 'OVAL',
    imprint: best.imprint,
    sizeMm: best.sizeMm,
    scoreMarkings: best.scoreMarkings,
    dosageForm: best.dosageForm,
    confidence: Math.min(1, best.score / 8),
    alternatives,
  };
}
