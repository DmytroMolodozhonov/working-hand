/**
 * FireworkShapes.js — what a salvo of «Fireworks» is made of (pure: numbers only, no THREE; the same on
 * every computer: all the chance comes from the salvo's seed).
 *
 *   planSalvo(seed)            → 1…3 rockets: when, where to, how high, which burst, which colours
 *   burstShape(kind, rnd, …)   → the sparks of one burst as offsets from its centre (in radii, |o| ≤ 1)
 *
 * A spark flies out and is slowed by the air, so it ends at `offset × radius` (FireworksFx turns an offset
 * into a speed: v₀ = offset·R·k/(1−e^(−kT)) with the burst's drag k and the spark's life T) — that is how the
 * shapes (a ring, a star, a heart…) keep their form while they grow.
 */

/** The numbers of a salvo and of a burst (the author's: 35–70 m up in ~1 s; 12–25 m wide; 80–300 sparks). */
export const SHOW = {
    ROCKETS: [1, 3], // a bunch of 1…3 rockets in one salvo («раз, два, три салюта»)
    STAGGER: 0.55, // s between the rockets of a bunch (at most)
    SCATTER: 0.2, // rad: how far the bunch fans out
    RISE: [0.9, 1.3], // s from the wand to the burst
    HEIGHT: [35, 70], // m above the wand
    RADIUS: [12, 25], // m the burst spreads
    PARTS: [80, 300], // sparks in one burst
};

/** The bright, saturated colours (additive: they mix to white where they meet). */
export const PALETTE = {
    red: 0xff2a3a, gold: 0xffc83a, blue: 0x2f6bff, green: 0x2aff6a, violet: 0xb04dff, silver: 0xe8f0ff, orange: 0xff7a1a, pink: 0xff5cc8,
};
const COLOR_KEYS = ['red', 'gold', 'blue', 'green', 'violet', 'silver', 'red', 'gold', 'blue', 'green', 'violet', 'orange', 'pink'];

/**
 * The kinds of burst, their weights, and how each one flies:
 *   life  s a spark shines          drag  1/s the air slows it         grav  m/s² (negative: falls)
 *   trail s between the glints a spark leaves behind (0 = none)       trailLife  s a glint shines
 *   size  m a spark                 parts [min,max] of the 80…300
 */
export const KINDS = {
    peony: { w: 22, life: 2.2, drag: 2.0, grav: -3.5, trail: 0, size: 0.9, parts: [150, 240], ru: 'пион' },
    chrysanthemum: { w: 18, life: 2.6, drag: 1.8, grav: -4, trail: 0.07, trailLife: 0.6, size: 0.8, parts: [90, 140], ru: 'хризантема' },
    willow: { w: 12, life: 3.4, drag: 1.6, grav: -8, trail: 0.09, trailLife: 1.0, size: 0.8, parts: [60, 100], ru: 'ива' },
    ring: { w: 10, life: 2.2, drag: 2.0, grav: -3, trail: 0, size: 1.0, parts: [70, 120], ru: 'кольцо' },
    star: { w: 8, life: 2.4, drag: 2.2, grav: -2, trail: 0, size: 1.1, parts: [90, 130], ru: 'звезда' },
    heart: { w: 6, life: 2.4, drag: 2.2, grav: -2, trail: 0, size: 1.1, parts: [90, 140], ru: 'сердце' },
    double: { w: 10, life: 2.3, drag: 2.0, grav: -3.5, trail: 0, size: 0.9, parts: [180, 300], ru: 'двойной шар' },
    crossette: { w: 8, life: 0.85, drag: 1.8, grav: -2, trail: 0.06, trailLife: 0.45, size: 0.9, parts: [80, 110], cross: true, ru: 'кроссет' },
    glitter: { w: 10, life: 2.8, drag: 1.6, grav: -5, trail: 0, size: 0.7, parts: [110, 170], glitter: true, ru: 'мерцающий' },
};
export const KIND_NAMES = Object.keys(KINDS);

/** A seeded random generator (mulberry32): () → [0, 1). */
export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const span = (r, [a, b]) => a + r() * (b - a);

/** One of the kinds, by weight. */
export function pickKind(r) {
    let total = 0;
    for (const k of KIND_NAMES) total += KINDS[k].w;
    let x = r() * total;
    for (const k of KIND_NAMES) { x -= KINDS[k].w; if (x <= 0) return k; }
    return 'peony';
}

/**
 * A salvo: `seed` (a uint32) → { rockets: [{ delay, yaw, tilt, rise, height, kind, colors: [hex, hex], radius, count, seed }] }.
 * `yaw` / `tilt` fan the bunch out from straight up (rad). Pure and deterministic.
 */
