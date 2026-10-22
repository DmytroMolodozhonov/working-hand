/**
 * BodyStrikes.js — my real hands striking bodies: other players AND every creature (zombies,
 * villagers, knights, animals…). Nothing by accident:
 *   - the tracked knuckles (not the drawn hand) must really reach a body part: the fist's path this
 *     frame is swept through the part's box (a fast punch at a low frame rate still lands);
 *   - the hand must move INTO the surface fast enough (its speed against the body's own);
 *   - the hand's shape decides what it is: a fist punches (head / body), an open palm slaps the face
 *     or pushes the body; both palms on the same body within 0.15 s are one two-hand shove;
 *   - arms swinging while running never punch (only a deliberate two-hand shove counts on the run);
 *   - touching, or a slow hand, does nothing — but the drawn hand rests on the surface (never inside).
 * The part hit: the forearm (a guard: blocked), the head (the head jolts back) or the body.
 *
 * Who decides: my computer sees my hands. A player's computer then checks and applies the blow to
 * their own body (phit / ppush → BodyImpact.onStrike); a creature's blow goes to the host
 * (CreatureImpact; a guest sends `cstrike`). Damage still follows the old rules (a punch: 1).
 */

import * as THREE from 'three';
import { IMPACT, segmentBox } from './Impact.js';
import { kindOf } from './CreatureImpact.js';
import { blowSpeed, strikeLine, logLine, BUMP } from './BumpRules.js';

const PUNCH_DAMAGE = 1;

/** A hero's parts (players): [part, frame object, centre in it, half extents]. */
const HERO_PARTS = [
    ['arm', (c) => c.leftElbowAnchor, [0, 0, 0.45], [0.2, 0.2, 0.45], 'left'],
    ['arm', (c) => c.rightElbowAnchor, [0, 0, 0.45], [0.2, 0.2, 0.45], 'right'],
    ['head', (c) => c.head, [0, 0.1, 0], [0.62, 0.72, 0.62]],
    ['body', (c) => c.body, [0, 0, 0], [0.6, 0.75, 0.4]],
];

const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3();
const A = [0, 0, 0], B = [0, 0, 0];
const r2 = (v) => Math.round(v * 100) / 100, arr = (v) => [r2(v.x), r2(v.y), r2(v.z)];

/** The box around an object's own meshes (itself and its direct mesh children), in its frame. Cached. */
export function ownBox(obj) {
    if (obj.userData.ownBox) return obj.userData.ownBox;
    const box = new THREE.Box3();
    const add = (mesh, m) => {
        const geo = mesh.geometry;
        if (!geo) return;
        if (!geo.boundingBox) geo.computeBoundingBox();
        box.union(geo.boundingBox.clone().applyMatrix4(m));
    };
    if (obj.isMesh) add(obj, _m.identity());
    for (const ch of obj.children) if (ch.isMesh) { ch.updateMatrix(); add(ch, ch.matrix); }
    const out = box.isEmpty() ? null : { c: box.getCenter(new THREE.Vector3()).toArray(), h: box.getSize(new THREE.Vector3()).multiplyScalar(0.5).toArray() };
    obj.userData.ownBox = out;
    return out;
}

/** A creature's parts (as HERO_PARTS), read from its own model (any shape another session gives it). */
export function creatureParts(c) {
    if (c._strikeParts && c._strikeParts.model === (c.model || c.group)) return c._strikeParts;
    const parts = [];
    const ck = kindOf(c);
    const add = (part, obj) => { const b = obj && ownBox(obj); if (b) parts.push([part, () => obj, b.c, b.h]); };
    if (ck === 'v') { add('head', c.model.head); add('body', c.model.torso); }
    else if (ck === 'z' || (c.head && c.body)) { add('head', c.head); add('body', c.body); }
    else {
        // an animal (or anything else): the whole model is the body, its front top is the head
        const frame = c.group.userData.impPivot?.children[0] || c.group;
        const box = new THREE.Box3();
        frame.updateMatrixWorld(true);
        _mi.copy(frame.matrixWorld).invert();
        frame.traverse((o) => { if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(_m.multiplyMatrices(_mi, o.matrixWorld))); } });
        if (!box.isEmpty()) {
            const lo = box.min, hi = box.max, len = hi.z - lo.z;
            const head = [(lo.x + hi.x) / 2, (lo.y + hi.y) / 2 + (hi.y - lo.y) * 0.2, lo.z + len * 0.15];
            parts.push(['head', () => frame, head, [(hi.x - lo.x) * 0.4, (hi.y - lo.y) * 0.3, len * 0.15]]);
            parts.push(['body', () => frame, box.getCenter(new THREE.Vector3()).toArray(), box.getSize(new THREE.Vector3()).multiplyScalar(0.5).toArray()]);
        }
    }
    parts.model = c.model || c.group;
    c._strikeParts = parts;
    return parts;
}

