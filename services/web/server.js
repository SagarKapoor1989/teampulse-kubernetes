const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const port = Number(process.env.PORT || 3000);
const taskApiUrl = (process.env.TASK_API_URL || 'http://tasks:3001').replace(/\/$/, '');
const insightsApiUrl = (process.env.INSIGHTS_API_URL || 'http://insights:3002').replace(/\/$/, '');
const publicDirectory = path.join(__dirname, 'public');
const maxBodyBytes = 64 * 1024;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function securityHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'content-type': contentType,
    'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  };
}

function json(response, status, body) {
  response.writeHead(status, { ...securityHeaders(), 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(Object.assign(new Error('Request body is too large'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function proxy(request, response, baseUrl) {
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await readBody(request);
  const upstream = await fetch(`${baseUrl}${request.url}`, {
    method: request.method,
    body,
    headers: body?.length ? { 'content-type': request.headers['content-type'] || 'application/json' } : {},
    signal: AbortSignal.timeout(5000),
  });
  const payload = Buffer.from(await upstream.arrayBuffer());
  const responseHeaders = {
    ...securityHeaders(upstream.headers.get('content-type') || 'application/json; charset=utf-8'),
    'cache-control': 'no-store',
    'x-web-instance': os.hostname(),
  };
  if (upstream.headers.has('location')) responseHeaders.location = upstream.headers.get('location');
  response.writeHead(upstream.status, responseHeaders);
  response.end(payload);
}

async function serveStatic(urlPath, response) {
  const relative = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const filePath = path.resolve(publicDirectory, relative);
  if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) return false;
  try {
    const content = await fs.readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath)] || 'application/octet-stream';
    response.writeHead(200, {
      ...securityHeaders(contentType),
      'cache-control': contentType.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600',
      'x-web-instance': os.hostname(),
    });
    response.end(content);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return false;
    throw error;
  }
}

async function handler(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/healthz') {
    return json(response, 200, { status: 'ok', service: 'web', instance: os.hostname() });
  }
  if (url.pathname === '/api/tasks' || url.pathname.startsWith('/api/tasks/')) {
    return proxy(request, response, taskApiUrl);
  }
  if (request.method === 'GET' && url.pathname === '/api/insights') {
    return proxy(request, response, insightsApiUrl);
  }
  if (request.method === 'GET' && await serveStatic(url.pathname, response)) return;
  return json(response, 404, { error: 'Route not found' });
}

function createServer() {
  return http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      console.error(JSON.stringify({ level: 'error', service: 'web', message: error.message }));
      if (!response.headersSent) json(response, error.status || 502, { error: error.status ? error.message : 'An upstream service is unavailable' });
    });
  });
}

if (require.main === module) {
  createServer().listen(port, '0.0.0.0', () => {
    console.log(JSON.stringify({ level: 'info', service: 'web', message: `Listening on ${port}`, instance: os.hostname() }));
  });
}

module.exports = { createServer, securityHeaders };
