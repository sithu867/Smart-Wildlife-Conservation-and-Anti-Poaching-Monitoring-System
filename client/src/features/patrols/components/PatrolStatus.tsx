import React from 'react';
import { PatrolStatus as PatrolStatusEnum, SyncStatus as SyncStatusEnum } from '../../../shared/types/enums';

interface PatrolStatusProps {
  status: PatrolStatusEnum;
  syncStatus?: SyncStatusEnum;
}

export const PatrolStatusBadge: React.FC<PatrolStatusProps> = ({ status, syncStatus }) => {
  const getStatusStyle = () => {
    switch (status) {
      case PatrolStatusEnum.ACTIVE:
        return 'bg-emerald-700 text-white animate-pulse';
      case PatrolStatusEnum.COMPLETED:
        return 'bg-slate-700 text-slate-100';
      case PatrolStatusEnum.ASSIGNED:
      default:
        return 'bg-amber-600 text-white';
    }
  };

  const getSyncBadge = () => {
    if (!syncStatus) return null;
    switch (syncStatus) {
      case SyncStatusEnum.SYNCED:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-600/40">
            🟢 Synced
          </span>
        );
      case SyncStatusEnum.SYNCING:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-300 border border-blue-600/40 animate-pulse">
            🔄 Syncing...
          </span>
        );
      case SyncStatusEnum.FAILED:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-300 border border-rose-600/40">
            🟠 Sync Failed (Retrying)
          </span>
        );
      case SyncStatusEnum.PENDING:
      case SyncStatusEnum.LOCAL:
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-600/40">
            🟡 Saved Locally (Pending Sync)
          </span>
        );
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusStyle()}`}>
        {status}
      </span>
      {getSyncBadge()}
    </div>
  );
};
