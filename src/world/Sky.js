/**
 * Sky.js — a painted sky instead of a flat grey-blue ball.
 *
 * One big sphere that travels with the player, drawn by a small shader:
 *   - a gradient from deep blue overhead to a bright, warm horizon,
 *   - the sun (direction of the scene's sunlight) with a soft glow,
 *   - soft clouds that slowly drift (a few layers of noise),
 *   - at sunset / sunrise: a golden, then orange-red sun low at the horizon,
 *     warm orange and pink on the sun's side, a pink belt over violet on the
 *     other, clouds lit from below; then the blue-violet twilight,
 *   - at night: a dark sky, a moon and twinkling stars.
 * The fog uses the horizon colour, so far mountains melt into the sky.
 */

import * as THREE from 'three';
import { ULTRA } from '../fx/UltraUniforms.js';

export const SKY_DAY = {
    zenith: new THREE.Color(0x2f6fd8),
    horizon: new THREE.Color(0xcfe8ff),
    ground: new THREE.Color(0x9fc6e8),
    fog: 0xc3e0fb,
};

/**
 * The air's colour in a direction `d` with the sun at `s` (unit vectors) — the same model as the sky's shader (skyAir), tone-mapped
 * the same way: for the fog at the horizon, so the far land and sea melt into the very sky above them. → out [r, g, b] 0…1. Light:
 * a few hundred exp a call, once per change of the day (World.setDayPhase).
 */
