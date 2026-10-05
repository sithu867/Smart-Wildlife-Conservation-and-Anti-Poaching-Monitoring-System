import React from 'react';
import { AlertStatus } from '../../../shared/types/enums';

interface Props {
  status: AlertStatus;
}

export const AlertStatusBadge: React.FC<Props> = ({ status }) => {
  let badgeStyle = 'bg-gray-100 text-gray-800 border-gray-300';
  let icon = '⭕';

  switch (status) {
    case AlertStatus.OPEN:
      badgeStyle = 'bg-red-100 text-red-800 border-red-300 font-semibold';
      icon = '🔴';
      break;
    case AlertStatus.ACKNOWLEDGED:
      badgeStyle = 'bg-blue-100 text-blue-800 border-blue-300 font-medium';
      icon = '🔵';
      break;
    case AlertStatus.RESPONDING:
      badgeStyle = 'bg-yellow-100 text-yellow-800 border-yellow-300 font-medium';
      icon = '🟡';
      break;
    case AlertStatus.RESOLVED:
      badgeStyle = 'bg-green-100 text-green-800 border-green-300 font-medium';
      icon = '🟢';
      break;
    case AlertStatus.CANCELLED:
      badgeStyle = 'bg-gray-200 text-gray-600 border-gray-300';
      icon = '⚪';
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono uppercase tracking-wide border ${badgeStyle}`}
    >
      <span>{icon}</span>
      <span>{status}</span>
    </span>
  );
};
