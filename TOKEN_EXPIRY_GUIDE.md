# Token Expiry System Implementation Guide

## Overview
This document describes the **token expiry tracking** implementation for the SecureBank Honeypot, added after initial implementation.

---

## What Was Added

### 1. **Database Schema Updates** (`schema.sql`)
The `honeytokens` table now includes:
- `issued_at` - when the token was issued to the attacker
- `expires_at` - when the token will expire (24h default)
- `expired_use_at` - when an expired token was attempted to be reused
- `status` - now includes 'expired' state
- `ttl_seconds` - configurable time-to-live (default 86400 = 24 hours)

**Example**:
```sql
CREATE TABLE honeytokens (
    id              UUID PRIMARY KEY,
    type            VARCHAR(50),          -- 'credential' | 'apikey' | 'file'
    value           JSONB,
    attacker_ip     VARCHAR(45),
    created_at      TIMESTAMPTZ,
    issued_at       TIMESTAMPTZ,          -- NEW: when issued
    expires_at      TIMESTAMPTZ,          -- NEW: expiration time
    triggered_at    TIMESTAMPTZ,
    expired_use_at  TIMESTAMPTZ,          -- NEW: when reused after expiry
    status          VARCHAR(20),          -- 'active' | 'triggered' | 'inactive' | 'expired'
    ttl_seconds     INTEGER               -- NEW: 24h default
);
```

---

## 2. **Middleware: Token Expiry Validation** (`server/middleware/tokenValidator.js`)

New file that validates tokens and tracks expiry:

```javascript
async function validateToken(token) {
  // Checks if token has expired
  // Returns: { valid: true/false, isExpired, expiredAt, etc. }
}
```

**Usage**:
- Can be applied to protected routes to enforce token validation
- Logs expired token reuse attempts as alerts
- Called automatically by attack logger

---

## 3. **Attack Logger Updates** (`server/middleware/attackLogger.js`)

### New Functions:
- `checkExpiredTokenUsage()` - Detects when expired tokens are reused
- Tracks per-IP expired token attempts in `expiredTokenAttempts` Map

### Integration:
- Automatically checks all incoming requests for expired token reuse
- Logs as `attack_type: 'expired_token_reuse'` with `severity: 8` (HIGH)
- Updates threat scores accordingly

**Severity Mapping** (now using integers 1-10):
```
1-3:    LOW (recon, basic attempts)
4-6:    MEDIUM (bruteforce, path traversal)
7-8:    HIGH (XSS reflected, auth bypass SQLi)
9-10:   CRITICAL (union-based SQLi, stored XSS with exfiltration)
```

---

## 4. **Honeypot Routes Updates** (`server/routes/honeypot.js`)

### POST /api/login
- Creates honeytokens with 24h TTL
- Returns token with expiry info:
```json
{
  "success": true,
  "token": "eyJ...",
  "expiresIn": 86400,
  "expiresAt": "2024-01-15T10:30:00Z",
  "user": { ... },
  "_honeytoken_expires": "2024-01-15T10:30:00Z"
}
```

### GET /api/session
- Now supports `?ttl=seconds` parameter to set custom TTL
- Returns expiry information:
```json
{
  "success": true,
  "token": "base64_token",
  "expiresIn": 3600,
  "expiresAt": "2024-01-15T11:30:00Z"
}
```

---

## 5. **Honeytoken Routes** (`server/routes/honeytokens.js`)

### POST /api/honeytokens/create
```json
Request:
{
  "type": "credential",
  "attackerIp": "192.168.1.100",
  "ttlSeconds": 86400  // optional, defaults to 24h
}

Response:
{
  "success": true,
  "data": {
    "tokenId": "uuid",
    "type": "credential",
    "username": "svc_backup_abc123",
    "password": "...",
    "expiresAt": "2024-01-15T10:30:00Z",
    "ttlSeconds": 86400
  }
}
```

### POST /api/honeytokens/:id/trigger
- Detects if token is expired
- If expired: logs as 'EXPIRED_HONEYTOKEN_TRIGGERED' (severity: HIGH)
- If active: logs as 'HONEYTOKEN_TRIGGERED' (severity: CRITICAL)
- Updates `expired_use_at` timestamp
- Fires appropriate alert

