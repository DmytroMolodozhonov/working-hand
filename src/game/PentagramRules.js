/**
 * Pentagrams.js — pentagrams on the ground and the spell «Пентаграниум» (Pentagranium): the rules, pure (node-testable).
 *
 * The author: a pentagram is DRAWN with the wand on the ground — a circle first, then a five-pointed star inside it.
 * Black magic (DarkMagic.js: «презираемая магия»; the mark and the rite give +1 to the black mage's level). There are
 * several pentagrams (`PENTAGRAMS`): each one is a figure that is known only from its own drawing-scroll
 * ({kind: 'scroll', stat: 'pentagram', pent: id}). A drawing-scroll can't be burnt (it teaches nothing, gives no mana):
 * it is only unrolled and LOOKED at — and the figure is remembered (the hero's `seen` list, saved). Without having seen
 * the figure nothing is accepted, however right the drawing is. Now the figure that works is «Пентаграмма дьявольской силы»
 * (`devil`); the others are blanks («вид есть, эффект позже»).
 *
 * The drawing: the wand's ray on the ground leaves a dark glowing trail; the stitches of the stroke are normalised and
 * compared with the template «circle + star inside» (`recognize`) — a big tolerance (a crooked, trembling, imperfect figure
 * counts: the author — «если рисунок хоть минимально похож»), but a scribble does not. The figure may be rotated and a bit
 * oval. The circle must come first.
 *
 * The rite (devil): the body of a killed WIZARD (not bones) whose power the hero has already taken (Mana.killWon /
 * duelWon — the same body) is laid on the lit pentagram with «Вингардиум Левиоса» and let go. The pentagram flares with
 * hellfire, the body sinks into ash, and the hero gets once more `RITE.K` (25 %) of the killed wizard's power
 * ((his maximum − 30), the same formula as a kill — Mana.killGain). Once per body (`b.rit`).
 *
 * ON WHOM / ON WHAT (CLAUDE.md): see PENTAGRAM_TARGETS.
 */

import { PENTAGRAMS as TABLE, registerPentagram } from './Pentagrams.js';
import { ENCHANT_PENTAGRAM } from './Enchant.js';

export const PENT = {
    COST: 20, // mana at once (Combat.SPELL_COST.Pentagranium)
    DRAIN: 1, // mana a second while drawing
    DRAW_MAX: 90, // s: the drawing lasts at most this long (then the concentration ends)
    LIFE: 480, // s of game time a pentagram stays lit (8 minutes) if no rite is made
    R_MIN: 3, R_MAX: 8, // m: the circle's radius that counts (the author: 3…8; the hero is ~3.5 m, a body lies ~3.5 m long)
    STEP: 0.3, // m: a stitch of the trail every this far
    MAX_PTS: 640, // stitches in all
    SPREAD: 16, // m: a stitch farther than this from the first one is not taken
    GAP: 4, // m: the wand jumps farther than this between two frames — a new stroke
    REACH: 28, // m: the wand's ray looks for the ground this far
    MAX_ALIVE: 6, // pentagrams lit at once (the oldest goes out)
    CHECK_EVERY: 0.5, // s: the figure is compared again at most this often
    CHECK_MIN_NEW: 8, // …and only when this many new stitches came
    FLOOR_DIFF: 1, // layers: the ground under the ring changed by more — the pentagram goes out
    FAR: 140, // m: farther than this a pentagram is not drawn
};

/** The rite: the share of the killed wizard's power given once more (the author: 25 %), the time of the burning. */
export const RITE = { K: 0.25, BURN: 5, EMBERS: 8, REACH_K: 0.85, SETTLE: 0.6, DARK: 1 };

/** Only the rite of the black (devil) pentagram darkens the hero (+1, DarkMagic.addDark); drawing a pentagram is no sin: there are good ones too (the author). */

const TAU = Math.PI * 2;

/** A star's vertices (unit circle, the first up): the order of the one-stroke star {5/2}. */
export function starPoints(rot = 0) {
    const out = [];
    for (let k = 0; k < 5; k++) {
        const a = rot + Math.PI / 2 + ((k * 2) % 5) * (TAU / 5);
        out.push([Math.cos(a), Math.sin(a)]);
    }
    return out;
}

