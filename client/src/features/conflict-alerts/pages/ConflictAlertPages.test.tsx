import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MockInstance } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../../shared/api/apiError';
import { syncService } from '../../../offline/syncService';
import { AlertSeverity, AlertSource, AlertStatus, ConflictAlertType, LocationSource, ResponseAction, SyncStatus } from '../../../shared/types/enums';
import type { WildlifeConflictAlert } from '../types/conflictAlert';
import { conflictAlertApi } from '../api/conflictAlertApi';
import { ConflictAlertsPage } from './ConflictAlertsPage';
import { ConflictAlertDetailPage } from './ConflictAlertDetailPage';

vi.mock('../api/conflictAlertApi', () => ({
  conflictAlertApi: {
    getAlerts: vi.fn(),
    getAlertById: vi.fn(),
    getHistory: vi.fn(),
    acknowledgeAlert: vi.fn(),
    addResponse: vi.fn(),
    resolveAlert: vi.fn(),
    updateAlert: vi.fn(),
    cancelAlert: vi.fn(),
    deleteAlert: vi.fn(),
    updateResponse: vi.fn(),
    deleteResponse: vi.fn(),
    simulateCollar: vi.fn(),
    submitCommunityReport: vi.fn()
  }
}));
// The shared park picker loads parks over the network; a plain select keeps these tests on UC-C behaviour.
vi.mock('../../../shared/components/OptionalParkSelect', () => ({
  OptionalParkSelect: ({ value, onChange }: { value: string; onChange: (id: string) => void }) => (
    <select aria-label="Park" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">No park</option>
    </select>
  )
}));
// Leaflet rendering is covered by the map component test; here only the alert it receives matters.
vi.mock('../components/ConflictAlertMap', () => ({
  ConflictAlertMap: ({ alert }: { alert: WildlifeConflictAlert }) => <div data-testid="alert-map">{alert.location.latitude},{alert.location.longitude}</div>
}));

// UC-C pages driven through user actions, with the conflict-alert API mocked.
const api = vi.mocked(conflictAlertApi);
const alert = (overrides: Partial<WildlifeConflictAlert> = {}): WildlifeConflictAlert => ({
  _id: 'alert-1',
  source: AlertSource.COLLAR,
  alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
  severity: AlertSeverity.HIGH,
  status: AlertStatus.OPEN,
  location: { latitude: -2.1523, longitude: 34.8214, timestamp: '2026-10-09T07:00:00.000Z', source: LocationSource.GPS },
  description: 'Elephant at the buffer fence',
  animalId: 'ELEPHANT-001',
  responses: [],
  syncStatus: SyncStatus.SYNCED,
  createdAt: '2026-10-09T07:00:00.000Z',
  updatedAt: '2026-10-09T07:00:00.000Z',
  ...overrides
});
const response = { responseId: 'resp-1', responderId: 'R-101', responderName: 'Ranger John', action: ResponseAction.INVESTIGATED_AREA, notes: 'Checked the fence', respondedAt: '2026-10-09T07:30:00.000Z' };

