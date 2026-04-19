import type { MedicationFields, DriftIssue } from '@/lib/types';

type Props = {
  sourceFields: MedicationFields;
  backTranslatedFields: MedicationFields;
  driftIssues: DriftIssue[];
};

const FIELD_LABELS: { key: keyof MedicationFields; label: string }[] = [
  { key: 'medication_name', label: 'Medication' },
  { key: 'dosage_amount',   label: 'Dose Amount' },
  { key: 'dosage_unit',     label: 'Dose Unit' },
  { key: 'frequency',       label: 'Frequency' },
  { key: 'interval',        label: 'Interval' },
  { key: 'route',           label: 'Route' },
  { key: 'duration',        label: 'Duration' },
  { key: 'max_daily_dose',  label: 'Max Daily Dose' },
  { key: 'warnings',        label: 'Warnings' },
  { key: 'food_instruction', label: 'Food Instructions' },
  { key: 'patient_group',   label: 'Patient Group' },
  { key: 'conditionality',  label: 'Conditions' },
  { key: 'notes',           label: 'Notes' },
];

const SEVERITY_STYLES = {
  high: {
    row: 'bg-red-50/60',
    border: 'border-l-4 border-red-500',
    badge: 'bg-red-100 text-red-700 border border-red-200',
    label: 'High',
  },
  medium: {
    row: 'bg-amber-50/60',
    border: 'border-l-4 border-amber-400',
    badge: 'bg-amber-100 text-amber-700 border border-amber-200',
    label: 'Medium',
  },
  low: {
    row: 'bg-yellow-50/40',
    border: 'border-l-4 border-yellow-400',
    badge: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
    label: 'Low',
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
      <p className="text-sm text-on-surface-variant italic py-2">
        Field extraction returned no data. The instruction may be too short or extraction failed.
      </p>
    );
  }

  return (
    <div>
      <p className="text-xs text-on-surface-variant mb-4 leading-relaxed">
        The translation was re-read back into English. Highlighted rows show where meaning changed — these are fields most likely to cause a dosing error.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full text-left border-collapse min-w-[500px]">
          <thead>
            <tr className="bg-slate-50/70">
              <th className="px-5 py-3 text-[11px] font-black uppercase text-slate-400 tracking-widest w-1/4 font-label">
                Field
              </th>
              <th className="px-5 py-3 text-[11px] font-black uppercase text-slate-400 tracking-widest font-label">
                Original
              </th>
              <th className="px-5 py-3 text-[11px] font-black uppercase text-slate-400 tracking-widest font-label">
                After Re-reading
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
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
                  className={`transition-colors ${style?.row ?? 'hover:bg-slate-50/50'} ${style?.border ?? ''}`}
                >
                  <td className="px-5 py-3 font-medium text-sm text-on-surface">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {label}
                      {topIssue && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-label font-bold ${style?.badge}`}>
                          {style?.label}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-on-surface">{srcVal}</td>
                  <td className="px-5 py-3 text-sm">
                    <span className={topIssue ? 'font-semibold text-on-surface' : 'text-on-surface'}>
                      {backVal}
                    </span>
                    {topIssue && (
                      <p className="text-xs text-on-surface-variant mt-1 leading-relaxed font-normal">
                        {topIssue.explanation}
                      </p>
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
