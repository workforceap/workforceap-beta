# WorkforceAP Design System

Single source of truth for visual design, aligned with `css/main.css` and `tailwind.config.ts` (prefixed utilities: `wa-*`). **Primary actions and CTAs use crimson (`#ad2c4d`), never generic blue.**

---

## Brand Identity

**WorkforceAP** is a workforce development platform: free career training and certifications (Tech, Data, AI, Healthcare, Manufacturing, Skilled Trades) for underserved communities, veterans, and adult learners—starting in Austin.

**Audiences:** Members (job seekers), Employers (hiring companies), Partners (workforce centers, nonprofits, referral orgs).

**Voice & feel:** Serious, civic, empowering. Authoritative but approachable. Evidence-based. Built for people who have been overlooked—not “startup cute,” not “government dull.” Message: *we actually get people hired.*

**Tagline (marketing):** *Empowering People. Advancing Futures.*

---

## Color System

### Primary palette

| Token | Hex | Usage |
|-------|-----|--------|
| Primary / Near-black | `#1a1a1a` | Body text, headings, nav, dark backgrounds |
| Accent / Crimson | `#ad2c4d` | Primary CTAs, links, highlights, focus rings |
| Accent Dark | `#8b1f38` | Hover state for crimson elements |
| Blue | `#2b7bb9` | **Supporting only** — data, info states, secondary links in body copy. **Not** for primary CTAs. |
| Gold | `#a47f38` | Milestone badges, achievement, premium tier |
| Gold Light | `#c49a4a` | Gold hover / lighter states |
| Green | `#4a9b4f` | Success, placement badges, positive outcomes |

### Neutrals (9-step + light)

| Token | Hex |
|-------|-----|
| White | `#ffffff` |
| Gray 50 | `#fafafa` |
| Gray 100 | `#f5f5f5` |
| Gray 200 | `#e8e8e8` |
| Gray 300 | `#d4d4d4` |
| Gray 400 | `#a3a3a3` |
| Gray 500 | `#737373` |
| Gray 600 | `#525252` |
| Gray 700 | `#404040` |
| Gray 800 | `#262626` |
| Light | `#f7f8fa` |

### Semantic mapping

| State | Color |
|-------|--------|
| Success | `#4a9b4f` (Green) |
| Warning | `#a47f38` (Gold) |
| Error | `#ad2c4d` (Crimson) |
| Info | `#2b7bb9` (Blue) |

### Contrast (WCAG 2.1)

Target: **4.5:1** normal text, **3:1** large text (18px+ or 14px+ bold), **3:1** UI components.

| Combination | Approx. contrast | Notes |
|-------------|------------------|--------|
| `#1a1a1a` on `#ffffff` | ~16.1:1 | AAA body |
| `#ffffff` on `#1a1a1a` | ~16.1:1 | AAA (dark hero) |
| `#ffffff` on `#ad2c4d` | ~4.6:1 | AA normal for crimson CTA text |
| `#ad2c4d` on `#ffffff` | ~4.6:1 | AA for links/headings (verify 14px+ if dense) |
| `#ffffff` on `#2b7bb9` | ~4.5:1+ | Info badges (supporting) |
| `#525252` on `#ffffff` | ~7:1 | Muted UI text |

Verify critical pairs with your contrast checker before launch.

---

## Typography

- **Family:** Inter (Google Fonts), weights **400, 500, 600, 700**.
- **Loading:** Use `display=swap`. System stack fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`.

### Scale

| Role | Size | Weight | Line height |
|------|------|--------|-------------|
| H1 | 2.5rem | 700 | 1.2 |
| H2 | 2rem | 600 | 1.2 |
| H3 | 1.5rem | 600 | 1.2 |
| H4 | 1.25rem | 600 | 1.2 |
| Body | 1rem | 400 | 1.6 |
| Small | 0.875rem | 400–600 | 1.5 |

### Marketing vs body

- **Marketing / homepage:** Often `#1a1a1a` on white, or **white text on `#1a1a1a`** (`body.homepage` pattern in `main.css`).
- **Portals:** Prefer high legibility, slightly denser layout (see below).

---

## Spacing System

- **Base unit:** 8px.
- **Scale:** 4, 8, 12, 16, 24, 32, 48, 64, 96px.

**CSS variables** (`:root`): `--space-1` (4px) through `--space-24` (96px)—see `css/main.css`.

---

## Border Radius

| Token | Value | Typical use |
|-------|-------|-------------|
| SM | 4px | Chips, tight inputs |
| MD | 8px | Inputs, small cards |
| LG | 12px | Cards, panels |
| XL | 16px | Modals, heroes |
| Full | 50px | Pill buttons (primary CTA) |

