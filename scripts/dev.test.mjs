import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { stat, utimes } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

async function unusedPort() {
  const server = createServer();
  server.listen(0);
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function ports() {
  const api = await unusedPort();
  let client = await unusedPort();
  while (client === api) client = await unusedPort();
  return { api, client };
}

function launch(selected, overrides = {}) {
  const child = fork(new URL('./dev.mjs', import.meta.url), [], {
    execArgv: [],
    env: {
      ...process.env,
      PORT: String(selected.api),
      DEV_CLIENT_PORT: String(selected.client),
      CLIENT_URL: `http://localhost:${selected.client}`,
      NODE_ENV: 'test',
      // Prisma creates a lazy pool; these tests call only /api/health.
      // The real server/.env database credentials are never used.
      DATABASE_URL: 'postgresql://test:test@localhost:1/dev_lifecycle_test',
      DIRECT_URL: 'postgresql://test:test@localhost:1/dev_lifecycle_test',
      ...overrides
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const exited = once(child, 'exit');
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Dev startup timed out:\n${output}`)), 25000);
    child.on('message', message => {
      if (message?.type === 'ready') { clearTimeout(timer); resolve(message); }
    });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(output)); });
    child.once('error', reject);
  });
  // Some tests intentionally reject startup; avoid an unhandled rejection.
  ready.catch(() => {});
  return { child, ready, exited, output: () => output };
}

async function stop(run) {
  if (run.child.exitCode !== null || run.child.signalCode !== null) return;
  const deadline = setTimeout(() => run.child.kill('SIGKILL'), 7000);
  if (run.child.connected) run.child.send({ type: 'shutdown' });
  else run.child.kill();
  await run.exited;
  clearTimeout(deadline);
}

async function portIsFree(port) {
  const probe = createServer();
  return new Promise(resolve => {
    probe.once('error', () => resolve(false));
    probe.listen({ port, exclusive: true }, () => probe.close(() => resolve(true)));
  });
}

async function eventually(check) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await check()) return;
    await delay(100);
  }
  assert.fail('Condition not met within 8 seconds.');
}

async function verifyHttp(selected) {
  const response = await fetch(`http://localhost:${selected.api}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.service, 'wildlife-guard-api');
  assert.equal((await fetch(`http://localhost:${selected.client}/`)).status, 200);
}

test('start, stop, and start again release both listening ports', { timeout: 60000 }, async t => {
  const selected = await ports();
  for (let cycle = 0; cycle < 2; cycle++) {
    const run = launch(selected);
    t.after(() => stop(run));
    await run.ready;
    await verifyHttp(selected);
    await stop(run);
    assert.equal((await run.exited)[0], 0, run.output());
    assert.equal(await portIsFree(selected.api), true);
    assert.equal(await portIsFree(selected.client), true);
  }
});

test('a second start fails clearly without disturbing the running apps', { timeout: 40000 }, async t => {
  const selected = await ports();
  const first = launch(selected);
  t.after(() => stop(first));
  await first.ready;
  const duplicate = launch(selected);
  t.after(() => stop(duplicate));
  assert.equal((await duplicate.exited)[0], 1, duplicate.output());
  assert.match(duplicate.output(), /Port \d+ is already in use/);
  await verifyHttp(selected);
});

test('an occupied frontend port prevents API startup and is not taken over', { timeout: 30000 }, async t => {
  const selected = await ports();
  const occupied = createServer();
  occupied.listen(selected.client);
  await once(occupied, 'listening');
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const run = launch(selected);
  t.after(() => stop(run));
  assert.equal((await run.exited)[0], 1, run.output());
  assert.match(run.output(), new RegExp(`Port ${selected.client} is already in use`));
  assert.equal(occupied.listening, true);
  assert.equal(await portIsFree(selected.api), true);
});

test('server source reload waits for the old API to exit before rebinding', { timeout: 40000 }, async t => {
  const selected = await ports();
  const source = new URL('../server/src/server.ts', import.meta.url);
  const times = await stat(source);
  const run = launch(selected);
  t.after(async () => { await stop(run); await utimes(source, times.atime, times.mtime); });
  const { backendPid } = await run.ready;
  // Trigger the real file watcher without altering any source contents.
  await utimes(source, new Date(), new Date());
  await eventually(() => (run.output().match(/WildlifeGuard API listening/g) ?? []).length >= 2);
  assert.throws(() => process.kill(backendPid, 0), { code: 'ESRCH' });
  assert.doesNotMatch(run.output(), /EADDRINUSE|already in use/);
  await verifyHttp(selected);
});

test('killing the dev parent closes its API child through IPC disconnect', { timeout: 40000 }, async t => {
  const selected = await ports();
  const run = launch(selected);
  t.after(() => stop(run));
  const { backendPid } = await run.ready;
  run.child.kill('SIGKILL');
  await run.exited;
  await eventually(async () => await portIsFree(selected.api) && await portIsFree(selected.client));
  await eventually(() => {
    try { process.kill(backendPid, 0); return false; }
    catch (error) { return error.code === 'ESRCH'; }
  });
});

test('an API crash closes the frontend and exits the dev runner', { timeout: 40000 }, async t => {
  const selected = await ports();
  const run = launch(selected);
  t.after(() => stop(run));
  const { backendPid } = await run.ready;
  process.kill(backendPid, 'SIGKILL');
  assert.equal((await run.exited)[0], 1, run.output());
  assert.equal(await portIsFree(selected.api), true);
  assert.equal(await portIsFree(selected.client), true);
});

test('API startup failure exits and releases the frontend', { timeout: 40000 }, async t => {
  const selected = await ports();
  const run = launch(selected, { DATABASE_URL: '' });
  t.after(() => stop(run));
  assert.equal((await run.exited)[0], 1, run.output());
  assert.match(run.output(), /DATABASE_URL is required/);
  assert.equal(await portIsFree(selected.api), true);
  assert.equal(await portIsFree(selected.client), true);
});
