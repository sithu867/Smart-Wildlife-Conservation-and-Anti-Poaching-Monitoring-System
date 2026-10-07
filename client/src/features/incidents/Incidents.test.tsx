import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ReportIncidentPage } from './pages/ReportIncidentPage';
import { PhotoCapture } from './components/PhotoCapture';
import { incidentApi } from './api/incidentApi';
import { http } from '../../shared/api/http';
import { geolocationService } from '../../shared/geolocation/geolocation';
import { IncidentStatus, IncidentType, LocationSource, SyncStatus } from '../../shared/types/enums';

describe('UC-B Conservation Incident Reporting Frontend Tests', () => {
  test('ReportIncidentPage renders location status and incident type options', () => {
    render(
      <BrowserRouter>
        <ReportIncidentPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Report Incident')).toBeInTheDocument();
    expect(screen.getByText('Select Incident Type')).toBeInTheDocument();
    expect(screen.getByText('Wire Snare / Trap')).toBeInTheDocument();
    expect(screen.getByText('Animal Carcass')).toBeInTheDocument();
    expect(screen.getByText('Illegal Campsite')).toBeInTheDocument();
    expect(screen.getByText('Species Tracks')).toBeInTheDocument();
    expect(screen.getByText('Other Threat')).toBeInTheDocument();
  });

  test('PhotoCapture component handles image preview and retake actions', () => {
    const handleCaptured = vi.fn();
    const handleCleared = vi.fn();

    const { rerender } = render(
      <PhotoCapture
        initialPhotoUrl={null}
        onPhotoCaptured={handleCaptured}
        onPhotoCleared={handleCleared}
      />
    );

    expect(screen.getByText('Capture Field Photograph')).toBeInTheDocument();

    // Rerender with captured image URL
    const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...';
    rerender(
      <PhotoCapture
        initialPhotoUrl={sampleDataUrl}
        onPhotoCaptured={handleCaptured}
        onPhotoCleared={handleCleared}
      />
    );

    expect(screen.getByText('✓ Evidence Captured')).toBeInTheDocument();
    expect(screen.getByText('Retake / Replace Photo')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retake / Replace Photo'));
    expect(handleCleared).toHaveBeenCalled();
  });

  test('ReportIncidentPage validates missing incident type and evidence before review', () => {
    render(
      <BrowserRouter>
        <ReportIncidentPage />
      </BrowserRouter>
    );

    // Click Review without selecting type or photo
    fireEvent.click(screen.getByText('Review Incident Details →'));

    expect(screen.getByText('Validation Error')).toBeInTheDocument();
    expect(screen.getByText(/Please select a valid incident type/i)).toBeInTheDocument();
  });

  test('ReportIncidentPage "Report Another Incident" resets the form and uses a new client ID', async () => {
    vi.spyOn(geolocationService, 'getCurrentLocation').mockResolvedValue({
      latitude: -2.1523,
      longitude: 34.8214,
      timestamp: Date.now()
    });
    const createSpy = vi.spyOn(incidentApi, 'createIncident').mockImplementation(async payload => ({
      _id: `srv-${payload.clientIncidentId}`,
      clientIncidentId: payload.clientIncidentId,
      incidentType: payload.incidentType,
      otherTypeDescription: payload.otherTypeDescription,
      description: payload.description,
      location: { latitude: payload.latitude, longitude: payload.longitude, source: LocationSource.GPS, timestamp: new Date().toISOString() },
      reportedBy: 'R-101',
      rangerName: 'Ranger John',
      reportedAt: new Date().toISOString(),
      evidence: payload.evidence,
      status: IncidentStatus.REPORTED,
      syncStatus: SyncStatus.SYNCED
    }));

    const { container } = render(
      <BrowserRouter>
        <ReportIncidentPage />
      </BrowserRouter>
    );

    const submitReport = async (description: string) => {
      await screen.findByText(/Location Ready/);
      fireEvent.click(screen.getByText('Other Threat'));
      fireEvent.change(screen.getByPlaceholderText('Specify specific threat details...'), {
        target: { value: 'Fence breach' }
      });
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, {
        target: { files: [new File(['photo'], 'evidence.jpg', { type: 'image/jpeg' })] }
      });
      await screen.findByText('✓ Evidence Captured');
      fireEvent.change(screen.getByPlaceholderText(/Describe observations/), { target: { value: description } });
      fireEvent.click(screen.getByText('Review Incident Details →'));
      fireEvent.click(await screen.findByText('Confirm & Submit'));
      await screen.findByText('Incident Reported Successfully');
    };

    await submitReport('First incident report');
    fireEvent.click(screen.getByText('Report Another Incident'));

    // Form is fully cleared
    expect(screen.queryByPlaceholderText('Specify specific threat details...')).not.toBeInTheDocument();
    expect((screen.getByPlaceholderText(/Describe observations/) as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByText('Capture Field Photograph')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Other Threat'));
    expect((screen.getByPlaceholderText('Specify specific threat details...') as HTMLInputElement).value).toBe('');

    await submitReport('Second incident report');

    expect(createSpy).toHaveBeenCalledTimes(2);
    const firstId = createSpy.mock.calls[0][0].clientIncidentId;
    const secondId = createSpy.mock.calls[1][0].clientIncidentId;
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
    expect(createSpy.mock.calls[1][0].description).toBe('Second incident report');

    vi.restoreAllMocks();
  });

  test('incidentApi.createIncident submits incident payload online', async () => {
    const mockCreated = {
      _id: 'inc-test-01',
      incidentType: IncidentType.ILLEGAL_CAMPSITE,
      description: 'Poachers campfire found in Sector 4',
      location: { latitude: -2.1523, longitude: 34.8214, source: LocationSource.GPS, timestamp: new Date().toISOString() },
      reportedBy: 'R-101',
      rangerName: 'Ranger John',
      reportedAt: new Date().toISOString(),
      evidence: [{ evidenceId: 'evid-01', imageUrl: 'data:image/jpeg;base64,sample...' }],
      status: 'REPORTED',
      syncStatus: 'SYNCED'
    };

    vi.spyOn(http, 'post').mockResolvedValueOnce({
      data: { success: true, data: mockCreated }
    } as any);

    const result = await incidentApi.createIncident({
      incidentType: IncidentType.ILLEGAL_CAMPSITE,
      description: 'Poachers campfire found in Sector 4',
      latitude: -2.1523,
      longitude: 34.8214,
      locationSource: LocationSource.GPS,
      evidence: [
        {
          imageUrl: 'data:image/jpeg;base64,sample...',
          capturedAt: new Date().toISOString()
        }
      ]
    });

    expect(result.incidentType).toBe(IncidentType.ILLEGAL_CAMPSITE);
    expect(result._id).toBe('inc-test-01');
    expect(result.evidence.length).toBe(1);
  });

  test('incidentApi.createIncident handles offline network failure with PENDING sync status', async () => {
    vi.spyOn(http, 'post').mockRejectedValueOnce(new Error('Network Error - Device Offline'));

    const result = await incidentApi.createIncident({
      clientIncidentId: 'inc-offline-999',
      incidentType: IncidentType.SNARE,
      description: 'Offline snare report in Sector 9',
      latitude: -2.1800,
      longitude: 34.8500,
      locationSource: LocationSource.MANUAL,
      evidence: [
        {
          imageUrl: 'data:image/jpeg;base64,sampleoffline...',
          capturedAt: new Date().toISOString()
        }
      ]
    });

    expect(result.clientIncidentId).toBe('inc-offline-999');
    expect(result.syncStatus).toBe('PENDING');
    expect(result.location.source).toBe(LocationSource.MANUAL);
    expect(result.evidence[0].evidenceId).toContain('inc-offline-999');
  });

  test('incidentApi.createIncident surfaces server errors instead of saving them as pending', async () => {
    vi.spyOn(http, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 413,
        data: { success: false, error: { message: 'Request body exceeds the 8 MB limit.' } }
      }
    });

    await expect(
      incidentApi.createIncident({
        incidentType: IncidentType.SNARE,
        description: 'A snare was found in Sector 9',
        latitude: -2.18,
        longitude: 34.85,
        locationSource: LocationSource.MANUAL,
        evidence: [{ imageUrl: 'data:image/jpeg;base64,sample...' }]
      })
    ).rejects.toThrow('Request body exceeds the 8 MB limit.');
  });

  test('incidentApi.syncIncidentPayload syncs offline payload and updates remote incident', async () => {
    const mockSynced = {
      _id: 'inc-synced-123',
      clientIncidentId: 'inc-offline-999',
      incidentType: IncidentType.SNARE,
      description: 'Offline snare report in Sector 9',
      location: { latitude: -2.1800, longitude: 34.8500, source: LocationSource.MANUAL, timestamp: new Date().toISOString() },
      reportedBy: 'R-101',
      rangerName: 'Ranger John',
      reportedAt: new Date().toISOString(),
      evidence: [{ evidenceId: 'evid-01', imageUrl: 'data:image/jpeg;base64,sample...' }],
      status: 'REPORTED',
      syncStatus: 'SYNCED'
    };

    vi.spyOn(http, 'post').mockResolvedValueOnce({
      data: { success: true, data: mockSynced }
    } as any);

    const synced = await incidentApi.syncIncidentPayload({
      _id: 'inc-offline-999',
      clientIncidentId: 'inc-offline-999',
      incidentType: IncidentType.SNARE,
      description: 'Offline snare report in Sector 9',
      location: { latitude: -2.1800, longitude: 34.8500, source: LocationSource.MANUAL },
      evidence: [{ imageUrl: 'data:image/jpeg;base64,sample...' }]
    });

    expect(synced.syncStatus).toBe('SYNCED');
    expect(synced._id).toBe('inc-synced-123');
  });
});
