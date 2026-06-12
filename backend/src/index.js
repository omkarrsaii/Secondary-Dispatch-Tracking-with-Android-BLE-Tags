require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');
const invoiceRoutes = require('./routes/invoice');
const { startScheduler } = require('./services/schedulerService');
const { runFetch } = require('./services/fetchService');
const { hasSession, initBrowserSingleton } = require('./services/browserService');
const { getDb } = require('./db/database');
const { startAutoSync } = require('./services/mappingService');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Allowed Origins ──────────────────────────────────────────────────────────
// Admin dashboard  : FRONTEND_URL        (default: localhost:5173)
// Client tracker   : CLIENT_TRACKER_URL  (default: localhost:5174)

const allowedOrigins = [
  process.env.FRONTEND_URL       || 'http://localhost:5173',
  process.env.CLIENT_TRACKER_URL || 'http://localhost:5174',
].filter(Boolean)
 .map(o => o.trim().replace(/:+$/, ''));  // strip trailing colons e.g. "5174:"

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  logger.info(`${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/api', apiRoutes);
app.use('/api/invoice', invoiceRoutes);

// Serve admin frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));

  // Serve client-tracker on /track/* to avoid clashing with admin SPA
  const clientTrackerPath = path.join(__dirname, '../../client-tracker/dist');
  app.use('/track', express.static(clientTrackerPath));
  app.get('/track/*', (req, res) => {
    res.sendFile(path.join(clientTrackerPath, 'index.html'));
  });

  // Admin SPA fallback (must come last)
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error: ' + err.message);
  res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
  // Initialize DB
  getDb();

  // Start mapping auto-sync from Google Sheets (no-op if not configured)
  startAutoSync();

  app.listen(PORT, () => {
    logger.info(`Find Hub Tracker  running on http://localhost:${PORT}`);
  });

  if (!hasSession()) {
    logger.warn('No session found. Run: npm run setup-login');
    return;
  }

  // FIX (Issues 3 & 4): Launch browser ONCE here and keep it alive.
  // fetchAllDevices() will reuse this singleton on every scheduled cycle.
  try {
    await initBrowserSingleton();
  } catch (err) {
    logger.error('Failed to initialise browser: ' + err.message);
    logger.warn('Location fetching disabled. Check Chrome is installed.');
    return;
  }

  // Start scheduler
  const interval = parseInt(process.env.FETCH_INTERVAL) || 10;
  startScheduler(interval);

  // Run initial fetch
  logger.info('Running initial fetch on startup...');
  setTimeout(() => runFetch(), 3000);
}

startServer().catch(err => {
  logger.error('Failed to start server: ' + err.message);
  process.exit(1);
});
