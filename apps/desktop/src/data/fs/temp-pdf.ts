import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const STALE_TEMP_PDF_AGE_MS = 5 * 60 * 1000;

const TEMP_PDF_PREFIXES = ['planning-', 'facture-', 'bulletin-paie-', 'recu-paiement-'] as const;

export type TempPdfPrefix = (typeof TEMP_PDF_PREFIXES)[number];

const OWNED_TEMP_PDF_NAME = /^.+-(\d{13})(-[0-9a-f]{8})?\.pdf$/;
const MIN_EPOCH_MS = Date.UTC(2000, 0, 1);

function isPlausibleTimestamp(value: string): boolean {
  const ms = Number(value);
  return Number.isSafeInteger(ms) && ms >= MIN_EPOCH_MS && ms <= Date.now() + 86_400_000;
}

export function isOwnedTempPdfName(fileName: string): boolean {
  if (!TEMP_PDF_PREFIXES.some((prefix) => fileName.startsWith(prefix))) return false;
  const match = OWNED_TEMP_PDF_NAME.exec(fileName);
  return match !== null && isPlausibleTimestamp(match[1]!);
}

export function tempPdfFileName(prefix: TempPdfPrefix, ...nameParts: readonly string[]): string {
  return `${prefix}${nameParts.join('-')}-${Date.now()}-${randomUUID().slice(0, 8)}.pdf`;
}

export function writeTempPdf(prefix: TempPdfPrefix, nameParts: readonly string[], bytes: Uint8Array): string {
  const tempPath = join(app.getPath('temp'), tempPdfFileName(prefix, ...nameParts));
  writeFileSync(tempPath, bytes);
  return tempPath;
}

export function sweepStaleTempPdfsIn(tempDir: string, staleOlderThanMs: number): number {
  const now = Date.now();
  let entries: string[];
  try {
    entries = readdirSync(tempDir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const fileName of entries) {
    if (!isOwnedTempPdfName(fileName)) continue;
    const filePath = join(tempDir, fileName);
    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) continue;
      if (now - stat.mtimeMs >= staleOlderThanMs) {
        rmSync(filePath, { force: true });
        removed += 1;
      }
    } catch {
      // best-effort: a busy/locked file must not fail the sweep
    }
  }
  return removed;
}

export function sweepStaleTempPdfs(options: { tempDir?: string; staleOlderThanMs?: number } = {}): number {
  return sweepStaleTempPdfsIn(options.tempDir ?? app.getPath('temp'), options.staleOlderThanMs ?? STALE_TEMP_PDF_AGE_MS);
}
