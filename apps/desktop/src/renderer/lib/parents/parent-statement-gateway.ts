/**
 * The seam the "Facture groupée" UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place. `centerCode` is injected in the main process, never sent
 * from the renderer; `locale` picks the PDF language independent of the UI locale,
 * mirroring `invoicesGateway.print`/`export` (SOU-284).
 */
export interface ParentStatementGateway {
  /** Renders the consolidated statement PDF in `locale` and opens it in the OS's default viewer. */
  print(parentId: string, month: string, locale: 'fr' | 'ar'): Promise<void>;
  /**
   * Renders the consolidated statement PDF in `locale` and lets the user pick a
   * save location. `savedPath` is `null` when the save dialog was cancelled.
   */
  export(parentId: string, month: string, locale: 'fr' | 'ar'): Promise<{ savedPath: string | null }>;
}

class IpcParentStatementGateway implements ParentStatementGateway {
  async print(parentId: string, month: string, locale: 'fr' | 'ar'): Promise<void> {
    await window.api.invoke('parentStatement.print', { parentId, month, locale });
  }

  async export(
    parentId: string,
    month: string,
    locale: 'fr' | 'ar',
  ): Promise<{ savedPath: string | null }> {
    return window.api.invoke('parentStatement.export', { parentId, month, locale });
  }
}

export const parentStatementGateway: ParentStatementGateway = new IpcParentStatementGateway();
