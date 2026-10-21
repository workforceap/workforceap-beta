# Voice extension verification

This extends the synthetic portal review in PR #2838. It does not replace an
application screen or verify authenticated production/provider behavior.

## Source and artifact identity

- Application base: `efc27e4a4ebeba09b5261e7b1c36463d01925017`.
- Prior review head: `c21e32dc2d4af86ffd832845428dd3edde707894`.
- Final standalone: 882,883 bytes; SHA-256
  `cd8496fdeea27e8c2390278f5ed2897cc2682945f4bb056d6ccaff73172b325d`.
- Final conversation fragment: 883,837 bytes; SHA-256
  `d04abd9291b497d2c93546d6360e4e619a13b0cc9ff981ab5c614835fa803557`.
- Generated artifacts, screenshots and runtime caches remain untracked.

## Actual results

| Verification | Result | Tested artifact or scope |
| --- | --- | --- |
| Full voice browser suite | 52/52 passed | Standalone SHA `ae7f2e38761aa95a3b287e5b39703854be46543345867e7faf14e330e0e60e09`; 1024/375 px, reduced motion |
| Final focused voice checks | 6/6 passed | Final standalone above; four recovery/draft interactions plus two route/layout cases |
| Full inline route sweep | 266/266 passed | Fragment SHA `93243805ed02ecf593ac219cda146d844ff9e06e4f7b184cd87c6c0fc3fc0ae1` |
| Inline responsive views and interactions | 16 views, 3 contracts passed | Both the full-sweep fragment and the final fragment above |
| Independent model checks | 16/16 passed | Unchanged route/data model |
| Required prepush | 13/13 passed | Compared to prior review head; scoped 6 GiB Node heap |
| Final diff whitespace check | Passed | Staged source |

The final focused runs cover the last two adjustments: immediate dirty-state
feedback after editing a stored local resume draft, and readable placeholder
contrast. The preceding full results are retained with their own hashes rather
than presented as reruns of the final bytes.

Voice coverage includes explicit consent, keyboard focus, start/mute/interrupt/
end/restart, coach selection, permission-denied text fallback, reconnect without
duplicate turns, preserved text, unknown context, empty transcript, explicit
resume accept/reject and stale-original protection, and role/retention boundaries.
The inline contracts exercise coach selection and resume acceptance; session
controls and dynamic icons; and the complete paged catalog/workspace switcher.

Both standalone runs recorded zero page errors, external requests and instrumented
microphone/provider API calls. Both inline runs recorded zero page errors and
unexpected external prototype requests. The conversation test wrapper's three
pinned UI runtimes were supplied from a cache downloaded with TLS verification;
their hashes are recorded in the JSON receipt. TLS checks were not disabled.
The fragment uses the conversation's provided Lucide runtime and makes no API calls.

## Reproduction

```sh
node docs/mockups/portal-review/build.mjs
node docs/mockups/portal-review/verify-voice.mjs
node docs/mockups/portal-review/verify-voice.mjs --filter=Resume,Permission
node docs/mockups/portal-review/verify-model.mjs
node docs/mockups/portal-review/build-inline.mjs
node docs/mockups/portal-review/verify-inline.mjs --wrapper=/absolute/path/to/wrapper.html --output=/absolute/path/to/evidence
NODE_OPTIONS=--max-old-space-size=6144 node scripts/prepush.mjs --base c21e32dc2d4af86ffd832845428dd3edde707894
git diff --cached --check
```

The inline verifier requires the host sandbox wrapper; `--focus` repeats only
the 16 responsive views and three interactions. `--runtime-cache` can supply
the exact pinned host scripts where the browser lacks the environment's proxy
CA. It does not allow arbitrary external requests. The related-Vitest prepush
selection found no application tests for this docs-only extension; that is not
claimed as application coverage. The original portal matrix in `VERIFICATION.md`
belongs to the prior head and is not relabeled as final voice coverage.

## Release boundary

Current master and PR head were refreshed before publication. Committed workflow
and Vercel conditions leave `cook/*` outside push deployment and hosted-migration
paths; normal PR CI can run. No merge, workflow dispatch, deployment, hosted
migration, microphone session, email, publication or live account change occurs
in this patch. Live authenticated acceptance, private storage, provider sessions
and email suppression reconciliation remain separate.
