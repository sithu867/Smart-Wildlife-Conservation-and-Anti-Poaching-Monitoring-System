import { prisma } from '../../config/prisma.js';
import { reverseGeocoder } from '../shared/reverseGeocoder.js';

/** How long a user-facing request (create / edit) waits for a place name before saving without it. */
export const PLACE_NAME_REQUEST_TIMEOUT_MS = 3000;
/** After the lookup service fails, background filling pauses for this long. */
const BACKFILL_COOLDOWN_MS = 5 * 60 * 1000;

type Coordinates = { latitude: number; longitude: number };

/** Looks up the place name for a location being saved now. `undefined` = not available yet (filled in later). */
export function lookupPlaceName(location: Coordinates): Promise<string | null | undefined> {
  return reverseGeocoder.lookup(location.latitude, location.longitude, PLACE_NAME_REQUEST_TIMEOUT_MS);
}

/** True when the report's location has never had a place name resolved (null means "resolved, no name"). */
export function needsPlaceName(location: unknown): boolean {
  return typeof location === 'object' && location !== null && !('placeName' in location);
}

/**
 * Stores a resolved name without touching updatedAt (so a ranger's in-progress edit doesn't get a conflict),
 * and only if the location still has the same coordinates (an edit may have moved it meanwhile).
 */
async function savePlaceName(incidentId: string, location: Coordinates, placeName: string | null): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "ConservationIncident"
    SET "location" = jsonb_set("location"::jsonb, '{placeName}', ${JSON.stringify(placeName)}::jsonb)
    WHERE "id" = ${incidentId}
      AND ("location"->>'latitude')::float8 = ${location.latitude}
      AND ("location"->>'longitude')::float8 = ${location.longitude}`;
}

/**
 * Fills in place names for reports that don't have one yet (older reports, or ones saved while the lookup
 * service was unavailable). One lookup at a time, so it never crowds out lookups for new reports.
 */
class PlaceNameBackfill {
  private readonly pending = new Map<string, Coordinates>();
  private running: Promise<void> | null = null;
  private pausedUntil = 0;

  schedule(incidents: Array<{ id: string; location: unknown }>): void {
    if (!reverseGeocoder.isEnabled() || Date.now() < this.pausedUntil) return;
    for (const incident of incidents) {
      if (!needsPlaceName(incident.location)) continue;
      const { latitude, longitude } = incident.location as Coordinates;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) this.pending.set(incident.id, { latitude, longitude });
    }
    if (this.pending.size > 0 && !this.running) {
      this.running = this.run().finally(() => {
        this.running = null;
      });
    }
  }

  /** Resolves when the current batch is finished (used by tests). */
  whenIdle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private async run(): Promise<void> {
    while (this.pending.size > 0) {
      const [incidentId, location] = this.pending.entries().next().value as [string, Coordinates];
      this.pending.delete(incidentId);
      const placeName = await reverseGeocoder.lookup(location.latitude, location.longitude);
      if (placeName === undefined) {
        // Service unavailable: stop and retry on a later request instead of hammering it
        this.pending.clear();
        this.pausedUntil = Date.now() + BACKFILL_COOLDOWN_MS;
        return;
      }
      try {
        await savePlaceName(incidentId, location, placeName);
      } catch (error) {
        console.warn('Could not save place name:', error instanceof Error ? error.message : error);
      }
    }
  }
}

export const placeNameBackfill = new PlaceNameBackfill();
