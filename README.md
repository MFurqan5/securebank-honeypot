# 🏦 SecureBank Honeypot - Complete Setup Guide

A vulnerable banking application designed for security research and educational purposes. It contains intentional security flaws to demonstrate common web vulnerabilities.

## ⚙️ Prerequisites

- **Node.js** (v14 or higher)
- **PostgreSQL** (via Neon.tech cloud or local instance)
- **npm** or **yarn**

## 🚀 Quick Start Setup

### Step 1: Set Up Neon.tech Database

1. Go to [https://neon.tech](https://neon.tech)
2. Create a free account and project
3. Create a new database (or use the default "neondb")
4. Copy your connection string from the dashboard
5. It will look like: `postgresql://neondb_owner:YOUR_PASSWORD@ep-xxx.us-east-1.neon.tech/neondb?sslmode=require`

### Step 2: Configure Server Environment

1. Navigate to the `server/` directory:
   ```bash
   cd server
   ```

2. Create a `.env` file from the template:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and paste your Neon.tech connection string:
   ```env
   DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-xxx.us-east-1.neon.tech/neondb?sslmode=require
   HONEYPOT_PORT=5000
   NODE_ENV=development
   CLIENT_URL=http://localhost:5173
   ```

4. Install server dependencies:
   ```bash
   npm install
   ```

5. Initialize the database with schema and test data:
   ```bash
   npm run init-db
   ```

   **Important:** This command will:
   - Drop any existing tables
   - Create all required tables
   - Insert sample data (test users, employees, etc.)

### Step 3: Configure and Start Client

1. In a new terminal, navigate to the `client/` directory:
   ```bash
   cd client
   ```

2. Install client dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

   The client will run on **http://localhost:5173** (Vite default port)

### Step 4: Start Backend Server

1. In another terminal, from the `server/` directory:
   ```bash
   npm run dev
   ```

   The backend will run on **http://localhost:5000**

## 🧪 Test Credentials

After running `npm run init-db`, use these credentials to login:

| Username | Password | Role |
|----------|----------|------|
| admin | admin | Admin |
| john_doe | password123 | Customer |
| jane_smith | qwerty456 | Customer |
| robert_brown | brown2024 | Customer |
| michael.chen | michael123 | Branch Manager |

## 🔓 Common Issues & Fixes

### ❌ Issue: "Cannot connect to database"
- **Solution**: Verify your `.env` file has the correct `DATABASE_URL`
- Check your Neon.tech password is correct (special characters need escaping)
- Ensure SSL is enabled (`?sslmode=require`)
- Test connection: `node -e "require('./db/connection').query('SELECT NOW()').then(r => console.log(r.rows))"`

### ❌ Issue: "Login fails with correct credentials"
- **Solution**: Run `npm run init-db` to populate the database
- Check that the server is running on port 5000
- Verify CORS is configured correctly

### ❌ Issue: "Port 5000 already in use"
- **Solution**: Change `HONEYPOT_PORT` in `.env` to a different port (e.g., 5001)
- Or kill the process using port 5000

### ❌ Issue: Client can't connect to server
- **Solution**: Make sure server is running on port 5000
- Check that `API_URL` in `client/src/components/Login.jsx` points to `http://localhost:5000`
- Verify CORS headers are enabled (they are by default in our config)

## 📁 Project Structure

```
securebank-honeypot/
├── server/                          # Backend (Express + PostgreSQL)
│   ├── server.js                   # Main server file
│   ├── init-db.js                  # Database initialization script
│   ├── package.json
│   ├── .env                        # Configuration (create from .env.example)
│   ├── .env.example                # Template
│   ├── db/
│   │   ├── connection.js           # PostgreSQL connection pool
│   │   └── schema.sql              # Database schema
│   └── routes/
│       ├── login.route.js          # Login endpoint (vulnerable to SQL injection)
│       ├── search.route.js
│       ├── comments.route.js       # Vulnerable to XSS
│       └── download.route.js       # Vulnerable to path traversal
│
├── client/                          # Frontend (React + Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── App.css
│   │   └── components/
│   │       ├── Login.jsx           # Login form
│   │       ├── Dashboard.jsx       # Main dashboard
│   │       └── [other components]
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── database/
│   └── seed.sql                    # Optional: Manual database setup
│
├── docker/
│   └── docker-compose.yml          # Docker setup (optional)
│
└── README.md                        # This file
```

## 🔒 Security Notes (Educational Purposes Only)

⚠️ **WARNING**: This application contains INTENTIONAL security vulnerabilities:

1. **SQL Injection** - Login endpoint accepts raw user input in queries
2. **Cross-Site Scripting (XSS)** - Comments are not sanitized
3. **Path Traversal** - Download endpoint doesn't validate file paths
4. **Weak Authentication** - Passwords stored in plain text
5. **No HTTPS** - Uses HTTP in development
6. **CORS Open** - Allows requests from any origin

**This is for educational use only. Never use this code in production!**

## 🛠️ Development Commands

### Server
```bash
npm run dev          # Start with auto-reload (nodemon)
npm start            # Start production mode
npm run init-db      # Initialize/reset database
```

### Client
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

## 🔄 Resetting the Database

To reset the database and reload test data:

```bash
cd server
npm run init-db
```

## 📊 Database Tables

After initialization, these tables are created:

- **users** - Customer accounts
- **employees** - Bank staff
- **roles** - Permission levels
- **branches** - Bank branches
- **transactions** - Money transfers
- **attack_logs** - Security incidents
- **attacker_profiles** - Attack source analysis
- **comments** - User feedback (unfiltered)
- **loans** - Loan applications
- **support_tickets** - Customer support
- **ioc_records** - Indicators of compromise

## 🐛 Troubleshooting

1. **Check server logs** for detailed error messages
2. **Verify .env file** - Most issues are configuration-related
3. **Test database connection** independently
4. **Check CORS settings** if frontend can't reach backend
5. **Look for port conflicts** if server won't start

## 📚 Educational Resources

This honeypot demonstrates:
- SQL Injection attacks
- XSS (Cross-Site Scripting) vulnerabilities
- Path traversal attacks
- IDOR (Insecure Direct Object Reference)
- CSRF (Cross-Site Request Forgery) patterns
- Security logging and monitoring
- Attacker profiling

## 📝 License

ISC - For educational purposes

## ⚠️ Disclaimer

This project is designed for educational and authorized testing only. Unauthorized access to computer systems is illegal. Always get proper authorization before conducting security testing.

---

**Last Updated**: 2024
**Status**: ✅ Production Ready for Education
