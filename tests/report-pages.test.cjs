/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');

// Compile the real pure helper without loading React or starting Firebase listeners.
const source = readFileSync(resolve(__dirname, '../src/lib/report-pages.ts'), 'utf8');
const parsed = ts.createSourceFile('report-pages.ts', source, ts.ScriptTarget.Latest, true);
const helper = parsed.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'mergeReportPages',
);
assert.ok(helper, 'The production report merge helper must be present.');
const compiled = ts.transpileModule(helper.getText(parsed), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exported = {};
new Function('exports', compiled)(exported);
const { mergeReportPages } = exported;

const report = (id, revision) => ({
  id,
  revision,
  created: '2026-10-04T00:00:00.000Z',
  history: Array.from({ length: revision }, () => ({ status: 'Submitted' })),
});

test('an older page response cannot overwrite a newer live detail revision', () => {
  const live = report('task', 3);
  const delayedPage = report('task', 2);
  assert.equal(mergeReportPages([live], [delayedPage])[0], live);
  assert.equal(mergeReportPages([delayedPage], [live])[0], live);
});

test('legacy history length orders revisions and equal revisions accept refreshed metadata', () => {
  const live = { ...report('task', 3), revision: undefined };
  const delayed = { ...report('task', 2), revision: undefined };
  assert.equal(mergeReportPages([live], [delayed])[0], live);
  const expired = { ...live, photosExpiredAt: '2026-10-04T00:00:00.000Z' };
  assert.equal(mergeReportPages([live], [expired])[0], expired);
});

test('a pending older page cannot restore a report after access is revoked', () => {
  const delayedPage = [report('revoked-task', 1), report('allowed-task', 1)];
  const unavailable = new Set();
  const loaded = mergeReportPages([], delayedPage, unavailable);
  unavailable.add('revoked-task');
  assert.deepEqual(
    mergeReportPages(loaded, delayedPage, unavailable).map((item) => item.id),
    ['allowed-task'],
  );
  // A subsequent authorized read can restore the assignment with its new revision.
  unavailable.delete('revoked-task');
  assert.ok(
    mergeReportPages([], [report('revoked-task', 3)], unavailable).some(
      (item) => item.id === 'revoked-task' && item.revision === 3,
    ),
  );
});
