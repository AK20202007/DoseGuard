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
        setError('Request failed. Check that ANTHROPIC_API_KEY is set in .env.local.');
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
              if (event.final) { setFinalResult(event.final); fetchAuditLog(); }
              if (event.status === 'error') setError(event.error ?? 'Analysis failed.');
              setIsLoading(false);
            }
          } catch {}
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
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
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <header className="flex-shrink-0 bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/30">
              D
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-none">DoseGuard</h1>
              <p className="text-slate-400 text-xs mt-0.5">Medical Translation Safety</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-blue-400 bg-blue-950 border border-blue-800 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              AI Safety Layer Active
            </span>
          </div>
        </div>
      </header>

      {/* Warning bar */}
      <div className="flex-shrink-0 bg-blue-600 text-white text-xs py-2 px-6 text-center font-medium">
        High-risk translations require clinician or certified interpreter review before patient use
      </div>

      {/* Error */}
      {error && (
        <div className="flex-shrink-0 bg-red-900/80 border-b border-red-700 text-red-200 text-sm py-2.5 px-6 text-center">
          {error}
        </div>
      )}

      {/* Body — 3 pane layout */}
      <div className="flex-1 flex overflow-hidden max-w-[1400px] w-full mx-auto">

        {/* Left pane — Input */}
        <div className="w-[300px] flex-shrink-0 border-r border-slate-800 overflow-y-auto bg-slate-900">
          <div className="p-5">
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
        </div>

        {/* Center pane — Pipeline */}
        <div className="flex-1 overflow-y-auto bg-slate-950 border-r border-slate-800">
          <div className="p-5">
            <PipelinePanel steps={steps} finalResult={finalResult} isLoading={isLoading} />
          </div>
        </div>

        {/* Right pane — Risk */}
        <div className="w-[300px] flex-shrink-0 overflow-y-auto bg-slate-900">
          <div className="p-5">
            <RiskPanel finalResult={finalResult} isLoading={isLoading} />
          </div>
        </div>
      </div>

      {/* Bottom demo strip */}
      <div className="flex-shrink-0 bg-slate-900 border-t border-slate-800">
        <DemoPanel onSelectDemo={handleSelectDemo} activeDemoId={activeDemoId} />
      </div>
      <AuditLog entries={auditLog} />
    </div>
  );
}
