/**
 * RealWear.js — what the «Реалистичный» hero has on (no THREE: built in the worker per look, cached): the hair of
 * the look's style (Appearance.HAIR_STYLES — short, long, a bun, a crew cut's spikes, a mohawk, bald, a ponytail,
 * curls) in thick locks (the hair material draws them as cut layers — the world's style, no single hairs), a beard, the hat (a cap, a beanie, the wizard's hat, a top hat, a hood, a headband, a cowboy
 * hat), glasses, and the clothes' parts the body's own surface cannot be: a skirt, a kilt, a cloak, a hoodie's hood.
 *
 * Every vertex as the body's (RealBuild: info / mix / limb), except the hair's: its `mix` is the way the hair lies
 * (xyz). Everything on the head is sculpted in the head's OLD measures and drawn through RealRig.HEADX; the body's
 * pieces (a skirt, a cloak, the robe, the pauldrons) in the torso's old measures, drawn through RealRig.bodyX.
 */
import { Shape, sphere, ellipsoid, cone, cap, hcone, etorus, plane, bump, meshSdf, norm, cross, add, mul, sub, dot } from './RealSdf.js';
import { simplify } from './RealSimplify.js';
import { headShape, skullBox, PART } from './RealAnatomy.js';
import { ANAT, B, Y, headX, headXn, bodyX, BODYX } from './RealRig.js';

const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const H = (y) => y - Y(0);
const SKULL = { c: [0, Y(4.21), 0.03], r: [0.2, 0.25, 0.245] };
/** The head's block pushed out by t (a cap, hair, a hat: blocks over the block — the world's style). */
const skull = (t, o) => skullBox(t, o);
/** Keeps what is over the hairline (higher in front, lower at the back). */
const hairline = (front = 4.3, back = 4.04) => plane([0, -1, -(front - back) / 0.45], -(Y((front + back) / 2) + 0.025 * (front - back) / 0.45));

/** The pieces a look needs, as a key (the same key: the same meshes). */
export function wearKey(look = {}, armor = null) {
    const f = look.face | 0;
    const hat = [5, 9].includes(look.hat) ? 0 : look.hat | 0;
    const a = armor || {};
    const robe = a.r | 0, helm = a.h | 0;
    // (a robe's hood or a helmet instead of the look's hat; a robe over the skirt; the cloak's and hoodie's pieces under a robe gone)
    return [look.hair | 0, helm ? 0 : robe ? 0 : hat, f % 9 === 5 ? 1 : 0, f % 10 === 8 ? 1 : 0, robe ? 0 : [2, 6].includes(look.bottom) ? look.bottom : 0, robe ? 0 : [1, 8].includes(look.top) ? look.top : 0,
        helm, a.c | 0, a.l | 0, robe].join('.');
}

