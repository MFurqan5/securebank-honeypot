const express = require('express')
const router = express.Router()
const pool = require('../db/connection')

router.get('/', async (req, res) => {
  const userId = req.headers['x-user-id'] || 1

  try {
    const query = `
      SELECT 
        transaction_id as id,
        created_at as date,
        remarks as description,
        amount,
        CASE WHEN from_user_id = $1 THEN 'debit' ELSE 'credit' END as type,
        transaction_type as category
      FROM transactions
      WHERE from_user_id = $1 OR to_user_id = $1
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [userId])
    
    // Map database results to JSON floats
    const formatted = result.rows.map(t => ({
      ...t,
      amount: parseFloat(t.amount)
    }));

    res.json(formatted)
  } catch (err) {
    console.error('Error fetching transactions:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