function renderList() {
  return render(
    <MemoryRouter>
      <ConflictAlertsPage />
    </MemoryRouter>
  );
}
function renderDetail(id = 'alert-1') {
  return render(
    <MemoryRouter initialEntries={[`/ranger/alerts/${id}`]}>
      <Routes>
        <Route path="/ranger/alerts/:alertId" element={<ConflictAlertDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

let queueCounts: MockInstance<typeof syncService.getQueueCounts>;
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  queueCounts = vi.spyOn(syncService, 'getQueueCounts').mockResolvedValue({ pending: 0, syncing: 0, failed: 0 });
  api.getHistory.mockResolvedValue([]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('ConflictAlertsPage', () => {
  test('shows a loading state, then the alert cards with the active count', async () => {
    let resolve!: (alerts: WildlifeConflictAlert[]) => void;
    api.getAlerts.mockReturnValue(new Promise(r => (resolve = r)));
    renderList();
    expect(screen.getByText('Loading active wildlife conflict alerts...')).toBeInTheDocument();

    resolve([alert(), alert({ _id: 'alert-2', status: AlertStatus.ACKNOWLEDGED }), alert({ _id: 'alert-3', status: AlertStatus.RESOLVED })]);

    expect(await screen.findByText('2 active')).toBeInTheDocument();
    expect(screen.getAllByText('View Alert Details →')).toHaveLength(3);
    expect(api.getAlerts).toHaveBeenCalledWith({});
  });

  test('an empty list shows the quiet-boundaries empty state', async () => {
    api.getAlerts.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText('No active wildlife conflict alerts')).toBeInTheDocument();
    expect(screen.queryByText(/active$/)).not.toBeInTheDocument();
  });

  test('a load failure shows the error message', async () => {
    api.getAlerts.mockRejectedValue(new Error('No cached conflict alerts are available offline.'));
    renderList();
    expect(await screen.findByText(/No cached conflict alerts are available offline\./)).toBeInTheDocument();
  });

  test('choosing historical or active status and severity filters reloads the list with those filters', async () => {
    api.getAlerts.mockResolvedValue([]);
    renderList();
    await screen.findByText('No active wildlife conflict alerts');
    const [status, severity] = screen.getAllByRole('combobox');

    await userEvent.selectOptions(status, AlertStatus.RESOLVED);
    await waitFor(() => expect(api.getAlerts).toHaveBeenLastCalledWith({ status: AlertStatus.RESOLVED }));
    await userEvent.selectOptions(severity, AlertSeverity.CRITICAL);
    await waitFor(() => expect(api.getAlerts).toHaveBeenLastCalledWith({ status: AlertStatus.RESOLVED, severity: AlertSeverity.CRITICAL }));
    await userEvent.selectOptions(status, AlertStatus.OPEN);
    await waitFor(() => expect(api.getAlerts).toHaveBeenLastCalledWith({ status: AlertStatus.OPEN, severity: AlertSeverity.CRITICAL }));
  });

  test('Refresh reloads the alerts', async () => {
    api.getAlerts.mockResolvedValue([]);
    renderList();
    await screen.findByText('No active wildlife conflict alerts');
    await userEvent.click(screen.getByText('🔄 Refresh Alerts'));
    await waitFor(() => expect(api.getAlerts).toHaveBeenCalledTimes(2));
  });

  test('pending and syncing queue items are announced', async () => {
    api.getAlerts.mockResolvedValue([]);
    queueCounts.mockResolvedValueOnce({ pending: 2, syncing: 0, failed: 0 });
    const { unmount } = renderList();
    expect(await screen.findByText('2 conflict-alert action(s) pending synchronization.')).toBeInTheDocument();
    expect(queueCounts).toHaveBeenCalledWith('conflict-alerts');
    unmount();

    queueCounts.mockResolvedValue({ pending: 1, syncing: 1, failed: 0 });
    renderList();
    expect(await screen.findByText('Synchronizing conflict-alert actions...')).toBeInTheDocument();
  });

  test('failed synchronisation offers Retry sync, which retries the queue and reloads the alerts', async () => {
    api.getAlerts.mockResolvedValue([]);
    queueCounts.mockResolvedValue({ pending: 0, syncing: 0, failed: 3 });
    const retry = vi.spyOn(syncService, 'retryFailed').mockResolvedValue();
    renderList();

    await userEvent.click(await screen.findByRole('button', { name: 'Retry sync (3)' }));

    expect(retry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.getAlerts).toHaveBeenCalledTimes(2));
  });

  test('collar simulator inside a risk zone: the new alert appears after the reading is sent', async () => {
    api.getAlerts.mockResolvedValueOnce([]).mockResolvedValueOnce([alert({ _id: 'alert-new', description: 'Collar breach alert for ELEPHANT-001' })]);
    api.simulateCollar.mockResolvedValue({ ...alert({ _id: 'alert-new' }), alertCreated: true } as WildlifeConflictAlert);
    renderList();
    await screen.findByText('No active wildlife conflict alerts');

    await userEvent.click(screen.getByText('🛰️ Collar Simulator'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate Collar Alert' }));

    expect(api.simulateCollar).toHaveBeenCalledWith(expect.objectContaining({ animalId: 'ELEPHANT-001', latitude: -2.1523, longitude: 34.8214, parkId: undefined }));
    expect(await screen.findByText('Collar breach alert for ELEPHANT-001')).toBeInTheDocument();
    expect(screen.queryByText('🛰️ Wildlife Collar Simulator')).not.toBeInTheDocument();
  });

  test('collar simulator outside every zone: no alert card is shown', async () => {
    api.getAlerts.mockResolvedValue([]);
    api.simulateCollar.mockResolvedValue({ alertCreated: false, telemetrySaved: true } as unknown as WildlifeConflictAlert);
    renderList();
    await screen.findByText('No active wildlife conflict alerts');

    await userEvent.click(screen.getByText('🛰️ Collar Simulator'));
    const [latitude, longitude] = screen.getAllByRole('spinbutton');
    await userEvent.clear(latitude);
    await userEvent.type(latitude, '0');
    await userEvent.clear(longitude);
    await userEvent.type(longitude, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Generate Collar Alert' }));

    expect(api.simulateCollar).toHaveBeenCalledWith(expect.objectContaining({ latitude: 0, longitude: 0 }));
    await waitFor(() => expect(api.getAlerts).toHaveBeenCalledTimes(2));
    expect(screen.getByText('No active wildlife conflict alerts')).toBeInTheDocument();
    expect(screen.queryByText('View Alert Details →')).not.toBeInTheDocument();
  });

  test('collar simulator with invalid coordinates shows the server rejection and stays open', async () => {
    api.getAlerts.mockResolvedValue([]);
    api.simulateCollar.mockRejectedValue(new ApiError('Number must be less than or equal to 90', 400, 'VALIDATION_ERROR'));
    renderList();
    await screen.findByText('No active wildlife conflict alerts');

    await userEvent.click(screen.getByText('🛰️ Collar Simulator'));
    const [latitude] = screen.getAllByRole('spinbutton');
    await userEvent.clear(latitude);
    await userEvent.type(latitude, '95');
    await userEvent.click(screen.getByRole('button', { name: 'Generate Collar Alert' }));

    expect(await screen.findByText(/Number must be less than or equal to 90/)).toBeInTheDocument();
    expect(api.simulateCollar).toHaveBeenCalledWith(expect.objectContaining({ latitude: 95 }));
    expect(screen.getByText('🛰️ Wildlife Collar Simulator')).toBeInTheDocument();
    expect(api.getAlerts).toHaveBeenCalledTimes(1);
  });

  test('a community report is submitted from the modal; a failure is shown in the modal', async () => {
    api.getAlerts.mockResolvedValue([]);
    api.submitCommunityReport.mockRejectedValueOnce(new ApiError('Report description must be at least 5 characters', 400)).mockResolvedValueOnce(alert({ source: AlertSource.COMMUNITY_REPORT }));
    renderList();
    await screen.findByText('No active wildlife conflict alerts');

    await userEvent.click(screen.getByText('👥 + Community Report'));
    await userEvent.click(screen.getByRole('button', { name: 'Submit Community Report' }));
    expect(await screen.findByText(/Report description must be at least 5 characters/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Submit Community Report' }));
    await waitFor(() => expect(screen.queryByText('👥 Community Conflict Report')).not.toBeInTheDocument());
    expect(api.submitCommunityReport).toHaveBeenLastCalledWith(expect.objectContaining({ reporterName: 'Mzee Juma', reportType: ConflictAlertType.CROP_RAID, latitude: -2.189, longitude: 34.841 }));
  });

  test('deleting from the list asks for confirmation, removes the card and reports a pending offline delete', async () => {
    api.getAlerts.mockResolvedValue([alert(), alert({ _id: 'alert-2', description: 'Second alert' })]);
    api.deleteAlert.mockResolvedValue({ ...alert(), isDeleted: true, syncStatus: SyncStatus.PENDING });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderList();
    await screen.findByText('Second alert');

    await userEvent.click(screen.getAllByText('Delete')[0]);
    expect(api.deleteAlert).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByText('Delete')[0]);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(api.deleteAlert).toHaveBeenCalledWith('alert-1', 'Deleted from alert list');
    expect(await screen.findByText(/Alert deleted locally; deletion is pending synchronization\./)).toBeInTheDocument();
    expect(screen.queryByText('Elephant at the buffer fence')).not.toBeInTheDocument();
  });

  test('a failed delete shows the error and keeps the card', async () => {
    api.getAlerts.mockResolvedValue([alert()]);
    api.deleteAlert.mockRejectedValue(new ApiError('Unauthorized: RESOLVED alerts are read-only.', 403));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderList();
    await userEvent.click(await screen.findByText('Delete'));
    expect(await screen.findByText(/Unauthorized: RESOLVED alerts are read-only\./)).toBeInTheDocument();
    expect(screen.getByText('Elephant at the buffer fence')).toBeInTheDocument();
  });
});

describe('ConflictAlertDetailPage', () => {
  test('shows a loading state, then the source, coordinates, sync status and map location', async () => {
    let resolve!: (a: WildlifeConflictAlert) => void;
    api.getAlertById.mockReturnValue(new Promise(r => (resolve = r)));
    renderDetail();
    expect(screen.getByText('Loading conflict alert details...')).toBeInTheDocument();

    resolve(alert());

    expect(await screen.findByText('🛰️ Collar (ELEPHANT-001)')).toBeInTheDocument();
    expect(screen.getByText('-2.1523, 34.8214')).toBeInTheDocument();
    expect(screen.getByText('Sync: SYNCED')).toBeInTheDocument();
    expect(screen.getByTestId('alert-map')).toHaveTextContent('-2.1523,34.8214');
    expect(api.getAlertById).toHaveBeenCalledWith('alert-1');
    expect(api.getHistory).toHaveBeenCalledWith('alert-1');
  });

  test('a community alert shows its reporter; PENDING and FAILED sync states are visible', async () => {
    api.getAlertById.mockResolvedValueOnce(alert({ source: AlertSource.COMMUNITY_REPORT, reporterName: 'Mzee Juma', syncStatus: SyncStatus.PENDING }));
    const { unmount } = renderDetail();
    expect(await screen.findByText('👥 Community (Mzee Juma)')).toBeInTheDocument();
    expect(screen.getByText('Sync: PENDING')).toBeInTheDocument();
    unmount();

    api.getAlertById.mockResolvedValueOnce(alert({ syncStatus: SyncStatus.FAILED }));
    renderDetail();
    expect(await screen.findByText('Sync: FAILED')).toBeInTheDocument();
  });

  test('an unknown alert shows the not-found message', async () => {
    api.getAlertById.mockRejectedValue(new ApiError('Wildlife conflict alert not found.', 404));
    renderDetail('missing');
    expect(await screen.findByText(/Wildlife conflict alert not found\./)).toBeInTheDocument();
    expect(screen.getByText('← Back to Conflict Alerts')).toBeInTheDocument();
  });

  test('acknowledging an OPEN alert online confirms synchronisation and shows the responder in the history', async () => {
    api.getAlertById.mockResolvedValue(alert());
    api.acknowledgeAlert.mockResolvedValue(alert({ status: AlertStatus.ACKNOWLEDGED, acknowledgedBy: 'R-101', acknowledgedName: 'Ranger John', acknowledgedAt: '2026-10-09T07:10:00.000Z' }));
    renderDetail();

    await userEvent.click(await screen.findByText('🔵 Acknowledge Alert'));

    expect(await screen.findByText(/Alert acknowledged and synchronized with central server\./)).toBeInTheDocument();
    expect(screen.getByText('Current Status: ACKNOWLEDGED')).toBeInTheDocument();
    expect(screen.getByText('🔵 Acknowledged by Ranger')).toBeInTheDocument();
    expect(screen.queryByText('🔵 Acknowledge Alert')).not.toBeInTheDocument();
  });

  test('acknowledging offline reports that the action is queued', async () => {
    api.getAlertById.mockResolvedValue(alert());
    api.acknowledgeAlert.mockResolvedValue(alert({ status: AlertStatus.ACKNOWLEDGED, syncStatus: SyncStatus.PENDING }));
    renderDetail();
    await userEvent.click(await screen.findByText('🔵 Acknowledge Alert'));
    expect(await screen.findByText(/Alert acknowledged locally\. Action queued for synchronization\./)).toBeInTheDocument();
    expect(screen.getByText('Sync: PENDING')).toBeInTheDocument();
  });

  test('a rejected acknowledgement (409) shows the server message', async () => {
    api.getAlertById.mockResolvedValue(alert());
    api.acknowledgeAlert.mockRejectedValue(new ApiError('Invalid state transition: ACKNOWLEDGED alert cannot be acknowledged.', 409, 'INVALID_STATE_TRANSITION'));
    renderDetail();
    await userEvent.click(await screen.findByText('🔵 Acknowledge Alert'));
    expect(await screen.findByText(/ACKNOWLEDGED alert cannot be acknowledged\./)).toBeInTheDocument();
  });

  test('an ACKNOWLEDGED alert offers a response form (not Resolve); a saved response moves it to RESPONDING', async () => {
    api.getAlertById.mockResolvedValue(alert({ status: AlertStatus.ACKNOWLEDGED }));
    api.addResponse.mockResolvedValue(alert({ status: AlertStatus.RESPONDING, responses: [{ ...response, action: ResponseAction.WARNED_COMMUNITY, notes: 'Warned the village', outcome: 'Families safe' }] }));
    renderDetail();

    expect(await screen.findByText('🟡 Record Action Taken')).toBeInTheDocument();
    expect(screen.queryByText('🟢 Resolve Alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('🟡 Record Action Taken'));
    await userEvent.selectOptions(screen.getByDisplayValue('🔍 Investigated Area'), ResponseAction.WARNED_COMMUNITY);
    await userEvent.type(screen.getByPlaceholderText('Describe the actions taken by the ranger team...'), 'Warned the village');
    await userEvent.type(screen.getByPlaceholderText('e.g. Wildlife returned safely to core area'), 'Families safe');
    await userEvent.click(screen.getByText('💾 Save Response Action'));

    expect(api.addResponse).toHaveBeenCalledWith('alert-1', { action: ResponseAction.WARNED_COMMUNITY, notes: 'Warned the village', outcome: 'Families safe', markResolved: false, resolutionNotes: undefined });
    expect(await screen.findByText(/Response recorded and synchronized with central server\./)).toBeInTheDocument();
    expect(screen.getByText('Current Status: RESPONDING')).toBeInTheDocument();
    expect(screen.getByText('Outcome: Families safe')).toBeInTheDocument();
  });

  test('saving a response offline, or saving and resolving, shows the matching confirmation', async () => {
    api.getAlertById.mockResolvedValue(alert({ status: AlertStatus.RESPONDING, responses: [response] }));
    api.addResponse.mockResolvedValueOnce(alert({ status: AlertStatus.RESPONDING, syncStatus: SyncStatus.PENDING })).mockResolvedValueOnce(alert({ status: AlertStatus.RESOLVED, resolutionNotes: 'Herd left' }));
    renderDetail();

    await userEvent.click(await screen.findByText('🟡 Record Additional Action'));
    await userEvent.type(screen.getByPlaceholderText('Describe the actions taken by the ranger team...'), 'Monitoring');
    await userEvent.click(screen.getByText('💾 Save Response Action'));
    expect(await screen.findByText(/Response saved locally\. Action queued for synchronization\./)).toBeInTheDocument();

    await userEvent.click(screen.getByText('🟡 Record Additional Action'));
    await userEvent.type(screen.getByPlaceholderText('Describe the actions taken by the ranger team...'), 'Herd pushed back');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.type(screen.getByPlaceholderText('Explain why the conflict condition is now fully resolved...'), 'Herd left');
    await userEvent.click(screen.getByText('🟢 Save & Resolve Alert'));
    expect(await screen.findByText(/Response recorded and alert resolved successfully on central server\./)).toBeInTheDocument();
    expect(api.addResponse).toHaveBeenLastCalledWith('alert-1', expect.objectContaining({ markResolved: true, resolutionNotes: 'Herd left' }));
  });

  test('resolving a RESPONDING alert requires notes and then records the resolution', async () => {
    api.getAlertById.mockResolvedValue(alert({ status: AlertStatus.RESPONDING, responses: [response] }));
    api.resolveAlert.mockResolvedValue(alert({ status: AlertStatus.RESOLVED, responses: [response], resolvedBy: 'R-101', resolvedName: 'Ranger John', resolvedAt: '2026-10-09T08:00:00.000Z', resolutionNotes: 'Herd returned', syncStatus: SyncStatus.PENDING }));
    renderDetail();

    await userEvent.click(await screen.findByText('🟢 Resolve Alert'));
    await userEvent.click(screen.getByText('Confirm Resolve Alert'));
    expect(api.resolveAlert).not.toHaveBeenCalled();

    await userEvent.type(screen.getByPlaceholderText('Explain how the conflict situation was successfully handled...'), 'Herd returned');
    await userEvent.click(screen.getByText('Confirm Resolve Alert'));

    expect(api.resolveAlert).toHaveBeenCalledWith('alert-1', { resolutionNotes: 'Herd returned' });
    expect(await screen.findByText(/Alert resolved locally — Pending synchronization\./)).toBeInTheDocument();
    expect(screen.getByText('Resolution Notes: Herd returned')).toBeInTheDocument();
  });

  test('too-short resolution notes are refused before any request', async () => {
    api.getAlertById.mockResolvedValue(alert({ status: AlertStatus.RESPONDING }));
    renderDetail();
    await userEvent.click(await screen.findByText('🟢 Resolve Alert'));
    await userEvent.type(screen.getByPlaceholderText('Explain how the conflict situation was successfully handled...'), 'ok');
    await userEvent.click(screen.getByText('Confirm Resolve Alert'));
    expect(await screen.findByText(/Please provide resolution summary notes \(minimum 3 characters\)\./)).toBeInTheDocument();
    expect(api.resolveAlert).not.toHaveBeenCalled();
  });

  test('a RESOLVED alert is read-only: no lifecycle, edit, cancel or response edit controls', async () => {
    api.getAlertById.mockResolvedValue(alert({ status: AlertStatus.RESOLVED, responses: [response], resolutionNotes: 'Herd returned' }));
    renderDetail();
    expect(await screen.findByText('This conflict alert is fully RESOLVED.')).toBeInTheDocument();
    expect(screen.getByText('Notes: Herd returned')).toBeInTheDocument();
    for (const control of ['🔵 Acknowledge Alert', '🟢 Resolve Alert', 'Edit Alert', 'Cancel Alert', 'Edit']) expect(screen.queryByText(control)).not.toBeInTheDocument();
    expect(screen.getByText('Delete Alert')).toBeInTheDocument();
  });

  test('a CANCELLED alert says no further lifecycle actions are allowed', async () => {
    api.getAlertById.mockResolvedValue(alert({ status: AlertStatus.CANCELLED }));
    renderDetail();
    expect(await screen.findByText('This alert is CANCELLED. No further lifecycle actions are allowed.')).toBeInTheDocument();
    expect(screen.queryByText('🔵 Acknowledge Alert')).not.toBeInTheDocument();
  });

  test('editing the alert sends the new description and severity', async () => {
    api.getAlertById.mockResolvedValue(alert());
    api.updateAlert.mockResolvedValue(alert({ description: 'Two elephants', severity: AlertSeverity.CRITICAL, syncStatus: SyncStatus.PENDING }));
    renderDetail();

    await userEvent.click(await screen.findByText('Edit Alert'));
    const editor = screen.getByText('Edit Alert', { selector: 'h3' }).closest('form')!;
    await userEvent.clear(within(editor).getByRole('textbox'));
    await userEvent.type(within(editor).getByRole('textbox'), 'Two elephants');
    await userEvent.selectOptions(within(editor).getByRole('combobox'), AlertSeverity.CRITICAL);
    await userEvent.click(within(editor).getByText('Save'));

    expect(api.updateAlert).toHaveBeenCalledWith('alert-1', { description: 'Two elephants', severity: AlertSeverity.CRITICAL });
    expect(await screen.findByText(/Alert edited locally; pending synchronization\./)).toBeInTheDocument();
    expect(screen.getByText('"Two elephants"')).toBeInTheDocument();
  });

  test('cancelling the alert sends the reason and shows the CANCELLED state', async () => {
    api.getAlertById.mockResolvedValue(alert());
    api.cancelAlert.mockResolvedValue(alert({ status: AlertStatus.CANCELLED }));
    renderDetail();

    await userEvent.click(await screen.findByText('Cancel Alert'));
    await userEvent.type(screen.getByPlaceholderText('Cancellation reason (required)'), 'False alarm');
    await userEvent.click(screen.getByText('Confirm Cancel'));

    expect(api.cancelAlert).toHaveBeenCalledWith('alert-1', 'False alarm');
    expect(await screen.findByText(/Alert cancelled\./)).toBeInTheDocument();
    expect(screen.getByText('This alert is CANCELLED. No further lifecycle actions are allowed.')).toBeInTheDocument();
  });

  test('a rejected cancel shows the server message', async () => {
    api.getAlertById.mockResolvedValue(alert());
    api.cancelAlert.mockRejectedValue(new ApiError('Invalid state transition: RESOLVED alert cannot be cancelled.', 409));
    renderDetail();
    await userEvent.click(await screen.findByText('Cancel Alert'));
    await userEvent.type(screen.getByPlaceholderText('Cancellation reason (required)'), 'Too late');
    await userEvent.click(screen.getByText('Confirm Cancel'));
    expect(await screen.findByText(/RESOLVED alert cannot be cancelled\./)).toBeInTheDocument();
  });

  test('deleting the alert after confirmation reports the soft delete', async () => {
    api.getAlertById.mockResolvedValue(alert());
    api.deleteAlert.mockResolvedValue(alert({ isDeleted: true }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDetail();
    await userEvent.click(await screen.findByText('Delete Alert'));
    expect(api.deleteAlert).toHaveBeenCalledWith('alert-1', 'Deleted from alert detail');
    expect(await screen.findByText(/Alert soft-deleted\./)).toBeInTheDocument();
  });

  test('a response can be edited and deleted from the history timeline', async () => {
    api.getAlertById.mockResolvedValue(alert({ status: AlertStatus.RESPONDING, responses: [response] }));
    api.updateResponse.mockResolvedValue(alert({ status: AlertStatus.RESPONDING, responses: [{ ...response, notes: 'Edited notes' }] }));
    api.deleteResponse.mockResolvedValue(alert({ status: AlertStatus.RESPONDING, responses: [], syncStatus: SyncStatus.PENDING }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDetail();

    await userEvent.click(await screen.findByText('Edit'));
    const editor = screen.getByText('Edit Response').closest('form')!;
    const notes = within(editor).getByDisplayValue('Checked the fence');
    await userEvent.clear(notes);
    await userEvent.type(notes, 'Edited notes');
    await userEvent.click(within(editor).getByText('Save'));
    expect(api.updateResponse).toHaveBeenCalledWith('alert-1', 'resp-1', { action: ResponseAction.INVESTIGATED_AREA, notes: 'Edited notes', outcome: undefined });
    expect(await screen.findByText(/Response updated\./)).toBeInTheDocument();

    await userEvent.click(screen.getByText('Delete'));
    expect(api.deleteResponse).toHaveBeenCalledWith('alert-1', 'resp-1');
    expect(await screen.findByText(/Response deleted locally; pending synchronization\./)).toBeInTheDocument();
  });

  test('audit entries such as UPDATE and CANCEL appear in the history with their reason', async () => {
    api.getAlertById.mockResolvedValue(alert({ status: AlertStatus.CANCELLED }));
    api.getHistory.mockResolvedValue([
      { id: 'h-1', alertId: 'alert-1', action: 'CREATE', performedBy: 'SYSTEM', timestamp: '2026-10-09T07:00:00.000Z' },
      { id: 'h-2', alertId: 'alert-1', action: 'CANCEL', performedBy: 'R-101', performedName: 'Ranger John', timestamp: '2026-10-09T07:20:00.000Z', reason: 'False alarm' }
    ]);
    renderDetail();
    expect(await screen.findByText('CANCEL')).toBeInTheDocument();
    expect(screen.getByText('Reason: False alarm')).toBeInTheDocument();
    expect(screen.queryByText('CREATE')).not.toBeInTheDocument();
    expect(screen.getByText('2 events')).toBeInTheDocument();
  });
});
