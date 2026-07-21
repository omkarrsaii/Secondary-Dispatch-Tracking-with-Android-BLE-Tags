const express = require('express');
const router = express.Router();
const { getAllDevices, getDeviceById, getDeviceHistory, getAppState } = require('../db/database');
const { runFetch, isSessionExpired, isFetching } = require('../services/fetchService');
const { getSchedulerStatus, startScheduler, VALID_INTERVALS } = require('../services/schedulerService');
const { generateExcel, generateCSV } = require('../services/exportService');
const { hasSession } = require('../services/browserService');
const { enrichDevicesWithVehicleAndStatus } = require('../services/deviceStatusService');
const logger = require('../utils/logger');

// GET /api/status
router.get('/status', (req, res) => {
  res.json({
    session: hasSession() ? (isSessionExpired() ? 'expired' : 'ok') : 'missing',
    sessionExpired: isSessionExpired(),
    hasSession: hasSession(),
    scheduler: getSchedulerStatus(),
    lastSync: getAppState('last_sync'),
    lastSyncCount: getAppState('last_sync_count'),
    fetching: isFetching()
  });
});

// GET /api/devices
router.get('/devices', (req, res) => {
  try {
    const devices = enrichDevicesWithVehicleAndStatus(getAllDevices());
    const formatted = devices.map(d => ({
      id: d.id,
      name: d.device_name,
      latitude: d.latitude,
      longitude: d.longitude,
      location: [d.city, d.state, d.country].filter(Boolean).join(', '),
      city: d.city,
      state: d.state,
      country: d.country,
      vehicleNo: d.vehicleNo,
      status: d.status,
      lastSeen: d.last_seen_text,
      imageUrl: d.image_url,
      lastFetch: d.last_fetch_time,
      updatedAt: d.updated_at
    }));
    res.json(formatted);
  } catch (err) {
    logger.error('GET /api/devices error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devices/:id
router.get('/devices/:id', (req, res) => {
  try {
    const device = getDeviceById(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json({
      ...device,
      location: [device.city, device.state, device.country].filter(Boolean).join(', '),
      mapsUrl: device.latitude && device.longitude
        ? `https://www.google.com/maps?q=${device.latitude},${device.longitude}`
        : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/device/:id/history
router.get('/device/:id/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const history = getDeviceHistory(req.params.id, limit);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/refresh
router.post('/refresh', async (req, res) => {
  if (isSessionExpired()) {
    return res.status(401).json({
      error: 'SESSION_EXPIRED',
      message: 'Google session expired. Please run: npm run setup-login'
    });
  }
  if (isFetching()) {
    return res.status(409).json({ message: 'Fetch already in progress' });
  }

  // Start async, return immediately
  res.json({ message: 'Refresh started', timestamp: new Date().toISOString() });
  runFetch().catch(err => logger.error('Async refresh error: ' + err.message));
});

// POST /api/refresh/sync (waits for result)
router.post('/refresh/sync', async (req, res) => {
  if (isSessionExpired()) {
    return res.status(401).json({ error: 'SESSION_EXPIRED' });
  }
  if (isFetching()) {
    return res.status(409).json({ message: 'Fetch already in progress' });
  }
  const result = await runFetch();
  if (result.error === 'SESSION_EXPIRED') {
    return res.status(401).json(result);
  }
  res.json(result);
});

// POST /api/scheduler
router.post('/scheduler', (req, res) => {
  const { interval } = req.body;
  if (!VALID_INTERVALS.includes(parseInt(interval))) {
    return res.status(400).json({ error: `Invalid interval. Valid values: ${VALID_INTERVALS.join(', ')}` });
  }
  const status = startScheduler(parseInt(interval));
  res.json({ message: 'Scheduler updated', ...status });
});

// GET /api/export/excel
router.get('/export/excel', async (req, res) => {
  try {
    const workbook = await generateExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=devices-${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error('Excel export error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/csv
router.get('/export/csv', (req, res) => {
  try {
    const csv = generateCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=devices-${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// GET /api/debug/snapshots — list debug screenshots
router.get('/debug/snapshots', (req, res) => {
  const debugDir = require('path').join(__dirname, '../../data/debug');
  const fs = require('fs');
  if (!fs.existsSync(debugDir)) return res.json({ files: [] });
  const files = fs.readdirSync(debugDir)
    .filter(f => f.endsWith('.png') || f.endsWith('.json') || f.endsWith('.txt'))
    .map(f => ({ name: f, url: `/api/debug/file/${f}` }))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, 20);
  res.json({ files });
});

// GET /api/debug/file/:name — serve a debug file
router.get('/debug/file/:name', (req, res) => {
  const debugDir = require('path').join(__dirname, '../../data/debug');
  const filePath = require('path').join(debugDir, req.params.name);
  const fs = require('fs');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});
