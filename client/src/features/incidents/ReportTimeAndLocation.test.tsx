import { render, screen, fireEvent } from '@testing-library/react';
import { ManualLocationPicker, parseCoordinate } from './components/ManualLocationPicker';
import { incidentApi } from './api/incidentApi';
import { http } from '../../shared/api/http';
import { IncidentType, LocationSource } from '../../shared/types/enums';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Offline reports keep the real report time', () => {
  const payload = {
    clientIncidentId: 'inc-offline-time',
    incidentType: IncidentType.SNARE,
    description: 'Snare found while offline',
    latitude: -2.18,
    longitude: 34.85,
    locationSource: LocationSource.GPS,
    evidence: [{ imageUrl: 'data:image/jpeg;base64,AAAA' }]
  };

  test('the time is taken when the ranger submits, not when the network attempt finally fails', async () => {
    vi.spyOn(http, 'post').mockImplementationOnce(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Network Error')), 60))
    );

    const submittedAt = Date.now();
    const result = await incidentApi.createIncident(payload);

    expect(result.syncStatus).toBe('PENDING');
    expect(new Date(result.reportedAt).getTime() - submittedAt).toBeLessThan(30);
    expect(result.location.timestamp).toBe(result.reportedAt);
  });

  test('online submissions leave the time to the server clock', async () => {
    const postSpy = vi.spyOn(http, 'post').mockResolvedValueOnce({ data: { success: true, data: { _id: 'srv-1', reportedAt: new Date().toISOString() } } } as never);

    await incidentApi.createIncident({ ...payload, reportedAt: '2026-10-08T06:00:00.000Z' });

    expect(postSpy.mock.calls[0][1]).not.toHaveProperty('reportedAt');
  });

  test('syncing a queued report sends the original report time', async () => {
    const postSpy = vi.spyOn(http, 'post').mockResolvedValueOnce({ data: { success: true, data: { _id: 'srv-1' } } } as never);

    await incidentApi.syncIncidentPayload({
      _id: 'inc-offline-time',
      clientIncidentId: 'inc-offline-time',
      incidentType: IncidentType.SNARE,
      description: 'Snare found while offline',
      reportedAt: '2026-10-08T08:00:00.000Z',
      location: { latitude: -2.18, longitude: 34.85, source: LocationSource.GPS, timestamp: '2026-10-08T08:00:00.000Z' },
      evidence: [{ imageUrl: 'data:image/jpeg;base64,AAAA' }]
    });

    expect(postSpy.mock.calls[0][1]).toMatchObject({ clientIncidentId: 'inc-offline-time', reportedAt: '2026-10-08T08:00:00.000Z' });
  });
});

describe('ManualLocationPicker input handling', () => {
  const renderPicker = (onLocationSelected = vi.fn()) => {
    render(<ManualLocationPicker initialLocation={{ latitude: -2.15, longitude: 34.82 }} onLocationSelected={onLocationSelected} onCancel={vi.fn()} />);
    return onLocationSelected;
  };

  test('parseCoordinate accepts only complete, in-range numbers', () => {
    expect(parseCoordinate('-2.1523', -90, 90)).toBe(-2.1523);
    expect(parseCoordinate(' 34.8 ', -180, 180)).toBe(34.8);
    expect(parseCoordinate('', -90, 90)).toBeNull();
    expect(parseCoordinate('-', -90, 90)).toBeNull();
    expect(parseCoordinate('abc', -90, 90)).toBeNull();
    expect(parseCoordinate('91', -90, 90)).toBeNull();
    expect(parseCoordinate('Infinity', -90, 90)).toBeNull();
  });

  test('clearing a coordinate no longer crashes; it shows an error and blocks confirm', () => {
    const onSelected = renderPicker();
    const latitude = screen.getByLabelText('Latitude (-90 to 90)');

    fireEvent.change(latitude, { target: { value: '' } });

    expect(screen.getByText('Select Incident Location')).toBeInTheDocument();
    expect(screen.getByText('Enter a latitude between -90 and 90')).toBeInTheDocument();
    expect(latitude).toHaveAttribute('aria-invalid', 'true');

    fireEvent.click(screen.getByText('Confirm Manual Location ✓'));
    expect(onSelected).not.toHaveBeenCalled();
    expect(screen.getByText(/Fix the highlighted coordinates/)).toBeInTheDocument();
  });

  test('partial input such as "-" is allowed while typing, then the finished value is confirmed', () => {
    const onSelected = renderPicker();
    const latitude = screen.getByLabelText('Latitude (-90 to 90)');
    const longitude = screen.getByLabelText('Longitude (-180 to 180)');

    fireEvent.change(latitude, { target: { value: '-' } });
    expect((latitude as HTMLInputElement).value).toBe('-');
    fireEvent.change(latitude, { target: { value: '-2.3' } });
    fireEvent.change(longitude, { target: { value: '200' } });
    expect(screen.getByText('Enter a longitude between -180 and 180')).toBeInTheDocument();
    fireEvent.change(longitude, { target: { value: '34.9' } });

    fireEvent.click(screen.getByText('Confirm Manual Location ✓'));
    expect(onSelected).toHaveBeenCalledWith({ latitude: -2.3, longitude: 34.9 });
  });
});
