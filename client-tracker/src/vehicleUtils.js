// ─── Hub reference coordinates (configurable) ──────────────────────────────
export const HUB_LAT = 17.608504
export const HUB_LON = 78.528605

/**
 * Calculate the great-circle distance between two coordinates using the
 * Haversine formula.
 *
 * @param {number} lat1 - Origin latitude in degrees
 * @param {number} lon1 - Origin longitude in degrees
 * @param {number} lat2 - Destination latitude in degrees
 * @param {number} lon2 - Destination longitude in degrees
 * @returns {number} Distance in kilometres
 */
export function getDistanceInKm(lat1, lon1, lat2, lon2) {
  const R = 6371 // Earth's mean radius in km
  const toRad = (deg) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Derive vehicle status and hub distance from coordinates.
 *
 * Rules:
 *   distance ≤ 1 km  →  "Vehicle is inactive"   (gray / orange badge)
 *   distance >  1 km  →  "Vehicle is out for delivery"  (green badge)
 *
 * @param {number|string|null} vehicleLat
 * @param {number|string|null} vehicleLon
 * @param {number} [hubLat=HUB_LAT]
 * @param {number} [hubLon=HUB_LON]
 * @returns {{ status: string|null, distance: number|null, isActive: boolean|null }}
 */
export function getVehicleStatus(
  vehicleLat,
  vehicleLon,
  hubLat = HUB_LAT,
  hubLon = HUB_LON
) {
  const lat = parseFloat(vehicleLat)
  const lon = parseFloat(vehicleLon)

  if (isNaN(lat) || isNaN(lon)) {
    return { status: null, distance: null, isActive: null }
  }

  const distance = getDistanceInKm(lat, lon, hubLat, hubLon)
  const isActive = distance > 1

  return {
    status: isActive ? 'Vehicle is out for delivery' : 'Vehicle is inactive',
    distance,
    isActive,
  }
}
