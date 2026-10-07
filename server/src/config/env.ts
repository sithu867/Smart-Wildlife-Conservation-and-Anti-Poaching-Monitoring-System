import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().default(''),
  DIRECT_URL: z.string().default(''),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  COLLAR_INGESTION_API_KEY: z.string().default('')
});
export const env = schema.parse(process.env);
