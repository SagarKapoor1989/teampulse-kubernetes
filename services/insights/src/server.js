const http = require('node:http');
const os = require('node:os');

const port = Number(process.env.PORT || 3002);
const taskApiUrl = (process.env.TASK_API_URL || 'http://tasks:3001').replace(/\/$/, '');
const fetchTimeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 3000);

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function calculateInsights(tasks) {
  const byStatus = { todo: 0, doing: 0, done: 0 };
  const byOwner = {};
  for (const task of tasks) {
    if (Object.hasOwn(byStatus, task.status)) byStatus[task.status] += 1;
    const owner = task.owner || 'Unassigned';
    byOwner[owner] = (byOwner[owner] || 0) + 1;
  }
  const total = tasks.length;
  return {
    total,
    byStatus,
    byOwner,
    completionPercent: total ? Math.round((byStatus.done / total) * 100) : 0,
    active: byStatus.todo + byStatus.doing,
  };
}

async function getTasks() {
  const response = await fetch(`${taskApiUrl}/api/tasks`, { signal: AbortSignal.timeout(fetchTimeoutMs) });
  if (!response.ok) throw new Error(`Task API returned HTTP ${response.status}`);
  const tasks = await response.json();
  if (!Array.isArray(tasks)) throw new Error('Task API returned an unexpected response');
  return tasks;
}

async function handler(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/healthz') {
    return json(response, 200, { status: 'ok', service: 'insights', instance: os.hostname() });
  }
  if (request.method === 'GET' && url.pathname === '/readyz') {
    try {
      await getTasks();
      return json(response, 200, { status: 'ready', upstream: 'tasks' });
    } catch {
      return json(response, 503, { status: 'not-ready', upstream: 'tasks-unavailable' });
    }
  }
  if (request.method === 'GET' && url.pathname === '/api/insights') {
    const metrics = calculateInsights(await getTasks());
    return json(response, 200, {
      ...metrics,
      generatedAt: new Date().toISOString(),
      generatedBy: os.hostname(),
    });
  }
  return json(response, 404, { error: 'Route not found' });
}

function createServer() {
  return http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      console.error(JSON.stringify({ level: 'error', service: 'insights', message: error.message }));
      if (!response.headersSent) json(response, 503, { error: 'Task data is temporarily unavailable' });
    });
  });
}

if (require.main === module) {
  createServer().listen(port, '0.0.0.0', () => {
    console.log(JSON.stringify({ level: 'info', service: 'insights', message: `Listening on ${port}`, instance: os.hostname() }));
  });
}

module.exports = { createServer, calculateInsights };
