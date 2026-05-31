import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { trackingApi } from "../utils/api";
import { alertsApi } from "../utils/api";
import { formatDistanceToNow } from "date-fns";

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`text-4xl font-bold mt-1 ${color || "text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState([]);
  const [alerts,   setAlerts]   = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([trackingApi.latest(), alertsApi.list({ limit: 10 })])
      .then(([vRes, aRes]) => {
        setVehicles(vRes.data);
        setAlerts(aRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const online  = vehicles.filter((v) => v.online).length;
  const offline = vehicles.length - online;
  const lowBatt = vehicles.filter(
    (v) => v.location?.battery !== null && v.location?.battery < 3.6
  ).length;

  if (loading) return <PageShell><div className="text-gray-400 p-8">Loading…</div></PageShell>;

  return (
    <PageShell>
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Vehicles"   value={vehicles.length} color="text-white" />
        <StatCard label="Online Now"       value={online}          color="text-brand-400" sub="last 15 min" />
        <StatCard label="Offline"          value={offline}         color="text-red-400" />
        <StatCard label="Low Battery"      value={lowBatt}         color="text-yellow-400" sub="< 3.6V" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent vehicles */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-white">Fleet Status</h3>
            <Link to="/vehicles" className="text-xs text-brand-400 hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {vehicles.slice(0, 8).map((v) => (
              <div key={v.id} className="flex items-center justify-between py-2 border-b border-surface-border last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${v.online ? "bg-brand-400" : "bg-red-500"}`} />
                  <div>
                    <p className="text-sm text-white font-medium">{v.name}</p>
                    <p className="text-xs text-gray-500">{v.type}</p>
                  </div>
                </div>
                <div className="text-right">
                  {v.location ? (
                    <>
                      <p className="text-xs text-gray-400">{v.location.speed?.toFixed(0) ?? 0} km/h</p>
                      <p className="text-xs text-gray-600">
                        {formatDistanceToNow(new Date(v.location.recorded_at), { addSuffix: true })}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600">No data</p>
                  )}
                </div>
              </div>
            ))}
            {vehicles.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No vehicles registered yet</p>
            )}
          </div>
        </div>

        {/* Recent alerts */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-white">Recent Alerts</h3>
            <Link to="/alerts" className="text-xs text-brand-400 hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 8).map((a) => (
              <div key={a.id} className={`flex gap-3 py-2 border-b border-surface-border last:border-0 ${!a.is_read ? "opacity-100" : "opacity-60"}`}>
                <span className={`text-base mt-0.5 ${a.severity === "critical" ? "text-red-400" : a.severity === "warning" ? "text-yellow-400" : "text-blue-400"}`}>
                  {a.severity === "critical" ? "🔴" : a.severity === "warning" ? "🟡" : "🔵"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{a.message}</p>
                  <p className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
            {alerts.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No alerts</p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function PageShell({ children }) {
  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
      {children}
    </div>
  );
}
