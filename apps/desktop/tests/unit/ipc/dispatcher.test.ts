import { describe, expect, it } from 'vitest';
import type {
  AdminAccountId,
  CenterCode,
  CenterHoursId,
  CenterId,
  DeviceId,
  EnrollmentId,
  EntityId,
  Group,
  GroupId,
  ParentId,
  StudentId,
  PhoneNumber,
  Role,
  RoomId,
  SubjectId,
  TimeOfDay,
  UserId,
  WeekdayIndex,
  WeeklyRecurringSessionId,
  SessionId,
  GenerationBatchId,
} from '@centresoutien/domain';
import {
  GroupFullError,
  GroupNotFoundError,
  PLANS,
  WeeklyRecurringSessionNotFoundError,
  GenerationBatchNotFoundError,
} from '@centresoutien/domain';
import { createIpcDispatcher } from '../../../src/main/ipc/dispatcher';
import { decodeDomainError } from '../../../src/shared/ipc/domain-error';
import {
  createHandlers,
  type CreateSubjectUseCase,
  type CreateParentUseCase,
  type CreateAdminAccountUseCase,
  type CreateUserUseCase,
  type RedeemSetupCodeUseCase,
  type CreateGroupUseCase,
  type ListGroupsUseCase,
  type ListGroupsWithCountsUseCase,
  type GetGroupRosterUseCase,
  type UpdateGroupUseCase,
  type ArchiveGroupUseCase,
  type RestoreGroupUseCase,
  type ListWeekSessionsUseCase,
  type GenerateAndPersistSessionsUseCase,
  type UndoGenerationBatchUseCase,
  type CreateWeeklyRecurringSessionUseCase,
  type UpdateWeeklyRecurringSessionUseCase,
  type CancelWeeklyRecurringSessionUseCase,
  type SaveCenterHoursUseCase,
  type GetCenterHoursUseCase,
  type AttemptLoginUseCase,
  type DeviceSessions,
  type EnvelopeContext,
  type CenterContext,
  type GetCenterProfileUseCase,
  type SaveCenterProfileUseCase,
  type StoreCenterLogoUseCase,
  type ReadCenterLogoUseCase,
} from '../../../src/main/ipc/handlers';
import { isIpcChannel } from '../../../src/shared/ipc/contract';
import type { IpcHandlers } from '../../../src/shared/ipc/contract';

// Throwaway test password assembled from fragments (secret-scan friendly).
const PASS = ['Casa', '2026', '!'].join('');

const context: EnvelopeContext = {
  centerCode: 'CS-DEV-001' as CenterCode,
  deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
  updatedBy: 'usr_00000000000000000000000001' as UserId,
};

// Stub use case — the handler only needs `execute` (Pick<CreateSubject,'execute'>).
const stubCreateSubject: CreateSubjectUseCase = {
  execute: async (input) => ({
    id: 'sub_00000000000000000000000001' as SubjectId,
    centerCode: input.centerCode,
    deviceOrigin: input.deviceOrigin,
    createdAt: new Date('2026-07-29T10:00:00Z'),
    updatedAt: new Date('2026-07-29T10:00:00Z'),
    updatedBy: input.updatedBy,
    deletedAt: null,
    version: 0,
    name: input.name,
    active: true,
  }),
};

// Stub parent use case — echoes an envelope-complete Parent; the handler only
// needs `execute` and returns the new id.
const stubCreateParent: CreateParentUseCase = {
  execute: async (input) => ({
    id: 'prt_00000000000000000000000001' as ParentId,
    centerCode: input.centerCode,
    deviceOrigin: input.deviceOrigin,
    createdAt: new Date('2026-07-29T10:00:00Z'),
    updatedAt: new Date('2026-07-29T10:00:00Z'),
    updatedBy: input.updatedBy,
    deletedAt: null,
    version: 0,
    naturalKey: `${input.centerCode}::x::${input.phone}`,
    name: input.name,
    phone: input.phone as PhoneNumber,
    email: input.email,
    relation: input.relation,
    whatsappOptIn: input.whatsappOptIn,
  }),
};

// Stub admin use cases — the handler only needs `execute`.
const stubCreateAdminAccount: CreateAdminAccountUseCase = {
  execute: async (input) => ({
    id: 'adm_00000000000000000000000001' as AdminAccountId,
    username: input.username,
    passwordHash: 'hashed',
    createdAt: new Date('2026-07-29T10:00:00Z'),
    updatedAt: new Date('2026-07-29T10:00:00Z'),
  }),
};
// User-management stubs (SOU-256). A fixed clock so the derived account status is
// deterministic; the invited user's code expires after `NOW`, so it is pending.
const NOW = new Date('2026-08-14T00:00:00Z');
const SETUP_CODE_EXPIRES_MS = new Date('2026-08-20T00:00:00Z').getTime();

