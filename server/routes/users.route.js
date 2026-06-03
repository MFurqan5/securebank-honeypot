const express = require('express')
const router = express.Router()
const pool = require('../db/connection')

// Get all users
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id as id, username, full_name, account_number, account_balance, \'customer\' as role FROM users ORDER BY user_id ASC'
    )
    const formatted = result.rows.map(u => ({
      ...u,
      account_balance: parseFloat(u.account_balance)
    }))
    res.json(formatted)
  } catch (err) {
    console.error('Users fetch error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// Create user
router.post('/', async (req, res) => {
  const { username, password, full_name, role } = req.body
  const account_number = `ACC${Math.floor(10000 + Math.random() * 90000)}`

  try {
    const query = `
      INSERT INTO users (username, password, full_name, account_number, account_balance, is_active)
      VALUES ($1, $2, $3, $4, 0.00, TRUE)
      RETURNING user_id as id, username, full_name, account_number, account_balance
    `
    const result = await pool.query(query, [username, password, full_name, account_number])
    const newUser = result.rows[0];
    res.json({
      ...newUser,
      account_balance: parseFloat(newUser.account_balance),
      role: role || 'customer'
    })
  } catch (err) {
    console.error('User create error:', err.message)
    res.status(500).json({ error: 'Server error: ' + err.message })
  }
})

// Adjust balance & log as transaction
router.put('/:id/balance', async (req, res) => {
  const userId = req.params.id
  const { amount, description } = req.body

  try {
    await pool.query('BEGIN')

    // 1. Update user balance
    const updateBalanceQuery = `
      UPDATE users 
      SET account_balance = account_balance + $1 
      WHERE user_id = $2
      RETURNING user_id as id, username, full_name, account_number, account_balance
    `
    const userRes = await pool.query(updateBalanceQuery, [amount, userId])
    
    if (userRes.rows.length === 0) {
      await pool.query('ROLLBACK')
      return res.status(404).json({ error: 'User not found' })
    }

    // 2. Insert transaction log
    const transRef = `TXN${Date.now()}`
    const isCredit = amount >= 0
    const insertTransQuery = `
      INSERT INTO transactions (transaction_ref, from_user_id, to_user_id, from_account, to_account, amount, transaction_type, remarks, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `
    await pool.query(insertTransQuery, [
      transRef,
      isCredit ? null : userId, // if debit, money from user
      isCredit ? userId : null, // if credit, money to user
      isCredit ? 'SYSTEM_DECOY' : userRes.rows[0].account_number,
      isCredit ? userRes.rows[0].account_number : 'SYSTEM_DECOY',
      Math.abs(amount),
      isCredit ? 'Income' : 'Transfer',
      description || 'Balance Adjustment',
      'Completed'
    ])

    await pool.query('COMMIT')
    
    const userObj = userRes.rows[0];
    res.json({
      ...userObj,
      account_balance: parseFloat(userObj.account_balance),
      role: 'customer'
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

  try {
    // Delete referenced entries first or handle cascade
    await pool.query('DELETE FROM transactions WHERE from_user_id = $1 OR to_user_id = $1', [userId])
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId])
    res.json({ success: true })
  } catch (err) {
    console.error('User delete error:', err.message)
    res.status(500).json({ error: 'Server error: ' + err.message })
  }
})

module.exports = router
