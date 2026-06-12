/**
 * geocodeService.js
 *
 * ROOT CAUSE FIX — SSL certificate error:
 *   "unable to get local issuer certificate"
 *
 *   This happens in corporate/enterprise environments where an SSL inspection
 *   proxy (e.g. Zscaler, Forcepoint, corporate firewall) intercepts HTTPS
 *   traffic and re-signs it with a corporate CA that Node.js does not trust.
 *
 *   The geocoding request goes to https://nominatim.openstreetmap.org which
 *   is proxied and re-signed → Node.js rejects the certificate.
 *
 *   Fix: create a dedicated https.Agent with rejectUnauthorized: false,
 *   scoped only to the Nominatim request. This does NOT affect other HTTPS
 *   calls in the application (Google Sheets, Find Hub).
 *
 *   Controlled via GEOCODE_IGNORE_SSL=true in .env (default: true for now
 *   since this environment clearly has a proxy).
 */

const axios  = require('axios');
const https  = require('https');
const logger = require('../utils/logger');

const NOMINATIM_URL      = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const GEOCODE_IGNORE_SSL = process.env.GEOCODE_IGNORE_SSL !== 'false'; // true by default

// Agent used only for Nominatim — ignores SSL errors from corporate proxies
const geocodeAgent = GEOCODE_IGNORE_SSL
  ? new https.Agent({ rejectUnauthorized: false })
  : undefined;

// Simple in-memory cache — avoids hammering Nominatim (1 req/sec rate limit)
const geocodeCache = new Map();

async function reverseGeocode(lat, lng) {
  if (!lat || !lng) return { city: null, state: null, country: null };

  const key = `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  try {
    await sleep(1100);   // Nominatim rate limit: 1 req/second

    const response = await axios.get(`${NOMINATIM_URL}/reverse`, {
      params: {
        lat,
        lon:    lng,
        format: 'json',
        addressdetails: 1,
      },
      headers: {
        'User-Agent':     'FindHubTracker/1.0 (device-location-tracker)',
        'Accept-Language': 'en',
      },
      timeout:    10000,
      httpsAgent: geocodeAgent,   // ← FIX: bypass corporate SSL proxy
    });

    const addr   = response.data?.address || {};
    const result = {
      city:    addr.city || addr.town || addr.village || addr.county || null,
      state:   addr.state   || null,
      country: addr.country || null,
      display: response.data?.display_name || null,
    };

    geocodeCache.set(key, result);
    logger.info(`Geocoded ${lat},${lng} → ${result.city}, ${result.state}`);
    return result;

  } catch (err) {
    logger.error(`Geocoding failed for ${lat},${lng}: ${err.message}`);
    return { city: null, state: null, country: null };
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

module.exports = { reverseGeocode };
