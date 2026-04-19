import type { LanguageMetadata, SupportedLanguage } from '@/lib/types';

export const LANGUAGES: LanguageMetadata[] = [
  {
    code: 'Spanish',
    qualityTier: 'high',
    warningLevel: 'none',
    warningMessage: null,
    escalatesRisk: false,
    usesFewShot: false,
  },
  {
    code: 'French',
    qualityTier: 'high',
    warningLevel: 'none',
    warningMessage: null,
    escalatesRisk: false,
    usesFewShot: false,
  },
  {
    code: 'Yoruba',
    qualityTier: 'medium',
    warningLevel: 'surface',
    warningMessage:
      'Yoruba medical translation quality may vary. Tonal diacritics are critical for correct meaning. Review with a native Yoruba speaker or certified medical interpreter before patient use.',
    escalatesRisk: false,
    usesFewShot: true,
  },
  {
    code: 'Quechua',
    qualityTier: 'low-resource',
    warningLevel: 'strong',
    warningMessage:
      'Quechua is a low-resource language with limited machine translation quality. Results may be unreliable or incomplete. Risk level has been automatically escalated. A qualified human interpreter is required before use.',
    escalatesRisk: true,
    usesFewShot: false,
  },
  {
    code: 'Haitian Creole',
    qualityTier: 'low-resource',
    warningLevel: 'strong',
    warningMessage:
      'Haitian Creole machine translation quality varies significantly for medical content. Risk level has been automatically escalated. A qualified human interpreter is required before patient use.',
    escalatesRisk: true,
    usesFewShot: false,
  },
];

export function getLanguageMetadata(lang: SupportedLanguage): LanguageMetadata {
  const meta = LANGUAGES.find(l => l.code === lang);
  if (!meta) throw new Error(`Unknown language: ${lang}`);
  return meta;
}
