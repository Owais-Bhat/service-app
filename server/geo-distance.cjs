// Pure great-circle distance calculation used to enforce the attendance
// clock-in geofence. No DB/Express dependency — stays directly unit-testable
// (mirrors server/cache-expiry.cjs and server/job-card-scoring.cjs).

const EARTH_RADIUS_M = 6371000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle (Haversine) distance between two lat/lng points, in meters.
 */
function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

module.exports = { haversineDistanceMeters };
