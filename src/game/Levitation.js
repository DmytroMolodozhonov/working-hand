/**
 * Levitation.js — «Вингардиум Левиоса».
 *
 * Point a hand at a loose object a few metres away (a sword, an axe, an ice
 * ball, a wand, a book, a book-bird in the air…) and say the words: the object rises and floats in front of the
 * hand, following it — slowly and heavily, like it is carried by magic.
 * A fast, far jerk of the hand breaks the spell: the object flies off with
 * the speed it had (you can throw things this way). Saying the words again
 * lets it down gently.
 *
 * Living bodies too — an animal, a zombie, a villager — rise and hang in front
 * of the hand the same way, kicking. Holding one costs strength in the free world
 * (HOLD_FATIGUE a second); let go high up and it falls and gets hurt. The host moves
 * them (for whoever casts, by the caster's hand). A wizard is lifted by a duel
 * charge: if it lands (the duel decides), the wizard's own computer carries its
 * body to the caster's hand; «Protection» towards the caster breaks free.
 */

import * as THREE from 'three';
import { rayToSegment, segmentToSegment, BODY } from './Duel.js';
import { refusal } from './Hints.js';
import { AIM, aimOffset, steadyDir, applyAimOffset } from './AimHold.js';

export const LEVITATE = {
    RANGE: 30, // m (the heroes are big: 10 was only a few real steps — a thing on the ground was out of reach)
    CONE: 0.5, // rad around the pointing direction
    MIN_HOLD: 2, // m in front of the hand
    MAX_HOLD: 30, // (it is lifted where it is — not pulled to the hand first: that looked like a teleport)
    TWIST: 1.6, // the object turns this much more than the wrist (a small turn of the hand swings it)
    FOLLOW: 3.5, // how fast the float point follows the hand (1/s)
    RISE: 2.5, // 1/s: a thing taken low rises up onto the hand's line this fast (sideways it stays put)
    GLITCH: AIM.GLITCH, // (AimHold.js)
    GLITCH_T: AIM.GLITCH_T,
    DROP_DISTANCE: 0.75, // m of hand movement within DROP_WINDOW = a jerk
    DROP_WINDOW: 0.25,
    GRACE: 0.8,
    WIZARD_T: 10, // s a wizard can be held where there are no strength rules
    STALE: 3, // s without the caster's pose: what it held falls
};

// (aiming at what is held — shared with the «Bubble» of «Water Vortex»: AimHold.js)
export { aimOffset, steadyDir, applyAimOffset };

/** Magic armour stops the plain «Левиоса», never «Левиоса Максима» (`maxima`). */
export function levBlocked(o, maxima = false) {
    return !maxima && !!(o && (o.magicArmor || o.armor?.magic));
}

/** Strength a second it costs to hold a living body (free world): light, heavy (a cow, a knight), a wizard. */
export const HOLD_FATIGUE = { light: 2, heavy: 3, wizard: 4 };

/**
 * A living body held up does not hang still: it is frightened and struggles to get free —
 * every `every` s (a random part of it) it jerks in the magic's hold this hard (m/s).
 * A castle wizard tries spells: after `free` s it breaks the hold and comes down softly.
 */
export const STRUGGLE = {
    villager: { every: [0.5, 1.1], jerk: 1.4 },
    knight: { every: [0.35, 0.8], jerk: 3 }, // (a knight, the king: strong and angry)
    wizard: { every: [0.6, 1.2], jerk: 1, free: [3, 5] },
    animal: { every: [0.3, 0.8], jerk: 2.2 },
    zombie: { every: [0.4, 0.9], jerk: 1.8 },
};

/** What a held body shouts (castle people; a frightened person, a fighter, a wizard). */
export const LEV_CRIES = {
    villager: ['Ааа! Опустите меня!', 'Помогите!', 'Мамочки!', 'Я боюсь высоты!'],
    knight: ['Отпусти, колдун!', 'Стража!', 'Ты за это ответишь!'],
    king: ['Опустите короля!', 'Стража! Схватить его!'],
    wizard: ['Как ты смеешь!', 'Фините Инкантатем!', 'Сейчас я тебя…'],
};

/** Which way a living body struggles (STRUGGLE / LEV_CRIES key). */
export function struggleKind(ck, c) {
    if (ck === 'a') return 'animal';
    if (ck === 'z') return 'zombie';
    if (c.wizard) return 'wizard';
    return c.role === 'knight' || c.role === 'king' ? 'knight' : 'villager';
}

/**
 * A body thrown by «Левиоса» (let go with a swing) flies by its own weight, kicking, until it
 * strikes something — the ground, a wall, another creature. How hard decides everything:
 *   below KNOCK_V m/s   it only lands (a light throw is harmless)
 *   from KNOCK_V        it is knocked off its feet, rolls over and lies a while (as after «Джолт»)
 *   above HURT_V        it is hurt: PER_MS hearts a m/s more (armour takes its share — CastleLife.hit)
 *   from ROLL_V         it bounces and flips over, and is dizzy afterwards
 * Thrown into another creature, it knocks that one down too (OTHER_K of the blow).
 */
export const THROW = { KNOCK_V: 6, HURT_V: 9, PER_MS: 0.9, ROLL_V: 13, WALL_DROP: 0.35, WALL_MIN: 5, HIT_R: 0.7, OTHER_K: 0.6, MIN_HIT_V: 4 };

/** Hearts a body loses striking something at `v` m/s. */
export function impactDamage(v) {
    return v > THROW.HURT_V ? Math.round((v - THROW.HURT_V) * THROW.PER_MS) : 0;
}

/** Damage of a fall from `h` m (a short fall does nothing). */
export function fallDamage(h) {
    return h > 3.5 ? Math.round((h - 3.5) * 2) : 0;
}

const _v1 = new THREE.Vector3();
const _ia = new THREE.Vector3(), _ib = new THREE.Vector3(), _ic = {};
/** The arm (shoulder→hand) goes into the body round `pos` (r: its pick size; upright, ±r — the real body ~0.6 r wide). */
export function armIn(shoulder, hand, pos, r) {
    _ia.copy(pos).y -= r;
    _ib.copy(pos).y += r;
    return segmentToSegment(shoulder, hand, _ia, _ib, _ic).dist <= r * 0.6;
}
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _h1 = new THREE.Vector3();
const _h2 = new THREE.Vector3();
const _h3 = new THREE.Vector3();
const _h4 = new THREE.Vector3();

export class Levitation {
    constructor(game) {
        this.game = game;
        this.state = null; // {kind:'weapon'|'ice'|'item'|'book'|'bird'|'creature'|'player', obj, side, hold, target, age, history}
        this._t = 0;
        this.carried = new Map(); // (host) 'k:id' -> {ck, c}: living bodies held up (c.lev) for any caster
        this.falls = []; // (host) bodies let go up high: {ck, c, top, by, t} — hurt when they land
        this.bodyDrops = []; // (host) a dead zombie let go: {c, vel} — falls to the ground (its corpse has no fall of its own)
        this.lifted = null; // my own body held up by another wizard {by, side, hold, target, vel, top, age}
        this.fallTop = null; // my fall from up there (hurts when I land)
        this.fallBy = null;
    }

    get active() {
        return !!this.state;
    }

