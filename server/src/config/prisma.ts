import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { env } from './env.js';

const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });

