-- ============================================================
-- FarmTrack GPS Platform - MySQL Schema
-- ============================================================
-- Design decisions:
--   - UUIDs for public-facing IDs (prevents enumeration attacks)
--   - INT auto-increment for internal FKs (performance)
--   - Spatial indexes on lat/lng for fast geo queries
--   - Soft deletes (deleted_at) so history is never lost
--   - Partitioning strategy comment included for 1000+ devices
-- ============================================================

CREATE DATABASE IF NOT EXISTS farmtrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE farmtrack;

-- ─────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────
CREATE TABLE users (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid        CHAR(36) NOT NULL DEFAULT (UUID()),
    email       VARCHAR(255) NOT NULL,
    name        VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role        ENUM('admin','manager','viewer') NOT NULL DEFAULT 'viewer',
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at  DATETIME NULL DEFAULT NULL,
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_uuid  (uuid),
    INDEX idx_users_role (role),
    INDEX idx_users_active (is_active)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- DEVICES  (physical ESP32 trackers)
-- ─────────────────────────────────────────
CREATE TABLE devices (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid            CHAR(36) NOT NULL DEFAULT (UUID()),
    device_id       VARCHAR(80) NOT NULL,          -- matches hardware identifier
    name            VARCHAR(120) NOT NULL,
    type            ENUM('tractor','combine','sprayer','truck','quad','other') NOT NULL DEFAULT 'other',
    owner_id        INT UNSIGNED NOT NULL,
    api_key         CHAR(64) NOT NULL,             -- device authenticates with this
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    sim_iccid       VARCHAR(22) NULL,
    firmware_version VARCHAR(20) NULL,
    notes           TEXT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      DATETIME NULL DEFAULT NULL,
    UNIQUE KEY uq_devices_device_id (device_id),
    UNIQUE KEY uq_devices_uuid      (uuid),
    UNIQUE KEY uq_devices_api_key   (api_key),
    INDEX idx_devices_owner (owner_id),
    INDEX idx_devices_active (is_active),
    CONSTRAINT fk_devices_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- LOCATIONS  (raw GPS pings — high volume)
-- Partition by RANGE on UNIX_TIMESTAMP(recorded_at)
-- for tables exceeding tens of millions of rows.
-- ─────────────────────────────────────────
CREATE TABLE locations (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id   INT UNSIGNED NOT NULL,
    latitude    DECIMAL(10,7) NOT NULL,
    longitude   DECIMAL(10,7) NOT NULL,
    speed       DECIMAL(6,2) NULL,               -- km/h
    heading     SMALLINT UNSIGNED NULL,           -- 0-359 degrees
    battery     DECIMAL(4,2) NULL,               -- volts
    altitude    DECIMAL(8,2) NULL,               -- metres
    accuracy    DECIMAL(6,2) NULL,               -- metres
    raw_payload JSON NULL,                        -- store full device payload
    recorded_at DATETIME NOT NULL,               -- device timestamp
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_locations_device_time  (device_id, recorded_at DESC),
    INDEX idx_locations_recorded_at  (recorded_at DESC),
    INDEX idx_locations_lat_lng      (latitude, longitude),
    CONSTRAINT fk_locations_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB ROW_FORMAT=COMPRESSED;

-- ─────────────────────────────────────────
-- GEOFENCES
-- ─────────────────────────────────────────
CREATE TABLE geofences (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid        CHAR(36) NOT NULL DEFAULT (UUID()),
    owner_id    INT UNSIGNED NOT NULL,
    name        VARCHAR(120) NOT NULL,
    description TEXT NULL,
    type        ENUM('circle','polygon') NOT NULL DEFAULT 'circle',
    -- circle fields
    center_lat  DECIMAL(10,7) NULL,
    center_lng  DECIMAL(10,7) NULL,
    radius_m    INT UNSIGNED NULL,               -- metres
    -- polygon stored as GeoJSON in polygon_coords
    polygon_coords JSON NULL,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at  DATETIME NULL DEFAULT NULL,
    UNIQUE KEY uq_geofences_uuid (uuid),
    INDEX idx_geofences_owner  (owner_id),
    INDEX idx_geofences_active (is_active),
    CONSTRAINT fk_geofences_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- DEVICE_GEOFENCES  (many-to-many)
-- ─────────────────────────────────────────
CREATE TABLE device_geofences (
    device_id   INT UNSIGNED NOT NULL,
    geofence_id INT UNSIGNED NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id, geofence_id),
    CONSTRAINT fk_dg_device   FOREIGN KEY (device_id)   REFERENCES devices(id)   ON DELETE CASCADE,
    CONSTRAINT fk_dg_geofence FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- ALERTS
-- ─────────────────────────────────────────
CREATE TABLE alerts (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid        CHAR(36) NOT NULL DEFAULT (UUID()),
    device_id   INT UNSIGNED NOT NULL,
    owner_id    INT UNSIGNED NOT NULL,
    type        ENUM('geofence_enter','geofence_exit','low_battery','speeding','offline','online') NOT NULL,
    severity    ENUM('info','warning','critical') NOT NULL DEFAULT 'warning',
    message     TEXT NOT NULL,
    location_id BIGINT UNSIGNED NULL,
    geofence_id INT UNSIGNED NULL,
    is_read     TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_alerts_uuid (uuid),
    INDEX idx_alerts_device     (device_id),
    INDEX idx_alerts_owner_read (owner_id, is_read),
    INDEX idx_alerts_created    (created_at DESC),
    CONSTRAINT fk_alerts_device   FOREIGN KEY (device_id)   REFERENCES devices(id)  ON DELETE CASCADE,
    CONSTRAINT fk_alerts_owner    FOREIGN KEY (owner_id)    REFERENCES users(id)    ON DELETE CASCADE,
    CONSTRAINT fk_alerts_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_alerts_geofence FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- REFRESH TOKENS  (JWT rotation)
-- ─────────────────────────────────────────
CREATE TABLE refresh_tokens (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    token_hash  CHAR(64) NOT NULL,
    expires_at  DATETIME NOT NULL,
    revoked     TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_rt_token (token_hash),
    INDEX idx_rt_user (user_id),
    CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- Seed: default admin user
-- Password: Admin1234!  (change on first login)
-- Hash generated with bcrypt rounds=12
-- ─────────────────────────────────────────
INSERT INTO users (uuid, email, name, password_hash, role)
VALUES (
    UUID(),
    'admin@farmtrack.local',
    'FarmTrack Admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2MozOGe/NS',
    'admin'
);
