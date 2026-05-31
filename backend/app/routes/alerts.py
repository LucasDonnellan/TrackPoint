"""Alerts routes."""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import desc

from app import db
from app.models import Alert, User

alerts_bp = Blueprint("alerts", __name__)


def _current_user():
    return User.query.filter_by(uuid=get_jwt_identity()).first()


@alerts_bp.route("/", methods=["GET"])
@jwt_required()
def list_alerts():
    user  = _current_user()
    limit = min(int(request.args.get("limit", 50)), 200)
    only_unread = request.args.get("unread", "false").lower() == "true"

    if user.role == "admin":
        q = Alert.query
    else:
        q = Alert.query.filter_by(owner_id=user.id)

    if only_unread:
        q = q.filter_by(is_read=False)

    alerts = q.order_by(desc(Alert.created_at)).limit(limit).all()
    return jsonify([a.to_dict() for a in alerts]), 200


@alerts_bp.route("/<alert_uuid>/read", methods=["POST"])
@jwt_required()
def mark_read(alert_uuid):
    user  = _current_user()
    alert = Alert.query.filter_by(uuid=alert_uuid, owner_id=user.id).first()
    if not alert:
        return jsonify({"error": "Alert not found"}), 404
    alert.is_read = True
    db.session.commit()
    return jsonify({"message": "Marked as read"}), 200


@alerts_bp.route("/mark-all-read", methods=["POST"])
@jwt_required()
def mark_all_read():
    user = _current_user()
    Alert.query.filter_by(owner_id=user.id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "All alerts marked as read"}), 200


@alerts_bp.route("/unread-count", methods=["GET"])
@jwt_required()
def unread_count():
    user  = _current_user()
    count = Alert.query.filter_by(owner_id=user.id, is_read=False).count()
    return jsonify({"count": count}), 200
