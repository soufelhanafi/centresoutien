/**
 * The `change_log.payload` wire format (SOU-170). One row per repository write
 * stores a versioned envelope — the entity's version at write time plus the
 * serialized entity — so a payload is self-describing and survives both local
 * schema evolution and cross-device sync-apply (SOU-80+): a payload authored on
 * a device at schema vN is upcast to the current shape before it is replayed or
 * applied, instead of being upserted blindly (which would break the moment a
 * migration renames/drops/re-types a column).
 *
 * The serialized `entity` is the DOMAIN entity shape (camelCase, domain types —
 * booleans as booleans, dates as ISO strings, bilingual fields nested), never
 * the physical SQLite row. The physical row is a data-layer detail private to
 * each device; mapping domain shape → current physical row happens at
 * replay/apply time on the device that consumes the payload.
 */
export const CURRENT_CHANGE_LOG_PAYLOAD_VERSION = 1;

/** One change_log payload: the entity snapshot + the shape version it was
 *  written at. `version` is what an upcaster switches on; it must be bumped
 *  (and an upcaster added) whenever a domain entity shape evolves. */
export type ChangeLogPayload = {
  version: number;
  entity: unknown;
};

/** Upcasts an entity snapshot from one payload version to the next. Registered
 *  oldest → newest: index 0 is v1→v2, index 1 is v2→v3, and so on. */
export type ChangeLogPayloadUpcaster = (entity: unknown) => unknown;

/**
 * Serializes a just-written domain entity into the versioned change_log payload
 * string. Called by adapters from inside the same transaction as the entity
 * write. `entity` must be the domain shape — not a physical row — so the log
 * stays portable.
 */
// `JSON.stringify` special-cases `Date` for free (`toJSON` → ISO string) but has
// no such handling for `Set` — a bare `Set` serializes as `{}`, silently
// dropping every member (e.g. `User.permissions`). This mirrors that same
// free-ride for any `Set`-typed field anywhere in an entity, so a future
// Set-typed field never needs its own payload-serialization workaround.
function replaceSetsWithArrays(_key: string, value: unknown): unknown {
  return value instanceof Set ? [...value] : value;
}

export function serializeChangeLogPayload(entity: unknown): string {
  const payload: ChangeLogPayload = {
    version: CURRENT_CHANGE_LOG_PAYLOAD_VERSION,
    entity,
  };
  return JSON.stringify(payload, replaceSetsWithArrays);
}

/**
 * Deserializes a change_log payload, running the upcasters for any shape older
 * than the newest version this device knows. The device understands payload
 * versions `1 … upcasters.length + 1`: every bump that changed the domain
 * entity shape adds one upcaster, and the write version moves with it. With no
 * upcasters (the current v1 case) it simply returns the stored entity. Used by
 * both replay (same device, post-migration) and, later, sync-apply (another
 * device at a possibly different schema version). Throws on a malformed
 * envelope or a payload from a version whose upcaster this device lacks —
 * applying it blind would be corruption.
 */
export function deserializeChangeLogPayload(
  raw: string,
  upcasters: readonly ChangeLogPayloadUpcaster[] = [],
): unknown {
  let payload: ChangeLogPayload;
  try {
    payload = JSON.parse(raw) as ChangeLogPayload;
  } catch {
    throw new Error('change_log: payload is not valid JSON');
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.version !== 'number' ||
    !Number.isSafeInteger(payload.version) ||
    payload.version < 1 ||
    !('entity' in payload) ||
    payload.entity === null ||
    typeof payload.entity !== 'object'
  ) {
    throw new Error('change_log: malformed payload envelope (expected { version, entity })');
  }

  const newestKnown = upcasters.length + 1;
  if (payload.version > newestKnown) {
    throw new Error(
      `change_log: payload version ${payload.version} needs upcasters this device lacks (knows up to version ${newestKnown}) — refusing to apply it blind`,
    );
  }

  let entity: unknown = payload.entity;
  const upcastsToRun = upcasters.slice(payload.version - 1);
  for (const upcast of upcastsToRun) {
    entity = upcast(entity);
  }
  return entity;
}
