import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { http } from '../../shared/api/http';
import { conflictAlertApi } from '../conflict-alerts/api/conflictAlertApi';
import { collarApi } from './api/collarApi';
import { CollarMonitoringPage } from './pages/CollarMonitoringPage';
import { CollarTelemetryHistoryModal } from './components/CollarTelemetryHistoryModal';
import type { CollarDevice, CollarStats, CollarTelemetry } from './types/collar';

vi.mock('../../shared/components/OptionalParkSelect', () => ({
  OptionalParkSelect: () => <select aria-label="Park"><option value="">No park</option></select>
}));

// UC-C collar monitoring (client): the collar API, the device monitoring page and its telemetry log.
const NOW = new Date('2026-10-09T08:00:00.000Z');
const device = (overrides: Partial<CollarDevice> = {}): CollarDevice => ({
  deviceId: 'COLLAR-1',
  animalId: 'ELEPHANT-001',
  lastLatitude: -2.1523,
  lastLongitude: 34.8214,
  lastRecordedAt: new Date(NOW.getTime() - 30 * 1000).toISOString(),
  batteryPercent: 80,
  accuracyMeters: 5,
  totalReadings: 12,
  isOnline: true,
  status: 'ONLINE',
  batteryStatus: 'GOOD',
  nearestRiskZone: { zoneName: 'Northern Community Buffer Zone', distanceKm: 0, inside: true },
  ...overrides
});
const stats: CollarStats = { totalDevices: 3, onlineDevices: 2, offlineDevices: 1, lowBatteryDevices: 1, insideRiskZone: 1 };
const devices = [
  device(),
  device({ deviceId: 'COLLAR-2', animalId: 'RHINO-002', isOnline: false, status: 'OFFLINE', batteryPercent: 15, nearestRiskZone: { zoneName: 'Southern Livestock Boma Fence', distanceKm: 7.4, inside: false }, lastRecordedAt: new Date(NOW.getTime() - 3 * 86400 * 1000).toISOString() }),
  device({ deviceId: 'COLLAR-3', animalId: 'LION-003', batteryPercent: null, accuracyMeters: null, nearestRiskZone: null, lastRecordedAt: new Date(NOW.getTime() - 2 * 3600 * 1000).toISOString() })
];
const reading = (overrides: Partial<CollarTelemetry> = {}): CollarTelemetry => ({
  id: 't-1',
  eventId: 'evt-1',
  deviceId: 'COLLAR-1',
  animalId: 'ELEPHANT-001',
  latitude: -2.15231,
  longitude: 34.82144,
  recordedAt: '2026-10-09T07:59:00.000Z',
  batteryPercent: 80,
  accuracyMeters: 5,
  receivedAt: '2026-10-09T07:59:01.000Z',
  alertCreated: true,
  ...overrides
});
const renderPage = () => render(<MemoryRouter><CollarMonitoringPage /></MemoryRouter>);
const rows = () => screen.getAllByRole('row').slice(1);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('collarApi', () => {
  test('getCollarDevices returns the device list and stats from one request', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: { success: true, data: devices, stats } });
    expect(await collarApi.getCollarDevices()).toEqual({ devices, stats });
    expect(get).toHaveBeenCalledWith('/device-ingestion/collars');
  });

  test('getCollarTelemetryHistory URL-encodes the device id', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: { success: true, data: [reading()] } });
    expect(await collarApi.getCollarTelemetryHistory('COLLAR 1/A')).toEqual([reading()]);
    expect(get).toHaveBeenCalledWith('/device-ingestion/collars/COLLAR%201%2FA/telemetry');
  });

  test('ingestCollarLocation sends the reading with the gateway key header', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({ data: { success: true, data: { alertCreated: false } } });
    const payload = { eventId: 'e', deviceId: 'd', animalId: 'a', latitude: 0, longitude: 0, recordedAt: NOW.toISOString() };
    expect(await collarApi.ingestCollarLocation(payload, 'key-1')).toEqual({ success: true, data: { alertCreated: false } });
    expect(post).toHaveBeenCalledWith('/device-ingestion/collar-location', payload, { headers: { 'x-collar-api-key': 'key-1' } });
  });

  test('a rejected gateway key (401) propagates to the caller', async () => {
    vi.spyOn(http, 'post').mockRejectedValue(new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', undefined, undefined, { status: 401, data: {} } as AxiosResponse));
    await expect(collarApi.ingestCollarLocation({ eventId: 'e', deviceId: 'd', animalId: 'a', latitude: 0, longitude: 0, recordedAt: '' }, 'bad')).rejects.toMatchObject({ response: { status: 401 } });
  });
});

