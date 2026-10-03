import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatrol } from '../hooks/usePatrol';
import { PatrolCard } from '../components/PatrolCard';
import { SyncStatusIndicator } from '../components/SyncStatus';

export const AssignedPatrolPage: React.FC = () => {
  const navigate = useNavigate();
  const { assignment, session, loading, error, startPatrol } = usePatrol();

  const handleStartPatrol = async () => {
    try {
      const activeSess = await startPatrol();
      navigate(`/ranger/patrol/active/${activeSess._id}`);
    } catch (err) {
      console.error('Failed to start patrol:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-slate-300 gap-3">
        <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Retrieving assigned patrol route...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto my-8 p-6 bg-slate-900 border border-slate-800 rounded-2xl text-slate-100">
        <h2 className="text-lg font-bold text-rose-400 mb-2">Error Loading Assignment</h2>
        <p className="text-sm text-slate-300">{error}</p>
      </div>
    );
  }

  const isSessionActive = session && session.status === 'ACTIVE';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 text-slate-100 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400">Ranger Patrol Workspace</span>
          <h1 className="text-2xl font-black text-white mt-1">My Assigned Patrol</h1>
        </div>
        <SyncStatusIndicator />
      </div>

      {isSessionActive && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 p-4 rounded-2xl flex items-center justify-between shadow-lg animate-pulse">
          <div>
            <h3 className="font-bold text-emerald-300 text-sm">Active Patrol In Progress</h3>
            <p className="text-xs text-emerald-200 mt-0.5">GPS tracking is actively recording your route.</p>
          </div>
          <button
            onClick={() => navigate(`/ranger/patrol/active/${session._id}`)}
            className="py-2 px-4 rounded-xl text-xs font-extrabold bg-emerald-400 text-slate-950 hover:bg-emerald-300 shadow-md"
          >
            Resume Screen
          </button>
        </div>
      )}

      {assignment ? (
        <PatrolCard
          assignment={assignment}
          activeSession={session}
          onStartPatrol={handleStartPatrol}
          onViewRoute={() => navigate(`/ranger/patrol/route/${assignment.patrolRoute._id}`)}
          onContinuePatrol={() => session && navigate(`/ranger/patrol/active/${session._id}`)}
        />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-300 flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-amber-400 font-bold text-xl">
            🛡️
          </div>
          <h2 className="text-lg font-bold text-white">No Patrol Currently Assigned</h2>
          <p className="text-sm text-slate-400 max-w-sm">
            You do not have an active patrol route assigned. Check back with your park administrator.
          </p>
        </div>
      )}
    </div>
  );
};