// ------------------------------------------------------------------ the hair
function hairShape(style, hat) {
    const P = PART.head, list = [], cuts = [];
    const o = { part: P, zone: 13 };
    if (style === 5) return null; // (bald)
    const base = style === 3 ? 0.016 : style === 4 ? 0.006 : style === 7 ? 0.04 : style === 1 ? 0.03 : 0.026;
    list.push(skull(base, o));
    if (style === 0) list.push(ellipsoid([0, Y(4.37), -0.12], [0.16, 0.08, 0.12], I3, o)); // (the front's lift)
    if (style === 1) {
        // long: falling behind to the shoulders, strands framing the face
        list.push(ellipsoid([0, Y(3.95), 0.11], [0.21, 0.36, 0.13], I3, o));
        for (const s of [1, -1]) list.push(ellipsoid([0.175 * s, Y(4.02), -0.02], [0.045, 0.22, 0.09], I3, o));
    }
    if (style === 2) list.push(sphere([0, Y(4.43), 0.2], 0.08, o), sphere([0, Y(4.36), 0.22], 0.05, o));
    if (style === 3) {
        // a crew cut's spikes all over the top
        for (let i = 0; i < 46; i++) {
            const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 46);
            const th = r * 1.25, d = [Math.sin(th) * Math.cos(a), Math.cos(th), Math.sin(th) * Math.sin(a) * 0.9 + 0.05];
            const p0 = [SKULL.c[0] + d[0] * SKULL.r[0], SKULL.c[1] + d[1] * SKULL.r[1], SKULL.c[2] + d[2] * SKULL.r[2]];
            if (p0[1] < Y(4.28) - (p0[2] > 0 ? 0.15 : 0)) continue;
            list.push(cone(p0, add(p0, mul(norm(d), 0.05)), 0.018, 0.004, o));
        }
    }
    if (style === 4) {
        // the mohawk's ridge, in tufts
        for (let i = 0; i < 9; i++) {
            const t = -1 + i / 4, z = 0.03 + t * 0.21, y = Y(4.21) + 0.25 * Math.sqrt(Math.max(0, 1 - (t * 0.86) ** 2));
            list.push(cone([0, y - 0.03, z], [0, y + 0.1 - Math.abs(t) * 0.04, z + 0.04], 0.04, 0.008, o));
        }
    }
    if (style === 6) list.push(cone([0, Y(4.25), 0.25], [0, Y(3.72), 0.33], 0.052, 0.022, o), sphere([0, Y(4.2), 0.27], 0.05, o));
    if (style === 7) {
        // curls: round bunches all over
        for (let i = 0; i < 64; i++) {
            const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 64), th = r * 1.45;
            const d = [Math.sin(th) * Math.cos(a), Math.cos(th), Math.sin(th) * Math.sin(a) + 0.06];
            const p0 = [SKULL.c[0] + d[0] * (SKULL.r[0] + 0.04), SKULL.c[1] + d[1] * (SKULL.r[1] + 0.04), SKULL.c[2] + d[2] * (SKULL.r[2] + 0.04)];
            if (p0[1] < Y(4.24) - (p0[2] > 0.05 ? 0.2 : 0)) continue;
            list.push(sphere(p0, 0.034 + 0.01 * ((i * 7) % 3) / 2, o));
        }
    }
    const shape = new Shape().union(list, style === 7 ? 0.015 : 0.02);
    // locks: the hair's surface not a smooth cap — strands gathered in locks, a ragged fringe
    if (style !== 3 && style !== 4) {
        const locks = [];
        for (let i = 0; i < 70; i++) {
            const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 70), th = r * 1.55;
            const d = [Math.sin(th) * Math.cos(a), Math.cos(th), Math.sin(th) * Math.sin(a) + 0.05];
            const p0 = [SKULL.c[0] + d[0] * (SKULL.r[0] + base), SKULL.c[1] + d[1] * (SKULL.r[1] + base), SKULL.c[2] + d[2] * (SKULL.r[2] + base)];
            locks.push(bump(p0, [0.035, 0.05, 0.035], (i % 3 - 1) * 0.008 + 0.004, I3));
        }
        if (style !== 7) for (let i = -4; i <= 4; i++) locks.push(bump([i * 0.035, Y(4.31), -0.2 + Math.abs(i) * 0.008], [0.016, 0.03, 0.03], 0.012 * (1 + (i % 2) * 0.5), I3));
        shape.bumps(locks);
    }
    // the hairline (the face, the ears free); the long hair's fall stays
    const front = style === 4 ? 4.35 : 4.31, back = style === 1 ? 3.6 : style === 6 ? 3.6 : 4.02;
    const keep = [hairline(front, back)];
    shape.inter(keep, 0, 0.02);
    for (const s of [1, -1]) cuts.push(sphere([0.235 * s, Y(4.16), 0.02], 0.045, o)); // (round the ears)
    if (style === 1) cuts.push(ellipsoid([0, Y(3.95), -0.2], [0.17, 0.3, 0.16], I3, o), cone([0, Y(3.5), 0.05], [0, Y(3.95), 0.02], 0.14, 0.13, o)); // (the face, the neck)
    if (style === 4) for (const s of [1, -1]) cuts.push(ellipsoid([0.16 * s, Y(4.3), 0.03], [0.12, 0.25, 0.3], I3, o)); // (the shaved sides)
    if (hat) cuts.push(hatInside(hat));
    shape.cut(cuts, 0, 0.012);
    return shape;
}
/** Under a hat no hair is seen (it only shows below it). */
function hatInside(hat) {
    const low = { 1: 4.27, 2: 4.24, 3: 4.36, 4: 4.38, 6: 3.9, 7: 4.28, 8: 4.36, 20: 4.12, 21: 3.9 }[hat] ?? 4.3; // (20 a helmet, 21 a robe's hood)
    return cap([0, Y(low + 0.5), 0], I3, 0.6, 0.5, 0, { part: PART.head }); // (all the hair over its band: the block head's corners too)
}

