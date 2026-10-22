/**
 * BodyImpact.js — something hits MY body (the local player; every computer moves only its own).
 *
 * One door for every blow: spells, blasts, a knight's sword, an animal's butt, an arrow, another
 * player's hands. The body gets the push (Game.knockback slides it), and `classify` decides what
 * the push does: nothing, a stagger (steps back, arms flail) or a knockdown (Knockdown.js). A blow
 * at the head kicks it (HeadJolt): the head snaps the way it was hit and so does the first-person view.
 *
 *   Protection facing the source: the spell is felt but held — 25 % of the push, never a fall,
 *   the shield arm is pushed back. The dome: nothing moves me, a blast's wave neither (any blast, mine too). In water: half the
 *   push, never a fall. Lifted by Leviosa: the magic holds the body (only the head jolts).
 *   Frozen: a push ≥ 3 topples the statue and it shatters.
 *   «Protection Gods» (… Maxima): no spell but the gods' own moves me at all (_godsHold).
 */

import * as THREE from 'three';
import { IMPACT, classify, fallDir, headKick, HeadJolt, SPELL_PHYSICS, spellPush } from './Impact.js';
import { fallStrength } from './Knockdown.js';
import { GOT_UP_T } from './HandRelease.js';
import { isMagicKind, isDivine, ALL_ROUND } from './ProtectionGods.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();

export class BodyImpact {
    constructor(game) {
        this.game = game;
        this.jolt = new HeadJolt();
        this.gentleUntil = 0; // (a gentle Leviosa release: no fall-over landing until then)
        this._last = new Map();
        this.log = []; // what hit me (tests, HUD)
    }

    /**
     * Something hits my body.
     * o: {v: Vector3 world impulse (hero m/s), from: Vector3|null (null: no shield check), by, spell|kind,
     *     toss, head: {lp, dir, speed}|null (an exact blow on the head), jolt: rad/s away from `from`,
     *     always: {down}|null (knocks down by its nature), blast, noShield, down,
     *     fly (thrown through the air: no ground slows it until it lands), tumble (flips over in the air)}
     * @returns 'none'|'stagger'|'knockdown'|'shatter'|'blocked'
     */
    apply(o) {
        const g = this.game, c = g.combat, ch = g.character;
        if (!c || c.dead || g.isDeadLocal || g.spiders?.held) return 'none';
        if (g.levitation?.lifted) { this._kickHead(o); return 'none'; }      // (the magic holds the body)
        if (g.circleAttack?.holdsMe?.()) return 'none'; // (my «Circle Attack»: I stand on my island — nothing pushes me off)
        if (this._godsHold(o)) { this._note(o, 'blocked'); return 'blocked'; } // (the gods' shield: no spell moves me — ProtectionGods.js)
        if (o.blast && c.blastProof?.()) { this._note(o, 'blocked'); return 'blocked'; } // (a dome: a blast's wave never moves me — mine either)
        const dome = !!(c.shield && c.shield.type === 2 && c.shield.left > 0);
        const facing = !o.noShield && !!o.from && !dome && c.shieldFactor(o.from) >= 1;
        const swim = ch.swimY != null, frozen = !!c.frozen;
        const v = o.v.length() * (g.armor?.stat('push') ?? 1); // (a named armour's perk: pushes move half as much)
        let k = 1, res;
        if (o.blast) {
            k = dome ? IMPACT.BLAST_DOME_K : facing ? IMPACT.BLAST_SHIELD_K : 1;
            res = classify(v * k, { crouch: ch.isCrouching, swim, frozen });
            if (k < 1 && res === 'knockdown') res = 'stagger';               // (a shield never lets a blast throw me)
        } else {
            if (dome) k = 0; else if (facing) k = IMPACT.BLOCKED_K;
            res = classify(v, { crouch: ch.isCrouching, swim, frozen, dome, blocked: facing });
            if (o.always && !dome && !facing && !frozen && !swim) res = 'knockdown';
        }
        if (v * k >= IMPACT.KNOCK_ANY && res === 'stagger' && !swim && k >= 1) res = 'knockdown';
        // the push itself
        if (k > 0) {
            if (g.flight?.active) g.knockback.addScaledVector(o.v, k);
            else {
                g.knockback.x += o.v.x * k; g.knockback.z += o.v.z * k;
                const toss = Math.max(o.toss || 0, o.v.y > 2 ? o.v.y : 0) * k;
                if (toss > 2 && res !== 'knockdown') { ch.group.position.y += 0.7; ch.verticalVelocity = Math.max(ch.verticalVelocity || 0, toss); ch.onGround = false; }
                o.toss = toss;
            }
        }
        this._note(o, res);
        // hit, thrown, reeling: the arms flail — nothing leaves the hand by it (the wand above all), nor in the
        // moment after (HandRelease.holdsFast); only «Экспеллиармус» knocks it out, and says so
        if (res !== 'none') ch._downUntil = Math.max(ch._downUntil || 0, performance.now() + GOT_UP_T * 1000);
        if (res === 'shatter') { c.die(o.by, 'shatter'); return res; }
        if (!dome) this._kickHead(o, k);
        const dir = fallDir(o.v.x, o.v.z, ch.group.rotation.y);
        if (res === 'knockdown') {
            if (g.flight?.busy) g.flight.land?.('blown');
            g.knock.knock({ dir, down: o.always?.down ?? o.down ?? undefined, by: o.by, kind: o.spell || o.kind, cause: o.cause || null, toss: o.toss || 0, strength: Math.max(fallStrength({ v: v * k }), 0.15),
                fly: !!o.fly && k >= 1, tumble: o.tumble || 0 }); // («Джолт»: thrown through the air, tumbling over)
        } else if (res === 'stagger') g.knock.stagger({ dir, v: v * k });
        if (facing) this._recoil(o);
        return (facing || dome) && res === 'none' ? 'blocked' : res;
    }

