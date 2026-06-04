# Quick Start - SecureBank Honeypot

## 🚀 Deploy in 3 Steps

### 1. Database

```bash
psql $DATABASE_URL < server/db/schema-updated.sql
```

### 2. Setup

```bash
cp .env.example .env
# Edit .env: DATABASE_URL=postgresql://...
npm install --prefix server
npm install --prefix client
```

### 3. Run

```bash
# Terminal 1: Server
cd server && npm start

# Terminal 2: Client (new terminal)
cd client && npm run dev
```

Open: http://localhost:5173

- Username: john_doe
- Password: password123

---

## ✅ What Was Fixed

| Issue                             | Fixed |
| --------------------------------- | ----- |
| Alert severity (string → integer) | ✅    |
| Transactions API URL              | ✅    |
| GeoIP coordinates                 | ✅    |
| Session recording table           | ✅    |

---

## 🧪 Quick Test

```bash
# Verify fixes
bash verify-fixes.sh

# Test SQL injection
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin'"'"' OR '"'"'1'"'"'='"'"'1","password":"x"}'

# Check logs
psql $DATABASE_URL -c "SELECT severity, attack_type, ip FROM attack_logs ORDER BY id DESC LIMIT 5;"
```

---

## 📊 All 7 Features Working

1. ✅ Fake Banking Website
2. ✅ Attack Logger
3. ✅ Vulnerable Routes
4. ✅ GeoIP & Fingerprinting
5. ✅ Honeytoken System
6. ✅ Session Recording
7. ✅ Alert Engine

---

## 📁 Important Files

- `FINAL_SUMMARY.md` - Complete overview
- `IMPLEMENTATION_COMPLETE.md` - Feature verification
- `FIXES_APPLIED.md` - Detailed fixes
- `DEPLOYMENT_CHECKLIST.md` - Full checklist
- `verify-fixes.sh` - Automated verification

---

## 🔧 Configuration

```env
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db

# Optional - Telegram Alerts
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

# Optional - Email Alerts
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password
ALERT_EMAIL_TO=recipient@example.com

# Optional - IP Reputation
ABUSEIPDB_API_KEY=your_api_key
```

---

## 📈 Monitor

```sql
-- Recent attacks
SELECT severity, attack_type, COUNT(*) FROM attack_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY severity, attack_type;

-- Attacker profiles
SELECT ip, country, city, detected_tools, created_at FROM attacker_profiles
ORDER BY created_at DESC LIMIT 10;

-- Session timelines
SELECT id, ip, COUNT(*) as requests FROM session_recordings
GROUP BY id, ip ORDER BY COUNT(*) DESC LIMIT 10;

-- Alerts fired
SELECT severity, alert_type, COUNT(*) FROM alerts
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY severity, alert_type;
```

---

## ⚠️ Troubleshooting

**Database connection fails?**

- Check DATABASE_URL is correct
- Verify PostgreSQL is running
- Test: `psql $DATABASE_URL -c "SELECT 1;"`

**Alerts not firing?**

- Check: `SELECT DISTINCT severity FROM attack_logs;`
- Should see: 1-10 integers, not strings
- Verify threshold in alertEngine.js: `>= 7`

**No session recording?**

- Check table exists: `psql $DATABASE_URL -c "\d session_recordings"`
- Verify middleware using correct table name

**GeoIP not enriching?**

- Check: `SELECT latitude, longitude FROM attacker_profiles LIMIT 5;`
- Verify geoip-lite installed: `npm list geoip-lite --prefix server`

---

## 🎯 Test Payloads

**SQL Injection:**

```
admin' OR '1'='1
' UNION SELECT NULL,NULL,NULL--
```

**Reflected XSS:**

```
<script>alert('xss')</script>
<img src=x onerror=alert('xss')>
```

**Directory Traversal:**

```
../../etc/passwd
..\..\..\..\windows\system32\config\sam
```

**Honeytoken Trigger:**

1. Create: `GET /api/honeytokens/create`
2. Use in login with username/password from honeytoken
3. Check alert as CRITICAL

---

## 📞 Support

See documentation files:

- `FINAL_SUMMARY.md` - Overview
- `IMPLEMENTATION_COMPLETE.md` - Features
- `DEPLOYMENT_CHECKLIST.md` - Full guide

---

**Status:** ✅ Ready for Deployment
**Last Updated:** 2026-06-04
