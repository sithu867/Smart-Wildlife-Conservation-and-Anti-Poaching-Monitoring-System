import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

// Use public DNS resolvers for Atlas SRV records when the local DNS resolver
// refuses Node's SRV lookup (common on some Windows networks).
dns.setServers(['1.1.1.1', '8.8.8.8']);

export async function connectDatabase(): Promise<void> {
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required before starting the server. Configure server/.env from server/.env.example.');
  }
  await mongoose.connect(env.MONGODB_URI);
}