    /**
     * Objects that can be lifted: loose weapons, ice balls, any thing lying about
     * (a wand, a scroll, food…), a book on the ground — and a book-bird in the air:
     * it is caught and hangs, flapping, where the hand holds it (not knocked down).
     */
    _candidates() {
        const g = this.game;
        const out = [];
        for (const w of g.weapons.weapons) {
            if (w.holder || w.remoteTarget) continue;
            out.push({ kind: 'weapon', obj: w, pos: w.position });
        }
        for (const b of g.water?.resting || []) out.push({ kind: 'ice', obj: b, pos: b.pos });
        // a big cauldron (heavy: it floats slowly; tilted in the air it pours out) — the host's, like things
        if (g.cauldrons && (g.authority || !g.sync)) for (const c of g.cauldrons.list.values()) if (!c.lev) out.push({ kind: 'cauldron', obj: c, pos: c.pos, r: 1.6 });
        // (things and books are the host's: a guest's hand can't carry them yet)
        if (g.items?.auth) for (const L of g.items.loose.values()) if (!L.accio && !L.asked) out.push({ kind: 'item', obj: L, pos: L.model.position });
        if (g.books?.auth) for (const bk of g.books.books.values()) if (!bk.accio) out.push({ kind: 'book', obj: bk, pos: bk.model.position });
        for (const b of g.books?.birds.values() || []) if (b.state !== 'fall' && !b.ward) out.push({ kind: 'bird', obj: b, pos: b.model.position }); // (the book of protection: Leviosa bounces off it)
        // a phoenix: caught, it hangs where the hand holds it, beating its wings (let go: it flies off)
        for (const f of g.phoenixes?.targets() || []) if (!f.lev) out.push({ kind: 'phoenix', obj: f, pos: f.model.position, r: 1 });
        // a clever owl: «Левиоса» is no scroll's spell — it slips out and darts away (Owls.TARGETS)
        for (const o of g.owls?.targets() || []) out.push({ kind: 'owl', obj: o, pos: o.model.position, r: 0.5 });
        // living bodies (not wizards: a charge flies at them — see Game)
        for (const z of g.zombies || []) if (!z.isDying && !z.isFrozen && !z.lev && (!z.isDead || (!z.removable && z.group.visible))) out.push({ kind: 'creature', ck: 'z', obj: z, pos: this._centreOf('z', z), r: 0.9 }); // (a zombie's body too)
        // the bodies of the dead (players, castle people — wizards too, knights…; Death.js): lifted like a thing
        for (const b of g.death?.bodies.values() || []) if (!b.lev && (b.model || b.bones)) out.push({ kind: 'corpse', obj: b, pos: new THREE.Vector3(b.x, b.y + 0.5, b.z), r: 1.2 });
        for (const a of g.animals?.targets() || []) if (!a.rider && !a.lev && g.animals.riding !== a) out.push({ kind: 'creature', ck: 'a', obj: a, pos: this._centreOf('a', a), r: g.duel?._animalBody(a).r || 1 });
        for (const v of g.castleLife?.targets() || []) if (!v.lev && !v.seated && !v.climb) out.push({ kind: 'creature', ck: 'v', obj: v, pos: this._centreOf('v', v), r: 1.2 });
        // a dead animal's body (a cow, a running book…) is a thing like any other
        for (const a of g.animals?.list || []) if (a.dead && !a.lev) out.push({ kind: 'creature', ck: 'a', obj: a, pos: this._centreOf('a', a), r: g.duel?._animalBody(a).r || 1 });
        return out;
    }

    /** The object's own model (for things, books and birds). */
    _model(s) {
        if (s.kind === 'corpse') return s.obj.model || s.obj.bones || null;
        return s.kind === 'item' || s.kind === 'book' || s.kind === 'bird' || s.kind === 'phoenix' ? s.obj.model : null;
    }

