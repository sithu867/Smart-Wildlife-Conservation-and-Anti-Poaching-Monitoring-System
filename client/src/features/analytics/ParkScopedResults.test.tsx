import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnalyticsResults } from './AnalyticsResults';
import { ConflictTrendResults } from './CategoryResults';
import { result, validCriteria } from './analyticsTestFixtures';
import { installAnalyticsObservers } from './analyticsTestSetup';
import { OptionalParkSelect } from '../../shared/components/OptionalParkSelect';
import { http } from '../../shared/api/http';
import { CommunityReportModal } from '../conflict-alerts/components/CommunityReportModal';
import { CollarSimulatorModal } from '../conflict-alerts/components/CollarSimulatorModal';
import { ReportIncidentPage } from '../incidents/pages/ReportIncidentPage';
import { incidentApi } from '../incidents/api/incidentApi';
import { IncidentType } from '../../shared/types/enums';
installAnalyticsObservers();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const parkId = validCriteria.parkId;
const parks = [{ id: parkId, name: 'Known Park', code: 'KNOWN' }];

test('zero-data categories render truthful totals and separate spatial empty states', () => {
  const data = result(
    {
      ...validCriteria,
      categories: ['INCIDENT_STATISTICS', 'INCIDENT_HOTSPOTS', 'HWC_TRENDS'],
    },
    'NO_MATCHING_DATA',
  );
  render(<AnalyticsResults data={data} appliedCriteria={data.filters} />);
  expect(
    screen.getByRole('status', { name: 'No matching conservation data' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: 'Incident Statistics results' }),
  ).toHaveTextContent('Total incidents: 0');
  expect(
    screen.getByRole('region', { name: 'Incident Hotspots results' }),
  ).toHaveTextContent('No incidents with valid coordinates');
  expect(
    screen.getByRole('region', {
      name: 'Human-Wildlife Conflict Trends results',
    }),
  ).toHaveTextContent('Total alerts: 0');
});
test('HWC locations render real Leaflet markers and ranked counts; zero responses remain valid', () => {
  const analysis = result({
    ...validCriteria,
    categories: ['HWC_TRENDS'],
  }).conflictTrends!;
  analysis.totalResponses = 0;
  analysis.locations = {
    gridSizeDegrees: 0.01,
    validAlertCount: 2,
    excludedCoordinateCount: 0,
    locations: [
      {
        cellId: '-216:3482',
        rank: 1,
        latitude: -2.152,
        longitude: 34.822,
        alertCount: 2,
        bySeverity: [{ name: 'HIGH', count: 2 }],
        byType: [{ name: 'CROP_RAID', count: 2 }],
      },
    ],
  };
  const view = render(<ConflictTrendResults analysis={analysis} />);
  expect(
    screen
      .getByRole('region', { name: 'Conflict location map' })
      .querySelector('path.leaflet-interactive'),
  ).toBeTruthy();
  expect(
    within(
      screen.getByRole('list', { name: 'Ranked conflict locations' }),
    ).getByText('Location 1: 2 alerts'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('No conflict responses match the applied criteria.'),
  ).toBeInTheDocument();
  // A different applied dataset replaces markers and list entries together.
  view.rerender(
    <ConflictTrendResults
      analysis={{
        ...analysis,
        locations: {
          ...analysis.locations,
          validAlertCount: 0,
          excludedCoordinateCount: 2,
          locations: [],
        },
      }}
    />,
  );
  expect(
    screen.queryByRole('region', { name: 'Conflict location map' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/They remain in alert totals/)).toBeInTheDocument();
});
test('park lookup failure keeps standalone submission available and offers retry', async () => {
  const get = vi
    .spyOn(http, 'get')
    .mockRejectedValueOnce(new Error('database details must stay private'))
    .mockResolvedValueOnce({ data: { success: true, data: parks } });
  const change = vi.fn();
  render(<OptionalParkSelect value="" onChange={change} />);
  expect(await screen.findByText(/Park list unavailable/)).toBeInTheDocument();
  expect(screen.queryByText(/database details/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading parks' }));
  await screen.findByRole('option', { name: 'Known Park (KNOWN)' });
  fireEvent.change(
    screen.getByLabelText('Park / Conservation Area (optional)'),
    { target: { value: parkId } },
  );
  expect(change).toHaveBeenCalledWith(parkId);
  expect(get).toHaveBeenCalledTimes(2);
  for (const call of get.mock.calls) {
    expect(call).toEqual(['/parks', { signal: expect.any(AbortSignal) }]);
  }
});
test.each(['community', 'collar'] as const)(
  '%s form retains existing submission and sends explicit park context',
  async (kind) => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({
      data: { success: true, data: parks },
    });
    const submit = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    render(
      kind === 'community' ? (
        <CommunityReportModal onSubmit={submit} onClose={close} />
      ) : (
        <CollarSimulatorModal onSimulate={submit} onClose={close} />
      ),
    );
    await screen.findByRole('option', { name: 'Known Park (KNOWN)' });
    expect(get).toHaveBeenCalledWith('/parks', {
      signal: expect.any(AbortSignal),
    });
    fireEvent.change(
      screen.getByLabelText('Park / Conservation Area (optional)'),
      { target: { value: parkId } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name:
          kind === 'community'
            ? 'Submit Community Report'
            : 'Generate Collar Alert',
      }),
    );
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          parkId,
          latitude: expect.any(Number),
          longitude: expect.any(Number),
          description: expect.any(String),
        }),
      ),
    );
    expect(close).toHaveBeenCalled();
  },
);
test('standalone incident exposes optional park capture; patrol-linked reporting derives park server-side', async () => {
  const get = vi.spyOn(http, 'get').mockResolvedValue({
    data: { success: true, data: parks },
  });
  const view = render(
    <MemoryRouter>
      <ReportIncidentPage />
    </MemoryRouter>,
  );
  await screen.findByRole('option', { name: 'Known Park (KNOWN)' });
  expect(get).toHaveBeenCalledWith('/parks', {
    signal: expect.any(AbortSignal),
  });
  expect(
    screen.getByLabelText('Park / Conservation Area (optional)'),
  ).toBeInTheDocument();
  view.unmount();
  render(
    <MemoryRouter
      initialEntries={['/ranger/incidents/report?sessionId=patrol-session']}
    >
      <ReportIncidentPage />
    </MemoryRouter>,
  );
  expect(
    screen.queryByLabelText('Park / Conservation Area (optional)'),
  ).not.toBeInTheDocument();
});
test('offline incident payload retains park through its later sync transport', async () => {
  const post = vi
    .spyOn(http, 'post')
    .mockRejectedValueOnce(new Error('offline'));
  const pending = await incidentApi.createIncident({
    clientIncidentId: 'offline-park',
    parkId,
    incidentType: IncidentType.SNARE,
    description: 'Recorded snare offline',
    latitude: -2.152,
    longitude: 34.822,
    evidence: [{ imageUrl: 'photo.jpg' }],
  });
  expect(pending.parkId).toBe(parkId);
  post.mockResolvedValueOnce({
    data: {
      success: true,
      data: { ...pending, _id: 'server-incident', syncStatus: 'SYNCED' },
    },
  });
  await incidentApi.syncIncidentPayload(pending);
  expect(post).toHaveBeenLastCalledWith(
    '/incidents',
    expect.objectContaining({ parkId, clientIncidentId: 'offline-park' }),
  );
});
