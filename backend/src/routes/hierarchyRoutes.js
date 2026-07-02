/**
 * routes/hierarchyRoutes.js  —  /api/hierarchy/* endpoints
 *
 * GET  /api/hierarchy/tree              — full Zone→Cluster→ASM→TSOE→Distributor tree
 * GET  /api/hierarchy/status            — sync status
 * POST /api/hierarchy/sync              — manual sync
 * GET  /api/hierarchy/zones             — all zones with counts
 * GET  /api/hierarchy/clusters          — all clusters with counts
 * GET  /api/hierarchy/asms              — all ASMs with counts
 * GET  /api/hierarchy/tsoes             — all TSOEs with counts
 * GET  /api/hierarchy/distributors      — flat list of all distributors
 * GET  /api/hierarchy/distributor/:code — single distributor full detail
 * GET  /api/hierarchy/kpis/cluster/:name — Performance KPIs for a cluster
 * GET  /api/hierarchy/kpis/asm/:name     — Performance KPIs for an ASM
 * GET  /api/hierarchy/kpis/tsoe/:name    — Performance KPIs for a TSOE
 * GET  /api/hierarchy/invoices           — hierarchy-aware Active Invoice List
 * GET  /api/hierarchy/invoices/:invoiceNo — single-invoice detail (tracking modal)
 */

const express = require('express');
const router  = express.Router();
const logger  = require('../utils/logger');
const md      = require('../services/masterDataService');
const { getAllInvoiceMappings, getAllVehicleDeviceMappings } = require('../services/mappingService');
const { getAllDevices } = require('../db/database');
const { getActiveInvoicesForDistributor } = require('../services/distributorPortalService');
const kpi = require('../services/kpiService');
const geofence = require('../services/geofenceService');

// ─── Helper: get live vehicle status for a distributor ─────────────────────

function getDistributorLiveData(distributorCode, allInvoices, vehicleDevMap, deviceMap) {
  const invoices  = allInvoices.filter(inv =>
    String(inv.customerCode || '').trim() === String(distributorCode).trim()
  );
  const vehicleNos = new Set(invoices.map(i => i.vehicleNo).filter(Boolean));
  const activeVehicles = [];

  for (const vno of vehicleNos) {
    const deviceName = vehicleDevMap.get(vno);
    const device     = deviceName ? deviceMap.get(deviceName) : null;
    if (device) {
      activeVehicles.push({
        vehicleNo:  vno,
        deviceName,
        latitude:   device.latitude  || null,
        longitude:  device.longitude || null,
        lastSeen:   device.last_seen_text || null,
        battery:    device.battery || null,
      });
    }
  }
  return { invoiceCount: invoices.length, vehicleCount: vehicleNos.size, vehicles: activeVehicles };
}

// ─── Helper: get live GPS data for an invoice's vehicle (Change 2) ─────────────
// Follows the same lookup chain used by /api/invoice/track/:invoiceNo — one
// source of truth for "where is this vehicle right now."

function getInvoiceLiveTracking(vehicleNo, vehicleDevMap, deviceMap) {
  if (!vehicleNo) return null;
  const deviceName = vehicleDevMap.get(String(vehicleNo).trim());
  if (!deviceName) return null;
  const device = deviceMap.get(deviceName);
  if (!device) return null;

  const hasCoords = device.latitude && device.longitude;
  return {
    deviceName,
    latitude:  hasCoords ? parseFloat(device.latitude)  : null,
    longitude: hasCoords ? parseFloat(device.longitude) : null,
    lastSeen:  device.last_seen_text || null,
    battery:   device.battery        || null,
    locality:  device.locality       || null,
    city:      device.city           || null,
    state:     device.state          || null,
    mapsUrl:   hasCoords
      ? `https://www.google.com/maps?q=${device.latitude},${device.longitude}`
      : null,
  };
}

// ─── GET /api/hierarchy/tree ──────────────────────────────────────────────────

