/**
 * mappingService.js
 *
 * ROOT CAUSE FIX (Issue 2):
 *   The previous version tried to read invoice-mapping.json and
 *   vehicle-device-mapping.json as fallbacks. Those files don't exist
 *   → ENOENT errors on every startup.
 *
 *   New architecture:
 *     - Google Sheets is the ONLY required data source (when configured).
 *     - In-memory Maps hold the live data; no JSON files required.
 *     - On Sheets sync failure, the existing in-memory maps are preserved
 *       (last-known-good), rather than wiping to empty.
 *     - JSON files are written after a successful sync as an optional backup,
 *       and read ONCE at startup only if Sheets is not configured (seed data).
 *
 * SYNC LIFECYCLE:
 *   startAutoSync() called once at server start
 *     → immediate syncFromGoogleSheets()
 *     → repeated every SHEET_SYNC_INTERVAL minutes
 */

const fs     = require('fs');
const path   = require('path');
const logger = require('../utils/logger');
const sheets = require('./sheetsService');

// ─── Paths (used only for optional backup JSON files) ────────────────────────

const DATA_DIR         = path.resolve(__dirname, '../../data');
const INVOICE_MAP_FILE = path.join(DATA_DIR, 'invoice-mapping.json');
const VEHICLE_DEV_FILE = path.join(DATA_DIR, 'vehicle-device-mapping.json');

// ─── In-memory maps ───────────────────────────────────────────────────────────

let invoiceMap = null;  // Map<invoiceNo → { vehicleNo, customerCode, chainName, location }>
let vehicleMap = null;  // Map<vehicleNo → deviceName>

// ─── Sync state ───────────────────────────────────────────────────────────────

const syncState = {
  lastSyncAt:     null,
  lastSyncSource: null,   // 'google_sheets' | 'json_backup' | 'empty'
  lastSyncCount:  { invoices: 0, vehicles: 0 },
  syncing:        false,
  lastError:      null,
  timer:          null,
};

// ─── Optional backup JSON helpers ─────────────────────────────────────────────
// Used only at cold-start when Sheets is not configured.

function loadFromBackupFiles() {
  let iMap = new Map();
  let vMap = new Map();

  try {
    const raw  = fs.readFileSync(INVOICE_MAP_FILE, 'utf8');
    const data = JSON.parse(raw);
    (data.mappings || []).forEach(e => {
      if (e.invoiceNo && e.vehicleNo) iMap.set(String(e.invoiceNo).trim(), e);
    });
    logger.info(`mappingService: loaded ${iMap.size} invoice entries from backup file`);
  } catch {
    // File doesn't exist or is malformed — that's fine, use empty map
  }

  try {
    const raw  = fs.readFileSync(VEHICLE_DEV_FILE, 'utf8');
    const data = JSON.parse(raw);
    (data.mappings || []).forEach(e => {
      if (e.vehicleNo && e.deviceName) vMap.set(String(e.vehicleNo).trim(), String(e.deviceName).trim());
    });
    logger.info(`mappingService: loaded ${vMap.size} vehicle entries from backup file`);
  } catch {
    // Same — fine if missing
  }

  return { iMap, vMap };
}

function writeBackupFiles(invoiceMappings, vehicleMappings) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      INVOICE_MAP_FILE,
      JSON.stringify({
        _comment: `Synced from Google Sheets at ${new Date().toISOString()}`,
        mappings: invoiceMappings,
      }, null, 2)
    );
    fs.writeFileSync(
      VEHICLE_DEV_FILE,
      JSON.stringify({
        _comment: `Synced from Google Sheets at ${new Date().toISOString()}`,
        mappings: vehicleMappings,
      }, null, 2)
    );
  } catch (err) {
    logger.warn('mappingService: could not write backup files — ' + err.message);
  }
}

// ─── Bootstrap (called once, synchronously before first request) ──────────────

