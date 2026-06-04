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
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
io.on('connection', (socket) => {
  console.log('[Socket.io] Client connected:', socket.id);
});

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Attack Logger (runs before all routes) ───────────────────────────────────
const attackLogger = require('./middleware/attackLogger');
app.use(attackLogger);

// ─── Routes ──────────────────────────────────────────────────────────────────
const honeypotRoutes  = require('./routes/honeypot');
const honeytokenRoutes = require('./routes/honeytokens');
const sessionRoutes   = require('./routes/sessions');

// Primary honeypot bank API
app.use('/api', honeypotRoutes);

// Honeytoken system
app.use('/api/honeytokens', honeytokenRoutes);

// Session recording
app.use('/api/sessions', sessionRoutes);

// Keep existing SOC/replay endpoints for the React client's session recorder
const socRoute = require('./routes/soc.route');
app.use('/api/soc', socRoute);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'SecureBank Honeypot Running', port: PORT, timestamp: new Date().toISOString() });
});

// ─── Catch-all recon trap ─────────────────────────────────────────────────────
// Any unknown route returns a 200 with a convincing admin panel redirect tease
app.use((req, res) => {
  res.status(200).json({
    success: false,
    error: 'Resource not found',
    hint: 'Try /api/admin or /api/config',
  });
});

// ─── Start Alert Engine ───────────────────────────────────────────────────────
const alertEngine = require('./services/alertEngine');
alertEngine.startPolling();

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.HONEYPOT_PORT || process.env.PORT || '4000');

server.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🍯  SECUREBANK HONEYPOT SERVER — RUNNING');
  console.log('='.repeat(60));
  console.log(`📍 Port:       ${PORT}`);
  console.log(`💾 Database:   Neon.tech PostgreSQL`);
  console.log(`📡 Socket.io:  enabled`);
  console.log(`🔔 Alerts:     polling every 10s`);
  console.log('='.repeat(60) + '\n');
});