/** A ring of `n` points of the unit circle. */
export function ringPoints(n = 72, rot = 0) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; out.push([Math.cos(a), Math.sin(a)]); }
    return out;
}

/** Samples along a polyline of unit coordinates, `n` of them evenly. */
function along(poly, n, close = false) {
    const pts = close ? [...poly, poly[0]] : poly;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1], out = [];
    let seg = 1;
    for (let k = 0; k < n; k++) {
        const s = (k / n) * len;
        while (seg < pts.length - 1 && cum[seg] < s) seg++;
        const a = pts[seg - 1], b = pts[seg], u = (s - cum[seg - 1]) / ((cum[seg] - cum[seg - 1]) || 1);
        out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    return out;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** The lines of a table entry's drawing (closed polylines, unit radius, the first corner up) — from its `shape` (a star {n/skip}) or its `draw` list (polygons). */
function linesOf(def) {
    const S = def.shape;
    if (S?.star) {
        const n = S.star, skip = S.skip || 1, k = gcd(n, skip), rot = S.inverted ? Math.PI : 0, per = n / k;
        const corner = (i) => { const a = rot + Math.PI / 2 + i * (TAU / n); return [Math.cos(a), Math.sin(a)]; };
        return Array.from({ length: k }, (_, o) => Array.from({ length: per }, (_, j) => corner((o + j * skip) % n)));
    }
    // a `draw` list (circle / poly): the inner circles are sampled as polygons, the polygons as they are
    const polys = (def.draw || []).filter((d) => d.t === 'poly' || (d.t === 'circle' && d.r < 0.99)).map((d) => (d.t === 'poly' ? d.pts.map(([x, z]) => [x, -z]) : Array.from({ length: 28 }, (_, i) => [Math.cos((i / 28) * TAU) * d.r, Math.sin((i / 28) * TAU) * d.r])));
    return polys.length ? polys : null;
}

/** The figures of the shared table (Pentagrams.js: the other sessions' pentagrams too) that have a drawing, with what the recognition and the scroll need. */
const _figs = new Map();
export function figureOf(id) {
    const def = TABLE[id];
    if (!def) return null;
    let f = _figs.get(id);
    if (f && f.def === def) return f;
    const lines = linesOf(def);
    if (!lines) return null;
    const star = def.shape?.star;
    const sym = def.sym || (star ? TAU / star : TAU);
    f = {
        def, id, lines, sym,
        ru: def.title || def.ru || id,
        ink: def.glow ?? 0xc01830, paper: 0x2a1418, seal: 0x7a0d18,
        figure: star ? (def.shape.inverted ? `перевёрнутая ${star === 5 ? 'пятиконечная' : star}-лучевая звезда` : star === 5 ? 'пятиконечная звезда' : `${star}-лучевая звезда`) : 'фигура со свитка',
        circle: ringPoints(72),
        samples: sampleFigure(lines, 80),
        works: true,
    };
    _figs.set(id, f);
    return f;
}
/** Ids of all the pentagrams that can be drawn. */
export const figureIds = () => Object.keys(TABLE).filter((id) => figureOf(id));
/** The figure's lines turned by `a` in the (x, z) plane: the way the recognition found it. */
export function figureLines(id, a = 0) {
    const f = figureOf(id) || figureOf('devil');
    const ca = Math.cos(a), sa = Math.sin(a);
    return f.lines.map((poly) => poly.map(([x, z]) => [x * ca - z * sa, x * sa + z * ca]));
}

/** Samples of a figure's lines (`n` in all, shared by length). */
function sampleFigure(polys, n) {
    const len = (poly) => poly.reduce((t, p, i) => t + Math.hypot(p[0] - poly[(i + 1) % poly.length][0], p[1] - poly[(i + 1) % poly.length][1]), 0);
    const total = polys.reduce((t, q) => t + len(q), 0);
    return polys.flatMap((q) => along(q, Math.max(8, Math.round(n * len(q) / total)), true));
}

// The good pentagrams the author asked for (PentagramUse.js: what standing on them does). `permanent`: drawn once, they stay on the ground for good (saved, at most USE.PERM_MAX).
const sq = Math.SQRT1_2;
registerPentagram({
    id: 'teleport', title: 'Пентаграмма телепортации', dark: false, glow: 0xcfe8ff, cost: 50, permanent: true, scroll: 'PentagramTeleport', sym: TAU / 4,
    draw: [{ t: 'circle', r: 1 }, { t: 'poly', pts: [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([x, z]) => [x * 0.999, z * 0.999]) }, { t: 'circle', r: 0.3 }], // (a square set in the circle by its corners, a small circle inside it that touches nothing)
    effect: 'Встаньте на неё, постойте 3 секунды и заплатите 50 маны — вы окажетесь на парной пентаграмме телепортации, где бы она ни была. Нужны две такие пентаграммы.',
});
registerPentagram({
    id: 'life', title: 'Пентаграмма жизни', dark: false, glow: 0x9be88a, cost: 50, permanent: true, scroll: 'PentagramLife',
    draw: [{ t: 'circle', r: 1 }, { t: 'poly', pts: [[0, 0.7], [0, -0.7]] }, { t: 'poly', pts: [[0, 0.05], [-0.6, -0.5], [-0.5, 0.2]] }, { t: 'poly', pts: [[0, -0.2], [0.6, 0.35], [0.5, -0.4]] }], // (a sprout: a stem and two leaves)
    effect: 'Встаньте на неё и заплатите 50 маны — здоровье вернётся целиком, кровь перестанет течь. Пользоваться можно сколько угодно раз.',
});
registerPentagram({
    id: 'mend', title: 'Пентаграмма починки брони', dark: false, glow: 0xdfe6f0, cost: 'MEND_COST', permanent: true, scroll: 'PentagramMend',
    draw: [{ t: 'circle', r: 1 }, { t: 'poly', pts: [[-0.55, 0.6], [0.55, 0.6], [0.55, -0.05], [0, -0.75], [-0.55, -0.05]] }], // (a shield)
    effect: 'Встаньте на неё — броня, которая на вас, будет починена. Плата за каждую часть своя; на что не хватило маны, то останется как было.',
});

registerPentagram({ ...ENCHANT_PENTAGRAM, title: ENCHANT_PENTAGRAM.ru }); // (the enchanting pentagram of the other session: its drawing is recognised here, its circle is laid by EnchantCircles — Pentagranium._others)

// «Пентаграмма дьявольской силы» — the one this module owns (its rite is below); the others' entries come from their own modules (Breakward, Gargoyles, Enchant…).
registerPentagram({
    id: 'devil', title: 'Пентаграмма дьявольской силы', dark: true, glow: 0xc01830, cost: 0, once: false, scroll: 'PentagramDevil',
    shape: { ring: 1, star: 5, skip: 2 }, rite: { cost: 50 }, // (the rite takes 50 mana: laid on the pentagram, nothing is said)
    effect: 'Положите на горящую пентаграмму тело убитого вами волшебника (силу его вы уже забрали) — и получите ещё 25% его силы. Одно тело — один раз.',
});

/** A drawing-scroll with this figure. */
export const pentagramScroll = (id, uid) => ({ kind: 'scroll', uid, stat: 'pentagram', pent: figureOf(id) ? id : 'devil', dark: !!TABLE[figureOf(id) ? id : 'devil']?.dark });
export const isPentagramScroll = (it) => !!it && it.kind === 'scroll' && it.stat === 'pentagram';

// ---------------------------------------------------------------- the drawing

/** Distance from a point to the nearest of `pts` (an array of [x, z]). */
function near(p, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
        const dx = pts[i][0] - p[0], dz = pts[i][1] - p[1], d = dx * dx + dz * dz;
        if (d < best) best = d;
    }
    return Math.sqrt(best);
}

