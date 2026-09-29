const DEMO_REF = 'esbdrgaonplpvzmtrdhw';
const PROD_REF = 'jqddnyuszufndwwezdwp';

const REFS = {
  demo: DEMO_REF,
  prod: PROD_REF,
};

// Prisma can use query parameters in place of URL authority fields. In
// particular, ?host=/path/to/socket ignores the hostname in the authority.
// Never approve a project from that hostname when a connection target or
// identity can be overridden by a query parameter.
const CONNECTION_TARGET_OVERRIDE_KEYS = new Set([
  'host', 'hostaddr', 'port', 'user', 'dbname', 'database',
  'password', 'service', 'servicefile', 'passfile',
]);

function parseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function projectForUrl(value, kind = 'database') {
  if (!value) return 'unset';
  const parsed = parseUrl(value);
  if (!parsed) return 'unknown';

  if (kind === 'database') {
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return 'unknown';
    for (const key of parsed.searchParams.keys()) {
      if (CONNECTION_TARGET_OVERRIDE_KEYS.has(key.toLowerCase())) return 'unknown';
    }
  } else if (kind === 'public' && parsed.protocol !== 'https:') {
    return 'unknown';
  }

  const hostname = parsed.hostname.toLowerCase();
  let username;
  try {
    username = decodeURIComponent(parsed.username || '').toLowerCase();
  } catch {
    return 'unknown';
  }
  const isSupabasePooler =
    hostname === 'pooler.supabase.com' || hostname.endsWith('.pooler.supabase.com');
  const rawPoolerOptions = parsed.searchParams.getAll('options');
  const optionParameters = rawPoolerOptions.map((option) => new URLSearchParams(option));
  if (optionParameters.some((params) => [...params.keys()].some((key) =>
    CONNECTION_TARGET_OVERRIDE_KEYS.has(key.toLowerCase())))) return 'unknown';
  const optionReferences = optionParameters.flatMap((params) => params.getAll('reference'));

  for (const [project, ref] of Object.entries(REFS)) {
    const exactPublicHost = hostname === `${ref}.supabase.co`;
    const exactDatabaseHost = hostname === `db.${ref}.supabase.co`;
    // Supavisor resolves options.reference before the legacy dotted username.
    // Only trust the dotted form when no reference marker is present anywhere.
    const exactPoolerUser =
      isSupabasePooler && username === `postgres.${ref}` && optionReferences.length === 0;
    // Vercel's current Supabase integration can keep the shared-pooler user as
    // `postgres` and route the tenant through `options=reference=<project-ref>`.
    // Require the real Supabase pooler host, the exact role, and exactly one
    // reference marker so an unrelated URL cannot merely mention an allowlisted
    // ref and pass this guard.
    const exactPoolerOptionReference =
      isSupabasePooler &&
      username === 'postgres' &&
      rawPoolerOptions.length === 1 &&
      optionReferences.length === 1 &&
      optionReferences[0] === ref;

    if (
      (kind === 'public' && exactPublicHost) ||
      (kind === 'database' &&
        (exactDatabaseHost || exactPoolerUser || exactPoolerOptionReference))
    ) {
      return project;
    }
  }

  return 'unknown';
}