/** The earliest body part of `parts` the swept fist p0→p1 (world) enters (the head before the body box around it). */
export function sweepParts(parts, owner, p0, p1, r = IMPACT.FIST_R) {
    let best = null;
    for (const [part, frame, c, half, side] of parts) {
        const o = frame(owner);
        if (!o || o.visible === false) continue;
        o.updateWorldMatrix(true, false);
        _m.copy(o.matrixWorld).invert();
        o.matrixWorld.decompose(_a, _q, _s);
        const sc = (Math.abs(_s.x) + Math.abs(_s.y) + Math.abs(_s.z)) / 3 || 1;
        _a.copy(p0).applyMatrix4(_m); _b.copy(p1).applyMatrix4(_m);
        A[0] = _a.x - c[0]; A[1] = _a.y - c[1]; A[2] = _a.z - c[2]; B[0] = _b.x - c[0]; B[1] = _b.y - c[1]; B[2] = _b.z - c[2];
        const h = segmentBox(A, B, half, r / sc);
        if (!h) continue;
        if (best) {
            const headOverBody = part === 'head' && best.part === 'body' && h.t <= best.t + 0.05;
            const bodyUnderHead = part === 'body' && best.part === 'head' && best.t <= h.t + 0.05;
            if (bodyUnderHead || (!headOverBody && h.t >= best.t)) continue;
        }
        const lp = [A[0] + (B[0] - A[0]) * h.t, A[1] + (B[1] - A[1]) * h.t, A[2] + (B[2] - A[2]) * h.t];
        let depth = Infinity;
        for (let k = 0; k < 3; k++) depth = Math.min(depth, half[k] + r / sc - Math.abs(B[k]));
        best = { part, armSide: side || null, t: h.t, inside: h.inside, lp, frame: o,
            nOut: new THREE.Vector3().fromArray(h.n).transformDirection(o.matrixWorld),
            depth: Math.max(0, depth) * sc };
    }
    return best;
}

export class BodyStrikes {
    constructor(game) {
        this.game = game;
        this.prev = { left: new THREE.Vector3(), right: new THREE.Vector3() };
        this.has = { left: false, right: false };
        this.vel = { left: new THREE.Vector3(), right: new THREE.Vector3() };
        this.pvel = { left: new THREE.Vector3(), right: new THREE.Vector3() }; // (the frame before)
        this.cool = new Map();
        this.pushes = [];
        this.contact = { left: null, right: null };
        this.log = []; // what my hands did (tests, the HUD)
        this.bodyVel = new THREE.Vector3();
        this._bodyPrev = null;
    }

    /** The tracked knuckles (the wrist + a little along the forearm). */
    _knuckles(side, out) {
        const ch = this.game.character;
        ch.getHandWorldPosition(side, out);
        return out.addScaledVector(ch.getForearmDirection(side, _f), IMPACT.KNUCKLES);
    }

    /** Everybody my hands can strike: [key, owner object, parts, vel, info]. */
    _targets() {
        const g = this.game, out = [];
        for (const [id, r] of g.remotes || []) {
            if (r.dead || !r.target || !r.character) continue;
            if (r.combat?.shield === 2 && r.combat.shieldLeft > 0) continue; // (their dome: hands cannot get in)
            out.push({ key: 'p:' + id, id, player: r, owner: r.character, parts: HERO_PARTS, vel: r.vel || _d.set(0, 0, 0), centre: r.position });
        }
        const me = g.character.group.position;
        const near = (p) => Math.abs(p.x - me.x) < 6 && Math.abs(p.z - me.z) < 6;
        for (const z of g.zombies || []) if (!z.isDead && z.group?.visible && near(z.group.position)) out.push({ key: 'z:' + z.id, creature: z, owner: z, parts: creatureParts(z), centre: z.group.position });
        for (const v of g.castleLife?.byId?.values?.() || []) if (!v.dead && v.group?.visible && near(v.group.position)) out.push({ key: 'v:' + v.id, creature: v, owner: v, parts: creatureParts(v), centre: v.group.position });
        for (const a of g.animals?.list || []) if (!a.dead && a.rider !== g.localId && near(a.group.position)) out.push({ key: 'a:' + a.id, creature: a, owner: a, parts: creatureParts(a), centre: a.group.position });
        for (const t of g.livingTrees?.list || []) if (!t.isDead && near(t.model.position)) out.push({ key: 'T:' + t.id, creature: t, owner: t, parts: creatureParts(t), centre: t.model.position });
        // a phoenix within reach (on the ground by me, or flying low): a fist hurts it, a hand rests on it
        for (const f of g.phoenixes?.list || []) if (!f.dead && near(f.model.position)) out.push({ key: 'F:' + f.id, creature: f, owner: f, parts: creatureParts(f), centre: f.model.position, vel: f.vel });
        // a clever owl within reach: a fist never lands — it dodges and flies off; a calm hand may rest on it
        for (const o of g.owls?.list || []) if (!o.dead && near(o.model.position)) out.push({ key: 'O:' + o.id, creature: o, owner: o, parts: creatureParts(o), centre: o.model.position, vel: o.vel });
        // the Ice Castle's creatures: a fist breaks a snowman, barely scratches the queen's ice (IceQueen.iceDamage)
        for (const c of g.iceCastle?.list || []) if (!c.dead && near(c.model.position)) out.push({ key: 'I:' + c.id, creature: c, owner: c, parts: creatureParts(c), centre: c.model.position });
        return out;
    }

