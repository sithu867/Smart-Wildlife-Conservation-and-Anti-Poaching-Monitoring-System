import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PatrolRoute, Waypoint } from '../types/patrol';
import type { GeoLocation } from '../../../shared/geolocation/geolocation';

// Helper function to create clean, high-visibility SVG/HTML map markers
const createCustomMarkerIcon = (bgGradient: string, iconSymbol: string, borderHex: string = '#ffffff') => {
  return L.divIcon({
    className: 'custom-map-marker-container',
    html: `
      <div style="
        background: ${bgGradient};
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 2px solid ${borderHex};
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        color: white;
        transform: translate(-50%, -50%);
      ">
        ${iconSymbol}
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17]
  });
};

const routeStartIcon = createCustomMarkerIcon('linear-gradient(135deg, #16a34a, #15803d)', '🟢', '#dcfce7');
const routeEndIcon = createCustomMarkerIcon('linear-gradient(135deg, #dc2626, #991b1b)', '🏁', '#fee2e2');
const gpsWaypointIcon = createCustomMarkerIcon('linear-gradient(135deg, #10b981, #047857)', '📍', '#d1fae5');
const manualWaypointIcon = createCustomMarkerIcon('linear-gradient(135deg, #f59e0b, #d97706)', '✍️', '#fef3c7');
const currentLocationIcon = createCustomMarkerIcon('linear-gradient(135deg, #06b6d4, #0284c7)', '🎯', '#cffaff');

// Component to dynamically auto-fit map view to include route & waypoints
const MapBoundsFitter: React.FC<{ positions: [number, number][] }> = ({ positions }) => {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length > 0) {
      try {
        const bounds = L.latLngBounds(positions);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } catch (err) {
        console.warn('Error fitting map bounds:', err);
      }
    }
  }, [map, positions]);
  return null;
};

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
    route?.geometry?.coordinates?.map(coord => [Number(coord[1]), Number(coord[0])]) || [];

  // Filter and convert valid waypoints
  const validWaypoints = waypoints.filter(
    w => typeof w.latitude === 'number' && !isNaN(w.latitude) && typeof w.longitude === 'number' && !isNaN(w.longitude)
  );

  const waypointsPositions: [number, number][] = validWaypoints.map(w => [w.latitude, w.longitude]);

  // Collect all coordinates for bounds fitting
  const allPositions: [number, number][] = [...routePositions, ...waypointsPositions];
  if (currentLocation && !isNaN(currentLocation.latitude) && !isNaN(currentLocation.longitude)) {
    allPositions.push([currentLocation.latitude, currentLocation.longitude]);
  }

  // Determine initial center (Default to Sri Lanka Yala National Park coords if empty)
  let center: [number, number] = [6.3750, 81.5100];
  if (currentLocation && !isNaN(currentLocation.latitude) && !isNaN(currentLocation.longitude)) {
    center = [currentLocation.latitude, currentLocation.longitude];
  } else if (waypointsPositions.length > 0) {
    center = waypointsPositions[waypointsPositions.length - 1];
  } else if (routePositions.length > 0) {
    center = routePositions[0];
  }

  const startPoint = routePositions.length > 0 ? routePositions[0] : null;
  const endPoint = routePositions.length > 1 ? routePositions[routePositions.length - 1] : null;

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

        {/* Dynamic Bounds Fitter */}
        {allPositions.length > 0 && <MapBoundsFitter positions={allPositions} />}

        {/* Assigned Route Outer Glow Polyline */}
        {routePositions.length > 0 && (
          <Polyline
            positions={routePositions}
            pathOptions={{ color: '#2563eb', weight: 9, opacity: 0.35 }}
          />
        )}

        {/* Assigned Route Main Polyline */}
        {routePositions.length > 0 && (
          <Polyline
            positions={routePositions}
            pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.95 }}
          />
        )}

        {/* Route Start Point Marker */}
        {startPoint && (
          <Marker position={startPoint} icon={routeStartIcon}>
            <Popup>
              <div className="text-xs p-1 text-slate-900 font-bold">
                🟢 Route Start Point
                <p className="text-[11px] font-normal text-slate-600 mt-0.5">{route?.name}</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Route End Point Marker */}
        {endPoint && (
          <Marker position={endPoint} icon={routeEndIcon}>
            <Popup>
              <div className="text-xs p-1 text-slate-900 font-bold">
                🏁 Route End Point
                <p className="text-[11px] font-normal text-slate-600 mt-0.5">Target Finish Line ({route?.distanceKm} km)</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Recorded Waypoints Track Line */}
        {waypointsPositions.length > 1 && (
          <Polyline
            positions={waypointsPositions}
            pathOptions={{ color: '#10b981', weight: 5, opacity: 0.95 }}
          />
        )}

        {/* Recorded Waypoint Markers */}
        {validWaypoints.map((wp, idx) => (
          <Marker
            key={wp._id || `wp-${idx}-${wp.timestamp}`}
            position={[wp.latitude, wp.longitude]}
            icon={wp.source === 'MANUAL' ? manualWaypointIcon : gpsWaypointIcon}
          >
            <Popup>
              <div className="text-xs p-1 text-slate-900">
                <p className="font-bold border-b pb-1 mb-1 border-slate-200">
                  {wp.source === 'MANUAL' ? '✍️ Manual Waypoint' : '📍 GPS Auto Waypoint'} #{idx + 1}
                </p>
                <p className="text-slate-600 font-mono text-[11px]">
                  {new Date(wp.timestamp).toLocaleTimeString()}
                </p>
                <p className="text-slate-500 font-mono text-[10px] mt-0.5">
                  Lat: {wp.latitude.toFixed(5)}, Lng: {wp.longitude.toFixed(5)}
                </p>
                {wp.note && (
                  <p className="mt-1.5 p-1.5 bg-amber-50 border border-amber-200 rounded text-amber-900 italic">
                    "{wp.note}"
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Current Location Marker */}
        {currentLocation && (
          <Marker
            position={[currentLocation.latitude, currentLocation.longitude]}
            icon={currentLocationIcon}
          >
            <Popup>
              <div className="text-xs font-bold text-cyan-900 p-1">
                🎯 Current Location Position
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};