// Captures the last command `user.create` forwarded, so a test can assert the
// envelope context (center/device/user) was injected in main, not sent by the
// renderer.
let lastCreateUserCommand: { username: string; role: string; centerCode: string } | null = null;
const stubCreateUser: CreateUserUseCase = {
  execute: async (command) => {
    lastCreateUserCommand = {
      username: command.username,
      role: command.role,
      centerCode: command.centerCode,
    };
    return {
      user: {
        id: 'usr_00000000000000000000000002' as UserId,
        centerCode: command.centerCode,
        deviceOrigin: command.deviceOrigin,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: command.updatedBy,
        deletedAt: null,
        version: 0,
        role: 'secretary',
        username: command.username,
        passwordHash: null,
        setupCodeHash: '$argon2id$v=19$m=19456,t=2,p=1$code$hash',
        setupCodeExpiresAt: SETUP_CODE_EXPIRES_MS,
        setupCodeRedeemedAt: null,
      },
      setupCode: 'A7K2-9FMP-3QRT',
    };
  },
};
let lastRedeemInput: { username: string; setupCode: string } | null = null;
const stubRedeemSetupCode: RedeemSetupCodeUseCase = {
  execute: async (input) => {
    lastRedeemInput = { username: input.username, setupCode: input.setupCode };
  },
};
// One pending invite (has hashes) + one redeemed account (password set), so the
// list test can assert redaction and both derived status values.
const stubListUsers = async () => [
  {
    id: 'usr_00000000000000000000000003' as UserId,
    centerCode: context.centerCode,
    deviceOrigin: context.deviceOrigin,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: context.updatedBy,
    deletedAt: null,
    version: 0,
    role: 'secretary' as const,
    username: 'amine',
    passwordHash: null,
    setupCodeHash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
    setupCodeExpiresAt: SETUP_CODE_EXPIRES_MS,
    setupCodeRedeemedAt: null,
  },
  {
    id: 'usr_00000000000000000000000001' as UserId,
    centerCode: context.centerCode,
    deviceOrigin: context.deviceOrigin,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: context.updatedBy,
    deletedAt: null,
    version: 0,
    role: 'owner' as const,
    username: 'directrice',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$owner$hash',
    setupCodeHash: null,
    setupCodeExpiresAt: null,
    setupCodeRedeemedAt: NOW,
  },
];

// Stub login use case — locked when the password is 'locked', wrong when it is
// 'nope', otherwise success. Enough to exercise all three response shapes.
const LOCKED_UNTIL_MS = new Date('2026-07-29T10:15:00Z').getTime();
const LOGGED_IN_USER = {
  userId: 'usr_00000000000000000000000001' as UserId,
  username: 'directrice',
  role: 'owner' as Role,
};
const stubAttemptLogin: AttemptLoginUseCase = {
  execute: async (input) => {
    if (input.password === 'locked') return { outcome: 'locked-out', lockedUntil: LOCKED_UNTIL_MS };
    if (input.password === 'nope') return { outcome: 'invalid-credentials', remainingAttempts: 3 };
    return { outcome: 'success', user: LOGGED_IN_USER };
  },
};
let remembered = false;
const stubDeviceSessions: DeviceSessions = {
  isAuthenticated: async () => remembered,
  forget: async () => {
    remembered = false;
  },
};
// The trusted session principal the SOU-265 role guard reads. `null` == no
// established principal (rejected as unauthenticated); a role drives the director
// gate on user.create / user.list.
let principal: { userId: UserId; role: Role } | null = null;
const stubResolvePrincipal = async () => principal;
// Login establishes the principal in memory directly from the verified identity
// (SOU-265) — independent of any persisted session — so the stub mirrors that.
const stubSetPrincipal = (next: { userId: UserId; role: Role }) => {
  principal = next;
};
const stubClearPrincipal = () => {
  principal = null;
};
/** Run `body` with a principal set, always restoring null afterwards. */
async function asPrincipal(role: Role, body: () => Promise<void>): Promise<void> {
  principal = { userId: 'usr_00000000000000000000000001' as UserId, role };
  try {
    await body();
  } finally {
    principal = null;
  }
}

// Center stubs (SOU-28). The store echoes the last saved profile; the plan is
// seeded from the context and never overwritten by the request.
const centerContext: CenterContext = { ...context, seedPlan: 'pro' };
let savedCenter: {
  name: string;
  address: string;
  phone: string;
  email: string;
  logoPath: string | null;
} | null = null;
const stubGetCenter: GetCenterProfileUseCase = {
  execute: async () =>
    savedCenter === null
      ? null
      : {
          id: 'ctr_00000000000000000000000001' as CenterId,
          centerCode: context.centerCode,
          deviceOrigin: context.deviceOrigin,
          createdAt: new Date('2026-07-29T10:00:00Z'),
          updatedAt: new Date('2026-07-29T10:00:00Z'),
          updatedBy: context.updatedBy,
          deletedAt: null,
          version: 0,
          plan: 'pro',
          ...savedCenter,
        },
};
const stubSaveCenter: SaveCenterProfileUseCase = {
  execute: async (input) => {
    savedCenter = {
      name: input.name,
      address: input.address,
      phone: input.phone,
      email: input.email,
      logoPath: input.logoPath,
    };
    return {
      id: 'ctr_00000000000000000000000001' as CenterId,
      centerCode: input.centerCode,
      deviceOrigin: input.deviceOrigin,
      createdAt: new Date('2026-07-29T10:00:00Z'),
      updatedAt: new Date('2026-07-29T10:00:00Z'),
      updatedBy: input.updatedBy,
      deletedAt: null,
      version: 0,
      plan: input.seedPlan,
      ...savedCenter,
    };
  },
};
const stubStoreLogo: StoreCenterLogoUseCase = {
  execute: async (input) => `logos/lgo_test.${input.extension}`,
};
const stubReadLogo: ReadCenterLogoUseCase = {
  execute: async (input) => (input.path === 'logos/lgo_test.png' ? new Uint8Array([7, 8, 9]) : null),
};

