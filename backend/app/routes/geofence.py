"""Geofence CRUD routes."""

from __future__ import annotations

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import Geofence, User

geofence_bp = Blueprint("geofence", __name__)


def _current_user():
    return User.query.filter_by(uuid=get_jwt_identity()).first()


@geofence_bp.route("/", methods=["GET"])
@jwt_required()
def list_geofences():
    user = _current_user()
    if user.role == "admin":
        fences = Geofence.query.filter_by(deleted_at=None).all()
    else:
        fences = Geofence.query.filter_by(owner_id=user.id, deleted_at=None).all()
    return jsonify([f.to_dict() for f in fences]), 200


@geofence_bp.route("/", methods=["POST"])
@jwt_required()
def create_geofence():
    user = _current_user()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    fence = Geofence(
        owner_id=user.id,
        name=name,
        description=data.get("description"),
        type=data.get("type", "circle"),
        center_lat=data.get("center_lat"),
        center_lng=data.get("center_lng"),
        radius_m=data.get("radius_m"),
        polygon_coords=data.get("polygon_coords"),
    )
    db.session.add(fence)
    db.session.commit()
    return jsonify(fence.to_dict()), 201


@geofence_bp.route("/<fence_uuid>", methods=["PUT"])
@jwt_required()
def update_geofence(fence_uuid):
    user  = _current_user()
    fence = Geofence.query.filter_by(uuid=fence_uuid, owner_id=user.id, deleted_at=None).first()
    if not fence:
        return jsonify({"error": "Geofence not found"}), 404
    data = request.get_json(silent=True) or {}
    for f in ("name","description","type","center_lat","center_lng","radius_m","polygon_coords","is_active"):
        if f in data:
            setattr(fence, f, data[f])
    db.session.commit()
    return jsonify(fence.to_dict()), 200


@geofence_bp.route("/<fence_uuid>", methods=["DELETE"])
@jwt_required()
def delete_geofence(fence_uuid):
    user  = _current_user()
    fence = Geofence.query.filter_by(uuid=fence_uuid, owner_id=user.id, deleted_at=None).first()
    if not fence:
        return jsonify({"error": "Geofence not found"}), 404
    from datetime import datetime
    fence.deleted_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200
