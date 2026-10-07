import { ApiError } from '../../../shared/api/apiError';
import { IncidentDeletionReason } from '../../../shared/types/enums';
import type { IncidentField, ValidationIssue } from '../components/ValidationErrorDialog';
import type { EditLockReason } from '../types/incident';
import { MAX_PHOTOS_PER_INCIDENT } from './photoFile';

// Order in which fields appear on the form, so issues are listed top-to-bottom
export const FIELD_ORDER: IncidentField[] = ['location', 'incidentType', 'otherTypeDescription', 'imageUrl', 'description'];

export const SCHEMA_PATH_TO_FIELD: Record<string, IncidentField> = {
  latitude: 'location',
  longitude: 'location',
  incidentType: 'incidentType',
  otherTypeDescription: 'otherTypeDescription',
  imageUrl: 'imageUrl',
  description: 'description'
};

export interface IssueContext {
  description: string;
  otherDescription: string;
}

export function buildFieldIssue(field: IncidentField, schemaMessage: string, ctx: IssueContext): ValidationIssue {
  switch (field) {
    case 'location':
      return {
        field,
        icon: '📍',
        title: 'Location not set',
        message: 'We could not get your GPS position. Pin the spot where you found the threat on the map.',
        actionLabel: 'Pin on Map'
      };
    case 'incidentType':
      return {
        field,
        icon: '🏷️',
        title: 'Incident type not selected',
        message: 'Choose what you found, for example a Wire Snare, Animal Carcass or Illegal Campsite.',
        actionLabel: 'Choose Type'
      };
    case 'otherTypeDescription':
      return ctx.otherDescription.trim().length < 3
        ? {
            field,
            icon: '⚠️',
            title: 'Describe the "Other" threat',
            message: 'You chose Other Threat. Add a short name for it, for example "Fence breach".',
            actionLabel: 'Describe Threat'
          }
        : { field, icon: '⚠️', title: 'Threat details too long', message: schemaMessage, actionLabel: 'Shorten Text' };
    case 'imageUrl':
      return {
        field,
        icon: '📷',
        title: 'Photo evidence missing',
        message: 'Take or upload a clear photo of the scene. A photo is required as evidence.',
        actionLabel: 'Add Photo'
      };
    case 'description':
      if (ctx.description.trim().length === 0) {
        return {
          field,
          icon: '✍️',
          title: 'Description is empty',
          message: 'Write a short note about what you saw, such as quantity, landmarks or action taken.',
          actionLabel: 'Write Note'
        };
      }
      return ctx.description.length > 1000
        ? { field, icon: '✍️', title: 'Description too long', message: schemaMessage, actionLabel: 'Shorten Text' }
        : {
            field,
            icon: '✍️',
            title: 'Description too short',
            message: 'Add a little more detail (at least 3 characters).',
            actionLabel: 'Add Detail'
          };
  }
}

export function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort((a, b) => FIELD_ORDER.indexOf(a.field!) - FIELD_ORDER.indexOf(b.field!));
}

export function evidenceCountIssue(count: number): ValidationIssue | null {
  if (count < 1) {
    return {
      field: 'imageUrl',
      icon: '📷',
      title: 'At least one photo must remain',
      message: 'A report needs photo evidence. Undo a removal or add a new photo.',
      actionLabel: 'Add Photo'
    };
  }
  if (count > MAX_PHOTOS_PER_INCIDENT) {
    return {
      field: 'imageUrl',
      icon: '📷',
      title: 'Too many photos',
      message: `A report can have at most ${MAX_PHOTOS_PER_INCIDENT} photos. Remove ${count - MAX_PHOTOS_PER_INCIDENT} to continue.`,
      actionLabel: 'Remove Photo'
    };
  }
  return null;
}

export const EDIT_LOCK_MESSAGES: Record<EditLockReason, { short: string; message: string }> = {
  UNDER_INVESTIGATION: { short: 'Under investigation', message: 'A manager is already investigating this report, so it can no longer be changed.' },
  INCIDENT_RESOLVED: { short: 'Resolved', message: 'This incident has been resolved, so the report can no longer be changed.' },
  PATROL_COMPLETED: { short: 'Patrol completed', message: 'The patrol this report belongs to has been completed, so the report is now final.' },
  PATROL_CANCELLED: { short: 'Patrol cancelled', message: 'The patrol this report belongs to was cancelled, so the report is now final.' },
  EDIT_WINDOW_EXPIRED: { short: '24-hour edit window ended', message: 'Reports made outside a patrol can only be edited within 24 hours.' }
};

/**
 * Turns a failed create/save into a friendly popup issue.
 * Server error codes are mapped first; plain messages fall back to keyword matching.
 */
