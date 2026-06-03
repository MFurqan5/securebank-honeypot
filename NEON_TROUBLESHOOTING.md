# 🔧 Neon.tech Database Connection Troubleshooting

## 🎯 If Login Isn't Working - Start Here

### Quick Diagnosis

1. **Is the server running?**
   ```bash
   Open another terminal:
   curl http://localhost:5000
   ```
   If you see: `{"message":"SecureBank Honeypot Server Running"}` ✅ Server OK
   
   If error: ❌ Start server with `npm run dev`

2. **Is the client running?**
   ```
   Open http://localhost:5173
   ```
   If login page appears: ✅ Client OK
   
   If error: ❌ Start client with `npm run dev`

3. **Is the database initialized?**
   ```bash
   cd server
   npm run init-db
   ```
   Look for: `✅ Database initialized successfully!`

---

## 📊 Neon.tech Configuration Guide

### Step 1: Get Your Connection String from Neon.tech

1. Go to https://neon.tech/app/projects
2. Click your project
3. Click **"Connection string"** in the dashboard
4. Copy the **PostgreSQL** version (NOT psql)

**It looks like:**
```
postgresql://neondb_owner:abc123def456@ep-calm-breeze-12345.us-east-1.neon.tech/neondb?sslmode=require
```

**Breakdown:**
- `neondb_owner` = Your database user
- `abc123def456` = Your password
- `ep-calm-breeze-12345` = Your endpoint
- `neondb` = Your database name
- `sslmode=require` = Security requirement

### Step 2: Update .env File

**Edit: `server/.env`**

```env
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@YOUR_ENDPOINT/neondb?sslmode=require
HONEYPOT_PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
LOG_LEVEL=debug
```

**Example with real values:**
```env
DATABASE_URL=postgresql://neondb_owner:p@ssw0rd123@ep-calm-breeze-12345.us-east-1.neon.tech/neondb?sslmode=require
HONEYPOT_PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

### ⚠️ Special Characters in Password

If your Neon.tech password has special characters, you need to handle them:

**Special Characters:**
| Character | Encoded | Example |
|-----------|---------|---------|
| @ | %40 | pass%40word |
| : | %3A | pass%3Aword |
| # | %23 | pass%23word |
| / | %2F | pass%2Fword |
| ? | %3F | pass%3Fword |
| % | %25 | pass%25word |

**Example:**
If password is: `p@ss:word`
Use: `p%40ss%3Aword`

Full connection string:
```
postgresql://neondb_owner:p%40ss%3Aword@ep-xxx.neon.tech/neondb?sslmode=require
```

---

## 🧪 Testing Your Connection

### Test 1: Direct Node.js Connection

```bash
cd server
node -e "
require('dotenv').config();
const pool = require('./db/connection');
pool.query('SELECT NOW()')
  .then(r => {
    console.log('✅ DATABASE CONNECTION SUCCESSFUL');
    console.log('Current time from DB:', r.rows[0]);
    process.exit(0);
  })
  .catch(e => {
    console.log('❌ DATABASE CONNECTION FAILED');
    console.log('Error:', e.message);
    process.exit(1);
  })
"
```

**Expected output:**
```
✅ DATABASE CONNECTION SUCCESSFUL
Current time from DB: { now: '2024-01-15 14:30:45.123456+00' }
```

### Test 2: Verify Tables Exist

```bash
node -e "
require('dotenv').config();
const pool = require('./db/connection');
pool.query(
  \"SELECT table_name FROM information_schema.tables WHERE table_schema='public'\"
)
  .then(r => {
    console.log('✅ TABLES FOUND:', r.rows.length);
    r.rows.forEach(t => console.log('  -', t.table_name));
    process.exit(0);
  })
  .catch(e => {
    console.log('❌ ERROR:', e.message);
    process.exit(1);
  })
"
```

**Expected output:**
```
✅ TABLES FOUND: 12
  - users
  - roles
  - branches
  - employees
  - transactions
  - ...
```

### Test 3: Check Test Users

```bash
node -e "
require('dotenv').config();
const pool = require('./db/connection');
pool.query('SELECT username, password FROM users')
  .then(r => {
    console.log('✅ TEST USERS:');
    r.rows.forEach(u => console.log('  ' + u.username + ' / ' + u.password));
    process.exit(0);
  })
  .catch(e => {
    console.log('❌ ERROR:', e.message);
    process.exit(1);
  })
"
```

**Expected output:**
```
✅ TEST USERS:
  admin / admin
  john_doe / password123
  jane_smith / qwerty456
  ...
```

### Test 4: Test Login Directly

```bash
# While server is running...
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

