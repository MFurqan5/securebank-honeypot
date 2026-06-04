# How to Run SecureBank Honeypot - Server & Client

## Quick Start (2 Terminal Windows)

### Terminal 1 - Start Server (Port 4000)
```bash
cd server
npm start
```

**Expected Output**:
```
============================================================
🍯  SECUREBANK HONEYPOT SERVER — RUNNING
============================================================
📍 Port:       4000
💾 Database:   Neon.tech PostgreSQL
📡 Socket.io:  enabled
🔔 Alerts:     polling every 10s
============================================================
```

### Terminal 2 - Start Client (Port 5173)
```bash
cd client
npm run dev
```

**Expected Output**:
```
  VITE v4.4.0  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

---

## What to Do After Starting

1. **Open Browser**: Navigate to `http://localhost:5173`
2. **Login Page**: You should see SecureBank login form
3. **Test Credentials**: 
   - Username: `admin`
   - Password: `admin`
4. **Dashboard**: After login, you'll see fake account data

---

## Troubleshooting

### Server Won't Start
```bash
# Check if port 4000 is in use
# Windows: netstat -ano | findstr :4000
# Mac/Linux: lsof -i :4000

# If port in use, kill the process or use different port:
HONEYPOT_PORT=4001 npm start
```

### Client Won't Start
```bash
# Make sure dependencies are installed
cd client
npm install
npm run dev
```

### Database Connection Error
```bash
# Check .env file has DATABASE_URL
cat .env

# If missing, run database init:
cd server
npm run init-db
npm start
```

---

## Available Test Accounts

```
Admin:
  Username: admin
  Password: admin

Customer 1:
  Username: john_doe
  Password: password123

Customer 2:
  Username: jane_smith
  Password: qwerty456

Customer 3:
  Username: robert_brown
  Password: brown2024
```

---

## Testing Vulnerabilities (After Login)

### 1. SQL Injection (Search Page)
Try in search box:
```
admin' OR '1'='1'--
```

### 2. Stored XSS (Comments Page)
Try posting:
```
<script>alert('XSS')</script>
```

### 3. Reflected XSS (Search Results)
Try in search:
```
<img src=x onerror=alert('reflected-xss')>
```

### 4. Path Traversal (Downloads)
Try in file input:
```
../../../etc/passwd
```

---

## API Endpoints You Can Test

```bash
# Get all honeytokens
curl http://localhost:4000/api/honeytokels

# Get active honeytokels
curl http://localhost:4000/api/honeytokels/active

# Get statistics
curl http://localhost:4000/api/honeytokels/stats/summary

# Create honeytoken
curl -X POST http://localhost:4000/api/honeytokels/create \
  -H "Content-Type: application/json" \
  -d '{"type":"credential","ttlSeconds":3600}'

# Test login
curl -X POST http://localhost:4000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

---

## Key Information

**Server Port**: 4000  
**Client Port**: 5173  
**Database**: PostgreSQL on Neon.tech  
**Frontend**: React + Vite  
**Backend**: Node.js + Express  

---

## Keep Both Running

✅ **Keep Terminal 1 (Server)** running - it logs all attacks  
✅ **Keep Terminal 2 (Client)** running - it serves the frontend  

Don't close either terminal while testing!

---

## Stopping

To stop:
- **Server**: Press Ctrl+C in Terminal 1
- **Client**: Press Ctrl+C in Terminal 2

---

## Documentation Reference

For Token Expiry System details, see:
- QUICK_REFERENCE.md - Quick commands
- TOKEN_EXPIRY_GUIDE.md - Complete guide
- DEPLOYMENT_CHECKLIST.md - Deployment steps

---

**Status**: ✅ Ready to Run!
