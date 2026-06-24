/**
 * routes/hierarchyRoutes.js  —  /api/hierarchy/* endpoints
 *
 * GET  /api/hierarchy/tree              — full Zone→Cluster→ASM→TSOE→Distributor tree
 * GET  /api/hierarchy/status            — sync status
 * POST /api/hierarchy/sync              — manual sync
 * GET  /api/hierarchy/zones             — all zones with counts
 * GET  /api/hierarchy/asms              — all ASMs with counts
 * GET  /api/hierarchy/tsoes             — all TSOEs with counts
 * GET  /api/hierarchy/distributors      — flat list of all distributors
 * GET  /api/hierarchy/distributor/:code — single distributor full detail
 */

const express = require('express');
const router  = express.Router();
const logger  = require('../utils/logger');
const md      = require('../services/masterDataService');
const { getAllInvoiceMappings, getAllVehicleDeviceMappings } = require('../services/mappingService');
const { getAllDevices } = require('../db/database');
const { getActiveInvoicesForDistributor } = require('../services/distributorPortalService');

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
    const { asm } = req.query;
    let tsoes = md.getAllTsoes();
    if (asm) tsoes = tsoes.filter(t => t.asmName === asm);
    res.json({ tsoes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hierarchy/distributors ──────────────────────────────────────────

router.get('/distributors', (req, res) => {
  try {
    const { region, asm, tsoe, status } = req.query;
    let distributors = md.getAllDistributors();
    if (region) distributors = distributors.filter(d => d.region  === region);
    if (asm)    distributors = distributors.filter(d => d.asmName === asm);
    if (tsoe)   distributors = distributors.filter(d => d.tsoeName === tsoe);
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

module.exports = router;
