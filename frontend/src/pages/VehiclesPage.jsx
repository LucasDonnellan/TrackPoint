import React, { useEffect, useState } from "react";
import { devicesApi } from "../utils/api";
import { trackingApi } from "../utils/api";
import { formatDistanceToNow } from "date-fns";

const TYPES = ["all","tractor","combine","sprayer","truck","quad","other"];

function Badge({ online }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${online ? "bg-brand-900/50 text-brand-300" : "bg-red-900/30 text-red-400"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-brand-400" : "bg-red-500"}`} />
      {online ? "Online" : "Offline"}
    </span>
  );
}

function AddDeviceModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ device_id: "", name: "", type: "tractor" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await devicesApi.create(form);
      setApiKey(data.api_key);
      onCreated(data);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create device");
    } finally {
      setLoading(false);
    }
  };

  if (apiKey) return (
    <Modal onClose={onClose} title="Device Created ✓">
      <p className="text-sm text-gray-300 mb-3">Save this API key — it will only be shown once:</p>
      <div className="bg-surface rounded-lg p-3 font-mono text-xs text-brand-300 break-all mb-4">{apiKey}</div>
      <p className="text-xs text-gray-500 mb-4">Flash this key to your ESP32 as the <code>DEVICE_API_KEY</code> constant.</p>
      <button onClick={onClose} className="w-full bg-brand-600 hover:bg-brand-500 text-white py-2 rounded-lg text-sm">Done</button>
    </Modal>
  );

  return (
    <Modal onClose={onClose} title="Register New Device">
      {error && <div className="bg-red-900/30 border border-red-700 text-red-300 px-3 py-2 rounded text-sm mb-3">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Device ID (must match firmware)">
          <input required value={form.device_id} onChange={(e) => setForm({...form, device_id: e.target.value})}
            className="input" placeholder="tractor01" />
        </Field>
        <Field label="Display Name">
          <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
            className="input" placeholder="John Deere 6R" />
        </Field>
        <Field label="Type">
          <select value={form.type} onChange={(e) => setForm({...form, type: e.target.value})} className="input">
            {["tractor","combine","sprayer","truck","quad","other"].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <button type="submit" disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm mt-2">
          {loading ? "Creating…" : "Create Device"}
        </button>
      </form>
    </Modal>
  );
}

function Modal({ children, title, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-5">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function VehiclesPage() {
  const [vehicles, setVehicles]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [typeFilter, setType]     = useState("all");
  const [showAdd, setShowAdd]     = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [dRes, lRes] = await Promise.all([devicesApi.list(), trackingApi.latest()]);
    const latestMap = Object.fromEntries(lRes.data.map(v => [v.id, v]));
    setVehicles(dRes.data.map(d => ({ ...d, ...(latestMap[d.id] || {}) })));
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = vehicles.filter(v => {
    const matchSearch = v.name.toLowerCase().includes(search.toLowerCase()) ||
                        v.device_id.toLowerCase().includes(search.toLowerCase());
    const matchType   = typeFilter === "all" || v.type === typeFilter;
    return matchSearch && matchType;
  });

  const handleDelete = async (uuid) => {
    if (!window.confirm("Delete this device? Historical data will be retained.")) return;
    await devicesApi.delete(uuid);
    fetchAll();
  };

  const handleToggle = async (v) => {
    await devicesApi.update(v.id, { is_active: !v.is_active });
    fetchAll();
  };

  // Add tailwind input class via style tag for simplicity
  return (
    <div className="p-6 lg:p-8">
      <style>{`.input { width:100%; background:#0f1117; border:1px solid #2a2d3a; border-radius:0.5rem; padding:0.5rem 0.75rem; color:white; font-size:0.875rem; outline:none; } .input:focus { border-color:#16a34a; }`}</style>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-white">Vehicles</h1>
        <button onClick={() => setShowAdd(true)}
          className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + Register Device
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          placeholder="Search name or device ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input sm:w-72"
        />
        <div className="flex gap-1 flex-wrap">
          {TYPES.map(t => (
            <button key={t} onClick={() => setType(t)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize ${typeFilter === t ? "bg-brand-600 border-brand-600 text-white" : "border-surface-border text-gray-400 hover:text-white"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {["Status","Name","Type","Device ID","Speed","Battery","Last Seen","Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} className="border-b border-surface-border hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3"><Badge online={v.online} /></td>
                  <td className="px-4 py-3 font-medium text-white">{v.name}</td>
                  <td className="px-4 py-3 text-gray-400 capitalize">{v.type}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{v.device_id}</td>
                  <td className="px-4 py-3 text-gray-300">{v.location?.speed?.toFixed(0) ?? "—"} km/h</td>
                  <td className="px-4 py-3 text-gray-300">{v.location?.battery?.toFixed(2) ?? "—"} V</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {v.location
                      ? formatDistanceToNow(new Date(v.location.recorded_at), { addSuffix: true })
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleToggle(v)} className="text-xs text-gray-400 hover:text-yellow-400 transition-colors">
                        {v.is_active ? "Disable" : "Enable"}
                      </button>
                      <button onClick={() => handleDelete(v.id)} className="text-xs text-gray-400 hover:text-red-400 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No vehicles found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddDeviceModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); fetchAll(); }}
        />
      )}
    </div>
  );
}
