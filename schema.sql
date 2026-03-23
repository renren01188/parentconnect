-- ============================================================
-- ParentConnect Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS parentconnect_db;
USE parentconnect_db;

-- ── Students ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  student_id   VARCHAR(50)  NOT NULL UNIQUE,
  first_name   VARCHAR(100) NOT NULL,
  middle_name  VARCHAR(100),
  last_name    VARCHAR(100) NOT NULL,
  suffix       VARCHAR(20),
  gender       VARCHAR(20)  NOT NULL,
  grade        VARCHAR(50)  NOT NULL,
  section      VARCHAR(100) NOT NULL,
  rfid_card    VARCHAR(100),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Parents ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parents (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  student_id          VARCHAR(50)  NOT NULL,
  parent_first_name   VARCHAR(100) NOT NULL,
  parent_middle_name  VARCHAR(100),
  parent_last_name    VARCHAR(100) NOT NULL,
  parent_suffix       VARCHAR(20),
  relationship        VARCHAR(50)  NOT NULL,
  contact_number      VARCHAR(20)  NOT NULL,
  email               VARCHAR(255) NOT NULL UNIQUE,
  temp_password       VARCHAR(255),          -- bcrypt hashed temporary password
  password            VARCHAR(255),          -- bcrypt hashed real password (set by parent)
  password_set        TINYINT(1) DEFAULT 0,  -- 0 = temp password, 1 = real password set
  status              ENUM('pending','approved','rejected') DEFAULT 'pending',
  reset_token         VARCHAR(255),
  reset_token_expiry  DATETIME,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);