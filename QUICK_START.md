# 🚀 SecureBank Honeypot - Quick Start Guide

## ⚡ 5-Minute Setup

### Prerequisites
- Node.js installed
- Neon.tech account (free at https://neon.tech)
- Any terminal/command prompt

---

## Step 1️⃣: Get Your Neon.tech Connection String (2 minutes)

1. Go to https://neon.tech and sign up (free)
2. Create a new project
3. In your project dashboard, click "Connection string"
4. Copy the PostgreSQL connection string (looks like):
   ```
   postgresql://neondb_owner:abc123def@ep-calm-breeze-12345.us-east-1.neon.tech/neondb?sslmode=require
   ```
5. Save this somewhere safe

---

## Step 2️⃣: Clone/Extract Project

If you haven't already:
```bash
cd securebank-honeypot
```

---

## Step 3️⃣: Configure Environment

### Windows:
```bash
cd server
copy .env.example .env
# Open .env in notepad and paste your Neon connection string
```

### Mac/Linux:
```bash
cd server
cp .env.example .env
# Edit .env with your editor and paste your Neon connection string
nano .env
```

Your `.env` should look like:
```env
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-your-endpoint.us-east-1.neon.tech/neondb?sslmode=require
HONEYPOT_PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

---

## Step 4️⃣: Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies (in new terminal)
cd client
npm install
```

---

## Step 5️⃣: Initialize Database

```bash
cd server
npm run init-db
```

✅ You should see:
```
✅ Database initialized successfully!

📝 Test Credentials:
  Username: admin          Password: admin
  Username: john_doe       Password: password123
  Username: jane_smith     Password: qwerty456
```

**If you get an error here, check:**
- Is your DATABASE_URL in .env correct?
- Can you access Neon.tech from your internet connection?
- Is the password properly escaped if it contains special characters?

---

## Step 6️⃣: Start the Application

### Terminal 1 - Backend Server:
```bash
cd server
npm run dev
```

You should see:
```
Honeypot server running on port 5000
```

### Terminal 2 - Frontend Client:
```bash
cd client
npm run dev
```

You should see:
```
VITE v... ready in ... ms

➜  Local:   http://localhost:5173/
```

---

## Step 7️⃣: Login and Test

1. Open http://localhost:5173 in your browser
2. Enter credentials:
   - **Username**: `admin`
   - **Password**: `admin`
3. Click "Login"
4. You should see the dashboard! 🎉

---

## ✅ Verify Everything Works

- [ ] Server running on port 5000
- [ ] Client running on port 5173
- [ ] Can access http://localhost:5173
- [ ] Login works with admin/admin
- [ ] Dashboard loads after login
- [ ] Navbar shows with menu items

---

## 🐛 Common Problems

### ❌ "Cannot GET /"
- Backend not running. Run `npm run dev` in server folder

### ❌ "Login failed. Invalid credentials."
- Database not initialized. Run `npm run init-db`
- Restart server after init

### ❌ "Connection refused"
- Check if server is running on port 5000
- Change port in .env if 5000 is in use

### ❌ "Database connection error"
- Verify .env DATABASE_URL is correct
- Make sure Neon.tech password is properly copied
- Check internet connection to Neon.tech

### ❌ "Port 5000 already in use"
- Change HONEYPOT_PORT in server/.env to 5001
- Restart server

### ❌ "Module not found"
- Run `npm install` again in both server and client folders
- Delete node_modules and reinstall if needed

---

## 🔧 Useful Commands

```bash
# Reset database
cd server
npm run init-db

# Restart with fresh environment
npm run dev

# Install missing dependencies
npm install

# Check if port is in use
# Windows: netstat -ano | findstr :5000
# Mac/Linux: lsof -i :5000
```

---

## 📍 URL Endpoints

| URL | Purpose |
|-----|---------|
| http://localhost:5173 | Frontend application |
| http://localhost:5000 | Backend API |
| http://localhost:5000/api/login | Login endpoint |

---

## 🎓 Next Steps

Once logged in, try exploring:
- Search functionality (vulnerable to reflected XSS)
- Comments section (stored XSS)
- Download feature (path traversal)
- Learn the intentional vulnerabilities!

---

## 📞 Need Help?

1. Check README.md for detailed troubleshooting
2. Verify all files exist: server/, client/, .env
3. Check terminal output for specific error messages
4. Make sure Node.js version is v14+

---

**That's it! You're all set! 🚀**
