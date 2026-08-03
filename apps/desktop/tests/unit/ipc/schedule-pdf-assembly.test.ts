import { describe, expect, it } from 'vitest';
import type {
  Center,
  CenterCode,
  CenterId,
  DeviceId,
  EntityId,
  GroupId,
  RoomId,
  SubjectId,
  UserId,
  WeeklyRecurringSessionId,
  WeeklySessionView,
} from '@centresoutien/domain';
import { buildSchedulePdfInput, type ScheduleAssemblyDeps } from '../../../src/main/ipc/schedule-pdf-assembly';
import type { ScheduleExportViewFilterDto } from '../../../src/shared/ipc/contract';

const CENTER_CODE = 'CS-DEV-001' as CenterCode;
const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const TEACHER_A = 'tch_00000000000000000000000001' as EntityId;
const GROUP_A = 'grp_00000000000000000000000001' as GroupId;

function makeCenter(over: Partial<Center> = {}): Center {
  return {
    id: 'ctr_00000000000000000000000001' as CenterId,
    centerCode: CENTER_CODE,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: new Date('2026-07-29T10:00:00Z'),
    updatedAt: new Date('2026-07-29T10:00:00Z'),
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    name: 'Centre Réussite',
    address: '',
    phone: '',
    email: '',
    logoPath: null,
    plan: 'essentiel',
    ...over,
  };
}

let seq = 0;
function view(over: Partial<WeeklySessionView> = {}): WeeklySessionView {
  seq += 1;
  return {
    id: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    dayOfWeek: 1,
    start: '09:00',
    end: '10:00',
    roomId: ROOM_A,
    roomName: 'Salle 1',
    teacherId: TEACHER_A,
    teacherName: { fr: 'M. Alaoui', ar: 'السيد العلوي' },
    groupId: GROUP_A,
    subjectId: 'sub_00000000000000000000000001' as SubjectId,
    subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
    level: '2 Bac SM',
    kind: 'regular',
    ...over,
  } as WeeklySessionView;
}

function makeDeps(overrides: Partial<ScheduleAssemblyDeps> = {}): ScheduleAssemblyDeps {
  return {
    getCenterProfile: { execute: async () => makeCenter() },
    readCenterLogo: { execute: async () => null },
    ...overrides,
  };
}

describe('buildSchedulePdfInput', () => {
  it('keeps every session and reports the full-center view for scope "full"', async () => {
    const sessions = [view({ roomId: ROOM_A }), view({ roomId: ROOM_B })];
    const requestView: ScheduleExportViewFilterDto = { scope: 'full' };

    const input = await buildSchedulePdfInput(makeDeps(), sessions, requestView, 'fr');

    expect(input.sessions).toHaveLength(2);
    expect(input.view).toEqual({ scope: 'full' });
  });

  it('narrows to the matching room id and carries the requested display name', async () => {
    const sessions = [view({ roomId: ROOM_A }), view({ roomId: ROOM_B })];
    const requestView: ScheduleExportViewFilterDto = { scope: 'room', roomId: ROOM_A, roomName: 'Salle 1' };

    const input = await buildSchedulePdfInput(makeDeps(), sessions, requestView, 'fr');

    expect(input.sessions).toHaveLength(1);
    expect(input.sessions[0]?.roomName).toBe('Salle 1');
    expect(input.view).toEqual({ scope: 'room', roomName: 'Salle 1' });
  });

  it('narrows to the matching teacher id', async () => {
    const other = 'tch_00000000000000000000000002' as EntityId;
    const sessions = [view({ teacherId: TEACHER_A }), view({ teacherId: other })];
    const requestView: ScheduleExportViewFilterDto = {
      scope: 'teacher',
      teacherId: TEACHER_A,
      teacherName: { fr: 'M. Alaoui', ar: 'السيد العلوي' },
    };

    const input = await buildSchedulePdfInput(makeDeps(), sessions, requestView, 'fr');

    expect(input.sessions).toHaveLength(1);
  });

  it('narrows to the matching group id and returns an empty week for no matches', async () => {
    const other = 'grp_00000000000000000000000002' as GroupId;
    const sessions = [view({ groupId: other })];
    const requestView: ScheduleExportViewFilterDto = {
      scope: 'group',
      groupId: GROUP_A,
      subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
      level: '2 Bac SM',
    };

    const input = await buildSchedulePdfInput(makeDeps(), sessions, requestView, 'fr');

    expect(input.sessions).toHaveLength(0);
    expect(input.view).toEqual({
      scope: 'group',
      subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
      level: '2 Bac SM',
    });
  });

  it('resolves the logo bytes only when the center has a logoPath', async () => {
    let readCalled = false;
    const deps = makeDeps({
      getCenterProfile: { execute: async () => makeCenter({ logoPath: 'logos/center.png' }) },
      readCenterLogo: {
        execute: async (input) => {
          readCalled = true;
          expect(input).toEqual({ path: 'logos/center.png' });
          return new Uint8Array([1, 2, 3]);
        },
      },
    });

    const input = await buildSchedulePdfInput(deps, [], { scope: 'full' }, 'fr');

    expect(readCalled).toBe(true);
    expect(input.center.logoBytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('returns an empty-string center name and null logo when no profile is saved yet', async () => {
    const deps = makeDeps({ getCenterProfile: { execute: async () => null } });

    const input = await buildSchedulePdfInput(deps, [], { scope: 'full' }, 'fr');

    expect(input.center).toEqual({ name: '', logoBytes: null });
  });
});