describe('CollarMonitoringPage', () => {
  test('shows loading, then the KPI stats and one row per collar with its risk-zone state', async () => {
    let resolve!: (value: { devices: CollarDevice[]; stats: CollarStats }) => void;
    vi.spyOn(collarApi, 'getCollarDevices').mockReturnValue(new Promise(r => (resolve = r)));
    renderPage();
    expect(screen.getByText('Loading active collar devices...')).toBeInTheDocument();

    resolve({ devices, stats });

    expect(await screen.findByText('COLLAR-1')).toBeInTheDocument();
    expect(rows()).toHaveLength(3);
    expect(within(rows()[0]).getByText('🚨 Inside Northern Community Buffer Zone')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('7.4 km from Southern Livestock Boma Fence')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('Safe Buffer')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('Offline')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('15%')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('N/A')).toBeInTheDocument();
    expect(within(rows()[0]).getByText('30s ago')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('3d ago')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('2h ago')).toBeInTheDocument();
    expect(within(rows()[0]).getByText('±5m accuracy')).toBeInTheDocument();
    expect(screen.getByText('Animals currently inside risk zone').previousSibling).toHaveTextContent('1');
    expect(screen.getByText('Collars at ≤ 20% battery').previousSibling).toHaveTextContent('1');
  });

  test('search by collar or animal id and the status filters narrow the table', async () => {
    vi.spyOn(collarApi, 'getCollarDevices').mockResolvedValue({ devices, stats });
    renderPage();
    await screen.findByText('COLLAR-1');

    await userEvent.type(screen.getByPlaceholderText('Search by Collar ID or Animal ID...'), 'rhino');
    expect(rows().map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual(['COLLAR-2']);
    await userEvent.clear(screen.getByPlaceholderText('Search by Collar ID or Animal ID...'));

    const filter = screen.getByDisplayValue('All Statuses');
    await userEvent.selectOptions(filter, 'ONLINE');
    expect(rows()).toHaveLength(2);
    await userEvent.selectOptions(filter, 'OFFLINE');
    expect(rows()).toHaveLength(1);
    await userEvent.selectOptions(filter, 'LOW_BATTERY');
    expect(within(rows()[0]).getByText('COLLAR-2')).toBeInTheDocument();
  });

  test('a filter with no matches and an empty registry show different empty states', async () => {
    vi.spyOn(collarApi, 'getCollarDevices').mockResolvedValueOnce({ devices: [device()], stats }).mockResolvedValueOnce({ devices: [], stats: { ...stats, totalDevices: 0 } });
    renderPage();
    await screen.findByText('COLLAR-1');
    await userEvent.type(screen.getByPlaceholderText('Search by Collar ID or Animal ID...'), 'zebra');
    expect(screen.getByText('No collar devices match your filter criteria.')).toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText('Search by Collar ID or Animal ID...'));
    await userEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByText(/No real collar devices registered yet\./)).toBeInTheDocument();
  });

  test('a load failure shows the error', async () => {
    vi.spyOn(collarApi, 'getCollarDevices').mockRejectedValue(new Error('Network Error'));
    renderPage();
    expect(await screen.findByText('Network Error')).toBeInTheDocument();
  });

  test('the telemetry log opens for a collar and shows which readings generated alerts', async () => {
    vi.spyOn(collarApi, 'getCollarDevices').mockResolvedValue({ devices, stats });
    const history = vi.spyOn(collarApi, 'getCollarTelemetryHistory').mockResolvedValue([reading(), reading({ id: 't-2', alertCreated: false, batteryPercent: null, accuracyMeters: null })]);
    renderPage();

    await userEvent.click((await screen.findAllByRole('button', { name: 'Telemetry Log (12)' }))[0]);

    expect(history).toHaveBeenCalledWith('COLLAR-1');
    expect(await screen.findByText('Telemetry History: COLLAR-1')).toBeInTheDocument();
    expect(screen.getByText('🚨 Conflict Alert')).toBeInTheDocument();
    expect(screen.getByText('Safe Zone')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Telemetry History: COLLAR-1')).not.toBeInTheDocument();
  });

  test('a telemetry log failure still opens the log, empty', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(collarApi, 'getCollarDevices').mockResolvedValue({ devices, stats });
    vi.spyOn(collarApi, 'getCollarTelemetryHistory').mockRejectedValue(new Error('timeout'));
    renderPage();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Telemetry Log (12)' }))[0]);
    expect(await screen.findByText('No telemetry readings recorded for this collar yet.')).toBeInTheDocument();
  });

  test('the collar simulator sends a reading and the device list is reloaded when it closes', async () => {
    const load = vi.spyOn(collarApi, 'getCollarDevices').mockResolvedValue({ devices, stats });
    const simulate = vi.spyOn(conflictAlertApi, 'simulateCollar').mockResolvedValue(null);
    renderPage();
    await screen.findByText('COLLAR-1');

    await userEvent.click(screen.getByText('+ Simulate Collar Location'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate Collar Alert' }));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(simulate).toHaveBeenCalledWith(expect.objectContaining({ animalId: 'ELEPHANT-001' }));
    expect(screen.queryByText('🛰️ Wildlife Collar Simulator')).not.toBeInTheDocument();
  });
});

describe('CollarTelemetryHistoryModal', () => {
  test('shows a loading message, then the reading count and coordinates', () => {
    const { rerender } = render(<CollarTelemetryHistoryModal deviceId="C-1" animalId="E-1" telemetry={[]} loading onClose={vi.fn()} />);
    expect(screen.getByText('Loading telemetry history...')).toBeInTheDocument();

    rerender(<CollarTelemetryHistoryModal deviceId="C-1" animalId="E-1" telemetry={[reading()]} loading={false} onClose={vi.fn()} />);
    expect(screen.getByText('(1 GPS readings recorded)', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('-2.15231°')).toBeInTheDocument();
    expect(screen.getByText('5 m')).toBeInTheDocument();
  });

  test('clicking the backdrop closes it; clicking inside does not', async () => {
    const onClose = vi.fn();
    render(<CollarTelemetryHistoryModal deviceId="C-1" animalId="E-1" telemetry={[]} loading={false} onClose={onClose} />);
    await userEvent.click(screen.getByText('No telemetry readings recorded for this collar yet.'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
