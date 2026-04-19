export type MedicationFields = {
  medication_name: string | null;
  dosage_amount: string | null;
  dosage_unit: string | null;
  frequency: string | null;
  interval: string | null;
  route: string | null;
  duration: string | null;
  max_daily_dose: string | null;
  warnings: string[];
  food_instruction: string | null;
  patient_group: string | null;
  conditionality: string | null;
  notes: string | null;
};

export type DriftIssue = {
  field: keyof MedicationFields;
  type: 'mismatch' | 'omitted' | 'value_changed' | 'negation_changed';
  severity: 'high' | 'medium' | 'low';
  sourceValue: string | null;
  backValue: string | null;
  explanation: string;
};

export type RiskLevel = 'low' | 'medium' | 'high';
export type Recommendation = 'safe_to_use' | 'use_with_caution' | 'human_review_required';
export type SupportedLanguage = 'Spanish' | 'Yoruba' | 'Quechua' | 'French' | 'Haitian Creole';

export type LanguageMetadata = {
  code: SupportedLanguage;
  qualityTier: 'high' | 'medium' | 'low-resource';
  warningLevel: 'none' | 'surface' | 'strong';
  warningMessage: string | null;
  escalatesRisk: boolean;
  usesFewShot: boolean;
};

export type SimplificationResult = {
  rewritten: string | null;
  ambiguity_flags: string[];
  is_ambiguous: boolean;
};

export type AnalysisResult = {
  originalInstruction: string;
  simplificationResult: SimplificationResult;
  effectiveSource: string;
  translation: string;
  backTranslation: string;
  sourceFields: MedicationFields;
  backTranslatedFields: MedicationFields;
  driftIssues: DriftIssue[];
  riskScore: number;
  riskLevel: RiskLevel;
  riskExplanation: string;
  recommendation: Recommendation;
  teachBackQuestion: string | null;
  targetLanguage: string;
  languageQualityWarning: string | null;
  tonalRailResult?: TonalRailResult;
  timestamp: string;
};

export type TonalIssue = {
  expectedDigit: number;
  foundStripped: string;
  claudeForm: string;
  mT5Form: string | null;
  canonicalForm: string;
  confusableWith: number | null;
  confusableCanonical: string | null;
  medicalRisk: 'critical' | 'high' | 'low';
  issueType: 'diacritic_mismatch' | 'missing_numeral' | 'wrong_numeral' | 'mT5_unavailable';
  explanation: string;
};

export type TonalNumeralRow = {
  digit: number;
  claudeForm: string;      // what appeared in the translation (Arabic numeral or Yoruba word)
  canonicalForm: string;   // expected Yoruba canonical form
  encoding: 'yoruba' | 'arabic'; // whether it was found as a Yoruba word or Arabic digit
  status: 'pass' | 'fail';
  issue?: TonalIssue;
};

export type TonalRailResult = {
  ran: boolean;
  mT5Available: boolean;
  issues: TonalIssue[];
  checkedNumerals: number[];
  numeralRows: TonalNumeralRow[];
  passed: boolean;
  summary: string;
};

export type PipelineStep =
  | 'simplify'
  | 'translate'
  | 'tonalRail'
  | 'backTranslate'
  | 'extractSource'
  | 'extractBack'
  | 'analyze'
  | 'teachBack'
  | 'done';

export type StreamEvent = {
  step: PipelineStep;
  status: 'running' | 'complete' | 'error';
  result?: unknown;
  final?: AnalysisResult;
  error?: string;
};

export type AuditLogEntry = {
  timestamp: string;
  instructionPreview: string;
  targetLanguage: SupportedLanguage;
  riskLevel: RiskLevel;
  recommendation: Recommendation;
  riskScore: number;
};

export type DemoCase = {
  id: string;
  label: string;
  instruction: string;
  targetLanguage: SupportedLanguage;
  useSimplification: boolean;
  expectedRisk: RiskLevel;
  description: string;
};