function bootstrapMaps() {
  if (invoiceMap !== null) return;   // already initialised

  if (sheets.isConfigured()) {
    // Will be populated by first async sync; start with empty maps
    invoiceMap = new Map();
    vehicleMap = new Map();
    logger.info('mappingService: in-memory maps initialised (empty until first Sheets sync)');
  } else {
    // Try backup JSON files for seed data
    const { iMap, vMap } = loadFromBackupFiles();
    invoiceMap = iMap;
    vehicleMap = vMap;
    const src = (invoiceMap.size > 0 || vehicleMap.size > 0) ? 'json_backup' : 'empty';
    syncState.lastSyncSource = src;
    syncState.lastSyncCount  = { invoices: invoiceMap.size, vehicles: vehicleMap.size };
    if (src === 'empty') {
      logger.warn(
        'mappingService: Google Sheets not configured and no backup JSON files found. ' +
        'Configure GOOGLE_SERVICE_ACCOUNT_KEY, INVOICE_SHEET_ID, VEHICLE_SHEET_ID in .env'
      );
    }
  }
}

// ─── Google Sheets sync ───────────────────────────────────────────────────────

async function syncFromGoogleSheets() {
  if (syncState.syncing) {
    logger.info('mappingService: sync already in progress, skipping');
    return { success: false, reason: 'already_syncing' };
  }

  if (!sheets.isConfigured()) {
    return { success: false, reason: 'not_configured' };
  }

  syncState.syncing   = true;
  syncState.lastError = null;

  try {
    logger.info('mappingService: syncing from Google Sheets...');

    const [invoiceMappings, vehicleMappings] = await Promise.all([
      sheets.fetchInvoiceMappings(),
      sheets.fetchVehicleMappings(),
    ]);

    // Atomically swap in-memory maps
    const newIMap = new Map();
    invoiceMappings.forEach(e => newIMap.set(e.invoiceNo, e));

    const newVMap = new Map();
    vehicleMappings.forEach(e => newVMap.set(e.vehicleNo, e.deviceName));

    invoiceMap = newIMap;
    vehicleMap = newVMap;

    // Write backup files (non-blocking, best-effort)
    writeBackupFiles(invoiceMappings, vehicleMappings);

    syncState.lastSyncAt     = new Date().toISOString();
    syncState.lastSyncSource = 'google_sheets';
    syncState.lastSyncCount  = { invoices: invoiceMappings.length, vehicles: vehicleMappings.length };

    logger.info(
      `mappingService: sync complete — ` +
      `${invoiceMappings.length} invoices, ${vehicleMappings.length} vehicles`
    );

    return {
      success:  true,
      source:   'google_sheets',
      invoices: invoiceMappings.length,
      vehicles: vehicleMappings.length,
      syncedAt: syncState.lastSyncAt,
    };

  } catch (err) {
    syncState.lastError = err.message;
    logger.error('mappingService: Google Sheets sync failed — ' + err.message);

    // Preserve existing in-memory maps (last-known-good) — do NOT wipe them
    const preserved = { invoices: invoiceMap?.size || 0, vehicles: vehicleMap?.size || 0 };
    logger.warn(`mappingService: keeping existing maps (${preserved.invoices} invoices, ${preserved.vehicles} vehicles)`);

    return {
      success:   false,
      error:     err.message,
      preserved: preserved,
    };

  } finally {
    syncState.syncing = false;
  }
}

// ─── Auto-sync scheduler ──────────────────────────────────────────────────────

function startAutoSync(intervalMinutes) {
  bootstrapMaps();

  const mins = parseInt(intervalMinutes || process.env.SHEET_SYNC_INTERVAL || 5);

  if (!sheets.isConfigured()) {
    logger.info('mappingService: Google Sheets not configured — auto-sync disabled');
    return;
  }

  // Immediate first sync
  syncFromGoogleSheets().catch(err =>
    logger.error('mappingService: initial sync error — ' + err.message)
  );

  if (syncState.timer) clearInterval(syncState.timer);
  syncState.timer = setInterval(() => {
    syncFromGoogleSheets().catch(err =>
      logger.error('mappingService: scheduled sync error — ' + err.message)
    );
  }, mins * 60 * 1000);

  logger.info(`mappingService: auto-sync every ${mins} minute(s)`);
}

// ─── Sync status ──────────────────────────────────────────────────────────────

function getSyncStatus() {
  return {
    configured:      sheets.isConfigured(),
    syncing:         syncState.syncing,
    lastSyncAt:      syncState.lastSyncAt,
    lastSyncSource:  syncState.lastSyncSource,
    lastSyncCount:   syncState.lastSyncCount,
    lastError:       syncState.lastError,
    loadedInvoices:  invoiceMap ? invoiceMap.size : null,
    loadedVehicles:  vehicleMap ? vehicleMap.size : null,
  };
}

