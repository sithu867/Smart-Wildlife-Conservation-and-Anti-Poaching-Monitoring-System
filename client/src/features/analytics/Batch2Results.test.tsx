import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { Browser } from 'leaflet';
import { AnalyticsPage } from './AnalyticsPage';
import {
  AnalyticsResults,
  hasMeaningfulMatchingData,
} from './AnalyticsResults';
import { ReportGeneration } from './ConservationReport';
import { HotspotMap } from './HotspotMap';
import { analyticsApi } from './api';
import { parks, result, validCriteria } from './analyticsTestFixtures';
import { installAnalyticsObservers } from './analyticsTestSetup';
import type {
  AnalysisCriteria,
  AnalyticsResult,
} from '../../../../server/src/modules/analytics/contract';
installAnalyticsObservers();

const originalSvgSupport = Browser.svg;
beforeAll(() => {
  Object.defineProperty(Browser, 'svg', { value: true });
});
afterAll(() => {
  Object.defineProperty(Browser, 'svg', { value: originalSvgSupport });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function display(data: AnalyticsResult) {
  return render(
    <>
      <AnalyticsResults data={data} appliedCriteria={data.filters} />
      <ReportGeneration
        canGenerate={hasMeaningfulMatchingData(data)}
        generating={false}
        error=""
        draftChanged={false}
        hasReport={false}
        onGenerate={vi.fn()}
        onPreview={vi.fn()}
      />
    </>,
  );
}
function categoryResult(categories: AnalysisCriteria['categories']) {
  return result({ ...validCriteria, categories });
}

describe('UC-D Batch 2 selected analytics sections', () => {
  test('statistics-only analysis shows actual total, status/type table and a real chart with accessible data', () => {
    display(categoryResult(['INCIDENT_STATISTICS']));
    const section = screen.getByRole('region', {
      name: 'Incident Statistics results',
    });
    expect(section).toHaveTextContent('Total incidents: 2');
    expect(
      within(
        screen.getByRole('table', { name: 'Incidents by status' }),
      ).getByRole('row', { name: 'RESOLVED 1' }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('table', { name: 'Incidents by type' }),
      ).getByRole('row', { name: 'SNARE 2' }),
    ).toBeInTheDocument();
    const chart = screen.getByRole('img', {
      name: 'Incidents Over Time chart',
    });
    expect(chart.querySelector('svg')).toBeInTheDocument();
    fireEvent.click(screen.getByText('View incidents over time data'));
    expect(
      screen.getByRole('table', { name: 'Incidents Over Time data' }),
    ).toHaveTextContent('2026-09-01');
    expect(
      screen.queryByRole('region', { name: 'Incident Hotspots results' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', {
        name: 'Human-Wildlife Conflict Trends results',
      }),
    ).not.toBeInTheDocument();
  });
  test('hotspots-only analysis renders a real map and backend-ranked list without incident statistics', () => {
    display(categoryResult(['INCIDENT_HOTSPOTS']));
    expect(
      screen.getByRole('region', { name: 'Incident hotspot map' }),
    ).toBeInTheDocument();
    expect(
      document.querySelectorAll('.leaflet-overlay-pane path'),
    ).toHaveLength(1);
    const list = screen.getByRole('list', { name: 'Ranked incident hotspots' });
    expect(list).toHaveTextContent('Rank 1: 2 incidents');
    expect(list).toHaveTextContent('Latitude -2.152000');
    expect(list).toHaveTextContent('SNARE: 2');
    expect(
      screen.queryByRole('region', { name: 'Incident Statistics results' }),
    ).not.toBeInTheDocument();
  });
  test('multiple hotspots render separate markers and ranks', () => {
    const data = categoryResult(['INCIDENT_HOTSPOTS']);
    const first = data.incidentHotspots!.hotspots[0];
    data.incidentHotspots!.hotspots.push({
      ...first,
      cellId: 'separate',
      latitude: -3,
      longitude: 35,
      rank: 2,
      incidentCount: 5,
      concentration: 'MEDIUM',
    });
    display(data);
    expect(
      document.querySelectorAll('.leaflet-overlay-pane path'),
    ).toHaveLength(2);
    expect(
      screen.getByRole('list', { name: 'Ranked incident hotspots' }),
    ).toHaveTextContent('Rank 2: 5 incidents');
  });
  test('zero qualifying hotspots gives an honest category empty state and no map', () => {
    const data = categoryResult(['INCIDENT_STATISTICS', 'INCIDENT_HOTSPOTS']);
    data.incidentHotspots!.hotspots = [];
    data.incidentHotspots!.isolatedIncidentCount = 2;
    display(data);
    expect(
      screen.getByText(
        'Incidents were found, but none formed a hotspot for the selected criteria. Try a wider period or fewer incident filters.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Incident hotspot map' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Incident Statistics results' }),
    ).toBeInTheDocument();
  });
  test('invalid/missing coordinates are ignored safely by the map', () => {
    const point = categoryResult(['INCIDENT_HOTSPOTS']).incidentHotspots!
      .hotspots[0];
    render(
      <HotspotMap
        hotspots={[
          { ...point, latitude: NaN },
          { ...point, longitude: 181 },
          { ...point, latitude: undefined as unknown as number },
        ]}
      />,
    );
    expect(
      screen.getByText(
        'No valid hotspot coordinates are available for the map.',
      ),
    ).toBeInTheDocument();
    expect(
      document.querySelector('.leaflet-container'),
    ).not.toBeInTheDocument();
  });
  test('conflict-only analysis renders actual alert/response charts and all breakdowns with selected park scope', () => {
    display(categoryResult(['HWC_TRENDS']));
    const trends = screen.getByRole('region', {
      name: 'Human-Wildlife Conflict Trends results',
    });
    expect(trends).toHaveTextContent('Total alerts: 2');
    expect(trends).toHaveTextContent('Total responses: 1');
    expect(trends).toHaveTextContent('assigned to the selected park');
    expect(
      screen
        .getByRole('img', { name: 'Conflict Alerts Over Time chart' })
        .querySelector('svg'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Conflict Responses Over Time chart' }),
    ).toBeInTheDocument();
    for (const [table, row] of [
      ['Alerts by severity', 'HIGH 1'],
      ['Alerts by status', 'OPEN 1'],
      ['Alerts by source', 'COLLAR 1'],
      ['Alerts by type', 'CROP_RAID 1'],
      ['Responses by action', 'INVESTIGATED_AREA 1'],
    ]) {
      expect(
        within(screen.getByRole('table', { name: table })).getByRole('row', {
          name: row,
        }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('region', { name: 'Incident Statistics results' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Matching park-linked incidents/),
    ).not.toBeInTheDocument();
  });
  test('response-only conflict activity shows real response data without a fake alert chart', () => {
    const data = categoryResult(['HWC_TRENDS']);
    data.conflictTrends!.totalAlerts = 0;
    data.matchedRecords.conflicts = 0;
    display(data);
    expect(
      screen.getByText(
        'No conflict alerts were created during the applied period.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Conflict Alerts Over Time chart' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Conflict Responses Over Time chart' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    ).toBeEnabled();
  });
  test('a mixed analysis displays only selected categories and exposes category-specific no-data', () => {
    const data = categoryResult(['INCIDENT_STATISTICS', 'HWC_TRENDS']);
    data.conflictTrends!.totalAlerts = 0;
    data.conflictTrends!.totalResponses = 0;
    display(data);
    expect(
      screen.getByRole('region', { name: 'Incident Statistics results' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No conflict alerts or responses match/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Conflict Alerts Over Time chart' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Incident Hotspots results' }),
    ).not.toBeInTheDocument();
  });
  test('global no-data remains informational with category zero results and no available report', () => {
    display(
      result(
        { ...validCriteria, categories: ['HWC_TRENDS'] },
        'NO_MATCHING_DATA',
      ),
    );
    expect(
      screen.getByRole('status', { name: 'No matching conservation data' }),
    ).toHaveClass('analytics-feedback--info');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', {
        name: 'Human-Wildlife Conflict Trends results',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('region', { name: 'Applied scope' }),
    ).toHaveTextContent('All selected categories use this park and period');
  });
  test('re-analysis changes rendered categories only after success; buttons keep primary/secondary states', async () => {
    vi.spyOn(analyticsApi, 'listParks').mockResolvedValue(parks);
    vi.spyOn(analyticsApi, 'analyze').mockImplementation(async (criteria) =>
      result(criteria),
    );
    render(<AnalyticsPage />);
    await screen.findByRole('option', { name: 'Alpha park (ALPHA)' });
    fireEvent.change(screen.getByLabelText('Park / Conservation Area'), {
      target: { value: parks[0].id },
    });
    fireEvent.change(screen.getByLabelText('Start Date'), {
      target: { value: validCriteria.start },
    });
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: validCriteria.end },
    });
    const analyze = screen.getByRole('button', {
      name: /^(Analyze|Update Analysis)$/,
    });
    expect(analyze).toHaveClass('analytics-button--primary');
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveClass(
      'analytics-button--secondary',
    );
    fireEvent.click(analyze);
    await screen.findByRole('region', { name: 'Incident Statistics results' });
    fireEvent.click(screen.getByLabelText('Incident Statistics'));
    fireEvent.click(screen.getByLabelText('Human-Wildlife Conflict Trends'));
    expect(
      screen.queryByRole('region', {
        name: 'Human-Wildlife Conflict Trends results',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Incident Statistics results' }),
    ).toBeInTheDocument();
    fireEvent.click(analyze);
    await screen.findByRole('region', {
      name: 'Human-Wildlife Conflict Trends results',
    });
    expect(
      screen.queryByRole('region', { name: 'Incident Statistics results' }),
    ).not.toBeInTheDocument();
  });
  test('re-analysis updates the existing map instead of leaving stale markers', () => {
    const data = categoryResult(['INCIDENT_HOTSPOTS']);
    const view = display(data);
    const next = {
      ...data,
      incidentHotspots: {
        ...data.incidentHotspots!,
        hotspots: [
          {
            ...data.incidentHotspots!.hotspots[0],
            cellId: 'new-location',
            latitude: -3,
            longitude: 35,
            incidentCount: 4,
          },
        ],
      },
    };
    view.rerender(
      <AnalyticsResults data={next} appliedCriteria={next.filters} />,
    );
    expect(
      document.querySelectorAll('.leaflet-overlay-pane path'),
    ).toHaveLength(1);
    expect(
      screen.getByRole('list', { name: 'Ranked incident hotspots' }),
    ).toHaveTextContent('Rank 1: 4 incidents');
    expect(
      screen.getByRole('list', { name: 'Ranked incident hotspots' }),
    ).toHaveTextContent('Latitude -3.000000');
  });
});