export const RECOG = {
    TOL: 0.15, // of the radius: a stitch this near the figure counts as on it (a wider band lets a dense scribble pass: it covers most of the disc)
    CIRCLE_COVER: 0.8, // the share of the circle that must be drawn
    STAR_COVER: 0.74, // … of the star
    PRECISION: 0.8, // … the share of the stitches that lie on the figure
    CORE_R: 0.5, CORE_COVER: 0.7, // the figure's heart (within 0.5 of the radius) must be drawn too
    MEAN_ERR: 0.085, // of the radius: the mean distance of the stitches from the figure (a dense scribble never gets this close; a shaky hand — 0.12 of the radius of tremble — does)
    FIRST_ON_CIRCLE: 0.55, // the share of the first third of the stitches on the circle («круг сначала»)
    MIN_PTS: 40,
    ROTATIONS: 12, // the star turned in steps of 72° / 12
    SCALES: [0.86, 1, 1.14],
    SHIFT: 0.07, // of the radius
    MAX_USE: 90, // stitches kept for the comparison (resampled)
};

/** Resample the stitches evenly along the way (keeps the order). */
export function resample(pts, n) {
    if (pts.length <= n) return pts.slice();
    const out = [];
    for (let i = 0; i < n; i++) out.push(pts[Math.round((i / (n - 1)) * (pts.length - 1))]);
    return out;
}

