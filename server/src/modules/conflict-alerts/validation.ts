import { z } from 'zod';
import {
  AlertSource,
  ConflictAlertType,
  AlertSeverity,
  AlertStatus,
  ResponseAction,
  LocationSource
} from '../../types/enums.js';

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timestamp: z.string().optional(),
  source: z.nativeEnum(LocationSource).optional().default(LocationSource.GPS),
  accuracy: z.number().optional()
});

export const createAlertSchema = z.object({
  clientAlertId: z.string().optional(),
  sourceEventId: z.string().optional(),
  source: z.nativeEnum(AlertSource),
  alertType: z.nativeEnum(ConflictAlertType),
  severity: z.nativeEnum(AlertSeverity),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: z.string().min(3, 'Description must be at least 3 characters'),
  animalId: z.string().optional(),
  reporterName: z.string().optional(),
  locationSource: z.nativeEnum(LocationSource).optional().default(LocationSource.GPS)
});

export const simulateCollarSchema = z.object({
  sourceEventId: z.string().optional(),
  animalId: z.string().min(1, 'Animal ID is required'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  alertType: z.nativeEnum(ConflictAlertType).optional().default(ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY),
  severity: z.nativeEnum(AlertSeverity).optional().default(AlertSeverity.HIGH),
  description: z.string().optional()
});

export const communityReportSchema = z.object({
  sourceEventId: z.string().optional(),
  reporterName: z.string().optional().default('Community Member'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  reportType: z.nativeEnum(ConflictAlertType),
  description: z.string().min(5, 'Report description must be at least 5 characters'),
  severity: z.nativeEnum(AlertSeverity).optional().default(AlertSeverity.MEDIUM)
});

export const addResponseSchema = z.object({
  clientResponseId: z.string().min(1).optional(),
  action: z.nativeEnum(ResponseAction),
  notes: z.string().min(3, 'Response notes must be at least 3 characters'),
  outcome: z.string().optional(),
  markResolved: z.boolean().optional().default(false),
  resolutionNotes: z.string().optional()
});

export const acknowledgeAlertSchema = z.object({
  clientAcknowledgementId: z.string().min(1).optional()
});

export const resolveAlertSchema = z.object({
  clientActionId: z.string().min(1).optional(),
  resolutionNotes: z.string().min(3, 'Resolution notes are required when resolving an alert'),
  outcome: z.string().optional()
});

export type CreateAlertInput = z.infer<typeof createAlertSchema>;
export type SimulateCollarInput = z.infer<typeof simulateCollarSchema>;
export type CommunityReportInput = z.infer<typeof communityReportSchema>;
export type AddResponseInput = z.infer<typeof addResponseSchema>;
export type ResolveAlertInput = z.infer<typeof resolveAlertSchema>;
