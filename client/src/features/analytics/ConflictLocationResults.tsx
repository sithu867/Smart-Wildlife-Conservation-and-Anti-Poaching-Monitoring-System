import { useEffect, useMemo } from 'react';
import { latLngBounds } from 'leaflet';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet';
import type { ConflictLocationAnalysis } from '../../../../server/src/modules/analytics/contract';
import 'leaflet/dist/leaflet.css';
import { formatEnumLabel } from './formatting';

type Location = ConflictLocationAnalysis['locations'][number];
function FitLocations({ locations }: { locations: Location[] }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(
      latLngBounds(locations.map((cell) => [cell.latitude, cell.longitude])),
      // Report/history navigation may remove the map before a zoom finishes.
      { padding: [35, 35], maxZoom: 13, animate: false },
    );
  }, [locations, map]);
  return null;
}

export function ConflictLocationResults({
  analysis,
}: {
  analysis: ConflictLocationAnalysis;
}) {
  const locations = useMemo(
    () =>
      analysis.locations.filter(
        (cell) =>
          Number.isFinite(cell.latitude) &&
          Math.abs(cell.latitude) <= 90 &&
          Number.isFinite(cell.longitude) &&
          Math.abs(cell.longitude) <= 180 &&
          cell.alertCount > 0,
      ),
    [analysis.locations],
  );
  return (
    <section aria-label="Conflict locations">
      <h3>Conflicts by location</h3>
      <p>
        Alerts created in the applied period grouped into fixed{' '}
        {analysis.gridSizeDegrees}° cells (about 1.1 km north-south). Markers
        show mean recorded coordinates. Single alerts are included; nearby
        alerts across cell boundaries remain separate.
      </p>
      {locations.length ? (
        <>
          <div
            className="analytics-hotspot-map"
            role="region"
            aria-label="Conflict location map"
          >
            <MapContainer
              center={[locations[0].latitude, locations[0].longitude]}
              zoom={12}
              scrollWheelZoom={false}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitLocations locations={locations} />
              {locations.map((cell) => (
                <CircleMarker
                  key={cell.cellId}
                  center={[cell.latitude, cell.longitude]}
                  radius={Math.min(30, 6 + Math.sqrt(cell.alertCount) * 3)}
                  pathOptions={{ color: '#d97706', fillOpacity: 0.65 }}
                >
                  <Popup>
                    Location {cell.rank}: {cell.alertCount} alerts
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
          <ol
            className="analytics-hotspot-list"
            aria-label="Ranked conflict locations"
          >
            {locations.map((cell) => (
              <li key={cell.cellId}>
                <strong>
                  Location {cell.rank}: {cell.alertCount} alerts
                </strong>
                <p>
                  Latitude {cell.latitude.toFixed(6)}, longitude{' '}
                  {cell.longitude.toFixed(6)}
                </p>
                <p>
                  Severity:{' '}
                  {cell.bySeverity
                    .map((row) => `${formatEnumLabel(row.name)}: ${row.count}`)
                    .join(', ')}
                </p>
                <p>
                  Types:{' '}
                  {cell.byType
                    .map((row) => `${formatEnumLabel(row.name)}: ${row.count}`)
                    .join(', ')}
                </p>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p>
          {analysis.validAlertCount
            ? 'No displayable conflict locations.'
            : 'No conflict alerts with valid coordinates match the applied criteria.'}
        </p>
      )}
      {!!analysis.excludedCoordinateCount && (
        <p>
          {analysis.excludedCoordinateCount} alerts were excluded from location
          analysis because coordinates were missing or invalid. They remain in
          alert totals.
        </p>
      )}
    </section>
  );
}
