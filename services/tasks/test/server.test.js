const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTask, arrayToObject } = require('../src/server');
const { encodeCommand, parseResponse } = require('../src/redis-client');

test('validates and normalises a new task', () => {
  const result = validateTask({ title: '  Ship demo  ', owner: '', status: 'doing' });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.value, { title: 'Ship demo', description: '', owner: 'Unassigned', status: 'doing' });
});

test('rejects invalid input', () => {
  const result = validateTask({ title: '', status: 'blocked' });
  assert.equal(result.errors.length, 2);
});

test('converts a Redis hash response to an object', () => {
  assert.deepEqual(arrayToObject(['id', '4', 'title', 'Test']), { id: '4', title: 'Test' });
  assert.equal(arrayToObject([]), null);
});

test('encodes and parses Redis protocol values', () => {
  assert.equal(encodeCommand(['PING']), '*1\r\n$4\r\nPING\r\n');
  assert.deepEqual(parseResponse(Buffer.from('*2\r\n$3\r\none\r\n:2\r\n')).value, ['one', 2]);
});
