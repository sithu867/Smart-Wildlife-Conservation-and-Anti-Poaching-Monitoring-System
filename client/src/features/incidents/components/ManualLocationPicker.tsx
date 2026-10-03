import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const createManualMarkerIcon = () => {
  return L.divIcon({
    className: 'manual-location-picker-marker',
    html: `
      <div style="
        background: linear-gradient(135deg, #ef4444, #b91c1c);
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        color: white;
        transform: translate(-50%, -50%);
      ">
        📍
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

const manualIcon = createManualMarkerIcon();

interface MapClickHandlerProps {
  onPointSelect: (lat: number, lng: number) => void;
}

const MapClickHandler: React.FC<MapClickHandlerProps> = ({ onPointSelect }) => {
  useMapEvents({
    click(e) {
      onPointSelect(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
};

interface ManualLocationPickerProps {
  initialLocation?: { latitude: number; longitude: number } | null;
  onLocationSelected: (location: { latitude: number; longitude: number }) => void;
  onCancel: () => void;
}

export const ManualLocationPicker: React.FC<ManualLocationPickerProps> = ({
  initialLocation,
  onLocationSelected,
  onCancel
}) => {
  // Default coordinates: Serengeti Park Center if none provided
  const defaultLat = initialLocation?.latitude ?? -2.1523;
  const defaultLng = initialLocation?.longitude ?? 34.8214;

  const [selectedLat, setSelectedLat] = useState<number>(defaultLat);
  const [selectedLng, setSelectedLng] = useState<number>(defaultLng);
  const [error, setError] = useState<string | null>(null);

  const handlePointSelect = (lat: number, lng: number) => {
    setSelectedLat(Number(lat.toFixed(6)));
    setSelectedLng(Number(lng.toFixed(6)));
    setError(null);
  };

  const handleConfirm = () => {
    if (isNaN(selectedLat) || selectedLat < -90 || selectedLat > 90) {
      setError('Invalid latitude: Must be between -90 and 90 degrees.');
      return;
    }
    if (isNaN(selectedLng) || selectedLng < -180 || selectedLng > 180) {
      setError('Invalid longitude: Must be between -180 and 180 degrees.');
      return;
    }

    onLocationSelected({
      latitude: selectedLat,
      longitude: selectedLng
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-lg shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400">Manual Coordinates</span>
            <h3 className="text-lg font-black text-white">Select Incident Location</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-white text-xl font-bold p-1"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Tap anywhere on the interactive map or enter manual coordinates below to pinpoint the threat location.
        </p>

        {error && (
          <div className="p-3 bg-rose-950/80 border border-rose-700/80 rounded-xl text-xs text-rose-200 font-semibold">
            ⚠️ {error}
          </div>
        )}

        {/* Leaflet Selection Map */}
        <div className="h-64 w-full rounded-2xl overflow-hidden border border-slate-700 relative shadow-inner">
          <MapContainer
            center={[selectedLat, selectedLng]}
            zoom={13}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onPointSelect={handlePointSelect} />
            <Marker position={[selectedLat, selectedLng]} icon={manualIcon}>
              <Popup>
                <div className="text-xs font-bold text-slate-900">
                  📍 Selected Manual Incident Point
                  <p className="text-[10px] font-mono text-slate-600 mt-1">
                    {selectedLat.toFixed(5)}°, {selectedLng.toFixed(5)}°
                  </p>
                </div>
              </Popup>
            </Marker>
          </MapContainer>
        </div>

        {/* Numerical Latitude & Longitude Inputs */}
        <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
              Latitude (-90 to 90)
            </label>
            <input
              type="number"
              step="any"
              value={selectedLat}
              onChange={e => setSelectedLat(parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-emerald-400 font-mono focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
              Longitude (-180 to 180)
            </label>
            <input
              type="number"
              step="any"
              value={selectedLng}
              onChange={e => setSelectedLng(parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-emerald-400 font-mono focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {/* Confirmation buttons */}
        <div className="flex gap-3 mt-1">
          <button
            type="button"
            onClick={onCancel}
            className="w-1/2 py-3 px-4 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="w-1/2 py-3 px-4 rounded-xl font-black bg-amber-400 text-slate-950 hover:bg-amber-300 text-xs shadow-lg shadow-amber-400/20 active:scale-[0.98] transition-all"
          >
            Confirm Manual Location ✓
          </button>
        </div>
      </div>
    </div>
  );
};
