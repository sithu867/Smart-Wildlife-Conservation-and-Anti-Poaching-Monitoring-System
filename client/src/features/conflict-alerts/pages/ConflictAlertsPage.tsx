import React, { useEffect, useState } from 'react';
import type { WildlifeConflictAlert, SimulateCollarInput, CommunityReportInput } from '../types/conflictAlert';
import { conflictAlertApi } from '../api/conflictAlertApi';
import { ConflictAlertCard } from '../components/ConflictAlertCard';
import { CollarSimulatorModal } from '../components/CollarSimulatorModal';
import { CommunityReportModal } from '../components/CommunityReportModal';
import { AlertStatus, AlertSeverity } from '../../../shared/types/enums';
import { syncService } from '../../../offline/syncService';
import { SyncStatusIndicator } from '../../patrols/components/SyncStatus';

export const ConflictAlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<WildlifeConflictAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');

  // Modals
  const [showCollarModal, setShowCollarModal] = useState(false);
  const [showCommunityModal, setShowCommunityModal] = useState(false);
  const [queueCounts, setQueueCounts] = useState({ pending: 0, syncing: 0, failed: 0 });

  const fetchAlerts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filters: any = {};
      if (statusFilter) filters.status = statusFilter;
      if (severityFilter) filters.severity = severityFilter;

      const data = await conflictAlertApi.getAlerts(filters);
      setAlerts(data);
    } catch (err: any) {
      console.error('Failed loading conflict alerts:', err);
      setError(err.message || 'Failed to load wildlife conflict alerts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    let active = true;
    const refreshQueue = async () => {
      const counts = await syncService.getQueueCounts('conflict-alerts');
      if (active) setQueueCounts(counts);
    };
    void refreshQueue();
    const timer = window.setInterval(() => void refreshQueue(), 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const retryFailed = async () => {
    await syncService.retryFailed();
    await fetchAlerts();
  };

  const handleSimulateCollar = async (input: SimulateCollarInput) => {
    await conflictAlertApi.simulateCollar(input);
    await fetchAlerts();
  };

  const handleCommunityReport = async (input: CommunityReportInput) => {
    await conflictAlertApi.submitCommunityReport(input);
    await fetchAlerts();
  };

  const activeCount = alerts.filter(a => a.status === AlertStatus.OPEN || a.status === AlertStatus.ACKNOWLEDGED || a.status === AlertStatus.RESPONDING).length;

  return (
    <main className="page max-w-4xl mx-auto p-4 space-y-4">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white p-4 rounded-xl shadow-md">
        <div>
          <p className="text-xs uppercase font-mono tracking-wider text-emerald-400">UC-C Field Monitoring</p>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span>⚡ Wildlife Conflict Alerts</span>
            {activeCount > 0 && (
              <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-mono">
                {activeCount} active
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Detect, acknowledge, respond to, and resolve wildlife conflict threats.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SyncStatusIndicator />
          {queueCounts.failed > 0 && (
            <button onClick={retryFailed} className="button button-secondary text-xs px-3 py-1.5">
              Retry sync ({queueCounts.failed})
            </button>
          )}
          <button
            onClick={() => setShowCollarModal(true)}
            className="button button-secondary text-xs px-3 py-1.5 bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700"
          >
            🛰️ Collar Simulator
          </button>
          <button
            onClick={() => setShowCommunityModal(true)}
            className="button button-primary text-xs px-3 py-1.5"
          >
            👥 + Community Report
          </button>
        </div>
      </div>

      {(queueCounts.pending > 0 || queueCounts.syncing > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {queueCounts.syncing > 0 ? 'Synchronizing conflict-alert actions...' : `${queueCounts.pending} conflict-alert action(s) pending synchronization.`}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-lg border border-gray-200 shadow-sm text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-700">Filters:</span>
          <div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="p-1.5 border rounded border-gray-300 bg-gray-50 text-gray-800"
            >
              <option value="">All Statuses</option>
              <option value={AlertStatus.OPEN}>OPEN</option>
              <option value={AlertStatus.ACKNOWLEDGED}>ACKNOWLEDGED</option>
              <option value={AlertStatus.RESPONDING}>RESPONDING</option>
              <option value={AlertStatus.RESOLVED}>RESOLVED</option>
            </select>
          </div>
          <div>
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="p-1.5 border rounded border-gray-300 bg-gray-50 text-gray-800"
            >
              <option value="">All Severities</option>
              <option value={AlertSeverity.CRITICAL}>CRITICAL</option>
              <option value={AlertSeverity.HIGH}>HIGH</option>
              <option value={AlertSeverity.MEDIUM}>MEDIUM</option>
              <option value={AlertSeverity.LOW}>LOW</option>
            </select>
          </div>
        </div>

        <button
          onClick={fetchAlerts}
          className="text-emerald-700 font-medium hover:underline text-xs"
        >
          🔄 Refresh Alerts
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg">
          ⚠️ {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="text-center py-12 bg-white rounded-xl border p-6">
          <div className="inline-block animate-spin text-2xl mb-2">⏳</div>
          <p className="text-sm font-medium text-gray-600">Loading active wildlife conflict alerts...</p>
        </div>
      ) : alerts.length === 0 ? (
        /* Empty State */
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300 p-8">
          <div className="text-4xl mb-2">🛡️</div>
          <h2 className="text-base font-bold text-gray-800">No active wildlife conflict alerts</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            All reserve boundaries are currently quiet. Use the Collar Simulator or Community Report buttons above to simulate incoming field alerts.
          </p>
        </div>
      ) : (
        /* Alert List Grid */
        <div className="grid gap-4 sm:grid-cols-2">
          {alerts.map(alert => (
            <ConflictAlertCard key={alert._id} alert={alert} />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCollarModal && (
        <CollarSimulatorModal
          onSimulate={handleSimulateCollar}
          onClose={() => setShowCollarModal(false)}
        />
      )}

      {showCommunityModal && (
        <CommunityReportModal
          onSubmit={handleCommunityReport}
          onClose={() => setShowCommunityModal(false)}
        />
      )}
    </main>
  );
};
