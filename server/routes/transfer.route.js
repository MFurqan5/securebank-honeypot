const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { logAttack } = require('../db/logger');

// POST /api/transfer - IDOR surface (no auth check)
router.post('/', async (req, res) => {
  const { fromAccount, toAccount, amount } = req.body;
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  
  // Clean IP
  let cleanIp = ip.replace(/^::ffff:/, '');
  if (cleanIp === '::1') cleanIp = '127.0.0.1';

  // Log suspicious transfer attempt
  await logAttack(req, {
    attackType: 'idor',
    severity: 7, // HIGH
    payload: `Transfer attempt: ${fromAccount} -> ${toAccount} amount: ${amount}`,
    responseCode: 200
  });

  // Log to transaction_alerts
  await pool.query(
    `INSERT INTO transaction_alerts (alert_type, severity, description, created_at)
     VALUES ('suspicious_transfer', 7, $1, NOW())`,
    [`Transfer attempt: ${fromAccount} -> ${toAccount} amount: ${amount} from IP: ${cleanIp}`]
  ).catch(() => {});

  res.json({
    success: true,
    transactionRef: 'TXN' + Date.now(),
    status: 'processing',
    message: 'Transfer initiated (under review)'
  });
});

module.exports = router;