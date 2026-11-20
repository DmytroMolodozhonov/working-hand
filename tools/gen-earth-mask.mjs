// Makes src/world/EarthMask.js: the real Earth's land / sea as a 1-bit equirectangular mask (720×360, 0.5° a texel).
// Source: Natural Earth 110m land (public domain) — node tools/gen-earth-mask.mjs <ne_110m_land.geojson>
import fs from 'node:fs';
const src = process.argv[2];
const gj = JSON.parse(fs.readFileSync(src, 'utf8'));
const W = 720, H = 360;
const rings = [];
for (const f of gj.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polys) rings.push(p); // [outer, ...holes]
}
const bits = new Uint8Array(Math.ceil(W * H / 8));
const SS = 2; // supersampling (a texel is land when most of its samples are)
const inRing = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const land = (x, y) => { for (const p of rings) { if (!inRing(p[0], x, y)) continue; let hole = false; for (let k = 1; k < p.length; k++) if (inRing(p[k], x, y)) { hole = true; break; } if (!hole) return true; } return false; };
let n = 0;
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let s = 0;
    for (let a = 0; a < SS; a++) for (let b = 0; b < SS; b++) if (land(-180 + ((i + (a + 0.5) / SS) / W) * 360, 90 - ((j + (b + 0.5) / SS) / H) * 180)) s++;
    if (s * 2 >= SS * SS) { bits[(j * W + i) >> 3] |= 1 << ((j * W + i) & 7); n++; }
}
const b64 = Buffer.from(bits).toString('base64');
fs.writeFileSync(new URL('../src/world/EarthMask.js', import.meta.url), `/**
 * EarthMask.js — the real Earth's land and sea as a 1-bit equirectangular map (generated: tools/gen-earth-mask.mjs).
 * Data: Natural Earth 110m land (public domain, naturalearthdata.com). 720 × 360 texels, 0.5° each; row 0 = 90°N, column 0 = 180°W.
 */
export const EARTH_MASK = { w: ${W}, h: ${H}, b64: '${b64}' };

let _bits = null;
/** Is the texel (i, j) land? (out of range wraps in longitude, clamps in latitude) */
export function earthLand(i, j) {
    if (!_bits) { const s = typeof atob === 'function' ? atob(EARTH_MASK.b64) : Buffer.from(EARTH_MASK.b64, 'base64').toString('binary'); _bits = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) _bits[k] = s.charCodeAt(k); }
    const w = EARTH_MASK.w, h = EARTH_MASK.h;
    i = ((i % w) + w) % w; j = j < 0 ? 0 : j >= h ? h - 1 : j;
    const k = j * w + i;
    return (_bits[k >> 3] >> (k & 7)) & 1;
}

/** How much land there is round a point (lon, lat in radians), 0…1 — bilinear in the mask: soft coasts at any map size. */
export function earthLandAt(lon, lat) {
    const x = ((lon + Math.PI) / (2 * Math.PI)) * EARTH_MASK.w - 0.5, y = (0.5 - lat / Math.PI) * EARTH_MASK.h - 0.5;
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    return (earthLand(i, j) * (1 - fx) + earthLand(i + 1, j) * fx) * (1 - fy) + (earthLand(i, j + 1) * (1 - fx) + earthLand(i + 1, j + 1) * fx) * fy;
}
`);
console.log('land texels', n, 'of', W * H, (100 * n / (W * H)).toFixed(1) + '%', 'file', b64.length);
