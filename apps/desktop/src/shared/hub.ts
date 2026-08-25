/**
 * The default TCP port the embedded LAN hub listens on (SOU-318). Shared by the
 * host side (hosting config + the `CS_HUB_PORT` env default) and the client side
 * (the manual-join form's pre-filled port) so the two can never drift — a
 * mismatch would make the default manual-join path fail against a default host.
 */
export const DEFAULT_HUB_PORT = 4747;
