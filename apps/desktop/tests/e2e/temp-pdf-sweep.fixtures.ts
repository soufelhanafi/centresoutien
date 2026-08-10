import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, utimesSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

/**
 * Black-box fixtures for SOU-163 — temp-PDF lifecycle.
 *
 * The app's `*.print` handlers write a PDF into the OS temp dir and hand it to
 * the external viewer; the SOU-163 sweep deletes only OUR stale temp PDFs at
 * startup. This suite therefore seeds files straight into `os.tmpdir()` and
 * observes them from the outside. Two black-box facts anchor the tests:
 *
 *  1. `os.tmpdir()` of the Playwright worker == the Electron app's temp dir
 *     (both derive from `$TMPDIR`, which the worker passes through in `env`).
 *  2. Owned temp PDFs live at the ROOT of the temp dir, named with the prefixes
 *     `planning-`, `facture-`, `bulletin-paie-`, `recu-paiement-` and a `.pdf`
 *     suffix (observed, never read from source).
 *
 * No application code is read or imported.
 */

export const TMP_DIR = tmpdir();

export const OWNED_PREFIXES = ['planning-', 'facture-', 'bulletin-paie-', 'recu-paiement-'] as const;

/** A minimal valid PDF so a produced file is byte-verifiable, not just "exists". */
export const PDF_MAGIC = '%PDF-1.7\n%%EOF\n';

/** Seeded files this test created, cleaned up in afterEach so tmp stays tidy. */
export const seeded: string[] = [];

export function ownedPdfPath(name: string): string {
  return join(TMP_DIR, name);
}

/**
 * Write a PDF-shaped file into the OS temp dir and backdate its mtime to the
 * given age in minutes (negative ages = future, 0 = now). Registers the path
 * for afterEach cleanup.
 */
export function seedTempFile(fileName: string, mtimeAgeMinutes: number, content = PDF_MAGIC): string {
  const p = join(TMP_DIR, fileName);
  writeFileSync(p, content);
  const nowMs = Date.now();
  utimesSync(p, new Date(nowMs - mtimeAgeMinutes * 60_000), new Date(nowMs - mtimeAgeMinutes * 60_000));
  seeded.push(p);
  return p;
}

/** True when a temp file exists right now. */
export function tempFileExists(name: string): boolean {
  return existsSync(join(TMP_DIR, name));
}

/** True when a file on disk starts with `%PDF-` (a real PDF, not a placeholder). */
export function isRealPdf(path: string): boolean {
  if (!existsSync(path)) return false;
  return readFileSync(path).subarray(0, 5).toString('latin1') === '%PDF-';
}

/** Remove the registered seed files (idempotent) so the shared tmp dir stays clean. */
export function cleanupSeeded(): void {
  for (const p of seeded.splice(0)) rmSync(p, { force: true });
}

/**
 * The owned temp PDFs currently in the temp dir root, newest first, with their
 * mtime. Used to (a) observe what a print action produced and (b) assert the
 * sweep only removes stale owned files.
 */
export function listOwnedTempPdfs(): { name: string; mtimeMs: number }[] {
  return readdirSync(TMP_DIR)
    .filter((f) => f.endsWith('.pdf') && OWNED_PREFIXES.some((p) => f.startsWith(p)))
    .map((name) => ({ name, mtimeMs: statSync(join(TMP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}