    update(dt) {
        const g = this.game, ch = g.character;
        for (const [k, v] of this.cool) { if (v - dt <= 0) this.cool.delete(k); else this.cool.set(k, v - dt); }
        // my own body's speed (a shove on the run is stronger)
        const bp = ch.group.position;
        if (this._bodyPrev && dt > 0) { _d.subVectors(bp, this._bodyPrev).divideScalar(dt); if (_d.lengthSq() < 900) this.bodyVel.lerp(_d, 0.3); }
        (this._bodyPrev || (this._bodyPrev = new THREE.Vector3())).copy(bp);
        this._flushPushes(dt);
        const c = g.combat;
        const off = !g.currentPose || c?.dead || c?.frozen || c?.stunned || g.isDeadLocal || g.knock?.down;
        let targets = null;
        for (const side of ['left', 'right']) {
            const p1 = this._knuckles(side, new THREE.Vector3());
            this.pvel[side].copy(this.vel[side]);
            if (this.has[side] && dt > 0) this.vel[side].lerp(_d.subVectors(p1, this.prev[side]).divideScalar(Math.max(dt, 1 / 240)), 0.5);
            else this.vel[side].set(0, 0, 0);
            const p0 = this.has[side] ? this.prev[side].clone() : p1.clone();
            this.prev[side].copy(p1); this.has[side] = true; this.contact[side] = null;
            if (off || g.weapons?.hands?.[side]?.held || g.books?.reading?.handBusy?.(side) || g.books?.readingSide === side || g.handHold?.busy?.(side)) continue; // (a blade: Weapons.checkHits)
            const curl = ch.getGripCurl(side);
            const shape = curl >= IMPACT.FIST_CURL ? 'fist' : curl <= IMPACT.PALM_CURL ? 'palm' : 'half';
            if (shape !== 'fist' && g.items?.held?.[side]) continue; // (a wand / food in the fist can still punch)
            targets = targets || this._targets();
            for (const t of targets) {
                const hit = sweepParts(t.parts, t.owner, p0, p1);
                if (!hit) continue;
                this.contact[side] = { key: t.key, part: hit.part };
                // the drawn hand rests on the body (never inside it)
                if (hit.depth > 0) ch.setHandOffset?.(side, _a.copy(hit.nOut).multiplyScalar(hit.depth));
                if (hit.inside) continue; // (still touching: no new blow)
                // (a creature's own movement is not my blow: its walking into a still hand is only a collision.
                // Players and flying ones keep the old way — their velocity is known and counted against mine)
                const vRel = _d.subVectors(this.vel[side], t.vel || _b.set(0, 0, 0));
                const n = hit.nOut;
                const speed = t.creature && !t.vel
                    ? blowSpeed(this.vel[side].toArray(), this.pvel[side].toArray(), this.bodyVel.toArray(), [n.x, n.y, n.z], IMPACT.TOUCH_V)
                    : Math.min(BUMP.MAX_SPEED, -vRel.dot(n));
                if (speed < IMPACT.TOUCH_V || this.cool.has(side + '|' + t.key)) continue;
                this._strike(side, t, hit, shape, speed, vRel.clone().normalize());
                break; // (one body per hand per frame)
            }
        }
    }

