const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { parseResponse } = require('../services/tasks/src/redis-client');

function encode(value) {
  if (value === null) return '$-1\r\n';
  if (Array.isArray(value)) return `*${value.length}\r\n${value.map(encode).join('')}`;
  if (typeof value === 'number') return `:${value}\r\n`;
  const text = String(value);
  return `$${Buffer.byteLength(text)}\r\n${text}\r\n`;
}

function createFakeRedis() {
  let nextId = 0;
  const hashes = new Map();
  const ids = new Set();

  function execute(parts) {
    const [rawCommand, ...args] = parts;
    const command = rawCommand.toUpperCase();
    if (command === 'AUTH') return 'OK';
    if (command === 'PING') return 'PONG';
    if (command === 'INCR') return ++nextId;
    if (command === 'GET') return args[0] === 'tasks:next-id' ? String(nextId) : null;
    if (command === 'HSET') {
      const [key, ...fields] = args;
      const hash = hashes.get(key) || new Map();
      for (let index = 0; index < fields.length; index += 2) hash.set(fields[index], fields[index + 1]);
      hashes.set(key, hash);
      return fields.length / 2;
    }
    if (command === 'HGETALL') return [...(hashes.get(args[0]) || new Map()).entries()].flat();
    if (command === 'SADD') {
      const size = ids.size;
      ids.add(args[1]);
      return ids.size - size;
    }
    if (command === 'SMEMBERS') return [...ids];
    if (command === 'DEL') return hashes.delete(args[0]) ? 1 : 0;
    if (command === 'SREM') return ids.delete(args[1]) ? 1 : 0;
    throw new Error(`Unsupported fake Redis command ${command}`);
  }

  return net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const parsed = parseResponse(buffer);
        if (!parsed) break;
        buffer = buffer.subarray(parsed.next);
        try {
          const value = execute(parsed.value);
          socket.write(typeof value === 'string' && (value === 'OK' || value === 'PONG') ? `+${value}\r\n` : encode(value));
        } catch (error) {
          socket.write(`-ERR ${error.message}\r\n`);
        }
      }
    });
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('browser gateway, both APIs, and database client work end to end', async (context) => {
  const redisServer = createFakeRedis();
  const redisPort = await listen(redisServer);
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = String(redisPort);
  process.env.REDIS_PASSWORD = 'test-password';

  const { createServer: createTaskServer } = require('../services/tasks/src/server');
  const taskServer = createTaskServer();
  const taskPort = await listen(taskServer);
  process.env.TASK_API_URL = `http://127.0.0.1:${taskPort}`;

  const { createServer: createInsightsServer } = require('../services/insights/src/server');
  const insightsServer = createInsightsServer();
  const insightsPort = await listen(insightsServer);
  process.env.INSIGHTS_API_URL = `http://127.0.0.1:${insightsPort}`;

  const { createServer: createWebServer } = require('../services/web/server');
  const webServer = createWebServer();
  const webPort = await listen(webServer);
  const baseUrl = `http://127.0.0.1:${webPort}`;

  context.after(async () => {
    await Promise.all([close(webServer), close(insightsServer), close(taskServer), close(redisServer)]);
  });

  const home = await fetch(baseUrl);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /TeamPulse/);

  const createdResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Integration test', owner: 'Codex', status: 'doing' }),
  });
  assert.equal(createdResponse.status, 201);
  assert.equal(createdResponse.headers.get('location'), '/api/tasks/1');
  const created = await createdResponse.json();
  assert.equal(created.id, '1');

  const tasks = await (await fetch(`${baseUrl}/api/tasks`)).json();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Integration test');

  const firstInsights = await (await fetch(`${baseUrl}/api/insights`)).json();
  assert.equal(firstInsights.total, 1);
  assert.equal(firstInsights.byStatus.doing, 1);

  const updatedResponse = await fetch(`${baseUrl}/api/tasks/1`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'done' }),
  });
  assert.equal(updatedResponse.status, 200);
  const updatedInsights = await (await fetch(`${baseUrl}/api/insights`)).json();
  assert.equal(updatedInsights.completionPercent, 100);

  assert.equal((await fetch(`${baseUrl}/api/tasks/1`, { method: 'DELETE' })).status, 200);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/tasks`)).json(), []);
});
