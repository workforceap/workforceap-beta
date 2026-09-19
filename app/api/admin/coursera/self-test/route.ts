import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getXapiConfig, getXapiReadiness } from '@/lib/xapi/config';
import {
  _resetTokenCacheForTesting,
  B4BConfigurationError,
  getB4BOrgId,
  getCourseGradebookReports,
  getEnrollmentReports,
  getOrgInfo,
  listContents,
  listPrograms,
  listUsers,
} from '@/lib/coursera/b4bClient';
import { withApiGuc } from '@/lib/db/withRequestGuc';

// ---------------------------------------------------------------------------
// Admin-facing self-test for the Coursera integration.
//
// Runs three probes server-side (where internet egress is available):
//   1. Inbound xAPI OAuth — POST /api/xapi/oauth/token with our credentials
//   2. Inbound xAPI statement — POST /api/xapi/statements with that token
//   3. Outbound B4B OAuth — POST to Coursera with B4B client credentials
//   4. Outbound B4B endpoints — GET probe of known For Business REST URLs
//
// Returns JSON structured for the /admin/coursera page to render inline.
// Never exposes raw secrets — only obfuscated previews.
// ---------------------------------------------------------------------------

// Per Coursera OAuth Credentials YAML: server is api.coursera.com (NOT .org).
// Per Coursera For Business API YAML: server is api.coursera.com/ent (the "/ent"
// subpath IS required for businesses.v1/* paths).
const DEFAULT_COURSERA_OAUTH_URL = 'https://api.coursera.com/oauth2/client_credentials/token';
const DEFAULT_COURSERA_API_BASE = 'https://api.coursera.com/ent';
const DEFAULT_ORG_SLUG = 'workforce-advancement';

function obfuscate(value: string | undefined | null): string {
  if (!value) return '<missing>';
  if (value.length <= 8) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 4)}…${value.slice(-2)} (len=${value.length})`;
}

function previewJson(value: unknown, max = 320): string {
  let str: string;
  try {
    str = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    str = String(value);
  }
  return str.length > max ? `${str.slice(0, max)}… <truncated>` : str;
}

type ClientProbe = {
  method: string;
  ok: boolean;
  detail: string;
  /** A short payload preview if the call succeeded. */
  preview?: string;
};

type SelfTestResult = {
  ok: boolean;
  ranAt: string;
  targetBaseUrl: string;
  inbound: {
    tokenOk: boolean | null;
    tokenDetail: string;
    statementOk: boolean | null;
    statementDetail: string;
  };
  outbound: {
    tokenOk: boolean | null;
    tokenScope: string | null;
    tokenDetail: string;
    endpoints: Array<{
      label: string;
      url: string;
      status: number | 'ERROR';
      message?: string;
      payloadPreview?: string;
    }>;
  };
  /** (g) — exercises the typed b4bClient end-to-end against prod. */
  client?: {
    ok: boolean | null;
    skipped?: string;
    probes: ClientProbe[];
  };
  config: {
    xapiClientIdPreview: string;
    xapiSecretSet: boolean;
    b4bClientIdPreview: string;
    b4bSecretSet: boolean;
    orgId: string;
    orgSlug: string;
    oauthUrl: string;
    apiBase: string;
  };
  recommendations: string[];
};

async function requireAdmin() {
  const user = await getUser();
  if (!user || !(await isAdmin(user.id))) {
    return null;
  }
  return user;
}

async function runInboundTokenTest(
  targetBase: string,
  clientId: string,
  clientSecret: string
): Promise<{ ok: boolean; detail: string; token: string | null }> {
  const url = `${targetBase}/api/xapi/oauth/token`;
  const formBody = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });

    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* no-op */ }

    if (!response.ok) {
      return { ok: false, detail: `HTTP ${response.status} — ${previewJson(text, 200)}`, token: null };
    }

    const accessToken = typeof json?.access_token === 'string' ? json.access_token : '';
    if (!accessToken) {
      return { ok: false, detail: `200 but no access_token — ${previewJson(text, 200)}`, token: null };
    }

    const tokenType = json?.token_type || 'unknown';
    const expiresIn = json?.expires_in;
    const scope = typeof json?.scope === 'string' ? json.scope : null;
    const isJwt = accessToken.split('.').length === 3;
    return {
      ok: true,
      detail: `token_type=${tokenType} expires_in=${expiresIn ?? '?'} scope=${scope ?? '?'} format=${isJwt ? 'JWT' : 'opaque'}`,
      token: accessToken,
    };
  } catch (error) {
    return {
      ok: false,
      detail: `network error: ${error instanceof Error ? error.message : String(error)}`,
      token: null,
    };
  }
}

async function runInboundStatementTest(targetBase: string, accessToken: string) {
  const candidates = [`${targetBase}/api/xapi/statements`, `${targetBase}/api/xapi`];
  const sampleStatement = {
    id: `urn:uuid:${crypto.randomUUID()}`,
    actor: {
      objectType: 'Agent',
      mbox: 'mailto:self-test@workforceap.org',
      name: 'Self Test Actor',
    },
    verb: {
      id: 'http://adlnet.gov/expapi/verbs/completed',
      display: { 'en-US': 'completed' },
    },
    object: {
      objectType: 'Activity',
      id: 'https://www.coursera.org/learn/self-test-course',
      definition: {
        name: { 'en-US': 'Self Test Course' },
        type: 'http://adlnet.gov/expapi/activities/course',
      },
    },
    result: {
      completion: true,
      success: true,
      score: { scaled: 1, raw: 100, min: 0, max: 100 },
    },
    timestamp: new Date().toISOString(),
  };

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-Experience-API-Version': '1.0.3',
        },
        body: JSON.stringify(sampleStatement),
      });
      const text = await response.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* no-op */ }

      if (response.status === 404) continue;
      if (response.ok || response.status === 204) {
        return { ok: true, detail: `HTTP ${response.status} — ${previewJson(json ?? text, 200)}` };
      }
      return { ok: false, detail: `HTTP ${response.status} — ${previewJson(text, 200)}` };
    } catch (error) {
      return {
        ok: false,
        detail: `network error to ${url}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  return { ok: false, detail: 'no candidate endpoint reachable' };
}

