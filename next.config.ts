import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same POSTGRES_* defaults as scripts/prisma-env.js so `next build` can run Prisma without errors
const require = createRequire(import.meta.url);
require('./scripts/ensure-prisma-env.cjs');

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'react-markdown', 'remark-gfm', '@elevenlabs/client'],
    /** Lightning CSS pipeline for smaller critical/global CSS chunks. */
    optimizeCss: true,
  },
  // Locale routing is handled in middleware + `lib/i18n` (App Router does not use next.config i18n).
  // When a lockfile exists outside this repo (e.g. user home), Next may pick the wrong root — breaks tracing + route collection.
  outputFileTracingRoot: path.join(__dirname),
  // The member-agent gateway validates the governed manifest and its exact
  // evidence sources at runtime. Include those non-imported files in the
  // serverless route trace so a Vercel bundle cannot silently degrade to an
  // unavailable/stale knowledge response.
  outputFileTracingIncludes: {
    // The PDF parser is resolved at runtime inside a worker thread (webpack
    // rewrites require.resolve into a numeric module id, so the path cannot be
    // computed at module scope). That hides the dependency from the file
    // tracer, which would ship a lambda where every PDF fails to parse — so
    // include it explicitly for the routes that read resume text.
    '/api/**': [
      './node_modules/pdfjs-dist/package.json',
      './node_modules/pdfjs-dist/legacy/build/pdf.mjs',
      // Even in Node, pdf.mjs dynamically imports this sibling to parse PDFs.
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    ],
    '/api/agent-tools/v1/*': [
      './config/agent-knowledge/manifest.v1.json',
      './shared/programSyllabi.ts',
      './lib/content/programCurriculumManifest.ts',
      './docs/coursera/approved-curriculum-api-validation-2026-08-30.md',
    ],
  },
  poweredByHeader: false,
  serverExternalPackages: ['pdfjs-dist'],
  // Build-time ESLint is now a required gate (burned down 2026-05-20 — see
  // PLAN-2026-Q3 §7 / AGENTS.md). The known lint errors (bare <table>s + 1
  // missing alt) have been fixed or moved under the documented legacy
  // ignores in eslint.config.mjs. Vercel builds will fail on new ESLint
  // errors going forward.
  eslint: { ignoreDuringBuilds: false },
  async headers() {
    return [
      {
        source: '/.well-known/traffic-advice',
        headers: [
          { key: 'Content-Type', value: 'application/trafficadvice+json' },
          { key: 'Cache-Control', value: 'public, max-age=1800' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // camera=(self) so mock-interview / practice video can use getUserMedia; mic already (self)
          // Explicitly disable the newer policy-controlled features so the
          // bare absence of a directive doesn't silently grant them.
          {
            key: 'Permissions-Policy',
            value:
              'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=(), browsing-topics=()',
          },
          {
            key: 'Content-Security-Policy',
            // Hardening notes (see docs/SECURITY-AND-HEALTH.md for the full posture):
            //   - `'unsafe-inline'` and `'unsafe-eval'` remain on `script-src` and
            //     `style-src` because Next.js App Router, GTM bootstrap, and Vercel
            //     Insights still emit inline beacons. Removing them requires a
            //     nonce migration (mid-effort) — tracked in security backlog.
            //   - `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`
            //     are safe-to-add hardening that doesn't require nonces. They
            //     close real classes of clickjacking + plugin-injection attacks.
            //   - `frame-ancestors 'none'` supersedes `X-Frame-Options: DENY` in
            //     modern browsers; we keep both for older clients.
            //   - `upgrade-insecure-requests` forces any accidental http://
            //     references in user-generated content to https on supporting
            //     browsers.
            //   - `img-src` is an explicit allowlist (was `https:` wildcard).
            //     Add new hosts here as needed instead of widening back to `https:`.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.googletagmanager.com https://va.vercel-insights.com https://va.vercel-scripts.com https://challenges.cloudflare.com",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.zippopotam.us https://www.google-analytics.com https://www.googletagmanager.com https://www.google.com https://va.vercel-insights.com https://vitals.vercel-insights.com https://challenges.cloudflare.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://api.elevenlabs.io wss://api.elevenlabs.io https://livekit.rtc.elevenlabs.io wss://livekit.rtc.elevenlabs.io wss://*.livekit.cloud wss://*.elevenlabs.io https://*.elevenlabs.io",
              "img-src 'self' data: blob: https://*.supabase.co https://*.public.blob.vercel-storage.com https://images.unsplash.com https://www.google-analytics.com https://www.googletagmanager.com https://api.dicebear.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-src 'self' https://www.googletagmanager.com https://challenges.cloudflare.com",
              "form-action 'self' https://formspree.io",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
      // Authenticated HTML routes should never be cached by browsers or
      // intermediate caches. Without this, hitting back-button after sign-
      // out (or shared CDN edge in front of Vercel) can surface a previous
      // user's portal HTML. Mirrors the SW exclusion list in public/sw.js.
      {
        source: '/:path(dashboard|admin|employer|counselor|partner|applications|account|profile|certifications|resources|help)(.*)',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
      // Authenticated API surface — same reason. Public routes (health,
      // referral-sources, public/*) set their own Cache-Control inline.
      {
        source: '/api/:path(auth|admin|portal|member|counselor|employer|partner|gdpr|ai)(.*)',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/dashboard/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=31536000' },
        ],
      },
    ];
  },
  images: {
    /** Omit 2048/3840 — largest `next/image` `src`/srcSet fallback matches this list; avoids oversized LCP payloads. */
    deviceSizes: [384, 640, 750, 828, 1080, 1200, 1920],
    formats: ['image/avif', 'image/webp'],
    // Allow Next.js's default q=75 in addition to the explicit q=85 used on
    // hero images. Restricting to [85] alone caused every <Image> without an
    // explicit quality prop to be rejected by the optimizer, producing blank
    // cards on /blog, /programs, /find-your-path, etc.
    qualities: [75, 85],
    localPatterns: [
      {
        pathname: '/images/**',
        search: '',
      },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/images/logo-tight.svg' }];
  },
  async redirects() {
    return [
      // This old public sign-up URL lives beneath the authenticated /partner
      // route tree. Redirect before middleware and the partner layout can send
      // a signed-in visitor through login or back to the portal home.
      { source: '/partner/signup', destination: '/partners#partner-signup', permanent: false },
      { source: '/:locale(en|es|fr|pt)/partner/signup', destination: '/:locale/partners#partner-signup', permanent: false },
      // Legacy blog slug redirects — destinations must be live Astro posts under
      // marketing/src/pages/blog (or /blog). Prior targets (our-mission,
      // new-member-guide, career-change-guide, it-certifications-guide,
      // remote-work-guide) 404'd in production after the catalog was rewritten.
      { source: '/blog/why-we-started-workforceap', destination: '/blog/michael-brown-workforce-leader-austin', permanent: true },
      { source: '/blog/our-mission', destination: '/blog/michael-brown-workforce-leader-austin', permanent: true },
      { source: '/blog/getting-started-guide', destination: '/blog', permanent: true },
      { source: '/blog/new-member-guide', destination: '/blog', permanent: true },
      { source: '/blog/career-change-2024', destination: '/blog/breaking-into-tech-starting-over', permanent: true },
      { source: '/blog/career-change-guide', destination: '/blog/breaking-into-tech-starting-over', permanent: true },
      { source: '/blog/it-certifications-explained', destination: '/blog/5-certifications-under-6-months', permanent: true },
      { source: '/blog/it-certifications-guide', destination: '/blog/5-certifications-under-6-months', permanent: true },
      { source: '/blog/why-comptia-certifications-matter', destination: '/blog/5-certifications-under-6-months', permanent: true },
      { source: '/:locale(en|es|fr|pt)/blog/why-comptia-certifications-matter', destination: '/:locale/blog/5-certifications-under-6-months', permanent: true },
      { source: '/blog/remote-work-tips', destination: '/blog', permanent: true },
      { source: '/blog/remote-work-guide', destination: '/blog', permanent: true },

      // Public /jobs board was moved into the member portal (#298). Keep old
      // URLs working by sending guests through the auth gate to /dashboard/jobs.
      { source: '/jobs', destination: '/dashboard/jobs', permanent: false },
      { source: '/jobs/', destination: '/dashboard/jobs', permanent: false },
      { source: '/jobs/:id', destination: '/dashboard/jobs/:id', permanent: false },
      {
        source: '/:locale(en|es|fr|pt)/jobs',
        destination: '/dashboard/jobs',
        permanent: false,
      },
      {
        source: '/:locale(en|es|fr|pt)/jobs/',
        destination: '/dashboard/jobs',
        permanent: false,
      },
      {
        source: '/:locale(en|es|fr|pt)/jobs/:id',
        destination: '/dashboard/jobs/:id',
        permanent: false,
      },

      // Short program alias still linked from older materials
      // Matches the existing provider/curriculum canonicalization in programSlug.ts.
      { source: '/programs/ai-professional-developer-certificate-ibm', destination: '/programs/ai-practitioner-professional-certificate-aws', permanent: true },
      { source: '/:locale(en|es|fr|pt)/programs/ai-professional-developer-certificate-ibm', destination: '/:locale/programs/ai-practitioner-professional-certificate-aws', permanent: true },
      {
        source: '/programs/cybersecurity',
        destination: '/programs/cybersecurity-professional-certificate-google',
        permanent: true,
      },
      {
        source: '/:locale(en|es|fr|pt)/programs/cybersecurity',
        destination: '/:locale/programs/cybersecurity-professional-certificate-google',
        permanent: true,
      },

      // Legacy .html redirects
      { source: '/index.html', destination: '/', permanent: true },

      // Legacy fund entry points → live donate page.
      { source: '/fund', destination: '/donate', permanent: true },
      { source: '/fund/', destination: '/donate', permanent: true },
      {
        source: '/:locale(en|es|fr|pt)/fund',
        destination: '/:locale/donate',
        permanent: true,
      },
      {
        source: '/:locale(en|es|fr|pt)/fund/',
        destination: '/:locale/donate',
        permanent: true,
      },

      // Public /outcomes temporarily hidden — page archived at
      // marketing/src/_archive/outcomes.astro. Re-enable by restoring that
      // file to marketing/src/pages/outcomes.astro and removing these entries
      // (+ Astro redirects in marketing/astro.config.mjs).
      { source: '/outcomes', destination: '/', permanent: false },
      { source: '/outcomes/', destination: '/', permanent: false },
      {
        source: '/:locale(en|es|fr|pt)/outcomes',
        destination: '/:locale',
        permanent: false,
      },
      {
        source: '/:locale(en|es|fr|pt)/outcomes/',
        destination: '/:locale',
        permanent: false,
      },

      // Public marketing route aliases restored after responsive merge
      // (/about now served by the Astro marketing site at root — no locale redirect)
      { source: '/services', destination: '/what-we-do', permanent: true },
      { source: '/services/', destination: '/what-we-do', permanent: true },
      { source: '/confirmation', destination: '/apply/confirmation', permanent: false },
      { source: '/confirmation/', destination: '/apply/confirmation', permanent: false },
      { source: '/apply.html', destination: '/apply', permanent: true },
      { source: '/programs.html', destination: '/programs', permanent: true },
      { source: '/what-we-do.html', destination: '/what-we-do', permanent: true },
      { source: '/how-it-works.html', destination: '/how-it-works', permanent: true },
      { source: '/faq.html', destination: '/faq', permanent: true },
      { source: '/contact.html', destination: '/contact', permanent: true },
      { source: '/leadership.html', destination: '/leadership', permanent: true },
      { source: '/salary-guide.html', destination: '/salary-guide', permanent: true },
      { source: '/program-comparison.html', destination: '/program-comparison', permanent: true },


      // Programs quiz redirect (fix for broken internal link)
      { source: '/programs/quiz', destination: '/career-quiz', permanent: true },
      { source: '/:locale(en|es|fr|pt)/programs/quiz', destination: '/:locale/career-quiz', permanent: true },

      // Short LP aliases for paid ad URLs
      { source: '/lp/google-it', destination: '/lp/google-it-automation', permanent: false },

      // CompTIA slug redirects: slugify() drops '+' from program names.
      // 301s ensure any links with "plus" in the URL still resolve correctly.
      { source: '/programs/comptia-a-plus-professional-certificate', destination: '/programs/comptia-a-professional-certificate', permanent: true },
      { source: '/programs/comptia-network-plus-professional-certificate', destination: '/programs/comptia-network-professional-certificate', permanent: true },
      { source: '/programs/comptia-security-plus-professional-certificate', destination: '/programs/comptia-security-professional-certificate', permanent: true },

      // Short-form alternates that may appear in external links or social shares
      { source: '/programs/comptia-aplus', destination: '/programs/comptia-a-professional-certificate', permanent: true },
      { source: '/programs/comptia-network-plus', destination: '/programs/comptia-network-professional-certificate', permanent: true },
      { source: '/programs/comptia-security-plus', destination: '/programs/comptia-security-professional-certificate', permanent: true },

      // Short portal entry → sign-in + destination chooser (avoids 404 on shared links)
      { source: '/portal', destination: '/login', permanent: false },
      { source: '/portal/', destination: '/login', permanent: false },

      // Sign-in aliases (avoids 404 for users typing /signin or /sign-in)
      { source: '/signin', destination: '/login', permanent: true },
      { source: '/signin/:path*', destination: '/login', permanent: true },
      { source: '/sign-in', destination: '/login', permanent: true },
      { source: '/sign-in/:path*', destination: '/login', permanent: true },

      // Supabase default sign-in path → actual login page (avoids 404 on magic-link redirects)
      { source: '/auth/sign-in', destination: '/login', permanent: false },
      { source: '/auth/sign-in/:path*', destination: '/login', permanent: false },

      // /auth/login → localized login (avoids 404 on external links / emails / SEO)
      { source: '/auth/login', destination: '/en/login', permanent: true },
      { source: '/auth/login/:path*', destination: '/en/login', permanent: true },

      // Subgroup "my group" portal removed — send to member dashboard
      { source: '/my-group', destination: '/dashboard', permanent: false },
      { source: '/my-group/:path*', destination: '/dashboard', permanent: false },

      // Employer dashboard canonical redirect
      { source: '/employer/dashboard', destination: '/employer', permanent: true },

      // Admin WIOA queue — short / legacy URLs
      { source: '/admin/wioa', destination: '/admin/wioa-screening', permanent: false },
      { source: '/admin/wioa/', destination: '/admin/wioa-screening', permanent: false },

      // Member workspace canonical URLs (legacy paths → /dashboard/*)
      { source: '/resources', destination: '/dashboard/career-library', permanent: false },
      { source: '/resources/', destination: '/dashboard/career-library', permanent: false },
      { source: '/help', destination: '/dashboard/help', permanent: false },
      { source: '/help/', destination: '/dashboard/help', permanent: false },
      { source: '/account', destination: '/dashboard/account', permanent: false },
      { source: '/account/', destination: '/dashboard/account', permanent: false },

      // Member portal: AI Tools, Career Brief, Learning, Weekly Recap live under /dashboard/*
      { source: '/ai-tools', destination: '/dashboard/ai-tools', permanent: true },
      { source: '/ai-tools/:path*', destination: '/dashboard/ai-tools/:path*', permanent: true },
      { source: '/career-brief', destination: '/dashboard/career-brief', permanent: true },
      { source: '/career-brief/:path*', destination: '/dashboard/career-brief/:path*', permanent: true },
      { source: '/learning', destination: '/dashboard/learning', permanent: true },
      { source: '/weekly-recap', destination: '/dashboard/weekly-recap', permanent: true },

      // Member portal legacy route fixes (QA-ISSUE-001)
      { source: '/portal/dashboard', destination: '/dashboard', permanent: true },
      { source: '/portal/training', destination: '/dashboard/program', permanent: true },
      { source: '/dashboard/apply', destination: '/apply', permanent: true },
      { source: '/training', destination: '/dashboard/program', permanent: true },
      { source: '/dashboard/plan', destination: '/dashboard/career-brief', permanent: true },
      { source: '/dashboard/weekly-focus', destination: '/dashboard/weekly-recap', permanent: true },
    ];
  },
};

// AUDIT-2026-05-16 §H-CI6: enable source-map upload + release tagging so
// production stack traces in Sentry are unminified and grouped by deploy.
// All upload-side config is only honored when SENTRY_AUTH_TOKEN is set
// (typically only on Vercel prod). Local builds remain unchanged.
const sentryBuildOptions = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Tag every release with the Vercel commit SHA so issues group by deploy.
  // Falls back to the npm version when running outside Vercel.
  release: {
    name:
      process.env.SENTRY_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.npm_package_version,
    create: true,
  },
  // Upload source maps for client-side chunks so the React component
  // stack and other client errors aren't reported as minified gibberish.
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
} as const;

export default withBundleAnalyzer(
  withSentryConfig(withNextIntl(nextConfig), sentryBuildOptions),
);
