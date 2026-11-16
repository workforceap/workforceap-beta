# Admin Game Lab (pre-release)

Sandbox for two original WAP Practice 3D games (Packet Quest 3D, Firewall Defender 3D). Admin-only. Default OFF everywhere.

## Access gate
`lib/game-lab/access.ts` `canUseGameLab(userId)` = `isAdmin(userId)` AND `isFlagEnabledForUser('admin_game_lab', userId)`. Fails closed on any error or missing flag row. It runs on both pages and on every asset response; the nav row is cosmetic.

| Caller | Result |
|---|---|
| Anonymous | pages redirect to login (307), assets 401 |
| Signed in non-admin (any role) | assets 404; pages 307 away from /admin |
| Admin with flag off or no row | assets 404; pages render the not-found UI with HTTP 200 (App Router streams it, same as any unknown admin route) and no game content |
| Admin with flag ON | pages and assets served |

## Assets
`assets/game-lab/` (outside `public/`) is served only by `app/api/admin/game-lab/[game]/[...asset]` from the fixed manifest in `lib/game-lab/manifest.ts`. Unknown or traversal paths are 404. Responses are `private, no-store` with `Vary: Cookie`. `next.config.ts` adds one `SAMEORIGIN` framing exception for `/api/admin/game-lab/:game/index.html` only.

## Sandbox
Original WAP Practice lessons, `providerLessonId: null`, no credit, not teaching-reviewed. Progress is browser `localStorage` only (`wap-practice-3d-save-v1`, `wap-practice-3d-security-save-v1`). No database writes, email, analytics or learning records. Vendored three.js 0.187.0 with its license; no CDN.

## Enable, disable, rollback
The flag row is not created by code or migration.
1. Enable (Mike's go required for production): `/admin/feature-flags`, create key `admin_game_lab`, enabled, 100%, allowed roles `admin` and `super_admin`.
2. Disable: set the row to disabled, or delete it. Effect is immediate, no deploy.
3. Rollback: delete the row, then revert the merge commit. Nothing else depends on this feature.

## Local verification
```bash
npm run preview:local      # guarded: local Postgres, auth shim, mail sink, next dev on :3100
npm run game-lab:verify    # exits 1 on any violation; evidence in GAME_LAB_EVIDENCE (default .local-preview/game-lab-evidence)
npm run preview:local:down
```

`scripts/game-lab/verify-preview.mjs` refuses any non-local environment. It runs the auth/flag matrix for anonymous, student, every other role fixture (each checked against `/api/auth/me`) and admin with no row, an OFF row and an ON row. It then plays both games through the real page and iframe at 1280, 390 and 320 wide with ordinary clicks (pause/resume, retry, every stage, keyboard-only, reduced motion, WebGL off). It removes the flag in `finally`.

Pass/fail lives in `scripts/game-lab/verdicts.mjs`. `tests/game-lab/verdicts.test.mjs` (unit lane) proves that a wrong status, leaked content, an external request, a console error, a DB write and a missing or unwired mail sink each fail.

Mail and analytics in the preview:
- The preview points Resend at a loopback capture sink (`scripts/lib/preview-mail-sink.cjs`, `RESEND_BASE_URL`); the guard refuses any other mail URL. A contact-form control send must be captured before the gameplay window opens.
- Third-party tags (GTM, Vercel analytics, Sentry user) are off when `LOCAL_PREVIEW=1` outside Vercel (`lib/runtime/localPreview.ts`), so the run demands zero external requests and zero console errors with no filtering.
- The gameplay window must change no row in any public table (row count plus xmin watermark) and send no mail.