export function airColor(d, s, out = [0, 0, 0]) {
    const Re = 6360, Ra = 6420, Hr = 8, Hm = 1.2, bR = [5.8e-3, 13.5e-3, 33.1e-3], bM = 4e-3, bO = [0.65e-3, 1.881e-3, 0.085e-3];
    const sphere = (ox, oy, oz, dx, dy, dz, r) => { const b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - r * r, q = b * b - c; return q < 0 ? -1 : -b + Math.sqrt(q); };
    const oy = Re + 0.2, L = sphere(0, oy, 0, d[0], d[1], d[2], Ra), seg = L / 12;
    let odR = 0, odM = 0;
    const sumR = [0, 0, 0], sumM = [0, 0, 0];
    for (let i = 0; i < 12; i++) {
        const t = seg * (i + 0.5), px = d[0] * t, py = oy + d[1] * t, pz = d[2] * t;
        const hh = Math.hypot(px, py, pz) - Re, hr = Math.exp(-hh / Hr) * seg, hm = Math.exp(-hh / Hm) * seg;
        odR += hr; odM += hm;
        const Ls = sphere(px, py, pz, s[0], s[1], s[2], Ra), seg2 = Ls / 5;
        let lR = 0, lM = 0, lit = true;
        for (let j = 0; j < 5; j++) {
            const u = seg2 * (j + 0.5), h2 = Math.hypot(px + s[0] * u, py + s[1] * u, pz + s[2] * u) - Re;
            if (h2 < 0) { lit = false; break; }
            lR += Math.exp(-h2 / Hr) * seg2; lM += Math.exp(-h2 / Hm) * seg2;
        }
        if (!lit) continue;
        for (let c = 0; c < 3; c++) { const att = Math.exp(-((bR[c] + bO[c]) * (odR + lR) + bM * 1.1 * (odM + lM))); sumR[c] += att * hr; sumM[c] += att * hm; }
    }
    const mu = d[0] * s[0] + d[1] * s[1] + d[2] * s[2], g = 0.76;
    const pR = 3 / (16 * Math.PI) * (1 + mu * mu), pM = 3 / (8 * Math.PI) * ((1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
    for (let c = 0; c < 3; c++) out[c] = Math.pow(1 - Math.exp(-22 * (sumR[c] * bR[c] * pR + sumM[c] * bM * pM) * 1.3), 1 / 2.2);
    const l = (out[0] + out[1] + out[2]) / 3, tint = [0.97, 0.99, 1.07];
    for (let c = 0; c < 3; c++) out[c] = Math.max(0, Math.min(1, (l + (out[c] - l) * 1.5) * tint[c]));
    return out;
}

export const SKY_NIGHT = {
    zenith: new THREE.Color(0x02040a),
    horizon: new THREE.Color(0x0b1424),
    ground: new THREE.Color(0x05080f),
    fog: 0x05070c,
};

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uTime;
uniform float uNight;
uniform float uClouds;
uniform float uOvercast;
uniform float uUltra;
uniform vec3 uWinDir;   // «To the Sun»: the window in the clouds — its centre (where the beam meets the sky) …
uniform float uWin;     // … how far it is open (0: none … 1: wide) …
uniform float uWinR;    // … and how wide the wide is (radians)
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash33(i).x, b = hash33(i + vec3(1.0, 0.0, 0.0)).x, c = hash33(i + vec3(0.0, 1.0, 0.0)).x, e = hash33(i + vec3(1.0, 1.0, 0.0)).x;
    float a2 = hash33(i + vec3(0.0, 0.0, 1.0)).x, b2 = hash33(i + vec3(1.0, 0.0, 1.0)).x, c2 = hash33(i + vec3(0.0, 1.0, 1.0)).x, e2 = hash33(i + vec3(1.0, 1.0, 1.0)).x;
    return mix(mix(mix(a, b, f.x), mix(c, e, f.x), f.y), mix(mix(a2, b2, f.x), mix(c2, e2, f.x), f.y), f.z);
}
// One layer of stars: the direction d scaled into cells of space (S per unit); a cell holds a star with chance dens, at a random place inside it (never on a grid),
// its glow radius rad (in cells, ≤ 0.15 so it never reaches the cell's edge) times its own size; colour from blue-white to amber; twinkles at its own pace.
vec3 starLayer(vec3 d, float S, float dens, float rad, float t) {
    vec3 p = d * S, c = floor(p);
    vec3 h = hash33(c), g = hash33(c + 19.7), k = hash33(c + 41.3);
    if (h.x > dens) return vec3(0.0);
    vec3 pos = c + 0.15 + 0.7 * g;
    float dist = length(p - pos);
    float size = rad * (0.45 + 0.75 * k.x * k.x);
    float glow = smoothstep(size, 0.0, dist);
    float bright = 0.25 + 2.0 * pow(k.y, 3.0);
    float tw = 0.72 + 0.28 * sin(t * (1.5 + 3.5 * k.z) + 80.0 * h.y);
    vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.84, 0.62), k.z);
    return tint * glow * glow * bright * tw;
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
}
// «Ультра качество»: more layers of cloud, warped like real clouds
float fbm6(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
}
float down(float a, float b, float x) { return 1.0 - smoothstep(a, b, x); } // (1 below a … 0 above b)

// ——— the air itself (every quality): the sunlight scattered in a real atmosphere — the blue overhead from the small molecules
// (Rayleigh), the white haze and the glow round the sun from the dust (Mie), the light reddened by the long way through the air when
// the sun is low (the sunset comes out of it by itself). km; 12 steps along the look, 5 towards the sun.
vec2 skySphere(vec3 o, vec3 d, float r) { float b = dot(o, d), c = dot(o, o) - r * r, q = b * b - c; if (q < 0.0) return vec2(-1.0); q = sqrt(q); return vec2(-b - q, -b + q); }
vec3 skyAir(vec3 d, vec3 s) {
    const float Re = 6360.0, Ra = 6420.0, Hr = 8.0, Hm = 1.2;
    const vec3 bR = vec3(5.8e-3, 13.5e-3, 33.1e-3);
    const float bM = 4e-3; // (clean air: a little dust — the haze, the glow round the sun)
    const vec3 bO = vec3(0.65e-3, 1.881e-3, 0.085e-3); // (the ozone: it drinks the orange, the deep blue overhead and in the twilight)
    vec3 o = vec3(0.0, Re + 0.2, 0.0);
    float L = skySphere(o, d, Ra).y;
    float seg = L / 12.0, odR = 0.0, odM = 0.0;
    vec3 sumR = vec3(0.0), sumM = vec3(0.0);
    for (int i = 0; i < 12; i++) {
        vec3 p = o + d * (seg * (float(i) + 0.5));
        float hh = length(p) - Re;
        float hr = exp(-hh / Hr) * seg, hm = exp(-hh / Hm) * seg;
        odR += hr; odM += hm;
        float Ls = skySphere(p, s, Ra).y, seg2 = Ls / 5.0, lR = 0.0, lM = 0.0;
        bool lit = true;
        for (int j = 0; j < 5; j++) {
            vec3 q = p + s * (seg2 * (float(j) + 0.5));
            float h2 = length(q) - Re;
            if (h2 < 0.0) { lit = false; break; }
            lR += exp(-h2 / Hr) * seg2; lM += exp(-h2 / Hm) * seg2;
        }
        if (lit) { vec3 att = exp(-((bR + bO) * (odR + lR) + bM * 1.1 * (odM + lM))); sumR += att * hr; sumM += att * hm; }
    }
    float mu = dot(d, s), g = 0.76;
    float pR = 3.0 / (16.0 * 3.14159) * (1.0 + mu * mu);
    float pM = 3.0 / (8.0 * 3.14159) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    return 22.0 * (sumR * bR * pR + sumM * bM * pM);
}

