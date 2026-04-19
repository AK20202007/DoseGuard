import type { SupportedLanguage, RiskLevel } from '@/lib/types';

export function buildTeachBackPrompt(
  originalInstruction: string,
  targetLanguage: SupportedLanguage,
  riskLevel: RiskLevel,
): { system: string; user: string } {
  const focusHint =
    riskLevel === 'high'
      ? 'Focus on the most safety-critical element: dosage amount, frequency, maximum dose limit, or critical warnings.'
      : 'Focus on the core dosing information.';

  return {
    system: `You are a health literacy specialist. Generate a single, clear patient comprehension verification question to ask after giving medication instructions.

Rules:
- Return ONE question only.
- The question must have a clear, specific, verifiable answer derivable from the instructions.
- Use plain language — no medical jargon.
- Do NOT include the answer.
- Return ONLY the question with no preamble, label, or explanation.

Good example questions:
- "How many tablets will you take each time?"
- "How many times per day will you take this medication?"
- "What should you avoid while taking this medication?"
- "What is the maximum number of tablets you can take in one day?"
- "For how many days will you take this medication?"`,
    user: `Generate a teach-back question for this medication instruction (which will be given to the patient in ${targetLanguage}). ${focusHint}

Instruction:
"${originalInstruction}"`,
  };
}
