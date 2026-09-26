-- Signit API schema (people pilot)
-- Import into your cPanel MySQL database via phpMyAdmin.
-- Compatible with MySQL 5.7+ / MariaDB 10.2+.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(64)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(128) NOT NULL DEFAULT '',
    role          VARCHAR(32)  NOT NULL DEFAULT 'user',
    disabled      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at    DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
    token      CHAR(64) PRIMARY KEY,
    user_id    INT      NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS people (
    id                  VARCHAR(32) PRIMARY KEY,
    category            VARCHAR(32)  NOT NULL,
    first_name          VARCHAR(128) NOT NULL DEFAULT '',
    last_name           VARCHAR(128) NOT NULL DEFAULT '',
    father_name         VARCHAR(128) NOT NULL DEFAULT '',
    phones              LONGTEXT     NULL,   -- JSON array of strings
    addresses           LONGTEXT     NULL,   -- JSON array of strings
    sex                 VARCHAR(16)  NULL,
    company_name        VARCHAR(255) NOT NULL DEFAULT '',
    county              VARCHAR(128) NOT NULL DEFAULT '',
    city                VARCHAR(128) NOT NULL DEFAULT '',
    postal_code         VARCHAR(32)  NOT NULL DEFAULT '',
    national_code       VARCHAR(32)  NOT NULL DEFAULT '',
    iban                VARCHAR(64)  NOT NULL DEFAULT '',
    bank_account_number VARCHAR(64)  NOT NULL DEFAULT '',
    card_no             VARCHAR(64)  NOT NULL DEFAULT '',   -- attendance device card number
    birth_date          VARCHAR(32)  NOT NULL DEFAULT '',
    description         TEXT         NULL,
    created_by          INT          NULL,
    updated_by          INT          NULL,
    created_at          DATETIME     NOT NULL,
    updated_at          DATETIME     NOT NULL,
    deleted_at          DATETIME     NULL,
    INDEX idx_people_category (category),
    INDEX idx_people_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Atomic sequence source for category-prefixed people IDs (people_0/1/2),
-- monthly order numbers (order_YYMM), and future use.
CREATE TABLE IF NOT EXISTS counters (
    name  VARCHAR(64) PRIMARY KEY,
    value INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Links an EMPLOYEE People record to its employee login. Kept as a separate
-- table because users is created before people and existing user accounts must
-- stay untouched. The People route owns this one-to-one relationship.
CREATE TABLE IF NOT EXISTS employee_accounts (
    person_id       VARCHAR(32) PRIMARY KEY,
    user_id         INT         NOT NULL UNIQUE,
    created_at      DATETIME    NOT NULL,
    updated_at      DATETIME    NOT NULL,
    CONSTRAINT fk_employee_accounts_person FOREIGN KEY (person_id) REFERENCES people(id),
    CONSTRAINT fk_employee_accounts_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_settings (
    name       VARCHAR(64) PRIMARY KEY,
    value      LONGTEXT     NULL,
    updated_at DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Orders: a header (customer + date) holding multiple product items as JSON.
-- order_number is server-assigned (YYMMN, monthly reset). items[] mirrors the
-- client shape exactly (per-item spec, pricing, workflow state/history, weight).
CREATE TABLE IF NOT EXISTS orders (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    order_number  VARCHAR(24)  NOT NULL,
    date          VARCHAR(8)   NOT NULL DEFAULT '',   -- Jalali YYYYMMDD
    date_text     VARCHAR(64)  NOT NULL DEFAULT '',
    customer_id   VARCHAR(32)  NOT NULL DEFAULT '',
    customer_name VARCHAR(255) NOT NULL DEFAULT '',
    items         LONGTEXT     NULL,                  -- JSON array of items
    created_by    INT          NULL,
    updated_by    INT          NULL,
    created_at    DATETIME     NOT NULL,
    updated_at    DATETIME     NOT NULL,
    deleted_at    DATETIME     NULL,
    INDEX idx_orders_number (order_number),
    INDEX idx_orders_customer (customer_id),
    INDEX idx_orders_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Expenses: shared workshop expense tracker (amounts stored in Rial).
CREATE TABLE IF NOT EXISTS expenses (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    date        VARCHAR(8)   NOT NULL DEFAULT '',   -- Jalali YYYYMMDD
    date_text   VARCHAR(64)  NOT NULL DEFAULT '',
    title       VARCHAR(255) NOT NULL DEFAULT '',
    category    VARCHAR(64)  NOT NULL DEFAULT '',
    amount      BIGINT       NOT NULL DEFAULT 0,    -- Rial
    paid_to     VARCHAR(255) NOT NULL DEFAULT '',
    description TEXT         NULL,
    created_by  INT          NULL,
    updated_by  INT          NULL,
    created_at  DATETIME     NOT NULL,
    updated_at  DATETIME     NOT NULL,
    deleted_at  DATETIME     NULL,
    INDEX idx_expenses_date (date),
    INDEX idx_expenses_category (category),
    INDEX idx_expenses_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Outgoing-goods issue notes (برگه خروج). One product per note.
CREATE TABLE IF NOT EXISTS issue_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date VARCHAR(8) NOT NULL DEFAULT '', date_text VARCHAR(64) NOT NULL DEFAULT '', time VARCHAR(8) NOT NULL DEFAULT '',
    receiver_first_name VARCHAR(128) NOT NULL DEFAULT '', receiver_last_name VARCHAR(128) NOT NULL DEFAULT '',
    customer_name VARCHAR(255) NOT NULL DEFAULT '', product_name VARCHAR(255) NOT NULL DEFAULT '',
    quantity DECIMAL(14,3) NOT NULL DEFAULT 0, weight DECIMAL(14,3) NOT NULL DEFAULT 0,
    quantity_unit VARCHAR(64) NOT NULL DEFAULT '', packaging VARCHAR(255) NOT NULL DEFAULT '', description TEXT NULL,
    items LONGTEXT NULL, -- JSON array: productName, quantity, weight, quantityUnit, packaging, description
    created_by INT NULL, updated_by INT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, deleted_at DATETIME NULL,
    INDEX idx_issue_notes_date (date), INDEX idx_issue_notes_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Public inquiries submitted from the marketing landing page.
CREATE TABLE IF NOT EXISTS inquiries (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(255) NOT NULL DEFAULT '',
    phone       VARCHAR(64)  NOT NULL DEFAULT '',
    product     VARCHAR(255) NOT NULL DEFAULT '',
    quantity    VARCHAR(128) NOT NULL DEFAULT '',
    note        TEXT         NULL,
    source      VARCHAR(32)  NOT NULL DEFAULT 'direct',
    ip          VARCHAR(64)  NOT NULL DEFAULT '',
    user_agent  VARCHAR(255) NOT NULL DEFAULT '',
    created_at  DATETIME     NOT NULL,
    handled_at  DATETIME     NULL,
    INDEX idx_inquiries_created (created_at),
    INDEX idx_inquiries_handled (handled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Public job applications submitted from jobs.samanpoolak.ir.
CREATE TABLE IF NOT EXISTS job_applications (
    id                         INT AUTO_INCREMENT PRIMARY KEY,
    first_name                 VARCHAR(255) NOT NULL DEFAULT '',
    last_name                  VARCHAR(255) NOT NULL DEFAULT '',
    birth_date                 VARCHAR(32)  NOT NULL DEFAULT '',
    city                       VARCHAR(128) NOT NULL DEFAULT '',
    sahand_phase               VARCHAR(32)  NOT NULL DEFAULT '',
    has_car                    VARCHAR(16)  NOT NULL DEFAULT '',
    marital_status             VARCHAR(32)  NOT NULL DEFAULT '',
    children_count             INT          NOT NULL DEFAULT 0,
    military_status            VARCHAR(64)  NOT NULL DEFAULT '',
    military_exemption_reason  VARCHAR(64)  NOT NULL DEFAULT '',
    military_medical_detail    TEXT         NULL,
    military_explanation       TEXT         NULL,
    military_temp_expiry        VARCHAR(64)  NOT NULL DEFAULT '',
    education                  VARCHAR(64)  NOT NULL DEFAULT '',
    education_other            VARCHAR(255) NOT NULL DEFAULT '',
    education_field            VARCHAR(255) NOT NULL DEFAULT '',
    mobile                     VARCHAR(32)  NOT NULL DEFAULT '',
    has_work_experience        TINYINT(1)   NOT NULL DEFAULT 0,
    has_insurance              TINYINT(1)   NOT NULL DEFAULT 0,
    experience_notes           TEXT         NULL,
    status                     VARCHAR(32)  NOT NULL DEFAULT 'new',
    interview_at               VARCHAR(64)  NOT NULL DEFAULT '',
    ip                         VARCHAR(64)  NOT NULL DEFAULT '',
    user_agent                 VARCHAR(255) NOT NULL DEFAULT '',
    created_at                 DATETIME     NOT NULL,
    updated_at                 DATETIME     NOT NULL,
    INDEX idx_job_applications_status (status),
    INDEX idx_job_applications_created (created_at),
    INDEX idx_job_applications_city (city),
    INDEX idx_job_applications_mobile (mobile)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Markings: per-customer directory of stamp/engraving images. The image is
-- stored as a file under /uploads and `src` holds its URL.
CREATE TABLE IF NOT EXISTS markings (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    customer_id VARCHAR(32)  NOT NULL,
    name        VARCHAR(191) NOT NULL,
    src         LONGTEXT     NULL,                    -- URL to the uploaded image
    location    VARCHAR(128) NOT NULL DEFAULT '',
    created_by  INT          NULL,
    updated_by  INT          NULL,
    created_at  DATETIME     NOT NULL,
    updated_at  DATETIME     NOT NULL,
    deleted_at  DATETIME     NULL,
    INDEX idx_markings_customer (customer_id),
    INDEX idx_markings_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Attendance: one row per device/manual clock scan. Fed from the FaraTechno
-- device export (source='device') or entered by hand (source='manual'). The
-- unique key dedups device re-imports; manual rows are preserved.
CREATE TABLE IF NOT EXISTS attendance (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    card_no     VARCHAR(64)  NOT NULL DEFAULT '',
    date_key    VARCHAR(8)   NOT NULL DEFAULT '',   -- Jalali YYYYMMDD
    time        VARCHAR(5)   NOT NULL DEFAULT '',   -- HH:mm
    status      INT          NULL,
    insert_type INT          NULL,
    source      VARCHAR(16)  NOT NULL DEFAULT 'device',
    created_by  INT          NULL,
    updated_by  INT          NULL,
    created_at  DATETIME     NOT NULL,
    updated_at  DATETIME     NOT NULL,
    deleted_at  DATETIME     NULL,
    UNIQUE KEY uq_attendance_scan (card_no, date_key, time, source),
    INDEX idx_attendance_card (card_no),
    INDEX idx_attendance_date (date_key),
    INDEX idx_attendance_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Holidays: official Jalali holiday days, uploaded one YEAR.json per year from
-- Settings. Only holiday days are stored (Fridays are derived client-side).
-- date_key is unique; re-importing a year replaces that year's rows.
CREATE TABLE IF NOT EXISTS holidays (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    date_key    VARCHAR(8)   NOT NULL,              -- Jalali YYYYMMDD
    year        VARCHAR(4)   NOT NULL DEFAULT '',
    description VARCHAR(255) NOT NULL DEFAULT '',
    created_by  INT          NULL,
    updated_by  INT          NULL,
    created_at  DATETIME     NOT NULL,
    updated_at  DATETIME     NOT NULL,
    deleted_at  DATETIME     NULL,
    UNIQUE KEY uq_holidays_date (date_key),
    INDEX idx_holidays_year (year),
    INDEX idx_holidays_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Production: an assignment points to an existing order and its stable
-- items[].uid. Product/customer/specification data stays on the order item;
-- it is deliberately not copied into this table. An item can be split into
-- multiple tasks, so (order_id, order_item_uid) is indexed but not unique.
CREATE TABLE IF NOT EXISTS production_tasks (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    order_id         INT           NOT NULL,
    order_item_uid   VARCHAR(128)  NOT NULL,
    employee_user_id INT           NOT NULL,
    required_quantity DECIMAL(14,3) NOT NULL,
    weight_of_10_grams DECIMAL(14,3) NULL, -- measured by employee before first log
    assigned_date    VARCHAR(8)    NOT NULL DEFAULT '', -- Jalali YYYYMMDD
    assigned_by      INT           NOT NULL,
    status           VARCHAR(32)   NOT NULL DEFAULT 'ASSIGNED',
    created_at       DATETIME      NOT NULL,
    updated_at       DATETIME      NOT NULL,
    completed_at     DATETIME      NULL,
    deleted_at       DATETIME      NULL,
    CONSTRAINT fk_production_tasks_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_production_tasks_employee FOREIGN KEY (employee_user_id) REFERENCES users(id),
    CONSTRAINT fk_production_tasks_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id),
    INDEX idx_production_tasks_employee_status (employee_user_id, status),
    INDEX idx_production_tasks_order_item (order_id, order_item_uid),
    INDEX idx_production_tasks_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per submitted partial-production record. order_id/order_item_uid and
-- employee_user_id are copied from the authorized task by the API (not trusted
-- from the client) so history remains directly auditable and fast to aggregate.
CREATE TABLE IF NOT EXISTS production_logs (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    task_id             INT           NOT NULL,
    employee_user_id    INT           NOT NULL,
    order_id            INT           NOT NULL,
    order_item_uid      VARCHAR(128)  NOT NULL,
    quantity            DECIMAL(14,3) NOT NULL,
    total_weight_grams  DECIMAL(14,3) NOT NULL, -- snapshot from task's 10-piece measurement
    production_date     VARCHAR(8)    NOT NULL, -- Jalali YYYYMMDD
    submission_key      CHAR(36)      NOT NULL,
    created_at          DATETIME      NOT NULL,
    CONSTRAINT fk_production_logs_task FOREIGN KEY (task_id) REFERENCES production_tasks(id),
    CONSTRAINT fk_production_logs_employee FOREIGN KEY (employee_user_id) REFERENCES users(id),
    CONSTRAINT fk_production_logs_order FOREIGN KEY (order_id) REFERENCES orders(id),
    UNIQUE KEY uq_production_logs_submission (task_id, employee_user_id, submission_key),
    INDEX idx_production_logs_employee_date (employee_user_id, production_date),
    INDEX idx_production_logs_task (task_id),
    INDEX idx_production_logs_order_item (order_id, order_item_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- MIGRATION for an EXISTING live DB (the people table already exists, so the
-- card_no column above is NOT added by CREATE TABLE IF NOT EXISTS). Run this
-- ONCE in phpMyAdmin after deploying. The two new tables above are created by
-- their CREATE statements; only this ALTER is needed. (MySQL 8 has no
-- ADD COLUMN IF NOT EXISTS — run once; re-running errors harmlessly if present.)
--   ALTER TABLE people ADD COLUMN card_no VARCHAR(64) NOT NULL DEFAULT '' AFTER bank_account_number;
--
-- New landing inquiries table:
--   CREATE TABLE IF NOT EXISTS inquiries (
--       id INT AUTO_INCREMENT PRIMARY KEY,
--       name VARCHAR(255) NOT NULL DEFAULT '',
--       phone VARCHAR(64) NOT NULL DEFAULT '',
--       product VARCHAR(255) NOT NULL DEFAULT '',
--       quantity VARCHAR(128) NOT NULL DEFAULT '',
--       note TEXT NULL,
--       source VARCHAR(32) NOT NULL DEFAULT 'direct',
--       ip VARCHAR(64) NOT NULL DEFAULT '',
--       user_agent VARCHAR(255) NOT NULL DEFAULT '',
--       created_at DATETIME NOT NULL,
--       handled_at DATETIME NULL,
--       INDEX idx_inquiries_created (created_at),
--       INDEX idx_inquiries_handled (handled_at)
--   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--
-- New careers applications table:
--   CREATE TABLE IF NOT EXISTS job_applications (
--       id INT AUTO_INCREMENT PRIMARY KEY,
--       first_name VARCHAR(255) NOT NULL DEFAULT '',
--       last_name VARCHAR(255) NOT NULL DEFAULT '',
--       birth_date VARCHAR(32) NOT NULL DEFAULT '',
--       city VARCHAR(128) NOT NULL DEFAULT '',
--       sahand_phase VARCHAR(32) NOT NULL DEFAULT '',
--       has_car VARCHAR(16) NOT NULL DEFAULT '',
--       marital_status VARCHAR(32) NOT NULL DEFAULT '',
--       children_count INT NOT NULL DEFAULT 0,
--       military_status VARCHAR(64) NOT NULL DEFAULT '',
--       military_exemption_reason VARCHAR(64) NOT NULL DEFAULT '',
--       military_medical_detail TEXT NULL,
--       military_explanation TEXT NULL,
--       military_temp_expiry VARCHAR(64) NOT NULL DEFAULT '',
--       education VARCHAR(64) NOT NULL DEFAULT '',
--       education_other VARCHAR(255) NOT NULL DEFAULT '',
--       education_field VARCHAR(255) NOT NULL DEFAULT '',
--       mobile VARCHAR(32) NOT NULL DEFAULT '',
--       has_work_experience TINYINT(1) NOT NULL DEFAULT 0,
--       has_insurance TINYINT(1) NOT NULL DEFAULT 0,
--       experience_notes TEXT NULL,
--       status VARCHAR(32) NOT NULL DEFAULT 'new',
--       interview_at VARCHAR(64) NOT NULL DEFAULT '',
--       ip VARCHAR(64) NOT NULL DEFAULT '',
--       user_agent VARCHAR(255) NOT NULL DEFAULT '',
--       created_at DATETIME NOT NULL,
--       updated_at DATETIME NOT NULL,
--       INDEX idx_job_applications_status (status),
--       INDEX idx_job_applications_created (created_at),
--       INDEX idx_job_applications_city (city),
--       INDEX idx_job_applications_mobile (mobile)
--   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--
-- Employee login mapping and production tables are created by the CREATE
-- statements above.
-- On the live database, after deploying the API routes that use them, run the
-- three CREATE TABLE statements for employee_accounts, production_tasks, and
-- production_logs above
-- in phpMyAdmin. They are idempotent because they use IF NOT EXISTS.
-- ===========================================================================
