export function installAnalyticsObservers() {
  beforeAll(() => {
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
  afterAll(() => vi.unstubAllGlobals());
}
