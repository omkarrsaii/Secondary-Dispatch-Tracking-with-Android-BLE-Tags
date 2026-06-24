require('dotenv').config();

// ─── Early sheet-config sanity check ───────────────────────────────────────
// Printed immediately, before Express/Chrome/anything else starts, so it's
// always the first thing visible in the terminal on every run.
(function printSheetConfigSummary() {
  const fs   = require('fs');
  const path = require('path');
  const trim = k => (process.env[k] !== undefined ? String(process.env[k]).trim() : '');

  const keyPath = (() => {
    const raw = trim('GOOGLE_SERVICE_ACCOUNT_KEY') || './data/service-account-key.json';
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  })();

  const rows = [
    ['Service Account Key', fs.existsSync(keyPath) ? 'found' : 'MISSING', keyPath],
    ['Invoice Sheet',    trim('INVOICE_SHEET_ID')    ? 'configured' : 'MISSING', trim('INVOICE_SHEET_TAB') || 'Sheet1'],
    ['Vehicle Sheet',    trim('VEHICLE_SHEET_ID')    ? 'configured' : 'MISSING', trim('VEHICLE_SHEET_TAB') || 'Sheet1'],
    ['Route Sheet',      trim('ROUTE_SHEET_ID')      ? 'configured' : 'MISSING', trim('ROUTE_SHEET_TAB') || 'Sheet1'],
    ['Hierarchy Sheet',  trim('HIERARCHY_SHEET_ID')  ? 'configured' : 'MISSING', trim('HIERARCHY_SHEET_TAB') || 'Sheet1'],
  ];

  console.log('\n┌─ Sheet Configuration ───────────────────────────────────');
  for (const [label, status, extra] of rows) {
    const marker = status === 'MISSING' ? '✗' : '✓';
    console.log(`│ ${marker} ${label.padEnd(20)} ${status.padEnd(12)} (${extra})`);
  }
  console.log('└──────────────────────────────────────────────────────────\n');
})();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const logger  = require('./utils/logger');

const apiRoutes       = require('./routes/api');
const invoiceRoutes   = require('./routes/invoice');
const routeRoutes        = require('./routes/routeRoutes');
const hierarchyRoutes    = require('./routes/hierarchyRoutes');
const dashboardRoutes    = require('./routes/dashboardRoutes');
const distributorRoutes  = require('./routes/distributorRoutes');

const { startScheduler }      = require('./services/schedulerService');
const { runFetch }             = require('./services/fetchService');
const { hasSession, initBrowserSingleton } = require('./services/browserService');
const { getDb }                = require('./db/database');
const { startAutoSync }        = require('./services/mappingService');
const { startMasterDataSync }  = require('./services/masterDataService');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL       || 'http://localhost:5173',
  process.env.CLIENT_TRACKER_URL || 'http://localhost:5174',
].filter(Boolean).map(o => o.trim().replace(/:+$/, ''));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);
app.use('/api/invoice', invoiceRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/hierarchy', hierarchyRoutes);
app.use('/api/dashboard', dashboardRoutes);   // includes /api/dashboard/stats
app.use('/api', dashboardRoutes);             // also exposes /api/search directly
app.use('/api/distributor', distributorRoutes);

// ─── Production static serving ────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
  const clientTrackerPath = path.join(__dirname, '../../client-tracker/dist');
  app.use('/track', express.static(clientTrackerPath));
  app.get('/track/*', (req, res) =>
    res.sendFile(path.join(clientTrackerPath, 'index.html'))
  );
  app.get('*', (req, res) =>
    res.sendFile(path.join(frontendPath, 'index.html'))
  );
}

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error: ' + err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
async function startServer() {
  getDb();

  // Start invoice/vehicle mapping auto-sync (existing)
  startAutoSync();

  // Start route + hierarchy auto-sync (new)
  startMasterDataSync();

  app.listen(PORT, () => {
    logger.info(`Find Hub Tracker running on http://localhost:${PORT}`);
  });

  if (!hasSession()) {
    logger.warn('No session found. Run: npm run setup-login');
    return;
  }

  try {
    await initBrowserSingleton();
  } catch (err) {
    logger.error('Failed to initialise browser: ' + err.message);
    logger.warn('Location fetching disabled. Check Chrome is installed.');
    return;
  }

  const interval = parseInt(process.env.FETCH_INTERVAL) || 10;
  startScheduler(interval);
  logger.info('Running initial fetch on startup...');
  setTimeout(() => runFetch(), 3000);
}

startServer().catch(err => {
  logger.error('Failed to start server: ' + err.message);
  process.exit(1);
});
