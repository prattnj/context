-- context database schema
-- Run once, manually:  mysql -u <user> -p < schema.sql

CREATE DATABASE IF NOT EXISTS context
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE context;

-- One row per distinct conversation. For 1:1 threads, address_key is the
-- normalized phone number; for group MMS it is the sorted, comma-joined set
-- of normalized participant numbers (excluding your own).
CREATE TABLE IF NOT EXISTS conversations (
  id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  address_key   VARCHAR(512)     NOT NULL,
  display_name  VARCHAR(255)     NOT NULL DEFAULT '',
  is_group      TINYINT(1)       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversations_address_key (address_key)
) ENGINE=InnoDB;

-- Both SMS and MMS live here. Precomputed local-time buckets
-- (America/Denver) keep stat queries fast and avoid CONVERT_TZ.
CREATE TABLE IF NOT EXISTS messages (
  id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  conversation_id INT UNSIGNED     NOT NULL,
  kind            ENUM('sms','mms') NOT NULL,
  direction       ENUM('received','sent') NOT NULL,
  -- For group messages, who sent it (normalized number); NULL for 1:1.
  sender_address  VARCHAR(64)      NULL,
  contact_name    VARCHAR(255)     NOT NULL DEFAULT '',
  body            MEDIUMTEXT       NULL,
  char_count      INT UNSIGNED     NOT NULL DEFAULT 0,
  date_ms         BIGINT UNSIGNED  NOT NULL,       -- epoch millis (UTC)
  local_date      DATE             NOT NULL,       -- America/Denver
  local_month     CHAR(7)          NOT NULL,       -- 'YYYY-MM'
  local_hour      TINYINT UNSIGNED NOT NULL,       -- 0-23
  has_media       TINYINT(1)       NOT NULL DEFAULT 0,
  -- SHA-1 of stable source fields; makes re-imports idempotent.
  dedupe_hash     CHAR(40)         NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_messages_dedupe (dedupe_hash),
  KEY idx_messages_conv_date (conversation_id, date_ms),
  KEY idx_messages_date (date_ms),
  KEY idx_messages_local_date (local_date),
  KEY idx_messages_local_month (local_month),
  CONSTRAINT fk_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations (id)
) ENGINE=InnoDB;

-- MMS attachments. Bytes live on disk under ./data/media/; the DB stores
-- metadata so files remain discoverable and machine-readable. file_path is
-- relative to the media root, named <sha1>.<ext> so duplicates collapse.
CREATE TABLE IF NOT EXISTS media (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id    BIGINT UNSIGNED NOT NULL,
  seq           INT             NOT NULL DEFAULT 0,
  content_type  VARCHAR(128)    NOT NULL,
  original_name VARCHAR(255)    NULL,
  file_path     VARCHAR(512)    NOT NULL,
  byte_size     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sha1          CHAR(40)        NOT NULL,
  PRIMARY KEY (id),
  KEY idx_media_message (message_id),
  KEY idx_media_sha1 (sha1),
  CONSTRAINT fk_media_message
    FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS calls (
  id            BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  number        VARCHAR(64)      NOT NULL,
  contact_name  VARCHAR(255)     NOT NULL DEFAULT '',
  -- 1 incoming, 2 outgoing, 3 missed, 4 voicemail, 5 rejected, 6 blocked
  call_type     TINYINT UNSIGNED NOT NULL,
  duration_s    INT UNSIGNED     NOT NULL DEFAULT 0,
  date_ms       BIGINT UNSIGNED  NOT NULL,
  local_date    DATE             NOT NULL,
  local_month   CHAR(7)          NOT NULL,
  local_hour    TINYINT UNSIGNED NOT NULL,
  dedupe_hash   CHAR(40)         NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_calls_dedupe (dedupe_hash),
  KEY idx_calls_date (date_ms),
  KEY idx_calls_local_month (local_month)
) ENGINE=InnoDB;

-- Cached Gemini month summaries.
CREATE TABLE IF NOT EXISTS ai_summaries (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  month       CHAR(7)      NOT NULL,          -- 'YYYY-MM'
  model       VARCHAR(64)  NOT NULL,
  summary     MEDIUMTEXT   NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_summaries_month (month)
) ENGINE=InnoDB;
