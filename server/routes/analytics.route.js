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
          COALESCE(remarks, 'Transaction') as description,
          amount,
          transaction_type as category,
          CASE 
            WHEN from_user_id IS NOT NULL AND to_user_id IS NULL THEN 'debit' 
            WHEN from_user_id IS NULL AND to_user_id IS NOT NULL THEN 'credit'
            WHEN from_user_id = to_user_id THEN 'transfer'
            ELSE 'debit' 
          END as type
        FROM transactions
        WHERE status = 'completed'
        ORDER BY created_at DESC
        LIMIT 1000
      `;
      params = [];
    } else {
      query = `
        SELECT 
          transaction_id as id,
          created_at as date,
          COALESCE(remarks, 'Transaction') as description,
          amount,
          transaction_type as category,
          CASE 
            WHEN from_user_id = $1 THEN 'debit' 
            WHEN to_user_id = $1 THEN 'credit'
            ELSE 'debit' 
          END as type
        FROM transactions
        WHERE (from_user_id = $1 OR to_user_id = $1) AND status = 'completed'
        ORDER BY created_at DESC
        LIMIT 1000
      `;
      params = [userId];
    }

    const result = await pool.query(query, params)
    
    if (result.rows.length === 0) {
      return res.json({
        total_income: 0,
        total_expenses: 0,
        net_savings: 0,
        transaction_count: 0,
        transactions: [],
        category_breakdown: {},
        average_transaction: 0
      });
    }

    const transactions = result.rows.map(t => ({
      ...t,
      amount: parseFloat(t.amount),
      date: t.date || new Date()
    }));

    const totalIncome = transactions
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = transactions
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const categories = {};
    transactions.forEach(t => {
      if (t.category && t.type === 'debit') {
        categories[t.category] = (categories[t.category] || 0) + t.amount;
      }
    });

    // Add category for uncategorized expenses
    const categorizedTotal = Object.values(categories).reduce((sum, val) => sum + val, 0);
    if (totalExpenses > categorizedTotal) {
      categories['Other'] = totalExpenses - categorizedTotal;
    }

    res.json({
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net_savings: totalIncome - totalExpenses,
      transaction_count: transactions.length,
      transactions: transactions,
      category_breakdown: categories,
      average_transaction: transactions.length > 0 
        ? (totalIncome + totalExpenses) / transactions.length 
        : 0
    });

  } catch (err) {
    console.error('Error fetching analytics:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router