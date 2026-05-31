const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 5002;

app.use(cors());
app.use(express.json());

// Initialize SQLite database
const dbPath = path.join(__dirname, 'securebank.db');
const db = new sqlite3.Database(dbPath);

// Create tables with correct schema
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        full_name TEXT,
        account_balance REAL,
        account_number TEXT,
        role TEXT
    )`);
    
    // Transactions table with user_id column
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        description TEXT,
        amount REAL,
        type TEXT,
        category TEXT,
        user_id INTEGER
    )`);
    
    // Comments table
    db.run(`CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author TEXT,
        content TEXT,
        created_at TEXT
    )`);
    
    // Attack logs table
    db.run(`CREATE TABLE IF NOT EXISTS attack_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        source_ip TEXT,
        attack_type TEXT,
        severity TEXT,
        payload TEXT,
        path TEXT
    )`);
    
    // Insert sample users
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (row && row.count === 0) {
            const users = [
                [1, 'john_doe', 'password123', 'John Doe', 15420.50, 'ACC10001', 'customer'],
                [2, 'admin', 'admin123', 'System Admin', 999999.99, 'ACC10999', 'admin'],
                [3, 'jane_smith', 'qwerty456', 'Jane Smith', 89300.75, 'ACC10002', 'customer'],
                [4, 'robert_brown', 'brown2024', 'Robert Brown', 12500.00, 'ACC10003', 'customer']
            ];
            const stmt = db.prepare("INSERT INTO users (id, username, password, full_name, account_balance, account_number, role) VALUES (?, ?, ?, ?, ?, ?, ?)");
            users.forEach(u => stmt.run(u));
            stmt.finalize();
            console.log('✅ Users created');
        }
    });
    
    // Insert sample transactions with user_id
    db.get("SELECT COUNT(*) as count FROM transactions", (err, row) => {
        if (row && row.count === 0) {
            const transactions = [
                ['2025-05-28', 'Salary Deposit', 5000, 'credit', 'Income', 1],
                ['2025-05-27', 'Amazon Purchase', 125.50, 'debit', 'Shopping', 1],
                ['2025-05-26', 'Transfer to Savings', 500, 'debit', 'Transfer', 1],
                ['2025-05-25', 'Interest Credit', 45.20, 'credit', 'Income', 1],
                ['2025-05-24', 'Netflix Subscription', 15.99, 'debit', 'Entertainment', 1],
                ['2025-05-23', 'Uber Ride', 25.00, 'debit', 'Transport', 1],
                ['2025-05-22', 'Restaurant Dinner', 85.30, 'debit', 'Food', 1],
                ['2025-05-21', 'Freelance Payment', 1200, 'credit', 'Income', 1]
            ];
            const stmt = db.prepare("INSERT INTO transactions (date, description, amount, type, category, user_id) VALUES (?, ?, ?, ?, ?, ?)");
            transactions.forEach(t => stmt.run(t));
            stmt.finalize();
            console.log('✅ Transactions created');
        }
    });
    
    console.log('✅ Database initialized');
});

// Helper functions
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
        });
    });
}

// ============================================
// SQL INJECTION VULNERABLE LOGIN
// ============================================
app.post('/api/login', async (req, res) => {
    let { username, password } = req.body;
    
    console.log(`\n🔐 Login Attempt:`);
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    
    // Check for SQL injection patterns
    const sqlPatterns = [
        "' OR '1'='1", "' OR 1=1", "'--", "admin'--", "' OR '1'='1'--",
        "admin' OR '1'='1'--", "' OR 1=1 --", "1' OR '1'='1"
    ];
    
    let isSqlInjection = false;
    for (const pattern of sqlPatterns) {
        if (username.includes(pattern)) {
            isSqlInjection = true;
            console.log(`   🎯 SQL INJECTION DETECTED! Pattern: ${pattern}`);
            break;
        }
    }
    
    if (isSqlInjection) {
        await run(`INSERT INTO attack_logs (timestamp, source_ip, attack_type, severity, payload, path)
                  VALUES (?, ?, ?, ?, ?, ?)`,
                  [new Date().toISOString(), req.ip, 'SQL_INJECTION', 'CRITICAL', username, '/api/login']);
        
        // Return first user (authentication bypassed)
        const users = await query("SELECT * FROM users LIMIT 1");
        if (users.length > 0) {
            console.log(`   ✅ SQL INJECTION SUCCESSFUL! Logged in as: ${users[0].full_name}`);
            return res.json({ success: true, message: 'SQL Injection Successful!', user: users[0] });
        }
    }
    
    // VULNERABLE: Direct string concatenation
    const sqlQuery = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    console.log(`   SQL Query: ${sqlQuery}`);
    
    try {
        const users = await query(sqlQuery);
        if (users.length > 0) {
            console.log(`   ✅ Login successful: ${users[0].full_name}`);
            res.json({ success: true, user: users[0] });
        } else {
            console.log(`   ❌ Login failed`);
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Database error', error: err.message });
    }
});

// ============================================
// Get user transactions
// ============================================
app.get('/api/transactions', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.json([]);
    
    const transactions = await query("SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC", [userId]);
    res.json(transactions);
});

