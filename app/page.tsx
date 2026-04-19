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
import DemoApp from '@/components/demo/DemoApp';

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
  const [activeTab, setActiveTab] = useState<'analyze' | 'pillscan'>('analyze');

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
          } catch {}
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
    <div className="min-h-screen bg-[#f7f9fc] font-sans">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-100 flex-col px-4 py-6 z-[60] overflow-y-auto hidden md:flex">
        <div className="mb-8 px-2">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-white"
                style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}
              >
                shield
              </span>
            </div>
            <h2 className="text-sm font-black text-blue-900 uppercase tracking-widest leading-none">
              DoseGuard
            </h2>
          </div>
          <p className="text-[10px] font-bold text-blue-700/60 uppercase tracking-widest pl-[42px]">
            Clinical Safety
          </p>
        </div>

        <nav className="flex-1 space-y-1">
          <button
            onClick={() => setActiveTab('analyze')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded transition-all text-left ${
              activeTab === 'analyze'
                ? 'bg-white text-blue-700 font-bold shadow-sm translate-x-1'
                : 'text-slate-500 hover:bg-white/60'
            }`}
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: activeTab === 'analyze' ? "'FILL' 1" : "'FILL' 0" }}
            >
              health_and_safety
            </span>
            <span className="text-sm">Analyze</span>
          </button>
          <button
            onClick={() => setActiveTab('pillscan')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded transition-all text-left ${
              activeTab === 'pillscan'
                ? 'bg-white text-blue-700 font-bold shadow-sm translate-x-1'
                : 'text-slate-500 hover:bg-white/60'
            }`}
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: activeTab === 'pillscan' ? "'FILL' 1" : "'FILL' 0" }}
            >
              medication
            </span>
            <span className="text-sm">Pill Scanner</span>
          </button>
          <div
            className={`flex items-center gap-3 px-3 py-2.5 rounded cursor-default transition-all ${
              activeDemoId
                ? 'text-blue-600 font-semibold'
                : 'text-slate-500'
            }`}
          >
            <span className="material-symbols-outlined text-xl">science</span>
            <span className="text-sm">Demo Cases</span>
          </div>
          <div
            className={`flex items-center gap-3 px-3 py-2.5 rounded cursor-default transition-all ${
              auditLog.length > 0 ? 'text-slate-600' : 'text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-xl">history</span>
            <span className="text-sm">Session Log</span>
            {auditLog.length > 0 && (
              <span className="ml-auto text-[10px] font-bold bg-primary text-white rounded px-1.5 py-0.5">
                {auditLog.length}
              </span>
            )}
          </div>
        </nav>

        <div className="mt-auto pt-4 border-t border-slate-200/60 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2 text-slate-400 cursor-default">
            <span className="material-symbols-outlined text-xl">description</span>
            <span className="text-xs">Safety Docs</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 text-slate-400 cursor-default">
            <span className="material-symbols-outlined text-xl">contact_support</span>
            <span className="text-xs">Support</span>
          </div>
          <div className="mx-1 mt-3 p-3 bg-white rounded border border-slate-200/60">
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Not for emergencies. High-risk results require clinician or certified interpreter review before patient use.
            </p>
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="md:ml-64 flex flex-col min-h-screen">

        {/* Top Bar */}
        <header className="sticky top-0 z-50 bg-[#f7f9fc]/90 backdrop-blur-xl border-b border-slate-200/60 px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {/* Mobile brand */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="w-7 h-7 bg-primary rounded flex items-center justify-center">
                <span
                  className="material-symbols-outlined text-white"
                  style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
                >
                  shield
                </span>
              </div>
              <span className="text-sm font-black text-blue-900 uppercase tracking-widest">
                DoseGuard
              </span>
            </div>
            <span className="px-2 py-0.5 bg-primary-fixed text-on-primary-fixed text-[10px] font-bold uppercase tracking-widest rounded hidden md:inline">
              {isLoading ? 'Processing' : 'Operational'}
            </span>
            <span className="text-sm font-bold text-on-surface hidden md:block">
              Translation Safety Analysis
            </span>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-on-surface-variant hidden lg:block max-w-sm text-right leading-relaxed">
              High-risk results require clinician review before patient use
            </p>
            <div className="flex items-center">
              <button className="p-1.5 text-slate-500 hover:bg-slate-200/50 rounded transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  notifications
                </span>
              </button>
              <button className="p-1.5 text-slate-500 hover:bg-slate-200/50 rounded transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  settings
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 text-xs py-2.5 px-6 flex items-center gap-2">
            <span
              className="material-symbols-outlined text-red-500 flex-shrink-0"
              style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
            >
              error
            </span>
            {error}
          </div>
        )}

        {activeTab === 'analyze' ? (
          <>
            {/* 3-Column Grid */}
            <div className="p-5 grid grid-cols-12 gap-5 flex-1 items-start max-w-[1600px] w-full mx-auto">
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
              <div className="col-span-12 md:col-span-6">
                <PipelinePanel steps={steps} finalResult={finalResult} isLoading={isLoading} />
              </div>
              <div className="col-span-12 md:col-span-3">
                <RiskPanel finalResult={finalResult} isLoading={isLoading} />
              </div>
            </div>

            {/* Demo Panel */}
            <DemoPanel onSelectDemo={handleSelectDemo} activeDemoId={activeDemoId} />

            {/* Audit Log */}
            <AuditLog entries={auditLog} />
          </>
        ) : (
          <div className="flex-1 overflow-auto">
            <DemoApp />
          </div>
        )}

        {/* Footer */}
        <footer className="bg-[#f2f4f7] border-t border-slate-200/60 py-5 px-6 mt-auto">
          <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
            <span className="text-xs font-bold text-primary">DoseGuard Clinical Safety</span>
            <div className="flex gap-5 text-xs text-on-surface-variant">
              <span className="cursor-default">Privacy Policy</span>
              <span className="cursor-default">Clinical Protocol</span>
            </div>
            <p className="text-xs text-on-surface-variant">
              © 2024 DoseGuard | Translation Safety Verification
            </p>
          </div>
        </footer>
      </main>

      {/* ── Mobile Bottom Nav ────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 w-full z-50 md:hidden flex justify-around items-center pt-2 pb-6 px-4 bg-white/80 backdrop-blur-md border-t border-slate-200/20 shadow-[0_-4px_24px_rgba(25,28,30,0.06)]">
        <button
          onClick={() => setActiveTab('analyze')}
          className={`flex flex-col items-center px-4 py-1 rounded ${activeTab === 'analyze' ? 'text-primary bg-primary-fixed' : 'text-slate-500'}`}
        >
          <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: activeTab === 'analyze' ? "'FILL' 1" : "'FILL' 0" }}>
            health_and_safety
          </span>
          <span className="text-[10px] font-medium">Analyze</span>
        </button>
        <button
          onClick={() => setActiveTab('pillscan')}
          className={`flex flex-col items-center px-4 py-1 rounded ${activeTab === 'pillscan' ? 'text-primary bg-primary-fixed' : 'text-slate-500'}`}
        >
          <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: activeTab === 'pillscan' ? "'FILL' 1" : "'FILL' 0" }}>
            medication
          </span>
          <span className="text-[10px] font-medium">Pill Scan</span>
        </button>
        <div className="flex flex-col items-center text-slate-500 px-4 py-1 cursor-default">
          <span className="material-symbols-outlined mb-0.5">science</span>
          <span className="text-[10px] font-medium">Demo</span>
        </div>
        <div className="flex flex-col items-center text-slate-500 px-4 py-1 cursor-default">
          <span className="material-symbols-outlined mb-0.5">history</span>
          <span className="text-[10px] font-medium">Log</span>
        </div>
      </nav>
    </div>
  );
}
