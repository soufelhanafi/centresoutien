import { useMutation } from '@tanstack/react-query';
import { parentStatementGateway } from '../../lib/parents/parent-statement-gateway';

type StatementArgs = { parentId: string; month: string; locale: 'fr' | 'ar' };

/**
 * The two "Facture groupée" triggers (SOU-284): print opens the consolidated
 * statement PDF in the OS viewer, export saves it to a user-picked location. Both
 * go through the {@link parentStatementGateway} seam; the calling component owns
 * the toast/error copy so this stays presentation-free.
 */
export function useParentStatementActions() {
  const print = useMutation({
    mutationFn: ({ parentId, month, locale }: StatementArgs) =>
      parentStatementGateway.print(parentId, month, locale),
  });

  const exportPdf = useMutation({
    mutationFn: ({ parentId, month, locale }: StatementArgs) =>
      parentStatementGateway.export(parentId, month, locale),
  });

  return { print, exportPdf };
}
