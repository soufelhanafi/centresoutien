import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const electronMock = vi.hoisted(() => ({ tempDir: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'temp' ? electronMock.tempDir : ''),
  },
}));

import {
  STALE_TEMP_PDF_AGE_MS,
  isOwnedTempPdfName,
  tempPdfFileName,
  writeTempPdf,
  sweepStaleTempPdfs,
  sweepStaleTempPdfsIn,
} from '../../../../src/data/fs/temp-pdf';

const MINUTE = 60 * 1000;

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * MINUTE);
}

describe('temp-pdf ownership', () => {
  it('recognizes only files matching our generated temp-PDF naming format', () => {
    expect(isOwnedTempPdfName('planning-week-1712345678901.pdf')).toBe(true);
    expect(isOwnedTempPdfName('planning-week-1712345678901-ab12cd34.pdf')).toBe(true);
    expect(isOwnedTempPdfName('facture-inv_x-1-1712345678901.pdf')).toBe(true);
    expect(isOwnedTempPdfName('bulletin-paie-1-1712345678901.pdf')).toBe(true);
    expect(isOwnedTempPdfName('recu-paiement-1-1712345678901.pdf')).toBe(true);
    expect(isOwnedTempPdfName('rapport-revenus.pdf')).toBe(false);
    expect(isOwnedTempPdfName('planning-notes.txt')).toBe(false);
    expect(isOwnedTempPdfName('planning-week.pdf')).toBe(false);
    expect(isOwnedTempPdfName('planning-2024.pdf')).toBe(false);
    expect(isOwnedTempPdfName('planning-full.pdf')).toBe(false);
    expect(isOwnedTempPdfName('planning-report-1234567890.pdf')).toBe(false);
    expect(isOwnedTempPdfName('planning-report-946684799999.pdf')).toBe(false);
    expect(isOwnedTempPdfName('planning-report-9999999999999.pdf')).toBe(false);
  });

  it('names temp files with prefix, parts, a timestamp, and a unique suffix', () => {
    expect(tempPdfFileName('planning-', 'room-1')).toMatch(/^planning-room-1-\d+-[0-9a-f]{8}\.pdf$/);
    expect(tempPdfFileName('facture-', 'inv_x', 'v2')).toMatch(/^facture-inv_x-v2-\d+-[0-9a-f]{8}\.pdf$/);
    expect(tempPdfFileName('facture-', 'inv_x')).not.toBe(tempPdfFileName('facture-', 'inv_x'));
  });
});

describe('writeTempPdf', () => {
  beforeEach(() => {
    electronMock.tempDir = mkdtempSync(join(tmpdir(), 'cs-temp-pdf-test-'));
  });
  afterEach(() => {
    rmSync(electronMock.tempDir, { recursive: true, force: true });
  });

  it('writes the bytes into the Electron temp dir and returns the path', () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const tempPath = writeTempPdf('recu-paiement-', ['pay_1'], bytes);

    expect(tempPath.startsWith(electronMock.tempDir)).toBe(true);
    expect(tempPath).toMatch(/recu-paiement-pay_1-\d+-[0-9a-f]{8}\.pdf$/);
    expect(existsSync(tempPath)).toBe(true);
  });
});

describe('sweepStaleTempPdfsIn', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cs-temp-pdf-sweep-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('removes only stale owned PDFs and leaves fresh and foreign files alone', () => {
    const staleOwned = join(dir, 'planning-week-1712345678901.pdf');
    const freshOwned = join(dir, 'facture-inv_x-2-1712345678999-ab12cd34.pdf');
    const staleForeign = join(dir, 'rapport-revenus.pdf');
    const staleNoPdf = join(dir, 'planning-notes.txt');
    writeFileSync(staleOwned, 'stale');
    writeFileSync(freshOwned, 'fresh');
    writeFileSync(staleForeign, 'foreign');
    writeFileSync(staleNoPdf, 'notes');
    utimesSync(staleOwned, minutesAgo(10), minutesAgo(10));
    utimesSync(staleForeign, minutesAgo(10), minutesAgo(10));
    utimesSync(staleNoPdf, minutesAgo(10), minutesAgo(10));

    const removed = sweepStaleTempPdfsIn(dir, STALE_TEMP_PDF_AGE_MS);

    expect(removed).toBe(1);
    expect(existsSync(staleOwned)).toBe(false);
    expect(existsSync(freshOwned)).toBe(true);
    expect(existsSync(staleForeign)).toBe(true);
    expect(existsSync(staleNoPdf)).toBe(true);
  });

  it('never throws when the temp dir does not exist', () => {
    expect(() => sweepStaleTempPdfsIn(join(dir, 'missing'), STALE_TEMP_PDF_AGE_MS)).not.toThrow();
    expect(sweepStaleTempPdfsIn(join(dir, 'missing'), STALE_TEMP_PDF_AGE_MS)).toBe(0);
  });

  it('never removes a foreign file that merely shares an owned prefix', () => {
    const yearPdf = join(dir, 'planning-2024.pdf');
    const exportStyle = join(dir, 'planning-full.pdf');
    writeFileSync(yearPdf, 'year');
    writeFileSync(exportStyle, 'export');
    utimesSync(yearPdf, minutesAgo(10), minutesAgo(10));
    utimesSync(exportStyle, minutesAgo(10), minutesAgo(10));

    const removed = sweepStaleTempPdfsIn(dir, STALE_TEMP_PDF_AGE_MS);

    expect(removed).toBe(0);
    expect(existsSync(yearPdf)).toBe(true);
    expect(existsSync(exportStyle)).toBe(true);
  });

  it('skips a directory that matches an owned temp-PDF name', () => {
    const dirLikeFile = join(dir, 'planning-week-1712345678901.pdf');
    mkdirSync(dirLikeFile);
    utimesSync(dirLikeFile, minutesAgo(10), minutesAgo(10));

    const removed = sweepStaleTempPdfsIn(dir, STALE_TEMP_PDF_AGE_MS);

    expect(removed).toBe(0);
    expect(existsSync(dirLikeFile)).toBe(true);
  });
});

describe('sweepStaleTempPdfs', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cs-temp-pdf-sweep2-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses the default five-minute freshness threshold via the Electron temp dir', () => {
    const stale = join(dir, 'bulletin-paie-1-1712345678901.pdf');
    const fresh = join(dir, 'recu-paiement-2-1712345678999.pdf');
    writeFileSync(stale, 'stale');
    writeFileSync(fresh, 'fresh');
    utimesSync(stale, minutesAgo(10), minutesAgo(10));
    electronMock.tempDir = dir;

    const removed = sweepStaleTempPdfs();

    expect(removed).toBe(1);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });

  it('honors a caller-supplied threshold and temp dir', () => {
    const oldFile = join(dir, 'facture-inv_x-1-1712345678901.pdf');
    const recentFile = join(dir, 'planning-week-2-1712345678999-ab12cd34.pdf');
    writeFileSync(oldFile, 'old');
    writeFileSync(recentFile, 'recent');
    utimesSync(oldFile, minutesAgo(10), minutesAgo(10));
    utimesSync(recentFile, minutesAgo(2), minutesAgo(2));

    const removed = sweepStaleTempPdfs({ tempDir: dir, staleOlderThanMs: 5 * MINUTE });

    expect(removed).toBe(1);
    expect(existsSync(oldFile)).toBe(false);
    expect(existsSync(recentFile)).toBe(true);
  });
});
