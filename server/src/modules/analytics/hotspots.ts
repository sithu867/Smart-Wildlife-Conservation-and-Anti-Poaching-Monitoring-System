import {
  HOTSPOT_GRID_DEGREES,
  HOTSPOT_MIN_INCIDENTS,
  HOTSPOT_CONCENTRATION_THRESHOLDS,
  type IncidentHotspotAnalysis,
} from './contract.js';
import { groupBy } from './calculations.js';

interface LocatedIncident {
  incidentType: string;
  location?: { latitude?: unknown; longitude?: unknown } | null;
}
interface Cell {
  latitudeSum: number;
  longitudeSum: number;
  rows: LocatedIncident[];
}

function cellIndex(coordinate: number): number {
  // Normalize floating-point noise at exact decimal grid boundaries (far below
  // GPS precision), so e.g. 1.15 / 0.01 does not slip into the previous cell.
  return Math.floor(Number((coordinate / HOTSPOT_GRID_DEGREES).toFixed(9)));
}

export function calculateIncidentHotspots(
  rows: LocatedIncident[],
): IncidentHotspotAnalysis {
  const cells = new Map<string, Cell>();
  let excludedCoordinateCount = 0;
  for (const row of rows) {
    const latitude = row.location?.latitude;
    const longitude = row.location?.longitude;
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      excludedCoordinateCount++;
      continue;
    }
    // A fixed 0.01-degree grid is deterministic, cheap, and easy to demonstrate:
    // about 1.1 km north-south, with longitude width decreasing toward the poles.
    // At least two incidents indicate repeat concentration, not predictive risk.
    // Floor (not truncation) treats negative coordinates consistently. Adjacent
    // cells are deliberately not merged, so close points can straddle a boundary.
    const cellId = `${cellIndex(latitude)}:${cellIndex(longitude)}`;
    const cell = cells.get(cellId) ?? {
      latitudeSum: 0,
      longitudeSum: 0,
      rows: [],
    };
    cell.latitudeSum += latitude;
    cell.longitudeSum += longitude;
    cell.rows.push(row);
    cells.set(cellId, cell);
  }
  const hotspots = [...cells]
    .filter(([, cell]) => cell.rows.length >= HOTSPOT_MIN_INCIDENTS)
    .map(([cellId, cell]) => ({
      cellId,
      latitude: Number((cell.latitudeSum / cell.rows.length).toFixed(6)),
      longitude: Number((cell.longitudeSum / cell.rows.length).toFixed(6)),
      incidentCount: cell.rows.length,
      rank: 0,
      concentration:
        cell.rows.length >= HOTSPOT_CONCENTRATION_THRESHOLDS.high
          ? ('HIGH' as const)
          : cell.rows.length >= HOTSPOT_CONCENTRATION_THRESHOLDS.medium
            ? ('MEDIUM' as const)
            : ('LOW' as const),
      byType: groupBy(cell.rows, 'incidentType'),
    }))
    .sort(
      (a, b) =>
        b.incidentCount - a.incidentCount ||
        a.latitude - b.latitude ||
        a.longitude - b.longitude,
    )
    .map((hotspot, index) => ({ ...hotspot, rank: index + 1 }));
  return {
    gridSizeDegrees: HOTSPOT_GRID_DEGREES,
    minimumIncidents: HOTSPOT_MIN_INCIDENTS,
    validIncidentCount: rows.length - excludedCoordinateCount,
    excludedCoordinateCount,
    isolatedIncidentCount: [...cells.values()]
      .filter((cell) => cell.rows.length < HOTSPOT_MIN_INCIDENTS)
      .reduce((total, cell) => total + cell.rows.length, 0),
    hotspots,
  };
}
