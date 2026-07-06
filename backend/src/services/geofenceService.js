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
const { getDeviceByName, getAppState, setAppState } = require('../db/database');
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

    // Arrival Time — stamped in the SAME pass as the Status write, since
    // "reached the geofence" and "arrived" are the same event. Only rows
    // whose Arrival Time cell is still blank are included, so this is
    // idempotent even if a scheduler tick and a manual refresh race —
    // never overwrites an already-recorded arrival.
    const arrivalCandidates = reached.filter(m => String(m.arrivalTime || '').trim() === '');
    if (arrivalCandidates.length > 0) {
      try {
        const arrivalRows = arrivalCandidates.map(m => m.sheetRowNumber).filter(Boolean);
        const arrivalResult = await sheets.updateInvoiceArrivalTimes(arrivalRows);
        if (arrivalResult?.timestamp) {
          mapping.markInvoicesArrivalTime(arrivalCandidates.map(m => m.invoiceNo), arrivalResult.timestamp);
          logger.info(`geofenceService: stamped Arrival Time (${arrivalResult.timestamp}) for ${arrivalCandidates.length} invoice(s)`);
        }
      } catch (err) {
        // Arrival Time is a nice-to-have alongside the core Status write —
        // never let a failure here undo the Status write that already
        // succeeded above.
        logger.error('geofenceService: failed to write Arrival Time — ' + err.message);
      }
    }

    logger.info(`geofenceService: marked ${reached.length} invoice(s) as "Reached" — ${reached.map(m => m.invoiceNo).join(', ')}`);
    return { success: true, checked: pendingInvoices.length, reached: reached.length, invoiceNos: reached.map(m => m.invoiceNo) };
  } catch (err) {
    logger.error('geofenceService: failed to write Status updates — ' + err.message);
    return { success: false, error: err.message, checked: pendingInvoices.length, wouldHaveReached: reached.length };
  }
}

/**
 * Departure Time write-back — detects the Inactive → Out for Delivery
 * transition for every vehicle currently carrying at least one active
 * invoice, and stamps an IST timestamp into that invoice's Departure Time
 * column the FIRST time it happens.
 *
 * "Out for delivery" uses the exact same >HUB_RADIUS_METERS-from-hub rule
 * the rest of the app already uses (kpiService's At Hub/In Transit labels,
 * the Distributor Portal's own hub-distance badge) — so Departure Time
 * always lines up with what every other part of the app calls "left the
 * hub", instead of a fourth, independently-tuned definition.
 *
 * Previous per-vehicle state persists in app_state (survives restarts,
 * needs no new table) specifically so a vehicle already out on its first
 * fetch cycle ever observed under this feature is treated as a BASELINE,
 * not a transition — this avoids a burst of false Departure Time writes
 * for every truck that happened to already be mid-trip when this shipped.
 * A vehicle only gets a fresh Departure Time stamped after it's been
 * observed at-hub at least once and then leaves again — which matches
 * real trip patterns (trucks return to the depot between rounds).
 *
 * One physical vehicle can carry several active invoices in the same
 * round trip, so ALL of that vehicle's currently-active invoices get
 * Departure Time stamped together — not just one arbitrarily chosen row.
 */
async function runDepartureTimeCheck() {
  const all = mapping.getAllInvoiceMappings();
  const activeInvoices = all.filter(m => String(m.status || '').trim() === '');

  const byVehicle = new Map();
  for (const m of activeInvoices) {
    if (!m.vehicleNo) continue;
    if (!byVehicle.has(m.vehicleNo)) byVehicle.set(m.vehicleNo, []);
    byVehicle.get(m.vehicleNo).push(m);
  }

  const toStamp = [];

  for (const [vehicleNo, invoices] of byVehicle) {
    const distanceMeters = getDistanceToHubMeters(vehicleNo);
    if (distanceMeters == null) continue; // no device mapped, or no fix yet — can't tell either way

    const isOutForDelivery = distanceMeters > HUB_RADIUS_METERS;
    const stateKey  = `vehicle_trip_state:${vehicleNo}`;
    const prevState = getAppState(stateKey); // 'out' | 'inactive' | null (never observed before)

    if (prevState === 'inactive' && isOutForDelivery) {
      for (const m of invoices) {
        if (String(m.departureTime || '').trim() === '') toStamp.push(m);
      }
    }

    setAppState(stateKey, isOutForDelivery ? 'out' : 'inactive');
  }

  if (toStamp.length === 0) return { success: true, stamped: 0 };

  try {
    const rowNumbers = toStamp.map(m => m.sheetRowNumber).filter(Boolean);
    const result = await sheets.updateInvoiceDepartureTimes(rowNumbers);
    if (result?.timestamp) {
      mapping.markInvoicesDepartureTime(toStamp.map(m => m.invoiceNo), result.timestamp);
    }
    logger.info(`geofenceService: stamped Departure Time (${result?.timestamp || '?'}) for ${toStamp.length} invoice(s) — ${toStamp.map(m => m.invoiceNo).join(', ')}`);
    return { success: true, stamped: toStamp.length, invoiceNos: toStamp.map(m => m.invoiceNo) };
  } catch (err) {
    logger.error('geofenceService: failed to write Departure Time — ' + err.message);
    return { success: false, error: err.message, wouldHaveStamped: toStamp.length };
  }
}

module.exports = {
  runGeofenceCheck,
  runDepartureTimeCheck,
  getDistanceMetersFor,
  getInvoiceDistanceMeters,
  getDistanceToHubMeters,
  GEOFENCE_RADIUS_METERS,
  HUB_RADIUS_METERS,
};
