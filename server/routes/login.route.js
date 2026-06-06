const express = require('express')
const router = express.Router()
const pool = require('../db/connection')
const { logAttack } = require('../db/logger')

// Severity mapping (Integer values matching DB schema: 1-10)
const severityMap = {
  LOW: 3,
  MEDIUM: 5,
  HIGH: 7,
  CRITICAL: 9
}

router.post('/', async (req, res) => {
  const { username, password } = req.body

  console.log(`[LOGIN ATTEMPT] Username: ${username}`)

  // 1. Feature 8 Honeytoken Alerts: check for honeytoken login attempt
  if (username === 'honey_admin') {
    console.log('[HONEYPOT] Honeytoken credentials detected!')
    await logAttack(req, {
      attackType: 'bruteforce',
      severity: severityMap.CRITICAL,
      payload: `Honeytoken credentials used! Username: ${username}, Password: ${password}`,
      responseCode: 401
    })
    return res.status(401).json({
      success: false,
      message: 'Access Denied: Account Locked'
    })
  }

  // Detect SQL Injection signature patterns
  const sqlPatterns = [
    "' or '1'='1", "' or 1=1", "'--", "admin'--", "' or '1'='1'--",
    "admin' or '1'='1'--", "' or 1=1 --", "1' or '1'='1", "union select",
    "';--", "' or '1'='1' /*", "admin' --", "' or 1=1#", "' or 1=1--"
  ]
  
  const payloadLower = (username || '').toLowerCase() + ' ' + (password || '').toLowerCase()
  let isSqlInjection = false
  let matchedPattern = null
  
  for (const pattern of sqlPatterns) {
    if (payloadLower.includes(pattern.toLowerCase())) {
      isSqlInjection = true
      matchedPattern = pattern
      console.log(`[SQLi DETECTED] Pattern matched: ${pattern}`)
      break
    }
  }

  // VULNERABLE Query construction (concatenation) - INTENTIONAL FOR HONEYPOT
  const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`
  console.log('[HONEYPOT] Executing query:', query)

  try {
    if (isSqlInjection) {
      // Log SQLi attempt
      console.log('[LOGGER] Logging SQL injection attack...')
      await logAttack(req, {
        attackType: 'sqli',
        severity: severityMap.HIGH,
        payload: username,
        responseCode: 200
      })
      console.log('[LOGGER] SQL injection logged successfully')

      // Feature 1 — Deception Technology (Honeytokens / Decoy Data)
      return res.json({
        success: true,
        message: 'Login successful (Bypass)',
        user: {
          user_id: 9999,
          username: 'decoy_sec_admin',
          full_name: 'Decoy Secret Administrator',
          email: 'sec-admin@securebank-decoy.com',
          account_balance: 5543209.50,
          account_number: 'ACC99999',
          role: 'admin',
          decoy_secret_token: 'aws_access_key_id=AKIAIOSFODNN7DECOYKEY'
        }
      })
    }

    const result = await pool.query(query)

    if (result.rows.length > 0) {
      const user = result.rows[0]
      console.log(`[SUCCESS] User ${username} logged in successfully`)
      
      // Update last_login
      await pool.query(
        'UPDATE users SET last_login = NOW() WHERE user_id = $1',
        [user.user_id]
      ).catch(() => {})
      
      res.json({
        success: true,
        message: 'Login successful',
        user: {
          user_id: user.user_id,
          username: user.username,
          full_name: user.full_name,
          email: user.email,
          account_balance: parseFloat(user.account_balance),
          account_number: user.account_number,
          role: user.username === 'admin' ? 'admin' : 'customer'
        }
      })
    } else {
      // Update failed login attempts
      await pool.query(
        `UPDATE users 
         SET failed_login_attempts = failed_login_attempts + 1,
             is_locked = CASE WHEN failed_login_attempts >= 5 THEN TRUE ELSE is_locked END
         WHERE username = $1`,
        [username]
      ).catch(() => {})
      
      // Log as potential brute force
      console.log(`[FAILED] Invalid login attempt for username: ${username}`)
      await logAttack(req, {
        attackType: 'bruteforce',
        severity: severityMap.LOW,
        payload: `Failed login attempt. Username: ${username}`,
        responseCode: 401
      })
      console.log('[LOGGER] Failed login logged')

      res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      })
    }
  } catch (err) {
    // SQL syntax error from injection - return fake success
    console.error('[ERROR] SQL syntax error from injection:', err.message)
    
    console.log('[LOGGER] Logging SQL injection syntax error...')
    await logAttack(req, {
      attackType: 'sqli',
      severity: severityMap.HIGH,
      payload: username,
      responseCode: 200,
      subAttackType: 'syntax_error'
    })
    console.log('[LOGGER] SQL injection logged successfully')

    // Return fake admin success
    return res.json({
      success: true,
      message: 'Login successful (Deceptive Bypass)',
      user: {
        user_id: 9999,
        username: 'decoy_sec_admin',
        full_name: 'Decoy Secret Administrator',
        email: 'sec-admin@securebank-decoy.com',
        account_balance: 5543209.50,
        account_number: 'ACC99999',
        role: 'admin',
        decoy_secret_token: 'aws_access_key_id=AKIAIOSFODNN7DECOYKEY'
      }
    })
  }
})

module.exports = router