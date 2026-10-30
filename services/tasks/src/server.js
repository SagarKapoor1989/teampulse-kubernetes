const http = require('node:http');
const os = require('node:os');
const { RedisClient } = require('./redis-client');

const port = Number(process.env.PORT || 3001);
const redis = new RedisClient();
const allowedStatuses = new Set(['todo', 'doing', 'done']);

function json(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function readJson(request, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body is too large'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function validateTask(input, partial = false) {
  const errors = [];
  const output = {};
  if (!partial || Object.hasOwn(input, 'title')) {
    if (typeof input.title !== 'string' || input.title.trim().length < 1 || input.title.trim().length > 120) {
      errors.push('title must contain 1-120 characters');
    } else output.title = input.title.trim();
  }
  if (!partial || Object.hasOwn(input, 'description')) {
    if (input.description != null && (typeof input.description !== 'string' || input.description.length > 1000)) {
      errors.push('description must be a string of at most 1000 characters');
    } else output.description = (input.description || '').trim();
  }
  if (!partial || Object.hasOwn(input, 'owner')) {
    if (input.owner != null && (typeof input.owner !== 'string' || input.owner.length > 60)) {
      errors.push('owner must be a string of at most 60 characters');
    } else output.owner = (input.owner || 'Unassigned').trim() || 'Unassigned';
  }
  if (!partial || Object.hasOwn(input, 'status')) {
    const status = input.status || 'todo';
    if (!allowedStatuses.has(status)) errors.push('status must be todo, doing, or done');
    else output.status = status;
  }
  if (partial && Object.keys(output).length === 0 && errors.length === 0) errors.push('provide at least one task field');
  return { errors, value: output };
}

function arrayToObject(values) {
  if (!values || values.length === 0) return null;
  const object = {};
  for (let index = 0; index < values.length; index += 2) object[values[index]] = values[index + 1];
  return object;
}

async function findTask(id) {
  return arrayToObject(await redis.command('HGETALL', `task:${id}`));
}

async function listTasks() {
  const ids = await redis.command('SMEMBERS', 'tasks:ids');
  const tasks = await Promise.all((ids || []).map(findTask));
  return tasks.filter(Boolean).sort((a, b) => Number(b.id) - Number(a.id));
}

async function createTask(input) {
  const id = String(await redis.command('INCR', 'tasks:next-id'));
  const now = new Date().toISOString();
  const task = { id, ...input, createdAt: now, updatedAt: now };
  await redis.execute([
    ['HSET', `task:${id}`, ...Object.entries(task).flat()],
    ['SADD', 'tasks:ids', id],
  ]);
  return task;
}

async function updateTask(id, changes) {
  const existing = await findTask(id);
  if (!existing) return null;
  const task = { ...existing, ...changes, id, updatedAt: new Date().toISOString() };
  await redis.command('HSET', `task:${id}`, ...Object.entries(task).flat());
  return task;
}

async function deleteTask(id) {
  const existing = await findTask(id);
  if (!existing) return false;
  await redis.execute([['DEL', `task:${id}`], ['SREM', 'tasks:ids', id]]);
  return true;
}

async function handler(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);

  if (request.method === 'GET' && url.pathname === '/healthz') {
    return json(response, 200, { status: 'ok', service: 'tasks', instance: os.hostname() });
  }
  if (request.method === 'GET' && url.pathname === '/readyz') {
    try {
      await redis.command('PING');
      return json(response, 200, { status: 'ready', database: 'connected' });
    } catch {
      return json(response, 503, { status: 'not-ready', database: 'unavailable' });
    }
  }
  if (request.method === 'GET' && url.pathname === '/api/tasks') return json(response, 200, await listTasks());
  if (request.method === 'GET' && taskMatch) {
    const task = await findTask(taskMatch[1]);
    return task ? json(response, 200, task) : json(response, 404, { error: 'Task not found' });
  }
  if (request.method === 'POST' && url.pathname === '/api/tasks') {
    const validation = validateTask(await readJson(request));
    if (validation.errors.length) return json(response, 400, { errors: validation.errors });
    const task = await createTask(validation.value);
    return json(response, 201, task, { location: `/api/tasks/${task.id}` });
  }
  if ((request.method === 'PATCH' || request.method === 'PUT') && taskMatch) {
    const validation = validateTask(await readJson(request), request.method === 'PATCH');
    if (validation.errors.length) return json(response, 400, { errors: validation.errors });
    const task = await updateTask(taskMatch[1], validation.value);
    return task ? json(response, 200, task) : json(response, 404, { error: 'Task not found' });
  }
  if (request.method === 'DELETE' && taskMatch) {
    return (await deleteTask(taskMatch[1]))
      ? json(response, 200, { deleted: true, id: taskMatch[1] })
      : json(response, 404, { error: 'Task not found' });
  }
  return json(response, 404, { error: 'Route not found' });
}

function createServer() {
  return http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      console.error(JSON.stringify({ level: 'error', service: 'tasks', message: error.message }));
      if (!response.headersSent) json(response, error.status || 503, { error: error.status ? error.message : 'Service temporarily unavailable' });
    });
  });
}

if (require.main === module) {
  createServer().listen(port, '0.0.0.0', () => {
    console.log(JSON.stringify({ level: 'info', service: 'tasks', message: `Listening on ${port}`, instance: os.hostname() }));
  });
}

module.exports = { createServer, validateTask, arrayToObject };