function beardShape() {
    const o = { part: PART.head, zone: 15 };
    const list = [ellipsoid([0, Y(3.9), -0.11], [0.15, 0.1, 0.15], I3, o), ellipsoid([0, Y(3.95), -0.245], [0.055, 0.012, 0.02], I3, o)];
    for (const s of [1, -1]) list.push(cone([0.155 * s, Y(4.08), 0.0], [0.12 * s, Y(3.9), -0.12], 0.025, 0.04, o));
    const sh = new Shape().union(list, 0.03);
    sh.cut([ellipsoid([0, Y(3.925), -0.25], [0.05, 0.02, 0.04], I3, o), cone([0, Y(3.5), 0.05], [0, Y(3.85), -0.02], 0.13, 0.1, o)], 0, 0.01);
    return sh;
}

// ------------------------------------------------------------------ hats (zone 7: the hat, 8: its band, 12: gold)
function hatShape(hat) {
    const m = { part: PART.head, zone: 7 }, b = { part: PART.head, zone: 8 }, gold = { part: PART.head, zone: 12 };
    const sh = new Shape();
    const tiltF = (a) => [[1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)]];
    if (hat === 1) {
        // a cap: the crown in six panels' seams, the visor, the button
        sh.union([skull(0.035, m), ellipsoid([0, Y(4.3), -0.3], [0.15, 0.012, 0.13], tiltF(-0.12), m)], 0.01)
            .inter([plane([0, -1, -0.15], -Y(4.27))], 0, 0.006)
            .union([sphere([0, Y(4.495), 0.03], 0.016, b)], 0, 0.004);
    } else if (hat === 2) {
        // a beanie with its folded cuff and a pompom
        sh.union([skull(0.04, m), sphere([0, Y(4.53), 0.03], 0.055, b)], 0.015)
            .inter([plane([0, -1, -0.1], -Y(4.23))], 0, 0.006)
            .union([cap([0, Y(4.27), 0.03], tiltF(0.08), 0.235, 0.035, 0.012, b)], 0, 0.004)
            .cut([ellipsoid(SKULL.c, [0.215, 0.27, 0.26], I3, m)], 0, 0);
    } else if (hat === 3) {
        // the wizard's hat: a wide soft brim, a tall cone bending back, a gold band
        const f = tiltF(-0.12);
        sh.union([cap([0, Y(4.39), 0.02], f, 0.36, 0.008, 0.006, m)], 0)
            .union([hcone([0, Y(4.38), 0.03], tiltF(-0.2), 0.62, 0.215, 0.012, 0.004, m)], 0, 0.02)
            .union([cap([0, Y(4.43), 0.035], tiltF(-0.2), 0.2, 0.028, 0.004, gold)], 0, 0.004)
            .cut([skull(0.012, m)], 0, 0);
    } else if (hat === 4) {
        // a top hat: brim curled up at the sides, the tall crown, its band
        sh.union([cap([0, Y(4.4), 0.03], I3, 0.3, 0.008, 0.006, m)], 0)
            .bumps([bump([0.3, Y(4.41), 0.03], [0.07, 0.03, 0.2], -0.02), bump([-0.3, Y(4.41), 0.03], [0.07, 0.03, 0.2], -0.02)])
            .union([cap([0, Y(4.62), 0.03], I3, 0.2, 0.22, 0.012, m)], 0, 0.006)
            .union([cap([0, Y(4.46), 0.03], I3, 0.204, 0.04, 0.004, b)], 0, 0.002)
            .cut([skull(0.012, m)], 0, 0);
    } else if (hat === 6) {
        // a hood: a thick shell round the head, open for the face, lying on the shoulders
        sh.union([skull(0.065, m), ellipsoid([0, Y(3.78), 0.06], [0.28, 0.2, 0.28], I3, m)], 0.06)
            .cut([skull(0.035, m), ellipsoid([0, Y(3.75), 0.05], [0.24, 0.2, 0.24], I3, m), ellipsoid([0, Y(4.05), -0.3], [0.16, 0.27, 0.2], I3, m), plane([0, 1, 0], Y(3.62))], 0, 0.015);
    } else if (hat === 7) {
        // a headband
        sh.union([skull(0.012, m)]).inter([plane([0, -1, -0.25], -Y(4.27)), plane([0, 1, 0.25], Y(4.33))], 0, 0.004);
    } else if (hat === 8) {
        // a cowboy hat: the brim rolled up at the sides, the creased crown
        sh.union([ellipsoid([0, Y(4.4), 0.03], [0.44, 0.012, 0.4], I3, m)], 0.01)
            .bumps([bump([0.38, Y(4.41), 0.03], [0.1, 0.04, 0.22], -0.035), bump([-0.38, Y(4.41), 0.03], [0.1, 0.04, 0.22], -0.035)])
            .union([cap([0, Y(4.52), 0.03], I3, 0.195, 0.12, 0.03, m)], 0, 0.02)
            .union([cap([0, Y(4.42), 0.03], I3, 0.2, 0.025, 0.004, b)], 0, 0.002)
            .cut([ellipsoid([0, Y(4.67), 0.03], [0.05, 0.05, 0.16], I3, m), skull(0.012, m)], 0, 0.02);
    } else return null;
    return sh;
}

