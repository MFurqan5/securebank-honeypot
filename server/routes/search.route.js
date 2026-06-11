const express = require('express')
const router = express.Router()
const pool = require('../db/connection')
const { logAttack } = require('../db/logger')

const severityMap = {
  LOW: 3,
  MEDIUM: 5,
  HIGH: 7,
  CRITICAL: 9
}

router.get('/', async (req, res) => {
  const { q } = req.query
  const userId = req.headers['x-user-id'] || 1

  // Clean IP for logging
  let ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  ip = ip.replace(/^::ffff:/, '');
  if (ip === '::1') ip = '127.0.0.1';

  // Detect XSS patterns in query parameter
  const qStr = q || '';
  const qLower = qStr.toLowerCase();
  const xssPatterns = ['<script', 'alert(', 'onerror=', 'onload=', 'javascript:', '<img', 'onclick=', 'onmouseover='];
  let isXss = false;
  let matchedPattern = null;
  
  for (const pattern of xssPatterns) {
    if (qLower.includes(pattern)) {
      isXss = true;
      matchedPattern = pattern;
      break;
    }
  }

  if (isXss) {
    console.log(`[XSS DETECTED] Pattern: ${matchedPattern}, Query: ${qStr}`);
    await logAttack(req, {
      attackType: 'xss',
      severity: severityMap.HIGH,
      payload: qStr,
      responseCode: 200
    });
  } else {
    // Detect SQL injection in search
    const sqlPatterns = ["'", '"', "or 1=1", "union select", "--", "';"];
    let isSqlInjection = false;
    for (const pattern of sqlPatterns) {
      if (qLower.includes(pattern)) {
        isSqlInjection = true;
        break;
      }
    }
    
    if (isSqlInjection) {
      await logAttack(req, {
        attackType: 'sqli',
        severity: severityMap.MEDIUM,
        payload: qStr,
        responseCode: 200
      });
    }
  }

  // VULNERABLE Query Construction - SQL Injection possible
  let results = []
  try {
    // Using string concatenation - VULNERABLE (intentional)
    const query = `
      SELECT transaction_id, amount, remarks, created_at, transaction_type
      FROM transactions 
      WHERE (from_user_id = ${userId} OR to_user_id = ${userId}) 
      AND COALESCE(remarks, '') ILIKE '%${qStr.replace(/'/g, "''")}%'
      ORDER BY created_at DESC
      LIMIT 100
    `;
    console.log('[SEARCH] Executing query:', query);
    const result = await pool.query(query)
    results = result.rows.map(r => ({
      ...r,
      amount: parseFloat(r.amount)
    }))
  } catch (err) {
    console.error('[SEARCH ERROR]', err.message);
    // Log SQL error as potential attack
    await logAttack(req, {
      attackType: 'sqli',
      severity: severityMap.MEDIUM,
      payload: qStr,
      responseCode: 500,
      subAttackType: 'error_based'
    });
  }

  // Reflected XSS vulnerability - intentional
  const safeQ = qStr.replace(/[<>]/g, ''); // Minimal escaping to avoid breaking HTML
  
  res.json({
    query: qStr,
    xss_detected: isXss,
    sqli_detected: isSqlInjection,
    results_count: results.length,
    results: results,
    message: results.length > 0 ? `Found ${results.length} results` : 'No results found',
    // INTENTIONAL XSS VULNERABILITY - raw HTML with unescaped user input
    html: `<div class="search-result">You searched for: <span style="color:red;font-weight:bold">${qStr}</span></div>
           <div class="search-summary">Found ${results.length} transactions matching your query.</div>`
  })
})

module.exports = router