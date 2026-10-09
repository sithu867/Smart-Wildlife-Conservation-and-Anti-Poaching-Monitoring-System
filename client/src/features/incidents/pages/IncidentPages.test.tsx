import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, type InitialEntry } from 'react-router-dom';
import { ApiError } from '../../../shared/api/apiError';
import { geolocationService } from '../../../shared/geolocation/geolocation';
import { IncidentStatus, IncidentType, LocationSource, PatrolStatus, SyncStatus } from '../../../shared/types/enums';
import type { ConservationIncident, CreateIncidentPayload } from '../types/incident';
import { incidentApi } from '../api/incidentApi';
import { ReportIncidentPage } from './ReportIncidentPage';
import { IncidentHistoryPage } from './IncidentHistoryPage';
import { EditIncidentPage } from './EditIncidentPage';

vi.mock('../api/incidentApi', () => ({
  incidentApi: {
    createIncident: vi.fn(),
    getMyIncidents: vi.fn(),
    getIncidentById: vi.fn(),
    updateIncident: vi.fn(),
    deleteIncident: vi.fn(),
    restoreIncident: vi.fn(),
    discardLocalDraft: vi.fn(),
    retrySyncIncident: vi.fn()
  }
}));
vi.mock('../../../shared/geolocation/geolocation', () => ({ geolocationService: { getCurrentLocation: vi.fn() } }));
// The shared park picker loads parks over the network; a plain select keeps these tests on UC-B behaviour.
vi.mock('../../../shared/components/OptionalParkSelect', () => ({
  OptionalParkSelect: ({ value, onChange }: { value: string; onChange: (id: string) => void }) => (
    <select aria-label="Park" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">No park</option>
      <option value="park-1">Yala National Park</option>
    </select>
  )
}));

// UC-B pages driven through user actions, with the incident API and GPS mocked.
const api = vi.mocked(incidentApi);
const gps = vi.mocked(geolocationService);
const HOUR = 60 * 60 * 1000;

const incident = (overrides: Partial<ConservationIncident> = {}): ConservationIncident => ({
  _id: 'inc-1',
  clientIncidentId: 'client-inc-1',
  incidentType: IncidentType.SNARE,
  otherTypeDescription: null,
  description: 'Wire snare near the waterhole',
  location: { latitude: 6.475, longitude: 80.88, timestamp: '2026-10-08T12:00:00.000Z', source: LocationSource.GPS },
  reportedBy: 'R-101',
  rangerName: 'Ranger John',
  reportedAt: new Date(Date.now() - HOUR).toISOString(),
  patrolSession: null,
  evidence: [
    { evidenceId: 'evid-1', imageUrl: 'data:image/jpeg;base64,AAAA' },
    { evidenceId: 'evid-2', imageUrl: 'data:image/jpeg;base64,BBBB' }
  ],
  status: IncidentStatus.REPORTED,
  syncStatus: SyncStatus.SYNCED,
  canEdit: true,
  canDelete: true,
  editLockedReason: null,
  updatedAt: '2026-10-08T12:30:00.000Z',
  ...overrides
});
/** The server (or the offline store) echoes the submitted report with the given sync status. */
const echoCreate = (syncStatus: SyncStatus) =>
  api.createIncident.mockImplementation(async (payload: CreateIncidentPayload) =>
    incident({
      _id: payload.clientIncidentId!,
      clientIncidentId: payload.clientIncidentId,
      incidentType: payload.incidentType,
      description: payload.description,
      location: { latitude: payload.latitude, longitude: payload.longitude, timestamp: '2026-10-08T12:00:00.000Z', source: payload.locationSource! },
      syncStatus
    })
  );

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}
function renderAt(entry: InitialEntry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/ranger/incidents/new" element={<ReportIncidentPage />} />
        <Route path="/ranger/incidents" element={<IncidentHistoryPage />} />
        <Route path="/ranger/incidents/:incidentId/edit" element={<EditIncidentPage />} />
        <Route path="*" element={null} />
      </Routes>
      <CurrentLocation />
    </MemoryRouter>
  );
}
const currentPath = () => screen.getByTestId('location').textContent;
const submitted = () => api.createIncident.mock.calls[0][0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  gps.getCurrentLocation.mockResolvedValue({ latitude: 6.48, longitude: 80.9, accuracy: 6, timestamp: Date.now() });
  api.getMyIncidents.mockResolvedValue([]);
});
afterEach(() => {
  // Unmount before restoring mocks so no effect of a page reached by navigation runs against restored mocks.
  cleanup();
  vi.restoreAllMocks();
});

