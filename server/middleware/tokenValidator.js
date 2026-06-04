const pool = require('../db/pool');

/**
 * Token Validator Middleware
 * Checks if tokens have expired and logs the attempt
 * Called for protected routes to validate token TTL
 */

async function validateToken(token) {
  if (!token) return { valid: false, reason: 'no_token' };

  try {
    // First check if this is a honeytoken that we know about
    // In a real scenario, we'd decode/verify the JWT, but honeypot allows weak tokens
    const result = await pool.query(
      `SELECT id, status, expires_at, ttl_seconds, attacker_ip, created_at
       FROM honeytokens 
       WHERE (value->>'key' = $1 OR id::text LIKE $1)
       LIMIT 1`,
      [token.slice(0, 50)] // match partial token
    );

    if (result.rows.length > 0) {
      const honeytoken = result.rows[0];
      const now = new Date();
      const expiresAt = new Date(honeytoken.expires_at);
      const isExpired = now > expiresAt;

      if (isExpired) {
        // Log expired token reuse attempt
        await pool.query(
          `UPDATE honeytokens 
           SET expired_use_at = NOW()
           WHERE id = $1`,
          [honeytoken.id]
        ).catch(() => {});

        return {
          valid: false,
          reason: 'token_expired',
          isExpired: true,
          expiredAt: honeytoken.expires_at,
          honetokenId: honeytoken.id
        };
      }

      // Token is still valid
      return {
        valid: true,
        isHoneytoken: true,
        tokenId: honeytoken.id,
        ttl: honeytoken.ttl_seconds,
        expiresAt: honeytoken.expires_at
      };
    }

    // For generic JWT tokens (like from /api/session)
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const now = Math.floor(Date.now() / 1000);

        // Check if token has exp claim (standard JWT)
        if (decoded.exp && decoded.exp < now) {
          return {
            valid: false,
            reason: 'jwt_expired',
            isExpired: true,
            expiredAt: new Date(decoded.exp * 1000)
          };
        }

        return { valid: true, isJWT: true };
      }
    } catch {
      // If we can't parse as JWT, assume it's a base64 token (weak security)
    }

    return { valid: true, reason: 'unverified' };
  } catch (err) {
    console.error('[TokenValidator] Error:', err.message);
    // On error, let it pass (honeypot should be forgiving)
    return { valid: true, reason: 'validation_error' };
  }
}

/**
 * Middleware to validate tokens on protected routes
 * Usage: app.use('/api/protected', tokenValidatorMiddleware)
 */
function tokenValidatorMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') 
             || req.body?.token 
             || req.query?.token 
             || req.cookies?.token;

  if (token) {
    validateToken(token).then(validation => {
      req.tokenValidation = validation;
      next();
    }).catch(err => {
      console.error('[TokenValidator] Validation failed:', err.message);
      req.tokenValidation = { valid: true, reason: 'error_handling' };
      next();
    });
  } else {
    req.tokenValidation = { valid: false, reason: 'no_token' };
    next();
  }
}

module.exports = { validateToken, tokenValidatorMiddleware };
