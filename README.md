# 🌿 FarmTrack GPS Platform

Production-ready GPS fleet tracking for agricultural vehicles, built for ESP32 LILYGO T-A7670 devices.

## Stack

| Layer | Technology |
|---|---|
| Hardware | ESP32 / LILYGO T-A7670 (LTE + GPS) |
| Backend | Python 3.12 · Flask · Gunicorn |
| Database | MySQL 8 (+ Redis for rate limiting & JWT blocklist) |
| Frontend | React 18 · Tailwind CSS · Leaflet + OpenStreetMap |
| Deployment | Docker Compose · AWS EC2 · Nginx |

## Quick Start (Local)

```bash
# 1. Clone
git clone https://github.com/your-org/farmtrack.git && cd farmtrack

# 2. Configure backend
cp backend/.env.example backend/.env
# Edit backend/.env — set FLASK_SECRET_KEY, JWT_SECRET_KEY, DB_PASSWORD

# 3. Start everything
docker compose up --build

# 4. Open browser
open http://localhost:80
# Login: admin@farmtrack.local / Admin1234!
```

## Project Structure

```
farmtrack/
├── backend/
│   ├── app/
│   │   ├── __init__.py        # Flask app factory
│   │   ├── models.py          # SQLAlchemy ORM models
│   │   └── routes/
│   │       ├── auth.py        # POST /register /login /refresh /logout
│   │       ├── devices.py     # CRUD /devices
│   │       ├── tracking.py    # POST /location, GET /location/latest|history
│   │       ├── geofence.py    # CRUD /geofence
│   │       └── alerts.py      # GET /alerts
│   ├── wsgi.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── MapPage.jsx        # Leaflet + OSM, auto-refresh 30s
│   │   │   ├── VehiclesPage.jsx   # Search, filter, add/delete devices
│   │   │   ├── HistoryPage.jsx    # Route playback with scrubber
│   │   │   └── AlertsPage.jsx
│   │   ├── hooks/useAuth.js
│   │   └── utils/api.js           # Axios + auto JWT refresh
│   ├── Dockerfile
│   └── package.json
├── database/
│   └── schema.sql             # Full MySQL schema with indexes & FKs
├── docker/
│   └── nginx.conf             # Reverse proxy + SSL termination
├── docs/
│   ├── AWS_DEPLOYMENT.md      # Full deployment + scaling guide
│   └── firmware_example.ino   # ESP32 Arduino firmware
└── docker-compose.yml
```

## API Reference

### Device Ingest (ESP32 → Server)
```http
POST /api/location
X-Device-Key: <64-char device api key>
Content-Type: application/json

{
  "device_id": "tractor01",
  "latitude": 53.12345,
  "longitude": -6.12345,
  "speed": 25,
  "heading": 180,
  "battery": 4.1,
  "timestamp": "2026-01-01T12:00:00Z"
}
```

### Authentication
```http
POST /api/auth/login          → { access_token, refresh_token, user }
POST /api/auth/register       → { user }
POST /api/auth/refresh        → { access_token }
POST /api/auth/logout
GET  /api/auth/me
```

### Devices
```http
GET    /api/devices/          → [ device, ... ]
POST   /api/devices/          → device + api_key
PUT    /api/devices/<uuid>    → device
DELETE /api/devices/<uuid>
POST   /api/devices/<uuid>/rotate-key → { api_key }
```

### Tracking
```http
GET /api/location/latest      → [ device + location + online flag ]
GET /api/location/history?device_id=&start=&end=&limit=&offset=
```

## Alerts Generated Automatically

| Alert Type | Trigger |
|---|---|
| `low_battery` | Battery < 3.5V (configurable) |
| `speeding` | Speed > 120 km/h (configurable) |

## Security Design

- **JWT** short-lived access tokens (60 min) + long-lived refresh tokens (30 days)
- **JWT revocation** via Redis blocklist — instant logout
- **Bcrypt** password hashing (rounds=12)
- **Per-device API keys** (64-char hex) — devices never use user credentials
- **Soft deletes** — data never permanently erased
- **Flask-Limiter** backed by Redis — rate limits survive restarts

## Scaling Notes

See `docs/AWS_DEPLOYMENT.md` for the full scaling guide. At 1,000 devices on 30s intervals:
- ~33 req/s sustained ingest
- Single `t3.large` EC2 + RDS `db.t3.medium` handles this comfortably
- Add ALB + Auto Scaling Group for redundancy
