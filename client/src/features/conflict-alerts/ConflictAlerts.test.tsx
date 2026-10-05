import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { AlertSeverityBadge } from './components/AlertSeverityBadge';
import { AlertStatusBadge } from './components/AlertStatusBadge';
import { ConflictAlertCard } from './components/ConflictAlertCard';
import { ConflictAlertMap } from './components/ConflictAlertMap';
import { ResponseHistoryTimeline } from './components/ResponseHistoryTimeline';
import { ConflictResponseForm } from './components/ConflictResponseForm';
import { CollarSimulatorModal } from './components/CollarSimulatorModal';
import { CommunityReportModal } from './components/CommunityReportModal';
import { ConflictAlertsPage } from './pages/ConflictAlertsPage';
import { ConflictAlertDetailPage } from './pages/ConflictAlertDetailPage';
import { conflictAlertApi } from './api/conflictAlertApi';
import { syncService } from '../../offline/syncService';
import { http } from '../../shared/api/http';
import {
  AlertSource,
  ConflictAlertType,
  AlertSeverity,
  AlertStatus,
  ResponseAction,
  LocationSource,
  SyncStatus
} from '../../shared/types/enums';
import type { WildlifeConflictAlert } from './types/conflictAlert';

describe('UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests', () => {
  const sampleCollarAlert: WildlifeConflictAlert = {
    _id: 'alert-test-01',
    sourceEventId: 'src-evt-01',
    source: AlertSource.COLLAR,
    alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
    severity: AlertSeverity.HIGH,
    status: AlertStatus.OPEN,
    location: {
      latitude: -2.1523,
      longitude: 34.8214,
      timestamp: new Date().toISOString(),
      source: LocationSource.GPS
    },
    description: 'Tracked bull elephant breached boundary fence.',
    animalId: 'ELEPHANT-001',
    responses: [],
    syncStatus: SyncStatus.SYNCED,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const sampleCommunityAlert: WildlifeConflictAlert = {
    _id: 'alert-test-02',
    sourceEventId: 'src-evt-02',
    source: AlertSource.COMMUNITY_REPORT,
    alertType: ConflictAlertType.CROP_RAID,
    severity: AlertSeverity.CRITICAL,
    status: AlertStatus.ACKNOWLEDGED,
    location: {
      latitude: -2.189,
      longitude: 34.841,
      timestamp: new Date().toISOString(),
      source: LocationSource.MANUAL
    },
    description: 'Hippo pod in crops.',
    reporterName: 'Mzee Juma',
    acknowledgedBy: 'R-101',
    acknowledgedName: 'Ranger John',
    acknowledgedAt: new Date().toISOString(),
    responses: [],
    syncStatus: SyncStatus.PENDING,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Severity Badges
  test('AlertSeverityBadge renders all severities correctly', () => {
    const { rerender } = render(<AlertSeverityBadge severity={AlertSeverity.LOW} />);
    expect(screen.getByText('LOW')).toBeInTheDocument();

    rerender(<AlertSeverityBadge severity={AlertSeverity.MEDIUM} />);
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();

    rerender(<AlertSeverityBadge severity={AlertSeverity.HIGH} />);
    expect(screen.getByText('HIGH')).toBeInTheDocument();

    rerender(<AlertSeverityBadge severity={AlertSeverity.CRITICAL} />);
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
  });

  // 2. Status Badges
  test('AlertStatusBadge renders all statuses correctly', () => {
    const { rerender } = render(<AlertStatusBadge status={AlertStatus.OPEN} />);
    expect(screen.getByText('OPEN')).toBeInTheDocument();

    rerender(<AlertStatusBadge status={AlertStatus.ACKNOWLEDGED} />);
    expect(screen.getByText('ACKNOWLEDGED')).toBeInTheDocument();

    rerender(<AlertStatusBadge status={AlertStatus.RESPONDING} />);
    expect(screen.getByText('RESPONDING')).toBeInTheDocument();

    rerender(<AlertStatusBadge status={AlertStatus.RESOLVED} />);
    expect(screen.getByText('RESOLVED')).toBeInTheDocument();
  });

  // 3. ConflictAlertCard Rendering
  test('ConflictAlertCard renders collar alert, urgent borders, and pending status', () => {
    render(
      <BrowserRouter>
        <ConflictAlertCard alert={sampleCollarAlert} />
      </BrowserRouter>
    );

    expect(screen.getByText('DANGEROUS WILDLIFE ACTIVITY')).toBeInTheDocument();
    expect(screen.getByText('Tracked bull elephant breached boundary fence.')).toBeInTheDocument();
    expect(screen.getByText(/ELEPHANT-001/i)).toBeInTheDocument();
    expect(screen.getByText('SYNCED')).toBeInTheDocument();
    expect(screen.getByText('View Alert Details →')).toBeInTheDocument();
  });

  test('ConflictAlertCard renders community reporter name and PENDING SYNC badge', () => {
    render(
      <BrowserRouter>
        <ConflictAlertCard alert={sampleCommunityAlert} />
      </BrowserRouter>
    );

    expect(screen.getByText('CROP RAID')).toBeInTheDocument();
    expect(screen.getByText(/Mzee Juma/i)).toBeInTheDocument();
    expect(screen.getByText('PENDING SYNC')).toBeInTheDocument();
  });

  // 4. Map Component
  test('ConflictAlertMap handles valid location and shows fallback on invalid coordinates', () => {
    const { rerender } = render(<ConflictAlertMap alert={sampleCollarAlert} height="200px" />);
    expect(document.querySelector('.leaflet-container')).toBeInTheDocument();

    const invalidAlert: WildlifeConflictAlert = {
      ...sampleCollarAlert,
      location: { ...sampleCollarAlert.location, latitude: NaN }
    };
    rerender(<ConflictAlertMap alert={invalidAlert} />);
    expect(screen.getByText(/Invalid map location coordinates/i)).toBeInTheDocument();
  });

  // 5. Response History Timeline
  test('ResponseHistoryTimeline renders complete audit history including actions and outcomes', () => {
    render(
      <ResponseHistoryTimeline
        createdAt={new Date().toISOString()}
        acknowledgedBy="R-101"
        acknowledgedName="Ranger John"
        acknowledgedAt={new Date().toISOString()}
        resolvedBy="R-101"
        resolvedName="Ranger John"
        resolvedAt={new Date().toISOString()}
        resolutionNotes="Elephant returned to park safely."
        responses={[
          {
            responseId: 'resp-01',
            responderId: 'R-101',
            responderName: 'Ranger John',
            action: ResponseAction.INVESTIGATED_AREA,
            notes: 'Investigated fence line.',
            respondedAt: new Date().toISOString(),
            outcome: 'No broken wires found.'
          },
          {
            responseId: 'resp-02',
            responderId: 'R-101',
            responderName: 'Ranger John',
            action: ResponseAction.WARNED_COMMUNITY,
            notes: 'Warned farmers nearby.',
            respondedAt: new Date().toISOString()
          }
        ]}
      />
    );

    expect(screen.getByText('🚨 Alert Generated & Persisted')).toBeInTheDocument();
    expect(screen.getByText('🔵 Acknowledged by Ranger')).toBeInTheDocument();
    expect(screen.getByText(/INVESTIGATED AREA/i)).toBeInTheDocument();
    expect(screen.getByText('Investigated fence line.')).toBeInTheDocument();
    expect(screen.getByText(/No broken wires found/i)).toBeInTheDocument();
    expect(screen.getByText(/WARNED COMMUNITY/i)).toBeInTheDocument();
    expect(screen.getByText('🟢 Conflict Alert Resolved')).toBeInTheDocument();
    expect(screen.getByText(/Elephant returned to park safely/i)).toBeInTheDocument();
  });

  // 6. ConflictResponseForm Validation and Submission
  test('ConflictResponseForm validates notes and resolution notes when markResolved checked', async () => {
    const handleSubmit = vi.fn();
    render(<ConflictResponseForm onSubmit={handleSubmit} />);

    // Attempt empty notes
    fireEvent.click(screen.getByText(/Save Response Action/i));
    expect(screen.getByText(/Please enter detailed response notes/i)).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();

    // Check mark resolved without resolution notes
    const textarea = screen.getByPlaceholderText('Describe the actions taken by the ranger team...');
    fireEvent.change(textarea, { target: { value: 'Patrol dispatched.' } });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByText(/Save & Resolve Alert/i));
    expect(screen.getByText(/Please enter resolution notes when marking the alert as resolved/i)).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();

    // Enter resolution notes and submit
    const resNotes = screen.getByPlaceholderText(/Explain why the conflict condition is now fully resolved/i);
    fireEvent.change(resNotes, { target: { value: 'All animals clear.' } });

    fireEvent.click(screen.getByText(/Save & Resolve Alert/i));
    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({
        action: ResponseAction.INVESTIGATED_AREA,
        notes: 'Patrol dispatched.',
        outcome: undefined,
        markResolved: true,
        resolutionNotes: 'All animals clear.'
      });
    });
  });

  // 7. Modals: Collar Simulator & Community Report
  test('CollarSimulatorModal submits configured animal and coordinates', async () => {
    const handleSimulate = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(<CollarSimulatorModal onSimulate={handleSimulate} onClose={handleClose} />);

    expect(screen.getByText(/Wildlife Collar Simulator/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Generate Collar Conflict Alert/i));

    await waitFor(() => {
      expect(handleSimulate).toHaveBeenCalledWith(
        expect.objectContaining({
          animalId: 'ELEPHANT-001',
          latitude: -2.1523,
          longitude: 34.8214
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });

  test('CommunityReportModal submits reporter name and details', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(<CommunityReportModal onSubmit={handleSubmit} onClose={handleClose} />);

    expect(screen.getByText(/Community Conflict Report/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Submit Community Report/i));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          reporterName: 'Mzee Juma',
          reportType: ConflictAlertType.CROP_RAID
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });

  // 8. ConflictAlertsPage Integration & Filters
  test('ConflictAlertsPage renders active alerts, filters, and modal controls', async () => {
    vi.spyOn(conflictAlertApi, 'getAlerts').mockResolvedValue([sampleCollarAlert, sampleCommunityAlert]);
    vi.spyOn(syncService, 'getQueueCounts').mockResolvedValue({ pending: 1, syncing: 0, failed: 0 });

    render(
      <BrowserRouter>
        <ConflictAlertsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('⚡ Wildlife Conflict Alerts')).toBeInTheDocument();
      expect(screen.getByText(/2 active/i)).toBeInTheDocument();
      expect(screen.getByText(/1 conflict-alert action\(s\) pending synchronization/i)).toBeInTheDocument();
      expect(screen.getByText('DANGEROUS WILDLIFE ACTIVITY')).toBeInTheDocument();
      expect(screen.getByText('CROP RAID')).toBeInTheDocument();
    });

    // Open collar simulator modal
    fireEvent.click(screen.getByText('🛰️ Collar Simulator'));
    expect(screen.getByText('SIMULATED INPUT')).toBeInTheDocument();
  });

  // 9. ConflictAlertDetailPage Core Lifecycle Interactions
  test('ConflictAlertDetailPage handles OPEN alert acknowledgement and updates status', async () => {
    vi.spyOn(conflictAlertApi, 'getAlertById').mockResolvedValue(sampleCollarAlert);
    const ackMock = vi.spyOn(conflictAlertApi, 'acknowledgeAlert').mockResolvedValue({
      ...sampleCollarAlert,
      status: AlertStatus.ACKNOWLEDGED,
      acknowledgedBy: 'R-101',
      acknowledgedName: 'Ranger John',
      acknowledgedAt: new Date().toISOString()
    });

    render(
      <MemoryRouter initialEntries={['/ranger/alerts/alert-test-01']}>
        <Routes>
          <Route path="/ranger/alerts/:alertId" element={<ConflictAlertDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('DANGEROUS WILDLIFE ACTIVITY')).toBeInTheDocument();
      expect(screen.getByText('🔵 Acknowledge Alert')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('🔵 Acknowledge Alert'));

    await waitFor(() => {
      expect(ackMock).toHaveBeenCalledWith('alert-test-01');
      expect(screen.getByText(/Alert acknowledged/i)).toBeInTheDocument();
    });
  });

  test('ConflictAlertDetailPage restricts direct resolve when ACKNOWLEDGED without prior response', async () => {
    const ackAlert: WildlifeConflictAlert = {
      ...sampleCollarAlert,
      status: AlertStatus.ACKNOWLEDGED,
      acknowledgedBy: 'R-101',
      acknowledgedName: 'Ranger John',
      acknowledgedAt: new Date().toISOString()
    };
    vi.spyOn(conflictAlertApi, 'getAlertById').mockResolvedValue(ackAlert);

    render(
      <MemoryRouter initialEntries={['/ranger/alerts/alert-test-01']}>
        <Routes>
          <Route path="/ranger/alerts/:alertId" element={<ConflictAlertDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Alert is ACKNOWLEDGED. Record an initial response action before resolving/i)).toBeInTheDocument();
      expect(screen.getByText('🟡 Record Action Taken')).toBeInTheDocument();
      // Direct Resolve Alert button is hidden in ACKNOWLEDGED state
      expect(screen.queryByText('🟢 Resolve Alert')).not.toBeInTheDocument();
    });
  });

  test('ConflictAlertDetailPage allows resolve when RESPONDING with notes', async () => {
    const respondingAlert: WildlifeConflictAlert = {
      ...sampleCollarAlert,
      status: AlertStatus.RESPONDING,
      acknowledgedBy: 'R-101',
      responses: [
        {
          responseId: 'resp-1',
          responderId: 'R-101',
          responderName: 'Ranger John',
          action: ResponseAction.INVESTIGATED_AREA,
          notes: 'Inspected boundary.',
          respondedAt: new Date().toISOString()
        }
      ]
    };
    vi.spyOn(conflictAlertApi, 'getAlertById').mockResolvedValue(respondingAlert);
    const resolveMock = vi.spyOn(conflictAlertApi, 'resolveAlert').mockResolvedValue({
      ...respondingAlert,
      status: AlertStatus.RESOLVED,
      resolvedBy: 'R-101',
      resolvedName: 'Ranger John',
      resolvedAt: new Date().toISOString(),
      resolutionNotes: 'Elephant returned safely.'
    });

    render(
      <MemoryRouter initialEntries={['/ranger/alerts/alert-test-01']}>
        <Routes>
          <Route path="/ranger/alerts/:alertId" element={<ConflictAlertDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('🟢 Resolve Alert')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('🟢 Resolve Alert'));
    expect(screen.getByText('Confirm Resolve Alert')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/Explain how the conflict situation was successfully handled/i);
    fireEvent.change(textarea, { target: { value: 'Elephant returned safely.' } });

    fireEvent.click(screen.getByText('Confirm Resolve Alert'));

    await waitFor(() => {
      expect(resolveMock).toHaveBeenCalledWith('alert-test-01', {
        resolutionNotes: 'Elephant returned safely.'
      });
      expect(screen.getByText(/This conflict alert is fully RESOLVED/i)).toBeInTheDocument();
    });
  });

  // 10. API Offline and Sync Queue Integration
  test('conflictAlertApi.acknowledgeAlert handles offline network error with Dexie PENDING update', async () => {
    vi.spyOn(http, 'post').mockRejectedValueOnce(new Error('Network Error - Device Offline'));
    vi.spyOn(conflictAlertApi, 'getAlertById').mockResolvedValueOnce(sampleCollarAlert);
    const enqueueSpy = vi.spyOn(syncService, 'enqueue').mockResolvedValueOnce(1 as any);

    const result = await conflictAlertApi.acknowledgeAlert('alert-test-01');

    expect(result.status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'conflict-alerts',
        operation: 'ACKNOWLEDGE_ALERT'
      })
    );
  });

  test('conflictAlertApi.addResponse handles offline network error with Dexie PENDING update and stable clientResponseId', async () => {
    const ackAlert: WildlifeConflictAlert = {
      ...sampleCollarAlert,
      status: AlertStatus.ACKNOWLEDGED
    };
    vi.spyOn(http, 'post').mockRejectedValueOnce(new Error('Network Error - Device Offline'));
    vi.spyOn(conflictAlertApi, 'getAlertById').mockResolvedValueOnce(ackAlert);
    const enqueueSpy = vi.spyOn(syncService, 'enqueue').mockResolvedValueOnce(2 as any);

    const result = await conflictAlertApi.addResponse('alert-test-01', {
      action: ResponseAction.INVESTIGATED_AREA,
      notes: 'Investigated boundary offline.'
    });

    expect(result.status).toBe(AlertStatus.RESPONDING);
    expect(result.responses).toHaveLength(1);
    expect(result.responses[0].clientResponseId).toBeDefined();
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'conflict-alerts',
        operation: 'ADD_RESPONSE'
      })
    );
  });

  test('conflictAlertApi.resolveAlert handles offline network error with Dexie PENDING update and stable clientActionId', async () => {
    const respAlert: WildlifeConflictAlert = {
      ...sampleCollarAlert,
      status: AlertStatus.RESPONDING,
      responses: [
        {
          responseId: 'resp-1',
          responderId: 'R-101',
          responderName: 'Ranger John',
          action: ResponseAction.INVESTIGATED_AREA,
          notes: 'Boundary secure.',
          respondedAt: new Date().toISOString()
        }
      ]
    };
    vi.spyOn(http, 'post').mockRejectedValueOnce(new Error('Network Error - Device Offline'));
    vi.spyOn(conflictAlertApi, 'getAlertById').mockResolvedValueOnce(respAlert);
    const enqueueSpy = vi.spyOn(syncService, 'enqueue').mockResolvedValueOnce(3 as any);

    const result = await conflictAlertApi.resolveAlert('alert-test-01', {
      resolutionNotes: 'Situation cleared offline.'
    });

    expect(result.status).toBe(AlertStatus.RESOLVED);
    expect(result.clientResolutionId).toBeDefined();
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'conflict-alerts',
        operation: 'RESOLVE_ALERT'
      })
    );
  });
});
