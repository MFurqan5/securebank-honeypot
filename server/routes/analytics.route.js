const express = require('express')
const router = express.Router()
const pool = require('../db/connection')

router.get('/', async (req, res) => {
  const userId = req.headers['x-user-id'] || 1
  const userRole = req.headers['x-user-role']

  try {
    let query;
    let params;

    if (userRole === 'admin') {
      query = `
        SELECT 
          transaction_id as id,
          created_at as date,
          remarks as description,
          amount,
          transaction_type as category,
          CASE WHEN from_user_id IS NOT NULL AND to_user_id IS NULL THEN 'debit' 
               WHEN from_user_id IS NULL AND to_user_id IS NOT NULL THEN 'credit'
               ELSE 'debit' END as type
        FROM transactions
        ORDER BY created_at DESC
      `;
      params = [];
    } else {
      query = `
        SELECT 
          transaction_id as id,
          created_at as date,
          remarks as description,
          amount,
          transaction_type as category,
          CASE WHEN from_user_id = $1 THEN 'debit' ELSE 'credit' END as type
        FROM transactions
        WHERE from_user_id = $1 OR to_user_id = $1
        ORDER BY created_at DESC
      `;
      params = [userId];
    }

    const result = await pool.query(query, params)
    const transactions = result.rows.map(t => ({
      ...t,
      amount: parseFloat(t.amount)
    }));

    const totalIncome = transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
    
    const categories = {};
    transactions.forEach(t => {
      if (t.category && t.type === 'debit') {
        categories[t.category] = (categories[t.category] || 0) + t.amount;
      }
    });

    res.json({
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net_savings: totalIncome - totalExpenses,
      transaction_count: transactions.length,
      transactions: transactions,
      category_breakdown: categories,
      average_transaction: transactions.length > 0 ? (totalIncome + totalExpenses) / transactions.length : 0
    });

  } catch (err) {
    console.error('Error fetching analytics:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