// ------------------------------------------------------------------ armour (zone 16: steel, 17: its trim) and the robe (zone 9)
/** A helmet (ArmorLook: 1 plain, 2 magic with a crest, 3 named — a crest and a plume): the bowl, cheek plates, the neck guard, a nasal. */
function helmetShape(code) {
    const st = { part: PART.head, zone: 16 }, tr = { part: PART.head, zone: 17 }, plume = { part: PART.head, zone: 8 };
    const sh = new Shape();
    const bowl = [skull(0.05, st)];
    for (const s of [1, -1]) bowl.push(ellipsoid([0.19 * s, Y(4.04), -0.07], [0.03, 0.13, 0.12], I3, st)); // the cheek plates
    bowl.push(ellipsoid([0, Y(4.0), 0.2], [0.2, 0.14, 0.07], I3, st)); // the neck guard
    sh.union(bowl, 0.03)
        .cut([skull(0.022, st), ellipsoid([0, Y(4.05), -0.3], [0.13, 0.16, 0.2], I3, st), plane([0, 1, 0], Y(3.88))], 0, 0.012)
        .union([etorus([0, Y(4.25), 0.03], 0.235, 0.28, 0.014, [[1, 0, 0], [0, 0, 1], [0, 1, 0]], tr), cone([0, Y(4.25), -0.268], [0, Y(4.13), -0.29], 0.012, 0.01, tr)], 0, 0.006);
    if (code >= 2) sh.union([ellipsoid([0, Y(4.5), 0.04], [0.02, 0.07, 0.24], I3, tr)], 0, 0.01); // the crest
    if (code === 3) sh.union([cone([0, Y(4.52), 0.1], [0, Y(4.75), 0.32], 0.05, 0.09, plume), sphere([0, Y(4.7), 0.3], 0.09, plume)], 0.04, 0.01); // the plume
    return sh;
}
/** A mage's hood: soft, round the head, its tip falling back (zone 9: the robe's colour). */
function robeHoodShape() {
    const m = { part: PART.head, zone: 9 };
    return new Shape().union([skull(0.065, m), ellipsoid([0, Y(3.78), 0.06], [0.28, 0.2, 0.28], I3, m), cone([0, Y(4.45), 0.18], [0, Y(4.2), 0.42], 0.09, 0.02, m)], 0.06)
        .cut([skull(0.035, m), ellipsoid([0, Y(3.75), 0.05], [0.24, 0.2, 0.24], I3, m), ellipsoid([0, Y(4.05), -0.3], [0.16, 0.27, 0.2], I3, m), plane([0, 1, 0], Y(3.62))], 0, 0.015);
}
/** The robe's skirt to the ankles (with soft folds), the pauldrons on the shoulders. */
function armourBodyShape(chest, robe) {
    const sh = new Shape();
    let any = false;
    if (robe) {
        const o = { part: PART.torso, zone: 9 }, f = [[1, 0, 0], [0, 1, 0], [0, 0, 1.2]];
        const folds = [];
        for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; folds.push(bump([Math.sin(a) * 0.56, Y(0.9), Math.cos(a) * 0.46 + 0.02], [0.03, 0.6, 0.03], 0.018)); }
        sh.union([hcone([0, Y(0.28), 0.02], f, 2.42, 0.58, 0.37, 0.01, o)], 0).bumps(folds)
            .cut([hcone([0, Y(0.26), 0.02], f, 2.5, 0.53, 0.33, 0, o)], 0, 0.004);
        any = true;
    }
    if (chest) {
        const st = { part: PART.torso, zone: 16 }, tr = { part: PART.torso, zone: 17 };
        const list = [], cuts = [];
        for (const s of [1, -1]) {
            const c = [0.6 * s, Y(3.52), 0.02];
            list.push(ellipsoid(c, [0.24, 0.17, 0.23], I3, st));
            for (let k = 1; k <= 2; k++) list.push(ellipsoid([0.63 * s + 0.04 * k * s, Y(3.52) - 0.09 * k, 0.02], [0.2, 0.12, 0.2], I3, k === 2 ? tr : st)); // the lames below
            cuts.push(ellipsoid(c, [0.2, 0.14, 0.19], I3, st), plane([0, 1, 0], Y(3.16)), ellipsoid([0.3 * s, Y(3.4), 0.02], [0.14, 0.3, 0.3], I3, st));
        }
        sh.union(list, 0.02).cut(cuts, 0, 0.01);
        any = true;
    }
    return any ? sh : null;
}

