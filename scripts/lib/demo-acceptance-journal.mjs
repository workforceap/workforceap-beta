/**
 * DEMO-only durable QA journal backed by existing Prisma AuditLog rows.
 * Parent owns lifecycle/browser/workflow; this module only claims, appends,
 * hands off and reads a revision-chained event log for one PortalQaRun.
 *
 * No network writes, no secrets in event data, no provider configuration.
 */
import { createHash } from 'node:crypto';

export const PORTAL_QA_TARGET_TYPE = 'PortalQaRun';
export const PROJECT_REF = 'esbdrgaonplpvzmtrdhw';
export const WORKFLOW_ATTEMPT = 1;

export const ALLOWED_KINDS = Object.freeze([
  'claimed',
  'intent',
  'dispatch-started',
  'response-received',
  'failed-confirmed',
  'confirmed',
  'quarantined',
  'db-committed',
  'readback',
  'cleanup-intent',
  'cleanup-confirmed',
  'cleanup-complete',
  'handoff',
]);

const APPEND_KINDS = new Set(
  ALLOWED_KINDS.filter((kind) => kind !== 'claimed' && kind !== 'handoff'),
);

const SECRET_KEY =
  /^(?:.*(?:password|passwd|secret|token|api[_-]?key|authorization|private[_-]?key|access[_-]?key|refresh[_-]?token|credential|bearer).*)$/i;

const SHA1_40 = /^[0-9a-f]{40}$/i;
const SHA_64 = /^[0-9a-f]{64}$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sortDeep(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortDeep);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortDeep(value[key]);
  }
  return out;
}

/** Stable recursively key-sorted JSON (deterministic across processes). */
export function canonical(value) {
  return JSON.stringify(sortDeep(value));
}

/** SHA-256 hex digest of canonical(value). */
export function digest(value) {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function fail(message) {
  const err = new Error(message);
  err.code = 'DEMO_QA_JOURNAL';
  throw err;
}

function assertNoSecretKeys(value, path = 'data') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      fail(`secret key rejected at ${path}.${key}`);
    }
    assertNoSecretKeys(child, `${path}.${key}`);
  }
}

function asPositiveInt(value, label) {
  const text = String(value);
  if (/^[1-9]\d{0,19}$/.test(text)) return text;
  fail(`${label} must be a positive integer`);
}
function asRunId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}-1$/.test(value)) fail('runId must be a first-attempt run ID');
  return value;
}
function asOwner(owner) {
  if (typeof owner !== 'string' || owner.trim() === '' || owner !== owner.trim()) {
    fail('owner must be a non-empty trimmed string');
  }
  assertNoSecretKeys({ owner }, 'owner');
  return owner;
}

/**
 * Identity contract for a DEMO portal QA run.
 * runId is <workflowRunId>-1; workflowRunId is a decimal string; attempt is fixed at 1;
 * projectRef is the DEMO Supabase project ref only.
 */
