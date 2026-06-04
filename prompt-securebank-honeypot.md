# Prompt — securebank-honeypot

## Your Role
You are an expert Node.js + Express + React developer working on an existing cybersecurity project. Your first task before writing any code is to read every existing file in the project and list what each one contains. Only after fully understanding the codebase should you begin implementing features.

---

## What This Project Is
A fake banking website that acts as a honeypot. Real attackers are directed here thinking it is a real bank. Every attack they perform is silently logged into a shared PostgreSQL database hosted on Neon.tech. A separate SOC dashboard project reads from that same database to monitor attacks in real time.

**This project is the attacker-facing side. Your job is securebank-honeypot only.**

---

## Tech Stack
- Frontend: React.js — fake bank website attackers interact with
- Backend: Node.js + Express.js — honeypot API server
- Database: PostgreSQL on Neon.tech (shared with SOC dashboard)
- Alerting: Nodemailer + Telegram Bot API
- GeoIP: geoip-lite (npm)
- Threat Intel: AbuseIPDB API
- Real-time: Socket.io

Do NOT add Docker or NGINX. Do NOT change the tech stack.

---

## Project Folder Structure
Work strictly within this structure. Do not reorganise it.

```
securebank-honeypot/
├── client/
│   └── src/
│       ├── App.jsx
│       ├── pages/
│       │   ├── LoginPage.jsx          ← SQL injection surface
│       │   ├── DashboardPage.jsx      ← fake account dashboard after login
│       │   ├── SearchPage.jsx         ← reflected XSS surface
│       │   ├── CommentsPage.jsx       ← stored XSS surface
│       │   └── DownloadPage.jsx       ← directory traversal surface
│       └── components/
│           └── NavBar.jsx
├── server/
│   ├── index.js                       ← Express entry point
│   ├── db/
│   │   ├── pool.js                    ← Neon.tech PostgreSQL connection
│   │   └── schema.sql                 ← full schema (provided below)
│   ├── middleware/
│   │   └── attackLogger.js            ← intercepts every request
│   ├── routes/
│   │   ├── honeypot.js                ← all vulnerable bank API routes
│   │   ├── honeytokens.js             ← honeytoken create + trigger
│   │   └── sessions.js                ← session recording
│   └── services/
│       ├── geoip.js                   ← geoip-lite enrichment
│       ├── fingerprint.js             ← OS + tool detection
│       ├── abuseipdb.js               ← AbuseIPDB API check
│       └── alertEngine.js             ← Telegram + email alerts + IP block
├── .env
└── package.json
```

---

## Database — Neon.tech PostgreSQL Connection

Use the `DATABASE_URL` connection string from `.env`. All tables already exist on Neon.tech. Never run CREATE TABLE in application code — the schema is pre-applied.

```javascript
// server/db/pool.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }   // required for Neon.tech
});

module.exports = pool;
```

---

## Full Database Schema (already applied on Neon.tech — do not recreate)

These are all the tables. The ones marked WRITE are tables this project writes to. The ones marked READ are tables only the SOC dashboard reads.

```
roles                  — READ only (reference)
branches               — READ only (reference)
users                  — READ only (fake customers attackers try to access)
employees              — READ only (fake employees attackers try to impersonate)
transactions           — READ only (fake transaction history)
loans                  — READ only (fake loan records)
support_tickets        — WRITE (when attacker submits a ticket)
transaction_alerts     — WRITE (when suspicious transfer is attempted)
comments               — WRITE (stored XSS surface — attacker posts comments)
attack_logs            — WRITE (every attack event)
attacker_profiles      — WRITE (per-IP enriched profile, upserted)
ioc_records            — WRITE (indicators of compromise)
honeytokens            — WRITE (fake credentials planted in responses)
session_recordings     — WRITE (every HTTP request recorded in sequence)
honeytoken_alerts      — WRITE (when honeytoken is triggered)
```

### Key columns your code must use exactly as named:

