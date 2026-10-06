import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatrol } from '../hooks/usePatrol';
import { patrolApi } from '../api/patrolApi';
import { PatrolCard } from '../components/PatrolCard';
import { SyncStatusIndicator } from '../components/SyncStatus';
import type { PatrolSession, PatrolAssignment } from '../types/patrol';

export const AssignedPatrolPage: React.FC = () => {
  const navigate = useNavigate();
  const { assignment, assignments, session, loading, error, selectAssignment, startPatrol, resumePatrol } = usePatrol();
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

  const handleStartSelectedPatrol = async (targetAssignmentId: string) => {
    try {
      const activeSess = await startPatrol(targetAssignmentId);
      navigate(`/ranger/patrol/active/${activeSess._id}`);
    } catch (err) {
      console.error('Failed to start patrol:', err);
    }
  };

  const handleResumePatrol = async () => {
    if (!session) return;
    try {
      if (session.status === 'PAUSED') {
        await resumePatrol();
      }
      navigate(`/ranger/patrol/active/${session._id}`);
    } catch (err) {
      console.error('Failed to resume patrol:', err);
      navigate(`/ranger/patrol/active/${session._id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-slate-300 gap-3">
        <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Retrieving assigned patrol routes...</p>
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

  const isSessionActive = session && (session.status === 'ACTIVE' || session.status === 'PAUSED');
  const finishedPatrols = history.filter(h => h.status === 'COMPLETED' || h.status === 'CANCELLED');

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 text-slate-100 flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400">Ranger Field Workspace</span>
          <h1 className="text-2xl font-black text-white mt-1">My Assigned Patrol Routes</h1>
        </div>
        <SyncStatusIndicator />
      </div>

      {/* Active/Paused Session Notification Banner */}
      {isSessionActive && (
        <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-emerald-900/80 border border-emerald-500/50 p-4 rounded-2xl flex items-center justify-between shadow-xl animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📡</span>
            <div>
              <h3 className="font-extrabold text-emerald-300 text-sm flex items-center gap-2">
                <span>{session.status === 'PAUSED' ? 'Patrol Session Paused' : 'Active Patrol Session in Progress'}</span>
                <span className="text-[10px] bg-emerald-400 text-slate-950 font-black px-2 py-0.5 rounded-full uppercase">
                  {session.status}
                </span>
              </h3>
              <p className="text-xs text-emerald-200 mt-0.5">
                Route: {session.patrolRoute?.name || 'Northern Boundary Patrol'} • {session.waypoints?.length || 0} waypoints recorded
              </p>
            </div>
          </div>
          <button
            onClick={handleResumePatrol}
            className="py-2.5 px-4 rounded-xl text-xs font-black bg-emerald-400 text-slate-950 hover:bg-emerald-300 shadow-lg shadow-emerald-400/20 active:scale-95 transition-all"
          >
            {session.status === 'PAUSED' ? 'Resume Patrol' : 'Open Tracking Screen →'}
          </button>
        </div>
      )}

      {/* Available Assigned Routes Selection Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🗺️</span> Available Assigned Routes
          </h2>
          <span className="text-xs font-extrabold bg-slate-800 text-amber-400 px-3 py-1 rounded-full border border-slate-700">
            {assignments.length} Routes Assigned
          </span>
        </div>

        {assignments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assignments.map(assign => {
              const isSelected = assignment?._id === assign._id;
              return (
                <div
                  key={assign._id}
                  onClick={() => selectAssignment(assign._id)}
                  className={`cursor-pointer transition-all ${
                    isSelected ? 'ring-2 ring-amber-400 rounded-2xl scale-[1.01]' : 'opacity-90 hover:opacity-100'
                  }`}
                >
                  <PatrolCard
                    assignment={assign}
                    activeSession={session?.patrolAssignment === assign._id ? session : null}
                    onStartPatrol={() => handleStartSelectedPatrol(assign._id)}
                    onViewRoute={() => navigate(`/ranger/patrol/route/${assign.patrolRoute._id}`)}
                    onContinuePatrol={handleResumePatrol}
                  />
                </div>
              );
            })}
          </div>
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
      </div>

      {/* Finished / Completed Patrols History */}
      <div className="flex flex-col gap-4 mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>📋</span> Patrol History Log
          </h2>
          <span className="text-xs font-extrabold bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
            {finishedPatrols.length} Recorded
          </span>
        </div>

        {loadingHistory ? (
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">
            Loading patrol history...
          </div>
        ) : finishedPatrols.length === 0 ? (
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">
            No completed or cancelled ranger patrols logged yet. Start and complete a patrol to view it here.
          </div>
        ) : (
          <div className="max-h-[380px] overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 gap-3 scrollbar-thin scrollbar-thumb-slate-700">
            {finishedPatrols.map(p => {
              const waypointsCount = p.waypoints?.length || 0;
              const isSynced = p.syncStatus === 'SYNCED';
              const isCancelled = p.status === 'CANCELLED';
              return (
                <div
                  key={p._id}
                  className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 transition-all shadow-md flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                        {p.patrolRoute?.name || 'Boundary Patrol'}
                      </span>
                      <h3 className="text-xs font-black text-white mt-0.5">
                        {isCancelled ? 'Cancelled' : 'Completed'} on {new Date(p.endTime || p.startTime).toLocaleDateString()} at {new Date(p.endTime || p.startTime).toLocaleTimeString()}
                      </h3>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                        isCancelled
                          ? 'bg-rose-950 text-rose-300 border-rose-500/40'
                          : isSynced
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                          : 'bg-amber-950 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {isCancelled ? '🛑 CANCELLED' : isSynced ? '🟢 SYNCED' : '🟡 PENDING SYNC'}
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
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all text-center"
                  >
                    View Details & Map Summary →
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
