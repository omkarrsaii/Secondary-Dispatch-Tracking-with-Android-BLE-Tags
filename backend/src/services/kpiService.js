/**
 * kpiService.js
 *
 * Performance KPIs per ASM and per TSOE — built entirely on top of EXISTING
 * in-memory data (masterDataService's ASM/TSOE → distributor groupings, and
 * mappingService's invoice rows). No new sheet, no new sync loop, no
 * persistent store.
 *
 * Reuses the EXACT SAME active-invoice rule already used by the
 * Distributor Portal and the admin Hierarchy distributor flyout (Status
 * AND Remarks both blank) via distributorPortalService.isActiveInvoice —
 * one source of truth, not re-implemented here. Same for date parsing
 * (toComparableDate), since Appointment Date is DD.MM.YYYY same as the
 * other sheet dates.
 */

const logger = require('../utils/logger');
const md     = require('./masterDataService');
const { getAllInvoiceMappings, getDeviceByVehicle } = require('./mappingService');
const { getDeviceByName } = require('../db/database');
const { isActiveInvoice, toComparableDate } = require('./distributorPortalService');
const geofence = require('./geofenceService');

// Start of "today" (local server time) — used for the overdue check.
function startOfTodayMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Narrows a set of invoice rows by Date Range (Invoice Date) and/or a
 * specific Distributor — used by both the KPI cards and the Active
 * Invoice List so the two always stay in sync with each other.
 *
 * NOTE: this does NOT filter by invoiceState (active/overdue) — that's a
 * sub-filter that only applies within the Active Invoice List itself (see
 * getActiveInvoiceList), never to the KPI cards.
 */
function applyFilters(invoices, filters = {}) {
  let result = invoices;
  const { dateFrom, dateTo, distributorCode } = filters;

  if (distributorCode) {
    const code = String(distributorCode).trim();
    result = result.filter(m => String(m.distributorCode || '').trim() === code);
  }

  if (dateFrom || dateTo) {
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
    const toMs   = dateTo   ? new Date(`${dateTo}T23:59:59`).getTime()   : Infinity;
    result = result.filter(m => {
      const ms = toComparableDate(m.invoiceDate);
      return ms > 0 && ms >= fromMs && ms <= toMs;
    });
  }

  return result;
}

/**
 * Builds the 5 KPI metrics for an arbitrary set of distributor codes.
 *
 * Definitions (flag to the user if a different definition is wanted —
 * these are reasonable defaults, not confirmed against a written spec):
 *   - completedInvoices = invoices that are NOT active (Status or Remarks
 *     has something filled in). This is the inverse of the active rule,
 *     not a check for one specific status string like "Unloaded", since
 *     the sheet has multiple distinct terminal status values.
 *   - overdueInvoices = active invoices whose Appointment Date has already
 *     passed. Invoices with no parseable Appointment Date are excluded
 *     (not counted as overdue) rather than guessed at.
 */
function buildKpisForDistributorCodes(distributorCodes, filters = {}) {
  const codes = new Set(
    (distributorCodes || []).map(c => String(c || '').trim()).filter(Boolean)
  );
  const all   = getAllInvoiceMappings();
  let   group = all.filter(m => codes.has(String(m.distributorCode || '').trim()));
  group = applyFilters(group, filters);

  const totalInvoices    = group.length;
  const activeInvoices   = group.filter(m => isActiveInvoice(m.status, m.remarks));
  const completedInvoices = totalInvoices - activeInvoices.length;
  const completionRate = totalInvoices > 0
    ? Math.round((completedInvoices / totalInvoices) * 1000) / 10 // one decimal place
    : 0;

  const today = startOfTodayMs();
  const overdueInvoices = activeInvoices.filter(m => {
    if (!m.appointmentDate) return false;
    const apptMs = toComparableDate(m.appointmentDate);
    return apptMs > 0 && apptMs < today;
  });

  return {
    distributorCount: codes.size,
    totalInvoices,
    activeInvoices:    activeInvoices.length,
    completedInvoices,
    completionRate,
    overdueInvoices:   overdueInvoices.length,
  };
}

