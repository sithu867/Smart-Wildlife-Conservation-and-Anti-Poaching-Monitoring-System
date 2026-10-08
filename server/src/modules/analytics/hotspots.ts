import {
  HOTSPOT_GRID_DEGREES,
  HOTSPOT_MIN_INCIDENTS,
  HOTSPOT_CONCENTRATION_THRESHOLDS,
  type IncidentHotspotAnalysis,
} from './contract.js';
import { groupBy } from './grouping.js';
import { coordinateCell, readCoordinates } from './spatial.js';

interface LocatedIncident {
  incidentType: string;
  location?: unknown;
}
interface Cell {
  latitudeSum: number;
  longitudeSum: number;
  rows: LocatedIncident[];
}

export function calculateIncidentHotspots(
  rows: LocatedIncident[],
): IncidentHotspotAnalysis {
  const cells = new Map<string, Cell>();
  let excludedCoordinateCount = 0;
  for (const row of rows) {
    const coordinates = readCoordinates(row.location);
    if (!coordinates) {
      excludedCoordinateCount++;
      continue;
    }
    const { latitude, longitude } = coordinates;
    // A fixed 0.01-degree grid is deterministic, cheap, and easy to demonstrate:
    // about 1.1 km north-south, with longitude width decreasing toward the poles.
    // At least two incidents indicate repeat concentration, not predictive risk.
    // Floor (not truncation) treats negative coordinates consistently. Adjacent
    // cells are deliberately not merged, so close points can straddle a boundary.
    const cellId = `${coordinateCell(latitude, HOTSPOT_GRID_DEGREES)}:${coordinateCell(longitude, HOTSPOT_GRID_DEGREES)}`;
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
        a.longitude - b.longitude ||
        // Adjacent cells can round to the same representative coordinate.
        // A final cell-ID tie break keeps ranks independent of database order.
        a.cellId.localeCompare(b.cellId),
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