// ============================================
// Get analytics
// ============================================
app.get('/api/analytics', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];
    
    let transactions;
    if (userRole === 'admin') {
        transactions = await query("SELECT * FROM transactions ORDER BY date DESC");
    } else {
        transactions = await query("SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC", [userId]);
    }
    
    const totalIncome = transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
    
    const categories = {};
    transactions.forEach(t => {
        if (t.category && t.type === 'debit') {
            categories[t.category] = (categories[t.category] || 0) + t.amount;
        }
    });
    
    res.json({
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_savings: totalIncome - totalExpenses,
        transaction_count: transactions.length,
        transactions: transactions,
        category_breakdown: categories,
        average_transaction: transactions.length > 0 ? (totalIncome + totalExpenses) / transactions.length : 0
    });
});

// ============================================
// Search (XSS Vulnerable)
// ============================================
app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    const userId = req.headers['x-user-id'];
    
    // Log XSS attempt
    if (q && (q.includes('<script') || q.includes('alert') || q.includes('onerror'))) {
        await run(`INSERT INTO attack_logs (timestamp, source_ip, attack_type, severity, payload, path)
                  VALUES (?, ?, ?, ?, ?, ?)`,
                  [new Date().toISOString(), req.ip, 'REFLECTED_XSS', 'HIGH', q, '/api/search']);
    }
    
    // VULNERABLE: SQL Injection in search
    let results = [];
    try {
        const sql = `SELECT * FROM transactions WHERE user_id = ${userId} AND description LIKE '%${q || ''}%'`;
        results = await query(sql);
    } catch (err) {
        console.log('Search error:', err.message);
    }
    
    // VULNERABLE: Reflected XSS - returning unescaped input
    res.json({
        query: q,
        results: results,
        message: results.length > 0 ? `Found ${results.length} results` : 'No results found',
        html: `<div class="search-result">You searched for: <span style="color:red">${q || ''}</span></div>`
    });
});

// ============================================
// Comments (Stored XSS)
// ============================================
app.get('/api/comments', async (req, res) => {
    const comments = await query("SELECT * FROM comments ORDER BY created_at DESC");
    res.json(comments);
});

app.post('/api/comments', async (req, res) => {
    const { author, content } = req.body;
    
    if (content && (content.includes('<script') || content.includes('onerror') || content.includes('alert'))) {
        await run(`INSERT INTO attack_logs (timestamp, source_ip, attack_type, severity, payload, path)
                  VALUES (?, ?, ?, ?, ?, ?)`,
                  [new Date().toISOString(), req.ip, 'STORED_XSS', 'CRITICAL', content, '/api/comments']);
    }
    
    const result = await run(
        "INSERT INTO comments (author, content, created_at) VALUES (?, ?, ?)",
        [author || 'Anonymous', content || '', new Date().toISOString()]
    );
    
    const newComment = await query("SELECT * FROM comments WHERE id = ?", [result.id]);
    res.json(newComment[0]);
});