**attack_logs:**
```
id, timestamp, source_ip, source_port, method, path, payload,
attack_type (VARCHAR 50 — use: 'sqli' | 'xss' | 'bruteforce' | 'traversal' | 'recon' | 'csrf' | 'idor'),
sub_attack_type (VARCHAR 100 — e.g. 'union_based', 'reflected', 'stored', 'auth_bypass', 'path_traversal'),
severity (INTEGER 1–10 — 1=lowest, 10=highest),
severity_label (computed automatically by DB — do NOT insert this),
user_agent, tool_detected, os_fingerprint, session_id,
targeted_endpoint, attempted_username, attempted_account,
response_code, is_blocked
```

**attacker_profiles:**
```
ip (PRIMARY KEY), first_seen, last_seen, total_requests, threat_score (0–100),
country, city, isp, os, tool, is_known_malicious,
sqli_count, xss_count, bruteforce_count, traversal_count, csrf_count, idor_count,
attempted_account_takeover, attempted_funds_transfer, attempted_privilege_escalation,
latitude, longitude, last_updated
```

**CRITICAL:** Never insert into `severity_label` — it is a generated column. Insert only `severity` (integer).

---

## System Flow

```
Attacker sends request to fake bank
→ Express receives it
→ attackLogger middleware runs FIRST on every request
  → extracts IP, method, path, payload, user_agent
  → classifies attack_type and severity (integer)
  → writes to attack_logs immediately
  → asynchronously upserts attacker_profiles
  → asynchronously records to session_recordings
→ vulnerable route processes request and responds convincingly
  → attacker sees fake success / fake data (never an error)
  → honeytoken created and embedded in response
→ GeoIP + fingerprint service enriches attacker_profiles (country, city, lat/long, tool, OS)
→ AbuseIPDB checks if IP is known malicious
→ alertEngine polls DB every 10s — fires Telegram + email on threshold breach
→ if threat_score > 80 or rate > 10 req/min → iptables block
```

---

## Feature 1 — Fake Banking Website (React Frontend)

Build a convincing, professional-looking fake bank website. It must look real. Use a blue and white banking colour scheme, a realistic logo ("SecureBank"), proper navigation, and genuine-looking UI.

**CRITICAL rule for all pages: never sanitise any input. Never use React's built-in XSS protection to block output. The vulnerabilities are intentional.**

### `LoginPage.jsx`
- Professional bank login form — username, password fields, "Forgot Password?" link, "Sign In" button
- Show SecureBank logo at top, branch locator link in footer
- POST credentials to `POST /api/login`
- On any response (success or fail), store the returned fake token in localStorage and redirect to `/dashboard`
- SQL injection payloads in the username/password fields must pass through untouched

### `DashboardPage.jsx`
- Show after login using the fake user data returned by `/api/login`
- Display: account holder name, account number (e.g. ACC10001), account type, balance (formatted as currency)
- Show a fake recent transactions table: date, description, amount, status
- Navigation bar links: Dashboard, Search, Comments, Downloads, Support
- "Transfer Funds" button that posts to `/api/transfer` (another attack surface — no real validation)

### `SearchPage.jsx`
- Search bar that sends `GET /api/search?q=`
- Render results using `dangerouslySetInnerHTML` — this allows reflected XSS payloads to execute
- Show a "Search Results for: [query]" heading also rendered with dangerouslySetInnerHTML
- Display fake search results below (account holder names, branch info) that look real

### `CommentsPage.jsx`
- "Customer Feedback" page with a comment form: Name + Message fields
- POST to `POST /api/comments`
- Render all stored comments below using `dangerouslySetInnerHTML` on the `content` field
- This is the stored XSS surface — payloads posted by one attacker execute for every subsequent visitor
- Style as a real feedback section with star ratings (cosmetic only)

### `DownloadPage.jsx`
- "Document Centre" page listing available documents: Account Statement, Terms & Conditions, Privacy Policy, Annual Report
- Each download sends `GET /api/download?file=filename.pdf`
- Include a direct "custom file" input field where users type a filename — this is the traversal surface
- Do NOT validate or sanitise the `file` parameter anywhere in the frontend

### `App.jsx`
- React Router with routes: `/` (login), `/dashboard`, `/search`, `/comments`, `/downloads`
- Redirect to `/` if no token in localStorage

---

## Feature 2 — Attack Logger Middleware

File: `server/middleware/attackLogger.js`

