import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { listCentralEclipses, centralTrack, shadowCenter, subsolarPoint } from './eclipse.js';
import {
  DISC_RADIUS,
  KM_PER_UNIT,
  project,
  sunPosition,
  objectPosition,
  distanceKm,
  sunElevationDeg,
  requiredObjectDiameterKm,
} from './flat.js';
import { drawMap } from './map.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;

const COLORS = {
  sun: 0xffd34d,
  object: 0xb98cff,
  track: 0xff5a4f,
  ray: 0xffe9a8,
  sunPath: 0xffc23d,
};

// ---------------------------------------------------------------------------------------
// State

const state = {
  sunHeightKm: 5000,
  objectHeightKm: 3000,
  sunDiameterKm: 51,
  intervalMin: 60,
  speed: 10, // simulated minutes per real second
  playing: false,
  timeMs: 0,
  showDayNight: true,
  showRays: true,
  showSunCircle: true,
  showLabels: true,
  eclipse: null, // { kind, peak, start, end, samples[], markers[] }
};

// ---------------------------------------------------------------------------------------
// Renderer, scene, camera

const container = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'labels';
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxDistance = 400;

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sunLight = new THREE.PointLight(0xfff2cc, 2.2, 0, 0);
scene.add(sunLight);

scene.add(makeStars());

