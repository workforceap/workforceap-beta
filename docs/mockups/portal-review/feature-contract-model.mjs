/** Source-backed preservation obligations. A match is not proof of live behavior. */
export const FEATURE_SOURCE_SHA = 'f8a12f527810ba8c1e08840a762358b0fd86e4f1';

export function featurePatternMatches(pattern, path) {
  const escaped = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp('^' + escaped + '$').test(path);
}

export function featureContractsFor(route, families) {
  return families.filter(family => family.portals.includes(route.role) && family.routePatterns.some(pattern => featurePatternMatches(pattern, route.route)));
}

export function featureSources(family) {
  return [...new Set([...(family.sources || []), ...family.features.flatMap(feature => [...(feature.sources || []), ...(feature.source ? [feature.source] : [])])])];
}

export function featureCoverage(routes, families) {
  const byRoute = Object.fromEntries(routes.map(route => [route.route, featureContractsFor(route, families).map(family => family.id)]));
  return {
    byRoute,
    uncovered: routes.filter(route => byRoute[route.route].length === 0).map(route => route.route),
    unused: families.filter(family => !Object.values(byRoute).some(ids => ids.includes(family.id))).map(family => family.id),
    byPortal: Object.fromEntries([...new Set(routes.map(route => route.role))].map(role => {
      const group = routes.filter(route => route.role === role);
      return [role, { routes: group.length, documented: group.filter(route => byRoute[route.route].length > 0).length }];
    })),
  };
}