**CSS:** `--radius-sm` … `--radius-full`.

---

## Shadow System

| Name | Value |
|------|--------|
| SM | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` |
| MD | `0 4px 16px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)` |
| LG | `0 10px 40px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.06)` |
| XL | `0 20px 60px rgba(0,0,0,0.14), 0 8px 20px rgba(0,0,0,0.08)` |
| Glow Accent | `0 0 30px rgba(173,44,77,0.2), 0 0 60px rgba(173,44,77,0.08)` |
| Glow Gold | `0 0 30px rgba(164,127,56,0.2), 0 0 60px rgba(164,127,56,0.08)` |

---

## Motion & Animation

| Token | Value |
|-------|--------|
| Fast | `150ms cubic-bezier(0.4, 0, 0.2, 1)` |
| Base | `200ms cubic-bezier(0.4, 0, 0.2, 1)` |
| Slow | `400ms cubic-bezier(0.4, 0, 0.2, 1)` |
| Spring | `0.5s cubic-bezier(0.34, 1.56, 0.64, 1)` |

**Keyframes in product CSS:** fadeInUp, fadeIn, slideInLeft, slideInRight, scaleIn, pulse, shimmer, float, gradientShift (see `main.css`).

**Reduced motion:** When `prefers-reduced-motion: reduce`, set animation duration to `0.01ms` and disable non-essential motion.

**Micro-interactions (reference):** Button press scale `0.97`, card hover lift `translateY(-4px)`, min touch target **48px**.

---

## Accessibility

- **Focus ring:** `0 0 0 2px #ffffff, 0 0 0 4px #ad2c4d` on `button`, `a`, `input`, `select`, `textarea`, `[tabindex]:focus-visible` (see `main.css`).
- **Touch targets:** Minimum **48px** height/width for primary controls.
- **Font smoothing:** `-webkit-font-smoothing: antialiased` on root.
- **Don’t** rely on color alone for state—pair with icon, text, or pattern.

---

## Component Patterns

### Buttons

| Variant | Spec |
|---------|------|
| **Primary CTA** | Background `#ad2c4d`, text `#ffffff`, hover background `#8b1f38`, `border-radius: 50px` (pill), padding `14px 32px`, `font-weight: 600` |
| **Secondary** | Background transparent, border `1.5px solid #1a1a1a`, text `#1a1a1a`, hover background `#1a1a1a` + text `#ffffff` |
| **Ghost / link** | Text `#ad2c4d`, no border, hover underline |
| **Disabled** | `opacity: 0.5`, `cursor: not-allowed` |

**Never** use `#1e40af` or default Tailwind blue for primary actions.

### Cards

| Type | Spec |
|------|------|
| **Standard** | Background `#ffffff`, border `1px solid #e8e8e8`, `border-radius: 12px`, shadow MD on hover, padding `24px` |
| **Dark** | Background `#262626`, text `#ffffff`, no border (or subtle `#404040`) |
| **Stat** | `border-left: 3px solid #ad2c4d`, background `#fafafa` |

### Badges

| Variant | Background | Text |
|---------|------------|------|
| Success | `#4a9b4f` | `#ffffff` |
| Warning | `#a47f38` | `#ffffff` |
| Error | `#ad2c4d` | `#ffffff` |
| Info | `#2b7bb9` | `#ffffff` |
| Neutral | `#e8e8e8` | `#525252` |
| Gold (placement) | `#a47f38` | `#ffffff` |

### Forms

| Element | Spec |
|---------|------|
| **Input** | Border `1px solid #d4d4d4`, `border-radius: 8px`, focus border `#ad2c4d` + shadow `0 0 0 3px rgba(173,44,77,0.15)` |
| **Label** | `font-size: 0.875rem`, `font-weight: 600`, color `#1a1a1a`, `margin-bottom: 6px` |
| **Helper** | `font-size: 0.75rem`, color `#737373` |
| **Error** | `font-size: 0.75rem`, color `#ad2c4d` |

---

## Portal vs Marketing Distinction

| | Marketing (public site) | Portals (authenticated) |
|--|-------------------------|---------------------------|
| **Background** | Often dark (`#1a1a1a`) on hero / homepage | Most surfaces **white** / light gray |
| **CTAs** | Dramatic crimson pills on dark | Crimson primary, but more **functional** density |
| **Density** | Editorial, spacious | Tables, cards, filters—**higher data density** |
| **Borders** | Strong contrast blocks | Muted `#e8e8e8` cards, clear hierarchy |

Same tokens everywhere—**different emphasis**, not different brands.

### Surfaces and dark mode (portal)

