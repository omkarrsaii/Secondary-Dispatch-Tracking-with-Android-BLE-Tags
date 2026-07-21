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

/**
 * Parses the free-text "last seen" string scraped from the BLE tag portal
 * (e.g. "Last seen 5 hours ago", "Last seen at 12:36 PM.",
 * "Last seen at 12:44 PM on Jul 16, 2026", "Not seen in 7 days", "just now")
 * into minutes elapsed since that moment, relative to `referenceDate`.
 *
 * There's no separate raw timestamp column for this — last_seen_text is the
 * only source — so this is the single place that turns it into a number,
 * reused everywhere "seen within the last hour" needs to be decided instead
 * of re-parsing the string ad hoc.
 *
 * Returns null when the text is missing or in a format this doesn't
 * recognize — callers should treat null as "unknown", not "recent".
 */
function getMinutesSinceLastSeen(text, referenceDate) {
  if (!text) return null;
  const now = referenceDate instanceof Date ? referenceDate : new Date();
  const str = String(text).trim();

  // "X second(s)/minute(s)/hour(s)/day(s) ago"  and  "Not seen in X day(s)"
  const relMatch = str.match(/(\d+)\s*(second|minute|hour|day)s?\s*ago/i)
                 || str.match(/not seen in\s*(\d+)\s*(second|minute|hour|day)s?/i);
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const perMinute = { second: 1 / 60, minute: 1, hour: 60, day: 1440 };
    return n * (perMinute[relMatch[2].toLowerCase()] || 0);
  }

  if (/just now/i.test(str)) return 0;

  // "Last seen at H:MM AM/PM" with an optional ", on <date>" suffix — no
  // date means "today", so a parsed time later than now must mean yesterday.
  const atMatch = str.match(/last seen at\s+(\d{1,2}):(\d{2})\s*([AP]M)(?:\s+on\s+(.+))?\.?$/i);
  if (atMatch) {
    const [, hh, mm, ampm, datePart] = atMatch;
    let hours = parseInt(hh, 10);
    const minutes = parseInt(mm, 10);
    if (/PM/i.test(ampm) && hours !== 12) hours += 12;
    if (/AM/i.test(ampm) && hours === 12) hours = 0;

    const baseDate = datePart ? new Date(datePart.trim()) : now;
    if (isNaN(baseDate.getTime())) return null;

    const seenDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes, 0, 0);
    if (!datePart && seenDate.getTime() > now.getTime()) {
      seenDate.setDate(seenDate.getDate() - 1); // "today's" time hasn't happened yet — must be yesterday
    }
    return (now.getTime() - seenDate.getTime()) / 60000;
  }

  return null;
}

module.exports = { getDistanceInKm, formatDeviceLocation, getMinutesSinceLastSeen };
