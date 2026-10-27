/** Suppress only the checked-in analytics bootstrap; no external request is sent. */
export function isLocalFixtureGtmBootstrap(method, url) {
  try {
    const target = new URL(url);
    return method === 'GET' && target.origin === 'https://www.googletagmanager.com' && target.pathname === '/gtm.js' && !target.hash && !target.username && !target.password &&
      target.searchParams.get('id') === 'GTM-53JCT6WN' && [...target.searchParams.keys()].every(key => key === 'id') && [...target.searchParams].length === 1;
  } catch { return false; }
}

/** Close the local development HMR connection without opening its server side. */
export function isLocalFixtureHmrSocket(url) {
  try { const target = new URL(url); return target.origin === 'ws://127.0.0.1:3107' && target.pathname === '/_next/webpack-hmr' && !target.username && !target.password && !target.hash; }
  catch { return false; }
}
