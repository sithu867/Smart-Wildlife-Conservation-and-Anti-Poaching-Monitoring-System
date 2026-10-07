/**
 * UC-B READ (+ entry point for UPDATE and DELETE) - "My Incident Reports" (route /ranger/incidents).
 *
 * Lists the ranger's reports with sync status (Synced / Pending / Failed + Retry Sync), place name, photo and
 * description. Editable reports show Edit and Delete; locked ones show why. Deleting asks for a reason and offers
 * Undo; unsynced drafts can be discarded from the device.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { incidentApi } from '../api/incidentApi';
import type { ConservationIncident, IncidentDeletionReason } from '../types/incident';
import { SyncStatusIndicator } from '../../patrols/components/SyncStatus';
import { SyncStatus } from '../../../shared/types/enums';
import { ApiError } from '../../../shared/api/apiError';
import { EDIT_LOCK_MESSAGES, buildSubmitIssue } from '../utils/incidentFormIssues';
import { buildDeletePayload, incidentDisplayName } from '../utils/incidentEdit';
import { DeleteIncidentDialog } from '../components/DeleteIncidentDialog';
import { UndoToast } from '../components/UndoToast';
import { IncidentLocationLabel } from '../components/IncidentLocationLabel';
import { ValidationErrorDialog, type DialogOverrides, type ValidationIssue } from '../components/ValidationErrorDialog';

/** Router state passed by the edit page after it withdrew a report, so this page can offer Undo. */
export interface WithdrawnReportState {
  withdrawn?: { incidentId: string; label: string };
}

type DeleteTarget = { incident: ConservationIncident; mode: 'withdraw' | 'discard' };
type ErrorDialogState = { issues: ValidationIssue[]; overrides: DialogOverrides };

// Server answers after which the list on screen is out of date
const RELOAD_CODES = ['EDIT_CONFLICT', 'INCIDENT_LOCKED', 'INCIDENT_DELETED', 'INCIDENT_NOT_DELETED'];

