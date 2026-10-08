import type { ConflictLocationAnalysis } from './contract.js';
import { HOTSPOT_GRID_DEGREES } from './contract.js';
import { coordinateCell, readCoordinates } from './spatial.js';
import { groupBy } from './grouping.js';

interface LocatedConflict {
  location?: unknown;
  severity: string;
  alertType: string;
}

export function calculateConflictLocations(
  rows: LocatedConflict[],
): ConflictLocationAnalysis {
  const cells = new Map<
    string,
    Array<LocatedConflict & { latitude: number; longitude: number }>
  >();
  let excludedCoordinateCount = 0;
  for (const row of rows) {
    const coordinates = readCoordinates(row.location);
    if (!coordinates) {
      excludedCoordinateCount++;
      continue;
    }
    // Same fixed 0.01-degree cells as incidents (~1.1 km north-south).
    // Include single alerts: this is location frequency, not a hotspot threshold
    // or predicted risk. Nearby points across a cell boundary remain separate.
    const cellId = `${coordinateCell(coordinates.latitude, HOTSPOT_GRID_DEGREES)}:${coordinateCell(coordinates.longitude, HOTSPOT_GRID_DEGREES)}`;
    const cell = cells.get(cellId) ?? [];
    cell.push({ ...row, ...coordinates });
    cells.set(cellId, cell);
  }
  const locations = [...cells]
    .map(([cellId, cell]) => {
      // Stable summation order keeps representative coordinates reproducible when
      // the database returns the same records in a different order.
      cell.sort((a, b) => a.latitude - b.latitude || a.longitude - b.longitude);
      return {
        cellId,
        rank: 0,
        alertCount: cell.length,
        latitude: Number(
          (
            cell.reduce((sum, row) => sum + row.latitude, 0) / cell.length
          ).toFixed(6),
        ),
        longitude: Number(
          (
            cell.reduce((sum, row) => sum + row.longitude, 0) / cell.length
          ).toFixed(6),
        ),
        bySeverity: groupBy(cell, 'severity'),
        byType: groupBy(cell, 'alertType'),
      };
    })
    .sort(
      (a, b) =>
        b.alertCount - a.alertCount ||
        a.latitude - b.latitude ||
        a.longitude - b.longitude ||
        a.cellId.localeCompare(b.cellId),
    )
    .map((cell, index) => ({ ...cell, rank: index + 1 }));
  return {
    gridSizeDegrees: HOTSPOT_GRID_DEGREES,
    validAlertCount: rows.length - excludedCoordinateCount,
    excludedCoordinateCount,
    locations,
  };
}