**Response**:
```json
{
  "success": true,
  "alert": {
    "severity": "HIGH",  // or "CRITICAL" if not expired
    "honeytokenId": "uuid",
    "triggeredAt": "2024-01-15T10:35:00Z",
    "isExpired": true,
    "status": "expired_reused"
  }
}
```

### GET /api/honeytokens/
All honeytokens with expiry info:
```json
[
  {
    "id": "uuid",
    "type": "credential",
    "status": "active",
    "expires_at": "2024-01-15T10:30:00Z",
    "is_expired": false,
    "seconds_remaining": 3600
  }
]
```

### GET /api/honeytokens/active
Only active (non-expired) tokens:
```json
[
  { "id": "uuid", "seconds_remaining": 3600, ... }
]
```

### GET /api/honeytokens/triggered
All triggered tokens (active + expired):
```json
[
  {
    "id": "uuid",
    "triggered_at": "2024-01-15T10:35:00Z",
    "is_expired": true,
    "triggered_after_expiry_seconds": 300  // if expired when triggered
  }
]
```

### GET /api/honeytokens/:id
Single token with full details:
```json
{
  "id": "uuid",
  "type": "credential",
  "value": { "username": "...", "password": "..." },
  "status": "triggered",
  "is_expired": false,
  "seconds_remaining": 3600,
  "triggered_at": "2024-01-15T10:35:00Z",
  "expired_use_at": null
}
```

### GET /api/honeytokens/stats/summary
Overview statistics:
```json
{
  "total_tokens": 42,
  "active_tokens": 15,
  "triggered_count": 8,
  "expired_count": 12,
  "inactive_count": 7,
  "reused_after_expiry": 5
}
```

### DELETE /api/honeytokens/:id
Deactivates a token (sets status to 'inactive')

---

## 6. **Attack Logging** (Updated)

When an expired token is detected as being reused:

**Insert into `attack_logs`**:
```
attack_type: 'expired_token_reuse'
sub_attack_type: 'honeytoken_reuse'
severity: 8 (HIGH)
payload: contains token details
```

**Update `attacker_profiles`**:
- Increments threat score by +10 (HIGH severity delta)
- Records IP as reusing expired credentials

**Insert into `honeytoken_alerts`** (if triggered):
- Records which honeytoken was misused
- Marks it with 'HIGH' or 'CRITICAL' depending on expiry state
- Includes details JSON with expiry info

---

## How It Works (Flow)

```
1. Attacker logs in → GET /api/login
   ├─ Server returns fake token + honeytoken
   ├─ Honeytoken stored with expires_at = NOW() + 24h
   └─ Response includes _honeytoken_expires timestamp

2. Attacker waits 25 hours, tries to reuse old token
   ├─ Request hits attack logger middleware
   ├─ checkExpiredTokenUsage() runs
   ├─ Queries honeytokens table for that token
   ├─ Checks: NOW() > expires_at? YES → isExpired = true
   ├─ Logs to attack_logs with severity=8
   ├─ Updates attacker_profiles threat_score += 10
   └─ Response still looks normal (honeypot convincingness)

3. If attacker explicitly triggers token via POST /api/honeytokens/:id/trigger
   ├─ Checks expiry status
   ├─ If expired: fires HIGH severity alert
   ├─ If active: fires CRITICAL severity alert
   ├─ Sets status='expired' and expired_use_at=NOW()
   └─ Alert engine notifies SOC via Telegram/Email

4. SOC Dashboard can query:
   ├─ GET /api/honeytokens/triggered → see all token activations
   ├─ Filter by is_expired=true → focus on late reuse
   ├─ See triggered_after_expiry_seconds → how late was the reuse
   └─ Correlate with attack_logs for timeline
```

---

## Configuration

### Default TTL
- Honeytokens: **24 hours** (86400 seconds)
- Session tokens: **1 hour** (3600 seconds, customizable via `?ttl=`)

