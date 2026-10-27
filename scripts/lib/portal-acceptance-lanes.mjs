/** Versioned evidence contract. A successful reporter is not acceptance. */
export const LANE_SCHEMA_VERSION = 1;
export const IDENTITY_FIELDS = Object.freeze([
  'runId', 'projectRef', 'organizationId', 'controlSha', 'deployedSha', 'baselineSha', 'planHash',
]);
const OPTIONAL_PROVENANCE_FIELDS = ['repository', 'workflowRunId', 'workflowAttempt'];
export const REQUIRED_LANES = Object.freeze([
  'inventory-readiness', 'fixture-render-matrix', 'logged-out-routes', 'member-routes',
  'staff-comparison', 'mentor-comparison', 'five-role-actions', 'member-actions',
  'database-readback', 'cleanup',
]);
const BAD = new Set(['failed', 'cancelled', 'timed-out']);
const STATES = new Set(['passed', 'failed', 'cancelled', 'timed-out', 'incomplete', 'pending', 'running', 'skipped', 'error']);
export const BROWSER_PHASE_NAMES = Object.freeze(/** @type {const} */ (['unassigned', 'assigned-owner', 'approved-profile']));
const BROWSER_LANES = REQUIRED_LANES.slice(0, 6);
const PHASE_ID_FIELDS = ['counselorResult', 'enrollment', 'mentor', 'job'];
const PHASE_FIELDS = ['name', 'blueprintHash', 'stateDigest', 'ids'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasExactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Public, credential-free descriptor shared by the planner and receipt readers. */
export function validateBrowserPhase(value) {
  if (!hasExactKeys(value, PHASE_FIELDS) || !BROWSER_PHASE_NAMES.includes(value.name)) throw new Error('Invalid browser phase descriptor');
  if (['blueprintHash', 'stateDigest'].some(key => typeof value[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value[key]))) throw new Error('Invalid browser phase hash');
  if (!hasExactKeys(value.ids, PHASE_ID_FIELDS) || PHASE_ID_FIELDS.some(key => typeof value.ids[key] !== 'string' || !UUID.test(value.ids[key]))) throw new Error('Invalid browser phase reserved IDs');
  if (new Set(PHASE_ID_FIELDS.map(key => value.ids[key].toLowerCase())).size !== PHASE_ID_FIELDS.length) throw new Error('Browser phase reserved IDs must be distinct');
  return {
    name: value.name, blueprintHash: value.blueprintHash, stateDigest: value.stateDigest,
    ids: { counselorResult: value.ids.counselorResult, enrollment: value.ids.enrollment, mentor: value.ids.mentor, job: value.ids.job },
  };
}

function validateBrowserPhases(values) {
  if (!Array.isArray(values) || values.length !== BROWSER_PHASE_NAMES.length) throw new Error('Exactly three trusted browser phases are required');
  const phases = values.map(validateBrowserPhase);
  if (new Set(phases.map(phase => phase.name)).size !== phases.length) throw new Error('Duplicate browser phase');
  if (phases.some(phase => phase.blueprintHash !== phases[0].blueprintHash || PHASE_ID_FIELDS.some(key => phase.ids[key] !== phases[0].ids[key]))) throw new Error('Browser phases disagree on blueprint or reserved IDs');
  return BROWSER_PHASE_NAMES.map(name => phases.find(phase => phase.name === name));
}

function browserPhaseMatches(left, right) {
  return PHASE_FIELDS.filter(key => key !== 'ids').every(key => left[key] === right[key])
    && PHASE_ID_FIELDS.every(key => left.ids[key] === right.ids[key]);
}

function requireExactIdentity(value, identity) {
  const normalized = validateAcceptanceIdentity(value);
  if (!hasExactKeys(value, Object.keys(normalized)) || !acceptanceIdentityMatches(normalized, identity)) throw new Error('Browser receipt identity mismatch');
}

function validReceiptTimes(receipt) {
  return typeof receipt.startedAt === 'string' && typeof receipt.completedAt === 'string'
    && Number.isFinite(Date.parse(receipt.startedAt)) && Number.isFinite(Date.parse(receipt.completedAt))
    && Date.parse(receipt.completedAt) >= Date.parse(receipt.startedAt);
}

function publicCaseResult(item) {
  if (Object.hasOwn(item, 'reason') && typeof item.reason !== 'string') throw new Error('Invalid browser phase case reason');
  return { id: item.id, status: item.status, ...(Object.hasOwn(item, 'reason') ? { reason: item.reason } : {}) };
}

/** Combine only evidence whose identity and phase state agree with the current trusted plans. */
export function combinePortalPhaseReceipts(identity, trustedContracts, bundles) {
  const trustedIdentity = validateAcceptanceIdentity(identity);
  requireExactIdentity(identity, trustedIdentity);
  if (!Array.isArray(trustedContracts)) throw new Error('Trusted browser phase contracts must be an array');
  const phases = validateBrowserPhases(trustedContracts.map(contract => contract?.phase));
  const contracts = new Map();
  for (const phase of phases) {
    const expectedCases = trustedContracts.find(contract => contract.phase.name === phase.name).expectedCases;
    if (!expectedCases || typeof expectedCases !== 'object' || Array.isArray(expectedCases) || !Object.keys(expectedCases).length) throw new Error('Trusted browser case contract required');
    const seen = new Set();
    for (const [lane, ids] of Object.entries(expectedCases)) {
      if (!BROWSER_LANES.includes(lane) || !Array.isArray(ids) || !ids.length) throw new Error('Invalid trusted browser lane contract');
      for (const id of ids) {
        if (typeof id !== 'string' || !id.startsWith(`${phase.name}:`) || !id.slice(phase.name.length + 1).trim() || seen.has(id)) throw new Error('Invalid or duplicate trusted browser phase case');
        seen.add(id);
      }
    }
    contracts.set(phase.name, { phase, expectedCases });
  }
  if (!Array.isArray(bundles)) throw new Error('Browser phase bundles must be an array');
  const evidence = new Map();
  for (const bundle of bundles) {
    if (bundle?.kind !== 'hosted-browser' || bundle.schemaVersion !== LANE_SCHEMA_VERSION || Object.hasOwn(bundle, 'phases')) throw new Error('Invalid hosted browser phase bundle');
    requireExactIdentity(bundle.identity, trustedIdentity);
    const phase = validateBrowserPhase(bundle.phase);
    const contract = contracts.get(phase.name);
    if (!browserPhaseMatches(phase, contract.phase)) throw new Error('Stale or mismatched browser phase descriptor');
    if (evidence.has(phase.name)) throw new Error('Duplicate browser phase bundle');
    if (!Array.isArray(bundle.receipts)) throw new Error('Browser phase receipts must be an array');
    const lanes = new Map();
    for (const receipt of bundle.receipts) {
      if (!receipt || !Object.hasOwn(contract.expectedCases, receipt.lane)) throw new Error('Unexpected browser phase lane');
      if (lanes.has(receipt.lane)) throw new Error('Duplicate browser phase lane receipt');
      if (receipt.schemaVersion !== LANE_SCHEMA_VERSION) throw new Error('Invalid browser phase receipt schema');
      requireExactIdentity(receipt.identity, trustedIdentity);
      if (!browserPhaseMatches(validateBrowserPhase(receipt.phase), phase)) throw new Error('Receipt browser phase descriptor mismatch');
      if (!STATES.has(receipt.status) || !validReceiptTimes(receipt)) throw new Error('Invalid browser phase receipt status or time');
      if (!Array.isArray(receipt.cases)) throw new Error('Browser phase cases must be an array');
      const seen = new Set();
      for (const item of receipt.cases) {
        if (!item || !contract.expectedCases[receipt.lane].includes(item.id) || !STATES.has(item.status)) throw new Error('Unexpected browser phase case or status');
        publicCaseResult(item);
        if (seen.has(item.id)) throw new Error('Duplicate browser phase case');
        seen.add(item.id);
      }
      lanes.set(receipt.lane, receipt);
    }
    evidence.set(phase.name, lanes);
  }
  /** @type {Record<string, string[]>} */
  const expectedCases = {};
  const receipts = [];
  const observedAt = new Date().toISOString();
  for (const lane of BROWSER_LANES) {
    const laneContracts = phases.map(phase => contracts.get(phase.name)).filter(contract => Object.hasOwn(contract.expectedCases, lane));
    if (!laneContracts.length) continue;
    expectedCases[lane] = laneContracts.flatMap(contract => contract.expectedCases[lane]);
    const sources = laneContracts.map(contract => evidence.get(contract.phase.name)?.get(lane));
    const cases = laneContracts.flatMap((contract, index) => contract.expectedCases[lane].map(id => {
      const source = sources[index];
      const found = source?.cases.find(item => item.id === id);
      return found ? publicCaseResult(found) : { id, status: 'incomplete', reason: !evidence.has(contract.phase.name) ? 'phase_bundle_missing' : !source ? 'phase_lane_missing' : 'phase_case_missing' };
    }));
    const status = sources.some(receipt => receipt?.status === 'error') || cases.some(item => item.status === 'error') ? 'error'
      : sources.some(receipt => BAD.has(receipt?.status)) || cases.some(item => BAD.has(item.status)) ? 'failed'
        : sources.every(receipt => receipt?.status === 'passed') && cases.every(item => item.status === 'passed') ? 'passed' : 'incomplete';
    const present = sources.filter(Boolean);
    const startedAt = present.length ? new Date(Math.min(...present.map(receipt => Date.parse(receipt.startedAt)))).toISOString() : observedAt;
    const completedAt = present.length ? new Date(Math.max(...present.map(receipt => Date.parse(receipt.completedAt)))).toISOString() : observedAt;
    receipts.push({ schemaVersion: LANE_SCHEMA_VERSION, identity: trustedIdentity, lane, status, startedAt, completedAt, cases });
  }
  return { kind: 'hosted-browser', schemaVersion: LANE_SCHEMA_VERSION, identity: trustedIdentity, phases, expectedCases, receipts };
}

export function validateAcceptanceIdentity(identity) {
  if (!identity || IDENTITY_FIELDS.some(key => typeof identity[key] !== 'string' || !identity[key].trim())) {
    throw new Error('Incomplete acceptance identity');
  }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(identity.runId) || !/^[A-Za-z0-9_-]{1,100}$/.test(identity.organizationId)) {
    throw new Error('Invalid acceptance run or organization');
  }
  if (identity.projectRef !== 'esbdrgaonplpvzmtrdhw') throw new Error('Only the verified DEMO project is allowed');
  for (const key of ['controlSha', 'deployedSha', 'baselineSha']) {
    if (!/^[a-f0-9]{40}$/.test(identity[key])) throw new Error(`Invalid ${key}`);
  }
  if (!/^[a-f0-9]{64}$/.test(identity.planHash)) throw new Error('Invalid planHash');
  if (identity.repository !== undefined && identity.repository !== 'workforceap/workforceap-beta') throw new Error('Unexpected acceptance repository');
  const fields = [...IDENTITY_FIELDS, ...OPTIONAL_PROVENANCE_FIELDS.filter(key => identity[key] !== undefined)];
  return Object.fromEntries(fields.map(key => [key, identity[key]]));
}

