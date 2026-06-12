/**
 * invoice.js  —  /api/invoice/* routes
 *
 * Public tracking endpoint (used by client-tracker frontend):
 *   GET  /api/invoice/track/:invoiceNo
 *   POST /api/invoice/track                  body: { invoiceNo }
 *
 * Admin / ops endpoints:
 *   GET  /api/invoice/sync/status            last sync time, counts, source
 *   POST /api/invoice/sync                   trigger manual Sheets re-sync
 *   GET  /api/invoice/mappings/invoices      list all invoice→vehicle entries
 *   GET  /api/invoice/mappings/vehicles      list all vehicle→device entries
 *   POST /api/invoice/mappings/import/invoices   import from CSV file path
 *   POST /api/invoice/mappings/import/vehicles   import from CSV file path
 */

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');

const logger = require('../utils/logger');
const { getDeviceByName } = require('../db/database');
const {
  resolveInvoice,
  syncFromGoogleSheets,
  getSyncStatus,
  getAllInvoiceMappings,
  getAllVehicleDeviceMappings,
  importInvoiceMappingFromCSV,
  importVehicleDeviceMappingFromCSV,
} = require('../services/mappingService');

// ─── Core resolution logic ────────────────────────────────────────────────────

async function trackInvoice(invoiceNo, res) {
  if (!invoiceNo || typeof invoiceNo !== 'string') {
    return res.status(400).json({ error: 'MISSING_INVOICE', message: 'invoiceNo is required.' });
  }

  const sanitized = invoiceNo.trim().replace(/[^a-zA-Z0-9\-_/]/g, '');
  if (!sanitized) {
    return res.status(400).json({ error: 'INVALID_INVOICE', message: 'invoiceNo contains invalid characters.' });
  }

  // Step 1 — Invoice → Vehicle
  const resolution = resolveInvoice(sanitized);

  if (!resolution.vehicleNo) {
    logger.info(`Truck not allocated: ${sanitized}`);
    return res.status(404).json({
      error:     'INVOICE_NOT_FOUND',
      message:   `Invoice "${sanitized}" was not found. If this is a new invoice, data may still be syncing — try again in a moment.`,
      invoiceNo: sanitized,
    });
  }

  if (!resolution.deviceName) {
    logger.warn(`No device mapped for vehicle: ${resolution.vehicleNo}`);
    return res.status(404).json({
      error:     'DEVICE_NOT_MAPPED',
      message:   `Vehicle ${resolution.vehicleNo} does not have a tracking device assigned.`,
      invoiceNo: sanitized,
      vehicleNo: resolution.vehicleNo,
    });
  }

  // Step 2 — Device Name → Latest location from DB
  const deviceRecord = getDeviceByName(resolution.deviceName);

  if (!deviceRecord) {
    logger.warn(`Device not yet in DB: ${resolution.deviceName}`);
    return res.status(404).json({
      error:      'DEVICE_NOT_TRACKED',
      message:    `Device "${resolution.deviceName}" has not reported a location yet. Please try again in a few minutes.`,
      invoiceNo:  sanitized,
      vehicleNo:  resolution.vehicleNo,
      deviceName: resolution.deviceName,
    });
  }

  // Step 3 — Build and return result
  const hasCoords = deviceRecord.latitude && deviceRecord.longitude;

  const result = {
    invoiceNo:  sanitized,
    vehicleNo:  resolution.vehicleNo,
    deviceName: resolution.deviceName,
    meta:       resolution.meta,
    location: {
      latitude:  hasCoords ? parseFloat(deviceRecord.latitude)  : null,
      longitude: hasCoords ? parseFloat(deviceRecord.longitude) : null,
      city:      deviceRecord.city            || null,
      state:     deviceRecord.state           || null,
      country:   deviceRecord.country         || null,
      address:   [deviceRecord.city, deviceRecord.state, deviceRecord.country].filter(Boolean).join(', ') || null,
      lastSeen:  deviceRecord.last_seen_text  || null,
      battery:   deviceRecord.battery        || null,
      network:   deviceRecord.network        || null,
      imageUrl:  deviceRecord.image_url      || null,
      updatedAt: deviceRecord.updated_at     || null,
      lastFetch: deviceRecord.last_fetch_time || null,
    },
    mapsUrl:   hasCoords
      ? `https://www.google.com/maps?q=${deviceRecord.latitude},${deviceRecord.longitude}`
      : null,
    trackedAt: new Date().toISOString(),
  };

  logger.info(
    `Tracked: ${sanitized} → ${resolution.vehicleNo} → ${resolution.deviceName} @ ${deviceRecord.city || 'unknown'}`
  );
  return res.json({ success: true, data: result });
}

// ─── GET /api/invoice/track/:invoiceNo ───────────────────────────────────────

router.get('/track/:invoiceNo', async (req, res) => {
  try {
    await trackInvoice(req.params.invoiceNo, res);
  } catch (err) {
    logger.error('GET /api/invoice/track error: ' + err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
});

// ─── POST /api/invoice/track ─────────────────────────────────────────────────

router.post('/track', async (req, res) => {
  try {
    await trackInvoice(req.body?.invoiceNo, res);
  } catch (err) {
    logger.error('POST /api/invoice/track error: ' + err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
});

// ─── GET /api/invoice/sync/status ────────────────────────────────────────────

router.get('/sync/status', (req, res) => {
  res.json(getSyncStatus());
});

// ─── POST /api/invoice/sync  (manual trigger) ────────────────────────────────

router.post('/sync', async (req, res) => {
  try {
    const result = await syncFromGoogleSheets();
    res.json(result);
  } catch (err) {
    logger.error('Manual sync error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoice/mappings/invoices ──────────────────────────────────────

router.get('/mappings/invoices', (req, res) => {
  try {
    res.json({ mappings: getAllInvoiceMappings() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoice/mappings/vehicles ──────────────────────────────────────

router.get('/mappings/vehicles', (req, res) => {
  try {
    res.json({ mappings: getAllVehicleDeviceMappings() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/invoice/mappings/import/invoices ──────────────────────────────

router.post('/mappings/import/invoices', (req, res) => {
  try {
    const { csvPath } = req.body;
    if (!csvPath) return res.status(400).json({ error: 'csvPath is required' });
    const absPath = path.isAbsolute(csvPath) ? csvPath : path.resolve(process.cwd(), csvPath);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: `File not found: ${absPath}` });
    const count = importInvoiceMappingFromCSV(absPath);
    res.json({ success: true, imported: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/invoice/mappings/import/vehicles ──────────────────────────────

router.post('/mappings/import/vehicles', (req, res) => {
  try {
    const { csvPath } = req.body;
    if (!csvPath) return res.status(400).json({ error: 'csvPath is required' });
    const absPath = path.isAbsolute(csvPath) ? csvPath : path.resolve(process.cwd(), csvPath);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: `File not found: ${absPath}` });
    const count = importVehicleDeviceMappingFromCSV(absPath);
    res.json({ success: true, imported: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