function glassesShape() {
    const o = { part: PART.head, zone: 11 };
    const E = ANAT.eye, list = [];
    const f = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (const s of [1, -1]) {
        list.push(etorus([E[0] * s, E[1] - 0.004, -0.262], 0.046, 0.033, 0.0045, f, o));
        list.push(cone([0.125 * s, Y(4.16), -0.25], [0.2 * s, Y(4.15), 0.0], 0.004, 0.0035, o)); // the temple's arm to the ear
    }
    list.push(cone([-0.035, Y(4.165), -0.268], [0.035, Y(4.165), -0.268], 0.004, 0.004, o)); // the bridge
    return new Shape().union(list, 0.004);
}

// ------------------------------------------------------------------ the clothes' own pieces (bound to the torso / legs)
function bodyAccShape(bottom, top) {
    const sh = new Shape(), I = I3;
    let any = false;
    if (bottom === 2 || bottom === 6) {
        // a skirt flaring to the knee (a kilt: shorter, pleated)
        const o = { part: PART.torso, zone: 10 }; // (zone 10: the bottoms' colour)
        const len = bottom === 6 ? 0.78 : 0.95;
        const pleats = [];
        if (bottom === 6) for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pleats.push(bump([Math.sin(a) * 0.46, Y(1.95), Math.cos(a) * 0.36 + 0.02], [0.02, 0.3, 0.02], 0.012)); }
        sh.union([hcone([0, Y(2.7) - len, 0.02], [[1, 0, 0], [0, 1, 0], [0, 0, 1.25]], len, 0.47, 0.34, 0.01, { part: PART.torso, zone: 10 })], 0)
            .bumps(pleats)
            .cut([hcone([0, Y(2.7) - len - 0.01, 0.02], [[1, 0, 0], [0, 1, 0], [0, 0, 1.25]], len + 0.03, 0.415, 0.285, 0, o)], 0, 0.004);
        any = true;
    }
    if (top === 8) {
        // a cloak: from the shoulders down the back, its collar round the neck, the clasp in front
        const c = { part: PART.torso, zone: 9 };
        sh.union([ellipsoid([0, Y(2.6), 0.05], [0.62, 1.15, 0.42], I, c), cap([0, Y(3.62), 0.03], I, 0.2, 0.05, 0.02, c)], 0.05)
            .cut([ellipsoid([0, Y(2.6), 0.05], [0.59, 1.2, 0.39], I, c), plane([0, 0, 1], 0.06), plane([0, 1, 0], Y(1.45)), cone([0, Y(3.5), 0.03], [0, Y(3.75), 0.02], 0.16, 0.15, c)], 0, 0.02)
            .union([sphere([0, Y(3.56), -0.17], 0.03, { part: PART.torso, zone: 12 })], 0, 0.004);
        any = true;
    }
    if (top === 1) {
        // the hoodie's hood lying on the back
        const c = { part: PART.torso, zone: 9 };
        sh.union([ellipsoid([0, Y(3.6), 0.2], [0.22, 0.11, 0.1], I, c)], 0, 0.02).cut([ellipsoid([0, Y(3.66), 0.17], [0.15, 0.06, 0.07], I, c)], 0, 0.01);
        any = true;
    }
    return any ? sh : null;
}

