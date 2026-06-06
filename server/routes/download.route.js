const express = require('express')
const router = express.Router()
const pool = require('../db/connection')
const { logAttack } = require('../db/logger')

const severityMap = {
  LOW: 3,
  MEDIUM: 5,
  HIGH: 7,
  CRITICAL: 9
};

router.get('/', async (req, res) => {
  const { file } = req.query
  const userId = req.headers['x-user-id'] || 1
  
  // Clean IP
  let clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  clientIp = clientIp.replace(/^::ffff:/, '');
  if (clientIp === '::1') clientIp = '127.0.0.1';

  const fileLower = (file || '').toLowerCase();
  
  // Detect traversal patterns
  const traversalPatterns = [
    '../', '..\\', 'etc/passwd', 'win.ini', 'boot.ini', 
    'api_keys.json', '.env', 'config.php', 'web.config',
    'passwd', 'shadow', 'id_rsa', '.ssh/', 'aws_credentials'
  ];
  
  let isTraversal = false;
  let detectedPattern = null;
  
  for (const pattern of traversalPatterns) {
    if (fileLower.includes(pattern)) {
      isTraversal = true;
      detectedPattern = pattern;
      break;
    }
  }

  // Check for honeytoken file access
  const isHoneytokenKeys = fileLower.includes('api_keys.json');

  if (isTraversal || isHoneytokenKeys) {
    console.log(`[TRAVERSAL DETECTED] Pattern: ${detectedPattern}, File: ${file}, IP: ${clientIp}`);
    await logAttack(req, {
      attackType: 'traversal',
      severity: isHoneytokenKeys ? severityMap.CRITICAL : severityMap.HIGH,
      payload: file,
      responseCode: 200
    });
  }

  // DECEPTION TECHNOLOGY: Serve convincing fake system files
  let fileContent = null;
  let traversalDetected = isTraversal;

  if (isHoneytokenKeys) {
    // Fake AWS credentials and API keys (honeytoken)
    fileContent = JSON.stringify({
      "aws_access_key_id": "AKIAIOSFODNN7DECOYKEY",
      "aws_secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYDECOYKEY",
      "securebank_api_key": "sb_live_honey_7f8d9e3c2a1b4f6e8d7c9a0b",
      "neon_db_password": "npg_cOm9C8ezuMjV_DECOY_PASSWORD",
      "jwt_secret": "securebank_honey_secret_key_55667788",
      "stripe_api_key": "sk_test_honey_4eC39HqLyjWDarjtT1zdp7dc",
      "note": "⚠️ THESE ARE DECOY CREDENTIALS - ALL ACCESS IS MONITORED ⚠️"
    }, null, 2);
  } 
  else if (fileLower.includes('passwd')) {
    // Fake /etc/passwd file
    fileContent = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/var/run/ircd:/usr/sbin/nologin
gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
systemd-network:x:100:102:systemd Network Management,,,:/run/systemd:/usr/sbin/nologin
systemd-resolve:x:101:103:systemd Resolver,,,:/run/systemd:/usr/sbin/nologin
honey_admin:x:1001:1001:SecureBank Honeypot Admin:/home/honey_admin:/bin/bash
db_admin:x:1002:1002:Database Administrator:/home/db_admin:/bin/bash
# ⚠️ WARNING: This is a decoy file. Any authentication attempts will be logged and reported to SOC. ⚠️`;
  } 
  else if (fileLower.includes('.env')) {
    // Fake environment variables
    fileContent = `# SecureBank Environment Configuration (DECOY)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=securebank_prod
DB_USER=admin
DB_PASSWORD=SecureBank2024!DecoyPassword
JWT_SECRET=super_secret_jwt_key_honeypot_7f3e9a2b
API_KEY=sk_live_honey_4eC39HqLyjWDarjtT1zdp7dc
AWS_ACCESS_KEY=AKIAIOSFODNN7DECOYKEY
AWS_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYDECOYKEY
STRIPE_WEBHOOK_SECRET=whsec_honey_5f2e9d8c7b6a5
ADMIN_EMAIL=admin@securebank-decoy.com
# ⚠️ THESE ARE DECOY CREDENTIALS - MONITORED BY SECURITY TEAM ⚠️`;
  }
  else if (isTraversal) {
    // Warning message for detected traversal attacks
    fileContent = `╔══════════════════════════════════════════════════════════════╗
║  ⚠️  PATH TRAVERSAL ATTACK DETECTED AND BLOCKED  ⚠️              ║
╠════════════════════════════════════════════════════════════════╣
║  IP Address: ${clientIp.padEnd(42)}║
║  Target: ${(file || 'unknown').substring(0, 42).padEnd(42)}║
║  Timestamp: ${new Date().toISOString().padEnd(42)}║
╠════════════════════════════════════════════════════════════════╣
║  This incident has been logged and reported to the SOC team.  ║
║  Your activity is being monitored.                             ║
╚════════════════════════════════════════════════════════════════╝`;
  }

  // Fetch available files for download table (decoy data)
  let availableFiles = [];
  try {
    const result = await pool.query(
      `SELECT 
        transaction_id,
        remarks as description, 
        created_at,
        amount
      FROM transactions 
      WHERE from_user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 8`,
      [userId]
    );
    
    availableFiles = result.rows.map(f => ({
      id: f.transaction_id,
      name: `statement_${f.transaction_id}_${f.created_at.toISOString().split('T')[0]}.pdf`,
      description: (f.description || 'Transaction statement').substring(0, 50),
      date: f.created_at,
      amount: parseFloat(f.amount)
    }));
  } catch (err) {
    console.error('Error fetching download records:', err.message);
  }

  // Add decoy files to lure attackers
  const decoyFiles = [
    { name: 'api_keys.json', date: new Date(), sensitive: true, size: '2.4 KB' },
    { name: 'database_backup.sql', date: new Date(Date.now() - 86400000), sensitive: true, size: '15.7 MB' },
    { name: 'employee_salaries.xlsx', date: new Date(Date.now() - 172800000), sensitive: true, size: '128 KB' },
    { name: 'server_config.conf', date: new Date(Date.now() - 259200000), sensitive: true, size: '8.3 KB' },
    { name: 'customer_ssn_export.csv', date: new Date(Date.now() - 345600000), sensitive: true, size: '2.1 MB' }
  ];
  
  availableFiles.push(...decoyFiles);

  res.json({
    success: true,
    requested_file: file || 'none',
    traversal_detected: traversalDetected,
    message: traversalDetected 
      ? '⚠️ DIRECTORY TRAVERSAL ATTACK DETECTED! Access logged.' 
      : file 
        ? `Processing download request for: ${file}` 
        : 'No file specified',
    file_content: fileContent,
    available_files: availableFiles,
    decoy_notice: isHoneytokenKeys || fileLower.includes('passwd') || fileLower.includes('.env')
      ? '⚠️ This is a decoy file. Access has been logged.' 
      : null
  })
})

module.exports = router