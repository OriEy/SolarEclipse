// The flat-earth model: an azimuthal-equidistant disc with the North Pole in the centre
// (the "Gleason map"), and a small local Sun circling above it at a fixed height.
//
// Scene coordinates: y is up, the disc lies in the x/z plane, 1 unit = 1000 km.
// Seen from above, longitude increases counter-clockwise and Greenwich points to +z.

export const KM_PER_UNIT = 1000;
/** Pole-to-south-rim distance: half the Earth's meridian circumference. */
export const DISC_RADIUS_KM = Math.PI * 6371.0;
export const DISC_RADIUS = DISC_RADIUS_KM / KM_PER_UNIT;

const DEG = Math.PI / 180;

/** Ground position (scene units) of a latitude/longitude on the disc. */
export function project(lat, lon) {
  const r = ((90 - lat) / 180) * DISC_RADIUS;
  const theta = (lon - 90) * DEG;
  return { x: r * Math.cos(theta), y: 0, z: -r * Math.sin(theta) };
}

/** The flat-earth Sun: straight above the real subsolar point. */
export function sunPosition(subsolar, sunHeightKm) {
  const p = project(subsolar.lat, subsolar.lon);
  p.y = sunHeightKm / KM_PER_UNIT;
  return p;
}

/**
 * The shadow-casting object must sit somewhere on the straight line from the Sun to the
 * umbra on the ground. Picking its height fixes the point: it is the fraction
 * objectHeight / sunHeight of the way from the ground up to the Sun.
 */
export function objectPosition(sun, ground, objectHeightKm, sunHeightKm) {
  const f = objectHeightKm / sunHeightKm;
  return {
    x: ground.x + (sun.x - ground.x) * f,
    y: ground.y + (sun.y - ground.y) * f,
    z: ground.z + (sun.z - ground.z) * f,
  };
}

export function distanceKm(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * KM_PER_UNIT;
}

/** Elevation angle (deg) of the flat-earth Sun as seen from a ground point. */
export function sunElevationDeg(sun, ground) {
  const horizontal = Math.hypot(sun.x - ground.x, sun.z - ground.z);
  return Math.atan2(sun.y - ground.y, horizontal) / DEG;
}

/**
 * Object diameter needed for its umbra to be `umbraDiameterKm` wide on the ground
 * (negative = antumbra of an annular eclipse). By similar triangles along the
 * Sun-object-ground line, whose lengths scale with height:
 *   umbra = d - (sunDiameter - d) * objectHeight / (sunHeight - objectHeight)
 */
export function requiredObjectDiameterKm(umbraDiameterKm, sunDiameterKm, objectHeightKm, sunHeightKm) {
  return (umbraDiameterKm * (sunHeightKm - objectHeightKm) + sunDiameterKm * objectHeightKm) / sunHeightKm;
}

/**
 * Solves object height and diameter from both shadow sizes. With k = objectHeight /
 * (sunHeight - objectHeight), the ratio of the object's distance to the ground and to the Sun:
 *   umbra    = d - (sunDiameter - d) * k
 *   penumbra = d + (sunDiameter + d) * k
 * Subtracting gives k, adding gives d. The umbra is signed (negative = antumbra).
 */
export function solveObject(umbraDiameterKm, penumbraDiameterKm, sunDiameterKm, sunHeightKm) {
  const k = (penumbraDiameterKm - umbraDiameterKm) / (2 * sunDiameterKm);
  return {
    heightKm: (sunHeightKm * k) / (1 + k),
    diameterKm: (penumbraDiameterKm + umbraDiameterKm) / (2 * (1 + k)),
  };
}