/**
 * Is the drawing the figure of `pent`? `pts`: stitches in the ground's plane, in the order drawn, [[x, z]…].
 * @returns {{ok: boolean, why?: string, cx?: number, cz?: number, r?: number, rot?: number, score?: number, circle?: number, star?: number, precision?: number}}
 * why: 'few' | 'size' | 'small' | 'large' | 'circle' | 'star' | 'mess' | 'order'
 */
export function recognize(pts, pent = 'devil') {
    const P = figureOf(pent) || figureOf('devil');
    if (!pts || pts.length < RECOG.MIN_PTS) return { ok: false, why: 'few' };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
    const w = x1 - x0, h = z1 - z0;
    const R0 = Math.max(w, h) / 2;
    if (R0 < PENT.R_MIN * 0.5) return { ok: false, why: 'size' };
    if (Math.min(w, h) < Math.max(w, h) * 0.55) return { ok: false, why: 'mess' }; // (a long line, not a round figure)
    const use = resample(pts, RECOG.MAX_USE);
    const ROTS = Math.max(RECOG.ROTATIONS, Math.ceil(P.sym / 0.26)); // (a figure with a wider symmetry needs more turns)
    const first = use.slice(0, Math.max(8, Math.floor(use.length / 3)));
    const cx0 = (x0 + x1) / 2, cz0 = (z0 + z1) / 2;
    let best = null;
    const shifts = [[0, 0], [RECOG.SHIFT, 0], [-RECOG.SHIFT, 0], [0, RECOG.SHIFT], [0, -RECOG.SHIFT]];
    // the circle first: one fit of the circle (centre, radius), then the star turned
    for (const [sx, sz] of shifts) {
        for (const k of RECOG.SCALES) {
            const R = R0 * k, cx = cx0 + sx * R0, cz = cz0 + sz * R0;
            const q = use.map((p) => [(p[0] - cx) / R, (p[1] - cz) / R]);
            const ring = P.circle;
            let cc = 0;
            for (const s of ring) if (near(s, q) <= RECOG.TOL) cc++;
            cc /= ring.length;
            if (cc < RECOG.CIRCLE_COVER * 0.7) continue; // (no use turning the star)
            for (let t = 0; t < ROTS; t++) { // (every turn of the figure's own symmetry: an asymmetric one — the whole round)
                const a = (t / ROTS) * P.sym, ca = Math.cos(a), sa = Math.sin(a);
                const star = P.samples.map((s) => [s[0] * ca - s[1] * sa, s[0] * sa + s[1] * ca]);
                let sc = 0, kc = 0, kn = 0;
                for (const s of star) {
                    const hit = near(s, q) <= RECOG.TOL;
                    if (hit) sc++;
                    if (Math.hypot(s[0], s[1]) < RECOG.CORE_R) { kn++; if (hit) kc++; } // (the heart of the figure where its lines cross: a second circle can not stand in for it)
                }
                sc /= star.length;
                if (kn && kc / kn < RECOG.CORE_COVER) continue;
                let on = 0, err = 0;
                for (const p of q) { const e = Math.min(near(p, ring), near(p, star)); err += e; if (e <= RECOG.TOL) on++; }
                const prec = on / q.length, mean = err / q.length;
                const score = cc * 0.4 + sc * 0.4 + prec * 0.2;
                if (!best || score > best.score) best = { score, circle: cc, star: sc, precision: prec, mean, cx, cz, r: R, rot: a };
            }
        }
    }
    if (!best) return { ok: false, why: 'circle' };
    if (best.circle < RECOG.CIRCLE_COVER) return { ok: false, why: 'circle', ...best };
    if (best.star < RECOG.STAR_COVER) return { ok: false, why: 'star', ...best };
    if (best.precision < RECOG.PRECISION || best.mean > RECOG.MEAN_ERR) return { ok: false, why: 'mess', ...best };
    if (best.r < PENT.R_MIN) return { ok: false, why: 'small', ...best };
    if (best.r > PENT.R_MAX) return { ok: false, why: 'large', ...best };
    // the circle comes first
    const q1 = first.map((p) => [(p[0] - best.cx) / best.r, (p[1] - best.cz) / best.r]);
    let onc = 0;
    for (const p of q1) if (near(p, P.circle) <= RECOG.TOL * 1.25) onc++;
    if (onc / q1.length < RECOG.FIRST_ON_CIRCLE) return { ok: false, why: 'order', ...best };
    return { ok: true, ...best };
}

