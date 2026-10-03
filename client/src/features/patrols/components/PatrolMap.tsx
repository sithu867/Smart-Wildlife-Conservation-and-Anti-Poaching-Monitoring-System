import React from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PatrolRoute, Waypoint } from '../types/patrol';
import type { GeoLocation } from '../../../shared/geolocation/geolocation';

// Fix Leaflet marker icon paths for webpack/vite
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const manualIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-amber.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = defaultIcon;

interface PatrolMapProps {
  route?: PatrolRoute | null;
  waypoints?: Waypoint[];
  currentLocation?: GeoLocation | null;
  height?: string;
}

export const PatrolMap: React.FC<PatrolMapProps> = ({
  route,
  waypoints = [],
  currentLocation,
  height = '350px'
}) => {
  // Convert [lon, lat] coordinates to Leaflet [lat, lon] tuples
  const routePositions: [number, number][] =
    route?.geometry?.coordinates?.map(coord => [coord[1], coord[0]]) || [];

  const waypointsPositions: [number, number][] = waypoints.map(w => [w.latitude, w.longitude]);

  // Determine initial center
  let center: [number, number] = [-2.1523, 34.8214]; // Default Serengeti coords
  if (currentLocation) {
    center = [currentLocation.latitude, currentLocation.longitude];
  } else if (routePositions.length > 0) {
    center = routePositions[0];
  } else if (waypointsPositions.length > 0) {
    center = waypointsPositions[0];
  }

  return (
    <div style={{ height }} className="w-full rounded-xl overflow-hidden border border-slate-700 shadow-md relative z-0">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Route Geometry Line */}
        {routePositions.length > 0 && (
          <Polyline
            positions={routePositions}
            pathOptions={{ color: '#d4a24c', weight: 4, dashArray: '8, 8', opacity: 0.85 }}
          />
        )}

        {/* Recorded Waypoints Track Line */}
        {waypointsPositions.length > 1 && (
          <Polyline
            positions={waypointsPositions}
            pathOptions={{ color: '#10b981', weight: 4, opacity: 0.9 }}
          />
        )}

        {/* Recorded Waypoint Markers */}
        {waypoints.map((wp, idx) => (
          <Marker
            key={idx}
            position={[wp.latitude, wp.longitude]}
            icon={wp.source === 'MANUAL' ? manualIcon : defaultIcon}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-bold">{wp.source} Waypoint #{idx + 1}</p>
                <p className="text-slate-600">{new Date(wp.timestamp).toLocaleTimeString()}</p>
                {wp.note && <p className="mt-1 italic text-slate-800">"{wp.note}"</p>}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Current Location Marker */}
        {currentLocation && (
          <Marker position={[currentLocation.latitude, currentLocation.longitude]}>
            <Popup>
              <div className="text-xs font-bold text-emerald-700">
                Your Current Position
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};