export function acceptanceIdentityMatches(left, right) {
  return [...IDENTITY_FIELDS, ...OPTIONAL_PROVENANCE_FIELDS].every(key => left?.[key] === right?.[key]);
}

/** Only known hosted local-only omissions can be replaced by independent local proof. */
export function mergeLocalFixtureCompanion(hosted, local, identity, expectedLocalCaseIds) {
  if (hosted?.kind !== 'hosted-browser' || local?.kind !== 'local-fixture-companion' || !acceptanceIdentityMatches(hosted.identity, identity) || !acceptanceIdentityMatches(local.identity, identity)) throw new Error('Companion identity mismatch');
  if (!Array.isArray(expectedLocalCaseIds) || !expectedLocalCaseIds.length || new Set(expectedLocalCaseIds).size !== expectedLocalCaseIds.length) throw new Error('Trusted local fixture case contract required');
  const phased = Object.hasOwn(hosted, 'phases');
  if (phased) {
    validateBrowserPhases(hosted.phases);
    if (hosted.schemaVersion !== LANE_SCHEMA_VERSION || Object.hasOwn(hosted, 'phase') || Object.hasOwn(local, 'phase') || Object.hasOwn(local, 'phases')) throw new Error('Invalid combined browser fixture companion');
    if (expectedLocalCaseIds.some(id => typeof id !== 'string' || !id.startsWith('unassigned:') || !id.slice('unassigned:'.length).trim())) throw new Error('Local fixture cases must belong to the unassigned phase');
  }
  if (local.receipts?.length !== 1 || local.receipts[0].lane !== 'fixture-render-matrix') throw new Error('Unexpected local companion lane');
  const localReceipt = local.receipts[0];
  if (localReceipt.schemaVersion !== LANE_SCHEMA_VERSION || !acceptanceIdentityMatches(localReceipt.identity, identity)) throw new Error('Companion receipt identity mismatch');
  if (phased && (Object.hasOwn(localReceipt, 'phase') || Object.hasOwn(localReceipt, 'phases') || !STATES.has(localReceipt.status))) throw new Error('Invalid local fixture receipt');
  if (!Number.isFinite(Date.parse(localReceipt.startedAt)) || !Number.isFinite(Date.parse(localReceipt.completedAt)) || Date.parse(localReceipt.completedAt) < Date.parse(localReceipt.startedAt)) throw new Error('Companion receipt time invalid');
  const localCases = phased && Array.isArray(localReceipt.cases) ? localReceipt.cases.map(item => ({ ...publicCaseResult(item), id: `unassigned:${item?.id}` })) : localReceipt.cases;
  if (!Array.isArray(localCases) || localCases.length !== expectedLocalCaseIds.length || new Set(localCases.map(item => item.id)).size !== localCases.length || localCases.some(item => !expectedLocalCaseIds.includes(item.id) || !STATES.has(item.status))) throw new Error('Companion coverage differs from trusted local cases');
  let replaced = 0;
  const receipts = hosted.receipts.map(receipt => {
    if (receipt.lane !== 'fixture-render-matrix') return receipt;
    if (receipt.status !== 'incomplete') throw new Error('Cannot replace a failed, errored or completed hosted lane');
    const cases = receipt.cases.map(item => {
      if (!expectedLocalCaseIds.includes(item.id)) return item;
      if (item.status !== 'incomplete' || item.reason !== 'local_development_only_fixture') throw new Error('Cannot replace a hosted failure or already completed case');
      replaced++;
      return localCases.find(candidate => candidate.id === item.id);
    });
    const status = BAD.has(localReceipt.status) || cases.some(item => BAD.has(item.status)) ? 'failed'
      : localReceipt.status === 'error' || cases.some(item => item.status === 'error') ? 'error'
        : localReceipt.status === 'passed' && cases.every(item => item.status === 'passed') ? 'passed' : 'incomplete';
    return { ...receipt, status, completedAt: localReceipt.completedAt > receipt.completedAt ? localReceipt.completedAt : receipt.completedAt, cases };
  });
  if (replaced !== expectedLocalCaseIds.length) throw new Error('Hosted local fixture omissions differ from contract');
  return receipts;
}

