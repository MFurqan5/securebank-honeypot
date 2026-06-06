const express = require('express')
const router = express.Router()
const pool = require('../db/connection')
const { logAttack } = require('../db/logger')

// Severity mapping
const severityMap = {
  LOW: 3,
  MEDIUM: 5,
  HIGH: 7,
  CRITICAL: 9
};

// GET all comments
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        comment_id as id,
        author,
        author_type,
        content,
        target_type,
        target_id,
        is_approved,
        created_at,
        ip_address
      FROM comments 
      ORDER BY created_at DESC 
      LIMIT 500
    `)
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching comments:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST new comment (vulnerable to stored XSS)
router.post('/', async (req, res) => {
  const { author, content, target_type = 'feedback', target_id = null } = req.body
  
  // Clean IP address (handle IPv6)
  let ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  ip = ip.replace(/^::ffff:/, '');
  if (ip === '::1') ip = '127.0.0.1';
  
  const ua = req.headers['user-agent'] || ''

  // Detect XSS patterns in comment content
  const contentLower = (content || '').toLowerCase();
  const xssPatterns = [
    '<script', 'alert(', 'onerror=', 'onload=', 'javascript:', 
    '<img', '<iframe', '<object', '<embed', 'onclick=', 'onmouseover=',
    'document.cookie', 'localStorage', 'sessionStorage'
  ];
  
  let isXss = false;
  let detectedPattern = null;
  
  for (const pattern of xssPatterns) {
    if (contentLower.includes(pattern)) {
      isXss = true;
      detectedPattern = pattern;
      break;
    }
  }

  if (isXss) {
    console.log(`[XSS DETECTED] Pattern: ${detectedPattern}, IP: ${ip}`);
    await logAttack(req, {
      attackType: 'xss',
      severity: severityMap.CRITICAL,
      payload: content,
      responseCode: 200
    });
  }

  try {
    // UNSANITIZED INSERT - Vulnerable to Stored XSS (intentional for honeypot)
    const query = `
      INSERT INTO comments (author, author_type, content, target_type, target_id, ip_address, user_agent, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING comment_id as id, author, author_type, content, target_type, created_at
    `;
    
    const result = await pool.query(query, [
      author || 'Anonymous',
      'customer',
      content || '',
      target_type,
      target_id,
      ip,
      ua
    ]);

    res.status(201).json({
      success: true,
      message: isXss ? 'Comment posted (XSS detected and logged)' : 'Comment posted successfully',
      comment: result.rows[0]
    })
  } catch (err) {
    console.error('Error creating comment:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE comment (admin only)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userRole = req.headers['x-user-role'];
  
  if (userRole !== 'admin' && userRole !== 'security_officer') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  try {
    await pool.query('DELETE FROM comments WHERE comment_id = $1', [id]);
    res.json({ success: true, message: 'Comment deleted' });
  } catch (err) {
    console.error('Error deleting comment:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
})

module.exports = router