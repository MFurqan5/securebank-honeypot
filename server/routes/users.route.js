const express = require('express')
const router = express.Router()
const pool = require('../db/connection')

// Get all users (with balance as float)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        user_id as id, 
        username, 
        full_name, 
        account_number, 
        account_balance,
        email,
        phone,
        is_active,
        is_locked,
        created_at
      FROM users 
      WHERE is_active = TRUE
      ORDER BY user_id ASC
    `)
    
    const formatted = result.rows.map(u => ({
      ...u,
      account_balance: parseFloat(u.account_balance)
    }))
    
    res.json({
      success: true,
      users: formatted,
      count: formatted.length
    })
  } catch (err) {
    console.error('Users fetch error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get single user
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT 
        user_id as id, username, full_name, email, phone,
        account_number, account_balance, credit_score,
        is_active, is_locked, created_at, last_login
       FROM users 
       WHERE user_id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    user.account_balance = parseFloat(user.account_balance);
    
    res.json({ success: true, user });
  } catch (err) {
    console.error('User fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create user
router.post('/', async (req, res) => {
  const { username, password, full_name, email, phone, account_type = 'savings' } = req.body
  
  // Validate required fields
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'Missing required fields: username, password, full_name' })
  }
  
  const account_number = `ACC${Math.floor(10000 + Math.random() * 90000)}${Date.now().toString().slice(-4)}`

  try {
    const query = `
      INSERT INTO users (username, password, full_name, email, phone, account_number, account_balance, account_type, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, 0.00, $7, TRUE)
      RETURNING user_id as id, username, full_name, account_number, account_balance, email
    `
    const result = await pool.query(query, [username, password, full_name, email || null, phone || null, account_number, account_type])
    const newUser = result.rows[0];
    
    res.status(201).json({
      success: true,
      user: {
        ...newUser,
        account_balance: parseFloat(newUser.account_balance),
        role: 'customer'
      }
    })
  } catch (err) {
    console.error('User create error:', err.message)
    if (err.code === '23505') { // Unique violation
      res.status(409).json({ error: 'Username already exists' })
    } else {
      res.status(500).json({ error: 'Server error: ' + err.message })
    }
  }
})

// Adjust balance & log as transaction
router.put('/:id/balance', async (req, res) => {
  const userId = req.params.id
  const { amount, description, transaction_type = 'adjustment' } = req.body
  
  // Validate amount
  if (typeof amount !== 'number' || isNaN(amount)) {
    return res.status(400).json({ error: 'Invalid amount' })
  }

  try {
    await pool.query('BEGIN')

    // 1. Get current balance
    const currentBalance = await pool.query(
      'SELECT account_balance, account_number FROM users WHERE user_id = $1',
      [userId]
    );
    
    if (currentBalance.rows.length === 0) {
      await pool.query('ROLLBACK')
      return res.status(404).json({ error: 'User not found' })
    }
    
    const newBalance = parseFloat(currentBalance.rows[0].account_balance) + amount;
    
    // 2. Update user balance
    const updateBalanceQuery = `
      UPDATE users 
      SET account_balance = $1 
      WHERE user_id = $2
      RETURNING user_id as id, username, full_name, account_number, account_balance
    `
    const userRes = await pool.query(updateBalanceQuery, [newBalance, userId])

    // 3. Insert transaction log
    const transRef = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`
    const isCredit = amount > 0
    
    const insertTransQuery = `
      INSERT INTO transactions (transaction_ref, from_user_id, to_user_id, amount, transaction_type, remarks, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'completed', NOW())
    `
    await pool.query(insertTransQuery, [
      transRef,
      isCredit ? null : userId,
      isCredit ? userId : null,
      Math.abs(amount),
      transaction_type,
      description || (isCredit ? 'Deposit' : 'Withdrawal')
    ])

    await pool.query('COMMIT')
    
    const userObj = userRes.rows[0];
    res.json({
      success: true,
      user: {
        ...userObj,
        account_balance: parseFloat(userObj.account_balance)
      },
      transaction: {
        ref: transRef,
        amount: amount,
        type: isCredit ? 'credit' : 'debit',
        description: description
      }
    })
  } catch (err) {
    await pool.query('ROLLBACK')
    console.error('Balance adjust error:', err.message)
    res.status(500).json({ error: 'Server error: ' + err.message })
  }
})

// Delete user
router.delete('/:id', async (req, res) => {
  const userId = req.params.id
  const { hard_delete = false } = req.query

  try {
    if (hard_delete === 'true') {
      // Hard delete - remove all related records
      await pool.query('BEGIN')
      await pool.query('DELETE FROM transactions WHERE from_user_id = $1 OR to_user_id = $1', [userId])
      await pool.query('DELETE FROM comments WHERE author_type = $1 AND target_id = $2', ['customer', userId])
      await pool.query('DELETE FROM users WHERE user_id = $1', [userId])
      await pool.query('COMMIT')
    } else {
      // Soft delete - just deactivate
      await pool.query(
        'UPDATE users SET is_active = FALSE, is_locked = TRUE WHERE user_id = $1',
        [userId]
      )
    }
    res.json({ success: true, message: 'User deleted/deactivated successfully' })
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {})
    console.error('User delete error:', err.message)
    res.status(500).json({ error: 'Server error: ' + err.message })
  }
})

module.exports = router