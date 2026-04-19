import type { AuditLogEntry } from '@/lib/types';
import { RiskBadge } from '@/components/RiskBadge';

type Props = {
  entries: AuditLogEntry[];
};

const REC_LABELS = {
  safe_to_use: 'Safe to Use',
  use_with_caution: 'Use with Caution',
  human_review_required: 'Review Required',
};

export function AuditLog({ entries }: Props) {
  if (entries.length === 0) return null;

  return (
    <div className="border-t border-slate-200/60 bg-surface-container-lowest px-5 py-5">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-on-surface-variant"
              style={{ fontSize: '16px' }}
            >
              history
            </span>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label">
              Session Log
            </p>
          </div>
          <span className="text-[10px] font-bold text-on-surface bg-surface-container-high rounded px-2 py-0.5 font-label">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70">
                <th className="px-5 py-3 text-[11px] font-black uppercase text-slate-400 tracking-widest font-label">
                  Time
                </th>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-slate-400 tracking-widest font-label">
                  Instruction
                </th>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-slate-400 tracking-widest font-label">
                  Language
                </th>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-slate-400 tracking-widest font-label">
                  Risk
                </th>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-slate-400 tracking-widest text-right font-label">
                  Score
                </th>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-slate-400 tracking-widest font-label">
                  Recommendation
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {entries.map((entry, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3 text-xs text-on-surface-variant whitespace-nowrap font-mono">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-5 py-3 text-xs text-on-surface max-w-xs truncate">
                    {entry.instructionPreview}
                  </td>
                  <td className="px-5 py-3 text-xs text-on-surface-variant font-label">
                    {entry.targetLanguage}
                  </td>
                  <td className="px-5 py-3">
                    <RiskBadge riskLevel={entry.riskLevel} size="sm" />
                  </td>
                  <td className="px-5 py-3 text-sm font-bold text-on-surface text-right font-label">
                    {entry.riskScore}
                  </td>
                  <td className="px-5 py-3 text-xs text-on-surface-variant font-label">
                    {REC_LABELS[entry.recommendation]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