/**
 * Which figure is it, of ALL of them (the tolerance is big, so the figures are told apart by which fits best: a hexagram
 * is never taken for a pentagram while the hexagram fits better)? `{id, ...recognize}` of the best fit, ok or not.
 */
export function recognizeAny(pts, prefer = null) {
    return bestOf(figureIds().map((id) => [id, recognize(pts, id)]), prefer);
}

/** The best of the results `[[id, recognize()]…]` (a figure not refused beats one that is; alike drawings: the one in `prefer`). */
export function bestOf(results, prefer = null) {
    let best = null;
    for (const [id, r] of results) {
        const sc = (r.ok ? 1 + r.score : r.score || 0) + (prefer?.has(id) ? 0.003 : 0);
        if (!best || sc > best.sc) best = { sc, id, ...r };
    }
    if (!best) return { ok: false, why: 'few' };
    delete best.sc;
    return best;
}

/** The hint for a refused drawing (why → text), or null. */
export function recognizeHint(why) {
    switch (why) {
        case 'small': return '🩸 Круг слишком мал — тело не поместится (нужен круг в человеческий рост и больше)';
        case 'large': return '🩸 Круг слишком велик — магия не дотянется до края';
        case 'order': return '🩸 Сначала круг, потом звезда внутри него';
        case 'star': return '🩸 Круг есть — внутри нужна пятиконечная звезда';
        default: return null;
    }
}

// ---------------------------------------------------------------- the scrolls and what the hero has seen

/** The set of the figures the hero has unrolled and looked at (saved). */
export class Seen {
    constructor() { this.set = new Set(); }
    add(id) { if (!figureOf(id) || this.set.has(id)) return false; this.set.add(id); return true; }
    has(id) { return this.set.has(id); }
    snapshot() { return [...this.set]; }
    restore(list) { this.set = new Set((Array.isArray(list) ? list : []).filter((k) => figureOf(k))); }
    clear() { this.set.clear(); }
}

// ---------------------------------------------------------------- the rite

/**
 * May this body be laid on the pentagram `pent` for the rite? Pure.
 * `b`: a Death body ({k, mm, wz, rit, lg, bones?, who}); `took`: has the hero already taken this body's power
 * (Mana.duelsWon.get(who) === 'kill'); `free`: Creative (no mana rules).
 * @returns {{ok: boolean, why?: string}} why: 'bones' | 'player' | 'legacy' | 'no-power' | 'done' | 'not-taken' | 'blank'
 */
export function riteBody(b, pent = 'devil', { took = false, free = false } = {}) {
    if (pent !== 'devil') return { ok: false, why: 'blank' }; // (the rite is this pentagram's; the others' effects are their own modules')
    if (!b) return { ok: false, why: 'no-power' };
    if (b.rit) return { ok: false, why: 'done' };
    if (b.bones || b.stage === 'bones') return { ok: false, why: 'bones' };
    if (b.lg) return { ok: false, why: 'legacy' }; // (a hero's body holding his own power: only he can take it, by his own spell)
    if (b.k === 'p') return { ok: false, why: 'player' }; // (another player: the power of a hero is his own, Legacy.js)
    if (!b.wz || !(b.mm > 0)) return { ok: false, why: 'no-power' }; // (people, knights, animals: no magic in them)
    if (!free && !took) return { ok: false, why: 'not-taken' };
    return { ok: true };
}

