/**
 * CreatureForge.js — the body of a creature of one's own («Да пусть создастся существо …»): a recipe (CreationRules — its
 * skeleton template, proportions, eyes, horns, tail, wings…) → the measures of every part, in metres. Pure numbers, no
 * THREE: the model (entities/CustomCreatureModel.js) is built from them, the game's bodies (hits, crowd, Imperius) too.
 *
 * As in Spore (the author): skeletons thought out ahead — nine templates (PLANS) — and great freedom inside them: how long
 * the legs and how thick, how many, the neck, the head, the eyes (1–8, how big), ears, horns, the tail's kind and length,
 * the wings' kind and span, the size from a mouse to a beast over a house. Whatever the numbers, the body holds together:
 * every part hangs on its parent, the legs reach the ground, the wings fold along the body.
 *
 * Model space: the feet on y = 0, the front looking along −z (as every creature of the game), +x its right.
 *   creatureDims(recipe, seed) → {H, plan, torso, head, neck, legs[], wings[], tail, eyes[], horns[], ears, hit, …}
 */

import { createRng } from '../core/math.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** How tall each template stands against its size (the recipe's size is the creature's height). */
const TEMPLATE = {
    quadruped: { leg: 0.4, tw: 0.17, th: 0.17, tl: 0.33, neck: 0.16, head: 0.14, upright: false },
    dragon: { leg: 0.32, tw: 0.17, th: 0.15, tl: 0.36, neck: 0.3, head: 0.12, upright: false },
    biped: { leg: 0.44, tw: 0.15, th: 0.18, tl: 0.1, neck: 0.04, head: 0.12, upright: true },
    bird: { leg: 0.32, tw: 0.16, th: 0.18, tl: 0.24, neck: 0.12, head: 0.12, upright: false },
    insect: { leg: 0.3, tw: 0.12, th: 0.11, tl: 0.18, neck: 0.02, head: 0.1, upright: false },
    spider: { leg: 0.34, tw: 0.16, th: 0.13, tl: 0.16, neck: 0, head: 0.09, upright: false },
    serpent: { leg: 0.12, tw: 0.16, th: 0.16, tl: 0.16, neck: 0.1, head: 0.17, upright: false },
    fish: { leg: 0.12, tw: 0.13, th: 0.24, tl: 0.42, neck: 0, head: 0.18, upright: false },
    blob: { leg: 0.08, tw: 0.44, th: 0.4, tl: 0.42, neck: 0, head: 0, upright: false },
};

/**
 * The measures of a creature (metres). `seed` gives this one its own small differences (±6 % of size, a little
 * thicker or thinner) — two of a kind are never quite alike.
 */
