import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SyncStatusIndicator } from '../../patrols/components/SyncStatus';
import { ManualLocationPicker } from '../components/ManualLocationPicker';
import {
  ValidationErrorDialog,
  type DialogOverrides,
  type IncidentField,
  type ValidationIssue
} from '../components/ValidationErrorDialog';
import { FieldHint } from '../components/FieldHint';
import { IncidentTypeSelector } from '../components/IncidentTypeSelector';
import { IncidentDescriptionField } from '../components/IncidentDescriptionField';
import { EvidenceEditor } from '../components/EvidenceEditor';
import { DeleteIncidentDialog } from '../components/DeleteIncidentDialog';
import type { WithdrawnReportState } from './IncidentHistoryPage';
import { incidentApi } from '../api/incidentApi';
import { ApiError } from '../../../shared/api/apiError';
import { IncidentType, LocationSource, PatrolStatus, SyncStatus } from '../../../shared/types/enums';
import type { ConservationIncident, EditLockReason, IncidentDeletionReason, IncidentPatrolSession } from '../types/incident';
import { EDIT_LOCK_MESSAGES, buildSubmitIssue } from '../utils/incidentFormIssues';
import {
  buildDeletePayload,
  buildIncidentChanges,
  distanceMeters,
  incidentDisplayName,
  formFromIncident,
  formatDistance,
  validateEditForm,
  type ChangeSummaryItem,
  type IncidentEditForm
} from '../utils/incidentEdit';

