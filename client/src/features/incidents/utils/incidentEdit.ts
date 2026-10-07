/**
 * UC-B helpers for UPDATE and DELETE on the client: the edit form state, working out exactly what changed
 * (only changed fields are sent), client-side edit validation and the delete request body.
 */
import { IncidentType, LocationSource } from '../../../shared/types/enums';
import type { ValidationIssue } from '../components/ValidationErrorDialog';
import type { ConservationIncident, DeleteIncidentPayload, IncidentDeletionReason, UpdateIncidentPayload } from '../types/incident';
import { buildFieldIssue, evidenceCountIssue, sortIssues } from './incidentFormIssues';
import { incidentTypeLabel } from './incidentTypes';

/** A photo added on the edit page that has not been saved yet. */
export interface NewEvidencePhoto {
  key: string;
  imageUrl: string;
  fileSize?: number;
  mimeType?: string;
  capturedAt: string;
}

/** Everything the ranger can change on the edit screen. */
export interface IncidentEditForm {
  incidentType: IncidentType;
  otherDescription: string;
  description: string;
  location: { latitude: number; longitude: number; source: LocationSource };
  removedEvidenceIds: string[];
  newPhotos: NewEvidencePhoto[];
}

/** The changed fields part of the PATCH body (without the concurrency/idempotency metadata). */
export type IncidentChanges = Omit<UpdateIncidentPayload, 'expectedUpdatedAt' | 'editedAt' | 'clientEditId'>;

/** One line of the "Review Your Changes" screen, e.g. "Incident type: Wire Snare -> Animal Carcass". */
export interface ChangeSummaryItem {
  key: string;
  icon: string;
  label: string;
  detail: string;
}

/** Starts the edit form from the saved report (nothing changed yet). */
export function formFromIncident(incident: ConservationIncident): IncidentEditForm {
  return {
    incidentType: incident.incidentType,
    otherDescription: incident.otherTypeDescription ?? '',
    description: incident.description,
    location: {
      latitude: incident.location.latitude,
      longitude: incident.location.longitude,
      source: incident.location.source
    },
    removedEvidenceIds: [],
    newPhotos: []
  };
}

/** Great-circle distance in metres. */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** 120 -> "120 m", 1500 -> "1.5 km". */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** How many photos the report will have after this edit (kept + newly added). */
export function activeEvidenceCount(original: ConservationIncident, form: IncidentEditForm): number {
  const kept = original.evidence.filter(ev => !ev.evidenceId || !form.removedEvidenceIds.includes(ev.evidenceId)).length;
  return kept + form.newPhotos.length;
}

const truncate = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Compares the form with the original report and returns only what changed (for the PATCH body and the review screen). */
export function buildIncidentChanges(original: ConservationIncident, form: IncidentEditForm): { changes: IncidentChanges; summary: ChangeSummaryItem[] } {
  const changes: IncidentChanges = {};
  const summary: ChangeSummaryItem[] = [];

  if (form.incidentType !== original.incidentType) {
    changes.incidentType = form.incidentType;
    summary.push({
      key: 'incidentType',
      icon: '🏷️',
      label: 'Incident type',
      detail: `${incidentTypeLabel(original.incidentType)} → ${incidentTypeLabel(form.incidentType)}`
    });
  }

  if (form.incidentType === IncidentType.OTHER) {
    const other = form.otherDescription.trim();
    if (other !== (original.otherTypeDescription ?? '')) {
      changes.otherTypeDescription = other;
      summary.push({ key: 'otherTypeDescription', icon: '⚠️', label: 'Threat name', detail: `"${truncate(other)}"` });
    }
  }

  const description = form.description.trim();
  if (description !== original.description) {
    changes.description = description;
    summary.push({ key: 'description', icon: '✍️', label: 'Description', detail: `"${truncate(description)}"` });
  }

  const from = original.location;
  const to = form.location;
  if (from.latitude !== to.latitude || from.longitude !== to.longitude || from.source !== to.source) {
    changes.location = { latitude: to.latitude, longitude: to.longitude, source: to.source };
    summary.push({
      key: 'location',
      icon: '📍',
      label: 'Location',
      detail: `Moved ${formatDistance(distanceMeters(from, to))} (${to.source})`
    });
  }

  if (form.removedEvidenceIds.length > 0) changes.removeEvidenceIds = [...form.removedEvidenceIds];
  if (form.newPhotos.length > 0) {
    changes.addEvidence = form.newPhotos.map(photo => ({
      imageUrl: photo.imageUrl,
      capturedAt: photo.capturedAt,
      fileSize: photo.fileSize,
      mimeType: photo.mimeType
    }));
  }
  if (form.removedEvidenceIds.length > 0 || form.newPhotos.length > 0) {
    const parts = [];
    if (form.newPhotos.length > 0) parts.push(`${form.newPhotos.length} added`);
    if (form.removedEvidenceIds.length > 0) parts.push(`${form.removedEvidenceIds.length} removed`);
    summary.push({ key: 'evidence', icon: '📷', label: 'Photos', detail: parts.join(', ') });
  }

  return { changes, summary };
}

/** Body for withdrawing a report the ranger is looking at (its current version must still be the latest). */
export function buildDeletePayload(incident: ConservationIncident, reason: IncidentDeletionReason, note?: string): DeleteIncidentPayload {
  return {
    expectedUpdatedAt: incident.updatedAt!,
    deletedAt: new Date().toISOString(),
    clientDeleteId: `delete-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    reason,
    ...(note ? { note } : {})
  };
}

/** Short label used in delete dialogs and toasts. */
export function incidentDisplayName(incident: ConservationIncident): string {
  return incident.incidentType === IncidentType.OTHER && incident.otherTypeDescription
    ? incident.otherTypeDescription
    : incidentTypeLabel(incident.incidentType);
}

/** Client-side checks for the edit form, mirroring the server's merged-result validation. */
export function validateEditForm(original: ConservationIncident, form: IncidentEditForm): ValidationIssue[] {
  const ctx = { description: form.description, otherDescription: form.otherDescription };
  const issues: ValidationIssue[] = [];

  if (form.incidentType === IncidentType.OTHER) {
    const other = form.otherDescription.trim();
    if (other.length < 3) {
      issues.push(buildFieldIssue('otherTypeDescription', '', ctx));
    } else if (other.length > 200) {
      issues.push(buildFieldIssue('otherTypeDescription', 'Other type description cannot exceed 200 characters', ctx));
    }
  }

  const evidenceIssue = evidenceCountIssue(activeEvidenceCount(original, form));
  if (evidenceIssue) issues.push(evidenceIssue);

  const description = form.description.trim();
  if (description.length < 3) {
    issues.push(buildFieldIssue('description', '', ctx));
  } else if (description.length > 1000) {
    issues.push(buildFieldIssue('description', 'Description cannot exceed 1000 characters', ctx));
  }

  return sortIssues(issues);
}
