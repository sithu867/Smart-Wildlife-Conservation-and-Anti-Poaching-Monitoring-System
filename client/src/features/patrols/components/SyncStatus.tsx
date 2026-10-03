import React, { useState, useEffect } from 'react';

export const SyncStatusIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700 shadow-sm">
      <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm' : 'bg-amber-500'}`}></span>
      <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
    </div>
  );
};
