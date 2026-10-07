import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { IncidentDeletionReason, IncidentStatus, IncidentType, LocationSource } from '../src/types/enums.js';
import { analyticsService } from '../src/modules/analytics/service.js';

const app = createApp();

describe('UC-B Conservation Incidents API Endpoints', () => {
  jest.setTimeout(30000);

  const sampleIncidentPayload = {
    incidentType: IncidentType.SNARE,
    description: 'Wire snare found attached to acacia tree near waterhole.',
    latitude: -2.1523,
    longitude: 34.8214,
    locationSource: LocationSource.GPS,
    evidence: [
      {
        imageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
        fileSize: 1024,
        mimeType: 'image/jpeg'
      }
    ]
  };

  test('POST /api/incidents creates a new incident for authenticated ranger', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .set('x-ranger-name', 'Ranger John')
      .send(sampleIncidentPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.incidentType).toBe(IncidentType.SNARE);
    expect(res.body.data.reportedBy).toBe('R-101');
    expect(res.body.data.evidence.length).toBe(1);
    expect(res.body.data.evidence[0].evidenceId).toBeDefined();
  });

  test('POST /api/incidents accepts an image payload larger than the default JSON body limit', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send({
        ...sampleIncidentPayload,
        evidence: [{ ...sampleIncidentPayload.evidence[0], imageUrl: `data:image/jpeg;base64,${'A'.repeat(150 * 1024)}` }]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/incidents rejects invalid incidentType', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send({
        ...sampleIncidentPayload,
        incidentType: 'INVALID_TYPE'
      });

    expect(res.status).toBe(400); // errorHandler maps Zod validation error
    expect(res.body.success).toBe(false);
  });

  test('POST /api/incidents rejects invalid coordinates (latitude out of range)', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send({
        ...sampleIncidentPayload,
        latitude: 150 // Invalid
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/incidents rejects missing photographic evidence', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send({
        ...sampleIncidentPayload,
        evidence: [] // Missing evidence
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/incidents handles idempotency with clientIncidentId', async () => {
    const clientIncidentId = `client-inc-${Date.now()}`;
    const payload = { ...sampleIncidentPayload, clientIncidentId };

    const res1 = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send(payload);

    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send(payload);

    expect(res2.status).toBe(201);
    expect(res2.body.data._id).toBe(res1.body.data._id); // Same document returned
  });

  test('GET /api/incidents/my retrieves reported incidents for ranger', async () => {
    const res = await request(app)
      .get('/api/incidents/my')
      .set('x-ranger-id', 'R-101');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('GET /api/incidents/:id rejects access to another ranger incident', async () => {
    // Create incident under R-101
    const createRes = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send(sampleIncidentPayload);

    const incidentId = createRes.body.data._id;

    // Attempt access as R-999 (unauthorized)
    const accessRes = await request(app)
      .get(`/api/incidents/${incidentId}`)
      .set('x-ranger-id', 'R-999');

    expect(accessRes.status).toBe(403);
    expect(accessRes.body.error.message).toContain('Unauthorized');
  });

  test('POST /api/incidents accepts MANUAL location source', async () => {
    const manualPayload = {
      ...sampleIncidentPayload,
      locationSource: LocationSource.MANUAL,
      latitude: -2.1999,
      longitude: 34.8999
    };

    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send(manualPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.location.source).toBe(LocationSource.MANUAL);
    expect(res.body.data.location.latitude).toBe(-2.1999);
  });

  test('POST /api/incidents rejects evidence that is not an image data URL', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send({ ...sampleIncidentPayload, evidence: [{ imageUrl: 'abc' }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/incidents requires a description for OTHER incident type', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send({ ...sampleIncidentPayload, incidentType: IncidentType.OTHER, otherTypeDescription: '  ' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('otherTypeDescription');
  });

  test('GET /api/incidents/:id returns 404 for an unknown incident', async () => {
    const res = await request(app).get('/api/incidents/does-not-exist').set('x-ranger-id', 'R-101');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INCIDENT_NOT_FOUND');
  });

  describe('Editing, withdrawing and restoring incident reports', () => {
    const uniqueRanger = (label: string) => `R-EDIT-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    async function createIncident(rangerId: string, extra: Record<string, unknown> = {}) {
      const res = await request(app).post('/api/incidents').set('x-ranger-id', rangerId).send({ ...sampleIncidentPayload, ...extra });
      expect(res.status).toBe(201);
      return res.body.data;
    }

    async function startPatrol(rangerId: string): Promise<string> {
      const res = await request(app).post('/api/patrols/sessions').set('x-ranger-id', rangerId).send({ clientSessionId: `sess-${rangerId}` });
      expect(res.status).toBe(201);
      return res.body.data._id;
    }

    function editBody(incident: { updatedAt: string }, changes: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
      return {
        expectedUpdatedAt: incident.updatedAt,
        editedAt: new Date().toISOString(),
        clientEditId: `edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...changes,
        ...overrides
      };
    }

    const patch = (rangerId: string, incidentId: string, body: unknown) =>
      request(app).patch(`/api/incidents/${incidentId}`).set('x-ranger-id', rangerId).send(body as object);

    test('owner can edit type and description; an audit revision is recorded', async () => {
      const rangerId = uniqueRanger('OK');
      const incident = await createIncident(rangerId);
      expect(incident.canEdit).toBe(true);
      expect(incident.editLockedReason).toBeNull();

      const res = await patch(rangerId, incident._id, editBody(incident, {
        incidentType: IncidentType.ANIMAL_CARCASS,
        description: '  Carcass of a zebra found near the waterhole.  '
      }));

      expect(res.status).toBe(200);
      expect(res.body.data.incidentType).toBe(IncidentType.ANIMAL_CARCASS);
      expect(res.body.data.description).toBe('Carcass of a zebra found near the waterhole.');
      expect(res.body.data.editCount).toBe(1);
      expect(res.body.data.updatedAt).not.toBe(incident.updatedAt);

      const revisions = await prisma.incidentRevision.findMany({ where: { incidentId: incident._id } });
      expect(revisions).toHaveLength(1);
      expect((revisions[0].changes as any).incidentType).toEqual({ from: IncidentType.SNARE, to: IncidentType.ANIMAL_CARCASS });
    });

    test('another ranger cannot edit the report (403)', async () => {
      const incident = await createIncident(uniqueRanger('OWNER'));
      const res = await patch(uniqueRanger('INTRUDER'), incident._id, editBody(incident, { description: 'Tampered description' }));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('unknown incident returns 404', async () => {
      const res = await patch('R-101', 'does-not-exist', editBody({ updatedAt: new Date().toISOString() }, { description: 'Anything here' }));

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INCIDENT_NOT_FOUND');
    });

    test('non-editable fields such as status are rejected', async () => {
      const rangerId = uniqueRanger('STRICT');
      const incident = await createIncident(rangerId);
      const res = await patch(rangerId, incident._id, editBody(incident, { status: IncidentStatus.RESOLVED }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('a request with no editable fields is rejected', async () => {
      const rangerId = uniqueRanger('EMPTY');
      const incident = await createIncident(rangerId);
      const res = await patch(rangerId, incident._id, editBody(incident, {}));

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('No changes to save');
    });

    test('sending the same values is reported as no changes', async () => {
      const rangerId = uniqueRanger('SAME');
      const incident = await createIncident(rangerId);
      const res = await patch(rangerId, incident._id, editBody(incident, { description: incident.description }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_CHANGES');
    });

    test('changing the type to OTHER requires an "Other" description', async () => {
      const rangerId = uniqueRanger('OTHER');
      const incident = await createIncident(rangerId);

      const missing = await patch(rangerId, incident._id, editBody(incident, { incidentType: IncidentType.OTHER }));
      expect(missing.status).toBe(400);
      expect(missing.body.error.code).toBe('OTHER_DESCRIPTION_REQUIRED');

      const ok = await patch(rangerId, incident._id, editBody(incident, { incidentType: IncidentType.OTHER, otherTypeDescription: 'Fence breach' }));
      expect(ok.status).toBe(200);
      expect(ok.body.data.otherTypeDescription).toBe('Fence breach');
    });

    test('a stale expectedUpdatedAt is rejected with EDIT_CONFLICT', async () => {
      const rangerId = uniqueRanger('CONFLICT');
      const incident = await createIncident(rangerId);

      const first = await patch(rangerId, incident._id, editBody(incident, { description: 'First device edit' }));
      expect(first.status).toBe(200);

      const second = await patch(rangerId, incident._id, editBody(incident, { description: 'Second device edit' }));
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('EDIT_CONFLICT');
      expect(second.body.error.details.currentUpdatedAt).toBe(first.body.data.updatedAt);
    });

    test('retrying the same clientEditId applies the edit only once', async () => {
      const rangerId = uniqueRanger('RETRY');
      const incident = await createIncident(rangerId);
      const body = editBody(incident, { description: 'Edited once, retried offline' });

      const first = await patch(rangerId, incident._id, body);
      const retry = await patch(rangerId, incident._id, body);

      expect(first.status).toBe(200);
      expect(retry.status).toBe(200);
      expect(retry.body.data.editCount).toBe(1);
      expect(await prisma.incidentRevision.count({ where: { incidentId: incident._id } })).toBe(1);
    });

    test('evidence: the last photo cannot be removed; replaced photos are soft-deleted', async () => {
      const rangerId = uniqueRanger('EVID');
      const incident = await createIncident(rangerId);
      const originalId = incident.evidence[0].evidenceId;

      const removeLast = await patch(rangerId, incident._id, editBody(incident, { removeEvidenceIds: [originalId] }));
      expect(removeLast.status).toBe(400);
      expect(removeLast.body.error.code).toBe('EVIDENCE_REQUIRED');

      const replace = await patch(rangerId, incident._id, editBody(incident, {
        removeEvidenceIds: [originalId],
        addEvidence: [{ imageUrl: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png' }]
      }));
      expect(replace.status).toBe(200);
      expect(replace.body.data.evidence).toHaveLength(1);
      expect(replace.body.data.evidence[0].evidenceId).not.toBe(originalId);

      const original = await prisma.incidentEvidence.findUnique({ where: { evidenceId: originalId } });
      expect(original?.removedAt).not.toBeNull();
    });

    test('evidence: photos from another report cannot be removed', async () => {
      const rangerId = uniqueRanger('EVID-OTHER');
      const incident = await createIncident(rangerId);
      const res = await patch(rangerId, incident._id, editBody(incident, { removeEvidenceIds: ['evid-not-mine'] }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EVIDENCE_NOT_FOUND');
    });

    test('report is locked once its patrol is completed', async () => {
      const rangerId = uniqueRanger('DONE');
      const sessionId = await startPatrol(rangerId);
      const incident = await createIncident(rangerId, { patrolSessionId: sessionId });
      expect(incident.canEdit).toBe(true);

      const complete = await request(app).post(`/api/patrols/sessions/${sessionId}/complete`).set('x-ranger-id', rangerId).send({});
      expect(complete.status).toBe(200);

      const fetched = await request(app).get(`/api/incidents/${incident._id}`).set('x-ranger-id', rangerId);
      expect(fetched.body.data.canEdit).toBe(false);
      expect(fetched.body.data.editLockedReason).toBe('PATROL_COMPLETED');

      const res = await patch(rangerId, incident._id, editBody(incident, { description: 'Edited after patrol ended' }));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INCIDENT_LOCKED');
      expect(res.body.error.details.reason).toBe('PATROL_COMPLETED');
    });

    test('an offline edit made before the patrol ended is still accepted when it syncs later', async () => {
      const rangerId = uniqueRanger('OFFLINE');
      const sessionId = await startPatrol(rangerId);
      const incident = await createIncident(rangerId, { patrolSessionId: sessionId });
      const editedWhileOnPatrol = new Date().toISOString();

      await request(app).post(`/api/patrols/sessions/${sessionId}/complete`).set('x-ranger-id', rangerId).send({});

      const res = await patch(rangerId, incident._id, editBody(incident, { description: 'Edited offline during patrol' }, { editedAt: editedWhileOnPatrol }));
      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Edited offline during patrol');
    });

    test('report is locked while a manager is investigating it', async () => {
      const rangerId = uniqueRanger('INVEST');
      const incident = await createIncident(rangerId);
      const updated = await prisma.conservationIncident.update({ where: { id: incident._id }, data: { status: IncidentStatus.INVESTIGATING as any } });

      const res = await patch(rangerId, incident._id, editBody({ updatedAt: updated.updatedAt.toISOString() }, { description: 'Edit during investigation' }));
      expect(res.status).toBe(409);
      expect(res.body.error.details.reason).toBe('UNDER_INVESTIGATION');
    });

    test('a standalone report is locked 24 hours after it was reported', async () => {
      const rangerId = uniqueRanger('WINDOW');
      const incident = await createIncident(rangerId);
      const updated = await prisma.conservationIncident.update({
        where: { id: incident._id },
        data: { reportedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }
      });

      const res = await patch(rangerId, incident._id, editBody({ updatedAt: updated.updatedAt.toISOString() }, { description: 'Too late to edit' }));
      expect(res.status).toBe(409);
      expect(res.body.error.details.reason).toBe('EDIT_WINDOW_EXPIRED');
    });

    test('editedAt in the future is rejected', async () => {
      const rangerId = uniqueRanger('FUTURE');
      const incident = await createIncident(rangerId);
      const res = await patch(rangerId, incident._id, editBody(incident, { description: 'From the future' }, {
        editedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_EDIT_TIME');
    });

    test('a standalone report can be linked to an open patrol once, but never moved', async () => {
      const rangerId = uniqueRanger('LINK');
      const incident = await createIncident(rangerId);
      const sessionId = await startPatrol(rangerId);

      const link = await patch(rangerId, incident._id, editBody(incident, { patrolSessionId: sessionId }));
      expect(link.status).toBe(200);
      expect(link.body.data.patrolSessionId).toBe(sessionId);

      const move = await patch(rangerId, incident._id, editBody(link.body.data, { patrolSessionId: 'another-session' }));
      expect(move.status).toBe(400);
      expect(move.body.error.code).toBe('PATROL_LINK_IMMUTABLE');
    });

    test('a report made from the Incidents screen during a patrol is linked to it and locks when the patrol is completed', async () => {
      const rangerId = uniqueRanger('AUTOLINK');
      const sessionId = await startPatrol(rangerId);

      // No patrolSessionId sent - like opening "Report New Incident" from the Incidents tab
      const incident = await createIncident(rangerId);
      expect(incident.patrolSessionId).toBe(sessionId);
      expect(incident.canEdit).toBe(true);

      await request(app).post(`/api/patrols/sessions/${sessionId}/complete`).set('x-ranger-id', rangerId).send({});

      const fetched = await request(app).get(`/api/incidents/${incident._id}`).set('x-ranger-id', rangerId);
      expect(fetched.body.data.canEdit).toBe(false);
      expect(fetched.body.data.editLockedReason).toBe('PATROL_COMPLETED');

      const res = await patch(rangerId, incident._id, editBody(incident, { description: 'Edited after patrol completed' }));
      expect(res.status).toBe(409);
      expect(res.body.error.details.reason).toBe('PATROL_COMPLETED');
    });

    test('a patrol started offline is resolved by its clientSessionId', async () => {
      const rangerId = uniqueRanger('CLIENTSESS');
      const sessionId = await startPatrol(rangerId);
      const incident = await createIncident(rangerId, { patrolSessionId: `sess-${rangerId}` });

      expect(incident.patrolSessionId).toBe(sessionId);
    });

    test('a report made when no patrol is open stays standalone', async () => {
      const rangerId = uniqueRanger('NOPATROL');
      const sessionId = await startPatrol(rangerId);
      await request(app).post(`/api/patrols/sessions/${sessionId}/complete`).set('x-ranger-id', rangerId).send({});

      const incident = await createIncident(rangerId);
      expect(incident.patrolSessionId).toBeNull();
      expect(incident.canEdit).toBe(true);
    });

    test('a corrected location must stay near the linked patrol route', async () => {
      const rangerId = uniqueRanger('LOC');
      const sessionId = await startPatrol(rangerId);
      const incident = await createIncident(rangerId, { patrolSessionId: sessionId });

      const far = await patch(rangerId, incident._id, editBody(incident, {
        location: { latitude: -3.0, longitude: 34.8214, source: LocationSource.MANUAL }
      }));
      expect(far.status).toBe(400);
      expect(far.body.error.code).toBe('LOCATION_TOO_FAR_FROM_PATROL');

      const near = await patch(rangerId, incident._id, editBody(incident, {
        location: { latitude: -2.155, longitude: 34.825, source: LocationSource.MANUAL }
      }));
      expect(near.status).toBe(200);
      expect(near.body.data.location).toMatchObject({ latitude: -2.155, longitude: 34.825, source: LocationSource.MANUAL });
    });

    // ---------- Withdraw (soft delete) and restore ----------

    function deleteBody(incident: { updatedAt: string }, overrides: Record<string, unknown> = {}) {
      return {
        expectedUpdatedAt: incident.updatedAt,
        deletedAt: new Date().toISOString(),
        clientDeleteId: `del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        reason: IncidentDeletionReason.DUPLICATE,
        ...overrides
      };
    }

    const del = (rangerId: string, incidentId: string, body: unknown) =>
      request(app).delete(`/api/incidents/${incidentId}`).set('x-ranger-id', rangerId).send(body as object);

    const restore = (rangerId: string, incidentId: string, overrides: Record<string, unknown> = {}) =>
      request(app)
        .post(`/api/incidents/${incidentId}/restore`)
        .set('x-ranger-id', rangerId)
        .send({ restoredAt: new Date().toISOString(), clientRestoreId: `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...overrides });

    test('owner withdraws a report: hidden from lists, reads and edits, but kept with an audit revision', async () => {
      const rangerId = uniqueRanger('DEL');
      const incident = await createIncident(rangerId);
      expect(incident.canDelete).toBe(true);

      const res = await del(rangerId, incident._id, deleteBody(incident, { reason: IncidentDeletionReason.OTHER, note: '  Test report  ' }));
      expect(res.status).toBe(200);
      expect(res.body.data.deletedAt).not.toBeNull();
      expect(res.body.data.deletionReason).toBe(IncidentDeletionReason.OTHER);
      expect(res.body.data.deletionNote).toBe('Test report');
      expect(res.body.data.canRestore).toBe(true);
      expect(res.body.data.canEdit).toBe(false);

      const list = await request(app).get('/api/incidents/my').set('x-ranger-id', rangerId);
      expect(list.body.data.map((i: { _id: string }) => i._id)).not.toContain(incident._id);

      const read = await request(app).get(`/api/incidents/${incident._id}`).set('x-ranger-id', rangerId);
      expect(read.status).toBe(410);
      expect(read.body.error.code).toBe('INCIDENT_DELETED');

      const edit = await patch(rangerId, incident._id, editBody(incident, { description: 'Edit after delete' }));
      expect(edit.status).toBe(410);

      // Row, photos and history are kept
      const row = await prisma.conservationIncident.findUnique({ where: { id: incident._id }, include: { evidence: true } });
      expect(row?.evidence).toHaveLength(1);
      const revisions = await prisma.incidentRevision.findMany({ where: { incidentId: incident._id } });
      expect(revisions.map(r => r.action)).toEqual(['DELETE']);
    });

    test('withdrawn reports are excluded from analytics', async () => {
      const rangerId = uniqueRanger('DEL-STATS');
      const keep = await createIncident(rangerId);
      const remove = await createIncident(rangerId);
      expect(keep._id).toBeDefined();

      expect((await analyticsService.getLegacyAnalytics({ rangerId })).summary.incidents.total).toBe(2);
      await del(rangerId, remove._id, deleteBody(remove));
      expect((await analyticsService.getLegacyAnalytics({ rangerId })).summary.incidents.total).toBe(1);
    });

    test('another ranger cannot withdraw the report', async () => {
      const incident = await createIncident(uniqueRanger('DEL-OWNER'));
      const res = await del(uniqueRanger('DEL-INTRUDER'), incident._id, deleteBody(incident));
      expect(res.status).toBe(403);
    });

    test('a reason is required, and "Other" needs a note', async () => {
      const rangerId = uniqueRanger('DEL-REASON');
      const incident = await createIncident(rangerId);

      const noReason = await del(rangerId, incident._id, deleteBody(incident, { reason: undefined }));
      expect(noReason.status).toBe(400);
      expect(noReason.body.error.details[0].path).toBe('reason');

      const otherNoNote = await del(rangerId, incident._id, deleteBody(incident, { reason: IncidentDeletionReason.OTHER }));
      expect(otherNoNote.status).toBe(400);
      expect(otherNoNote.body.error.details[0].path).toBe('note');
    });

    test('a report cannot be withdrawn after its patrol is completed', async () => {
      const rangerId = uniqueRanger('DEL-DONE');
      const sessionId = await startPatrol(rangerId);
      const incident = await createIncident(rangerId);
      await request(app).post(`/api/patrols/sessions/${sessionId}/complete`).set('x-ranger-id', rangerId).send({});

      const res = await del(rangerId, incident._id, deleteBody(incident));
      expect(res.status).toBe(409);
      expect(res.body.error.details.reason).toBe('PATROL_COMPLETED');
    });

    test('an offline delete made before the patrol ended is accepted when it syncs', async () => {
      const rangerId = uniqueRanger('DEL-OFFLINE');
      const sessionId = await startPatrol(rangerId);
      const incident = await createIncident(rangerId);
      const deletedWhileOnPatrol = new Date().toISOString();
      await request(app).post(`/api/patrols/sessions/${sessionId}/complete`).set('x-ranger-id', rangerId).send({});

      const res = await del(rangerId, incident._id, deleteBody(incident, { deletedAt: deletedWhileOnPatrol }));
      expect(res.status).toBe(200);
    });

    test('a stale version cannot be withdrawn', async () => {
      const rangerId = uniqueRanger('DEL-STALE');
      const incident = await createIncident(rangerId);
      await patch(rangerId, incident._id, editBody(incident, { description: 'Changed on another device' }));

      const res = await del(rangerId, incident._id, deleteBody(incident));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EDIT_CONFLICT');
    });

    test('retrying the same delete is safe; a second, different delete gets 410', async () => {
      const rangerId = uniqueRanger('DEL-RETRY');
      const incident = await createIncident(rangerId);
      const body = deleteBody(incident);

      expect((await del(rangerId, incident._id, body)).status).toBe(200);
      expect((await del(rangerId, incident._id, body)).status).toBe(200);
      const again = await del(rangerId, incident._id, deleteBody(incident));
      expect(again.status).toBe(410);
      expect(await prisma.incidentRevision.count({ where: { incidentId: incident._id, action: 'DELETE' } })).toBe(1);
    });

    test('a retried CREATE never brings a withdrawn report back', async () => {
      const rangerId = uniqueRanger('DEL-RECREATE');
      const clientIncidentId = `client-${rangerId}`;
      const incident = await createIncident(rangerId, { clientIncidentId });
      await del(rangerId, incident._id, deleteBody(incident));

      const retry = await request(app).post('/api/incidents').set('x-ranger-id', rangerId).send({ ...sampleIncidentPayload, clientIncidentId });
      expect(retry.body.data._id).toBe(incident._id);
      expect(retry.body.data.deletedAt).not.toBeNull();

      const list = await request(app).get('/api/incidents/my').set('x-ranger-id', rangerId);
      expect(list.body.data).toHaveLength(0);
    });

    test('Undo: a withdrawn report can be restored while still editable', async () => {
      const rangerId = uniqueRanger('RESTORE');
      const incident = await createIncident(rangerId);
      await del(rangerId, incident._id, deleteBody(incident));

      const res = await restore(rangerId, incident._id);
      expect(res.status).toBe(200);
      expect(res.body.data.deletedAt).toBeNull();
      expect(res.body.data.deletionReason).toBeNull();
      expect(res.body.data.canEdit).toBe(true);

      const list = await request(app).get('/api/incidents/my').set('x-ranger-id', rangerId);
      expect(list.body.data.map((i: { _id: string }) => i._id)).toContain(incident._id);
      const actions = (await prisma.incidentRevision.findMany({ where: { incidentId: incident._id }, orderBy: { receivedAt: 'asc' } })).map(r => r.action);
      expect(actions).toEqual(['DELETE', 'RESTORE']);

      const notDeleted = await restore(rangerId, incident._id);
      expect(notDeleted.status).toBe(409);
      expect(notDeleted.body.error.code).toBe('INCIDENT_NOT_DELETED');
    });

    test('a withdrawn report cannot be restored after its patrol is completed', async () => {
      const rangerId = uniqueRanger('RESTORE-DONE');
      const sessionId = await startPatrol(rangerId);
      const incident = await createIncident(rangerId);
      await del(rangerId, incident._id, deleteBody(incident));
      await request(app).post(`/api/patrols/sessions/${sessionId}/complete`).set('x-ranger-id', rangerId).send({});

      const res = await restore(rangerId, incident._id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INCIDENT_LOCKED');
    });
  });
});
