/**
 * Branch the signed-in guard should require.
 * pull_request carries the head ref. deployment_status from Vercel sets
 * deployment.ref to the commit SHA and leaves github.ref_name empty, so the
 * branch comes from the pull request whose head is that SHA.
 */

const SHA = /^[0-9a-f]{40}$/;

function usableBranch(value) {
  if (typeof value !== 'string') return '';
  const branch = value.trim().replace(/^refs\/heads\//, '');
  if (!branch || SHA.test(branch)) return '';
  if (branch.startsWith('/') || branch.includes('..') || /\s/.test(branch)) return '';
  return branch;
}

export function selectPreviewBranch({ eventName, eventBranch, refName, commitPulls, sha }) {
  switch (eventName) {
    case 'pull_request':
      return usableBranch(eventBranch);
    case 'workflow_dispatch':
      return usableBranch(refName);
    case 'deployment_status': {
      const pulls = Array.isArray(commitPulls) ? commitPulls : [];
      const match = pulls.find(
        (pull) => pull?.head?.sha === sha && usableBranch(pull?.head?.ref),
      );
      return match ? usableBranch(match.head.ref) : '';
    }
    default: {
      const _exhaustive = eventName;
      throw new Error(`unsupported portal-c event ${_exhaustive}`);
    }
  }
}
