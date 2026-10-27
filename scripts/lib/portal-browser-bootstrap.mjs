/** Bootstrap evidence predates case baselines and must never be dropped. */
export function assertBrowserBootstrap({ blocked, pageErrors, consoleErrors }) {
  if ([blocked, pageErrors, consoleErrors].some(count => !Number.isSafeInteger(count) || count !== 0)) throw new Error('Browser bootstrap attempted an unrelated request or emitted an error.');
}
