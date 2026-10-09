import {
  calculateHaversineDistanceKm,
  calculateTotalWaypointsDistanceKm
} from '../src/modules/patrols/service.js';
import { LocationSource } from '../src/types/enums.js';

// UC-A patrol distance utilities (pure functions; no database access).
describe('UC-A patrol distance calculations', () => {
  test('calculateHaversineDistanceKm calculates distance between two points accurately', () => {
    const dist = calculateHaversineDistanceKm(0, 0, 1, 1);
    expect(dist).toBeGreaterThan(150);
    expect(dist).toBeLessThan(160);
  });

  test('calculateTotalWaypointsDistanceKm returns 0 for empty or single waypoint', () => {
    expect(calculateTotalWaypointsDistanceKm([])).toBe(0);
    expect(
      calculateTotalWaypointsDistanceKm([
        { latitude: -2.15, longitude: 34.82, timestamp: new Date(), source: LocationSource.GPS }
      ])
    ).toBe(0);
  });

  test('calculateTotalWaypointsDistanceKm sums distances correctly across multiple waypoints', () => {
    const waypoints = [
      { latitude: -2.1523, longitude: 34.8214, timestamp: new Date(), source: LocationSource.GPS },
      { latitude: -2.148, longitude: 34.832, timestamp: new Date(), source: LocationSource.GPS },
      { latitude: -2.141, longitude: 34.845, timestamp: new Date(), source: LocationSource.GPS }
    ];
    const totalDist = calculateTotalWaypointsDistanceKm(waypoints);
    expect(totalDist).toBeGreaterThan(2);
    expect(totalDist).toBeLessThan(5);
  });
});
