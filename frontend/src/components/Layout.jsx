import React, { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const NAV = [
  { to: "/",         label: "Dashboard", icon: "⊞" },
  { to: "/map",      label: "Live Map",  icon: "◉" },
  { to: "/vehicles", label: "Vehicles",  icon: "⊡" },
  { to: "/history",  label: "History",   icon: "◷" },
  { to: "/alerts",   label: "Alerts",    icon: "⚠" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen bg-surface text-white overflow-hidden">
      {/* Sidebar */}
      <aside className={`flex flex-col bg-surface-card border-r border-surface-border transition-all duration-300 ${collapsed ? "w-16" : "w-56"}`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-surface-border">
          <span className="text-brand-500 text-2xl font-bold flex-shrink-0">🌿</span>
          {!collapsed && <span className="font-bold text-lg tracking-tight">FarmTrack</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-600 text-white"
                    : "text-gray-400 hover:bg-surface-hover hover:text-white"
                }`
              }
            >
              <span className="text-base w-5 text-center flex-shrink-0">{icon}</span>
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>

        {/* User + collapse */}
        <div className="border-t border-surface-border p-3 space-y-2">
          {!collapsed && (
            <div className="px-2 py-1">
              <p className="text-xs text-gray-400 truncate">{user?.name}</p>
              <p className="text-xs text-gray-600 truncate">{user?.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <span>⎋</span>
            {!collapsed && "Sign out"}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center py-1 text-gray-600 hover:text-gray-400 transition-colors"
          >
            {collapsed ? "▶" : "◀"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
