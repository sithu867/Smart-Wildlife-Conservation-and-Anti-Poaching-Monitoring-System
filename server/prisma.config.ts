import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Neon migrations should use the direct connection when supplied.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  },
});
