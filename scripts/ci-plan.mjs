#!/usr/bin/env node
/** Select a bounded child-PR lane. Everything not explicitly covered stays full. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const SENSITIVE = /(?:auth|permission|policy|tenant|role|session|provider|layout|navigation|shell|middleware)/i;
export const PLAN_VERSION = '1';

export function isFeatureChild(eventName, baseRef) {
  return eventName === 'pull_request' && /^feature\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(baseRef ?? '');
}

export function parseChanges(output) {
  const fields = output.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 2) throw new Error('Incomplete Git name-status output');
  const changes = [];
  for (let index = 0; index < fields.length; index += 2) {
    const header = /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])$/.exec(fields[index]);
    if (!header) throw new Error('Unrecognized Git raw change');
    changes.push({ oldMode: header[1], newMode: header[2], status: header[3], path: fields[index + 1] });
  }
  return changes;
}

export function classifyChanges(changes) {
  const runtimePaths = [];
  if (!changes.length) return { mode: 'full', reason: 'Empty or unknown change set', runtimePaths };
  for (const change of changes) {
    const file = change.path;
    if (!['A', 'M'].includes(change.status)) {
      return { mode: 'full', reason: 'Deletion, rename, type or unresolved change', runtimePaths: [] };
    }
    if (change.newMode !== '100644' || (change.status === 'M' && change.oldMode !== change.newMode)) {
      return { mode: 'full', reason: 'File mode, symlink or submodule change', runtimePaths: [] };
    }
    if (typeof file !== 'string' || !file || /[\x00-\x1f\x7f\\]/.test(file) || file.split('/').includes('..')) {
      return { mode: 'full', reason: 'Unrecognized path', runtimePaths: [] };
    }
    // Explicit narrative inventory only. Unknown documentation can contain
    // operating instructions, CI policy or deployment/database contracts.
    if (file === 'docs/knowledge-base/features.md') continue;
    // Node remains full. The affected Vitest lane must prove collection for
    // EVERY changed runtime/test file before selecting tests. Shared primitives
    // and cross-cutting surfaces stay full even when named like a component.
    const component = /^components\/(?:employer|member|partner|counselor)\/[^/]+\.tsx$/.test(file)
      || /^components\/portal\/kit\/pages\/(?:member|employer|partner|counselor)\/[^/]+\.tsx$/.test(file);
    const componentTest = /^tests\/components\/.+\.(?:spec|test)\.tsx?$/.test(file);
    if (componentTest && change.status === 'A') return { mode: 'full', reason: 'New test ownership must be validated', runtimePaths: [] };
    if ((!component && !componentTest) || SENSITIVE.test(file)) {
      return { mode: 'full', reason: 'Sensitive, shared or unmapped change', runtimePaths: [] };
    }
    runtimePaths.push(file);
  }
  if (runtimePaths.length > 20) return { mode: 'full', reason: 'Large child change', runtimePaths: [] };
  return { mode: 'affected', reason: runtimePaths.length ? 'Bounded leaf component changes' : 'Documentation only', runtimePaths };
}

export function hasBuildBoundaryChange(diff) {
  return diff.split('\n').some((line) => /^[+-]/.test(line) && !/^(?:\+\+\+|---)/.test(line)
    && /(?:['"]use (?:client|server)['"]|\b(?:import|export)\b|\brequire\s*\(|\.css['"])/.test(line));
}

export function planCi({ eventName, event, git }) {
  const checkName = isFeatureChild(eventName, event?.pull_request?.base?.ref) ? 'Feature child checks' : 'Typecheck & Build';
  const full = (reason) => ({ version: PLAN_VERSION, mode: 'full', reason, mergeBase: '', runtimePaths: [], checkName });
  if (eventName !== 'pull_request') return full('Release, push, merge group or manual validation');
  const pr = event?.pull_request;
  if (!pr || !isFeatureChild(eventName, pr.base?.ref)) {
    return full('Only feature integration children are eligible');
  }
  if (pr.labels?.some((label) => label?.name === 'ci-full')) return full('ci-full label requests all release gates');
  if (!SHA.test(pr.base?.sha ?? '') || !SHA.test(pr.head?.sha ?? '')) return full('Missing immutable PR revisions');
  try {
    const mergeBase = git('merge-base', pr.base.sha, pr.head.sha).trim();
    if (!SHA.test(mergeBase)) return full('Invalid merge base');
    // CI tests the checkout's synthetic merge. Include base-only changes since
    // the fork point as well, and reject a checkout missing either PR parent.
    git('merge-base', '--is-ancestor', pr.base.sha, 'HEAD');
    git('merge-base', '--is-ancestor', pr.head.sha, 'HEAD');
    const changes = parseChanges(git('diff', '--raw', '-z', '--no-abbrev', '--no-renames', mergeBase, 'HEAD'));
    const classification = classifyChanges(changes);
    if (classification.mode === 'affected' && classification.runtimePaths.length
      && hasBuildBoundaryChange(git('diff', '--unified=0', mergeBase, 'HEAD', '--', ...classification.runtimePaths))) {
      return full('Runtime import, export or client/server boundary changed');
    }
    return { version: PLAN_VERSION, ...classification, mergeBase, checkName };
  } catch {
    return full('Git evidence unavailable; full validation required');
  }
}

export function readPlan(env = process.env, cwd = process.cwd()) {
  let event = {};
  try { event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')); } catch { /* Fail closed below. */ }
  return planCi({
    eventName: env.GITHUB_EVENT_NAME,
    event,
    git: (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }),
  });
}

export function main(env = process.env, cwd = process.cwd()) {
  const plan = readPlan(env, cwd);
  console.log(JSON.stringify(plan, null, 2));
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `version=${plan.version}\nmode=${plan.mode}\nmerge-base=${plan.mergeBase}\nruntime-count=${plan.runtimePaths.length}\ncheck-name=${plan.checkName}\n`);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `## CI scope\n\n**${plan.mode}**: ${plan.reason}.\n\nNode tests and static guards always run. Full release validation remains mandatory before master.\n`);
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
