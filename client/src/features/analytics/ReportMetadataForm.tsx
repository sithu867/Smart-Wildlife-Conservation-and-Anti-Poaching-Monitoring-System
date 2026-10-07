import { useState, type FormEvent } from 'react';
import type { SavedStatisticalReport } from '../../../../server/src/modules/analytics/savedReportContract';

export function ReportMetadataForm({
  report,
  busy,
  onSave,
  onCancel,
}: {
  report: SavedStatisticalReport;
  busy: boolean;
  onSave: (title: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(report.title);
  const [notes, setNotes] = useState(report.notes ?? '');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !title.trim() ||
      title.trim().length > 200 ||
      notes.trim().length > 5000
    ) {
      setError(
        'Enter a title of 1-200 characters and notes of at most 5000 characters.',
      );
      return;
    }
    setError('');
    onSave(title.trim(), notes.trim());
  }
  return (
    <form
      className="card analytics-metadata-form"
      aria-label="Edit Report Details"
      onSubmit={submit}
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
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor="saved-report-notes">Report Notes</label>
      <textarea
        id="saved-report-notes"
        value={notes}
        maxLength={5000}
        rows={5}
        disabled={busy}
        onChange={(event) => setNotes(event.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <div className="analytics-actions">
        <button
          type="submit"
          disabled={busy}
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
