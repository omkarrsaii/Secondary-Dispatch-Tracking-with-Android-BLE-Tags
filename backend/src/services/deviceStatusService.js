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
 *   status    — computed in strict priority order:
 *                 1. Not assigned to any vehicle           → Inactive (always,
 *                    regardless of location or last-seen — checked FIRST and
 *                    short-circuits everything below)
 *                 2. Last seen more than 1 hour ago         → Inactive
 *                 3. Within the depot's 1 km geofence radius → Inactive
 *                 4. Assigned + seen within the last hour + outside the
 *                    depot radius, all three                → Active
 *
 * Used by GET /api/devices (Devices page + Dashboard), exportService.js
 * (CSV/Excel), and anywhere else a device's status is shown, so none of
 * them can ever disagree with each other.
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

  // Rule 1 — highest priority, checked before anything else: an unassigned
  // tag is ALWAYS Inactive, no matter where it is or when it was last seen.
  if (!vehicleNo) {
    return { vehicleNo: null, status: 'Inactive' };
  }

  // Rules 2–4: only reachable once we know a vehicle is assigned.
  let status = 'Inactive';
  if (device.latitude != null && device.longitude != null && device.latitude !== '' && device.longitude !== '') {
    const distanceMeters = getDistanceInKm(
      parseFloat(device.latitude), parseFloat(device.longitude), HUB_LAT, HUB_LON
    ) * 1000;
    const outsideDepotRadius = distanceMeters > geofence.HUB_RADIUS_METERS;   // Rule 3 (inverse)

    const minutesAgo   = getMinutesSinceLastSeen(device.last_seen_text || device.lastSeen, now);
    const recentlySeen = minutesAgo != null && minutesAgo <= RECENT_WINDOW_MINUTES; // Rule 2 (inverse)

    // Rule 4 — Active only when every condition holds at once.
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
