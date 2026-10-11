/**
 * HerdGuards.js — the hidden guardians of herds.
 *
 *  - Cows: 45% of herds are led by a BULL that looks like any other cow. Attack the herd
 *    (hit, shoot, cast at or kill one of them) and his eyes ignite: in ~1.6 s he grows to
 *    twice his size and turns into a bronze bull of Colchis (the Khalkotauroi Hephaestus made
 *    for King Aeetes, which Jason had to yoke): bronze horns, hooves and mouth, burning eyes,
 *    smoke and fire from the nostrils, a lashing tail. He hunts the attacker: stamps, lowers
 *    his horns and rushes in a straight line (whoever he hits is knocked down and thrown),
 *    snorts short jets of fire close up (grass and trees catch fire). The herd flees.
 *  - Sheep: 29% of flocks have a leader RAM, an ordinary-looking ram. Attack the flock and in
 *    5 s he rears, rises onto his hind legs and becomes a ram-headed MINOTAUR taller than a
 *    man (40 HP): he walks upright at the attacker, butts with his curled horns (knocks down),
 *    strikes with his fists, charges from afar. Killed, he drops «Рог Минотавра».
 *
 * Both calm down when nobody has attacked them for a while (the attacker dead or far away):
 * they shrink back slowly and live in the herd as before. Spells work on them like on any
 * animal (they are animals: Animals.js targets), but a stun holds them shorter.
 *
 * The host decides (wakes them, moves them, their blows); everybody sees the change
 * (a.form, a.formK, a.act are sent with the animals — `look()` draws them on every computer).
 */

import * as THREE from 'three';
import { bronzeBull, setBronze, minotaurModel, animateMinotaur } from './AnimalModels.js';
import { newUid } from './ItemTypes.js';

export const GUARD = {
    BULL_CHANCE: 0.45,
    RAM_CHANCE: 0.29,
    BULL: { RISE: 1.6, SCALE: 2, HP: 60, DMG: 6, RUN: 12, STAMP: 0.9, RUSH_T: 2.4, FIRE_R: 6, FIRE_CD: 4, CALM: 40, SHRINK: 3, STUN_K: 0.5, MEAT: 10 },
    RAM: { RISE: 5, HP: 40, DMG: 4, BUTT: 5, SPEED: 4.4, CHARGE: 8.5, REACH: 3.4, CALM: 45, SHRINK: 5, STUN_K: 0.7, MEAT: 6 },
    FAR: 70, // m: an attacker farther than this is "gone"
};
/** form: 0 ordinary, 1 changing, 2 the monster, 3 changing back. act (what it does, for the look): */
export const ACT = { none: 0, stamp: 1, rush: 2, fire: 3, punch: 4, butt: 5, roar: 6 };

