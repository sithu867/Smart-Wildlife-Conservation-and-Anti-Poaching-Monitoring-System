import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import {
  AnalyticsResults,
  hasMeaningfulMatchingData,
} from './AnalyticsResults';
import { ReportGeneration } from './ConservationReport';
import { AnalyticsPage } from './AnalyticsPage';
import { AnalysisProcessing } from './AnalyticsExperience';
import { PatrolCoverageResults } from './PatrolCoverageResults';
import { PatrolCoverageMap, routePositions } from './PatrolCoverageMap';
import { analyticsApi } from './api';
import {
  parks,
  validCriteria,
  result,
  patrolCoverageFixture,
} from './analyticsTestFixtures';
import { installAnalyticsObservers } from './analyticsTestSetup';
import type { AnalyticsResult } from '../../../../server/src/modules/analytics/contract';

installAnalyticsObservers();
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

describe('UC-D Patrol Coverage dashboard', () => {
  test('shows real coverage percentage, summary counts and each route classification', () => {
    render(<PatrolCoverageResults analysis={patrolCoverageFixture()} />);
    const panel = screen.getByRole('region', {
      name: 'Patrol Coverage results',
    });
    expect(panel).toHaveTextContent('33.3%');
    expect(panel).toHaveTextContent('Total routes3');
    expect(panel).toHaveTextContent('Covered routes1');
    expect(panel).toHaveTextContent('Limited-activity routes1');
    expect(panel).toHaveTextContent('Neglected routes1');
    expect(panel).toHaveTextContent(
      '2 meaningful patrol sessions · 1 completed patrols',
    );
    const list = screen.getByRole('list', { name: 'Patrol route coverage' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Boundary routeCovered');
    expect(items[1]).toHaveTextContent('River routeLimited activity');
    expect(items[2]).toHaveTextContent('Forest routeNeglected');
    expect(items[2]).toHaveTextContent('No activity in period');
    expect(items[0]).toHaveTextContent('30 Sept 2026, 12:00:00 UTC');
  });
  test('maps only usable geometry, with distinct solid/dashed paths and all routes retained in the list', () => {
    render(<PatrolCoverageResults analysis={patrolCoverageFixture()} />);
    expect(
      screen.getByRole('region', { name: 'Patrol coverage map' }),
    ).toBeInTheDocument();
    const paths = document.querySelectorAll('.leaflet-overlay-pane path');
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveAttribute('stroke', '#16a34a');
    expect(paths[0]).not.toHaveAttribute('stroke-dasharray');
    expect(paths[1]).toHaveAttribute('stroke-dasharray', '10 6');
    expect(
      screen.getByText(/1 routes lack usable geometry/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Patrol route coverage' }),
    ).toHaveTextContent('Forest route');
    fireEvent.click(paths[0]);
    expect(document.querySelector('.leaflet-popup-content')).toHaveTextContent(
      'Boundary route: Covered',
    );
  });
  test('neglected geometry is dotted and re-analysis replaces map paths and refits to the new data', () => {
    const analysis = patrolCoverageFixture();
    const view = render(<PatrolCoverageMap routes={analysis.routes} />);
    const next = [
      {
        ...analysis.routes[2],
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [35, -3],
            [35.1, -3.1],
          ] as [number, number][],
        },
      },
    ];
    view.rerender(<PatrolCoverageMap routes={next} />);
    const paths = document.querySelectorAll('.leaflet-overlay-pane path');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toHaveAttribute('stroke', '#dc2626');
    expect(paths[0]).toHaveAttribute('stroke-dasharray', '3 7');
    fireEvent.click(paths[0]);
    expect(document.querySelector('.leaflet-popup-content')).toHaveTextContent(
      'Forest route: Neglected',
    );
  });
  test('missing or invalid geometry uses an honest map fallback and keeps route statuses', () => {
    const analysis = patrolCoverageFixture();
    analysis.routes = analysis.routes.map((route) => ({
      ...route,
      geometry: null,
    }));
    analysis.missingGeometryRouteCount = 3;
    render(<PatrolCoverageResults analysis={analysis} />);
    expect(
      screen.queryByRole('region', { name: 'Patrol coverage map' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/No usable route geometry/)).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('list', { name: 'Patrol route coverage' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(3);
    expect(
      routePositions({
        ...analysis.routes[0],
        geometry: {
          type: 'LineString',
          coordinates: [
            [34, -2],
            [200, -3],
          ],
        },
      }),
    ).toEqual([]);
    expect(routePositions(patrolCoverageFixture().routes[0])).toEqual([
      [-2.1, 34.8],
      [-2.2, 34.9],
    ]);
  });
  test('zero routes displays zero coverage with a successful informational no-data state', () => {
    const data = result(
      { ...validCriteria, categories: ['PATROL_COVERAGE'] },
      'NO_MATCHING_DATA',
    );
    display(data);
    expect(
      screen.getByRole('status', { name: 'No matching conservation data' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Patrol Coverage results' }),
    ).toHaveTextContent('0%');
    expect(
      screen.getByText(
        'No patrol routes are registered for the selected park.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Patrol coverage map' }),
    ).not.toBeInTheDocument();
  });
  test('registered neglected routes remain actionable findings without claiming matching patrol sessions', () => {
    const analysis = patrolCoverageFixture();
    analysis.coveredRoutes = 0;
    analysis.limitedActivityRoutes = 0;
    analysis.neglectedRoutes = 3;
    analysis.coveragePercentage = 0;
    analysis.patrolSessionCount = 0;
    analysis.completedPatrolCount = 0;
    analysis.routes = analysis.routes.map((route) => ({
      ...route,
      status: 'NEGLECTED',
      sessionCount: 0,
      completedSessionCount: 0,
      waypointCount: 0,
      lastPatrolDate: null,
    }));
    display({
      ...result({ ...validCriteria, categories: ['PATROL_COVERAGE'] }),
      patrolCoverage: analysis,
      matchedRecords: { incidents: 0, patrols: 0 },
    });
    expect(
      screen.queryByRole('status', { name: 'No matching conservation data' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/All registered routes are classified as neglected/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate & Save Report' }),
    ).toBeEnabled();
  });
  test('applied categories control coverage visibility even when the response contains other category data', () => {
    display({ ...result(), patrolCoverage: patrolCoverageFixture() });
    expect(
      screen.queryByRole('region', { name: 'Patrol Coverage results' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Incident Statistics results' }),
    ).toBeInTheDocument();
  });
  test('coverage coexists with Batch 2 statistics, hotspot map and HWC charts', () => {
    display(
      result({
        ...validCriteria,
        categories: [
          'INCIDENT_STATISTICS',
          'INCIDENT_HOTSPOTS',
          'PATROL_COVERAGE',
          'HWC_TRENDS',
        ],
      }),
    );
    for (const name of [
      'Incident Statistics results',
      'Incident Hotspots results',
      'Patrol Coverage results',
      'Human-Wildlife Conflict Trends results',
      'Incident hotspot map',
      'Patrol coverage map',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('img', { name: 'Conflict Alerts Over Time chart' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Applied scope' }),
    ).toHaveTextContent('All selected categories use this park and period');
  });
});

describe('UC-D processing and refinement experience', () => {
  test('processing announces selected work with indeterminate progress and no invented percentage', () => {
    const view = render(
      <AnalysisProcessing categories={['PATROL_COVERAGE']} />,
    );
    const status = screen.getByRole('status', {
      name: 'Analyzing Conservation Data',
    });
    expect(status).toHaveTextContent('Retrieving patrol records');
    expect(status).toHaveTextContent('Calculating selected analytics');
    expect(status).not.toHaveTextContent('Retrieving incident records');
    expect(status).not.toHaveTextContent('%');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    view.rerender(
      <AnalysisProcessing categories={['INCIDENT_STATISTICS', 'HWC_TRENDS']} />,
    );
    expect(status).toHaveTextContent('Retrieving incident records');
    expect(status).toHaveTextContent('Retrieving conflict data');
    expect(status).not.toHaveTextContent('Retrieving patrol records');
  });
  test('Update Analysis uses the new criteria only after success while loading stays tied to its request snapshot', async () => {
    vi.spyOn(analyticsApi, 'listParks').mockResolvedValue(parks);
    const analyze = vi
      .spyOn(analyticsApi, 'analyze')
      .mockImplementation(async (criteria) => result(criteria));
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
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    const scope = await screen.findByRole('region', { name: 'Applied scope' });
    expect(
      screen.getByRole('heading', { name: 'Refine Analysis' }),
    ).toBeInTheDocument();
    let resolve!: (data: AnalyticsResult) => void;
    analyze.mockReturnValueOnce(
      new Promise<AnalyticsResult>((done) => {
        resolve = done;
      }),
    );
    fireEvent.click(screen.getByLabelText('Incident Statistics'));
    fireEvent.click(screen.getByLabelText('Patrol Coverage'));
    fireEvent.change(screen.getByLabelText('Park / Conservation Area'), {
      target: { value: parks[1].id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Analysis' }));
    expect(scope).toHaveTextContent('Alpha park');
    expect(
      screen.getByRole('region', { name: 'Incident Statistics results' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Patrol Coverage results' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyzing...' })).toBeDisabled();
    expect(
      screen.getByRole('heading', { name: 'Analyzing Conservation Data' }),
    ).toHaveFocus();
    fireEvent.click(screen.getByLabelText('Patrol Coverage'));
    fireEvent.click(screen.getByLabelText('Human-Wildlife Conflict Trends'));
    expect(
      screen.getByRole('status', { name: 'Analyzing Conservation Data' }),
    ).toHaveTextContent('Retrieving patrol records');
    expect(
      screen.getByRole('status', { name: 'Analyzing Conservation Data' }),
    ).not.toHaveTextContent('Retrieving conflict data');
    const submitted = analyze.mock.calls[1][0];
    expect(submitted).toMatchObject({
      parkId: parks[1].id,
      categories: ['PATROL_COVERAGE'],
    });
    await act(async () => resolve(result(submitted)));
    expect(scope).toHaveTextContent('Beta park');
    expect(scope).toHaveTextContent('Patrol Coverage');
    expect(scope).not.toHaveTextContent('Human-Wildlife Conflict Trends');
    expect(
      screen.getByRole('region', { name: 'Patrol Coverage results' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Conservation Analysis Results' }),
    ).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Update Analysis' }),
    ).toBeEnabled();
    expect(
      screen.getByText(/Displayed results still use the applied criteria/),
    ).toBeInTheDocument();
  });
});
