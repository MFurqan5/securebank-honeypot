require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');

const app = express();
const server = http.createServer(app);

// ─── Socket.io ───────────────────────────────────────────────────────────────
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { 
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true 
  }
});

// Store io instance for use in routes
app.set('io', io);

io.on('connection', (socket) => {
  console.log('[Socket.io] SOC Dashboard connected:', socket.id);
  
  socket.on('request_sync', async () => {
    // Send initial data when dashboard requests sync
    const pool = require('./db/connection');
    try {
      const events = await pool.query('SELECT * FROM attack_logs ORDER BY timestamp DESC LIMIT 100');
      const attackers = await pool.query('SELECT * FROM attacker_profiles ORDER BY threat_score DESC');
      socket.emit('initial_sync', {
        events: events.rows,
        attackers: attackers.rows
      });
    } catch (err) {
      console.error('Sync error:', err.message);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('[Socket.io] Client disconnected:', socket.id);
  });
});

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Attack Logger (runs before all routes) ───────────────────────────────────
const attackLogger = require('./middleware/attackLogger');
app.use(attackLogger);

// ─── Routes ──────────────────────────────────────────────────────────────────
// FIXED: Removed duplicate session import
const loginRoute        = require('./routes/login.route');
const searchRoute       = require('./routes/search.route');
const commentsRoute     = require('./routes/comments.route');
const downloadRoute     = require('./routes/download.route');
const transactionRoute  = require('./routes/transactions.route');
const usersRoute        = require('./routes/users.route');
const analyticsRoute    = require('./routes/analytics.route');
const accountRoute      = require('./routes/accounts.route');
const transferRoute     = require('./routes/transfer.route');
const sessionRoute      = require('./routes/session.route');  // Fixed name
const honeytokenRoutes  = require('./routes/honeytokens');

// Honeypot vulnerable routes
app.use('/api/login', loginRoute);
app.use('/api/search', searchRoute);
app.use('/api/comments', commentsRoute);
app.use('/api/downloads', downloadRoute);  // Note: 'downloads' not 'download'
app.use('/api/transfer', transferRoute);
app.use('/api/session', sessionRoute);
app.use('/api/accounts', accountRoute);

// Bank functionality routes
app.use('/api/transactions', transactionRoute);
app.use('/api/users', usersRoute);
app.use('/api/analytics', analyticsRoute);

// Honeytoken management
app.use('/api/honeytokens', honeytokenRoutes);

// Session recording (for attack replay)
app.use('/api/sessions', require('./routes/sessions'));

// SOC endpoints
// app.use('/api/soc', socRoute);

// ─── Health check ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.HONEYPOT_PORT || process.env.PORT || '5000'); // FIXED: Use 5000 to match frontend

app.get('/health', (req, res) => {
  res.json({ 
    status: 'SecureBank Honeypot Running', 
    port: PORT, 
    timestamp: new Date().toISOString(),
    endpoints: {
      login: '/api/login',
      search: '/api/search',
      comments: '/api/comments',
      downloads: '/api/downloads',
      transactions: '/api/transactions',
      honeytokens: '/api/honeytokens',
    }
  });
});

// ─── Catch-all recon trap ─────────────────────────────────────────────────────
app.use((req, res) => {
  console.log(`[RECON] Unknown endpoint accessed: ${req.method} ${req.path}`);
  res.status(200).json({
    success: false,
    error: 'Resource not found',
    hint: 'Try /api/admin or /api/config',
    path: req.path
  });
});

// ─── Error handling middleware ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err.message);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ─── Start Alert Engine ───────────────────────────────────────────────────────
const alertEngine = require('./services/alertEngine');
if (alertEngine && alertEngine.startPolling) {
  alertEngine.startPolling();
  console.log('[Alerts] Alert engine started');
}

// ─── Start Server ─────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log('🍯  SECUREBANK HONEYPOT SERVER — RUNNING');
  console.log('='.repeat(60));
  console.log(`📍 Port:       ${PORT}`);
  console.log(`📍 API URL:    http://localhost:${PORT}/api`);
  console.log(`📍 Frontend:   http://localhost:3000`);
  console.log(`💾 Database:   Neon.tech PostgreSQL`);
  console.log(`📡 Socket.io:  enabled on port ${PORT}`);
  console.log(`🔔 Alerts:     polling every 10s`);
  console.log('='.repeat(60));
  console.log('\n⚠️  VULNERABLE ENDPOINTS (for testing):');
  console.log(`   • SQL Injection:     POST /api/login`);
  console.log(`   • Reflected XSS:     GET /api/search?q=<script>`);
  console.log(`   • Stored XSS:        POST /api/comments`);
  console.log(`   • Path Traversal:    GET /api/downloads?file=../../../etc/passwd`);
  console.log(`   • IDOR:              GET /api/accounts/1, GET /api/users/1`);
  console.log(`   • Weak Sessions:     GET /api/session`);
  console.log('='.repeat(60) + '\n');
});