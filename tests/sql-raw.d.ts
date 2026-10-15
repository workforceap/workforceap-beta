/** Vite imports the actual migration for behavioral PostgreSQL fixtures. */
declare module '*.sql?raw' {
  const source: string;
  export default source;
}
