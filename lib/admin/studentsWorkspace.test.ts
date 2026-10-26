import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseStudentsReadinessView,
  parseStudentsWorkspaceView,
  studentsWorkspaceHref,
} from './studentsWorkspace';

test('unknown or missing students views fall back to roster', () => {
  assert.equal(parseStudentsWorkspaceView('manage'), 'manage');
  assert.equal(parseStudentsWorkspaceView(['readiness', 'training']), 'readiness');
  assert.equal(parseStudentsWorkspaceView('caseload'), 'roster');
  assert.equal(parseStudentsWorkspaceView(undefined), 'roster');
});

test('readiness view is job only when that exact value is first', () => {
  assert.equal(parseStudentsReadinessView('job'), 'job');
  assert.equal(parseStudentsReadinessView(['job', 'interview']), 'job');
  assert.equal(parseStudentsReadinessView('interview'), 'interview');
  assert.equal(parseStudentsReadinessView('jobs'), 'interview');
  assert.equal(parseStudentsReadinessView(undefined), 'interview');
});

test('students workspace hrefs omit the roster default and preserve extras', () => {
  assert.equal(studentsWorkspaceHref('roster'), '/admin/students');
  assert.equal(
    studentsWorkspaceHref('readiness', { readiness: 'job', page: '2' }),
    '/admin/students?view=readiness&readiness=job&page=2',
  );
  assert.equal(
    studentsWorkspaceHref('training', { view: 'roster', q: 'ana' }),
    '/admin/students?view=training&q=ana',
  );
});
