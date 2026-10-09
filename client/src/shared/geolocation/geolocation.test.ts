import { GeolocationService, type GeolocationProvider } from './geolocation';

// Shared geolocation abstraction. Supports UC-A live patrol tracking (watch/clear) and GPS fixes.
const position = { coords: { latitude: 6.475, longitude: 80.88, accuracy: 7 }, timestamp: 1759298400000 };
const mapped = { latitude: 6.475, longitude: 80.88, accuracy: 7, timestamp: 1759298400000 };

function installBrowserGeolocation(api: Partial<Geolocation> | undefined) {
  Object.defineProperty(navigator, 'geolocation', { value: api, configurable: true });
}

afterEach(() => {
  // jsdom has no Geolocation API; restore that default between tests.
  delete (navigator as unknown as Record<string, unknown>).geolocation;
});

describe('GeolocationService with an injected provider', () => {
  test('delegates fixes, tracking and stopping to the provider', async () => {
    const provider: GeolocationProvider = {
      getCurrentPosition: vi.fn().mockResolvedValue(mapped),
      watchPosition: vi.fn().mockReturnValue(42),
      clearWatch: vi.fn()
    };
    const service = new GeolocationService(provider);
    const onLocation = vi.fn();
    const onError = vi.fn();

    await expect(service.getCurrentLocation()).resolves.toEqual(mapped);
    expect(service.startTracking(onLocation, onError)).toBe(42);
    service.stopTracking(42);

    expect(provider.watchPosition).toHaveBeenCalledWith(onLocation, onError);
    expect(provider.clearWatch).toHaveBeenCalledWith(42);
  });
});

describe('browser geolocation provider', () => {
  test('maps a successful position fix', async () => {
    installBrowserGeolocation({ getCurrentPosition: (success: PositionCallback) => success(position as GeolocationPosition) });

    await expect(new GeolocationService().getCurrentLocation()).resolves.toEqual(mapped);
  });

  test('maps a permission-denied error', async () => {
    installBrowserGeolocation({
      getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback | null) =>
        error?.({ code: 1, message: 'User denied Geolocation' } as GeolocationPositionError)
    });

    await expect(new GeolocationService().getCurrentLocation()).rejects.toEqual({ code: 1, message: 'User denied Geolocation' });
  });

  test('rejects a fix when the device has no Geolocation API', async () => {
    await expect(new GeolocationService().getCurrentLocation()).rejects.toEqual({ code: 0, message: 'Geolocation unavailable' });
  });

  test('watch callbacks receive mapped positions and errors, and the watch can be cleared', () => {
    let emit: PositionCallback = () => undefined;
    let fail: PositionErrorCallback = () => undefined;
    const clearWatch = vi.fn();
    installBrowserGeolocation({
      watchPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => {
        emit = success;
        fail = error!;
        return 7;
      },
      clearWatch
    });
    const onLocation = vi.fn();
    const onError = vi.fn();
    const service = new GeolocationService();

    const id = service.startTracking(onLocation, onError);
    emit(position as GeolocationPosition);
    fail({ code: 2, message: 'Position unavailable' } as GeolocationPositionError);
    service.stopTracking(id);

    expect(id).toBe(7);
    expect(onLocation).toHaveBeenCalledWith(mapped);
    expect(onError).toHaveBeenCalledWith({ code: 2, message: 'Position unavailable' });
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  // Regression: tracking threw a TypeError without the Geolocation API, crashing the active patrol screen.
  test('tracking without a Geolocation API reports it as an error instead of throwing', () => {
    const onError = vi.fn();
    const service = new GeolocationService();

    const id = service.startTracking(vi.fn(), onError);

    expect(onError).toHaveBeenCalledWith({ code: 0, message: 'Geolocation unavailable' });
    expect(() => service.stopTracking(id)).not.toThrow();
  });
});