export function planSalvo(seed) {
    const r = rng(seed ^ 0x9e3779b9);
    const n = SHOW.ROCKETS[0] + Math.floor(r() * (SHOW.ROCKETS[1] - SHOW.ROCKETS[0] + 1));
    const rockets = [];
    for (let i = 0; i < n; i++) {
        const kind = pickKind(r), K = KINDS[kind];
        const c1 = PALETTE[COLOR_KEYS[Math.floor(r() * COLOR_KEYS.length)]];
        let c2 = PALETTE[COLOR_KEYS[Math.floor(r() * COLOR_KEYS.length)]];
        if (c2 === c1) c2 = PALETTE.silver;
        const willowGold = kind === 'willow'; // (golden threads falling: the willow is gold or silver)
        rockets.push({
            delay: i === 0 ? 0 : i * SHOW.STAGGER * (0.5 + r() * 0.5),
            yaw: r() * Math.PI * 2,
            tilt: n === 1 ? r() * 0.08 : SHOW.SCATTER * (0.4 + r() * 0.6),
            rise: span(r, SHOW.RISE),
            height: span(r, SHOW.HEIGHT),
            kind,
            colors: willowGold ? [r() < 0.7 ? PALETTE.gold : PALETTE.silver, PALETTE.orange] : [c1, c2],
            radius: span(r, SHOW.RADIUS),
            count: Math.round(Math.max(SHOW.PARTS[0], Math.min(SHOW.PARTS[1], span(r, K.parts)))),
            seed: (seed + Math.imul(i + 1, 0x85ebca6b)) >>> 0,
        });
    }
    return { rockets };
}

/** The seconds until the next salvo (1.2…2 s). */
export const salvoGap = (r) => 1.2 + r() * 0.8;

// ------------------------------------------------------------------ shapes
/** A colour between two (0…1). */
function mix2(a, b, t) {
    const f = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
    return (f(16) << 16) | (f(8) << 8) | f(0);
}
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** `n` directions spread evenly over a sphere (a Fibonacci spiral), a little jittered. */
function sphere(n, r, scale = 1, out = [], jitter = 0.06) {
    for (let i = 0; i < n; i++) {
        const y = 1 - (2 * (i + 0.5)) / n, q = Math.sqrt(Math.max(0, 1 - y * y)), a = i * GOLDEN + r() * 0.3;
        const k = scale * (1 - jitter + r() * jitter * 2);
        out.push([Math.cos(a) * q * k, y * k, Math.sin(a) * q * k]);
    }
    return out;
}

/** A plane's two axes from its normal (horizontal normal → `right` is horizontal, `up` is up). */
function basis(nx, ny, nz) {
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(ny) > 0.95) { ux = 1; uy = 0; }
    // right = up × normal
    let rx = uy * nz - uz * ny, ry = uz * nx - ux * nz, rz = ux * ny - uy * nx;
    const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    // up' = normal × right
    const px = ny * rz - nz * ry, py = nz * rx - nx * rz, pz = nx * ry - ny * rx;
    return { r: [rx, ry, rz], u: [px, py, pz] };
}

/** A five-pointed star's outline (10 corners, alternate radius 1 and 0.42), `n` points along it. */
export function starOutline(n) {
    const corner = [];
    for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5, R = i % 2 ? 0.42 : 1;
        corner.push([Math.cos(a) * R, Math.sin(a) * R]);
    }
    const per = corner.map((c, i) => Math.hypot(corner[(i + 1) % 10][0] - c[0], corner[(i + 1) % 10][1] - c[1]));
    const total = per.reduce((a, b) => a + b, 0), out = [];
    for (let k = 0; k < n; k++) {
        let d = (k / n) * total, i = 0;
        while (d > per[i]) { d -= per[i]; i = (i + 1) % 10; }
        const f = d / per[i], a = corner[i], b = corner[(i + 1) % 10];
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    return out;
}

/** A heart's outline from the parametric curve x = 16 sin³t, y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t. */
export function heartOutline(n) {
    const out = [];
    for (let k = 0; k < n; k++) {
        const t = (k / n) * Math.PI * 2, s = Math.sin(t);
        out.push([(16 * s * s * s) / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.5) / 17]);
    }
    return out;
}

/**
 * The sparks of one burst. `opts.normal` [x,y,z]: the plane of a ring / star / heart (the star and the heart
 * face it). Returns { kind, style, parts: [{ o: [x,y,z] (in radii), c: colour, tail?: true (a bright white one) }] }.
 */
