import { describe, it, expect, beforeEach } from 'vitest';
import { GenerateRecoveryCodes } from '../../../src/use-cases/generate-recovery-codes';
import { InMemoryRecoveryCodeRepository } from '../fakes/in-memory-recovery-code-repository';
import { InMemoryAuthAuditLogRepository } from '../fakes/in-memory-auth-audit-log-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeSecureRandom } from '../fakes/secure-random';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

describe('GenerateRecoveryCodes', () => {
  let codes: InMemoryRecoveryCodeRepository;
  let auditLog: InMemoryAuthAuditLogRepository;
  let useCase: GenerateRecoveryCodes;

  beforeEach(() => {
    codes = new InMemoryRecoveryCodeRepository();
    auditLog = new InMemoryAuthAuditLogRepository();
    useCase = new GenerateRecoveryCodes(
      codes,
      auditLog,
      fakeHasher(),
      fakeSecureRandom(),
      fakeClock('2026-08-03T10:00:00Z'),
      fakeIds(),
    );
  });

  it('generates exactly 16 codes', async () => {
    const plainCodes = await useCase.execute('admin');
    expect(plainCodes).toHaveLength(16);
  });

  it('formats each code as XXXX-XXXX-XXXX-XXXX', async () => {
    const plainCodes = await useCase.execute('admin');
    for (const code of plainCodes) {
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }
  });

  it('persists only hashes, never plaintext', async () => {
    const plainCodes = await useCase.execute('admin');
    const stored = codes.all();
    expect(stored).toHaveLength(16);
    for (const s of stored) {
      expect(s.codeHash).toMatch(/^hashed:/);
      expect(plainCodes).not.toContain(s.codeHash);
    }
  });

  it('records an audit event', async () => {
    await useCase.execute('admin');
    const events = auditLog.list();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('recovery-codes-generated');
    expect(events[0].username).toBe('admin');
    expect(events[0].metadata).toEqual({ codeCount: 16 });
  });

  it('invalidates any pre-existing codes before generating new ones', async () => {
    await useCase.execute('admin');
    expect(codes.all().filter((c) => !c.consumed)).toHaveLength(16);
    const firstSet = codes.all();
    await useCase.execute('admin');
    const secondSet = codes.all();
    for (const c of firstSet) {
      const stored = secondSet.find((s) => s.id === c.id);
      expect(stored?.consumed).toBe(true);
    }
    expect(secondSet.filter((c) => !c.consumed)).toHaveLength(16);
  });
});
