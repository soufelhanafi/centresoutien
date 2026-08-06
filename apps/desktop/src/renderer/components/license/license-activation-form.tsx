import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Upload } from 'lucide-react';
import { Button, Label, Textarea } from '@centresoutien/ui';
import { useActivateLicense } from '../../hooks/license/use-activate-license';
import type { LicenseActivateResult } from '../../lib/license/license-contract';

const LICENSE_FILE_ACCEPT = '.json,.lic,.key,.txt';

/**
 * Paste-or-import activation form (SOU-104). The license text is read entirely in
 * the renderer — pasted into the textarea or loaded from a file via the browser
 * `File` API (no `fs`, no native dialog) — then sent as the single `license`
 * field the `license.activate` channel accepts. The result is shown inline:
 * a success note, or the specific rejection message keyed on `reason`.
 */
export function LicenseActivationForm({ onActivated }: { onActivated?: () => void }) {
  const { t } = useTranslation();
  const activate = useActivateLicense();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState<LicenseActivateResult | null>(null);
  const [threw, setThrew] = useState(false);

  const onImportClick = () => fileInputRef.current?.click();

  const clearFeedback = () => {
    setResult(null);
    setThrew(false);
  };

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setText(await file.text());
    clearFeedback();
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const outcome = await activate.mutateAsync(text);
      setResult(outcome);
      setThrew(false);
      if (outcome.status === 'activated') onActivated?.();
    } catch {
      setResult(null);
      setThrew(true);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="license-input">{t('license.form.label')}</Label>
        <Textarea
          id="license-input"
          dir="ltr"
          rows={5}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            clearFeedback();
          }}
          placeholder={t('license.form.placeholder')}
          className="font-mono text-xs"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={onImportClick}>
          <Upload className="size-4" aria-hidden="true" />
          {t('license.form.import')}
        </Button>
        <Button type="submit" disabled={activate.isPending || text.trim().length === 0}>
          {activate.isPending && (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          {activate.isPending ? t('license.form.activating') : t('license.form.activate')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={LICENSE_FILE_ACCEPT}
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {result?.status === 'activated' && (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-md border border-primary/30 bg-primary/10 p-4 text-foreground"
        >
          <p className="text-sm font-medium text-primary">{t('license.form.successTitle')}</p>
          <p className="text-sm">{t('license.form.successBody')}</p>
        </div>
      )}

      {result?.status === 'rejected' && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <p className="text-sm">{t(`license.reasons.${result.reason}`)}</p>
        </div>
      )}

      {threw && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <p className="text-sm">{t('license.form.errorGeneric')}</p>
        </div>
      )}
    </form>
  );
}
