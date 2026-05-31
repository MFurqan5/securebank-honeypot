const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('securebank.db');

// USERS TABLE
console.log('\n========== USERS ==========');
db.all("SELECT id, username, password, full_name, account_balance, role FROM users", (err, rows) => {
    console.table(rows);
    
    // TRANSACTIONS TABLE
    console.log('\n========== TRANSACTIONS ==========');
    db.all("SELECT id, date, description, amount, type FROM transactions", (err, rows) => {
        console.table(rows);
        
        // COMMENTS TABLE
        console.log('\n========== COMMENTS ==========');
        db.all("SELECT id, author, substr(content,1,50) as content, created_at FROM comments", (err, rows) => {
            console.table(rows);
            
            // ATTACK LOGS TABLE
            console.log('\n========== ATTACK LOGS ==========');
            db.all("SELECT id, timestamp, attack_type, severity, substr(payload,1,40) as payload FROM attack_logs ORDER BY id DESC LIMIT 10", (err, rows) => {
                console.table(rows);
                db.close();
            });
        });
    });
});
