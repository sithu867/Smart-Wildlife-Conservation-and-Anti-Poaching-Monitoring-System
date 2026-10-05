import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { WildlifeConflictAlert } from '../types/conflictAlert';

const createCustomMarkerIcon = (bgGradient: string, iconSymbol: string, borderHex: string = '#ffffff') => {
  return L.divIcon({
    className: 'custom-alert-map-marker',
    html: `
      <div style="
        background: ${bgGradient};
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 2px solid ${borderHex};
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        color: white;
        transform: translate(-50%, -50%);
      ">
        ${iconSymbol}
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

const criticalIcon = createCustomMarkerIcon('linear-gradient(135deg, #ef4444, #991b1b)', '🚨', '#fee2e2');
const highIcon = createCustomMarkerIcon('linear-gradient(135deg, #f97316, #c2410c)', '⚠️', '#ffedd5');
const mediumIcon = createCustomMarkerIcon('linear-gradient(135deg, #eab308, #ca8a04)', '🔸', '#fef9c3');
const lowIcon = createCustomMarkerIcon('linear-gradient(135deg, #3b82f6, #1d4ed8)', '🔹', '#dbeafe');

interface Props {
  alert: WildlifeConflictAlert;
  height?: string;
}

export const ConflictAlertMap: React.FC<Props> = ({ alert, height = '320px' }) => {
  const { latitude, longitude } = alert.location;

  if (typeof latitude !== 'number' || isNaN(latitude) || typeof longitude !== 'number' || isNaN(longitude)) {
    return (
      <div
        style={{ height }}
        className="w-full flex items-center justify-center bg-gray-100 border rounded-xl text-sm text-gray-500"
      >
        Invalid map location coordinates.
      </div>
    );
  }

  const center: [number, number] = [latitude, longitude];

  let icon = lowIcon;
  let circleColor = '#3b82f6';
  let radiusMeters = 500;

  if (alert.severity === 'CRITICAL') {
    icon = criticalIcon;
    circleColor = '#ef4444';
    radiusMeters = 1500;
  } else if (alert.severity === 'HIGH') {
    icon = highIcon;
    circleColor = '#f97316';
    radiusMeters = 1000;
  } else if (alert.severity === 'MEDIUM') {
    icon = mediumIcon;
    circleColor = '#eab308';
    radiusMeters = 750;
  }

  return (
    <div style={{ height }} className="w-full rounded-xl overflow-hidden border border-gray-300 shadow-sm relative z-0">
      <MapContainer center={center} zoom={14} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Risk Zone Buffer Radius Circle */}
        <Circle
          center={center}
          radius={radiusMeters}
          pathOptions={{
            color: circleColor,
            fillColor: circleColor,
            fillOpacity: 0.2,
            weight: 2,
            dashArray: '6, 6'
          }}
        />

        {/* Alert Location Marker */}
        <Marker position={center} icon={icon}>
          <Popup>
            <div className="text-xs p-1 text-gray-900">
              <p className="font-bold border-b pb-1 mb-1 border-gray-200">
                {alert.alertType.replace(/_/g, ' ')}
              </p>
              <p className="text-gray-600 font-mono text-[11px]">
                Severity: {alert.severity} | Status: {alert.status}
              </p>
              <p className="text-gray-500 font-mono text-[10px] mt-0.5">
                Lat: {latitude.toFixed(5)}, Lng: {longitude.toFixed(5)}
              </p>
              <p className="mt-1 text-gray-700 italic">"{alert.description}"</p>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};
