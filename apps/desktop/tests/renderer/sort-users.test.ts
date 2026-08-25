import { describe, expect, it } from 'vitest';
import { sortUsersForRoster } from '../../src/renderer/lib/users/sort-users';
import type { UserView } from '../../src/renderer/lib/users/user-view';

function user(partial: Partial<UserView> & Pick<UserView, 'id' | 'username'>): UserView {
  return { role: 'secretary', status: 'active', fullName: null, ...partial };
}

describe('sortUsersForRoster', () => {
  it('orders owner first, then active employees, then pending invites', () => {
    const rows = sortUsersForRoster([
      user({ id: '3', username: 'zineb', status: 'setup-pending' }),
      user({ id: '2', username: 'bilal', status: 'active' }),
      user({ id: '1', username: 'omar', role: 'owner' }),
    ]);

    expect(rows.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('alphabetizes by username within each band', () => {
    const rows = sortUsersForRoster([
      user({ id: 'p2', username: 'yassine', status: 'setup-pending' }),
      user({ id: 'p1', username: 'amine', status: 'setup-pending' }),
      user({ id: 'a2', username: 'nadia' }),
      user({ id: 'a1', username: 'fatima' }),
    ]);

    expect(rows.map((r) => r.username)).toEqual(['fatima', 'nadia', 'amine', 'yassine']);
  });

  it('orders not-yet-onboarded invites (null name/username) deterministically by id', () => {
    const rows = sortUsersForRoster([
      user({ id: 'p2', username: null, fullName: null, status: 'setup-pending' }),
      user({ id: 'p1', username: null, fullName: null, status: 'setup-pending' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['p1', 'p2']);
  });

  it('sorts by full name when present, falling back to username', () => {
    const rows = sortUsersForRoster([
      user({ id: 'a2', username: 'zzz', fullName: 'Amine Alaoui' }),
      user({ id: 'a1', username: 'aaa', fullName: 'Bilal Idrissi' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['a2', 'a1']);
  });

  it('does not mutate the input array', () => {
    const input = [user({ id: '1', username: 'b' }), user({ id: '2', username: 'a', role: 'owner' })];
    sortUsersForRoster(input);
    expect(input.map((r) => r.id)).toEqual(['1', '2']);
  });
});