/** KPIs for a single ASM Area (the stable territory key after Change 1). */
function getKpisForAsm(asmArea, filters = {}) {
  const name = String(asmArea || '').trim();
  const asm  = md.getAllAsms().find(a => a.asmArea === name);   // ← match by Area now
  if (!asm) {
    logger.warn(`kpiService: no ASM Area found matching "${name}"`);
    return null;
  }
  return {
    asmArea:  asm.asmArea,
    asmNames: asm.asmNames,   // array of person-names who hold/held this area
    region:   asm.region,
    ...buildKpisForDistributorCodes(asm.distributors, filters),
  };
}

/** KPIs for a single TSOE, matched against the same tsoeName key masterDataService.getAllTsoes() uses. */
function getKpisForTsoe(tsoeName, filters = {}) {
  const name = String(tsoeName || '').trim();
  const tsoe = md.getAllTsoes().find(t => t.tsoeName === name);
  if (!tsoe) {
    logger.warn(`kpiService: no TSOE found matching "${name}"`);
    return null;
  }
  return {
    tsoeName: tsoe.tsoeName,
    asmName:  tsoe.asmName,
    asmArea:  tsoe.asmArea,   // ← Change 1: expose stable area reference
    region:   tsoe.region,
    ...buildKpisForDistributorCodes(tsoe.distributors, filters),
  };
}

/** KPIs for a single Cluster (sheet tab), summed across all its ASMs/distributors. */
function getKpisForCluster(clusterName, filters = {}) {
  const name  = String(clusterName || '').trim();
  const codes = md.getDistributorCodesForCluster(name);
  if (!codes || codes.length === 0) {
    logger.warn(`kpiService: no distributors found for cluster "${name}"`);
    return null;
  }
  return {
    clusterName: name,
    ...buildKpisForDistributorCodes(codes, filters),
  };
}

/**
 * Live "where is this vehicle right now" label for the Location column —
 * always reads the CURRENT devices row (no extra caching layer here), so
 * it reflects whatever fetchService's most recent BLE/GPS fetch cycle
 * wrote to the DB. Prefers the granular locality/area (e.g. "Begumpet",
 * "Gachibowli") over the city, since a bare city name is too coarse to be
 * useful for "where is my delivery right now".
 */
function getLiveLocationLabel(vehicleNo) {
  if (!vehicleNo) return null;
  const deviceName = getDeviceByVehicle(vehicleNo);
  if (!deviceName) return null;
  const device = getDeviceByName(deviceName);
  if (!device) return null;
  return device.locality || device.city || null;
}

/**
 * Derives a live, location-based status label for an ACTIVE invoice (one
 * whose raw sheet Status cell is still blank) using the vehicle's latest
 * BLE/GPS position:
 *
 *   - "At Hub"     — vehicle is within HUB_RADIUS_METERS (1km) of the hub.
 *   - "Reached"    — vehicle is within GEOFENCE_RADIUS_METERS (500m) of
 *                    the distributor location.
 *   - "In Transit" — neither of the above (out of the hub geofence, not
 *                    yet within the distributor geofence).
 *   - "In Transit" is also the fallback when there's no live location yet
 *     (no device mapped / device hasn't reported coordinates) — a
 *     dispatched invoice with no fix is presumed en route rather than
 *     shown as "at hub".
 *
 * Distributor proximity is checked first: a vehicle can only be "at hub"
 * OR "reached" at any given moment, and reaching the destination is the
 * more specific, more useful signal to surface.
 */
