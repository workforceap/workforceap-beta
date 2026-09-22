/**
 * First-paint theme bootstrap. `nonce` is the per-request CSP nonce from the
 * root layout (`x-nonce`, minted in middleware, WAP-36); undefined outside a
 * document request, in which case React omits the attribute.
 *
 * `suppressHydrationWarning`: once a header-delivered CSP is present (the
 * WAP-36 Report-Only policy), browsers blank the `nonce` content attribute
 * ("nonce hiding"), so React dev would diff `nonce="…"` against `""` and log
 * a hydration mismatch on every page (scout 2026-09-22 D17). Nothing else on
 * this element can diverge, so the check is skipped for it.
 */
export default function ThemeInitScript({ nonce }: { nonce?: string } = {}) {
  return (
    <script
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var KEY='wap-theme';var theme=localStorage.getItem(KEY);var systemDark=window.matchMedia('(prefers-color-scheme: dark)').matches;if(theme==='dark'){document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-theme','dark');}else if(theme==='light'){document.documentElement.classList.remove('dark');document.documentElement.setAttribute('data-theme','light');}else{if(systemDark){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}document.documentElement.removeAttribute('data-theme');}}catch(e){}})();`,
      }}
    />
  );
}
