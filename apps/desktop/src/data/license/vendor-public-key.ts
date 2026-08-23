/**
 * The vendor's Ed25519 public key (SPKI PEM), embedded in the app binary. The
 * matching private key is held only by the vendor's license-signing tool and is
 * never committed — a user can read this key but cannot forge a license with it
 * (asymmetric signing, SOU-98 KICKOFF).
 *
 * PLACEHOLDER: replaced with the real production key at release. Until then no
 * license file verifies against it, so every install resolves to `essentiel`
 * (dev builds override the plan via `CS_PLAN` → `setActivePlan`, not a file).
 * A packaged build always uses this key; the `CS_LICENSE_PUBLIC_KEY` override is
 * DEV-only, and integration tests inject a test-keypair adapter via
 * `ContainerOptions.license` instead.
 */
export const VENDOR_LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAzVQN05+IkgoFWOMf2h1zEX4veIdiyrp8/QEOXHLfdEs=
-----END PUBLIC KEY-----
`;
