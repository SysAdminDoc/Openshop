import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseMetadata } from '../tools/release-metadata.mjs';
import { readCheckoutIdentity } from './checkout-identity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.OPENSHOP_TEST_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const productionRevision = releaseMetadata.shellRevision;
const CONTROL_BODY_LIMIT = 16 * 1024;
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const allowedControlOrigins = new Set([origin, `http://localhost:${port}`]);
const publicFiles = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/plugin-sandbox.html', 'plugin-sandbox.html'],
  ['/plugin-sandbox.js', 'plugin-sandbox.js'],
  ['/sw.js', 'sw.js'],
  ['/manifest.webmanifest', 'manifest.webmanifest'],
  ['/icon-192.png', 'icon-192.png'],
  ['/icon-512.png', 'icon-512.png'],
  ['/design/openshop-studio-master.png', 'design/openshop-studio-master.png'],
  ['/design/openshop-menu-states.png', 'design/openshop-menu-states.png']
]);
let workerRevision = productionRevision;
let badShell = false;
let networkDown = false;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png'
};

function send(response, status, body, headers = {}) {
  if (response.writableEnded) return;
  response.writeHead(status, {
    'cache-control': 'no-store',
    ...headers
  });
  response.end(body);
}

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function originIsAllowed(value) {
  if (!value) return false;
  try {
    return allowedControlOrigins.has(new URL(value).origin);
  } catch {
    return false;
  }
}

function readJsonBody(request) {
  const declaredLength = Number(request.headers['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > CONTROL_BODY_LIMIT) {
    request.resume();
    throw new RequestError(413, 'Control body is too large');
  }
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    request.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > CONTROL_BODY_LIMIT) {
        settled = true;
        chunks.length = 0;
        rejectBody(new RequestError(413, 'Control body is too large'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      const source = Buffer.concat(chunks).toString('utf8').trim() || '{}';
      try {
        const value = JSON.parse(source);
        if (!value || Array.isArray(value) || typeof value !== 'object') {
          throw new Error('Control body must be a JSON object');
        }
        resolveBody(value);
      } catch {
        rejectBody(new RequestError(400, 'Control body must be valid JSON'));
      }
    });
    request.on('aborted', () => {
      if (!settled) rejectBody(new RequestError(400, 'Control request was aborted'));
    });
    request.on('error', error => {
      if (!settled) rejectBody(error);
    });
  });
}

async function handleRequest(request, response) {
  const host = String(request.headers.host || '').toLowerCase();
  if (!allowedHosts.has(host)) {
    send(response, 421, 'Unrecognized Host', { 'content-type': 'text/plain; charset=utf-8' });
    return;
  }

  const url = new URL(request.url || '/', origin);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    send(response, 400, 'Malformed URL encoding', { 'content-type': 'text/plain; charset=utf-8' });
    return;
  }

  if (pathname === '/__test/cacheable.js') {
    send(response, 200, 'globalThis.__openshopCacheProbe = true;', {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'public, max-age=60'
    });
    return;
  }
  if (pathname === '/__test/untrusted.html') {
    send(response, 200, '<!doctype html><meta charset="utf-8"><title>Untrusted harness page</title>', {
      'content-type': 'text/html; charset=utf-8'
    });
    return;
  }
  if (pathname === '/__test/identity' && request.method === 'GET') {
    send(response, 200, JSON.stringify(readCheckoutIdentity(root)), {
      'content-type': 'application/json; charset=utf-8'
    });
    return;
  }
  if (pathname === '/__test/control' && request.method === 'POST') {
    if (!originIsAllowed(request.headers.origin)) {
      send(response, 403, 'Control Origin is not allowed', { 'content-type': 'text/plain; charset=utf-8' });
      return;
    }
    const state = await readJsonBody(request);
    workerRevision = String(state.revision || productionRevision);
    badShell = Boolean(state.badShell);
    networkDown = Boolean(state.networkDown);
    send(response, 200, JSON.stringify({ workerRevision, badShell, networkDown }), {
      'content-type': 'application/json; charset=utf-8'
    });
    return;
  }

  if (networkDown) {
    send(response, 503, 'Simulated origin outage', { 'content-type': 'text/plain; charset=utf-8' });
    return;
  }

  if (badShell && (pathname === '/' || pathname === '/index.html')) {
    send(
      response,
      200,
      '<!doctype html><html><head><meta charset="utf-8"><title>Broken trial shell</title></head><body><main id="bad-shell">Broken trial shell</main></body></html>',
      { 'content-type': 'text/html; charset=utf-8' }
    );
    return;
  }

  const relative = publicFiles.get(pathname);
  if (!relative) {
    send(response, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
    return;
  }
  const file = resolve(root, relative);

  try {
    let body = await readFile(file);
    if (pathname === '/sw.js') {
      const source = body.toString('utf8');
      body = source.replace(
        `const SHELL_REVISION = '${productionRevision}';`,
        `const SHELL_REVISION = '${workerRevision.replace(/[^a-zA-Z0-9._-]/g, '')}';`
      );
    }
    send(response, 200, body, {
      'content-type': contentTypes[extname(file).toLowerCase()] || 'application/octet-stream',
      ...(url.searchParams.get('runtimePolicy') === 'public'
        ? { 'cache-control': 'public, max-age=60' }
        : url.searchParams.get('runtimePolicy') === 'private'
          ? { 'cache-control': 'private, max-age=60' }
          : url.searchParams.get('runtimePolicy') === 'vary-cookie'
            ? { 'cache-control': 'public, max-age=60', vary: 'Cookie' }
            : {}),
      ...(pathname === '/sw.js' ? { 'service-worker-allowed': './' } : {})
    });
  } catch {
    send(response, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
  }
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch(error => {
    const status = error instanceof RequestError ? error.status : 500;
    const message = error instanceof RequestError ? error.message : 'Internal test server error';
    if (!(error instanceof RequestError)) console.error(error);
    send(response, status, message, { 'content-type': 'text/plain; charset=utf-8' });
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`OpenShop test server listening on ${origin}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
