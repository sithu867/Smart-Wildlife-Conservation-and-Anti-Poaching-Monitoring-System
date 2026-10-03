import React from 'react';
import type { GeoLocation } from '../../../shared/geolocation/geolocation';

interface GPSStatusProps {
  gpsState: 'idle' | 'tracking' | 'error' | 'denied' | 'unavailable';
  currentLocation: GeoLocation | null;
  errorMsg?: string | null;
}

export const GPSStatus: React.FC<GPSStatusProps> = ({ gpsState, currentLocation, errorMsg }) => {
  return (
    <div className="bg-slate-900/90 text-slate-100 p-3.5 rounded-xl border border-slate-700/60 shadow-lg text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          <span className="relative flex h-3 w-3">
            {gpsState === 'tracking' ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </>
            ) : gpsState === 'unavailable' ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </>
            ) : gpsState === 'denied' || gpsState === 'error' ? (
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            ) : (
              <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-500"></span>
            )}
          </span>
          <span className="text-xs uppercase font-bold tracking-wide text-slate-300">
            {gpsState === 'tracking'
              ? 'GPS Active'
              : gpsState === 'unavailable'
              ? 'GPS Signal Lost'
              : gpsState === 'denied'
              ? 'GPS Access Denied'
              : gpsState === 'error'
              ? 'GPS Error'
              : 'GPS Idle'}
          </span>
        </div>
        {currentLocation?.accuracy && gpsState === 'tracking' && (
          <span className="text-xs text-slate-400">
            ±{Math.round(currentLocation.accuracy)}m
          </span>
        )}
      </div>

      {currentLocation && gpsState === 'tracking' ? (
        <div className="mt-2 text-xs font-mono text-emerald-300 flex gap-4">
          <span>Lat: {currentLocation.latitude.toFixed(5)}°</span>
          <span>Lng: {currentLocation.longitude.toFixed(5)}°</span>
        </div>
      ) : errorMsg ? (
        <p className="mt-1.5 text-xs text-amber-300 bg-amber-950/40 p-2 rounded-lg border border-amber-800/40">{errorMsg}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-400">Waiting for GPS signal fix...</p>
      )}
    </div>
  );
};
