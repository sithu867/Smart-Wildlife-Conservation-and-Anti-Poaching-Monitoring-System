/** UC-B "Report deleted - Undo" message shown after a report is withdrawn. */
import React, { useEffect, useState } from 'react';

interface UndoToastProps {
  message: string;
  onUndo: () => Promise<void> | void;
  onDismiss: () => void;
  durationMs?: number;
}

/** Bottom toast with an Undo action that dismisses itself after `durationMs`. */
export const UndoToast: React.FC<UndoToastProps> = ({ message, onUndo, onDismiss, durationMs = 10000 }) => {
  const [isUndoing, setIsUndoing] = useState(false);

  useEffect(() => {
    if (isUndoing) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, durationMs, isUndoing]);

  const handleUndo = async () => {
    setIsUndoing(true);
    try {
      await onUndo();
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-slate-100"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <span className="flex items-center gap-2">
        <span>🗑️</span>
        <span className="font-semibold">{message}</span>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleUndo}
          disabled={isUndoing}
          className="py-1.5 px-3 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold disabled:opacity-50"
        >
          {isUndoing ? 'Restoring...' : 'Undo'}
        </button>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-slate-400 hover:text-white font-bold px-1">
          ✕
        </button>
      </div>
    </div>
  );
};
