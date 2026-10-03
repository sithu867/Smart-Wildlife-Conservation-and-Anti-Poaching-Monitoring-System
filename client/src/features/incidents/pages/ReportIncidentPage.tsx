import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { geolocationService, type GeoLocation } from '../../../shared/geolocation/geolocation';
import { SyncStatusIndicator } from '../../patrols/components/SyncStatus';
import { PhotoCapture } from '../components/PhotoCapture';
import { incidentApi } from '../api/incidentApi';
import { reportIncidentFormSchema } from '../schemas/incidentSchemas';
import { IncidentType, LocationSource, SyncStatus } from '../../../shared/types/enums';
import type { ConservationIncident } from '../types/incident';

const INCIDENT_TYPE_OPTIONS = [
  { type: IncidentType.SNARE, label: 'Wire Snare / Trap', icon: '🪤', desc: 'Illegal animal snares, traps, or nets' },
  { type: IncidentType.ANIMAL_CARCASS, label: 'Animal Carcass', icon: '🦴', desc: 'Deceased animal or suspected poaching kill' },
  { type: IncidentType.ILLEGAL_CAMPSITE, label: 'Illegal Campsite', icon: '⛺', desc: 'Unauthorized human encampments or firepits' },
  { type: IncidentType.AT_RISK_FOOTPRINTS, label: 'Species Tracks', icon: '🐾', desc: 'Footprints or signs of endangered species' },
  { type: IncidentType.OTHER, label: 'Other Threat', icon: '⚠️', desc: 'Fencing breaches, logging, or other threats' }
];

