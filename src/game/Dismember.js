/**
 * Dismember.js — a sword or an axe cuts off an arm, a leg or the head of any
 * creature exactly where the blade went through it.
 *
 * Who: players, villagers (farmers, knights, the king, wizards…), zombies, animals
 * (legs, head), the giant spider (legs), and anything that offers `cutBody()` (a living
 * tree's branch arms). See CutBodies.js for each body, LimbSurgery.js for the model.
 *
 * Nothing by accident — a cut needs all of:
 *   - the EDGE leads (not the flat; the axe cuts only with its bit, the sword with its whole blade),
 *   - a real swing: fast enough for that part (the axe needs a stronger one), the blade already
 *     swinging the frame before, not a tracking jump (> 60 m/s),
 *   - the edge really crosses the bone line (the swept edge vs the limb), and the torso or the
 *     skull did not stop the blade first; armour stops it (plate on a player, a knight's armour).
 * The cut is where the edge crossed: the limb is shortened right there, the cut face follows the
 * blade's path. The head (the neck) = instant death.
 *
 * After a cut: the victim bleeds (Bleeding; «Rescue» stops it), the part stays missing until
 * death / respawn; without a hand you can't hold or cast with it; without a leg you fall, then
 * hop (one leg) or crawl (none) — creatures too. The cut-off part is a physics prop with blood.
 *
 * Network: the attacker's computer finds the cut; the victim's computer (players) or the host
 * (creatures) decides and applies it, then tells everybody (dmlimb). States go out every few
 * seconds for late joiners (dmst). Messages:
 *   dmcut   attacker → victim / host   {k, id, to?, sv:[l, d, nx, ny, nz, vx, vy, vz, lf], by}
 *   dmlimb  victim / host → all        {k, id, sv, by, att}       (a fresh cut: piece + blood)
 *   dmst    victim / host → all        {k, id, st, lf}            (the state: stumps, no piece)
 * k: 'p' player · 'v' villager · 'z' zombie · 'a' animal · 's' spider · other kinds registered.
 */

import * as THREE from 'three';
import { cutLimb, restoreAll, applyState, anyLost, stumpEnd, segmentAt, limbLength, segObjs } from '../entities/LimbSurgery.js';
import { characterBody, villagerBody, zombieBody, animalBody, spiderCutBody, boneLines, blockerBoxes, tissueAt } from './CutBodies.js';
import { SeveredPart } from './SeveredPart.js';

// ============================================================ numbers
/** The cutting edge of each weapon in model units (WeaponModels: model +X = the edge's facing). */
export const EDGES = {
    sword: { a: [0, 0.32, 0], b: [0, 1.3, 0], sides: 2, cutSpeed: 6.5 }, // the whole blade, both edges
    axe: { a: [0.37, 0.6, 0], b: [0.37, 0.88, 0], sides: 1, cutSpeed: 9.5 }, // only the bit, one side
};
/** How hard each part is to cut (× the weapon's cut speed). */
export const TOUGH = { hand: 0.7, forearm: 0.85, upperArm: 1.0, arm: 1.0, shin: 1.05, thigh: 1.25, leg: 1.15, neck: 1.1, spiderLeg: 1.35, branch: 1.5 };
export const EDGE_LEAD = 0.55; // the motion along the edge's facing (cos): the edge leads
export const MAX_TIP_SPEED = 60; // m/s — faster is a tracking jump, not a swing
export const MOMENTUM = 0.5; // the frame before, the blade already moved at half the speed needed
export const BLEED = { hand: 0.5, arm: 1, leg: 1.5 }; // HP/s
export const FALL_TIME = 2.2; // s on the ground after losing a leg
export const MOVE = { oneLeg: 0.4, noLegs: 0.2 };
export const MAX_PROPS = 24;
export const MAX_REACH = 9; // m: the attacker must be this near the victim
export const SEVER_COOLDOWN = 0.3;
export const LIMB_RU = { leftArm: 'левую руку', rightArm: 'правую руку', leftLeg: 'левую ногу', rightLeg: 'правую ногу', head: 'голову', neck: 'голову' };
/** The head (a person's neck cut) or an animal's neck: either way the head is off. */
export const isHead = (limb) => limb === 'head' || limb === 'neck';

// ============================================================ vectors (arrays)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a); return l > 1e-9 ? mul(a, 1 / l) : [0, 0, 0]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Möller–Trumbore: segment p→q against triangle a,b,c → {t, beta, gamma} | null. */
export function segTri(p, q, a, b, c) {
    const dir = sub(q, p);
    const e1 = sub(b, a), e2 = sub(c, a);
    const h = cross(dir, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-10) return null;
    const f = 1 / det;
    const s = sub(p, a);
    const beta = f * dot(s, h);
    if (beta < -1e-6 || beta > 1 + 1e-6) return null;
    const qq = cross(s, e1);
    const gamma = f * dot(dir, qq);
    if (gamma < -1e-6 || beta + gamma > 1 + 1e-6) return null;
    const t = f * dot(e2, qq);
    if (t < 0 || t > 1) return null;
    return { t, beta, gamma };
}