// Stub center-hours use cases — echo the input week back as entities.
const stubGetCenterHours: GetCenterHoursUseCase = {
  execute: async () => [],
};
const stubSaveCenterHours: SaveCenterHoursUseCase = {
  execute: async (input) =>
    input.week.map((day, index) => ({
      id: `chr_${String(index).padStart(26, '0')}` as CenterHoursId,
      centerCode: input.centerCode,
      deviceOrigin: input.deviceOrigin,
      createdAt: new Date('2026-07-29T10:00:00Z'),
      updatedAt: new Date('2026-07-29T10:00:00Z'),
      updatedBy: input.updatedBy,
      deletedAt: null,
      version: 0,
      dayOfWeek: day.dayOfWeek as WeekdayIndex,
      windows: day.windows.map((window) => ({
        open: window.open as TimeOfDay,
        close: window.close as TimeOfDay,
      })),
    })),
};

// Stub weekly-session read — returns one enriched WeeklySessionView so the handler
// can prove it serializes the read model to the boundary DTO (SOU-118 seam).
const stubListWeekSessions: ListWeekSessionsUseCase = {
  execute: async () => [
    {
      id: 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId,
      dayOfWeek: 1 as WeekdayIndex,
      start: '09:00' as TimeOfDay,
      end: '10:00' as TimeOfDay,
      roomId: 'rom_00000000000000000000000001' as RoomId,
      roomName: 'Salle A',
      teacherId: 'tch_00000000000000000000000001' as EntityId,
      teacherName: { fr: 'M. Alaoui', ar: 'السيد العلوي' },
      groupId: 'grp_00000000000000000000000001' as GroupId,
      subjectId: 'sub_00000000000000000000000001' as SubjectId,
      subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
      level: '2 Bac SM',
      kind: 'regular',
    },
  ],
};

// Stub concrete-session generator (SOU-129) — echoes the injected envelope
// context and one materialized occurrence so the handler can prove it maps the
// request (from/to → range) and strips the envelope to `sessionViewSchema`.
const stubGenerateSessions: GenerateAndPersistSessionsUseCase = {
  execute: async (input) => ({
    generationBatchId: 'gen_00000000000000000000000001' as GenerationBatchId,
    sessions: [
      {
        id: 'ses_00000000000000000000000001' as SessionId,
        centerCode: input.centerCode,
        deviceOrigin: input.deviceOrigin,
        createdAt: new Date('2026-07-29T10:00:00Z'),
        updatedAt: new Date('2026-07-29T10:00:00Z'),
        updatedBy: input.updatedBy,
        deletedAt: null,
        version: 0,
        recurringSessionId: input.recurringSessionId,
        generationBatchId: 'gen_00000000000000000000000001' as GenerationBatchId,
        roomId: 'rom_00000000000000000000000001' as RoomId,
        teacherId: null,
        date: input.range.start,
        start: '09:00' as TimeOfDay,
        end: '10:00' as TimeOfDay,
      },
    ],
    skippedHolidays: [],
    skippedOutsideHours: [],
  }),
};

// Stub bulk-undo (SOU-160) — the sentinel batch id throws
// GenerationBatchNotFoundError to prove the boundary does NOT swallow it.
const MISSING_BATCH_ID = 'gen_00000000000000000000000099' as GenerationBatchId;
const stubUndoGenerationBatch: UndoGenerationBatchUseCase = {
  execute: async (input) => {
    if (input.generationBatchId === MISSING_BATCH_ID) {
      throw new GenerationBatchNotFoundError(input.generationBatchId);
    }
    return { cancelledCount: 2, skippedOccurredCount: 1 };
  },
};

// Weekly recurring session write stubs (SOU-131). create/update echo an
// envelope-complete template so the handler proves it returns only the id; delete
// throws WeeklyRecurringSessionNotFoundError for the sentinel id to prove the
// boundary does NOT swallow it (unlike *.archive) — a stale id must surface.
const WRS_ID = 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId;
const MISSING_WRS_ID = 'wrs_00000000000000000000000099' as WeeklyRecurringSessionId;

function makeWeeklySession(over: Partial<{ id: WeeklyRecurringSessionId }> = {}) {
  return {
    id: WRS_ID,
    centerCode: context.centerCode,
    deviceOrigin: context.deviceOrigin,
    createdAt: new Date('2026-07-29T10:00:00Z'),
    updatedAt: new Date('2026-07-29T10:00:00Z'),
    updatedBy: context.updatedBy,
    deletedAt: null,
    version: 0,
    roomId: 'rom_00000000000000000000000001' as RoomId,
    teacherId: null,
    groupId: null,
    dayOfWeek: 1 as WeekdayIndex,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    ...over,
  };
}

const stubCreateWeeklySession: CreateWeeklyRecurringSessionUseCase = {
  execute: async () => makeWeeklySession(),
};
const stubUpdateWeeklySession: UpdateWeeklyRecurringSessionUseCase = {
  execute: async (input) => makeWeeklySession({ id: input.id }),
};
const stubCancelWeeklySession: CancelWeeklyRecurringSessionUseCase = {
  execute: async (input) => {
    if (input.id === MISSING_WRS_ID) throw new WeeklyRecurringSessionNotFoundError(input.id);
  },
};

