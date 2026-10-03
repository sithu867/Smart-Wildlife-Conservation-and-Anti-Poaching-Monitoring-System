import React, { useState } from 'react';
import type { GeoLocation } from '../../../shared/geolocation/geolocation';
import { manualWaypointSchema } from '../schemas/patrolSchemas';

interface WaypointFormProps {
  currentLocation: GeoLocation | null;
  onSubmit: (note: string, customLat?: number, customLng?: number) => Promise<void>;
  onCancel: () => void;
}

export const WaypointFormModal: React.FC<WaypointFormProps> = ({
  currentLocation,
  onSubmit,
  onCancel
}) => {
  const [mode, setMode] = useState<'GPS' | 'MANUAL'>(currentLocation ? 'GPS' : 'MANUAL');
  const [note, setNote] = useState<string>('');
  const [customLatStr, setCustomLatStr] = useState<string>(
    currentLocation ? String(currentLocation.latitude) : '-2.1523'
  );
  const [customLngStr, setCustomLngStr] = useState<string>(
    currentLocation ? String(currentLocation.longitude) : '34.8214'
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    let lat: number | undefined;
    let lng: number | undefined;

    if (mode === 'MANUAL') {
      const parsedLat = parseFloat(customLatStr);
      const parsedLng = parseFloat(customLngStr);

      const validation = manualWaypointSchema.safeParse({
        latitude: parsedLat,
        longitude: parsedLng,
        note
      });

      if (!validation.success) {
        const firstError = validation.error.issues[0]?.message || 'Invalid coordinates entered.';
        setError(firstError);
        setIsSubmitting(false);
        return;
      }

      lat = parsedLat;
      lng = parsedLng;
    }

    try {
      await onSubmit(note, lat, lng);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record manual waypoint');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white">Add Manual Waypoint</h3>
            <span className="text-xs text-amber-400 font-semibold uppercase tracking-wider">Field Observation</span>
          </div>
          <button
            onClick={onCancel}
            type="button"
            className="text-slate-400 hover:text-white text-xl font-bold p-1"
          >
            ✕
          </button>
        </div>

        {/* Mode Selector Switch */}
        <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('GPS')}
            className={`py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mode === 'GPS'
                ? 'bg-amber-400 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>📍</span>
            <span>Current GPS Fix</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('MANUAL')}
            className={`py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mode === 'MANUAL'
                ? 'bg-amber-400 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>✍️</span>
            <span>Manual Coordinates</span>
          </button>
        </div>

        {/* GPS vs Manual Info Box */}
        {mode === 'GPS' ? (
          currentLocation ? (
            <div className="bg-slate-950 p-3.5 rounded-xl border border-emerald-500/30 text-xs font-mono text-emerald-400 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-sans">Active GPS Fix</span>
                <span className="font-bold">Lat: {currentLocation.latitude.toFixed(5)}°</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-sans">Accuracy</span>
                <span className="font-bold">Lng: {currentLocation.longitude.toFixed(5)}°</span>
              </div>
            </div>
          ) : (
            <div className="bg-amber-950/60 border border-amber-800/60 p-3 rounded-xl text-xs text-amber-300">
              ⚠️ GPS signal is unavailable. Switch to <strong>Manual Coordinates</strong> tab to enter custom location.
            </div>
          )
        ) : (
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-3">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
              Manual Override / GPS Failure Coordinates
            </span>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                  Latitude (-90 to 90)
                </label>
                <input
                  type="number"
                  step="any"
                  value={customLatStr}
                  onChange={e => setCustomLatStr(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                  Longitude (-180 to 180)
                </label>
                <input
                  type="number"
                  step="any"
                  value={customLngStr}
                  onChange={e => setCustomLngStr(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
              Observation / Ranger Note (Optional)
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Spotted fresh tracks near northern waterhole, fence intact..."
              rows={3}
              maxLength={500}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
            <span className="text-[10px] text-slate-500 float-right mt-1">{note.length}/500</span>
          </div>

          {error && <p className="text-xs text-rose-400 bg-rose-950/60 p-2.5 rounded-lg border border-rose-800/60">{error}</p>}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onCancel}
              className="w-1/2 py-3 px-4 rounded-xl font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-1/2 py-3 px-4 rounded-xl font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 text-sm shadow-lg shadow-amber-400/20 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Record Waypoint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