// The disc: map texture, optionally darkened where it is really night on the globe.
const mapTexture = new THREE.CanvasTexture(drawMap(4096));
mapTexture.colorSpace = THREE.SRGBColorSpace;
mapTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
const discUniforms = {
  map: { value: mapTexture },
  subsolar: { value: new THREE.Vector3(1, 0, 0) },
  dayNight: { value: 1 },
  discRadius: { value: DISC_RADIUS },
};
const disc = new THREE.Mesh(
  new THREE.CircleGeometry(DISC_RADIUS, 256).rotateX(-Math.PI / 2),
  new THREE.ShaderMaterial({
    uniforms: discUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 subsolar;
      uniform float dayNight;
      uniform float discRadius;
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vec4 c = texture2D(map, vUv);
        float colat = length(vPos.xz) / discRadius * 3.14159265;
        float lon = atan(-vPos.z, vPos.x) + 1.57079633;
        vec3 n = vec3(sin(colat) * cos(lon), sin(colat) * sin(lon), cos(colat));
        float day = smoothstep(-0.06, 0.06, dot(n, subsolar));
        gl_FragColor = vec4(c.rgb * mix(1.0, mix(0.3, 1.0, day), dayNight), 1.0);
        #include <colorspace_fragment>
      }`,
  }),
);
scene.add(disc);

const discEdge = new THREE.Mesh(
  new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS * 0.985, 0.6, 256, 1, true),
  new THREE.MeshLambertMaterial({ color: 0x3b3128, side: THREE.DoubleSide }),
);
discEdge.position.y = -0.3;
scene.add(discEdge);

// Live objects: the Sun, the occulting object, the ray between them and the shadow spot.
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 32, 16),
  new THREE.MeshBasicMaterial({ color: COLORS.sun }),
);
sunMesh.add(makeGlow(2.2));
scene.add(sunMesh);
const sunLabel = makeLabel('', 'label sun-label');
sunMesh.add(sunLabel);

const objectMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.16, 32, 16),
  new THREE.MeshLambertMaterial({ color: 0x4b3a66, emissive: 0x1a1030 }),
);
scene.add(objectMesh);
const objectLabel = makeLabel('object', 'label object-label');
objectMesh.add(objectLabel);

const liveRay = makeLine([new THREE.Vector3(), new THREE.Vector3()], COLORS.ray, 0.9);
scene.add(liveRay);
const liveDrop = makeLine([new THREE.Vector3(), new THREE.Vector3()], COLORS.object, 0.35, true);
scene.add(liveDrop);

const shadowSpot = new THREE.Mesh(
  new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85 }),
);
shadowSpot.position.y = 0.012;
scene.add(shadowSpot);
const shadowRing = new THREE.Mesh(
  new THREE.RingGeometry(0.3, 0.36, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: COLORS.track, transparent: true, opacity: 0.9 }),
);
shadowRing.position.y = 0.014;
scene.add(shadowRing);

// Rebuilt whenever the eclipse or a parameter changes.
const pathsGroup = new THREE.Group();
scene.add(pathsGroup);

// ---------------------------------------------------------------------------------------
// Eclipse selection

const eclipses = listCentralEclipses(new Date('2015-01-01T00:00:00Z'), 30);
const select = $('eclipse');
eclipses.forEach((e, i) => {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = `${e.peak.toISOString().slice(0, 10)} · ${e.kind} · ${fmtLat(e.lat)} ${fmtLon(e.lon)}`;
  select.appendChild(opt);
});
const defaultIndex = eclipses.findIndex((e) => e.peak.toISOString().startsWith('2026-08-12'));
select.value = String(Math.max(defaultIndex, 0));

function loadEclipse(index) {
  const e = eclipses[index];
  const track = centralTrack(e.peak, 60);
  const withSun = (s) => ({ ...s, subsolar: subsolarPoint(s.date) });
  state.eclipse = {
    ...e,
    start: track.start,
    end: track.end,
    samples: track.samples.map(withSun),
  };
  state.timeMs = e.peak.getTime();
  rebuildMarkers();
  $('eclipseSummary').textContent =
    `Umbra on Earth ${fmtTime(track.start)} – ${fmtTime(track.end)} UTC ` +
    `(${Math.round((track.end - track.start) / 60000)} min), greatest eclipse ${fmtTime(e.peak)} UTC.`;
  $('time').min = String(track.start.getTime());
  $('time').max = String(track.end.getTime());
  rebuildPaths();
  frameEclipse();
}

function rebuildMarkers() {
  const e = state.eclipse;
  const step = state.intervalMin * 60000;
  const times = [{ ms: e.start.getTime(), kind: 'start' }];
  for (let ms = Math.ceil(e.start.getTime() / step) * step; ms < e.end.getTime(); ms += step) {
    if (ms - e.start.getTime() > 60000) times.push({ ms, kind: 'step' });
  }
  times.push({ ms: e.end.getTime(), kind: 'end' });
  e.markers = times.map(({ ms, kind }) => {
    const date = new Date(ms);
    // The edges of the track graze the Earth's limb; nudge inward so the axis still hits.
    const c = shadowCenter(date) ?? shadowCenter(new Date(ms + (kind === 'start' ? 1000 : -1000)));
    return { date, kind, ...c, subsolar: subsolarPoint(date) };
  });
}

// ---------------------------------------------------------------------------------------
// Geometry derived from the current parameters

/** Flat-earth positions for one globe sample (track point + subsolar point). */
function flatGeometry(s) {
  const ground = project(s.lat, s.lon);
  const sun = sunPosition(s.subsolar, state.sunHeightKm);
  const object = objectPosition(sun, ground, state.objectHeightKm, state.sunHeightKm);
  return { ground, sun, object };
}

function objectSpeedKmh(date) {
  const at = (ms) => {
    const c = shadowCenter(new Date(ms));
    return c && flatGeometry({ ...c, subsolar: subsolarPoint(new Date(ms)) }).object;
  };
  // Central difference over one minute, one-sided at the very ends of the track.
  const t = date.getTime();
  let a = at(t - 30000), b = at(t + 30000), seconds = 60;
  if (!a) [a, seconds] = [at(t), seconds - 30];
  if (!b) [b, seconds] = [at(t), seconds - 30];
  return a && b && seconds > 0 ? distanceKm(a, b) / (seconds / 3600) : NaN;
}

function rebuildPaths() {
  disposeGroup(pathsGroup);
  const e = state.eclipse;
  const geo = e.samples.map(flatGeometry);

  // Umbra track on the ground, the object's path through the air, and the Sun's path meanwhile.
  pathsGroup.add(makeLine(geo.map((g) => v3(g.ground, 0.02)), COLORS.track, 1));
  pathsGroup.add(makeLine(geo.map((g) => v3(g.object)), COLORS.object, 1));
  pathsGroup.add(makeLine(geo.map((g) => v3(g.sun)), COLORS.sunPath, 1));

  if (state.showSunCircle) {
    // The Sun's full daily circle around the time of greatest eclipse.
    const pts = [];
    for (let m = -12 * 60; m <= 12 * 60; m += 10) {
      const p = sunPosition(subsolarPoint(new Date(e.peak.getTime() + m * 60000)), state.sunHeightKm);
      pts.push(v3(p));
    }
    pathsGroup.add(makeLine(pts, COLORS.sunPath, 0.25, true));
  }

  for (const m of e.markers) {
    const g = flatGeometry(m);
    const edge = m.kind !== 'step';
    const marker = new THREE.Group();

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(edge ? 0.1 : 0.14, 24, 12),
      new THREE.MeshBasicMaterial({ color: COLORS.sun, transparent: true, opacity: edge ? 0.5 : 0.8 }),
    );
    sun.position.copy(v3(g.sun));
    marker.add(sun);

    const obj = new THREE.Mesh(
      new THREE.SphereGeometry(edge ? 0.08 : 0.11, 24, 12),
      new THREE.MeshLambertMaterial({ color: COLORS.object, transparent: true, opacity: edge ? 0.5 : 0.85 }),
    );
    obj.position.copy(v3(g.object));
    marker.add(obj);

    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.09, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COLORS.track }),
    );
    dot.position.copy(v3(g.ground, 0.025));
    marker.add(dot);

    if (state.showRays) {
      // Every point of this line is a possible position for the object at this moment.
      marker.add(makeLine([v3(g.sun), v3(g.ground, 0.02)], COLORS.ray, edge ? 0.25 : 0.45, true));
      marker.add(makeLine([v3(g.object), v3({ ...g.object, y: 0 }, 0.02)], COLORS.object, 0.25, true));
    }

    if (state.showLabels) {
      const text = m.kind === 'step' ? fmtTime(m.date, true) : `${m.kind} ${fmtTime(m.date, true)}`;
      const label = makeLabel(text, 'label marker-label');
      label.position.set(0, 0.25, 0);
      sun.add(label);
    }
    pathsGroup.add(marker);
  }

  updateTable();
}

// ---------------------------------------------------------------------------------------
// Per-frame update

function updateLive() {
  const e = state.eclipse;
  const date = new Date(state.timeMs);
  const subsolar = subsolarPoint(date);
  const c = shadowCenter(date);

  const sun = sunPosition(subsolar, state.sunHeightKm);
  sunMesh.position.copy(v3(sun));
  sunLight.position.copy(sunMesh.position);
  sunLabel.element.textContent = `${fmtTime(date, true)} UTC`;
  sunLabel.position.set(0, 0.45, 0);

  const lat = subsolar.lat * DEG, lon = subsolar.lon * DEG;
  discUniforms.subsolar.value.set(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
  discUniforms.dayNight.value = state.showDayNight ? 1 : 0;

  const visible = !!c;
  for (const o of [objectMesh, liveRay, liveDrop, shadowSpot, shadowRing]) o.visible = visible;
  if (!c) return;

  const g = flatGeometry({ ...c, subsolar });
  objectMesh.position.copy(v3(g.object));
  setLine(liveRay, [v3(g.sun), v3(g.ground, 0.02)]);
  setLine(liveDrop, [v3(g.object), v3({ ...g.object, y: 0 }, 0.02)]);
  const r = Math.max(Math.abs(c.umbraRadiusKm), 1) / KM_PER_UNIT;
  shadowSpot.scale.setScalar(r);
  shadowSpot.position.set(g.ground.x, 0.012, g.ground.z);
  shadowRing.position.set(g.ground.x, 0.014, g.ground.z);
  objectLabel.position.set(0, -0.32, 0);

  const umbraKm = 2 * c.umbraRadiusKm;
  const diameter = requiredObjectDiameterKm(umbraKm, state.sunDiameterKm, state.objectHeightKm, state.sunHeightKm);
  setReadout({
    rTime: `${date.toISOString().slice(0, 10)} ${fmtTime(date, true)} UTC`,
    rShadow: `${fmtLat(c.lat)} ${fmtLon(c.lon)}`,
    rUmbra: `${umbraKm < 0 ? 'antumbra ' : ''}${Math.abs(umbraKm).toFixed(0)} km`,
    rRealAlt: `${c.sunAltitudeDeg.toFixed(1)}°`,
    rFlatAlt: `${sunElevationDeg(g.sun, g.ground).toFixed(1)}°`,
    rSunDist: `${fmtKm(distanceKm(g.sun, g.ground))}`,
    rObjPos: `${fmtKm(Math.hypot(g.object.x, g.object.z) * KM_PER_UNIT)} from pole, ${fmtKm(state.objectHeightKm)} up`,
    rObjSpeed: `${fmtKm(objectSpeedKmh(date))}/h`,
    rObjDiam: `${fmtKm(diameter)}`,
  });
  $('time').value = String(state.timeMs);
  $('timeText').textContent = `${fmtTime(date, true)} UTC`;
}

function updateTable() {
  const rows = state.eclipse.markers.map((m) => {
    const g = flatGeometry(m);
    const umbraKm = 2 * m.umbraRadiusKm;
    const d = requiredObjectDiameterKm(umbraKm, state.sunDiameterKm, state.objectHeightKm, state.sunHeightKm);
    return `<tr class="${m.kind}" data-ms="${m.date.getTime()}">
      <td>${fmtTime(m.date)}</td>
      <td>${fmtLat(m.lat)}<br>${fmtLon(m.lon)}</td>
      <td>${m.sunAltitudeDeg.toFixed(0)}° / ${sunElevationDeg(g.sun, g.ground).toFixed(0)}°</td>
      <td>${fmtKm(Math.hypot(g.object.x, g.object.z) * KM_PER_UNIT)}</td>
      <td>${fmtKm(objectSpeedKmh(m.date))}/h</td>
      <td>${fmtKm(d)}</td>
    </tr>`;
  });
  $('markerRows').innerHTML = rows.join('');
}

// ---------------------------------------------------------------------------------------
// Camera framing

function frameEclipse() {
  const geo = state.eclipse.samples.map(flatGeometry);
  const box = new THREE.Box3();
  for (const g of geo) box.expandByPoint(v3(g.ground)).expandByPoint(v3(g.sun));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const outward = new THREE.Vector3(center.x, 0, center.z);
  if (outward.lengthSq() < 1e-6) outward.set(0, 0, 1);
  outward.normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(outward, size * 1.1).add(new THREE.Vector3(0, size * 0.6, 0));
  controls.update();
}

function frameOverview() {
  controls.target.set(0, state.sunHeightKm / KM_PER_UNIT / 3, 0);
  camera.position.set(0, DISC_RADIUS * 0.95, DISC_RADIUS * 1.45);
  controls.update();
}

function frameTop() {
  controls.target.set(0, 0, 0);
  camera.position.set(0, DISC_RADIUS * 3.2, 0.001);
  controls.update();
}

// ---------------------------------------------------------------------------------------
// UI wiring

function bindRange(id, key, fmt, onChange) {
  const input = $(id);
  const out = $(`${id}Out`);
  const apply = () => {
    state[key] = Number(input.value);
    if (out) out.textContent = fmt(state[key]);
    onChange?.();
  };
  input.value = String(state[key]);
  input.addEventListener('input', apply);
  if (out) out.textContent = fmt(state[key]);
  return input;
}

const objectInput = $('objectHeight');
function clampObjectHeight() {
  objectInput.max = String(state.sunHeightKm - 10);
  if (state.objectHeightKm > state.sunHeightKm - 10) {
    state.objectHeightKm = state.sunHeightKm - 10;
    objectInput.value = String(state.objectHeightKm);
    $('objectHeightOut').textContent = fmtKm(state.objectHeightKm);
  }
}

bindRange('sunHeight', 'sunHeightKm', fmtKm, () => {
  clampObjectHeight();
  rebuildPaths();
});
clampObjectHeight();
bindRange('objectHeight', 'objectHeightKm', fmtKm, rebuildPaths);
bindRange('sunDiameter', 'sunDiameterKm', fmtKm, updateTable);
bindRange('speed', 'speed', (v) => `${v} min/s`);

$('interval').value = String(state.intervalMin);
$('interval').addEventListener('change', () => {
  state.intervalMin = Number($('interval').value);
  rebuildMarkers();
  rebuildPaths();
});

for (const [id, key] of [
  ['showDayNight', 'showDayNight'],
  ['showRays', 'showRays'],
  ['showSunCircle', 'showSunCircle'],
  ['showLabels', 'showLabels'],
]) {
  $(id).checked = state[key];
  $(id).addEventListener('change', () => {
    state[key] = $(id).checked;
    if (key === 'showLabels') {
      sunLabel.visible = objectLabel.visible = state.showLabels;
    }
    rebuildPaths();
  });
}

select.addEventListener('change', () => loadEclipse(Number(select.value)));

$('time').addEventListener('input', () => {
  state.timeMs = Number($('time').value);
});

$('play').addEventListener('click', () => {
  state.playing = !state.playing;
  if (state.playing && state.timeMs >= state.eclipse.end.getTime()) state.timeMs = state.eclipse.start.getTime();
  $('play').textContent = state.playing ? 'Pause' : 'Play';
});

$('viewEclipse').addEventListener('click', frameEclipse);
$('viewOverview').addEventListener('click', frameOverview);
$('viewTop').addEventListener('click', frameTop);
$('togglePanel').addEventListener('click', () => document.body.classList.toggle('panel-collapsed'));

$('markerRows').addEventListener('click', (ev) => {
  const row = ev.target.closest('tr[data-ms]');
  if (row) state.timeMs = Number(row.dataset.ms);
});

// ---------------------------------------------------------------------------------------
// Main loop

function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (state.playing) {
    state.timeMs += dt * state.speed * 60000;
    if (state.timeMs > state.eclipse.end.getTime()) state.timeMs = state.eclipse.start.getTime();
  }
  updateLive();
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

loadEclipse(Number(select.value));
resize();

// ---------------------------------------------------------------------------------------
// Helpers

function v3(p, y) {
  return new THREE.Vector3(p.x, y ?? p.y, p.z);
}

function makeLine(points, color, opacity, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.15, gapSize: 0.1 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

function setLine(line, points) {
  line.geometry.setFromPoints(points);
  line.geometry.attributes.position.needsUpdate = true;
  if (line.material.isLineDashedMaterial) line.computeLineDistances();
  line.geometry.computeBoundingSphere();
}

function makeLabel(text, className) {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return new CSS2DObject(div);
}

function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
    if (o.isCSS2DObject) o.element.remove();
  });
  group.clear();
}

function makeGlow(scale) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,230,140,0.9)');
  grad.addColorStop(0.25, 'rgba(255,200,80,0.35)');
  grad.addColorStop(1, 'rgba(255,170,40,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  sprite.scale.setScalar(scale);
  return sprite;
}

function makeStars() {
  const pts = [];
  for (let i = 0; i < 2500; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(900 + Math.random() * 300);
    pts.push(v);
  }
  return new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.7 }),
  );
}

function setReadout(values) {
  for (const [id, text] of Object.entries(values)) $(id).textContent = text;
}

function fmtTime(date, seconds = false) {
  return date.toISOString().slice(11, seconds ? 19 : 16);
}

function fmtLat(lat) {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;
}

function fmtLon(lon) {
  return `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
}

function fmtKm(km) {
  if (!Number.isFinite(km)) return '–';
  return `${Math.round(km).toLocaleString('en-US')} km`;
}
