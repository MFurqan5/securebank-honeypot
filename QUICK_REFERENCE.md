# Token Expiry System - Quick Reference

## TL;DR

✅ **Honeytokens now have TTL (Time-To-Live)**
- Default: 24 hours
- Auto-detected when reused after expiry
- Alerts fired with severity based on expiry status

---

## Key Endpoints

### Create Honeytoken
```bash
curl -X POST http://localhost:4000/api/honeytokens/create \
  -d '{"type":"credential","ttlSeconds":86400}' \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "tokenId": "uuid-123...",
    "expiresAt": "2024-01-15T10:30:00Z",
    "ttlSeconds": 86400
  }
}
```

### View Expiry Info
```bash
# Single token
curl http://localhost:4000/api/honeytokens/{tokenId}

# All active tokens
curl http://localhost:4000/api/honeytokens/active

# All triggered tokens
curl http://localhost:4000/api/honeytokens/triggered

# Statistics
curl http://localhost:4000/api/honeytokens/stats/summary
```

### Trigger Token (Check Expiry)
```bash
curl -X POST http://localhost:4000/api/honeytokens/{tokenId}/trigger \
  -d '{"attackerIp":"192.168.1.100"}' \
  -H "Content-Type: application/json"
```

**Response if EXPIRED**:
```json
{
  "alert": {
    "severity": "HIGH",
    "isExpired": true,
    "status": "expired_reused"
  }
}
```

**Response if ACTIVE**:
```json
{
  "alert": {
    "severity": "CRITICAL",
    "isExpired": false,
    "status": "active_triggered"
  }
}
```

---

## Database Queries

### Find all expired token reuses
```sql
SELECT id, attacker_ip, expired_use_at, expires_at
FROM honeytokens
WHERE expired_use_at IS NOT NULL
ORDER BY expired_use_at DESC;
```

### Get tokens by status
```sql
SELECT id, status, expires_at, 
       EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining
FROM honeytokens
WHERE status = 'active'
AND expires_at > NOW()
ORDER BY expires_at ASC;
```

### List attackers who reused expired tokens
```sql
SELECT DISTINCT h.attacker_ip, 
       COUNT(*) as reused_count,
       MAX(h.expired_use_at) as latest_reuse
FROM honeytokens h
WHERE h.expired_use_at IS NOT NULL
GROUP BY h.attacker_ip
ORDER BY reused_count DESC;
```

---

## Attack Logging

When expired token is reused:

```
attack_logs entry:
  - attack_type: 'expired_token_reuse'
  - sub_attack_type: 'honeytoken_reuse'
  - severity: 8 (HIGH)

attacker_profiles update:
  - threat_score += 10
  
honeytoken_alerts entry:
  - severity: 'HIGH'
  - details: { isExpired: true, expiredAt: "...", triggeredAt: "..." }
```

---

## Configuration

### TTL Defaults
- **Honeytokens**: 24 hours (86400 seconds)
- **Session tokens**: 1 hour (3600 seconds)
- **Customizable**: Set `ttlSeconds` in API request

### Severity Mapping
```
1-3:   LOW
4-6:   MEDIUM
7-8:   HIGH (includes expired token reuse)
9-10:  CRITICAL (active honeytoken + other critical attacks)
```

---

## Testing

### Test Expired Token Detection
```bash
# 1. Create token with 10 second TTL
TOKEN=$(curl -s -X POST http://localhost:4000/api/honeytokens/create \
  -d '{"ttlSeconds":10}' -H "Content-Type: application/json" | jq -r '.data.tokenId')

# 2. Verify it's active
curl http://localhost:4000/api/honeytokens/$TOKEN | jq '.data.is_expired'
# Output: false

# 3. Wait for expiry
sleep 11

# 4. Trigger and check
curl http://localhost:4000/api/honeytokens/$TOKEN | jq '.data.is_expired'
# Output: true (or check expiry in other ways)
```

---

## What Changed

| Component | Before | After |
|-----------|--------|-------|
| Honeytokens | No expiry | 24h default, customizable TTL |
| Reuse Detection | Manual | Automatic via attack logger |
| Alerts | Only on active use | Separate alerts for expired vs. active |
| Severity | Text labels | Integer 1-10 scale |
| Statistics | None | Summary endpoint with counts |

---

## Common Issues

### Q: How do I extend a token's TTL?
A: Tokens have fixed TTL set at creation. Create a new token with desired TTL.

### Q: Do existing tokens have expiry?
A: Yes, they default to 24 hours from `created_at` or `issued_at`.

### Q: How is expiry calculated?
A: `expiresAt = issuedAt + ttlSeconds`

### Q: What if attacker uses expired token?
A: Automatically logged as `attack_type='expired_token_reuse'` with severity 8.

### Q: Can I change the default TTL?
A: Yes, modify `ttlSeconds` parameter in `/api/honeytokens/create` request.

---

## Integration with SOC Dashboard

The SOC dashboard can query:

```javascript
// Get all expired token reuses
GET /api/honeytokels/triggered
  → Filter where is_expired === true

// Get summary stats
GET /api/honeytokens/stats/summary
  → Shows reused_after_expiry count

// Correlate with attacks
SELECT * FROM attack_logs 
WHERE attack_type = 'expired_token_reuse'
AND source_ip = ? 
ORDER BY timestamp DESC;
```

---

## Files to Review

1. **TOKEN_EXPIRY_GUIDE.md** - Complete documentation
2. **IMPLEMENTATION_SUMMARY.md** - Technical details
3. **schema.sql** - Database schema (honeytokens table)
4. **server/middleware/attackLogger.js** - Detection logic
5. **server/routes/honeytokens.js** - API endpoints
6. **server/middleware/tokenValidator.js** - Standalone validator (optional)

---

## Quick Implementation Checklist

- [x] Database schema updated
- [x] Attack logger detects expiry
- [x] API endpoints return TTL info
- [x] Alerts fire on expired reuse
- [x] Statistics endpoint available
- [x] Documentation complete

---

**Status**: ✅ Production Ready  
**Last Updated**: January 2024
