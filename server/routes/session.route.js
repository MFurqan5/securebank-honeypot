const express = require('express');
const router = express.Router();
const { logAttack } = require('../db/logger');

// Severity mapping
const severityMap = {
  LOW: 3,
  MEDIUM: 5,
  HIGH: 7,
  CRITICAL: 9
};

// GET /api/session - Weak predictable token (no signing)
router.get('/', async (req, res) => {
  const { username = 'guest', ttl = '3600' } = req.query;
  const ttlSeconds = Math.min(parseInt(ttl) || 3600, 86400); // cap at 24h
  
  // Log session token generation (potential reconnaissance)
  await logAttack(req, {
    attackType: 'recon',
    severity: severityMap.LOW,
    payload: `Session token generated for username: ${username}`,
    responseCode: 200
  }).catch(() => {});
  
  // WEAK TOKEN - just base64 encoded, no signature
  const timestamp = Date.now();
  const weakToken = Buffer.from(`${username}:${timestamp}`).toString('base64');
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  res.json({
    success: true,
    token: weakToken,
    expiresIn: ttlSeconds,
    expiresAt: expiresAt.toISOString(),
    token_format: 'base64(username:timestamp)',
    decoded_example: `Decoded would be: ${username}:${timestamp}`,
    note: 'Session tokens are base64 encoded — easily decodable',
    vulnerability: 'WEAK SESSION TOKENS - Can be forged by attackers',
    exploit_example: `curl -X GET "http://localhost:5000/api/session?username=admin" | python3 -c "import sys,json,base64; data=json.load(sys.stdin); print(base64.b64decode(data['token']).decode())"`
  });
});

// POST /api/session/validate - Validate a token (for testing)
router.post('/validate', async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token required' });
  }
  
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [username, timestamp] = decoded.split(':');
    const tokenAge = Date.now() - parseInt(timestamp);
    const isValid = tokenAge < 86400000; // 24 hours
    
    res.json({
      success: true,
      decoded: decoded,
      username: username,
      created_at: new Date(parseInt(timestamp)).toISOString(),
      age_seconds: Math.floor(tokenAge / 1000),
      is_valid: isValid,
      message: isValid ? 'Token is valid' : 'Token has expired'
    });
  } catch (err) {
    res.json({ 
      success: false, 
      error: 'Invalid token format',
      hint: 'Token should be base64 encoded string'
    });
  }
});

module.exports = router;