// ------------------------------------------------------------------ building them
class Pack {
    constructor() { this.pos = []; this.nor = []; this.idx = []; this.si = []; this.sw = []; this.info = []; this.mix = []; this.limb = []; this.n = 0; }
    vertex(p, n, w, info, mix, limb) {
        this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]);
        const e = Object.entries(w).filter(([, x]) => x > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
        let s = 0; for (const [, x] of e) s += x;
        for (let k = 0; k < 4; k++) { this.si.push(e[k] ? +e[k][0] : 0); this.sw.push(e[k] ? e[k][1] / s : 0); }
        this.info.push(...info); this.mix.push(...mix); this.limb.push(...limb);
        return this.n++;
    }
    done() {
        if (!this.n) return null;
        return { n: this.n, pos: new Float32Array(this.pos), nor: new Float32Array(this.nor), idx: new Uint32Array(this.idx), skinIndex: new Uint16Array(this.si), skinWeight: new Float32Array(this.sw), info: new Float32Array(this.info), mix: new Float32Array(this.mix), limb: new Float32Array(this.limb) };
    }
}

function add3(pack, m, fn, keep = 1, layers = [0], pmap = null) {
    let idx = m.idx, map = null, count = m.n;
    if (keep < 1) { const r = simplify(m.pos, m.idx, Math.round(m.idx.length / 3 * keep), m.zone); idx = r.idx; map = r.keep; count = r.count; }
    const order = new Int32Array(count);
    if (map) for (let v = 0; v < m.n; v++) { if (map[v] >= 0) order[map[v]] = v; } else for (let v = 0; v < m.n; v++) order[v] = v;
    for (const layer of layers) {
        const base = pack.n;
        for (let i = 0; i < count; i++) {
            const v = order[i], p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]], n = [m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]];
            const r = fn(p, n, m.zone[v], layer);
            r.info[1] = m.ao[v];
            pack.vertex(pmap ? pmap.p(p) : p, pmap ? pmap.n(n) : n, r.w, r.info, r.mix, r.limb);
        }
        for (let t = 0; t < idx.length; t++) pack.idx.push(base + idx[t]);
    }
}

/** The head's bones for a point on the hair / hat / beard (the long hair's ends with the neck and the shoulders). */
function headW(p) {
    const h = H(p[1]);
    const w = {};
    const low = sm(3.95, 3.6, h) * (p[2] > -0.05 ? 1 : 0);
    w[B.head] = 1 - low;
    if (low > 0) { w[B.neck] = low * 0.5; w[B.upperChest] = low * 0.5; }
    return w;
}
/** The way the hair lies: away from the crown, down the long hair's fall. */
function flowAt(p, n) {
    const crown = [0, Y(4.47), 0.06];
    let d = sub(p, crown);
    if (H(p[1]) < 4.1) d = [d[0] * 0.3, -1, d[2] * 0.3];
    const t = sub(d, mul(n, dot(d, n)));
    return norm(t);
}

/**
 * The look's pieces: {hair (the hair material: hair, beard, lashes), headAcc (hat, glasses), bodyAcc (skirt, cloak, hood)}.
 * `lod` 0 near / 1 far (coarser, one hair layer).
 */
