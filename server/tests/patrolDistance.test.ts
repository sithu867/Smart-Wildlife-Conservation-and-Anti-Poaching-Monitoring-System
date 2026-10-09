import {
  calculateHaversineDistanceKm,
  calculateTotalWaypointsDistanceKm
} from '../src/modules/patrols/service.js';
import { LocationSource } from '../src/types/enums.js';

// UC-A patrol distance utilities (pure functions; no database access). Earth radius is 6371 km.
const at = (latitude: number, longitude: number) => ({ latitude, longitude, timestamp: new Date(), source: LocationSource.GPS });

describe('UC-A patrol distance calculations', () => {
  test('calculateHaversineDistanceKm calculates distance between two points accurately', () => {
    expect(calculateHaversineDistanceKm(0, 0, 1, 1)).toBeCloseTo(157.2494, 4);
    // One degree of longitude along the equator.
    expect(calculateHaversineDistanceKm(0, 0, 0, 1)).toBeCloseTo(111.1949, 4);
  });

  test('identical points are 0 km apart', () => {
    expect(calculateHaversineDistanceKm(6.475, 80.88, 6.475, 80.88)).toBe(0);
  });

  test('handles boundary coordinates: pole to pole and across the antimeridian', () => {
    const halfCircumference = Math.PI * 6371;
    expect(calculateHaversineDistanceKm(90, 0, -90, 0)).toBeCloseTo(halfCircumference, 6);
    expect(calculateHaversineDistanceKm(0, -180, 0, 180)).toBeCloseTo(0, 6);
  });

  test('calculateTotalWaypointsDistanceKm returns 0 for empty or single waypoint', () => {
    expect(calculateTotalWaypointsDistanceKm([])).toBe(0);
    expect(calculateTotalWaypointsDistanceKm([at(-2.15, 34.82)])).toBe(0);
  });

  test('calculateTotalWaypointsDistanceKm sums distances correctly across multiple waypoints', () => {
    // 111.19493 km + 111.19493 km, rounded to metres.
    expect(calculateTotalWaypointsDistanceKm([at(0, 0), at(0, 1), at(1, 1)])).toBe(222.39);
    expect(calculateTotalWaypointsDistanceKm([at(6.475, 80.88), at(6.482, 80.895), at(6.49, 80.91)])).toBe(3.712);
  });

  test('a track that returns to its start counts both legs', () => {
    expect(calculateTotalWaypointsDistanceKm([at(0, 0), at(0, 1), at(0, 0)])).toBe(222.39);
  });
});
