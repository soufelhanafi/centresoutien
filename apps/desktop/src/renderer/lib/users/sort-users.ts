import type { UserView } from './user-view';

/**
 * `user.list` returns the owner plus every live account unsorted (SOU-256). The
 * roster reads best owner-first (the single first-run account that anchors the
 * center), then active employees, then still-pending invites grouped at the end
 * so the director sees at a glance which codes are outstanding — each band
 * alphabetized by username. Pure so it can be unit-tested without a render.
 */
export function sortUsersForRoster(users: readonly UserView[]): readonly UserView[] {
  return [...users].sort((a, b) => rank(a) - rank(b) || a.username.localeCompare(b.username));
}

function rank(user: UserView): number {
  if (user.role === 'owner') return 0;
  return user.setupPending ? 2 : 1;
}
