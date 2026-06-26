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
const { getAllInvoiceMappings } = require('./mappingService');
const { isActiveInvoice, toComparableDate } = require('./distributorPortalService');

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

/** KPIs for a single ASM, matched against the same asmName key masterDataService.getAllAsms() uses. */
function getKpisForAsm(asmName, filters = {}) {
  const name = String(asmName || '').trim();
  const asm  = md.getAllAsms().find(a => a.asmName === name);
  if (!asm) {
    logger.warn(`kpiService: no ASM found matching "${name}"`);
    return null;
  }
  return {
    asmName: asm.asmName,
    asmArea: asm.asmArea,
    region:  asm.region,
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
 * Builds one Active Invoice List row.
 *
 * Status shown here is a DERIVED label, not the raw sheet Status column —
 * active invoices always have a blank Status cell by definition, so
 * showing that blank would be useless. Instead this shows "Overdue" (past
 * Appointment Date) or "Pending" (still within its appointment window).
 *
 * lastUpdated uses Invoice Date — the sheet has no distinct "last
 * modified" timestamp column. If Vehicle Dispatch Date would be a more
 * meaningful "last touched" signal, flag it and it can be added.
 *
 * ageDays = days since Invoice Date, i.e. how long this invoice has been
 * sitting active. Invoices with no parseable Invoice Date show null.
 */
function enrichInvoiceRow(m, todayMs) {
  const hier   = md.getDistributorHierarchy(m.distributorCode) || {};
  const apptMs = m.appointmentDate ? toComparableDate(m.appointmentDate) : 0;
  const isOverdue = apptMs > 0 && apptMs < todayMs;

  const invMs   = toComparableDate(m.invoiceDate);
  const ageDays = invMs > 0 ? Math.floor((todayMs - invMs) / 86400000) : null;

  return {
    invoiceNo:       m.invoiceNo,
    asmName:         hier.asmName  || '',
    tsoeName:        hier.tsoeName || '', // "HQ" in the UI
    distributorCode: m.distributorCode,
    distributorName: m.distributorName || hier.distributorName || '',
    status:          isOverdue ? 'Overdue' : 'Pending',
    isOverdue,
    vehicleNo:       m.vehicleNo || null,
    vehicleStatus:   m.vehicleNo ? 'Assigned' : 'Not Assigned',
    invoiceDate:     m.invoiceDate || null,
    appointmentDate: m.appointmentDate || null,
    lastUpdated:     m.invoiceDate || null,
    ageDays,
  };
}

/**
 * Hierarchy-aware Active Invoice List.
 *
 * scope: 'cluster' | 'asm' | 'tsoe', name: the cluster/ASM/TSOE name.
 * filters: { dateFrom, dateTo, distributorCode, invoiceState }
 *   - dateFrom/dateTo/distributorCode narrow the SAME base set the KPI
 *     cards use, so the two stay consistent with each other.
 *   - invoiceState ('all' | 'active' | 'overdue') is a sub-filter that
 *     ONLY applies to this list, never to the KPI cards above it.
 */
function getActiveInvoiceList({ scope, name, filters = {} }) {
  let codes = null;

  if (scope === 'cluster') {
    codes = md.getDistributorCodesForCluster(name);
  } else if (scope === 'asm') {
    const asm = md.getAllAsms().find(a => a.asmName === String(name || '').trim());
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

  const active = group.filter(m => isActiveInvoice(m.status, m.remarks));

  const today = startOfTodayMs();
  let rows = active.map(m => enrichInvoiceRow(m, today));

  if (filters.invoiceState === 'overdue') rows = rows.filter(r => r.isOverdue);
  else if (filters.invoiceState === 'active') rows = rows.filter(r => !r.isOverdue);

  rows.sort((a, b) => toComparableDate(b.invoiceDate) - toComparableDate(a.invoiceDate));
  return rows;
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
  getActiveInvoiceList,
  getInvoiceDetail,
};
