import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogoField } from '../../../src/renderer/components/settings/logo-field';
import { CenterProfileSettings } from '../../../src/renderer/components/settings/settings-page';
import { InvoiceDocumentHeader } from '../../../src/renderer/components/invoice/invoice-document-header';
import type { InvoiceListItemView } from '../../../src/renderer/lib/invoices/invoice-view';
import i18n from '../../../src/renderer/i18n/config';

/**
 * SOU-250 — logo displays nowhere after a successful upload.
 *
 * These are regressions the happy-path E2E (pick → save → reload → visible with
 * a 1×1 PNG) cannot see: async races between the logo upload and the profile
 * save, blob-URL lifecycle under StrictMode, the invoice display location, and
 * non-PNG file formats.
 */

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_BYTES = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70]);

const savedCenter = (logoPath: string | null) => ({
  name: 'Centre Al Amal',
  address: '',
  phone: '',
  email: '',
  logoPath,
  plan: 'essentiel' as const,
});

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderUi(ui: React.ReactNode) {
  const client = newClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** A promise we resolve by hand, to pin an upload mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function logoFile(name = 'logo.png', bytes = PNG_BYTES) {
  return new File([bytes as unknown as BlobPart], name, { type: 'image/png' });
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('upload/save race (SOU-250)', () => {
  it('disables Save while the upload is in flight so a stale/null logoPath can never be saved', async () => {
    const upload = deferred<{ path: string }>();
    const save = vi.fn(async () => ({ center: savedCenter('logos/lgo_0001.png') }));
    const invoke = vi.fn((channel: string, request?: unknown) => {
      if (channel === 'center.get') return Promise.resolve({ center: null });
      if (channel === 'center.saveLogo') return upload.promise;
      if (channel === 'center.save') return save(request);
      return Promise.resolve({});
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderUi(<CenterProfileSettings />);

    await screen.findByLabelText('Nom du centre');
    await user.type(screen.getByLabelText('Nom du centre'), 'Centre Al Amal');
    const fileInput = screen.getByLabelText('Logo');
    await user.upload(fileInput, logoFile());
    await screen.findByAltText('Logo du centre');

    // The upload has not resolved yet: Save must be gated so a click cannot
    // flush the form with the old (null) logoPath.
    const submitButton = screen.getByRole('button', { name: 'Enregistrer' });
    expect(submitButton).toBeDisabled();

    upload.resolve({ path: 'logos/lgo_0001.png' });
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Centre Al Amal', logoPath: 'logos/lgo_0001.png' }),
    );
  });

  it('lifts the upload path before center.save on the happy path', async () => {
    const save = vi.fn(async () => ({ center: savedCenter('logos/lgo_0002.png') }));
    const invoke = vi.fn((channel: string, request?: unknown) => {
      if (channel === 'center.get') return Promise.resolve({ center: null });
      if (channel === 'center.saveLogo') return Promise.resolve({ path: 'logos/lgo_0002.png' });
      if (channel === 'center.save') return save(request);
      return Promise.resolve({});
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderUi(<CenterProfileSettings />);

    await user.type(await screen.findByLabelText('Nom du centre'), 'Centre Al Amal');
    await user.upload(screen.getByLabelText('Logo'), logoFile());
    await screen.findByAltText('Logo du centre');

    // Save stays gated until the upload lands, then the lifted path is carried.
    const submitButton = screen.getByRole('button', { name: 'Enregistrer' });
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ logoPath: 'logos/lgo_0002.png' })),
    );
  });

  it('clears the live preview and does not lift a path when the upload fails', async () => {
    const invoke = vi.fn((channel: string) => {
      if (channel === 'center.get') return Promise.resolve({ center: null });
      if (channel === 'center.saveLogo') return Promise.reject(new Error('disk full'));
      return Promise.resolve({});
    });
    window.api.invoke = invoke;
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderUi(<LogoField savedPath={null} onChange={onChange} onPendingChange={() => {}} />);

    await user.upload(screen.getByLabelText('Logo'), logoFile());
    await waitFor(() => expect(onChange).not.toHaveBeenCalled());
    expect(screen.queryByAltText('Logo du centre')).not.toBeInTheDocument();
  });
});

describe('blob-URL lifecycle (SOU-250)', () => {
  it('keeps a valid (non-revoked) src for a persisted logo under StrictMode double-effects', async () => {
    const invoke = vi.fn((channel: string) =>
      channel === 'center.logoBytes' ? Promise.resolve({ bytes: PNG_BYTES }) : Promise.resolve({}),
    );
    window.api.invoke = invoke;
    const revoked = new Set<string>();

    render(
      <StrictMode>
        <QueryClientProvider client={newClient()}>
          <LogoField savedPath="logos/centre.png" onChange={() => {}} />
        </QueryClientProvider>
      </StrictMode>,
    );

    const img = await screen.findByAltText('Logo du centre');
    const src = img.getAttribute('src');
    expect(src).toMatch(/^blob:/);
    expect(revoked.has(src ?? '')).toBe(false);

    // The very first StrictMode effect run may be revoked, but the live src must
    // never point at a revoked URL.
    expect((URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.flat()).not.toContain(src);
  });

  it('re-hydrates a JPEG logo just like a PNG (same byte→blob path)', async () => {
    const invoke = vi.fn((channel: string) =>
      channel === 'center.logoBytes' ? Promise.resolve({ bytes: JPEG_BYTES }) : Promise.resolve({}),
    );
    window.api.invoke = invoke;
    renderUi(<LogoField savedPath="logos/centre.jpg" onChange={() => {}} />);

    const img = await screen.findByAltText('Logo du centre');
    expect(img.getAttribute('src')).toMatch(/^blob:/);
    expect(invoke).toHaveBeenCalledWith('center.logoBytes', { path: 'logos/centre.jpg' });
  });
});

describe('invoice display location (SOU-250)', () => {
  it('renders the persisted logo in the invoice document header', async () => {
    const invoke = vi.fn((channel: string) => {
      if (channel === 'center.get') return Promise.resolve({ center: savedCenter('logos/centre.png') });
      if (channel === 'center.logoBytes') return Promise.resolve({ bytes: PNG_BYTES });
      return Promise.resolve({});
    });
    window.api.invoke = invoke;

    const invoice = {
      id: 'INV-1',
      studentId: 'stu_1',
      month: '2026-07',
      status: 'draft' as const,
      issuedAt: null,
      lines: [],
      totalMad: 0,
      netPaidMad: 0,
      outstandingMad: 0,
      paymentStatus: 'unpaid' as const,
    } satisfies InvoiceListItemView;

    renderUi(<InvoiceDocumentHeader invoice={invoice} student={undefined} />);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('center.logoBytes', { path: 'logos/centre.png' }));
    await waitFor(() => expect(document.querySelector('img[alt=""]')).not.toBeNull());
    const img = document.querySelector('img[alt=""]');
    expect(img?.getAttribute('src')).toMatch(/^blob:/);
  });
});
