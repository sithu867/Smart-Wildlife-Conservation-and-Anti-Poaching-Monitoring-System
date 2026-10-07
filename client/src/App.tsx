import { Link, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AssignedPatrolPage } from './features/patrols/pages/AssignedPatrolPage';
import { PatrolRoutePage } from './features/patrols/pages/PatrolRoutePage';
import { ActivePatrolPage } from './features/patrols/pages/ActivePatrolPage';
import { PatrolCompletionPage } from './features/patrols/pages/PatrolCompletionPage';
import { ReportIncidentPage } from './features/incidents/pages/ReportIncidentPage';
import { IncidentHistoryPage } from './features/incidents/pages/IncidentHistoryPage';
import { EditIncidentPage } from './features/incidents/pages/EditIncidentPage';
import { ConflictAlertsPage } from './features/conflict-alerts/pages/ConflictAlertsPage';
import { ConflictAlertDetailPage } from './features/conflict-alerts/pages/ConflictAlertDetailPage';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';

const Placeholder = ({ title, description }: { title: string; description: string }) => (
  <main className="page">
    <p className="eyebrow">WildlifeGuard foundation</p>
    <h1>{title}</h1>
    <p>{description}</p>
    <Link className="button" to="/">Back to overview</Link>
  </main>
);

export default function App() {
  return (
    <div className="app">
      <header>
        <Link to="/" className="brand">WildlifeGuard</Link>
        <nav>
          <Link to="/ranger/patrol">Patrols</Link>
          <Link to="/ranger/incidents">Incidents</Link>
          <Link to="/ranger/alerts">Conflict Alerts</Link>
          <Link to="/manager/analytics">Manager</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Placeholder title="Smart wildlife conservation" description="The shared application foundation is ready for UC-A through UC-D." />} />
        <Route path="/ranger" element={<AssignedPatrolPage />} />
        <Route path="/ranger/patrol" element={<AssignedPatrolPage />} />
        <Route path="/ranger/patrol/route/:routeId" element={<PatrolRoutePage />} />
        <Route path="/ranger/patrol/active/:sessionId" element={<ActivePatrolPage />} />
        <Route path="/ranger/patrol/summary/:sessionId" element={<PatrolCompletionPage />} />

        <Route path="/ranger/incidents" element={<IncidentHistoryPage />} />
        <Route path="/ranger/incidents/new" element={<ReportIncidentPage />} />
        <Route path="/ranger/incidents/:incidentId/edit" element={<EditIncidentPage />} />

        <Route path="/ranger/alerts" element={<ConflictAlertsPage />} />
        <Route path="/ranger/alerts/:alertId" element={<ConflictAlertDetailPage />} />

        <Route path="/manager" element={<Placeholder title="Park manager" description="Central online manager route group." />} />
        <Route path="/manager/analytics" element={<AnalyticsPage />} />
        <Route path="/dev/collar-simulator" element={<ConflictAlertsPage />} />
        <Route path="/community-report" element={<ConflictAlertsPage />} />
        <Route path="*" element={<Placeholder title="Page not found" description="The requested route is not registered." />} />
      </Routes>
    </div>
  );
}