async function runOutboundOauth(b4bId: string, b4bSecret: string, oauthUrl: string) {
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const basic = Buffer.from(`${b4bId}:${b4bSecret}`).toString('base64');

  try {
    const response = await fetch(oauthUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* no-op */ }

    if (!response.ok) {
      return { ok: false, detail: `HTTP ${response.status} — ${previewJson(text, 240)}`, token: null, scope: null };
    }

    const accessToken = typeof json?.access_token === 'string' ? json.access_token : '';
    const scope = typeof json?.scope === 'string' ? json.scope : null;
    if (!accessToken) {
      return { ok: false, detail: `200 but no access_token — ${previewJson(text, 200)}`, token: null, scope: null };
    }

    return {
      ok: true,
      detail: `token=${obfuscate(accessToken)} scope=${scope ?? '<none>'} expires_in=${json?.expires_in ?? '?'}`,
      token: accessToken,
      scope,
    };
  } catch (error) {
    return {
      ok: false,
      detail: `network error: ${error instanceof Error ? error.message : String(error)}`,
      token: null,
      scope: null,
    };
  }
}

async function probeEndpoint(label: string, url: string, accessToken: string) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    const text = await response.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* no-op */ }

    return {
      label,
      url,
      status: response.status as number | 'ERROR',
      payloadPreview: response.ok ? previewJson(json ?? text, 240) : previewJson(text, 200),
    };
  } catch (error) {
    return {
      label,
      url,
      status: 'ERROR' as const,
      message: `network error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runClientProbes(programId: string): Promise<ClientProbe[]> {
  // Reset the b4bClient's module-scope token cache so this self-test always
  // starts from a cold state (matches the existing direct-fetch probes).
  _resetTokenCacheForTesting();

  const probes: ClientProbe[] = [];

  async function probe<T>(
    name: string,
    fn: () => Promise<T>,
    summarize: (result: T) => string,
  ) {
    try {
      const result = await fn();
      probes.push({
        method: name,
        ok: true,
        detail: 'ok',
        preview: previewJson(summarize(result), 240),
      });
    } catch (error) {
      probes.push({
        method: name,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await probe('getOrgInfo', () => getOrgInfo(), (info) =>
    `id=${info.id} name=${info.name}`
  );
  await probe('listUsers', () => listUsers({ limit: 5 }), (page) =>
    `elements=${page.elements.length} total=${page.paging.total ?? '?'}`
  );
  await probe('listPrograms', () => listPrograms({ limit: 5 }), (page) =>
    `elements=${page.elements.length} total=${page.paging.total ?? '?'}`
  );
  await probe('listContents', () => listContents({ limit: 5 }), (page) =>
    `elements=${page.elements.length} total=${page.paging.total ?? '?'}`
  );
  await probe(
    'getEnrollmentReports',
    () => getEnrollmentReports({ limit: 5 }),
    (page) => `elements=${page.elements.length} total=${page.paging.total ?? '?'}`,
  );
  await probe(
    'getCourseGradebookReports',
    () => getCourseGradebookReports({ programId, limit: 5 }),
    (page) => `elements=${page.elements.length} total=${page.paging.total ?? '?'}`,
  );

  return probes;
}

function buildEndpointCatalog(apiBase: string, orgId: string, _orgSlug: string) {
  // Paths taken VERBATIM from Coursera For Business API YAML.
  // The YAML uses `{orgId}` directly (NO `/orgs/` prefix). Earlier catalog
  // had the wrong shape and 404'd on every call.
  const id = encodeURIComponent(orgId);
  return [
    { label: 'org info', url: `${apiBase}/api/businesses.v1/${id}` },
    { label: 'users', url: `${apiBase}/api/businesses.v1/${id}/users?limit=5` },
    // excludeContent is required per the YAML.
    { label: 'programs', url: `${apiBase}/api/businesses.v1/${id}/programs?excludeContent=true&limit=5` },
    { label: 'contents', url: `${apiBase}/api/businesses.v1/${id}/contents?limit=5` },
    // The big one — paginated learner progress, what we want for backfill.
    { label: 'enrollmentReports', url: `${apiBase}/api/businesses.v1/${id}/enrollmentReports?limit=5` },
    { label: 'courseGradebookReports', url: `${apiBase}/api/businesses.v1/${id}/courseGradebookReports?q=search&limit=5` },
  ];
}

function buildRecommendations(result: SelfTestResult): string[] {
  const recs: string[] = [];

  const okEndpoints = result.outbound.endpoints.filter((e) => typeof e.status === 'number' && e.status >= 200 && e.status < 300);
  if (okEndpoints.length > 0) {
    recs.push('B4B sync is active — pulls enrollmentReports every 6h into CourseProgress.');
    recs.push('If a member shows 0% despite activity: Coursera may delay up to 24h, or the user enrolled directly (not via program portal).');
  } else if (result.outbound.tokenOk) {
    recs.push('B4B OAuth works but no endpoints returned 200.');
    recs.push('Likely causes: dev app missing For Business API product enablement, or wrong org id.');
  }

  if (result.inbound.tokenOk && result.inbound.statementOk) {
    recs.push('Inbound xAPI endpoints are healthy. If no statements arrive, verify Coursera admin panel has our endpoint URLs + credentials configured.');
  } else if (result.inbound.tokenOk === false) {
    recs.push('Inbound OAuth is failing. Verify XAPI_CLIENT_ID / XAPI_CLIENT_SECRET (or COURSERA_APP_ID/SECRET) on the WorkforceAP server match the values you handed to Coursera.');
  } else if (result.inbound.statementOk === false) {
    recs.push('Inbound OAuth works but statement ingestion is failing. Inspect the response body and check lib/xapi/inboundStatementPipeline.ts.');
  }

  if (result.outbound.tokenScope) {
    recs.push(`OAuth granted scopes: ${result.outbound.tokenScope}. Cross-check this against which endpoints returned 200 to see whether the dev app needs additional product access.`);
  }

  return recs;
}

async function _GET() {
  try {
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    const readiness = getXapiReadiness();
    const xapiConfig = getXapiConfig();
  
    // Inbound target. The chain matters:
    //   1. Explicit COURSERA_TARGET_BASE_URL — operator override
    //   2. NEXT_PUBLIC_SITE_URL — canonical site URL (typically prod)
    //   3. Hardcoded www.workforceap.org — safe prod fallback
    // We deliberately do NOT fall back to VERCEL_URL: that returns the
    // per-deployment URL like `workforceap-beta-<sha>-...vercel.app`,
    // which on preview deployments sits behind Vercel's password protection
    // wall and returns 401 "Authentication Required" before ever reaching
    // our route. The inbound test only makes sense against the same domain
    // Coursera POSTs to in production.
    const targetBase = (
      process.env.COURSERA_TARGET_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      'https://www.workforceap.org'
    ).replace(/\/$/, '');
    const orgId = getB4BOrgId();
    const orgSlug = process.env.COURSERA_ORG_SLUG?.trim() || DEFAULT_ORG_SLUG;
    const oauthUrl = process.env.COURSERA_OAUTH_TOKEN_URL?.trim() || DEFAULT_COURSERA_OAUTH_URL;
    const apiBase = (process.env.COURSERA_API_BASE_URL?.trim() || DEFAULT_COURSERA_API_BASE).replace(/\/$/, '');
  
    const xapiId = process.env.COURSERA_XAPI_CLIENT_ID?.trim() || xapiConfig.clientId;
    const xapiSecret = process.env.COURSERA_XAPI_CLIENT_SECRET?.trim() || xapiConfig.clientSecret;
    const b4bId = process.env.COURSERA_B4B_CLIENT_ID?.trim() || '';
    const b4bSecret = process.env.COURSERA_B4B_CLIENT_SECRET?.trim() || '';
  
    const xapiPairComplete = Boolean(xapiId && xapiSecret);
    const b4bPairComplete = Boolean(b4bId && b4bSecret);
  
    const result: SelfTestResult = {
      ok: false,
      ranAt: new Date().toISOString(),
      targetBaseUrl: targetBase,
      inbound: {
        tokenOk: null,
        tokenDetail: '',
        statementOk: null,
        statementDetail: '',
      },
      outbound: {
        tokenOk: null,
        tokenScope: null,
        tokenDetail: '',
        endpoints: [],
      },
      config: {
        xapiClientIdPreview: obfuscate(xapiId),
        xapiSecretSet: Boolean(xapiSecret),
        b4bClientIdPreview: obfuscate(b4bId),
        b4bSecretSet: Boolean(b4bSecret),
        orgId,
        orgSlug,
        oauthUrl,
        apiBase,
      },
      recommendations: [],
    };
  
    // ----- inbound xAPI -----
    if (!xapiPairComplete) {
      result.inbound.tokenOk = false;
      result.inbound.tokenDetail = 'incomplete xAPI credential pair (set COURSERA_XAPI_CLIENT_ID + COURSERA_XAPI_CLIENT_SECRET, or rely on XAPI_CLIENT_ID / COURSERA_APP_ID env vars)';
      result.inbound.statementOk = false;
      result.inbound.statementDetail = result.inbound.tokenDetail;
    } else {
      const tokenResult = await runInboundTokenTest(targetBase, xapiId, xapiSecret);
      result.inbound.tokenOk = tokenResult.ok;
      result.inbound.tokenDetail = tokenResult.detail;
  
      if (tokenResult.token) {
        const stmtResult = await runInboundStatementTest(targetBase, tokenResult.token);
        result.inbound.statementOk = stmtResult.ok;
        result.inbound.statementDetail = stmtResult.detail;
      } else {
        result.inbound.statementOk = false;
        result.inbound.statementDetail = 'token endpoint did not return a usable token';
      }
    }
  
    // ----- outbound B4B -----
    let outboundToken: string | null = null;
    if (!b4bPairComplete) {
      result.outbound.tokenOk = false;
      result.outbound.tokenDetail = 'incomplete B4B credential pair (set COURSERA_B4B_CLIENT_ID + COURSERA_B4B_CLIENT_SECRET)';
    } else {
      const oauthResult = await runOutboundOauth(b4bId, b4bSecret, oauthUrl);
      result.outbound.tokenOk = oauthResult.ok;
      result.outbound.tokenDetail = oauthResult.detail;
      result.outbound.tokenScope = oauthResult.scope;
      outboundToken = oauthResult.token;
    }
  
    if (outboundToken) {
      const catalog = buildEndpointCatalog(apiBase, orgId, orgSlug);
      for (const entry of catalog) {
        const probe = await probeEndpoint(entry.label, entry.url, outboundToken);
        result.outbound.endpoints.push(probe);
      }
    }
  
    // (g) — exercise the b4bClient end-to-end. Only meaningful when the
    // direct-fetch outbound probes returned 200, since the client uses the
    // same credentials/host. Skip otherwise to keep the report fast.
    const anyEndpointOk = result.outbound.endpoints.some(
      (e) => typeof e.status === 'number' && e.status >= 200 && e.status < 300,
    );
    if (b4bPairComplete && anyEndpointOk) {
      const programId = process.env.COURSERA_PROGRAM_ID?.trim() || 'TpIlAogTQ8-SJQKIE8PP9w';
      try {
        const probes = await runClientProbes(programId);
        result.client = {
          ok: probes.every((p) => p.ok),
          probes,
        };
      } catch (error) {
        result.client = {
          ok: false,
          skipped: error instanceof Error ? error.message : String(error),
          probes: [],
        };
      }
    } else {
      result.client = {
        ok: null,
        skipped: !b4bPairComplete
          ? 'B4B credentials not configured'
          : 'Skipped — direct-fetch probes did not return any 2xx',
        probes: [],
      };
    }
  
    result.recommendations = buildRecommendations(result);
  
    const anyEndpointSuccess = result.outbound.endpoints.some(
      (e) => typeof e.status === 'number' && e.status >= 200 && e.status < 300
    );
    const outboundTokenIssuedButNoEndpointWorks =
      result.outbound.tokenOk === true && result.outbound.endpoints.length > 0 && !anyEndpointSuccess;
  
    const hadFail =
      result.inbound.tokenOk === false ||
      result.inbound.statementOk === false ||
      result.outbound.tokenOk === false ||
      outboundTokenIssuedButNoEndpointWorks ||
      result.client?.ok === false;
  
    result.ok = !hadFail;
  
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof B4BConfigurationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
    }
    console.error('/admin/coursera/self-test:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withApiGuc(_GET);
