import React from 'react';
import { AlertSeverity } from '../../../shared/types/enums';

interface Props {
  severity: AlertSeverity;
}

export const AlertSeverityBadge: React.FC<Props> = ({ severity }) => {
  let badgeStyle = 'bg-gray-100 text-gray-800 border-gray-300';
  let icon = '⚡';
  let label = 'Low';

  switch (severity) {
    case AlertSeverity.CRITICAL:
      badgeStyle = 'bg-red-600 text-white font-bold border-red-700 animate-pulse';
      icon = '🚨';
      label = 'CRITICAL';
      break;
    case AlertSeverity.HIGH:
      badgeStyle = 'bg-orange-500 text-white font-semibold border-orange-600';
      icon = '⚠️';
      label = 'HIGH';
      break;
    case AlertSeverity.MEDIUM:
      badgeStyle = 'bg-yellow-500 text-gray-900 font-medium border-yellow-600';
      icon = '🔸';
      label = 'MEDIUM';
      break;
    case AlertSeverity.LOW:
    default:
      badgeStyle = 'bg-blue-100 text-blue-800 border-blue-300';
      icon = '🔹';
      label = 'LOW';
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs uppercase tracking-wider border ${badgeStyle}`}
      title={`Severity: ${severity}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
};
