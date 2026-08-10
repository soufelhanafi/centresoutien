import { randomUUID } from 'node:crypto';
import { readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const STALE_TEMP_PDF_AGE_MS = 5 * 60 * 1000;

const TEMP_PDF_PREFIXES = ['planning-', 'facture-', 'bulletin-paie-', 'recu-paiement-'] as const;

export type TempPdfPrefix = (typeof TEMP_PDF_PREFIXES)[number];

const OWNED_TEMP_PDF_NAME = /^.+-(\d{13})-[0-9a-f]{8}\.pdf$/;

function isFutureDated(value: string): boolean {
  return Number(value) > Date.now() + 86_400_000;
}

export function isOwnedTempPdfName(fileName: string): boolean {
  if (!TEMP_PDF_PREFIXES.some((prefix) => fileName.startsWith(prefix))) return false;
  const match = OWNED_TEMP_PDF_NAME.exec(fileName);
  return match !== null && !isFutureDated(match[1]!);
}

export function tempPdfFileName(prefix: TempPdfPrefix, ...nameParts: readonly string[]): string {
  return `${prefix}${nameParts.join('-')}-${Date.now()}-${randomUUID().slice(0, 8)}.pdf`;
}

export function writeTempPdf(tempDir: string, prefix: TempPdfPrefix, nameParts: readonly string[], bytes: Uint8Array): string {
  const tempPath = join(tempDir, tempPdfFileName(prefix, ...nameParts));
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

export function sweepStaleTempPdfs(tempDir: string): number {
  return sweepStaleTempPdfsIn(tempDir, STALE_TEMP_PDF_AGE_MS);
}
