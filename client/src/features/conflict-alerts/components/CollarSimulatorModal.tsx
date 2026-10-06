import React, { useState } from 'react';
import { ConflictAlertType, AlertSeverity } from '../../../shared/types/enums';
import type { SimulateCollarInput } from '../types/conflictAlert';

interface Props {
  onSimulate: (input: SimulateCollarInput) => Promise<void>;
  onClose: () => void;
}

export const CollarSimulatorModal: React.FC<Props> = ({ onSimulate, onClose }) => {
  const [animalId, setAnimalId] = useState('ELEPHANT-001');
  const [latitude, setLatitude] = useState(-2.1523);
  const [longitude, setLongitude] = useState(34.8214);
  const [alertType, setAlertType] = useState<ConflictAlertType>(ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY);
  const [severity, setSeverity] = useState<AlertSeverity>(AlertSeverity.HIGH);
  const [description, setDescription] = useState('Tracked elephant breach near village agriculture buffer zone.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      await onSimulate({
        animalId: animalId.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        alertType,
        severity,
        description: description.trim()
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to simulate collar event.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 text-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>🛰️ Wildlife Collar Simulator</span>
            <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-mono font-bold">SIMULATED INPUT</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-bold text-xl leading-none">×</button>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs p-2.5 rounded-lg font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSimulate} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-800 mb-1">Tracked Animal ID</label>
            <input
              type="text"
              value={animalId}
              onChange={e => setAnimalId(e.target.value)}
              className="w-full p-2.5 border rounded-lg font-mono text-sm border-slate-300 text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-800 mb-1">Latitude</label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={e => setLatitude(parseFloat(e.target.value))}
                className="w-full p-2.5 border rounded-lg font-mono text-sm border-slate-300 text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-800 mb-1">Longitude</label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={e => setLongitude(parseFloat(e.target.value))}
                className="w-full p-2.5 border rounded-lg font-mono text-sm border-slate-300 text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-800 mb-1">Alert Type</label>
              <select
                value={alertType}
                onChange={e => setAlertType(e.target.value as ConflictAlertType)}
                className="w-full p-2.5 border rounded-lg border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value={ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY}>Dangerous Activity</option>
                <option value={ConflictAlertType.WILDLIFE_NEAR_COMMUNITY}>Near Community</option>
                <option value={ConflictAlertType.WILDLIFE_NEAR_RANGER}>Near Ranger</option>
                <option value={ConflictAlertType.CROP_RAID}>Crop Raid</option>
                <option value={ConflictAlertType.LIVESTOCK_THREAT}>Livestock Threat</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-800 mb-1">Severity</label>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value as AlertSeverity)}
                className="w-full p-2.5 border rounded-lg border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value={AlertSeverity.LOW}>LOW</option>
                <option value={AlertSeverity.MEDIUM}>MEDIUM</option>
                <option value={AlertSeverity.HIGH}>HIGH</option>
                <option value={AlertSeverity.CRITICAL}>CRITICAL</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-800 mb-1">Event Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full p-2.5 border rounded-lg border-slate-300 text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Generating Alert...' : 'Generate Collar Conflict Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