### Severity Scoring
- Expired token reuse: **8 (HIGH)** threat score delta = +10
- Active token trigger: **9 (CRITICAL)** threat score delta = +20

---

## Testing

### Test 1: Create and verify expiry
```bash
curl -X POST http://localhost:4000/api/honeytokens/create \
  -H "Content-Type: application/json" \
  -d '{"type":"credential","attackerIp":"192.168.1.100","ttlSeconds":10}'
```
Response will include `expiresAt` 10 seconds from now.

### Test 2: Wait for expiry and trigger
```bash
sleep 11
curl -X POST http://localhost:4000/api/honeytokens/TOKEN_UUID/trigger \
  -H "Content-Type: application/json" \
  -d '{"attackerIp":"192.168.1.100"}'
```
Response will show `isExpired: true` and `severity: HIGH`

### Test 3: Check attack logs
```bash
curl http://localhost:4000/api/honeytokens/stats/summary
```
Shows statistics including `reused_after_expiry` count.

---

## Integration with React Frontend

The frontend should:
1. Store `expiresAt` from login response
2. Calculate remaining TTL
3. Show token expiry countdown (optional visual)
4. On token expiry:
   - Clear localStorage token
   - Redirect to login page
   - Show "Session expired" message

---

## Database Queries for SOC Dashboard

### Find all expired token reuses
```sql
SELECT 
  h.id, h.attacker_ip, h.triggered_at, h.expires_at, 
  (h.triggered_at - h.expires_at) as reused_after_seconds
FROM honeytokens h
WHERE h.expired_use_at IS NOT NULL
ORDER BY h.triggered_at DESC;
```

### Timeline of token activity per IP
```sql
SELECT 
  h.attacker_ip,
  COUNT(*) as total_tokens,
  COUNT(CASE WHEN h.status='triggered' THEN 1 END) as triggered,
  COUNT(CASE WHEN h.expired_use_at IS NOT NULL THEN 1 END) as reused_expired
FROM honeytokens h
GROUP BY h.attacker_ip
ORDER BY COUNT(*) DESC;
```

### Correlation: Token use vs. other attacks
```sql
SELECT 
  al.source_ip,
  COUNT(DISTINCT CASE WHEN al.attack_type='expired_token_reuse' THEN al.id END) as token_abuse_count,
  COUNT(DISTINCT CASE WHEN al.attack_type='sqli' THEN al.id END) as sqli_attempts,
  COUNT(DISTINCT CASE WHEN al.attack_type='xss' THEN al.id END) as xss_attempts
FROM attack_logs al
WHERE al.source_ip IN (SELECT attacker_ip FROM honeytokens WHERE expired_use_at IS NOT NULL)
GROUP BY al.source_ip
ORDER BY token_abuse_count DESC;
```

---

## Key Features

✅ **Automatic TTL Management** - Tokens expire after configured duration  
✅ **Expiry Detection** - Identifies reuse of expired tokens  
✅ **Graduated Alerts** - Different severity for expired vs. active token use  
✅ **Comprehensive Logging** - All expiry events recorded for forensics  
✅ **Real-time Stats** - `/api/honeytokens/stats/summary` endpoint  
✅ **SOC Integration** - Honetoken_alerts table, Telegram/Email notifications  
✅ **Audit Trail** - `expired_use_at` timestamp for forensic analysis  

---

## Implementation Notes

- **Non-Breaking**: Existing code continues to work
- **Backward Compatible**: New fields are optional/default to sensible values
- **Performance**: Uses database indexes on status and expiry fields
- **Scalability**: In-memory tracking for rate limits, persistent DB for tokens

---

## Future Enhancements

1. **Dynamic TTL Policies** - Vary TTL by IP reputation/threat level
2. **Token Rotation** - Issue new tokens before expiry to engaged attackers
3. **Anomaly Detection** - Alert if pattern of token reuse changes suddenly
4. **Reputation Scoring** - Lower threat score for legitimate delayed reuse
5. **Contextual Alerts** - Flag if expired token reuse from new geography

---

**Status**: ✅ Production Ready  
**Last Updated**: January 2024  
**Maintained By**: SecureBank SOC Team
