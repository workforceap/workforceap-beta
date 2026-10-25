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
        __html: `(function(){try{var KEY='wap-theme';var media=window.matchMedia('(prefers-color-scheme: dark)');var read=function(){try{var value=localStorage.getItem(KEY);return value==='light'||value==='dark'?value:'system';}catch(_e){return 'system';}};var apply=function(theme){var root=document.documentElement;if(theme==='dark'){root.classList.add('dark');root.setAttribute('data-theme','dark');}else if(theme==='light'){root.classList.remove('dark');root.setAttribute('data-theme','light');}else{if(media.matches){root.classList.add('dark');}else{root.classList.remove('dark');}root.removeAttribute('data-theme');}};var sync=function(){apply(read());};sync();media.addEventListener('change',function(){if(read()==='system')sync();});window.addEventListener('storage',function(event){if(event.key===KEY)sync();});}catch(e){}})();`,
      }}
    />
  );
}
