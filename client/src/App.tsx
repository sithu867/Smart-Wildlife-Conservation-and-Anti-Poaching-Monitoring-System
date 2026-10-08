import { Link, Route, Routes } from 'react-router-dom';
import './styles.css';
import { Navbar } from './shared/components/Navbar';
import { HomePage } from './features/home/HomePage';
import { AssignedPatrolPage } from './features/patrols/pages/AssignedPatrolPage';
import { PatrolRoutePage } from './features/patrols/pages/PatrolRoutePage';
import { ActivePatrolPage } from './features/patrols/pages/ActivePatrolPage';
import { PatrolCompletionPage } from './features/patrols/pages/PatrolCompletionPage';
import { ReportIncidentPage } from './features/incidents/pages/ReportIncidentPage';
import { IncidentHistoryPage } from './features/incidents/pages/IncidentHistoryPage';
import { EditIncidentPage } from './features/incidents/pages/EditIncidentPage';
import { ConflictAlertsPage } from './features/conflict-alerts/pages/ConflictAlertsPage';
import { ConflictAlertDetailPage } from './features/conflict-alerts/pages/ConflictAlertDetailPage';
import { CollarMonitoringPage } from './features/collars/pages/CollarMonitoringPage';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';

const Placeholder = ({ title, description }: { title: string; description: string }) => (
  <main className="page px-4 py-8 max-w-xl mx-auto text-slate-100">
    <p className="eyebrow text-xs font-bold uppercase tracking-widest text-emerald-400">WildlifeGuard foundation</p>
    <h1 className="text-2xl font-black text-white mt-1 mb-2">{title}</h1>
    <p className="text-sm text-slate-300 mb-4">{description}</p>
    <Link className="inline-block py-2.5 px-4 bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs" to="/">Back to overview</Link>
  </main>
);

export default function App() {
  return (
    <div className="app min-h-screen pb-24 md:pb-8 bg-[#0b1320]">
      <Navbar />

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/login" element={<HomePage />} />

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

        <Route path="/ranger/collars" element={<CollarMonitoringPage />} />
        <Route path="/manager/collars" element={<CollarMonitoringPage />} />

        <Route path="/manager" element={<Placeholder title="Park manager" description="Central online manager route group." />} />
        <Route path="/manager/analytics" element={<AnalyticsPage />} />
        <Route path="/dev/collar-simulator" element={<CollarMonitoringPage />} />
        <Route path="/community-report" element={<ConflictAlertsPage />} />
        <Route path="*" element={<Placeholder title="Page not found" description="The requested route is not registered." />} />
      </Routes>
    </div>
  );
}