void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 sd = normalize(uSunDir);
    float se = sd.y; // the sun's height (< 0: under the horizon)
    // ——— «To the Sun»: the heavens open. A ragged window tears open in the clouds where the beam met them: the cloud bank rolls back
    // round it in a spiral, a golden rim burns along its edge, and through it the clear sky and a sun of its own shine down in rays.
    float ov = uOvercast, win = 0.0, winRim = 0.0, winAng = 1.0, winPhi = 0.0, winSpin = 0.0;
    vec3 dCl = d; // (the direction the clouds are read from: turned about the window's axis — the spiral)
    if (uWin > 0.001) {
        vec3 wa = normalize(uWinDir);
        vec3 wt = normalize(cross(abs(wa.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), wa));
        vec3 wb = cross(wa, wt);
        float cw = dot(d, wa);
        winAng = acos(clamp(cw, -1.0, 1.0));
        float R = max(uWinR * uWin, 1e-3);
        float phi = atan(dot(d, wb), dot(d, wt));
        winSpin = (1.0 - smoothstep(0.0, R * 1.6, winAng)) * uWin * 1.3 - uTime * 0.05 * uWin; // (the nearer the centre, the more it is turned)
        winPhi = phi + winSpin;
        vec2 pc = vec2(cos(winPhi), sin(winPhi)); // (the edge's noise is read round a circle: no seam where the angle wraps)
        float rag = (noise(pc * 1.7 + 3.0 + uTime * 0.12) - 0.5) * 0.55 + (noise(pc * 3.6 + vec2(winAng * 5.0 - uTime * 0.4, 1.0)) - 0.5) * 0.22;
        float aR = winAng + rag * R * 0.35;
        win = (1.0 - smoothstep(R * 0.78, R, aR)) * smoothstep(0.0, 0.06, uWin);
        winRim = smoothstep(R * 0.8, R * 0.96, aR) * (1.0 - smoothstep(R * 0.96, R * 1.06, aR)) * smoothstep(0.0, 0.1, uWin);
        // the clouds are read from a direction turned about the axis by the same spin: they stream round the opening
        float ca = cos(winSpin * 0.55), sa = sin(winSpin * 0.55);
        dCl = d * ca + cross(wa, d) * sa + wa * dot(wa, d) * (1.0 - ca);
        ov = uOvercast * (1.0 - win);
    }
    float clear = 1.0 - ov;
    // the painted gradient (it carries the night, the rain's grey, the world's own colours) …
    vec3 col = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.55));
    // … under the real air by day: the scattered sunlight (tone-mapped; at the horizon and below it the air of the horizon)
    {
        vec3 ad = normalize(vec3(d.x, max(h, 0.04), d.z)); // (right at the horizon the long way through the air reddened it into a sunset at noon: the air of a little higher)
        vec3 air = skyAir(ad, normalize(vec3(sd.x, max(se, -0.25), sd.z)));
        air = pow(1.0 - exp(-air * 1.3), vec3(1.0 / 2.2));
        float airL = dot(air, vec3(0.3333));
        air = clamp(airL + (air - airL) * 1.5, 0.0, 1.0) * vec3(0.97, 0.99, 1.07); // (the eye sees the sky's blue deeper than the plain numbers)
        float dayW = smoothstep(-0.2, 0.04, se) * (1.0 - ov * 0.88);
        col = mix(col, air, dayW);
    }
    col = mix(col, uGround, down(-0.25, 0.0, h));
    // --- Sunset / sunrise: the colours come in as the sun gets low, peak as it touches the horizon,
    //     and fade through the twilight while it sinks
    float glow = smoothstep(-0.3, -0.01, se) * down(0.06, 0.42, se) * clear;
    float low = down(-0.06, 0.16, se);          // 0 with the sun high … 1 when it has set
    float dim = mix(1.0, 0.32, down(-0.26, 0.0, se)); // the twilight's colours grow dark
    vec2 dh = d.xz / max(length(d.xz), 1e-4);
    vec2 sh = sd.xz / max(length(sd.xz), 1e-4);
    float toSun = dot(dh, sh) * 0.5 + 0.5;     // 1 looking towards the sun, 0 away
    float sideSun = toSun * toSun;
    float hb = max(h, 0.0);
    float band = exp(-hb * 5.0);               // near the horizon
    float bandTight = exp(-hb * 16.0);
    vec3 gold = vec3(1.0, 0.68, 0.32);
    vec3 orange = vec3(1.0, 0.46, 0.17);
    vec3 red = vec3(0.88, 0.2, 0.12);
    vec3 pink = vec3(0.93, 0.5, 0.62);
    vec3 violet = vec3(0.34, 0.25, 0.55);
    vec3 warm = mix(gold, mix(orange, red, smoothstep(0.45, 1.0, low)), smoothstep(0.0, 0.7, low));
    vec3 sunSide = mix(pink, warm, band);                       // warm at the horizon, pink higher up
    sunSide = mix(sunSide, mix(orange, red, low), bandTight * 0.7); // a burning line right at the horizon
    vec3 farSide = mix(violet, pink * 0.85, band * 0.6);         // away from the sun: a pink belt over violet
    vec3 tint = mix(farSide, sunSide, sideSun) * dim;
    float amt = glow * (0.3 + 0.7 * band) * mix(0.45, 1.0, sideSun) * smoothstep(-0.12, 0.02, h);
    col = mix(col, tint, clamp(amt * 0.4, 0.0, 0.5)); // (a touch of pink and violet on top of the air's own sunset)
    // twilight: deep blue-violet overhead, before the night's black-blue
    float tw = down(-0.12, 0.0, se) * smoothstep(-0.5, -0.25, se) * clear;
    col = mix(col, vec3(0.13, 0.12, 0.34), tw * 0.55 * sqrt(hb));
    // Sun: glow + disc — golden, then orange-red at the horizon; hidden under it
    float sunAmt = max(dot(d, sd), 0.0);
    float sunUp = smoothstep(-0.05, 0.01, se) * smoothstep(-0.015, 0.01, h);
    vec3 sunCol = mix(vec3(1.0, 0.93, 0.78), mix(vec3(1.0, 0.64, 0.3), vec3(1.0, 0.36, 0.16), low), down(0.0, 0.35, se));
    col += sunCol * pow(sunAmt, 8.0) * mix(0.35, 0.8, down(0.0, 0.4, se)) * smoothstep(-0.2, 0.0, se) * clear;
    col += sunCol * pow(sunAmt, 64.0) * 0.6 * sunUp * clear;
    col = mix(col, sunCol * mix(1.6, 1.25, low), smoothstep(0.9982, 0.999, sunAmt) * sunUp * mix(1.0, 0.25, ov));
    // Moon at night
    vec3 md = normalize(uMoonDir);
    float moonAmt = max(dot(d, md), 0.0);
    vec3 moonCol = vec3(0.75, 0.82, 1.0);
    col += moonCol * (pow(moonAmt, 8.0) * 0.08 + pow(moonAmt, 64.0) * 0.15) * uNight * clear;
    col = mix(col, moonCol * 0.9, smoothstep(0.9985, 0.9992, moonAmt) * uNight * smoothstep(-0.01, 0.01, h) * mix(1.0, 0.3, ov));
    // Clouds: projected on a high flat layer, drifting (more and greyer under rain clouds)
    if (uClouds > 0.5 && h > 0.01) {
        // «Ультра»: soft, thick clouds lit from the sun's side (a look a little towards the sun: where the
        // cloud thins that way its edge glows — a silver lining), darker and fuller under rain
        vec2 uv = dCl.xz / (max(dCl.y, 0.02) + 0.1) * 1.3 + vec2(uTime * 0.01, uTime * 0.0035);
        vec2 warp = vec2(fbm(uv * 0.6 + 4.0), fbm(uv * 0.6 - 2.0)) - 0.5;
        vec2 cuv = uv + warp * 0.9;
        float c0 = fbm6(cuv);
        float cov = mix(0.5, 0.3, ov);
        float c = smoothstep(cov, cov + mix(0.32, 0.26, ov), c0) * smoothstep(0.01, 0.2, h);
        if (c > 0.002) {
            float cs = fbm6(cuv + sd.xz * 0.09);
            float lit = clamp(0.72 + (c0 - cs) * 3.2, 0.38, 1.25);
            vec3 cloudLit = mix(vec3(1.0, 0.99, 0.97), vec3(1.0, 0.94, 0.84), pow(sunAmt, 4.0));
            vec3 cloudSun = mix(pink * 0.95, mix(orange * 1.05, red * 1.1, low), sideSun) * mix(1.0, 0.55, low);
            cloudLit = mix(cloudLit, cloudSun, glow * 0.9);
            vec3 shadowCol = mix(vec3(0.62, 0.68, 0.8), vec3(0.42, 0.36, 0.5), glow);
            vec3 cloudCol = mix(shadowCol, cloudLit, smoothstep(0.38, 1.1, lit)) * (0.85 + 0.25 * lit);
            cloudCol = mix(cloudCol, vec3(0.16, 0.19, 0.27) + vec3(0.06, 0.07, 0.1) * lit, uNight * 0.9 * (1.0 - glow * 0.6));
            cloudCol = mix(cloudCol, vec3(0.5, 0.53, 0.58) * (0.8 + 0.25 * lit) * (1.0 - 0.7 * uNight), ov * 0.85);
            float edge = c * (1.0 - c) * 4.0;
            cloudCol += sunCol * edge * pow(sunAmt, 6.0) * 1.4 * clear * smoothstep(-0.1, 0.05, se);
            col = mix(col, cloudCol, c * mix(mix(0.92, 0.55, uNight), 0.97, ov));
        }
    } else if (false) {
        vec2 uv = d.xz / (h + 0.08) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
        float c = fbm(uv);
        c = smoothstep(mix(0.48, 0.3, ov), mix(0.78, 0.62, ov), c) * smoothstep(0.01, 0.22, h);
        vec3 cloudLit = mix(vec3(1.0), vec3(1.0, 0.95, 0.88), pow(sunAmt, 4.0));
        // at sunset the clouds are lit from below: orange-red towards the sun, pink away from it
        vec3 cloudSun = mix(pink * 0.95, mix(orange * 1.05, red * 1.1, low), sideSun) * mix(1.0, 0.55, low);
        cloudLit = mix(cloudLit, cloudSun, glow * 0.9);
        vec3 cloudCol = mix(cloudLit, vec3(0.25, 0.28, 0.35), uNight * 0.85 * (1.0 - glow * 0.6));
        cloudCol = mix(cloudCol, vec3(0.55, 0.58, 0.63) * (1.0 - 0.65 * uNight), ov * 0.8);
        if (c > 0.002) {
            float shade = 0.82 + 0.18 * fbm(uv * 1.7 + 3.0);
            col = mix(col, cloudCol * shade, c * mix(mix(0.85, 0.35, uNight), 0.95, ov));
        }
    }
    // ——— the window's light (over the clouds): the rim of gold, the sun of the heavens, rays pouring out of it
    if (uWin > 0.001) {
        float R = max(uWinR * uWin, 1e-3);
        vec3 holy = vec3(1.0, 0.8, 0.42), holyW = vec3(1.0, 0.96, 0.82);
        float rayA = pow(0.5 + 0.5 * sin(winPhi * 17.0 + uTime * 0.45 + noise(vec2(cos(winPhi), sin(winPhi)) * 1.5 + uTime * 0.1) * 4.0), 3.0);
        float rayB = pow(0.5 + 0.5 * sin(winPhi * 31.0 - uTime * 0.6 + 1.7), 5.0);
        float inR = exp(-winAng / (R * 0.5));
        col += holy * win * (0.04 + 0.16 * inR) * uWin;                          // the warm light filling the opening
        col += holy * (rayA * 0.5 + rayB * 0.3) * inR * win * 0.4 * uWin;       // rays of heaven: from the centre to the rim
        col += mix(holy, holyW, 0.3) * winRim * (0.5 + 0.2 * sin(uTime * 2.3 + winPhi * 5.0)); // the burning rim of the clouds
        float sunR = 0.05 + 0.02 * uWin;
        float sunA = 1.0 - smoothstep(sunR * 0.55, sunR, winAng);
        col += holyW * sunA * 1.6 * uWin;                                        // the sun of the heavens
        col += holy * exp(-winAng * winAng / (sunR * sunR * 14.0)) * 0.5 * uWin; // its corona
    }
    if (uUltra > 0.5) {
        // the sun burns brighter than white (its glow blooms on the picture); the night's deep blue, not black
        col += sunCol * smoothstep(0.9982, 0.999, sunAmt) * sunUp * clear * 2.5;
        col += sunCol * pow(sunAmt, 48.0) * 0.25 * sunUp * clear;
        col += vec3(0.008, 0.016, 0.045) * uNight * (1.0 - 0.6 * h);
        // the moon: a halo, a brighter disc with its grey seas
        col += moonCol * pow(moonAmt, 48.0) * 0.18 * uNight * clear;
        float disc = smoothstep(0.9983, 0.9991, moonAmt) * uNight * smoothstep(-0.01, 0.01, h) * mix(1.0, 0.3, ov);
        vec3 mt = d - md * dot(d, md);
        float seas = noise(mt.xy * 900.0 + 3.0) * 0.6 + noise(mt.yz * 1700.0) * 0.4;
        col = mix(col, moonCol * (1.35 - 0.45 * smoothstep(0.45, 0.7, seas)), disc);
    }
    // Stars at night (not through the clouds)
    // (the author 21.11: «звёзды выстроены слишком ровно, не похоже на настоящее небо» — they sat in the middle of the cells of a flat grid, all one size. Now:
    //  the direction is cut into CELLS OF SPACE, each with at most one star at a random place, of its own size, brightness (many dim, a few bright), warmth and twinkle;
    //  they gather in clumps and thicken along the Milky Way — no rows, no columns, nothing that repeats.)
    float starK = smoothstep(0.45, 1.0, uNight) * clear;
    if (starK > 0.01 && h > 0.0) {
        float horizonFade = smoothstep(0.0, 0.3, h);
        float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.25, 0.9))) / 0.2, 2.0));
        float clump = 0.35 + 1.3 * smoothstep(0.3, 0.75, noise3(d * 3.1 + 5.0)) + 1.6 * band * (0.4 + noise3(d * 9.0));
        // a few big bright ones, a crowd of faint ones, and a dust of the faintest
        col += starLayer(d, 58.0, 0.34 * clump, 0.15, uTime) * 4.4 * starK * horizonFade;
        col += starLayer(d + 0.31, 112.0, 0.42 * clump, 0.14, uTime) * 3.7 * starK * horizonFade;
        col += starLayer(d + 0.77, 205.0, 0.6 * clump, 0.15, uTime) * 3.0 * starK * horizonFade;
        float mw = band * fbm(d.xz / (h + 0.4) * 6.0) * smoothstep(0.0, 0.25, h);
        col += mix(vec3(0.25, 0.28, 0.45), vec3(0.45, 0.38, 0.35), mw) * mw * 0.16 * starK;
    }
    gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
    constructor(scene) {
        this.uniforms = {
            uZenith: { value: SKY_DAY.zenith.clone() },
            uHorizon: { value: SKY_DAY.horizon.clone() },
            uGround: { value: SKY_DAY.ground.clone() },
            uSunDir: { value: new THREE.Vector3(0.45, 0.6, 0.35) },
            uMoonDir: { value: new THREE.Vector3(0.45, 0.6, 0.35) },
            uOvercast: { value: 0 }, // (rain clouds: the sunset and the stars covered)
            uTime: { value: 0 },
            uNight: { value: 0 },
            uWinDir: { value: new THREE.Vector3(0, 1, 0) }, // «To the Sun»: the window in the clouds (SunBeam.js)
            uWin: { value: 0 },
            uWinR: { value: 1.15 },
            uUltra: ULTRA.on, // («Ультра качество»: the richer clouds, sun, moon and stars)
            uClouds: { value: 1 }, // off at the lowest graphics levels (the clouds cost the most per pixel)
        };
        const mat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader,
            fragmentShader,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
        });
        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), mat);
        this.mesh.renderOrder = -10;
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }

    get position() {
        return this.mesh.position;
    }

    setClouds(on) {
        this.uniforms.uClouds.value = on ? 1 : 0;
    }

    /** Rain / storm clouds (0..1). */
    setOvercast(k) {
        this.uniforms.uOvercast.value = Math.max(0, Math.min(1, k));
    }

    /** «To the Sun»: the window in the clouds — `dir`: where it is (a direction from the eye), `open` 0…1, `radius` of the wide open, radians. open 0 = none. */
    setWindow(dir, open, radius = 1.15) {
        const u = this.uniforms;
        if (dir) u.uWinDir.value.copy(dir).normalize();
        u.uWin.value = Math.max(0, Math.min(1, open));
        u.uWinR.value = radius;
    }

    setNight(night) {
        this._fixedNight = night;
        if (night) this.setSunDirection(this.uniforms.uSunDir.value.y > 0 ? this.uniforms.uSunDir.value.clone() : this.uniforms.uMoonDir.value);
        const p = night ? SKY_NIGHT : SKY_DAY;
        this.uniforms.uZenith.value.copy(p.zenith);
        this.uniforms.uHorizon.value.copy(p.horizon);
        this.uniforms.uGround.value.copy(p.ground);
        this.uniforms.uNight.value = night ? 1 : 0;
    }

    /** 0 = day, 1 = night, anything between = dusk / dawn. */
    setNightAmount(k) {
        this.uniforms.uZenith.value.copy(SKY_DAY.zenith).lerp(SKY_NIGHT.zenith, k);
        this.uniforms.uHorizon.value.copy(SKY_DAY.horizon).lerp(SKY_NIGHT.horizon, k);
        // (the sunset's colours come from the sun's height: the shader)
        this.uniforms.uGround.value.copy(SKY_DAY.ground).lerp(SKY_NIGHT.ground, k);
        this.uniforms.uNight.value = k;
    }

    /** The sun (it may be under the horizon) and the moon. */
    setSunDirection(v, moon = null) {
        if (this._fixedNight && !moon) {
            // (a world that is always night: the moon where the sun was, the sun far down)
            this.uniforms.uMoonDir.value.copy(v).normalize();
            this.uniforms.uSunDir.value.set(-0.3, -0.9, 0.3).normalize();
            return;
        }
        this.uniforms.uSunDir.value.copy(v).normalize();
        this.uniforms.uMoonDir.value.copy(moon || v).normalize();
    }

    update(dt) {
        this.uniforms.uTime.value += dt;
    }
}
