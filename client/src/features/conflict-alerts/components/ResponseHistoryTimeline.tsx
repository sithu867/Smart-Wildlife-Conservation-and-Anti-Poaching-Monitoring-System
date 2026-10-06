import React from 'react';
import type { ConflictResponse, ConflictAuditEntry } from '../types/conflictAlert';

interface Props {
  responses: ConflictResponse[];
  acknowledgedBy?: string;
  acknowledgedName?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedName?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  createdAt: string;
  onEditResponse?: (response: ConflictResponse) => void;
  onDeleteResponse?: (response: ConflictResponse) => void;
  auditEntries?: ConflictAuditEntry[];
}

export const ResponseHistoryTimeline: React.FC<Props> = ({
  responses = [],
  acknowledgedBy,
  acknowledgedName,
  acknowledgedAt,
  resolvedBy,
  resolvedName,
  resolvedAt,
  resolutionNotes,
  createdAt, onEditResponse, onDeleteResponse, auditEntries = []
}) => {
  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
      <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4 flex items-center justify-between">
        <span>📜 Alert & Audit History</span>
        <span className="text-xs font-normal text-gray-500">{responses.length + (acknowledgedAt ? 1 : 0) + (resolvedAt ? 1 : 0) + 1 + auditEntries.filter(entry => !['CREATE', 'ACKNOWLEDGE', 'ADD_RESPONSE', 'RESOLVE'].includes(entry.action)).length} events</span>
      </h3>

      <div className="relative border-l-2 border-emerald-200 ml-3 space-y-6">
        {/* Event 1: Alert Created */}
        <div className="relative pl-6">
          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
          <div className="text-xs">
            <span className="font-bold text-gray-900">🚨 Alert Generated & Persisted</span>
            <span className="text-gray-500 ml-2">{new Date(createdAt).toLocaleString()}</span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">Initial status set to OPEN.</p>
        </div>

        {/* Event 2: Acknowledged */}
        {acknowledgedAt && (
          <div className="relative pl-6">
            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-600 border-2 border-white" />
            <div className="text-xs">
              <span className="font-bold text-gray-900">🔵 Acknowledged by Ranger</span>
              <span className="text-gray-500 ml-2">{new Date(acknowledgedAt).toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-700 mt-0.5">
              Responder: <span className="font-medium text-gray-900">{acknowledgedName || acknowledgedBy}</span> ({acknowledgedBy})
            </p>
          </div>
        )}

        {/* Response Actions */}
        {responses.map((resp, idx) => (
          <div key={resp.responseId || `resp-${idx}`} className="relative pl-6">
            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-yellow-500 border-2 border-white" />
            <div className="text-xs">
              <span className="font-bold text-gray-900">
                🟡 Action #{idx + 1}: {resp.action.replace(/_/g, ' ')}
              </span>
              <span className="text-gray-500 ml-2">{new Date(resp.respondedAt).toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-700 mt-0.5 font-medium">
              By: {resp.responderName || resp.responderId} ({resp.responderId})
            </p>
            <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 mt-1.5 text-xs text-gray-800">
              <p className="whitespace-pre-wrap">{resp.notes}</p>
              {resp.outcome && (
                <p className="text-emerald-700 font-medium mt-1">
                  Outcome: {resp.outcome}
                </p>
              )}
            </div>
            {(onEditResponse || onDeleteResponse) && <div className="flex gap-2 mt-2"><button className="text-xs text-emerald-700 underline" onClick={() => onEditResponse?.(resp)}>Edit</button><button className="text-xs text-red-700 underline" onClick={() => onDeleteResponse?.(resp)}>Delete</button></div>}
          </div>
        ))}

        {/* Event 3: Resolved */}
        {resolvedAt && (
          <div className="relative pl-6">
            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-green-600 border-2 border-white" />
            <div className="text-xs">
              <span className="font-bold text-green-800">🟢 Conflict Alert Resolved</span>
              <span className="text-gray-500 ml-2">{new Date(resolvedAt).toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-700 mt-0.5 font-medium">
              Resolved By: {resolvedName || resolvedBy} ({resolvedBy})
            </p>
            {resolutionNotes && (
              <div className="bg-green-50 p-2.5 rounded-lg border border-green-200 mt-1.5 text-xs text-green-900 font-medium">
                Resolution Notes: {resolutionNotes}
              </div>
            )}
          </div>
        )}

        {auditEntries.filter(entry => !['CREATE', 'ACKNOWLEDGE', 'ADD_RESPONSE', 'RESOLVE'].includes(entry.action)).map(entry => (
          <div key={entry.id} className="relative pl-6">
            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-purple-600 border-2 border-white" />
            <div className="text-xs"><span className="font-bold text-gray-900">{entry.action.replace(/_/g, ' ')}</span><span className="text-gray-500 ml-2">{new Date(entry.timestamp).toLocaleString()}</span></div>
            <p className="text-xs text-gray-700 mt-0.5">By: {entry.performedName || entry.performedBy}</p>
            {entry.reason && <p className="text-xs text-gray-600 mt-1">Reason: {entry.reason}</p>}
          </div>
        ))}
      </div>
    </div>
  );
};
