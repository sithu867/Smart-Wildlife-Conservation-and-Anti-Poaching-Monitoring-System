import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({ PORT: z.coerce.number().default(5001), MONGODB_URI: z.string().default(''), CLIENT_URL: z.string().default('http://localhost:5173'), NODE_ENV: z.enum(['development','test','production']).default('development') });
export const env = schema.parse(process.env);