// ============================================
// Download (Directory Traversal)
// ============================================
app.get('/api/download', async (req, res) => {
    const { file } = req.query;
    const userId = req.headers['x-user-id'];
    
    let traversalDetected = false;
    let fileContent = null;
    
    if (file && (file.includes('../') || file.includes('..\\') || file.includes('etc/passwd'))) {
        traversalDetected = true;
        await run(`INSERT INTO attack_logs (timestamp, source_ip, attack_type, severity, payload, path)
                  VALUES (?, ?, ?, ?, ?, ?)`,
                  [new Date().toISOString(), req.ip, 'DIRECTORY_TRAVERSAL', 'HIGH', file, '/api/download']);
        
        fileContent = `[!] DIRECTORY TRAVERSAL ATTEMPT DETECTED AND LOGGED!\n[!] IP: ${req.ip}\n[!] File: ${file}\n[!] This is a honeypot system.`;
    }
    
    const files = await query("SELECT description, date FROM transactions WHERE user_id = ? LIMIT 5", [userId || 1]);
    
    res.json({
        requested_file: file,
        traversal_detected: traversalDetected,
        message: traversalDetected ? '⚠️ DIRECTORY TRAVERSAL ATTACK DETECTED!' : `Downloading: ${file}`,
        file_content: fileContent,
        available_files: files.map(f => ({ name: `${f.description}.pdf`, date: f.date }))
    });
});

// ============================================
// Session (Weak Tokens)
// ============================================
app.get('/api/session', async (req, res) => {
    const { user_id } = req.query;
    const timestamp = Date.now();
    const targetId = user_id || 1;
    const weakToken = Buffer.from(`${targetId}:${timestamp}`).toString('base64');
    const decodedToken = Buffer.from(weakToken, 'base64').toString();
    
    const user = await query("SELECT * FROM users WHERE id = ?", [targetId]);
    
    res.json({
        session_token: weakToken,
        token_format: 'base64(user_id:timestamp)',
        current_user: user[0] || null,
        token_decoded: decodedToken,
        timestamp: timestamp,
        token_strength: 'WEAK - Easily predictable'
    });
});

// ============================================
// User Management
// ============================================
app.get('/api/users', async (req, res) => {
    const users = await query("SELECT id, username, full_name, account_balance, account_number, role FROM users");
    res.json(users);
});

app.post('/api/users', async (req, res) => {
    const { username, password, full_name, role } = req.body;
    const account_number = `ACC${Math.floor(Math.random() * 100000)}`;
    
    const result = await run(
        "INSERT INTO users (username, password, full_name, account_balance, account_number, role) VALUES (?, ?, ?, ?, ?, ?)",
        [username, password, full_name, 0, account_number, role || 'customer']
    );
    
    const newUser = await query("SELECT * FROM users WHERE id = ?", [result.id]);
    res.json(newUser[0]);
});

app.put('/api/users/:id/balance', async (req, res) => {
    const { amount } = req.body;
    const userId = req.params.id;
    
    await run("UPDATE users SET account_balance = account_balance + ? WHERE id = ?", [amount, userId]);
    const updatedUser = await query("SELECT * FROM users WHERE id = ?", [userId]);
    res.json(updatedUser[0]);
});

app.delete('/api/users/:id', async (req, res) => {
    await run("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ success: true });
});

// ============================================
// SOC Dashboard
// ============================================
app.get('/api/soc/events', async (req, res) => {
    const events = await query("SELECT * FROM attack_logs ORDER BY timestamp DESC LIMIT 50");
    res.json({ events });
});

app.get('/api/soc/stats', async (req, res) => {
    const stats = await query("SELECT attack_type, COUNT(*) as count FROM attack_logs GROUP BY attack_type");
    const total = await query("SELECT COUNT(*) as total FROM attack_logs");
    res.json({
        attacks_by_type: stats,
        total_attacks: total[0]?.total || 0
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'SecureBank Honeypot Running', port: PORT });
});

app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log('🔴 SECUREBANK HONEYPOT - BACKEND RUNNING');
    console.log('='.repeat(60));
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`💾 Database: SQLite (securebank.db)\n`);
    console.log('🎯 SQL INJECTION TEST:');
    console.log('   Username: admin\' OR \'1\'=\'1\'--');
    console.log('   Password: anything\n');
    console.log('='.repeat(60));
});