describe('ReportIncidentPage', () => {
  async function completeAndSubmit(container: HTMLElement) {
    fireEvent.click(screen.getByText('Animal Carcass'));
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['photo'], 'scene.jpg', { type: 'image/jpeg' })] } });
    await screen.findByText('✓ Evidence Captured');
    fireEvent.change(screen.getByPlaceholderText(/Describe observations/), { target: { value: 'Elephant carcass near the river' } });
    fireEvent.click(screen.getByText('Review Incident Details →'));
    fireEvent.click(await screen.findByText('Confirm & Submit'));
  }

  test('the GPS fix is shown and submitted as a GPS location; a synced report is confirmed', async () => {
    echoCreate(SyncStatus.SYNCED);
    const { container } = renderAt('/ranger/incidents/new');

    expect(await screen.findByText(/Location Ready \(GPS\)/)).toBeInTheDocument();
    expect(screen.getByText('Lat: 6.48000°, Lng: 80.90000°')).toBeInTheDocument();
    await completeAndSubmit(container);

    expect(await screen.findByText('Incident Reported Successfully')).toBeInTheDocument();
    expect(screen.getByText('🟢 SYNCED CENTRAL')).toBeInTheDocument();
    expect(submitted()).toMatchObject({
      incidentType: IncidentType.ANIMAL_CARCASS,
      description: 'Elephant carcass near the river',
      latitude: 6.48,
      longitude: 80.9,
      locationSource: LocationSource.GPS,
      clientIncidentId: expect.stringMatching(/^inc-/),
      evidence: [{ imageUrl: expect.stringMatching(/^data:image\/jpeg;base64,/), capturedAt: expect.any(String), fileSize: 5, mimeType: 'image/jpeg' }]
    });
  });

  test('when GPS permission is denied the ranger pins the location manually and it is submitted as MANUAL', async () => {
    gps.getCurrentLocation.mockRejectedValue({ code: 1, message: 'User denied Geolocation' });
    echoCreate(SyncStatus.SYNCED);
    const { container } = renderAt('/ranger/incidents/new');

    expect(await screen.findByText(/GPS Unavailable/)).toBeInTheDocument();
    expect(screen.getByText('GPS position fix is taking time or permission was denied.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Select Location Manually on Map'));
    fireEvent.change(screen.getByLabelText('Latitude (-90 to 90)'), { target: { value: '6.5' } });
    fireEvent.change(screen.getByLabelText('Longitude (-180 to 180)'), { target: { value: '80.95' } });
    fireEvent.click(screen.getByText('Confirm Manual Location ✓'));

    expect(screen.getByText(/Location Ready \(MANUAL\)/)).toBeInTheDocument();
    await completeAndSubmit(container);
    await screen.findByText('Incident Reported Successfully');
    expect(submitted()).toMatchObject({ latitude: 6.5, longitude: 80.95, locationSource: LocationSource.MANUAL });
  });

  test('a GPS location can be overridden with a manually pinned spot', async () => {
    echoCreate(SyncStatus.SYNCED);
    const { container } = renderAt('/ranger/incidents/new');

    fireEvent.click(await screen.findByText('Change Pin 📍'));
    fireEvent.change(screen.getByLabelText('Latitude (-90 to 90)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Longitude (-180 to 180)'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Confirm Manual Location ✓'));
    await completeAndSubmit(container);

    await screen.findByText('Incident Reported Successfully');
    expect(submitted()).toMatchObject({ latitude: 0, longitude: 0, locationSource: LocationSource.MANUAL });
  });

  test('a report saved on the device is confirmed as pending synchronisation, not as synced', async () => {
    echoCreate(SyncStatus.PENDING);
    const { container } = renderAt('/ranger/incidents/new');
    await screen.findByText(/Location Ready/);

    await completeAndSubmit(container);

    expect(await screen.findByText('Incident Saved Locally')).toBeInTheDocument();
    expect(screen.getByText('Pending Synchronization')).toBeInTheDocument();
    expect(screen.getByText('🟡 PENDING SYNC')).toBeInTheDocument();
    expect(screen.queryByText('Incident Reported Successfully')).not.toBeInTheDocument();
    expect(screen.queryByText('🟢 SYNCED CENTRAL')).not.toBeInTheDocument();
  });

  test('a report started from a patrol is linked to it, skips the park choice and returns to the patrol', async () => {
    echoCreate(SyncStatus.SYNCED);
    const { container } = renderAt('/ranger/incidents/new?sessionId=sess-9');

    expect(screen.getByText('Active Patrol Attached')).toBeInTheDocument();
    expect(screen.queryByLabelText('Park')).not.toBeInTheDocument();
    await screen.findByText(/Location Ready/);
    await completeAndSubmit(container);
    await screen.findByText('Incident Reported Successfully');

    expect(submitted()).toMatchObject({ patrolSessionId: 'sess-9', parkId: undefined });
    await userEvent.click(screen.getByText('Return to Active Patrol Tracking Screen'));
    expect(currentPath()).toBe('/ranger/patrol/active/sess-9');
  });

  test('a standalone report carries the chosen park, and the ranger can go to the report list', async () => {
    echoCreate(SyncStatus.SYNCED);
    const { container } = renderAt('/ranger/incidents/new');
    await screen.findByText(/Location Ready/);

    fireEvent.change(screen.getByLabelText('Park'), { target: { value: 'park-1' } });
    await completeAndSubmit(container);
    await screen.findByText('Incident Reported Successfully');

    expect(submitted()).toMatchObject({ parkId: 'park-1', patrolSessionId: undefined });
    await userEvent.click(screen.getByText('View My Reported Incidents →'));
    await waitFor(() => expect(currentPath()).toBe('/ranger/incidents'));
  });

  test('a device storage failure is explained and nothing is confirmed', async () => {
    api.createIncident.mockRejectedValue(new Error('Unable to save this incident on the device. Please try again.'));
    const { container } = renderAt('/ranger/incidents/new');
    await screen.findByText(/Location Ready/);

    await completeAndSubmit(container);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Could not save on this device')).toBeInTheDocument();
    expect(screen.queryByText('Incident Saved Locally')).not.toBeInTheDocument();
  });
});

