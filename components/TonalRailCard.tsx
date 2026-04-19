'use client';

import type { TonalRailResult, TonalNumeralRow } from '@/lib/types';

function StatusBadge({ row }: { row: TonalNumeralRow }) {
  if (row.status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-semibold">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        {row.encoding === 'arabic' ? 'Arabic' : 'Verified'}
      </span>
    );
  }
  const color = row.issue?.medicalRisk === 'critical' ? 'text-red-400' : 'text-orange-400';
  const label = row.issue?.issueType === 'missing_numeral' ? 'Missing'
    : row.issue?.issueType === 'wrong_numeral' ? 'Wrong'
    : 'Diacritic error';
  return <span className={`text-xs font-semibold ${color}`}>✗ {label}</span>;
}

export function TonalRailCard({ result }: { result: TonalRailResult }) {
  if (!result.ran) return null;

  const statusColor = result.passed ? 'text-emerald-400'
    : result.issues.some(i => i.medicalRisk === 'critical') ? 'text-red-400'
    : 'text-amber-400';
  const statusLabel = result.passed ? 'Passed'
    : result.issues.some(i => i.medicalRisk === 'critical') ? 'Critical'
    : 'Warning';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Tonal / Numeral Rail
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
          <span className={result.mT5Available ? 'text-blue-400' : 'text-slate-600'}>
            mT5 {result.mT5Available ? '●' : '○'}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-3 leading-relaxed">{result.summary}</p>

      {/* Checked numerals only — compact */}
      {result.numeralRows.length > 0 && (
        <div className="rounded-lg overflow-x-auto border border-slate-800 mb-3">
          <table className="w-full text-xs min-w-[400px]">
            <thead>
              <tr className="bg-slate-800/60">
                <th className="text-left px-3 py-2 text-slate-400 font-medium w-14">Digit</th>
                <th className="text-left px-3 py-2 text-slate-400 font-medium">Canonical</th>
                <th className="text-left px-3 py-2 text-slate-400 font-medium">Found</th>
                {result.mT5Available && (
                  <th className="text-left px-3 py-2 text-slate-400 font-medium">mT5</th>
                )}
                <th className="text-left px-3 py-2 text-slate-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {result.numeralRows.map(row => (
                <tr
                  key={row.digit}
                  className={row.status === 'fail'
                    ? row.issue?.medicalRisk === 'critical' ? 'bg-red-950/20' : 'bg-orange-950/20'
                    : ''}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="bg-slate-800 text-slate-300 rounded px-1.5 py-0.5 font-mono font-bold">
                      {row.digit}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-300 whitespace-nowrap">{row.canonicalForm}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.encoding === 'arabic'
                      ? <span className="text-slate-500 italic text-xs">Arabic</span>
                      : <span className="font-mono text-slate-200">{row.claudeForm}</span>
                    }
                  </td>
                  {result.mT5Available && (
                    <td className="px-3 py-2 font-mono text-blue-300 whitespace-nowrap">
                      {row.issue?.mT5Form ?? '—'}
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatusBadge row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Issue details for failures only */}
      {result.issues.length > 0 && (
        <div className="space-y-2">
          {result.issues.map((issue, i) => {
            const color = issue.medicalRisk === 'critical'
              ? 'border-red-500 bg-red-950/40 text-red-200'
              : issue.medicalRisk === 'high'
                ? 'border-orange-500 bg-orange-950/40 text-orange-200'
                : 'border-yellow-500 bg-yellow-950/40 text-yellow-200';
            return (
              <div key={i} className={`rounded-lg px-3 py-2.5 border-l-2 text-xs ${color}`}>
                <div className="font-semibold mb-0.5 capitalize">
                  {issue.issueType.replace(/_/g, ' ')} · digit {issue.expectedDigit} · {issue.medicalRisk}
                </div>
                <div className="opacity-80 leading-relaxed">{issue.explanation}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