    /**
     * «Protection Gods» (… Maxima): a spell not of the gods pushes, throws, staggers nobody under it (the gods' own
     * spells pay for their blow themselves — Combat.godsHit; blows, beasts, arrows, cannonballs are no spells).
     * The dome: from everywhere; the hand shield: what it faces, and what strikes all round (a blast, a quake).
     */
    _godsHold(o) {
        const s = this.game.combat?.shield, kind = o.spell;
        if (!s?.gods || !(s.left > 0) || !kind || o.cause === 'cannon' || !isMagicKind(kind) || isDivine(kind)) return false;
        if (s.type === 2) return true;
        if (!o.from || o.blast || ALL_ROUND.has(kind)) return true;
        return !o.noShield && this.game.combat.shieldFactor(o.from) >= 1;
    }

    _note(o, res) {
        this.log.push({ k: o.spell || o.kind || '?', res, v: Math.round(o.v.length() * 10) / 10, by: o.by || null, t: Math.round(performance.now()) });
        if (this.log.length > 30) this.log.shift();
    }

    /** Spell head-kick away from the source, or the exact blow (hand strikes). */
    _kickHead(o, k = 1) {
        const g = this.game, ch = g.character;
        if (!ch.head) return;
        ch.head.getWorldQuaternion(_q).invert();
        if (o.head) {
            const d = _d.fromArray(o.head.dir).applyQuaternion(_q).normalize();
            const w = headKick(o.head.lp, [d.x, d.y, d.z], o.head.speed * k);
            this.jolt.kick(w);
            g.cameraBaseRotation = (g.cameraBaseRotation || 0) + IMPACT.JOLT_TURN * w.yaw / Math.sqrt(IMPACT.JOLT_K); // a hook leaves the view turned a little
            g.fx.shake = Math.max(g.fx.shake || 0, Math.min(0.8, 0.08 * o.head.speed));
        } else if (o.jolt && o.from) {
            const d = _d.copy(g.combat.center(_v)).sub(o.from).normalize().applyQuaternion(_q);
            this.jolt.kick(headKick([-d.x * 0.6, -d.y * 0.6, -d.z * 0.6], [d.x, d.y, d.z], o.jolt * k / (IMPACT.JOLT_GAIN * 0.7)));
        }
    }

