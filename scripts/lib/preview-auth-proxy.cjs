'use strict';
/**
 * Tiny loopback-only proxy so supabase-js (which calls `<url>/auth/v1/...`) can talk to a bare
 * GoTrue container (which serves at `/`). Listens on 127.0.0.1 only, forwards to 127.0.0.1 only,
 * and answers 404 for anything that is not under /auth/v1. No other upstream is possible.
 *
 * usage: node preview-auth-proxy.cjs <listenPort> <gotruePort>
 */
const http = require('node:http');

const listenPort = Number(process.argv[2]);
const targetPort = Number(process.argv[3]);
if (!Number.isInteger(listenPort) || !Number.isInteger(targetPort)) {
  process.stderr.write('usage: preview-auth-proxy.cjs <listenPort> <gotruePort>\n');
  process.exit(2);
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (!url.startsWith('/auth/v1/') && url !== '/auth/v1') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"error":"not_found","note":"local preview auth proxy only serves /auth/v1"}');
    return;
  }
  const upstream = http.request(
    { host: '127.0.0.1', port: targetPort, method: req.method, path: url.slice('/auth/v1'.length) || '/', headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end('{"error":"auth_unreachable"}');
  });
  req.pipe(upstream);
});
server.listen(listenPort, '127.0.0.1');
