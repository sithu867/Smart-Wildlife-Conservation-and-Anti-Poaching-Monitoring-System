import { useId } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import type {
  AnalyticsGroup,
  AnalyticsTimeSeries,
} from '../../../../server/src/modules/analytics/contract';

import { formatEnumLabel } from './formatting';

export function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: AnalyticsGroup[];
}) {
  return (
    <section className="analytics-breakdown">
      <h3>{title}</h3>
      <table>
        <caption className="analytics-sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <th scope="row">{formatEnumLabel(row.name)}</th>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function TimeSeriesChart({
  title,
  series,
}: {
  title: string;
  series: AnalyticsTimeSeries;
}) {
  const titleId = useId();
  return (
    <section className="analytics-chart" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      <p>
        {series.bucket.toLowerCase()} buckets (UTC). First and last buckets may
        cover only part of the period.
      </p>
      <div role="img" aria-label={`${title} chart`}>
        <ResponsiveContainer
          width="100%"
          height={260}
          minWidth={0}
          initialDimension={{ width: 600, height: 260 }}
        >
          <LineChart
            data={series.points}
            accessibilityLayer
            margin={{ top: 12, right: 24, bottom: 12, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#315546" />
            <XAxis dataKey="date" stroke="#cbd5e1" minTickGap={30} />
            <YAxis allowDecimals={false} stroke="#cbd5e1" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#10231c',
                borderColor: '#34d399',
                color: '#f8fafc',
              }}
            />
            <Line
              type="linear"
              dataKey="count"
              name="Count"
              stroke="#34d399"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* The data table gives keyboard/screen-reader users the same exact values
        as the chart, and remains useful when a narrow viewport hides ticks. */}
      <details>
        <summary>View {title.toLowerCase()} data</summary>
        {/* The bounded table can scroll without containing interactive cells.
            Make its viewport reachable so keyboard users can scroll all rows. */}
        <div
          className="analytics-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={`${title} data table`}
        >
          <table>
            <caption>{title} data</caption>
            <thead>
              <tr>
                <th scope="col">Bucket starts (UTC)</th>
                <th scope="col">Count</th>
              </tr>
            </thead>
            <tbody>
              {series.points.map((point) => (
                <tr key={point.date}>
                  <th scope="row">{point.date}</th>
                  <td>{point.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
