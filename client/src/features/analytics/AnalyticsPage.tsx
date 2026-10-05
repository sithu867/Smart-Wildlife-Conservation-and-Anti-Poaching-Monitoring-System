import { useEffect, useState } from 'react';
import { http } from '../../shared/api/http';

type Data = { summary: { patrols: { total: number; completed: number; active: number }; incidents: { total: number }; conflicts: { total: number; open: number; resolved: number }; responses: { total: number } }; incidents: { byType: { name: string; count: number }[] }; conflicts: { bySeverity: { name: string; count: number }[] } };
export function AnalyticsPage() {
  const [data, setData] = useState<Data | null>(null); const [error, setError] = useState('');
  useEffect(() => { http.get('/analytics', { headers: { 'x-user-role': 'MANAGER' } }).then(r => setData(r.data.data)).catch(() => setError('Unable to load analytics.')); }, []);
  if (error) return <main className="page"><h1>Conservation Analytics</h1><p role="alert">{error}</p></main>;
  if (!data) return <main className="page"><h1>Conservation Analytics</h1><p>Loading current conservation data…</p></main>;
  const s = data.summary;
  return <main className="page"><p className="eyebrow">Park manager</p><h1>Conservation Analytics</h1><p>Live metrics from patrols, incidents, conflict alerts, and responses.</p><section className="analytics-grid">{[['Patrols', s.patrols.total], ['Completed patrols', s.patrols.completed], ['Incidents', s.incidents.total], ['Conflict alerts', s.conflicts.total], ['Open conflicts', s.conflicts.open], ['Resolved conflicts', s.conflicts.resolved], ['Responses', s.responses.total]].map(([label, value]) => <article className="card" key={label}><small>{label}</small><strong>{value}</strong></article>)}</section><section className="card"><h2>Incidents by type</h2>{data.incidents.byType.length ? <ul>{data.incidents.byType.map(x => <li key={x.name}>{x.name}: {x.count}</li>)}</ul> : <p>No incidents in the selected period.</p>}</section><section className="card"><h2>Conflict severity</h2>{data.conflicts.bySeverity.length ? <ul>{data.conflicts.bySeverity.map(x => <li key={x.name}>{x.name}: {x.count}</li>)}</ul> : <p>No conflict alerts in the selected period.</p>}</section></main>;
}
