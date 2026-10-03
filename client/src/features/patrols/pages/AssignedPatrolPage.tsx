import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatrol } from '../hooks/usePatrol';
import { patrolApi } from '../api/patrolApi';
import { PatrolCard } from '../components/PatrolCard';
import { SyncStatusIndicator } from '../components/SyncStatus';
import type { PatrolSession } from '../types/patrol';

export const AssignedPatrolPage: React.FC = () => {
  const navigate = useNavigate();
  const { assignment, session, loading, error, startPatrol } = usePatrol();
  const [history, setHistory] = useState<PatrolSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);

  useEffect(() => {
    patrolApi
      .getPatrolHistory()
      .then(res => {
        setHistory(res);
      })
      .catch(err => {
        console.warn('Could not load patrol history:', err);
      })
      .finally(() => {
        setLoadingHistory(false);
      });
  }, []);

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
  const completedPatrols = history.filter(h => h.status === 'COMPLETED');

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
          <h2 className="text-lg font-bold text-white">No Active Patrol Assignment</h2>
          <p className="text-sm text-slate-400 max-w-sm">
            You do not have an active patrol route assigned. Check back with your park administrator.
          </p>
        </div>
      )}

      {/* Finished Ranger Patrols History */}
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>📋</span> Finished Ranger Patrols
          </h2>
          <span className="text-xs font-extrabold bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
            {completedPatrols.length} Total
          </span>
        </div>

        {loadingHistory ? (
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">
            Loading finished patrols history...
          </div>
        ) : completedPatrols.length === 0 ? (
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">
            No completed ranger patrols logged yet. Start and complete a patrol to view it here.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {completedPatrols.map(p => {
              const waypointsCount = p.waypoints?.length || 0;
              const isSynced = p.syncStatus === 'SYNCED';
              return (
                <div
                  key={p._id}
                  className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 transition-all shadow-md flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                        {p.patrolRoute?.name || 'Northern Boundary Patrol'}
                      </span>
                      <h3 className="text-sm font-black text-white mt-0.5">
                        Completed on {new Date(p.endTime || p.startTime).toLocaleDateString()} at {new Date(p.endTime || p.startTime).toLocaleTimeString()}
                      </h3>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                        isSynced
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                          : 'bg-amber-950 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {isSynced ? '🟢 SYNCED' : '🟡 PENDING SYNC'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px]">Distance</span>
                      <p className="font-bold text-amber-400">{p.totalDistanceKm || 0} km</p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px]">Duration</span>
                      <p className="font-bold font-mono text-emerald-400">
                        {Math.floor((p.durationSeconds || 0) / 60)}m {(p.durationSeconds || 0) % 60}s
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px]">Waypoints</span>
                      <p className="font-bold text-white">{waypointsCount} pts</p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/ranger/patrol/summary/${p._id}`)}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all text-center"
                  >
                    View Complete Patrol Details & Map Summary →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

