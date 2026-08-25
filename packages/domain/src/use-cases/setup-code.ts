import type { SecureRandom } from '../ports/secure-random';

// 32 unambiguous glyphs (Crockford-ish: no 0/O, 1/I). Exactly divides 256, so a
// plain `byte % 32` is uniform over the alphabet — no rejection sampling needed.
const SETUP_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SETUP_CODE_GROUPS = 3;
const SETUP_CODE_GROUP_LEN = 4;

// A human-readable one-time setup code (e.g. `A7K2-9FMP-3QRT`) drawn from the
// cryptographically secure SecureRandom. Each byte maps uniformly onto the
// 32-glyph alphabet (which divides 256 evenly). Shared by CreateUser (first
// invite) and ReissueSetupCode (director re-issue), so both mint identical-shape
// codes from one home (SOU-303).
export function generateSetupCode(random: SecureRandom): string {
  const total = SETUP_CODE_GROUPS * SETUP_CODE_GROUP_LEN;
  const bytes = random.bytes(total);
  const groups: string[] = [];
  for (let g = 0; g < SETUP_CODE_GROUPS; g++) {
    let group = '';
    for (let i = 0; i < SETUP_CODE_GROUP_LEN; i++) {
      const byte = bytes[g * SETUP_CODE_GROUP_LEN + i] ?? 0;
      group += SETUP_CODE_ALPHABET.charAt(byte % SETUP_CODE_ALPHABET.length);
    }
    groups.push(group);
  }
  return groups.join('-');
}