const STANDALONE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const generateEditId = () => `edit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

type ErrorDialogState = { variant: 'validation' | 'submit'; issues: ValidationIssue[]; overrides?: DialogOverrides };

function linkedPatrol(incident: ConservationIncident): IncidentPatrolSession | null {
  return incident.patrolSession && typeof incident.patrolSession === 'object' ? incident.patrolSession : null;
}

function isPatrolOpen(incident: ConservationIncident): boolean {
  const status = linkedPatrol(incident)?.status;
  return status === PatrolStatus.ACTIVE || status === PatrolStatus.PAUSED;
}

const CenteredCard: React.FC<{ icon: string; eyebrow: string; title: string; children?: React.ReactNode }> = ({
  icon,
  eyebrow,
  title,
  children
}) => (
  <div className="max-w-md mx-auto px-4 py-8 text-slate-100">
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 text-center items-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl border shadow-xl bg-slate-950 border-slate-700">
        {icon}
      </div>
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-amber-400">{eyebrow}</span>
        <h1 className="text-2xl font-black text-white mt-1">{title}</h1>
      </div>
      {children}
    </div>
  </div>
);

export const EditIncidentPage: React.FC = () => {
  const { incidentId = '' } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string>('');
  const [original, setOriginal] = useState<ConservationIncident | null>(null);
  const [form, setForm] = useState<IncidentEditForm | null>(null);

  const [isManualPickerOpen, setIsManualPickerOpen] = useState<boolean>(false);
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorDialog, setErrorDialog] = useState<ErrorDialogState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<IncidentField, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ incident: ConservationIncident; summary: ChangeSummaryItem[] } | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fieldRefs = useRef<Partial<Record<IncidentField, HTMLElement | null>>>({});
  // Same ID for retries of the same edit (server applies it once); a new ID once the form changes
  const editIdRef = useRef<string | null>(null);

  const startFrom = (incident: ConservationIncident) => {
    setOriginal(incident);
    setForm(formFromIncident(incident));
    setFieldErrors({});
    editIdRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    incidentApi
      .getIncidentById(incidentId)
      .then(incident => {
        if (cancelled) return;
        startFrom(incident);
        setLoadState('ready');
      })
      .catch(err => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load this report.');
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  const updateForm = (patch: Partial<IncidentEditForm>) => {
    setForm(prev => (prev ? { ...prev, ...patch } : prev));
    editIdRef.current = null;
  };

  const clearFieldError = (field: IncidentField) => {
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const closeErrorDialog = useCallback(() => setErrorDialog(null), []);

  const handleFixField = (field: IncidentField) => {
    setErrorDialog(null);
    setIsReviewOpen(false);

    if (field === 'location') {
      setIsManualPickerOpen(true);
      return;
    }

    const el = fieldRefs.current[field];
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus({ preventScroll: true });
    }
  };

  const reloadLatest = async (keepMyChanges: boolean) => {
    setErrorDialog(null);
    try {
      const latest = await incidentApi.getIncidentById(incidentId);
      setOriginal(latest);
      editIdRef.current = null;
      if (keepMyChanges) {
        // Re-apply the ranger's edits on top of the latest version (drop removals of photos that no longer exist)
        setForm(prev =>
          prev
            ? { ...prev, removedEvidenceIds: prev.removedEvidenceIds.filter(id => latest.evidence.some(ev => ev.evidenceId === id)) }
            : prev
        );
        setIsReviewOpen(latest.canEdit !== false);
      } else {
        startFrom(latest);
        setIsReviewOpen(false);
        setNotice('Loaded the latest version of this report. Your unsaved changes were discarded.');
      }
    } catch (err) {
      setErrorDialog({
        variant: 'submit',
        issues: [buildSubmitIssue(err, 'save', { description: form?.description ?? '', otherDescription: form?.otherDescription ?? '' })],
        overrides: { eyebrow: 'Could not refresh', heading: "We couldn't load the latest version" }
      });
    }
  };

  // ---------- Gate screens ----------

  if (loadState === 'loading') {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-semibold">Loading your report...</p>
      </div>
    );
  }

  if (loadState === 'error' || !original || !form) {
    return (
      <CenteredCard icon="🔎" eyebrow="Edit Report" title="Report unavailable">
        <p className="text-xs text-slate-400">{loadError || 'This report could not be loaded.'}</p>
        <button
          onClick={() => navigate('/ranger/incidents')}
          className="w-full py-3.5 rounded-2xl font-bold bg-slate-800 text-slate-100 hover:bg-slate-700 text-xs"
        >
          ← Back to My Reports
        </button>
      </CenteredCard>
    );
  }

  if (original.syncStatus !== SyncStatus.SYNCED || !original.updatedAt) {
    return (
      <CenteredCard icon="🟡" eyebrow="Edit Report" title="Not synced yet">
        <p className="text-xs text-slate-400">
          This report is still saved only on this device. You can edit it once it has synced with the server.
        </p>
        <button
          onClick={() => navigate('/ranger/incidents')}
          className="w-full py-3.5 rounded-2xl font-bold bg-slate-800 text-slate-100 hover:bg-slate-700 text-xs"
        >
          ← Back to My Reports
        </button>
      </CenteredCard>
    );
  }

  if (original.deletedAt) {
    return (
      <CenteredCard icon="🗑️" eyebrow="Edit Report" title="This report was deleted">
        <p className="text-xs text-slate-400">Deleted reports can't be edited.</p>
        <button
          onClick={() => navigate('/ranger/incidents')}
          className="w-full py-3.5 rounded-2xl font-bold bg-slate-800 text-slate-100 hover:bg-slate-700 text-xs"
        >
          ← Back to My Reports
        </button>
      </CenteredCard>
    );
  }

  if (original.canEdit === false) {
    const reason = (original.editLockedReason ?? 'PATROL_COMPLETED') as EditLockReason;
    return (
      <CenteredCard icon="🔒" eyebrow="Report Locked" title="This report can no longer be edited">
        <p className="text-xs text-slate-400">{EDIT_LOCK_MESSAGES[reason]?.message}</p>
        <button
          onClick={() => navigate('/ranger/incidents')}
          className="w-full py-3.5 rounded-2xl font-bold bg-slate-800 text-slate-100 hover:bg-slate-700 text-xs"
        >
          ← Back to My Reports
        </button>
      </CenteredCard>
    );
  }

  // ---------- Saved confirmation ----------

  if (saved) {
    const patrolId = saved.incident.patrolSessionId;
    return (
      <CenteredCard icon="✓" eyebrow="Report Updated" title="Changes Saved">
        <div className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-left flex flex-col gap-2.5">
          {saved.summary.map(item => (
            <div key={item.key} className="flex items-start gap-2 border-b border-slate-900 pb-2 last:border-0 last:pb-0">
              <span>{item.icon}</span>
              <div>
                <span className="font-bold text-slate-200 block">{item.label}</span>
                <span className="text-slate-400">{item.detail}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 w-full">
          {patrolId && isPatrolOpen(saved.incident) && (
            <button
              onClick={() => navigate(`/ranger/patrol/active/${patrolId}`)}
              className="w-full py-4 rounded-2xl font-bold bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-sm"
            >
              🛡️ Return to Active Patrol
            </button>
          )}
          <button
            onClick={() => navigate('/ranger/incidents')}
            className="w-full py-3.5 rounded-2xl font-bold bg-slate-800 text-slate-100 hover:bg-slate-700 text-xs"
          >
            View My Reported Incidents →
          </button>
          <button
            onClick={() => {
              startFrom(saved.incident);
              setSaved(null);
            }}
            className="w-full py-2.5 rounded-2xl font-semibold bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs"
          >
            Edit Again
          </button>
        </div>
      </CenteredCard>
    );
  }

  // ---------- Edit form ----------

  const issueContext = { description: form.description, otherDescription: form.otherDescription };
  const { summary } = buildIncidentChanges(original, form);
  const locationMoved = distanceMeters(original.location, form.location);
  const isLocationChanged =
    form.location.latitude !== original.location.latitude ||
    form.location.longitude !== original.location.longitude ||
    form.location.source !== original.location.source;
  const patrolOpen = isPatrolOpen(original);
  const editDeadline = new Date(new Date(original.reportedAt).getTime() + STANDALONE_EDIT_WINDOW_MS);

  const handleOpenReview = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    const issues = validateEditForm(original, form);
    if (issues.length > 0) {
      setFieldErrors(Object.fromEntries(issues.filter(i => i.field).map(i => [i.field, i.title])));
      setErrorDialog({ variant: 'validation', issues });
      return;
    }

    if (summary.length === 0) {
      setErrorDialog({
        variant: 'validation',
        issues: [{ icon: '📝', title: 'No changes to save', message: 'Change a field first, or go back to your reports.' }],
        overrides: {
          eyebrow: 'Nothing to save',
          heading: "You haven't changed anything yet",
          intro: 'This report is exactly as it was saved.',
          primaryAction: { label: 'Keep Editing', onClick: closeErrorDialog },
          secondaryAction: { label: 'Back to My Reports', onClick: () => navigate('/ranger/incidents') }
        }
      });
      return;
    }

    setFieldErrors({});
    setIsReviewOpen(true);
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    const { changes, summary: savedSummary } = buildIncidentChanges(original, form);
    editIdRef.current ??= generateEditId();

    try {
      const updated = await incidentApi.updateIncident(original._id, {
        ...changes,
        expectedUpdatedAt: original.updatedAt!,
        editedAt: new Date().toISOString(),
        clientEditId: editIdRef.current
      });
      editIdRef.current = null;
      setIsReviewOpen(false);
      setSaved({ incident: updated, summary: savedSummary });
    } catch (err) {
      const issue = buildSubmitIssue(err, 'save', issueContext);
      if (issue.field) setFieldErrors(prev => ({ ...prev, [issue.field!]: issue.title }));

      const code = err instanceof ApiError ? err.code : undefined;
      let overrides: DialogOverrides = { heading: "We couldn't save your changes", eyebrow: 'Save failed' };
      if (code === 'EDIT_CONFLICT') {
        overrides = {
          eyebrow: 'Newer version found',
          heading: 'This report changed while you were editing',
          intro: 'Nothing was lost. Choose how to continue.',
          primaryAction: { label: 'Keep My Changes', onClick: () => void reloadLatest(true) },
          secondaryAction: { label: 'See Latest', onClick: () => void reloadLatest(false) }
        };
      } else if (code === 'INCIDENT_LOCKED') {
        overrides = {
          eyebrow: 'Report locked',
          heading: 'This report can no longer be edited',
          intro: 'Your changes could not be saved.',
          primaryAction: { label: 'Back to My Reports', onClick: () => navigate('/ranger/incidents') },
          secondaryAction: { label: 'Close', onClick: closeErrorDialog }
        };
      }
      setErrorDialog({ variant: 'submit', issues: [issue], overrides });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (reason: IncidentDeletionReason, note?: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await incidentApi.deleteIncident(original._id, buildDeletePayload(original, reason, note));
      const state: WithdrawnReportState = { withdrawn: { incidentId: original._id, label: incidentDisplayName(original) } };
      navigate('/ranger/incidents', { state });
    } catch (err) {
      setIsDeleteOpen(false);
      const code = err instanceof ApiError ? err.code : undefined;
      const overrides: DialogOverrides = { eyebrow: 'Delete failed', heading: "We couldn't delete this report", intro: 'Nothing was changed.' };
      if (code === 'EDIT_CONFLICT') {
        overrides.primaryAction = { label: 'See Latest', onClick: () => void reloadLatest(false) };
      } else if (code === 'INCIDENT_LOCKED' || code === 'INCIDENT_DELETED') {
        overrides.primaryAction = { label: 'Back to My Reports', onClick: () => navigate('/ranger/incidents') };
      }
      setErrorDialog({ variant: 'submit', issues: [buildSubmitIssue(err, 'delete', issueContext)], overrides });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 text-slate-100 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-rose-400">Field Threat Log</span>
          <h1 className="text-2xl font-black text-white mt-0.5">Edit Incident Report</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Reported {new Date(original.reportedAt).toLocaleString()}
            {original.editCount ? ` · edited ${original.editCount}×` : ''}
          </p>
        </div>
        <SyncStatusIndicator />
      </div>

      {/* How long the report stays editable (mirrors the server's lock rules) */}
      <div className="bg-emerald-950/60 border border-emerald-500/40 p-3.5 rounded-2xl text-xs text-emerald-200 flex items-start gap-2">
        <span className="text-base">{patrolOpen ? '🛡️' : '⏱️'}</span>
        <p>
          {patrolOpen
            ? 'Linked to your active patrol. You can edit this report until the patrol is completed.'
            : `You can edit this report until ${editDeadline.toLocaleString()}.`}
        </p>
      </div>

      {notice && (
        <div role="status" className="bg-slate-900 border border-amber-500/40 p-3 rounded-2xl text-xs text-amber-200 flex items-start gap-2">
          <span>ℹ️</span>
          <span>{notice}</span>
        </div>
      )}

      <form onSubmit={handleOpenReview} noValidate className="flex flex-col gap-5">
        {/* 1. Location */}
        <div
          ref={el => { fieldRefs.current.location = el; }}
          className={`bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3 ${
            fieldErrors.location ? 'border-rose-500 ring-2 ring-rose-500/30' : 'border-slate-800'
          }`}
        >
          <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Location ({form.location.source})</span>
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 flex justify-between items-center gap-2">
            <span className="flex flex-col gap-0.5">
              {!isLocationChanged && original.location.placeName && (
                <span className="font-sans font-bold text-emerald-300">📍 {original.location.placeName}</span>
              )}
              {isLocationChanged && <span className="font-sans text-[10px] text-amber-200">Place name updates after saving</span>}
              <span>
                Lat: {form.location.latitude.toFixed(5)}°, Lng: {form.location.longitude.toFixed(5)}°
              </span>
            </span>
            <button
              type="button"
              onClick={() => setIsManualPickerOpen(true)}
              className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-sans font-bold text-[10px] rounded-lg border border-slate-700 shrink-0"
            >
              Change Pin 📍
            </button>
          </div>
          {isLocationChanged && (
            <div className="flex items-center justify-between text-[11px] text-amber-200">
              <span>Moved {formatDistance(locationMoved)} from the original spot</span>
              <button
                type="button"
                onClick={() => {
                  updateForm({ location: { ...original.location } });
                  clearFieldError('location');
                }}
                className="font-bold underline underline-offset-2 hover:text-amber-100"
              >
                Undo
              </button>
            </div>
          )}
          <FieldHint message={fieldErrors.location} />
        </div>

        {/* 2. Type */}
        <IncidentTypeSelector
          selectedType={form.incidentType}
          onSelect={type => {
            updateForm({ incidentType: type });
            clearFieldError('incidentType');
            if (type !== IncidentType.OTHER) clearFieldError('otherTypeDescription');
          }}
          otherDescription={form.otherDescription}
          onOtherDescriptionChange={value => {
            updateForm({ otherDescription: value });
            clearFieldError('otherTypeDescription');
          }}
          typeError={fieldErrors.incidentType}
          otherError={fieldErrors.otherTypeDescription}
          sectionRef={el => { fieldRefs.current.incidentType = el; }}
          otherInputRef={el => { fieldRefs.current.otherTypeDescription = el; }}
        />

        {/* 3. Photos */}
        <EvidenceEditor
          existing={original.evidence}
          removedIds={form.removedEvidenceIds}
          newPhotos={form.newPhotos}
          onToggleRemove={evidenceId => {
            const removed = form.removedEvidenceIds.includes(evidenceId)
              ? form.removedEvidenceIds.filter(id => id !== evidenceId)
              : [...form.removedEvidenceIds, evidenceId];
            updateForm({ removedEvidenceIds: removed });
            clearFieldError('imageUrl');
          }}
          onAddPhoto={photo => {
            updateForm({
              newPhotos: [
                ...form.newPhotos,
                {
                  key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  imageUrl: photo.dataUrl,
                  fileSize: photo.size,
                  mimeType: photo.mimeType,
                  capturedAt: new Date().toISOString()
                }
              ]
            });
            clearFieldError('imageUrl');
          }}
          onRemoveNewPhoto={key => {
            updateForm({ newPhotos: form.newPhotos.filter(photo => photo.key !== key) });
            clearFieldError('imageUrl');
          }}
          error={fieldErrors.imageUrl}
          sectionRef={el => { fieldRefs.current.imageUrl = el; }}
        />

        {/* 4. Description */}
        <IncidentDescriptionField
          value={form.description}
          onChange={value => {
            updateForm({ description: value });
            clearFieldError('description');
          }}
          error={fieldErrors.description}
          textareaRef={el => { fieldRefs.current.description = el; }}
        />

        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={() => navigate('/ranger/incidents')}
            className="w-1/3 py-4 rounded-2xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="w-2/3 py-4 rounded-2xl font-black bg-amber-400 text-slate-950 hover:bg-amber-300 active:scale-[0.98] transition-all text-sm shadow-xl shadow-amber-400/20"
          >
            Review Changes →{summary.length > 0 ? ` (${summary.length})` : ''}
          </button>
        </div>
      </form>

      {original.canDelete !== false && (
        <div className="border border-rose-500/30 bg-rose-950/20 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="text-xs">
            <p className="font-extrabold text-rose-200">Delete this report</p>
            <p className="text-slate-400 mt-0.5">For duplicates or mistakes. A copy is kept for audit.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="shrink-0 py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-rose-950 border border-rose-500/50 text-rose-300 text-xs font-extrabold"
          >
            🗑️ Delete
          </button>
        </div>
      )}

      {isDeleteOpen && (
        <DeleteIncidentDialog
          incident={original}
          mode="withdraw"
          isWorking={isDeleting}
          onCancel={() => setIsDeleteOpen(false)}
          onConfirm={(reason, note) => void handleDelete(reason!, note)}
        />
      )}

      {isManualPickerOpen && (
        <ManualLocationPicker
          initialLocation={form.location}
          onLocationSelected={loc => {
            updateForm({ location: { latitude: loc.latitude, longitude: loc.longitude, source: LocationSource.MANUAL } });
            setIsManualPickerOpen(false);
            clearFieldError('location');
          }}
          onCancel={() => setIsManualPickerOpen(false)}
        />
      )}

      {isReviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400">Step 2 of 2</span>
                <h3 className="text-lg font-black text-white">Review Your Changes</h3>
              </div>
              <button type="button" onClick={() => setIsReviewOpen(false)} className="text-slate-400 hover:text-white text-xl font-bold p-1">
                ✕
              </button>
            </div>

            <ul className="flex flex-col gap-2.5" aria-label="Changes to save">
              {summary.map(item => (
                <li key={item.key} className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-start gap-3 text-xs">
                  <span className="text-lg">{item.icon}</span>
                  <div className="min-w-0">
                    <p className="font-extrabold text-white">{item.label}</p>
                    <p className="text-slate-400 mt-0.5 break-words">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="text-[11px] text-slate-500">
              Every change is recorded in the report history. The original photos are kept for the record.
            </p>

            <div className="flex gap-3 mt-1">
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                className="w-1/2 py-3.5 px-4 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
              >
                ← Keep Editing
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="w-1/2 py-3.5 px-4 rounded-xl font-black bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-xs shadow-lg shadow-emerald-400/20 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {errorDialog && (
        <ValidationErrorDialog
          variant={errorDialog.variant}
          issues={errorDialog.issues}
          onClose={closeErrorDialog}
          onFix={handleFixField}
          {...errorDialog.overrides}
        />
      )}
    </div>
  );
};
