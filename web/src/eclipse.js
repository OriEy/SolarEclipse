// Real-world (globe) eclipse geometry, computed from the astronomy-engine ephemeris.
// Everything here describes what actually happens; the flat-earth model in flat.js
// only consumes the resulting ground track and subsolar points.

import * as Astronomy from 'astronomy-engine';

export const KM_PER_AU = Astronomy.KM_PER_AU;
const EARTH_EQ_RADIUS_KM = 6378.1366;
const EARTH_FLATTENING = 1 / 298.25642;
const MOON_RADIUS_KM = 1737.4;
const SUN_RADIUS_KM = 695700;
const RAD2DEG = 180 / Math.PI;

/** Geocentric equator-of-date vectors (km) of Sun and Moon. */
function sunMoonOfDate(time) {
  const rot = Astronomy.Rotation_EQJ_EQD(time);
  const sun = Astronomy.RotateVector(rot, Astronomy.GeoVector(Astronomy.Body.Sun, time, true));
  const moon = Astronomy.RotateVector(rot, Astronomy.GeoMoon(time));
  const km = (v) => ({ x: v.x * KM_PER_AU, y: v.y * KM_PER_AU, z: v.z * KM_PER_AU });
  return { sun: km(sun), moon: km(moon) };
}

function toGeo(v, time) {
  const vec = new Astronomy.Vector(v.x / KM_PER_AU, v.y / KM_PER_AU, v.z / KM_PER_AU, time);
  const obs = Astronomy.VectorObserver(vec, true);
  return { lat: obs.latitude, lon: obs.longitude };
}

/**
 * Earth-fixed (ECEF-like, km) positions of Sun and Moon: x towards 0°E, z towards the North Pole.
 * Used to work out how much of the Sun the Moon covers from any point on the globe.
 */
export function earthFixedSunMoon(date) {
  const time = Astronomy.MakeTime(date);
  const { sun, moon } = sunMoonOfDate(time);
  const gast = Astronomy.SiderealTime(time) * 15 / RAD2DEG;
  const c = Math.cos(gast), s = Math.sin(gast);
  const rot = (v) => ({ x: v.x * c + v.y * s, y: -v.x * s + v.y * c, z: v.z });
  return { sun: rot(sun), moon: rot(moon), sunRadiusKm: SUN_RADIUS_KM, moonRadiusKm: MOON_RADIUS_KM };
}

/**
 * The point on Earth directly below the Sun: geodetic latitude = declination,
 * longitude = right ascension - Greenwich apparent sidereal time.
 */
export function subsolarPoint(date) {
  const time = Astronomy.MakeTime(date);
  const { sun } = sunMoonOfDate(time);
  const ra = Math.atan2(sun.y, sun.x) * RAD2DEG;
  const lat = Math.atan2(sun.z, Math.hypot(sun.x, sun.y)) * RAD2DEG;
  const lon = ((((ra - 15 * Astronomy.SiderealTime(time)) % 360) + 540) % 360) - 180;
  return { lat, lon };
}

/**
 * Where the shadow axis (Sun centre -> Moon centre, continued) hits the Earth ellipsoid,
 * or null if it misses. Also returns the umbra radius perpendicular to the axis
 * (negative = antumbra, i.e. annular), the penumbra radius, and the real Sun altitude there.
 */
export function shadowCenter(date) {
  const time = Astronomy.MakeTime(date);
  const { sun, moon } = sunMoonOfDate(time);
  let dx = moon.x - sun.x, dy = moon.y - sun.y, dz = moon.z - sun.z;
  const dSunMoon = Math.hypot(dx, dy, dz);
  dx /= dSunMoon; dy /= dSunMoon; dz /= dSunMoon;

  // Squash z so the ellipsoid becomes a sphere, then solve |M + s*d| = Re.
  const k = 1 / (1 - EARTH_FLATTENING);
  const mx = moon.x, my = moon.y, mz = moon.z * k;
  const ex = dx, ey = dy, ez = dz * k;
  const a = ex * ex + ey * ey + ez * ez;
  const b = 2 * (mx * ex + my * ey + mz * ez);
  const c = mx * mx + my * my + mz * mz - EARTH_EQ_RADIUS_KM ** 2;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = (-b - Math.sqrt(disc)) / (2 * a); // first (near-side) intersection
  if (s < 0) return null;

  const p = { x: moon.x + s * dx, y: moon.y + s * dy, z: moon.z + s * dz };
  const geo = toGeo(p, time);

  // Umbral cone: radius shrinks linearly behind the Moon. Penumbral cone: grows linearly.
  // Both are measured perpendicular to the shadow axis.
  const umbraRadiusKm = MOON_RADIUS_KM - s * (SUN_RADIUS_KM - MOON_RADIUS_KM) / dSunMoon;
  const penumbraRadiusKm = MOON_RADIUS_KM + s * (SUN_RADIUS_KM + MOON_RADIUS_KM) / dSunMoon;

  const observer = new Astronomy.Observer(geo.lat, geo.lon, 0);
  const eq = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
  const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, null);

  return { lat: geo.lat, lon: geo.lon, umbraRadiusKm, penumbraRadiusKm, sunAltitudeDeg: hor.altitude };
}

/** Lists central (total / annular / hybrid) solar eclipses starting at the given date. */
export function listCentralEclipses(fromDate, count) {
  const result = [];
  let e = Astronomy.SearchGlobalSolarEclipse(Astronomy.MakeTime(fromDate));
  while (result.length < count) {
    if (e.kind !== Astronomy.EclipseKind.Partial) {
      result.push({ kind: e.kind, peak: e.peak.date, lat: e.latitude, lon: e.longitude });
    }
    e = Astronomy.NextGlobalSolarEclipse(e.peak);
  }
  return result;
}

/**
 * Samples the central line of the eclipse whose greatest eclipse is at `peak`,
 * from the moment the shadow axis first touches the Earth until it leaves.
 */
export function centralTrack(peak, stepSeconds = 60) {
  const peakMs = peak.getTime();
  const stepMs = stepSeconds * 1000;
  const at = (ms) => {
    const date = new Date(ms);
    const c = shadowCenter(date);
    return c && { date, ...c };
  };
  // Refine the edge between a hit (inside) and a miss (outside) to 1 s.
  const edge = (inside, outside) => {
    while (Math.abs(outside - inside) > 1000) {
      const mid = (inside + outside) / 2;
      if (shadowCenter(new Date(mid))) inside = mid; else outside = mid;
    }
    return inside;
  };

  const before = [];
  let t = peakMs - stepMs;
  while (shadowCenter(new Date(t))) t -= stepMs;
  const startMs = edge(t + stepMs, t);
  let t2 = peakMs + stepMs;
  while (shadowCenter(new Date(t2))) t2 += stepMs;
  const endMs = edge(t2 - stepMs, t2);

  const samples = [at(startMs)];
  for (let ms = Math.ceil(startMs / stepMs) * stepMs; ms < endMs; ms += stepMs) {
    if (ms > startMs) samples.push(at(ms));
  }
  samples.push(at(endMs));
  return { start: new Date(startMs), end: new Date(endMs), samples };
}
