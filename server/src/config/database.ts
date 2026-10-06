import { env } from './env.js';
import { prisma } from './prisma.js';

export async function connectDatabase(): Promise<void> {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required before starting the server. Configure server/.env with your Neon connection string.');
  }
  await prisma.$connect();
}
