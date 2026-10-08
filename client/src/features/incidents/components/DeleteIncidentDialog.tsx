/**
 * UC-B DELETE confirmation popup.
 *  - withdraw: a synced report; the ranger must choose a reason (and a note for "Other"); the server keeps a copy.
 *  - discard:  an unsynced draft that only exists on this device; removed without a reason.
 */
import React, { useEffect, useRef, useState } from 'react';
import { IncidentDeletionReason } from '../../../shared/types/enums';
import type { ConservationIncident } from '../types/incident';
import { DELETION_REASON_OPTIONS } from '../utils/incidentFormIssues';
import { incidentTypeLabel } from '../utils/incidentTypes';
import { FieldHint } from './FieldHint';

interface DeleteIncidentDialogProps {
  incident: ConservationIncident;
  /** withdraw = synced report (reason required, kept for audit); discard = draft that never reached the server */
  mode: 'withdraw' | 'discard';
  isWorking: boolean;
  onCancel: () => void;
  onConfirm: (reason?: IncidentDeletionReason, note?: string) => void;
}

export const DeleteIncidentDialog: React.FC<DeleteIncidentDialogProps> = ({ incident, mode, isWorking, onCancel, onConfirm }) => {
  const [reason, setReason] = useState<IncidentDeletionReason | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; note?: string }>({});
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isWithdraw = mode === 'withdraw';

  // Focus the safe choice once when the dialog opens
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isWorking) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isWorking]);

  const typeLabel =
    incident.incidentType === 'OTHER' && incident.otherTypeDescription ? incident.otherTypeDescription : incidentTypeLabel(incident.incidentType);
  const patrolName =
    incident.patrolSession && typeof incident.patrolSession === 'object' ? incident.patrolSession.patrolRoute?.name : undefined;
  const photoUrl = incident.evidence?.[0]?.imageUrl;

  // Withdraw needs a valid reason (and note for Other) before calling onConfirm; discard needs nothing
  const handleConfirm = () => {
    if (!isWithdraw) {
      onConfirm();
      return;
    }
    const nextErrors: { reason?: string; note?: string } = {};
    if (!reason) nextErrors.reason = 'Choose why you are deleting this report';
    if (reason === IncidentDeletionReason.OTHER && note.trim().length < 3) nextErrors.note = 'Add a short note (at least 3 characters)';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onConfirm(reason!, note.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !isWorking && onCancel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-incident-title"
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-full bg-rose-950 border border-rose-500/40 flex items-center justify-center text-2xl">🗑️</div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400">{isWithdraw ? 'Delete report' : 'Discard draft'}</span>
          <h3 id="delete-incident-title" className="text-lg font-black text-white leading-tight">
            {isWithdraw ? `Delete "${typeLabel}" report?` : 'Discard this unsynced draft?'}
          </h3>
          <p className="text-xs text-slate-400">
            Reported {new Date(incident.reportedAt).toLocaleString()}
            {incident.location.placeName ? ` · ${incident.location.placeName}` : ''}
            {patrolName ? ` · Patrol: ${patrolName}` : ''}
          </p>
        </div>

        {photoUrl && <img src={photoUrl} alt="Report evidence" className="w-full h-28 object-cover rounded-2xl border border-slate-800" />}

        {isWithdraw && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">
              Why are you deleting it? <span className="text-rose-400">*</span>
            </legend>
            {DELETION_REASON_OPTIONS.map(option => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer text-xs ${
                  reason === option.value ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="deletion-reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => {
                    setReason(option.value);
                    setErrors(prev => ({ ...prev, reason: undefined }));
                  }}
                  className="mt-0.5 accent-amber-400"
                />
                <span>
                  <span className="font-extrabold text-white block">{option.label}</span>
                  <span className="text-slate-400">{option.hint}</span>
                </span>
              </label>
            ))}
            <FieldHint message={errors.reason} />

            {reason === IncidentDeletionReason.OTHER && (
              <div className="flex flex-col gap-1">
                <label htmlFor="deletion-note" className="text-[11px] font-bold text-slate-300 uppercase">
                  Note <span className="text-rose-400">*</span>
                </label>
                <textarea
                  id="deletion-note"
                  value={note}
                  onChange={e => {
                    setNote(e.target.value);
                    setErrors(prev => ({ ...prev, note: undefined }));
                  }}
                  maxLength={500}
                  rows={2}
                  placeholder="Why should this report be removed?"
                  aria-invalid={Boolean(errors.note)}
                  className={`w-full bg-slate-950 border rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-400 ${
                    errors.note ? 'border-rose-500' : 'border-slate-700'
                  }`}
                />
                <FieldHint message={errors.note} />
              </div>
            )}
          </fieldset>
        )}

        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 text-[11px] text-slate-400 flex items-start gap-2">
          <span>ℹ️</span>
          <span>
            {isWithdraw
              ? 'The report will be removed from your list, your patrol and statistics. A copy is kept for audit, and you can undo this right after.'
              : 'This report never reached the server. It will be removed from this device and cannot be recovered.'}
          </span>
        </div>

        <div className="flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isWorking}
            className="w-1/2 py-3.5 px-4 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs disabled:opacity-50"
          >
            Keep Report
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isWorking}
            className="w-1/2 py-3.5 px-4 rounded-xl font-black bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs shadow-lg shadow-rose-500/20 disabled:opacity-50"
          >
            {isWorking ? 'Deleting...' : isWithdraw ? 'Delete Report' : 'Discard Draft'}
          </button>
        </div>
      </div>
    </div>
  );
};