    /**
     * What the hands point at best: a thing, a body, a dragon (only to say no) — or another
     * player's wizard (`kind: 'wizard'`, obj: their id): a wizard is pointed at as loosely as
     * a thing (LEVITATE.CONE), not with a fighting spell's narrow aim — the hand on a friend
     * a little beside his body, or the friend walking on, still means him.
     */
    _pick() {
        const g = this.game, ch = g.character;
        let best = null;
        const cands = this._candidates();
        // (a dragon is pointed at too — only to say it can't be lifted: DragonKinds.ON_DRAGON.Levitation)
        for (const dr of g.dragons?.targets() || []) cands.push({ kind: 'dragon', obj: dr, pos: dr.model.position.clone().add(new THREE.Vector3(0, 3 * dr.size, 0)), r: 3 * dr.size });
        // (the Ice Castle's creatures: pointed at only to say no — IceQueen.ICE_TARGETS.levitation)
        for (const c of g.iceCastle?.targets() || []) cands.push({ kind: 'iceCreature', obj: c, pos: c.model.position.clone().add(new THREE.Vector3(0, c.h * 0.5, 0)), r: c.r });
        const wizards = [];
        for (const [id, r] of g.remotes || []) if (!r.dead && r.character?.group) wizards.push({ id, r });
        for (const side of ['right', 'left']) {
            const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
            const dir = ch.getHandDirection(side, new THREE.Vector3());
            const anchor = side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor;
            const shoulder = anchor?.getWorldPosition ? anchor.getWorldPosition(new THREE.Vector3()) : null;
            // a wizard: the point of his body (soles to hair) nearest to the line of the hand
            const list = cands.slice();
            for (const { id, r } of wizards) {
                const grp = r.character.group, up = _v2.set(0, 1, 0).applyQuaternion(grp.quaternion);
                const a = grp.position.clone().addScaledVector(up, -BODY.HERO.DOWN), b = grp.position.clone().addScaledVector(up, BODY.HERO.UP);
                const k = rayToSegment(hand, dir, a, b).k;
                list.push({ kind: 'wizard', obj: id, pos: a.lerp(b, k), r: BODY.HERO.R + 0.3 });
            }
            for (const c of list) {
                // somebody standing so close that the arm is in them (the hand in or through their body):
                // that one is meant — the line of the hand, which starts beyond them, would miss them
                if (shoulder && c.r && (c.kind === 'creature' || c.kind === 'wizard') && armIn(shoulder, hand, c.pos, c.r)) {
                    const d = c.pos.distanceTo(hand);
                    if (!best || best.score > -1) best = { ...c, side, score: -1, d };
                    continue;
                }
                const to = _v1.subVectors(c.pos, hand);
                const d = to.length();
                if (d > LEVITATE.RANGE || d < 0.3) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang > LEVITATE.CONE + Math.atan2(c.r || 0, d)) continue; // (a big body is easier to point at)
                // the one the hand points at most truly (beyond its own size), not merely the nearest:
                // a weapon on a pedestal near the line must not win over the cow pointed at
                const score = Math.max(0, ang - Math.atan2(c.r || 0.3, d)) * 10 + d * 0.01 - (this.game.magicHand === side ? 0.05 : 0);
                if (!best || score < best.score) best = { ...c, side, score, d };
            }
        }
        return best;
    }

    /** Another player's wizard the hand points at (more truly than at any thing): {side, t: {kind: 'p', id}} for the duel charge, or null. */
    aimWizard() {
        if (this.state || !this.game.remotes?.size) return null;
        const best = this._pick();
        return best?.kind === 'wizard' ? { side: best.side, t: { kind: 'p', id: best.obj, miss: 0 } } : null;
    }

    /**
     * Cast: the hand pointing best at a loose object picks it up.
     * @returns {string|null} hint when nothing is pointed at
     */
    cast() {
        if (this.state) { this.release(true); return null; }
        let best = this._pick();
        if (best?.kind === 'wizard') best = null; // (a wizard is lifted by a duel charge: Game → aimWizard)
        if (best?.kind === 'dragon') return '🐉 Дракона «Левиоса» не поднимет — он слишком тяжёлый';
        if (best?.kind === 'iceCreature') return '❄️ Ледяная магия держит его на земле — «Левиоса» не поднимет';
        if (best?.kind === 'owl') { this.game.owls?.hit(best.obj, 0, 'Levitation'); return '🦉 Сова выскользнула из «Левиосы» и улетела'; }
        if (!best) return '🪶 Направьте руку на предмет (меч, палочку, книгу, книгу-птицу, ледяной шар, тело), на животное, зомби, жителя или на другого волшебника — не дальше 30 м — и скажите «Вингардиум Левиоса»';
        const s = {
            kind: best.kind,
            obj: best.obj,
            side: best.side,
            hold: Math.min(LEVITATE.MAX_HOLD, Math.max(LEVITATE.MIN_HOLD, best.d)),
            target: best.pos.clone(),
            age: 0,
            history: [],
        };
        if (s.kind === 'creature') {
            // a living body: it hangs as far from the hand as it was (its middle), kicking
            const g = this.game;
            s.ck = best.ck; s.id = best.obj.id; s.weight = this._weight(best.ck, best.obj);
            s.hold = Math.min(LEVITATE.MAX_HOLD, Math.max(LEVITATE.MIN_HOLD + best.r, best.d));
            if (g.authority) this.grab(s.ck, best.obj, g.localId, s.side, s.hold);
            else g.sync?.lev?.(s.ck, s.id, s.side, s.hold, true);
            this.state = s;
            this._sparkle(best.pos, 20);
            if (g.sound) g.sound.playBombardoCast?.();
            return null;
        }
        // (held where it is against the hand's line, moving as the hand moves)
        s.off = aimOffset(this.game.character.getHandDirection(s.side, _v2), _v1.subVectors(best.pos, this.game.character.getHandWorldPosition(s.side, _v3)));
        // The wrist steers the object's rotation from now on
        s.handQ0 = this._handQuat(s.side, new THREE.Quaternion());
        s.objQ0 = (best.kind === 'weapon' ? best.obj.quaternion : this._model(best) ? this._model(best).quaternion : best.obj.mesh.quaternion).clone();
        s.vel = new THREE.Vector3();
        if (s.kind === 'item') {
            const L = s.obj;
            L.lev = true; L.hover = null; L.rest = false; L.sentRest = false; // (the others see it float)
        } else if (s.kind === 'book') {
            s.obj.lev = true;
        } else if (s.kind === 'bird') {
            this.game.books.holdBird(s.obj, true); // (caught: it hangs in the air, flapping)
        } else if (s.kind === 'phoenix') {
            this.game.phoenixes.hold(s.obj, true);
        } else if (s.kind === 'cauldron') {
            this.game.cauldrons.levStart(s.obj);
        } else if (s.kind === 'corpse') {
            this.game.death.liftBody(s.obj); // (the caster's hand carries it; the others see it — Death.onNetMove)
        } else if (s.kind === 'weapon') {
            const w = s.obj;
            w.hover = null;
            w.attach({ levitate: true, side: null });
            if (this.game.sync) this.game.sync._localGrab(w, 'levitate');
        } else {
            const b = s.obj;
            this.game.water.resting.splice(this.game.water.resting.indexOf(b), 1);
            this.game.collision.removeBox(b.boxId);
            b.vel = new THREE.Vector3();
        }
        this.state = s;
        this._sparkle(best.pos, 20);
        if (this.game.sound) this.game.sound.playBombardoCast?.();
        return null;
    }

    update(dt) {
        this._t += dt;
        if (this.carried.size) for (const e of [...this.carried.values()]) this._carry(e, dt);
        if (this.falls.length) this._landings(dt);
        if (this.bodyDrops.length) this._dropBodies(dt);
        if (this.lifted) this._updateLifted(dt);
        if (this.myFly) this._myFlight(dt);
        if (this.fallTop != null) this._myLanding();
        if (this.myWatch) this._myWatchLanding();
        if (this.miss && performance.now() >= this.miss.at) this._sayMissed();
        const s = this.state;
        if (!s) return;
        const ch = this.game.character;
        s.age += dt;
        if (s.kind === 'creature' || s.kind === 'player') { this._updateHold(s, dt); return; }
        if (s.kind === 'weapon' && (s.obj.holder?.levitate !== true || !this.game.weapons.byId.has(s.obj.id))) { this.state = null; return; }
        // (taken by a hand, given away, burnt: gone)
        if (s.kind === 'item' && !this.game.items.loose.has(s.obj.item.uid)) { this.state = null; return; }
        if (s.kind === 'book' && !this.game.books.books.has(s.obj.id)) { this.state = null; return; }
        if (s.kind === 'bird' && (s.obj.state !== 'held' || !this.game.books.birds.has(s.obj.id))) { this.state = null; return; }
        if (s.kind === 'phoenix' && (s.obj.dead || s.obj.state !== 'held' || !this.game.phoenixes?.list.includes(s.obj))) { this.state = null; return; }
        if (s.kind === 'cauldron' && (!s.obj.lev || !this.game.cauldrons?.list.has(s.obj.id))) { this.state = null; return; }
        if (s.kind === 'corpse' && (!this.game.death?.bodies.has(s.obj.id) || !this._model(s))) { if (s.obj) s.obj.lev = false; this.state = null; return; }
        if (s.attack) { this._updateAttack(s, dt); return; }

        // Where the object should float: in front of the hand, following it slowly
        const hand = ch.getHandWorldPosition(s.side, _v1);
        // (sideways it stays where it was against the hand's line; up — it rises onto it, smoothly)
        if (s.off) s.off.dp *= Math.exp(-dt * LEVITATE.RISE);
        const dir = applyAimOffset(steadyDir(s.steady || (s.steady = {}), ch.getHandDirection(s.side, _v2), dt), s.off, _v2);
        const want = _v3.copy(hand).addScaledVector(dir, s.hold);
        want.y = Math.max(want.y + 0.3, this.game.collision.surfaceY(want.x, want.z) + 0.6);
        s.target.lerp(want, 1 - Math.exp(-dt * LEVITATE.FOLLOW));

        if (this._jerked(s, ch)) { this.release(false); return; }

        // Rotation follows the wrist: turn / tilt / twist the hand and the object does
        // the same (amplified) — a floating sword can be swung like this
        const turn = this._wristTurn(s, _q1);
        const m = this._model(s);
        if (s.kind === 'weapon') {
            const w = s.obj;
            w.drive.position.copy(s.target);
            w.drive.quaternion.copy(turn).multiply(s.objQ0);
        } else if (s.kind === 'cauldron') {
            this.game.cauldrons.levMove(s.obj, s.target, _q2.copy(turn).multiply(s.objQ0), dt);
        } else if (m) {
            // carried by the magic: it lags a little behind the hand, turns with the wrist
            _v1.subVectors(s.target, m.position);
            s.vel.lerp(_v1.multiplyScalar(4), Math.min(1, dt * 6));
            m.position.addScaledVector(s.vel, dt);
            if (s.kind === 'bird') this.game.books.heldAt(s.obj, m.position);
            else if (s.kind === 'phoenix') this.game.phoenixes.heldAt(s.obj, m.position);
            else m.quaternion.slerp(_q2.copy(turn).multiply(s.objQ0), Math.min(1, dt * 10));
            if (s.kind === 'corpse') this.game.death.heldAt(s.obj, m, dt);
        } else {
            const b = s.obj;
            _v1.subVectors(s.target, b.pos);
            b.vel.lerp(_v1.multiplyScalar(4), Math.min(1, dt * 6));
            b.pos.addScaledVector(b.vel, dt);
            b.mesh.position.copy(b.pos);
            b.mesh.quaternion.slerp(_q2.copy(turn).multiply(s.objQ0), Math.min(1, dt * 10));
        }
        // Magic sparkles around the floating object
        if (Math.random() < 0.6) {
            const p = s.kind === 'weapon' ? s.obj.position : m ? m.position : s.obj.pos;
            this.game.fx.spark(_v1.set(p.x + (Math.random() - 0.5) * 0.8, p.y + (Math.random() - 0.5) * 0.8, p.z + (Math.random() - 0.5) * 0.8), Math.random() < 0.5 ? 0xffe9a8 : 0xc9a8ff, 0.08, _v2.set(0, 0.6, 0), 0.6);
        }
    }

    /**
     * «Атак» while a sword / axe floats: it flies at the nearest living
     * creature (or on, along the hand, if there is none) and sticks into it.
     */
    attack() {
        const s = this.state;
        if (!s || s.kind !== 'weapon') return '🪶 Сначала поднимите меч или топор «Вингардиум Левиоса», потом — «Атак»';
        const g = this.game;
        const w = s.obj;
        let best = null;
        const consider = (pos, target) => {
            const d = pos.distanceTo(w.position);
            if (d < 30 && (!best || d < best.d)) best = { d, pos, target };
        };
        for (const z of g.zombies) if (!z.isDead && !z.isThrall) consider(z.group.position, { kind: 'z', z });
        for (const [id, r] of g.remotes) if (!r.dead) consider(r.position, { kind: 'p', id, r });
        for (const a of g.animals?.list || []) if (!a.dead) consider(a.group.position, { kind: 'a', a });
        const dir = g.character.getHandDirection(s.side, new THREE.Vector3());
        s.attack = { target: best ? best.target : null, dir, t: 0 };
        this._sparkle(w.position, 25);
        return null;
    }

    _updateAttack(s, dt) {
        const g = this.game;
        const w = s.obj;
        const A = s.attack;
        A.t += dt;
        const tp = A.target ? (A.target.kind === 'z' ? A.target.z.group.position : A.target.kind === 'p' ? A.target.r.position : A.target.a.group.position) : null;
        const goal = tp ? _v1.copy(tp).add(_v2.set(0, 0.9, 0)) : _v1.copy(w.position).addScaledVector(A.dir, 30);
        const to = _v2.subVectors(goal, w.position);
        const d = to.length();
        const step = Math.min(d, 22 * dt);
        to.normalize();
        // flies fast (kinematic), the tip first
        w.position.addScaledVector(to, step);
        w.drive.position.copy(w.position);
        w.drive.quaternion.setFromUnitVectors(_v3.set(0, 1, 0), to);
        w.quaternion.copy(w.drive.quaternion);
        w.velocity.copy(to).multiplyScalar(22);
        if (Math.random() < 0.8) this.game.fx.spark(w.position, 0xc9a8ff, 0.08, _v3.copy(to).multiplyScalar(-3), 0.4);
        const dead = A.target && (A.target.kind === 'z' ? A.target.z.isDead : A.target.kind === 'p' ? A.target.r.dead : A.target.a.dead);
        if (A.target && !dead && d < 1.0) {
            // hit: it sticks in
            this.state = null;
            w.drive = null;
            w.holder = null;
            if (g.sync) g.sync._localRelease(w);
            const dmg = (w.type === 'axe' ? 5 : 4) * (w.damageScale || 1);
            if (A.target.kind === 'z') {
                if (g.authority) g.damageZombie(A.target.z, dmg, true, to.clone(), g.localId);
                else g.sync?.sendHit(A.target.z, dmg, to.clone(), true);
                if (!A.target.z.isDead) g.weapons._stick(w, A.target.z, null);
            } else if (A.target.kind === 'p') {
                const r = A.target.r;
                const victim = { group: r.character.group, get isDead() { return r.dead; }, removable: false, playerId: A.target.id };
                g.weapons._stick(w, victim, null);
                g.combat.hitRemote({ id: A.target.id, damageCooldown: 0, group: r.character.group }, Math.round(dmg), !!w.magic);
                g.sync?.impale?.(A.target.id, w.id);
            } else {
                g.animals?.hit(A.target.a, dmg, to.clone(), g.localId);
            }
            g.hud.setVoice('🗡️ Оружие вонзилось!', true);
            return;
        }
        if (A.t > 3 || (!A.target && A.t > 1.6)) this.release(false);
    }

    /** World orientation of the hand (the palm when hands are shown). */
    _handQuat(side, out) {
        const grip = this.game.character.getGripObject(side);
        grip.updateWorldMatrix(true, false);
        return grip.getWorldQuaternion(out);
    }

    /** How the wrist turned since the object was picked up (amplified), as a world rotation. */
    _wristTurn(s, out) {
        const now = this._handQuat(s.side, _q2);
        out.copy(now).multiply(_q3.copy(s.handQ0).invert()); // rotation from then to now
        if (out.w < 0) { out.x = -out.x; out.y = -out.y; out.z = -out.z; out.w = -out.w; }
        const angle = 2 * Math.acos(Math.min(1, out.w));
        if (angle < 1e-4) return out.identity();
        const k = Math.sin(angle / 2);
        _v3.set(out.x / k, out.y / k, out.z / k);
        return out.setFromAxisAngle(_v3, Math.min(Math.PI, angle * LEVITATE.TWIST));
    }

    /** A fast, far movement of the hand relative to the body (in the body's own turn: turning round with the arm out — carrying what it holds round — is no jerk). */
    _jerked(s, ch) {
        const hand = ch.getHandWorldPosition(s.side, _v1).sub(ch.group.position);
        if (ch.group.quaternion) hand.applyQuaternion(_q1.copy(ch.group.quaternion).invert());
        const now = this._t;
        s.history.push({ t: now, x: hand.x, y: hand.y, z: hand.z });
        while (s.history.length && now - s.history[0].t > LEVITATE.DROP_WINDOW) s.history.shift();
        if (s.age < LEVITATE.GRACE) return false;
        const o = s.history[0];
        return Math.hypot(hand.x - o.x, hand.y - o.y, hand.z - o.z) > LEVITATE.DROP_DISTANCE;
    }

    /** Let go. gentle = set it down softly, otherwise it flies on with its speed. */
    release(gentle) {
        const s = this.state;
        if (!s) return;
        this.state = null;
        if (s.kind === 'creature') {
            const c = this._creature(s.ck, s.id);
            if (this.game.authority) { if (c?.lev?.by === this.game.localId) this.letGo(s.ck, c, gentle); }
            else this.game.sync?.lev?.(s.ck, s.id, s.side, s.hold, false, gentle);
            return;
        }
        if (s.kind === 'player') { this.game.sync?.lev?.('p', s.id, s.side, s.hold, false, gentle); return; }
        const vel = gentle ? new THREE.Vector3() : (s.vel || new THREE.Vector3()).clone().multiplyScalar(1.5);
        if (s.kind === 'weapon') {
            const w = s.obj;
            if (gentle) w.velocity.multiplyScalar(0.2);
            w.release();
            if (this.game.sync) this.game.sync._localRelease(w);
        } else if (s.kind === 'item') {
            // let go: it falls (or flies on with the swing) like any thing
            const L = s.obj;
            L.lev = false; L.rest = false;
            L.vel = (L.vel || new THREE.Vector3()).copy(vel);
            L.noPick = performance.now() + 400;
        } else if (s.kind === 'book') {
            s.obj.lev = false;
            this.game.books.dropBook(s.obj, vel);
        } else if (s.kind === 'bird') {
            this.game.books.holdBird(s.obj, false); // free: it flies off
        } else if (s.kind === 'phoenix') {
            this.game.phoenixes.hold(s.obj, false); // free: it flies off
        } else if (s.kind === 'cauldron') {
            this.game.cauldrons?.levDrop(s.obj, vel, gentle); // (it falls; let down gently it comes down slowly)
        } else if (s.kind === 'corpse') {
            this.game.death?.dropBody(s.obj, vel, gentle); // (it falls limp to the ground and lies there)
        } else {
            const b = s.obj;
            const iceVel = gentle ? new THREE.Vector3() : b.vel.clone().multiplyScalar(1.5);
            this.game.scene.remove(b.mesh);
            this.game.water._spawnFalling({ pos: b.pos.clone(), vel: iceVel, r: b.r, frozen: true, local: true, mat: b.mesh.material });
        }
    }

    // ================================================================ living bodies
    /** A body's middle (where the magic holds it); returns how high that is above its feet. */
    _centre(ck, c, out) {
        if (ck === 'z') { out.copy(c.group.position); return c.isDead ? 0.8 : 1.0; } // (a zombie stands 1 m above the ground; its body lies 0.8)
        if (ck === 'a') { const y = this.game.duel?._animalBody(c).y ?? 0.8; out.copy(c.group.position); out.y += y; return y + 0.5; }
        out.set(c.x, c.y + 2.4, c.z); // a villager: (x, y, z) are its feet
        return 2.4;
    }

    _centreOf(ck, c) {
        const out = new THREE.Vector3();
        this._centre(ck, c, out);
        return out;
    }

    _moveBody(ck, c, d) {
        if (ck === 'v') { c.x += d.x; c.y += d.y; c.z += d.z; } else c.group.position.add(d);
    }

    /** A cow, a horse, a knight or the king is heavy; anything else light. */
    _weight(ck, c) {
        if (ck === 'a') return c.type === 'cow' || c.type === 'horse' ? 'heavy' : 'light';
        if (ck === 'v') return c.role === 'knight' || c.role === 'king' ? 'heavy' : 'light';
        return 'light';
    }

    _creature(ck, id) {
        const g = this.game;
        const c = ck === 'z' ? g.zombieById?.get(id) : ck === 'a' ? g.animals?.byId.get(id) : ck === 'v' ? g.castleLife?.byId.get(id) : null;
        if (!c) return null;
        // (a dead animal's body is a thing: it can be lifted — but one that died while held falls)
        const body = (ck === 'a' && c.dead) || (ck === 'z' && c.isDead && !c.isDying && !c.removable);
        if ((c.dead || c.isDead || c.isDying) && !(body && (!c.lev || c.lev.body))) return null;
        return c;
    }

    /**
     * Where a caster's hand holds a body now (on any computer): `hold` m in front of
     * the hand, its feet above the ground. null: the caster is gone / not seen for a while.
     */
    holdPoint(by, side, hold, up, out, off = null, steady = null, dt = 0) {
        const g = this.game;
        if (by !== g.localId) {
            const r = g.remotes?.get(by);
            if (!r || r.dead || performance.now() - (r.lastUpdate || 0) > LEVITATE.STALE * 1000) return null;
        }
        if (!g.duel?._handOf(by, side, out, _h4)) return null;
        if (steady) steadyDir(steady, _h4, dt);
        if (off) applyAimOffset(_h4, off, _h4);
        out.addScaledVector(_h4, hold);
        out.y = Math.max(out.y + 0.3, g.collision.surfaceY(out.x, out.z) + up + 0.2);
        return out;
    }

    /** (host) Take hold of a living body for `by`'s hand. */
    grab(ck, c, by, side, hold) {
        const g = this.game;
        if (c.lev) return false;
        const p = new THREE.Vector3();
        this._centre(ck, c, p);
        const feet = ck === 'v' ? c.y : p.y - this._centre(ck, c, _h1);
        c.lev = { by, side, hold, target: p.clone(), vel: new THREE.Vector3(), top: feet, age: 0, lower: false, body: !!(c.dead || c.isDead) };
        // (taken where it is: it stays there against the caster's hand line, no jump onto it)
        if (g.duel?._handOf(by, side, _h1, _h4)) {
            c.lev.off = aimOffset(_h4, _h2.subVectors(p, _h1));
            c.lev.hold = Math.min(LEVITATE.MAX_HOLD, Math.max(LEVITATE.MIN_HOLD, _h2.length())); // (and as far as it is)
        }
        if (ck === 'a') { c.vel?.set(0, 0, 0); c.airborne = false; }
        if (ck === 'z') { c.vy = 0; c.windVel = null; }
        if (ck === 'v' && !c.lev.body) {
            c.vy = 0; c.mode = 'flail'; c.speed = 0; g.castleLife?.reportCrime?.(c, by, 'magic');
            this._cry(c, true);
        }
        if (!c.lev.body) {
            const S = STRUGGLE[struggleKind(ck, c)];
            c.lev.jerkT = S.every[0] + Math.random() * (S.every[1] - S.every[0]);
            if (S.free) c.lev.freeT = S.free[0] + Math.random() * (S.free[1] - S.free[0]);
        }
        this.carried.set(ck + ':' + c.id, { ck, c });
        this._sparkle(p, 20);
        return true;
    }

    /** (host) Carry a held body after its caster's hand, slowly, like a heavy thing. */
    _carry(e, dt) {
        const g = this.game;
        const { ck, c } = e;
        const L = c.lev;
        if (!L || (!L.body && (c.dead || c.isDead || c.isDying))) { if (L) this.letGo(ck, c, false); else this.carried.delete(ck + ':' + c.id); return; }
        L.age += dt;
        const centre = _h1;
        const up = this._centre(ck, c, centre);
        const ground = g.collision.surfaceY(centre.x, centre.z);
        if (L.lower) {
            // set down gently: straight down to its feet
            L.target.set(centre.x, Math.max(ground + up, L.target.y - 2.5 * dt), centre.z);
            if (centre.y - up <= ground + 0.12) { this._endCarry(ck, c); return; }
        } else {
            if (L.off) L.off.dp *= Math.exp(-dt * LEVITATE.RISE); // (it rises onto the hand's line, smoothly)
            const want = this.holdPoint(L.by, L.side, L.hold, up, _h2, L.off, L.steady || (L.steady = {}), dt);
            if (!want) { this.letGo(ck, c, false); return; }
            L.target.lerp(want, 1 - Math.exp(-dt * LEVITATE.FOLLOW));
        }
        _h3.subVectors(L.target, centre);
        L.vel.lerp(_h3.multiplyScalar(4), Math.min(1, dt * 6));
        if (!L.body && !L.lower && this._struggle(ck, c, L, dt)) return;
        this._moveBody(ck, c, _h3.copy(L.vel).multiplyScalar(dt));
        // walls and trees stop it as they would stop the thing
        if (ck !== 'v') g.collision.resolveCylinder(c.group.position, ck === 'z' ? 0.45 : 0.6, c.group.position.y - up + 0.1, 2.5, 1.05);
        this._centre(ck, c, _h3);
        L.top = Math.max(L.top, _h3.y - up);
        // kicking in the air (a dead body hangs limp)
        if (!L.body) this._kicking(ck, c, dt);
        if (ck === 'v') { c.mode = L.body ? 'dead' : 'flail'; c.speed = 0; }
        if (Math.random() < 0.5) this.game.fx?.spark(_h3.set(centre.x + (Math.random() - 0.5) * 1.4, centre.y + (Math.random() - 0.5) * 1.4, centre.z + (Math.random() - 0.5) * 1.4), Math.random() < 0.5 ? 0xffe9a8 : 0xc9a8ff, 0.08, _h4.set(0, 0.6, 0), 0.6);
    }

    /** (host) A living body in the air (held, or thrown) kicks: legs running on nothing, arms clawing. */
    _kicking(ck, c, dt) {
        const g = this.game;
        if (ck === 'a') { c.walkT = (c.walkT || 0) + dt * 14; g.animals?._animate?.(c, 1); c.stunT = Math.max(c.stunT || 0, 0.5); }
        else if (ck === 'z') {
            const t = performance.now() * 0.001, k = Math.sin(t * 12) * 0.6;
            if (c.leftLeg) c.leftLeg.rotation.x = k;
            if (c.rightLeg) c.rightLeg.rotation.x = -k;
            if (c.leftArm) { c.leftArm.rotation.x = -Math.PI / 2 + Math.sin(t * 9) * 0.7; c.leftArm.rotation.z = Math.sin(t * 6) * 0.4; }
            if (c.rightArm) { c.rightArm.rotation.x = -Math.PI / 2 + Math.sin(t * 9 + 2) * 0.7; c.rightArm.rotation.z = -Math.sin(t * 6 + 1) * 0.4; }
        } else if (ck === 'v') { c.mode = 'flail'; c.speed = 0; }
    }

    /**
     * (host) A living body held up struggles: now and then it jerks in the hold (the magic pulls
     * it back), a castle person cries out; a castle wizard breaks free after a while. true: let go.
     */
    _struggle(ck, c, L, dt) {
        const kind = struggleKind(ck, c), S = STRUGGLE[kind];
        if (L.freeT != null && (L.freeT -= dt) <= 0) {
            // a wizard's own counter-spell: the hold breaks, he comes down softly
            this.game.castleLife?._say?.(c, 'Фините Инкантатем!', 3);
            this._centre(ck, c, _h4);
            this._sparkle(_h4, 30);
            this.letGo(ck, c, true);
            return true;
        }
        L.jerkT = (L.jerkT ?? 0) - dt;
        if (L.jerkT > 0) return false;
        L.jerkT = S.every[0] + Math.random() * (S.every[1] - S.every[0]);
        const a = Math.random() * Math.PI * 2;
        L.vel.x += Math.cos(a) * S.jerk; L.vel.z += Math.sin(a) * S.jerk; L.vel.y += (Math.random() - 0.3) * S.jerk * 0.6;
        if (ck === 'v' && Math.random() < 0.35) this._cry(c);
        return false;
    }

    /** A held castle person cries out (frightened / angry / a wizard's threat). */
    _cry(c, first = false) {
        const cl = this.game.castleLife;
        if (!cl?._say) return;
        const list = c.wizard ? LEV_CRIES.wizard : c.role === 'king' ? LEV_CRIES.king : c.role === 'knight' ? LEV_CRIES.knight : LEV_CRIES.villager;
        cl._say(c, list[Math.floor(Math.random() * list.length)], 2.5, true, first);
    }

    _endCarry(ck, c) {
        if (ck === 'z' && !c.isDead) { for (const a of [c.leftArm, c.rightArm]) if (a) { a.rotation.x = -Math.PI / 2; a.rotation.z = 0; } }
        c.lev = null;
        this.carried.delete(ck + ':' + c.id);
    }

    /** (host) Let a held body go: gently = set it down; otherwise it falls with the swing it had. */
    letGo(ck, c, gentle) {
        const L = c.lev;
        if (!L) return;
        if (gentle && !c.dead && !c.isDead) { L.lower = true; return; }
        this._endCarry(ck, c);
        const v = L.vel.clone().multiplyScalar(1.5);
        this.falls.push({ ck, c, top: L.top, by: L.by, t: 0, v: v.clone() });
        if (ck === 'a') { c.attacker = L.by; c.levFall = true; c.vel = new THREE.Vector3(); this.game.animals?.push(c, v, 1.5); c.airborne = true; }
        else if (ck === 'z' && c.isDead) this.bodyDrops.push({ c, vel: v });
        else if (ck === 'z') { c.vy = v.y || -0.1; c.windVel = new THREE.Vector3(v.x, 0, v.z); c.stunTimer = Math.max(c.stunTimer || 0, 0.6); }
        else { c.vy = v.y || -0.1; c.vx = v.x; c.vz = v.z; c.stunT = Math.max(c.stunT || 0, 1); c.flyFlail = true; } // (it waves its arms and legs as it flies: CastleLife)
    }

    /** (host) Dead zombies let go fall until they lie on the ground again. */
    _dropBodies(dt) {
        const g = this.game;
        for (let i = this.bodyDrops.length - 1; i >= 0; i--) {
            const { c, vel } = this.bodyDrops[i], p = c.group.position;
            if (c.lev || c.removable) { this.bodyDrops.splice(i, 1); continue; }
            vel.y -= 25 * dt;
            vel.x *= 0.98; vel.z *= 0.98;
            p.addScaledVector(vel, dt);
            const rest = g.collision.surfaceY(p.x, p.z) + 0.8;
            if (p.y <= rest) { p.y = rest; this.bodyDrops.splice(i, 1); }
        }
    }

    /** Is there deep water (a soft landing) at (x, z)? */
    wet(x, z) {
        return (this.game.swim?.waterAt?.(x, z)?.depth || 0) >= 1;
    }

    /**
     * (host) Bodies let go / thrown: they fly by their own weight (each kind's own physics), kicking;
     * the moment they strike the ground, a wall or another creature, the blow (THROW) knocks them
     * down and hurts them by its speed — and knocks down whom they flew into.
     */
    _landings(dt) {
        const g = this.game;
        for (let i = this.falls.length - 1; i >= 0; i--) {
            const f = this.falls[i];
            const { ck, c } = f;
            f.t += dt;
            if (c.lev || c.dead || c.isDead || f.t > 12) { this._landed(i, f); continue; }
            const up = this._centre(ck, c, _h1);
            const feet = _h1.y - up;
            if (f.track) f.top = Math.max(f.top, feet); // (thrown by «Overgrown»: the fall counts from the highest point)
            // how fast it flies now (from where its middle was a frame ago)
            const prev = f.prev || (f.prev = _h1.clone());
            const vel = _h2.subVectors(_h1, prev).divideScalar(Math.max(dt, 1e-3));
            const was = f.vel || (f.vel = vel.clone());
            const hWas = Math.hypot(was.x, was.z), hNow = Math.hypot(vel.x, vel.z);
            if (!f.track) this._kicking(ck, c, dt);
            // into another creature on its way
            const into = f.t > 0.1 && was.length() >= THROW.MIN_HIT_V ? this._flewInto(f, prev, _h1) : null;
            if (into) {
                this._strikeOther(f, into, was);
                this._landed(i, f);
                this._blow(f, was.length(), was, feet, _h1);
                continue;
            }
            // a wall: it was flying sideways fast, and something stopped it at once
            if (f.t > 0.1 && hWas >= THROW.WALL_MIN && hNow < hWas * THROW.WALL_DROP && !this._down(ck, c, feet, _h1)) {
                this._landed(i, f);
                this._blow(f, hWas, was, feet, _h1);
                continue;
            }
            prev.copy(_h1);
            f.vel.copy(vel);
            if (f.t < 0.1 || !this._down(ck, c, feet, _h1)) continue;
            // the ground: the speed it came down with (this frame it is already stopped)
            this._landed(i, f);
            this._blow(f, Math.max(was.length(), vel.length()), was, feet, _h1);
        }
    }

    /** It is on the ground (an animal: its own physics says so). */
    _down(ck, c, feet, centre) {
        if (ck === 'a') return !c.airborne;
        return feet <= this.game.collision.groundY(centre.x, centre.z) + 0.15 && !(c.vy > 0);
    }

    _landed(i, f) {
        this.falls.splice(i, 1);
        const { ck, c } = f;
        if (ck === 'a') c.levFall = false;
        if (ck === 'v') { c.flyFlail = false; }
    }

    /**
     * (host) The thrown body struck something at `speed` m/s (moving along `vel`): knocked down
     * (rolling over from a hard blow, dizzy after it), and hurt — by the speed, or by the height
     * it fell from, whichever is worse. Deep water takes the blow.
     */
    _blow(f, speed, vel, feet, centre) {
        const g = this.game;
        const { ck, c } = f;
        if (ck === 'v') { c.vx = 0; c.vz = 0; }
        if (this.wet(centre.x, centre.z)) return;
        const d = Math.max(impactDamage(speed), fallDamage(f.top - feet));
        if (speed >= THROW.KNOCK_V && g.creatureImpact) {
            const fv = _h3.set(vel.x, 0, vel.z);
            if (fv.lengthSq() < 0.25) fv.set(Math.random() - 0.5, 0, Math.random() - 0.5);
            const hard = speed >= THROW.ROLL_V;
            g.creatureImpact.apply(c, {
                v: fv.clone().setLength(Math.min(6, 1 + speed * 0.25)), by: f.by, kind: 'fall', noShield: true,
                always: { down: 1.5 + Math.min(3, (speed - THROW.KNOCK_V) * 0.2) },
                ...(hard ? { toss: 3 + Math.min(4, (speed - THROW.ROLL_V) * 0.3), fly: true, tumble: 1, daze: 2 } : {}),
            });
        }
        if (d) this._hurt(ck, c, d, f.by, vel, centre);
    }

    _hurt(ck, c, d, by, vel, at = null) {
        const g = this.game;
        if (ck === 'z') g.damageZombie(c, d, false, _h4.set(vel.x, 0, vel.z).normalize(), by);
        else if (ck === 'a') g.animals?.hit(c, d, null, by);
        else if (ck === 'c') g.ships?.crew?.hit?.(c, d, null, by, { spell: true, via: 'leviosa', src: at ? { x: at.x, z: at.z } : null });
        else g.castleLife?.hit(c, d, null, by, { spell: true, via: 'leviosa', src: at ? { x: at.x, z: at.z } : null }); // (a knight's armour takes most of it; whose thing it was — Blame.js)
    }

    /** The creature its flight from `a` to `b` ran into (not itself, not one held up), or null: {kind, id, c|null}. */
    _flewInto(f, a, b) {
        const g = this.game;
        const bodies = g.duel?._bodies?.(null);
        if (!bodies) return null;
        const me = f.ck === 'v' ? 'v' : f.ck, seg = {};
        for (const body of bodies) {
            if (body.kind === me && body.id === f.c.id) continue;
            if (!['z', 'v', 'a', 'c', 'p'].includes(body.kind)) continue;
            if (body.kind === 'p' && body.id !== g.localId) continue; // (another player's body is his own computer's: the host does not throw it about)
            segmentToSegment(a, b, body.a, body.b, seg);
            if (seg.dist > body.r + THROW.HIT_R) continue;
            const c = body.kind === 'p' ? null : this._victim(body.kind, body.id);
            if (body.kind !== 'p' && (!c || c.lev)) continue;
            return { kind: body.kind, id: body.id, c };
        }
        return null;
    }

    _victim(kind, id) {
        const g = this.game;
        if (kind === 'z') { const z = g.zombieById?.get(id); return z && !z.isDead ? z : null; }
        if (kind === 'a') { const a = g.animals?.byId.get(id); return a && !a.dead ? a : null; }
        if (kind === 'v') { const v = g.castleLife?.byId.get(id); return v && !v.dead ? v : null; }
        if (kind === 'c') { const v = g.ships?.crew?.byId.get(id); return v && !v.dead ? v : null; }
        return null;
    }

    /** (host) The thrown body flew into another: it is knocked down (and hurt) by the blow, as by a thrown log. */
    _strikeOther(f, o, vel) {
        const g = this.game;
        const speed = vel.length() * THROW.OTHER_K;
        const d = impactDamage(speed + THROW.HURT_V * (1 - THROW.OTHER_K)); // (struck by a whole body: it hurts sooner than a fall)
        const push = _h3.set(vel.x, 0, vel.z);
        if (push.lengthSq() < 1e-4) push.set(0, 0, 1);
        if (o.kind === 'p') {
            // the host's own wizard: knocked off his feet (his own computer — this one)
            if (speed >= THROW.KNOCK_V * 0.5) g.knock?.knock({ dir: 'back', down: 1.5, by: f.by, kind: 'thrown', strength: 0.4 });
            if (d) { if (g.combat?.enabled) g.combat.damage(d, f.by, 'thrown'); else if (g.config?.mode !== 'creative') g.damageLocalPlayer?.(d); }
            return;
        }
        if (speed >= THROW.KNOCK_V * 0.5) g.creatureImpact?.apply(o.c, { v: push.clone().setLength(Math.min(8, 2 + speed * 0.4)), by: f.by, kind: 'thrown', always: { down: 1.5 + Math.min(2, speed * 0.1) } });
        if (d) this._hurt(o.kind, o.c, d, f.by, vel, o.c);
    }

    /** (host) A body thrown by a spell («Overgrown»): if it comes down from up high, the fall hurts. */
    watchFall(ck, c, by) {
        if (ck !== 'z' && ck !== 'v' && ck !== 'a') return;
        const up = this._centre(ck, c, _h1);
        const i = this.falls.findIndex((f) => f.c === c);
        if (i >= 0) { if (this.falls[i].track) this.falls.splice(i, 1); else return; } // (already falling from Leviosa)
        this.falls.push({ ck, c, top: _h1.y - up, by, t: 0, v: null, track: true });
    }

    /**
     * I was thrown by a spell («Overgrown», «Джолт»): my next landing from up high hurts.
     * `slack`: metres of the drop that are the throw itself (thrown up from flat ground and
     * landing lying down: that is no fall from a height — only a real drop below hurts).
     */
    watchMyFall(by, slack = 0) {
        this.myWatch = { by, since: performance.now(), slack };
    }

    _myWatchLanding() {
        const g = this.game, ch = g.character, W = this.myWatch, L = ch.landing, now = performance.now();
        if (L && L.at > W.since) {
            this.myWatch = null;
            if (ch.swimY != null || now < (g.impact?.gentleUntil || 0)) return;
            const d = fallDamage(L.drop - (W.slack || 0));
            if (!d) return;
            if (g.combat.enabled) g.combat.damage(d, W.by, 'fall');
            else if (g.config?.mode !== 'creative') g.damageLocalPlayer?.(d);
            return;
        }
        // (never left the ground, or too long ago: nothing to watch)
        if (now - W.since > 10000 || (now - W.since > 600 && ch.onGround && ch.airTop == null)) this.myWatch = null;
    }

    /** My hold on a body / a wizard: it costs strength; a jerk or no strength left lets go. */
    _updateHold(s, dt) {
        const g = this.game;
        const ch = g.character;
        if (s.kind === 'creature' ? !this._creature(s.ck, s.id) : !g.remotes?.get(s.id) || g.remotes.get(s.id).dead) { this.state = null; return; }
        // (the host lost it: let go there, or someone else took it)
        if (s.kind === 'creature' && g.authority && s.age > 0.5 && this._creature(s.ck, s.id).lev?.by !== g.localId) { this.state = null; return; }
        if (this._jerked(s, ch)) { this.release(false); return; }
        const c = g.combat;
        if (c.enabled) {
            c.fatigue -= HOLD_FATIGUE[s.weight || 'light'] * dt;
            if (c.fatigue > 0) return;
            c.fatigue = 0;
            g.hud.setVoice('😮‍💨 Нет сил держать — отпустили', true);
        } else if (s.kind !== 'player' || s.age < LEVITATE.WIZARD_T) return;
        this.release(false);
    }

    // ---------------------------------------------------------------- a wizard held up
    /**
     * (my computer) A Leviosa charge landed on me: my body hangs at `by`'s hand.
     * `mx`: «Левиоса Максима» (LevitationMaxima.js) — it goes through magic armour, holds as long as
     * its caster's mana lasts, and I hang where I was against the caster's hand line (one of a group).
     */
    liftMe(by, side = 'right', { mx = false } = {}) {
        const g = this.game;
        if (this.lifted?.by === by || g.combat.dead) return;
        if (this.lifted) { g.sync?.lift?.(by, side, 0, false, false, 'levHeld'); return; } // (another holds me: tell the caster why)
        if (levBlocked(g.combat, mx)) { g.hud.setVoice('🛡️ Магические доспехи не дали «Левиосе» вас поднять', true); return; }
        const c = g.combat.center(new THREE.Vector3());
        if (!g.duel?._handOf(by, side, _h1, _h2)) return;
        // the gods' shield (ProtectionGods.js): the dome, or the hand shield facing the caster — no «Левиоса» lifts me (no mana)
        if (g.combat.shield?.gods && g.combat.shieldFactor(_h1) >= 1) { g.combat.godsHit(mx ? 'LevitationMaxima' : 'Levitation', _h1); g.sync?.lift?.(by, side, 0, false, false, 'levShield'); return; }
        if (this.state) this.release(false);
        if (g.flight?.busy) g.flight.land('levitate');
        if (g.animals?.riding) g.animals.dismount();
        const hold = Math.min(LEVITATE.MAX_HOLD, Math.max(LEVITATE.MIN_HOLD + 0.5, c.distanceTo(_h1)));
        this.lifted = { by, side, hold, target: c.clone(), vel: new THREE.Vector3(), top: g.character.group.position.y, age: 0, mx, off: mx ? aimOffset(_h2, _h3.subVectors(c, _h1)) : null };
        this.fallTop = null;
        g.sync?.lift?.(by, side, hold, true, false, null, mx);
        g.hud.setVoice(`🪶 ${g.playerName?.(by) || 'Волшебник'} поднял вас в воздух! Направьте на него «Protection», чтобы вырваться`, true);
    }

    _updateLifted(dt) {
        const g = this.game;
        const L = this.lifted;
        const ch = g.character;
        L.age += dt;
        const up = 0.6 + 2.0; // (my middle above my feet)
        const want = this.holdPoint(L.by, L.side, L.hold, up, _h2, L.off);
        if (!want || g.combat.dead || (!L.mx && !g.combat.enabled && L.age > LEVITATE.WIZARD_T + 3)) { this.dropMe(false); return; }
        // «Protection» towards the caster: the magic breaks on it
        if (g.duel._handOf(L.by, L.side, _h3, _h4) && g.combat.shield && g.combat.shieldFactor(_h3) >= 1 && g.combat._blocked(_h3, 'Levitation')) {
            this.dropMe(false, true);
            return;
        }
        L.target.lerp(want, 1 - Math.exp(-dt * LEVITATE.FOLLOW));
        _h1.subVectors(L.target, g.combat.center(_h3));
        L.vel.lerp(_h1.multiplyScalar(4), Math.min(1, dt * 6));
        ch.group.position.addScaledVector(L.vel, dt);
        L.top = Math.max(L.top, ch.group.position.y);
        ch.verticalVelocity = 0;
        ch.onGround = false;
        g.knockback.set(0, 0, 0);
    }

    /** I am let go (gently: set down, no hurt), or I broke free (`free`). */
    dropMe(gentle, free = false) {
        const L = this.lifted;
        if (!L) return;
        this.lifted = null;
        const g = this.game;
        const ch = g.character;
        ch.verticalVelocity = gentle ? 0 : Math.max(-20, L.vel.y * 1.5);
        if (gentle && g.impact) g.impact.gentleUntil = performance.now() + 3000; // (set down: no falling over)
        if (!gentle) g.knockback.copy(L.vel).setY(0).multiplyScalar(1.5);
        this.fallTop = gentle ? null : L.top;
        this.fallBy = L.by;
        this.myFly = gentle ? null : { prev: null, vel: null, t: 0 }; // (thrown: the blow I strike is counted — _myFlight)
        g.sync?.lift?.(L.by, L.side, L.hold, false, free, null, L.mx);
        if (free) g.hud.setVoice('🛡️ Вы вырвались из Левиосы!', true);
    }

    /**
     * Thrown by another wizard's «Левиоса»: I fly with the swing; striking the ground or a wall
     * hard knocks me off my feet (rolling over from a hard one) and hurts by the speed (THROW).
     */
    _myFlight(dt) {
        const g = this.game, ch = g.character, F = this.myFly;
        F.t += dt;
        const p = ch.group.position;
        if (!F.prev) { F.prev = p.clone(); return; }
        const vel = _h2.subVectors(p, F.prev).divideScalar(Math.max(dt, 1e-3));
        const was = F.vel || (F.vel = vel.clone());
        F.prev.copy(p);
        if (this.lifted || g.combat.dead || ch.swimY != null || F.t > 12) { this.myFly = null; return; }
        const hWas = Math.hypot(was.x, was.z), hNow = Math.hypot(vel.x, vel.z);
        const wall = F.t > 0.1 && hWas >= THROW.WALL_MIN && hNow < hWas * THROW.WALL_DROP && !ch.onGround;
        if (!wall && !(F.t > 0.1 && ch.onGround)) { F.vel.copy(vel); return; }
        const speed = wall ? hWas : Math.max(was.length(), vel.length());
        this.myFly = null;
        if (speed < THROW.KNOCK_V) return;
        const hard = speed >= THROW.ROLL_V;
        g.knock?.knock({ dir: 'back', down: 1.5 + Math.min(3, (speed - THROW.KNOCK_V) * 0.2), by: this.fallBy, kind: 'fall', strength: Math.min(1, 0.3 + speed / 30), ...(hard ? { toss: 3, fly: true, tumble: 1 } : {}) });
        const d = impactDamage(speed) - (wall ? 0 : fallDamage((this.fallTop ?? p.y) - p.y)); // (the height's own fall is counted by _myLanding)
        if (d <= 0) return;
        if (g.combat.enabled) g.combat.damage(d, this.fallBy, 'fall');
        else if (g.config?.mode !== 'creative') g.damageLocalPlayer?.(d);
    }

    /** I land after being let go up high: the fall hurts. */
    _myLanding() {
        const g = this.game;
        const ch = g.character;
        if (ch.swimY != null) { this.fallTop = null; return; }
        if (!ch.onGround) return;
        const d = fallDamage(this.fallTop - ch.group.position.y);
        this.fallTop = null;
        if (!d) return;
        if (g.combat.enabled) g.combat.damage(d, this.fallBy, 'fall');
        else if (g.config?.mode !== 'creative') g.damageLocalPlayer?.(d);
    }

    // ---------------------------------------------------------------- network
    /** Someone holds / lets go of a body (or of me). */
    onNetLev(m) {
        const g = this.game;
        if (m.k === 'p') {
            if (m.id === g.localId && !m.on && this.lifted?.by === m.by) this.dropMe(!!m.g);
            return;
        }
        if (!g.authority) return;
        const c = this._creature(m.k, m.id);
        if (m.on) {
            if (!c || c.lev || !this.grab(m.k, c, m.by, m.side || 'right', +m.h || 3)) g.sync?.levNo?.(m.by, m.k, m.id);
        } else if (c?.lev?.by === m.by) this.letGo(m.k, c, !!m.g);
    }

    /**
     * My «Левиоса» at a wizard did not lift him (`code`: Hints.refusal 'lev…'). Said a moment
     * later, and only if no word that he is up comes meanwhile (over the network the wizard's
     * own computer decides — its «yes» may come after my charge has given up waiting).
     */
    missed(id, code) {
        if (this.state?.kind === 'player' && this.state.id === id) return;
        this.miss = { id, code, at: performance.now() + 1200 };
    }

    _sayMissed() {
        const M = this.miss;
        this.miss = null;
        if (this.state?.kind === 'player' && this.state.id === M.id) return;
        this.game.hud?.setVoice(refusal(M.code, { who: this.game.playerName?.(M.id) }), true);
    }

    /** A wizard tells everyone: «I am held up by `by`» (or let go / broke free; `r`: why not lifted). */
    onNetLift(m) {
        const g = this.game;
        if (m.by !== g.localId || m.mx) return; // («Левиоса Максима» keeps its own count — LevitationMaxima.js)
        if (m.r) { if (m.r === 'levHeld') { this.missed(m.to, 'levHeld'); if (this.miss) this.miss.at = 0; } return; } // (he is held by another already)
        if (m.on) {
            this.miss = null;
            if (this.state && !(this.state.kind === 'player' && this.state.id === m.to)) { g.sync?.lev?.('p', m.to, m.side, m.h, false); return; }
            this.state = { kind: 'player', id: m.to, side: m.side || 'right', hold: +m.h || 3, target: new THREE.Vector3(), age: 0, history: [], weight: 'wizard' };
            g.hud.setVoice(`🪶 ${g.playerName?.(m.to) || 'Волшебник'} в воздухе — держите руку на нём`, true);
        } else if (this.state?.kind === 'player' && this.state.id === m.to) {
            this.state = null;
            if (m.f) g.hud.setVoice(`🛡️ ${g.playerName?.(m.to) || 'Волшебник'} вырвался щитом`, true);
        }
    }

    /** The host would not give me the body (someone holds it already). */
    onNetRefused(m) {
        const s = this.state;
        if (s?.kind === 'creature' && s.ck === m.k && s.id === m.id) {
            this.state = null;
            this.game.hud.setVoice('🪶 Его уже держит другой волшебник', true);
        }
    }

    /** A player left: what they held falls; if they held me, I fall. */
    onLeave(id) {
        if (this.lifted?.by === id) this.dropMe(false);
        if (this.state?.kind === 'player' && this.state.id === id) this.state = null;
        for (const { ck, c } of [...this.carried.values()]) if (c.lev?.by === id) this.letGo(ck, c, false);
    }

    _sparkle(p, n) {
        for (let i = 0; i < n; i++) {
            this.game.fx.spark(p, Math.random() < 0.5 ? 0xffe9a8 : 0xc9a8ff, 0.1, _v1.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.7);
        }
    }

    /** The levitated weapon for the multiplayer pose message. */
    heldWeapon() {
        return this.state && this.state.kind === 'weapon' ? this.state.obj : null;
    }
}
