const { fetchAllDevices } = require('./browserService');
const { reverseGeocode } = require('./geocodeService');
const { upsertDevice, insertHistory, setAppState } = require('../db/database');
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
          : { city: null, state: null, country: null };

        const deviceData = { ...device, city: geo.city, state: geo.state, country: geo.country };
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