/** Text for the refusals of the rite (the action asks — the body is on the pentagram). */
export const RITE_HINT = {
    bones: '🩸 Кости не подходят — нужно тело убитого волшебника',
    player: '🩸 Сила героя принадлежит только ему самому — на чужом теле обряд не идёт',
    legacy: '🩸 В этом теле лежит сила самого героя — обряд над ним не нужен',
    'no-power': '🩸 В теле нет магической силы',
    done: '🩸 Эта сила уже отдана обряду — второй раз тело ничего не даст',
    'not-taken': '🩸 Сначала заберите силу волшебника (победой в дуэли или убив его) — потом тело ляжет на пентаграмму',
    blank: '🩸 Эта пентаграмма пока ничего не делает — вид есть, эффект позже',
};

/** The extra power of the rite: `RITE.K` of (the killed wizard's maximum − 30), at least 1. */
export function riteGain(oppMax, base = 30) {
    const n = Math.round(RITE.K * ((Number(oppMax) || base) - base));
    return Math.max(1, n);
}

// ---------------------------------------------------------------- where it is

/** The point (x, z) is inside the pentagram's circle (scaled by `k`). */
export const inside = (pg, x, z, k = 1) => Math.hypot(x - pg.x, z - pg.z) <= pg.r * k;

/** Is a pentagram a spell target (CLAUDE.md)? The pentagram is a mark on the ground, not a creature or a thing. */
export const PENTAGRAM_TARGETS = {
    me: { does: 'none', why: 'колдующего не задевает: пентаграмма — след на земле, не удар' },
    players: { does: 'none', why: 'других игроков не трогает; они видят пентаграмму и ритуал (сообщения pgm / pgr)' },
    zombies: { does: 'none', why: 'зомби её не боятся и не топчут: это светящийся рисунок, не препятствие' },
    castlePeople: { does: 'alarm', why: 'жители, увидев чёрную магию (круг и звезда), пугаются как от опасной магии — castleLife.alarm(pos, "dark")' },
    animals: { does: 'none', why: 'животные её не замечают' },
    sailors: { does: 'none', why: 'на палубе пентаграмма не рисуется: корабль — не земля (ships.footprintAt)' },
    spider: { does: 'none', why: 'не задевает' },
    livingTrees: { does: 'none', why: 'не задевает' },
    bookBirds: { does: 'none', why: 'не задевает' },
    iceCastle: { does: 'none', why: 'на льду Королевы рисунок не держится: лёд — не земля для чёрной магии; Королеву не задевает' },
    blackship: { does: 'none', why: 'в море нет земли; сам корабль заклинанием не повреждается' },
    dragon: { does: 'none', why: 'дракон не замечает; огонь ритуала дракона не жжёт' },
    phoenix: { does: 'none', why: 'не касается' },
    owl: { does: 'none', why: 'не касается' },
    bodies: { does: 'rite', why: 'тело убитого волшебника (не кости), с которого герой забрал силу, на пентаграмме сгорает в пепел: +25 % силы убитого, один раз на тело' },
    items: { does: 'none', why: 'вещи на земле не трогает' },
    blocks: { does: 'none', why: 'блоков не ломает; если земля под рисунком изменилась — пентаграмма гаснет' },
    water: { does: 'none', why: 'на воде не рисуется (луч палочки не находит земли)' },
    ground: { does: 'mark', why: 'цель — земля под палочкой: светящийся след, потом круг и звезда' },
    ward: { does: 'none', why: 'в чужой сфере защиты дома не рисуется (HouseWards.forbids)' },
    godGift: { does: 'none', why: 'на дарах богов и в их храме не рисуется — защита сильнее' },
    enchanted: { does: 'none', why: 'на заколдованном камне (арены, башни волшебников) рисунок не держится' },
    space: { does: 'none', why: 'в космосе нет земли; на планетах — только там, где есть твёрдая земля (рисунок как на Земле)' },
    spells: { does: 'none', why: 'пентаграмма — не преграда; заряды дуэли и лучи идут сквозь неё' },
};
