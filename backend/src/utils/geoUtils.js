/**
 * utils/geoUtils.js
 * Haversine distance helper — shared by route and dashboard modules.
 */

function getDistanceInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Single source of truth for "what do we call this vehicle's current
 * location" — used by BOTH the Distributor Portal's Active Invoices list
 * (distributorPortalService.js) and the invoice tracking detail page
 * (routes/invoice.js), so the two can never show two different strings
 * for the same vehicle. Prefers the granular locality/area (e.g.
 * "Dundigal") over the city, with state appended for context — e.g.
 * "Dundigal, Telangana" — since a bare city name is too coarse to be
 * useful for "where is my delivery right now".
 */
function formatDeviceLocation(device) {
  if (!device) return null;
  const primary = device.locality || device.city || null;
  if (!primary) return null;
  return [primary, device.state].filter(Boolean).join(', ');
}

module.exports = { getDistanceInKm, formatDeviceLocation };
