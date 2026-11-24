# Local preview with fake data

`npm run preview:local` starts a throwaway local stack with synthetic data. No Supabase, Vercel, production or demo-cloud access.

```
npm run preview:local          # Postgres (Docker, 127.0.0.1:54329) + schema + seed + auth shim + next dev
npm run preview:local:shots    # screenshots + draft PDFs (PNG, 180 dpi) into $PREVIEW_SHOTS_DIR (default: OS temp dir, outside the repo)
npm run preview:local:down     # stops next dev, the auth shim and the container (add -- --purge to drop the volume)
```

Needs Docker running and `pnpm install` done. Open `http://localhost:3100/login` (Next 15 dev loops on a 308 for `/en/login` when bound to `127.0.0.1`, so the web server binds the loopback name `localhost`; the database and auth shim stay on `127.0.0.1`).

| Login | Email | Password |
| --- | --- | --- |
| Admin | `preview-admin@example.test` | `Preview-Admin-1!` |
| Student | `preview-student@example.test` | `Preview-Student-1!` |

Admin attendance: `/admin/attendance/draft`. Fake enrollment ids are in `prisma/fixtures/preview-attendance.ts`.

## Safety model

- The environment is built in process from `.env.preview.local.example` (fake values). The script never reads `.env`, `.env.local` or shell DB variables; children get an allowlist of OS variables only. Shell values such as `DATABASE_URL` are named as ignored, never printed.
- `scripts/lib/local-only-guard.cjs` fails closed. It runs first in `local-preview.mjs`, at the top of `prisma/seed-demo.ts` (before any client or write), when the auth shim starts, and from `npm run dev` when `LOCAL_PREVIEW=1`. It refuses unset or unparseable values, non-loopback hosts, a port other than the preview's own, `*.supabase.co`/pooler hosts, both known project refs anywhere (URL, `options=`, percent-encoded, JWT claims), and `VERCEL`, `VERCEL_ENV` or `NODE_ENV=production`. Messages name the variable, never the value, and the guard opens no connection.
- The auth shim (`scripts/lib/preview-auth-shim.cjs`) implements only password sign-in, refresh, user and logout for `@supabase/ssr`. It will not start unless the guard passes and answers 404 to any non-loopback `Host`.

## Schema bootstrap

`prisma migrate deploy` cannot replay the history on an empty database (`docs/DATABASE-RECOVERY.md`: P3018 on the duplicate `partner_users` migration, observed again here). The local-only bootstrap is `prisma db push` of `schema.prisma`, the same baseline the CI database-contract lane uses. No migration file is edited. Supabase-only RLS/storage DDL is not applied; the preview connects as the local superuser, so nothing depends on it.
