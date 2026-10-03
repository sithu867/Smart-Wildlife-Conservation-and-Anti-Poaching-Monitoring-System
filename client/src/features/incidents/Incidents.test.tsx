import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ReportIncidentPage } from './pages/ReportIncidentPage';
import { PhotoCapture } from './components/PhotoCapture';
import { incidentApi } from './api/incidentApi';
import { http } from '../../shared/api/http';
import { IncidentType, LocationSource } from '../../shared/types/enums';

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
