'use strict';
/**
 * Local mail capture for `npm run preview:local`. The preview points the Resend SDK at
 * this server (RESEND_BASE_URL), so every app send lands here instead of a provider.
 * Gated by the local-only guard and a loopback Host check, like the auth shim.
 *
 *   POST /emails, POST /emails/batch   capture, answer like the provider ({ id })
 *   GET  /suppressions                 empty list
 *   GET  /__sink/messages              { total, messages: [{ id, to, subject, receivedAt }] }
 *   DELETE /__sink/messages            clear
 *   GET  /__sink/health
 *
 * Bodies are kept in memory only; nothing is forwarded.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { assertLocalOnly, isLocalHostHeader } = require('./local-only-guard.cjs');

function createMailSink(env, port) {
  assertLocalOnly(env, { ports: { mail: port } });
  const messages = [];
  const unexpected = [];
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
  const capture = (m) => {
    const id = crypto.randomUUID();
    messages.push({ id, to: [].concat(m?.to ?? []), subject: String(m?.subject ?? ''), receivedAt: new Date().toISOString() });
    return { id };
  };

  return http.createServer(async (req, res) => {
    if (!isLocalHostHeader(req.headers.host, port)) return send(res, 404, { error: 'not_found' });
    const { pathname } = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === 'POST' && pathname === '/emails') return send(res, 200, capture(await readBody(req)));
    if (req.method === 'POST' && pathname === '/emails/batch') {
      const body = await readBody(req);
      return send(res, 200, { data: (Array.isArray(body) ? body : []).map(capture) });
    }
    if (req.method === 'GET' && pathname === '/suppressions') return send(res, 200, { data: [], has_more: false });
    if (req.method === 'GET' && pathname === '/__sink/messages') return send(res, 200, { total: messages.length, messages, unexpected });
    if (req.method === 'DELETE' && pathname === '/__sink/messages') { messages.length = 0; unexpected.length = 0; return send(res, 200, { total: 0 }); }
    if (req.method === 'GET' && pathname === '/__sink/health') return send(res, 200, { name: 'preview-mail-sink' });
    unexpected.push(`${req.method} ${pathname}`);
    return send(res, 404, { error: 'not_found' });
  });
}

module.exports = { createMailSink };

if (require.main === module) {
  const port = Number(process.env.PREVIEW_MAIL_PORT || 54332);
  const server = createMailSink(process.env, port);
  server.listen(port, '127.0.0.1', () => console.log(`preview mail sink on 127.0.0.1:${port}`));
}
