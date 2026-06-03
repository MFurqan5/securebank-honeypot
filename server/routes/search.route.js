const express = require('express')
const router = express.Router()
const pool = require('../db/connection')
const { logAttack } = require('../db/logger')

router.get('/', async (req, res) => {
  const { q } = req.query
  const userId = req.headers['x-user-id'] || 1

  // Detect XSS patterns in query parameter
  const qLower = (q || '').toLowerCase();
  const xssPatterns = ['<script', 'alert', 'onerror', 'onload', 'javascript:', '<img'];
  let isXss = false;
  for (const pattern of xssPatterns) {
    if (qLower.includes(pattern)) {
      isXss = true;
      break;
    }
  }

  if (isXss) {
    await logAttack(req, {
      attackType: 'xss',
      severity: 'HIGH',
      payload: q,
      responseCode: 200
    });
  }

  // Vulnerable Query Construction (SQLi also possible here in search query)
  let results = []
  try {
    const query = `
      SELECT * FROM transactions 
      WHERE (from_user_id = ${userId} OR to_user_id = ${userId}) 
      AND description ILIKE '%${q || ''}%'
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query)
    results = result.rows
  } catch (err) {
    console.error('Search query error:', err.message)
  }

  // Reflected XSS vulnerability: return raw HTML containing unescaped search term
  res.json({
    query: q,
    results: results,
    message: results.length > 0 ? `Found ${results.length} results` : 'No results found',
    html: `<div class="search-result">You searched for: <span style="color:red">${q || ''}</span></div>`
  })
})

module.exports = router