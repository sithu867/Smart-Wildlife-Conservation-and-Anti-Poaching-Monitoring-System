import { useEffect, useState } from 'react';
import { http } from '../api/http';
import type { ParkOption } from '../../../../server/src/modules/analytics/contract';

export function OptionalParkSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (parkId: string) => void;
}) {
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    http
      .get<{ success: true; data: ParkOption[] }>('/parks', {
        signal: controller.signal,
      })
      .then((response) => {
        if (!controller.signal.aborted) {
          setParks(response.data.data);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">
        Park / Conservation Area (optional)
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={status === 'loading'}
          className="block w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2.5 text-slate-900"
        >
          <option value="">Unassigned</option>
          {parks.map((park) => (
            <option key={park.id} value={park.id}>
              {park.name} ({park.code})
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs">
        Choose the known park. Unassigned records remain available in their
        workflow but are excluded from park analysis.
      </p>
      {status === 'loading' && <p role="status">Loading parks...</p>}
      {status === 'error' && (
        <p role="status">
          Park list unavailable. You can continue unassigned.{' '}
          <button type="button" onClick={() => setAttempt(attempt + 1)}>
            Retry loading parks
          </button>
        </p>
      )}
    </div>
  );
}
