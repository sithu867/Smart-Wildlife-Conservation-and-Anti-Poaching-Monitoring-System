import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
async function start() { await connectDatabase(); createApp().listen(env.PORT, () => console.log(`WildlifeGuard API listening on port ${env.PORT}`)); }
start().catch(error => { console.error('Server startup failed:', error); process.exitCode = 1; });
