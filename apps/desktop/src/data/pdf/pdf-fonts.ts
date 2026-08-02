import { AMIRI_REGULAR_BASE64 } from './fonts/amiri-regular-base64';
import { AMIRI_BOLD_BASE64 } from './fonts/amiri-bold-base64';

// Amiri (Regular + Bold) is bundled straight into the main-process JS bundle as
// generated base64 modules (`fonts/*-base64.ts`) — binary assets have no safe
// equivalent of the `?raw` glob `composition-root.ts` uses for migration SQL
// (text), so this is the binary-safe version of the same "no runtime file read,
// survives packaging/asar" property. Amiri is SIL Open Font License (see
// `fonts/AMIRI-OFL.txt`) and is the Arabic body font for the invoice PDF
// (SOU-69 done-when: "Amiri/Cairo font for AR"). French/Latin text uses
// pdf-lib's built-in Helvetica — it needs no embedding and covers the accented
// Latin-1 range French requires.
export function amiriRegularBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(AMIRI_REGULAR_BASE64, 'base64'));
}

export function amiriBoldBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(AMIRI_BOLD_BASE64, 'base64'));
}
