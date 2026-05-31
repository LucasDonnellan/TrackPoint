"""
FarmTrack GPS Platform — Flask application factory.

Design decisions:
  - App factory pattern allows multiple instances (testing, prod).
  - Extensions initialised here, imported elsewhere — avoids circular imports.
  - JWT blacklist stored in Redis for instant token revocation.
  - Rate limiter backed by Redis so limits survive restarts and work
    correctly behind multiple Gunicorn workers.
"""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler

from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv

load_dotenv()

# ── Shared extension instances ────────────────────────────────────────────────
db = SQLAlchemy()
jwt = JWTManager()
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[os.getenv("RATELIMIT_DEFAULT", "200 per day;50 per hour")],
    storage_uri=os.getenv("REDIS_URL", "memory://"),
)


def create_app() -> Flask:
    app = Flask(__name__)

    # ── Configuration ─────────────────────────────────────────────────────────
    app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET_KEY", "dev-insecure-key")
    app.config["SQLALCHEMY_DATABASE_URI"] = (
        f"mysql+pymysql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
        f"@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '3306')}"
        f"/{os.getenv('DB_NAME', 'farmtrack')}?charset=utf8mb4"
    )
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_size": int(os.getenv("DB_POOL_SIZE", 10)),
        "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", 3600)),
        "pool_pre_ping": True,   # reconnect on stale connections
    }
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-jwt-key")
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = int(
        os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 60)
    ) * 60  # seconds
    app.config["JWT_TOKEN_LOCATION"] = ["headers"]

    # ── Initialise extensions ─────────────────────────────────────────────────
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)

    CORS(
        app,
        origins=os.getenv("CORS_ORIGINS", "*").split(","),
        supports_credentials=True,
    )

    # ── JWT revocation check (Redis blacklist) ────────────────────────────────
    import redis as _redis

    _redis_client = _redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload["jti"]
        return _redis_client.get(f"blocklist:{jti}") is not None

    # Store redis client on app for use in logout route
    app.redis_client = _redis_client

    # ── Register blueprints ───────────────────────────────────────────────────
    from .routes.auth     import auth_bp
    from .routes.devices  import devices_bp
    from .routes.tracking import tracking_bp
    from .routes.geofence import geofence_bp
    from .routes.alerts   import alerts_bp

    app.register_blueprint(auth_bp,     url_prefix="/api/auth")
    app.register_blueprint(devices_bp,  url_prefix="/api/devices")
    app.register_blueprint(tracking_bp, url_prefix="/api")
    app.register_blueprint(geofence_bp, url_prefix="/api/geofence")
    app.register_blueprint(alerts_bp,   url_prefix="/api/alerts")

    # ── Health check ──────────────────────────────────────────────────────────
    @app.route("/health")
    def health():
        return {"status": "ok", "service": "farmtrack-api"}, 200

    # ── Logging ───────────────────────────────────────────────────────────────
    _setup_logging(app)

    return app


def _setup_logging(app: Flask) -> None:
    level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )

    log_file = os.getenv("LOG_FILE")
    if log_file:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        fh = RotatingFileHandler(log_file, maxBytes=10 * 1024 * 1024, backupCount=5)
        fh.setFormatter(formatter)
        app.logger.addHandler(fh)

    sh = logging.StreamHandler()
    sh.setFormatter(formatter)
    app.logger.addHandler(sh)
    app.logger.setLevel(level)
