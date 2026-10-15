/**
 * PlanetTextures.js — the pictures of the planets seen from space (equirectangular RGBA maps).
 * Pure (no THREE): made in space.worker.js, away from the drawing.
 *
 *   rocky planets and the Moon: their very own ground (PlanetSurface.planetHeight) seen from far —
 *     the craters, the dark seas, the mesas, the ice caps you see from orbit are the ones you land on;
 *   the Earth: the game's own world round the start (TerrainData's heights: seas, lakes, rivers,
 *     beaches, forests' green, rock and snow on the mountains), the start at the north pole;
 *   the gas giants: belts and zones (Jupiter's Great Red Spot, Saturn's pale gold, Uranus' plain cyan,
 *     Neptune's deep blue with its dark spot); Venus: the cream-yellow tops of its clouds; the Sun.
 * A texel (i, j): longitude (i + .5) / w · 2π − π, latitude π/2 − (j + .5) / h · π.
 */

import { planetHeight } from './PlanetSurface.js';
import { dirToSurface, dirToEarth } from './Planets.js';
import { createNoise2D } from '../core/math.js';

const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const _d = { x: 0, y: 0, z: 0 }, _s = { x: 0, z: 0 };

function lonLat(i, j, w, h, out) {
    const lon = ((i + 0.5) / w) * 2 * Math.PI - Math.PI, lat = Math.PI / 2 - ((j + 0.5) / h) * Math.PI;
    const c = Math.cos(lat);
    out.x = Math.sin(lon) * c; out.y = Math.sin(lat); out.z = Math.cos(lon) * c;
    out.lon = lon; out.lat = lat;
    return out;
}

/**
 * The map of a body: {w, h, data: Uint8ClampedArray RGBA}. `terrain`: a TerrainData of the world
 * (for the Earth). `ms`: give up after this long (the caller asks for a smaller one then).
 */
export function planetTexture(def, w, h, terrain = null) {
    const data = new Uint8ClampedArray(w * h * 4);
    if (def.look === 'earth' && terrain) earthMap(data, w, h, terrain);
    else if (def.slot != null && def.slot >= 0 && def.ground) rockyMap(def, data, w, h);
    else if (def.look === 'venus') cloudMap(def, data, w, h);
    else if (def.look === 'sun') sunMap(def, data, w, h);
    else gasMap(def, data, w, h);
    return { w, h, data };
}

/** A noise over the sphere with no seam: sampled on two planes through the unit direction d. */
const sph = (n, d, f, sy = 1) => 0.5 * (n(d.x * f, d.y * f * sy) + n(d.z * f + 17.3, d.y * f * sy + 4.1)) * 1.4;

function put(data, i, c, a = 255) { data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = a; }

/** A rocky body: heights of its own ground, lit from the west, coloured by what lies on top. */
function rockyMap(def, data, w, h) {
    const g = def.ground;
    const H = new Float32Array(w * h), T = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const d = lonLat(i, j, w, h, _d);
        dirToSurface(def, d, _s);
        H[j * w + i] = planetHeight(def, Math.round(_s.x), Math.round(_s.z));
        T[j * w + i] = planetHeight.top;
    }
    const dust = rgb(g.dust), rock = rgb(g.rock), dark = rgb(g.dark), ice = rgb(g.ice);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, hh = H[k];
        const e = H[j * w + ((i + 1) % w)], s = H[Math.min(h - 1, j + 1) * w + i];
        const slope = (hh - e) * 0.09 + (hh - s) * 0.05; // (lit from the north-west)
        const t = T[k];
        let c = t === 65 ? ice : t === 66 ? dark : t === 64 ? rock : t === 1 ? [70, 140, 60] : t === 9 ? [200, 185, 130] : dust;
        if (def.terraformed && t === 9 && hh < 1) c = [40, 90, 170]; // (water)
        const lift = Math.max(-0.35, Math.min(0.35, slope + (hh - 4) * 0.012));
        c = lift > 0 ? mixc(c, [255, 255, 255], lift * 0.6) : mixc(c, [0, 0, 0], -lift);
        put(data, k * 4, c);
    }
}

/** The Earth: the game's own world from far (the start at the north pole). */
function earthMap(data, w, h, td) {
    const H = td.rawHeight || td.heightAt, land = td.land;
    const clim = {}, wts = new Float32Array(16), col3 = {}, fx = { mesa: 0, emer: 0, moon: 0, fant: 0 };
    const sea = [22, 62, 128], deep = [10, 34, 86], lake = [40, 96, 170], sand = [214, 196, 138], rock = [128, 124, 118], snow = [242, 246, 248];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const d = lonLat(i, j, w, h, _d);
        dirToEarth(d, _s);
        const x = Math.round(_s.x), z = Math.round(_s.z);
        const hh = H(x, z);
        let c;
        if (H.sea) c = mixc(sea, deep, Math.min(1, (H.water || 1) / 14));
        else if (H.water) c = lake;
        else if (H.beach) c = sand;
        else {
            let grass = [76, 150, 64];
            if (land) {
                try {
                    land.climate(x, z, clim);
                    land.biomes(clim, wts, 0, fx);
                    land.colours(x, z, hh, wts, clim, col3);
                    if (col3.grass != null) grass = rgb(col3.grass);
                } catch (e) { /* (an older world: plain green) */ }
            }
            c = hh > 34 ? snow : hh > 22 ? mixc(rock, snow, (hh - 22) / 12) : hh > 14 ? mixc(grass, rock, (hh - 14) / 8) : mixc(grass, [40, 90, 40], Math.max(0, Math.min(0.4, hh / 30)));
        }
        put(data, (j * w + i) * 4, c);
    }
}

