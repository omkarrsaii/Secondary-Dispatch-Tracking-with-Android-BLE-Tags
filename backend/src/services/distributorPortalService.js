/**
 * distributorPortalService.js
 *
 * Powers the Distributor Portal (login, summary, paginated invoice list).
 * Built entirely on top of the EXISTING in-memory invoice data already
 * maintained by mappingService.js — no new sheet, no new sync loop, no
 * changes to mappingService.js itself.
 *
 * Why no persistent per-distributor index is needed:
 *   mappingService already holds all ~15,000+ rows in memory (synced from
 *   the same Invoice Sheet on the existing SHEET_SYNC_INTERVAL timer).
 *   Filtering a 15k-element in-memory array by a simple equality check is
 *   sub-millisecond in V8 — there's no database round-trip and nothing is
 *   re-fetched from Google Sheets per request. The performance requirement
 *   ("don't load the entire dataset on the frontend") is satisfied because
 *   only the requested page is ever sent to the browser; the filtering
 *   itself happening server-side over an in-memory array already meets the
 *   "efficient backend filtering" bar without needing extra cache layers.
 *   If invoice volume grows far beyond this, a Map<distributorCode, [...]>
 *   index (rebuilt on each mappingService sync) would be the next step —
 *   but it isn't needed at this scale.
 */

const { getAllInvoiceMappings, getDeviceByVehicle } = require('./mappingService');
const { getDeviceByName } = require('../db/database');
const { formatDeviceLocation } = require('../utils/geoUtils');
const logger = require('../utils/logger');

// Lazy require to dodge any load-order edge case — geofenceService doesn't
// depend on this module, so this is safe, but require()s the live distance
// calc rather than re-implementing the same Haversine + device/location
// lookup a third time.
function getGeofenceService() { return require('./geofenceService'); }
// Same lazy-require reasoning, for road distance (routingService) and the
// distributor's lat/lng (masterDataService).
function getRoutingService()    { return require('./routingService'); }
function getMasterDataService() { return require('./masterDataService'); }

// "Active" = the Status cell AND the "Any Other Remarks" cell are BOTH
// blank/unfilled. If either one has anything written in it, the invoice
// is no longer considered active.
function isActiveInvoice(status, remarks) {
  return String(status || '').trim() === '' && String(remarks || '').trim() === '';
}

// Same DD.MM.YYYY parsing as the frontend's formatDate() — kept in sync
// deliberately. `new Date(dateStr)` misreads dot-separated dates as
// MM.DD.YYYY, which would have silently sorted invoices by the wrong date.
function toComparableDate(dateStr) {
  if (!dateStr) return 0;
  const str = String(dateStr).trim();
  const match = str.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Looks up a distributor's name directly from the Invoice Sheet
 * (Secondary Dispatch Tracker) — searched across ALL rows for that code,
 * not just active ones, so a distributor with zero currently-active
 * (blank-status) invoices still gets their real name instead of falling
 * back to the bare code.
 *
 * If the sheet has inconsistent Distributor Name spelling for the same
 * code (e.g. "FLIPKART INDIA PRIVATE LIMITED" on some rows, "Flipkart-
 * National" on others), the MOST FREQUENT value is used rather than
 * whichever row happens to appear first — more robust against occasional
 * typos/variants. A warning is logged so the inconsistency is visible and
 * can be cleaned up at the source if desired.
 */
function getDistributorNameFromSheet(distributorCode) {
  const code = String(distributorCode || '').trim();
  const all  = getAllInvoiceMappings();
  const matches = all.filter(m => String(m.distributorCode || '').trim() === code && m.distributorName);

  if (matches.length === 0) return code;

  const counts = new Map();
  for (const m of matches) {
    counts.set(m.distributorName, (counts.get(m.distributorName) || 0) + 1);
  }

  let best = null, bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) { best = name; bestCount = count; }
  }

  if (counts.size > 1) {
    logger.warn(
      `distributorPortalService: distributor "${code}" has ${counts.size} different ` +
      `Distributor Name values in the sheet: ${JSON.stringify(Array.from(counts.entries()))}. ` +
      `Using the most frequent: "${best}"`
    );
  }

  return best || code;
}

/**
 * Per-invoice enrichment for the Distributor Portal's Active Invoices list
 * (and the matching admin/ASM view in hierarchyRoutes.js — same function,
 * same rule, so both sides always agree):
 *
 *   - vehicleStatus: "At Depot" / "In Transit" / "Reached" / "Not Assigned"
 *     — "Reached" takes priority (checked first) since a vehicle can only
 *     be doing one of these at a time and arrival is the more specific,
 *     more useful signal; "At Depot" uses the same HUB_RADIUS_METERS
 *     threshold as the rest of the app (kpiService's admin dashboard,
 *     the tracking detail page).
 *   - location: the vehicle's current locality/area (e.g. "Dundigal"),
 *     read fresh from the devices table — never a cached/stale value.
 *   - distanceMeters: REMAINING road distance, vehicle → destination,
 *     from the routing engine (routingService) — never straight-line.
 *   - reached: same threshold used for vehicleStatus === 'Reached'.
 */
