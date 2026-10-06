import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePatrol } from '../hooks/usePatrol';
import { GPSStatus } from '../components/GPSStatus';
import { PatrolMap } from '../components/PatrolMap';
import { WaypointFormModal } from '../components/WaypointForm';
import { SyncStatusIndicator } from '../components/SyncStatus';

export const ActivePatrolPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const {
    session,
    loading,
    error,
    currentLocation,
    gpsState,
    gpsErrorMsg,
    formattedElapsedTime,
    pausePatrol,
    resumePatrol,
    cancelPatrol,
    addManualWaypoint,
    completePatrol
  } = usePatrol(sessionId);

  const [isWaypointModalOpen, setIsWaypointModalOpen] = useState<boolean>(false);
  const [isCompleting, setIsCompleting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [completeConfirmModal, setCompleteConfirmModal] = useState<boolean>(false);
  const [cancelConfirmModal, setCancelConfirmModal] = useState<boolean>(false);

  const isPaused = session?.status === 'PAUSED';

  const handleConfirmAddWaypoint = async (note: string, customLat?: number, customLng?: number) => {
    await addManualWaypoint(note, customLat, customLng);
    setIsWaypointModalOpen(false);
  };

  const handleTogglePause = async () => {
    try {
      if (isPaused) {
        await resumePatrol();
      } else {
        await pausePatrol();
      }
    } catch (err) {
      console.error('Failed to toggle pause:', err);
    }
  };

  const handleConfirmEndPatrol = async () => {
    setIsCompleting(true);
    try {
      const completed = await completePatrol();
      navigate(`/ranger/patrol/summary/${completed._id}`);
    } catch (err) {
      console.error('Failed to end patrol:', err);
      setIsCompleting(false);
    }
  };

  const handleConfirmCancelPatrol = async () => {
    setIsCancelling(true);
    try {
      await cancelPatrol(cancelReason);
      navigate('/ranger/patrol');
    } catch (err) {
      console.error('Failed to cancel patrol:', err);
      setIsCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-slate-300 gap-3">
        <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Initializing field tracking session...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="max-w-md mx-auto my-8 p-6 bg-slate-900 border border-slate-800 rounded-2xl text-slate-100">
        <h2 className="text-lg font-bold text-rose-400 mb-2">Patrol Session Error</h2>
        <p className="text-sm text-slate-300">{error || 'Active patrol session not found'}</p>
        <button
          onClick={() => navigate('/ranger/patrol')}
          className="mt-4 py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold"
        >
          Back to My Patrol
        </button>
      </div>
    );
  }

  const waypoints = session.waypoints || [];
  const route = session.patrolRoute;

  return (
    <div className="max-w-md mx-auto px-4 py-4 text-slate-100 flex flex-col gap-4">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 relative">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPaused ? 'bg-amber-400 opacity-75' : 'bg-emerald-400 opacity-75'}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
          </span>
          <h1 className="text-lg font-extrabold text-white uppercase tracking-wider">
            {isPaused ? 'PAUSED PATROL' : 'ACTIVE PATROL'}
          </h1>
        </div>
        <SyncStatusIndicator />
      </div>

      {/* Primary Metrics Dashboard */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-emerald-500/30 rounded-2xl p-5 shadow-2xl flex flex-col gap-3">
        <div className="flex items-baseline justify-between border-b border-slate-800/80 pb-3">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Elapsed Time {isPaused && '(Paused)'}
            </span>
            <div className={`text-3xl font-black font-mono tracking-wider ${isPaused ? 'text-amber-400' : 'text-emerald-400'}`}>
              {formattedElapsedTime}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Waypoints Logged</span>
            <div className="text-2xl font-black text-amber-400">
              {waypoints.length} <span className="text-xs font-normal text-slate-400">pts</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-slate-400">Distance Tracked</span>
            <p className="font-bold text-white text-sm">{session.totalDistanceKm || 0} km</p>
          </div>
          <div>
            <span className="text-slate-400">Assigned Route</span>
            <p className="font-bold text-white text-sm truncate">{route?.name || 'Boundary Patrol'}</p>
          </div>
        </div>

        {/* Informational Guidance Box on GPS Tracklogging */}
        <div className="bg-slate-950/90 border border-slate-800/80 p-2.5 rounded-xl text-[11px] text-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-400">📡</span>
            <div>
              <span className="font-bold text-white block">Auto GPS Tracklog Active</span>
              <span className="text-[10px] text-slate-400">Records a GPS position fix automatically every 10s.</span>
            </div>
          </div>
          <span className="text-[10px] font-bold bg-amber-400/10 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/30">
            Auto 10s
          </span>
        </div>
      </div>

      {/* GPS Signal Status Indicator */}
      <GPSStatus gpsState={gpsState} currentLocation={currentLocation} errorMsg={gpsErrorMsg} />

      {/* Live Map Tracking View */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-slate-300 font-bold px-1">
          <span>Live Field Tracking Map</span>
          <span className="text-amber-400 font-medium">Interactive Track</span>
        </div>
        <PatrolMap route={route} waypoints={waypoints} currentLocation={currentLocation} height="280px" />
      </div>

      {/* Primary Action Buttons Bar */}
      <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-slate-800">
        <div className="grid grid-cols-2 gap-2">
          {/* Pause / Resume Button */}
          <button
            onClick={handleTogglePause}
            className={`py-3 px-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs transition-all active:scale-[0.97] shadow-md ${
              isPaused
                ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300 shadow-emerald-400/20'
                : 'bg-amber-400 text-slate-950 hover:bg-amber-300 shadow-amber-400/20'
            }`}
          >
            <span className="text-base">{isPaused ? '▶️' : '⏸️'}</span>
            <span>{isPaused ? 'Resume GPS Tracking' : 'Pause Patrol'}</span>
          </button>

          {/* Add Manual Waypoint */}
          <button
            onClick={() => setIsWaypointModalOpen(true)}
            disabled={isPaused}
            className="py-3 px-3 rounded-2xl font-bold bg-slate-800 border border-slate-700 text-amber-300 hover:bg-slate-700 active:scale-[0.97] transition-all flex items-center justify-center gap-2 text-xs shadow-md disabled:opacity-50"
          >
            <span className="text-base">📍</span>
            <span>Manual Waypoint</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* Report Threat */}
          <button
            onClick={() => navigate(`/ranger/incidents/new?sessionId=${session._id}`)}
            className="py-3 px-2 rounded-2xl font-bold bg-rose-500 text-slate-950 hover:bg-rose-400 active:scale-[0.97] transition-all flex flex-col items-center justify-center gap-1 shadow-lg shadow-rose-500/10 text-xs col-span-1"
          >
            <span className="text-base">🚨</span>
            <span>Report Threat</span>
          </button>

          {/* Cancel Patrol */}
          <button
            onClick={() => setCancelConfirmModal(true)}
            className="py-3 px-2 rounded-2xl font-bold bg-slate-900 border border-rose-900/60 text-rose-300 hover:bg-rose-950 hover:border-rose-700 active:scale-[0.97] transition-all flex flex-col items-center justify-center gap-1 text-xs shadow-md col-span-1"
          >
            <span className="text-base">❌</span>
            <span>Cancel Patrol</span>
          </button>

          {/* Complete Patrol */}
          <button
            onClick={() => setCompleteConfirmModal(true)}
            className="py-3 px-2 rounded-2xl font-bold bg-emerald-400 text-slate-950 hover:bg-emerald-300 active:scale-[0.97] transition-all flex flex-col items-center justify-center gap-1 text-xs shadow-lg shadow-emerald-400/20 col-span-1"
          >
            <span className="text-base">🏁</span>
            <span>End Patrol</span>
          </button>
        </div>
      </div>

      {/* Manual Waypoint Modal */}
      {isWaypointModalOpen && (
        <WaypointFormModal
          currentLocation={currentLocation}
          onSubmit={handleConfirmAddWaypoint}
          onCancel={() => setIsWaypointModalOpen(false)}
        />
      )}

      {/* Cancel Patrol Modal */}
      {cancelConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm text-slate-100 shadow-2xl flex flex-col gap-4">
            <h3 className="text-lg font-bold text-rose-400">Cancel Patrol Session?</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to cancel this patrol? State will be recorded as CANCELLED.
            </p>
            <div>
              <label className="text-[11px] font-bold text-slate-400 block mb-1">Reason for Cancellation (Optional)</label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. Extreme weather conditions, vehicle breakdown, emergency recall..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => setCancelConfirmModal(false)}
                className="w-1/2 py-3 px-4 rounded-xl font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmCancelPatrol}
                disabled={isCancelling}
                className="w-1/2 py-3 px-4 rounded-xl font-bold bg-rose-500 text-slate-950 hover:bg-rose-400 text-xs shadow-lg shadow-rose-500/20 disabled:opacity-50"
              >
                {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Patrol Confirmation Modal */}
      {completeConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm text-slate-100 shadow-2xl flex flex-col gap-4">
            <h3 className="text-lg font-bold text-white">Complete Patrol Session?</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Ending the patrol will stop GPS tracking, calculate your final route summary, and finalize your recorded waypoints ({waypoints.length}).
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setCompleteConfirmModal(false)}
                className="w-1/2 py-3 px-4 rounded-xl font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEndPatrol}
                disabled={isCompleting}
                className="w-1/2 py-3 px-4 rounded-xl font-bold bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-xs shadow-lg shadow-emerald-400/20 disabled:opacity-50"
              >
                {isCompleting ? 'Finishing...' : 'Confirm End'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