/** Venus from space: the tops of its clouds — cream and pale yellow, soft streaks and a sideways «Y». */
function cloudMap(def, data, w, h) {
    const n = createNoise2D(def.seed ^ 0x3a), n2 = createNoise2D(def.seed ^ 0x77);
    const a = [236, 214, 160], b = [214, 182, 120], c2 = [248, 236, 205];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const d = lonLat(i, j, w, h, _d);
        const u = d.lon, v = d.lat;
        const swirl = sph(n, d, 2.2, 3) * 0.5 + sph(n2, d, 7, 2.5) * 0.25;
        const y = Math.abs(v) < 0.5 ? Math.cos(u * 1 + Math.abs(v) * 4) * 0.25 : 0;
        let c = mixc(a, b, Math.max(0, Math.min(1, 0.5 + swirl + y)));
        c = mixc(c, c2, Math.max(0, Math.abs(v) / (Math.PI / 2) - 0.6) * 1.5);
        put(data, (j * w + i) * 4, c);
    }
}

/** A gas giant: belts and zones along the latitudes, wavy edges, storms. */
function gasMap(def, data, w, h) {
    const n = createNoise2D((def.seed | 0) ^ 0x5bd1), n2 = createNoise2D((def.seed | 0) ^ 0x2f1);
    const pal = {
        jupiter: [[226, 208, 176], [176, 120, 82], [238, 226, 204], [150, 104, 74], [214, 186, 150]],
        saturn: [[232, 214, 164], [210, 184, 126], [240, 226, 186], [196, 168, 112], [226, 202, 150]],
        uranus: [[168, 226, 232], [156, 216, 224], [176, 232, 238], [150, 208, 220], [164, 222, 230]],
        neptune: [[70, 104, 220], [52, 82, 196], [88, 124, 232], [44, 70, 176], [64, 96, 210]],
    }[def.look] || [rgb(def.color), rgb(def.color), rgb(def.color), rgb(def.color), rgb(def.color)];
    const bands = def.look === 'jupiter' ? 14 : def.look === 'saturn' ? 18 : 7;
    const turb = def.look === 'jupiter' ? 0.9 : def.look === 'saturn' ? 0.35 : 0.15;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const d = lonLat(i, j, w, h, _d);
        const u = d.lon, v = d.lat;
        const warp = sph(n, d, 3, 4) * turb * 0.12 + sph(n2, d, 11, 4) * turb * 0.03;
        const bf = ((v + warp) / Math.PI + 0.5) * bands;
        const b0 = Math.floor(bf), t = bf - b0;
        const ca = pal[((b0 % 5) + 5) % 5], cb = pal[(((b0 + 1) % 5) + 5) % 5];
        let c = mixc(ca, cb, t * t * (3 - 2 * t));
        c = mixc(c, [255, 255, 255], Math.max(0, sph(n2, d, 24, 2)) * 0.08 * turb);
        // storms
        if (def.look === 'jupiter') {
            const du = ((u - 0.9 + Math.PI) % (2 * Math.PI)) - Math.PI, dv = v + 0.39;
            const r = Math.hypot(du / 0.22, dv / 0.1);
            if (r < 1.3) c = mixc(c, r < 1 ? [196, 98, 64] : [236, 210, 180], r < 1 ? 0.85 * (1 - r * r * 0.4) : (1.3 - r) / 0.3 * 0.6);
        } else if (def.look === 'neptune') {
            const du = ((u + 1.4 + Math.PI) % (2 * Math.PI)) - Math.PI, dv = v + 0.36;
            const r = Math.hypot(du / 0.18, dv / 0.08);
            if (r < 1) c = mixc(c, [24, 36, 110], 0.75 * (1 - r));
            const r2 = Math.hypot(du / 0.3, (dv + 0.12) / 0.03);
            if (r2 < 1) c = mixc(c, [220, 230, 255], 0.5 * (1 - r2));
        }
        // the poles a little darker / bluer (Saturn's hexagon left out)
        const pole = Math.max(0, Math.abs(v) / (Math.PI / 2) - 0.8) * 3;
        c = mixc(c, mixc(c, [80, 90, 110], 0.5), Math.min(1, pole));
        put(data, (j * w + i) * 4, c);
    }
}

/** The Sun: a bright disc of granules (the shader adds the glow and the movement). */
function sunMap(def, data, w, h) {
    const n = createNoise2D(911), n2 = createNoise2D(377);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const d = lonLat(i, j, w, h, _d);
        const g = sph(n, d, 30) * 0.5 + sph(n2, d, 90) * 0.3;
        const c = mixc([255, 214, 120], [255, 160, 60], Math.max(0, Math.min(1, 0.5 - g)));
        put(data, (j * w + i) * 4, c);
    }
}
