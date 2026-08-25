import { describe, expect, it, vi } from 'vitest';
import type {
  DeviceId,
  UserId,
  DuplicateMatcher,
  SyncResult,
  Plan,
  FeatureFlag,
  PaymentId,
} from '@centresoutien/domain';
import { PlanPolicy, PLANS, PlanFeatureUnavailableError } from '@centresoutien/domain';
import { createSyncHandlers, type SyncHandlerDeps } from '../../../src/main/ipc/sync-handlers';

const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

/** A real plan (Premium) with a single flag dropped — the CLAUDE.md-mandated way
 *  to under-provision: never by plan id, always by removing the exact feature. */
function planWithout(feature: FeatureFlag): Plan {
  const features = new Set<FeatureFlag>(PLANS.premium.features);
  features.delete(feature);
  return { id: PLANS.premium.id, features, limits: PLANS.premium.limits };
}

function syncedResult(): SyncResult {
  return {
    status: 'synced',
    applied: 0,
    pushed: 0,
    conflicts: [],
    subjectCodeCollisions: [],
    sessionDedups: [],
    reversalDedups: [],
    userCredentialDuplicates: [],
    cursor: null,
    deviceClockSkew: false,
    resolutionPermission: 'granted',
  };
}

function makeDeps(overrides: Partial<SyncHandlerDeps> = {}): SyncHandlerDeps {
  const unused = () => {
    throw new Error('not exercised by this scenario');
  };
  return {
    plan: new PlanPolicy(PLANS.premium),
    syncEngine: { run: vi.fn(async () => syncedResult()) },
    syncOutbox: { drain: vi.fn() },
    matcher: {} as DuplicateMatcher,
    resolveConflict: { execute: unused },
    listBlockedConflicts: vi.fn(() => []),
    localSyncRepository: {} as SyncHandlerDeps['localSyncRepository'],
    deviceId: () => DEVICE,
    updatedBy: () => USER,
    ...overrides,
  };
}

describe('sync handlers — sync.multi-device plan gate', () => {
  describe('sync.run', () => {
    it('runs pull → resolve → push when the plan grants sync.multi-device', async () => {
      const drain = vi.fn();
      const run = vi.fn(async () => syncedResult());
      const deps = makeDeps({ syncOutbox: { drain }, syncEngine: { run } });

      const handlers = createSyncHandlers(deps);
      const response = await handlers['sync.run']();

      expect(drain).toHaveBeenCalledOnce();
      expect(run).toHaveBeenCalledOnce();
      expect(response.result?.status).toBe('synced');
    });

    it('maps payment reversal dedups into the renderer DTO', async () => {
      const reversesPaymentId = 'pay_00000000000000000000000001' as PaymentId;
      const winnerId = 'pay_00000000000000000000000002' as PaymentId;
      const loserId = 'pay_00000000000000000000000003' as PaymentId;
      const run = vi.fn(async (): Promise<SyncResult> => ({
        ...syncedResult(),
        reversalDedups: [{ entityType: 'payments', reversesPaymentId, winnerId, loserId }],
      }));
      const handlers = createSyncHandlers(makeDeps({ syncEngine: { run } }));

      const response = await handlers['sync.run']();

      expect(response.result?.reversalDedups).toEqual([
        { entityType: 'payments', reversesPaymentId, winnerId, loserId },
      ]);
    });

    it('maps same-username user credential duplicates into the renderer DTO', async () => {
      const winnerId = 'usr_00000000000000000000000002';
      const loserId = 'usr_00000000000000000000000001';
      const run = vi.fn(async (): Promise<SyncResult> => ({
        ...syncedResult(),
        userCredentialDuplicates: [{ entityType: 'users', username: 'directrice', winnerId, loserId }],
      }));
      const handlers = createSyncHandlers(makeDeps({ syncEngine: { run } }));

      const response = await handlers['sync.run']();

      expect(response.result?.userCredentialDuplicates).toEqual([
        { entityType: 'users', username: 'directrice', winnerId, loserId },
      ]);
    });

    it('throws PlanFeatureUnavailableError before draining or running the engine when the flag is dropped', async () => {
      const drain = vi.fn();
      const run = vi.fn(async () => syncedResult());
      const deps = makeDeps({
        plan: new PlanPolicy(planWithout('sync.multi-device')),
        syncOutbox: { drain },
        syncEngine: { run },
      });

      const handlers = createSyncHandlers(deps);

      await expect(handlers['sync.run']()).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(drain).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    });
  });

  describe('sync.conflicts.list', () => {
    it('lists blocked conflicts when the plan grants sync.multi-device', () => {
      const listBlockedConflicts = vi.fn(() => []);
      const deps = makeDeps({ listBlockedConflicts });

      const handlers = createSyncHandlers(deps);
      const response = handlers['sync.conflicts.list']();

      expect(listBlockedConflicts).toHaveBeenCalledOnce();
      expect(response.conflicts).toEqual([]);
    });

    it('throws PlanFeatureUnavailableError before reading the inbox when the flag is dropped', () => {
      const listBlockedConflicts = vi.fn(() => []);
      const deps = makeDeps({
        plan: new PlanPolicy(planWithout('sync.multi-device')),
        listBlockedConflicts,
      });

      const handlers = createSyncHandlers(deps);

      expect(() => handlers['sync.conflicts.list']()).toThrow(PlanFeatureUnavailableError);
      expect(listBlockedConflicts).not.toHaveBeenCalled();
    });
  });
});
