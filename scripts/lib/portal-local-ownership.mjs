import { readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { canonical } from './demo-acceptance-journal.mjs';
import { localReceiptDigest } from './demo-acceptance-local.mjs';

/** Linux-only proof of the owned listener; no secret or raw environment is returned. */
export function captureLocalOwnership(serverPid, sha, nonce, cwd = process.cwd()) {
  if (process.platform !== 'linux' || !Number.isSafeInteger(serverPid) || serverPid <= 1 || !/^[a-f0-9]{40}$/.test(sha) || typeof nonce !== 'string' || nonce.length < 32) throw new Error('Explicit local ownership inputs required.');
  const listeners = readFileSync('/proc/net/tcp', 'utf8').trim().split('\n').slice(1).map(line => line.trim().split(/\s+/)).filter(fields => fields[1] === '0100007F:0C23' && fields[3] === '0A');
  if (listeners.length !== 1) throw new Error('The exact loopback listener is missing or ambiguous.');
  const inode = listeners[0][9];
  for (const entry of readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      if (Number(fields[2]) !== serverPid || realpathSync(`/proc/${entry}/cwd`) !== realpathSync(cwd)) continue;
      const environment = readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0');
      if (!environment.includes(`PORTAL_ACCEPTANCE_LOCAL_AUDIT_TOKEN=${nonce}`) || !environment.includes(`VERCEL_GIT_COMMIT_SHA=${sha}`)) continue;
      const socket = readdirSync(`/proc/${entry}/fd`).some(fd => { try { return readlinkSync(`/proc/${entry}/fd/${fd}`) === `socket:[${inode}]`; } catch { return false; } });
      if (socket) return { kind: 'owned-disconnected-listener', controlSha: sha, origin: 'http://127.0.0.1:3107', serverPid, listenerPid: Number(entry), socketInode: inode, nonceDigest: localReceiptDigest(Buffer.from(nonce)) };
    } catch { /* Other users' processes and exited children are not ownership evidence. */ }
  }
  throw new Error('Listener does not belong to the exact nonce-bearing task process.');
}

export function verifyLocalOwnershipEnvironment(env, sha, origin) {
  if (env.PORTAL_ACCEPTANCE_OWNED_DISCONNECTED_SERVER !== 'true' || origin !== 'http://127.0.0.1:3107' || !env.PORTAL_ACCEPTANCE_LOCAL_OWNERSHIP_FILE) throw new Error('Owned local isolation proof is required.');
  const expected = JSON.parse(readFileSync(env.PORTAL_ACCEPTANCE_LOCAL_OWNERSHIP_FILE, 'utf8'));
  const actual = captureLocalOwnership(expected.serverPid, sha, env.PORTAL_ACCEPTANCE_LOCAL_AUDIT_TOKEN);
  if (canonical(actual) !== canonical(expected)) throw new Error('Owned local listener changed.');
  return actual;
}
