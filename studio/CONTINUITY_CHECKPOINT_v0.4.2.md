# SKYGATE Studio v0.4.2 continuity checkpoint

Prepared 28 October 2026 (Asia/Jakarta).

## Deployment context

- Repository: `9dbit/Skygate`, branch `main`.
- Railway project: `626b6a33-c7f1-4ec5-a9c7-6834349fa3bd`.
- Service: `skygate-web` / `fff3472b-24bb-418c-aa11-0f95cfd53390`.
- Production environment: `588a155b-2cb3-4f42-b2fa-254a6aa3cd3c`.
- Origin: `https://skygate-web-production.up.railway.app`.
- At the start of this continuation, Railway confirmed deployment `e7240e84-8f46-4390-b307-f996da905ccc` at `8681099c928670e4344363c774c79684384fbf1f` was `SUCCESS` (v0.4.1).
- Railway confirmed that `SKYGATE_STUDIO_USER`, `SKYGATE_STUDIO_PASSWORD`, and `SKYGATE_STUDIO_REQUIRE_AUTH` are configured. Secret values were not retrieved or changed.
- For the current live version, inspect Railway's latest deployment and matching commit. The health endpoint reports `0.4.2` when this patch is running. Do not infer deployment completion from this source file alone.

## v0.4.2 changes

- Normalize decoded request paths before authentication and disk resolution. This closes a reproduced route-alias authentication bypass.
- Limit static serving to `/studio/` and `/play/`; root redirects to Studio and `/health` stays public. Repository metadata and hidden paths are not static app routes.
- Apply the read-only HTTP method policy to health requests as well.
- Add server regression coverage to the default `npm test` command. Existing game math and browser project storage are unchanged.
- Correct historical documentation that still said v0.4.1 had not been deployed or that the Studio password was missing.

## Validation and limits

- `npm test`: 25/25 passing (server route/auth regression checks plus existing math tests).
- `node --check` passes for the server, Studio UI and audio engine.
- Extracted original media and all MP3 fallback assets; existing authentication/media smoke suite passes 10/10 locally.
- Production browser navigation encountered `ERR_INVALID_AUTH_CREDENTIALS` at HTTP Basic auth; a subsequent browser state read was blocked by browser policy. No authenticated Studio browser session was established and no workaround was attempted.
- These checks do **not** verify physical iPhone Safari layout, native audio, or authenticated production UI behavior.

## Next product work

1. Verify authenticated Studio on physical iPhone Safari: sound unlock, mute, trim, audio upload, app switching, mobile navigation, ZIP export/restore.
2. Continue the high-resolution transparent sprite and full-screen play renderer work. Public `/play/` remains the v0.2 visual proof of concept.
3. Cross-device project sync and role-based auth remain a separate backend feature; browser-local storage and portable JSON/ZIP remain the current persistence model.

All gameplay uses synthetic virtual credits. No payments, deposits, withdrawals, cash prizes or real-money integrations.
