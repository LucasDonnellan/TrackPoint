"""
Device CRUD routes — only accessible to authenticated users.
Owners see only their own devices; admins see all.
"""

from __future__ import annotations

import secrets
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db, limiter
from app.models import Device, User

devices_bp = Blueprint("devices", __name__)


def _get_current_user() -> User:
    return User.query.filter_by(uuid=get_jwt_identity()).first()


def _device_query(user: User):
    if user.role == "admin":
        return Device.query.filter_by(deleted_at=None)
    return Device.query.filter_by(owner_id=user.id, deleted_at=None)


# ── GET /api/devices ──────────────────────────────────────────────────────────

@devices_bp.route("/", methods=["GET"])
@jwt_required()
def list_devices():
    user = _get_current_user()
    devices = _device_query(user).order_by(Device.created_at.desc()).all()
    return jsonify([d.to_dict() for d in devices]), 200


# ── POST /api/devices ─────────────────────────────────────────────────────────

@devices_bp.route("/", methods=["POST"])
@jwt_required()
@limiter.limit("30 per hour")
def create_device():
    user = _get_current_user()
    data = request.get_json(silent=True) or {}

    device_id = (data.get("device_id") or "").strip()
    name      = (data.get("name")      or "").strip()

    if not device_id or not name:
        return jsonify({"error": "device_id and name are required"}), 400

    if Device.query.filter_by(device_id=device_id).first():
        return jsonify({"error": "device_id already registered"}), 409

    device = Device(
        device_id=device_id,
        name=name,
        type=data.get("type", "other"),
        owner_id=user.id,
        api_key=secrets.token_hex(32),
        sim_iccid=data.get("sim_iccid"),
        notes=data.get("notes"),
    )
    db.session.add(device)
    db.session.commit()

    return jsonify(device.to_dict(include_api_key=True)), 201


# ── GET /api/devices/<id> ─────────────────────────────────────────────────────

@devices_bp.route("/<device_uuid>", methods=["GET"])
@jwt_required()
def get_device(device_uuid: str):
    user   = _get_current_user()
    device = _device_query(user).filter_by(uuid=device_uuid).first()
    if not device:
        return jsonify({"error": "Device not found"}), 404
    return jsonify(device.to_dict()), 200


# ── PUT /api/devices/<id> ─────────────────────────────────────────────────────

@devices_bp.route("/<device_uuid>", methods=["PUT"])
@jwt_required()
def update_device(device_uuid: str):
    user   = _get_current_user()
    device = _device_query(user).filter_by(uuid=device_uuid).first()
    if not device:
        return jsonify({"error": "Device not found"}), 404

    data = request.get_json(silent=True) or {}
    for field in ("name", "type", "sim_iccid", "firmware_version", "notes", "is_active"):
        if field in data:
            setattr(device, field, data[field])

    db.session.commit()
    return jsonify(device.to_dict()), 200


# ── DELETE /api/devices/<id> ──────────────────────────────────────────────────

@devices_bp.route("/<device_uuid>", methods=["DELETE"])
@jwt_required()
def delete_device(device_uuid: str):
    user   = _get_current_user()
    device = _device_query(user).filter_by(uuid=device_uuid).first()
    if not device:
        return jsonify({"error": "Device not found"}), 404

    from datetime import datetime
    device.deleted_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"message": "Device deleted"}), 200


# ── POST /api/devices/<id>/rotate-key ────────────────────────────────────────

@devices_bp.route("/<device_uuid>/rotate-key", methods=["POST"])
@jwt_required()
def rotate_api_key(device_uuid: str):
    user   = _get_current_user()
    device = _device_query(user).filter_by(uuid=device_uuid).first()
    if not device:
        return jsonify({"error": "Device not found"}), 404

    device.api_key = secrets.token_hex(32)
    db.session.commit()
    return jsonify({"api_key": device.api_key}), 200
