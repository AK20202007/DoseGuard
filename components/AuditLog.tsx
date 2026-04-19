import type { AuditLogEntry } from '@/lib/types';
import { RiskBadge } from '@/components/RiskBadge';

type Props = {
  entries: AuditLogEntry[];
};

const REC_LABELS = {
  safe_to_use: 'Safe',
  use_with_caution: 'Use with Caution',
  human_review_required: 'Review Required',
};

export function AuditLog({ entries }: Props) {
  if (entries.length === 0) return null;

  return (
    <div className="border-t border-slate-200 bg-white px-4 py-4">
      <div className="max-w-[1600px] mx-auto">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Session Audit Log
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-1.5 px-2 font-medium text-slate-400">Time</th>
                <th className="text-left py-1.5 px-2 font-medium text-slate-400">Instruction</th>
                <th className="text-left py-1.5 px-2 font-medium text-slate-400">Language</th>
                <th className="text-left py-1.5 px-2 font-medium text-slate-400">Risk</th>
                <th className="text-left py-1.5 px-2 font-medium text-slate-400">Score</th>
                <th className="text-left py-1.5 px-2 font-medium text-slate-400">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="py-1.5 px-2 text-slate-400 whitespace-nowrap font-mono">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-1.5 px-2 text-slate-600 max-w-xs truncate">
                    {entry.instructionPreview}
                  </td>
                  <td className="py-1.5 px-2 text-slate-500">{entry.targetLanguage}</td>
                  <td className="py-1.5 px-2">
                    <RiskBadge riskLevel={entry.riskLevel} size="sm" />
                  </td>
                  <td className="py-1.5 px-2 text-slate-500 font-mono">{entry.riskScore}</td>
                  <td className="py-1.5 px-2 text-slate-500">{REC_LABELS[entry.recommendation]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
