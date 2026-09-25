import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, objectsToCsv } from './cells';

test('csvCell turns a formula into quoted text', () => {
  const cell = csvCell('=HYPERLINK("x","y")');
  assert.equal(cell, '"\'=HYPERLINK(""x"",""y"")"');
  assert.ok(cell.startsWith(`"'=`));
});

test('csvCell guards every spreadsheet trigger character in strings', () => {
  for (const v of ['+1 512 555 0100', '-2+3', '@SUM(1)', '\tx', '\rx']) {
    assert.ok(csvCell(v).replace(/^"/, '').startsWith("'"), JSON.stringify(v));
  }
});

test('csvCell leaves numbers numeric, including negatives', () => {
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell(52000), '52000');
  assert.equal(csvCell(0), '0');
});

test('csvCell leaves plain text alone and quotes separators', () => {
  assert.equal(csvCell('Ana'), 'Ana');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(''), '');
});

test('objectsToCsv keeps header order and row order, joined with \\n', () => {
  const csv = objectsToCsv([
    { job_title: '=cmd', employer_name: 'Acme, Inc', salary_offered: -1 },
    { job_title: 'Tech', employer_name: 'Beta', salary_offered: 'N/A' },
  ]);
  assert.equal(csv, ["job_title,employer_name,salary_offered", "'=cmd,\"Acme, Inc\",-1", 'Tech,Beta,N/A'].join('\n'));
});

test('objectsToCsv returns an empty string for no rows', () => {
  assert.equal(objectsToCsv([]), '');
});