export function normalizeIdentity(identity) {
  if (!isPlainObject(identity)) fail('identity must be an object');
  const repository = identity.repository;
  if (typeof repository !== 'string' || !repository.includes('/')) {
    fail('identity.repository must be owner/name');
  }
  const workflowRunId = asPositiveInt(identity.workflowRunId, 'identity.workflowRunId');
  if (identity.workflowAttempt !== WORKFLOW_ATTEMPT) {
    fail(`identity.workflowAttempt must be ${WORKFLOW_ATTEMPT}`);
  }
  if (identity.projectRef !== PROJECT_REF) {
    fail(`identity.projectRef must be ${PROJECT_REF}`);
  }
  const organizationId = identity.organizationId;
  if (typeof organizationId !== 'string' || !UUID_RE.test(organizationId)) {
    fail('identity.organizationId must be a UUID');
  }
  for (const field of ['controlSha', 'deployedSha', 'baselineSha']) {
    const sha = identity[field];
    if (typeof sha !== 'string' || !SHA1_40.test(sha)) {
      fail(`identity.${field} must be 40 hex chars`);
    }
  }
  if (typeof identity.planHash !== 'string' || !SHA_64.test(identity.planHash)) {
    fail('identity.planHash must be 64 hex chars');
  }
  const runId = asRunId(identity.runId);
  if (runId !== `${workflowRunId}-1`) fail('runId and workflowRunId disagree');
  const normalized = {
    baselineSha: identity.baselineSha.toLowerCase(),
    controlSha: identity.controlSha.toLowerCase(),
    deployedSha: identity.deployedSha.toLowerCase(),
    organizationId: organizationId.toLowerCase(),
    planHash: identity.planHash.toLowerCase(),
    projectRef: PROJECT_REF,
    repository,
    runId,
    workflowAttempt: WORKFLOW_ATTEMPT,
    workflowRunId,
  };
  assertNoSecretKeys(normalized, 'identity');
  return normalized;
}

function eventIdFor(runId, revision) {
  return digest(`${runId}/${revision}`);
}

function buildEvent({ runId, revision, owner, kind, data, prevDigest, identity }) {
  if (!ALLOWED_KINDS.includes(kind)) fail(`kind not allowed: ${kind}`);
  assertNoSecretKeys(data ?? {}, 'data');
  const id = eventIdFor(runId, revision);
  const body = {
    data: data ?? {},
    id,
    kind,
    owner,
    prevDigest,
    revision,
    runId,
  };
  if (identity !== undefined) body.identity = identity;
  return { ...body, digest: digest(body) };
}

function recomputeDigest(event) {
  const { digest: _ignored, ...body } = event;
  return digest(body);
}

function validateChain(events, runId) {
  if (!Array.isArray(events)) fail('events must be an array');
  const seen = new Set();
  let prevDigest = null;
  let identity = null;
  let owner = null;

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (!isPlainObject(event)) fail('tampered chain: event is not an object');
    const revision = i + 1;
    if (event.revision !== revision) fail(`out-of-order revision at ${revision}`);
    if (event.runId !== runId) fail('tampered chain: runId mismatch');
    if (event.id !== eventIdFor(runId, revision)) fail('tampered chain: event id');
    if (seen.has(event.id)) fail('duplicate event id');
    seen.add(event.id);
    if (event.prevDigest !== prevDigest) fail('tampered chain: prevDigest');
    if (event.digest !== recomputeDigest(event)) fail('tampered chain: digest');
    if (!ALLOWED_KINDS.includes(event.kind)) fail(`kind not allowed: ${event.kind}`);
    assertNoSecretKeys(event.data ?? {}, 'data');

    if (revision === 1) {
      if (event.kind !== 'claimed') fail('missing claim event');
      if (!event.identity) fail('missing identity on claim');
      identity = normalizeIdentity(event.identity);
      if (identity.runId !== runId) fail('identity.runId mismatch');
    } else if (event.identity !== undefined) {
      fail('immutable identity: identity only on claim');
    }

    if (revision > 1 && event.kind === 'claimed') fail('duplicate claim');
    if (revision > 1 && event.kind !== 'handoff' && event.owner !== owner) fail('owner changed without handoff');
    if (revision > 1 && event.kind === 'handoff') assertTerminalProof(event.data.terminalProof, identity, owner);
    owner = asOwner(event.owner);
    prevDigest = event.digest;
  }

  return {
    identity,
    owner,
    revision: events.length,
    events,
    digest: events.length === 0 ? null : prevDigest,
  };
}

export function verifyJournalEvents(events, runId) { return validateChain(events, asRunId(runId)); }

function emptyState() {
  return { identity: null, owner: null, revision: 0, events: [], digest: null };
}

function assertReadback(found, expected) {
  if (!found) fail('readback failure: event missing');
  if (canonical(found) !== canonical(expected)) fail('readback failure: event mismatch');
}

