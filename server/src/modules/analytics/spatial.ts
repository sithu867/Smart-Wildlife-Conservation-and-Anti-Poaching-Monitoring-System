export function readCoordinates(
  location: unknown,
): { latitude: number; longitude: number } | null {
  if (!location || typeof location !== 'object') return null;
  const { latitude, longitude } = location as Record<string, unknown>;
  // JSON can contain missing, nonnumeric or out-of-range coordinates. Never
  // coerce these into map positions or include them in spatial concentrations.
  return typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

export function coordinateCell(coordinate: number, gridSize: number): number {
  // Normalize floating noise at exact grid boundaries. Floor treats negative
  // coordinates consistently and does not depend on the input ordering.
  return Math.floor(Number((coordinate / gridSize).toFixed(9)));
}
