import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon } from 'lucide-react';
import { LOGO_EXTENSIONS, logoUploadSchema } from '@centresoutien/domain';
import { Button, Label, toast } from '@centresoutien/ui';
import { useSaveLogo } from '../../hooks/center/use-save-logo';

const ACCEPT = LOGO_EXTENSIONS.map((ext) => `.${ext}`).join(',');

type LogoFieldProps = {
  /** Relative path of an already-persisted logo (from `center.get`), or null. */
  savedPath: string | null;
  /** Called with the new relative path after upload, or null when removed. */
  onChange: (path: string | null) => void;
};

/**
 * Logo picker for the center profile (SOU-28). A freshly picked file previews
 * live from its in-memory bytes; the bytes are uploaded via `center.saveLogo`
 * and the returned relative path is lifted to the form for the next
 * `center.save`. A logo persisted in a previous session can only be referenced
 * by path here (the renderer has no filesystem access), so it shows a saved
 * notice until the `center.logoUrl` helper channel lands — see SOU-28 handoff.
 */
export function LogoField({ savedPath, onChange }: LogoFieldProps) {
  const { t } = useTranslation();
  const saveLogo = useSaveLogo();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Revoke the object URL when it is replaced or the field unmounts.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const hasLogo = previewUrl !== null || savedPath !== null;

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-picking the same file
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const parsed = logoUploadSchema.safeParse({ extension, byteLength: file.size });
    if (!parsed.success) {
      setErrorCode(parsed.error.issues[0]?.message ?? 'unsupported-logo-type');
      return;
    }
    setErrorCode(null);

    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextPreview;
    });

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { path } = await saveLogo.mutateAsync({ bytes, extension: parsed.data.extension });
      onChange(path);
    } catch {
      toast.error(t('settings.center.saveError'));
    }
  };

  const onRemove = () => {
    setErrorCode(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('settings.center.logoLabel')}</Label>

      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
          {previewUrl ? (
            <img src={previewUrl} alt={t('settings.center.logoAlt')} className="size-full object-contain" />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={onPick}
              aria-label={t('settings.center.logoLabel')}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saveLogo.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {saveLogo.isPending
                ? t('settings.center.logoUploading')
                : hasLogo
                  ? t('settings.center.logoReplace')
                  : t('settings.center.logoPick')}
            </Button>
            {hasLogo && (
              <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
                {t('settings.center.logoRemove')}
              </Button>
            )}
          </div>
          {!previewUrl && savedPath && (
            <span className="text-xs text-muted-foreground">{t('settings.center.logoSavedNotice')}</span>
          )}
          <span className="text-xs text-muted-foreground">{t('settings.center.logoHint')}</span>
        </div>
      </div>

      {errorCode && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(`errors.${errorCode}`)}
        </p>
      )}
    </div>
  );
}
