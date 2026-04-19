# DoseGuard — Medical Translation Safety Tool

A translation safety verification system for medication and discharge instructions. DoseGuard detects dangerous semantic drift when translating dosage, frequency, route, and safety warnings into low-resource languages.

> **Disclaimer:** This tool supports translation safety review. It does not provide medical advice. High-risk or uncertain translations require clinician or certified interpreter review. Do not use for emergencies.

---

## The Problem

Translation errors in healthcare harm patients. When medication instructions are translated into low-resource languages (Yoruba, Quechua, Haitian Creole), machine translation quality is unreliable — dosage amounts can change, frequency can drift, and safety warnings can disappear entirely. Back-translation and human-in-the-loop review are recognized safety practices, but they are rarely systematized.

## Who It's For

- Clinicians and health educators translating discharge instructions
- Community health workers delivering medication guidance
- Healthcare organizations assessing translation quality before patient distribution

---

## How It Works

1. **Source Analysis** — Detects abbreviations (TID, PRN, BID) and ambiguous language in the English source. Rewrites to plain English if requested.
2. **Translation** — Translates the (optionally simplified) instruction into the target language using Claude. Yoruba translations use MENYO-20k few-shot examples for diacritic grounding.
3. **Back-Translation** — Faithfully back-translates into English using a separate prompt path that explicitly forbids correction or improvement.
4. **Semantic Extraction** — Extracts structured medication fields (13 fields) from both source and back-translation using Claude.
5. **Drift Detection** — Compares fields deterministically in code: dosage, frequency, route, warnings, max dose, duration.
6. **Risk Scoring** — Weighted deterministic scoring (not LLM judgment). Dosage/frequency/max dose mismatch = high. Warning omission = medium/high. Low-resource languages escalate risk by one tier.
7. **Teach-Back Generation** — Generates a patient comprehension verification question.

The pipeline streams results live to the UI — each step appears as it completes.

---

## Technical Architecture

```
app/
  page.tsx                     # Client dashboard — SSE stream consumer
  api/analyze/route.ts         # Streaming pipeline orchestrator (nodejs runtime)
  api/audit-log/route.ts       # In-memory audit log GET endpoint

lib/
  claude.ts                    # Anthropic client singleton
  auditLog.ts                  # Module-level in-memory audit log
  pipeline/
    sourceSimplifier.ts        # Step 1: abbreviation detection + rewrite
    translator.ts              # Step 2: EN → target language
    backTranslator.ts          # Step 3: target → EN (faithful)
    semanticExtractor.ts       # Steps 4+5: structured JSON extraction
    driftAnalyzer.ts           # Step 6a: deterministic field comparison
    riskScorer.ts              # Step 6b: weighted risk scoring
    teachBackGenerator.ts      # Step 7: patient check question
  prompts/
    simplify.ts, translate.ts, backTranslate.ts, extract.ts, teachBack.ts

data/
  languages.ts                 # Language metadata + quality tiers
  menyo-examples.ts            # 10 EN-YO sentence pairs (MENYO-20k)
  demo-cases.ts                # 5 built-in demo cases
```

**Risk scoring weights:**
| Field | Weight |
|---|---|
| dosage_amount, dosage_unit, max_daily_dose, frequency, interval | 40 |
| warnings (per omitted warning) | 30 |
| route | 25 |
| duration | 15 |
| food_instruction, conditionality | 10 |
| medication_name, patient_group | 8 |
| notes | 5 |

Thresholds: ≥60 = high, ≥25 = medium, <25 = low. Quechua and Haitian Creole escalate risk level by one tier.

---

## How to Run Locally

### Prerequisites

- Node.js 18+
- An Anthropic API key (`sk-ant-...`)

### Setup

```bash
cd MediVerify
cp .env.example .env.local
# Edit .env.local and add your API key:
# ANTHROPIC_API_KEY=sk-ant-your-key-here

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo

Click any of the five demo case buttons to pre-fill an example, then click **Analyze Translation Safety**. Watch the pipeline steps complete one by one.

---

## Demo Cases

| Case | Language | Expected Risk |
|---|---|---|
| Safe Simple — "Take 500mg amoxicillin twice daily for 7 days with food." | Spanish | Low |
| Ambiguous Source — "Take 2 tabs TID PRN pain." | Yoruba | Medium |
| Frequency Drift — "Take metformin 1000mg twice daily with meals." | Quechua | High (escalated) |
| Max Dose Drift — "Do not take more than 8 tablets (4000mg) in 24 hours." | Yoruba | High |
| Warning Omission — "Take warfarin 5mg. Do NOT take with aspirin. Avoid alcohol." | Quechua | High |

---

## Supported Languages

| Language | Quality | Risk Escalation |
|---|---|---|
| Spanish | High | No |
| French | High | No |
| Yoruba | Medium | No (few-shot diacritic grounding) |
| Quechua | Low-resource | Yes (+1 tier) |
| Haitian Creole | Low-resource | Yes (+1 tier) |

---

## Ethical Risks & Safeguards

**Risks:**
- Claude may hallucinate translation quality for very low-resource languages
- The back-translation method can produce false negatives (drift missed) if both translation and back-translation make the same error
- Deterministic field comparison is based on string normalization — it may miss subtle semantic drift

**Safeguards:**
- Human-in-the-loop: high-risk results always require clinician or interpreter review before patient use
- Low-resource languages automatically escalate risk
- Extraction failure defaults to high risk
- Every run is logged to the session audit log
- Teach-back questions give clinicians a tool to verify patient understanding
- Disclaimers are prominently displayed throughout the UI

---

## Limitations

- Back-translation is an imperfect proxy for translation quality
- Claude's Quechua and Yoruba quality is not independently validated
- The in-memory audit log resets on server restart
- This tool cannot catch errors in fields that are absent from both translation and back-translation

---

## Future Work

- OCR upload for prescription image input
- NIH DailyMed API integration for dose sanity checks
- Downloadable PDF safety report
- Verified phrase library for high-frequency instructions
- Clinician review queue with persistent storage
- Confidence profiling per language pair