Runs on every single request via `app.use(attackLogger)` before any route. Must never block a request — always call `next()` immediately after starting the async logging work.

### Extract from every request:
- `source_ip` — from `req.ip` or `X-Forwarded-For` header
- `source_port` — from `req.socket.remotePort`
- `method` — `req.method`
- `path` — `req.path`
- `payload` — JSON stringify of `{ query: req.query, body: req.body }` combined
- `user_agent` — `req.headers['user-agent']`
- `session_id` — from cookie `sid`, or generate and set one if absent
- `attempted_username` — from `req.body.username` if present
- `attempted_account` — from `req.body.account` or `req.query.account` if present
- `targeted_endpoint` — `req.path`

### Classify attack_type and severity (run payload through all checks):

```
sqli detection — check payload for:
  ' (single quote), --, OR 1=1, UNION SELECT, SLEEP(, HAVING, DROP TABLE,
  INSERT INTO, UPDATE SET, =%27, %27OR, '='
  → attack_type = 'sqli'
  → sub_attack_type: 'union_based' if UNION, 'auth_bypass' if OR 1=1, 'blind' if SLEEP
  → severity: 9 if UNION SELECT or SLEEP (critical), 8 if OR 1=1, 7 otherwise

xss detection — check payload for:
  <script, </script>, onerror=, onload=, javascript:, <img, <svg,
  alert(, document.cookie, fetch(, XMLHttpRequest
  → attack_type = 'xss'
  → sub_attack_type: 'stored' if POST to /api/comments, 'reflected' otherwise
  → severity: 9 if document.cookie or fetch( (exfiltration), 7 otherwise

traversal detection — check payload for:
  ../, ..\, %2F.., %2e%2e, ....//,
  /etc/passwd, /etc/shadow, /proc/, /windows/system32
  → attack_type = 'traversal'
  → sub_attack_type = 'path_traversal'
  → severity: 9 if /etc/passwd or /etc/shadow, 7 otherwise

bruteforce detection:
  → track requests per IP in memory (Map): { ip: [timestamps] }
  → if same IP hits POST /api/login more than 5 times in 60 seconds
  → attack_type = 'bruteforce', sub_attack_type = 'credential'
  → severity: 6

recon detection — check path for:
  /admin, /wp-login, /.env, /phpinfo, /config, /.git, /backup
  → attack_type = 'recon', severity: 3

default (no match):
  → attack_type = NULL, severity = 1
```

### After classification:
1. Call `next()` immediately — do not wait for DB
2. Asynchronously insert into `attack_logs` (parameterised query, no string concat)
3. Asynchronously upsert into `attacker_profiles` — increment the relevant `_count` column
4. Asynchronously insert into `session_recordings` with sequence_number
5. Call `geoip.enrich(ip)` and `fingerprint.detect(userAgent)` — update `attacker_profiles`

---

## Feature 3 — Vulnerable Honeypot Routes

File: `server/routes/honeypot.js`

All routes respond convincingly. Attackers must believe they are making progress against a real system.

### `POST /api/login`
- Accept any username/password — never reject
- Check `users` table for the username (raw query — intentionally vulnerable to SQLi):
  ```sql
  SELECT * FROM users WHERE username = '${username}' AND password = '${password}'
  ```
  Note: this raw string interpolation is INTENTIONAL. It is the SQLi surface.
- If user found: return their real fake data from the DB
- If not found: return a random fake user anyway (pick any row from `users`)
- Response: `{ success: true, token: "eyJ...<fake jwt>", user: { name, accountNumber, balance, accountType, branchName } }`
- After responding, create a honeytoken for this attacker IP (call honeytokens route internally)

### `GET /api/search?q=`
- Reflect `q` directly back in response without any sanitisation
- Query: `SELECT * FROM users WHERE full_name LIKE '%${q}%'` (intentionally vulnerable)
- Response: `{ results: [ { title: "Search results for: " + q, accounts: [...rows] } ] }`
- Include real fake user data in the results (names, account types — not passwords)