export function buildRealWear(key, lod = 0) {
    const [hair, hat, glasses, beard, bottom, top, helm = 0, chest = 0, legs = 0, robe = 0] = String(key).split('.').map(Number);
    const cell = lod ? 0.018 : 0.0085, layers = [0];
    const HM = { p: headX, n: headXn }, BM = { p: bodyX, n: (n) => { const x = n[0] / BODYX.x, z = n[2] / BODYX.z, l = Math.hypot(x, n[1], z) || 1; return [x / l, n[1] / l, z / l]; } };
    const hairPack = new Pack(), headPack = new Pack(), bodyPack = new Pack();
    const head = headShape();
    const aoOf = (sh) => ({ dist: (x, y, z) => Math.min(sh.dist(x, y, z), head.dist(x, y, z)) });
    const hs = hairShape(hair, helm ? 20 : robe ? 21 : hat);
    if (hs) {
        const m = meshSdf(hs, [-0.34, Y(3.55), -0.4], [0.34, Y(4.65), 0.42], cell, { aoShape: aoOf(hs) });
        add3(hairPack, m, (p, n, zone, layer) => { const f = flowAt(p, n); return { w: headW(p), info: [13, 1, 0, 1], mix: [f[0], f[1], f[2], layer], limb: [0, 0, 0, 0] }; }, lod ? 0.5 : 0.22, layers, HM);
    }
    if (beard) {
        const m = meshSdf(beardShape(), [-0.24, Y(3.75), -0.3], [0.24, Y(4.15), 0.1], cell, { aoShape: aoOf(beardShape()) });
        add3(hairPack, m, (p, n, zone, layer) => {
            const h = H(p[1]), jaw = sm(3.93, 3.89, h) * sm(0.04, -0.1, p[2]);
            return { w: { [B.jaw]: jaw, [B.head]: 1 - jaw }, info: [15, 1, 0, 1], mix: [0, -1, 0, layer], limb: [0, 0, 0, 0] };
        }, lod ? 0.5 : 0.25, layers, HM);
    }
    const hatS = helm ? helmetShape(helm) : robe ? robeHoodShape() : hat ? hatShape(hat) : null;
    if (hatS) {
        const big = helm || robe || hat === 6;
        const m = meshSdf(hatS, [-0.47, Y(3.5), -0.47], [0.47, Y(5.1), 0.47], lod ? 0.022 : big ? 0.011 : 0.009, { aoShape: aoOf(hatS) });
        add3(headPack, m, (p, n, zone) => ({ w: headW(p), info: [zone, 1, 0, 1], mix: [0, 0, 0, 0], limb: [0, 0, 0, 0] }), lod ? 0.5 : big ? 0.2 : 0.28, [0], HM);
    }
    if (glasses) {
        const m = meshSdf(glassesShape(), [-0.22, Y(4.1), -0.28], [0.22, Y(4.22), 0.05], lod ? 0.008 : 0.0032, { ao: false });
        add3(headPack, m, () => ({ w: { [B.head]: 1 }, info: [11, 1, 0, 1], mix: [0, 0, 0, 0], limb: [0, 0, 0, 0] }), 0.5, [0], HM);
    }
    for (const [bs, lo, hi, cell, keep] of [[bodyAccShape(bottom, top), [-0.68, Y(1.3), -0.5], [0.68, Y(3.8), 0.52], 0.014, 0.5], [armourBodyShape(chest, robe), [-0.95, Y(0.2), -0.62], [0.95, Y(3.78), 0.62], 0.02, 0.35]]) {
        if (!bs) continue;
        const m = meshSdf(bs, lo, hi, lod ? cell * 2.2 : cell, { ao: true });
        add3(bodyPack, m, (p, n, zone) => ({ w: accW(p, zone), info: [zone, 1, 0, 0], mix: [0, 0, 0, 0], limb: [0, 0, 0, 0] }), lod ? 0.6 : keep * 0.6, [0], BM);
    }
    return { hair: hairPack.done(), headAcc: headPack.done(), bodyAcc: bodyPack.done() };
}

/** A skirt goes with the hips and, lower, with each thigh; a cloak with the spine, its collar with the chest. */
function accW(p, zone) {
    const h = H(p[1]), w = {};
    if (zone >= 16 && h > 3.1) { const s = p[0] < 0 ? 'L' : 'R'; w[B['upperArm' + s]] = 0.6; w[B['clav' + s]] = 0.4; return w; } // (a pauldron rides the shoulder)
    if (zone >= 8.5 && zone < 9.5 && h < 2.6) zone = 10; // (a robe's skirt: as a skirt)
    if (zone >= 9.5 && zone < 10.5) {
        const low = sm(2.55, 1.9, h), side = sm(-0.05, 0.12, Math.abs(p[0])) * 0.5;
        w[B.hips] = 1 - low * (0.35 + side);
        w[p[0] < 0 ? B.thighL : B.thighR] = low * (0.15 + side);
        w[p[0] < 0 ? B.thighR : B.thighL] = low * 0.2;
        return w;
    }
    // (the old heights of the spine's bones: the piece is weighted where it was sculpted)
    const k = [[B.hips, 2.45], [B.spine, 2.72], [B.chest, 3.05], [B.upperChest, 3.35]];
    if (h <= 2.45) { w[B.hips] = 1; return w; }
    for (let i = 0; i < k.length - 1; i++) if (h <= k[i + 1][1]) { const t = (h - k[i][1]) / (k[i + 1][1] - k[i][1]); w[k[i][0]] = 1 - t; w[k[i + 1][0]] = t; return w; }
    w[B.upperChest] = 1;
    return w;
}
