/* These review controls document the existing app; they do not implement its services. */
(() => {
  const manifest = JSON.parse(document.getElementById('feature-contracts').textContent);
  const families = new Map(manifest.families.map(family => [family.id, family]));
  const statusLabels = { simulated: 'Sample interactions', structural: 'Layout preview', mixed: 'Partial simulation' };
  const routeFamilies = route => (manifest.byRoute[route.route] || []).map(id => families.get(id)).filter(Boolean);
  const sourceLink = path => `<a href="https://github.com/workforceap/workforceap-beta/blob/${manifest.sourceSha}/${encodeURI(path)}" target="_blank" rel="noopener noreferrer">${esc(path)}</a>`;
  const featureCount = group => new Set(group.flatMap(family => family.features)).size;

  function familyBody(family, includeRoutes = false) {
    const covered = routes.filter(route => (manifest.byRoute[route.route] || []).includes(family.id));
    return `<article class="feature-family" data-feature-family="${esc(family.id)}"><h3>${esc(family.title)}</h3><p class="meta">${esc(family.portals.map(role => ROLE_LABEL[role]).join(' · '))} · ${esc(statusLabels[family.previewStatus] || 'Layout preview')}</p><ul class="feature-obligations">${family.features.map(label => `<li>${esc(label)}</li>`).join('')}</ul>${family.integrations.length ? `<p><strong>Keep connected in the app:</strong> ${esc(family.integrations.join('; '))}</p>` : ''}<p class="feature-limit">${esc(family.notes || 'Review fixtures illustrate only part of this workflow. Preserve the existing application implementation.')}</p><details class="feature-evidence"><summary>Existing implementation · ${family.sources.length} source files</summary><ul>${family.sources.map(path => `<li>${sourceLink(path)}</li>`).join('')}</ul></details>${includeRoutes ? `<details class="feature-evidence"><summary>${covered.length} related review screens</summary><ul>${covered.map(route => `<li><a href="${routeHref(fixturePath(route.route))}" data-close-dialog="true">${esc(titleFor(route))}<small>${esc(route.route)}</small></a></li>`).join('')}</ul></details>` : ''}</article>`;
  }

  window.featureRouteSummary = route => {
    if (!route) return '';
    const group = routeFamilies(route);
    return `<aside class="feature-strip" aria-label="Feature preservation"><div><strong>Keep the full workflow</strong><p>${featureCount(group)} existing feature requirements · ${group.some(f => f.previewStatus === 'structural') ? 'Some actions are represented by layout only.' : 'This review uses sample interactions.'}</p></div><button type="button" class="button small" data-action="features">View existing features</button></aside>`;
  };

  window.openFeatureReview = route => {
    if (!route) return;
    const group = routeFamilies(route);
    openDialog('Existing features to preserve', `<p class="feature-intro">The redesign must retain these source-backed behaviors for the workflow around <strong>${esc(titleFor(route))}</strong>. A simplified review screen does not authorize removing them from WorkforceAP.</p><p class="routecode">${esc(route.route)}</p>${group.map(family => familyBody(family)).join('')}<p class="meta">Source baseline: ${esc(manifest.sourceSha.slice(0, 12))}. This checklist documents the implementation; live integrations and authorization still need authenticated acceptance.</p><button type="button" class="button" data-action="feature-catalog">Browse features across all portals</button>`);
  };

  window.featureCatalog = () => `<div class="feature-catalog"><p class="feature-intro">${routes.length} routes mapped to ${manifest.families.length} feature families. These are preservation requirements for the redesign, not a claim that every workflow runs in this offline review.</p><div class="feature-coverage">${Object.entries(manifest.byPortal).map(([role, count]) => `<span><strong>${esc(ROLE_LABEL[role])}</strong> ${count.documented}/${count.routes} routes documented</span>`).join('')}</div><label class="search">${icon('search')}<span class="sr-only">Find an existing feature</span><input type="search" data-feature-search placeholder="Find a feature, integration, or workspace"></label><p class="meta" data-feature-count role="status">${manifest.families.length} feature families</p><div data-feature-results>${manifest.families.map(family => `<details class="feature-entry" data-feature-query="${esc([family.title, ...family.features, ...family.integrations, ...family.portals, ...family.portals.map(role => ROLE_LABEL[role])].join(' ').toLowerCase())}"><summary><strong>${esc(family.title)}</strong><span>${esc(family.portals.map(role => ROLE_LABEL[role]).join(' · '))}</span></summary>${familyBody(family, true)}</details>`).join('')}</div></div>`;

  document.addEventListener('input', event => {
    if (!event.target.matches('[data-feature-search]')) return;
    const catalog = event.target.closest('.feature-catalog');
    const query = event.target.value.trim().toLowerCase();
    let found = 0;
    for (const entry of catalog.querySelectorAll('[data-feature-query]')) {
      entry.hidden = !entry.dataset.featureQuery.includes(query);
      if (!entry.hidden) found++;
    }
    catalog.querySelector('[data-feature-count]').textContent = found ? `${found} of ${manifest.families.length} feature families` : 'No matching features. Try another term.';
  });
})();
