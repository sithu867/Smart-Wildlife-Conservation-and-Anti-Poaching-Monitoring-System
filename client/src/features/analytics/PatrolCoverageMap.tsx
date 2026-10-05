import { useEffect, useMemo } from 'react';
import { latLngBounds, type LatLngTuple } from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Popup,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  PATROL_COVERAGE_LABELS,
  type PatrolRouteCoverage,
  type PatrolCoverageStatus,
} from '../../../../server/src/modules/analytics/contract';

const ROUTE_STYLES: Record<
  PatrolCoverageStatus,
  { color: string; dashArray?: string }
> = {
  COVERED: { color: '#16a34a' },
  LIMITED_ACTIVITY: { color: '#d97706', dashArray: '10 6' },
  NEGLECTED: { color: '#dc2626', dashArray: '3 7' },
};

export function routePositions(route: PatrolRouteCoverage): LatLngTuple[] {
  const geometry = route.geometry;
  // Validate again at the display boundary. Missing or broken geometry affects
  // only this route's map path; its analytical status remains visible in the list.
  if (
    geometry?.type !== 'LineString' ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2 ||
    !geometry.coordinates.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Math.abs(point[0]) <= 180 &&
        Number.isFinite(point[1]) &&
        Math.abs(point[1]) <= 90,
    )
  )
    return [];
  return geometry.coordinates.map(([longitude, latitude]) => [
    latitude,
    longitude,
  ]);
}

function FitRoutes({ positions }: { positions: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    // Re-analysis may replace the park or routes without remounting Leaflet.
    map.fitBounds(latLngBounds(positions), { padding: [30, 30], maxZoom: 14 });
  }, [map, positions]);
  return null;
}

export function PatrolCoverageMap({
  routes,
}: {
  routes: PatrolRouteCoverage[];
}) {
  const paths = useMemo(
    () =>
      routes
        .map((route) => ({ route, positions: routePositions(route) }))
        .filter((path) => path.positions.length >= 2),
    [routes],
  );
  const positions = useMemo(
    () => paths.flatMap((path) => path.positions),
    [paths],
  );
  if (!paths.length)
    return (
      <p className="analytics-map-empty">
        No usable route geometry is available. Review route statuses in the list
        below.
      </p>
    );
  return (
    <div
      className="analytics-route-map"
      role="region"
      aria-label="Patrol coverage map"
    >
      <MapContainer
        center={positions[0]}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitRoutes positions={positions} />
        {paths.map(({ route, positions: routePoints }) => (
          <Polyline
            key={route.routeId}
            positions={routePoints}
            pathOptions={{ ...ROUTE_STYLES[route.status], weight: 5 }}
          >
            <Popup>
              {route.routeName}: {PATROL_COVERAGE_LABELS[route.status]} ·{' '}
              {route.completedSessionCount} completed / {route.sessionCount}{' '}
              patrol sessions
            </Popup>
          </Polyline>
        ))}
      </MapContainer>
    </div>
  );
}
