'use strict';
/**
 * Dev-only GoTrue stand-in for `npm run preview:local`. Implements just enough of the
 * Supabase Auth HTTP API for @supabase/ssr: password sign-in, refresh, user, logout.
 * Gated by the local-only guard: it refuses to start unless the whole environment is
 * local, and answers 404 to any request whose Host header is not loopback on its own port.
 * Users come from PREVIEW_* env vars only. Tokens are HS256 signed with a fake secret.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { assertLocalOnly, isLocalHostHeader } = require('./local-only-guard.cjs');

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function sign(payload, secret) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  return `${head}.${body}.${crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
}
function verify(token, secret) {
  const [h, b, s] = String(token || '').split('.');
  if (!h || !b || !s) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
  return payload.exp && payload.exp < Math.floor(Date.now() / 1000) ? null : payload;
}

function createShim(env, port) {
  assertLocalOnly(env);
  const secret = env.PREVIEW_JWT_SECRET;
  if (!secret) throw new Error('PREVIEW_JWT_SECRET is required for the auth shim');
  const users = [
    { id: env.PREVIEW_ADMIN_ID, email: env.PREVIEW_ADMIN_EMAIL, password: env.PREVIEW_ADMIN_PASSWORD },
    { id: env.PREVIEW_STUDENT_ID, email: env.PREVIEW_STUDENT_EMAIL, password: env.PREVIEW_STUDENT_PASSWORD },
  ];
  if (users.some((u) => !u.id || !u.email || !u.password || !u.email.endsWith('@example.test'))) {
    throw new Error('Preview users must define id, example.test email and password');
  }
  const publicUser = (u) => ({
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  });
  const session = (u) => {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;
    const claims = { sub: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', iss: 'preview-local', iat: now, exp, app_metadata: { provider: 'email' }, user_metadata: {} };
    return {
      access_token: sign(claims, secret), token_type: 'bearer', expires_in: 3600, expires_at: exp,
      refresh_token: sign({ sub: u.id, typ: 'refresh', exp: now + 7 * 86400 }, secret), user: publicUser(u),
    };
  };
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 100_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });

  return http.createServer(async (req, res) => {
    if (!isLocalHostHeader(req.headers.host, port)) return send(res, 404, { error: 'not_found' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      const body = await readBody(req);
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const email = String(body.email || '').trim().toLowerCase();
        const user = users.find((u) => u.email === email);
        const ok = user && typeof body.password === 'string' && body.password.length === user.password.length
          && crypto.timingSafeEqual(Buffer.from(body.password), Buffer.from(user.password));
        return ok ? send(res, 200, session(user)) : send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      if (grant === 'refresh_token') {
        const claims = verify(body.refresh_token, secret);
        const user = claims && users.find((u) => u.id === claims.sub);
        return user ? send(res, 200, session(user)) : send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      }
      return send(res, 400, { error: 'unsupported_grant_type' });
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      const claims = verify((req.headers.authorization || '').replace(/^Bearer /i, ''), secret);
      const user = claims && users.find((u) => u.id === claims.sub);
      return user ? send(res, 200, publicUser(user)) : send(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
    }
    if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/auth/v1/health') return send(res, 200, { name: 'preview-auth-shim' });
    return send(res, 404, { error: 'not_found' });
  });
}

module.exports = { createShim };

if (require.main === module) {
  const port = Number(process.env.PREVIEW_AUTH_PORT || 54331);
  const server = createShim(process.env, port);
  server.listen(port, '127.0.0.1', () => console.log(`preview auth shim on 127.0.0.1:${port}`));
}
