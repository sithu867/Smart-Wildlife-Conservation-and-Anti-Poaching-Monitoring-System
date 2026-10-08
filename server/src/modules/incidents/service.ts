import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { invalidParkScope, validateOptionalPark } from '../shared/parkScope.js';
import { IncidentStatus, SyncStatus, LocationSource } from '../../types/enums.js';
import type { CreateIncidentInput } from './validation.js';

const incidentInclude = { patrolSession: true, evidence: { orderBy: { capturedAt: 'asc' as const } } } as const;
type IncidentWithRelations = Prisma.ConservationIncidentGetPayload<{ include: typeof incidentInclude }>;
function shapeIncident(incident: IncidentWithRelations) { const { id, patrolSession, evidence, ...rest } = incident; return { _id: id, ...rest, patrolSession, evidence }; }

export class IncidentService {
  async createIncident(rangerId: string, rangerName: string, input: CreateIncidentInput) {
    const reportedAt = new Date();
    let patrolSessionId: string | undefined;
    let parkId = input.parkId;
    if (input.patrolSessionId) {
      const session = await prisma.patrolSession.findUnique({ where: { id: input.patrolSessionId }, include: { patrolRoute: { select: { parkId: true } } } });
      if (session && session.rangerId !== rangerId) throw new Error('Unauthorized: Attached patrol session does not belong to this ranger.');
      if (session) {
        // A patrol's route is authoritative. Store its park as well so scope
        // survives a later session deletion (the existing relation uses SetNull).
        const sessionParkId = session.patrolRoute.parkId;
        if (parkId && parkId !== sessionParkId)
          invalidParkScope('Selected park does not match the attached patrol session.');
        parkId = sessionParkId;
        patrolSessionId = session.id;
      }
    }
    if (input.clientIncidentId) {
      const existing = await prisma.conservationIncident.findFirst({ where: { clientIncidentId: input.clientIncidentId, reportedBy: rangerId }, include: incidentInclude });
      if (existing) return shapeIncident(existing);
    }
    await validateOptionalPark(parkId);
    const incident = await prisma.conservationIncident.create({ data: { parkId, clientIncidentId: input.clientIncidentId, incidentType: input.incidentType, otherTypeDescription: input.incidentType === 'OTHER' ? input.otherTypeDescription : undefined, description: input.description, location: { latitude: input.latitude, longitude: input.longitude, timestamp: reportedAt.toISOString(), source: input.locationSource || LocationSource.GPS }, reportedBy: rangerId, rangerName, reportedAt, patrolSessionId, status: IncidentStatus.REPORTED, syncStatus: SyncStatus.SYNCED, evidence: { create: input.evidence.map((ev, idx) => ({ evidenceId: `evid-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`, imageUrl: ev.imageUrl, capturedAt: ev.capturedAt ? new Date(ev.capturedAt) : reportedAt, fileSize: ev.fileSize, mimeType: ev.mimeType || 'image/jpeg' })) } }, include: incidentInclude });
    return shapeIncident(incident);
  }

  async getRangerIncidents(rangerId: string) {
    const incidents = await prisma.conservationIncident.findMany({ where: { reportedBy: rangerId }, include: incidentInclude, orderBy: { reportedAt: 'desc' } });
    return incidents.map(shapeIncident);
  }

  async getIncidentById(rangerId: string, incidentId: string) {
    const incident = await prisma.conservationIncident.findUnique({ where: { id: incidentId }, include: incidentInclude });
    if (!incident) throw new Error('Conservation incident not found.');
    if (incident.reportedBy !== rangerId) throw new Error('Unauthorized: Incident report does not belong to this ranger.');
    return shapeIncident(incident);
  }
}

export const incidentService = new IncidentService();
