/**
 * geofenceService.js
 *
 * Automatic invoice status updates via geofencing.
 *
 * On every tag-location refresh (hooked into fetchService.runFetch — see
 * there), this scans every invoice whose Status cell is currently blank,
 * compares the invoice's distributor location (Distributor Location sheet,
 * via masterDataService) against the LATEST known location of the BLE tag
 * mapped to that invoice's vehicle (mappingService + the device DB), and
 * writes "Reached" back to the Status column for anything within the
 * geofence radius — in a single batched Sheets write, not one call per row.
 *
 * Deliberately scoped to ONLY the raw Status column being blank, per the
 * specific instruction this was built against — NOT the stricter
 * "Status AND Remarks both blank" rule used elsewhere (isActiveInvoice in
 * distributorPortalService.js) for the general "active invoice" concept.
 * In practice this rarely diverges (Remarks is usually blank whenever
 * Status is), but it's worth knowing these are two different rules.
 *
 * getInvoiceDistanceMeters() is exported separately so the Distributor
 * Portal can show a LIVE distance-to-destination number without waiting
 * for this module's own write-back to land — same calculation, reused,
 * not re-implemented.
 */

const logger    = require('../utils/logger');
const md        = require('./masterDataService');
const mapping   = require('./mappingService');
const sheets    = require('./sheetsService');
const { getDeviceByName } = require('../db/database');
const { getDistanceInKm } = require('../utils/geoUtils');

const GEOFENCE_RADIUS_METERS = parseInt(process.env.GEOFENCE_RADIUS_METERS) || 500;

// ── Hub location (Change: dynamic Active Invoice status) ──────────────────────
// Same HUB_LAT/HUB_LON convention already used by dashboardRoutes.js and
// routeRoutes.js for "is this vehicle out for delivery" — reused here so the
// Hierarchy Active Invoice List's "At Hub" status agrees with the rest of
// the app instead of re-deriving its own hub coordinates.
const HUB_LAT = parseFloat(process.env.HUB_LAT || '17.608504');
const HUB_LON = parseFloat(process.env.HUB_LON || '78.528605');
const HUB_RADIUS_METERS = parseInt(process.env.HUB_RADIUS_METERS) || 1000; // 1 km

/**
 * Distance (in meters) between a vehicle's latest known tag location and
 * the hub — or null if the vehicle has no mapped device, or the device has
 * never reported coordinates.
 */
function getDistanceToHubMeters(vehicleNo) {
  if (!vehicleNo) return null;
  const deviceName = mapping.getDeviceByVehicle(vehicleNo);
  if (!deviceName) return null;

  const device = getDeviceByName(deviceName);
  if (!device || !device.latitude || !device.longitude) return null;

  const km = getDistanceInKm(
    parseFloat(device.latitude), parseFloat(device.longitude), HUB_LAT, HUB_LON
  );
  return km * 1000;
}

/**
 * Distance (in meters) between an invoice's vehicle's latest tag location
 * and its distributor's location — or null if either piece is missing
 * (no device mapped, device has never reported coordinates, or the
 * distributor isn't in the Distributor Location sheet).
 *
 * Looked up by vehicleNo + distributorCode directly (not invoiceNo) so it
 * can be called for many invoices that share the same vehicle/distributor
 * without repeating the device/location lookups.
 */
function getDistanceMetersFor(vehicleNo, distributorCode) {
  if (!vehicleNo || !distributorCode) return null;

  const deviceName = mapping.getDeviceByVehicle(vehicleNo);
  if (!deviceName) return null;

  const device = getDeviceByName(deviceName);
  if (!device || !device.latitude || !device.longitude) return null;

  const distLoc = md.getDistributorLocation(distributorCode);
  if (!distLoc) return null;

  const km = getDistanceInKm(
    parseFloat(device.latitude), parseFloat(device.longitude),
    distLoc.latitude, distLoc.longitude
  );
  return km * 1000;
}

/**
 * Same lookup, but keyed by invoiceNo — convenience wrapper for callers
 * (like the Distributor Portal) that only have the invoice row, not the
 * vehicle/distributor pulled out separately.
 */
function getInvoiceDistanceMeters(invoiceNo) {
  const all = mapping.getAllInvoiceMappings();
  const m   = all.find(x => String(x.invoiceNo || '').trim() === String(invoiceNo || '').trim());
  if (!m) return null;
  return getDistanceMetersFor(m.vehicleNo, m.distributorCode);
}

/**
 * Full geofence pass — scans every invoice with a blank Status, finds the
 * ones now within the geofence radius, batch-writes "Reached" to the
 * sheet, and mirrors the same change into mappingService's in-memory map
 * so every other reader sees it immediately.
 */
async function runGeofenceCheck() {
  if (!sheets.isDistributorLocationConfigured()) {
    logger.info('geofenceService: DISTRIBUTOR_LOCATION_SHEET_ID not configured — skipping geofence check');
    return { success: false, reason: 'not_configured' };
  }

  const all = mapping.getAllInvoiceMappings();
  const pendingInvoices = all.filter(m => String(m.status || '').trim() === '');

  const reached = [];
  let skippedNoDevice = 0;
  let skippedNoDistLocation = 0;

  for (const m of pendingInvoices) {
    const deviceName = mapping.getDeviceByVehicle(m.vehicleNo);
    if (!deviceName) { skippedNoDevice++; continue; }

    const device = getDeviceByName(deviceName);
    if (!device || !device.latitude || !device.longitude) { skippedNoDevice++; continue; }

    const distLoc = md.getDistributorLocation(m.distributorCode);
    if (!distLoc) { skippedNoDistLocation++; continue; }

    const distanceMeters = getDistanceInKm(
      parseFloat(device.latitude), parseFloat(device.longitude),
      distLoc.latitude, distLoc.longitude
    ) * 1000;

    if (distanceMeters <= GEOFENCE_RADIUS_METERS) {
      reached.push(m);
    }
  }

  logger.info(
    `geofenceService: checked ${pendingInvoices.length} pending invoice(s) — ` +
    `${reached.length} within ${GEOFENCE_RADIUS_METERS}m, ` +
    `${skippedNoDevice} skipped (no device/location), ` +
    `${skippedNoDistLocation} skipped (distributor not in location sheet)`
  );

  if (reached.length === 0) {
    return { success: true, checked: pendingInvoices.length, reached: 0 };
  }

  try {
    const rowNumbers = reached.map(m => m.sheetRowNumber).filter(Boolean);
    await sheets.updateInvoiceStatuses(rowNumbers, 'Reached');
    mapping.markInvoicesReached(reached.map(m => m.invoiceNo), 'Reached');

    logger.info(`geofenceService: marked ${reached.length} invoice(s) as "Reached" — ${reached.map(m => m.invoiceNo).join(', ')}`);
    return { success: true, checked: pendingInvoices.length, reached: reached.length, invoiceNos: reached.map(m => m.invoiceNo) };
  } catch (err) {
    logger.error('geofenceService: failed to write Status updates — ' + err.message);
    return { success: false, error: err.message, checked: pendingInvoices.length, wouldHaveReached: reached.length };
  }
}

module.exports = {
  runGeofenceCheck,
  getDistanceMetersFor,
  getInvoiceDistanceMeters,
  getDistanceToHubMeters,
  GEOFENCE_RADIUS_METERS,
  HUB_RADIUS_METERS,
};
