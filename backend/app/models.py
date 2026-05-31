"""
ORM models mirroring the MySQL schema.
Kept intentionally thin — business logic lives in routes/services.
"""

from __future__ import annotations
import secrets
import uuid as _uuid
from datetime import datetime

from app import db


class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.Integer,      primary_key=True, autoincrement=True)
    uuid          = db.Column(db.String(36),   nullable=False, unique=True, default=lambda: str(_uuid.uuid4()))
    email         = db.Column(db.String(255),  nullable=False, unique=True)
    name          = db.Column(db.String(120),  nullable=False)
    password_hash = db.Column(db.String(255),  nullable=False)
    role          = db.Column(db.Enum("admin", "manager", "viewer"), nullable=False, default="viewer")
    is_active     = db.Column(db.Boolean,      nullable=False, default=True)
    created_at    = db.Column(db.DateTime,     nullable=False, default=datetime.utcnow)
    updated_at    = db.Column(db.DateTime,     nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at    = db.Column(db.DateTime,     nullable=True)

    devices  = db.relationship("Device",   back_populates="owner",  lazy="dynamic")
    geofences = db.relationship("Geofence", back_populates="owner",  lazy="dynamic")

    def to_dict(self):
        return {
            "id":         self.uuid,
            "email":      self.email,
            "name":       self.name,
            "role":       self.role,
            "is_active":  self.is_active,
            "created_at": self.created_at.isoformat(),
        }


class Device(db.Model):
    __tablename__ = "devices"

    id               = db.Column(db.Integer,     primary_key=True, autoincrement=True)
    uuid             = db.Column(db.String(36),  nullable=False, unique=True, default=lambda: str(_uuid.uuid4()))
    device_id        = db.Column(db.String(80),  nullable=False, unique=True)
    name             = db.Column(db.String(120), nullable=False)
    type             = db.Column(db.Enum("tractor","combine","sprayer","truck","quad","other"), nullable=False, default="other")
    owner_id         = db.Column(db.Integer,     db.ForeignKey("users.id"), nullable=False)
    api_key          = db.Column(db.String(64),  nullable=False, unique=True, default=lambda: secrets.token_hex(32))
    is_active        = db.Column(db.Boolean,     nullable=False, default=True)
    sim_iccid        = db.Column(db.String(22),  nullable=True)
    firmware_version = db.Column(db.String(20),  nullable=True)
    notes            = db.Column(db.Text,        nullable=True)
    created_at       = db.Column(db.DateTime,    nullable=False, default=datetime.utcnow)
    updated_at       = db.Column(db.DateTime,    nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at       = db.Column(db.DateTime,    nullable=True)

    owner     = db.relationship("User",     back_populates="devices")
    locations = db.relationship("Location", back_populates="device", lazy="dynamic")
    alerts    = db.relationship("Alert",    back_populates="device", lazy="dynamic")

    def to_dict(self, include_api_key=False):
        d = {
            "id":               self.uuid,
            "device_id":        self.device_id,
            "name":             self.name,
            "type":             self.type,
            "is_active":        self.is_active,
            "sim_iccid":        self.sim_iccid,
            "firmware_version": self.firmware_version,
            "notes":            self.notes,
            "created_at":       self.created_at.isoformat(),
        }
        if include_api_key:
            d["api_key"] = self.api_key
        return d


class Location(db.Model):
    __tablename__ = "locations"

    id          = db.Column(db.BigInteger,    primary_key=True, autoincrement=True)
    device_id   = db.Column(db.Integer,       db.ForeignKey("devices.id"), nullable=False)
    latitude    = db.Column(db.Numeric(10,7), nullable=False)
    longitude   = db.Column(db.Numeric(10,7), nullable=False)
    speed       = db.Column(db.Numeric(6,2),  nullable=True)
    heading     = db.Column(db.SmallInteger,  nullable=True)
    battery     = db.Column(db.Numeric(4,2),  nullable=True)
    altitude    = db.Column(db.Numeric(8,2),  nullable=True)
    accuracy    = db.Column(db.Numeric(6,2),  nullable=True)
    raw_payload = db.Column(db.JSON,          nullable=True)
    recorded_at = db.Column(db.DateTime,      nullable=False)
    created_at  = db.Column(db.DateTime,      nullable=False, default=datetime.utcnow)

    device = db.relationship("Device", back_populates="locations")

    def to_dict(self):
        return {
            "id":          self.id,
            "device_id":   self.device.uuid if self.device else None,
            "latitude":    float(self.latitude),
            "longitude":   float(self.longitude),
            "speed":       float(self.speed) if self.speed is not None else None,
            "heading":     self.heading,
            "battery":     float(self.battery) if self.battery is not None else None,
            "altitude":    float(self.altitude) if self.altitude is not None else None,
            "accuracy":    float(self.accuracy) if self.accuracy is not None else None,
            "recorded_at": self.recorded_at.isoformat(),
        }


class Geofence(db.Model):
    __tablename__ = "geofences"

    id              = db.Column(db.Integer,      primary_key=True, autoincrement=True)
    uuid            = db.Column(db.String(36),   nullable=False, unique=True, default=lambda: str(_uuid.uuid4()))
    owner_id        = db.Column(db.Integer,      db.ForeignKey("users.id"), nullable=False)
    name            = db.Column(db.String(120),  nullable=False)
    description     = db.Column(db.Text,         nullable=True)
    type            = db.Column(db.Enum("circle","polygon"), nullable=False, default="circle")
    center_lat      = db.Column(db.Numeric(10,7),nullable=True)
    center_lng      = db.Column(db.Numeric(10,7),nullable=True)
    radius_m        = db.Column(db.Integer,      nullable=True)
    polygon_coords  = db.Column(db.JSON,         nullable=True)
    is_active       = db.Column(db.Boolean,      nullable=False, default=True)
    created_at      = db.Column(db.DateTime,     nullable=False, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime,     nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at      = db.Column(db.DateTime,     nullable=True)

    owner = db.relationship("User", back_populates="geofences")

    def to_dict(self):
        return {
            "id":             self.uuid,
            "name":           self.name,
            "description":    self.description,
            "type":           self.type,
            "center_lat":     float(self.center_lat) if self.center_lat else None,
            "center_lng":     float(self.center_lng) if self.center_lng else None,
            "radius_m":       self.radius_m,
            "polygon_coords": self.polygon_coords,
            "is_active":      self.is_active,
            "created_at":     self.created_at.isoformat(),
        }


class Alert(db.Model):
    __tablename__ = "alerts"

    id          = db.Column(db.BigInteger,  primary_key=True, autoincrement=True)
    uuid        = db.Column(db.String(36),  nullable=False, unique=True, default=lambda: str(_uuid.uuid4()))
    device_id   = db.Column(db.Integer,     db.ForeignKey("devices.id"), nullable=False)
    owner_id    = db.Column(db.Integer,     db.ForeignKey("users.id"),   nullable=False)
    type        = db.Column(db.Enum("geofence_enter","geofence_exit","low_battery","speeding","offline","online"), nullable=False)
    severity    = db.Column(db.Enum("info","warning","critical"), nullable=False, default="warning")
    message     = db.Column(db.Text,        nullable=False)
    location_id = db.Column(db.BigInteger,  db.ForeignKey("locations.id"), nullable=True)
    geofence_id = db.Column(db.Integer,     db.ForeignKey("geofences.id"), nullable=True)
    is_read     = db.Column(db.Boolean,     nullable=False, default=False)
    created_at  = db.Column(db.DateTime,    nullable=False, default=datetime.utcnow)

    device   = db.relationship("Device")
    owner    = db.relationship("User")

    def to_dict(self):
        return {
            "id":          self.uuid,
            "device_id":   self.device.uuid if self.device else None,
            "device_name": self.device.name  if self.device else None,
            "type":        self.type,
            "severity":    self.severity,
            "message":     self.message,
            "is_read":     self.is_read,
            "created_at":  self.created_at.isoformat(),
        }
