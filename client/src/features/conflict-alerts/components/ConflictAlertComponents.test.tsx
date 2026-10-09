import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../../shared/api/apiError';
import { AlertSeverity, AlertSource, AlertStatus, ConflictAlertType, LocationSource, ResponseAction, SyncStatus } from '../../../shared/types/enums';
import type { WildlifeConflictAlert } from '../types/conflictAlert';
import { conflictAlertApi } from '../api/conflictAlertApi';
import { ConflictAlertCard } from './ConflictAlertCard';
import { ConflictResponseForm } from './ConflictResponseForm';
import { CollarSimulatorModal } from './CollarSimulatorModal';
import { CommunityReportModal } from './CommunityReportModal';
import { ResponseHistoryTimeline } from './ResponseHistoryTimeline';

vi.mock('../../../shared/components/OptionalParkSelect', () => ({
  OptionalParkSelect: ({ value, onChange }: { value: string; onChange: (id: string) => void }) => (
    <select aria-label="Park" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">No park</option>
      <option value="park-1">Yala</option>
    </select>
  )
}));

// UC-C components: business-visible states (read-only, sync status, response form rules, simulator errors).
const alert = (overrides: Partial<WildlifeConflictAlert> = {}): WildlifeConflictAlert => ({
  _id: 'alert-1',
  source: AlertSource.COLLAR,
  alertType: ConflictAlertType.CROP_RAID,
  severity: AlertSeverity.LOW,
  status: AlertStatus.OPEN,
  location: { latitude: -2.1523, longitude: 34.8214, timestamp: '2026-10-09T07:00:00.000Z', source: LocationSource.GPS },
  description: 'Raid on maize',
  responses: [],
  createdAt: '2026-10-09T07:00:00.000Z',
  updatedAt: '2026-10-09T07:00:00.000Z',
  ...overrides
});
const renderCard = (props: Parameters<typeof ConflictAlertCard>[0]) => render(<MemoryRouter><ConflictAlertCard {...props} /></MemoryRouter>);

afterEach(() => vi.restoreAllMocks());

describe('ConflictAlertCard', () => {
  test('an active alert offers Edit and Delete; Delete passes the alert to the handler', async () => {
    const onDelete = vi.fn();
    renderCard({ alert: alert(), onDelete });
    expect(screen.getByText('Edit')).toHaveAttribute('href', '/ranger/alerts/alert-1');
    await userEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ _id: 'alert-1' }));
  });

  test.each([AlertStatus.RESOLVED, AlertStatus.CANCELLED])('a %s alert is read-only (no Edit or Delete)', status => {
    renderCard({ alert: alert({ status }), onDelete: vi.fn() });
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    expect(screen.getByText('View Alert Details →')).toBeInTheDocument();
  });

  test('sync status, response count and unnamed sources are shown', () => {
    const { unmount } = renderCard({ alert: alert({ syncStatus: SyncStatus.FAILED, responses: [{ responseId: 'r', responderId: 'R', responderName: 'R', action: ResponseAction.OTHER, notes: 'n', respondedAt: '2026-10-09T07:00:00.000Z' }] }) });
    expect(screen.getByText('SYNC FAILED')).toBeInTheDocument();
    expect(screen.getByText('💬 1 response(s)')).toBeInTheDocument();
    expect(screen.getByText('🛰️ Collar (Tracked)')).toBeInTheDocument();
    unmount();

    renderCard({ alert: alert({ source: AlertSource.COMMUNITY_REPORT }) });
    expect(screen.getByText('👥 Community (Member)')).toBeInTheDocument();
    expect(screen.getByText('SYNCED')).toBeInTheDocument();
    expect(screen.getByText('No responses yet')).toBeInTheDocument();
  });
});

describe('ConflictResponseForm', () => {
  test('submits the chosen action, trimmed notes and outcome; an empty outcome is omitted', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ConflictResponseForm onSubmit={onSubmit} />);

    await userEvent.selectOptions(screen.getByRole('combobox'), ResponseAction.ESCALATED_SITUATION);
    await userEvent.type(screen.getByPlaceholderText('Describe the actions taken by the ranger team...'), '  Called the vet  ');
    await userEvent.click(screen.getByText('💾 Save Response Action'));

    expect(onSubmit).toHaveBeenCalledWith({ action: ResponseAction.ESCALATED_SITUATION, notes: 'Called the vet', outcome: undefined, markResolved: false, resolutionNotes: undefined });
  });

  test('notes of exactly 3 characters are accepted; 2 are refused', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ConflictResponseForm onSubmit={onSubmit} />);
    const notes = screen.getByPlaceholderText('Describe the actions taken by the ranger team...');

    await userEvent.type(notes, 'ab');
    await userEvent.click(screen.getByText('💾 Save Response Action'));
    expect(screen.getByText(/minimum 3 characters/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(notes, 'c');
    await userEvent.click(screen.getByText('💾 Save Response Action'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ notes: 'abc' }));
  });

  test('a rejected submission (e.g. 409 from the server) is shown in the form', async () => {
    render(<ConflictResponseForm onSubmit={vi.fn().mockRejectedValue(new ApiError('Invalid state transition: Resolved alert cannot accept new responses.', 409))} />);
    await userEvent.type(screen.getByPlaceholderText('Describe the actions taken by the ranger team...'), 'Late action');
    await userEvent.click(screen.getByText('💾 Save Response Action'));
    expect(await screen.findByText(/Resolved alert cannot accept new responses\./)).toBeInTheDocument();
  });

  test('Cancel calls back, and every control is disabled while submitting', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(<ConflictResponseForm onSubmit={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<ConflictResponseForm onSubmit={vi.fn()} onCancel={onCancel} isSubmitting />);
    expect(screen.getByText('⏳ Saving Response...')).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});

