const test = require('node:test');
const assert = require('node:assert/strict');
const { securityHeaders } = require('./server');

test('sets browser security headers', () => {
  const headers = securityHeaders('text/html');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.match(headers['content-security-policy'], /default-src 'self'/);
  assert.equal(headers['content-type'], 'text/html');
});
