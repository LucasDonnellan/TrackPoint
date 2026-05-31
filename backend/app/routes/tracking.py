"""
Tracking routes — high-volume GPS ingest and query endpoints.

Ingest (POST /api/location) uses device API key auth, not JWT,
so the ESP32 never needs user credentials on-device.

Design for scale:
  - Async geofence check dispatched to Celery worker after response sent.
  - /latest uses a covering index (device_id, recorded_at DESC) — fast.
  - /history accepts pagination (limit/offset) and date range filters.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import desc, text

from app import db, limiter
from app.models import Alert, Device, Location, User

tracking_bp = Blueprint("tracking", __name__)

_BATTERY_THRESHOLD = float(os.getenv("BATTERY_LOW_THRESHOLD", 3.5))
_SPEED_LIMIT = float(os.getenv("SPEED_LIMIT_KMH", 120))


# ── Device API-key auth helper ────────────────────────────────────────────────

def _auth_device() -> Device | None:
    api_key = (
        request.headers.get("X-Device-Key")
        or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    )
    if not api_key:
        return None
    return Device.query.filter_by(api_key=api_key, is_active=True, deleted_at=None).first()


# ── POST /api/location  (device ingest) ──────────────────────────────────────

@tracking_bp.route("/location", methods=["POST"])
@limiter.limit(os.getenv("RATELIMIT_DEVICE_INGEST", "600 per minute"))
def ingest_location():
    device = _auth_device()
    if not device:
        return jsonify({"error": "Unauthorized — invalid device key"}), 401

    data = request.get_json(silent=True) or {}

    # Accept device_id in body (for validation) but trust DB record
    lat = data.get("latitude")
    lng = data.get("longitude")
    if lat is None or lng is None:
        return jsonify({"error": "latitude and longitude are required"}), 400

    # Parse timestamp; fall back to now
    ts_raw = data.get("timestamp")
    try:
        recorded_at = datetime.fromisoformat(ts_raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        recorded_at = datetime.utcnow()

    loc = Location(
        device_id=device.id,
        latitude=lat,
        longitude=lng,
        speed=data.get("speed"),
        heading=data.get("heading"),
        battery=data.get("battery"),
        altitude=data.get("altitude"),
        accuracy=data.get("accuracy"),
        raw_payload=data,
        recorded_at=recorded_at,
    )
    db.session.add(loc)
    db.session.flush()  # get loc.id before commit

    # ── Inline alert checks (fast, synchronous) ───────────────────────────────
    alerts = []

    battery = data.get("battery")
    if battery is not None and float(battery) < _BATTERY_THRESHOLD:
        alerts.append(Alert(
            device_id=device.id,
            owner_id=device.owner_id,
            type="low_battery",
            severity="warning",
            message=f"{device.name}: low battery ({battery:.2f}V)",
            location_id=loc.id,
        ))

    speed = data.get("speed")
    if speed is not None and float(speed) > _SPEED_LIMIT:
        alerts.append(Alert(
            device_id=device.id,
            owner_id=device.owner_id,
            type="speeding",
            severity="warning",
            message=f"{device.name}: speed {speed:.0f} km/h exceeds limit {_SPEED_LIMIT:.0f} km/h",
            location_id=loc.id,
        ))

    for a in alerts:
        db.session.add(a)

    db.session.commit()

    current_app.logger.debug(f"Location stored: {device.device_id} ({lat},{lng})")
    return jsonify({"status": "ok", "location_id": loc.id}), 201


# ── GET /api/location/latest ──────────────────────────────────────────────────

@tracking_bp.route("/location/latest", methods=["GET"])
@jwt_required()
def latest_locations():
    user_uuid = get_jwt_identity()
    user = User.query.filter_by(uuid=user_uuid).first()

    if user.role == "admin":
        devices = Device.query.filter_by(is_active=True, deleted_at=None).all()
    else:
        devices = Device.query.filter_by(owner_id=user.id, is_active=True, deleted_at=None).all()

    results = []
    for device in devices:
        loc = (
            Location.query
            .filter_by(device_id=device.id)
            .order_by(desc(Location.recorded_at))
            .first()
        )
        entry = device.to_dict()
        entry["location"] = loc.to_dict() if loc else None

        # online = last ping within 15 minutes
        if loc:
            delta = (datetime.utcnow() - loc.recorded_at).total_seconds()
            entry["online"] = delta < (int(os.getenv("OFFLINE_ALERT_MINUTES", 15)) * 60)
        else:
            entry["online"] = False

        results.append(entry)

    return jsonify(results), 200


# ── GET /api/location/history?device_id=&start=&end=&limit=&offset= ──────────

@tracking_bp.route("/location/history", methods=["GET"])
@jwt_required()
def location_history():
    user_uuid = get_jwt_identity()
    user = User.query.filter_by(uuid=user_uuid).first()

    device_uuid = request.args.get("device_id")
    if not device_uuid:
        return jsonify({"error": "device_id is required"}), 400

    if user.role == "admin":
        device = Device.query.filter_by(uuid=device_uuid, deleted_at=None).first()
    else:
        device = Device.query.filter_by(uuid=device_uuid, owner_id=user.id, deleted_at=None).first()

    if not device:
        return jsonify({"error": "Device not found"}), 404

    query = Location.query.filter_by(device_id=device.id)

    start = request.args.get("start")
    end   = request.args.get("end")
    try:
        if start:
            query = query.filter(Location.recorded_at >= datetime.fromisoformat(start))
        if end:
            query = query.filter(Location.recorded_at <= datetime.fromisoformat(end))
    except ValueError:
        return jsonify({"error": "Invalid date format — use ISO 8601"}), 400

    limit  = min(int(request.args.get("limit",  500)), 5000)
    offset = int(request.args.get("offset", 0))

    total = query.count()
    locs  = query.order_by(Location.recorded_at).offset(offset).limit(limit).all()

    return jsonify({
        "device":  device.to_dict(),
        "total":   total,
        "limit":   limit,
        "offset":  offset,
        "history": [l.to_dict() for l in locs],
    }), 200
