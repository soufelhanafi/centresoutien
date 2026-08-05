import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLANS } from '@centresoutien/domain';
import { ExcelBackupCard } from '../../../src/renderer/components/settings/excel-backup-card';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';
import { planWithout } from '../fakes/plan';
import { selectFile, selectSaveFile } from '../../../src/renderer/lib/settings/dialog';

vi.mock('../../../src/renderer/lib/settings/dialog', () => ({
  selectFile: vi.fn(),
  selectSaveFile: vi.fn(),
}));

const mockSelectSaveFile = vi.mocked(selectSaveFile);
const mockSelectFile = vi.mocked(selectFile);

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ExcelBackupCard />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Excel backup card — plan gating', () => {
  it('shows the standard lock treatment on Essentiel (no export/import)', async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'essentiel', plan: planWithout('io.excel.export', 'io.excel.import') });
    renderCard();

    expect(screen.getAllByText('Sauvegarde Excel').length).toBeGreaterThan(0);
    expect(screen.getByText('Réservé à un plan supérieur')).toBeInTheDocument();
  });

  it('renders both sections on Pro', async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'pro', plan: PLANS.pro });
    renderCard();

    expect(screen.getByRole('button', { name: 'Exporter la sauvegarde Excel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importer un fichier Excel' })).toBeInTheDocument();
    expect(screen.queryByText('Réservé à un plan supérieur')).not.toBeInTheDocument();
  });
});

describe('Excel backup card — export', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'pro', plan: PLANS.pro });
  });

  it('picks a path, exports over IPC, and shows the per-sheet summary', async () => {
    mockSelectSaveFile.mockResolvedValue({ token: 'token-export', path: '/tmp/centre.xlsx' });
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'backup.excel.export') {
        return { filePath: '/tmp/centre.xlsx', counts: { students: 2, parents: 1 } };
      }
      return { reply: 'pong' };
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Exporter la sauvegarde Excel' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('backup.excel.export', { pathToken: 'token-export' }),
    );
    expect(screen.getByText('Fichier :')).toBeInTheDocument();
    expect(screen.getByText('/tmp/centre.xlsx')).toBeInTheDocument();
    expect(screen.getByText('students')).toBeInTheDocument();
    expect(screen.getByText('parents')).toBeInTheDocument();
  });

  it('surfaces a localized error when the export fails', async () => {
    mockSelectSaveFile.mockResolvedValue({ token: 'token-export', path: '/tmp/centre.xlsx' });
    window.api.invoke = vi.fn(async () => {
      throw new Error('boom');
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Exporter la sauvegarde Excel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("L'export Excel a échoué. Réessayez.");
  });
});

