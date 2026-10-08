import React from 'react';
import type { PatrolAssignment, PatrolSession } from '../types/patrol';
import { PatrolStatusBadge } from './PatrolStatus';
import { PatrolStatus } from '../../../shared/types/enums';

interface PatrolCardProps {
  assignment: PatrolAssignment;
  activeSession?: PatrolSession | null;
  isAnotherPatrolActive?: boolean;
  onStartPatrol: () => void;
  onViewRoute: () => void;
  onContinuePatrol?: () => void;
}

export const PatrolCard: React.FC<PatrolCardProps> = ({
  assignment,
  activeSession,
  isAnotherPatrolActive = false,
  onStartPatrol,
  onViewRoute,
  onContinuePatrol
}) => {
  const route = assignment.patrolRoute;
  const parkName = typeof route.park === 'object' && route.park ? route.park.name : 'Yala National Park';
  const isActive = Boolean(activeSession && (activeSession.status === PatrolStatus.ACTIVE || activeSession.status === PatrolStatus.PAUSED));

  return (
    <div className={`bg-slate-900 border rounded-2xl p-5 shadow-xl text-slate-100 flex flex-col gap-4 transition-all ${
      isActive ? 'border-emerald-500/60 ring-2 ring-emerald-500/30' : 'border-slate-800'
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">{parkName}</span>
          <h2 className="text-xl font-bold text-white mt-0.5">{route.name}</h2>
        </div>
        <PatrolStatusBadge status={isActive ? (activeSession?.status ?? PatrolStatus.ACTIVE) : assignment.status} />
      </div>

      <p className="text-sm text-slate-300 line-clamp-2 leading-relaxed">{route.description}</p>

      <div className="grid grid-cols-2 gap-3 py-2 border-y border-slate-800 text-xs">
        <div className="flex flex-col">
          <span className="text-slate-400">Route Distance</span>
          <span className="text-base font-bold text-emerald-400">{route.distanceKm} km</span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-400">Estimated Duration</span>
          <span className="text-base font-bold text-amber-400">{route.estimatedDurationHours} hrs</span>
        </div>
      </div>

      {assignment.notes && (
        <p className="text-xs text-slate-400 italic bg-slate-950 p-2.5 rounded-lg border border-slate-800">
          Note: {assignment.notes}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-1">
        <button
          type="button"
          onClick={onViewRoute}
          className="w-full sm:w-1/2 py-3 px-4 rounded-xl font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] transition-all text-center text-sm border border-slate-700"
        >
          View Route Map
        </button>

        {isActive ? (
          <button
            type="button"
            onClick={onContinuePatrol}
            className="w-full sm:w-1/2 py-3 px-4 rounded-xl font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.98] transition-all text-center text-sm shadow-lg shadow-emerald-400/20"
          >
            Resume Active Patrol →
          </button>
        ) : isAnotherPatrolActive ? (
          <button
            type="button"
            disabled
            title="Finish your currently active patrol session before starting another patrol."
            className="w-full sm:w-1/2 py-3 px-4 rounded-xl font-bold text-slate-400 bg-slate-800 border border-slate-700 cursor-not-allowed opacity-60 text-center text-xs"
          >
            Finish Active Patrol First
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartPatrol}
            className="w-full sm:w-1/2 py-3 px-4 rounded-xl font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] transition-all text-center text-sm shadow-lg shadow-amber-400/20"
          >
            Start Patrol
          </button>
        )}
      </div>
    </div>
  );
};