**Expected output:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "user_id": 1,
    "username": "admin",
    "full_name": "Admin User",
    "email": "admin@securebank.com",
    "account_balance": "999999.99",
    "account_number": "ACC10999"
  }
}
```

---

## ❌ Common Neon.tech Errors & Fixes

### Error: "getaddrinfo ENOTFOUND"
```
Error: getaddrinfo ENOTFOUND ep-calm-breeze-12345.us-east-1.neon.tech
```

**Cause**: Endpoint name is wrong or no internet

**Fix**:
1. Copy endpoint from Neon.tech dashboard again (exactly as shown)
2. Check internet connection
3. Make sure `ep-` is at the start of the endpoint

---

### Error: "fatal: password authentication failed"
```
Error: password authentication failed for user "neondb_owner"
```

**Cause**: Wrong password

**Fix**:
1. Go to Neon.tech dashboard
2. Click "Reset password"
3. Copy the exact new password (note: special characters!)
4. If password has special characters, URL-encode them (see table above)
5. Update .env file
6. Restart server

---

### Error: "SSL certificate verify failed"
```
Error: SSL certificate problem: self signed certificate in certificate chain
```

**Cause**: Missing `?sslmode=require`

**Fix**:
Check your DATABASE_URL ends with: `?sslmode=require`

```
postgresql://neondb_owner:password@endpoint/neondb?sslmode=require
                                                    ^^^^^^^^^^^^^^^^
```

---

### Error: "database does not exist"
```
Error: FATAL: database "neondb" does not exist
```

**Cause**: Wrong database name

**Fix**:
1. Check your Neon.tech project dashboard
2. Default database is usually `neondb`
3. Copy the exact name from connection string
4. Update .env with correct name

---

### Error: "role does not exist"  
```
Error: role "neondb_owner" does not exist
```

**Cause**: Wrong username in connection string

**Fix**:
Check Neon.tech dashboard for the correct user name

---

### Error: "Connection timeout"
```
Error: Connection timeout - could not connect within 30s
```

**Cause**: Network issue or endpoint unreachable

**Fix**:
1. Check your internet connection
2. Verify firewall allows outbound connections to Neon.tech
3. Make sure you're not behind a restrictive proxy
4. Try restarting your server

---

## 🔍 Detailed Connection String Format

```
postgresql://USERNAME:PASSWORD@ENDPOINT/DATABASE_NAME?sslmode=require
         ↑         ↑       ↑      ↑           ↑                    ↑
      protocol  user   pass   host        database            SSL flag

Full example:
postgresql://neondb_owner:myPassword123@ep-cool-breeze-12345.us-east-1.neon.tech/neondb?sslmode=require
```

---

## 🔑 Password Issues - Most Common

### ❌ Common Mistake 1: Copy-paste issues
- Paste password slowly and verify character-by-character
- Don't use "auto-complete" for the password

### ❌ Common Mistake 2: Special characters
```
If password is:        p@ss:w#rd!
URL encoded version:   p%40ss%3Aw%23rd%21
```

### ❌ Common Mistake 3: Quotes
```
❌ Wrong:  DATABASE_URL="postgresql://...@..."
✅ Right:  DATABASE_URL=postgresql://...@...
```

---

## 📋 Complete Checklist for Neon.tech

- [ ] Neon.tech account created
- [ ] Project created in Neon.tech
- [ ] Database "neondb" exists (or known alternative name)
- [ ] Connection string copied exactly (with special chars handled)
- [ ] .env file updated with connection string
- [ ] .env file has NO quotes around DATABASE_URL
- [ ] Password has no special characters OR they are URL-encoded
- [ ] Connection string ends with `?sslmode=require`
- [ ] Run `npm run init-db` successfully
- [ ] Test connection with Node.js script above (SUCCESS)
- [ ] Login test with curl command (SUCCESS)
- [ ] Server responding at http://localhost:5000
- [ ] Client responding at http://localhost:5173
- [ ] Login page loads
- [ ] Test login works (admin/admin)

---

## 📞 Still Having Issues?

### Check These Files:
1. **server/.env** - Verify DATABASE_URL is correct
2. **server/db/connection.js** - Check pool configuration
3. **server/routes/login.route.js** - Verify query doesn't have errors
4. **server/server.js** - Confirm it's loading routes correctly

### Run Diagnostics:
```bash
cd server

# Test connection
npm run test-connection

# Check Node version
node --version

# Check npm version
npm --version

# View .env file
cat .env

# Test login query
node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL)"
```

### Get Help:
- Neon.tech Support: https://neon.tech/docs/get-started-with-neon
- Stack Overflow: Tag your question with `[neon] [postgresql] [node]`
- GitHub Issues: Document the error and connection format (obscure password)

---

**Remember**: The connection string is the most common issue. Double-check it!