// Group stubs (SOU-120). Each echoes an envelope-complete Group so the handler
// can prove it strips the envelope down to `groupViewSchema`. `archive` throws
// GroupNotFoundError for the sentinel id to exercise the boundary's idempotent
// swallow (the same shape room.archive uses).
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;
const ROOM_ID = 'rom_00000000000000000000000001' as RoomId;
const GROUP_ID = 'grp_00000000000000000000000001' as GroupId;
const MISSING_GROUP_ID = 'grp_00000000000000000000000099' as GroupId;

function makeGroup(over: Partial<Group> = {}) {
  return {
    id: GROUP_ID,
    centerCode: context.centerCode,
    deviceOrigin: context.deviceOrigin,
    createdAt: new Date('2026-07-29T10:00:00Z'),
    updatedAt: new Date('2026-07-29T10:00:00Z'),
    updatedBy: context.updatedBy,
    deletedAt: null,
    version: 0,
    subjectId: SUBJECT_ID,
    teacherId: null,
    niveauId: null,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular' as const,
    active: true,
    ...over,
  };
}

const stubCreateGroup: CreateGroupUseCase = {
  execute: async () => makeGroup(),
};
const stubListGroups: ListGroupsUseCase = {
  execute: async () => [makeGroup()],
};
const stubUpdateGroup: UpdateGroupUseCase = {
  execute: async (input) => makeGroup({ id: input.id, level: input.level, capacity: input.capacity }),
};
const stubArchiveGroup: ArchiveGroupUseCase = {
  execute: async (input) => {
    if (input.groupId === MISSING_GROUP_ID) throw new GroupNotFoundError(input.groupId);
  },
};
const stubRestoreGroup: RestoreGroupUseCase = {
  execute: async (input) => makeGroup({ id: input.groupId }),
};
// Read-model stubs (SOU-127). list-with-counts echoes a group + its count so the
// handler proves it flattens `{ group, enrolledCount }` onto the group view; roster
// echoes one already-envelope-free entry so the handler proves the passthrough.
const stubListGroupsWithCounts: ListGroupsWithCountsUseCase = {
  execute: async () => [{ group: makeGroup(), enrolledCount: 3 }],
};
const stubGetGroupRoster: GetGroupRosterUseCase = {
  execute: async () => [
    {
      enrollmentId: 'enr_00000000000000000000000001' as EnrollmentId,
      studentId: 'stu_00000000000000000000000001' as StudentId,
      name: { fr: 'Amine Bennani', ar: 'أمين بناني' },
      level: '2ème Bac',
      startMonth: '2026-09',
    },
  ],
};

const dispatch = createIpcDispatcher(
  createHandlers({
    createGroup: stubCreateGroup,
    listGroups: stubListGroups,
    listGroupsWithCounts: stubListGroupsWithCounts,
    getGroupRoster: stubGetGroupRoster,
    updateGroup: stubUpdateGroup,
    archiveGroup: stubArchiveGroup,
    restoreGroup: stubRestoreGroup,
    appVersion: () => '2.0.0',
    activePlanId: () => 'pro',
    activePlanFeatures: () => [...PLANS.pro.features],
    createSubject: stubCreateSubject,
    createParent: stubCreateParent,
    listWeekSessions: stubListWeekSessions,
    generateSessions: stubGenerateSessions,
    undoGenerationBatch: stubUndoGenerationBatch,
    createWeeklySession: stubCreateWeeklySession,
    updateWeeklySession: stubUpdateWeeklySession,
    cancelWeeklySession: stubCancelWeeklySession,
    saveCenterHours: stubSaveCenterHours,
    getCenterHours: stubGetCenterHours,
    envelopeContext: () => context,
    adminExists: async () => false,
    createAdminAccount: stubCreateAdminAccount,
    createUser: stubCreateUser,
    redeemSetupCode: stubRedeemSetupCode,
    listUsers: stubListUsers,
    now: () => NOW,
    attemptLogin: stubAttemptLogin,
    deviceSessions: stubDeviceSessions,
    adminUsername: async () => 'directrice',
    resetPasswordWithRecoveryCode: {
      execute: async () => ({ outcome: 'success' as const }),
    },
    resolvePrincipal: stubResolvePrincipal,
    setPrincipal: stubSetPrincipal,
    clearPrincipal: stubClearPrincipal,
    getCenterProfile: stubGetCenter,
    saveCenterProfile: stubSaveCenter,
    storeCenterLogo: stubStoreLogo,
    readCenterLogo: stubReadLogo,
    centerContext: () => centerContext,
  }),
);

