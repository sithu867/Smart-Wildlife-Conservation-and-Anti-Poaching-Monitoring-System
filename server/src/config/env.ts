import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().default(''),
  DIRECT_URL: z.string().default(''),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  COLLAR_INGESTION_API_KEY: z.string().default(''),
  COLLAR_WEBHOOK_SECRET: z.string().default(''),
  // Reverse geocoding (coordinates -> "Pannipitiya, Sri Lanka") via OpenStreetMap Nominatim.
  // Defaults to on, except under tests so they never call the public service.
  GEOCODING_ENABLED: z.enum(['true', 'false']).optional(),
  NOMINATIM_URL: z.string().default('https://nominatim.openstreetmap.org'),
  // Nominatim's usage policy requires a User-Agent that identifies the application
  GEOCODING_USER_AGENT: z.string().default('WildlifeGuard/0.1 (anti-poaching monitoring system)')
});
export const env = schema.parse(process.env);
