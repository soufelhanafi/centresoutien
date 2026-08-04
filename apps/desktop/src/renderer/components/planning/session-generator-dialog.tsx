import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCog } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  Skeleton,
  toast,
} from '@centresoutien/ui';
import { useSessionFormOptions } from '../../hooks/planning/use-session-form-options';
import { usePreviewSchedule } from '../../hooks/planning/use-preview-schedule';
import { useCommitSchedule } from '../../hooks/planning/use-commit-schedule';
import { useFeature } from '../../hooks/use-feature';
import {
  EMPTY_GENERATOR_FORM,
  toGeneratorConfig,
  type GeneratorFormValues,
} from '../../lib/planning/session-generator-schema';
import type { GeneratorRange } from '../../lib/planning/session-generator-gateway';
import { toCommitProposals } from '../../lib/planning/session-generator-view';
import { mapGeneratorError, type GeneratorErrorCode } from '../../lib/planning/session-generator-error';
import { SessionGeneratorConfigForm } from './session-generator-config-form';
import { SessionGeneratorPreview } from './session-generator-preview';

/** Today as `YYYY-MM-DD` in local time — the sensible default start of a generation window. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * The auto-session-generator popup (SOU-159): a two-step config → dry-run-preview
 * flow. The config step round-trips into the domain engine's `SessionGeneratorConfig`
 * and calls `session.generator.preview` (**zero writes**); the preview step shows
 * exactly what would be created and only `session.generator.commit` — behind the
 * footer's "Generate" button — ever persists. The config form stays mounted
 * (hidden) during preview so "Back" preserves every field.
 */
export function SessionGeneratorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const options = useSessionFormOptions();
  const preview = usePreviewSchedule();
  const commit = useCommitSchedule();
  const hasRandomAuto = useFeature('planning.random-auto');

  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [previewErrorCode, setPreviewErrorCode] = useState<GeneratorErrorCode | null>(null);
  const [range, setRange] = useState<GeneratorRange | null>(null);
  // Pro (no `planning.random-auto`) opens straight into Custom mode — Auto is
  // visible-but-locked, never the pre-selected default for a plan that can't use it.
  const defaultValues = useMemo<GeneratorFormValues>(
    () => ({ ...EMPTY_GENERATOR_FORM, startDate: today(), mode: hasRandomAuto ? 'auto' : 'custom' }),
    [hasRandomAuto],
  );

  const close = (next: boolean) => {
    if (!next) {
      setStep('config');
      setPreviewErrorCode(null);
      preview.reset();
      commit.reset();
    }
    onOpenChange(next);
  };

  const runPreview = async (values: GeneratorFormValues) => {
    setPreviewErrorCode(null);
    const config = toGeneratorConfig(values);
    try {
      await preview.mutateAsync(config);
      setRange(config.range);
      setStep('preview');
    } catch (error) {
      const code = mapGeneratorError(error);
      if (code) setPreviewErrorCode(code);
      else toast.error(t('planning.generator.error'));
    }
  };

  const runCommit = async () => {
    if (preview.data === undefined || range === null) return;
    const proposals = toCommitProposals(preview.data.proposals);
    if (proposals.length === 0) return;
    try {
      const result = await commit.mutateAsync({ proposals, range });
      const created = result.templates.length;
      const skipped = result.templates.reduce((sum, template) => sum + template.skippedHolidays.length, 0);
      toast.success(t('planning.generator.commitSuccess', { count: created }));
      if (skipped > 0) toast.warning(t('planning.generator.commitSkipped', { count: skipped }));
      close(false);
    } catch (error) {
      const code = mapGeneratorError(error);
      toast.error(code ? t(`errors.${code}`) : t('planning.generator.error'));
    }
  };

  const canCommit =
    preview.data !== undefined && toCommitProposals(preview.data.proposals).length > 0 && !commit.isPending;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCog className="h-5 w-5" aria-hidden="true" />
            {t('planning.generator.title')}
          </DialogTitle>
          <DialogDescription>
            {step === 'config' ? t('planning.generator.configDescription') : t('planning.generator.previewDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 overflow-y-auto px-1 py-2">
          {options.isPending ? (
            <div className="space-y-4" aria-busy="true">
              {[0, 1, 2, 3, 4].map((row) => (
                <Skeleton key={row} className="h-10 w-full" />
              ))}
            </div>
          ) : options.isError || options.data === undefined ? (
            <ErrorState
              title={t('planning.generator.optionsError.title')}
              description={t('planning.generator.optionsError.body')}
            />
          ) : (
            <>
              <div className={step === 'config' ? '' : 'hidden'}>
                <SessionGeneratorConfigForm
                  formId={formId}
                  options={options.data}
                  defaultValues={defaultValues}
                  onSubmit={runPreview}
                  errorCode={previewErrorCode}
                />
              </div>
              {step === 'preview' && preview.data !== undefined && range !== null ? (
                <SessionGeneratorPreview result={preview.data} range={range} options={options.data} />
              ) : null}
            </>
          )}
        </div>

        <DialogFooter>
          {step === 'config' ? (
            <>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                {t('planning.form.cancel')}
              </Button>
              <Button type="submit" form={formId} disabled={preview.isPending || options.data === undefined}>
                {preview.isPending ? t('planning.generator.previewing') : t('planning.generator.previewAction')}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => setStep('config')}>
                {t('planning.generator.back')}
              </Button>
              <Button type="button" onClick={() => void runCommit()} disabled={!canCommit}>
                {commit.isPending ? t('planning.generator.committing') : t('planning.generator.commitAction')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
