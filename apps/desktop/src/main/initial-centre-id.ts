/** The retired demo database is never a selectable application center. */
export const LEGACY_DEMO_CENTRE_ID = "demo";
const DEFAULT_CENTRE_ID = "local";

/** Maps an explicit legacy demo selection to the ordinary local center. */
export function resolveInitialCentreId(requested: string | undefined): string {
  return requested === LEGACY_DEMO_CENTRE_ID
    ? DEFAULT_CENTRE_ID
    : requested ?? DEFAULT_CENTRE_ID;
}
