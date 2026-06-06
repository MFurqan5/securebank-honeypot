const express = require('express')
const router = express.Router()
const pool = require('../db/connection')

router.get('/', async (req, res) => {
  const userId = req.headers['x-user-id'] || 1
  const { limit = 50, type = 'all' } = req.query

  try {
    let query = `
      SELECT 
        transaction_id as id,
        created_at as date,
        COALESCE(remarks, 'Transaction') as description,
        amount,
        CASE 
          WHEN from_user_id = $1 THEN 'debit' 
          WHEN to_user_id = $1 THEN 'credit'
          ELSE 'debit' 
        END as type,
        transaction_type as category,
        status,
        transaction_ref
      FROM transactions
      WHERE (from_user_id = $1 OR to_user_id = $1)
    `;
    
    const params = [userId];
    
    if (type !== 'all') {
      query += ` AND CASE WHEN from_user_id = $1 THEN 'debit' ELSE 'credit' END = $2`;
      params.push(type);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params)
    
    const formatted = result.rows.map(t => ({
      ...t,
      amount: parseFloat(t.amount),
      date: t.date || new Date()
    }));

    // Calculate summary
    const totalDebit = formatted.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
    const totalCredit = formatted.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);

    res.json({
      success: true,
      transactions: formatted,
      summary: {
        total_transactions: formatted.length,
        total_debit: totalDebit,
        total_credit: totalCredit,
        net_flow: totalCredit - totalDebit
      }
    })
  } catch (err) {
    console.error('Error fetching transactions:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get single transaction
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.headers['x-user-id'] || 1;
  
  try {
    const result = await pool.query(
      `SELECT 
        transaction_id as id, transaction_ref, amount, remarks as description,
        from_user_id, to_user_id, status, created_at, transaction_type
       FROM transactions 
       WHERE transaction_id = $1 AND (from_user_id = $2 OR to_user_id = $2)`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json({ success: true, transaction: result.rows[0] });
  } catch (err) {
    console.error('Error fetching transaction:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router