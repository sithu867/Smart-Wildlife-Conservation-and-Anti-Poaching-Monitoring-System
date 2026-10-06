import { fork } from 'node:child_process';
import { readFileSync, watch } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, join } from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { createServer as createViteServer } from 'vite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverRoot = join(root, 'server');
let vite;
let backend;
let watcher;
let restartTimer;
let restartQueue = Promise.resolve();
let stopping = false;
const expectedExits = new WeakSet();

function portNumber(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}

async function checkPort(port) {
  // Binding checks IPv4/IPv6 availability without relying on Windows WMI.
  await new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', error => reject(error.code === 'EADDRINUSE'
      ? new Error(`Port ${port} is already in use. Stop the earlier dev terminal with Ctrl+C, then run npm run dev again.`)
      : error));
    probe.listen({ port, exclusive: true }, () => probe.close(resolve));
  });
}

function startBackend() {
  return new Promise((resolve, reject) => {
    // No npm/cmd/tsx-watch grandchildren: one directly owned Node child.
    const child = fork(join(serverRoot, 'src/server.ts'), [], {
      cwd: serverRoot,
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, WILDLIFE_DEV_MANAGED: '1' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      windowsHide: true
    });
    backend = child;
    let ready = false;
    const timeout = setTimeout(() => reject(new Error('API startup timed out.')), 30000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.on('message', message => {
      if (message?.type !== 'ready' || ready) return;
      ready = true;
      clearTimeout(timeout);
      resolve();
    });
    child.once('exit', code => {
      clearTimeout(timeout);
      if (!ready) reject(new Error(`API exited before startup (code ${code}).`));
      if (ready && !stopping && !expectedExits.has(child)) {
        console.error('API stopped; closing the frontend too.');
        void shutdown(code || 1);
      }
    });
  });
}

async function stopBackend() {
  const child = backend;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  expectedExits.add(child);
  await new Promise(resolve => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
    if (child.connected) {
      child.send({ type: 'shutdown' }, error => { if (error) child.kill(); });
    } else {
      child.kill();
    }
  });
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  clearTimeout(restartTimer);
  watcher?.close();
  const deadline = setTimeout(() => process.exit(code || 1), 8000);
  await Promise.allSettled([stopBackend(), vite?.close()]);
  clearTimeout(deadline);
  console.log('Dev servers stopped.');
  process.exit(code);
}

function fail(error) {
  console.error(error.message);
  void shutdown(1);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => { void shutdown(); });
}
// Handle Ctrl+C directly as well as OS signals. Some Windows pseudo-terminals
// send the character without broadcasting SIGINT to the child process.
if (process.stdin.isTTY) {
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('keypress', (_text, key) => {
    if (key?.name === 'q' || (key?.ctrl && key.name === 'c')) void shutdown();
  });
}
// Used by a parent supervisor (and the lifecycle regression tests).
if (process.send) {
  process.on('message', message => {
    if (message?.type === 'shutdown') void shutdown();
  });
  process.on('disconnect', () => { void shutdown(); });
}

async function main() {
  let fileEnv = {};
  try { fileEnv = parse(readFileSync(join(serverRoot, '.env'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const apiPort = portNumber(process.env.PORT ?? fileEnv.PORT ?? 5000, 'PORT');
  const clientPort = portNumber(process.env.DEV_CLIENT_PORT ?? 5173, 'DEV_CLIENT_PORT');
  if (apiPort === clientPort) throw new Error('API and frontend ports must be different.');
  await checkPort(apiPort);
  await checkPort(clientPort);
  if (stopping) return;

  vite = await createViteServer({
    root: join(root, 'client'),
    configFile: join(root, 'client/vite.config.ts'),
    clearScreen: false,
    server: { port: clientPort, strictPort: true }
  });
  if (stopping) { await vite.close(); return; }
  await startBackend();
  if (stopping) return;
  await vite.listen();
  vite.printUrls();
  console.log('Both dev servers are ready. Press Ctrl+C or q to stop both.');

  watcher = watch(join(serverRoot, 'src'), { recursive: true }, (_event, filename) => {
    if (!filename || !/\.[cm]?[jt]s$/.test(String(filename))) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      restartQueue = restartQueue.then(async () => {
        if (stopping) return;
        console.log('Server source changed; restarting API...');
        await stopBackend();
        if (!stopping) await startBackend();
      }).catch(fail);
    }, 250);
  });
  watcher.on('error', fail);
  if (process.connected) process.send?.({ type: 'ready', backendPid: backend.pid });
}

main().catch(fail);
