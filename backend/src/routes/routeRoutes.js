/**
 * routes/routeRoutes.js  —  /api/routes/* endpoints
 *
 * GET  /api/routes                    — list all routes with stats
 * GET  /api/routes/status             — sync status
 * POST /api/routes/sync               — trigger manual sync
 * GET  /api/routes/:routeName         — route detail (distributors + invoices + vehicles)
 * GET  /api/routes/:routeName/vehicles — vehicles currently carrying invoices for this route
 * GET  /api/routes/:routeName/map     — map-based view: depot, distributor pins (with live
 *                                        delivery status), live vehicle positions, and the
 *                                        actual road-route polyline through every stop
 */

const express = require('express');
const router  = express.Router();
const logger  = require('../utils/logger');
const md      = require('../services/masterDataService');
const { getAllInvoiceMappings, getAllVehicleDeviceMappings } = require('../services/mappingService');
const { getAllDevices } = require('../db/database');
const { getDistanceInKm } = require('../utils/geoUtils');
const { isActiveInvoice } = require('../services/distributorPortalService');
const routing = require('../services/routingService');

const HUB_LAT = parseFloat(process.env.HUB_LAT || '17.608504');
const HUB_LON = parseFloat(process.env.HUB_LON || '78.528605');

// ─── Helper: enrich a distributor code with live invoice + vehicle data ───────

function enrichDistributor(distributorCode, allInvoices, vehicleDeviceMap, deviceMap) {
  const invoices = allInvoices.filter(inv => {
    // Match by chain name or customer code to distributor
    // This is a best-effort match; exact match when distributorCode is present in invoice meta
    return String(inv.customerCode || '').trim() === String(distributorCode).trim();
  });

  const vehicles = [];
  const seenVehicles = new Set();
  for (const inv of invoices) {
    if (!inv.vehicleNo || seenVehicles.has(inv.vehicleNo)) continue;
    seenVehicles.add(inv.vehicleNo);
    const deviceName = vehicleDeviceMap.get(inv.vehicleNo);
    const device     = deviceName ? deviceMap.get(deviceName) : null;

    if (device) {
      const dist = device.latitude && device.longitude
        ? getDistanceInKm(parseFloat(device.latitude), parseFloat(device.longitude), HUB_LAT, HUB_LON)
        : null;
      vehicles.push({
        vehicleNo:  inv.vehicleNo,
        deviceName,
        latitude:   device.latitude  || null,
        longitude:  device.longitude || null,
        location:   [device.city, device.state].filter(Boolean).join(', ') || null,
        lastSeen:   device.last_seen_text || null,
        battery:    device.battery || null,
        distanceKm: dist ? parseFloat(dist.toFixed(2)) : null,
        status:     dist !== null ? (dist > 1 ? 'out_for_delivery' : 'inactive') : 'unknown',
      });
    }
  }

  return { invoiceCount: invoices.length, vehicles };
}

