import React, { useEffect, useState, useCallback } from 'react';
import { collarApi } from '../api/collarApi';
import type { CollarDevice, CollarStats, CollarTelemetry } from '../types/collar';
import { CollarTelemetryHistoryModal } from '../components/CollarTelemetryHistoryModal';
import { CollarSimulatorModal } from '../../conflict-alerts/components/CollarSimulatorModal';
import { Link } from 'react-router-dom';

export const CollarMonitoringPage: React.FC = () => {
  const [devices, setDevices] = useState<CollarDevice[]>([]);
  const [stats, setStats] = useState<CollarStats>({
    totalDevices: 0,
    onlineDevices: 0,
    offlineDevices: 0,
    lowBatteryDevices: 0,
    insideRiskZone: 0
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE' | 'LOW_BATTERY'>('ALL');
  const [isLive, setIsLive] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Selected device for telemetry history view
  const [selectedDevice, setSelectedDevice] = useState<CollarDevice | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<CollarTelemetry[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  // Modal states
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showSimulatorModal, setShowSimulatorModal] = useState<boolean>(false);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await collarApi.getCollarDevices();
      setDevices(res.devices);
      setStats(res.stats);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      if (!isSilent) setError(err.message || 'Failed to load collar device status.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Setup fallback automatic background refresh every 10 seconds
    const interval = setInterval(() => {
      loadData(true);
    }, 10000);

    // Setup SSE live stream
    let eventSource: EventSource | null = null;
    try {
      const streamUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/device-ingestion/stream`;
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setIsLive(true);
      };

      eventSource.addEventListener('collar-telemetry', () => {
        loadData(true);
      });

      eventSource.addEventListener('conflict-alert', () => {
        loadData(true);
      });

      eventSource.onerror = () => {
        setIsLive(false);
      };
    } catch {
      setIsLive(false);
    }

    return () => {
      clearInterval(interval);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [loadData]);

  const handleViewHistory = async (device: CollarDevice) => {
    setSelectedDevice(device);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    try {
      const history = await collarApi.getCollarTelemetryHistory(device.deviceId);
      setTelemetryHistory(history);
    } catch (err: any) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredDevices = devices.filter(d => {
    const matchesSearch =
      d.deviceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.animalId.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'ONLINE') return d.isOnline;
    if (statusFilter === 'OFFLINE') return !d.isOnline;
    if (statusFilter === 'LOW_BATTERY') return d.batteryPercent !== null && d.batteryPercent <= 20;
    return true;
  });

  const getRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  };

  return (
    <main className="page collar-monitoring-page" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      <p className="eyebrow">Real-time Wildlife Collar Infrastructure</p>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>Collar & Device Monitoring</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.95rem' }}>
            Live GPS telemetry ingestion, battery health, and risk-zone breach tracking.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '20px',
            backgroundColor: isLive ? '#dcfce7' : '#f1f5f9',
            color: isLive ? '#15803d' : '#64748b',
            fontSize: '0.8rem',
            fontWeight: 600
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isLive ? '#22c55e' : '#94a3b8',
              boxShadow: isLive ? '0 0 8px #22c55e' : 'none'
            }} />
            {isLive ? 'Live Stream Connected' : `Auto Refresh (10s)`}
          </div>

          <button
            className="button"
            style={{ backgroundColor: '#0f172a', color: '#fff', fontSize: '0.875rem' }}
            onClick={() => setShowSimulatorModal(true)}
          >
            + Simulate Collar Location
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={cardKpiStyle}>
          <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Collars</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>{stats.totalDevices}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>Tracked animals in park</div>
        </div>

        <div style={cardKpiStyle}>
          <div style={{ color: '#166534', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Online / Active</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#15803d', marginTop: '4px' }}>{stats.onlineDevices}</div>
          <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '2px' }}>Pinging within last 24h</div>
        </div>

        <div style={cardKpiStyle}>
          <div style={{ color: '#b45309', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Low Battery Alert</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>{stats.lowBatteryDevices}</div>
          <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '2px' }}>Collars at ≤ 20% battery</div>
        </div>

        <div style={cardKpiStyle}>
          <div style={{ color: '#991b1b', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Risk Zone Proximity</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>{stats.insideRiskZone}</div>
          <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '2px' }}>Animals currently inside risk zone</div>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        marginBottom: '20px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', gap: '12px', flex: 1, minWidth: '280px' }}>
          <input
            type="text"
            placeholder="Search by Collar ID or Animal ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.875rem'
            }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.875rem',
              backgroundColor: '#fff'
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ONLINE">Online Only</option>
            <option value="OFFLINE">Offline Only</option>
            <option value="LOW_BATTERY">Low Battery (≤ 20%)</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Updated: {lastUpdated.toLocaleTimeString()}
          </span>

          <button
            onClick={() => loadData()}
            className="button"
            style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: '#f1f5f9', color: '#334155' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#b91c1c',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {/* Main Devices Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
            Loading active collar devices...
          </div>
        ) : filteredDevices.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
            {searchTerm || statusFilter !== 'ALL'
              ? 'No collar devices match your filter criteria.'
              : 'No real collar devices registered yet. Click "Simulate Collar Location" or send real webhook telemetry to register collars.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={thStyle}>Device ID</th>
                  <th style={thStyle}>Tracked Animal</th>
                  <th style={thStyle}>Connection Status</th>
                  <th style={thStyle}>Battery Level</th>
                  <th style={thStyle}>Last GPS Location</th>
                  <th style={thStyle}>Last Ping</th>
                  <th style={thStyle}>Risk Zone Proximity</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map(device => {
                  const batteryPct = device.batteryPercent ?? 100;
                  const isLowBattery = batteryPct <= 20;

                  return (
                    <tr key={device.deviceId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}>
                        <strong style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#0f172a' }}>
                          {device.deviceId}
                        </strong>
                      </td>

                      <td style={tdStyle}>
                        <span style={{
                          fontWeight: 600,
                          color: '#0369a1',
                          fontSize: '0.8rem'
                        }}>
                          🐘 {device.animalId}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: device.isOnline ? '#dcfce7' : '#f1f5f9',
                          color: device.isOnline ? '#15803d' : '#64748b'
                        }}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: device.isOnline ? '#22c55e' : '#94a3b8'
                          }} />
                          {device.isOnline ? 'Online' : 'Offline'}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '130px' }}>
                          <div style={{
                            flex: 1,
                            height: '8px',
                            backgroundColor: '#e2e8f0',
                            borderRadius: '4px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${batteryPct}%`,
                              height: '100%',
                              backgroundColor: isLowBattery ? '#ef4444' : batteryPct <= 50 ? '#f59e0b' : '#10b981',
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                          <span style={{
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            color: isLowBattery ? '#dc2626' : '#334155'
                          }}>
                            {device.batteryPercent !== null ? `${device.batteryPercent}%` : 'N/A'}
                          </span>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div>{device.lastLatitude.toFixed(4)}°, {device.lastLongitude.toFixed(4)}°</div>
                        {device.accuracyMeters && (
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>±{device.accuracyMeters}m accuracy</div>
                        )}
                      </td>

                      <td style={tdStyle}>
                        <div>{getRelativeTime(device.lastRecordedAt)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {new Date(device.lastRecordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        {device.nearestRiskZone ? (
                          device.nearestRiskZone.inside ? (
                            <span style={{
                              padding: 0,
                              color: '#991b1b',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}>
                              🚨 Inside {device.nearestRiskZone.zoneName}
                            </span>
                          ) : (
                            <span style={{
                              padding: 0,
                              color: '#475569',
                              fontSize: '0.75rem'
                            }}>
                              {device.nearestRiskZone.distanceKm} km from {device.nearestRiskZone.zoneName}
                            </span>
                          )
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Safe Buffer</span>
                        )}
                      </td>

                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button
                          onClick={() => handleViewHistory(device)}
                          className="button"
                          style={{ padding: '4px 10px', fontSize: '0.75rem', backgroundColor: '#38bdf8', color: '#0f172a' }}
                        >
                          Telemetry Log ({device.totalReadings})
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/ranger/alerts" className="button collar-back-link">
          ← View Conflict Alerts
        </Link>
      </div>

      {showHistoryModal && selectedDevice && (
        <CollarTelemetryHistoryModal
          deviceId={selectedDevice.deviceId}
          animalId={selectedDevice.animalId}
          telemetry={telemetryHistory}
          loading={historyLoading}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedDevice(null);
          }}
        />
      )}

      {showSimulatorModal && (
        <CollarSimulatorModal
          onClose={() => {
            setShowSimulatorModal(false);
            loadData();
          }}
        />
      )}
    </main>
  );
};

const cardKpiStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  padding: '16px',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
};

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontWeight: 600
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'middle'
};
