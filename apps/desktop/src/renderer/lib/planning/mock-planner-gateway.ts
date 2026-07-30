import type { PlannerGateway } from './planner-gateway';
import type { PlannerSessionView } from './planner-view';

/**
 * In-memory stand-in for the not-yet-published `session.listWeek` channel (see
 * `planner-gateway.ts` for the contract requested from SOU-53). It lets the full
 * planner — grid, subject colours, teacher/room/level filters, exam-prep badge,
 * click-to-open dialog — run end-to-end in both locales before the IPC read model
 * exists. It models the server (a flat list of the week's sessions), so the UI
 * drives it through TanStack Query exactly as it will the real adapter.
 *
 * The seed deliberately covers the states the grid must handle: several subjects
 * (distinct colours), an unassigned-teacher session (`teacherId: null`), an
 * exam-prep session (dashed badge, kind filter), overlapping times in different
 * rooms, and both early and late slots so the time range derives correctly.
 */
const WEEK: readonly PlannerSessionView[] = [
  {
    id: 'wrs_mock_0001',
    dayOfWeek: 1,
    start: '09:00',
    end: '10:30',
    roomId: 'rom_1',
    roomName: 'Salle 1',
    teacherId: 'tch_1',
    teacherName: 'M. Alaoui',
    subjectId: 'sub_math',
    subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
    level: '2 Bac SM',
    kind: 'regular',
  },
  {
    id: 'wrs_mock_0002',
    dayOfWeek: 1,
    start: '09:30',
    end: '11:00',
    roomId: 'rom_2',
    roomName: 'Salle 2',
    teacherId: 'tch_2',
    teacherName: 'Mme Bennani',
    subjectId: 'sub_phys',
    subjectName: { fr: 'Physique-Chimie', ar: 'الفيزياء والكيمياء' },
    level: '1 Bac SE',
    kind: 'regular',
  },
  {
    id: 'wrs_mock_0003',
    dayOfWeek: 3,
    start: '14:00',
    end: '16:00',
    roomId: 'rom_1',
    roomName: 'Salle 1',
    teacherId: 'tch_1',
    teacherName: 'M. Alaoui',
    subjectId: 'sub_math',
    subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
    level: '2 Bac SM',
    kind: 'exam-prep',
  },
  {
    id: 'wrs_mock_0004',
    dayOfWeek: 4,
    start: '10:00',
    end: '11:30',
    roomId: 'rom_3',
    roomName: 'Salle 3',
    teacherId: null,
    teacherName: null,
    subjectId: 'sub_svt',
    subjectName: { fr: 'SVT', ar: 'علوم الحياة والأرض' },
    level: '3AC',
    kind: 'regular',
  },
  {
    id: 'wrs_mock_0005',
    dayOfWeek: 6,
    start: '08:00',
    end: '09:30',
    roomId: 'rom_2',
    roomName: 'Salle 2',
    teacherId: 'tch_3',
    teacherName: 'M. Idrissi',
    subjectId: 'sub_fr',
    subjectName: { fr: 'Français', ar: 'الفرنسية' },
    level: '1 Bac SE',
    kind: 'regular',
  },
  {
    id: 'wrs_mock_0006',
    dayOfWeek: 6,
    start: '16:30',
    end: '18:30',
    roomId: 'rom_1',
    roomName: 'Salle 1',
    teacherId: 'tch_2',
    teacherName: 'Mme Bennani',
    subjectId: 'sub_phys',
    subjectName: { fr: 'Physique-Chimie', ar: 'الفيزياء والكيمياء' },
    level: '2 Bac SM',
    kind: 'exam-prep',
  },
];

class MockPlannerGateway implements PlannerGateway {
  async listWeek(): Promise<readonly PlannerSessionView[]> {
    return WEEK;
  }
}

export const mockPlannerGateway: PlannerGateway = new MockPlannerGateway();
