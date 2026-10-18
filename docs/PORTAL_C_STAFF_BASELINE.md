# Portal C staff visual baseline

This draft branch publishes an isolated DEMO Preview of master at
`efc27e4a4ebeba09b5261e7b1c36463d01925017` for the Phase 0 staff comparisons.
Only this evidence document and a Windows path-normalization fix in the
tenant audit tool differ from that commit; application, styles, dependencies,
migrations and runtime configuration are unchanged. The audit fix preserves
the existing skip list and ratchet pin; it applies that list consistently
to Windows and POSIX paths.

The preview must pass the Vercel project/team/commit/branch/host guard and
DEMO health check before synthetic staff credentials are used. Screenshots
run under the read-only audit capability. No staff mutations, notifications
or production release are part of this branch.

Keep this PR draft. Refresh the reference when master changes; never accept
candidate screenshots as their own staff baseline.