### `GET /api/comments` + `POST /api/comments`
- GET: `SELECT * FROM comments ORDER BY created_at DESC` — return all rows including malicious ones
- POST: insert `author`, `content` directly into `comments` table with no sanitisation
  - Also store `ip_address` and `user_agent` in the comments row
  - Response: `{ success: true, comment: { id, author, content, created_at } }`

### `GET /api/download?file=`
- Attempt to serve the file at path: `path.join('/var/www/documents', req.query.file)`
- Do NOT call `path.normalize` or check for `..` — allow traversal
- If file not found: return `{ error: "Document not found", requestedFile: req.query.file }` — include the path back in the response (information disclosure)
- Log the full attempted path in `attack_logs.payload`

### `POST /api/transfer`
- Accept: `{ fromAccount, toAccount, amount }`
- No authentication check (IDOR surface)
- Return: `{ success: true, transactionRef: "TXN" + Date.now(), status: "processing" }`
- Set `attempted_funds_transfer = true` on the attacker's profile

### `GET /api/session`
- Return a weak predictable token: `Buffer.from(username + ':' + Date.now()).toString('base64')`
- No signing, no secret

### `GET /api/user/:id`
- Fetch user by ID with no auth check (IDOR surface)
- Return full user row including email, phone, address (not password)
- Set `attempted_account_takeover = true` on attacker profile

---

## Feature 4 — GeoIP + Fingerprinting

### `server/services/geoip.js`
```javascript
const geoip = require('geoip-lite');

async function enrich(ip) {
  const geo = geoip.lookup(ip);
  if (!geo) return null;
  return {
    country:   geo.country,
    city:      geo.city,
    latitude:  geo.ll[0],
    longitude: geo.ll[1],
  };
}
```
After lookup, upsert into `attacker_profiles`: update `country`, `city`, `latitude`, `longitude`, `last_updated`.

### `server/services/fingerprint.js`
Use `ua-parser-js` to extract OS from user-agent. Then pattern match for known attack tools:
```
'sqlmap'            → tool: 'sqlmap'
'Nikto'             → tool: 'nikto'
'python-requests'   → tool: 'python_script'
'curl/'             → tool: 'curl'
'Nmap'              → tool: 'nmap'
'Hydra'             → tool: 'hydra'
'DirBuster'         → tool: 'dirbuster'
'masscan'           → tool: 'masscan'
```
Update `attacker_profiles`: set `os`, `tool`.

### `server/services/abuseipdb.js`
```javascript
const axios = require('axios');

async function check(ip) {
  try {
    const res = await axios.get('https://api.abuseipdb.com/api/v2/check', {
      params: { ipAddress: ip, maxAgeInDays: 90 },
      headers: { Key: process.env.ABUSEIPDB_API_KEY, Accept: 'application/json' }
    });
    const score = res.data.data.abuseConfidenceScore;
    const isp   = res.data.data.isp;
    return { is_known_malicious: score > 50, isp };
  } catch {
    return { is_known_malicious: false, isp: null };  // never crash on API failure
  }
}
```
Update `attacker_profiles`: set `is_known_malicious`, `isp`.

---

## Feature 5 — Honeytoken System

File: `server/routes/honeytokens.js`

Honeytokens are fake credentials planted in responses. If an attacker copies and reuses them, the trigger fires a CRITICAL alert.

### `POST /api/honeytokens/create`
Body: `{ type: 'credential' | 'apikey' | 'file', attackerIp }`

Generate fake data by type:
- `credential`: `{ username: 'svc_backup_' + rand(), password: randomString(12), email: 'backup@securebank.internal' }`
- `apikey`: `{ key: 'sk_live_' + randomHex(32), service: 'SecureBank Payment API v2' }`
- `file`: `{ filename: 'customer_export_2024.csv', path: '/internal/exports/sensitive/' }`

Insert into `honeytokens` with `status = 'active'`. Return the fake data object.

The `/api/login` route calls this after every login attempt and embeds the fake credential in the response under a key like `_debug` or `_cache` — subtle enough that a thorough attacker might notice and try to use it.

### `POST /api/honeytokens/:id/trigger`
- Update `honeytokens`: set `triggered_at = NOW()`, `status = 'triggered'`
- Insert into `honeytoken_alerts`
- Call `alertEngine.sendCritical()` immediately with the trigger details
- Return `{ success: true, alert: { severity: 'CRITICAL', honeytokenId, attackerIp, triggeredAt } }`

