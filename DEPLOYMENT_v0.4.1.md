# SKYGATE Studio v0.4.1 | Authorized deployment guide

Prepared: 28 October 2026 (Asia/Jakarta)

**GitHub repo:** `9dbit/Skygate`, branch `main`  
**Expected base commit:** `5203d1e3c990fc624acb66573731eb8832070091`  
**Railway project:** `626b6a33-c7f1-4ec5-a9c7-6834349fa3bd`  
**Environment:** `588a155b-2cb3-4f42-b2fa-254a6aa3cd3c` (`production`)  
**Service:** `fff3472b-24bb-418c-aa11-0f95cfd53390` (`skygate-web`)

## Actual status

Source v0.4.1 is packaged and locally tested. **This patch has NOT been pushed or deployed.** GitHub connector write calls were rejected by safety controls. The last verified Railway deployment is v0.3.1 at commit `5203d1e3`. Do not assume the download is live.

## Safe manual apply in an authorized environment

1. Clone the repository and inspect the current head before touching it:

   ```sh
   git clone https://github.com/9dbit/Skygate.git
   cd Skygate
   git switch main
   git rev-parse HEAD
   ```

   Compare with the expected base commit above. If different, inspect the diff and reconcile changes instead of blindly overwriting them.

2. Extract `Skygate_v0.4.1_Production_Patch.zip` **into the repository root**. Keep `media_assets.tar.gz` from the old release. This overlay contains all v0.4 + v0.4.1 changes and adds `audio_mp3.tar.gz`.

3. Validate before pushing:

   ```sh
   npm test
   node --check studio/studio.js
   node --check studio/audio_engine.js
   node --check server.mjs
   tar -tzf audio_mp3.tar.gz
   git diff --stat
   git status --short
   ```

4. Set the following **secret Railway service variables** through the Railway dashboard on `Skygate / skygate-web / production`. Do not put the password in any repository, chat, ZIP, screenshot or log:

   ```text
   SKYGATE_STUDIO_USER=<private admin username>
   SKYGATE_STUDIO_PASSWORD=<new long random password>
   SKYGATE_STUDIO_REQUIRE_AUTH=true
   ```

   The server will fail closed for Studio until a password exists; the public `/play/` and `/health` endpoints remain available. Schedule the cutover accordingly.

5. After reviewing the patch, commit normally and push through an authorized GitHub connection:

   ```sh
   git add -A
   git commit -m "feat: SKYGATE Studio v0.4.1 mobile audio resume and editor backups"
   git push origin main
   ```

   Never force push. Railway's existing GitHub integration should then deploy the new commit automatically.

6. Verify the **newest** Railway deployment has status `SUCCESS` and `meta.commitHash` equals your new Git commit SHA. A queued or building deployment is not sufficient.

7. Verify public and private endpoints over HTTPS:

   - `GET /health` returns version `0.4.1` and HTTP 200.
   - Without credentials, `GET /studio/` and `/studio/assets/audio/bgm_celestial_loop.mp3` return 401.
   - With credentials, both return 200; `/play/` without credentials returns 200.
   - On a physical iPhone in Safari, check landscape/portrait, safe area, touch navigation, audio unlock, BGM and SFX, app switching, mute, upload, backup ZIP export and restore.

## Backout

Keep the old v0.3.1 deployment in Railway for rollback if the new release fails. Do not delete or overwrite the old code/assets until production smoke tests pass.

## Product boundaries

Editor math and jackpot settings govern an auditable **virtual-credit** prototype. They do not represent proprietary provider odds, certified RTP, or a payment-enabled gambling service. The editor's changes live in each browser's local storage; no remote database or cross-device synchronization is available.
