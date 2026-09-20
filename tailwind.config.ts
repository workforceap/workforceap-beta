import type { Config } from 'tailwindcss';

/**
 * Tailwind JIT only expands `@tailwind utilities` in css/main.css: unused prefixed
 * classes are stripped from the emitted CSS. The tens of KB of `.wa-*` rules in
 * the production bundle exclude unused palettes (verified via build output).
 *
 * Plain CSS selectors in css/main.css (everything above `@tailwind utilities`)
 * intentionally ship intact — Next.js does not tree‑shake stylesheet rules —
 * alongside marketing.css from app/layout.tsx. Portal/dashboard-only plain CSS
 * lives in css/portal-main-extracted.css and css/portal-ui-kit.css (portal.css).
 */
const config: Config = {
  darkMode: 'class',
  prefix: 'wa-',
  // Preflight is intentionally disabled.
  //
  // Rationale: This app uses css/main.css as its primary design system with
  // custom CSS variables, component classes, and form resets. Tailwind is only
  // used for utility classes via the `wa-` prefix (see prefix above). Enabling
  // preflight would reset browser defaults globally and conflict with our custom
  // base styles (e.g. form element resets in main.css, custom button/input
  // baseline). All necessary base resets are handled in css/main.css.
  corePlugins: {
    preflight: false,
  },
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Type floor (WAP-122): Tailwind's default `text-xs` is 12px. Every
      // `wa-text-xs` on member/public/staff surfaces now resolves to the 13px
      // floor (docs/KIT_GUIDE.md §1). Literal sizes below the floor are
      // rejected by scripts/lint/check-type-floor.mjs.
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],
      },
      colors: {
        // Prefixed classes: wa-brand-* — keep in sync with DESIGN.md + css/main.css
        brand: {
          primary: '#1a1a1a',
          accent: '#ad2c4d',
          'accent-dark': '#8c0f37',
          'accent-light': '#ffb2bc',
          blue: '#2b7bb9',
          gold: '#a47f38',
          'gold-light': '#c79a45',
          green: '#4a9b4f',
        },
        // Stitch surface-container tonal scale
        surface: {
          DEFAULT: '#121416',
          'container-lowest': '#0c0e10',
          'container-low': '#1a1c1e',
          container: '#1e2022',
          'container-high': '#282a2c',
          'container-highest': '#333537',
          dim: '#121416',
          bright: '#383a3c',
        },
        'on-surface': {
          DEFAULT: '#e2e2e5',
          variant: '#debfc2',
        },
        'outline-variant': '#584144',
      },
      backdropBlur: {
        glass: '12px',
        'glass-xl': '20px',
      },
    },
  },
  plugins: [],
};

export default config;
