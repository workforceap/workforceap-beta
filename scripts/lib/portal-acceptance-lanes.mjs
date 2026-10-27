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
  if (local.receipts?.length !== 1 || local.receipts[0].lane !== 'fixture-render-matrix') throw new Error('Unexpected local companion lane');
  const localReceipt = local.receipts[0];
  if (localReceipt.schemaVersion !== LANE_SCHEMA_VERSION || !acceptanceIdentityMatches(localReceipt.identity, identity)) throw new Error('Companion receipt identity mismatch');
  if (!Number.isFinite(Date.parse(localReceipt.startedAt)) || !Number.isFinite(Date.parse(localReceipt.completedAt)) || Date.parse(localReceipt.completedAt) < Date.parse(localReceipt.startedAt)) throw new Error('Companion receipt time invalid');
  const localCases = localReceipt.cases;
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
