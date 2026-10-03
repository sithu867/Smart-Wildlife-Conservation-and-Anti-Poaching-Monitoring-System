import mongoose from 'mongoose';
import { env } from './env.js';
export async function connectDatabase(): Promise<void> { if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required before starting the server. Configure server/.env from server/.env.example.'); await mongoose.connect(env.MONGODB_URI); }
