const express = require('express')
const router = express.Router()
const pool = require('../db/connection')
const { logAttack } = require('../db/logger')

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM comments ORDER BY created_at DESC')
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching comments:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', async (req, res) => {
  const { author, content } = req.body
  const ip = req.ip || '127.0.0.1'
  const ua = req.headers['user-agent'] || ''

  // Detect XSS patterns in comment content
  const contentLower = (content || '').toLowerCase();
  const xssPatterns = ['<script', 'alert', 'onerror', 'onload', 'javascript:', '<img'];
  let isXss = false;
  for (const pattern of xssPatterns) {
    if (contentLower.includes(pattern)) {
      isXss = true;
      break;
    }
  }

  if (isXss) {
    await logAttack(req, {
      attackType: 'xss',
      severity: 'CRITICAL',
      payload: content,
      responseCode: 200
    });
  }

  try {
    // Unsanitized insert (Stored XSS)
    const query = `
      INSERT INTO comments (author, author_type, content, target_type, ip_address, user_agent, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [
      author || 'Anonymous',
      'customer',
      content || '',
      'feedback',
      ip,
      ua
    ]);

    res.json(result.rows[0])
  } catch (err) {
    console.error('Error creating comment:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router