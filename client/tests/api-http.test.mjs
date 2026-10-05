import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

// Compile the actual transport source so these tests need neither a browser nor a server.
const source = await readFile(new URL('../src/api/http.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
});
const { request, ApiError, buildQuery } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('query parameters preserve false and zero and encode special characters', () => {
  assert.equal(
    buildQuery({ deferred: false, limit: 0, q: 'A&B', cursor: '', missing: undefined, nil: null }),
    '?deferred=false&limit=0&q=A%26B',
  );
  assert.equal(buildQuery(), '');
});

test('JSON requests preserve credentials, custom headers, and cancellation', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/v1/orders');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.headers.get('Content-Type'), 'application/json');
    assert.equal(init.headers.get('X-Request-ID'), 'demo');
    assert.equal(init.signal, controller.signal);
    return Response.json({ id: 'order' });
  });
  assert.deepEqual(
    await request('/orders', {
      method: 'POST',
      body: '{}',
      headers: { 'X-Request-ID': 'demo' },
      signal: controller.signal,
    }),
    { id: 'order' },
  );
});

test('bodyless commands omit JSON content type and accept 204 responses', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.headers.has('Content-Type'), false);
    return new Response(null, { status: 204 });
  });
  assert.equal(await request('/auth/logout', { method: 'POST' }), undefined);
});

test('binary proof uploads retain their MIME type and body', async (t) => {
  const proof = new Blob(['signature'], { type: 'image/png' });
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.body, proof);
    assert.equal(init.headers.get('Content-Type'), 'image/png');
    return Response.json({ byteSize: proof.size });
  });
  assert.deepEqual(
    await request('/proof/id', {
      method: 'PUT',
      body: proof,
      headers: { 'Content-Type': proof.type },
    }),
    { byteSize: proof.size },
  );
});

test('API failures preserve status and backend messages', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ message: 'Invalid allocation' }, { status: 409 }),
  );
  await assert.rejects(
    request('/planning/plans/id'),
    (error) =>
      error instanceof ApiError && error.status === 409 && error.message === 'Invalid allocation',
  );
});

test('non-JSON errors use the existing fallback message', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(
    request('/health'),
    (error) =>
      error instanceof ApiError && error.status === 503 && error.message === 'Request failed',
  );
});

async function domain(name) {
  const text = await readFile(new URL(`../src/api/domains/${name}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  const httpUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  const linked = compiled.replace(/from ['"]\.\.\/http['"]/g, `from '${httpUrl}'`);
  return import(`data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`);
}

test('manual allocation helpers use current routes and preserve optimistic versions', async (t) => {
  const { planningApi } = await domain('planning');
  const payload = { version: 7, tripId: 'trip', orderId: 'order', action: 'ADD' };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/v1/planning/plans/plan%2Fid/trip-orders');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), payload);
    return Response.json({ planId: 'plan/id', version: 8, tripCount: 1, deferredCount: 0 });
  });
  assert.equal((await planningApi.editTripOrders('plan/id', payload)).version, 8);
});

test('staging forwards explicit deferrals and acknowledgement unchanged', async (t) => {
  const { planningApi } = await domain('planning');
  const payload = { version: 3, orderIds: ['order'], deferrals: [], acknowledgeDeferral: true };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/v1/planning/plans/plan/stage');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), payload);
    return Response.json({ planId: 'plan', version: 4, tripCount: 1, deferredCount: 0 });
  });
  await planningApi.stage('plan', payload);
});

test('offline helper preserves command IDs and per-command rejection results', async (t) => {
  const { offlineApi } = await domain('offline');
  const command = {
    clientOperationId: 'operation',
    capturedAt: '2026-10-04T10:00:00Z',
    planId: 'plan',
    planVersion: 1,
    stopId: 'stop',
    action: 'ARRIVAL',
  };
  const result = {
    results: [
      {
        clientOperationId: 'operation',
        applied: false,
        error: { status: 409, code: 'CONFLICT', message: 'Stale plan' },
      },
    ],
  };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/v1/sync');
    assert.deepEqual(JSON.parse(init.body), { commands: [command] });
    return Response.json(result);
  });
  assert.deepEqual(await offlineApi.sync([command]), result);
});

test('proof helper uses shared transport without converting binary payloads to JSON', async (t) => {
  const { proofApi } = await domain('proof');
  const proof = new Blob(['signature'], { type: 'image/png' });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/v1/proof/proof%2Fid?ownerType=attempt&ownerId=attempt&kind=SIGNATURE');
    assert.equal(init.method, 'PUT');
    assert.equal(init.body, proof);
    assert.equal(init.headers.get('Content-Type'), proof.type);
    return Response.json({ id: 'proof/id', checksum: 'digest', byteSize: proof.size });
  });
  assert.equal(
    (
      await proofApi.upload(
        'proof/id',
        { ownerType: 'attempt', ownerId: 'attempt', kind: 'SIGNATURE' },
        proof,
        proof.type,
      )
    ).byteSize,
    proof.size,
  );
});