### `GET /api/honeytokens` — all honeytokens
### `GET /api/honeytokens/triggered` — only triggered ones
### `GET /api/honeytokens/:id` — single honeytoken
### `DELETE /api/honeytokens/:id` — set status to 'inactive'

---

## Feature 6 — Session Recording

File: `server/routes/sessions.js`

The attack logger middleware calls these internally to record each request.

### `POST /api/sessions/create`
Body: `{ attackerIp }`
- Generate sessionId = `crypto.randomUUID()`
- Return `{ sessionId }`

### `POST /api/sessions/:id/record` (internal use by middleware)
Body: `{ method, path, body, responseCode }`
- Get next `sequence_number` for this session (SELECT MAX + 1)
- Insert into `session_recordings`

### `GET /api/sessions/:id/replay`
- Return all records ordered by `sequence_number ASC`

### `GET /api/sessions/:id/timeline`
- Return formatted: `[{ step, timestamp, method, path, responseCode, payload, timeSincePrevious }]`

### `GET /api/sessions/ip/:ip`
- Return all sessions for the IP with request count per session

---

## Feature 7 — Alert Engine

File: `server/services/alertEngine.js`

Poll database every 10 seconds. Fire alerts when rules breach.

### Alert Rules:
- Any attack with `severity >= 9` → immediate Telegram + email
- Same IP: more than 10 rows in `attack_logs` in the last 60 seconds → "Aggressive attacker" alert + block
- `is_known_malicious = true` on first request from that IP → immediate alert
- `honeytoken_alerts` has a new row → CRITICAL alert (called directly by trigger route)
- `threat_score > 80` → escalation alert

### Telegram:
```javascript
await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  chat_id: process.env.TELEGRAM_CHAT_ID,
  text: `🚨 SECUREBANK SOC ALERT\nSeverity: ${label}\nIP: ${ip} (${country})\nAttack: ${attack_type}\nPayload: ${payload.slice(0,100)}\nTime: ${timestamp}`,
  parse_mode: 'Markdown'
});
```

### Email (Nodemailer):
- Subject: `[SOC ALERT] ${severity_label} — ${attack_type} from ${ip}`
- HTML body with all attack details

### IP Block:
```javascript
const { exec } = require('child_process');
exec(`iptables -A INPUT -s ${ip} -j DROP`, (err) => {
  if (err) console.error('Block failed (not root?):', err.message);
});
```
Only block if `threat_score > 80` or request rate > 10/min. Log the block to `ioc_records`.

---

## Environment Variables (.env)

```
DATABASE_URL=postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require
PORT=4000

ABUSEIPDB_API_KEY=your_key
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
ALERT_EMAIL_TO=soc@yourdomain.com
```

---

## npm packages to install

```bash
# Server
npm install express pg cors dotenv socket.io axios nodemailer geoip-lite ua-parser-js crypto

# Client
npm install react-router-dom axios
```

---

## Hard Rules — Read These Before Writing Any Code

1. Read every existing file first. List what each file contains before writing anything.
2. NEVER sanitise inputs in honeypot routes — the vulnerabilities are intentional and required.
3. The attack logger must always call `next()` immediately — never delay the response.
4. NEVER concatenate strings into SQL outside of the intentionally vulnerable routes. Use parameterised queries `pool.query(sql, [params])` everywhere else.
5. NEVER crash on external API failures (AbuseIPDB, Telegram, email) — wrap in try/catch and continue.
6. NEVER insert into `severity_label` — it is a database-generated column. Only insert `severity` (integer 1–10).
7. The attacker must always get a convincing response — never show a 500 error or an unhandled exception.
8. Session recording must capture every request including ones with no attack pattern.
9. All new routes must follow the pattern: `res.json({ success: true, data: ... })` or `res.json({ success: false, error: '...' })`.
10. Server runs on PORT 4000 to avoid conflict with the SOC dashboard on 5000.
11. Do NOT add Docker or NGINX.
12. Use `DATABASE_URL` with SSL for Neon.tech — not individual host/port/user/pass env vars.
