# Auth Troubleshooting

## Can't sign in (phone or web)

Login and logout now use **server-side API routes** so cookies are set consistently:

- **Login** – `POST /api/auth/login` (email, password) – sets session cookies in the response
- **Logout** – `POST /api/auth/logout` – clears session cookies

If sign-in still fails:

1. **Stale session** – Try signing out first (or open an incognito/private window), then sign in again.
2. **Email confirmation** – If Supabase has "Confirm email" enabled, users must click the verification link before they can sign in.
3. **Wrong credentials** – "Incorrect email or password" is now returned only for a real credential miss. A Supabase-side rate limit answers 429 ("Too many sign-in attempts…") and an auth outage answers 503 ("Sign-in is temporarily unavailable…"), so neither should be treated as a bad password.
4. **Redirect URLs** – In Supabase → Authentication → URL Configuration, add your site URLs to **Redirect URLs**.

## Password reset: "Failed to fetch"

Password reset uses `/api/auth/forgot-password`. If you still see errors:

1. **Redirect URLs** – Add your site URLs to Supabase Auth → URL Configuration → Redirect URLs.
2. **Email provider** – Ensure Supabase Auth email is configured (SMTP or built-in).

## User in Prisma `users` but not in Supabase Auth

Our app has two user stores:

- **Supabase Auth** (`auth.users`) – source of truth for login, sessions, password reset
- **Prisma** (`public.users`) – app data (profile, applications, AI results)

Users created via the member signup flow are added to **both**. If a user exists only in Prisma (e.g. from a seed or manual insert), they cannot log in or reset password.

An Auth identity can briefly exist before its Prisma row is provisioned. Server
`getUser()` confirms the identity with Supabase Auth and permits that bootstrap
state. Server `getSession()` rechecks Auth when the Prisma row is missing: a
locally cached session must not revive a hard-erased identity after Auth has
removed it. A Prisma row with `deletedAt` set is denied by both helpers even
if an Auth retirement attempt failed.

**Self-heal (since 9/5/26):** requesting a reset link from `/forgot-password` for an
active `users` row whose Supabase auth user is missing re-creates the auth user under
the same id (confirmed email, no password) and then sends the reset link, so the
member can set a password and sign in. Soft-deleted rows (`deletedAt` set) are not
resurrected. Look for `passwordReset: re-created missing Supabase auth user` in the logs.

**Fix options (manual):**

1. **Create in Supabase Auth** – In Supabase Dashboard → Authentication → Users, add the user with the same email. The `id` will differ unless you use the Admin API to create with a specific UUID matching Prisma.
2. **Have them sign up again** – Use the normal signup flow at `/signup`; this creates the user in both systems.
3. **Admin sync** – For bulk sync, use Supabase Admin API `createUser()` and ensure the returned `id` matches the Prisma `users.id` if you need to link them.

## QA checklist

- [ ] Sign up (new user) → verify email → sign in
- [ ] Sign in with correct credentials (desktop)
- [ ] Sign in with correct credentials (mobile)
- [ ] Sign out → verify redirect to home, protected routes redirect to login
- [ ] Forgot password → receive email → reset → sign in
- [ ] Stale session: sign out first, then sign in
- [ ] Incognito/private: sign in works
