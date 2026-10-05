import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AlertSeverityBadge } from './components/AlertSeverityBadge';
import { AlertStatusBadge } from './components/AlertStatusBadge';
import { ConflictAlertCard } from './components/ConflictAlertCard';
import { ResponseHistoryTimeline } from './components/ResponseHistoryTimeline';
import { ConflictResponseForm } from './components/ConflictResponseForm';
import { conflictAlertApi } from './api/conflictAlertApi';
import { http } from '../../shared/api/http';
import {
  AlertSource,
  ConflictAlertType,
  AlertSeverity,
  AlertStatus,
  ResponseAction,
  LocationSource
} from '../../shared/types/enums';
import type { WildlifeConflictAlert } from './types/conflictAlert';

describe('UC-C Wildlife Conflict Alerts & Response Frontend Component Tests', () => {
  const sampleAlert: WildlifeConflictAlert = {
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
    description: 'Tracked bull elephant breched boundary fence.',
    animalId: 'ELEPHANT-001',
    responses: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  test('AlertSeverityBadge renders correct label and icon for HIGH and CRITICAL', () => {
    const { rerender } = render(<AlertSeverityBadge severity={AlertSeverity.HIGH} />);
    expect(screen.getByText('HIGH')).toBeInTheDocument();

    rerender(<AlertSeverityBadge severity={AlertSeverity.CRITICAL} />);
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
  });

  test('AlertStatusBadge renders correct status badge label', () => {
    const { rerender } = render(<AlertStatusBadge status={AlertStatus.OPEN} />);
    expect(screen.getByText('OPEN')).toBeInTheDocument();

    rerender(<AlertStatusBadge status={AlertStatus.RESPONDING} />);
    expect(screen.getByText('RESPONDING')).toBeInTheDocument();
  });

  test('ConflictAlertCard renders alert details and link to alert page', () => {
    render(
      <BrowserRouter>
        <ConflictAlertCard alert={sampleAlert} />
      </BrowserRouter>
    );

    expect(screen.getByText('DANGEROUS WILDLIFE ACTIVITY')).toBeInTheDocument();
    expect(screen.getByText('Tracked bull elephant breched boundary fence.')).toBeInTheDocument();
    expect(screen.getByText('View Alert Details →')).toBeInTheDocument();
  });

  test('ConflictResponseForm validates empty notes before submission', async () => {
    const handleSubmit = vi.fn();
    render(<ConflictResponseForm onSubmit={handleSubmit} />);

    // Click submit without entering notes
    fireEvent.click(screen.getByText(/Save Response Action/i));

    expect(screen.getByText(/Please enter detailed response notes/i)).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  test('ConflictResponseForm submits response input when valid notes provided', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ConflictResponseForm onSubmit={handleSubmit} />);

    const textarea = screen.getByPlaceholderText('Describe the actions taken by the ranger team...');
    fireEvent.change(textarea, { target: { value: 'Dispatched 2 patrol units to redirect wildlife.' } });

    fireEvent.click(screen.getByText(/Save Response Action/i));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({
        action: ResponseAction.INVESTIGATED_AREA,
        notes: 'Dispatched 2 patrol units to redirect wildlife.',
        outcome: undefined,
        markResolved: false,
        resolutionNotes: undefined
      });
    });
  });

  test('ResponseHistoryTimeline renders timeline events for alert', () => {
    render(
      <ResponseHistoryTimeline
        createdAt={new Date().toISOString()}
        acknowledgedBy="R-101"
        acknowledgedName="Ranger John"
        acknowledgedAt={new Date().toISOString()}
        responses={[
          {
            responseId: 'resp-01',
            responderId: 'R-101',
            responderName: 'Ranger John',
            action: ResponseAction.WARNED_COMMUNITY,
            notes: 'Warned local villagers near northern gate.',
            respondedAt: new Date().toISOString()
          }
        ]}
      />
    );

    expect(screen.getByText('🚨 Alert Generated & Persisted')).toBeInTheDocument();
    expect(screen.getByText('🔵 Acknowledged by Ranger')).toBeInTheDocument();
    expect(screen.getByText(/WARNED COMMUNITY/i)).toBeInTheDocument();
    expect(screen.getByText('Warned local villagers near northern gate.')).toBeInTheDocument();
  });

  test('conflictAlertApi.acknowledgeAlert sends API request to backend', async () => {
    const mockUpdatedAlert = {
      ...sampleAlert,
      status: AlertStatus.ACKNOWLEDGED,
      acknowledgedBy: 'R-101',
      acknowledgedName: 'Ranger John',
      acknowledgedAt: new Date().toISOString()
    };

    vi.spyOn(http, 'post').mockResolvedValueOnce({
      data: { success: true, data: mockUpdatedAlert }
    } as any);

    const result = await conflictAlertApi.acknowledgeAlert('alert-test-01');

    expect(result.status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(result.acknowledgedBy).toBe('R-101');
  });

  test('conflictAlertApi.resolveAlert resolves alert with notes', async () => {
    const mockResolvedAlert = {
      ...sampleAlert,
      status: AlertStatus.RESOLVED,
      resolvedBy: 'R-101',
      resolvedName: 'Ranger John',
      resolvedAt: new Date().toISOString(),
      resolutionNotes: 'Elephant safely guided back.'
    };

    vi.spyOn(http, 'post').mockResolvedValueOnce({
      data: { success: true, data: mockResolvedAlert }
    } as any);

    const result = await conflictAlertApi.resolveAlert('alert-test-01', {
      resolutionNotes: 'Elephant safely guided back.'
    });

    expect(result.status).toBe(AlertStatus.RESOLVED);
    expect(result.resolutionNotes).toBe('Elephant safely guided back.');
  });
});
