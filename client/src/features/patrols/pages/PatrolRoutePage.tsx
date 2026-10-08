import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patrolApi } from '../api/patrolApi';
import type { PatrolRoute } from '../types/patrol';
import { PatrolMap } from '../components/PatrolMap';
import { usePatrol } from '../hooks/usePatrol';

export const PatrolRoutePage: React.FC = () => {
  const { routeId } = useParams<{ routeId: string }>();
  const navigate = useNavigate();
  const { assignment, session, startPatrol } = usePatrol();
  const [route, setRoute] = useState<PatrolRoute | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<boolean>(false);

  useEffect(() => {
    if (!routeId) return;
    setLoading(true);
    patrolApi
      .getRouteById(routeId)
      .then(res => {
        setRoute(res);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to fetch route map');
        setLoading(false);
      });
  }, [routeId]);

  const handleStartFromRoutePage = async () => {
    setStarting(true);
    try {
      const activeSess = await startPatrol(assignment?._id);
      navigate(`/ranger/patrol/active/${activeSess._id}`);
    } catch (err) {
      console.error('Failed to start patrol from route page:', err);
    } finally {
      setStarting(false);
    }
  };

  const handleResumeFromRoutePage = () => {
    if (session) {
      navigate(`/ranger/patrol/active/${session._id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-slate-300 gap-3">
        <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Loading route geometry...</p>
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="max-w-md mx-auto my-8 p-6 bg-slate-900 border border-slate-800 rounded-2xl text-slate-100">
        <h2 className="text-lg font-bold text-rose-400 mb-2">Route Map Error</h2>
        <p className="text-sm text-slate-300">{error || 'Route not found'}</p>
        <button
          onClick={() => navigate('/ranger/patrol')}
          className="mt-4 py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold"
        >
          Back to My Patrol
        </button>
      </div>
    );
  }

  const parkName = typeof route.park === 'object' && route.park ? route.park.name : 'Yala National Park';
  const isRouteActive = Boolean(
    session &&
      (session.status === 'ACTIVE' || session.status === 'PAUSED') &&
      (session.patrolRoute?._id === route._id || session.patrolRoute?.name === route.name)
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 text-slate-100 flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/ranger/patrol')}
          className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5 bg-slate-800 py-2 px-3.5 rounded-xl border border-slate-700 active:scale-95 transition-all"
        >
          ← Back to Assigned Patrols
        </button>
        <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">{parkName}</span>
      </div>

      {/* Route Title & Details Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">{route.name}</h1>
          <p className="text-sm text-slate-300 mt-1 max-w-xl">{route.description}</p>
        </div>

        {/* Action Button on Route Detail Page */}
        <div className="w-full sm:w-auto">
          {isRouteActive ? (
            <button
              type="button"
              onClick={handleResumeFromRoutePage}
              className="w-full sm:w-auto py-3.5 px-6 rounded-2xl font-black text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-lg shadow-emerald-400/20 active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
            >
              <span>Resume Active Patrol</span>
              <span>→</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartFromRoutePage}
              disabled={starting}
              className="w-full sm:w-auto py-3.5 px-6 rounded-2xl font-black text-slate-950 bg-amber-400 hover:bg-amber-300 shadow-lg shadow-amber-400/20 active:scale-95 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{starting ? 'Starting Patrol...' : 'Start Patrol'}</span>
              <span>→</span>
            </button>
          )}
        </div>
      </div>

      {/* Statistics Bar */}
      <div className="grid grid-cols-2 gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl text-xs shadow-md">
        <div>
          <span className="text-slate-400 font-medium">Total Distance</span>
          <p className="text-xl font-black text-emerald-400 mt-0.5">{route.distanceKm} km</p>
        </div>
        <div>
          <span className="text-slate-400 font-medium">Estimated Duration</span>
          <p className="text-xl font-black text-amber-400 mt-0.5">{route.estimatedDurationHours} hours</p>
        </div>
      </div>

      {/* Interactive Map Section */}
      <div className="flex flex-col gap-2.5">
        <h3 className="text-sm font-bold text-slate-200">Route Geometry & Boundary Map</h3>
        <PatrolMap route={route} height="460px" />
      </div>
    </div>
  );
};
