// Paints the flat-earth disc (land, graticule, rim) onto a canvas used as the ground texture.

import { feature } from 'topojson-client';
import land110m from 'world-atlas/land-110m.json';
import { project, DISC_RADIUS } from './flat.js';

export function drawMap(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Matches the UVs of a CircleGeometry rotated flat: canvas x ~ scene x, canvas y ~ scene z.
  const toPx = (lat, lon) => {
    const p = project(lat, lon);
    return [((p.x / DISC_RADIUS + 1) / 2) * size, ((p.z / DISC_RADIUS + 1) / 2) * size];
  };
  const c = size / 2;

  ctx.fillStyle = '#163a5c';
  ctx.beginPath();
  ctx.arc(c, c, c, 0, 2 * Math.PI);
  ctx.fill();

  // Land. Antarctica is a ring that winds once around the South Pole; on the disc the pole
  // is the outer rim, so the rim is added as a second contour and even-odd filling leaves
  // the familiar ice ring around the edge.
  ctx.fillStyle = '#5f7f4a';
  ctx.strokeStyle = '#2d3f22';
  ctx.lineWidth = size / 2048;
  const land = feature(land110m, land110m.objects.land);
  for (const polygon of land.features[0].geometry.coordinates) {
    ctx.beginPath();
    for (const ring of polygon) {
      ring.forEach(([lon, lat], i) => (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, ...toPx(lat, lon)));
      ctx.closePath();
    }
    ctx.stroke();
    if (polygon.some(windsAroundPole)) {
      ctx.moveTo(size, c);
      ctx.arc(c, c, c, 0, 2 * Math.PI);
    }
    ctx.fill('evenodd');
  }

  // Graticule: parallels every 15 deg (equator and tropics emphasised), meridians every 15 deg.
  ctx.lineWidth = size / 1400;
  for (let lat = 75; lat > -90; lat -= 15) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    circle(lat);
  }
  ctx.lineWidth = size / 900;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  circle(0);
  ctx.setLineDash([size / 200, size / 300]);
  ctx.strokeStyle = 'rgba(255,220,120,0.4)';
  circle(23.44);
  circle(-23.44);
  ctx.setLineDash([]);
  ctx.lineWidth = size / 1400;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  for (let lon = -180; lon < 180; lon += 15) {
    ctx.beginPath();
    ctx.moveTo(...toPx(90, lon));
    ctx.lineTo(...toPx(-90, lon));
    ctx.stroke();
  }

  // The "ice wall" rim.
  ctx.lineWidth = size / 150;
  ctx.strokeStyle = '#e8eef2';
  ctx.beginPath();
  ctx.arc(c, c, c - ctx.lineWidth / 2, 0, 2 * Math.PI);
  ctx.stroke();

  return canvas;

  function windsAroundPole(ring) {
    let turn = 0;
    for (let i = 1; i < ring.length; i++) {
      let d = ring[i][0] - ring[i - 1][0];
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      turn += d;
    }
    return Math.abs(turn) > 180;
  }

  function circle(lat) {
    const r = ((90 - lat) / 180) * c;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, 2 * Math.PI);
    ctx.stroke();
  }
}
