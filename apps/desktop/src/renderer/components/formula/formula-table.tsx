import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { SubjectView } from '../../lib/subjects/subject-view';
import type { FormulaStatus, FormulaView } from '../../lib/formulas/formula-view';
import { FormulaRow } from './formula-row';

const COLUMNS = ['1.2fr', '1.4fr', '0.9fr', '0.9fr', '0.7fr', '56px'] as const;

/** The formulas list as an accessible grid-styled table, mirroring `SubjectTable`. */
export function FormulaTable({
  formulas,
  variant,
  subjectsById,
}: {
  formulas: readonly FormulaView[];
  variant: FormulaStatus;
  subjectsById: ReadonlyMap<string, SubjectView>;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('formulas.table.name')}</DataTableHead>
            <DataTableHead>{t('formulas.table.subjects')}</DataTableHead>
            <DataTableHead>{t('formulas.table.price')}</DataTableHead>
            <DataTableHead>{t('formulas.table.kind')}</DataTableHead>
            <DataTableHead>{t('formulas.table.state')}</DataTableHead>
            <DataTableHead className="text-end">
              <span className="sr-only">{t('formulas.table.actions')}</span>
            </DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {formulas.map((formula) => (
            <FormulaRow key={formula.id} formula={formula} variant={variant} subjectsById={subjectsById} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
