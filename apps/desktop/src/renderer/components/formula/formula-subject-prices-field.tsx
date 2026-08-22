import { useEffect, useId } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Input, Label, Numeric, Skeleton, Switch } from '@centresoutien/ui';
import { useSubjects } from '../../hooks/subject/use-subjects';
import { localizedSubjectName } from '../../lib/subjects/localized-name';
import { centimesToMad, madToCentimes } from '../../lib/formulas/price-mad';
import { formatMoneyMad } from '../../lib/format';
import { sumSubjectPrices, validateSubjectPrices } from '../../lib/formulas/subject-prices';
import type { FormulaFormValues } from '../../lib/formulas/formula-form-schema';

/**
 * The formula's optional per-subject price map (SOU-298). A switch opts into
 * splitting the bundle total across the selected subjects; when on, one MAD
 * input per subject appears, kept in lock-step with the subject multi-select, and
 * a live sum-vs-total line plus an inline error surface coverage / positive /
 * sum-mismatch problems before save. When off, the bundle stays equal-split and
 * no map is sent. Covers loading / error / empty (no subjects picked yet) states.
 */
export function FormulaSubjectPricesField() {
  const { t, i18n } = useTranslation();
  const fieldId = useId();
  const { control, setValue } = useFormContext<FormulaFormValues>();
  const query = useSubjects('all');

  const enabled = useWatch({ control, name: 'usePerSubjectPricing' });
  const subjectIds = useWatch({ control, name: 'subjectIds' }) ?? [];
  const priceMad = useWatch({ control, name: 'priceMad' });
  const subjectPrices = useWatch({ control, name: 'subjectPrices' }) ?? [];

  useEffect(() => {
    if (!enabled) return;
    const byId = new Map(subjectPrices.map((price) => [price.subjectId, price]));
    const reconciled = subjectIds.map((id) => byId.get(id) ?? { subjectId: id, priceMad: Number.NaN });
    const misaligned =
      reconciled.length !== subjectPrices.length ||
      reconciled.some((price, index) => subjectPrices[index]?.subjectId !== price.subjectId);
    if (misaligned) setValue('subjectPrices', reconciled, { shouldValidate: false });
  }, [enabled, subjectIds, subjectPrices, setValue]);

  const nameOf = (subjectId: string): string => {
    const subject = query.data?.find((candidate) => candidate.id === subjectId);
    return subject ? localizedSubjectName(subject.name, i18n.language) : subjectId;
  };

  const updatePrice = (subjectId: string, centimes: number) =>
    setValue(
      'subjectPrices',
      subjectPrices.map((price) => (price.subjectId === subjectId ? { ...price, priceMad: centimes } : price)),
      { shouldValidate: true, shouldDirty: true },
    );

  const liveCode = enabled
    ? validateSubjectPrices({ subjectIds, subjectPrices, totalMad: priceMad })
    : null;
  const sumMad = sumSubjectPrices(subjectPrices);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <Label htmlFor={`${fieldId}-toggle`} className="font-medium">
            {t('formulas.form.perSubjectPrices.label')}
          </Label>
          <p className="text-xs text-muted-foreground">{t('formulas.form.perSubjectPrices.hint')}</p>
        </div>
        <Switch
          id={`${fieldId}-toggle`}
          checked={enabled}
          onCheckedChange={(checked) => setValue('usePerSubjectPricing', checked, { shouldValidate: true })}
        />
      </div>

      {enabled &&
        (query.isPending ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1].map((row) => (
              <Skeleton key={row} className="h-9 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="text-sm text-destructive">{t('formulas.form.subjectsError')}</p>
        ) : subjectIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('formulas.form.perSubjectPrices.pickSubjects')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {subjectIds.map((subjectId) => {
              const entry = subjectPrices.find((price) => price.subjectId === subjectId);
              const inputId = `${fieldId}-${subjectId}`;
              return (
                <div key={subjectId} className="flex items-center justify-between gap-3">
                  <Label htmlFor={inputId} className="font-normal">
                    {nameOf(subjectId)}
                  </Label>
                  <Input
                    id={inputId}
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step={0.01}
                    dir="ltr"
                    className="w-32"
                    value={entry && Number.isFinite(entry.priceMad) ? centimesToMad(entry.priceMad) : ''}
                    onChange={(event) =>
                      updatePrice(
                        subjectId,
                        event.target.value === '' ? Number.NaN : madToCentimes(event.target.valueAsNumber),
                      )
                    }
                  />
                </div>
              );
            })}

            <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
              <span className="text-muted-foreground">{t('formulas.form.perSubjectPrices.sum')}</span>
              <Numeric className={liveCode === 'formula-subject-prices-sum-mismatch' ? 'text-destructive' : ''}>
                {t('formulas.form.perSubjectPrices.sumOfTotal', {
                  sum: formatMoneyMad(sumMad, i18n.language),
                  total: Number.isFinite(priceMad)
                    ? formatMoneyMad(priceMad, i18n.language)
                    : formatMoneyMad(0, i18n.language),
                })}
              </Numeric>
            </div>

            {liveCode !== null && <p className="text-sm text-destructive">{t(`errors.${liveCode}`)}</p>}
          </div>
        ))}
    </div>
  );
}
