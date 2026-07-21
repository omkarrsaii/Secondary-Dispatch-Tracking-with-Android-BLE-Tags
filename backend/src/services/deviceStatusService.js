/**
 * deviceStatusService.js
 *
 * Single source of truth for two device-list-only fields that replaced the
 * old Battery/Network columns:
 *
 *   vehicleNo — the vehicle currently mapped to this BLE tag (reverse of
 *               mappingService's vehicleNo → deviceName map), or null when
 *               the tag isn't assigned to any vehicle.
 *
 *   status    — 'Active' when the tag is BOTH (a) outside the depot's
 *               geofence radius and (b) has reported within the last hour;
 *               'Inactive' otherwise (at/near the depot, stale last-seen
 *               data, unparseable last-seen text, or no coordinates at
 *               all — anything short of confirmed "out and recently seen"
 *               defaults to Inactive rather than guessing).
 *
 * Deliberately independent of vehicle assignment — an unassigned tag still
 * gets a real Active/Inactive reading from its own coordinates, it just
 * shows "Not Assigned" for Vehicle No.
 *
 * Used by both routes/api.js (GET /api/devices, the table on the Devices
 * page) and exportService.js (CSV/Excel) so the on-screen table and the
 * exported files can never disagree with each other.
 */

const mapping  = require('./mappingService');
const geofence = require('./geofenceService');
const { getDistanceInKm, getMinutesSinceLastSeen } = require('../utils/geoUtils');

// Same HUB_LAT/HUB_LON convention used by geofenceService.js, dashboardRoutes.js,
// and routeRoutes.js — reused here rather than a fifth independently-configured
// hub location.
const HUB_LAT = parseFloat(process.env.HUB_LAT || '17.608504');
const HUB_LON = parseFloat(process.env.HUB_LON || '78.528605');

const RECENT_WINDOW_MINUTES = 60; // "seen within the past 1 hour"

/** Map<deviceName → vehicleNo> — the reverse of mappingService's own map. */
function buildDeviceToVehicleMap() {
  const map = new Map();
  mapping.getAllVehicleDeviceMappings().forEach(({ vehicleNo, deviceName }) => {
    if (deviceName) map.set(String(deviceName).trim(), vehicleNo);
  });
  return map;
}

/**
 * device: a raw devices-table row (device_name, latitude, longitude,
 * last_seen_text, ...) — works with either the DB row shape or the
 * already-formatted API shape as long as those same field names exist.
 */
function computeDeviceVehicleAndStatus(device, deviceToVehicle, now = new Date()) {
  const name      = String(device.device_name || device.name || '').trim();
  const vehicleNo = deviceToVehicle.get(name) || null;

  let status = 'Inactive';
  if (device.latitude != null && device.longitude != null && device.latitude !== '' && device.longitude !== '') {
    const distanceMeters = getDistanceInKm(
      parseFloat(device.latitude), parseFloat(device.longitude), HUB_LAT, HUB_LON
    ) * 1000;
    const outsideDepotRadius = distanceMeters > geofence.HUB_RADIUS_METERS;

    const minutesAgo    = getMinutesSinceLastSeen(device.last_seen_text || device.lastSeen, now);
    const recentlySeen  = minutesAgo != null && minutesAgo <= RECENT_WINDOW_MINUTES;

    status = (outsideDepotRadius && recentlySeen) ? 'Active' : 'Inactive';
  }

  return { vehicleNo, status };
}

/** Batch version — builds the reverse map once instead of once per device. */
function enrichDevicesWithVehicleAndStatus(devices) {
  const deviceToVehicle = buildDeviceToVehicleMap();
  const now = new Date();
  return devices.map(d => ({ ...d, ...computeDeviceVehicleAndStatus(d, deviceToVehicle, now) }));
}

module.exports = {
  enrichDevicesWithVehicleAndStatus,
  computeDeviceVehicleAndStatus,
  buildDeviceToVehicleMap,
  RECENT_WINDOW_MINUTES,
};
