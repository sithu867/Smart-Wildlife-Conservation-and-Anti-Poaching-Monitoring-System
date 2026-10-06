import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { prisma } from './config/prisma.js';
import { env } from './config/env.js';

const server = createServer(createApp());
let stopping = false;

async function shutdown(code = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  // Bound shutdown even if a request or database connection is stuck.
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(code);
  }, 4000);
  deadline.unref();
  try {
    await Promise.all([
      new Promise<void>(resolve => {
        if (!server.listening) return resolve();
        server.close(() => resolve());
        server.closeIdleConnections();
      }),
      prisma.$disconnect()
    ]);
  } finally {
    clearTimeout(deadline);
    process.exit(code);
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => { void shutdown(); });
}

// The root dev runner owns this process. Closing/crashing that runner also
// closes its IPC channel, so the API cannot be left behind holding its port.
if (process.env.WILDLIFE_DEV_MANAGED === '1') {
  process.on('message', message => {
    if ((message as { type?: string })?.type === 'shutdown') void shutdown();
  });
  process.on('disconnect', () => { void shutdown(); });
}

async function start(): Promise<void> {
  await connectDatabase();
  if (stopping) return;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.PORT, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  console.log(`WildlifeGuard API listening on port ${env.PORT}`);
  if (process.connected && process.env.WILDLIFE_DEV_MANAGED === '1') {
    process.send?.({ type: 'ready' });
  }
}

start().catch((error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${env.PORT} is already in use. Stop the earlier dev terminal with Ctrl+C before restarting.`
    : `Server startup failed: ${error.message}`);
  void shutdown(1);
});
