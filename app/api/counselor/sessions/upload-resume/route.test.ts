import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const routeSource = readFileSync(fileURLToPath(new URL('./route.ts', import.meta.url)), 'utf8');

test('upload-resume authorizes act-on-behalf before tenant lookup or writes', () => {
  const authIndex = routeSource.indexOf('await resolveActOnBehalf(user.id, memberId)');
  const guardIndex = routeSource.indexOf('if (!onBehalf.ok)');
  const subjectIndex = routeSource.indexOf('const authorizedMemberId = onBehalf.subjectUserId');
  const orgIndex = routeSource.indexOf('await getSubjectOrganizationId(authorizedMemberId)');
  const memberLookupIndex = routeSource.indexOf('where: { id: authorizedMemberId }');
  const preparationIndex = routeSource.indexOf('await prepareResumeUpload(file)');
  const atomicSwapIndex = routeSource.indexOf('await replaceClaimedResumeObjects({');
  const uploadIndex = routeSource.indexOf('storage.upload(path, body, options)');
  const profileSwapIndex = routeSource.indexOf(
    'swapResumeProfilePathsWithCas(authorizedMemberId, nextPaths, operationId)',
  );

  assert.notEqual(authIndex, -1);
  assert.notEqual(guardIndex, -1);
  assert.notEqual(subjectIndex, -1);
  assert.notEqual(orgIndex, -1);
  assert.notEqual(memberLookupIndex, -1);
  assert.notEqual(preparationIndex, -1);
  assert.notEqual(atomicSwapIndex, -1);
  assert.notEqual(uploadIndex, -1);
  assert.notEqual(profileSwapIndex, -1);

  assert.equal(routeSource.includes('await getSubjectOrganizationId(memberId)'), false);
  assert.equal(routeSource.includes('const path = `${memberId}/resume-original.${ext}`'), false);
  assert.equal(routeSource.includes('where: { userId: memberId }'), false);
  assert.equal(routeSource.includes('swapResumeProfilePathsWithCas(memberId'), false);

  assert.ok(authIndex < guardIndex);
  assert.ok(guardIndex < subjectIndex);
  assert.ok(subjectIndex < orgIndex);
  assert.ok(subjectIndex < memberLookupIndex);
  assert.ok(orgIndex < preparationIndex);
  assert.ok(preparationIndex < atomicSwapIndex);
  assert.ok(preparationIndex < uploadIndex);
  assert.ok(subjectIndex < atomicSwapIndex);
  assert.ok(subjectIndex < profileSwapIndex);
});
