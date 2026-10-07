import React from 'react';
import type { CollarTelemetry } from '../types/collar';

interface Props {
  deviceId: string;
  animalId: string;
  telemetry: CollarTelemetry[];
  loading: boolean;
  onClose: () => void;
}

export const CollarTelemetryHistoryModal: React.FC<Props> = ({
  deviceId,
  animalId,
  telemetry,
  loading,
  onClose
}) => {
  return (
    <div className="modal-overlay" style={overlayStyle} onClick={onClose}>
      <div className="modal-content" style={contentStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Telemetry History: {deviceId}</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.875rem' }}>
              Tracked Animal: <strong>{animalId}</strong> ({telemetry.length} GPS readings recorded)
            </p>
          </div>
          <button style={closeButtonStyle} onClick={onClose}>&times;</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
              Loading telemetry history...
            </div>
          ) : telemetry.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
              No telemetry readings recorded for this collar yet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={thStyle}>Timestamp</th>
                  <th style={thStyle}>Latitude</th>
                  <th style={thStyle}>Longitude</th>
                  <th style={thStyle}>Battery</th>
                  <th style={thStyle}>Accuracy</th>
                  <th style={thStyle}>Alert Generated</th>
                </tr>
              </thead>
              <tbody>
                {telemetry.map(t => (
                  <tr key={t.id || t.eventId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tdStyle}>
                      <div>{new Date(t.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(t.recordedAt).toLocaleDateString()}</div>
                    </td>
                    <td style={tdStyle}>{t.latitude.toFixed(5)}°</td>
                    <td style={tdStyle}>{t.longitude.toFixed(5)}°</td>
                    <td style={tdStyle}>
                      {t.batteryPercent !== null && t.batteryPercent !== undefined ? (
                        <span style={{
                          fontWeight: 600,
                          color: t.batteryPercent <= 20 ? '#ef4444' : t.batteryPercent <= 50 ? '#f59e0b' : '#10b981'
                        }}>
                          {t.batteryPercent}%
                        </span>
                      ) : 'N/A'}
                    </td>
                    <td style={tdStyle}>{t.accuracyMeters ? `${t.accuracyMeters} m` : 'N/A'}</td>
                    <td style={tdStyle}>
                      {t.alertCreated ? (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: '#fee2e2',
                          color: '#991b1b'
                        }}>
                          🚨 Conflict Alert
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          backgroundColor: '#f1f5f9',
                          color: '#64748b'
                        }}>
                          Safe Zone
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={footerStyle}>
          <button className="button" style={{ backgroundColor: '#64748b', color: '#fff' }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(4px)'
};

const contentStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  width: '90%',
  maxWidth: '850px',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
};

const headerStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid #e2e8f0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1.5rem',
  cursor: 'pointer',
  color: '#64748b'
};

const footerStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid #e2e8f0',
  display: 'flex',
  justifyContent: 'flex-end'
};

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontWeight: 600
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px'
};
