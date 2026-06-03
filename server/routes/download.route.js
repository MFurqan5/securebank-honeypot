const express = require('express')
const router = express.Router()
const pool = require('../db/connection')
const { logAttack } = require('../db/logger')

router.get('/', async (req, res) => {
  const { file } = req.query
  const userId = req.headers['x-user-id'] || 1

  const fileLower = (file || '').toLowerCase();
  
  // Detect traversal patterns
  const traversalPatterns = ['../', '..\\', 'etc/passwd', 'win.ini', 'boot.ini', 'api_keys.json'];
  let isTraversal = false;
  for (const pattern of traversalPatterns) {
    if (fileLower.includes(pattern)) {
      isTraversal = true;
      break;
    }
  }

  // 1. Feature 8 Honeytoken Alerts: check if accessing specific planted fake file
  const isHoneytokenKeys = fileLower.includes('api_keys.json');

  if (isTraversal || isHoneytokenKeys) {
    await logAttack(req, {
      attackType: 'traversal',
      severity: isHoneytokenKeys ? 'CRITICAL' : 'HIGH',
      payload: file,
      responseCode: 200
    });
  }

  // Feature 1 Deception Technology: Serve convincing fake system files
  let fileContent = null;
  let traversalDetected = isTraversal;

  if (isHoneytokenKeys) {
    fileContent = JSON.stringify({
      aws_access_key_id: "AKIAIOSFODNN7DECOYKEY",
      aws_secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYDECOYKEY",
      securebank_api_jwt_secret: "securebank_honey_secret_key_jwt_55667788",
      neon_db_password: "npg_cOm9C8ezuMjV_DECOY_PASSWORD"
    }, null, 2);
  } else if (fileLower.includes('passwd')) {
    fileContent = `root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
daemon:x:2:2:daemon:/sbin:/sbin/nologin
mail:x:8:12:mail:/var/spool/mail:/sbin/nologin
nobody:x:99:99:Nobody:/:/sbin/nologin
honey_admin:x:1001:1001:SecureBank Honeypot Admin:/home/honey_admin:/bin/bash
# WARNING: Any execution or authentication with honey_admin will be logged and monitored by the SOC team.`;
  } else if (isTraversal) {
    fileContent = `[!] PATH TRAVERSAL DETECTED AND BLOCKED BY SECUREBANK FIREWALL.\n[!] IP: ${req.ip}\n[!] Target: ${file}\n[!] System Admin notified.`;
  }

  // Return transactions for display in download table
  let availableFiles = [];
  try {
    const result = await pool.query(
      'SELECT remarks as description, created_at FROM transactions WHERE from_user_id = $1 LIMIT 5',
      [userId]
    );
    availableFiles = result.rows.map(f => ({
      name: `${f.description.replace(/\s+/g, '_')}.pdf`,
      date: f.created_at
    }));
  } catch (err) {
    console.error('Error fetching download records:', err.message);
  }

  // Append decoy key to list to lure attacker
  availableFiles.push({
    name: 'api_keys.json',
    date: new Date().toISOString()
  });

  res.json({
    requested_file: file,
    traversal_detected: traversalDetected,
    message: traversalDetected ? '⚠️ DIRECTORY TRAVERSAL ATTACK DETECTED!' : `Downloading: ${file}`,
    file_content: fileContent,
    available_files: availableFiles
  })
})

module.exports = router