# Test-only license keypair (SOU-172)

These two Ed25519 PEM files exist **solely so the E2E and integration suites can
mint signature-valid license fixtures**. They are NOT the vendor keypair and
guard nothing real:

- `test-public-key.pem` — trusted **only** by the dedicated E2E build
  (`electron-vite build --mode e2e`), injected through the `__CS_E2E__`-gated
  trust-anchor seam in `apps/desktop/src/main/composition-root.ts` via the
  `CS_LICENSE_PUBLIC_KEY` env var. A release build never reads it — the seam is
  dead-code-eliminated when `__CS_E2E__` is `false`.
- `test-private-key.pem` — committed so the fixtures (and anyone) can re-sign
  license envelopes. It signs nothing the production app will ever trust.

To regenerate:

```sh
node -e "const{generateKeyPairSync}=require('node:crypto');const{writeFileSync}=require('node:fs');const{publicKey,privateKey}=generateKeyPairSync('ed25519');writeFileSync('test-public-key.pem',publicKey.export({type:'spki',format:'pem'}).toString());writeFileSync('test-private-key.pem',privateKey.export({type:'pkcs8',format:'pem'}).toString());"
```
