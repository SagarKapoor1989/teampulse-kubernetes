const net = require('node:net');

function encodeCommand(parts) {
  const values = parts.map((part) => String(part));
  return `*${values.length}\r\n${values.map((value) => `$${Buffer.byteLength(value)}\r\n${value}\r\n`).join('')}`;
}

function parseResponse(buffer, offset = 0) {
  if (offset >= buffer.length) return null;
  const prefix = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf('\r\n', offset + 1);
  if (lineEnd === -1) return null;
  const line = buffer.toString('utf8', offset + 1, lineEnd);

  if (prefix === '+' || prefix === '-' || prefix === ':') {
    const value = prefix === ':' ? Number(line) : line;
    return { value, error: prefix === '-', next: lineEnd + 2 };
  }

  if (prefix === '$') {
    const length = Number(line);
    if (length === -1) return { value: null, next: lineEnd + 2 };
    const start = lineEnd + 2;
    const end = start + length;
    if (buffer.length < end + 2) return null;
    return { value: buffer.toString('utf8', start, end), next: end + 2 };
  }

  if (prefix === '*') {
    const count = Number(line);
    if (count === -1) return { value: null, next: lineEnd + 2 };
    const values = [];
    let next = lineEnd + 2;
    for (let index = 0; index < count; index += 1) {
      const item = parseResponse(buffer, next);
      if (!item) return null;
      if (item.error) throw new Error(item.value);
      values.push(item.value);
      next = item.next;
    }
    return { value: values, next };
  }

  throw new Error(`Unsupported Redis response prefix: ${prefix}`);
}

class RedisClient {
  constructor(options = {}) {
    this.host = options.host || process.env.REDIS_HOST || 'redis';
    this.port = Number(options.port || process.env.REDIS_PORT || 6379);
    this.password = options.password ?? process.env.REDIS_PASSWORD ?? '';
    this.timeoutMs = Number(options.timeoutMs || 3000);
  }

  execute(commands) {
    const allCommands = this.password ? [['AUTH', this.password], ...commands] : commands;
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      let settled = false;
      let buffer = Buffer.alloc(0);
      const replies = [];

      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error); else resolve(value);
      };

      socket.setTimeout(this.timeoutMs);
      socket.once('connect', () => socket.write(allCommands.map(encodeCommand).join('')));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        try {
          while (true) {
            const parsed = parseResponse(buffer);
            if (!parsed) break;
            if (parsed.error) return finish(new Error(parsed.value));
            replies.push(parsed.value);
            buffer = buffer.subarray(parsed.next);
            if (replies.length === allCommands.length) {
              const result = this.password ? replies.slice(1) : replies;
              return finish(null, result);
            }
          }
        } catch (error) {
          finish(error);
        }
      });
      socket.once('timeout', () => finish(new Error('Redis connection timed out')));
      socket.once('error', (error) => finish(error));
      socket.once('end', () => {
        if (!settled) finish(new Error('Redis connection closed before all replies arrived'));
      });
    });
  }

  async command(...parts) {
    const [reply] = await this.execute([parts]);
    return reply;
  }
}

module.exports = { RedisClient, encodeCommand, parseResponse };
