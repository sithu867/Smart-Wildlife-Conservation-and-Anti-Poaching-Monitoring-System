import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { WildlifeConflictAlert, AddResponseInput, UpdateResponseInput, ConflictAuditEntry } from '../types/conflictAlert';
import { conflictAlertApi } from '../api/conflictAlertApi';
import { AlertSeverityBadge } from '../components/AlertSeverityBadge';
import { AlertStatusBadge } from '../components/AlertStatusBadge';
import { ConflictAlertMap } from '../components/ConflictAlertMap';
import { ConflictResponseForm } from '../components/ConflictResponseForm';
import { ResponseHistoryTimeline } from '../components/ResponseHistoryTimeline';
import { AlertStatus, AlertSource, AlertSeverity, ConflictAlertType, LocationSource, ResponseAction } from '../../../shared/types/enums';

export const ConflictAlertDetailPage: React.FC = () => {
  const { alertId } = useParams<{ alertId: string }>();

  const [alert, setAlert] = useState<WildlifeConflictAlert | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showResponseForm, setShowResponseForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolutionInput, setResolutionInput] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<ConflictAuditEntry[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editSeverity, setEditSeverity] = useState<AlertSeverity>(AlertSeverity.MEDIUM);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [editingResponse, setEditingResponse] = useState<any>(null);

  const fetchAlert = async () => {
    if (!alertId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await conflictAlertApi.getAlertById(alertId);
      setAlert(data);
      setHistory([]);
      void conflictAlertApi.getHistory(alertId).then(setHistory).catch(() => undefined);
    } catch (err: any) {
      console.error('Failed fetching alert details:', err);
      setError(err.message || 'Wildlife conflict alert not found.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => { e.preventDefault(); if (!alertId || editDescription.trim().length < 3) return; setIsSubmitting(true); try { const updated = await conflictAlertApi.updateAlert(alertId, { description: editDescription.trim(), severity: editSeverity }); setAlert(updated); setShowEdit(false); setFeedbackMessage(updated.syncStatus === 'PENDING' ? 'Alert edited locally; pending synchronization.' : 'Alert updated and synchronized.'); } catch (err: any) { setError(err.message); } finally { setIsSubmitting(false); } };
  const handleCancel = async (e: React.FormEvent) => { e.preventDefault(); if (!alertId || cancelReason.trim().length < 3) return; setIsSubmitting(true); try { const updated = await conflictAlertApi.cancelAlert(alertId, cancelReason.trim()); setAlert(updated); setShowCancel(false); setCancelReason(''); setFeedbackMessage(updated.syncStatus === 'PENDING' ? 'Alert cancelled locally; pending synchronization.' : 'Alert cancelled.'); } catch (err: any) { setError(err.message); } finally { setIsSubmitting(false); } };
  const handleDelete = async () => { if (!alertId || !window.confirm('Soft-delete this alert? It will be hidden from the normal list.')) return; try { await conflictAlertApi.deleteAlert(alertId, 'Deleted from alert detail'); setFeedbackMessage('Alert soft-deleted.'); } catch (err: any) { setError(err.message); } };
  const handleUpdateResponse = async (e: React.FormEvent) => { e.preventDefault(); if (!alertId || !editingResponse) return; try { const updated = await conflictAlertApi.updateResponse(alertId, editingResponse.responseId, { action: editingResponse.action, notes: editingResponse.notes, outcome: editingResponse.outcome }); setAlert(updated); setEditingResponse(null); setFeedbackMessage(updated.syncStatus === 'PENDING' ? 'Response edited locally; pending synchronization.' : 'Response updated.'); } catch (err: any) { setError(err.message); } };
  const handleDeleteResponse = async (response: any) => { if (!alertId || !window.confirm('Soft-delete this response?')) return; try { const updated = await conflictAlertApi.deleteResponse(alertId, response.responseId); setAlert(updated); setFeedbackMessage(updated.syncStatus === 'PENDING' ? 'Response deleted locally; pending synchronization.' : 'Response deleted.'); } catch (err: any) { setError(err.message); } };

  useEffect(() => {
    fetchAlert();
  }, [alertId]);

  const handleAcknowledge = async () => {
    if (!alertId) return;
    setIsSubmitting(true);
    setError(null);
    setFeedbackMessage(null);
    try {
      const updated = await conflictAlertApi.acknowledgeAlert(alertId);
      setAlert(updated);
      setFeedbackMessage(
        updated.syncStatus === 'PENDING'
          ? 'Alert acknowledged locally. Action queued for synchronization.'
          : 'Alert acknowledged and synchronized with central server.'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to acknowledge alert.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddResponse = async (input: AddResponseInput) => {
    if (!alertId) return;
    setIsSubmitting(true);
    setError(null);
    setFeedbackMessage(null);
    try {
      const updated = await conflictAlertApi.addResponse(alertId, input);
      setAlert(updated);
      setShowResponseForm(false);
      setFeedbackMessage(
        updated.syncStatus === 'PENDING'
          ? 'Response saved locally. Action queued for synchronization.'
          : input.markResolved
          ? 'Response recorded and alert resolved successfully on central server.'
          : 'Response recorded and synchronized with central server.'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to record response.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertId) return;
    if (!resolutionInput.trim() || resolutionInput.trim().length < 3) {
      setError('Please provide resolution summary notes (minimum 3 characters).');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFeedbackMessage(null);
    try {
      const updated = await conflictAlertApi.resolveAlert(alertId, {
        resolutionNotes: resolutionInput.trim()
      });
      setAlert(updated);
      setShowResolveModal(false);
      setResolutionInput('');
      setFeedbackMessage(
        updated.syncStatus === 'PENDING'
          ? 'Alert resolved locally — Pending synchronization.'
          : 'Alert successfully resolved and synchronized centrally.'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to resolve alert.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="page max-w-4xl mx-auto p-4 text-center py-12">
        <div className="inline-block animate-spin text-2xl mb-2">⏳</div>
        <p className="text-sm font-medium text-gray-600">Loading conflict alert details...</p>
      </main>
    );
  }

  if (error || !alert) {
    return (
      <main className="page max-w-4xl mx-auto p-4 space-y-4">
        <Link to="/ranger/alerts" className="text-xs text-emerald-700 font-medium hover:underline">
          ← Back to Conflict Alerts
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm">
          ⚠️ {error || 'Conflict alert not found.'}
        </div>
      </main>
    );
  }

  return (
    <main className="page max-w-4xl mx-auto p-4 space-y-5">
      {/* Navigation Breadcrumb */}
      <div>
        <Link to="/ranger/alerts" className="text-xs text-emerald-700 font-medium hover:underline flex items-center gap-1">
          ← Back to Conflict Alerts List
        </Link>
      </div>

      {feedbackMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span>ℹ️ {feedbackMessage}</span>
          <button onClick={() => setFeedbackMessage(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <AlertSeverityBadge severity={alert.severity} />
            <AlertStatusBadge status={alert.status} />
            <span
              className={`text-xs px-2.5 py-0.5 rounded font-bold font-mono ${
                alert.syncStatus === 'PENDING'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : alert.syncStatus === 'FAILED'
                  ? 'bg-red-100 text-red-800 border border-red-300'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}
            >
              Sync: {alert.syncStatus || 'SYNCED'}
            </span>
          </div>
          <span className="text-xs font-mono text-gray-500">ID: {alert._id}</span>
        </div>

        <h1 className="text-xl font-bold text-gray-900">
          {alert.alertType.replace(/_/g, ' ')}
        </h1>
        <div className="flex flex-wrap gap-2">{![AlertStatus.RESOLVED, AlertStatus.CANCELLED].includes(alert.status) && <><button className="button button-secondary text-xs px-3 py-1.5" onClick={() => { setEditDescription(alert.description); setEditSeverity(alert.severity); setShowEdit(true); }}>Edit Alert</button><button className="button button-secondary text-xs px-3 py-1.5 text-amber-700" onClick={() => setShowCancel(true)}>Cancel Alert</button></>}<button className="button button-secondary text-xs px-3 py-1.5 text-red-700" onClick={handleDelete}>Delete Alert</button></div>

        <p className="text-sm text-gray-800 bg-gray-50 p-3 rounded-lg border border-gray-100 italic">
          "{alert.description}"
        </p>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
          <div>
            <span className="text-gray-500 block">Source:</span>
            <span className="font-semibold text-gray-900 font-mono">
              {alert.source === AlertSource.COLLAR
                ? `🛰️ Collar (${alert.animalId})`
                : `👥 Community (${alert.reporterName})`}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block">Created At:</span>
            <span className="font-medium text-gray-900">{new Date(alert.createdAt).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Coordinates:</span>
            <span className="font-mono text-gray-900">{alert.location.latitude.toFixed(4)}, {alert.location.longitude.toFixed(4)}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Location Source:</span>
            <span className="font-medium text-gray-900">{alert.location.source}</span>
          </div>
        </div>
      </div>

      {/* Leaflet Location Map */}
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-gray-900">📍 Field Location & Risk Buffer Zone</h3>
        <ConflictAlertMap alert={alert} height="320px" />
      </div>

      {/* State Machine Action Bar */}
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <span>🛡️ Ranger Action Controls</span>
          </h3>
          <span className="text-xs font-mono text-emerald-400">Current Status: {alert.status}</span>
        </div>

        {alert.status === AlertStatus.OPEN && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700">
            <p className="text-xs text-slate-300">
              This alert is currently <span className="font-bold text-red-400">OPEN</span>. Acknowledge this alert to confirm field response.
            </p>
            <button
              onClick={handleAcknowledge}
              disabled={isSubmitting}
              className="button button-primary text-xs px-5 py-2"
            >
              {isSubmitting ? 'Acknowledging...' : '🔵 Acknowledge Alert'}
            </button>
          </div>
        )}

        {alert.status === AlertStatus.ACKNOWLEDGED && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700">
            <p className="text-xs text-slate-300">
              Alert is ACKNOWLEDGED. Record an initial response action before resolving.
            </p>
            <button
              onClick={() => setShowResponseForm(!showResponseForm)}
              disabled={isSubmitting}
              className="button button-primary text-xs px-4 py-2"
            >
              🟡 {showResponseForm ? 'Close Response Form' : 'Record Action Taken'}
            </button>
          </div>
        )}

        {alert.status === AlertStatus.RESPONDING && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowResponseForm(!showResponseForm)}
              disabled={isSubmitting}
              className="button button-primary text-xs px-4 py-2"
            >
              🟡 {showResponseForm ? 'Close Response Form' : 'Record Additional Action'}
            </button>

            <button
              onClick={() => setShowResolveModal(true)}
              disabled={isSubmitting}
              className="button button-secondary text-xs px-4 py-2 bg-emerald-700 text-white border-emerald-600 hover:bg-emerald-600"
            >
              🟢 Resolve Alert
            </button>
          </div>
        )}

        {alert.status === AlertStatus.RESOLVED && (
          <div className="bg-emerald-900/50 border border-emerald-700/60 p-3 rounded-lg text-xs text-emerald-200">
            ✅ <span className="font-bold">This conflict alert is fully RESOLVED.</span> No further state transitions allowed.
            {alert.resolutionNotes && <p className="mt-1 text-emerald-300">Notes: {alert.resolutionNotes}</p>}
          </div>
        )}
        {alert.status === AlertStatus.CANCELLED && <div className="bg-amber-900/50 border border-amber-700/60 p-3 rounded-lg text-xs text-amber-200">This alert is CANCELLED. No further lifecycle actions are allowed.</div>}
      </div>

      {/* Response Form Component */}
      {showResponseForm && (
        <ConflictResponseForm
          onSubmit={handleAddResponse}
          onCancel={() => setShowResponseForm(false)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Resolution Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-gray-900 border-b pb-2">🟢 Resolve Conflict Alert</h3>
            <form onSubmit={handleResolveAlert} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Resolution Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={resolutionInput}
                  onChange={e => setResolutionInput(e.target.value)}
                  placeholder="Explain how the conflict situation was successfully handled..."
                  className="w-full text-sm p-2.5 border rounded-lg border-gray-300 focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="button button-secondary text-xs px-3 py-2"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-700"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Resolving...' : 'Confirm Resolve Alert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEdit && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><form onSubmit={handleEdit} className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3"><h3 className="font-bold">Edit Alert</h3><textarea className="w-full border rounded p-2" value={editDescription} onChange={e => setEditDescription(e.target.value)} minLength={3} /><select className="w-full border rounded p-2" value={editSeverity} onChange={e => setEditSeverity(e.target.value as AlertSeverity)}>{Object.values(AlertSeverity).map(v => <option key={v} value={v}>{v}</option>)}</select><div className="flex justify-end gap-2"><button type="button" className="button button-secondary" onClick={() => setShowEdit(false)}>Close</button><button className="button button-primary" disabled={isSubmitting}>Save</button></div></form></div>}
      {showCancel && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setShowCancel(false); }}><form onSubmit={handleCancel} className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3 text-gray-900"><div className="flex items-center justify-between border-b pb-2"><h3 className="font-bold">Cancel Alert</h3><button type="button" aria-label="Close cancel alert" className="rounded px-2 py-1 text-lg font-bold text-gray-700 hover:bg-gray-100" onClick={() => setShowCancel(false)}>×</button></div><textarea className="w-full border rounded p-2" placeholder="Cancellation reason (required)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} minLength={3} required /><div className="flex justify-end gap-2 border-t pt-3"><button type="button" className="rounded border border-gray-400 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100" onClick={() => setShowCancel(false)}>Close</button><button type="submit" className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">Confirm Cancel</button></div></form></div>}
      {editingResponse && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setEditingResponse(null); }}><form onSubmit={handleUpdateResponse} className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3 text-gray-900"><div className="flex items-center justify-between border-b pb-2"><h3 className="font-bold">Edit Response</h3><button type="button" aria-label="Close edit response" className="rounded px-2 py-1 text-lg font-bold text-gray-700 hover:bg-gray-100" onClick={() => setEditingResponse(null)}>×</button></div><select className="w-full border rounded p-2" value={editingResponse.action} onChange={e => setEditingResponse({ ...editingResponse, action: e.target.value as ResponseAction })}>{Object.values(ResponseAction).map(v => <option key={v} value={v}>{v}</option>)}</select><textarea className="w-full border rounded p-2" value={editingResponse.notes} onChange={e => setEditingResponse({ ...editingResponse, notes: e.target.value })} minLength={3} /><input className="w-full border rounded p-2" value={editingResponse.outcome || ''} onChange={e => setEditingResponse({ ...editingResponse, outcome: e.target.value })} placeholder="Outcome" /><div className="flex justify-end gap-2 border-t pt-3"><button type="button" className="rounded border border-gray-400 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100" onClick={() => setEditingResponse(null)}>Close</button><button type="submit" className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Save</button></div></form></div>}

      {/* Response History Timeline */}
      <ResponseHistoryTimeline
        responses={alert.responses || []}
        acknowledgedBy={alert.acknowledgedBy}
        acknowledgedName={alert.acknowledgedName}
        acknowledgedAt={alert.acknowledgedAt}
        resolvedBy={alert.resolvedBy}
        resolvedName={alert.resolvedName}
        resolvedAt={alert.resolvedAt}
        resolutionNotes={alert.resolutionNotes}
        createdAt={alert.createdAt}
        onEditResponse={![AlertStatus.RESOLVED, AlertStatus.CANCELLED].includes(alert.status) ? setEditingResponse : undefined}
        onDeleteResponse={![AlertStatus.RESOLVED, AlertStatus.CANCELLED].includes(alert.status) ? handleDeleteResponse : undefined}
        auditEntries={history}
      />
    </main>
  );
};
