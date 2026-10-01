/**
 * Vite `?raw` imports of the portal stylesheets, allowed through by
 * `css.include` in vitest.config.ts so cascade specs can mount the real CSS.
 */
declare module '*.css?raw' {
  const css: string;
  export default css;
}
