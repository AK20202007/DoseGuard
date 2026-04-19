'use client';

import { useState, useCallback } from 'react';
import type {
  AnalysisResult,
  AuditLogEntry,
  DemoCase,
  PipelineStep,
  SimplificationResult,
  StreamEvent,
  SupportedLanguage,
} from '@/lib/types';
import { InputPanel } from '@/components/InputPanel';
import { PipelinePanel } from '@/components/PipelinePanel';
import { RiskPanel } from '@/components/RiskPanel';
import { DemoPanel } from '@/components/DemoPanel';
import { AuditLog } from '@/components/AuditLog';

export default function Home() {
  const [instruction, setInstruction] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>('Spanish');
  const [useSimplification, setUseSimplification] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [steps, setSteps] = useState<Map<PipelineStep, StreamEvent>>(new Map());
  const [finalResult, setFinalResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);

  const fetchAuditLog = useCallback(async () => {
    try {
      const res = await fetch('/api/audit-log');
      const data = await res.json();
      setAuditLog(data);
    } catch {}
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!instruction.trim() || isLoading) return;
    setIsLoading(true);
    setSteps(new Map());
    setFinalResult(null);
    setError(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, targetLanguage, useSimplification }),
      });

      if (!response.ok || !response.body) {
        setError('Request failed. Check that your ANTHROPIC_API_KEY is set in .env.local and restart the server.');
        setIsLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event: StreamEvent = JSON.parse(line.slice(6));
            setSteps(prev => new Map(prev).set(event.step, event));
            if (event.step === 'done') {
              if (event.final) {
                setFinalResult(event.final);
                fetchAuditLog();
              }
              if (event.status === 'error') {
                setError(event.error ?? 'Analysis failed unexpectedly.');
              }
              setIsLoading(false);
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error. Is the server running?');
      setIsLoading(false);
    }
  }, [instruction, targetLanguage, useSimplification, isLoading, fetchAuditLog]);

  const handleSelectDemo = useCallback((demo: DemoCase) => {
    setInstruction(demo.instruction);
    setTargetLanguage(demo.targetLanguage);
    setUseSimplification(demo.useSimplification);
    setActiveDemoId(demo.id);
    setFinalResult(null);
    setSteps(new Map());
    setError(null);
  }, []);

  const simplificationResult =
    (steps.get('simplify')?.result as SimplificationResult | undefined) ?? null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold select-none">
              D
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-none">DoseGuard</h1>
              <p className="text-xs text-slate-500 mt-0.5">Medical Translation Safety Tool</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 text-right max-w-sm hidden sm:block">
            This tool supports translation safety review. It does not provide medical advice.
            Do not use for emergencies.
          </p>
        </div>
      </header>

      {/* Info Banner */}
      <div className="bg-blue-600 text-white text-xs py-2 px-4 text-center">
        High-risk or uncertain translations require clinician or certified interpreter review
        before patient use.
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-sm py-2.5 px-4 text-center">
          {error}
        </div>
      )}

      {/* Main 3-column grid */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-4 grid grid-cols-12 gap-4 items-start">
        {/* Left: Input — 3 cols */}
        <div className="col-span-12 md:col-span-3">
          <InputPanel
            instruction={instruction}
            setInstruction={setInstruction}
            targetLanguage={targetLanguage}
            setTargetLanguage={setTargetLanguage}
            useSimplification={useSimplification}
            setUseSimplification={setUseSimplification}
            onAnalyze={handleAnalyze}
            isLoading={isLoading}
            simplificationResult={simplificationResult}
          />
        </div>

        {/* Center: Pipeline Output — 6 cols */}
        <div className="col-span-12 md:col-span-6">
          <PipelinePanel steps={steps} finalResult={finalResult} isLoading={isLoading} />
        </div>

        {/* Right: Risk Analysis — 3 cols */}
        <div className="col-span-12 md:col-span-3">
          <RiskPanel finalResult={finalResult} isLoading={isLoading} />
        </div>
      </main>

      {/* Demo Panel */}
      <DemoPanel onSelectDemo={handleSelectDemo} activeDemoId={activeDemoId} />

      {/* Audit Log */}
      <AuditLog entries={auditLog} />
    </div>
  );
}
