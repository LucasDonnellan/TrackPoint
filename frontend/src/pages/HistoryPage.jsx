import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { devicesApi, trackingApi } from "../utils/api";
import { format, subDays } from "date-fns";

function FitRoute({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [40, 40] });
  }, [points]); // eslint-disable-line
  return null;
}

export default function HistoryPage() {
  const [devices, setDevices]       = useState([]);
  const [selectedDevice, setDevice] = useState("");
  const [startDate, setStart]       = useState(format(subDays(new Date(), 1), "yyyy-MM-dd"));
  const [endDate, setEnd]           = useState(format(new Date(), "yyyy-MM-dd"));
  const [history, setHistory]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [playIdx, setPlayIdx]       = useState(0);
  const [playing, setPlaying]       = useState(false);
  const playRef = useRef(null);

  useEffect(() => {
    devicesApi.list().then(({ data }) => {
      setDevices(data);
      if (data.length > 0) setDevice(data[0].id);
    });
  }, []);

  const handleLoad = async () => {
    if (!selectedDevice) return;
    setLoading(true);
    setHistory(null);
    setPlayIdx(0);
    try {
      const { data } = await trackingApi.history({
        device_id: selectedDevice,
        start: `${startDate}T00:00:00`,
        end:   `${endDate}T23:59:59`,
        limit: 2000,
      });
      setHistory(data);
    } finally {
      setLoading(false);
    }
  };

  // Playback
  const points = history?.history.map(h => [h.latitude, h.longitude]) || [];

  useEffect(() => {
    if (playing && points.length > 0) {
      playRef.current = setInterval(() => {
        setPlayIdx(i => {
          if (i >= points.length - 1) { setPlaying(false); return i; }
          return i + 1;
        });
      }, 100);
    } else {
      clearInterval(playRef.current);
    }
    return () => clearInterval(playRef.current);
  }, [playing, points.length]);

  const currentPoint = history?.history[playIdx];

  return (
    <div className="h-full flex flex-col">
      <style>{`.input2 { background:#0f1117; border:1px solid #2a2d3a; border-radius:0.5rem; padding:0.4rem 0.75rem; color:white; font-size:0.875rem; outline:none; } .input2:focus { border-color:#16a34a; }`}</style>

      {/* Controls bar */}
      <div className="flex flex-wrap items-end gap-3 px-6 py-4 bg-surface-card border-b border-surface-border flex-shrink-0">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Vehicle</label>
          <select value={selectedDevice} onChange={e => setDevice(e.target.value)} className="input2">
            {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Start Date</label>
          <input type="date" value={startDate} onChange={e => setStart(e.target.value)} className="input2" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">End Date</label>
          <input type="date" value={endDate} onChange={e => setEnd(e.target.value)} className="input2" />
        </div>
        <button onClick={handleLoad} disabled={loading}
          className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">
          {loading ? "Loading…" : "Load Route"}
        </button>

        {history && (
          <>
            <span className="text-xs text-gray-500 ml-2">{history.total} points</span>
            <button onClick={() => { setPlayIdx(0); setPlaying(true); }}
              disabled={playing}
              className="bg-surface border border-surface-border text-gray-300 hover:text-white text-sm px-3 py-2 rounded-lg disabled:opacity-50">
              ▶ Play
            </button>
            <button onClick={() => setPlaying(false)} className="bg-surface border border-surface-border text-gray-300 hover:text-white text-sm px-3 py-2 rounded-lg">
              ⏸ Pause
            </button>
            <button onClick={() => { setPlaying(false); setPlayIdx(0); }} className="bg-surface border border-surface-border text-gray-300 hover:text-white text-sm px-3 py-2 rounded-lg">
              ⏮ Reset
            </button>
          </>
        )}
      </div>

      {/* Playback scrubber */}
      {history && (
        <div className="px-6 py-2 bg-surface-card border-b border-surface-border flex-shrink-0">
          <input type="range" min={0} max={points.length - 1} value={playIdx}
            onChange={e => { setPlaying(false); setPlayIdx(Number(e.target.value)); }}
            className="w-full accent-brand-500" />
          {currentPoint && (
            <div className="flex gap-6 text-xs text-gray-400 mt-1">
              <span>{format(new Date(currentPoint.recorded_at), "dd MMM yyyy HH:mm:ss")}</span>
              <span>Speed: {currentPoint.speed?.toFixed(1) ?? "—"} km/h</span>
              <span>Battery: {currentPoint.battery?.toFixed(2) ?? "—"} V</span>
              <span>{playIdx + 1} / {points.length}</span>
            </div>
          )}
        </div>
      )}

      {/* Map */}
      <div className="flex-1">
        <MapContainer center={[53.3498, -6.2603]} zoom={8}
          style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {points.length > 1 && (
            <>
              <FitRoute points={points} />
              {/* Full route in grey */}
              <Polyline positions={points} color="#6b7280" weight={2} opacity={0.5} />
              {/* Played portion in green */}
              <Polyline positions={points.slice(0, playIdx + 1)} color="#22c55e" weight={3} />
              {/* Start marker */}
              <CircleMarker center={points[0]} radius={6} color="#22c55e" fillColor="#22c55e" fillOpacity={1}>
                <Popup>Start</Popup>
              </CircleMarker>
              {/* End marker */}
              <CircleMarker center={points[points.length - 1]} radius={6} color="#ef4444" fillColor="#ef4444" fillOpacity={1}>
                <Popup>End</Popup>
              </CircleMarker>
              {/* Current position */}
              {playing || playIdx > 0 ? (
                <CircleMarker center={points[playIdx]} radius={8} color="#facc15" fillColor="#facc15" fillOpacity={0.9}>
                  <Popup>
                    {currentPoint && (
                      <div style={{ fontSize: 12 }}>
                        <strong>Current Position</strong><br/>
                        Speed: {currentPoint.speed?.toFixed(1)} km/h<br/>
                        {format(new Date(currentPoint.recorded_at), "HH:mm:ss")}
                      </div>
                    )}
                  </Popup>
                </CircleMarker>
              ) : null}
            </>
          )}

          {!history && (
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(26,29,39,0.9)", color: "#9ca3af", padding: "1rem 1.5rem", borderRadius: 8, zIndex: 1000, fontSize: 14 }}>
              Select a vehicle and date range, then click Load Route
            </div>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
