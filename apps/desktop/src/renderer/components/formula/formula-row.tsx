import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { Badge, BilingualText, DataTableCell, DataTableRow, KindBadge, Numeric, Tooltip, TooltipContent, TooltipTrigger } from '@centresoutien/ui';
import type { SubjectView } from '../../lib/subjects/subject-view';
import { localizedSubjectName } from '../../lib/subjects/localized-name';
import type { FormulaStatus, FormulaView } from '../../lib/formulas/formula-view';
import { formatMad } from '../../lib/formulas/price-mad';
import { FormulaRowActions } from './formula-row-actions';

const kindLabelKey = (kind: FormulaView['kind']) => (kind === 'exam-prep' ? 'examPrep' : 'regular');

/** One formula row: bilingual name (+ lock badge once used), subjects, price, kind, state, actions. */
export function FormulaRow({
  formula,
  variant,
  subjectsById,
}: {
  formula: FormulaView;
  variant: FormulaStatus;
  subjectsById: ReadonlyMap<string, SubjectView>;
}) {
  const { t, i18n } = useTranslation();
  const subjects = formula.subjectIds
    .map((id) => subjectsById.get(id))
    .filter((subject): subject is SubjectView => subject !== undefined);

  return (
    <DataTableRow>
      <DataTableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{formula.name.fr}</span>
          {formula.isImmutable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label={t('formulas.table.locked')} />
              </TooltipTrigger>
              <TooltipContent>{t('formulas.table.lockedHint')}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <BilingualText value={formula.name.ar} script="arabic" className="mt-0.5 block text-xs text-muted-foreground" />
      </DataTableCell>
      <DataTableCell>
        <div className="flex flex-wrap gap-1">
          {subjects.map((subject) => (
            <span key={subject.id} className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
              {subject.code ?? localizedSubjectName(subject.name, i18n.language)}
            </span>
          ))}
        </div>
      </DataTableCell>
      <DataTableCell>
        <Numeric>{formatMad(formula.priceMad, i18n.language)}</Numeric>
      </DataTableCell>
      <DataTableCell>
        <KindBadge kind={formula.kind} label={t(`formulas.kind.${kindLabelKey(formula.kind)}`)} />
      </DataTableCell>
      <DataTableCell>
        {formula.active ? (
          <Badge variant="success" dot>
            {t('formulas.state.active')}
          </Badge>
        ) : (
          <Badge variant="neutral" dot>
            {t('formulas.state.inactive')}
          </Badge>
        )}
      </DataTableCell>
      <DataTableCell className="text-end">
        <FormulaRowActions formula={formula} variant={variant} />
      </DataTableCell>
    </DataTableRow>
  );
}
