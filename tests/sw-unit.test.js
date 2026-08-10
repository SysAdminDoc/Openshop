import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('sw.js', 'utf8');

function makeCaches() {
  const stores = new Map();
  const keyFor = request => typeof request === 'string' ? request : request.url;
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async keys() {
        return [...entries.keys()].map(url => new Request(url));
      },
      async match(request) {
        const response = entries.get(keyFor(request));
        return response?.clone();
      },
      async put(request, response) {
        entries.set(keyFor(request), response.clone());
      },
      async delete(request) {
        return entries.delete(keyFor(request));
      }
    };
  };
  return {
    stores,
    async open(name) { return cache(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
}

function loadWorker(workerSource, query = '') {
  const worker = {
    listeners:new Map(),
    registration:{ scope:'https://example.test/' },
    location:new URL(`https://example.test/sw.js${query}`),
    clients:{ claim:vi.fn().mockResolvedValue(undefined) },
    skipWaiting:vi.fn().mockResolvedValue(undefined),
    addEventListener(type, handler) { this.listeners.set(type, handler); }
  };
  vi.stubGlobal('self', worker);
  new Function(workerSource)();
  return worker;
}

async function runLifecycle(worker, type) {
  let pending;
  const event = { waitUntil(value) { pending = value; } };
  worker.listeners.get(type)(event);
  await pending;
}

async function getStatus(worker) {
  let response;
  let pending;
  worker.listeners.get('message')({
    data:{ type:'OPENSHOP_GET_STATUS' },
    source:{ url:'https://example.test/' },
    ports:[{ postMessage(value) { response = value; } }],
    waitUntil(value) { pending = value; }
  });
  await pending;
  if (!response?.ok) throw new Error(response?.error || 'status request failed');
  return response.status;
}

describe('offline shell promotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the old verified shell active and resumes a terminated candidate copy', async () => {
    const caches = makeCaches();
    vi.stubGlobal('caches', caches);
    vi.stubGlobal('fetch', vi.fn(async request => new Response(`asset:${request.url || request}`, {
      status:200,
      headers:{ 'content-type':'application/octet-stream' }
    })));

    const productionRevision = source.match(/const SHELL_REVISION = '([^']+)'/)?.[1];
    const nextRevision = 'test-v2-promotion';
    const nextSource = source.replace(
      `const SHELL_REVISION = '${productionRevision}';`,
      `const SHELL_REVISION = '${nextRevision}';`
    ).replace(
      'const TRUSTED_SHELL_REVISIONS = new Set([\n    SHELL_REVISION,',
      `const TRUSTED_SHELL_REVISIONS = new Set([\n    SHELL_REVISION,\n    '${productionRevision}',`
    );

    const initial = loadWorker(source);
    await runLifecycle(initial, 'install');
    await runLifecycle(initial, 'activate');
    const before = await getStatus(initial);
    expect(before).toMatchObject({
      activeRevision:productionRevision,
      shellReady:true,
      requiredCached:before.requiredTotal
    });

    const interrupted = loadWorker(nextSource, '?openshop-test-abort-promotion=1');
    await expect(runLifecycle(interrupted, 'install')).rejects.toThrow('promotion interruption');
    const afterAbort = await getStatus(interrupted);
    expect(afterAbort).toMatchObject({
      activeRevision:productionRevision,
      shellReady:true,
      requiredCached:afterAbort.requiredTotal
    });

    const resumed = loadWorker(nextSource);
    await runLifecycle(resumed, 'install');
    await runLifecycle(resumed, 'activate');
    const afterResume = await getStatus(resumed);
    expect(afterResume).toMatchObject({
      activeRevision:nextRevision,
      previousRevision:productionRevision,
      shellReady:true,
      requiredCached:afterResume.requiredTotal
    });
    expect(afterResume.rollbackAvailable).toBe(true);
  });
});
