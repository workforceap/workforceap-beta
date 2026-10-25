/**
 * Loaders for every `/dev` fixture page and layout, enumerated with Vite's
 * `import.meta.glob`. Kept in a helper (not a spec) so the production-gate spec
 * stays a behavioural test: it runs each page, it does not read source text.
 *
 * `vite/client` types are not resolvable from the app's tsconfig (vite is only a
 * transitive dependency of vitest), so the one method used is declared here.
 * Vite rewrites the literal `import.meta.glob(...)` calls below at transform time.
 */
declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

export type DevModuleLoader = () => Promise<{ default?: (props: Record<string, unknown>) => unknown }>;

export const devPageModules = import.meta.glob('/app/dev/**/page.tsx') as unknown as Record<string, DevModuleLoader>;
export const devLayoutModules = import.meta.glob('/app/dev/**/layout.tsx') as unknown as Record<string, DevModuleLoader>;
