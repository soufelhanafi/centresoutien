/**
 * LAN discovery vocabulary for the embedded hub (SOU-318). A hub host advertises
 * its center over mDNS/Bonjour so a second laptop can find it without anyone
 * typing an IP address; the joining laptop still supplies the per-center pairing
 * TOKEN, which is deliberately NEVER put on the wire here — discovery answers
 * "which centers are hosted on this LAN and where", never "how to authenticate".
 */

/** Bonjour service `type` (the framework wraps it as `_centresoutien-hub._tcp`). */
export const HUB_MDNS_TYPE = 'centresoutien-hub';

/** A hub responder found on the LAN — everything the join flow needs except the
 *  token the human types. */
export type DiscoveredHub = {
  /** The center's human display name (from the advertised TXT record). */
  readonly name: string;
  /** The LAN IPv4 the hub listens on. */
  readonly host: string;
  readonly port: number;
  readonly centreId: string;
  readonly centerCode: string;
};

/** The TXT payload advertised alongside the SRV record. Identity only — no token,
 *  no personal data; a center display name is already shown on its own invoices. */
export type HubTxtRecord = {
  readonly centreId: string;
  readonly centerCode: string;
  readonly name: string;
};

/** A live mDNS advertisement; `stop` withdraws it from the LAN. */
export type HubAdvertisement = { stop(): void };

/** Advertises the open center's hub on the LAN. Kept as a port so composition-root
 *  and its tests never import the Bonjour/network adapter. */
export type HubAdvertiserPort = {
  advertise(input: { name: string; port: number; txt: HubTxtRecord }): HubAdvertisement;
};

/** Browses the LAN for hub responders within a time window. */
export type HubDiscovererPort = {
  discover(timeoutMs: number): Promise<readonly DiscoveredHub[]>;
};

/** Serializes the identity into Bonjour's `Record<string,string>` TXT shape. */
export function encodeHubTxt(record: HubTxtRecord): Record<string, string> {
  return {
    centreId: record.centreId,
    centerCode: record.centerCode,
    name: record.name,
  };
}

/**
 * Narrows an untrusted TXT map (Bonjour hands back `Record<string, string |
 * Buffer>` from whatever answered on the LAN) into our identity shape. Returns
 * null when a required field is missing or non-string, so a foreign or malformed
 * responder is skipped instead of surfacing a half-built center to the joiner.
 */
export function decodeHubTxt(txt: unknown): HubTxtRecord | null {
  if (txt === null || typeof txt !== 'object') return null;
  const record = txt as Record<string, unknown>;
  const centreId = asNonEmptyString(record['centreId']);
  const centerCode = asNonEmptyString(record['centerCode']);
  const name = asNonEmptyString(record['name']);
  if (centreId === null || centerCode === null || name === null) return null;
  return { centreId, centerCode, name };
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  // Bonjour may hand a TXT value back as a Buffer — accept that too.
  if (value instanceof Uint8Array && value.length > 0) {
    const decoded = Buffer.from(value).toString('utf-8');
    return decoded.length > 0 ? decoded : null;
  }
  return null;
}

/**
 * Crockford base32 alphabet minus the ambiguous letters (I, L, O, U) — the same
 * "no confusable characters" discipline a human-typed code needs. `randomBytes`
 * is injected so tests are deterministic and callers reuse the platform CSPRNG.
 */
const PAIRING_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A LAN pairing token the director reads off one laptop and types into another.
 * 12 symbols over a 32-letter alphabet = 60 bits of entropy — far beyond guessing
 * over a LAN, while grouping (`XXXX-XXXX-XXXX`) keeps it transcribable. The token
 * is the hub's per-center shared secret; it is never advertised over mDNS.
 */
export function generatePairingToken(randomBytes: (size: number) => Uint8Array): string {
  const bytes = randomBytes(12);
  let code = '';
  for (let index = 0; index < 12; index += 1) {
    const byte = bytes[index] ?? 0;
    code += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length];
    if (index === 3 || index === 7) code += '-';
  }
  return code;
}
