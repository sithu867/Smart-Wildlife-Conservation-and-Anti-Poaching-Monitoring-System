import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { conflictAlertService } from '../src/modules/conflict-alerts/service.js';
import { WildlifeConflictAlertModel } from '../src/modules/conflict-alerts/models.js';
import {
  AlertSource,
  ConflictAlertType,
  AlertSeverity,
  AlertStatus,
  ResponseAction,
  LocationSource,
  SyncStatus
} from '../src/types/enums.js';

describe('UC-C ConflictAlertService Mongoose Connection Path Tests', () => {
  const originalReadyState = mongoose.connection.readyState;

  beforeAll(() => {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  });

  afterAll(() => {
    Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
  });

  test('createAlert saves through Mongoose model and handles duplicates', async () => {
    const mockCreatedAlert = {
      _id: '67c00000000001a10a500001',
      sourceEventId: 'evt-mongo-01',
      source: AlertSource.COLLAR,
      alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
      severity: AlertSeverity.HIGH,
      status: AlertStatus.OPEN,
      location: {
        latitude: -2.15,
        longitude: 34.82,
        timestamp: new Date(),
        source: LocationSource.GPS
      },
      description: 'Breach detected.',
      responses: [],
      syncStatus: SyncStatus.SYNCED
    };

    jest.spyOn(WildlifeConflictAlertModel, 'findOne')
      .mockResolvedValueOnce(null) // first check: not found
      .mockResolvedValueOnce(mockCreatedAlert as any); // duplicate check: found
    jest.spyOn(WildlifeConflictAlertModel, 'create').mockResolvedValueOnce(mockCreatedAlert as any);

    const alert = await conflictAlertService.createAlert({
      sourceEventId: 'evt-mongo-01',
      source: AlertSource.COLLAR,
      alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
      severity: AlertSeverity.HIGH,
      latitude: -2.15,
      longitude: 34.82,
      description: 'Breach detected.'
    });

    expect(alert).toBeDefined();
    expect(alert._id).toBe('67c00000000001a10a500001');

    // Duplicate test
    const duplicate = await conflictAlertService.createAlert({
      sourceEventId: 'evt-mongo-01',
      source: AlertSource.COLLAR,
      alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
      severity: AlertSeverity.HIGH,
      latitude: -2.15,
      longitude: 34.82,
      description: 'Breach detected.'
    });
    expect(duplicate._id).toBe('67c00000000001a10a500001');
  });

  test('getAlerts queries Mongoose model with filters', async () => {
    const mockList = [
      { _id: 'alert-1', status: AlertStatus.OPEN, severity: AlertSeverity.HIGH }
    ];
    jest.spyOn(WildlifeConflictAlertModel, 'find').mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockList)
    } as any);

    const result = await conflictAlertService.getAlerts({
      status: AlertStatus.OPEN,
      severity: AlertSeverity.HIGH,
      alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY
    });

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('alert-1');
  });

  test('getAlertById, acknowledgeAlert, addResponse, and resolveAlert operate via Mongoose model', async () => {
    const mockDoc: any = {
      _id: '67c00000000001a10a500002',
      status: AlertStatus.OPEN,
      responses: [],
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(WildlifeConflictAlertModel, 'findById').mockResolvedValue(mockDoc);

    // getAlertById
    const fetched = await conflictAlertService.getAlertById('67c00000000001a10a500002');
    expect(fetched._id).toBe('67c00000000001a10a500002');

    // acknowledgeAlert
    const acknowledged = await conflictAlertService.acknowledgeAlert('R-101', 'Ranger John', '67c00000000001a10a500002', 'ack-01');
    expect(acknowledged.status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(acknowledged.acknowledgedBy).toBe('R-101');
    expect(mockDoc.save).toHaveBeenCalled();

    // addResponse
    const responded = await conflictAlertService.addResponse('R-101', 'Ranger John', '67c00000000001a10a500002', {
      action: ResponseAction.INVESTIGATED_AREA,
      notes: 'Investigated location.',
      clientResponseId: 'client-resp-01'
    });
    expect(responded.status).toBe(AlertStatus.RESPONDING);
    expect(responded.responses).toHaveLength(1);

    // resolveAlert
    const resolved = await conflictAlertService.resolveAlert('R-101', 'Ranger John', '67c00000000001a10a500002', {
      resolutionNotes: 'Field situation cleared.',
      clientActionId: 'client-action-01'
    });
    expect(resolved.status).toBe(AlertStatus.RESOLVED);
    expect(resolved.resolvedBy).toBe('R-101');
    expect(resolved.resolutionNotes).toBe('Field situation cleared.');
  });
});