export type SubmitAction = 'submit' | 'save' | 'delete' | 'restore';

const FALLBACK_MESSAGES: Record<SubmitAction, { message: string; title: string }> = {
  submit: { message: 'Failed to submit incident report.', title: 'The server rejected this report' },
  save: { message: 'Failed to save your changes.', title: 'The server could not save your changes' },
  delete: { message: 'Failed to delete this report.', title: 'The server could not delete this report' },
  restore: { message: 'Failed to restore this report.', title: 'The server could not restore this report' }
};

export function buildSubmitIssue(error: unknown, action: SubmitAction, ctx: IssueContext): ValidationIssue {
  const message = error instanceof Error ? error.message : FALLBACK_MESSAGES[action].message;

  if (error instanceof ApiError) {
    switch (error.code) {
      case 'OFFLINE':
        return { icon: '📡', title: "You're offline", message };
      case 'INCIDENT_LOCKED':
        return { icon: '🔒', title: 'This report is locked', message };
      case 'EDIT_CONFLICT':
        return action === 'delete'
          ? {
              icon: '🔄',
              title: 'Changed on another device',
              message: 'This report was changed after you opened it. Review the latest version, then delete it if you still want to.'
            }
          : {
              icon: '🔄',
              title: 'Changed on another device',
              message: 'A newer version of this report was saved. Keep your changes on top of it, or load the latest version.'
            };
      case 'INCIDENT_DELETED':
        return { icon: '🗑️', title: 'Report already deleted', message: 'This report was already deleted, so there is nothing more to do.' };
      case 'INCIDENT_NOT_DELETED':
        return { icon: 'ℹ️', title: 'Report is not deleted', message: 'This report is already in your list.' };
      case 'SYNC_IN_PROGRESS':
      case 'ALREADY_SYNCED':
        return { icon: '⏳', title: 'Report is syncing', message };
      case 'OTHER_DESCRIPTION_REQUIRED':
        return buildFieldIssue('otherTypeDescription', message, { ...ctx, otherDescription: '' });
      case 'EVIDENCE_REQUIRED':
        return evidenceCountIssue(0)!;
      case 'TOO_MANY_EVIDENCE':
        return evidenceCountIssue(MAX_PHOTOS_PER_INCIDENT + 1)!;
      case 'EVIDENCE_NOT_FOUND':
        return { icon: '📷', title: 'Photo no longer available', message: 'One of the photos you removed was already changed. Load the latest version and try again.' };
      case 'LOCATION_TOO_FAR_FROM_PATROL':
        return { field: 'location', icon: '📍', title: 'Location too far from your patrol', message, actionLabel: 'Change Pin' };
      case 'NO_CHANGES':
        return { icon: '📝', title: 'No changes to save', message: 'Edit a field first, then save again.' };
      case 'INVALID_EDIT_TIME':
        return { icon: '🕒', title: 'Check your device clock', message };
      case 'FORBIDDEN':
        return { icon: '🔒', title: 'Not allowed', message };
      case 'INCIDENT_NOT_FOUND':
        return { icon: '🔎', title: 'Report not found', message: 'This report no longer exists.' };
      case 'PAYLOAD_TOO_LARGE':
        return { icon: '📦', title: 'Photo is too large to upload', message: 'Retake the photo or choose a smaller image, then try again.' };
      case 'VALIDATION_ERROR':
        return { icon: '⚠️', title: 'Some details were not accepted', message };
    }
  }

  if (/8 MB|too large/i.test(message)) {
    return { icon: '📦', title: 'Photo is too large to upload', message: 'Retake the photo or choose a smaller image, then submit again.' };
  }
  if (/unauthorized/i.test(message)) {
    return { icon: '🔒', title: 'Not allowed', message };
  }
  if (/on the device/i.test(message)) {
    return { icon: '💾', title: 'Could not save on this device', message };
  }
  return { icon: '📡', title: FALLBACK_MESSAGES[action].title, message };
}

export const DELETION_REASON_OPTIONS: Array<{ value: IncidentDeletionReason; label: string; hint: string }> = [
  { value: IncidentDeletionReason.DUPLICATE, label: 'Duplicate report', hint: 'The same incident was reported twice' },
  { value: IncidentDeletionReason.CREATED_BY_MISTAKE, label: 'Reported by mistake', hint: 'Wrong details or reported accidentally' },
  { value: IncidentDeletionReason.FALSE_ALARM, label: 'Not a real threat', hint: 'It turned out to be a false alarm' },
  { value: IncidentDeletionReason.OTHER, label: 'Other', hint: 'Explain in a short note' }
];