function deriveLiveStatus(vehicleNo, distributorCode) {
  const distanceToDistributor = geofence.getDistanceMetersFor(vehicleNo, distributorCode);
  if (distanceToDistributor != null && distanceToDistributor <= geofence.GEOFENCE_RADIUS_METERS) {
    return { label: 'Reached', distanceToHub: null, distanceToDistributor };
  }

  const distanceToHub = geofence.getDistanceToHubMeters(vehicleNo);
  if (distanceToHub != null && distanceToHub <= geofence.HUB_RADIUS_METERS) {
    return { label: 'At Hub', distanceToHub, distanceToDistributor };
  }

  return { label: 'In Transit', distanceToHub, distanceToDistributor };
}

/**
 * Builds one Invoice List row (shared by both the Active Invoices and All
 * Invoices views).
 *
 * Status:
 *   - Active invoices (blank Status AND blank Remarks in the sheet) show a
 *     DERIVED, live location-based label — "At Hub" / "In Transit" /
 *     "Reached" — via deriveLiveStatus(), instead of a static "Pending".
 *   - Non-active (historical/completed) invoices show the ACTUAL raw sheet
 *     Status value as-is (e.g. "Reached", "Unloaded") — these only ever
 *     appear in the All Invoices view.
 *
 * lastUpdated uses Invoice Date (Sheet Column B) — the date the invoice
 * record was created/added. Unchanged from before; do not repoint this to
 * Dispatch Date.
 *
 * dispatchDate is the actual vehicle dispatch date (Sheet Column S).
 * ageDays = days since Dispatch Date (Current Date − Dispatch Date), i.e.
 * how long the vehicle has been on the road. Invoices with no parseable
 * Dispatch Date show ageDays = null (rendered as "--" by the frontend).
 *
 * location is the Location column: "Reached" once status is "Reached"
 * (live or historical), otherwise the vehicle's current live
 * locality/area — always read fresh from the devices table, never a
 * value cached in this service.
 */
function enrichInvoiceRow(m, todayMs) {
  const hier   = md.getDistributorHierarchy(m.distributorCode) || {};
  const apptMs = m.appointmentDate ? toComparableDate(m.appointmentDate) : 0;
  const isOverdue = apptMs > 0 && apptMs < todayMs;

  const active = isActiveInvoice(m.status, m.remarks);
  const live   = active ? deriveLiveStatus(m.vehicleNo, m.distributorCode) : null;
  const status = active ? live.label : (m.status || 'Reached');

  // Location column: "Reached" once the delivery has arrived (whether
  // that's the live geofence-derived label or the historical sheet
  // status), otherwise the vehicle's current live locality.
  const location = status === 'Reached'
    ? 'Reached'
    : (getLiveLocationLabel(m.vehicleNo) || (m.vehicleNo ? 'Location unavailable' : '—'));

  const dispatchMs = m.dispatchDate ? toComparableDate(m.dispatchDate) : 0;
  const ageDays    = dispatchMs > 0 ? Math.floor((todayMs - dispatchMs) / 86400000) : null;

  // Vehicle column: "Assigned" while the delivery is still in flight (At
  // Hub / In Transit), "Trip Completed" the moment status flips to
  // "Reached" — the BLE tag may well stay mapped to this vehicle for its
  // NEXT trip, but that's irrelevant to this invoice, which is done.
  const vehicleStatus = !m.vehicleNo
    ? 'Not Assigned'
    : (status === 'Reached' ? 'Trip Completed' : 'Assigned');

  return {
    invoiceNo:       m.invoiceNo,
    asmArea:         hier.asmArea  || '',   // ← stable Area (Change 1)
    tsoeName:        hier.tsoeName || '', // "HQ" in the UI
    distributorCode: m.distributorCode,
    distributorName: m.distributorName || hier.distributorName || '',
    isActive:        active,
    status,
    location,
    isOverdue,
    distanceToHub:         live ? live.distanceToHub : null,
    distanceToDistributor: live ? live.distanceToDistributor : null,
    vehicleNo:       m.vehicleNo || null,
    vehicleStatus,
    invoiceDate:     m.invoiceDate || null,
    appointmentDate: m.appointmentDate || null,
    lastUpdated:     m.invoiceDate || null,     // Sheet Column B — unchanged
    dispatchDate:    m.dispatchDate || null,    // Sheet Column S
    ageDays,
  };
}

