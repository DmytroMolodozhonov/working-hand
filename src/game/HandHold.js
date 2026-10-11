/**
 * HandHold.js — taking another creature by the hand, as in life (the maths: Handshake.js).
 *
 * - My open hand comes to another hand (a player's, a villager's, a knight's…) and my
 *   fingers really close round it: I hold it. Opening the fingers lets go.
 * - Two players holding each other's hands with the palms facing: a handshake. The two
 *   hands are drawn clasped at the midpoint of the two real hands (never inside each
 *   other) and go wherever both real hands go, so the shaking is the players' own.
 *   Letting go: opening the fingers, or pulling the hands apart.
 * - Holding someone's hand (not shaken back): leading them. Past the arm's reach they are
 *   drawn after the hand (they stumble after it). Breaking free is easy: walking away
 *   against the pull, a sharp jerk of the held arm, a blow.
 * - A villager takes the hand I hold out to them (they turn to me, give me their hand and
 *   greet me); closing my fingers round it is a handshake.
 *
 * Each computer decides only for its own hand and moves only its own body: `hgrip` (my hand
 * closed on / let go of someone's hand), `hfree` (my held hand: refused or broke free).
 * Villagers are moved by the host (a guest leading one sends `vhand`).
 */

import * as THREE from 'three';
import { HAND, closingAround, palmsFacing, clasp, leash, breakFree, lettingGo, pulledApart } from './Handshake.js';
import { sharpJerk } from './Jerk.js';

