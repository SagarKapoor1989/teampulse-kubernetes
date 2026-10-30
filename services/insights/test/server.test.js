const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateInsights } = require('../src/server');

test('calculates task metrics', () => {
  const result = calculateInsights([
    { status: 'todo', owner: 'Asha' },
    { status: 'doing', owner: 'Asha' },
    { status: 'done', owner: 'Lee' },
    { status: 'done', owner: 'Lee' },
  ]);
  assert.deepEqual(result, {
    total: 4,
    byStatus: { todo: 1, doing: 1, done: 2 },
    byOwner: { Asha: 2, Lee: 2 },
    completionPercent: 50,
    active: 2,
  });
});

test('handles an empty task list', () => {
  assert.equal(calculateInsights([]).completionPercent, 0);
});