/**
 * Hierarchy-aware Invoice List — backs both the "Active Invoices" and
 * "All Invoices" views.
 *
 * scope: 'cluster' | 'asm' | 'tsoe', name: the cluster/ASM/TSOE name.
 * filters: { dateFrom, dateTo, distributorCode, invoiceState }
 *   - dateFrom/dateTo/distributorCode narrow the SAME base set the KPI
 *     cards use, so the two stay consistent with each other.
 *   - invoiceState ('all' | 'active' | 'overdue') is a sub-filter (based
 *     on Appointment Date vs today) that applies identically in both
 *     views, never to the KPI cards above it.
 * view: 'active' (default) — only currently-active deliveries, same rule
 *       (blank Status AND blank Remarks) used everywhere else in the app.
 *       'all' — every invoice matching the scope/filters, active and
 *       historical alike. Historical rows show their actual sheet Status
 *       (e.g. "Reached"); active rows still get the live location-derived
 *       status.
 */
function getInvoiceList({ scope, name, filters = {}, view = 'active' }) {
  let codes = null;

  if (scope === 'cluster') {
    codes = md.getDistributorCodesForCluster(name);
  } else if (scope === 'asm') {
    const asm = md.getAllAsms().find(a => a.asmArea === String(name || '').trim());   // ← Change 1
    codes = asm ? asm.distributors : null;
  } else if (scope === 'tsoe') {
    const tsoe = md.getAllTsoes().find(t => t.tsoeName === String(name || '').trim());
    codes = tsoe ? tsoe.distributors : null;
  }

  if (!codes) return null;

  const codesSet = new Set(codes.map(c => String(c || '').trim()).filter(Boolean));
  const all      = getAllInvoiceMappings();
  let   group    = all.filter(m => codesSet.has(String(m.distributorCode || '').trim()));
  group          = applyFilters(group, filters);

  const isAllView = view === 'all';
  const base = isAllView ? group : group.filter(m => isActiveInvoice(m.status, m.remarks));

  const today = startOfTodayMs();
  let rows = base.map(m => enrichInvoiceRow(m, today));

  // invoiceState sub-filter (On-Time / Overdue) applies identically in
  // both views — Appointment Date vs today is independent of whether the
  // invoice is still active, so this stays consistent for the person
  // switching between Active Invoices and All Invoices.
  if (filters.invoiceState === 'overdue') rows = rows.filter(r => r.isOverdue);
  else if (filters.invoiceState === 'active') rows = rows.filter(r => !r.isOverdue);

  rows.sort((a, b) => toComparableDate(b.invoiceDate) - toComparableDate(a.invoiceDate));
  return rows;
}

// Backward-compatible name — existing callers (and the route) can keep
// using this; it's just getInvoiceList() pinned to the active view.
function getActiveInvoiceList({ scope, name, filters = {}, view }) {
  return getInvoiceList({ scope, name, filters, view: view || 'active' });
}

/**
 * Single-invoice lookup for the tracking modal opened from a row click.
 * Returns the same fields available elsewhere in the app (no new data
 * source) — kept separate from getActiveInvoiceList so it can be reused
 * for an invoice regardless of whether it's currently active.
 */
function getInvoiceDetail(invoiceNo) {
  const no  = String(invoiceNo || '').trim();
  const all = getAllInvoiceMappings();
  const m   = all.find(x => String(x.invoiceNo || '').trim() === no);
  if (!m) return null;

  const today = startOfTodayMs();
  return enrichInvoiceRow(m, today);
}

module.exports = {
  buildKpisForDistributorCodes,
  getKpisForAsm,
  getKpisForTsoe,
  getKpisForCluster,
  getInvoiceList,
  getActiveInvoiceList,
  getInvoiceDetail,
};
