import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patrolApi } from '../api/patrolApi';
import type { PatrolSession } from '../types/patrol';
import { SyncStatusIndicator } from '../components/SyncStatus';
import { PatrolMap } from '../components/PatrolMap';
import { SyncStatus } from '../../../shared/types/enums';

export const PatrolCompletionPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<PatrolSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    patrolApi
      .getSessionById(sessionId)
      .then(res => {
        setSession(res);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to retrieve completed session');
        setLoading(false);
      });
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-slate-300 gap-3">
        <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Generating patrol completion summary...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="max-w-md mx-auto my-8 p-6 bg-slate-900 border border-slate-800 rounded-2xl text-slate-100">
        <h2 className="text-lg font-bold text-rose-400 mb-2">Summary Error</h2>
        <p className="text-sm text-slate-300">{error || 'Session summary not found'}</p>
        <button
          onClick={() => navigate('/ranger/patrol')}
          className="mt-4 py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold"
        >
          Back to My Patrol
        </button>
      </div>
    );
  }

  const route = session.patrolRoute;
  const parkName = typeof route?.park === 'object' && route?.park ? route.park.name : 'Serengeti Northern Sector';
  const isSynced = session.syncStatus === SyncStatus.SYNCED;

  const formatSeconds = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
  };

  const waypoints = session.waypoints || [];
  const manualCount = waypoints.filter(w => w.source === 'MANUAL').length;
  const gpsCount = waypoints.filter(w => w.source === 'GPS').length;

  return (
    <div className="max-w-md mx-auto px-4 py-6 text-slate-100 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-400">Patrol Summary</span>
        <SyncStatusIndicator />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex flex-col items-center text-center gap-2 border-b border-slate-800 pb-5">
          <div className={`w-14 h-14 border rounded-full flex items-center justify-center text-2xl shadow-lg ${
            isSynced ? 'bg-emerald-950 border-emerald-500/40 text-emerald-400' : 'bg-amber-950 border-amber-500/40 text-amber-400'
          }`}>
            {isSynced ? '✓' : '💾'}
          </div>
          <h1 className="text-2xl font-black text-white mt-1">
            {isSynced ? 'Patrol Completed' : 'Patrol Saved Locally'}
          </h1>
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">{parkName}</span>
          <p className="text-base font-bold text-slate-200">{route?.name || 'Northern Boundary Patrol'}</p>
        </div>

        {!isSynced && (
          <div className="bg-amber-950/60 border border-amber-500/30 p-3.5 rounded-2xl text-xs text-amber-300 flex items-start gap-2">
            <span className="text-base">🟡</span>
            <div>
              <p className="font-bold text-amber-200">Pending Synchronization</p>
              <p className="mt-0.5 opacity-90">This patrol is saved safely on your device. It will automatically synchronize when connectivity returns.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
            <span className="text-slate-400">Total Duration</span>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
              {formatSeconds(session.durationSeconds || 0)}
            </p>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
            <span className="text-slate-400">Distance Covered</span>
            <p className="text-xl font-bold text-amber-400 mt-0.5">
              {session.totalDistanceKm || 0} km
            </p>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col gap-2.5 text-xs">
          <div className="flex justify-between items-center border-b border-slate-900 pb-2">
            <span className="text-slate-400">Start Time</span>
            <span className="font-semibold text-slate-200">{new Date(session.startTime).toLocaleString()}</span>
          </div>

          <div className="flex justify-between items-center border-b border-slate-900 pb-2">
            <span className="text-slate-400">End Time</span>
            <span className="font-semibold text-slate-200">
              {session.endTime ? new Date(session.endTime).toLocaleString() : 'Just now'}
            </span>
          </div>

          <div className="flex justify-between items-center border-b border-slate-900 pb-2">
            <span className="text-slate-400">Waypoints Collected</span>
            <span className="font-bold text-emerald-400">
              {waypoints.length} total ({gpsCount} GPS, {manualCount} Manual)
            </span>
          </div>

          <div className="flex justify-between items-center pt-0.5">
            <span className="text-slate-400">Central Sync Status</span>
            {isSynced ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                🟢 SYNCED
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-500/40">
                🟡 PENDING SYNC
              </span>
            )}
          </div>
        </div>

        {/* Patrol Map View on Summary */}
        <div className="flex flex-col gap-2 mt-1">
          <span className="text-xs font-bold text-slate-300">Recorded Patrol Track & Waypoints</span>
          <PatrolMap route={route} waypoints={waypoints} height="240px" />
        </div>

        <button
          onClick={() => navigate('/ranger/patrol')}
          className="w-full py-4 rounded-2xl font-bold bg-emerald-400 text-slate-950 hover:bg-emerald-300 active:scale-[0.98] transition-all text-center text-sm shadow-xl shadow-emerald-400/20 mt-1"
        >
          Return to My Patrol
        </button>
      </div>
    </div>
  );
};