// ─── GET /api/routes ──────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    const routes = md.getAllRoutes();
    const allInvoices   = getAllInvoiceMappings();
    const vehicleDevMap = new Map(
      getAllVehicleDeviceMappings().map(v => [v.vehicleNo, v.deviceName])
    );

    // Count invoices per route distributor set
    const enriched = routes.map(route => {
      const distCodes  = new Set(route.distributors);
      const invoices   = allInvoices.filter(inv => distCodes.has(String(inv.customerCode || '').trim()));
      const vehicleNos = new Set(invoices.map(inv => inv.vehicleNo).filter(Boolean));

      return {
        routeName:        route.routeName,
        asmName:          route.asmName,
        distributorCount: route.distributorCount,
        invoiceCount:     invoices.length,
        vehicleCount:     vehicleNos.size,
      };
    });

    res.json({
      total:  enriched.length,
      routes: enriched,
    });
  } catch (err) {
    logger.error('GET /api/routes error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/routes/status ───────────────────────────────────────────────────

router.get('/status', (req, res) => {
  res.json(md.getMasterDataStatus().routes);
});

// ─── POST /api/routes/sync ────────────────────────────────────────────────────

router.post('/sync', async (req, res) => {
  try {
    const result = await md.syncRoutes();
    res.json(result);
  } catch (err) {
    logger.error('POST /api/routes/sync error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/routes/:routeName ───────────────────────────────────────────────

router.get('/:routeName', (req, res) => {
  try {
    const routeName = decodeURIComponent(req.params.routeName);
    const detail    = md.getRouteDetail(routeName);
    if (!detail) {
      return res.status(404).json({ error: 'ROUTE_NOT_FOUND', message: `Route "${routeName}" not found.` });
    }

    const allInvoices = getAllInvoiceMappings();
    const vehicleDevMap = new Map(
      getAllVehicleDeviceMappings().map(v => [v.vehicleNo, v.deviceName])
    );
    const deviceMap = new Map(
      getAllDevices().map(d => [d.device_name, d])
    );

    // Enrich each distributor with invoices + vehicles
    const distributors = detail.distributors.map(dist => {
      const { invoiceCount, vehicles } = enrichDistributor(
        dist.distributorCode, allInvoices, vehicleDevMap, deviceMap
      );
      return {
        ...dist,
        invoiceCount,
        vehicleCount: vehicles.length,
        vehicles,
      };
    });

    const totalInvoices = distributors.reduce((s, d) => s + d.invoiceCount, 0);
    const totalVehicles = new Set(
      distributors.flatMap(d => d.vehicles.map(v => v.vehicleNo))
    ).size;

    res.json({
      routeName:        detail.routeName,
      asmName:          detail.asmName,
      distributorCount: detail.distributorCount,
      totalInvoices,
      totalVehicles,
      distributors,
    });
  } catch (err) {
    logger.error('GET /api/routes/:routeName error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/routes/:routeName/map ───────────────────────────────────────────
//
// Everything the map-based Route Details view needs in one call:
//   - depot coordinates (route start)
//   - every distributor on the route as a pin, with its live delivery
//     status ('completed' | 'current' | 'pending') and whichever vehicle
//     is currently assigned to it, if any
//   - every vehicle currently carrying an invoice for this route, as a
//     live position — same live BLE location data used everywhere else,
//     so refreshing devices refreshes these positions too, automatically
//   - the actual road-route polyline (depot → every distributor stop, in
//     route order) from routingService/OSRM — never a straight line

router.get('/:routeName/map', async (req, res) => {
  try {
    const routeName = decodeURIComponent(req.params.routeName);
    const detail    = md.getRouteDetail(routeName);
    if (!detail) {
      return res.status(404).json({ error: 'ROUTE_NOT_FOUND', message: `Route "${routeName}" not found.` });
    }

    const allInvoices    = getAllInvoiceMappings();
    const vehicleDevMap  = new Map(getAllVehicleDeviceMappings().map(v => [v.vehicleNo, v.deviceName]));
    const deviceMap      = new Map(getAllDevices().map(d => [d.device_name, d]));
    const distCodesOnRoute = new Set(detail.distributors.map(d => d.distributorCode));

    // Every invoice that belongs to a distributor on THIS route — the
    // shared basis for both distributor delivery-status and the vehicle
    // list below, so the two can never disagree with each other.
    const routeInvoices = allInvoices.filter(inv =>
      distCodesOnRoute.has(String(inv.customerCode || '').trim())
    );

    // ── Distributor pins ──────────────────────────────────────────────
    const distributors = detail.distributors.map(dist => {
      const loc = md.getDistributorLocation(dist.distributorCode);
      const invoicesForDist = routeInvoices.filter(inv =>
        String(inv.customerCode || '').trim() === dist.distributorCode
      );
      const activeInvoicesForDist = invoicesForDist.filter(inv => isActiveInvoice(inv.status, inv.remarks));
      const vehicleNo = activeInvoicesForDist.find(inv => inv.vehicleNo)?.vehicleNo || null;

      // pending: nothing active yet (or no invoices at all) — completed:
      // had invoices and every one of them is delivered — current: an
      // active invoice with a vehicle already on its way there.
      let deliveryStatus = 'pending';
      if (invoicesForDist.length > 0 && activeInvoicesForDist.length === 0) deliveryStatus = 'completed';
      else if (activeInvoicesForDist.length > 0 && vehicleNo) deliveryStatus = 'current';

      return {
        distributorCode: dist.distributorCode,
        distributorName: dist.distributorName,
        city:            dist.city,
        tsoeName:        dist.tsoeName,
        asmName:         dist.asmName,
        latitude:        loc?.latitude  ?? null,
        longitude:       loc?.longitude ?? null,
        invoiceCount:    activeInvoicesForDist.length,
        vehicleNo,
        deliveryStatus,  // 'pending' | 'current' | 'completed'
      };
    });

    // ── Live vehicle positions ────────────────────────────────────────
    const vehicleNos = new Set(routeInvoices.map(inv => inv.vehicleNo).filter(Boolean));
    const vehicles = [];
    for (const vehicleNo of vehicleNos) {
      const deviceName = vehicleDevMap.get(vehicleNo);
      const device      = deviceName ? deviceMap.get(deviceName) : null;
      if (!device) continue;

      const vehicleInvoices = routeInvoices.filter(inv => inv.vehicleNo === vehicleNo);
      const activeVehicleInvoices = vehicleInvoices.filter(inv => isActiveInvoice(inv.status, inv.remarks));
      const dist = device.latitude && device.longitude
        ? getDistanceInKm(parseFloat(device.latitude), parseFloat(device.longitude), HUB_LAT, HUB_LON)
        : null;

      vehicles.push({
        vehicleNo,
        deviceName,
        latitude:    device.latitude  || null,
        longitude:   device.longitude || null,
        location:    [device.city, device.state].filter(Boolean).join(', ') || null,
        lastSeen:    device.last_seen_text || null,
        invoiceCount: activeVehicleInvoices.length,
        status:      dist !== null ? (dist > 1 ? 'out_for_delivery' : 'inactive') : 'unknown',
        distanceKm:  dist !== null ? parseFloat(dist.toFixed(2)) : null,
        // A vehicle can be carrying invoices for more than one stop on a
        // multi-drop trip — every distributor code it's currently headed
        // to, not just one.
        distributorCodes: [...new Set(activeVehicleInvoices.map(inv => String(inv.customerCode || '').trim()).filter(Boolean))],
      });
    }

    // ── Road-route polyline: depot → every distributor stop with known
    // coordinates, in route order ──────────────────────────────────────
    const waypoints = [
      { lat: HUB_LAT, lon: HUB_LON },
      ...distributors.filter(d => d.latitude != null && d.longitude != null)
                      .map(d => ({ lat: d.latitude, lon: d.longitude })),
    ];
    const routeGeometry = await routing.getMultiStopRoute(waypoints);

    res.json({
      routeName:  detail.routeName,
      asmName:    detail.asmName,
      depot:      { latitude: HUB_LAT, longitude: HUB_LON },
      distributors,
      vehicles,
      routePolyline: routeGeometry?.geometry || [],
      routeSource:   routeGeometry?.source || null,
      routeDistanceMeters: routeGeometry?.distanceMeters ?? null,
    });
  } catch (err) {
    logger.error('GET /api/routes/:routeName/map error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
