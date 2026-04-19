export function buildWarningCheckPrompt(
  sourceWarning: string,
  backAllText: string,
): { system: string; user: string } {
  return {
    system: `You are a medical safety checker. Answer only YES or NO.
YES = the back-translated text conveys the same safety instruction, even if worded differently.
NO = the warning is absent or its meaning has changed.`,
    user: `Source warning: "${sourceWarning}"

Back-translated text:
"${backAllText}"

Does the back-translated text convey the same medical safety instruction?`,
  };
}

export function buildSentenceEquivalencePrompt(
  source: string,
  back: string,
): { system: string; user: string } {
  return {
    system: `You are a medical safety checker. Answer only YES or NO.
YES = the two instructions convey the same medical information to the patient, even if worded differently. Spelled-out numbers and digits are equivalent (e.g. "fourteen" = "14"). Synonymous phrases are equivalent (e.g. "nothing by mouth" = "do not eat or drink anything").
NO = they differ in a medically important way: different drug name, different dose number, different frequency, different route, different duration, different warnings, or a restriction present in one but absent in the other.`,
    user: `Original instruction: "${source}"

Re-read in English: "${back}"

Do these two instructions convey the same medical information?`,
  };
}

export function buildFieldCheckPrompt(
  sourceValue: string,
  backValue: string,
): { system: string; user: string } {
  return {
    system: `You are a medical safety checker. Answer only YES or NO.
YES = the two phrases convey identical medical information, even if phrased differently (e.g. "14 days" and "fourteen days" are the same; "twice daily" and "two times a day" are the same).
NO = the phrases differ in a medically meaningful way (different numbers, different instructions, different meaning).`,
    user: `Source: "${sourceValue}"
Back-translation: "${backValue}"

Do these two phrases convey the same medical information?`,
  };
}