/**
 * Terminal proof for handoff. Either a completed GitHub Actions observation
 * bound to identity.repository + identity.workflowRunId, or an explicit
 * verified+acknowledged handoff object. No guessed/timeout completion.
 */
export function assertTerminalProof(terminalProof, identity, owner) {
  if (!isPlainObject(terminalProof)) fail('terminalProof must be an object');
  assertNoSecretKeys(terminalProof, 'terminalProof');

  if (terminalProof.guessed === true || terminalProof.timeout === true) {
    fail('handoff rejects guessed timeout proof');
  }

  if (terminalProof.source === 'github') {
    const prefix = `${identity.repository}/`;
    const currentRun = typeof owner === 'string' && owner.startsWith(prefix) ? owner.slice(prefix.length).match(/^([1-9]\d{0,19})-1$/)?.[1] : null;
    if (!currentRun || terminalProof.owner !== owner) fail('handoff rejects unbound current owner');
    if (!SHA1_40.test(terminalProof.headSha ?? '') || terminalProof.workflowAttempt !== 1) fail('handoff requires exact owner SHA and first attempt');
    if (currentRun === identity.workflowRunId && terminalProof.headSha !== identity.controlSha) fail('handoff rejects original owner SHA drift');
    if (terminalProof.repository !== identity.repository) {
      fail('handoff rejects wrong repository');
    }
    const proofRunId = asPositiveInt(terminalProof.runId, 'terminalProof.runId');
    if (proofRunId !== currentRun) {
      fail('handoff rejects wrong run');
    }
    if (terminalProof.status !== 'completed') {
      fail('handoff rejects live run');
    }
    if (typeof terminalProof.conclusion !== 'string' || terminalProof.conclusion.trim() === '') {
      fail('terminalProof.conclusion required');
    }
    if (typeof terminalProof.observedAt !== 'string' || terminalProof.observedAt.trim() === '') {
      fail('terminalProof.observedAt required');
    }
    return {
      conclusion: terminalProof.conclusion,
      observedAt: terminalProof.observedAt,
      repository: terminalProof.repository,
      runId: proofRunId,
      source: 'github',
      status: 'completed',
      owner,
      headSha: terminalProof.headSha,
      workflowAttempt: 1,
    };
  }
  fail('terminalProof must be a current-owner GitHub completed observation');
}

async function withLockedRun(store, runId, fn) {
  return store.transaction(async (tx) => {
    await tx.lock(runId);
    const raw = await tx.events(runId);
    const events = raw.map((row) => (row && typeof row === 'object' && row.metadata != null ? row.metadata : row));
    const state = events.length === 0 ? emptyState() : validateChain(events, runId);
    return fn(tx, state, events);
  });
}

/**
 * @param {{ transaction: (cb: (tx: {
 *   lock: (runId: number) => Promise<void>,
 *   events: (runId: number) => Promise<any[]>,
 *   insert: (event: object) => Promise<void>,
 *   find: (eventId: string) => Promise<object|null>,
 * }) => Promise<any>) => Promise<any> }} store
 */
