import { prisma } from '../../config/prisma.js';
import type { AnalysisCriteria, AnalyticsResult, ParkOption } from './contract.js';
import { calculateIncidentStatistics, calculateConflictTrends, groupBy } from './calculations.js';
import { calculateIncidentHotspots } from './hotspots.js';
import { calculatePatrolCoverage } from './patrolCoverage.js';
import { HWC_SCOPE_NOTICE } from './contract.js';
import { analysisCriteriaSchema, analysisDateRange } from './validation.js';

export class AnalyticsCriteriaError extends Error {}
const option = (park: any): ParkOption => ({ id: park.id, name: park.name, code: park.code });
export async function listAnalyticsParks(): Promise<ParkOption[]> { const parks = await prisma.park.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }); return parks.map(option); }

export async function getCriteriaAnalytics(input: AnalysisCriteria): Promise<AnalyticsResult> {
  const criteria = analysisCriteriaSchema.parse(input);
  const park = await prisma.park.findUnique({ where: { id: criteria.parkId }, select: { id: true, name: true, code: true } });
  if (!park) throw new AnalyticsCriteriaError('The selected Park / Conservation Area does not exist. Please select another park.');
  const selected = new Set(criteria.categories);
  const wantsIncidents = selected.has('INCIDENT_STATISTICS') || selected.has('INCIDENT_HOTSPOTS');
  const wantsPatrols = selected.has('PATROL_COVERAGE');
  const wantsConflicts = selected.has('HWC_TRENDS');
  const { start, end } = analysisDateRange(criteria);
  const routes = wantsIncidents || wantsPatrols ? await prisma.patrolRoute.findMany({ where: { parkId: park.id }, select: { id: true, name: true, geometry: true } }) : [];
  const routeIds = routes.map((route: any) => route.id);
  const scopedSessions = wantsIncidents ? await prisma.patrolSession.findMany({ where: { patrolRouteId: { in: routeIds } }, select: { id: true } }) : [];
  const incidentRows: any[] = wantsIncidents ? await prisma.conservationIncident.findMany({ where: { patrolSessionId: { in: scopedSessions.map((s: any) => s.id) }, reportedAt: { gte: start, lte: end }, reportedBy: criteria.rangerId, incidentType: criteria.incidentType as any, status: criteria.incidentStatus as any }, select: { incidentType: true, status: true, reportedAt: true, location: true } }) : [];
  const sessions: any[] = wantsPatrols ? await prisma.patrolSession.findMany({ where: { patrolRouteId: { in: routeIds }, rangerId: criteria.rangerId }, include: { waypoints: true } }) : [];
  const alertRows: any[] = wantsConflicts ? await prisma.wildlifeConflictAlert.findMany({ where: { createdAt: { gte: start, lte: end }, acknowledgedBy: criteria.rangerId, severity: criteria.severity as any, status: criteria.conflictStatus as any, source: criteria.conflictSource as any, alertType: criteria.conflictType as any }, select: { createdAt: true, severity: true, status: true, source: true, alertType: true } }) : [];
  const responseAlerts: any[] = wantsConflicts ? await prisma.wildlifeConflictAlert.findMany({ where: { acknowledgedBy: criteria.rangerId, severity: criteria.severity as any, status: criteria.conflictStatus as any, source: criteria.conflictSource as any, alertType: criteria.conflictType as any, responses: { some: { respondedAt: { gte: start, lte: end } } } }, select: { responses: true } }) : [];
  const responses = responseAlerts.flatMap(alert => alert.responses ?? []).filter((response: any) => { const time = new Date(response.respondedAt); return time >= start && time <= end; });
  const parkRoutes = routes.map((route: any) => ({ _id: route.id, name: route.name, geometry: route.geometry as any }));
  const limitations: string[] = [];
  if (wantsIncidents) limitations.push('Incidents without a valid patrol-session-to-park link are excluded from park-scoped analysis.');
  if (wantsConflicts) limitations.push(HWC_SCOPE_NOTICE, 'Conflict Ranger ID filters acknowledgedBy; response activity uses respondedAt and the same parent-alert filters.');
  if (wantsPatrols) limitations.push('Coverage is completed routes / all selected-park routes, not geographic land area.', 'Activity uses starts, completions and valid waypoints in the inclusive UTC period.');
  const incidentStatistics = selected.has('INCIDENT_STATISTICS') ? calculateIncidentStatistics(incidentRows, start, end) : undefined;
  const incidentHotspots = selected.has('INCIDENT_HOTSPOTS') ? calculateIncidentHotspots(incidentRows) : undefined;
  const conflictTrends = wantsConflicts ? calculateConflictTrends(alertRows, responses, start, end) : undefined;
  const patrolCoverage = wantsPatrols ? calculatePatrolCoverage(parkRoutes, sessions, start, end) : undefined;
  if (patrolCoverage?.excludedSessionCount) limitations.push(`${patrolCoverage.excludedSessionCount} retrieved sessions with missing or unknown route links were excluded.`);
  return { generatedAt: new Date().toISOString(), filters: criteria, park: option(park), status: incidentRows.length || (patrolCoverage?.totalRoutes ?? 0) || alertRows.length || responses.length ? 'DATA' : 'NO_MATCHING_DATA', matchedRecords: { incidents: incidentRows.length, patrols: patrolCoverage?.patrolSessionCount ?? 0, ...(wantsConflicts ? { conflicts: alertRows.length, responses: responses.length } : {}) }, categoryAvailability: criteria.categories.map(category => ({ category, status: category === 'HWC_TRENDS' ? 'AVAILABLE_UNSCOPED' : 'AVAILABLE' })), limitations, summary: { patrols: { total: sessions.length, completed: sessions.filter(row => row.status === 'COMPLETED').length, active: sessions.filter(row => row.status === 'ACTIVE').length }, incidents: { total: incidentRows.length }, conflicts: { total: alertRows.length, open: alertRows.filter(row => row.status !== 'RESOLVED' && row.status !== 'CANCELLED').length, resolved: alertRows.filter(row => row.status === 'RESOLVED').length }, responses: { total: responses.length } }, incidents: { byType: incidentStatistics?.byType ?? [], byStatus: incidentStatistics?.byStatus ?? [] }, patrols: { byStatus: groupBy(sessions, 'status'), byRanger: groupBy(sessions, 'rangerName') }, conflicts: { bySeverity: conflictTrends?.bySeverity ?? [], byStatus: conflictTrends?.byStatus ?? [], bySource: conflictTrends?.bySource ?? [], byType: conflictTrends?.byType ?? [] }, responses: { byAction: conflictTrends?.responsesByAction ?? [] }, ...(incidentStatistics ? { incidentStatistics } : {}), ...(incidentHotspots ? { incidentHotspots } : {}), ...(conflictTrends ? { conflictTrends } : {}), ...(patrolCoverage ? { patrolCoverage } : {}) };
}