describe('Excel backup card — import preview and apply', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'pro', plan: PLANS.pro });
  });

  const previewResponse = {
    preview: {
      sheets: ['students'],
      unknownSheets: ['note'],
      counts: { created: 1, updated: 1, duplicate: 1, invalid: 1 },
      rows: [
        { sheetName: 'students', rowNumber: 2, status: 'created', reason: null },
        { sheetName: 'students', rowNumber: 3, status: 'invalid', reason: 'missing-field:centerCode' },
      ],
    },
  };

  it('picks a file, renders counts, unknown-sheet notice and the row table', async () => {
    mockSelectFile.mockResolvedValue({ token: 'token-import', path: '/tmp/backup.xlsx' });
    window.api.invoke = vi.fn(async (channel: string) => {
      if (channel === 'backup.excel.preview') return previewResponse;
      return { reply: 'pong' };
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Importer un fichier Excel' }));

    expect(await screen.findByText('Créées')).toBeInTheDocument();
    expect(screen.getByText('Mises à jour')).toBeInTheDocument();
    expect(screen.getByText('Doublons')).toBeInTheDocument();
    expect(screen.getByText('Invalides')).toBeInTheDocument();

    expect(screen.getByText('Feuilles non reconnues')).toBeInTheDocument();
    expect(screen.getByText('Ces feuilles seront ignorées : note')).toBeInTheDocument();
    expect(screen.getByText('Feuilles absentes')).toBeInTheDocument();

    expect(screen.getAllByText('students').length).toBe(2);
    expect(screen.getByText('Créée')).toBeInTheDocument();
    expect(screen.getByText('Invalide')).toBeInTheDocument();
    expect(screen.getByText('Champ manquant : centerCode')).toBeInTheDocument();
  });

  it('localizes classification reason tokens via the reason.* keys', async () => {
    mockSelectFile.mockResolvedValue({ token: 'token-import', path: '/tmp/backup.xlsx' });
    window.api.invoke = vi.fn(async (channel: string) => {
      if (channel === 'backup.excel.preview') {
        return {
          preview: {
            sheets: ['students'],
            unknownSheets: [],
            counts: { created: 0, updated: 0, duplicate: 0, invalid: 2 },
            rows: [
              { sheetName: 'students', rowNumber: 2, status: 'invalid', reason: 'wrong-center' },
              { sheetName: 'students', rowNumber: 3, status: 'invalid', reason: 'missing-field:phone' },
              { sheetName: 'students', rowNumber: 4, status: 'invalid', reason: 'some-future-token' },
            ],
          },
        };
      }
      return { reply: 'pong' };
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Importer un fichier Excel' }));

    expect(await screen.findByText('Cette ligne appartient à un autre centre.')).toBeInTheDocument();
    expect(screen.getByText('Champ manquant : phone')).toBeInTheDocument();
    expect(screen.getByText('Raison inconnue.')).toBeInTheDocument();
  });

  it('offers apply only when rows are actionable, then commits over IPC', async () => {
    mockSelectFile.mockResolvedValue({ token: 'token-import', path: '/tmp/backup.xlsx' });
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'backup.excel.preview') return previewResponse;
      if (channel === 'backup.excel.apply') {
        return { counts: { created: 1, updated: 1, duplicate: 1, invalid: 1 }, totalRows: 2 };
      }
      return { reply: 'pong' };
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Importer un fichier Excel' }));
    const applyButton = await screen.findByRole('button', { name: 'Importer 2 lignes' });
    expect(screen.getByText('1 doublon et 1 lignes invalides seront ignorés.')).toBeInTheDocument();

    await user.click(applyButton);
    expect(await screen.findByText("Confirmer l'import")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Importer' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('backup.excel.apply', { pathToken: 'token-import' }),
    );
    expect(await screen.findByText('Import terminé : 1 ligne créée, 1 lignes mises à jour.')).toBeInTheDocument();
  });

  it('skips the apply button when no row is actionable', async () => {
    mockSelectFile.mockResolvedValue({ token: 'token-import', path: '/tmp/backup.xlsx' });
    window.api.invoke = vi.fn(async (channel: string) => {
      if (channel === 'backup.excel.preview') {
        return {
          preview: {
            sheets: ['students'],
            unknownSheets: [],
            counts: { created: 0, updated: 0, duplicate: 2, invalid: 1 },
            rows: [
              { sheetName: 'students', rowNumber: 2, status: 'duplicate', reason: null },
              { sheetName: 'students', rowNumber: 3, status: 'invalid', reason: 'missing centerCode' },
            ],
          },
        };
      }
      return { reply: 'pong' };
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Importer un fichier Excel' }));

    expect(await screen.findByText('Ce fichier ne contient aucune ligne à importer.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Importer \d+ lignes/ })).not.toBeInTheDocument();
  });
});

describe('Excel backup card — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders Arabic labels on Pro', async () => {
    usePlanStore.setState({ planId: 'pro', plan: PLANS.pro });
    renderCard();

    expect(screen.getByText('نسخ احتياطي Excel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تصدير النسخة الاحتياطية إلى Excel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'استيراد ملف Excel' })).toBeInTheDocument();
  });

  it('shows the Arabic lock message on Essentiel', async () => {
    usePlanStore.setState({ planId: 'essentiel', plan: planWithout('io.excel.export', 'io.excel.import') });
    renderCard();

    expect(screen.getByText('غير متاح في خطتك')).toBeInTheDocument();
    await i18n.changeLanguage('fr');
  });
});
