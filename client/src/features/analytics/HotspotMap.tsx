import { useEffect, useMemo } from 'react';
import { latLngBounds } from 'leaflet';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { IncidentHotspot } from '../../../../server/src/modules/analytics/contract';

export function isDisplayableHotspot(point: IncidentHotspot): boolean {
  return (
    !!point &&
    Number.isFinite(point.latitude) &&
    Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.longitude) <= 180 &&
    Number.isFinite(point.incidentCount) &&
    point.incidentCount > 0
  );
}

function FitHotspots({ points }: { points: IncidentHotspot[] }) {
  const map = useMap();
  useEffect(() => {
    // Re-fit on re-analysis: MapContainer's initial center does not react to
    // changed props. A maximum zoom avoids over-zooming a single concentration.
    const bounds = latLngBounds(
      points.map((point) => [point.latitude, point.longitude]),
    );
    map.fitBounds(bounds, { padding: [35, 35], maxZoom: 13 });
  }, [map, points]);
  return null;
}

export function HotspotMap({ hotspots }: { hotspots: IncidentHotspot[] }) {
  const points = useMemo(
    () => hotspots.filter(isDisplayableHotspot),
    [hotspots],
  );
  if (!points.length)
    return <p>No valid hotspot coordinates are available for the map.</p>;
  return (
    <div
      className="analytics-hotspot-map"
      role="region"
      aria-label="Incident hotspot map"
    >
      <MapContainer
        center={[points[0].latitude, points[0].longitude]}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitHotspots points={points} />
        {points.map((point) => (
          <CircleMarker
            key={point.cellId}
            center={[point.latitude, point.longitude]}
            radius={Math.min(30, 7 + Math.sqrt(point.incidentCount) * 3)}
            pathOptions={{
              color:
                point.concentration === 'HIGH'
                  ? '#dc2626'
                  : point.concentration === 'MEDIUM'
                    ? '#d97706'
                    : '#2563eb',
              fillOpacity: 0.65,
            }}
          >
            <Popup>
              Rank {point.rank}: {point.incidentCount} incidents (
              {point.concentration.toLowerCase()} concentration)
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