async function enrichInvoiceForList(m) {
  const base = {
    invoiceNo:     m.invoiceNo,
    invoiceDate:   m.invoiceDate || null,
    vehicleNo:     m.vehicleNo || null,
    vehicleStatus: 'Not Assigned',
    location:      null,
    distanceMeters: null,
    reached:       false,
  };
  if (!m.vehicleNo) return base;

  const geofence = getGeofenceService();
  const deviceName = getDeviceByVehicle(m.vehicleNo);
  const device = deviceName ? getDeviceByName(deviceName) : null;

  if (device) {
    base.location = formatDeviceLocation(device);
  }

  // Remaining road distance (vehicle → destination) — same routing engine
  // call used by the tracking detail page, so this list's number always
  // matches what the distributor sees if they open the invoice.
  if (device?.latitude && device?.longitude) {
    try {
      const md = getMasterDataService();
      const distLoc = md.getDistributorLocation(m.distributorCode);
      if (distLoc) {
        const routing = getRoutingService();
        const route = await routing.getRoadRoute(
          parseFloat(device.latitude), parseFloat(device.longitude),
          distLoc.latitude, distLoc.longitude
        );
        base.distanceMeters = route?.distanceMeters ?? null;
      }
    } catch (err) {
      logger.warn(`distributorPortalService: road-distance lookup failed for ${m.invoiceNo} — ${err.message}`);
    }
  }

  base.reached = base.distanceMeters != null && base.distanceMeters <= geofence.GEOFENCE_RADIUS_METERS;

  if (base.reached) {
    base.vehicleStatus = 'Reached';
  } else if (device?.latitude && device?.longitude) {
    const hubDistance = geofence.getDistanceToHubMeters(m.vehicleNo);
    base.vehicleStatus = (hubDistance != null && hubDistance <= geofence.HUB_RADIUS_METERS) ? 'At Depot' : 'In Transit';
  } else {
    // Vehicle assigned but no live fix yet — treat as In Transit rather
    // than silently showing nothing, matching kpiService's fallback.
    base.vehicleStatus = 'In Transit';
  }

  return base;
}

/**
 * All of a distributor's active (blank-Status) invoices, newest first,
 * enriched with live status/location/road-distance.
 *
 * NOTE: this enriches the WHOLE active set, not just one page — same
 * shape as before this function used road distance instead of
 * straight-line. Fine at the scale a single distributor's active
 * invoices actually reach (a handful to a few dozen); if that ever grows
 * dramatically, enriching only the current page (after slicing in
 * getPaginatedInvoices) would be the next optimization.
 */
async function getActiveInvoicesForDistributor(distributorCode) {
  const code = String(distributorCode || '').trim();
  if (!code) return [];

  const all = getAllInvoiceMappings();

  const totalForDistributor = all.filter(m => String(m.distributorCode || '').trim() === code).length;

  const active = all.filter(m =>
    String(m.distributorCode || '').trim() === code && isActiveInvoice(m.status, m.remarks)
  );

  // ── Diagnostic: proves which rule actually ran and what it found ──
  logger.info(
    `distributorPortalService [RULE=blank-status+blank-remarks]: distributor "${code}" has ` +
    `${totalForDistributor} total invoice(s), ${active.length} pass the active filter (Status AND Remarks both blank).`
  );

  active.sort((a, b) => toComparableDate(b.invoiceDate) - toComparableDate(a.invoiceDate));

  return Promise.all(active.map(enrichInvoiceForList));
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Does this distributor code have at least one row in the Invoice Sheet? */
function isValidDistributorCode(distributorCode) {
  const code = String(distributorCode || '').trim();
  if (!code) return false;
  const all = getAllInvoiceMappings();
  return all.some(m => String(m.distributorCode || '').trim() === code);
}

/**
 * Welcome header data: distributor name + total active (blank-status)
 * invoice count.
 *
 * distributorName is read directly from the Invoice Sheet (Secondary
 * Dispatch Tracker) — NOT the Hierarchy sheet. The Hierarchy sheet doesn't
 * cover every distributor code that can actually log in here, so the
 * Invoice Sheet (same source used for login validation and the invoice
 * list itself) is the reliable source of truth for this field.
 */
async function getDistributorSummary(distributorCode) {
  const code   = String(distributorCode || '').trim();
  const active = await getActiveInvoicesForDistributor(code);

  return {
    distributorCode:     code, // kept in the API response for internal use; the frontend must not render it
    distributorName:     getDistributorNameFromSheet(code),
    totalActiveInvoices: active.length,
  };
}

/** Paginated slice of a distributor's active invoices — frontend never receives the full set. */
async function getPaginatedInvoices(distributorCode, page = 1, limit = 20) {
  const code  = String(distributorCode || '').trim();
  const all   = await getActiveInvoicesForDistributor(code);

  const safePage  = Math.max(1, parseInt(page)  || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20)); // cap to prevent abuse

  const total      = all.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const start       = (safePage - 1) * safeLimit;
  const invoices    = all.slice(start, start + safeLimit);

  return {
    distributorCode: code,
    total,
    page:       safePage,
    limit:      safeLimit,
    totalPages,
    invoices,
  };
}

module.exports = {
  isValidDistributorCode,
  getDistributorSummary,
  getPaginatedInvoices,
  getActiveInvoicesForDistributor,
  // ── Exported for kpiService.js — reuse same rule, don't re-implement ──
  isActiveInvoice,
  toComparableDate,
};