/**
 * The edge swept between the last frame (e0a→e0b) and now (e1a→e1b) against bone lines.
 * lines: [{limb, a, b, d0, len}] (world). Returns the EARLIEST crossing:
 * {limb, d, s (time 0…1), u (along the edge), point, n (the cut's normal), motion (of that edge point)}
 */
export function sweepCut(e0a, e0b, e1a, e1b, lines) {
    const move = Math.max(len(sub(e1a, e0a)), len(sub(e1b, e0b)));
    const K = Math.min(8, Math.max(1, Math.ceil(move / 0.25)));
    let best = null;
    for (let k = 0; k < K; k++) {
        const s0 = k / K, s1 = (k + 1) / K;
        const A0 = lerp(e0a, e1a, s0), B0 = lerp(e0b, e1b, s0), A1 = lerp(e0a, e1a, s1), B1 = lerp(e0b, e1b, s1);
        for (const L of lines) {
            const r1 = segTri(L.a, L.b, A0, B0, B1);
            const r2 = r1 ? null : segTri(L.a, L.b, A0, B1, A1);
            let s, u, t;
            if (r1) { s = s0 + r1.gamma * (s1 - s0); u = r1.beta + r1.gamma; t = r1.t; }
            else if (r2) { s = s0 + (r2.beta + r2.gamma) * (s1 - s0); u = r2.beta; t = r2.t; }
            else continue;
            if (best && s >= best.s) continue;
            best = { L, s, u: Math.max(0, Math.min(1, u)), t };
        }
        if (best) break; // (sub-steps go forward in time: the first step with a crossing has the earliest)
    }
    if (!best) return null;
    const { L, s, u, t } = best;
    const point = lerp(L.a, L.b, t);
    const p0 = lerp(e0a, e0b, u), p1 = lerp(e1a, e1b, u);
    const motion = sub(p1, p0);
    const edge = lerp(sub(e0b, e0a), sub(e1b, e1a), s);
    let n = norm(cross(edge, motion));
    if (len(n) < 0.5) n = norm(sub(L.b, L.a));
    return { limb: L.limb, d: L.d0 + t * L.len, s, u, point, n, motion, line: L };
}

/** Segment p→q against a box (inverse world matrix elements, centre, half sizes): entry t or −1. */
export function segHitsBox(p, q, inv, c, half) {
    const tp = (v) => [inv[0] * v[0] + inv[4] * v[1] + inv[8] * v[2] + inv[12] - c[0], inv[1] * v[0] + inv[5] * v[1] + inv[9] * v[2] + inv[13] - c[1], inv[2] * v[0] + inv[6] * v[1] + inv[10] * v[2] + inv[14] - c[2]];
    const a = tp(p), b = tp(q);
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 3; i++) {
        const d = b[i] - a[i];
        if (Math.abs(d) < 1e-9) { if (a[i] < -half[i] || a[i] > half[i]) return -1; continue; }
        let ta = (-half[i] - a[i]) / d, tb = (half[i] - a[i]) / d;
        if (ta > tb) { const x = ta; ta = tb; tb = x; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) return -1;
    }
    return t0;
}

/** The first time in [0, s] the edge is inside a blocker (10 samples + s) → time, or −1. */
export function firstBlock(e0a, e0b, e1a, e1b, s, blockers) {
    if (!blockers.length) return -1;
    for (let k = 0; k <= 10; k++) {
        const t = k < 10 ? (k / 10) * s : s;
        const a = lerp(e0a, e1a, t), b = lerp(e0b, e1b, t);
        for (const B of blockers) if (segHitsBox(a, b, B.inv.elements, B.c, B.half) >= 0) return t;
    }
    return -1;
}

/**
 * Is it a cut? w = {cutSpeed, sides, bonus}; edgeN = the edge's facing (world, unit).
 * @returns {kind:'cut'|'touch'|'blocked', speed, need, …hit}
 */
export function judgeCut(hit, blockedAt, dt, w, edgeN, prevTipSpeed, tissue) {
    if (!hit) return null;
    if (blockedAt >= 0 && blockedAt <= hit.s) return { ...hit, kind: 'blocked' };
    const speed = len(hit.motion) / Math.max(dt, 1 / 240);
    const need = w.cutSpeed * (TOUGH[tissue] ?? 1) / (1 + (w.bonus || 0) / 100); // magic blades are sharper
    const lead = dot(norm(hit.motion), edgeN);
    const edgeOk = w.sides === 2 ? Math.abs(lead) >= EDGE_LEAD : lead >= EDGE_LEAD;
    const swing = speed <= MAX_TIP_SPEED && prevTipSpeed >= MOMENTUM * need;
    return { ...hit, speed, need, lead, kind: speed >= need && edgeOk && swing ? 'cut' : 'touch' };
}

// ------------------------------------------------------------ armour
/** A player's steel in the look: Латы (top 5), Шлем (hat 9), Поножи (bottom 8), Латные (shoes 6). */
export function armourCovers(look, limb, d) {
    if (!look) return false;
    if (limb === 'head') return look.top === 5 || look.hat === 9; // the plate's gorget / the helmet's aventail
    if (limb.endsWith('Arm')) return look.top === 5 && d < 1.9; // steel sleeves to the wrist; the bare hand is not
    if (limb.endsWith('Leg')) return (look.bottom === 8 && d >= 0.78 && d <= 1.85) || (look.shoes === 6 && d >= 1.7);
    return false;
}
/** Knights and the king: their armour stops the blade until it is beaten to 0. */
export function villagerArmoured(v) { return (v.role === 'knight' || v.role === 'king') && v.armor > 0; }

