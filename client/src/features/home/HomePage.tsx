import React from 'react';
import { Link } from 'react-router-dom';

export const HomePage: React.FC = () => {
  return (
    <main className="min-h-[80vh] max-w-5xl mx-auto px-4 py-12 text-slate-100 flex flex-col justify-center">
      
      {/* Clean Top Hero Card */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl flex flex-col gap-8">
        
        {/* Header Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/80 border border-emerald-700/60 px-3.5 py-1.5 rounded-full shadow-sm">
            WildlifeGuard System Platform
          </span>
          
          <div className="flex items-center gap-3 text-xs font-extrabold text-slate-300">
            <span className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              API Online
            </span>
            <span className="hidden sm:flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-sky-400"></span>
              Telemetry Active
            </span>
            <span className="hidden md:flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Offline Ready
            </span>
          </div>
        </div>

        {/* Title & Overview Description */}
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-100 tracking-tight leading-tight">
            Smart Wildlife Conservation & Anti-Poaching System
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal max-w-3xl">
            Central operational platform for Range Patrols, Field Incident Tracking, Human-Wildlife Conflict Alerts, and Park Manager Statistical Analytics.
          </p>
        </div>

        {/* Action Buttons Directly Inside Top Card */}
        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-800/80">
          <Link
            to="/ranger/patrol"
            className="py-3 px-5 rounded-xl font-bold bg-emerald-400 text-slate-950 hover:bg-emerald-300 transition-all text-xs sm:text-sm shadow-lg shadow-emerald-400/20 active:scale-95 flex items-center gap-1.5"
          >
            <span>Patrols</span>
            <span>→</span>
          </Link>

          <Link
            to="/ranger/incidents"
            className="py-3 px-5 rounded-xl font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-all text-xs sm:text-sm shadow-lg shadow-amber-500/20 active:scale-95 flex items-center gap-1.5"
          >
            <span>Incidents</span>
            <span>→</span>
          </Link>

          <Link
            to="/ranger/alerts"
            className="py-3 px-5 rounded-xl font-bold bg-sky-500 text-slate-950 hover:bg-sky-400 transition-all text-xs sm:text-sm shadow-lg shadow-sky-500/20 active:scale-95 flex items-center gap-1.5"
          >
            <span>Conflict Alerts</span>
            <span>→</span>
          </Link>

          <Link
            to="/ranger/collars"
            className="py-3 px-5 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-all text-xs sm:text-sm active:scale-95 flex items-center gap-1.5"
          >
            <span>Collar Devices</span>
            <span>→</span>
          </Link>

          <Link
            to="/manager/analytics"
            className="py-3 px-5 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all text-xs sm:text-sm shadow-lg shadow-purple-600/20 active:scale-95 flex items-center gap-1.5"
          >
            <span>Manager Analytics</span>
            <span>→</span>
          </Link>
        </div>

      </section>

    </main>
  );
};
