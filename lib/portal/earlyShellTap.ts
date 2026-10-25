/**
 * Capture-and-replay for taps that land before React hydrates.
 *
 * The portal shell is server-rendered, so its phone menu button and the member
 * "More pages" button are visible and look enabled a second or more before
 * their React handlers attach (several seconds on a mid-range phone). A tap in
 * that window used to be dropped without any feedback. A tiny inline script,
 * emitted by the root layout in <head> with the CSP nonce (see
 * `EarlyShellTapScript`), records such taps in a capture-phase click listener.
 * Each owner calls `claimEarlyTap(kind)` once it has mounted and opens itself.
 *
 * Replays are "open" requests, never toggles, so a tap that React also handled
 * (it landed between the hydration commit and the passive effects) cannot
 * undo itself.
 */

/** Attribute that marks a control whose pre-hydration taps are replayed. */
export const EARLY_TAP_ATTR = 'data-early-tap';
/** `window` property that carries the recorded taps. */
export const EARLY_TAP_GLOBAL = '__wapEarlyTap';

export type EarlyTapKind = 'menu' | 'more';

type EarlyTapState = {
  /** Kinds whose owner has mounted; their taps are real React clicks from now on. */
  ready: Partial<Record<EarlyTapKind, true>>;
  /** Kinds tapped before their owner mounted. */
  taps: Partial<Record<EarlyTapKind, true>>;
};

/**
 * The inline script. ES5 on purpose: it runs before any bundle, on every
 * document, and must never throw. It is idempotent (a second copy is a no-op).
 */
export const EARLY_TAP_SCRIPT =
  `(function(){try{var w=window,G='${EARLY_TAP_GLOBAL}';if(w[G])return;` +
  `var s=w[G]={ready:{},taps:{}};` +
  `document.addEventListener('click',function(e){try{var t=e.target;` +
  `var el=t&&t.closest?t.closest('[${EARLY_TAP_ATTR}]'):null;if(!el)return;` +
  `var k=el.getAttribute('${EARLY_TAP_ATTR}');if(k&&!s.ready[k])s.taps[k]=true;}catch(_e){}},true);}catch(_e){}})();`;

function state(): EarlyTapState | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as Record<string, EarlyTapState | undefined>)[EARLY_TAP_GLOBAL]) ?? null;
}

/**
 * Call from the owner's mount effect. Returns true when the control was tapped
 * before the owner mounted (replay: open it). Either way the owner is marked
 * ready, so later taps are left to React and nothing is replayed twice.
 */
export function claimEarlyTap(kind: EarlyTapKind): boolean {
  const s = state();
  if (!s) return false;
  const pending = s.taps[kind] === true;
  s.ready[kind] = true;
  delete s.taps[kind];
  return pending;
}