const SIDES = ['left', 'right'];
const OTHER = { left: 'right', right: 'left' };
const V_ARM = 1.25;            // a villager's shoulder → the middle of its palm
const V_REACH = 1.35 + 0.25;   // a villager led by the hand: shoulder this far from the holding palm
const OFFER_R = 3.4;           // a hand held out this near a villager (flat) …
const OFFER_T = 0.45;          // … this long: they give theirs
const GREET = ['Здравствуйте!', 'Добрый день!', 'Приветствую!', 'Рад знакомству!', 'Доброго здоровья!'];
const BYE = ['Крепкая рука!', 'Будем знакомы!', 'Заходите ещё!', 'Всего доброго!'];
const LET_GO = ['Отпустите!', 'Пустите меня!', 'Эй, руку отдайте!', 'Ну хватит!'];
const NO = ['Руки прочь!', 'Не трогай!', 'Отстань!'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _n1 = new THREE.Vector3(), _n2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _down = new THREE.Vector3(0, -1, 0);
const v3 = (o, out = new THREE.Vector3()) => out.set(o.x, o.y, o.z);

export class HandHold {
    constructor(game) {
        this.game = game;
        this.mine = { left: null, right: null };   // my hand holds: {kind 'p'|'v', id, ts, t, f (palms facing), openT, apartT, farT}
        this.onMe = { left: null, right: null };   // a player's hand holds mine: {by, hs, t, f, awayT, lagT}
        this.others = new Map();                   // `${by}|${s}` → {by, s, to, ts, f}: links between two other players
        this.vHolds = new Map();                   // (host) a guest leads a villager: id → {by, p: {x,y,z}, t}
        this.hist = { left: [], right: [] };
        this.track = { left: [], right: [] };      // my tracked hands, body-relative (jerks, blows)
        this.offer = null;                          // a villager taking my held-out hand {v, side, t, greeted}
        this._near = { left: null, right: null };
        this._offerT = 0;
        this._gripped = new Set();                  // other heroes' hands whose fingers I close this frame
        this._grippedNow = new Set();
        this._t = 0;
        this._hp = null;
        this._sendT = 0;
        this.stumble = 0;
        this.line = '';
        this._lineEl = null;
        this.log = [];                              // the last few things the hands did (tests, debugging)
    }

    _note(what) {
        this.log.push(`${this._t.toFixed(2)} ${what}`);
        if (this.log.length > 24) this.log.shift();
    }

    // ------------------------------------------------------------- queries
    /** Is this hand of mine holding (or held by) someone? (no punches, no grabbing things with it) */
    busy(side) { return !!(this.mine[side] || this.onMe[side]); }
    anyBusy() { return this.busy('left') || this.busy('right'); }

    /** The middle of the palm as the camera tracks it (not where it is drawn). */
    palm(ch, side, out = new THREE.Vector3()) {
        ch.getHandWorldPosition(side, out);
        return out.addScaledVector(ch.getForearmDirection(side, _d), HAND.PALM_FWD);
    }

    /** The palm's normal (as drawn: the turn of the real hand). */
    normal(ch, side, out = new THREE.Vector3()) {
        const h = ch.getActiveHands()[side];
        if (!h?.palm) return ch.getForearmDirection(side, out); // (no palm model: something along the arm)
        h.palm.updateWorldMatrix(true, false);
        return out.set(0, 0, 1).applyQuaternion(h.palm.getWorldQuaternion(_q)).normalize();
    }

    vArm(v, side) { return side === 'left' ? v.model.leftArm : v.model.rightArm; }
    vShoulder(v, side, out = new THREE.Vector3()) { return this.vArm(v, side).getWorldPosition(out); }
    vHand(v, side, out = new THREE.Vector3()) {
        const arm = this.vArm(v, side);
        arm.updateWorldMatrix(true, false);
        return arm.localToWorld(out.set(0, -V_ARM, 0));
    }

    _handFree(side) {
        const g = this.game;
        if (g.weapons?.hands?.[side]?.held || g.items?.held?.[side]) return false;
        if (g.books?.reading?.handBusy?.(side) || g.books?.readingSide === side) return false;
        if (g.levitation?.state?.side === side) return false;
        return true;
    }

    /** Can my body take part (not dead, lifted, flying, lying, riding, held by a spider, frozen)? */
    _free() {
        const g = this.game;
        return !(g.combat?.dead || g.isDeadLocal || g.levitation?.lifted || g.flight?.busy || g.beds?.lying
            || g.animals?.riding || g.spiders?.held || g.combat?.immobile);
    }

    _villagers() { const L = this.game.castleLife; return L && L.byId ? L.byId : null; }

    // ------------------------------------------------------------- frame
    update(dt) {
        this._t += dt;
        const g = this.game;
        const vs = this._villagers();
        const idle = !g.remotes.size && !(vs && vs.size) && !this._linked();
        if (idle) { this._setLine(''); return; }
        this._grippedNow.clear();
        this._trackHands();
        this._detect(dt);
        this._offerStep(dt);
        this._holderStep(dt);
        this._heldStep(dt);
        this._villagerStep(dt);
        this._draw();
        // other heroes' fingers back to their own when nobody holds them any more
        for (const h of this._gripped) if (!this._grippedNow.has(h)) h.setGrip?.(null);
        [this._gripped, this._grippedNow] = [this._grippedNow, this._gripped];
        this._hud();
    }

    _linked() {
        return !!(this.mine.left || this.mine.right || this.onMe.left || this.onMe.right || this.others.size || this.vHolds.size || this.offer);
    }

    _trackHands() {
        const ch = this.game.character;
        _qi.copy(ch.group.quaternion).invert();
        for (const side of SIDES) {
            const h = this.palm(ch, side, _a).sub(ch.group.position).applyQuaternion(_qi);
            const list = this.track[side];
            list.push({ t: this._t, x: h.x, y: h.y, z: h.z });
            while (list.length && this._t - list[0].t > 0.5) list.shift();
        }
    }

    /** How fast the tracked hand moves in the body's own space (a blow, not being led). */
    _handSpeed(side) {
        const l = this.track[side];
        if (l.length < 3) return 0;
        const a = l[l.length - 3], b = l[l.length - 1];
        const dt = b.t - a.t;
        return dt > 1e-3 ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt : 0;
    }

    // ------------------------------------------------------------- grabbing
    /** The other hands near my palm: {kind, id, ts, p} (players' palms, villagers' hands). */
    _nearest(p) {
        const g = this.game;
        let best = null, bestD = HAND.GRAB_R;
        for (const [id, r] of g.remotes) {
            if (r.dead || !r.target) continue;
            if (r.position.distanceToSquared(p) > 64) continue;
            for (const ts of SIDES) {
                const d = this.palm(r.character, ts, _b).distanceTo(p);
                if (d < bestD) { bestD = d; best = { kind: 'p', id, ts }; }
            }
        }
        const vs = this._villagers();
        if (vs) for (const v of vs.values()) {
            if (v.dead || !v.group.visible || v.seated) continue;
            if ((v.x - p.x) ** 2 + (v.z - p.z) ** 2 > 64) continue;
            for (const ts of SIDES) {
                const d = this.vHand(v, ts, _b).distanceTo(p);
                if (d < bestD) { bestD = d; best = { kind: 'v', id: v.id, ts }; }
            }
        }
        return best;
    }

    _detect() {
        const g = this.game, ch = g.character;
        const can = !!g.currentPose && this._free();
        for (const side of SIDES) {
            const h = this.hist[side];
            if (!can || this.mine[side] || !this._handFree(side)) { h.length = 0; this._near[side] = null; continue; }
            const p = this.palm(ch, side, _a);
            let near = this._nearest(p);
            // (my hand held by someone: my fingers can close only round that hand — shaking it back)
            const H = this.onMe[side];
            if (H && near && !(near.kind === 'p' && near.id === H.by && near.ts === H.hs)) near = null;
            this._near[side] = near;
            const key = near ? near.kind + near.id + near.ts : null;
            h.push({ t: this._t, c: ch.getGripCurl(side), who: key });
            while (h.length && this._t - h[0].t > HAND.CLOSE_T + 0.2) h.shift();
            if (!near) continue;
            const seq = h.map((x) => ({ t: x.t, c: x.c, near: x.who === key }));
            if (closingAround(seq, this._t)) { h.length = 0; this._grab(side, near); }
        }
    }

    _grab(side, near) {
        const g = this.game, ch = g.character;
        if (near.kind === 'p') {
            const r = g.remotes.get(near.id);
            const my = this.palm(ch, side, _a), their = this.palm(r.character, near.ts, _b);
            const f = palmsFacing(this.normal(ch, side, _n1), this.normal(r.character, near.ts, _n2), _c.subVectors(their, my));
            this.mine[side] = { kind: 'p', id: near.id, ts: near.ts, t: 0, f, openT: 0, apartT: 0, farT: 0 };
            this._note(`grab ${side} → ${near.ts}${f ? ' facing' : ''}`);
            g.sync?.handGrip?.(near.id, side, near.ts, true, f);
            return;
        }
        const v = this._villagers()?.get(near.id);
        if (!v) return;
        const shake = !!(this.offer && this.offer.v === v && near.ts === 'right');
        if (!shake && (v.foe || v.fleeT > 0 || v.mode === 'attack')) {
            this.game.castleLife?._say?.(v, pick(NO), 2.5);  // (they pull their hand away at once)
            return;
        }
        this.mine[side] = { kind: 'v', id: v.id, ts: near.ts, t: 0, f: shake, openT: 0, apartT: 0, farT: 0,
            patience: v.role === 'knight' || v.role === 'king' ? 3 + Math.random() * 2 : 7 + Math.random() * 5, hp: v.hp };
        if (shake) this.offer = null;
        v.handLink = { by: g.localId, shake };
        if (!g.authority) g.sync?.villagerHand?.(v.id, true, this.palm(ch, side, _a));
    }

    _letGo(side, send = true, why = '') {
        const L = this.mine[side];
        if (!L) return;
        this._note(`let go ${side} ${why}`);
        this.mine[side] = null;
        const g = this.game;
        if (!g.weapons?.hands?.[side]?.held && !g.items?.held?.[side]) g.character.getActiveHands()[side]?.setGrip?.(null);
        g.character.getActiveHands()[side]?.group && this._restoreHand(side);
        if (L.kind === 'p') { if (send) g.sync?.handGrip?.(L.id, side, L.ts, false, false); return; }
        const v = this._villagers()?.get(L.id);
        if (v) {
            v.handLink = null;
            if (L.f && L.t > 0.8 && !v.dead) this.game.castleLife?._say?.(v, pick(BYE), 2.5);
        }
        if (!g.authority && send) g.sync?.villagerHand?.(L.id, false, null);
    }

    _freeMe(side, broke, send = true) {
        const L = this.onMe[side];
        if (!L) return;
        this.onMe[side] = null;
        this._note(`freed ${side}${broke ? ' (broke free)' : ''}`);
        if (send) this.game.sync?.handFree?.(L.by, L.hs, side, broke);
        if (broke) this.game.hud?.toast?.('✋ Вы вырвались', 1800);
    }

    // ------------------------------------------------------------- my hand holding
    _holderStep(dt) {
        const g = this.game, ch = g.character;
        for (const side of SIDES) {
            const L = this.mine[side];
            if (!L) continue;
            L.t += dt;
            const curl = ch.getGripCurl(side);
            const why = lettingGo(L, curl, dt) ? 'open' : !this._free() ? 'busy body' : !this._handFree(side) ? 'busy hand' : L.t > 0.3 && !g.currentPose ? 'no camera' : '';
            if (why) { this._letGo(side, true, why); continue; }
            const hand = ch.getActiveHands()[side];
            if (L.kind === 'v') continue; // (villagers: _villagerStep)
            const r = g.remotes.get(L.id);
            if (!r || r.dead || performance.now() - (r.lastUpdate || 0) > HAND.STALE * 1000) { this._letGo(side, true, `gone ${r ? Math.round(performance.now() - (r.lastUpdate || 0)) : '-'} ms`); continue; }
            const my = this.palm(ch, side, _a), their = this.palm(r.character, L.ts, _b);
            if (this._shaking(side)) {
                hand?.setGrip?.(0.6, 'shake');
                if (pulledApart(L, my.distanceTo(their), dt)) {
                    // the hands slipped out of each other: mine out of theirs too
                    this._letGo(side, true, 'apart');
                    this._freeMe(side, false);
                    continue;
                }
            } else {
                hand?.setGrip?.(Math.min(curl, HAND.WRAP));  // fingers round the other hand, no further
                // (they are gone far beyond any arm: lag, a teleport — their computer frees them)
                const sh = (L.ts === 'left' ? r.character.leftArmAnchor : r.character.rightArmAnchor).getWorldPosition(_c);
                L.farT = Math.hypot(sh.x - my.x, sh.z - my.z) > HAND.REACH + HAND.LAG_EXCESS + 1.5 ? L.farT + dt : 0;
                if (L.farT > 1.5) { this._letGo(side); continue; }
            }
        }
    }

    /** My `side` hand and the other's hand hold each other, palms facing: a handshake. */
    _shaking(side) {
        const L = this.mine[side], H = this.onMe[side];
        return !!(L && H && L.kind === 'p' && H.by === L.id && H.hs === L.ts && (L.f || H.f));
    }

    // ------------------------------------------------------------- my hand held
    _heldStep(dt) {
        const g = this.game, ch = g.character;
        const hp = g.combat?.hp;
        const hurt = this._hp != null && hp != null && hp < this._hp;
        this._hp = hp;
        let pulled = 0;
        for (const side of SIDES) {
            const L = this.onMe[side];
            if (!L) continue;
            L.t += dt;
            const r = g.remotes.get(L.by);
            if (!r || r.dead || performance.now() - (r.lastUpdate || 0) > HAND.STALE * 1000 || !this._free() || !this._handFree(side)) { this._freeMe(side, false); continue; }
            if (this._shaking(side)) continue; // (both hold: the hands just slip apart when pulled apart)
            const sh = (side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor).getWorldPosition(_a);
            const their = this.palm(r.character, L.hs, _b);
            const yaw = ch.group.rotation.y;
            const res = leash({ me: sh, them: their, walking: ch.isRunning, facing: { x: -Math.sin(yaw), z: -Math.cos(yaw) } });
            const jerk = L.t > 0.4 && sharpJerk(this.track[side]);
            const blow = hurt || (L.t > 0.3 && !this.mine[OTHER[side]] && this._handSpeed(OTHER[side]) > HAND.HIT_V);
            const why = breakFree(L, { dt, away: res.away, excess: res.excess, jerk, blow });
            if (why) { this._freeMe(side, true); continue; }
            if (res.move) { this._moveMe(res.move); pulled = Math.max(pulled, Math.hypot(res.move.x, res.move.z) / Math.max(dt, 1e-3)); }
        }
        this._stumble(dt, pulled);
    }

    _moveMe(mv) {
        const g = this.game, p = g.character.group.position;
        p.x += mv.x; p.z += mv.z;
        g.collision?.resolveCylinder?.(p, 0.48, p.y - 2.0, 3.5);
    }

    /** Led by the hand: the legs stumble after it (my own hero; the body is moved by the pull). */
    _stumble(dt, speed) {
        const ch = this.game.character;
        this.stumble = speed > 0.3 ? 0.25 : Math.max(0, this.stumble - dt);
        if (this.stumble <= 0 || ch.isRunning || !ch.leftLegPivot) return;
        this._legT = (this._legT || 0) + dt * (8 + Math.min(10, speed * 2));
        const a = 0.45 * Math.min(1, this.stumble * 4);
        ch.leftLegPivot.rotation.x = Math.sin(this._legT) * a;
        ch.rightLegPivot.rotation.x = -Math.sin(this._legT) * a;
    }

    // ------------------------------------------------------------- villagers
    /** A hand held out to a villager: they give theirs. */
    _offerStep(dt) {
        const g = this.game, ch = g.character;
        const vs = this._villagers();
        const O = this.offer;
        if (O) {
            O.t += dt;
            const v = O.v;
            const p = this.palm(ch, O.side, _a);
            const still = !v.dead && vs?.get(v.id) === v && !v.foe && this._free() && !this.mine[O.side]
                && Math.hypot(v.x - p.x, v.z - p.z) < OFFER_R + 1 && ch.isArmExtended(O.side);
            O.lostT = still ? 0 : (O.lostT || 0) + dt;
            if (O.lostT > 0.8) { if (v.handLink?.offer) v.handLink = null; this.offer = null; }
            return;
        }
        if (!vs || !vs.size || !g.currentPose || !this._free()) { this._offerT = 0; return; }
        // (the author: villagers do not hold out their hand by themselves — handshakes are between players;
        // a villager's hand can still be taken by really closing the fingers on it)
        if (!g.config?.villagerHandOffer) { this._offerT = 0; return; }
        let found = null;
        for (const side of SIDES) {
            if (this.mine[side] || this.onMe[side] || !this._handFree(side) || ch.getGripCurl(side) > HAND.OPEN || !ch.isArmExtended(side)) continue;
            const p = this.palm(ch, side, _a);
            for (const v of vs.values()) {
                if (v.dead || v.foe || v.fleeT > 0 || v.seated || v.handLink || !v.group.visible || v.mode === 'attack') continue;
                const d = Math.hypot(v.x - p.x, v.z - p.z);
                if (d > OFFER_R || Math.abs(p.y - (v.y + 3)) > 2.2) continue;
                // (held out to them: the hand in front of me, towards them)
                const me = ch.group.position;
                if ((v.x - me.x) * (p.x - me.x) + (v.z - me.z) * (p.z - me.z) <= 0) continue;
                // (only someone standing in front of me, whom I face — never one behind or at my side)
                const yaw = ch.group.rotation.y, dv = Math.hypot(v.x - me.x, v.z - me.z) || 1;
                if ((-Math.sin(yaw) * (v.x - me.x) - Math.cos(yaw) * (v.z - me.z)) / dv < 0.5) continue;
                if (!found || d < found.d) found = { v, side, d };
            }
        }
        if (!found || (this._offerTo && this._offerTo !== found.v)) { this._offerT = 0; this._offerTo = found?.v || null; return; }
        this._offerTo = found.v;
        this._offerT += dt;
        if (this._offerT < OFFER_T) return;
        this._offerT = 0;
        this.offer = { v: found.v, side: found.side, t: 0, lostT: 0 };
        found.v.handLink = { by: g.localId, offer: true };
        g.castleLife?._say?.(found.v, pick(GREET), 2.5);
    }

    _villagerStep(dt) {
        const g = this.game, ch = g.character;
        const vs = this._villagers();
        // a villager giving me their hand: they turn to me, the right arm to my palm
        if (this.offer) {
            const v = this.offer.v;
            const p = this.palm(ch, this.offer.side, _a);
            this._faceVillager(v, p, dt);
            this._reachVillager(v, 'right', p);
        }
        for (const side of SIDES) {
            const L = this.mine[side];
            if (!L || L.kind !== 'v') continue;
            const v = vs?.get(L.id);
            if (!v || v.dead) { this._letGo(side, true); continue; }
            const hand = ch.getActiveHands()[side];
            const my = this.palm(ch, side, _a);
            const sh = this.vShoulder(v, L.ts, _b);
            if (L.f) {
                // a handshake: their hand in mine, following my hand (and so my shaking)
                hand?.setGrip?.(0.6, 'shake');
                this._faceVillager(v, my, dt);
                // (pulled out of their reach: the hands slip apart)
                if (pulledApart(L, sh.distanceTo(my) > V_ARM + 0.7 ? HAND.APART + 1 : 0, dt)) { this._letGo(side); continue; }
                this._reachVillager(v, L.ts, my, 2 * HAND.GAP);
                continue;
            }
            hand?.setGrip?.(Math.min(ch.getGripCurl(side), HAND.WRAP));
            // a blow (their hearts go down): they tear their hand away; and they will not be led for ever
            const tired = L.t > L.patience;
            if (v.hp < L.hp || v.foe || tired) {
                g.castleLife?._say?.(v, pick(tired ? LET_GO : NO), 2.5);
                this._letGo(side);
                continue;
            }
            if (g.authority) this._leadVillager(v, L.ts, my, dt);
            else {
                this._sendT -= dt;
                if (this._sendT <= 0) { this._sendT = 0.1; g.sync?.villagerHand?.(v.id, true, my); }
            }
            this._reachVillager(v, L.ts, my, 2 * HAND.GAP);
        }
        // (host) villagers led by a guest's hand
        if (g.authority && this.vHolds.size) {
            for (const [id, H] of this.vHolds) {
                const v = vs?.get(id);
                H.t += dt;
                if (!v || v.dead || this._t - H.at > 1.0) { if (v) v.handLink = null; this.vHolds.delete(id); continue; }
                if (H.hp == null) H.hp = v.hp;
                if (v.hp < H.hp || v.foe || H.t > H.patience) {
                    g.castleLife?._say?.(v, pick(H.t > H.patience ? LET_GO : NO), 2.5);
                    v.handLink = null; this.vHolds.delete(id);
                    g.sync?.villagerFree?.(id, H.by);
                    continue;
                }
                v.handLink = { by: H.by };
                this._leadVillager(v, H.side || 'right', v3(H.p, _c), dt);
            }
        }
    }

    _faceVillager(v, p, dt) {
        const want = Math.atan2(-(p.x - v.x), -(p.z - v.z)); // (a villager's face is at −z, like CastleLife turns them: never the back to the player)
        let d = want - v.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        v.yaw += d * Math.min(1, dt * 6);
        if (this.game.authority) { v.mode = 'idle'; v.speed = 0; v.path = null; }
    }

    /** Led by the hand: past the arm's reach the villager is drawn after it (they stumble). */
    _leadVillager(v, side, palm, dt) {
        const sh = this.vShoulder(v, side, _d);
        const res = leash({ me: sh, them: palm, reach: V_REACH });
        if (res.move) {
            v.x += res.move.x; v.z += res.move.z;
            v.speed = Math.min(6, Math.hypot(res.move.x, res.move.z) / Math.max(dt, 1e-3));
            v.mode = 'walk';
            v.path = null;
            this._faceVillager(v, palm, dt * 0.5);
            const col = this.game.collision;
            if (col?.resolveCylinder) { _b.set(v.x, v.y + 2, v.z); col.resolveCylinder(_b, 0.45, v.y, 3.5); v.x = _b.x; v.z = _b.z; }
            v.group.position.x = v.x; v.group.position.z = v.z;
        } else { v.speed = 0; v.mode = 'idle'; }
    }

    /** A villager's arm stretched to a point (the hand reaches it, or as far as the arm goes). */
    _reachVillager(v, side, point, back = 0) {
        const arm = this.vArm(v, side);
        const parent = arm.parent;
        if (!parent) return;
        v.group.position.set(v.x, v.group.position.y, v.z);
        v.group.rotation.y = v.yaw;
        parent.updateWorldMatrix(true, false);
        const sh = arm.getWorldPosition(_b);
        const to = _c.copy(point);
        if (back > 0) to.addScaledVector(_d.subVectors(sh, point).normalize(), back); // (their palm against mine, not inside it)
        parent.worldToLocal(to);
        to.sub(arm.position).normalize();
        arm.quaternion.setFromUnitVectors(_down, to);
        arm.updateWorldMatrix(false, true);
    }

    // ------------------------------------------------------------- drawing
    _draw() {
        const g = this.game, ch = g.character;
        for (const side of SIDES) {
            const L = this.mine[side];
            if (L?.kind === 'p') {
                const r = g.remotes.get(L.id);
                if (r) {
                    const my = this.palm(ch, side, _a), their = this.palm(r.character, L.ts, _b);
                    if (this._shaking(side)) {
                        const c = clasp(my, their);
                        this._showHand(side, v3(c.a, _c).sub(my));
                        r.character.reachHand(L.ts, v3(c.b, _d), 1, HAND.PALM_FWD);
                        this._gripOther(r.character, L.ts, 0.6, 'shake');
                    } else {
                        // their hand in mine (my fingers round it): drawn against my palm
                        r.character.reachHand(L.ts, this._against(my, their, _c), 1, HAND.PALM_FWD);
                    }
                }
            }
            const H = this.onMe[side];
            if (H && !this._shaking(side)) {
                const r = g.remotes.get(H.by);
                if (r) {
                    const my = this.palm(ch, side, _a), their = this.palm(r.character, H.hs, _b);
                    r.character.reachHand(H.hs, this._against(my, their, _c), 1, HAND.PALM_FWD);
                    this._gripOther(r.character, H.hs, HAND.WRAP);
                }
            }
        }
        // two other players: the holder's hand round the held one's; a handshake clasped between them
        for (const o of this.others.values()) {
            const a = g.remotes.get(o.by), b = g.remotes.get(o.to);
            if (!a || !b) continue;
            const back = this.others.get(o.to + '|' + o.ts);
            const pa = this.palm(a.character, o.s, _a), pb = this.palm(b.character, o.ts, _b);
            if (back && back.to === o.by && back.ts === o.s && (o.f || back.f)) {
                if (String(o.by) > String(o.to)) continue; // (drawn once, from either end)
                const c = clasp(pa, pb);
                a.character.reachHand(o.s, v3(c.a, _c), 1, HAND.PALM_FWD);
                b.character.reachHand(o.ts, v3(c.b, _d), 1, HAND.PALM_FWD);
                this._gripOther(a.character, o.s, 0.6, 'shake');
                this._gripOther(b.character, o.ts, 0.6, 'shake');
            } else {
                b.character.reachHand(o.ts, this._against(pa, pb, _c), 1, HAND.PALM_FWD);
                this._gripOther(a.character, o.s, HAND.WRAP);
            }
        }
    }

    /** The held hand drawn against the holding palm on its own side (never inside it). */
    _against(holder, held, out) {
        out.subVectors(held, holder);
        const L = out.length();
        if (L < 1e-6) out.set(0, 0, 1); else out.divideScalar(L);
        return out.multiplyScalar(2 * HAND.GAP).add(holder);
    }

    _gripOther(chr, side, curl, pose = null) {
        const h = chr.getActiveHands()[side];
        if (!h?.setGrip) return;
        h.setGrip(curl, pose);
        this._grippedNow.add(h);
    }

    /** My drawn hand moved by `worldDelta` from where it is tracked (it rests on the other hand). */
    _showHand(side, worldDelta) {
        const ch = this.game.character;
        const hand = ch.getActiveHands()[side];
        if (!hand?.group?.parent) return;
        const d = _d.copy(worldDelta).clampLength(0, 0.6);
        hand.group.parent.getWorldQuaternion(_q).invert();
        d.applyQuaternion(_q);
        const rest = hand.group.userData.restOffset;
        hand.group.position.set((rest?.x || 0) + d.x, (rest?.y || 0) + d.y, ch.BONE_LENGTH_LOWER + (rest?.z || 0) + d.z);
        this._shown = this._shown || {};
        this._shown[side] = true;
    }

    _restoreHand(side) {
        if (!this._shown?.[side]) return;
        this._shown[side] = false; // (Character.update springs it back to the tracked place)
    }

    // ------------------------------------------------------------- HUD
    _hud() {
        const g = this.game;
        let line = '';
        for (const side of SIDES) {
            const L = this.mine[side], H = this.onMe[side];
            if (this._shaking(side)) { line = `🤝 Рукопожатие с ${g.playerName?.(L.id) || 'игроком'}`; break; }
            if (L?.kind === 'v') {
                const v = this._villagers()?.get(L.id);
                line = L.f ? `🤝 Рукопожатие: ${v?.name || 'житель'}` : `✋ Вы держите за руку: ${v?.name || 'житель'}`;
                break;
            }
            if (L) { line = `✋ Вы держите за руку: ${g.playerName?.(L.id) || 'игрок'}`; break; }
            if (H) { line = `✋ ${g.playerName?.(H.by) || 'Игрок'} держит вас за руку — дёрните рукой или уйдите, чтобы вырваться`; break; }
        }
        if (!line && this.offer) line = `🤝 ${this.offer.v.name || 'Житель'} протягивает руку — сожмите пальцы`;
        this._setLine(line);
    }

    _setLine(text) {
        if (text === this.line) return;
        this.line = text;
        if (typeof document === 'undefined') return;
        let el = this._lineEl;
        if (!el) {
            el = this._lineEl = document.createElement('div');
            el.id = 'hud-hand';
            el.style.cssText = 'position:fixed;left:50%;top:92px;transform:translateX(-50%);z-index:60;pointer-events:none;'
                + 'padding:5px 14px;border-radius:14px;background:rgba(0,0,0,.45);color:#fff;font-size:15px;white-space:nowrap;display:none';
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.style.display = text ? 'block' : 'none';
    }

    // ------------------------------------------------------------- network
    onNet(m) {
        const g = this.game, me = g.localId;
        if (m.by === me) return;
        const s = m.s === 'left' ? 'left' : 'right', ts = m.ts === 'left' ? 'left' : 'right';
        if (m.t === 'hgrip') {
            const k = m.by + '|' + s;
            if (m.to === me) {
                if (!m.on) { if (this.onMe[ts]?.by === m.by && this.onMe[ts].hs === s) { this.onMe[ts] = null; this._note(`released ${ts}`); } return; }
                const r = g.remotes.get(m.by);
                const ok = r && !r.dead && this._free() && this._handFree(ts) && (!this.onMe[ts] || this.onMe[ts].by === m.by)
                    && this.palm(g.character, ts, _a).distanceTo(this.palm(r.character, s, _b)) < 2.0; // (lag tolerance)
                if (!ok) { this._note(`refused ${ts}`); g.sync?.handFree?.(m.by, s, ts, false); return; }
                this._note(`held ${ts} by ${s}`);
                this.onMe[ts] = { by: m.by, hs: s, t: 0, f: !!m.f, awayT: 0, lagT: 0 };
                return;
            }
            if (m.on) this.others.set(k, { by: m.by, s, to: m.to, ts, f: !!m.f }); else this.others.delete(k);
            return;
        }
        if (m.t === 'hfree') {
            // m.by: the held one; m.holder, m.s: the holding hand; m.ts: the held hand
            if (m.holder === me) {
                const L = this.mine[s];
                if (L && L.kind === 'p' && L.id === m.by && L.ts === ts) {
                    this._letGo(s, false, m.f ? 'they broke free' : 'refused');
                    if (m.f) g.hud?.toast?.(`✋ ${g.playerName?.(m.by) || 'Игрок'} вырвался`, 1800);
                }
            }
            this.others.delete(m.holder + '|' + s);
            return;
        }
        if (m.t === 'vhand' && g.authority) {
            const v = this._villagers()?.get(m.id);
            if (!m.on || !v) { const H = this.vHolds.get(m.id); if (H && H.by === m.by) { if (v) v.handLink = null; this.vHolds.delete(m.id); } return; }
            let H = this.vHolds.get(m.id);
            if (H && H.by !== m.by) return; // (one hand at a time)
            if (!H) {
                if (v.foe || v.fleeT > 0) { g.castleLife?._say?.(v, pick(NO), 2.5); g.sync?.villagerFree?.(m.id, m.by); return; }
                H = { by: m.by, t: 0, hp: v.hp, patience: v.role === 'knight' || v.role === 'king' ? 3 + Math.random() * 2 : 7 + Math.random() * 5, side: 'right' };
                this.vHolds.set(m.id, H);
            }
            if (Array.isArray(m.p)) { H.p = { x: +m.p[0], y: +m.p[1], z: +m.p[2] }; H.at = this._t; }
            if (!H.p) this.vHolds.delete(m.id);
            return;
        }
        if (m.t === 'vfree' && m.to === me) {
            for (const side of SIDES) if (this.mine[side]?.kind === 'v' && this.mine[side].id === m.id) this._letGo(side, false);
        }
    }

    onLeave(id) {
        for (const s of SIDES) {
            if (this.mine[s]?.kind === 'p' && this.mine[s].id === id) this._letGo(s, false);
            if (this.onMe[s]?.by === id) this._freeMe(s, false, false);
        }
        for (const [k, o] of this.others) if (o.by === id || o.to === id) this.others.delete(k);
        for (const [k, H] of this.vHolds) if (H.by === id) { const v = this._villagers()?.get(k); if (v) v.handLink = null; this.vHolds.delete(k); }
    }

    /** Everything let go (death, respawn, a new world). */
    breakAll() {
        for (const s of SIDES) { this._letGo(s); this._freeMe(s, false); }
        if (this.offer?.v) this.offer.v.handLink = null;
        this.offer = null;
    }

    /** (tests) what the hands are doing. */
    state() {
        const pick1 = (L) => L && { kind: L.kind, id: L.id, ts: L.ts, f: !!L.f };
        return {
            mine: { left: pick1(this.mine.left), right: pick1(this.mine.right) },
            onMe: { left: this.onMe.left && { by: this.onMe.left.by, hs: this.onMe.left.hs }, right: this.onMe.right && { by: this.onMe.right.by, hs: this.onMe.right.hs } },
            shaking: SIDES.filter((s) => this._shaking(s)),
            others: [...this.others.values()].map((o) => ({ ...o })),
            offer: this.offer ? this.offer.v.id : null,
            line: this.line,
        };
    }
}