export const ReportIncidentPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const patrolSessionId = searchParams.get('sessionId') || undefined;

  const [selectedType, setSelectedType] = useState<IncidentType | null>(null);
  const [otherDescription, setOtherDescription] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | undefined>(undefined);
  const [mimeType, setMimeType] = useState<string | undefined>(undefined);

  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<'obtaining' | 'available' | 'unavailable'>('obtaining');
  const [locationSource, setLocationSource] = useState<LocationSource>(LocationSource.GPS);

  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submittedIncident, setSubmittedIncident] = useState<ConservationIncident | null>(null);

  // Request GPS location on mount
  useEffect(() => {
    setLocationStatus('obtaining');

    geolocationService
      .getCurrentLocation()
      .then(loc => {
        setLocation(loc);
        setLocationStatus('available');
        setLocationSource(LocationSource.GPS);
      })
      .catch(err => {
        console.warn('GPS location request error:', err);
        setLocationStatus('unavailable');
      });
  }, []);

  const handlePhotoCaptured = (dataUrl: string, size?: number, mime?: string) => {
    setImageUrl(dataUrl);
    setFileSize(size);
    setMimeType(mime);
    setValidationError(null);
  };

  const handlePhotoCleared = () => {
    setImageUrl(null);
    setFileSize(undefined);
    setMimeType(undefined);
  };

  const handleOpenReview = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const lat = location ? location.latitude : -2.1523;
    const lng = location ? location.longitude : 34.8214;

    const parseResult = reportIncidentFormSchema.safeParse({
      incidentType: selectedType,
      otherTypeDescription: selectedType === IncidentType.OTHER ? otherDescription : undefined,
      description,
      latitude: lat,
      longitude: lng,
      locationSource: location ? LocationSource.GPS : LocationSource.MANUAL,
      patrolSessionId,
      imageUrl: imageUrl || ''
    });

    if (!parseResult.success) {
      const msg = parseResult.error.issues[0]?.message || 'Please fill in all required incident details.';
      setValidationError(msg);
      return;
    }

    setIsReviewOpen(true);
  };

  const handleFinalSubmit = async () => {
    if (isSubmitting) return; // Prevent duplicate submissions
    setIsSubmitting(true);
    setValidationError(null);

    const lat = location ? location.latitude : -2.1523;
    const lng = location ? location.longitude : 34.8214;

    try {
      const created = await incidentApi.createIncident({
        clientIncidentId: `inc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        incidentType: selectedType!,
        otherTypeDescription: selectedType === IncidentType.OTHER ? otherDescription : undefined,
        description,
        latitude: lat,
        longitude: lng,
        locationSource: location ? LocationSource.GPS : LocationSource.MANUAL,
        patrolSessionId,
        evidence: [
          {
            imageUrl: imageUrl!,
            capturedAt: new Date().toISOString(),
            fileSize,
            mimeType
          }
        ]
      });

      setSubmittedIncident(created);
      setIsReviewOpen(false);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to submit incident report');
      setIsSubmitting(false);
    }
  };

  // Submission Success Confirmation Screen
  if (submittedIncident) {
    const isSynced = submittedIncident.syncStatus === SyncStatus.SYNCED;
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-slate-100 flex flex-col gap-6 animate-in fade-in duration-300">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-5 text-center items-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl border shadow-xl ${
              isSynced ? 'bg-emerald-950 border-emerald-500/40 text-emerald-400' : 'bg-amber-950 border-amber-500/40 text-amber-400'
            }`}
          >
            {isSynced ? '✓' : '💾'}
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Report Confirmed</span>
            <h1 className="text-2xl font-black text-white mt-1">
              {isSynced ? 'Incident Reported Successfully' : 'Incident Saved Locally'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">Incident ID: {submittedIncident._id}</p>
          </div>

          <div className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-left flex flex-col gap-2.5">
            <div className="flex justify-between border-b border-slate-900 pb-2">
              <span className="text-slate-400">Incident Type</span>
              <span className="font-bold text-amber-400">{submittedIncident.incidentType}</span>
            </div>
            <div className="flex justify-between border-b border-slate-900 pb-2">
              <span className="text-slate-400">Location</span>
              <span className="font-mono text-emerald-400">
                {submittedIncident.location.latitude.toFixed(4)}°, {submittedIncident.location.longitude.toFixed(4)}° ({submittedIncident.location.source})
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-900 pb-2">
              <span className="text-slate-400">Sync Status</span>
              <span className={`font-bold ${isSynced ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isSynced ? '🟢 SYNCED CENTRAL' : '🟡 PENDING SYNC'}
              </span>
            </div>
            <div className="pt-1">
              <span className="text-slate-400 block mb-1">Description</span>
              <p className="text-slate-200 italic font-sans bg-slate-900 p-2 rounded-xl border border-slate-850">
                "{submittedIncident.description}"
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full mt-2">
            <button
              onClick={() => navigate('/ranger/incidents')}
              className="w-full py-4 rounded-2xl font-bold bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-sm shadow-xl shadow-emerald-400/20 active:scale-[0.98] transition-all"
            >
              View My Reported Incidents →
            </button>
            <button
              onClick={() => {
                setSubmittedIncident(null);
                setSelectedType(null);
                setDescription('');
                setImageUrl(null);
              }}
              className="w-full py-3 rounded-2xl font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
            >
              Report Another Incident
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 text-slate-100 flex flex-col gap-5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-rose-400">Field Threat Log</span>
          <h1 className="text-2xl font-black text-white mt-0.5">Report Incident</h1>
        </div>
        <SyncStatusIndicator />
      </div>

      {/* Patrol Association Banner if launched during active patrol */}
      {patrolSessionId && (
        <div className="bg-emerald-950/70 border border-emerald-500/40 p-3.5 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">🛡️</span>
            <div>
              <span className="font-bold text-emerald-300 block">Active Patrol Attached</span>
              <span className="text-[10px] text-emerald-200 opacity-90">Session ID: {patrolSessionId}</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-400 text-slate-950 uppercase">
            Linked
          </span>
        </div>
      )}

      {/* Validation Error Banner (Preserves Form Data) */}
      {validationError && (
        <div className="p-4 bg-rose-950/80 border border-rose-700/80 rounded-2xl text-xs text-rose-200 font-semibold flex items-start gap-2 shadow-lg animate-bounce">
          <span className="text-base">⚠️</span>
          <div className="flex-1">
            <p className="font-bold text-rose-100">Validation Error</p>
            <p className="mt-0.5 opacity-90">{validationError}</p>
          </div>
        </div>
      )}

      {/* Main Incident Reporting Form */}
      <form onSubmit={handleOpenReview} className="flex flex-col gap-5">
        {/* 1. Location Status Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Location Detection</span>
            {locationStatus === 'obtaining' && (
              <span className="text-amber-400 font-semibold flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span> Obtaining location...
              </span>
            )}
            {locationStatus === 'available' && (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span>📍</span> Location Available (GPS)
              </span>
            )}
            {locationStatus === 'unavailable' && (
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <span>⚠️</span> Location Unavailable (Manual)
              </span>
            )}
          </div>

          {location ? (
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 flex justify-between">
              <span>Lat: {location.latitude.toFixed(5)}°</span>
              <span>Lng: {location.longitude.toFixed(5)}°</span>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-850 italic">
              GPS location fix pending. Standard park coordinates will be attached if GPS fix is delayed.
            </div>
          )}
        </div>

        {/* 2. Incident Type Selection */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">
            Select Incident Type <span className="text-rose-400">*</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {INCIDENT_TYPE_OPTIONS.map(opt => {
              const isSelected = selectedType === opt.type;
              return (
                <button
                  type="button"
                  key={opt.type}
                  onClick={() => {
                    setSelectedType(opt.type);
                    setValidationError(null);
                  }}
                  className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'bg-amber-400/10 border-amber-400 text-white shadow-lg shadow-amber-400/10'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <span className="text-2xl p-2 rounded-xl bg-slate-950 border border-slate-800">{opt.icon}</span>
                  <div>
                    <span className="font-black text-sm block text-white">{opt.label}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">{opt.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedType === IncidentType.OTHER && (
            <div className="mt-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1 uppercase">
                Specify Other Incident Type
              </label>
              <input
                type="text"
                value={otherDescription}
                onChange={e => setOtherDescription(e.target.value)}
                placeholder="Specify specific threat details..."
                maxLength={200}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          )}
        </div>

        {/* 3. Photo Capture Evidence */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">
            Photographic Evidence <span className="text-rose-400">*</span>
          </label>
          <PhotoCapture
            initialPhotoUrl={imageUrl}
            onPhotoCaptured={handlePhotoCaptured}
            onPhotoCleared={handlePhotoCleared}
          />
        </div>

        {/* 4. Description Notes */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">
            Field Description & Notes <span className="text-rose-400">*</span>
          </label>
          <textarea
            value={description}
            onChange={e => {
              setDescription(e.target.value);
              setValidationError(null);
            }}
            placeholder="Describe observations, quantity, exact landmarks, or immediate action taken..."
            rows={3}
            maxLength={1000}
            className="w-full bg-slate-950 border border-slate-700 rounded-2xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 shadow-inner"
          />
          <span className="text-[10px] text-slate-500 float-right text-right">{description.length}/1000</span>
        </div>

        {/* Review Action Button */}
        <button
          type="submit"
          className="w-full py-4 rounded-2xl font-black bg-amber-400 text-slate-950 hover:bg-amber-300 active:scale-[0.98] transition-all text-center text-sm shadow-xl shadow-amber-400/20 mt-2"
        >
          Review Incident Details →
        </button>
      </form>

      {/* Review Screen Subview / Modal */}
      {isReviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400">Step 2 of 2</span>
                <h3 className="text-lg font-black text-white">Review Incident Draft</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                className="text-slate-400 hover:text-white text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Incident Draft Summary Cards */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 text-xs">
              <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                <span className="text-slate-400">Incident Type</span>
                <span className="font-extrabold text-amber-400 uppercase tracking-wider">{selectedType}</span>
              </div>

              {selectedType === IncidentType.OTHER && otherDescription && (
                <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                  <span className="text-slate-400">Specified Threat</span>
                  <span className="font-bold text-white">{otherDescription}</span>
                </div>
              )}

              <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                <span className="text-slate-400">Location Coordinates</span>
                <span className="font-mono text-emerald-400">
                  {location ? `${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°` : '-2.1523°, 34.8214°'}
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                <span className="text-slate-400">Location Source</span>
                <span className="font-bold text-slate-200">{location ? 'GPS' : 'MANUAL'}</span>
              </div>

              {patrolSessionId && (
                <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                  <span className="text-slate-400">Patrol Association</span>
                  <span className="font-bold text-emerald-300">Session #{patrolSessionId.substring(0, 10)}...</span>
                </div>
              )}

              <div>
                <span className="text-slate-400 block mb-1">Field Description</span>
                <p className="text-slate-200 italic bg-slate-900 p-2.5 rounded-xl border border-slate-800 font-sans">
                  "{description}"
                </p>
              </div>

              {imageUrl && (
                <div>
                  <span className="text-slate-400 block mb-1.5">Captured Photo Preview</span>
                  <img
                    src={imageUrl}
                    alt="Evidence Preview"
                    className="w-full h-36 object-cover rounded-xl border border-slate-800"
                  />
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-1">
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                className="w-1/2 py-3.5 px-4 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all"
              >
                ← Edit Draft
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="w-1/2 py-3.5 px-4 rounded-xl font-black bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-xs shadow-lg shadow-emerald-400/20 disabled:opacity-50 transition-all"
              >
                {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
