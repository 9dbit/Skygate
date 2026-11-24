# SKYGATE Production Security Hardening — 2026-11-24

## Scope
Production hardening of the currently deployed Railway source branch `feat/agency-native-wallet-20261108`, starting at commit `701e88fb281c08fced1b89e221cbbe21751e2ebc`.

This gate covers the public PWA, private Studio HTTP surface, release/media serving, container/runtime privilege, native-agency sandbox boundary and CI security regression. It does **not** authorize real-money or real-value gameplay.

## Production findings addressed
1. Production Studio could still be explicitly opened by `SKYGATE_STUDIO_PUBLIC_TESTING=true`. Production now refuses to start with that setting and always requires authentication when Studio is present.
2. Basic-auth failures had no brute-force throttle. Invalid credentials are now rate-limited per client with a global abuse ceiling; valid owner credentials are not locked out by failed attempts.
3. Public responses were missing defense-in-depth headers. CSP, HSTS, Permissions-Policy, COOP, CORP, Origin-Agent-Cluster and cross-domain-policy denial are now applied centrally, including native API responses.
4. The public health response could include native wallet/database/source/studio status. Health still exercises native readiness but returns only `ok`, service and version.
5. The PWA used an inline bootstrap script, preventing a strict `script-src 'self'` CSP. It is now an external same-origin script; critical boot CSS moved into the existing stylesheet.
6. HTTP server defaults were broad. Request/header/keepalive timeouts, maximum headers and requests-per-socket are bounded.
7. Production Node could remain root when native wallet mode was not enabled. The process now sets restrictive umask, prepares only the known Railway `/data` mount as root, then drops permanently to uid/gid 1000 before serving.
8. The Docker build context included unnecessary QA/source documentation. A `.dockerignore` minimizes production context; app files are copied with uid/gid 1000 ownership. Node prototype mutation is disabled in the production container.
9. Native sandbox actor keys were ambiguous string concatenations and new round admission had no local abuse ceiling. Actor identity is now a hash of the exact tenant/player tuple; wallet-session identifiers and size are bounded; expired launches/new spins fail closed; new-round rate limits preserve exact idempotent replay.
10. CI tested Node 22 although production runs Node 24 and did not run on the deployed feature branch. Existing QA now targets Node 24 on both `main` and the production source branch. A dedicated production-security workflow adds static and live HTTP security gates.

## Railway configuration
Before deployment:
- `SKYGATE_STUDIO_PUBLIC_TESTING=false`
- `SKYGATE_STUDIO_REQUIRE_AUTH=true`
- Existing Studio password is retained and never printed or copied.
- Existing GameOps secrets remain sealed and are not changed.
- No `AGENCY_WALLET_MODE` or agency wallet credentials are enabled by this release.

## Security gates
Required before merge/deploy:
- Existing Node test suite
- Existing Chromium Game/Studio smoke
- Existing Chromium/WebKit audio QA
- Existing Chromium/WebKit iPhone Studio QA
- New static security audit
- New production HTTP header/auth/health tests
- New native session expiry / actor isolation / rate-limit regression tests
- `git diff --check`

## Residual gates
This release is suitable for a hardened public virtual-credit production deployment. It is **not** a real-value security certification. Real-value activation still requires independent infrastructure/pentest review, production key/certificate lifecycle, cross-host failover and disaster recovery, coordinated rollback tests, sustained load/soak testing, and the previously documented math/legal/economic approval gates.
