# Mobile member journey acceptance — 2026-10-10

## Scope and target

The journey under review is Apply → sign in → dashboard → training → resume
upload → AI Career Tools → counselor contact. Checks ran against a disposable
loopback PostgreSQL fixture and local Next.js server, using system Chromium
and widths of 320 and 375 pixels. Browser writes and external provider traffic
were intercepted. No real applications, emails, resumes, or counselor messages
were submitted.

The initial render baseline was master `e170c47d6`; the fix and final coach
navigation checks include PR #2749 at master
`6dd041d00e140c676ebc37c757969ed9dcc8aa5a`.

## Evidence and boundaries

| Boundary | Local evidence | Remaining live acceptance |
| --- | --- | --- |
| Apply | Anonymous page returned 200 at 320/375, with no horizontal overflow or page exceptions. | Submit a designated test applicant through approved development authentication. |
| Sign in | Anonymous login page returned 200 at both widths without overflow or page exceptions. | Supported Supabase configuration and a designated member identity are required for login. |
| Dashboard | Credential-free member home returned 200 at both widths without overflow or page exceptions. | Confirm the signed-in member's real status and destinations. |
| Training | Local training-workspace proof returned 200 at both widths without overflow or page exceptions. | Confirm approved training access and provider launch with development fixtures. |
| Resume upload | Existing behavioral upload cases cover supported formats, DOC rejection, extraction warning, HTML outage, validation, and network failure. | The authenticated uploader and actual storage/extraction boundary require a test identity. |
| AI Career Tools | Both voice surfaces previously stayed Connecting after 61 seconds of simulated browser time. The fix restores an enabled start control and actionable failure alert. Component coverage includes microphone denial, outage, expired auth, network interruption, retry, cancellation, and late camera/client fulfillment. | Real microphone capture and provider connection require supported development credentials and browser permissions. |
| Counselor contact | Local empty-thread proof returned 200 at both widths without overflow or page exceptions. | Confirm assigned recipient and draft retention with a designated authenticated member; no real message was sent here. |

The render baseline comprises 14 page/viewport pairs. Their routes are
`/apply`, `/login`, `/dev/member/home`,
`/dev/member/program?state=workspace`,
`/dev/member/toolkit?tab=session&agent=resume`,
`/dev/member/resume-studio`, and
`/dev/member/messages?state=thread-empty`.

The focused regression suites verify the shared request deadline through
response-body consumption, cancellation-listener cleanup, unchanged
three-argument fetch callers, and the two voice screens' retry behavior.
The browser suite checks the real Next.js router, refresh, mobile overflow,
microphone-denial recovery, service/network errors, and startup timeout.
It captures console errors separately from page exceptions so a missing
`aiToolsDiscovery` message cannot silently pass the coach-navigation check.

## Reproduce the local browser checks

With the disposable local database initialized, run a local dev server and:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3101 \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
CI=1 npx playwright test tests/e2e/mobile-member-recovery.spec.ts \
  --workers=1 --retries=0
```

The suite refuses a remote target and intercepts writes. A regular Playwright
Chromium installation can be used by omitting the executable-path override.
Screenshots are attached to its browser test results.

## Limits and next acceptance

This is local Chromium and synthetic failure-state evidence, not certification
of the complete authenticated journey. No Safari/WebKit binary or real iPhone
was available. No supported Supabase/member/provider credentials were available,
and the active network policy did not permit the production site or Supabase.
Production was not used as a substitute for development access.

The next acceptance session needs the authorized development target, designated
test applicant/member/counselor identities, and iPhone Safari. Run the full
journey there, including microphone denial, connection interruption, a resume
upload, and counselor-draft retry; verify provider access and persisted state
at each boundary before marking the live journey complete.
