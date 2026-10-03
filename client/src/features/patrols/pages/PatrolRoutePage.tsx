import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patrolApi } from '../api/patrolApi';
import type { PatrolRoute } from '../types/patrol';
import { PatrolMap } from '../components/PatrolMap';

export const PatrolRoutePage: React.FC = () => {
  const { routeId } = useParams<{ routeId: string }>();
  const navigate = useNavigate();
  const [route, setRoute] = useState<PatrolRoute | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  const parkName = typeof route.park === 'object' && route.park ? route.park.name : 'Serengeti Northern Sector';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 text-slate-100 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/ranger/patrol')}
          className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1 bg-slate-800 py-1.5 px-3 rounded-lg border border-slate-700"
        >
          ← Back
        </button>
        <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">{parkName}</span>
      </div>

      <div>
        <h1 className="text-2xl font-black text-white">{route.name}</h1>
        <p className="text-sm text-slate-300 mt-1">{route.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs">
        <div>
          <span className="text-slate-400">Total Distance</span>
          <p className="text-base font-bold text-emerald-400">{route.distanceKm} km</p>
        </div>
        <div>
          <span className="text-slate-400">Estimated Duration</span>
          <p className="text-base font-bold text-amber-400">{route.estimatedDurationHours} hours</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-slate-200">Route Geometry & Boundary Map</h3>
        <PatrolMap route={route} height="420px" />
      </div>
    </div>
  );
};
