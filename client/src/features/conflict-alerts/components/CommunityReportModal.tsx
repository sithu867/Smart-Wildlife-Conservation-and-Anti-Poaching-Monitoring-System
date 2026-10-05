import React, { useState } from 'react';
import { ConflictAlertType, AlertSeverity } from '../../../shared/types/enums';
import type { CommunityReportInput } from '../types/conflictAlert';

interface Props {
  onSubmit: (input: CommunityReportInput) => Promise<void>;
  onClose: () => void;
}

export const CommunityReportModal: React.FC<Props> = ({ onSubmit, onClose }) => {
  const [reporterName, setReporterName] = useState('Mzee Juma');
  const [latitude, setLatitude] = useState(-2.189);
  const [longitude, setLongitude] = useState(34.841);
  const [reportType, setReportType] = useState<ConflictAlertType>(ConflictAlertType.CROP_RAID);
  const [severity, setSeverity] = useState<AlertSeverity>(AlertSeverity.MEDIUM);
  const [description, setDescription] = useState('Local farmer reported hippo pod feeding in maize field near river bank.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      await onSubmit({
        reporterName: reporterName.trim() || 'Community Member',
        latitude: Number(latitude),
        longitude: Number(longitude),
        reportType,
        severity,
        description: description.trim()
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit community report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 text-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>👥 Community Conflict Report</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-bold text-xl leading-none">×</button>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs p-2.5 rounded-lg font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-800 mb-1">Reporter Name / Source</label>
            <input
              type="text"
              value={reporterName}
              onChange={e => setReporterName(e.target.value)}
              placeholder="e.g. Local Elder / Village Member"
              className="w-full p-2.5 border rounded-lg text-sm border-slate-300 text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
              <label className="block font-bold text-slate-800 mb-1">Conflict Type</label>
              <select
                value={reportType}
                onChange={e => setReportType(e.target.value as ConflictAlertType)}
                className="w-full p-2.5 border rounded-lg border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value={ConflictAlertType.CROP_RAID}>Crop Raid</option>
                <option value={ConflictAlertType.LIVESTOCK_THREAT}>Livestock Threat</option>
                <option value={ConflictAlertType.WILDLIFE_NEAR_COMMUNITY}>Near Community</option>
                <option value={ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY}>Dangerous Activity</option>
                <option value={ConflictAlertType.OTHER}>Other</option>
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
            <label className="block font-bold text-slate-800 mb-1">Report Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the wildlife conflict report from the community..."
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
              {isSubmitting ? 'Submitting Report...' : 'Submit Community Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
