import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto';

export const PORTAL_C_FIXTURE_OIDC_AUDIENCE = 'workforceap-portal-c-fixture';
export const PORTAL_C_FIXTURE_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
export const PORTAL_C_FIXTURE_REPOSITORY = 'workforceap/workforceap-beta';
export const PORTAL_C_FIXTURE_WORKFLOW = '.github/workflows/dev-member-safety-net.yml';

const ALLOWED_EVENTS = new Set(['pull_request', 'deployment_status', 'workflow_dispatch']);
const CLOCK_SKEW_SECONDS = 60;

export type FixtureOidcResult =
  | { ok: true; claims: VerifiedFixtureOidc }
  | { ok: false; reason: FixtureOidcFailure; hint?: string };

export type FixtureOidcFailure =
  | 'bad_token'
  | 'bad_signature'
  | 'wrong_issuer'
  | 'wrong_audience'
  | 'expired'
  | 'wrong_repository'
  | 'wrong_workflow'
  | 'wrong_event'
  | 'jwks_unavailable';

type Jwks = { keys?: JsonWebKey[] };

export type VerifiedFixtureOidc = {
  repository: string;
  workflowRef: string;
  eventName: string;
  ref: string;
  sha: string;
};

function decodePart(part: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(part, 'base64url').toString('utf8');
    const value = JSON.parse(json) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function audienceMatches(aud: unknown, expected: string): boolean {
  if (typeof aud === 'string') return aud === expected;
  return Array.isArray(aud) && aud.some((entry) => entry === expected);
}

function workflowMatches(workflowRef: unknown, repository: string): workflowRef is string {
  return (
    typeof workflowRef === 'string' &&
    workflowRef.startsWith(`${repository}/${PORTAL_C_FIXTURE_WORKFLOW}@`)
  );
}

export async function verifyPortalCFixtureOidc(
  token: string,
  options: {
    now?: number;
    jwks?: Jwks;
    fetchImpl?: typeof fetch;
    audience?: string;
    repository?: string;
  } = {},
): Promise<FixtureOidcResult> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return { ok: false, reason: 'bad_token' };
  }
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (!header || !payload || header.alg !== 'RS256' || typeof header.kid !== 'string') {
    return { ok: false, reason: 'bad_token' };
  }

  const audience = options.audience ?? PORTAL_C_FIXTURE_OIDC_AUDIENCE;
  const repository = options.repository ?? PORTAL_C_FIXTURE_REPOSITORY;
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (payload.iss !== PORTAL_C_FIXTURE_OIDC_ISSUER) return { ok: false, reason: 'wrong_issuer' };
  if (!audienceMatches(payload.aud, audience)) return { ok: false, reason: 'wrong_audience' };
  if (typeof payload.exp !== 'number' || payload.exp < now - CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof payload.nbf === 'number' && payload.nbf > now + CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'expired' };
  }
  if (payload.repository !== repository) return { ok: false, reason: 'wrong_repository' };
  if (!workflowMatches(payload.job_workflow_ref, repository)) {
    return { ok: false, reason: 'wrong_workflow' };
  }
  if (typeof payload.event_name !== 'string' || !ALLOWED_EVENTS.has(payload.event_name)) {
    return { ok: false, reason: 'wrong_event' };
  }
  // pull_request tokens carry refs/heads/… or refs/pull/n/merge.
  // deployment_status tokens from this repository omit `ref` and keep `sha`.
  const ref = typeof payload.ref === 'string' ? payload.ref : '';
  const sha =
    typeof payload.sha === 'string' && /^[0-9a-f]{40}$/.test(payload.sha)
      ? payload.sha
      : /^[0-9a-f]{40}$/.test(ref)
        ? ref
        : '';
  const refOk = ref.length === 0 || ref.startsWith('refs/') || /^[0-9a-f]{40}$/.test(ref);
  if (!refOk || !sha) {
    const refKind = ref.startsWith('refs/') ? 'refs' : ref ? 'other' : 'missing';
    const shaLen = typeof payload.sha === 'string' ? payload.sha.length : 0;
    return { ok: false, reason: 'bad_token', hint: `ref=${refKind} shaLen=${shaLen}` };
  }

  let jwks = options.jwks;
  if (!jwks) {
    const fetchImpl = options.fetchImpl ?? fetch;
    try {
      const response = await fetchImpl(`${PORTAL_C_FIXTURE_OIDC_ISSUER}/.well-known/jwks`);
      if (!response.ok) return { ok: false, reason: 'jwks_unavailable' };
      jwks = (await response.json()) as Jwks;
    } catch {
      return { ok: false, reason: 'jwks_unavailable' };
    }
  }
  const jwk = (jwks.keys ?? []).find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) return { ok: false, reason: 'bad_signature' };

  const signed = `${parts[0]}.${parts[1]}`;
  let signature: Buffer;
  try {
    signature = Buffer.from(parts[2], 'base64url');
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signed);
    verifier.end();
    if (!verifier.verify(key, signature)) return { ok: false, reason: 'bad_signature' };
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }

  return {
    ok: true,
    claims: {
      repository,
      workflowRef: payload.job_workflow_ref,
      eventName: payload.event_name,
      ref: ref || sha,
      sha,
    },
  };
}
