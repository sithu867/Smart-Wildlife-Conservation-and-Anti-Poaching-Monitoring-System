/** UC-B location display: place name from OpenStreetMap when known, otherwise the raw coordinates. */
import React from 'react';
import type { ConservationIncident } from '../types/incident';

/** -2.15801, 34.82963 -> "-2.1580°, 34.8296°" */
export function formatCoordinates(location: { latitude: number; longitude: number }): string {
  return `${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°`;
}

/** "📍 Pannipitiya, Sri Lanka" with the coordinates underneath; just the coordinates until a name is available. */
export const IncidentLocationLabel: React.FC<{ location: ConservationIncident['location'] }> = ({ location }) =>
  location.placeName ? (
    <span className="flex flex-col">
      <span className="text-emerald-300 font-sans font-bold">📍 {location.placeName}</span>
      <span className="text-[10px] text-slate-500 font-mono">{formatCoordinates(location)}</span>
    </span>
  ) : (
    <span className="text-emerald-400 font-mono">{formatCoordinates(location)}</span>
  );
