import { env } from '../../config/env.js';

export type NominatimAddress = Record<string, string | undefined>;

// Most specific named place first: "Pannipitiya" (village) before "Colombo District"
const LOCALITY_KEYS = ['suburb', 'village', 'town', 'city', 'hamlet', 'neighbourhood', 'city_district', 'municipality', 'county'];
const REGION_KEYS = ['state_district', 'state', 'region', 'province'];

/** Builds a short "Place, Country" label from a Nominatim address, e.g. "Pannipitiya, Sri Lanka". */
export function formatPlaceName(address?: NominatimAddress | null): string | null {
  if (!address) return null;
  const place = LOCALITY_KEYS.map(key => address[key]).find(Boolean) ?? REGION_KEYS.map(key => address[key]).find(Boolean);
  const parts = [place, address.country].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? [...new Set(parts)].join(', ') : null;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface ReverseGeocoderOptions {
  enabled: boolean;
  baseUrl: string;
  userAgent: string;
  /** Nominatim allows at most 1 request per second */
  minIntervalMs: number;
  fetchFn: typeof fetch;
}

/**
 * Coordinates -> place name using OpenStreetMap Nominatim, following its usage policy:
 * identifying User-Agent, max 1 request/second, results cached.
 *
 * lookup() resolves to:
 *  - a string: the place name
 *  - null: the service answered but the point has no named place (e.g. open water)
 *  - undefined: disabled, timed out or failed - try again later
 */
export class ReverseGeocoder {
  private readonly cache = new Map<string, string | null>();
  private nextSlotAt = 0;

  constructor(private readonly options: ReverseGeocoderOptions) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  async lookup(latitude: number, longitude: number, timeoutMs = 10000): Promise<string | null | undefined> {
    if (!this.options.enabled) return undefined;

    // ~11 m precision: nearby reports share one request
    const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const deadline = Date.now() + timeoutMs;
    const waitMs = this.reserveSlot();
    if (Date.now() + waitMs >= deadline) return undefined;
    await sleep(waitMs);

    const url =
      `${this.options.baseUrl}/reverse?format=jsonv2&addressdetails=1&zoom=14&accept-language=en` +
      `&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
    try {
      const response = await this.options.fetchFn(url, {
        headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now()))
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { address?: NominatimAddress; error?: string };
      const name = formatPlaceName(body.address);
      this.cache.set(key, name);
      return name;
    } catch (error) {
      console.warn('Reverse geocoding failed:', error instanceof Error ? error.message : error);
      return undefined;
    }
  }

  /** Reserves the next free request slot and returns how long to wait for it. */
  private reserveSlot(): number {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = slot + this.options.minIntervalMs;
    return slot - now;
  }
}

export const reverseGeocoder = new ReverseGeocoder({
  enabled: env.GEOCODING_ENABLED ? env.GEOCODING_ENABLED === 'true' : env.NODE_ENV !== 'test',
  baseUrl: env.NOMINATIM_URL,
  userAgent: env.GEOCODING_USER_AGENT,
  minIntervalMs: 1100,
  fetchFn: (...args) => fetch(...args)
});
