'use client';

import type { TonalRailResult, TonalNumeralRow } from '@/lib/types';

function StatusBadge({ row }: { row: TonalNumeralRow }) {
  if (row.status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 text-xs font-semibold">
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
        >
          check_circle
        </span>
        {row.encoding === 'arabic' ? 'Arabic' : 'Verified'}
      </span>
    );
  }
  const color = row.issue?.medicalRisk === 'critical' ? 'text-red-600' : 'text-amber-600';
  const label =
    row.issue?.issueType === 'missing_numeral' ? 'Missing' :
    row.issue?.issueType === 'wrong_numeral' ? 'Wrong' :
    'Diacritic error';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
      >
        cancel
      </span>
      {label}
    </span>
  );
}

export function TonalRailCard({ result }: { result: TonalRailResult }) {
  if (!result.ran) return null;

  const headerColor = result.passed
    ? 'text-green-600'
    : result.issues.some(i => i.medicalRisk === 'critical')
      ? 'text-red-600'
      : 'text-amber-600';
  const statusLabel = result.passed
    ? 'Passed'
    : result.issues.some(i => i.medicalRisk === 'critical')
      ? 'Critical'
      : 'Warning';

  return (
    <div className="bg-surface-container-lowest rounded-lg overflow-hidden shadow-sm border border-slate-100">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
        >
          spellcheck
        </span>
        <div className="flex-1">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label">
            Tonal / Numeral Rail · Yoruba
          </p>
          <h3 className="text-sm font-bold text-on-surface leading-none mt-0.5">
            Diacritic Integrity Check
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-bold font-label ${headerColor}`}>{statusLabel}</span>
          <span className={`text-[10px] font-label ${result.mT5Available ? 'text-primary' : 'text-slate-400'}`}>
            mT5 {result.mT5Available ? '●' : '○'}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-xs text-on-surface-variant leading-relaxed">{result.summary}</p>

        {result.numeralRows.length > 0 && (
          <div className="rounded border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs min-w-[400px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-slate-200">
                  <th className="text-left px-3 py-2 text-on-surface-variant font-label font-medium w-14">Digit</th>
                  <th className="text-left px-3 py-2 text-on-surface-variant font-label font-medium">Canonical</th>
                  <th className="text-left px-3 py-2 text-on-surface-variant font-label font-medium">Found</th>
                  {result.mT5Available && (
                    <th className="text-left px-3 py-2 text-on-surface-variant font-label font-medium">mT5</th>
                  )}
                  <th className="text-left px-3 py-2 text-on-surface-variant font-label font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.numeralRows.map(row => (
                  <tr
                    key={row.digit}
                    className={
                      row.status === 'fail'
                        ? row.issue?.medicalRisk === 'critical'
                          ? 'bg-red-50'
                          : 'bg-amber-50'
                        : ''
                    }
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="bg-surface-container-high text-on-surface rounded px-1.5 py-0.5 font-mono font-bold text-xs">
                        {row.digit}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-on-surface whitespace-nowrap">{row.canonicalForm}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.encoding === 'arabic'
                        ? <span className="text-on-surface-variant italic text-xs">Arabic numeral</span>
                        : <span className="font-mono text-on-surface">{row.claudeForm}</span>
                      }
                    </td>
                    {result.mT5Available && (
                      <td className="px-3 py-2 font-mono text-primary whitespace-nowrap">
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

        {result.issues.length > 0 && (
          <div className="space-y-2">
            {result.issues.map((issue, i) => (
              <div
                key={i}
                className={`rounded border-l-4 p-3 text-xs leading-relaxed ${
                  issue.medicalRisk === 'critical'
                    ? 'bg-red-50 border-red-500 text-red-900'
                    : issue.medicalRisk === 'high'
                      ? 'bg-amber-50 border-amber-400 text-amber-900'
                      : 'bg-yellow-50 border-yellow-400 text-yellow-900'
                }`}
              >
                <div className="font-bold mb-0.5 capitalize font-label">
                  {issue.issueType.replace(/_/g, ' ')} · digit {issue.expectedDigit} · {issue.medicalRisk}
                </div>
                <div className="opacity-80 leading-relaxed font-body">{issue.explanation}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