export function createJournal(store) {
  if (!store || typeof store.transaction !== 'function') {
    fail('store.transaction required');
  }

  return {
    async atomic(runId, owner, expectedRevision, kind, data, mutation) {
      const id = asRunId(runId);
      if (kind !== 'db-committed' || typeof mutation !== 'function') fail('atomic requires a database mutation');
      assertNoSecretKeys(data, 'data');
      return withLockedRun(store, id, async (tx, state, events) => {
        if (state.owner !== owner || state.revision !== expectedRevision) fail('stale owner or revision');
        if (!tx.database) fail('atomic requires the same database transaction');
        const { result, evidence } = await mutation(tx.database);
        if (Object.keys(evidence ?? {}).some(key => Object.hasOwn(data, key))) fail('atomic evidence must not replace its preimage or intent');
        const event = buildEvent({ runId: id, revision: expectedRevision + 1, owner, kind,
          data: { ...data, ...evidence }, prevDigest: state.digest });
        await tx.insert(event);
        assertReadback(await tx.find(event.id), event);
        return { result, state: validateChain([...events, event], id) };
      });
    },
    async read(runId) {
      const id = asRunId(runId);
      return withLockedRun(store, id, async (_tx, state) => state);
    },

    async claim(identity, owner) {
      const normalized = normalizeIdentity(identity);
      const nextOwner = asOwner(owner);
      return withLockedRun(store, normalized.runId, async (tx, state, events) => {
        if (state.revision !== 0 || events.length !== 0) {
          fail('claim requires revision 0 empty journal');
        }
        const event = buildEvent({
          runId: normalized.runId,
          revision: 1,
          owner: nextOwner,
          kind: 'claimed',
          data: {},
          prevDigest: null,
          identity: normalized,
        });
        await tx.insert(event);
        assertReadback(await tx.find(event.id), event);
        return validateChain([event], normalized.runId);
      });
    },

    async append(runId, owner, expectedRevision, kind, data) {
      const id = asRunId(runId);
      const nextOwner = asOwner(owner);
      if (kind === 'claimed' || kind === 'handoff') {
        fail(`generic append does not allow kind ${kind}`);
      }
      if (!APPEND_KINDS.has(kind)) fail(`kind not allowed: ${kind}`);
      if (data === undefined) fail('data required');
      assertNoSecretKeys(data, 'data');
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
        fail('expectedRevision must be a non-negative integer');
      }

      return withLockedRun(store, id, async (tx, state, events) => {
        if (state.revision === 0) fail('missing chain: journal not claimed');
        if (state.owner !== nextOwner) fail('stale owner');
        if (state.revision !== expectedRevision) fail('stale revision');
        const event = buildEvent({
          runId: id,
          revision: expectedRevision + 1,
          owner: nextOwner,
          kind,
          data,
          prevDigest: state.digest,
        });
        await tx.insert(event);
        assertReadback(await tx.find(event.id), event);
        return validateChain([...events, event], id);
      });
    },

    async handoff(runId, oldOwner, expectedRevision, newOwner, terminalProof) {
      const id = asRunId(runId);
      const from = asOwner(oldOwner);
      const to = asOwner(newOwner);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
        fail('expectedRevision must be a non-negative integer');
      }

      return withLockedRun(store, id, async (tx, state, events) => {
        if (state.revision === 0) fail('missing chain: journal not claimed');
        if (state.owner !== from) fail('stale owner');
        if (state.revision !== expectedRevision) fail('stale revision');
        const proof = assertTerminalProof(terminalProof, state.identity, from);
        const event = buildEvent({
          runId: id,
          revision: expectedRevision + 1,
          owner: to,
          kind: 'handoff',
          data: { terminalProof: proof },
          prevDigest: state.digest,
        });
        await tx.insert(event);
        assertReadback(await tx.find(event.id), event);
        return validateChain([...events, event], id);
      });
    },
  };
}

function lockKeyFor(runId) {
  return `portal-qa-run:${runId}`;
}

function rowToEvent(row) {
  if (!row) return null;
  const metadata = row.metadata ?? row;
  if (row.metadata && (row.id !== metadata.id || row.action !== `portal.qa.${metadata.kind}` || row.actor_user_id !== null)) fail('audit row does not match its journal event');
  return metadata;
}

/**
 * Prisma AuditLog store. Caller supplies an independent PrismaClient.
 * Transactions use SERIALIZABLE + pg_advisory_xact_lock(hashtextextended(...)).
 * Rows: action portal.qa.<kind>, targetType PortalQaRun, targetId runId,
 * actor null, metadata = event JSON, id = deterministic event id.
 *
 * Lock uses $executeRaw (void return breaks $queryRaw deserialization).
 * All other SQL uses $queryRaw tagged templates — no string interpolation.
 */
