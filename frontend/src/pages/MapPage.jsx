import React, { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { trackingApi } from "../utils/api";
import { formatDistanceToNow } from "date-fns";

// Fix Leaflet's default icon path issue with webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl:       require("leaflet/dist/images/marker-icon.png"),
  shadowUrl:     require("leaflet/dist/images/marker-shadow.png"),
});

// Custom coloured markers
function makeIcon(online) {
  const colour = online ? "#22c55e" : "#ef4444";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z"
            fill="${colour}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="white"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  });
}

// Auto-fit bounds helper
function FitBounds({ vehicles }) {
  const map = useMap();
  useEffect(() => {
    const points = vehicles
      .filter((v) => v.location)
      .map((v) => [v.location.latitude, v.location.longitude]);
    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    }
  }, []);  // eslint-disable-line
  return null;
}

const REFRESH_INTERVAL = 30_000; // 30 seconds

export default function MapPage() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const timerRef = useRef(null);

  const fetchVehicles = useCallback(async () => {
    try {
      const { data } = await trackingApi.latest();
      setVehicles(data);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
    timerRef.current = setInterval(fetchVehicles, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchVehicles]);

  const online  = vehicles.filter((v) => v.online).length;
  const mapped  = vehicles.filter((v) => v.location);

  // Default centre: Ireland
  const defaultCenter = [53.3498, -6.2603];

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-surface-card border-b border-surface-border flex-shrink-0">
        <div className="flex items-center gap-6">
          <h1 className="font-bold text-white">Live Map</h1>
          <span className="text-sm text-gray-400">
            <span className="text-brand-400 font-medium">{online}</span> online ·{" "}
            <span className="text-red-400 font-medium">{vehicles.length - online}</span> offline
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            Refreshes every 30s · Last: {formatDistanceToNow(lastRefresh, { addSuffix: true })}
          </span>
          <button
            onClick={fetchVehicles}
            className="text-xs bg-surface border border-surface-border px-3 py-1.5 rounded-lg text-gray-300 hover:text-white transition-colors"
          >
            ↻ Refresh now
          </button>
        </div>
      </div>

      {/* Map */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">Loading map…</div>
      ) : (
        <div className="flex-1">
          <MapContainer
            center={defaultCenter}
            zoom={7}
            style={{ height: "100%", width: "100%", background: "#1a1d27" }}
          >
            {/* OpenStreetMap — free, no API key needed */}
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              maxZoom={19}
            />

            {mapped.length > 0 && <FitBounds vehicles={mapped} />}

            {mapped.map((v) => (
              <Marker
                key={v.id}
                position={[v.location.latitude, v.location.longitude]}
                icon={makeIcon(v.online)}
              >
                <Popup>
                  <div style={{ fontFamily: "sans-serif", minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.online ? "#22c55e" : "#ef4444", display: "inline-block" }} />
                      <strong>{v.name}</strong>
                    </div>
                    <table style={{ fontSize: 12, width: "100%", borderCollapse: "collapse" }}>
                      <tbody>
                        <tr><td style={{ color: "#888" }}>Type</td><td>{v.type}</td></tr>
                        <tr><td style={{ color: "#888" }}>Speed</td><td>{v.location.speed?.toFixed(1) ?? "—"} km/h</td></tr>
                        <tr><td style={{ color: "#888" }}>Heading</td><td>{v.location.heading ?? "—"}°</td></tr>
                        <tr><td style={{ color: "#888" }}>Battery</td><td>{v.location.battery?.toFixed(2) ?? "—"} V</td></tr>
                        <tr><td style={{ color: "#888" }}>Updated</td><td>{formatDistanceToNow(new Date(v.location.recorded_at), { addSuffix: true })}</td></tr>
                        <tr>
                          <td style={{ color: "#888" }}>Coords</td>
                          <td>{v.location.latitude.toFixed(5)}, {v.location.longitude.toFixed(5)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
