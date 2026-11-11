# Local preview with fake data

`pnpm install --frozen-lockfile` once, then:

```
npm run preview:local        # Postgres + Supabase Auth (GoTrue) in Docker, schema, fake seed, next dev
npm run preview:local:shots  # screenshots + 180 dpi draft-PDF PNGs, written outside the repo
npm run preview:local:down   # stops dev server, auth proxy, containers, removes the data volume
```

- Needs Docker Desktop (local socket). Everything binds to loopback: Postgres 54329, GoTrue 54330,
  auth proxy 54331, app 3100 (ports live in `.env.preview.local.example`).
- The environment is built in-process from `.env.preview.local.example`. Shell DB/Supabase variables are
  ignored (names are printed, values never read); `.env` and `.env.local` are not loaded. A production flag
  in the shell (`VERCEL`, `VERCEL_ENV`, `NODE_ENV=production`) makes the script refuse.
- `scripts/lib/local-only-guard.cjs` is fail-closed and runs first, again before the dev server starts, and
  inside `prisma/seed-demo.ts` before any write. `npm run dev` runs it in deny-list mode (both known
  Supabase refs and production flags refuse).
- Schema: historical `prisma migrate deploy` cannot replay on an empty database
  (docs/DATABASE-RECOVERY.md; first failure `20260320000000_add_partner_users`), so the local-only bootstrap
  uses `prisma db push`, like the CI database-contract job. Production migrations are untouched.
- Logins (fake, from the example file): `preview-admin@example.test`, `preview-student@example.test`.
- Output (logs, screenshots) goes to `~/.wap-preview-local/out`.
