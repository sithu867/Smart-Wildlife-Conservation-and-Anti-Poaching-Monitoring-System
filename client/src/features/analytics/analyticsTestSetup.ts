import { Browser } from 'leaflet';

export function installAnalyticsObservers() {
  const originalSvgSupport = Browser.svg;
  beforeAll(() => {
    // jsdom omits SVG feature detection even though it can render SVG nodes.
    // Enable Leaflet's real SVG paths for both hotspot and patrol route tests.
    Object.defineProperty(Browser, 'svg', { value: true });
    // jsdom has no element resize observation. Supplying a measured chart area
    // exercises real Recharts SVG output without mocking analytics rendering.
    vi.stubGlobal(
      'ResizeObserver',
      class implements ResizeObserver {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe() {
          this.callback(
            [
              {
                contentRect: { width: 600, height: 260 },
              } as ResizeObserverEntry,
            ],
            this,
          );
        }
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterAll(() => {
    Object.defineProperty(Browser, 'svg', { value: originalSvgSupport });
    vi.unstubAllGlobals();
  });
}