describe('ResponseHistoryTimeline', () => {
  test('counts creation, acknowledgement, responses, resolution and non-lifecycle audit events', () => {
    render(
      <ResponseHistoryTimeline
        createdAt="2026-10-09T07:00:00.000Z"
        acknowledgedBy="R-7"
        acknowledgedAt="2026-10-09T07:05:00.000Z"
        resolvedBy="R-7"
        resolvedAt="2026-10-09T08:00:00.000Z"
        resolutionNotes="Herd left"
        responses={[{ responseId: 'r-1', responderId: 'R-7', responderName: '', action: ResponseAction.SECURED_AREA, notes: 'Fence fixed', respondedAt: '2026-10-09T07:30:00.000Z' }]}
        auditEntries={[
          { id: 'a', alertId: 'alert-1', action: 'ACKNOWLEDGE', performedBy: 'R-7', timestamp: '2026-10-09T07:05:00.000Z' },
          { id: 'b', alertId: 'alert-1', action: 'UPDATE_RESPONSE', performedBy: 'R-7', timestamp: '2026-10-09T07:40:00.000Z' }
        ]}
      />
    );
    expect(screen.getByText('5 events')).toBeInTheDocument();
    expect(screen.getByText('Responder:', { exact: false })).toHaveTextContent('Responder: R-7 (R-7)');
    expect(screen.getByText('By: R-7 (R-7)')).toBeInTheDocument();
    expect(screen.getByText('UPDATE RESPONSE')).toBeInTheDocument();
    expect(screen.getByText('Resolution Notes: Herd left')).toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });
});

describe('CommunityReportModal', () => {
  test('sends the edited location, type, severity and description; a blank reporter becomes "Community Member"', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<CommunityReportModal onSubmit={onSubmit} onClose={onClose} />);

    await userEvent.clear(screen.getByPlaceholderText('e.g. Local Elder / Village Member'));
    const [latitude, longitude] = screen.getAllByRole('spinbutton');
    await userEvent.clear(latitude);
    await userEvent.type(latitude, '-90');
    await userEvent.clear(longitude);
    await userEvent.type(longitude, '180');
    const [, type, severity] = screen.getAllByRole('combobox');
    await userEvent.selectOptions(type, ConflictAlertType.LIVESTOCK_THREAT);
    await userEvent.selectOptions(severity, AlertSeverity.CRITICAL);
    const description = screen.getByPlaceholderText('Describe the wildlife conflict report from the community...');
    await userEvent.clear(description);
    await userEvent.type(description, '  Lion near the boma  ');
    await userEvent.click(screen.getByRole('button', { name: 'Submit Community Report' }));

    expect(onSubmit).toHaveBeenCalledWith({ reporterName: 'Community Member', parkId: undefined, latitude: -90, longitude: 180, reportType: ConflictAlertType.LIVESTOCK_THREAT, severity: AlertSeverity.CRITICAL, description: 'Lion near the boma' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test('an error without a message falls back to a generic report error and the modal stays open', async () => {
    const onClose = vi.fn();
    render(<CommunityReportModal onSubmit={vi.fn().mockRejectedValue(new Error(''))} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit Community Report' }));
    expect(await screen.findByText(/Failed to submit community report\./)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('CollarSimulatorModal used on its own (collar monitoring page)', () => {
  test('sends the reading through the conflict-alert API and closes', async () => {
    const simulate = vi.spyOn(conflictAlertApi, 'simulateCollar').mockResolvedValue(null);
    const onClose = vi.fn();
    render(<CollarSimulatorModal onClose={onClose} />);

    const animal = screen.getByDisplayValue('ELEPHANT-001');
    await userEvent.clear(animal);
    await userEvent.type(animal, 'RHINO-4');
    await userEvent.selectOptions(screen.getByLabelText('Park'), 'park-1');
    await userEvent.click(screen.getByRole('button', { name: 'Generate Collar Alert' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(simulate).toHaveBeenCalledWith(expect.objectContaining({ animalId: 'RHINO-4', parkId: 'park-1', alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY, severity: AlertSeverity.HIGH }));
  });

  test('regression: negative coordinates can be typed from an empty field (minus sign is not lost)', async () => {
    const onSimulate = vi.fn().mockResolvedValue(undefined);
    render(<CollarSimulatorModal onSimulate={onSimulate} onClose={vi.fn()} />);
    const [latitude, longitude] = screen.getAllByRole('spinbutton');
    await userEvent.clear(latitude);
    await userEvent.type(latitude, '-2.5');
    await userEvent.clear(longitude);
    await userEvent.type(longitude, '-60.25');
    await userEvent.click(screen.getByRole('button', { name: 'Generate Collar Alert' }));
    expect(onSimulate).toHaveBeenCalledWith(expect.objectContaining({ latitude: -2.5, longitude: -60.25 }));
  });

  test('an API failure is displayed, the modal stays open and the button is usable again', async () => {
    vi.spyOn(conflictAlertApi, 'simulateCollar').mockRejectedValue(new ApiError('Request failed (503).', 503));
    const onClose = vi.fn();
    render(<CollarSimulatorModal onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Generate Collar Alert' }));

    expect(await screen.findByText(/Request failed \(503\)\./)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Generate Collar Alert' })).toBeEnabled();
  });

  test('an error without a message falls back to a generic simulator error', async () => {
    vi.spyOn(conflictAlertApi, 'simulateCollar').mockRejectedValue(new Error(''));
    render(<CollarSimulatorModal onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Generate Collar Alert' }));
    expect(await screen.findByText(/Failed to simulate collar event\./)).toBeInTheDocument();
  });
});
