import type { RequestHandler } from 'express';
import { z } from 'zod';
import { analyticsService } from './service.js';
const query = z.object({ start: z.coerce.date().optional(), end: z.coerce.date().optional(), incidentType: z.string().optional(), severity: z.string().optional(), status: z.string().optional() });
const managerOnly: RequestHandler = (req, _res, next) => { if (req.header('x-user-role') !== 'MANAGER') throw new Error('Unauthorized: manager access required'); next(); };
const handler: RequestHandler = async (req, res, next) => { try { const filters = query.parse(req.query); if (filters.start && filters.end && filters.start > filters.end) return res.status(400).json({ success: false, error: { message: 'Start date must be before end date' } }); res.json({ success: true, data: await analyticsService.getAnalytics(filters) }); } catch (e) { next(e); } };
export const analyticsController = { managerOnly, get: handler };