/** The My Incident Reports page. */
export const IncidentHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [incidents, setIncidents] = useState<ConservationIncident[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [errorDialog, setErrorDialog] = useState<ErrorDialogState | null>(null);
  const [undo, setUndo] = useState<{ incidentId: string; label: string } | null>(
    () => (location.state as WithdrawnReportState | null)?.withdrawn ?? null
  );

  /** READ: loads the list (server reports + unsynced drafts on this device). */
  const fetchIncidents = () => {
    setLoading(true);
    incidentApi
      .getMyIncidents()
      .then(res => setIncidents(res))
      .catch(err => console.warn('Could not load incident history:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchIncidents();
    // Consume the one-time Undo offer from the edit page so a refresh doesn't show it again
    if ((location.state as WithdrawnReportState | null)?.withdrawn) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);

  const dismissUndo = useCallback(() => setUndo(null), []);
  const closeErrorDialog = useCallback(() => setErrorDialog(null), []);

  /** Explains a failed delete/undo; offers "Reload Reports" when the list on screen is out of date. */
  const showActionError = (err: unknown, action: 'delete' | 'restore') => {
    const issue = buildSubmitIssue(err, action, { description: '', otherDescription: '' });
    const code = err instanceof ApiError ? err.code : undefined;
    const overrides: DialogOverrides = {
      eyebrow: action === 'delete' ? 'Delete failed' : 'Undo failed',
      heading: action === 'delete' ? "We couldn't delete this report" : "We couldn't restore this report",
      intro: 'Nothing was changed.'
    };
    if (code && RELOAD_CODES.includes(code)) {
      overrides.primaryAction = {
        label: 'Reload Reports',
        onClick: () => {
          setErrorDialog(null);
          fetchIncidents();
        }
      };
    }
    setErrorDialog({ issues: [issue], overrides });
  };

  /** DELETE: withdraws a synced report (then offers Undo) or discards an unsynced draft from the device. */
  const handleConfirmDelete = async (reason?: IncidentDeletionReason, note?: string) => {
    if (!deleteTarget || isDeleting) return;
    const { incident, mode } = deleteTarget;
    setIsDeleting(true);
    try {
      if (mode === 'discard') {
        await incidentApi.discardLocalDraft(incident.clientIncidentId || incident._id);
      } else {
        await incidentApi.deleteIncident(incident._id, buildDeletePayload(incident, reason!, note));
        setUndo({ incidentId: incident._id, label: incidentDisplayName(incident) });
      }
      setIncidents(prev => prev.filter(item => item._id !== incident._id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteTarget(null);
      showActionError(err, 'delete');
    } finally {
      setIsDeleting(false);
    }
  };

  /** Undo of a delete: restores the report and reloads the list. */
  const handleUndo = async () => {
    if (!undo) return;
    try {
      await incidentApi.restoreIncident(undo.incidentId);
      setUndo(null);
      fetchIncidents();
    } catch (err) {
      setUndo(null);
      showActionError(err, 'restore');
    }
  };

  /** "Retry Sync": sends a pending/failed offline report now. */
  const handleManualRetry = async (inc: ConservationIncident) => {
    const idToRetry = inc.clientIncidentId || inc._id;
    if (!idToRetry) return;

    setRetryingId(idToRetry);
    setSyncError(null);

    try {
      await incidentApi.retrySyncIncident(idToRetry);
      fetchIncidents();
    } catch (err) {
      setSyncError(
        err instanceof Error
          ? err.message
          : 'Synchronization retry failed. Incident remains safely stored locally.'
      );
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 text-slate-100 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-rose-400">Ranger Field Reports</span>
          <h1 className="text-2xl font-black text-white mt-1">My Incident Reports</h1>
        </div>
        <SyncStatusIndicator />
      </div>

      {syncError && (
        <div className="p-3 bg-rose-950/90 border border-rose-700/80 rounded-2xl text-xs text-rose-200 font-semibold flex items-center gap-2">
          <span>⚠️</span>
          <span>{syncError}</span>
        </div>
      )}

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
            const isFailed = inc.syncStatus === SyncStatus.FAILED;
            const photoUrl = inc.evidence?.[0]?.imageUrl;
            const targetId = inc.clientIncidentId || inc._id;

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

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                        isSynced
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                          : isFailed
                          ? 'bg-rose-950 text-rose-300 border-rose-500/40'
                          : 'bg-amber-950 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {isSynced ? '🟢 SYNCED' : isFailed ? '🔴 SYNC FAILED' : '🟡 PENDING SYNC'}
                    </span>

                    {!isSynced && (
                      <button
                        type="button"
                        onClick={() => handleManualRetry(inc)}
                        disabled={retryingId === targetId}
                        className="py-1 px-2.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-[10px] font-extrabold shadow disabled:opacity-50"
                      >
                        {retryingId === targetId ? 'Syncing...' : 'Retry Sync 🔄'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950 p-2.5 rounded-2xl border border-slate-800 text-slate-300">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-sans">Reported At</span>
                    <span>{new Date(inc.reportedAt).toLocaleDateString()} {new Date(inc.reportedAt).toLocaleTimeString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-sans">
                      Location ({inc.location?.source || 'GPS'})
                    </span>
                    <IncidentLocationLabel location={inc.location} />
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

                {isSynced && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] text-slate-500">
                      {inc.editCount ? `✏️ Edited ${inc.editCount}× · last ${new Date(inc.lastEditedAt ?? inc.reportedAt).toLocaleString()}` : ''}
                    </span>
                    {inc.canEdit === false ? (
                      <span
                        className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-slate-950 border border-slate-700 text-slate-400"
                        title={inc.editLockedReason ? EDIT_LOCK_MESSAGES[inc.editLockedReason].message : undefined}
                      >
                        🔒 Locked{inc.editLockedReason ? ` · ${EDIT_LOCK_MESSAGES[inc.editLockedReason].short}` : ''}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {inc.canDelete !== false && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ incident: inc, mode: 'withdraw' })}
                            aria-label={`Delete ${incidentDisplayName(inc)} report`}
                            className="py-1.5 px-3 rounded-full bg-slate-800 hover:bg-rose-950 border border-slate-700 hover:border-rose-500/50 text-rose-300 text-[11px] font-extrabold"
                          >
                            🗑️ Delete
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate(`/ranger/incidents/${inc._id}/edit`)}
                          className="py-1.5 px-3.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-extrabold shadow"
                        >
                          ✏️ Edit Report
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!isSynced && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ incident: inc, mode: 'discard' })}
                      className="py-1.5 px-3 rounded-full bg-slate-800 hover:bg-rose-950 border border-slate-700 hover:border-rose-500/50 text-rose-300 text-[11px] font-extrabold"
                    >
                      🗑️ Discard Draft
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {/* Required attribution for place names from OpenStreetMap (ODbL) */}
          <p className="text-[10px] text-slate-500 text-center">Place names © OpenStreetMap contributors</p>
        </div>
      )}

      {deleteTarget && (
        <DeleteIncidentDialog
          incident={deleteTarget.incident}
          mode={deleteTarget.mode}
          isWorking={isDeleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {errorDialog && (
        <ValidationErrorDialog variant="submit" issues={errorDialog.issues} onClose={closeErrorDialog} {...errorDialog.overrides} />
      )}

      {undo && <UndoToast message={`"${undo.label}" report deleted`} onUndo={handleUndo} onDismiss={dismissUndo} />}
    </div>
  );
};
