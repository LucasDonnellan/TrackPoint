import React, { useEffect, useState } from "react";
import { alertsApi } from "../utils/api";
import { formatDistanceToNow } from "date-fns";

const SEVERITY_STYLE = {
  critical: "text-red-400 bg-red-900/20 border-red-800",
  warning:  "text-yellow-400 bg-yellow-900/20 border-yellow-800",
  info:     "text-blue-400 bg-blue-900/20 border-blue-800",
};

const SEVERITY_ICON = { critical: "🔴", warning: "🟡", info: "🔵" };

export default function AlertsPage() {
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("all");

  const fetch = async () => {
    setLoading(true);
    const params = filter === "unread" ? { unread: true } : {};
    const { data } = await alertsApi.list({ limit: 100, ...params });
    setAlerts(data);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [filter]); // eslint-disable-line

  const markRead = async (id) => {
    await alertsApi.markRead(id);
    fetch();
  };

  const markAll = async () => {
    await alertsApi.markAllRead();
    fetch();
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-white">Alerts</h1>
        <div className="flex items-center gap-2">
          <div className="flex border border-surface-border rounded-lg overflow-hidden">
            {["all","unread"].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 text-sm capitalize transition-colors ${filter === f ? "bg-brand-600 text-white" : "text-gray-400 hover:text-white"}`}>
                {f}
              </button>
            ))}
          </div>
          <button onClick={markAll} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 border border-surface-border rounded-lg transition-colors">
            Mark all read
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.id}
              className={`flex items-start gap-4 p-4 rounded-xl border transition-opacity ${SEVERITY_STYLE[a.severity]} ${a.is_read ? "opacity-50" : ""}`}>
              <span className="text-xl mt-0.5">{SEVERITY_ICON[a.severity]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{a.message}</p>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs opacity-70">{a.device_name}</span>
                  <span className="text-xs opacity-70">{a.type.replace(/_/g," ")}</span>
                  <span className="text-xs opacity-70">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
              {!a.is_read && (
                <button onClick={() => markRead(a.id)}
                  className="text-xs opacity-70 hover:opacity-100 flex-shrink-0">
                  ✓ Read
                </button>
              )}
            </div>
          ))}
          {alerts.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <p className="text-4xl mb-3">🎉</p>
              <p>No alerts — all clear!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