export function createPrismaJournalStore(prisma) {
  if (!prisma || typeof prisma.$transaction !== 'function') {
    fail('prisma client required');
  }

  return {
    async transaction(callback) {
      return prisma.$transaction(
        async (prismaTx) => {
          const tx = {
            database: prismaTx,
            async lock(runId) {
              const key = lockKeyFor(runId);
              // $executeRaw: pg_advisory_xact_lock returns void.
              await prismaTx.$executeRaw`
                SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
              `;
            },

            async events(runId) {
              const targetId = String(runId);
              const rows = await prismaTx.$queryRaw`
                SELECT id, action, actor_user_id, metadata
                FROM audit_logs
                WHERE target_type = ${PORTAL_QA_TARGET_TYPE}
                  AND target_id = ${targetId}
                ORDER BY (metadata->>'revision')::int ASC, id ASC
              `;
              return rows.map((row) => rowToEvent(row));
            },

            async insert(event) {
              const action = `portal.qa.${event.kind}`;
              const targetId = String(event.runId);
              const metadataJson = canonical(event);
              // Tagged-template parameters only (no string-built SQL).
              // ::jsonb cast is SQL text adjacent to the bound parameter.
              const inserted = await prismaTx.$queryRaw`
                INSERT INTO audit_logs (
                  id,
                  actor_user_id,
                  action,
                  target_type,
                  target_id,
                  metadata,
                  created_at
                )
                VALUES (
                  ${event.id},
                  NULL,
                  ${action},
                  ${PORTAL_QA_TARGET_TYPE},
                  ${targetId},
                  ${metadataJson}::jsonb,
                  NOW()
                )
                RETURNING id
              `;
              if (!inserted?.length) fail('insert returned no row');
            },

            async find(eventId) {
              const rows = await prismaTx.$queryRaw`
                SELECT id, action, actor_user_id, metadata
                FROM audit_logs
                WHERE id = ${eventId}
                LIMIT 1
              `;
              if (!rows.length) return null;
              return rowToEvent(rows[0]);
            },
          };
          return callback(tx);
        },
        { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 120_000 },
      );
    },
  };
}

/**
 * In-memory SERIALIZABLE-ish store for unit tests. Optional `durable` Map
 * lets crash/recovery tests retain committed rows across store instances.
 */
export function createMemoryJournalStore(options = {}) {
  const durable = options.durable ?? new Map();
  let gate = Promise.resolve();

  function snapshot() {
    return new Map([...durable.entries()].map(([id, event]) => [id, structuredClone(event)]));
  }

  return {
    async transaction(callback) {
      const prior = gate;
      let release;
      gate = new Promise((resolve) => {
        release = resolve;
      });
      await prior;
      const working = snapshot();
      let committed = false;
      try {
        const tx = {
          async lock(_runId) {
            // Held for the serialized transaction lifetime.
          },
          async events(runId) {
            return [...working.values()]
              .filter((event) => event.runId === runId)
              .sort((a, b) => a.revision - b.revision || a.id.localeCompare(b.id));
          },
          async insert(event) {
            if (working.has(event.id)) fail('duplicate event id');
            working.set(event.id, structuredClone(event));
          },
          async find(eventId) {
            const event = working.get(eventId);
            return event ? structuredClone(event) : null;
          },
        };
        if (typeof options.wrapTx === 'function') {
          options.wrapTx(tx, working);
        }
        const result = await callback(tx);
        durable.clear();
        for (const [id, event] of working) durable.set(id, structuredClone(event));
        committed = true;
        return result;
      } finally {
        if (!committed && options.retainOnFailure) {
          // leave durable unchanged
        }
        release();
      }
    },
    /** Test helper: committed events map. */
    get _durable() {
      return durable;
    },
  };
}
