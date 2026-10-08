import React from 'react';
import { Link } from 'react-router-dom';
import type { WildlifeConflictAlert } from '../types/conflictAlert';
import { AlertSeverityBadge } from './AlertSeverityBadge';
import { AlertStatusBadge } from './AlertStatusBadge';
import { AlertSource } from '../../../shared/types/enums';
import { AlertStatus } from '../../../shared/types/enums';

interface Props {
  alert: WildlifeConflictAlert;
  onDelete?: (alert: WildlifeConflictAlert) => void;
}

export const ConflictAlertCard: React.FC<Props> = ({ alert, onDelete }) => {
  const isUrgent = alert.severity === 'CRITICAL' || alert.severity === 'HIGH';
  const isReadOnly = alert.status === AlertStatus.RESOLVED || alert.status === AlertStatus.CANCELLED;

  const formattedTime = new Date(alert.createdAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div
      className={`card rounded-lg border p-4 shadow-sm transition-all hover:shadow-md ${
        isUrgent ? 'border-l-4 border-l-orange-500 bg-orange-50/20' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <AlertSeverityBadge severity={alert.severity} />
          <AlertStatusBadge status={alert.status} />
        </div>
        <span className="text-xs text-gray-500">{formattedTime}</span>
        {!isReadOnly && <Link to={`/ranger/alerts/${alert._id}`} className="text-xs text-emerald-700 underline">Edit</Link>}
        {onDelete && !isReadOnly && <button onClick={() => onDelete(alert)} className="text-xs text-red-700 underline">Delete</button>}
      </div>

      <h3 className="text-base font-bold text-white mb-1 uppercase tracking-wide">
        {alert.alertType.replace(/_/g, ' ')}
      </h3>

      <p className="text-sm text-slate-300 mb-3 line-clamp-2 leading-relaxed">{alert.description}</p>

      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 mb-3 bg-slate-950/70 p-2 rounded border border-slate-700">
        <div>
          <span className="font-semibold text-slate-400">Source: </span>
          <span className="font-mono text-slate-200">
            {alert.source === AlertSource.COLLAR
              ? `🛰️ Collar (${alert.animalId || 'Tracked'})`
              : `👥 Community (${alert.reporterName || 'Member'})`}
          </span>
        </div>
        <div>
          <span className="font-semibold text-slate-400">Location: </span>
          <span className="font-mono text-slate-200">
            {alert.location.latitude.toFixed(3)}, {alert.location.longitude.toFixed(3)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-500">
          {alert.responses?.length > 0
            ? `💬 ${alert.responses.length} response(s)`
            : 'No responses yet'}
        </span>
        <span className={`text-[10px] font-semibold ${alert.syncStatus === 'FAILED' ? 'text-red-600' : alert.syncStatus === 'PENDING' ? 'text-amber-600' : 'text-emerald-600'}`}>
          {alert.syncStatus === 'PENDING' ? 'PENDING SYNC' : alert.syncStatus === 'FAILED' ? 'SYNC FAILED' : 'SYNCED'}
        </span>
        <Link
          to={`/ranger/alerts/${alert._id}`}
          className="button button-secondary text-xs px-3 py-1.5 rounded"
        >
          View Alert Details →
        </Link>
      </div>
    </div>
  );
};
