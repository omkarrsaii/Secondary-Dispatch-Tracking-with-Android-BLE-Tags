const { fetchAllDevices } = require('./browserService');
const { reverseGeocode } = require('./geocodeService');
const { upsertDevice, insertHistory, setAppState, getDeviceByName } = require('../db/database');
const { runGeofenceCheck, runDepartureTimeCheck } = require('./geofenceService');
const logger = require('../utils/logger');

let isFetching = false;
let sessionExpired = false;

function isSessionExpired() { return sessionExpired; }
function resetSessionExpired() { sessionExpired = false; }

async function runFetch() {
  if (isFetching) {
    logger.warn('Fetch already in progress, skipping');
    return { skipped: true };
  }

  isFetching = true;
  const startTime = new Date();
  logger.info('=== Fetch cycle started ===');

  try {
    const rawDevices = await fetchAllDevices();
    const results = [];

    for (const device of rawDevices) {
      try {
        const geo = device.latitude && device.longitude
          ? await reverseGeocode(device.latitude, device.longitude)
          : { locality: null, city: null, state: null, country: null };

        // A single transient reverse-geocode failure (network hiccup,
        // Nominatim rate-limit, a corporate firewall blocking it — same
        // class of issue as the OSRM demo server being blocked) must
        // never overwrite an already-known-good locality/city with null.
        // Without this, "Current Location" and "Distance From Hub" can
        // silently go from "Jawahar Nagar Colony" to "Location
        // unavailable" on the very next fetch cycle, even though the
        // vehicle hasn't actually gone anywhere unresolvable — only the
        // geocode call for THIS cycle failed.
        const existing = getDeviceByName(device.device_name);
        const resolvedGeo = {
          locality: geo.locality || existing?.locality || null,
          city:     geo.city    || existing?.city      || null,
          state:    geo.state   || existing?.state      || null,
          country:  geo.country || existing?.country     || null,
        };

        const deviceData = { ...device, ...resolvedGeo };
        const deviceId = upsertDevice(deviceData);
        insertHistory(deviceId, {
          latitude: device.latitude,
          longitude: device.longitude,
          battery: device.battery,
          network: device.network,
          last_seen_text: device.last_seen_text,
        });

        results.push({ ...deviceData, id: deviceId });
        logger.info(`Saved: ${device.device_name} @ ${device.latitude},${device.longitude}`);
      } catch (err) {
        logger.error(`Failed to process ${device.device_name}: ${err.message}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    setAppState('last_sync', new Date().toISOString());
    setAppState('last_sync_count', results.length.toString());
    setAppState('session_status', 'ok');
    sessionExpired = false;

    logger.info(`=== Fetch complete in ${duration}s — ${results.length} devices ===`);

    // Geofence recalculation — runs on every refresh (manual or scheduled),
    // since this is the single place "tag location refreshed" happens.
    // Wrapped defensively: a geofencing failure must never break the
    // device-location fetch itself, which is the more critical path.
    try {
      await runGeofenceCheck();
    } catch (err) {
      logger.error('Geofence check failed after fetch: ' + err.message);
    }

    // Departure Time (Inactive → Out for Delivery) detection — same "runs
    // on every refresh" reasoning, and same defensive wrapping so a
    // failure here can never break the fetch cycle itself.
    try {
      await runDepartureTimeCheck();
    } catch (err) {
      logger.error('Departure Time check failed after fetch: ' + err.message);
    }

    return { success: true, count: results.length, duration, devices: results };

  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      sessionExpired = true;
      setAppState('session_status', 'expired');
      logger.error('=== Session expired — run: npm run setup-login ===');
      return { error: 'SESSION_EXPIRED', message: 'Google session expired. Run setup-login.' };
    }
    logger.error('Fetch failed: ' + err.message);
    return { error: err.message };
  } finally {
    isFetching = false;
  }
}

module.exports = { runFetch, isSessionExpired, resetSessionExpired, isFetching: () => isFetching };
