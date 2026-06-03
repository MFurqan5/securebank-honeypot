const express = require('express')
const router = express.Router()
const pool = require('../db/connection')

router.get('/', async (req, res) => {
  const { user_id } = req.query
  const targetId = user_id || 1
  const timestamp = Date.now()

  try {
    const weakToken = Buffer.from(`${targetId}:${timestamp}`).toString('base64')
    const decodedToken = Buffer.from(weakToken, 'base64').toString()

    const result = await pool.query(
      'SELECT user_id, username, full_name, account_number, account_balance FROM users WHERE user_id = $1',
      [targetId]
    )

    res.json({
      session_token: weakToken,
      token_format: 'base64(user_id:timestamp)',
      current_user: result.rows[0] || null,
      token_decoded: decodedToken,
      timestamp: timestamp,
      token_strength: 'WEAK - Easily predictable'
    })
  } catch (err) {
    console.error('Session route error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
