/**
 * Port for persisting the center's logo file under app data. The concrete
 * adapter (filesystem on desktop, object storage on the future web tier) lives
 * outside the domain; the use case only knows this shape. Bytes are a plain
 * `Uint8Array` — a portable ES type, no Node `Buffer` dependency leaks in.
 */
export interface LogoStore {
  /**
   * Write the logo bytes and return the **relative** reference stored on the
   * center row (e.g. `logos/lgo_01HW….png`). Relative so it stays portable
   * across machines and app-data locations; consumers resolve it against their
   * own app-data base.
   */
  save(input: { bytes: Uint8Array; extension: string }): Promise<string>;
}