// ─── Public resolvers ─────────────────────────────────────────────────────────

function getVehicleByInvoice(invoiceNo) {
  bootstrapMaps();
  return invoiceMap.get(String(invoiceNo).trim()) || null;
}

function getDeviceByVehicle(vehicleNo) {
  bootstrapMaps();
  return vehicleMap.get(String(vehicleNo).trim()) || null;
}

function resolveInvoice(invoiceNo) {
  const vehicleEntry = getVehicleByInvoice(invoiceNo);
  if (!vehicleEntry) return { invoiceNo, vehicleNo: null, deviceName: null, meta: null };

  const deviceName = getDeviceByVehicle(vehicleEntry.vehicleNo);
  return {
    invoiceNo,
    vehicleNo:  vehicleEntry.vehicleNo,
    deviceName: deviceName || null,
    meta: {
      customerCode: vehicleEntry.customerCode || null,
      chainName:    vehicleEntry.chainName    || null,
      destination:  vehicleEntry.location     || null,
    },
  };
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

function getAllInvoiceMappings() {
  bootstrapMaps();
  return Array.from(invoiceMap.values());
}

function getAllVehicleDeviceMappings() {
  bootstrapMaps();
  return Array.from(vehicleMap.entries()).map(([vehicleNo, deviceName]) => ({ vehicleNo, deviceName }));
}

// ─── CSV importers (manual use) ───────────────────────────────────────────────

function importInvoiceMappingFromCSV(csvFilePath) {
  const lines = fs.readFileSync(csvFilePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV file is empty or has no data rows');

  const headers  = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  const idxInv   = headers.findIndex(h => h.includes('invoice'));
  const idxVeh   = headers.findIndex(h => h.includes('vehicle'));
  const idxCust  = headers.findIndex(h => h.includes('customer'));
  const idxChain = headers.findIndex(h => h.includes('chain'));
  const idxLoc   = headers.findIndex(h => h.includes('location'));

  if (idxInv === -1 || idxVeh === -1) throw new Error('CSV must have Invoice and Vehicle columns');

  const mappings = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
    const invoiceNo = cols[idxInv], vehicleNo = cols[idxVeh];
    if (!invoiceNo || !vehicleNo || seen.has(invoiceNo)) continue;
    seen.add(invoiceNo);
    mappings.push({
      invoiceNo, vehicleNo,
      customerCode: idxCust  >= 0 ? cols[idxCust]  : '',
      chainName:    idxChain >= 0 ? cols[idxChain] : '',
      location:     idxLoc   >= 0 ? cols[idxLoc]   : '',
    });
  }

  // Update in-memory maps immediately
  invoiceMap = new Map();
  mappings.forEach(e => invoiceMap.set(e.invoiceNo, e));
  writeBackupFiles(mappings, getAllVehicleDeviceMappings());
  logger.info(`mappingService: imported ${mappings.length} invoice mappings from CSV`);
  return mappings.length;
}

function importVehicleDeviceMappingFromCSV(csvFilePath) {
  const lines = fs.readFileSync(csvFilePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV file is empty');

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  const idxVeh  = headers.findIndex(h => h.includes('vehicle'));
  const idxDev  = headers.findIndex(h => h.includes('device'));

  if (idxVeh === -1 || idxDev === -1) throw new Error('CSV must have Vehicle and device columns');

  const mappings = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
    if (cols[idxVeh] && cols[idxDev]) mappings.push({ vehicleNo: cols[idxVeh], deviceName: cols[idxDev] });
  }

  vehicleMap = new Map();
  mappings.forEach(e => vehicleMap.set(e.vehicleNo, e.deviceName));
  writeBackupFiles(getAllInvoiceMappings(), mappings);
  logger.info(`mappingService: imported ${mappings.length} vehicle-device mappings from CSV`);
  return mappings.length;
}

module.exports = {
  startAutoSync,
  syncFromGoogleSheets,
  getSyncStatus,
  resolveInvoice,
  getVehicleByInvoice,
  getDeviceByVehicle,
  getAllInvoiceMappings,
  getAllVehicleDeviceMappings,
  importInvoiceMappingFromCSV,
  importVehicleDeviceMappingFromCSV,
};
