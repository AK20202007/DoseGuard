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

  return (
    <div>
      <p className="text-xs text-slate-500 mb-3 leading-relaxed">
        The translation was re-read back into English. Highlighted rows show where meaning changed — these are the fields most likely to cause a dosing error.
      </p>
    <div className="overflow-x-auto -mx-4">
      <table className="w-full text-xs border-collapse min-w-[500px]">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left py-2 px-4 font-semibold text-slate-500 uppercase tracking-wide w-1/4">
              Field
            </th>
            <th className="text-left py-2 px-3 font-semibold text-slate-500 uppercase tracking-wide w-[37.5%]">
              Original
            </th>
            <th className="text-left py-2 px-3 font-semibold text-slate-500 uppercase tracking-wide w-[37.5%]">
              After re-reading
            </th>
          </tr>
        </thead>
        <tbody>
          {FIELD_LABELS.map(({ key, label }) => {
            const srcRaw = sourceFields[key] as string | string[] | null;
            const backRaw = backTranslatedFields[key] as string | string[] | null;
            if (isFieldEmpty(srcRaw) && isFieldEmpty(backRaw)) return null;

            const issues = driftByField.get(key) ?? [];
            const topIssue = issues[0];
            const style = topIssue ? SEVERITY_STYLES[topIssue.severity] : null;
            const srcVal = formatValue(srcRaw);
            const backVal = formatValue(backRaw);

            return (
              <tr
                key={key}
                className={`border-b border-slate-100 ${style?.row ?? 'hover:bg-slate-50'} ${style?.border ?? ''}`}
              >
                <td className="py-2 px-4 font-medium text-slate-700">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {label}
                    {topIssue && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${style?.badge}`}>
                        {topIssue.severity}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 px-3 text-slate-800">{srcVal}</td>
                <td className="py-2 px-3">
                  <span className={topIssue ? 'font-semibold' : 'text-slate-800'}>{backVal}</span>
                  {topIssue && (
                    <div className="text-slate-500 mt-0.5 font-normal leading-tight">
                      {topIssue.explanation}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
