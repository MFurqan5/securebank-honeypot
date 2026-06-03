const express = require('express')
const router = express.Router()
const pool = require('../db/connection')

router.post('/', async (req, res) => {
  const { username, password } = req.body

  try {
    // INTENTIONALLY VULNERABLE — raw query for SQL injection demonstration
    const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`
    console.log('Query executed:', query)

    const result = await pool.query(query)

    if (result.rows.length > 0) {
      const user = result.rows[0]
      res.json({
        success: true,
        message: 'Login successful',
        user: {
          user_id: user.user_id,
          username: user.username,
          full_name: user.full_name,
          email: user.email,
          account_balance: user.account_balance,
          account_number: user.account_number
        }
      })
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      })
    }
  } catch (err) {
    console.error('Login error:', err.message)
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message
    })
  }
})

module.exports = router