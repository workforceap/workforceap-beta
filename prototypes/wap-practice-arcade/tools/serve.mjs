// Tiny dependency-free static server for the arcade ROOT.
// Usage: node tools/serve.mjs [port] [--host 0.0.0.0]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function resolveSafe(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch { return null; }
  if (p.includes('\0')) return null;
  const full = path.resolve(ROOT, '.' + path.posix.normalize('/' + p.split(String.fromCharCode(92)).join('/')));
  const rel = path.relative(ROOT, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

export function startServer({ port = 0, host = '127.0.0.1' } = {}) {
  const server = http.createServer((req, res) => {
    const headers = { 'Cache-Control': 'no-store' };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...headers, Allow: 'GET, HEAD' });
      return res.end('Method not allowed');
    }
    let full = resolveSafe(req.url || '/');
    if (!full) { res.writeHead(403, headers); return res.end('Forbidden'); }
    fs.stat(full, (err, st) => {
      if (!err && st.isDirectory()) full = path.join(full, 'index.html');
      fs.stat(full, (err2, st2) => {
        if (err2 || !st2.isFile()) { res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
        const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': st2.size });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(full).on('error', () => res.destroy()).pipe(res);
      });
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const actual = server.address().port;
      const shown = host === '0.0.0.0' ? 'localhost' : host;
      resolve({
        url: `http://${shown}:${actual}`,
        port: actual,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let host = '127.0.0.1';
  let port = 8770;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host') host = args[++i] || host;
    else if (/^\d+$/.test(args[i])) port = Number(args[i]);
  }
  const s = await startServer({ port, host });
  console.log(`Serving ${ROOT}\n  ${s.url}/play.html?game=<game-id>\nCtrl+C to stop.`);
}
