export const DAILYMED_COLOR_VOCAB = [
  'WHITE',
  'YELLOW',
  'ORANGE',
  'RED',
  'PINK',
  'PURPLE',
  'BLUE',
  'GREEN',
  'BROWN',
  'BLACK',
  'GRAY',
] as const;

export const DAILYMED_SHAPE_VOCAB = [
  'ROUND',
  'OVAL',
  'OBLONG',
  'CAPSULE',
  'TRIANGLE',
  'SQUARE',
  'DIAMOND',
  'PENTAGON',
] as const;

export type DailyMedColorLabel = (typeof DAILYMED_COLOR_VOCAB)[number];
export type DailyMedShapeLabel = (typeof DAILYMED_SHAPE_VOCAB)[number];

export interface PrescriptionAttributes {
  color: string[];
  shape: string;
  imprint: string | null;
  sizeMm?: number | null;
  scoreMarkings?: number | null;
  dosageForm?: string | null;
}

export interface PrescriptionCandidate extends PrescriptionAttributes {
  setid: string;
  ndc: string;
  title: string;
  productName: string;
  confidence: number;
}

export interface ResolvedPrescription extends PrescriptionAttributes {
  source: 'DailyMed';
  query: string;
  queryMode: 'drug_name' | 'ndc';
  setid: string;
  ndc: string;
  title: string;
  productName: string;
  confidence: number;
  alternatives?: PrescriptionCandidate[];
}
