# Flat Earth Eclipse

A 3D simulation of how a real solar eclipse would have to work on a flat earth.

- The ground is the azimuthal-equidistant "flat earth" map: North Pole in the centre,
  the South Pole stretched into the outer rim (radius π · 6371 km ≈ 20,015 km).
- The Sun is a small local sun circling above the disc at a fixed height (configurable at runtime),
  always directly above the real subsolar point.
- The umbra track is real: the central line of the eclipse is computed from the
  [astronomy-engine](https://github.com/cosinekitty/astronomy) ephemeris (Sun–Moon shadow axis
  intersected with the WGS84 ellipsoid). For 8 April 2024 (selectable in the eclipse list; the page opens on 12 August 2026) it gives greatest eclipse at
  25.3°N 104.1°W, 18:17 UT, Sun altitude 69.8°, matching NASA's published values.
- From the real umbra position and the flat-earth Sun, the shadow-casting object must lie on the
  straight line between them. The shadow alone cannot tell *where* on that line, so the object's
  height is a parameter. Its required diameter follows from similar triangles:
  `d = (umbra · (H − h) + sunDiameter · h) / H` for sun height `H` and object height `h`.
- Eclipses from 1990 to 2038 can be chosen, e.g. the 11 August 1999 total eclipse over Europe.
- With "True sizes" on, the Sun, the object and the umbra are drawn at their real diameters.
  The "From shadow" view stands in the umbra and looks up at the Sun, so you can see the object
  covering it. The readout compares the object's apparent size with the Sun's (the real Moon is
  1.00–1.08× during a total eclipse).
- Snapshots (every 15 min – 2 h) show the Sun, the line of possible object positions, and the object.
  The table compares the Sun's real altitude at the umbra with its elevation in the flat model,
  and lists the object's speed and needed diameter.

## Run

Open `dist/index.html` in a browser. It is a single self-contained file (works offline / from `file://`).

## Develop

```sh
cd web
npm install
npm run build     # -> dist/index.html
npm run watch     # rebuild on changes in src/
```

| File | Purpose |
| --- | --- |
| `src/eclipse.js` | Real-world geometry: eclipse list, umbra central line, subsolar point |
| `src/flat.js` | Flat-earth model: projection, sun position, object reconstruction |
| `src/map.js` | Draws the disc texture (land, graticule, rim) |
| `src/main.js` | Three.js scene, UI and animation |
| `index.html` | Page layout and styles; the build inlines the bundle into it |