export function creatureDims(recipe, seed = 1) {
    const r = createRng(seed >>> 0);
    const plan = TEMPLATE[recipe.plan] ? recipe.plan : 'quadruped';
    const T = TEMPLATE[plan];
    const H = clamp(recipe.size || 1.6, 0.3, 14) * (0.94 + r() * 0.12);
    const fat = 0.92 + r() * 0.16;
    const legLen = clamp(recipe.legLen ?? 1, 0.3, 2.2), legThick = clamp(recipe.legThick ?? 1, 0.3, 2);
    const nLegs = clamp(Math.round(recipe.legs ?? 4), 0, 8);
    // the trunk
    const legH = nLegs ? H * T.leg * Math.sqrt(legLen) : plan === 'serpent' || plan === 'fish' || plan === 'blob' ? 0 : H * 0.06;
    const torso = { rx: H * T.tw * fat, ry: H * T.th * fat, rz: H * T.tl * (plan === 'serpent' ? 1 : fat) };
    if (plan === 'blob') { torso.rx = torso.ry = torso.rz = H * 0.42; }
    let ty = legH + torso.ry * (T.upright ? 1 : 0.85);
    if (plan === 'serpent') ty = torso.ry;
    if (plan === 'fish') ty = torso.ry + H * 0.05;
    if (plan === 'blob') ty = torso.ry;
    const out = { H, plan, fat, upright: T.upright, torso: { ...torso, y: ty } };
    // the neck and the head
    const neckLen = H * T.neck * clamp(recipe.neck ?? 1, 0, 2.5);
    const headR = Math.max(H * 0.05, H * T.head * clamp(recipe.head ?? 1, 0.4, 2.2));
    if (T.upright) {
        out.neck = { len: Math.max(H * 0.03, neckLen), r: headR * 0.45, at: [0, torso.ry * 0.95, 0], tilt: 0 };
        out.head = { r: headR, at: [0, out.neck.len + headR * 0.85, -headR * 0.1] };
    } else if (plan === 'blob') {
        out.neck = null;
        out.head = { r: 0, at: [0, torso.ry * 0.35, -torso.rz * 0.6] }; // (its face is on its body)
    } else {
        const up = plan === 'insect' || plan === 'spider' || plan === 'fish' ? 0.05 : plan === 'serpent' ? 0.6 : 0.85;
        out.neck = neckLen > H * 0.02 ? { len: neckLen, r: Math.max(headR * 0.42, torso.rx * 0.38), at: [0, torso.ry * 0.35, -torso.rz * 0.82], tilt: up } : null;
        const nx = out.neck ? Math.cos(up) * neckLen : 0, ny = out.neck ? Math.sin(up) * neckLen : 0;
        out.head = { r: headR, at: [0, out.neck ? ny + torso.ry * 0.35 : torso.ry * 0.1, out.neck ? -torso.rz * 0.82 - nx - headR * 0.6 : -torso.rz - headR * 0.75] };
    }
    out.snout = plan === 'quadruped' || plan === 'dragon' ? headR * (0.55 + r() * 0.2) : plan === 'bird' ? headR * 0.9 : 0; // (a bird's: its beak)
    // the eyes: on the front of the head (a blob's on its body), as many as said, as big
    const nEyes = clamp(Math.round(recipe.eyes?.n ?? 2), 1, 8), eyeK = clamp(recipe.eyes?.size ?? 1, 0.4, 3);
    const er = Math.max(0.015, (headR || torso.rx * 0.5) * 0.22 * eyeK);
    out.eyes = [];
    const face = plan === 'blob' ? torso.rx * 0.9 : headR;
    for (let i = 0; i < nEyes; i++) {
        const k = nEyes === 1 ? 0 : (i / (nEyes - 1) - 0.5);
        const row = nEyes > 4 ? (i % 2 ? 0.25 : -0.05) : 0.18;
        out.eyes.push({ r: Math.min(er, face * 0.45), at: [k * face * (nEyes > 2 ? 1.3 : 1.0), face * row, -face * 0.82] });
    }
    out.ears = clamp(recipe.ears ?? 1, 0, 2.5) * (plan === 'insect' || plan === 'spider' || plan === 'fish' || plan === 'serpent' || plan === 'blob' || plan === 'bird' ? 0 : 1);
    out.antennae = plan === 'insect' ? 1 : 0;
    const nHorns = clamp(Math.round(recipe.horns?.n ?? 0), 0, 6), hornLen = headR * 0.9 * clamp(recipe.horns?.len ?? 1, 0.3, 2.5);
    out.horns = [];
    for (let i = 0; i < nHorns; i++) {
        const k = nHorns === 1 ? 0 : (i / (nHorns - 1) - 0.5);
        out.horns.push({ len: hornLen * (nHorns > 2 && Math.abs(k) < 0.3 ? 1.2 : 1), r: hornLen * 0.18, at: [k * (headR || torso.rx) * 1.4, (headR || torso.ry) * 0.75, -(headR || 0) * 0.1], lean: k * 0.9 });
    }
    // the legs: pairs along the trunk (front to back); a biped's under its hips
    out.legs = [];
    const lw = Math.max(0.02, H * 0.052 * legThick * fat * (plan === 'spider' || plan === 'insect' ? 0.55 : 1));
    if (nLegs) {
        const pairs = Math.ceil(nLegs / 2);
        for (let i = 0; i < nLegs; i++) {
            const pair = Math.floor(i / 2), side = i % 2 ? 1 : -1;
            const along = pairs === 1 ? 0 : -1 + 2 * (pair / (pairs - 1)); // −1 front … 1 back
            const spread = plan === 'spider' || plan === 'insect' ? 1.6 : plan === 'dragon' ? 1.15 : 0.75;
            const hip = [side * torso.rx * spread * 0.62, ty - torso.ry * (T.upright ? 0.9 : 0.55), T.upright ? 0 : along * torso.rz * 0.68];
            const len = Math.max(H * 0.03, hip[1]);
            out.legs.push({ side, pair, front: along < 0, along, hip, upper: len * (plan === 'spider' ? 0.75 : 0.52), lower: len * (plan === 'spider' ? 0.85 : 0.52), r: lw, splay: plan === 'spider' ? 0.9 : plan === 'insect' ? 0.7 : plan === 'dragon' ? 0.3 : 0.06 });
        }
    }
    // arms (a biped): two, from the shoulders
    out.arms = plan === 'biped' ? [-1, 1].map((side) => ({ side, at: [side * torso.rx * 1.05, ty + torso.ry * 0.6, 0], len: H * 0.3 * Math.sqrt(legLen), r: lw * 0.8 })) : [];
    // the tail: a chain of segments (its kind decides the end)
    const tk = recipe.tail || 'none';
    const tLen = H * 0.42 * clamp(recipe.tailLen ?? 1, 0.2, 2.5) * (plan === 'dragon' || plan === 'serpent' ? 1.6 : plan === 'fish' ? 0.55 : 1);
    out.tail = tk === 'none' && plan !== 'serpent' ? null : { kind: plan === 'fish' ? 'fin' : tk === 'none' ? 'thin' : tk, len: tLen, n: plan === 'serpent' ? 9 : tk === 'bushy' || tk === 'feather' ? 3 : 5,
        r: Math.max(0.02, plan === 'serpent' ? torso.rx * 0.9 : torso.rx * (tk === 'bushy' ? 0.45 : 0.24)), at: [0, ty + torso.ry * (plan === 'serpent' || plan === 'fish' ? 0 : 0.3), torso.rz * 0.9] };
    // the wings: a pair on the back (a butterfly two pairs), folded when it walks
    const wk = recipe.wings || 'none';
    const span = H * 0.75 * clamp(recipe.wingSpan ?? 1, 0.4, 2.2) * (wk === 'dragon' ? 1.3 : wk === 'insect' ? 0.7 : 1);
    out.wings = [];
    if (wk !== 'none') {
        const rows = wk === 'butterfly' || wk === 'insect' ? 2 : 1;
        for (let row = 0; row < rows; row++) for (const side of [-1, 1]) out.wings.push({ side, kind: wk, row, span: span * (row ? 0.8 : 1), chord: span * (wk === 'butterfly' ? 0.55 : wk === 'insect' ? 0.22 : 0.42), at: [side * torso.rx * 0.6, ty + torso.ry * 0.75, -torso.rz * (0.15 - row * 0.4)] });
    }
    out.fins = plan === 'fish' ? [{ at: [0, ty + torso.ry * 0.95, 0], len: torso.rz * 0.7, h: torso.ry * 0.6 }] : [];
    // its body for hits (a capsule along its length) and the crowd (radius)
    const top = Math.max(ty + torso.ry, (out.head?.at?.[1] || 0) + (out.neck && !T.upright ? ty : 0) + headR);
    out.top = T.upright ? ty + torso.ry + (out.neck?.len || 0) + headR * 2 : top;
    out.hit = { a: [0, Math.max(torso.ry * 0.6, ty), -torso.rz * 0.8], b: [0, Math.max(torso.ry * 0.6, ty), torso.rz * 0.8], r: Math.max(torso.rx, torso.ry) * 1.05 };
    if (T.upright) { out.hit.a = [0, legH * 0.5, 0]; out.hit.b = [0, out.top - headR, 0]; out.hit.r = torso.rx * 1.2; }
    out.radius = clamp(Math.max(torso.rx, torso.rz * (T.upright ? 1 : 0.55)) + (nLegs && (plan === 'spider' || plan === 'insect') ? H * 0.2 : 0), 0.15, 6);
    return out;
}

/** The creature's speed on the ground (m/s) and in the air, by its recipe (the gait's own pace; flaws slow it). */
export function creatureSpeed(recipe, walkK = 1) {
    const base = { slow: 2.2, normal: 4.2, fast: 7.5 }[recipe.speed] || 4.2;
    const size = clamp(Math.sqrt((recipe.size || 1.6) / 1.6), 0.55, 1.8); // (a big beast strides further)
    const slow = recipe.flaws?.includes('slow') ? 0.6 : 1;
    return { ground: base * size * walkK * slow, air: base * 1.7 * slow };
}
