import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SavedStatisticalReport } from '../../../../server/src/modules/analytics/savedReportContract';
import {
  metadataIssueErrors,
  reportMetadataSchema,
  type ReportMetadataErrors,
} from '../../../../server/src/modules/analytics/metadataValidation';

export function ReportMetadataForm({
  report,
  busy,
  onSave,
  onCancel,
  onDirtyChange,
  serverErrors,
  saveBlocked = false,
}: {
  report: SavedStatisticalReport;
  busy: boolean;
  onSave: (title: string, notes: string) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  serverErrors: ReportMetadataErrors;
  saveBlocked?: boolean;
}) {
  const [title, setTitle] = useState(report.title);
  const [notes, setNotes] = useState(report.notes ?? '');
  const [errors, setErrors] = useState<ReportMetadataErrors>({});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    setErrors(serverErrors);
  }, [serverErrors]);
  useEffect(() => {
    if (errors.title || errors.notes)
      form.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
  }, [errors]);
  function change(nextTitle: string, nextNotes: string) {
    setTitle(nextTitle);
    setNotes(nextNotes);
    // Compare exact typed text with persisted values. Trimming before this check
    // would silently discard a manager's whitespace edits when leaving the form.
    onDirtyChange(
      nextTitle !== report.title || nextNotes !== (report.notes ?? ''),
    );
    setErrors({});
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || saveBlocked) return;
    const parsed = reportMetadataSchema.safeParse({ title, notes });
    if (!parsed.success) {
      setErrors(metadataIssueErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    onSave(parsed.data.title, parsed.data.notes ?? '');
  }
  return (
    <form
      ref={form}
      className="card analytics-metadata-form"
      aria-label="Edit Report Details"
      onSubmit={submit}
      noValidate
    >
      <h3>Edit Report Details</h3>
      <p>
        Title and notes are editable. Saved analytical criteria and findings
        remain unchanged.
      </p>
      <label htmlFor="saved-report-title">Report Title</label>
      <input
        id="saved-report-title"
        value={title}
        maxLength={200}
        required
        disabled={busy}
        aria-invalid={!!errors.title}
        aria-describedby={errors.title ? 'saved-report-title-error' : undefined}
        onChange={(event) => change(event.target.value, notes)}
      />
      {errors.title && (
        <p
          className="analytics-field-error"
          id="saved-report-title-error"
          role="alert"
        >
          {errors.title}
        </p>
      )}
      <label htmlFor="saved-report-notes">Report Notes</label>
      <textarea
        id="saved-report-notes"
        value={notes}
        maxLength={5000}
        rows={5}
        disabled={busy}
        aria-invalid={!!errors.notes}
        aria-describedby={errors.notes ? 'saved-report-notes-error' : undefined}
        onChange={(event) => change(title, event.target.value)}
      />
      {errors.notes && (
        <p
          className="analytics-field-error"
          id="saved-report-notes-error"
          role="alert"
        >
          {errors.notes}
        </p>
      )}
      <div className="analytics-actions">
        <button
          type="submit"
          disabled={busy || saveBlocked}
          className="button analytics-button analytics-button--primary"
        >
          {busy ? 'Saving Changes...' : 'Save Changes'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="button analytics-button analytics-button--secondary"
        >
          Cancel Edit
        </button>
      </div>
    </form>
  );
}
