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
  ScrollArea,
  Skeleton,
  toast,
} from '@centresoutien/ui';
import { useSessionFormOptions } from '../../hooks/planning/use-session-form-options';
import { usePreviewSchedule } from '../../hooks/planning/use-preview-schedule';
import { useSessionGeneratorCommit } from '../../hooks/planning/use-session-generator-commit';
import { useFeature } from '../../hooks/use-feature';
import {
  EMPTY_GENERATOR_FORM,
  toGeneratorConfig,
  type GeneratorFormValues,
} from '../../lib/planning/session-generator-schema';
import type { GeneratorRange } from '../../lib/planning/session-generator-gateway';
import { mapGeneratorError, type GeneratorErrorCode } from '../../lib/planning/session-generator-error';
import { SessionGeneratorConfigForm } from './session-generator-config-form';
import { SessionGeneratorPreview } from './session-generator-preview';
import { GeneratorPreviewFooter } from './generator-preview-footer';

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
  const commit = useSessionGeneratorCommit(preview.data);
  const hasRandomAuto = useFeature('planning.random-auto');

  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [previewErrorCode, setPreviewErrorCode] = useState<GeneratorErrorCode | null>(null);
  const [range, setRange] = useState<GeneratorRange | null>(null);
  const [mode, setMode] = useState<'auto' | 'custom' | null>(null);
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
      setMode(null);
      preview.reset();
      commit.resetCommit();
    }
    onOpenChange(next);
  };

  const runPreview = async (values: GeneratorFormValues) => {
    setPreviewErrorCode(null);
    const config = toGeneratorConfig(values);
    try {
      await preview.mutateAsync(config);
      setRange(config.range);
      setMode(config.mode);
      setStep('preview');
    } catch (error) {
      const code = mapGeneratorError(error);
      if (code) setPreviewErrorCode(code);
      else toast.error(t('planning.generator.error'));
    }
  };

  const submitCommit = () => {
    if (range === null || mode === null) return;
    void commit.runCommit({ range, mode, onCommitted: () => close(false) });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="flex max-h-[85vh] max-w-2xl flex-col"
        closeLabel={t('common.close')}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCog className="h-5 w-5" aria-hidden="true" />
            {t('planning.generator.title')}
          </DialogTitle>
          <DialogDescription>
            {step === 'config' ? t('planning.generator.configDescription') : t('planning.generator.previewDescription')}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1" contentClassName="-mx-1 px-1 py-2">
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
                <SessionGeneratorPreview
                  result={preview.data}
                  range={range}
                  options={options.data}
                  decisions={commit.decisions}
                />
              ) : null}
            </>
          )}
        </ScrollArea>

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
            <GeneratorPreviewFooter
              onBack={() => setStep('config')}
              onCommit={submitCommit}
              canCommit={commit.canCommit}
              isCommitting={commit.isCommitting}
              decisionRequired={!commit.decisions.allDecided}
              capacityBlocked={commit.capacityBlocked}
            />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