// ------------------------------------------------------------ network packing
const CODES = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'neck'];
export function limbCode(name) { const i = CODES.indexOf(name); if (i >= 0) return i; const m = /^(leg|branch)(\d+)$/.exec(name); return m ? (m[1] === 'leg' ? 10 : 30) + (+m[2]) : -1; }
export function limbName(code) { if (code >= 0 && code < CODES.length) return CODES[code]; if (code >= 10 && code < 30) return 'leg' + (code - 10); if (code >= 30 && code < 50) return 'branch' + (code - 30); return null; }
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

/** sv = {limb, d, n (segment frame), v (world velocity), lf} → array */
export function packSever(sv) {
    return [limbCode(sv.limb), r2(sv.d), r2(sv.n[0]), r2(sv.n[1]), r2(sv.n[2]), r1(sv.v[0]), r1(sv.v[1]), r1(sv.v[2]), sv.lf | 0];
}
/** Checked: null when bad. */
export function parseSever(a) {
    if (!Array.isArray(a) || a.length !== 9) return null;
    if (!a.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
    const limb = limbName(a[0]);
    if (!limb || !Number.isInteger(a[0])) return null;
    const d = Math.max(0, Math.min(limb === 'head' ? 0 : 6, a[1]));
    let n = [a[2], a[3], a[4]];
    n = len(n) < 1e-3 ? [0, 1, 0] : norm(n);
    let v = [a[5], a[6], a[7]];
    if (len(v) > 80) v = mul(norm(v), 80);
    return { limb, d, n, v, lf: Number.isInteger(a[8]) ? a[8] : 0 };
}
/** {leftArm: 0.6, head: true} ⇄ [[code, d], …] */
export function stateToNet(st) {
    const out = [];
    for (const k of Object.keys(st || {})) { const c = limbCode(k); if (c >= 0 && st[k] != null && st[k] !== false) out.push([c, k === 'head' ? 0 : r2(st[k])]); }
    return out;
}
export function stateFromNet(a) {
    const st = {};
    if (!Array.isArray(a)) return st;
    for (const e of a.slice(0, 40)) {
        if (!Array.isArray(e) || e.length !== 2 || !Number.isInteger(e[0]) || !Number.isFinite(e[1])) continue;
        const k = limbName(e[0]);
        if (k) st[k] = k === 'head' ? true : Math.max(0, Math.min(6, e[1]));
    }
    return st;
}

/** Walking with what is left: {speed, run, drop} (drop: how much lower the body goes). */
export function limbMotion(st, legNames = ['leftLeg', 'rightLeg'], full = 1.95) {
    const lost = legNames.filter((k) => st?.[k] != null);
    if (!lost.length) return { speed: 1, run: true, drop: 0 };
    if (legNames.length > 2) {
        // four or eight legs: a few gone slow it; most gone — it drags itself
        const frac = lost.length / legNames.length;
        return { speed: frac > 0.5 ? MOVE.noLegs : Math.max(MOVE.oneLeg, 1 - frac * 1.2), run: frac <= 0.25, drop: 0 };
    }
    if (lost.length === legNames.length) return { speed: MOVE.noLegs, run: false, drop: full - Math.max(...lost.map((k) => st[k])) };
    return { speed: MOVE.oneLeg, run: false, drop: 0 };
}

export function bleedRate(limb, tissue) {
    if (isHead(limb)) return 0;
    if (tissue === 'hand') return BLEED.hand;
    if (/Arm$|^branch/.test(limb)) return BLEED.arm;
    return BLEED.leg;
}

export function cutText(sv, both) {
    if (sv.limb.endsWith('Arm')) return `🩸 Вам отрубили ${sv.tissue === 'hand' ? 'кисть' : LIMB_RU[sv.limb]}! Кровь идёт — прижмите другую руку к ране и скажите «Rescue»`;
    return both ? '🩸 Вам отрубили ногу — вы упали. Теперь можно только ползти. Скажите «Rescue», прижав руку к ране' : '🩸 Вам отрубили ногу — вы упали. Теперь можно только прыгать на одной ноге. Скажите «Rescue», прижав руку к ране';
}

// ============================================================ the system
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const arr = (v) => [v.x, v.y, v.z];

export class Dismemberment {
    constructor(game) {
        this.game = game;
        this.props = [];
        this.life = 0; // my lives (a cut aimed at my previous life is refused)
        this.remoteLife = new Map(); // player id -> their life counter
        this.slots = new Map(); // weapon slot -> last edge
        this.bleeders = new Map(); // 'k:id' -> {k, t, rate, by, acc}
        this.cutSet = new Map(); // 'k:id' -> {k, t} creatures with a cut (their state goes out)
        this.kinds = new Map(); // extra kinds (living trees…): k -> {find(id), body(t), id(t), apply?(t, sv, by)}
        this._stT = 0;
        this._mineSent = '';
        this.cutCount = 0;
    }

    /**
     * Another module's creature can be cut too: register(k, {match(t), id(t), find(id), body(t), onCut(t, sv, by, fresh)}).
     * body(t) returns a CutBodies-style body ({root, limbs, blockers}); onCut runs where the creature is decided.
     */
    register(k, def) { this.kinds.set(k, def); }

    // ------------------------------------------------------------ who
    /** {k, id, t, body} for a weapon target, or null. */
    which(t) {
        if (!t) return null;
        for (const [k, def] of this.kinds) if (def.match?.(t)) return { k, id: def.id(t), t, body: def.body(t) };
        if (typeof t.cutBody === 'function') { const body = t.cutBody(); return body ? { k: t.cutKind || 'x', id: t.cutId ?? t.id, t, body } : null; }
        if (t.isPlayer) { const r = this.game.remotes?.get(t.id); return r ? { k: 'p', id: t.id, t, body: characterBody(r.character), r } : null; }
        if (t.isVillager) return t.model ? { k: 'v', id: t.id, t, body: villagerBody(t.model) } : null;
        if (t.isAnimal) return { k: 'a', id: t.id, t, body: animalBody(t.model) };
        if (t.isBoss) return { k: 's', id: t.id, t, body: spiderCutBody(t.model) };
        if (t.head && t.leftArm && t.leftLeg && t.limbMask != null) return { k: 'z', id: t.id, t, body: zombieBody(t) };
        return null;
    }

    /** A target from the network. */
    find(k, id) {
        const g = this.game;
        if (k === 'p') { const r = g.remotes?.get(id); return r ? { k, id, t: r, body: characterBody(r.character), r } : null; }
        if (k === 'v') { const v = g.castleLife?.byId.get(id); return v ? { k, id, t: v, body: villagerBody(v.model) } : null; }
        if (k === 'a') { const a = g.animals?.byId.get(id); return a ? { k, id, t: a, body: animalBody(a.model) } : null; }
        if (k === 's') { const s = g.spiders?.list.find((x) => x.id === id); return s ? { k, id, t: s, body: spiderCutBody(s.model) } : null; }
        if (k === 'z') { const z = g.zombieById?.get(id); return z ? { k, id, t: z, body: zombieBody(z) } : null; }
        const def = this.kinds.get(k);
        if (def) { const t = def.find(id); return t ? { k, id, t, body: def.body(t) } : null; }
        return null;
    }

    /** Is this creature's hand gone? (side 'left'|'right') — for other modules (casting, holding). */
    handLost(model, side) { return model?.limbs?.[side + 'Arm'] != null; }

    // ------------------------------------------------------------ attacker side
    /**
     * Called by Weapons.checkHits every frame for each held blade: remembers the edge.
     * @returns {object|null} the swing context for tryCut (null on the first frame)
     */
    slot(hs, w, dt, frame) {
        const E = EDGES[w.type];
        if (!E) return null;
        const a = arr(w.modelToWorld(E.a[0], E.a[1], E.a[2], _v));
        const b = arr(w.modelToWorld(E.b[0], E.b[1], E.b[2], _v));
        const tip = b;
        let S = this.slots.get(hs);
        const fresh = !S || S.w !== w || S.frame !== frame - 1;
        const prev = S && !fresh ? S : null;
        const tipSpeed = prev ? len(sub(tip, prev.b)) / Math.max(dt, 1 / 240) : 0;
        if (!S) { S = {}; this.slots.set(hs, S); }
        const ctx = prev ? { w, E, e0a: prev.a, e0b: prev.b, e1a: a, e1b: b, dt, prevTip: prev.tipSpeed, tipSpeed } : null;
        S.w = w; S.frame = frame; S.a = a; S.b = b; S.tipSpeed = tipSpeed;
        return ctx;
    }

    /**
     * Did this swing cut something of target t? → null | {kind:'cut'|'armour'|'touch'|'blocked', point, sever?}
     */
    tryCut(t, ctx) {
        if (!ctx) return null;
        const who = this.which(t);
        if (!who || !who.body) return null;
        const root = who.body.root;
        const st = root.limbs || {};
        const lines = boneLines(who.body, st);
        if (!lines.length) return null;
        const hit = sweepCut(ctx.e0a, ctx.e0b, ctx.e1a, ctx.e1b, lines);
        if (!hit) return null;
        const blk = firstBlock(ctx.e0a, ctx.e0b, ctx.e1a, ctx.e1b, hit.s, blockerBoxes(who.body, st));
        const tissue = tissueAt(who.body, hit.limb, hit.d);
        const facing = arr(_v.set(1, 0, 0).applyQuaternion(ctx.w.quaternion));
        const res = judgeCut(hit, blk, ctx.dt, { cutSpeed: ctx.E.cutSpeed, sides: ctx.E.sides, bonus: ctx.w.magic ? ctx.w.bonus : 0 }, facing, ctx.prevTip, tissue);
        res.tissue = tissue;
        if (res.kind !== 'cut') return res;
        if (who.k === 'p' && armourCovers(who.r?.look || who.r?.character?.look, hit.limb, hit.d)) return { ...res, kind: 'armour' };
        if (who.k === 'v' && villagerArmoured(t)) return { ...res, kind: 'armour' };
        // the cut's normal in the frame of the bone it goes through (the same on every computer)
        let nSeg = [0, 1, 0];
        if (hit.limb !== 'head') {
            const limb = who.body.limbs.find((l) => l.name === hit.limb);
            const seg = segmentAt(limb, hit.d).seg;
            segObjs(seg)[0].getWorldQuaternion(_q).invert();
            nSeg = arr(_v.fromArray(hit.n).applyQuaternion(_q));
        }
        const v = mul(hit.motion, 1 / Math.max(ctx.dt, 1 / 240));
        res.sever = { limb: hit.limb, d: hit.d, n: nSeg, v, lf: who.k === 'p' ? (this.remoteLife.get(who.id) || 0) : 0, tissue };
        return res;
    }

    /** My blade cut it: the victim's computer / the host decides. */
    commit(t, res) {
        const g = this.game;
        const who = this.which(t);
        if (!who || !res?.sever) return;
        const sv = res.sever;
        g.fx?.blood?.(_v.fromArray(res.point), 12); // (at once here; the cut itself comes with dmlimb)
        const by = g.localId || 'local';
        if (who.k === 'p') {
            if (g.sync) this._send({ t: 'dmcut', k: 'p', id: who.id, to: who.id, sv: packSever(sv), by }, true);
            return;
        }
        if (g.authority || !g.sync) { this.apply(who, sv, by, true); return; }
        this._send({ t: 'dmcut', k: who.k, id: who.id, sv: packSever(sv), by }, false);
    }

    // ------------------------------------------------------------ deciding
    /**
     * Apply a cut where it is decided (me as the victim, the host for creatures).
     * @returns {boolean} changed
     */
    apply(who, sv, by, fresh) {
        const g = this.game;
        const root = who.body.root;
        if (who.k === 'p') return this._cutMine(sv, by, fresh);
        if (who.t.isDead || who.t.dead) return false;
        sv.tissue = sv.tissue || tissueAt(who.body, sv.limb, sv.d);
        const r = cutLimb(root, who.body, sv.limb, sv.d, sv.n, { piece: fresh });
        if (!r.changed) return false;
        sv.d = r.d;
        this.cutCount++;
        if (r.piece) this._spawnPiece(r.piece, sv);
        this.cutSet.set(who.k + ':' + who.id, { k: who.k, t: who.t, id: who.id });
        this._consequences(who, sv, by);
        if (g.sync) this._send({ t: 'dmlimb', k: who.k, id: who.id, sv: packSever(sv), by: g.localId, att: by, k1: fresh ? 1 : 0 }, false);
        return true;
    }

    /** What a cut does to a creature (host). */
    _consequences(who, sv, by) {
        const g = this.game, t = who.t;
        const head = isHead(sv.limb);
        const rate = bleedRate(sv.limb, sv.tissue);
        if (who.k === 'v') {
            const m = t.model;
            if (head) { g.castleLife?.hit(t, 0, null, by, { pierce: true, spell: true }); return; } // (the castle sees who did it)
            if (sv.limb === 'rightArm' && m.toolKind !== 'none') m.setHeldTool('none');
            if (sv.limb === 'leftArm' && m.shield) m.shield.visible = false;
            const mv = limbMotion(m.limbs);
            t.legK = mv.speed;
            if (sv.limb.endsWith('Leg')) { t.stunT = Math.max(t.stunT || 0, FALL_TIME); t.cutFallT = FALL_TIME; }
            // a knight without his sword arm stops fighting
            if ((t.role === 'knight' || t.role === 'king') && sv.limb === 'rightArm') { t.foe = null; t.fleeFrom = by; t.fleeT = 30; t.fleeing = false; t.path = null; }
            this._bleed(who, rate, by);
            return;
        }
        if (who.k === 'z') {
            const bit = { head: 1, leftArm: 2, rightArm: 4, leftLeg: 8, rightLeg: 16 }[sv.limb] || 0;
            t.limbMask |= bit;
            if (head) { if (g.damageZombie) g.damageZombie(t, 999, true, null, by); else { t.health = 0; t.die?.(); } return; }
            if (sv.limb.endsWith('Leg')) {
                const both = (t.limbMask & 24) === 24;
                t.speed = both ? Math.min(t.speed, 0.4) : Math.max(0.5, t.speed - 1.0);
                t.baseSpeed = t.speed;
            }
            return; // (the dead don't bleed out)
        }
        if (who.k === 'a') {
            if (head) { t.hp = 0; g.animals?._die?.(t, false); return; }
            const legs = who.body.limbs.filter((l) => l.kind === 'leg').map((l) => l.name);
            t.legK = limbMotion(t.model.limbs, legs).speed;
            this._bleed(who, rate, by);
            return;
        }
        if (who.k === 's') {
            const legs = who.body.limbs.filter((l) => l.kind === 'leg').map((l) => l.name);
            t.legK = limbMotion(t.model.limbs, legs).speed;
            this._bleed(who, 0.5, by);
            return;
        }
        const def = this.kinds.get(who.k);
        if (def?.onCut) def.onCut(t, sv, by, true);
        else if (typeof t.onCut === 'function') t.onCut(sv, by);
    }

    _bleed(who, rate, by) {
        if (!(rate > 0)) return;
        const key = who.k + ':' + who.id;
        const b = this.bleeders.get(key);
        if (b) { b.rate = Math.max(b.rate, rate); b.by = by; return; }
        this.bleeders.set(key, { k: who.k, id: who.id, t: who.t, rate, by, acc: 0 });
        who.t.bleed = rate;
    }

    /** «Rescue» pointed at a bleeding creature: its blood stops (true when it was bleeding). */
    rescueCreature(t) {
        const who = this.which(t);
        if (!who) return false;
        const key = who.k + ':' + who.id;
        if (!this.bleeders.has(key)) {
            if (this.game.authority || !this.game.sync) return false;
            this._send({ t: 'dmresc', k: who.k, id: who.id }, false);
            return true;
        }
        this.bleeders.delete(key);
        who.t.bleed = 0;
        return true;
    }

    // ------------------------------------------------------------ me (the local player)
    get mine() { const ch = this.game.character; return ch.limbs || (ch.limbs = {}); }

    /** dmcut aimed at me: is it a real cut? (checks first) */
    receiveCut(by, sv) {
        const g = this.game;
        if (!g.combat?.enabled || g.combat.dead || g.isDeadLocal || g.config.mode === 'creative') return false;
        if (sv.lf !== this.life) return false; // aimed at my previous life
        const att = g.remotes?.get(by);
        if (!att || att.position.distanceTo(g.character.group.position) > MAX_REACH) return false;
        if (g.sync?.weaponOwners && ![...g.sync.weaponOwners.values()].includes(by)) return false; // no blade in their hand
        if (g.gear?.shieldFaces?.(att.position)) { g.gear.shieldTook?.('melee'); return false; }
        if (g.combat.frozen) return false; // (the hit shatters me instead)
        if (armourCovers(g.character.look, sv.limb, sv.d)) { g.hud?.setVoice?.('🛡️ Латы выдержали удар', true); return false; }
        return this._cutMine(sv, by, true);
    }

    _cutMine(sv, by, fresh) {
        const g = this.game, ch = g.character;
        const body = characterBody(ch);
        sv.tissue = sv.tissue || tissueAt(body, sv.limb, sv.d);
        const r = cutLimb(ch, body, sv.limb, sv.d, sv.n, { piece: fresh });
        if (!r.changed) return false;
        sv.d = r.d;
        this.cutCount++;
        if (r.piece) this._spawnPiece(r.piece, sv);
        ch.setShowHands(ch.handsVisible);
        if (g.sync) this._send({ t: 'dmlimb', k: 'p', id: g.localId, sv: packSever(sv), by: g.localId, att: by, k1: fresh ? 1 : 0 }, true);
        this._mineSent = '';
        if (sv.limb === 'head') { g.combat.die(by, 'decap'); return true; }
        if (sv.limb.endsWith('Arm')) this._loseHand(sv.limb === 'leftArm' ? 'left' : 'right');
        else this._loseLeg(by);
        const both = this.mine.leftLeg != null && this.mine.rightLeg != null;
        g.bleeding?.start(bleedRate(sv.limb, sv.tissue), cutText(sv, both));
        return true;
    }

    _loseHand(side) {
        const g = this.game, ch = g.character;
        g.weapons?.release?.(side);
        if (g.items?.held?.[side]) {
            const vel = ch.handVelocity?.[side] || new THREE.Vector3();
            if (g.items._throw) g.items._throw(side, vel); else g.items.releaseHand(side);
        }
        if (g.combat.shield?.side === side) g.combat.shield = null;
        if (g.levitation?.active && g.levitation.state?.side === side) g.levitation.release(false);
        if (g.water?.active && g.water.state?.side === side) g.water.drop?.();
        if (g.lastMagicHand === side) g.lastMagicHand = side === 'left' ? 'right' : 'left';
        if (g.magicHand === side) g.magicHand = null;
        ch.setShowHands(ch.handsVisible);
    }

    _loseLeg(by) {
        const g = this.game, ch = g.character;
        this._applyMotion();
        if (!g.flight?.busy && !ch.swimming && !g.animals?.riding) { ch.knockedDown = true; g.combat.stun(FALL_TIME, by, 'fall'); }
    }

    _applyMotion() {
        const ch = this.game.character;
        const m = limbMotion(this.mine);
        ch.limbSpeed = m.speed; ch.canRun = m.run; ch.legDrop = m.drop;
    }

    /** Respawn: whole again, a new life. */
    resetLocal() {
        const g = this.game, ch = g.character;
        restoreAll(ch);
        ch.limbs = {};
        this.life++;
        ch.limbSpeed = 1; ch.canRun = true; ch.legDrop = 0;
        ch.setShowHands(ch.handsVisible);
        this._sendMine(true);
    }

    /** A phoenix's touch (Phoenixes.js): every lost arm and leg grows back — the same life goes on. */
    healLocal() {
        const g = this.game, ch = g.character;
        if (!anyLost(ch.limbs)) return false;
        restoreAll(ch);
        ch.limbs = {};
        ch.limbSpeed = 1; ch.canRun = true; ch.legDrop = 0;
        ch.setShowHands(ch.handsVisible);
        this._sendMine(true);
        return true;
    }

    /** For the save. */
    snapshot() {
        const st = this.game.character.limbs;
        return anyLost(st) ? stateToNet(st) : null;
    }

    /** From a save: the same stumps (no pieces, no fall). */
    restoreMine(net, bleed = 0) {
        const g = this.game, ch = g.character;
        const st = stateFromNet(net);
        if (st.head) return; // (a headless save is a dead one)
        applyState(ch, characterBody(ch), st);
        this._applyMotion();
        ch.setShowHands(ch.handsVisible);
        if (bleed > 0) g.bleeding?.start(bleed);
        this._mineSent = '';
    }

    // ------------------------------------------------------------ network
    _send(m, relay) { this.game.sync?.net?.send(m, relay); }

    _sendMine(force = false) {
        const g = this.game;
        if (!g.sync) return;
        const st = stateToNet(g.character.limbs || {});
        const key = JSON.stringify(st) + '|' + this.life;
        if (!force && key === this._mineSent && !st.length) return;
        this._mineSent = key;
        this._send({ t: 'dmst', k: 'p', id: g.localId, st, lf: this.life }, true);
    }

    onNet(m) {
        const g = this.game;
        if (!m || typeof m.t !== 'string') return;
        if (m.t === 'dmcut') {
            const sv = parseSever(m.sv);
            if (!sv) return;
            const by = m.from && m.from !== 'H' ? m.from : m.by;
            if (m.k === 'p') { if (m.to === g.localId) this.receiveCut(by, sv); return; }
            if (!g.authority) return;
            const who = this.find(m.k, m.id);
            if (!who) return;
            // the attacker near the creature and with a blade in the hand
            const ap = by === g.localId ? g.character.group.position : g.remotes?.get(by)?.position;
            const tp = who.t.group?.position || who.t.model?.position || (who.t.x != null ? _v2.set(who.t.x, who.t.y, who.t.z) : null);
            if (!ap || !tp || ap.distanceTo(tp) > MAX_REACH + 3) return;
            if (g.sync?.weaponOwners && by !== g.localId && ![...g.sync.weaponOwners.values()].includes(by)) return;
            if (who.k === 'v' && villagerArmoured(who.t)) return;
            this.apply(who, sv, by, true);
            return;
        }
        if (m.t === 'dmlimb') {
            if (m.id === g.localId && m.k === 'p') return;
            const sv = parseSever(m.sv);
            const who = sv && this.find(m.k, m.id);
            if (!who) return;
            const root = who.body.root;
            const r = cutLimb(root, who.body, sv.limb, sv.d, sv.n, { piece: !!m.k1 });
            if (!r.changed) return;
            if (r.piece) this._spawnPiece(r.piece, sv);
            this._mirror(who, sv);
            if (m.att === g.localId) g.hud?.setVoice?.(`🗡️ Вы отрубили ${LIMB_RU[sv.limb] || (/^leg/.test(sv.limb) ? 'ногу' : 'часть тела')}${who.r ? ' — ' + who.r.name : ''}`, true);
            return;
        }
        if (m.t === 'dmst') {
            if (m.k === 'p') {
                if (m.id === g.localId) return;
                if (Number.isInteger(m.lf)) this.remoteLife.set(m.id, m.lf);
            }
            const who = this.find(m.k, m.id);
            if (!who) return;
            const root = who.body.root;
            if (applyState(root, who.body, stateFromNet(m.st))) this._mirror(who, null);
            return;
        }
        if (m.t === 'dmresc' && g.authority) {
            const who = this.find(m.k, m.id);
            if (who) this.rescueCreature(who.t);
        }
    }

    /** What others see change with a cut (on their screens). */
    _mirror(who, sv) {
        if (who.k === 'p') { who.r.character.setShowHands(true); return; }
        const t = who.t;
        if (who.k === 'v' && sv) {
            if (sv.limb === 'rightArm' && t.model.toolKind !== 'none') t.model.setHeldTool('none');
            if (sv.limb === 'leftArm' && t.model.shield) t.model.shield.visible = false;
        }
        if (who.k === 'z') {
            const st = t.limbs || {};
            for (const [k, bit] of [['head', 1], ['leftArm', 2], ['rightArm', 4], ['leftLeg', 8], ['rightLeg', 16]]) if (st[k] != null) t.limbMask |= bit;
        }
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        const g = this.game;
        for (let i = this.props.length - 1; i >= 0; i--) if (!this.props[i].step(dt)) this.props.splice(i, 1);
        // creatures bleeding (where they are decided)
        if (g.authority || !g.sync) {
            for (const [key, b] of this.bleeders) {
                const t = b.t;
                if (t.dead || t.isDead || t.removable) { this.bleeders.delete(key); continue; }
                b.acc += b.rate * dt;
                if (b.acc >= 1) {
                    b.acc -= 1;
                    if (b.k === 'v') { t.hp = Math.max(0, Math.round((t.hp - 1) * 10) / 10); t.barT = 8; if (t.hp <= 0) { g.castleLife?._die?.(t, b.by); this.bleeders.delete(key); } }
                    else if (b.k === 'a') { t.hp -= 1; if (t.hp <= 0) { g.animals?._die?.(t, false); this.bleeders.delete(key); } }
                    else if (b.k === 's') g.spiders?.hit?.(t, 1, 'bleed');
                }
            }
        }
        // drops of blood from stumps; creatures without legs stay low
        for (const [key, c] of this.cutSet) {
            const t = c.t;
            if (t.removable || (c.k === 'z' && !t.group?.parent)) { this.cutSet.delete(key); this.bleeders.delete(key); continue; }
            this._pose(c, dt);
            if (!(t.bleed > 0) || t.dead || t.isDead) continue;
            const root = c.k === 'z' ? t : c.t.model;
            for (const name of Object.keys(root?.limbs || {})) if (name !== 'head' && Math.random() < dt * 4 && stumpEnd(root, name, _v)) this._drip(_v);
        }
        // my stumps and the other players' while they bleed
        const ch = g.character;
        if (ch.limbs && (g.bleeding?.rate > 0)) for (const name of Object.keys(ch.limbs)) if (name !== 'head' && Math.random() < dt * 6 && stumpEnd(ch, name, _v)) this._drip(_v);
        if (g.remotes) for (const [id, r] of g.remotes) {
            if (!r.character.limbs || !(g.bleeding?.remote?.get(id) > 0)) continue;
            for (const name of Object.keys(r.character.limbs)) if (name !== 'head' && Math.random() < dt * 6 && stumpEnd(r.character, name, _v)) this._drip(_v);
        }
        // the hop on one leg, the crawl on none (my hero)
        if (ch.limbs && (ch.limbs.leftLeg != null || ch.limbs.rightLeg != null)) this._legPose(ch, dt);
        // states for late joiners
        this._stT -= dt;
        if (this._stT <= 0 && g.sync) {
            this._stT = 3;
            if (anyLost(ch.limbs) || this.life > 0) this._sendMine(true);
            if (g.authority) for (const c of this.cutSet.values()) {
                const root = c.k === 'z' ? c.t : c.t.model;
                if (root?.limbs && anyLost(root.limbs)) this._send({ t: 'dmst', k: c.k, id: c.id, st: stateToNet(root.limbs) }, false);
            }
        }
    }

    /** A creature's body with legs missing: on one leg / lower on stumps; fallen for a moment. */
    _pose(c, dt) {
        const t = c.t;
        if (c.k === 'v') {
            const m = t.model;
            if (!m?.limbs) return;
            if (t.cutFallT > 0) { t.cutFallT -= dt; m.root.rotation.z += (1.35 - m.root.rotation.z) * Math.min(1, dt * 6); }
            else if (m.root.rotation.z && m.mode !== 'dead') m.root.rotation.z *= Math.max(0, 1 - dt * 6);
            const L = m.limbs.leftLeg, R = m.limbs.rightLeg;
            if (L != null && R != null) m.pelvis.position.y = Math.max(0.25, Math.max(L, R));
            return;
        }
        if (c.k === 'a') {
            const legs = animalBody(t.model).limbs.filter((l) => l.kind === 'leg');
            let roll = 0, pitch = 0;
            for (const l of legs) if (t.model.limbs?.[l.name] != null) { roll += l.side === 'left' ? 1 : -1; pitch += l.front ? -1 : 1; }
            if (!t.dead) {
                t.group.rotation.z += (roll * 0.18 - t.group.rotation.z) * Math.min(1, dt * 5);
                t.group.rotation.x += (pitch * 0.12 - t.group.rotation.x) * Math.min(1, dt * 5);
            }
        }
    }

    _legPose(ch, dt) {
        const L = ch.limbs.leftLeg != null, R = ch.limbs.rightLeg != null;
        // the stump held a little forward; on one leg the body bobs as it hops
        if (L) ch.leftLegPivot.rotation.x = -0.3;
        if (R) ch.rightLegPivot.rotation.x = -0.3;
        void dt;
    }

    _drip(p) {
        this.game.fx?.spark?.(_v2.set(p.x + (Math.random() - 0.5) * 0.2, p.y, p.z + (Math.random() - 0.5) * 0.2), Math.random() < 0.5 ? 0xb3001b : 0x7a0010, 0.07, new THREE.Vector3((Math.random() - 0.5) * 0.4, -1.4, (Math.random() - 0.5) * 0.4), 0.9);
    }

    _spawnPiece(piece, sv) {
        const vel = new THREE.Vector3().fromArray(sv.v || [0, 0, 0]).multiplyScalar(0.35).clampLength(0, 7);
        vel.y += 2.5;
        if (this.props.length >= MAX_PROPS) this.props.shift().dispose();
        const spin = new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        this.props.push(new SeveredPart(this.game, piece, { vel, spin, blood: isHead(sv.limb) ? 40 : 25 }));
    }

    dispose() {
        for (const p of this.props) p.dispose();
        this.props.length = 0;
    }
}

export { limbLength };
