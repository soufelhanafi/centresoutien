import { describe, expect, it } from 'vitest';
import { sortUsersForRoster } from '../../src/renderer/lib/users/sort-users';
import type { UserView } from '../../src/renderer/lib/users/user-view';

function user(partial: Partial<UserView> & Pick<UserView, 'id' | 'username'>): UserView {
  return { role: 'secretary', setupPending: false, ...partial };
}

describe('sortUsersForRoster', () => {
  it('orders owner first, then active employees, then pending invites', () => {
    const rows = sortUsersForRoster([
      user({ id: '3', username: 'zineb', setupPending: true }),
      user({ id: '2', username: 'bilal', setupPending: false }),
      user({ id: '1', username: 'omar', role: 'owner' }),
    ]);

    expect(rows.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('alphabetizes by username within each band', () => {
    const rows = sortUsersForRoster([
      user({ id: 'p2', username: 'yassine', setupPending: true }),
      user({ id: 'p1', username: 'amine', setupPending: true }),
      user({ id: 'a2', username: 'nadia' }),
      user({ id: 'a1', username: 'fatima' }),
    ]);

    expect(rows.map((r) => r.username)).toEqual(['fatima', 'nadia', 'amine', 'yassine']);
  });

  it('does not mutate the input array', () => {
    const input = [user({ id: '1', username: 'b' }), user({ id: '2', username: 'a', role: 'owner' })];
    sortUsersForRoster(input);
    expect(input.map((r) => r.id)).toEqual(['1', '2']);
  });
});