/** A new herd: which one of the n is its hidden guardian (-1: none). Cows → a bull, sheep → a ram. */
export function rollGuard(type, n, rnd = Math.random) {
    const p = type === 'cow' ? GUARD.BULL_CHANCE : type === 'sheep' ? GUARD.RAM_CHANCE : 0;
    if (!n || rnd() >= p) return -1;
    return 0; // (the leader — the first of the herd)
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class HerdGuards {
    constructor(animals) {
        this.A = animals;
        this.log = [];
    }

    get game() { return this.A.game; }

    /** Is `a` a guardian (hidden or awake)? */
    static isGuard(a) { return !!a.guard; }

    /** (host) Something attacked `a` (by: the attacker's id): the herd's guardian wakes. */
    attacked(a, by) {
        const h = a.herd;
        const gd = a.guard ? a : h?.guard != null ? this.A.byId.get(h.guard) : null;
        if (!gd || gd.dead || gd.servantOf != null) return;
        if (by != null && this.A._playerPos(by)) gd.foe = by;
        gd.calmT = 0;
        if (gd.form === 2 || gd.form === 1) return;
        if (gd.foe == null) return; // (nobody to fight: a falling stone, a stray blast)
        this.wake(gd);
    }

    /** (host) The change begins. */
    wake(a) {
        const R = a.guard === 'bull' ? GUARD.BULL : GUARD.RAM;
        const wasBack = a.form === 3;
        a.form = 1;
        a.formT = wasBack ? R.RISE * (a.formK || 0) : 0;
        a.state = 'guard'; a.stateT = 0;
        a.hp = Math.max(a.hp, R.HP); // (40 HP for the minotaur, a lot for the bull)
        a.act = ACT.roar;
        a.ch = { ph: 'aim', t: 0 };
        a.fireCD = 1.5;
        this.log.push({ ev: 'wake', id: a.id, kind: a.guard });
        // the herd flees from the one who attacked
        for (const o of this.A.list) {
            if (o === a || o.dead || o.herd !== a.herd || o.rider || o.lev) continue;
            o.state = 'flee'; o.attacker = a.foe; o.stateT = 10 + Math.random() * 4;
        }
        const g = this.game;
        g.fx?.lightFlash?.(a.group.position.clone().setY(a.group.position.y + 2), a.guard === 'bull' ? 0xff7a1a : 0xb070ff, 4, 0.6, 30);
        g.hud?.setVoice?.(a.guard === 'bull' ? '🔥 Бык вожак стада просыпается — это медный бык Колхиды!' : '🐏 Вожак отары встаёт на задние ноги… Минотавр!', true);
    }

    /** (host) A guardian's mind for this frame. Returns true when it handled the animal. */
    think(a, dt) {
        if (!a.guard || !a.form || a.servantOf != null) return false;
        const A = this.A, g = this.game;
        const R = a.guard === 'bull' ? GUARD.BULL : GUARD.RAM;
        a.formT = (a.formT || 0) + dt;
        a.spd = 0;
        a.act = ACT.none;
        if (a.form === 1) {
            a.formK = Math.min(1, a.formT / R.RISE);
            a.act = a.formK > 0.8 ? ACT.roar : ACT.stamp;
            if (a.formT >= R.RISE) { a.form = 2; a.formK = 1; a.formT = 0; a.calmT = 0; a._body = null; this.log.push({ ev: 'awake', id: a.id }); }
        } else if (a.form === 3) {
            a.formK = Math.max(0, 1 - a.formT / R.SHRINK);
            if (a.formT >= R.SHRINK) {
                a.form = 0; a.formK = 0; a.state = 'graze'; a.foe = null; a._body = null;
                a.hp = Math.min(Math.max(a.hp, 1), a.baseHp ?? 10); // (back to an ordinary animal's strength)
                A._setIdle(a, 'look');
                this.log.push({ ev: 'calm', id: a.id });
            }
        } else {
            const tp = a.foe != null ? A._playerPos(a.foe) : null;
            const far = !tp || Math.hypot(tp.x - a.group.position.x, tp.z - a.group.position.z) > GUARD.FAR;
            a.calmT = far ? (a.calmT || 0) + dt : 0;
            if (a.calmT > R.CALM) { a.form = 3; a.formT = 0; this.log.push({ ev: 'shrink', id: a.id }); }
            else if (!far) { if (a.guard === 'bull') this._bull(a, tp, dt); else this._ram(a, tp, dt); }
        }
        a.pose = 0;
        A._body(a, dt);
        A._animate(a, Math.min(1, a.spd / 6), dt); // (its legs, head, and how it looks now: look())
        return true;
    }

    /** Turn towards (x, z) at `rate` rad/s; returns how far off it still is. */
    _face(a, x, z, rate, dt) {
        const p = a.group.position;
        const yaw = Math.atan2(-(x - p.x), -(z - p.z));
        const d = wrap(yaw - a.group.rotation.y);
        a.group.rotation.y += Math.max(-rate * dt, Math.min(rate * dt, d));
        return Math.abs(d);
    }

    /** Move forward `step` m (walls stop it: the body physics pushes it out). */
    _forward(a, step) {
        const p = a.group.position, y = a.group.rotation.y;
        p.x -= Math.sin(y) * step; p.z -= Math.cos(y) * step;
        a.walkT += step * 1.6;
        a.spd = step / Math.max(1e-3, this._dt || 0.016);
    }

    /** The bronze bull: aim → stamp → a straight rush (knocks down whoever it hits) → turn; fire close up. */
    _bull(a, tp, dt) {
        const R = GUARD.BULL, p = a.group.position, ch = a.ch || (a.ch = { ph: 'aim', t: 0 });
        this._dt = dt;
        ch.t += dt;
        a.fireCD -= dt;
        const dist = Math.hypot(tp.x - p.x, tp.z - p.z);
        const size = a.group.scale.y;
        const reach = 1.3 * size + 1.2;
        // fire from the nostrils at someone close in front
        if (dist < R.FIRE_R && a.fireCD <= 0 && ch.ph !== 'rush') {
            const off = this._face(a, tp.x, tp.z, 2.5, dt);
            if (off < 0.4) {
                a.fireCD = R.FIRE_CD; a.fireT = 0.7; ch.ph = 'turn'; ch.t = 0;
                const nose = this.nose(a, _v), dir = _w.set(tp.x - nose.x, tp.y + 1 - nose.y, tp.z - nose.z).normalize();
                this.game.fire?.igniteAlong(nose.clone(), dir.clone(), R.FIRE_R + 1);
                this.A._butt(a, a.foe, { dmg: 2, k: 3 });
                this.log.push({ ev: 'fire', id: a.id });
            }
        }
        if (a.fireT > 0) { a.fireT -= dt; a.act = ACT.fire; return; }
        if (ch.ph === 'aim') {
            const off = this._face(a, tp.x, tp.z, 2.2, dt);
            if (off < 0.2 && ch.t > 0.3) { ch.ph = 'stamp'; ch.t = 0; }
            else if (dist > 20) this._forward(a, R.RUN * 0.35 * dt);
        } else if (ch.ph === 'stamp') {
            a.act = ACT.stamp;
            this._face(a, tp.x, tp.z, 1.2, dt);
            if (ch.t > R.STAMP) { ch.ph = 'rush'; ch.t = 0; ch.hit = false; ch.from = p.clone(); ch.past = dist + 6; }
        } else if (ch.ph === 'rush') {
            a.act = ACT.rush;
            const before = p.clone();
            this._forward(a, R.RUN * Math.min(1, ch.t * 2.5 + 0.3) * dt);
            if (!ch.hit && dist < reach) {
                ch.hit = true;
                this.A._butt(a, a.foe, { dmg: R.DMG, k: 16, down: 2 });
                this.log.push({ ev: 'gore', id: a.id });
            }
            const gone = Math.hypot(p.x - ch.from.x, p.z - ch.from.z);
            const stuck = ch.t > 0.4 && Math.hypot(p.x - before.x, p.z - before.z) < R.RUN * dt * 0.2; // (a wall)
            if (ch.t > R.RUSH_T || gone > ch.past || stuck) { ch.ph = 'turn'; ch.t = 0; }
        } else {
            // (it slows down and turns round for the next rush)
            if (ch.t < 0.5) this._forward(a, R.RUN * (0.5 - ch.t) * dt);
            this._face(a, tp.x, tp.z, 1.6, dt);
            if (ch.t > 1.1) { ch.ph = 'aim'; ch.t = 0; }
        }
    }

    /** The ram-minotaur: walks upright at the attacker, butts and strikes close up, charges from afar. */
    _ram(a, tp, dt) {
        const R = GUARD.RAM, p = a.group.position, ch = a.ch || (a.ch = { ph: 'walk', t: 0, n: 0 });
        this._dt = dt;
        ch.t += dt;
        const dist = Math.hypot(tp.x - p.x, tp.z - p.z);
        if (ch.ph === 'blow') {
            a.act = ch.butt ? ACT.butt : ACT.punch;
            this._face(a, tp.x, tp.z, 2, dt);
            if (!ch.done && ch.t > 0.35) {
                ch.done = true;
                if (dist < R.REACH + 0.8) this.A._butt(a, a.foe, ch.butt ? { dmg: R.BUTT, k: 11, down: 1.5 } : { dmg: R.DMG, k: 7 });
                this.log.push({ ev: ch.butt ? 'butt' : 'punch', id: a.id });
            }
            if (ch.t > 0.9) { ch.ph = 'walk'; ch.t = 0; }
            return;
        }
        if (ch.ph === 'charge') {
            a.act = ACT.butt;
            this._face(a, tp.x, tp.z, 0.8, dt);
            this._forward(a, R.CHARGE * dt);
            if (dist < R.REACH) { ch.ph = 'blow'; ch.t = 0.2; ch.butt = true; ch.done = false; }
            else if (ch.t > 2) { ch.ph = 'walk'; ch.t = 0; }
            return;
        }
        const off = this._face(a, tp.x, tp.z, 2.4, dt);
        if (dist < R.REACH && ch.t > 0.5) { ch.ph = 'blow'; ch.t = 0; ch.n = (ch.n || 0) + 1; ch.butt = ch.n % 3 === 0; ch.done = false; return; }
        if (dist > 11 && dist < 22 && off < 0.3 && ch.t > 2.5) { ch.ph = 'charge'; ch.t = 0; return; }
        if (dist > R.REACH * 0.8) this._forward(a, R.SPEED * dt * Math.max(0.2, Math.cos(off)));
    }

    /** Where the bull's nostrils are (world). */
    nose(a, out) {
        const head = a.model.userData.head;
        return head ? head.localToWorld(out.set(0, -0.02, -0.56)) : out.copy(a.group.position);
    }

    /**
     * How a guardian looks this frame (host and guests): the bull's size, bronze, glowing eyes,
     * smoke and fire, the lashing tail; the ram rearing and becoming the minotaur.
     */
    look(a, dt) {
        if (!a.guard && !a.formK && !a.form) return;
        if (a.type === 'cow') this._bullLook(a, dt);
        else if (a.type === 'sheep') this._ramLook(a, dt);
    }

    _bullLook(a, dt) {
        const k = ease(a.formK || 0), m = a.model, g = this.game;
        const base = a.baseScale || (a.baseScale = m.scale.y);
        if (!k && !m.userData.bronze) return;
        bronzeBull(m);
        m.scale.setScalar(base * (1 + (GUARD.BULL.SCALE - 1) * k));
        a.bodyR = k > 0.02 ? 1.2 * (1 + k) : null; a.bodyH = k > 0.02 ? 2 * (1 + k) : null; // (its body against walls and players)
        const heat = 0.5 + 0.5 * Math.sin(performance.now() / 160);
        setBronze(m, k, a.act === ACT.fire ? 1 : heat * k);
        // the tail lashes, the head goes down for a rush
        const tail = m.userData.tail;
        if (tail) tail.rotation.y = k > 0.1 ? Math.sin(performance.now() / 70) * 0.8 * k : 0;
        if (k > 0.3 && a.act === ACT.stamp || a.act === ACT.rush) a.headP = (a.headP || 0) + (-0.55 - (a.headP || 0)) * Math.min(1, dt * 6);
        if (a.act === ACT.stamp && m.userData.legs) m.userData.legs[0].rotation.x = Math.max(0, Math.sin(performance.now() / 90)) * 0.5; // (pawing the ground)
        // smoke from the nostrils; fire when it snorts; embers while it changes
        if (!g.fx || !k) return;
        const nose = this.nose(a, _v);
        if (Math.random() < dt * (a.act === ACT.fire ? 60 : 6)) {
            const f = _w.set(-Math.sin(a.group.rotation.y), -0.15, -Math.cos(a.group.rotation.y));
            if (a.act === ACT.fire) for (let i = 0; i < 3; i++) g.fx.spark(nose, Math.random() < 0.5 ? 0xff7a1a : 0xffd040, 0.22, f.clone().multiplyScalar(9 + Math.random() * 4).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)), 0.5);
            else g.fx.spark(nose, 0x555555, 0.18, f.clone().multiplyScalar(1.5).setY(1), 0.9);
        }
        if (a.form === 1 && Math.random() < dt * 40) g.fx.spark(a.group.position.clone().setY(a.group.position.y + Math.random() * 3 * k + 0.5), 0xffa030, 0.12, new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.8);
    }

    _ramLook(a, dt) {
        const m = a.model, g = this.game, K = a.formK || 0;
        let mino = m.userData.minotaur;
        if (!K && !mino) return;
        if (!mino) {
            mino = minotaurModel();
            mino.scale.setScalar(1 / m.scale.y); // (its own size in metres, not the sheep's)
            m.add(mino);
            m.userData.minotaur = mino;
            m.userData.sheepParts = m.children.filter((o) => o !== mino);
            m.rotation.order = 'YXZ';
        }
        // 0 … 0.32: the ram rears onto its hind legs; 0.32 … 0.48: a flash — the shape changes;
        // 0.48 … 0.88: the minotaur grows up out of it; 0.88 … 1: it roars
        const rear = ease(K / 0.32), grow = ease((K - 0.44) / 0.44);
        const ramShown = K < 0.4;
        for (const o of m.userData.sheepParts) o.visible = ramShown;
        mino.visible = K >= 0.4;
        a.group.rotation.x = ramShown ? rear * 1.0 : 0;
        mino.scale.setScalar((0.45 + 0.55 * grow) / m.scale.y);
        a.bodyR = 1.0 * Math.max(0.6, grow); a.bodyH = 5.6 * Math.max(0.3, grow);
        if (!mino.visible) { a.bodyR = null; a.bodyH = null; }
        animateMinotaur(mino, { walkT: a.walkT || 0, moving: Math.min(1, (a.spd || (a.netMoving ? 3 : 0)) / 4), act: a.act || 0, t: performance.now() / 1000, roar: K < 1 && K > 0.85 });
        if (g.fx && (a.form === 1 || a.form === 3) && Math.random() < dt * 30) {
            g.fx.spark(a.group.position.clone().setY(a.group.position.y + Math.random() * 4.5), 0xb070ff, 0.14, new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.8);
        }
        if (g.fx && a._lastK < 0.4 && K >= 0.4) g.fx.lightFlash?.(a.group.position.clone().setY(a.group.position.y + 2), 0xb070ff, 5, 0.5, 30);
        a._lastK = K;
    }

    /** (host) A guardian killed as the monster: the bull leaves lots of meat and a bronze horn; the minotaur its horn. */
    died(a) {
        if (!a.guard || !(a.formK > 0.4)) return;
        const g = this.game;
        const R = a.guard === 'bull' ? GUARD.BULL : GUARD.RAM;
        a.meat = R.MEAT;
        const p = a.group.position.clone().setY(a.group.position.y + 1.5);
        const item = a.guard === 'bull' ? { kind: 'bronzeHorn', uid: newUid() } : { kind: 'minotaurHorn', uid: newUid() };
        g.items?.spawnLoose?.(item, p, { vel: new THREE.Vector3((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2) });
        this.log.push({ ev: 'drop', id: a.id, kind: item.kind });
        g.hud?.setVoice?.(a.guard === 'bull' ? '🐂 Медный бык повержен — остался бронзовый рог' : '🐏 Минотавр повержен — остался Рог Минотавра', true);
    }
}