- **Warm paper for members, cool canvas for staff.** Member screens (`data-surface="warm"`, and the member `<html>`) sit on `#faf8f6` with a raised fill `#f3efeb` and a `#e9e4df` hairline. Staff, admin and data screens (`data-surface="dense"`) keep `#f7f8fa`, `#f4f4f5` and `#e8e8e8`. Cards are white on both. The canvas is flat: no radial wash. Dark values are the same on both surfaces. Tokens: `css/portal-tokens.css`.
- **In dark mode the accent is for fills, not text.** A lighter crimson reads as pink, so text accents (`--wa-accent`, `--wa-accent-text`) are a dusty rose (`#dd9fb0`, `#e6b3bf`) and solid fills stay crimson (`--wa-accent-fill`, white label). Text links in cards read near-white with an accent underline; the accent appears on fills, the active item and focus rings. Light mode is unchanged.
- **Motion is two small transitions** (the certification path fills in on load; a task row strikes through and its check pops when it is done), both off under reduced motion. See `docs/KIT_GUIDE.md` §7.

---

## Do / Don’t

| Do | Don’t |
|----|--------|
| Crimson `#ad2c4d` primary CTA on dark or white | Blue (`#2563eb`, `#1e40af`, default Tailwind blue) as primary CTA |
| Pill-shaped primary buttons (`border-radius: 50px`) | Square primary buttons for main actions |
| Inter, semibold labels | Mixing many display fonts |
| Crimson + white focus ring pattern | Relying on browser default outline only |
| Gold for achievement / tier | Random accent colors per page |

---

## Tailwind Token Reference

Prefix: **`wa-`** (utilities-only layer in this repo; no Tailwind preflight).

| Class token | Hex |
|-------------|-----|
| `wa-brand-primary` | `#1a1a1a` |
| `wa-brand-accent` | `#ad2c4d` |
| `wa-brand-accent-dark` | `#8b1f38` |
| `wa-brand-blue` | `#2b7bb9` |
| `wa-brand-gold` | `#a47f38` |
| `wa-brand-gold-light` | `#c49a4a` |
| `wa-brand-green` | `#4a9b4f` |

Example: `wa-bg-brand-accent`, `wa-text-brand-primary` (when Tailwind is used).

---

## CSS Variable Reference

Defined on `:root` in `css/main.css`:

| Variable | Role |
|----------|------|
| `--color-primary` | Near-black |
| `--color-accent` | Crimson |
| `--color-accent-dark` | Crimson hover |
| `--color-blue` | Supporting blue |
| `--color-green`, `--color-gold`, `--color-gold-light` | Semantic accents |
| `--color-gray-*`, `--color-white`, `--color-light` | Neutrals |
| `--font-family` | Inter stack |
| `--font-size-h1` … `--font-size-sm` | Type scale |
| `--radius-sm` … `--radius-full` | Radii |
| `--shadow-sm` … `--shadow-xl`, `--shadow-glow-accent`, `--shadow-glow-gold` | Shadows |
| `--transition-*` | Motion |
| `--space-*` | Spacing |

Org-specific accent override (when set in DB) still maps to crimson family in defaults—see `OrgBrandingStyle` / `defaultOrgTheme`.

---

## Material You Surface Tokens (Portal UI)

The portal UI uses Material You-style surface tokens defined in `css/main.css`. These are used alongside the WorkforceAP brand tokens above. Values shown are the **light mode** defaults; dark mode overrides are defined in the same file.

| Variable | Light value | Role |
|----------|-------------|------|
| `--surface-container-lowest` | `#ffffff` | Lowest container surface — pure white, used for card backgrounds and course rows |
| `--surface-container-low` | `#f7f8fa` | Slightly off-white surface for sidebar and subtle fills |
| `--surface-container` | `#f0f1f3` | Default container surface for bento cards and input backgrounds |
| `--surface-container-high` | `#e8e9eb` | Higher contrast container surface |
| `--surface-container-highest` | `#e0e1e3` | Highest contrast container surface — dividers, strong fills |
| `--color-on-surface` | `#1c1b1b` | Primary text and icon color on all surfaces |
| `--color-on-surface-variant` | `#584144` | Muted/secondary text and icons — warm rose-mauve inherited from accent palette |
| `--outline-variant` | `#debfc2` | Subtle pinkish-rose border and divider color |

---

## Related Files

- `css/main.css` — implementation
- `tailwind.config.ts` — `wa-brand-*` tokens
- `lib/platform/brandColors.ts` — default accent constants for TS
- `brand-guide.html` — visual reference (open in browser)
- `cursor-brand-guidelines.md` — original brief
