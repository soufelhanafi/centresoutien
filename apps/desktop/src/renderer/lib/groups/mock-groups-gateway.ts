import type { GroupInput } from '@centresoutien/domain';
import type { GroupsGateway } from './groups-gateway';
import type {
  GroupFormOptions,
  GroupRow,
  GroupStatus,
  LocalizedName,
  RosterEntry,
  StudentOption,
} from './group-view';
import {
  ROOMS,
  STUDENTS,
  SUBJECTS,
  TEACHERS,
  seedEnrollments,
  seedGroups,
  type MockGroup,
} from './mock-group-seed';

/**
 * In-memory stand-in for the not-yet-published Group read model (SOU-127) and the
 * missing `subject.list` channel. It lets the full Group CRUD UI — list + filters,
 * fill %, detail, roster, create/edit/archive/restore, quick add-student — run
 * end-to-end in both locales before the IPC read model exists, exactly like
 * `mockPlannerGateway` (SOU-54). Mutations persist for the session so the list and
 * roster reflect create/edit/archive/enroll immediately. The seed lives in
 * `mock-group-seed.ts`.
 */
const groups = seedGroups;
const enrollments = seedEnrollments;

let sequence = 100;
const nextId = (prefix: string): string => `${prefix}_${(sequence += 1)}`;

const subjectName = (id: string): LocalizedName =>
  SUBJECTS.find((s) => s.id === id)?.name ?? { fr: id, ar: id };
const roomName = (id: string): string => ROOMS.find((r) => r.id === id)?.name ?? id;
const teacherName = (id: string | null): LocalizedName | null =>
  id === null ? null : (TEACHERS.find((teacher) => teacher.id === id)?.name ?? { fr: id, ar: id });
const studentById = (id: string): StudentOption | undefined => STUDENTS.find((s) => s.id === id);
const enrolledCount = (groupId: string): number =>
  enrollments.filter((e) => e.groupId === groupId).length;

function toRow(group: MockGroup): GroupRow {
  return {
    id: group.id,
    subjectId: group.subjectId,
    subjectName: subjectName(group.subjectId),
    roomId: group.roomId,
    roomName: roomName(group.roomId),
    teacherId: group.teacherId,
    teacherName: teacherName(group.teacherId),
    level: group.level,
    capacity: group.capacity,
    kind: group.kind,
    enrolledCount: enrolledCount(group.id),
    archived: group.archived,
  };
}

class MockGroupsGateway implements GroupsGateway {
  async list(status: GroupStatus): Promise<readonly GroupRow[]> {
    const archived = status === 'archived';
    return groups.filter((group) => group.archived === archived).map(toRow);
  }

  async get(id: string): Promise<GroupRow | null> {
    const group = groups.find((candidate) => candidate.id === id);
    return group ? toRow(group) : null;
  }

  async formOptions(): Promise<GroupFormOptions> {
    return { subjects: SUBJECTS, rooms: ROOMS, teachers: TEACHERS };
  }

  async roster(groupId: string): Promise<readonly RosterEntry[]> {
    return enrollments
      .filter((enrollment) => enrollment.groupId === groupId)
      .map((enrollment) => {
        const student = studentById(enrollment.studentId);
        return {
          enrollmentId: enrollment.id,
          studentId: enrollment.studentId,
          studentName: student?.name ?? { fr: enrollment.studentId, ar: enrollment.studentId },
          level: student?.level ?? '',
        };
      });
  }

  async enrollableStudents(groupId: string): Promise<readonly StudentOption[]> {
    const enrolled = new Set(
      enrollments.filter((e) => e.groupId === groupId).map((e) => e.studentId),
    );
    return STUDENTS.filter((student) => !enrolled.has(student.id));
  }

  async create(input: GroupInput): Promise<GroupRow> {
    const group: MockGroup = { id: nextId('grp'), archived: false, ...input };
    groups.push(group);
    return toRow(group);
  }

  async update(id: string, input: GroupInput): Promise<GroupRow> {
    const group = groups.find((candidate) => candidate.id === id);
    if (!group) throw new Error(`group ${id} not found`);
    Object.assign(group, input);
    return toRow(group);
  }

  async archive(id: string): Promise<void> {
    const group = groups.find((candidate) => candidate.id === id);
    if (group) group.archived = true;
  }

  async restore(id: string): Promise<void> {
    const group = groups.find((candidate) => candidate.id === id);
    if (group) group.archived = false;
  }

  async addStudent(groupId: string, studentId: string): Promise<void> {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) throw new Error(`group ${groupId} not found`);
    if (enrolledCount(groupId) >= group.capacity) throw new Error('group-full');
    enrollments.push({ id: nextId('enr'), groupId, studentId });
  }

  async removeStudent(enrollmentId: string): Promise<void> {
    const index = enrollments.findIndex((enrollment) => enrollment.id === enrollmentId);
    if (index >= 0) enrollments.splice(index, 1);
  }
}

export const mockGroupsGateway: GroupsGateway = new MockGroupsGateway();