/** Required case IDs come from the trusted checked-out runner, never the receipt. */
export function evaluateAcceptanceLanes(identity, expectedCases, receipts) {
  validateAcceptanceIdentity(identity);
  if (!Array.isArray(receipts)) throw new Error('Receipts must be an array');
  const errors = [];
  if (receipts.some(receipt => !REQUIRED_LANES.includes(receipt?.lane))) errors.push('unknown_lane');
  const lanes = REQUIRED_LANES.map(lane => {
    const expected = expectedCases[lane];
    const candidates = receipts.filter(receipt => receipt?.lane === lane);
    const reasons = [];
    if (!Array.isArray(expected) || expected.length === 0 || new Set(expected).size !== expected.length) {
      reasons.push('required_case_contract_missing_or_invalid');
    }
    if (candidates.length !== 1) return { lane, status: candidates.length ? 'error' : 'incomplete', reasons: [...reasons, candidates.length ? 'duplicate_lane_receipt' : 'receipt_missing'] };
    const receipt = candidates[0];
    if (receipt.schemaVersion !== LANE_SCHEMA_VERSION || !acceptanceIdentityMatches(identity, receipt.identity)) reasons.push('receipt_identity_or_version_mismatch');
    if (!STATES.has(receipt.status)) reasons.push('unsupported_receipt_status');
    if (!Number.isFinite(Date.parse(receipt.startedAt)) || !Number.isFinite(Date.parse(receipt.completedAt)) || Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) reasons.push('receipt_time_invalid');
    const cases = Array.isArray(receipt.cases) ? receipt.cases : [];
    const ids = cases.map(item => item?.id);
    if (new Set(ids).size !== ids.length) reasons.push('duplicate_case');
    if (cases.some(item => !expected?.includes(item?.id) || !STATES.has(item?.status))) reasons.push('unexpected_case_or_status');
    const missing = (expected ?? []).filter(id => !ids.includes(id));
    if (missing.length) reasons.push('required_cases_missing');
    const failed = BAD.has(receipt.status) || cases.some(item => BAD.has(item.status));
    const readError = receipt.status === 'error' || cases.some(item => item.status === 'error');
    const incomplete = receipt.status !== 'passed' || cases.some(item => item.status !== 'passed') || missing.length > 0;
    return { lane, status: reasons.some(reason => reason !== 'required_cases_missing') || readError ? 'error' : failed ? 'failed' : incomplete ? 'incomplete' : 'passed', reasons, missing };
  });
  const status = errors.length || lanes.some(lane => lane.status === 'error') ? 'error'
    : lanes.some(lane => lane.status === 'failed') ? 'failed'
      : lanes.every(lane => lane.status === 'passed') ? 'passed' : 'incomplete';
  return { schemaVersion: LANE_SCHEMA_VERSION, identity: validateAcceptanceIdentity(identity), status, lanes, errors, observedAt: new Date().toISOString() };
}
