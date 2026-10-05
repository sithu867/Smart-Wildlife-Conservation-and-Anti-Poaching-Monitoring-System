import type { Ref } from 'react';
import type { AnalysisCriteria } from '../../../../server/src/modules/analytics/contract';

export function AnalyticsOverview() {
  return (
    <header className="analytics-overview">
      <div className="analytics-heading">
        <p className="eyebrow">Park manager · Conservation insights</p>
        <h1>Analytics &amp; Reports</h1>
        <p>Turn field records into a clearer view of conservation activity.</p>
      </div>
      <div className="analytics-area-grid" aria-label="Analytics areas">
        <article className="analytics-area">
          <span aria-hidden="true">01</span>
          <h2>Incident Statistics &amp; Hotspots</h2>
          <p>Track incident patterns and concentrations.</p>
        </article>
        <article className="analytics-area">
          <span aria-hidden="true">02</span>
          <h2>Patrol Coverage</h2>
          <p>Review covered, limited and neglected routes.</p>
        </article>
        <article className="analytics-area">
          <span aria-hidden="true">03</span>
          <h2>Human-Wildlife Conflict Trends</h2>
          <p>Understand alert and response activity.</p>
        </article>
        <article className="analytics-area">
          <span aria-hidden="true">04</span>
          <h2>Report Generation</h2>
          <p>Generate, review and export a Statistical Conservation Report.</p>
        </article>
      </div>
    </header>
  );
}

export function AnalysisProcessing({
  categories,
  headingRef,
}: {
  categories: AnalysisCriteria['categories'];
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  // The API exposes a single response, not measurable subtask progress. These
  // describe selected work without pretending each retrieval has finished.
  const tasks = [
    ...(categories.includes('PATROL_COVERAGE')
      ? ['Retrieving patrol records']
      : []),
    ...(categories.some((category) => category.startsWith('INCIDENT_'))
      ? ['Retrieving incident records']
      : []),
    ...(categories.includes('HWC_TRENDS') ? ['Retrieving conflict data'] : []),
    'Calculating selected analytics',
  ];
  return (
    <section
      className="card analytics-processing"
      role="status"
      aria-live="polite"
      aria-labelledby="analytics-processing-title"
    >
      <span className="analytics-spinner" aria-hidden="true" />
      <div>
        <h2 ref={headingRef} tabIndex={-1} id="analytics-processing-title">
          Analyzing Conservation Data
        </h2>
        <p>
          Your entered criteria are preserved. Reviewed results stay visible
          until this analysis succeeds.
        </p>
        <ul>
          {tasks.map((task) => (
            <li key={task}>{task}</li>
          ))}
        </ul>
        <div className="analytics-indeterminate" aria-hidden="true" />
      </div>
    </section>
  );
}