describe('IncidentHistoryPage', () => {
  test('lists reports with their synced, pending and failed states and Retry only for unsynced ones', async () => {
    api.getMyIncidents.mockResolvedValue([
      incident({ _id: 'synced', editCount: 2, lastEditedAt: '2026-10-08T12:20:00.000Z' }),
      incident({ _id: 'pending', clientIncidentId: 'pending', syncStatus: SyncStatus.PENDING }),
      incident({ _id: 'failed', clientIncidentId: 'failed', syncStatus: SyncStatus.FAILED })
    ]);
    renderAt('/ranger/incidents');
    expect(screen.getByText('Retrieving your reported incidents...')).toBeInTheDocument();

    expect(await screen.findByText('3 Reported')).toBeInTheDocument();
    expect(screen.getByText('🟢 SYNCED')).toBeInTheDocument();
    expect(screen.getByText('🟡 PENDING SYNC')).toBeInTheDocument();
    expect(screen.getByText('🔴 SYNC FAILED')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry Sync 🔄' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Discard Draft/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Edit Report/ })).toHaveLength(1);
    expect(screen.getByText(/✏️ Edited 2×/)).toBeInTheDocument();
  });

  test('Retry Sync uploads the report and reloads the list', async () => {
    api.getMyIncidents
      .mockResolvedValueOnce([incident({ _id: 'failed', clientIncidentId: 'client-9', syncStatus: SyncStatus.FAILED })])
      .mockResolvedValueOnce([incident({ _id: 'srv-9', clientIncidentId: 'client-9' })]);
    api.retrySyncIncident.mockResolvedValue(incident({ _id: 'srv-9' }));
    renderAt('/ranger/incidents');

    await userEvent.click(await screen.findByRole('button', { name: 'Retry Sync 🔄' }));

    expect(api.retrySyncIncident).toHaveBeenCalledWith('client-9');
    expect(await screen.findByText('🟢 SYNCED')).toBeInTheDocument();
  });

  test('a failed Retry Sync explains the problem and keeps the report listed', async () => {
    api.getMyIncidents.mockResolvedValue([incident({ _id: 'failed', clientIncidentId: 'client-9', syncStatus: SyncStatus.FAILED })]);
    api.retrySyncIncident.mockRejectedValue(new Error('Request failed with status code 503'));
    renderAt('/ranger/incidents');

    await userEvent.click(await screen.findByRole('button', { name: 'Retry Sync 🔄' }));

    expect(await screen.findByText('Request failed with status code 503')).toBeInTheDocument();
    expect(screen.getByText('🔴 SYNC FAILED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry Sync 🔄' })).toBeEnabled();
  });

  test('a locked report shows why instead of Edit and Delete', async () => {
    api.getMyIncidents.mockResolvedValue([incident({ canEdit: false, canDelete: false, editLockedReason: 'PATROL_COMPLETED' })]);
    renderAt('/ranger/incidents');

    expect(await screen.findByText('🔒 Locked · Patrol completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Report/ })).not.toBeInTheDocument();
  });

  test('an empty list, or one that could not be loaded, shows the empty state', async () => {
    api.getMyIncidents.mockRejectedValue(new Error('IndexedDB unavailable'));
    renderAt('/ranger/incidents');

    expect(await screen.findByText('No Incidents Logged Yet')).toBeInTheDocument();
    expect(screen.getByText('0 Reported')).toBeInTheDocument();
  });

  test('Edit Report and Report New Incident open their pages', async () => {
    api.getMyIncidents.mockResolvedValue([incident()]);
    api.getIncidentById.mockResolvedValue(incident());
    renderAt('/ranger/incidents');

    await userEvent.click(await screen.findByRole('button', { name: /Edit Report/ }));
    expect(currentPath()).toBe('/ranger/incidents/inc-1/edit');
  });

  test('Undo offered after deleting from the edit page restores the report', async () => {
    api.restoreIncident.mockResolvedValue(incident());
    renderAt({ pathname: '/ranger/incidents', state: { withdrawn: { incidentId: 'inc-1', label: 'Wire Snare / Trap' } } });

    expect(await screen.findByText('"Wire Snare / Trap" report deleted')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(api.restoreIncident).toHaveBeenCalledWith('inc-1');
    await waitFor(() => expect(api.getMyIncidents).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('"Wire Snare / Trap" report deleted')).not.toBeInTheDocument();
  });

  test('an Undo refused by the server explains it and offers to reload the list', async () => {
    api.restoreIncident.mockRejectedValue(new ApiError('This report can no longer be restored.', 409, 'INCIDENT_LOCKED'));
    renderAt({ pathname: '/ranger/incidents', state: { withdrawn: { incidentId: 'inc-1', label: 'Wire Snare / Trap' } } });

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText("We couldn't restore this report")).toBeInTheDocument();
    expect(within(dialog).getByText('This report is locked')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reload Reports' }));
    await waitFor(() => expect(api.getMyIncidents).toHaveBeenCalledTimes(2));
  });
});

describe('EditIncidentPage', () => {
  test.each([
    ['cannot be loaded', () => api.getIncidentById.mockRejectedValue(new ApiError('This report no longer exists.', 404, 'INCIDENT_NOT_FOUND')), 'Report unavailable'],
    ['is only saved on the device', () => api.getIncidentById.mockResolvedValue(incident({ syncStatus: SyncStatus.PENDING })), 'Not synced yet'],
    ['was withdrawn', () => api.getIncidentById.mockResolvedValue(incident({ deletedAt: '2026-10-08T12:40:00.000Z' })), 'This report was deleted'],
    ['is locked', () => api.getIncidentById.mockResolvedValue(incident({ canEdit: false, editLockedReason: 'UNDER_INVESTIGATION' })), 'This report can no longer be edited']
  ])('a report that %s cannot be edited and offers a way back', async (_label, arrange, title) => {
    arrange();
    renderAt('/ranger/incidents/inc-1/edit');

    expect(await screen.findByText(title)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '← Back to My Reports' }));
    expect(currentPath()).toBe('/ranger/incidents');
    expect(api.updateIncident).not.toHaveBeenCalled();
  });

  test('a standalone report shows its 24-hour edit deadline', async () => {
    const reportedAt = '2026-10-08T06:00:00.000Z';
    api.getIncidentById.mockResolvedValue(incident({ reportedAt }));
    renderAt('/ranger/incidents/inc-1/edit');

    const deadline = new Date(new Date(reportedAt).getTime() + 24 * HOUR).toLocaleString();
    expect(await screen.findByText(`You can edit this report until ${deadline}.`)).toBeInTheDocument();
  });

  test('a corrected location and replaced photo are saved as MANUAL location and photo changes', async () => {
    const original = incident();
    api.getIncidentById.mockResolvedValue(original);
    api.updateIncident.mockResolvedValue(incident({ editCount: 1 }));
    const { container } = renderAt('/ranger/incidents/inc-1/edit');
    await screen.findByText('Edit Incident Report');

    fireEvent.click(screen.getByText('Change Pin 📍'));
    fireEvent.change(screen.getByLabelText('Latitude (-90 to 90)'), { target: { value: '6.485' } });
    fireEvent.click(screen.getByText('Confirm Manual Location ✓'));
    expect(screen.getByText(/Moved 1\.1 km from the original spot/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    fireEvent.change(container.querySelector('[data-testid="evidence-file-input"]')!, { target: { files: [new File(['png'], 'new.png', { type: 'image/png' })] } });
    await screen.findByText('New');
    fireEvent.click(screen.getByText(/Review Changes/));
    fireEvent.click(screen.getByText('Confirm & Save'));

    await screen.findByText('Changes Saved');
    expect(api.updateIncident).toHaveBeenCalledWith('inc-1', {
      location: { latitude: 6.485, longitude: 80.88, source: LocationSource.MANUAL },
      removeEvidenceIds: ['evid-1'],
      addEvidence: [{ imageUrl: expect.stringMatching(/^data:image\/png;base64,/), capturedAt: expect.any(String), fileSize: 3, mimeType: 'image/png' }],
      expectedUpdatedAt: '2026-10-08T12:30:00.000Z',
      editedAt: expect.any(String),
      clientEditId: expect.stringMatching(/^edit-/)
    });
  });

  test('a moved pin can be undone before saving', async () => {
    api.getIncidentById.mockResolvedValue(incident());
    renderAt('/ranger/incidents/inc-1/edit');
    await screen.findByText('Edit Incident Report');

    fireEvent.click(screen.getByText('Change Pin 📍'));
    fireEvent.change(screen.getByLabelText('Latitude (-90 to 90)'), { target: { value: '6.485' } });
    fireEvent.click(screen.getByText('Confirm Manual Location ✓'));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.getByText('Location (GPS)')).toBeInTheDocument();
    expect(screen.queryByText(/from the original spot/)).not.toBeInTheDocument();
  });

  test('an emptied description is caught before anything is sent', async () => {
    api.getIncidentById.mockResolvedValue(incident());
    renderAt('/ranger/incidents/inc-1/edit');
    await screen.findByText('Edit Incident Report');

    fireEvent.change(screen.getByLabelText(/Field Description/), { target: { value: '  ' } });
    fireEvent.click(screen.getByText(/Review Changes/));

    expect(within(screen.getByRole('alertdialog')).getByText('Description is empty')).toBeInTheDocument();
    expect(api.updateIncident).not.toHaveBeenCalled();
  });

  test('saving without a connection explains it and keeps the edits on screen', async () => {
    api.getIncidentById.mockResolvedValue(incident());
    api.updateIncident.mockRejectedValue(new ApiError('Saving changes needs an internet connection.', 0, 'OFFLINE'));
    renderAt('/ranger/incidents/inc-1/edit');
    await screen.findByText('Edit Incident Report');

    fireEvent.change(screen.getByLabelText(/Field Description/), { target: { value: 'Two snares near the waterhole' } });
    fireEvent.click(screen.getByText(/Review Changes/));
    fireEvent.click(screen.getByText('Confirm & Save'));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText("You're offline")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'OK, Got It' }));
    expect((screen.getByLabelText(/Field Description/) as HTMLTextAreaElement).value).toBe('Two snares near the waterhole');
  });

  test('Edit Again returns to the form starting from the saved version', async () => {
    api.getIncidentById.mockResolvedValue(incident());
    api.updateIncident.mockResolvedValue(incident({ description: 'Two snares near the waterhole', updatedAt: '2026-10-08T12:45:00.000Z' }));
    renderAt('/ranger/incidents/inc-1/edit');
    await screen.findByText('Edit Incident Report');

    fireEvent.change(screen.getByLabelText(/Field Description/), { target: { value: 'Two snares near the waterhole' } });
    fireEvent.click(screen.getByText(/Review Changes/));
    fireEvent.click(screen.getByText('Confirm & Save'));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Again' }));

    expect((screen.getByLabelText(/Field Description/) as HTMLTextAreaElement).value).toBe('Two snares near the waterhole');
    expect(screen.getByText('Review Changes →')).toBeInTheDocument();
  });

  test('a delete refused because of a newer version offers to load it', async () => {
    api.getIncidentById.mockResolvedValueOnce(incident()).mockResolvedValueOnce(incident({ description: 'Updated on another device' }));
    api.deleteIncident.mockRejectedValue(new ApiError('Changed elsewhere', 409, 'EDIT_CONFLICT'));
    renderAt('/ranger/incidents/inc-1/edit');
    await screen.findByText('Edit Incident Report');

    await userEvent.click(screen.getByRole('button', { name: '🗑️ Delete' }));
    await userEvent.click(screen.getByLabelText(/Duplicate report/));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Report' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText("We couldn't delete this report")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'See Latest' }));

    expect(await screen.findByText('Loaded the latest version of this report. Your unsaved changes were discarded.')).toBeInTheDocument();
    expect((screen.getByLabelText(/Field Description/) as HTMLTextAreaElement).value).toBe('Updated on another device');
    expect(currentPath()).toBe('/ranger/incidents/inc-1/edit');
  });
});