function decodeJwtPayload(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const payload = JSON.parse(Buffer.from(padded + pad, 'base64').toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

function projectForRef(ref) {
  if (!ref) return 'unknown';
  for (const [project, expectedRef] of Object.entries(REFS)) {
    if (ref === expectedRef) return project;
  }
  return 'unknown';
}

// JWT anon keys encode the project ref. New-format `sb_publishable_` keys do
// not, so they classify as "publishable" and the public URL still binds the
// project. Secrets (`sb_secret_` / service_role JWTs) must never occupy this slot.
function projectForAnonKey(value) {
  if (!value) return 'unset';
  const key = String(value).trim();
  if (!key) return 'unset';
  if (key.startsWith('sb_secret_')) return 'service_role';
  if (key.startsWith('sb_publishable_')) {
    return key.length >= 32 ? 'publishable' : 'unknown';
  }

  const payload = decodeJwtPayload(key);
  if (!payload) return 'unknown';
  if (payload.iss && payload.iss !== 'supabase') return 'unknown';
  if (payload.role === 'service_role') return 'service_role';
  if (payload.role !== 'anon') return 'unknown';
  return projectForRef(payload.ref);
}

function expectedProjectForVercelEnv(vercelEnv) {
  if (vercelEnv === 'production') return 'prod';
  if (vercelEnv === 'preview' || vercelEnv === 'development') return 'demo';
  return null;
}

function inspectSupabaseEnvironment(env = process.env, options = {}) {
  const { requireVercel = false, requireDirectUrl = false } = options;
  const errors = [];
  const vercelEnv = env.VERCEL_ENV || '';
  const expected = expectedProjectForVercelEnv(vercelEnv);
  const isVercel = env.VERCEL === '1';

  if (requireVercel && !isVercel) {
    errors.push('This database operation is allowed only during a Vercel deployment.');
  }
  if (!expected) {
    errors.push('VERCEL_ENV must be exactly production, preview, or development.');
  }

  const urls = {
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || '',
    POSTGRES_PRISMA_URL: env.POSTGRES_PRISMA_URL || '',
    POSTGRES_URL_NON_POOLING: env.POSTGRES_URL_NON_POOLING || '',
    DATABASE_URL: env.DATABASE_URL || '',
  };

  const classifications = {
    NEXT_PUBLIC_SUPABASE_URL: projectForUrl(urls.NEXT_PUBLIC_SUPABASE_URL, 'public'),
    POSTGRES_PRISMA_URL: projectForUrl(urls.POSTGRES_PRISMA_URL),
    POSTGRES_URL_NON_POOLING: projectForUrl(urls.POSTGRES_URL_NON_POOLING),
    DATABASE_URL: projectForUrl(urls.DATABASE_URL),
  };

  // URL names only. NEXT_PUBLIC_SUPABASE_ANON_KEY is required too, but it is a
  // JWT / publishable key rather than a URL — classify it separately below.
  // Shipping without it used to pass this guard and take down both auth paths.
  const requiredNames = ['NEXT_PUBLIC_SUPABASE_URL', 'POSTGRES_PRISMA_URL'];
  if (requireDirectUrl) requiredNames.push('POSTGRES_URL_NON_POOLING');

  for (const name of requiredNames) {
    const classification = classifications[name];
    if (classification === 'unset') {
      errors.push(`${name} is required on Vercel.`);
    } else if (classification === 'unknown') {
      errors.push(`${name} does not identify an approved Supabase project.`);
    } else if (expected && classification !== expected) {
      errors.push(`${name} points at the wrong Supabase project for VERCEL_ENV=${vercelEnv}.`);
    }
  }

  const anonKeyClassification = projectForAnonKey(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
  classifications.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKeyClassification;
  if (anonKeyClassification === 'unset') {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is required on Vercel.');
  } else if (anonKeyClassification === 'service_role') {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY must be the public anon key, not a service role key.');
  } else if (anonKeyClassification === 'unknown') {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY does not identify an approved Supabase anon key.');
  } else if (
    anonKeyClassification !== 'publishable' &&
    expected &&
    anonKeyClassification !== expected
  ) {
    errors.push(
      `NEXT_PUBLIC_SUPABASE_ANON_KEY points at the wrong Supabase project for VERCEL_ENV=${vercelEnv}.`
    );
  }

  for (const name of ['POSTGRES_URL_NON_POOLING']) {
    const classification = classifications[name];
    if (classification !== 'unset' && classification !== 'unknown' && expected && classification !== expected) {
      errors.push(`${name} points at the wrong Supabase project for VERCEL_ENV=${vercelEnv}.`);
    }
    if (urls[name] && classification === 'unknown') {
      errors.push(`${name} is set but does not identify an approved Supabase project.`);
    }
  }

  // DATABASE_URL is a fallback only. Vercel may inject an unrelated value,
  // but Prisma and runtime signup checks prefer the explicit POSTGRES_* URLs.
  // Validate it only when either effective Prisma URL would need the fallback.
  if (!urls.POSTGRES_PRISMA_URL || (requireDirectUrl && !urls.POSTGRES_URL_NON_POOLING)) {
    const classification = classifications.DATABASE_URL;
    if (classification !== 'unset' && classification !== 'unknown' && expected && classification !== expected) {
      errors.push(`DATABASE_URL points at the wrong Supabase project for VERCEL_ENV=${vercelEnv}.`);
    }
    if (urls.DATABASE_URL && classification === 'unknown') {
      errors.push('DATABASE_URL is set but does not identify an approved Supabase project.');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    isVercel,
    vercelEnv,
    expected,
    classifications,
    directDatabaseUrl:
      urls.POSTGRES_URL_NON_POOLING || urls.POSTGRES_PRISMA_URL || urls.DATABASE_URL || '',
  };
}

function assertSupabaseEnvironment(env = process.env, options = {}) {
  const result = inspectSupabaseEnvironment(env, options);
  if (!result.ok) {
    const error = new Error(result.errors.join('\n'));
    error.code = 'SUPABASE_PROJECT_GUARD';
    error.details = result;
    throw error;
  }
  return result;
}

function formatSupabaseEnvGuardFailure(errorMessages, refs = { demo: DEMO_REF, prod: PROD_REF }) {
  const errors = (errorMessages || []).map((message) => String(message));
  const missingRequired = errors.some((error) => /is required on Vercel\./.test(error));
  const wrongProject = errors.some(
    (error) =>
      /points at the wrong Supabase project/.test(error) ||
      /points at the (DEMO|PROD) project/.test(error)
  );

  if (missingRequired && !wrongProject) {
    return {
      header: '[supabase-env-guard] BLOCKED — required Supabase variable is missing:',
      hint:
        'Fix: in Vercel, add the missing variable with the correct scope checked (Production vs Preview + Development) and redeploy. See docs/STAGING_ENV.md.',
    };
  }

  if (wrongProject) {
    return {
      header: '[supabase-env-guard] BLOCKED — wrong Supabase project for this environment:',
      hint:
        `Fix: in Vercel, the Preview + Development scopes must use the DEMO project (${refs.demo}); ` +
        `Production must use the real project (${refs.prod}). See docs/STAGING_ENV.md.`,
    };
  }

  return {
    header: '[supabase-env-guard] BLOCKED — Supabase environment is misconfigured:',
    hint: 'Fix: check the Supabase URL, anon key, and connection strings in Vercel. See docs/STAGING_ENV.md.',
  };
}

module.exports = {
  DEMO_REF,
  PROD_REF,
  assertSupabaseEnvironment,
  expectedProjectForVercelEnv,
  formatSupabaseEnvGuardFailure,
  inspectSupabaseEnvironment,
  projectForAnonKey,
  projectForUrl,
};
