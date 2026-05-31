"""
Authentication routes: register, login, refresh, logout.

JWT strategy:
  - Short-lived access token (default 60 min) sent in Authorization header.
  - Long-lived refresh token (default 30 days) stored in HttpOnly cookie
    *and* returned in body so the React SPA can handle it.
  - Logout adds the access token JTI to Redis blocklist with matching TTL.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta

import bcrypt
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

from app import db, limiter
from app.models import User

auth_bp = Blueprint("auth", __name__)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()

def _check_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── POST /api/auth/register ───────────────────────────────────────────────────

@auth_bp.route("/register", methods=["POST"])
@limiter.limit("10 per hour")
def register():
    data = request.get_json(silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    name     = (data.get("name")  or "").strip()
    password = data.get("password") or ""

    if not email or not name or not password:
        return jsonify({"error": "email, name and password are required"}), 400

    if len(password) < 8:
        return jsonify({"error": "password must be at least 8 characters"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "email already registered"}), 409

    user = User(
        email=email,
        name=name,
        password_hash=_hash_password(password),
        role="viewer",
    )
    db.session.add(user)
    db.session.commit()

    current_app.logger.info(f"New user registered: {email}")
    return jsonify({"message": "Account created", "user": user.to_dict()}), 201


# ── POST /api/auth/login ──────────────────────────────────────────────────────

@auth_bp.route("/login", methods=["POST"])
@limiter.limit("20 per hour")
def login():
    data = request.get_json(silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email, deleted_at=None).first()
    if not user or not user.is_active or not _check_password(password, user.password_hash):
        return jsonify({"error": "Invalid credentials"}), 401

    access_token  = create_access_token(identity=user.uuid)
    refresh_token = create_refresh_token(identity=user.uuid)

    current_app.logger.info(f"User logged in: {email}")
    return jsonify({
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "user":          user.to_dict(),
    }), 200


# ── POST /api/auth/refresh ────────────────────────────────────────────────────

@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    user_uuid = get_jwt_identity()
    user = User.query.filter_by(uuid=user_uuid, is_active=True, deleted_at=None).first()
    if not user:
        return jsonify({"error": "User not found"}), 404

    access_token = create_access_token(identity=user_uuid)
    return jsonify({"access_token": access_token}), 200


# ── POST /api/auth/logout ─────────────────────────────────────────────────────

@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    jti = get_jwt()["jti"]
    exp = get_jwt()["exp"]
    ttl = max(int(exp - datetime.utcnow().timestamp()), 1)
    current_app.redis_client.setex(f"blocklist:{jti}", ttl, "1")
    return jsonify({"message": "Logged out"}), 200


# ── GET /api/auth/me ──────────────────────────────────────────────────────────

@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_uuid = get_jwt_identity()
    user = User.query.filter_by(uuid=user_uuid, deleted_at=None).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user.to_dict()), 200
