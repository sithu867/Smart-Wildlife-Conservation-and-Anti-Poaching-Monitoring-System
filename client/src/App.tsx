import { Link, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AssignedPatrolPage } from './features/patrols/pages/AssignedPatrolPage';
import { PatrolRoutePage } from './features/patrols/pages/PatrolRoutePage';
import { ActivePatrolPage } from './features/patrols/pages/ActivePatrolPage';
import { PatrolCompletionPage } from './features/patrols/pages/PatrolCompletionPage';

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
          <Link to="/ranger/patrol">Ranger</Link>
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

        <Route path="/ranger/incidents" element={<Placeholder title="Incidents" description="UC-B placeholder. Offline incident capture will be added here." />} />
        <Route path="/ranger/alerts" element={<Placeholder title="Conflict alerts" description="UC-C field-response placeholder." />} />
        <Route path="/manager" element={<Placeholder title="Park manager" description="Central online manager route group." />} />
        <Route path="/manager/analytics" element={<Placeholder title="Analytics" description="UC-D placeholder for synchronized conservation analytics." />} />
        <Route path="/dev/collar-simulator" element={<Placeholder title="Collar simulator" description="Development-only simulator placeholder." />} />
        <Route path="/community-report" element={<Placeholder title="Community report" description="Community report entry placeholder." />} />
        <Route path="*" element={<Placeholder title="Page not found" description="The requested route is not registered." />} />
      </Routes>
    </div>
  );
}
