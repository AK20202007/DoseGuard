import type { MedicationFields, DriftIssue } from '@/lib/types';

type Props = {
  sourceFields: MedicationFields;
  backTranslatedFields: MedicationFields;
  driftIssues: DriftIssue[];
};

const FIELD_LABELS: { key: keyof MedicationFields; label: string }[] = [
  { key: 'medication_name', label: 'Medication' },
  { key: 'dosage_amount', label: 'Dose Amount' },
  { key: 'dosage_unit', label: 'Dose Unit' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'interval', label: 'Interval' },
  { key: 'route', label: 'Route' },
  { key: 'duration', label: 'Duration' },
  { key: 'max_daily_dose', label: 'Max Daily Dose' },
  { key: 'warnings', label: 'Warnings' },
  { key: 'food_instruction', label: 'Food Instructions' },
  { key: 'patient_group', label: 'Patient Group' },
  { key: 'conditionality', label: 'Conditions' },
  { key: 'notes', label: 'Notes' },
];

const SEVERITY_STYLES = {
  high: {
    row: 'bg-red-50',
    border: 'border-l-4 border-red-500',
    badge: 'bg-red-100 text-red-700 border border-red-200',
  },
  medium: {
    row: 'bg-amber-50',
    border: 'border-l-4 border-amber-500',
    badge: 'bg-amber-100 text-amber-700 border border-amber-200',
  },
  low: {
    row: 'bg-yellow-50',
    border: 'border-l-4 border-yellow-400',
    badge: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  },
};

function formatValue(value: string | string[] | null): string {
  if (value === null) return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join('; ');
  return value;
}

function isFieldEmpty(value: string | string[] | null): boolean {
  if (value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function FieldComparisonTable({ sourceFields, backTranslatedFields, driftIssues }: Props) {
  const driftByField = new Map<keyof MedicationFields, DriftIssue[]>();
  for (const issue of driftIssues) {
    const existing = driftByField.get(issue.field) ?? [];
    driftByField.set(issue.field, [...existing, issue]);
  }

  const hasAnyData = FIELD_LABELS.some(({ key }) => !isFieldEmpty(sourceFields[key] as string | string[] | null));

  if (!hasAnyData) {
    return (
      <p className="text-sm text-slate-500 italic py-2">
        Field extraction returned no data. The instruction may be too short or extraction failed.
      </p>
    );
  }

  const noDrift = driftIssues.length === 0;

  return (
    <div className="overflow-x-auto">
      {noDrift && hasAnyData && (
        <div className="flex items-center gap-1.5 mb-3 text-xs text-emerald-500">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          All extracted fields match — no semantic drift detected
        </div>
      )}
      <table className="w-full text-xs border-collapse min-w-[600px]">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left py-2 pr-4 font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap min-w-[130px]">Field</th>
            <th className="text-left py-2 px-3 font-semibold text-slate-500 uppercase tracking-widest min-w-[220px]">Source</th>
            <th className="text-left py-2 px-3 font-semibold text-slate-500 uppercase tracking-widest min-w-[220px]">Back-Translation</th>
          </tr>
        </thead>
        <tbody>
          {FIELD_LABELS.map(({ key, label }) => {
            const srcRaw = sourceFields[key] as string | string[] | null;
            const backRaw = backTranslatedFields[key] as string | string[] | null;
            const bothEmpty = isFieldEmpty(srcRaw) && isFieldEmpty(backRaw);

            const issues = driftByField.get(key) ?? [];
            const topIssue = issues[0];
            const srcVal = formatValue(srcRaw);
            const backVal = formatValue(backRaw);
            const rowAccent = topIssue?.severity === 'high' ? 'border-l-2 border-red-500 pl-2' :
              topIssue?.severity === 'medium' ? 'border-l-2 border-amber-500 pl-2' :
              topIssue ? 'border-l-2 border-yellow-500 pl-2' : '';

            return (
              <tr key={key} className={`border-b border-slate-800/60 transition-colors ${bothEmpty ? 'opacity-35' : 'hover:bg-slate-800/30'}`}>
                <td className={`py-2.5 pr-4 font-medium text-slate-300 whitespace-nowrap ${rowAccent}`}>
                  <div>{label}</div>
                  {topIssue && (
                    <span className={`text-xs font-normal ${
                      topIssue.severity === 'high' ? 'text-red-400' :
                      topIssue.severity === 'medium' ? 'text-amber-400' : 'text-yellow-400'
                    }`}>{topIssue.severity}</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-slate-400">{srcVal}</td>
                <td className="py-2.5 px-3">
                  <span className={topIssue ? 'text-red-300 font-semibold' : 'text-slate-400'}>{backVal}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
