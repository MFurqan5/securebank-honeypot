const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('securebank.db');

console.log('\n' + '='.repeat(60));
console.log('SECUREBANK DATABASE - ALL TABLES AND DATA');
console.log('='.repeat(60) + '\n');

// Get all tables
db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    tables.forEach(table => {
        console.log(`\n📁 TABLE: ${table.name.toUpperCase()}`);
        console.log('-'.repeat(40));
        
        db.all(`SELECT * FROM ${table.name}`, [], (err, rows) => {
            if (rows.length === 0) {
                console.log('   (Empty table)\n');
            } else {
                console.log(`   Total rows: ${rows.length}\n`);
                rows.forEach((row, index) => {
                    console.log(`   Row ${index + 1}:`);
                    Object.keys(row).forEach(key => {
                        let value = row[key];
                        if (value && value.length > 50) value = value.substring(0, 50) + '...';
                        console.log(`      ${key}: ${value}`);
                    });
                    console.log('');
                });
            }
        });
    });
    
    setTimeout(() => db.close(), 1000);
});
