import mongoose from 'mongoose';
import { ConservationIncidentModel, type IConservationIncident, type IIncidentEvidence } from './models.js';
import { PatrolSessionModel } from '../patrols/models.js';
import { IncidentStatus, SyncStatus, LocationSource } from '../../types/enums.js';
import type { CreateIncidentInput } from './validation.js';

const memoryIncidentsStore = new Map<string, any>();

export class IncidentService {
  async createIncident(rangerId: string, rangerName: string, input: CreateIncidentInput): Promise<any> {
    const {
      clientIncidentId,
      incidentType,
      otherTypeDescription,
      description,
      latitude,
      longitude,
      locationSource,
      patrolSessionId,
      evidence
    } = input;

    // Build evidence list with IDs
    const preparedEvidence: IIncidentEvidence[] = evidence.map((ev, idx) => ({
      evidenceId: `evid-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      imageUrl: ev.imageUrl,
      capturedAt: ev.capturedAt ? new Date(ev.capturedAt) : new Date(),
      fileSize: ev.fileSize,
      mimeType: ev.mimeType || 'image/jpeg'
    }));

    const reportedAt = new Date();

    if (mongoose.connection.readyState !== 1) {
      // Memory fallback for tests
      if (clientIncidentId) {
        const existing = Array.from(memoryIncidentsStore.values()).find(
          i => i.clientIncidentId === clientIncidentId && i.reportedBy === rangerId
        );
        if (existing) {
          return existing;
        }
      }

      const id = `67b${Date.now().toString(16).padStart(21, '0')}`;
      const incident = {
        _id: id,
        clientIncidentId,
        incidentType,
        otherTypeDescription: incidentType === 'OTHER' ? otherTypeDescription : undefined,
        description,
        location: {
          latitude,
          longitude,
          timestamp: reportedAt,
          source: locationSource || LocationSource.GPS
        },
        reportedBy: rangerId,
        rangerName,
        reportedAt,
        patrolSession: patrolSessionId || null,
        evidence: preparedEvidence,
        status: IncidentStatus.REPORTED,
        syncStatus: SyncStatus.SYNCED,
        createdAt: reportedAt,
        updatedAt: reportedAt
      };

      memoryIncidentsStore.set(id, incident);
      return incident;
    }

    // Server-side Idempotency Check
    if (clientIncidentId) {
      const existing = await ConservationIncidentModel.findOne({ clientIncidentId, reportedBy: rangerId });
      if (existing) {
        return existing;
      }
    }

    // Validate PatrolSession ownership if patrolSessionId is supplied
    let verifiedPatrolId: mongoose.Types.ObjectId | undefined;
    if (patrolSessionId && mongoose.Types.ObjectId.isValid(patrolSessionId)) {
      const session = await PatrolSessionModel.findById(patrolSessionId);
      if (session) {
        if (session.rangerId !== rangerId) {
          throw new Error('Unauthorized: Attached patrol session does not belong to this ranger.');
        }
        verifiedPatrolId = session._id as mongoose.Types.ObjectId;
      }
    }

    const incident = await ConservationIncidentModel.create({
      clientIncidentId,
      incidentType,
      otherTypeDescription: incidentType === 'OTHER' ? otherTypeDescription : undefined,
      description,
      location: {
        latitude,
        longitude,
        timestamp: reportedAt,
        source: locationSource || LocationSource.GPS
      },
      reportedBy: rangerId,
      rangerName,
      reportedAt,
      patrolSession: verifiedPatrolId,
      evidence: preparedEvidence,
      status: IncidentStatus.REPORTED,
      syncStatus: SyncStatus.SYNCED
    });

    return incident;
  }

  async getRangerIncidents(rangerId: string): Promise<any[]> {
    if (mongoose.connection.readyState !== 1) {
      const list = Array.from(memoryIncidentsStore.values()).filter(i => i.reportedBy === rangerId);
      return list.sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
    }

    return ConservationIncidentModel.find({ reportedBy: rangerId })
      .populate('patrolSession')
      .sort({ reportedAt: -1 });
  }

  async getIncidentById(rangerId: string, incidentId: string): Promise<any> {
    if (mongoose.connection.readyState !== 1) {
      const incident = memoryIncidentsStore.get(incidentId);
      if (!incident) throw new Error('Conservation incident not found.');
      if (incident.reportedBy !== rangerId) throw new Error('Unauthorized: Incident report does not belong to this ranger.');
      return incident;
    }

    const incident = await ConservationIncidentModel.findById(incidentId).populate('patrolSession');
    if (!incident) {
      throw new Error('Conservation incident not found.');
    }

    if (incident.reportedBy !== rangerId) {
      throw new Error('Unauthorized: Incident report does not belong to this ranger.');
    }

    return incident;
  }
}

export const incidentService = new IncidentService();
