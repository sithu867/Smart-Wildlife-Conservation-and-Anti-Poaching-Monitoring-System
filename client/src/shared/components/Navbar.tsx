import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/ranger/patrol', label: 'Patrols', icon: '🛡️' },
    { path: '/ranger/incidents', label: 'Incidents', icon: '🚨' },
    { path: '/ranger/alerts', label: 'Conflict Alerts', icon: '⚡' },
    { path: '/ranger/collars', label: 'Collar Devices', icon: '📡' },
    { path: '/manager/analytics', label: 'Manager', icon: '📊' },
  ];

  const isActive = (path: string) => {
    if (path === '/ranger/patrol' && location.pathname.startsWith('/ranger/patrol')) return true;
    if (path === '/ranger/incidents' && location.pathname.startsWith('/ranger/incidents')) return true;
    if (path === '/ranger/alerts' && location.pathname.startsWith('/ranger/alerts')) return true;
    if (path === '/ranger/collars' && (location.pathname.startsWith('/ranger/collars') || location.pathname.startsWith('/manager/collars'))) return true;
    if (path === '/manager/analytics' && location.pathname.startsWith('/manager')) return true;
    return location.pathname === path;
  };

  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#091a14]/95 backdrop-blur-md border-b border-[#16382c] text-white">
        <Link 
          to="/" 
          className="brand flex items-center gap-2 text-lg font-black text-emerald-400 tracking-wide hover:opacity-90 transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        >
          <span className="text-xl">🛡️</span>
          <span>WildlifeGuard</span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1.5 lg:gap-3">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  active
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Mobile Hamburger Toggle Button */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-slate-200 hover:text-white focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <span className="text-lg font-bold">✕</span>
            ) : (
              <span className="text-lg font-bold">☰</span>
            )}
          </button>
        </div>
      </header>

      {/* Mobile Slide-down Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="fixed inset-x-0 top-[53px] z-40 bg-[#091a14]/98 backdrop-blur-xl border-b border-[#16382c] p-4 shadow-2xl md:hidden animate-in slide-in-from-top duration-200">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 px-2 py-1">
              Field & Operational Workspaces
            </span>
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-2xl text-sm font-bold flex items-center justify-between transition-all ${
                    active
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-900/60 text-slate-200 hover:bg-slate-850 border border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {active && <span className="text-xs bg-emerald-400 text-slate-950 px-2 py-0.5 rounded-full font-black">ACTIVE</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#091a14]/95 backdrop-blur-md border-t border-[#16382c] md:hidden flex items-center justify-around py-2 px-1 text-slate-300 shadow-2xl">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all min-w-[60px] ${
                active
                  ? 'text-emerald-400 font-extrabold scale-105'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <span className="text-lg leading-none mb-1">{item.icon}</span>
              <span className="text-[10px] tracking-tight leading-none truncate max-w-[68px]">{item.label}</span>
              {active && <span className="w-1 h-1 bg-emerald-400 rounded-full mt-1 animate-pulse" />}
            </Link>
          );
        })}
      </nav>
    </>
  );
};
