import type { UserView } from './user-view';

/**
 * `user.list` returns the owner plus every live account unsorted (SOU-256). The
 * roster reads best owner-first (the single first-run account that anchors the
 * center), then active employees, then still-pending invites grouped at the end
 * so the director sees at a glance which codes are outstanding — each band
 * alphabetized by display name. Pure so it can be unit-tested without a render.
 */
export function sortUsersForRoster(users: readonly UserView[]): readonly UserView[] {
  return [...users].sort(
    (a, b) => rank(a) - rank(b) || sortKey(a).localeCompare(sortKey(b)),
  );
}

function rank(user: UserView): number {
  if (user.role === 'owner') return 0;
  return user.status === 'active' ? 1 : 2;
}

// A not-yet-onboarded invite has no full name or username yet (SOU-303); it sorts
// by its stable id so the ordering is deterministic within the pending band.
function sortKey(user: UserView): string {
  return user.fullName ?? user.username ?? user.id;
}
