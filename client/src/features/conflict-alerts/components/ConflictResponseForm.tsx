import React, { useState } from 'react';
import { ResponseAction } from '../../../shared/types/enums';
import type { AddResponseInput } from '../types/conflictAlert';

interface Props {
  onSubmit: (input: AddResponseInput) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export const ConflictResponseForm: React.FC<Props> = ({ onSubmit, onCancel, isSubmitting = false }) => {
  const [action, setAction] = useState<ResponseAction>(ResponseAction.INVESTIGATED_AREA);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('');
  const [markResolved, setMarkResolved] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!notes.trim() || notes.trim().length < 3) {
      setErrorMsg('Please enter detailed response notes (minimum 3 characters).');
      return;
    }

    if (markResolved && (!resolutionNotes.trim() || resolutionNotes.trim().length < 3)) {
      setErrorMsg('Please enter resolution notes when marking the alert as resolved.');
      return;
    }

    try {
      await onSubmit({
        action,
        notes: notes.trim(),
        outcome: outcome.trim() || undefined,
        markResolved,
        resolutionNotes: markResolved ? resolutionNotes.trim() : undefined
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit response.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl border border-slate-200 shadow-lg space-y-4 text-slate-900">
      <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">Record Conflict Response Action</h3>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-xs p-3 rounded-lg font-medium">
          ⚠️ {errorMsg}
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1">
          Response Action <span className="text-red-500">*</span>
        </label>
        <select
          value={action}
          onChange={e => setAction(e.target.value as ResponseAction)}
          className="w-full text-sm p-2.5 border rounded-lg bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-emerald-500"
          disabled={isSubmitting}
        >
          <option value={ResponseAction.INVESTIGATED_AREA}>🔍 Investigated Area</option>
          <option value={ResponseAction.WARNED_COMMUNITY}>📣 Warned Community</option>
          <option value={ResponseAction.REDIRECTED_WILDLIFE}>🐘 Redirected Wildlife</option>
          <option value={ResponseAction.CONTACTED_MANAGEMENT}>📞 Contacted Park Management</option>
          <option value={ResponseAction.MONITORED_WILDLIFE}>🔭 Monitored Wildlife Movement</option>
          <option value={ResponseAction.SECURED_AREA}>🛡️ Secured Affected Area</option>
          <option value={ResponseAction.ESCALATED_SITUATION}>⚡ Escalated Situation</option>
          <option value={ResponseAction.OTHER}>📝 Other Action</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1">
          Action Notes & Details <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Describe the actions taken by the ranger team..."
          className="w-full text-sm p-2.5 border rounded-lg border-slate-300 text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500"
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1">
          Outcome / Result <span className="text-slate-400 font-normal">(Optional)</span>
        </label>
        <input
          type="text"
          value={outcome}
          onChange={e => setOutcome(e.target.value)}
          placeholder="e.g. Wildlife returned safely to core area"
          className="w-full text-sm p-2.5 border rounded-lg border-slate-300 text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500"
          disabled={isSubmitting}
        />
      </div>

      <div className="pt-2 border-t border-slate-200">
        <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={markResolved}
            onChange={e => setMarkResolved(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
            disabled={isSubmitting}
          />
          <span>Mark conflict alert as fully RESOLVED with this response</span>
        </label>
      </div>

      {markResolved && (
        <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 space-y-1">
          <label className="block text-xs font-bold text-emerald-950 mb-1">
            Resolution Summary Notes <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={2}
            value={resolutionNotes}
            onChange={e => setResolutionNotes(e.target.value)}
            placeholder="Explain why the conflict condition is now fully resolved..."
            className="w-full text-sm p-2.5 border rounded-lg border-emerald-300 bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500"
            disabled={isSubmitting}
          />
        </div>
      )}

      {/* High-Contrast Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-slate-800 bg-slate-200 hover:bg-slate-300 transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-6 py-2.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all active:scale-95"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? '⏳ Saving Response...'
            : markResolved
            ? '🟢 Save & Resolve Alert'
            : '💾 Save Response Action'}
        </button>
      </div>
    </form>
  );
};