describe('createIpcDispatcher', () => {
  it('validates the request, runs the handler, and validates the response', async () => {
    await expect(dispatch('app.ping', { message: 'hi' })).resolves.toEqual({
      reply: 'pong: hi',
      appVersion: '2.0.0',
    });
  });

  it('runs the plan.get handler', async () => {
    await expect(dispatch('plan.get', {})).resolves.toEqual({
      planId: 'pro',
      features: [...PLANS.pro.features],
    });
  });

  it('runs subject.create and returns the new id', async () => {
    await expect(
      dispatch('subject.create', { name: { fr: 'Mathématiques', ar: 'الرياضيات' } }),
    ).resolves.toEqual({ id: 'sub_00000000000000000000000001' });
  });

  it('rejects subject.create whose name fails the shared schema', async () => {
    await expect(dispatch('subject.create', { name: { fr: '', ar: '' } })).rejects.toThrow();
  });

  it('runs parent.create, normalizing the phone through the shared schema', async () => {
    await expect(
      dispatch('parent.create', {
        name: 'Ahmed Benali',
        phone: '0612345678',
        relation: 'pere',
      }),
    ).resolves.toEqual({ id: 'prt_00000000000000000000000001' });
  });

  it('rejects parent.create with a missing phone (the required anchor)', async () => {
    await expect(
      dispatch('parent.create', { name: 'Ahmed', phone: '', relation: 'pere' }),
    ).rejects.toThrow();
  });

  it('runs session.week and returns the enriched session views', async () => {
    await expect(dispatch('session.week', {})).resolves.toEqual({
      sessions: [
        {
          id: 'wrs_00000000000000000000000001',
          dayOfWeek: 1,
          start: '09:00',
          end: '10:00',
          roomId: 'rom_00000000000000000000000001',
          roomName: 'Salle A',
          teacherId: 'tch_00000000000000000000000001',
          teacherName: { fr: 'M. Alaoui', ar: 'السيد العلوي' },
          groupId: 'grp_00000000000000000000000001',
          subjectId: 'sub_00000000000000000000000001',
          subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
          level: '2 Bac SM',
          kind: 'regular',
        },
      ],
    });
  });

  it('runs session.generate and returns the envelope-stripped occurrences', async () => {
    await expect(
      dispatch('session.generate', {
        recurringSessionId: 'wrs_00000000000000000000000001',
        from: '2026-01-01',
        to: '2026-01-31',
      }),
    ).resolves.toEqual({
      generationBatchId: 'gen_00000000000000000000000001',
      sessions: [
        {
          id: 'ses_00000000000000000000000001',
          recurringSessionId: 'wrs_00000000000000000000000001',
          generationBatchId: 'gen_00000000000000000000000001',
          roomId: 'rom_00000000000000000000000001',
          teacherId: null,
          date: '2026-01-01',
          start: '09:00',
          end: '10:00',
        },
      ],
      skippedHolidays: [],
      skippedOutsideHours: [],
    });
  });

  it('runs session.undoGenerationBatch and returns the cancelled/skipped counts', async () => {
    await expect(
      dispatch('session.undoGenerationBatch', {
        generationBatchId: 'gen_00000000000000000000000001',
      }),
    ).resolves.toEqual({ cancelledCount: 2, skippedOccurredCount: 1 });
  });

  it('does NOT swallow GenerationBatchNotFoundError on session.undoGenerationBatch', async () => {
    await expect(
      dispatch('session.undoGenerationBatch', { generationBatchId: MISSING_BATCH_ID }),
    ).rejects.toThrow();
  });

  it('rejects session.undoGenerationBatch with a non-gen batch id', async () => {
    await expect(
      dispatch('session.undoGenerationBatch', { generationBatchId: 'rom_00000000000000000000000001' }),
    ).rejects.toThrow();
  });

  it('rejects session.generate with a backwards window (to before from)', async () => {
    await expect(
      dispatch('session.generate', {
        recurringSessionId: 'wrs_00000000000000000000000001',
        from: '2026-01-31',
        to: '2026-01-01',
      }),
    ).rejects.toThrow();
  });

  it('rejects session.generate with a non-wrs recurrence id', async () => {
    await expect(
      dispatch('session.generate', {
        recurringSessionId: 'rom_00000000000000000000000001',
        from: '2026-01-01',
        to: '2026-01-31',
      }),
    ).rejects.toThrow();
  });

  it('runs weeklySession.create and returns only the new id', async () => {
    await expect(
      dispatch('weeklySession.create', {
        roomId: 'rom_00000000000000000000000001',
        teacherId: null,
        groupId: null,
        dayOfWeek: 1,
        start: '09:00',
        end: '10:30',
        active: true,
        validFrom: null,
        validTo: null,
      }),
    ).resolves.toEqual({ id: WRS_ID });
  });

  it('defaults the optional teacher/group/validity/active fields on weeklySession.create', async () => {
    // Renderer sends only the required fields; the shared schema fills the rest.
    await expect(
      dispatch('weeklySession.create', {
        roomId: 'rom_00000000000000000000000001',
        dayOfWeek: 1,
        start: '09:00',
        end: '10:30',
      }),
    ).resolves.toEqual({ id: WRS_ID });
  });

  it('rejects weeklySession.create whose roomId fails the shared schema', async () => {
    await expect(
      dispatch('weeklySession.create', {
        roomId: 'nope',
        dayOfWeek: 1,
        start: '09:00',
        end: '10:30',
      }),
    ).rejects.toThrow();
  });

  it('runs weeklySession.update and returns the edited id', async () => {
    await expect(
      dispatch('weeklySession.update', {
        id: WRS_ID,
        roomId: 'rom_00000000000000000000000001',
        dayOfWeek: 1,
        start: '09:30',
        end: '11:00',
      }),
    ).resolves.toEqual({ id: WRS_ID });
  });

  it('runs weeklySession.delete and returns ok', async () => {
    await expect(dispatch('weeklySession.delete', { id: WRS_ID })).resolves.toEqual({ ok: true });
  });

  it('does NOT swallow WeeklyRecurringSessionNotFoundError on weeklySession.delete', async () => {
    await expect(dispatch('weeklySession.delete', { id: MISSING_WRS_ID })).rejects.toThrow();
  });

  it('runs centerHours.get and returns the week view', async () => {
    await expect(dispatch('centerHours.get', {})).resolves.toEqual({ week: [] });
  });

  it('runs centerHours.save and echoes the saved week as an envelope-stripped view', async () => {
    const week = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      windows: dayOfWeek === 0 ? [] : [{ open: '09:00', close: '18:00' }],
    }));
    await expect(dispatch('centerHours.save', week)).resolves.toEqual({ week });
  });

  it('rejects centerHours.save whose week fails the shared schema', async () => {
    await expect(
      dispatch('centerHours.save', [{ dayOfWeek: 0, windows: [{ open: '18:00', close: '09:00' }] }]),
    ).rejects.toThrow();
  });

  it('runs admin.exists', async () => {
    await expect(dispatch('admin.exists', {})).resolves.toEqual({ exists: false });
  });

  it('runs admin.create and returns the new id', async () => {
    await expect(
      dispatch('admin.create', { username: 'directrice', password: PASS }),
    ).resolves.toEqual({ id: 'adm_00000000000000000000000001' });
  });

  it('rejects admin.create whose password fails the shared policy schema', async () => {
    await expect(
      dispatch('admin.create', { username: 'directrice', password: 'weak' }),
    ).rejects.toThrow();
  });

  it('runs user.create, forwards the injected envelope context, and returns the view + one-time code', async () => {
    lastCreateUserCommand = null;
    await asPrincipal('owner', async () => {
      await expect(dispatch('user.create', { username: 'amine', role: 'secretary' })).resolves.toEqual(
        {
          user: {
            id: 'usr_00000000000000000000000002',
            username: 'amine',
            role: 'secretary',
            status: 'setup-pending',
          },
          setupCode: 'A7K2-9FMP-3QRT',
        },
      );
      // The renderer sent only username + role; center/device/user were injected in main.
      expect(lastCreateUserCommand).toEqual({
        username: 'amine',
        role: 'secretary',
        centerCode: context.centerCode,
      });
    });
  });

  it('never leaks credential material through the user.create response', async () => {
    await asPrincipal('owner', async () => {
      const res = await dispatch('user.create', { username: 'amine', role: 'secretary' });
      expect(res.user).not.toHaveProperty('passwordHash');
      expect(res.user).not.toHaveProperty('setupCodeHash');
      expect(JSON.stringify(res.user)).not.toContain('argon2id');
    });
  });

  it('rejects user.create whose username fails the shared schema', async () => {
    await asPrincipal('owner', async () => {
      await expect(dispatch('user.create', { username: 'a', role: 'secretary' })).rejects.toThrow();
    });
  });

  it('rejects user.create from an unauthenticated renderer (director-only channel)', async () => {
    principal = null;
    const error = await dispatch('user.create', { username: 'amine', role: 'secretary' }).catch(
      (e: unknown) => e as Error,
    );
    // Unknown/absent principal surfaces as NotAuthenticatedError, whose stable
    // `not-authenticated` code the renderer localizes — not the role code.
    expect(decodeDomainError(error.message)?.code).toBe('not-authenticated');
  });

  it('allows an admin (not just an owner) to run user.create', async () => {
    await asPrincipal('admin', async () => {
      await expect(
        dispatch('user.create', { username: 'amine', role: 'secretary' }),
      ).resolves.toHaveProperty('setupCode');
    });
  });

  it.each(['secretary', 'viewer'] as const)(
    'rejects user.create from a %s with the insufficient-role code (director-only)',
    async (role) => {
      await asPrincipal(role, async () => {
        const error = await dispatch('user.create', {
          username: 'amine',
          role: 'secretary',
        }).catch((e: unknown) => e as Error);
        expect(decodeDomainError(error.message)?.code).toBe('insufficient-role');
      });
    },
  );

  it('runs user.redeemSetupCode and forwards the request to the use case', async () => {
    lastRedeemInput = null;
    await expect(
      dispatch('user.redeemSetupCode', {
        username: 'amine',
        setupCode: 'A7K2-9FMP-3QRT',
        newPassword: 'Casa2026!',
      }),
    ).resolves.toEqual({ ok: true });
    expect(lastRedeemInput).toEqual({ username: 'amine', setupCode: 'A7K2-9FMP-3QRT' });
  });

  it('runs user.list and returns only redacted views (no credential hashes)', async () => {
    await asPrincipal('owner', async () => {
      const res = await dispatch('user.list', {});
      expect(res).toEqual({
        users: [
          {
            id: 'usr_00000000000000000000000003',
            username: 'amine',
            role: 'secretary',
            status: 'setup-pending',
          },
          {
            id: 'usr_00000000000000000000000001',
            username: 'directrice',
            role: 'owner',
            status: 'active',
          },
        ],
      });
      // Belt-and-braces: no serialized hash survives the boundary.
      expect(JSON.stringify(res)).not.toContain('argon2id');
      for (const user of res.users) {
        expect(user).not.toHaveProperty('passwordHash');
        expect(user).not.toHaveProperty('setupCodeHash');
        expect(user).not.toHaveProperty('setupCode');
      }
    });
  });

  it('rejects user.list from an unauthenticated renderer (director-only channel)', async () => {
    principal = null;
    const error = await dispatch('user.list', {}).catch((e: unknown) => e as Error);
    expect(decodeDomainError(error.message)?.code).toBe('not-authenticated');
  });

  it.each(['secretary', 'viewer'] as const)(
    'rejects user.list from a %s with the insufficient-role code (director-only)',
    async (role) => {
      await asPrincipal(role, async () => {
        const error = await dispatch('user.list', {}).catch((e: unknown) => e as Error);
        expect(decodeDomainError(error.message)?.code).toBe('insufficient-role');
      });
    },
  );

  // SOU-97: the bare `admin.verify` channel was removed so a locked console
  // cannot be probed for a password bypassing the lockout throttle. Password
  // verification is reachable only through the throttled `auth.login` path.
  it('no longer exposes an admin.verify channel', async () => {
    expect(isIpcChannel('admin.verify')).toBe(false);
    await expect(
      dispatch('admin.verify' as never, { username: 'directrice', password: PASS }),
    ).rejects.toThrow();
  });

  it('serializes auth.login success', async () => {
    await expect(
      dispatch('auth.login', { username: 'directrice', password: PASS, rememberDevice: true }),
    ).resolves.toEqual({ outcome: 'success' });
  });

  it('establishes the principal on a NON-remembered login so the director clears the guard (SOU-265 B1)', async () => {
    principal = null;
    // rememberDevice omitted/false: no session is persisted, so re-reading the
    // session would resolve to null. Login must still establish the principal in
    // memory from the verified identity — otherwise the director is wrongly
    // rejected at the role guard and writes mis-attribute to the bootstrap user.
    await expect(
      dispatch('auth.login', { username: 'directrice', password: PASS }),
    ).resolves.toEqual({ outcome: 'success' });
    expect(principal).toEqual({ userId: LOGGED_IN_USER.userId, role: 'owner' });
    // The freshly-established owner now passes the director-only guard.
    await expect(
      dispatch('user.create', { username: 'amine', role: 'secretary' }),
    ).resolves.toHaveProperty('setupCode');
    principal = null;
  });

  it('clears the principal on a recovery-code password reset (SOU-265 B4)', async () => {
    principal = { userId: LOGGED_IN_USER.userId, role: 'owner' };
    await expect(
      dispatch('auth.resetWithCode', { code: 'ABCD-EFGH-JKLM-NPQR', password: 'Casa2026!' }),
    ).resolves.toEqual({ outcome: 'success' });
    // The reset invalidated the device session, so the stale principal must be
    // dropped — the guard now fails closed until the device authenticates again.
    expect(principal).toBeNull();
  });

  it('serializes auth.login invalid-credentials with remaining attempts', async () => {
    await expect(
      dispatch('auth.login', { username: 'directrice', password: 'nope' }),
    ).resolves.toEqual({ outcome: 'invalid-credentials', remainingAttempts: 3 });
  });

  it('serializes auth.login locked-out as epoch millis', async () => {
    await expect(
      dispatch('auth.login', { username: 'directrice', password: 'locked' }),
    ).resolves.toEqual({ outcome: 'locked-out', lockedUntilMs: LOCKED_UNTIL_MS });
  });

  it('runs auth.session and auth.logout', async () => {
    remembered = true;
    await expect(dispatch('auth.session', {})).resolves.toEqual({ authenticated: true });
    await expect(dispatch('auth.logout', {})).resolves.toEqual({ ok: true });
    await expect(dispatch('auth.session', {})).resolves.toEqual({ authenticated: false });
  });

  it('returns null from center.get before any profile is saved', async () => {
    savedCenter = null;
    await expect(dispatch('center.get', {})).resolves.toEqual({ center: null });
  });

  it('runs center.save and returns the DTO with the seeded (not request-supplied) plan', async () => {
    const res = await dispatch('center.save', {
      name: 'Centre Al Ilm',
      address: 'Rue X',
      phone: '0522000000',
      email: 'a@b.ma',
      logoPath: null,
    });
    expect(res).toEqual({
      center: {
        name: 'Centre Al Ilm',
        address: 'Rue X',
        phone: '+212522000000', // normalized to E.164 at the contract boundary
        email: 'a@b.ma',
        logoPath: null,
        plan: 'pro',
      },
    });
    // ...and it is then readable via center.get.
    await expect(dispatch('center.get', {})).resolves.toMatchObject({
      center: { name: 'Centre Al Ilm', plan: 'pro' },
    });
  });

  it('rejects center.save whose name fails the shared schema', async () => {
    await expect(
      dispatch('center.save', { name: '   ', logoPath: null }),
    ).rejects.toThrow();
  });

  it('runs center.saveLogo and returns the stored relative path', async () => {
    await expect(
      dispatch('center.saveLogo', { bytes: new Uint8Array([1, 2, 3]), extension: 'png' }),
    ).resolves.toEqual({ path: 'logos/lgo_test.png' });
  });

  it('runs center.logoBytes and returns the stored bytes', async () => {
    await expect(dispatch('center.logoBytes', { path: 'logos/lgo_test.png' })).resolves.toEqual({
      bytes: new Uint8Array([7, 8, 9]),
    });
  });

  it('returns null bytes from center.logoBytes for an unknown path', async () => {
    await expect(dispatch('center.logoBytes', { path: 'logos/missing.png' })).resolves.toEqual({
      bytes: null,
    });
  });

  it('runs group.create and returns the new id', async () => {
    await expect(
      dispatch('group.create', {
        subjectId: SUBJECT_ID,
        teacherId: null,
        roomId: ROOM_ID,
        level: '2ème Bac',
        capacity: 15,
        kind: 'regular',
      }),
    ).resolves.toEqual({ id: GROUP_ID });
  });

  it('rejects group.create whose capacity fails the shared schema', async () => {
    await expect(
      dispatch('group.create', {
        subjectId: SUBJECT_ID,
        teacherId: null,
        roomId: ROOM_ID,
        level: '2ème Bac',
        capacity: 0,
        kind: 'regular',
      }),
    ).rejects.toThrow();
  });

  it('rejects group.create whose kind is off-contract', async () => {
    await expect(
      dispatch('group.create', {
        subjectId: SUBJECT_ID,
        teacherId: null,
        roomId: ROOM_ID,
        level: '2ème Bac',
        capacity: 15,
        kind: 'bootcamp',
      }),
    ).rejects.toThrow();
  });

  it('runs group.list and returns the envelope-stripped group views', async () => {
    await expect(dispatch('group.list', { scope: 'active' })).resolves.toEqual({
      groups: [
        {
          id: GROUP_ID,
          subjectId: SUBJECT_ID,
          teacherId: null,
          niveauId: null,
          level: '2ème Bac',
          capacity: 15,
          kind: 'regular',
          archived: false,
          createdAt: '2026-07-29T10:00:00.000Z',
        },
      ],
    });
  });

  it('runs group.update and echoes the saved view', async () => {
    const res = await dispatch('group.update', {
      id: GROUP_ID,
      subjectId: SUBJECT_ID,
      teacherId: null,
      level: '1ère Bac',
      capacity: 18,
      kind: 'regular',
    });
    expect(res).toMatchObject({ group: { id: GROUP_ID, level: '1ère Bac', capacity: 18 } });
  });

  it('runs group.archive and returns ok', async () => {
    await expect(dispatch('group.archive', { id: GROUP_ID })).resolves.toEqual({ ok: true });
  });

  it('swallows a GroupNotFoundError on group.archive (idempotent boundary)', async () => {
    await expect(dispatch('group.archive', { id: MISSING_GROUP_ID })).resolves.toEqual({ ok: true });
  });

  it('runs group.restore and echoes the revived view', async () => {
    await expect(dispatch('group.restore', { id: GROUP_ID })).resolves.toMatchObject({
      group: { id: GROUP_ID, archived: false },
    });
  });

  it('runs group.listWithCounts and flattens enrolledCount onto each group view', async () => {
    await expect(dispatch('group.listWithCounts', { scope: 'active' })).resolves.toEqual({
      groups: [
        {
          id: GROUP_ID,
          subjectId: SUBJECT_ID,
          teacherId: null,
          niveauId: null,
          level: '2ème Bac',
          capacity: 15,
          kind: 'regular',
          archived: false,
          createdAt: '2026-07-29T10:00:00.000Z',
          enrolledCount: 3,
        },
      ],
    });
  });

  it('runs group.roster and returns the resolved roster entries', async () => {
    await expect(dispatch('group.roster', { groupId: GROUP_ID })).resolves.toEqual({
      roster: [
        {
          enrollmentId: 'enr_00000000000000000000000001',
          studentId: 'stu_00000000000000000000000001',
          name: { fr: 'Amine Bennani', ar: 'أمين بناني' },
          level: '2ème Bac',
          startMonth: '2026-09',
        },
      ],
    });
  });

  it('rejects a request that fails its schema', async () => {
    await expect(dispatch('app.ping', { message: 123 })).rejects.toThrow();
    await expect(dispatch('app.ping', {})).rejects.toThrow();
  });

  it('rejects an unknown channel', async () => {
    // @ts-expect-error — deliberately off-contract to prove the runtime guard
    await expect(dispatch('nope.channel', {})).rejects.toThrow(/unknown ipc channel/i);
  });

  it('encodes a thrown DomainError code into the rejection message (survives IPC)', async () => {
    const throwing = createIpcDispatcher({
      'app.ping': () => {
        throw new GroupFullError(GROUP_ID, 15);
      },
    } as unknown as IpcHandlers);
    const error = await throwing('app.ping', { message: 'hi' }).catch((e: unknown) => e as Error);
    expect(decodeDomainError(error.message)).toEqual({
      code: 'group-full',
      message: expect.stringContaining('full'),
    });
  });

  it('lets a non-domain error through unwrapped', async () => {
    const throwing = createIpcDispatcher({
      'app.ping': () => {
        throw new TypeError('boom');
      },
    } as unknown as IpcHandlers);
    const error = await throwing('app.ping', { message: 'hi' }).catch((e: unknown) => e as Error);
    expect(decodeDomainError(error.message)).toBeNull();
    expect(error.message).toContain('boom');
  });

  it('rejects when a handler returns an off-contract response', async () => {
    const bad = {
      // missing appVersion — must fail response validation
      'app.ping': () => ({ reply: 'x' }),
    } as unknown as IpcHandlers;
    const badDispatch = createIpcDispatcher(bad);
    await expect(badDispatch('app.ping', { message: 'hi' })).rejects.toThrow();
  });
});
