'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';

interface ApiRoute {
  route: string;
  methods: string[];
  auth: string;
  description: string;
  category: string;
}

interface ApiCategory {
  name: string;
  count: number;
  routes: ApiRoute[];
}

interface ApiDocsData {
  categories: ApiCategory[];
  totalRoutes: number;
  generatedAt: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'wa-bg-brand-blue wa-text-white',
  POST: 'wa-bg-brand-green wa-text-white',
  PATCH: 'wa-bg-brand-gold wa-text-brand-primary',
  PUT: 'wa-bg-brand-gold-light wa-text-brand-primary',
  DELETE: 'wa-bg-brand-accent wa-text-white',
  OPTIONS: 'wa-bg-surface-container-high wa-text-on-surface',
};

const AUTH_COLORS: Record<string, string> = {
  public: 'wa-bg-surface-container-high wa-text-on-surface-variant',
  member: 'wa-bg-brand-blue/20 wa-text-brand-blue',
  admin: 'wa-bg-brand-gold/20 wa-text-brand-gold',
  counselor: 'wa-bg-brand-green/20 wa-text-brand-green',
  employer: 'wa-bg-brand-accent-light/30 wa-text-brand-accent',
  partner: 'wa-bg-brand-blue/20 wa-text-brand-blue',
  super_admin: 'wa-bg-brand-accent/20 wa-text-brand-accent',
  webhook: 'wa-bg-surface-container-high wa-text-on-surface-variant',
  cron: 'wa-bg-surface-container-high wa-text-on-surface-variant',
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`wa-inline-flex wa-items-center wa-justify-center wa-px-2 wa-py-0.5 wa-rounded wa-text-xs wa-font-bold ${
        METHOD_COLORS[method] || 'wa-bg-surface-container-high wa-text-on-surface'
      }`}
    >
      {method}
    </span>
  );
}

function AuthBadge({ auth }: { auth: string }) {
  return (
    <span
      className={`wa-inline-flex wa-items-center wa-justify-center wa-px-2 wa-py-0.5 wa-rounded wa-text-xs wa-font-semibold ${
        AUTH_COLORS[auth] || 'wa-bg-surface-container-high wa-text-on-surface-variant'
      }`}
    >
      {auth}
    </span>
  );
}

