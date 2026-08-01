import { useMemo } from 'react';
import { useRooms } from '../room/use-rooms';
import { useTeachers } from '../teacher/use-teachers';
import { useGroups } from '../group/use-groups';
import type { SessionFormOptions } from '../../lib/planning/session-options';

/**
 * Loads the live **active** rooms, teachers, and groups for the session form's
 * pickers, mapped to the option shapes. Composes the existing per-module queries
 * (SOU-34 / SOU-37 / SOU-127) so archived rows never appear in a picker while the
 * grid may still render their past sessions. `data` is `undefined` until all
 * three resolve, mirroring `useGroupOptions`.
 */
export function useSessionFormOptions(): {
  data: SessionFormOptions | undefined;
  isPending: boolean;
  isError: boolean;
} {
  const rooms = useRooms('active');
  const teachers = useTeachers('active', '');
  const groups = useGroups('active');

  const ready = rooms.data !== undefined && teachers.data !== undefined && groups.data !== undefined;

  const data = useMemo<SessionFormOptions | undefined>(() => {
    if (rooms.data === undefined || teachers.data === undefined || groups.data === undefined) {
      return undefined;
    }
    return {
      rooms: rooms.data.map((room) => ({ id: room.id, name: room.name })),
      teachers: teachers.data.map((teacher) => ({ id: teacher.id, name: teacher.name })),
      groups: groups.data.map((group) => ({
        id: group.id,
        subjectName: group.subjectName,
        level: group.level,
        kind: group.kind,
      })),
    };
  }, [rooms.data, teachers.data, groups.data]);

  return {
    data,
    isPending: !ready && (rooms.isPending || teachers.isPending || groups.isPending),
    isError: rooms.isError || teachers.isError || groups.isError,
  };
}
