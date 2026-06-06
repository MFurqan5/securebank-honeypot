const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { logAttack } = require('../db/logger');

// GET /api/accounts - IDOR surface (returns all accounts)
router.get('/', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  
  // Log potential reconnaissance
  await logAttack(req, {
    attackType: 'idor',
    severity: 5, // MEDIUM
    payload: 'Accessing all accounts endpoint',
    responseCode: 200
  });

  try {
    const result = await pool.query(
      `SELECT user_id, full_name, account_number, account_type, account_balance 
       FROM users 
       WHERE is_active = TRUE
       LIMIT 20`
    );
    
    const formatted = result.rows.map(u => ({
      ...u,
      account_balance: parseFloat(u.account_balance)
    }));
    
    res.json({ 
      success: true, 
      data: formatted,
      warning: '⚠️ This endpoint exposes all user accounts (IDOR vulnerability)'
    });
  } catch (err) {
    console.error('Error fetching accounts:', err.message);
    res.json({ success: true, data: [] });
  }
});

// GET /api/accounts/:id - IDOR surface (access any user by ID)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT user_id, username, email, phone, full_name, address, 
              account_number, account_balance, account_type 
       FROM users 
       WHERE user_id = $1 AND is_active = TRUE`,
      [id]
    );
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      user.account_balance = parseFloat(user.account_balance);
      
      return res.json({ 
        success: true, 
        data: user,
        warning: '⚠️ No authentication check - any user can access this endpoint'
      });
    }
    
    // Return fake data if user not found (still convincing)
    res.json({ 
      success: true, 
      data: { 
        id, 
        username: 'customer', 
        full_name: 'Customer User',
        email: 'customer@securebank.com',
        account_number: 'ACC' + Math.floor(Math.random() * 90000 + 10000),
        account_balance: Math.random() * 10000,
        account_type: 'savings'
      } 
    });
  } catch (err) {
    console.error('Error fetching user:', err.message);
    res.json({ success: true, data: { id, username: 'unknown' } });
  }
});

module.exports = router;