function RouteCard({ route, isActive }: { route: ApiRoute; isActive: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(route.route).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [route.route]);

  return (
    <div
      id={`route-${encodeURIComponent(route.route)}`}
      className={`wa-rounded-lg wa-border wa-transition-colors wa-duration-200 ${
        isActive
          ? 'wa-border-brand-accent wa-bg-surface-container-low'
          : 'wa-border-surface-container-high wa-bg-surface-container-lowest'
      }`}
    >
      <div className="wa-p-4">
        <div className="wa-flex wa-flex-wrap wa-items-center wa-gap-2 wa-mb-2">
          {route.methods.map((m) => (
            <MethodBadge key={m} method={m} />
          ))}
          <AuthBadge auth={route.auth} />
          <button
            onClick={handleCopy}
            className="wa-ml-auto wa-text-xs wa-text-on-surface-variant hover:wa-text-on-surface wa-transition-colors"
            aria-label="Copy route path"
            title="Copy route path"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <code className="wa-block wa-text-sm wa-font-mono wa-text-on-surface wa-break-all wa-mb-2">
          {route.route}
        </code>

        {route.description && (
          <p className="wa-text-sm wa-text-on-surface-variant wa-leading-relaxed">
            {route.description}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ApiDocsClient({ data }: { data: ApiDocsData }) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedAuth, setSelectedAuth] = useState<string>('All');
  const [selectedMethod, setSelectedMethod] = useState<string>('All');
  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});

  const allAuths = useMemo(() => {
    const set = new Set<string>();
    data.categories.forEach((c) => c.routes.forEach((r) => set.add(r.auth)));
    return ['All', ...Array.from(set).sort()];
  }, [data.categories]);

  const allMethods = useMemo(() => {
    const set = new Set<string>();
    data.categories.forEach((c) => c.routes.forEach((r) => r.methods.forEach((m) => set.add(m))));
    return ['All', ...Array.from(set).sort()];
  }, [data.categories]);

  const filteredCategories = useMemo(() => {
    const term = search.toLowerCase().trim();
    return data.categories
      .map((cat) => ({
        ...cat,
        routes: cat.routes.filter((r) => {
          const matchesSearch =
            !term ||
            r.route.toLowerCase().includes(term) ||
            r.description.toLowerCase().includes(term) ||
            r.category.toLowerCase().includes(term);
          const matchesCategory = selectedCategory === 'All' || r.category === selectedCategory;
          const matchesAuth = selectedAuth === 'All' || r.auth === selectedAuth;
          const matchesMethod = selectedMethod === 'All' || r.methods.includes(selectedMethod);
          return matchesSearch && matchesCategory && matchesAuth && matchesMethod;
        }),
      }))
      .filter((cat) => cat.routes.length > 0);
  }, [data.categories, search, selectedCategory, selectedAuth, selectedMethod]);

  const totalFiltered = useMemo(
    () => filteredCategories.reduce((sum, c) => sum + c.routes.length, 0),
    [filteredCategories]
  );

  const scrollToCategory = useCallback((name: string) => {
    const el = categoryRefs.current[name];
    if (el) {
      el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
  }, []);

  return (
    <div className="wa-min-h-screen wa-bg-surface wa-text-on-surface">
      {/* Header */}
      <header className="wa-sticky wa-top-0 wa-z-30 wa-backdrop-blur-glass wa-bg-surface/80 wa-border-b wa-border-surface-container-high">
        <div className="wa-max-w-7xl wa-mx-auto wa-px-4 wa-py-4">
          <div className="wa-flex wa-flex-col md:wa-flex-row wa-gap-4 wa-items-start md:wa-items-center">
            <div className="wa-flex-1">
              <h1 className="wa-text-2xl wa-font-bold wa-text-on-surface">API Reference</h1>
              <p className="wa-text-sm wa-text-on-surface-variant wa-mt-1">
                {totalFiltered} of {data.totalRoutes} routes documented
                {data.generatedAt ? ` · Updated ${new Date(data.generatedAt).toLocaleDateString()}` : ''}
              </p>
            </div>
            <div className="wa-flex wa-flex-wrap wa-gap-2 wa-w-full md:wa-w-auto">
              <a
                href="/api/admin/api-docs/openapi"
                target="_blank"
                rel="noopener noreferrer"
                className="wa-inline-flex wa-items-center wa-px-3 wa-py-2 wa-rounded-md wa-text-sm wa-font-semibold wa-bg-surface-container wa-text-on-surface hover:wa-bg-surface-container-high wa-transition-colors wa-border wa-border-surface-container-high"
              >
                OpenAPI JSON
              </a>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="wa-flex wa-flex-col md:wa-flex-row wa-gap-3 wa-mt-4">
            <input
              type="text"
              placeholder="Search routes, descriptions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="wa-flex-1 wa-min-h-[44px] wa-px-4 wa-py-2 wa-rounded-md wa-bg-surface-container wa-text-on-surface wa-placeholder-on-surface-variant wa-border wa-border-surface-container-high focus:wa-border-brand-accent focus:wa-outline-none wa-transition-colors"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="wa-min-h-[44px] wa-px-3 wa-py-2 wa-rounded-md wa-bg-surface-container wa-text-on-surface wa-border wa-border-surface-container-high focus:wa-border-brand-accent focus:wa-outline-none"
            >
              <option value="All">All categories</option>
              {data.categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
            <select
              value={selectedAuth}
              onChange={(e) => setSelectedAuth(e.target.value)}
              className="wa-min-h-[44px] wa-px-3 wa-py-2 wa-rounded-md wa-bg-surface-container wa-text-on-surface wa-border wa-border-surface-container-high focus:wa-border-brand-accent focus:wa-outline-none"
            >
              {allAuths.map((a) => (
                <option key={a} value={a}>
                  {a === 'All' ? 'All auth levels' : a}
                </option>
              ))}
            </select>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="wa-min-h-[44px] wa-px-3 wa-py-2 wa-rounded-md wa-bg-surface-container wa-text-on-surface wa-border wa-border-surface-container-high focus:wa-border-brand-accent focus:wa-outline-none"
            >
              {allMethods.map((m) => (
                <option key={m} value={m}>
                  {m === 'All' ? 'All methods' : m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="wa-max-w-7xl wa-mx-auto wa-px-4 wa-py-6 wa-flex wa-gap-6">
        {/* Sidebar */}
        <aside className="wa-hidden lg:wa-block wa-w-64 wa-flex-shrink-0">
          <div className="wa-sticky wa-top-28 wa-max-h-[calc(100vh-8rem)] wa-overflow-y-auto wa-pr-2">
            <h2 className="wa-text-xs wa-font-bold wa-uppercase wa-tracking-wider wa-text-on-surface-variant wa-mb-3">
              Categories
            </h2>
            <nav className="wa-space-y-1">
              {data.categories.map((cat) => {
                const isActive = selectedCategory === cat.name;
                const hasMatches =
                  selectedCategory === 'All' || isActive
                    ? filteredCategories.some((fc) => fc.name === cat.name)
                    : false;
                if (selectedCategory !== 'All' && !isActive && !hasMatches) return null;
                const filteredCount =
                  filteredCategories.find((fc) => fc.name === cat.name)?.routes.length ?? 0;
                const showCount = search || selectedAuth !== 'All' || selectedMethod !== 'All';

                return (
                  <button
                    key={cat.name}
                    onClick={() => {
                      if (isActive) {
                        setSelectedCategory('All');
                      } else {
                        setSelectedCategory(cat.name);
                        scrollToCategory(cat.name);
                      }
                    }}
                    className={`wa-w-full wa-text-left wa-px-3 wa-py-2 wa-rounded-md wa-text-sm wa-transition-colors ${
                      isActive
                        ? 'wa-bg-brand-accent wa-text-white'
                        : 'wa-text-on-surface hover:wa-bg-surface-container'
                    }`}
                  >
                    <span className="wa-flex wa-justify-between wa-items-center">
                      <span>{cat.name}</span>
                      <span
                        className={`wa-text-xs wa-tabular-nums ${
                          isActive ? 'wa-text-white/80' : 'wa-text-on-surface-variant'
                        }`}
                      >
                        {showCount ? `${filteredCount}/${cat.count}` : cat.count}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="wa-flex-1 wa-min-w-0">
          {filteredCategories.length === 0 ? (
            <div className="wa-text-center wa-py-20">
              <p className="wa-text-on-surface-variant wa-text-lg">No routes match your filters.</p>
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('All');
                  setSelectedAuth('All');
                  setSelectedMethod('All');
                }}
                className="wa-mt-4 wa-inline-flex wa-items-center wa-px-4 wa-py-2 wa-rounded-md wa-bg-brand-accent wa-text-white wa-text-sm wa-font-semibold hover:wa-bg-brand-accent-dark wa-transition-colors"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="wa-space-y-8">
              {filteredCategories.map((cat) => (
                <div
                  key={cat.name}
                  ref={(el) => { categoryRefs.current[cat.name] = el; }}
                >
                  <div className="wa-flex wa-items-center wa-gap-3 wa-mb-4">
                    <h2 className="wa-text-xl wa-font-bold wa-text-on-surface">{cat.name}</h2>
                    <span className="wa-text-sm wa-text-on-surface-variant wa-tabular-nums">
                      {cat.routes.length} route{cat.routes.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="wa-grid wa-gap-3">
                    {cat.routes.map((route) => (
                      <RouteCard
                        key={`${route.route}-${route.methods.join('-')}`}
                        route={route}
                        isActive={search.length > 2 && route.route.toLowerCase().includes(search.toLowerCase())}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="wa-border-t wa-border-surface-container-high wa-mt-12">
        <div className="wa-max-w-7xl wa-mx-auto wa-px-4 wa-py-6 wa-text-sm wa-text-on-surface-variant">
          Auto-generated from <code className="wa-text-xs wa-bg-surface-container wa-px-1 wa-py-0.5 wa-rounded">docs/API-REFERENCE.md</code>
          {' · '}
          <a href="/api/admin/api-docs/openapi" className="wa-text-brand-accent hover:wa-underline">OpenAPI spec</a>
        </div>
      </footer>
    </div>
  );
}