    /** A blocked spell is still felt: the shield arm is pushed back (never a fall). */
    _recoil(o) {
        const g = this.game, side = g.combat.shield?.side || 'right';
        g.character.setHandOffset?.(side, _v.copy(o.v).setLength(Math.min(0.35, 0.05 * o.v.length())));
        g.fx.shake = Math.max(g.fx.shake || 0, 0.2);
    }

    /** A spell hit me (the push is given by the spell, else from SPELL_PHYSICS along from → me). */
    spellHit(kind, from, byId, push = null, opts = {}) {
        const P = SPELL_PHYSICS[kind];
        if (!P && !push) return 'none';
        const me = this.game.combat.center(new THREE.Vector3());
        let v;
        if (push) v = push.clone();
        else {
            v = me.clone().sub(from).setY(0);
            if (v.lengthSq() < 1e-6) v.set(0, 0, 1).applyAxisAngle(_d.set(0, 1, 0), this.game.character.group.rotation.y);
            v.normalize().multiplyScalar(spellPush(kind, me.distanceTo(from)));
        }
        return this.apply({ v, from, by: byId, spell: kind, jolt: P?.jolt || 0, toss: P?.toss || 0,
            always: P?.always ? { down: P.down } : null, down: P?.down, noShield: opts.noShield !== false });
    }

    /** Head + camera, every frame (also while stunned or iced). */
    step(dt) { return this.jolt.step(dt); }

    reset() { this.jolt.reset(); this._last.clear(); }

    /**
     * Another player's hands hit me (`phit` with a punch, or `ppush`): validated here — they must
     * be near (lag-tolerant), not too often, the push capped — then applied to my body.
     */
    onStrike(m, shieldTook = false) {
        const g = this.game, r = g.remotes?.get(m.by);
        if (!r || r.dead || !Array.isArray(m.i)) return 'none';
        if (r.position.distanceTo(g.character.group.position) > 0.9 * 2 + 1.9 + IMPACT.REACH_SLACK + 1.2) return 'none';
        const key = m.by + '|' + (m.s || '') + '|' + (m.c ? 'c' : ''), now = performance.now() / 1000;
        if (now - (this._last.get(key) ?? -9) < (m.c ? 0.05 : IMPACT.RATE)) return 'none';
        this._last.set(key, now);
        const v = new THREE.Vector3(+m.i[0] || 0, +m.i[1] || 0, +m.i[2] || 0).clampLength(0, IMPACT.MAX_IMPULSE);
        if (shieldTook || m.k === 'guard') return this.apply({ v: v.multiplyScalar(shieldTook ? 0.3 : 1), from: null, by: m.by, kind: m.k });
        if (m.c) {
            // a push held on: carried along unless I lean / walk into it
            const ch = g.character, yaw = ch.group.rotation.y;
            const into = ch.isRunning ? Math.max(0, -(-Math.sin(yaw) * v.x - Math.cos(yaw) * v.z) / (v.length() || 1)) * 7.5 * (ch.runIntensity || 0.5) : 0;
            const net = Math.max(0, v.length() - into);
            if (net > 0.05) { v.setLength(net); ch.group.position.x += v.x * 0.1; ch.group.position.z += v.z * 0.1; }
            return 'none';
        }
        const head = m.pt === 'head' && Array.isArray(m.lp)
            ? { lp: m.lp.slice(0, 3).map((x) => Math.max(-1, Math.min(1, +x || 0))), dir: v.clone().normalize().toArray(), speed: Math.min(20, +m.sp || v.length() * 4) }
            : null;
        return this.apply({ v, from: null, by: m.by, kind: m.k, head });
    }
}
