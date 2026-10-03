import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { incidentApi } from '../api/incidentApi';
import type { ConservationIncident } from '../types/incident';
import { SyncStatusIndicator } from '../../patrols/components/SyncStatus';
import { SyncStatus } from '../../../shared/types/enums';

export const IncidentHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<ConservationIncident[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    incidentApi
      .getMyIncidents()
      .then(res => setIncidents(res))
      .catch(err => console.warn('Could not load incident history:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 text-slate-100 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-rose-400">Ranger Field Reports</span>
          <h1 className="text-2xl font-black text-white mt-1">My Incident Reports</h1>
        </div>
        <SyncStatusIndicator />
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => navigate('/ranger/incidents/new')}
          className="py-3 px-5 rounded-2xl font-extrabold bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs shadow-lg shadow-rose-500/20 active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <span>🚨</span>
          <span>Report New Incident</span>
        </button>

        <span className="text-xs font-extrabold bg-slate-900 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full">
          {incidents.length} Reported
        </span>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center text-slate-400 gap-3">
          <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-semibold">Retrieving your reported incidents...</p>
        </div>
      ) : incidents.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-300 flex flex-col items-center gap-3 shadow-xl">
          <div className="w-14 h-14 bg-slate-850 rounded-full flex items-center justify-center text-amber-400 font-bold text-2xl border border-slate-800">
            🛡️
          </div>
          <h2 className="text-lg font-bold text-white">No Incidents Logged Yet</h2>
          <p className="text-xs text-slate-400 max-w-xs">
            You have not submitted any field incident reports yet. Use the "Report New Incident" button to capture field threats.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {incidents.map(inc => {
            const isSynced = inc.syncStatus === SyncStatus.SYNCED;
            const photoUrl = inc.evidence?.[0]?.imageUrl;

            return (
              <div
                key={inc._id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 shadow-xl flex flex-col gap-3 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400">
                      {inc.incidentType}
                    </span>
                    <h3 className="text-base font-black text-white mt-0.5">
                      {inc.incidentType === 'OTHER' && inc.otherTypeDescription
                        ? inc.otherTypeDescription
                        : inc.incidentType.replace('_', ' ')}
                    </h3>
                  </div>

                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                      isSynced
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-950 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {isSynced ? '🟢 SYNCED' : '🟡 PENDING SYNC'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950 p-2.5 rounded-2xl border border-slate-800 text-slate-300">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-sans">Reported At</span>
                    <span>{new Date(inc.reportedAt).toLocaleDateString()} {new Date(inc.reportedAt).toLocaleTimeString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-sans">Coordinates</span>
                    <span className="text-emerald-400">
                      {inc.location.latitude.toFixed(4)}°, {inc.location.longitude.toFixed(4)}°
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-200 italic bg-slate-950 p-3 rounded-xl border border-slate-850">
                  "{inc.description}"
                </p>

                {photoUrl && (
                  <div className="mt-1">
                    <img
                      src={photoUrl}
                      alt="Captured Evidence"
                      className="w-full h-40 object-cover rounded-2xl border border-slate-800 shadow"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
