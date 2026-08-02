import { decodeDomainError } from '../../../shared/ipc/domain-error';

/**
 * The domain error's stable code, decoded from a rejected IPC call. The main
 * dispatcher encodes the code into the rejection's *message* (see
 * `shared/ipc/domain-error`) because neither the Electron IPC bridge nor the
 * preload contextBridge preserves custom error properties — only `message`
 * survives both hops. So we read `code` directly when present (in-process paths,
 * e.g. unit tests calling a use case directly) and otherwise decode it from
 * `message`. Every write-error mapper in `renderer/lib/**\/*-write-error.ts`
 * shares this one decode step rather than re-implementing it.
 */
export function resolveDomainErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === 'string') return code;
  if (typeof message === 'string') return decodeDomainError(message)?.code ?? null;
  return null;
}