router.get('/tree', (req, res) => {
  try {
    const tree = md.buildHierarchyTree();
    res.json({ tree });
  } catch (err) {
    logger.error('GET /api/hierarchy/tree error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/status ────────────────────────────────────────────────

router.get('/status', (req, res) => {
  res.json(md.getMasterDataStatus().hierarchy);
});

// ─── GET /api/hierarchy/distributor-locations/status ──────────────────────────
// Geofencing sheet sync status — separate from /status (hierarchy) so it's
// easy to confirm DISTRIBUTOR_LOCATION_SHEET_ID is wired up correctly.

router.get('/distributor-locations/status', (req, res) => {
  res.json(md.getMasterDataStatus().distributorLocations);
});

// ─── POST /api/hierarchy/geofence/run ──────────────────────────────────────────
// Manually triggers a geofence pass — useful for testing without waiting
// for the next scheduled tag-location refresh (FETCH_INTERVAL).

router.post('/geofence/run', async (req, res) => {
  try {
    const result = await geofence.runGeofenceCheck();
    res.json(result);
  } catch (err) {
    logger.error('POST /api/hierarchy/geofence/run error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/hierarchy/sync ─────────────────────────────────────────────────

router.post('/sync', async (req, res) => {
  try {
    const result = await md.syncHierarchy();
    res.json(result);
  } catch (err) {
    logger.error('POST /api/hierarchy/sync error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/zones ─────────────────────────────────────────────────

router.get('/zones', (req, res) => {
  try {
    res.json({ zones: md.getAllZones() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/clusters ──────────────────────────────────────────────

router.get('/clusters', (req, res) => {
  try {
    const { region } = req.query;
    let clusters = md.getAllClusters();
    if (region) clusters = clusters.filter(c => c.region === region);
    res.json({ clusters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/asms ──────────────────────────────────────────────────

router.get('/asms', (req, res) => {
  try {
    const { region, cluster } = req.query;
    let asms = md.getAllAsms();
    if (region)  asms = asms.filter(a => a.region      === region);
    if (cluster) asms = asms.filter(a => a.clusterName === cluster);
    res.json({ asms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/tsoes ─────────────────────────────────────────────────

router.get('/tsoes', (req, res) => {
  try {
    const { asm, cluster } = req.query;
    let tsoes = md.getAllTsoes();
    if (asm)     tsoes = tsoes.filter(t => t.asmArea     === asm);   // ← match Area (Change 1)
    if (cluster) tsoes = tsoes.filter(t => t.clusterName === cluster);
    res.json({ tsoes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/distributors ──────────────────────────────────────────

router.get('/distributors', (req, res) => {
  try {
    const { region, cluster, asm, tsoe, status } = req.query;
    let distributors = md.getAllDistributors();
    if (region)  distributors = distributors.filter(d => d.region      === region);
    if (cluster) distributors = distributors.filter(d => d.clusterName === cluster);
    if (asm)     distributors = distributors.filter(d => d.asmArea     === asm);   // ← Area (Change 1)
    if (tsoe)    distributors = distributors.filter(d => d.tsoeName    === tsoe);
    if (status) distributors = distributors.filter(d =>
      d.status.toLowerCase() === status.toLowerCase()
    );
    res.json({ total: distributors.length, distributors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/distributor/:code ─────────────────────────────────────

router.get('/distributor/:code', (req, res) => {
  try {
    const code   = req.params.code;
    const hier   = md.getDistributorHierarchy(code);
    if (!hier) {
      return res.status(404).json({
        error:   'DISTRIBUTOR_NOT_FOUND',
        message: `Distributor "${code}" not found in hierarchy.`,
      });
    }

    // Enrich with live invoice + vehicle data
    const allInvoices   = getAllInvoiceMappings();
    const vehicleDevMap = new Map(
      getAllVehicleDeviceMappings().map(v => [v.vehicleNo, v.deviceName])
    );
    const deviceMap = new Map(
      getAllDevices().map(d => [d.device_name, d])
    );

    const live     = getDistributorLiveData(code, allInvoices, vehicleDevMap, deviceMap);
    const route    = md.getDistributorRoute(code);

    // Same active-invoice list shown in the Distributor Portal — same
    // service function, same rule (Status AND Remarks both blank), so an
    // ASM sees exactly what the distributor themselves would see.
    const activeInvoices = getActiveInvoicesForDistributor(code);

    res.json({
      ...hier,
      route,
      liveData: live,
      activeInvoices,
      totalActiveInvoices: activeInvoices.length,
    });
  } catch (err) {
    logger.error('GET /api/hierarchy/distributor/:code error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/kpis/cluster/:name ────────────────────────────────────
// Same KPI set, summed across every ASM/distributor in the cluster.
// Query params: dateFrom, dateTo (Invoice Date), distributorCode.

router.get('/kpis/cluster/:name', (req, res) => {
  try {
    const { dateFrom, dateTo, distributorCode } = req.query;
    const result = kpi.getKpisForCluster(req.params.name, { dateFrom, dateTo, distributorCode });
    if (!result) {
      return res.status(404).json({
        error:   'CLUSTER_NOT_FOUND',
        message: `No cluster found matching "${req.params.name}".`,
      });
    }
    res.json(result);
  } catch (err) {
    logger.error('GET /api/hierarchy/kpis/cluster/:name error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/kpis/asm/:name ────────────────────────────────────────
// Performance KPIs for a single ASM: totalInvoices, activeInvoices,
// completedInvoices, completionRate (%), overdueInvoices, distributorCount.
// Query params: dateFrom, dateTo (Invoice Date), distributorCode.

router.get('/kpis/asm/:name', (req, res) => {
  try {
    const { dateFrom, dateTo, distributorCode } = req.query;
    const result = kpi.getKpisForAsm(req.params.name, { dateFrom, dateTo, distributorCode });
    if (!result) {
      return res.status(404).json({
        error:   'ASM_NOT_FOUND',
        message: `No ASM found matching "${req.params.name}".`,
      });
    }
    res.json(result);
  } catch (err) {
    logger.error('GET /api/hierarchy/kpis/asm/:name error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/kpis/tsoe/:name ───────────────────────────────────────
// Same KPI set, scoped to a single TSOE's distributors.
// Query params: dateFrom, dateTo (Invoice Date), distributorCode.

router.get('/kpis/tsoe/:name', (req, res) => {
  try {
    const { dateFrom, dateTo, distributorCode } = req.query;
    const result = kpi.getKpisForTsoe(req.params.name, { dateFrom, dateTo, distributorCode });
    if (!result) {
      return res.status(404).json({
        error:   'TSOE_NOT_FOUND',
        message: `No TSOE found matching "${req.params.name}".`,
      });
    }
    res.json(result);
  } catch (err) {
    logger.error('GET /api/hierarchy/kpis/tsoe/:name error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/invoices ──────────────────────────────────────────────
// Hierarchy-aware Invoice List — backs both the "Active Invoices" and
// "All Invoices" views.
// Query params: scope ('cluster'|'asm'|'tsoe'), name, dateFrom, dateTo,
// distributorCode, invoiceState ('all'|'active'|'overdue'),
// view ('active'|'all' — default 'active').

router.get('/invoices', (req, res) => {
  try {
    const { scope, name, dateFrom, dateTo, distributorCode, invoiceState, view } = req.query;
    if (!scope || !name) {
      return res.status(400).json({ error: 'MISSING_PARAMS', message: '"scope" and "name" are required.' });
    }
    const rows = kpi.getInvoiceList({
      scope,
      name,
      filters: { dateFrom, dateTo, distributorCode, invoiceState },
      view: view === 'all' ? 'all' : 'active',
    });
    if (rows === null) {
      return res.status(404).json({
        error:   'SCOPE_NOT_FOUND',
        message: `No ${scope} found matching "${name}".`,
      });
    }
    res.json({ total: rows.length, invoices: rows });
  } catch (err) {
    logger.error('GET /api/hierarchy/invoices error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/invoices/:invoiceNo ───────────────────────────────────
// Single-invoice detail, used for the row-click tracking modal (admin) and
// the Search page detail modal.  Now also includes live GPS coordinates,
// last-seen text, and a Google Maps link when the vehicle has a device (Change 2).

router.get('/invoices/:invoiceNo', (req, res) => {
  try {
    const result = kpi.getInvoiceDetail(req.params.invoiceNo);
    if (!result) {
      return res.status(404).json({
        error:   'INVOICE_NOT_FOUND',
        message: `Invoice "${req.params.invoiceNo}" not found.`,
      });
    }

    // Enrich with live vehicle GPS — same lookup the public /api/invoice/track uses.
    const vehicleDevMap = new Map(
      getAllVehicleDeviceMappings().map(v => [v.vehicleNo, v.deviceName])
    );
    const deviceMap = new Map(getAllDevices().map(d => [d.device_name, d]));
    const tracking  = getInvoiceLiveTracking(result.vehicleNo, vehicleDevMap, deviceMap);

    res.json({ ...result, tracking });
  } catch (err) {
    logger.error('GET /api/hierarchy/invoices/:invoiceNo error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
