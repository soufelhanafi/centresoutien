import { describe, expect, it } from 'vitest';
import { ChangeResolver } from '../../../src/sync/resolve-changes';
import type { ReversalDedup, PaymentReversalDedupStore } from '../../../src/sync/reversal-dedup';
import type { HubChange } from '../../../src/ports/sync-hub-port';
import type { Payment, PaymentId } from '../../../src/entities/payment';
import type { EntityId } from '../../../src/value-objects/ids';
import { netPaidMadDeduped } from '../../../src/sync/reversal-dedup';
import { fakeClock } from '../fakes/clock';
import { InMemorySyncLocalRepository } from '../fakes/in-memory-sync-local-repository';
import { CENTER, DEV_A, DEV_B, USER_A, USER_B, matcherFor } from './sync-engine-helpers';

const clock = fakeClock('2026-08-01T10:00:00Z');
const ORIGINAL = 'pay_00000000000000000000000001' as PaymentId;
const REV_LO = 'pay_00000000000000000000000002' as PaymentId;
const REV_MID = 'pay_00000000000000000000000004' as PaymentId;
const REV_HI = 'pay_00000000000000000000000003' as PaymentId;

function payment(id: PaymentId, kind: Payment['kind'], reversesPaymentId: PaymentId | null): Payment {
  return {
    id,
    centerCode: CENTER,
    deviceOrigin: DEV_A,
    createdAt: new Date('2026-08-01T10:00:00Z'),
    updatedAt: new Date('2026-08-01T10:00:00Z'),
    updatedBy: USER_A,
    deletedAt: null,
    version: 0,
    invoiceId: 'inv_00000000000000000000000001' as Payment['invoiceId'],
    kind,
    amountMad: 10000,
    method: 'cash',
    paidOn: '2026-08-01',
    reversesPaymentId,
    note: null,
  };
}

function inboundReversal(id: PaymentId): HubChange {
  return {
    entityType: 'payments',
    entityId: id as EntityId,
    version: 2,
    seq: 1,
    op: 'create',
    entity: payment(id, 'reversal', ORIGINAL) as unknown as Record<string, unknown>,
    changedFields: [],
    deviceId: DEV_B,
    updatedBy: USER_B,
    deviceSeq: 1,
    receivedAt: new Date('2026-08-01T10:01:00Z'),
  };
}

class PaymentDedupStore implements PaymentReversalDedupStore {
  constructor(private readonly existing: readonly Payment[]) {}

  findPaymentReversalsByTarget(reversesPaymentId: PaymentId, excludeId: EntityId): readonly Payment[] {
    return this.existing.filter(
      (payment) => payment.reversesPaymentId === reversesPaymentId && payment.id !== excludeId,
    );
  }
}

describe('ChangeResolver — payment reversal dedup (SOU-239)', () => {
  it('surfaces duplicate reversal losers without aborting inbound apply', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('payments', REV_HI as EntityId, payment(REV_HI, 'reversal', ORIGINAL) as unknown as Record<string, unknown>, 1);
    const dedups: ReversalDedup[] = [];
    const resolver = new ChangeResolver(local, clock, DEV_A, USER_A, CENTER, null, null, new PaymentDedupStore([payment(REV_HI, 'reversal', ORIGINAL)]));

    const applied = resolver.resolveBatch([inboundReversal(REV_LO)], matcherFor(local), {
      conflicts: [],
      reversalDedups: dedups,
    });

    expect(applied).toBe(1);
    expect(dedups).toEqual([
      { entityType: 'payments', reversesPaymentId: ORIGINAL, winnerId: REV_LO, loserId: REV_HI },
    ]);
    expect(netPaidMadDeduped([payment(ORIGINAL, 'payment', null), payment(REV_LO, 'reversal', ORIGINAL), payment(REV_HI, 'reversal', ORIGINAL)])).toBe(0);
  });

  it('rewrites stale pairwise winners to the global lower-ULID reversal', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    const dedups: ReversalDedup[] = [
      { entityType: 'payments', reversesPaymentId: ORIGINAL, winnerId: REV_HI, loserId: REV_MID },
    ];
    const resolver = new ChangeResolver(
      local,
      clock,
      DEV_A,
      USER_A,
      CENTER,
      null,
      null,
      new PaymentDedupStore([payment(REV_MID, 'reversal', ORIGINAL), payment(REV_HI, 'reversal', ORIGINAL)]),
    );

    resolver.resolveBatch([inboundReversal(REV_LO)], matcherFor(local), { conflicts: [], reversalDedups: dedups });

    expect(dedups).toEqual([
      { entityType: 'payments', reversesPaymentId: ORIGINAL, winnerId: REV_LO, loserId: REV_HI },
      { entityType: 'payments', reversesPaymentId: ORIGINAL, winnerId: REV_LO, loserId: REV_MID },
    ]);
  });
});