export function burstShape(kind, r, count, colors, opts = {}) {
    const K = KINDS[kind] || KINDS.peony;
    const [c1, c2] = colors;
    const parts = [];
    const add = (o, c, extra) => parts.push({ o, c, ...(extra || null) });
    const nrm = opts.normal || [r() - 0.5, 0.2 + r() * 0.8, r() - 0.5];
    switch (kind) {
        case 'peony': {
            // the rays: a ball in two layers (the long rays of one colour, a short white-hot stamen)
            const nOut = Math.round(count * 0.82);
            for (const o of sphere(nOut, r)) add(o, r() < 0.2 ? c2 : c1);
            for (const o of sphere(count - nOut, r, 0.5)) add(o, mix2(c1, 0xfff4d0, 0.55));
            break;
        }
        case 'chrysanthemum':
            for (const o of sphere(count, r, 1, [], 0.12)) add(o, r() < 0.3 ? c2 : c1, { comet: true });
            break;
        case 'willow':
            for (const o of sphere(count, r, 1, [], 0.1)) add(o, c1, { comet: true });
            break;
        case 'ring': {
            const b = basis(nrm[0], nrm[1], nrm[2]);
            for (let i = 0; i < count; i++) {
                const a = (i / count) * Math.PI * 2 + r() * 0.04, k = 0.96 + r() * 0.08;
                add([(b.r[0] * Math.cos(a) + b.u[0] * Math.sin(a)) * k, (b.r[1] * Math.cos(a) + b.u[1] * Math.sin(a)) * k, (b.r[2] * Math.cos(a) + b.u[2] * Math.sin(a)) * k], i % 9 === 0 ? c2 : c1);
            }
            for (const o of sphere(Math.max(6, Math.round(count * 0.1)), r, 0.25)) add(o, 0xfff4d0); // (a little pistil)
            break;
        }
        case 'star':
        case 'heart': {
            // faces the viewers on the side of the caster: the normal is horizontal
            const b = basis(nrm[0], 0, nrm[2]);
            const pts = kind === 'star' ? starOutline(count) : heartOutline(count);
            for (const [x, y] of pts) add([b.r[0] * x + b.u[0] * y, b.r[1] * x + b.u[1] * y, b.r[2] * x + b.u[2] * y], c1);
            for (const o of sphere(5, r, 0.1)) add(o, 0xfff4d0);
            break;
        }
        case 'double': {
            const nIn = Math.round(count * 0.4);
            for (const o of sphere(count - nIn, r)) add(o, c1);
            for (const o of sphere(nIn, r, 0.5)) add(o, c2);
            break;
        }
        case 'crossette':
            for (const o of sphere(count, r, 0.5, [], 0.1)) add(o, r() < 0.3 ? c2 : c1, { comet: true, cross: true });
            break;
        case 'glitter':
            for (const o of sphere(count, r, 1, [], 0.12)) add(o, r() < 0.55 ? 0xfff0c0 : r() < 0.5 ? c1 : c2, { glitter: true });
            break;
        default:
            for (const o of sphere(count, r)) add(o, c1);
    }
    return { kind, style: K, parts };
}

/** The four sparks a crossette's comet breaks into (offsets in radii from where it burst; `dir` the comet's own direction). */
export function crossSparks(dir, r) {
    const L = Math.hypot(dir[0], dir[1], dir[2]) || 1, d = [dir[0] / L, dir[1] / L, dir[2] / L];
    const b = basis(d[0], d[1], d[2]), a = r() * Math.PI;
    const out = [];
    for (let i = 0; i < 4; i++) {
        const t = a + (i * Math.PI) / 2, c = Math.cos(t), s = Math.sin(t);
        out.push([(b.r[0] * c + b.u[0] * s) * 0.5 + d[0] * 0.12, (b.r[1] * c + b.u[1] * s) * 0.5 + d[1] * 0.12, (b.r[2] * c + b.u[2] * s) * 0.5 + d[2] * 0.12]);
    }
    return out;
}

/**
 * «Fireworks» as the matcher hears it («файрворкс», «фаер воркс», «файрвокс»…): the fire word AND the works word, flat
 * (spaces removed). Checked BEFORE «Fire» / «Fire Maxima» / «Firefighting» (their fire word is the same).
 */
const FW_FLAT = /(fire|fier|fair|файр|фаер|фаир|фаэр|файер|фойр|фейр)(work|wark|werk|wox|vork|vark|ворк|верк|вурк|вокс|воск|вёрк)/;
export function fireworksWords(s) {
    const t = String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[\s\-–—.,!?]+/g, '');
    return FW_FLAT.test(t);
}

/** How many sparks / trails to make for a burst `dist` m from the viewer (far ones keep the ball, lose the detail). */
export function lod(dist) {
    return dist < 200 ? { parts: 1, trails: true } : dist < 450 ? { parts: 0.7, trails: true } : dist < 800 ? { parts: 0.5, trails: false } : { parts: 0.4, trails: false };
}
/** A far spark is drawn bigger so the burst stays a bright ball (capped). */
export const farSize = (dist) => Math.min(8, Math.max(1, dist / 90));
