/**
 * routingService.js
 *
 * Actual ROAD distance + turn-by-turn route geometry, replacing the
 * straight-line (Haversine) calculation for the two distances the
 * Distributor Portal actually shows a person:
 *
 *   - Depot → Current Vehicle     ("Distance From Hub")
 *   - Current Vehicle → Distributor ("Distance To Destination")
 *
 * Uses OSRM (Open Source Routing Machine) against its free public demo
 * server by default — the same "no paid API key needed" approach already
 * used for reverse-geocoding via Nominatim in geocodeService.js. Point
 * OSRM_URL (in .env) at a self-hosted OSRM/ORS/Mapbox-compatible instance
 * for production traffic: the public demo server is explicitly NOT meant
 * for sustained high-volume use and can rate-limit or go down without
 * notice — fine for this app's per-invoice-detail-view call volume, but
 * worth knowing before relying on it heavily.
 *
 * Distance and route geometry are always fetched from the SAME response,
 * never derived separately — this is what guarantees "the displayed
 * distance always matches the route shown on the map" instead of two
 * independently-computed numbers that could quietly drift apart.
 *
 * Falls back to the existing Haversine straight-line calculation
 * (getDistanceInKm) whenever the routing engine is unreachable, times
 * out, or returns no route — so a network hiccup here degrades the
 * distance number gracefully instead of breaking the tracking page. The
 * fallback is flagged via `source: 'straight-line'` so callers/UI can
 * choose to note "approximate" if they want to.
 */

const axios  = require('axios');
const https  = require('https');
const logger = require('../utils/logger');
const { getDistanceInKm } = require('../utils/geoUtils');

const OSRM_URL = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');

// Same corporate-proxy SSL reasoning as geocodeService.js's Nominatim calls.
const ROUTING_IGNORE_SSL = process.env.ROUTING_IGNORE_SSL !== 'false'; // true by default
const routeAgent = ROUTING_IGNORE_SSL ? new https.Agent({ rejectUnauthorized: false }) : undefined;

// A vehicle doesn't meaningfully move road-distance-wise inside a minute,
// so short-TTL caching avoids hammering the routing engine on every
// dashboard/portal poll for the same vehicle+destination pair.
const ROUTE_CACHE_TTL_MS         = parseInt(process.env.ROUTE_CACHE_TTL_MS) || 60000;        // 60s on success
const ROUTE_FALLBACK_CACHE_TTL_MS = parseInt(process.env.ROUTE_FALLBACK_CACHE_TTL_MS) || 10000; // 10s on failure — retry the real engine soon

const routeCache = new Map(); // key → { result, expiresAt }

function cacheKey(lat1, lon1, lat2, lon2) {
  const r = n => Number(n).toFixed(5);
  return `${r(lat1)},${r(lon1)}|${r(lat2)},${r(lon2)}`;
}

function straightLineFallback(lat1, lon1, lat2, lon2, reason) {
  const km = getDistanceInKm(lat1, lon1, lat2, lon2);
  return {
    distanceMeters:  Math.round(km * 1000),
    durationSeconds: null,
    geometry:        [[lat1, lon1], [lat2, lon2]], // straight line, last resort only
    source:          'straight-line',
    fallbackReason:  reason || null,
  };
}

/**
 * Road distance + full route geometry between two points in ONE call.
 *
 * @returns {Promise<{distanceMeters:number, durationSeconds:number|null, geometry:[number,number][], source:'osrm'|'straight-line'}|null>}
 *          null only when the input coordinates themselves are invalid.
 */
async function getRoadRoute(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some(v => v == null || v === '' || isNaN(parseFloat(v)))) {
    return null;
  }
  lat1 = parseFloat(lat1); lon1 = parseFloat(lon1);
  lat2 = parseFloat(lat2); lon2 = parseFloat(lon2);

  const key    = cacheKey(lat1, lon1, lat2, lon2);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  try {
    const url = `${OSRM_URL}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}`;
    const response = await axios.get(url, {
      params:     { overview: 'full', geometries: 'geojson', alternatives: false, steps: false },
      timeout:    8000,
      httpsAgent: OSRM_URL.startsWith('https') ? routeAgent : undefined,
    });

    const route = response.data?.routes?.[0];
    if (!route) throw new Error('Routing engine returned no route');

    // GeoJSON is [lng, lat] — flip to [lat, lng] to match Leaflet's convention
    // (and every other lat/lng pair already used across this codebase).
    const coords   = route.geometry?.coordinates || [];
    const geometry = coords.length
      ? coords.map(([lng, lat]) => [lat, lng])
      : [[lat1, lon1], [lat2, lon2]];

    const result = {
      distanceMeters:  Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      geometry,
      source: 'osrm',
    };

    routeCache.set(key, { result, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS });
    return result;

  } catch (err) {
    logger.warn(`routingService: OSRM request failed (${err.message}) — falling back to straight-line distance for this pair`);
    const fallback = straightLineFallback(lat1, lon1, lat2, lon2, err.message);
    routeCache.set(key, { result: fallback, expiresAt: Date.now() + ROUTE_FALLBACK_CACHE_TTL_MS });
    return fallback;
  }
}

/** Road distance only, in meters — convenience wrapper when the caller doesn't need the geometry. */
async function getRoadDistanceMeters(lat1, lon1, lat2, lon2) {
  const route = await getRoadRoute(lat1, lon1, lat2, lon2);
  return route ? route.distanceMeters : null;
}

module.exports = { getRoadRoute, getRoadDistanceMeters };
