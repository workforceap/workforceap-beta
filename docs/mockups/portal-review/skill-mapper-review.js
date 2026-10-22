/*
 * Offline Skill Mapper interaction model.
 * Source contract: f8a12f527810ba8c1e08840a762358b0fd86e4f1,
 * SkillMapperClient.tsx, /api/ai/skill-mapper, /api/member/skill-profile,
 * lib/ai/onetSkills.ts and lib/content/courseSkillMap.ts.
 * Occupation codes/course names reference the source; every score is synthetic.
 * No authentication, O*NET, AI, resume upload, persistence or provider operation.
 */
(() => {
  'use strict';
  const PATH = '/dashboard/ai-tools/skill-mapper';
  const SOURCE = 'f8a12f527810ba8c1e08840a762358b0fd86e4f1';
  const AXES = ['Analytics', 'Engineering', 'Design', 'Strategy', 'Service', 'Research'];
  const DESCRIPTIONS = [
    'Working with data, numbers and logic.', 'Building and troubleshooting technology or systems.',
    'Creative and visual communication.', 'Planning, leadership and decisions.',
    'Communication, teamwork and professional service.', 'Learning, investigating and documenting.',
  ];
  const MEMBER = [58, 48, 35, 50, 78, 65];
  const OCCUPATIONS = [
    ['15-1232.00', 'Computer User Support Specialists', 'it support help desk helpdesk desktop support', [66, 74, 34, 46, 82, 64], [['Troubleshooting', 86], ['Active Listening', 83], ['Speaking', 78], ['Critical Thinking', 75], ['Reading Comprehension', 70]]],
    ['15-1252.00', 'Software Developers', 'software engineer programming developer frontend backend full stack', [78, 90, 54, 58, 48, 72], [['Programming', 92], ['Complex Problem Solving', 86], ['Systems Analysis', 82], ['Critical Thinking', 80], ['Active Learning', 76]]],
    ['15-1212.00', 'Information Security Analysts', 'cybersecurity security analyst soc analyst infosec', [82, 86, 30, 64, 58, 76], [['Critical Thinking', 88], ['Systems Analysis', 85], ['Monitoring', 81], ['Complex Problem Solving', 80], ['Active Learning', 78]]],
    ['15-1244.00', 'Network and Computer Systems Administrators', 'network administrator systems administrator sysadmin', [72, 88, 28, 56, 60, 68], [['Troubleshooting', 90], ['Systems Analysis', 85], ['Operations Monitoring', 83], ['Critical Thinking', 77], ['Active Learning', 72]]],
    ['11-3021.00', 'Computer and Information Systems Managers', 'it manager systems manager technology manager', [74, 76, 36, 88, 72, 66], [['Management of Personnel Resources', 88], ['Judgment and Decision Making', 86], ['Systems Analysis', 80], ['Coordination', 78], ['Active Listening', 76]]],
    ['41-4012.00', 'Sales Representatives', 'account executive account manager bdr sdr sales rep business development', [48, 24, 32, 78, 86, 50], [['Active Listening', 88], ['Speaking', 85], ['Persuasion', 82], ['Negotiation', 80], ['Service Orientation', 77]]],
    ['41-4011.00', 'Sales Representatives, Technical and Scientific Products', 'technical sales solutions consultant sales engineer saas sales', [64, 60, 30, 76, 84, 58], [['Speaking', 87], ['Active Listening', 85], ['Persuasion', 80], ['Science', 76], ['Critical Thinking', 73]]],
    ['11-2022.00', 'Sales Managers', 'sales manager sales leadership revenue leader quota pipeline manager', [62, 28, 34, 90, 84, 52], [['Management of Personnel Resources', 90], ['Persuasion', 87], ['Negotiation', 84], ['Coordination', 80], ['Active Listening', 78]]],
    ['11-2021.00', 'Marketing Managers', 'marketing manager growth marketing campaign brand manager', [70, 34, 76, 88, 74, 66], [['Judgment and Decision Making', 88], ['Critical Thinking', 83], ['Persuasion', 80], ['Writing', 78], ['Coordination', 75]]],
    ['13-1082.00', 'Project Management Specialists', 'project manager project management program manager implementation scrum', [72, 40, 36, 90, 82, 68], [['Coordination', 90], ['Time Management', 88], ['Judgment and Decision Making', 84], ['Active Listening', 80], ['Monitoring', 78]]],
  ].map(([code, title, keywords, scores, skills]) => ({code, title, keywords, scores, skills}));
  const TRAINING = [
    ['Data Analytics Professional Certificate', 'Google', 'Foundations: Data, Data, Everywhere'],
    ['Software Developer Professional Certificate', 'IBM', 'Introduction to Software Engineering'],
    ['UX Design Professional Certificate', 'Google', 'Foundations of User Experience (UX) Design'],
    ['Project Management Professional Certificate', 'Microsoft', 'Project Management Foundations'],
    ['Project Management Professional Certificate', 'Microsoft', 'Project Leadership, Communication and Stakeholder Management'],
    ['Data Analytics Professional Certificate', 'Google', 'Google Data Analytics Capstone'],
  ];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const initial = () => ({tab: 'search', query: '', searched: false, results: [], selected: null, history: [], sequence: 0, message: '', error: '', report: '', reportFormat: 'json'});
  let state = initial();
  let boundRoot = null;
  const bindings = new WeakMap();
  const occupation = () => OCCUPATIONS.find(item => item.code === state.selected) ?? null;
  const rowsFor = item => AXES.map((axis, index) => ({axis, member: MEMBER[index], target: item?.scores[index] ?? null, gap: item ? Math.max(0, item.scores[index] - MEMBER[index]) : null}));
  const gapsFor = item => rowsFor(item).filter(row => row.gap > 0).sort((a, b) => b.gap - a.gap);
  const button = (label, action, extra = '', primary = false) => `<button type="button" class="button${primary ? ' primary' : ''}" data-sm-action="${action}" ${extra}>${escape(label)}</button>`;

  function chart(item, compare = false) {
    const rows = rowsFor(item);
    const caption = compare ? 'Sample member profile and target occupation' : item ? 'Sample occupation skill emphasis' : 'Sample member profile';
    const summary = rows.map(row => `${row.axis}: ${compare ? `member ${row.member}, target ${row.target}` : item ? row.target : row.member}`).join('; ');
    return `<figure class="sm-chart"><canvas data-sm-chart="${compare ? 'comparison' : item ? 'occupation' : 'member'}" width="380" height="330" role="img" aria-label="${escape(caption + '. Synthetic scores from 0 to 100. ' + summary)}">${escape(summary)}</canvas><figcaption>${escape(caption)} · synthetic scores, 0–100</figcaption>${compare ? '<div class="sm-chart-legend"><span><i class="sm-target-swatch" aria-hidden="true"></i>Target occupation · solid</span><span><i class="sm-member-swatch" aria-hidden="true"></i>Sample member · dashed</span></div>' : ''}</figure>`;
  }

  function scoreTable(item, compare = false) {
    return `<div class="sm-score-table-wrap"><table class="sm-score-table"><caption>${compare ? 'Exact sample comparison scores' : 'Exact sample axis scores'}</caption><thead><tr><th scope="col">Skill area</th>${compare ? '<th scope="col">Member</th><th scope="col">Target</th><th scope="col">Gap</th>' : '<th scope="col">Score</th>'}</tr></thead><tbody>${rowsFor(item).map(row => `<tr><th scope="row">${row.axis}</th>${compare ? `<td>${row.member}</td><td>${row.target}</td><td>${row.gap > 0 ? '+' + row.gap : '—'}</td>` : `<td>${item ? row.target : row.member}</td>`}</tr>`).join('')}</tbody></table></div>`;
  }

  function groupedBars(item) {
    return `<div class="sm-grouped-bars" aria-label="Sample comparison as horizontal bars">${rowsFor(item).map(row => `<div class="sm-grouped-row"><strong>${row.axis}</strong><div><span>Member ${row.member}</span><i class="sm-bar sm-member-bar" style="--sm-value:${row.member}%" aria-hidden="true"></i></div><div><span>Target ${row.target}</span><i class="sm-bar" style="--sm-value:${row.target}%" aria-hidden="true"></i></div></div>`).join('')}</div>`;
  }

  function training(item) {
    const gaps = gapsFor(item).slice(0, 3);
    return `<section class="sm-section"><h3>Training to explore</h3><p class="sm-muted">Illustrative recommendations for the largest sample gaps. Course names reference the WAP catalog; enrollment and course access are separate steps.</p>${gaps.length ? `<ol class="sm-training">${gaps.map(gap => {
      const [program, partner, course] = TRAINING[AXES.indexOf(gap.axis)];
      return `<li><div class="sm-training-heading"><strong>${escape(program)}</strong><span>${escape(partner)}</span></div><p>${escape(gap.axis)} · ${gap.gap}-point sample gap</p><details><summary>View suggested course</summary><p><strong>${escape(course)}</strong></p><p>This is a sample learning suggestion, not an enrollment, completion record or guaranteed score increase.</p><a href="#/dashboard/learning" class="button small">Open learning hub</a></details></li>`;
    }).join('')}</ol>` : '<p>No positive gaps in this sample comparison. This does not establish job readiness.</p>'}</section>`;
  }

  function exportControls() {
    return `<div class="sm-actions">${button('Export sample JSON', 'export', 'data-sm-format="json"')}${button('Export sample CSV', 'export', 'data-sm-format="csv"')}</div>`;
  }

  function selectedView(item) {
    if (!item) return `<section class="sm-empty"><h3>See the skill map for a role</h3><p>Search the sample occupation catalog, or open a starter example. Each result includes a radar, exact scores and a profile comparison.</p><div class="sm-actions">${button('Try IT support', 'choose', 'data-sm-code="15-1232.00"', true)}${button('Try sales', 'choose', 'data-sm-code="41-4012.00"')}</div></section>`;
    return `<section class="sm-section sm-result" aria-labelledby="sm-occupation-title"><div class="sm-result-heading"><div><p class="sm-kicker">Selected sample occupation</p><h3 id="sm-occupation-title">${escape(item.title)}</h3><p class="sm-muted">O*NET code reference ${escape(item.code)} · scores are synthetic</p></div>${button('Compare with sample profile', 'compare', '', true)}</div><div class="sm-chart-layout"><div>${chart(item)}${scoreTable(item)}</div><section class="sm-skill-list"><h4>Top skills · sample emphasis</h4><p class="sm-muted">Higher values illustrate the skill’s importance for this role, not a member’s tested ability.</p><ul>${item.skills.map(([name, score]) => `<li><div><span>${escape(name)}</span><strong>${score}/100</strong></div><i class="sm-bar" style="--sm-value:${score}%" aria-hidden="true"></i></li>`).join('')}</ul></section></div><details class="sm-axis-help"><summary>What do the six skill areas mean?</summary><dl>${AXES.map((axis, index) => `<div><dt>${axis}</dt><dd>${escape(DESCRIPTIONS[index])}</dd></div>`).join('')}</dl><p>These are WAP’s broad categories. This review does not fetch or certify O*NET scores.</p></details>${exportControls()}</section>${training(item)}`;
  }

  function profileView(item) {
    return `<section class="sm-section"><div class="sm-result-heading"><div><p class="sm-kicker">Synthetic member example</p><h3>${item ? 'Sample profile vs. ' + escape(item.title) : 'Sample skills profile'}</h3><p class="sm-muted">Fixed example values demonstrate the feature. No personal résumé, certification or assessment was read.</p></div>${button('Choose another occupation', 'tab-search')}</div><div class="sm-chart-layout"><div>${chart(item, Boolean(item))}${scoreTable(item, Boolean(item))}</div><div>${item ? groupedBars(item) : '<h4>Build a comparison</h4><p>Choose an occupation in the search tab to overlay its sample requirements and see the gaps.</p>'}<details class="sm-profile-sources"><summary>Profile sources in the actual app</summary><p>The app combines résumé and certification signals, saved Interest Profiler results and saved occupation lookups. AI résumé extraction requires the configured backend and a member résumé.</p><p>This review uses only a fixed synthetic profile. It does not extract résumé skills or connect to O*NET.</p><div class="sm-actions"><a class="button small" href="#/dashboard/resume">Review résumé workspace</a><a class="button small" href="#/dashboard/certifications">Review certifications</a><a class="button small" href="#/dashboard/learning/interest-profiler">Open Interest Profiler</a></div></details></div></div>${item ? `<section class="sm-gaps"><h4>Skill gaps to explore</h4><p class="sm-muted">Positive target-minus-member differences in this fixture. These are not qualification decisions.</p><ul>${gapsFor(item).map(gap => `<li><strong>${gap.axis}</strong><span>${gap.member} → ${gap.target}</span><span class="sm-gap-value">+${gap.gap} points</span></li>`).join('') || '<li>No positive sample gaps.</li>'}</ul></section>${exportControls()}` : ''}</section>${item ? training(item) : ''}`;
  }

  function historyView() {
    return `<section class="sm-section sm-history" aria-labelledby="sm-history-title"><div class="sm-result-heading"><div><h3 id="sm-history-title">Recent sample lookups</h3><p class="sm-muted">Kept in this open review only. Reloading clears the history.</p></div>${state.history.length ? button('Clear sample history', 'clear-history') : ''}</div>${state.history.length ? `<ol>${state.history.map(entry => `<li><button type="button" data-sm-action="history" data-sm-code="${entry.code}"><span><strong>${escape(entry.title)}</strong><small>${entry.code} · ${entry.id}</small></span><span>Open map →</span></button></li>`).join('')}</ol>` : '<p>No lookups recorded yet. Selecting an occupation adds a local example here.</p>'}</section>`;
  }

  function content() {
    const item = occupation();
    return `<div class="sm-boundary"><strong>Interactive sample · no live O*NET</strong><p>Search, compare and export synthetic skill maps. Occupation codes and feature structure reference the actual WAP app; all scores and recommendations here are examples.</p></div><div class="sm-tabs" role="tablist" aria-label="Skill Mapper views">${[['search', 'Occupation search'], ['profile', 'My skills profile']].map(([key, label]) => `<button type="button" role="tab" id="sm-tab-${key}" aria-controls="sm-panel-${key}" aria-selected="${state.tab === key}" tabindex="${state.tab === key ? 0 : -1}" data-sm-tab="${key}">${label}</button>`).join('')}</div><p class="sm-status" role="status" aria-live="polite" aria-atomic="true">${escape(state.message)}</p><div id="sm-panel-search" role="tabpanel" aria-labelledby="sm-tab-search" ${state.tab === 'search' ? '' : 'hidden'}><form class="sm-search" data-sm-form><div><label for="sm-query">Search sample occupations</label><input id="sm-query" type="search" autocomplete="off" maxlength="120" value="${escape(state.query)}" placeholder="Try IT support, sales, project manager…" aria-describedby="sm-search-help${state.error ? ' sm-search-error' : ''}" ${state.error ? 'aria-invalid="true"' : ''}><p id="sm-search-help" class="sm-muted">Search 10 local examples by title, keyword or occupation code.</p></div><button type="submit" class="button primary">Search occupations</button></form>${state.error ? `<p id="sm-search-error" role="alert" class="sm-error">${escape(state.error)}</p>` : ''}${state.searched ? `<section class="sm-search-results" aria-labelledby="sm-results-title"><h3 id="sm-results-title">${state.results.length} sample ${state.results.length === 1 ? 'occupation' : 'occupations'} found</h3>${state.results.length ? `<ul>${state.results.map(code => { const result = OCCUPATIONS.find(o => o.code === code); return `<li><button type="button" data-sm-action="choose" data-sm-code="${code}" aria-pressed="${state.selected === code}"><span><strong>${escape(result.title)}</strong><small>${code} · synthetic skill fixture</small></span><span>View map →</span></button></li>`; }).join('')}</ul>` : '<p>No match in this limited sample catalog. This does not mean the occupation is absent from O*NET. Try “support”, “sales”, “security” or “project”.</p>'}</section>` : ''}${selectedView(item)}</div><div id="sm-panel-profile" role="tabpanel" aria-labelledby="sm-tab-profile" ${state.tab === 'profile' ? '' : 'hidden'}>${profileView(item)}</div>${state.report ? `<section class="sm-section sm-export"><h3>Copyable sample ${state.reportFormat.toUpperCase()} report</h3><p class="sm-muted">Use this if your review host blocks downloads. The report explicitly identifies every value as synthetic.</p><label for="sm-report">Sample report contents</label><textarea id="sm-report" readonly rows="8" spellcheck="false">${escape(state.report)}</textarea>${button('Select report text', 'select-report')}</section>` : ''}${historyView()}`;
  }

  function host() { return boundRoot?.querySelector('[data-skill-mapper-review]') ?? null; }
  function repaint(focusSelector) {
    const target = host();
    if (!target) return;
    target.innerHTML = content();
    drawCharts(boundRoot);
    if (focusSelector) target.querySelector(focusSelector)?.focus({preventScroll: true});
  }

  function choose(code, addHistory = true) {
    const item = OCCUPATIONS.find(entry => entry.code === code);
    if (!item) return;
    state.selected = code;
    state.tab = 'search';
    state.report = '';
    state.error = '';
    if (addHistory) {
      const entry = {code, title: item.title, id: 'SM-SAMPLE-' + String(++state.sequence).padStart(3, '0')};
      state.history = [entry, ...state.history.filter(old => old.code !== code)].slice(0, 6);
    }
    state.message = `${item.title} sample map opened. Six synthetic skill areas are available to compare.`;
    repaint('[data-sm-action="compare"]');
  }

  function reportData() {
    const item = occupation();
    if (!item) return null;
    return {
      kind: 'WorkforceAP synthetic Skill Mapper review', sample: true, liveOnet: false,
      sourceCommit: SOURCE, occupation: {code: item.code, title: item.title},
      note: 'All scores and suggestions are synthetic. No personal data or live O*NET response was used. This is not an assessment, credential or enrollment.',
      scores: rowsFor(item), skills: item.skills.map(([name, score]) => ({name, score})),
      training: gapsFor(item).slice(0, 3).map(gap => {
        const [program, partner, course] = TRAINING[AXES.indexOf(gap.axis)];
        return {axis: gap.axis, gap: gap.gap, program, partner, course, enrollment: 'not attempted'};
      }),
    };
  }

  function exportReport(format) {
    const report = reportData();
    if (!report) return;
    format = format === 'csv' ? 'csv' : 'json';
    const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    const csv = [
      ['Record type', 'Occupation code', 'Occupation', 'Axis or skill', 'Sample member score', 'Sample target score', 'Positive sample gap', 'Program', 'Course', 'Synthetic / no live O*NET'],
      ...report.scores.map(row => ['axis', report.occupation.code, report.occupation.title, row.axis, row.member, row.target, row.gap, '', '', 'true']),
      ...report.skills.map(skill => ['skill', report.occupation.code, report.occupation.title, skill.name, '', skill.score, '', '', '', 'true']),
      ...report.training.map(row => ['training', report.occupation.code, report.occupation.title, row.axis, '', '', row.gap, row.program, row.course, 'true']),
    ].map(row => row.map(quote).join(',')).join('\r\n');
    state.report = format === 'csv' ? csv : JSON.stringify(report, null, 2);
    state.reportFormat = format;
    state.message = `Sample ${format.toUpperCase()} prepared. If downloads are unavailable, copy the report below.`;
    const blob = new Blob([state.report], {type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json'});
    let url;
    try {
      url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `workforceap-synthetic-skill-map-${report.occupation.code}.${format}`;
      host()?.append(anchor);
      anchor.click();
      anchor.remove();
    } catch { state.message = 'Your sample report is ready to copy below. Downloads are unavailable in this host.'; }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
    repaint('[data-sm-action="select-report"]');
  }

  function paintColor(node, variable) {
    const probe = document.createElement('span');
    probe.style.color = `var(${variable})`;
    node.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }

  function drawCharts(root) {
    const target = root?.querySelector('[data-skill-mapper-review]');
    if (!target) return;
    const colors = {text: paintColor(target, '--wa-text'), grid: paintColor(target, '--wa-control-border'), target: paintColor(target, '--wa-accent-text'), member: paintColor(target, '--wa-info')};
    const item = occupation();
    for (const canvas of target.querySelectorAll('[data-sm-chart]')) {
      if (!canvas.clientWidth) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientWidth * 330 / 380 * dpr);
      ctx.setTransform(canvas.width / 380, 0, 0, canvas.height / 330, 0, 0);
      ctx.clearRect(0, 0, 380, 330);
      const cx = 190, cy = 160, radius = 112;
      const point = (index, value) => { const angle = index * Math.PI / 3 - Math.PI / 2; return [cx + Math.cos(angle) * radius * value, cy + Math.sin(angle) * radius * value]; };
      const path = values => { ctx.beginPath(); values.forEach((value, index) => { const [x, y] = point(index, value); if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); };
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 0.7;
      for (const level of [0.25, 0.5, 0.75, 1]) { path(AXES.map(() => level)); ctx.stroke(); }
      AXES.forEach((axis, index) => {
        const [x, y] = point(index, 1);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
        const [lx, ly] = point(index, 1.28);
        const labelSize = Math.max(14, Math.min(20, 14 * 380 / canvas.clientWidth));
        ctx.fillStyle = colors.text; ctx.font = `500 ${labelSize}px Inter, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(axis, lx, ly);
      });
      const series = (scores, color, dashed) => {
        path(scores.map(value => value / 100)); ctx.fillStyle = color; ctx.globalAlpha = 0.10; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.setLineDash(dashed ? [6, 4] : []); ctx.stroke(); ctx.setLineDash([]);
        scores.forEach((value, index) => { const [x, y] = point(index, value / 100); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
      };
      const kind = canvas.dataset.smChart;
      if (kind !== 'member' && item) series(item.scores, colors.target, false);
      if (kind !== 'occupation') series(MEMBER, colors.member, kind === 'comparison');
    }
  }

  window.skillMapperRouteView = route => {
    const path = typeof route === 'string' ? route.split('?')[0] : route?.route;
    return path === PATH ? `<div class="sm-review" data-skill-mapper-review>${content()}</div>` : null;
  };

  window.resetSkillMapperReview = () => { state = initial(); repaint(); };

  window.bindSkillMapperReview = (root = document) => {
    boundRoot = root;
    if (!bindings.has(root)) {
      const within = target => target instanceof Element && target.closest('[data-skill-mapper-review]');
      root.addEventListener('input', event => {
        if (within(event.target) && event.target.id === 'sm-query') state.query = event.target.value;
      });
      root.addEventListener('submit', event => {
        if (!within(event.target) || !event.target.matches('[data-sm-form]')) return;
        event.preventDefault();
        const query = state.query.trim().toLowerCase();
        state.error = query.length < 2 ? 'Enter at least two characters to search the sample occupations.' : '';
        if (state.error) { repaint('#sm-query'); return; }
        const words = query.split(/\s+/);
        state.results = OCCUPATIONS.filter(item => words.every(word => `${item.title} ${item.keywords} ${item.code}`.toLowerCase().includes(word))).map(item => item.code);
        state.searched = true;
        state.message = `${state.results.length} sample occupations found. No live O*NET search was made.`;
        repaint(state.results.length ? '.sm-search-results button' : '#sm-query');
      });
      root.addEventListener('click', event => {
        if (!within(event.target)) return;
        const tab = event.target.closest('[data-sm-tab]');
        if (tab) { state.tab = tab.dataset.smTab; repaint(`[data-sm-tab="${state.tab}"]`); return; }
        const control = event.target.closest('[data-sm-action]');
        if (!control) return;
        const action = control.dataset.smAction;
        if (action === 'choose' || action === 'history') choose(control.dataset.smCode, action === 'choose');
        else if (action === 'compare' || action === 'tab-search') { state.tab = action === 'compare' ? 'profile' : 'search'; repaint(`[data-sm-tab="${state.tab}"]`); }
        else if (action === 'clear-history') { state.history = []; state.message = 'Sample lookup history cleared in this review.'; repaint('[data-sm-tab="' + state.tab + '"]'); }
        else if (action === 'export') exportReport(control.dataset.smFormat);
        else if (action === 'select-report') { const report = host()?.querySelector('#sm-report'); report?.focus(); report?.select(); }
      });
      root.addEventListener('keydown', event => {
        if (!within(event.target) || !event.target.matches('[data-sm-tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        state.tab = event.key === 'Home' ? 'search' : event.key === 'End' ? 'profile' : state.tab === 'search' ? 'profile' : 'search';
        repaint(`[data-sm-tab="${state.tab}"]`);
      });
      const themeRoot = root.nodeType === 9 ? root.documentElement : root;
      const observer = new MutationObserver(() => drawCharts(root));
      observer.observe(themeRoot, {attributes: true, attributeFilter: ['data-theme', 'class']});
      window.addEventListener('resize', () => drawCharts(root));
      document.fonts?.ready.then(() => drawCharts(root));
      bindings.set(root, observer);
    }
    drawCharts(root);
  };
})();