    _strike(side, t, hit, shape, speed, dir) {
        const g = this.game, ch = g.character;
        const base = { pt: hit.part, lp: hit.lp.map(r2), s: side, sp: r2(speed) };
        let msg = null;
        if (hit.part === 'arm') msg = { k: 'guard', i: arr(dir.clone().multiplyScalar(IMPACT.GUARD_GAIN * speed)) };
        else if (shape === 'fist') {
            if (ch.isRunning || speed < IMPACT.PUNCH_V) return;
            msg = { k: 'punch', i: arr(dir.clone().multiplyScalar((hit.part === 'head' ? IMPACT.PUNCH_HEAD_BODY : IMPACT.PUNCH_BODY) * speed)) };
        } else if (hit.part === 'head') {
            if (speed < IMPACT.SLAP_V) return;
            msg = { k: 'slap', i: arr(dir.clone().multiplyScalar(IMPACT.SLAP_BODY * speed)) };
        } else {
            if (speed >= IMPACT.PUSH_V) this._queuePush(side, t, speed * (shape === 'half' ? 0.6 : 1), dir);
            return;
        }
        Object.assign(msg, base);
        this.cool.set(side + '|' + t.key, IMPACT.HAND_COOLDOWN);
        this._send(t, msg, dir);
        if (g.sound) g.sound.playHit?.();
    }

    /** The blow goes to whoever decides about that body. */
    _send(t, msg, dir) {
        const g = this.game;
        this.log.push({ ...msg, to: t.key }); if (this.log.length > 20) this.log.shift();
        if (t.player) {
            if (msg.k === 'punch' && g.combat?.enabled) {
                const dmg = PUNCH_DAMAGE * (msg.pt === 'head' && msg.sp > 9 ? 2 : 1);
                g.combat.hitRemote(g.combat.meleeTarget(t.id), dmg, false, null, msg);
            } else g.sync?.playerPush(t.id, msg);
            return;
        }
        const c = t.creature, ck = kindOf(c);
        if (c.isVillager) {
            // every counted blow on a villager goes to the journal (so a repeat can be traced); a push is only a bump
            const hard = msg.k === 'punch' && (msg.sp >= 8 || (msg.pt === 'head' && msg.sp >= 6));
            logLine(strikeLine({ kind: msg.k, part: msg.pt, speed: msg.sp ?? 0, hand: msg.s, who: `${c.title || ''} ${c.name || c.id}`.trim(), by: g.localId, hard }));
            if (msg.k === 'push' || msg.k === 'shove') g.onLocalHit?.(c, BUMP.SOFT_PUSH, dir.clone().setY(0).normalize(), false, { hard: false });
        }
        // (a villager feels how hard it was: a light knock is not a hard blow)
        if (msg.k === 'punch') g.onLocalHit?.(c, PUNCH_DAMAGE, dir.clone().setY(0).normalize(), false, c.isVillager ? { hard: msg.sp >= 8 || (msg.pt === 'head' && msg.sp >= 6) } : null);
        const head = msg.pt === 'head' && msg.lp ? { lp: msg.lp, dir: [dir.x, dir.y, dir.z], speed: msg.sp } : null;
        const v = new THREE.Vector3().fromArray(msg.i);
        if (g.authority !== false) g.creatureImpact?.apply(c, { v, by: g.localId, kind: msg.k, head });
        else g.sync?.creatureStrike?.({ ck, id: c.id, k: msg.k, i: msg.i, h: head ? { lp: head.lp, sp: head.speed } : 0 });
    }

    _queuePush(side, t, speed, dir) {
        const other = this.pushes.find((p) => p.t.key === t.key && p.side !== side);
        if (other) { this.pushes.splice(this.pushes.indexOf(other), 1); this._sendPush(t, [other, { side, speed, dir }]); }
        else if (!this.pushes.some((p) => p.t.key === t.key && p.side === side)) this.pushes.push({ side, t, speed, dir, left: IMPACT.BOTH_WINDOW });
    }

    _flushPushes(dt) {
        for (const p of [...this.pushes]) if ((p.left -= dt) <= 0) { this.pushes.splice(this.pushes.indexOf(p), 1); this._sendPush(p.t, [p]); }
    }

    /** One push (one palm) or a shove (both): the hands' speed, plus my body's speed into them. */
    _sendPush(t, hands) {
        const g = this.game, n = hands.length;
        if (g.character.isRunning && n < 2) return; // (an arm swinging on the run is no push)
        const avg = hands.reduce((s, h) => s + h.speed, 0) / n;
        const dir = hands.reduce((s, h) => s.add(h.dir), new THREE.Vector3()).setY(0);
        if (dir.lengthSq() < 1e-6) return;
        dir.normalize();
        const body = Math.max(0, this.bodyVel.dot(dir));
        const v = (IMPACT.PUSH_GAIN * avg + IMPACT.BODY_GAIN * body) * (n === 2 ? 1 : IMPACT.ONE_HAND);
        for (const h of hands) this.cool.set(h.side + '|' + t.key, IMPACT.HAND_COOLDOWN);
        const msg = { k: n === 2 ? 'shove' : 'push', n, pt: 'body', sp: r2(avg), i: arr(dir.clone().multiplyScalar(v)), s: hands[0].side };
        this._send(t, msg, dir);
    }
}
