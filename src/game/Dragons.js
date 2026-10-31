/**
 * Dragons.js — dragons: rare, in their lairs high in the big mountains, now and then flying over
 * the world. (Kinds, strength, the table «на кого и на что»: DragonKinds.js; looks: DragonModel.js;
 * the lairs themselves are carved into the mountains by the terrain: src/world/DragonLairs.js.)
 *
 *  - 500 HP. Fire of any kind does nothing to it (DragonKinds.FIRE_KINDS); the other spells and
 *    blows — DragonKinds.ON_DRAGON, decided per spell, with the reason.
 *  - In its lair it lies on its hoard, asleep or watching. It wakes when somebody comes near (sooner
 *    with a light, running), at a blast or thunder nearby, and AT ONCE when somebody takes its gold or
 *    its egg — then it rises (quicker the quicker its kind: «реакция») and goes for the thief.
 *  - It breathes fire at an intruder (a cone that sweeps a little: the flame burns like the game's
 *    fire — a «Protection» facing it and water stop it; it sets trees, sails, paper on fire), bites
 *    close in front, sweeps its tail at whoever is beside / behind it.
 *  - In the hall it chases on its feet; somebody who flees out of the lair — it walks out of the huge
 *    mouth, takes off and chases in the air, and gives up DRAGON.GIVE_UP m from home (flies back in).
 *  - Now and then a dragon flies over the world from far away to far away (rare — but seen more
 *    often than a lair): high in the sky, its shadow on the ground; sometimes it lands to rest.
 *    Disturb it, hurt it — it attacks.
 *  - Killed: it leaves the dragon's wand (DragonKinds.dragonWand: fire spells +60%).
 *  - The hoard: a heap of loose coins (600–3000 coins in the lair altogether, DragonKinds.rollHoard)
 *    and pouches lying on and round it (none full, some empty), one egg per dragon of the lair. Loose
 *    coins are scooped by hand — an open hand pushed into the heap, the fingers closed: a handful —
 *    and poured into an open pouch held in the other hand (or into the pouches tied on the belt:
 *    the hand opened at the right hip). Opened anywhere else — they fall (back onto the heap in
 *    the lair). Taking anything wakes the dragons.
 *  - Multiplayer: the host moves the dragons and decides (hits, the hoard); everybody sees them
 *    (`drg` messages). Every computer burns its own player in the flame. Saved with the world.
 */

import { allLog } from '../core/AllLog.js';
import { crowdStep } from './CrowdSources.js';
import { BODY_R } from './Crowd.js';
import * as THREE from 'three';
import { DRAGON_HP, DRAGON_KINDS, KIND_IDS, DRAGON, rollDragon, flameReach, dragonDamage, isFire, rollHoard, HANDFUL, dragonWand, dragonEgg } from './DragonKinds.js';
import { dragonModel, poseDragon, BODY, SCALE } from './DragonModel.js';
import { FarShape } from '../core/FarShape.js';
import { LAIR } from '../world/DragonLairs.js';
import { newUid } from './ItemTypes.js';
import { createRng } from '../core/math.js';
import { skeletonModel } from './Death.js';
import { creditKill } from './Mana.js';
import { FACE, facesTarget, facingError } from './FaceTarget.js';
import { CappedLog } from '../core/CappedLog.js';
import { earthly } from '../world/Planets.js';
import { confusedMiss } from './StrongSpells.js';
import { DragonSmash } from './DragonSmash.js';
import { TAME, tameVerdict, LOWER_ANGER, attackVerdict, angryAt } from './DragonTame.js';
import { MIND, MOVES, MOVE_IDS, LANDING, COOL, decide, targetClass, crowdAround, staminaStep, tiredK, pickMove, aimedAt, moveAnim, strikesDue, spotOk, landCandidates, liftPhase, waveAt } from './DragonMind.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Vector3();
const _c = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
const TAU = Math.PI * 2;
/** m from the heap's middle: a dead knight's bones, his named armour and sword (just beyond the fullest heap). */
const BONES_R = 5.2;
/** Wandering dragons: checked this often (s) by the host; this chance a check brings one. */
const WANDER = { EVERY: 60, CHANCE: 0.02, FIRST: 600, /* (rare: about one in 50 minutes of play, none in the first 10 — «dragons fly too often», the author) */ FAR: 340, ALT: 50, LAND: 0.3, REST: [25, 50], SEE: 22, GONE: 520 };
/** Lairs: their dragons come out when a player is this near (m); go back to rest beyond FAR. */
const LAIR_NEAR = 170, LAIR_FAR = 320;
const STATES = ['sleep', 'watch', 'chase', 'exit', 'air', 'enter', 'landed', 'dead', 'ride', 'land', 'fight']; // ('ride': under a rider — «Brain Rot Maxima», DragonTame.js; only ever appended: the index goes over the net)

/** A dragon's body as a capsule {a, b, r} in the world. */
export function dragonBody(d, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const m = d.model, ry = m.rotation.y, s = d.size;
    const fx = Math.sin(ry) * s, fz = Math.cos(ry) * s; // (the model's +z, scaled: towards the tail)
    const y = m.position.y + (BODY.y - (d.sleep || 0) * 1.1) * s;
    out.a.set(m.position.x + fx * BODY.z0, y, m.position.z + fz * BODY.z0);
    out.b.set(m.position.x + fx * BODY.z1, y, m.position.z + fz * BODY.z1);
    out.r = BODY.r * s;
    return out;
}

/** The middle of its body (where spells and arrows aim). */
export function dragonCenter(d, out = new THREE.Vector3()) {
    const b = dragonBody(d, _c);
    return out.addVectors(b.a, b.b).multiplyScalar(0.5);
}

/** How far a point is from its body's surface (≤ 0: inside). */
export function dragonDist(d, p) {
    const b = dragonBody(d, _c);
    const ab = _v2.subVectors(b.b, b.a);
    const t = Math.max(0, Math.min(1, _v.subVectors(p, b.a).dot(ab) / ab.lengthSq()));
    return _v.copy(b.a).addScaledVector(ab, t).distanceTo(p) - b.r;
}

/** Is `p` in a flame cone from `o` along `d` (unit), `len` long? (its radius grows with distance) */
export function inFlame(o, d, len, p, bodyR = 0.5) {
    const px = p.x - o.x, py = p.y - o.y, pz = p.z - o.z;
    const along = px * d.x + py * d.y + pz * d.z;
    if (along < -bodyR || along > len + bodyR) return false;
    const qx = px - d.x * along, qy = py - d.y * along, qz = pz - d.z * along;
    return Math.sqrt(qx * qx + qy * qy + qz * qz) < 0.7 + Math.max(0, along) * 0.17 + bodyR;
}

let _heapTex = null;

export class Dragons {
    constructor(game) {
        this.game = game;
        this.list = []; // dragons in the world now (lair ones near players, wanderers)
        this.lairs = new Map(); // lair id → {sys, L (the lair), st (its saved state), heap, active}
        this.state = {}; // lair id → {loose, spawned, items: [uids], d: [{hp, dead}]} (saved with the world)
        this.hands = { right: { open: false, n: 0, model: null, was: 0 }, left: { open: false, n: 0, model: null, was: 0 } };
        this._t = 0;
        this.smash = new DragonSmash(game); // («Империус Максима»: the wings and the body break what they strike)
        this._lairT = 0;
        this._wanderT = WANDER.FIRST;
        this._netT = 0;
        this._hurtT = 0;
        this.log = new CappedLog(); // (tests) what happened
        this.enabled = !game.config?.map && game.config?.mode !== 'test';
        this._hud = typeof document !== 'undefined' ? this._makeHud() : null;
    }

    get auth() { return this.game.authority; }
    get me() { return this.game.localId; }

    _makeHud() {
        let el = document.getElementById('dragon-bar');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'dragon-bar';
        el.innerHTML = '<div class="boss-name">🐉 Дракон</div><div class="boss-track"><div class="boss-fill"></div></div>';
        document.body.appendChild(el);
        return el;
    }

    // ================================================================ dragons
    /** A dragon appears (host: from a lair or a wanderer; guests: from the host's word). */
    spawn({ id, kind, react, flame, hp = DRAGON_HP, lair = null, slot = 0, pos, yaw = 0, mode = 'sleep' }) {
        const model = dragonModel(kind);
        model.position.copy(pos);
        model.rotation.y = yaw;
        this.game.scene.add(model);
        // (drawn as one shape per material, its ~80 parts moved by the video card — FarShape; it was 82 draws)
        model.updateMatrixWorld(true);
        model.userData.farRadius = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).length() * 0.75 + 4;
        const one = new FarShape(model);
        one.set(true);
        const K = DRAGON_KINDS[kind];
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.visible = false;
        this.game.scene.add(shadow);
        const d = {
            id, kind, react, flame, hp, lair, slot, model, group: model, shadow, mode, size: SCALE * K.size, one, oneT: 0,
            isDragon: true, dead: false, get isDead() { return this.dead; }, get position() { return this.model.position; },
            bodyCapsule: (out) => dragonBody(d, out),
            t: Math.random() * 10, fly: mode === 'air' ? 1 : 0, sleep: mode === 'sleep' ? 1 : 0, walk: 0, mouth: 0, look: 0, lower: 0, sweep: 0, spread: 0,
            vel: new THREE.Vector3(), target: null, aggro: null, wakeT: 0, calmT: 0, breath: null, breathCd: 2, blowCd: 0, stun: 0, blind: 0, slow: 0,
            path: null, purpose: null, home: null, dest: null, landAt: null, restT: 0, damageCooldown: 0, burnT: 0, meT: 0,
            // (the fighting mind — DragonMind.js: stamina, how long in this posture, the move under way, the take-off / landing)
            stam: 1, stay: 0, move: null, lastMove: null, gustCd: 3, roarCd: 0, diveCd: 3, wantRoar: false, roared50: false, retreatT: 0, cornered: false, smashT: 0,
            landFail: 0, landSpot: null, landFor: null, landCheckT: 0, landT: 0, liftT: 0, landCrouch: 0, stuckT: 0, stuckDist: 1e9, highT: 0, clawLeg: 0, stepT: 0, wingT: 0,
            grudge: {}, tame: null, order: null, rideWalk: 0, // (grudge: who struck / robbed it, when; tame: {by, rider} — «Brain Rot Maxima»; order: «Атак» at one it is already angry at)
        };
        this.list.push(d);
        return d;
    }

    _remove(d) {
        const i = this.list.indexOf(d);
        if (i >= 0) this.list.splice(i, 1);
        this.smash?.forget(d.id);
        this.game.scene.remove(d.model);
        d.one?.dispose();
        this.game.scene.remove(d.shadow);
        d.shadow.geometry.dispose(); d.shadow.material.dispose();
        // (the model's geometry and materials are shared between dragons: DragonModel)
    }

    targets() { return this.list.filter((d) => !d.dead); }
    byId(id) { return this.list.find((d) => d.id === id && !d.dead) || null; }

    // ================================================================ blows
    /**
     * Something struck a dragon (DragonKinds.ON_DRAGON decides how much; fire — nothing). Guests tell
     * the host. `by`: the player who did it (it turns on them).
     */
    hit(d, dmg, kind = null, by = undefined) {
        if (!d || d.dead) return 0;
        const g = this.game;
        const who = by === undefined || by === 'local' ? this.me : by;
        const { dmg: n, rule } = dragonDamage(kind, dmg);
        if (isFire(kind) && n <= 0) {
            // (fire: nothing — a few sparks off its scales, and the one who burnt it is told once)
            if (who === this.me && !this._fireSaid) { this._fireSaid = true; g.hud?.setVoice?.('🐉 Огонь дракону не страшен — жгите хоть адским пламенем', true); }
            this.log.push('fire:' + kind);
            // (but a fire AIMED at it by a player is an attack on it: the calmed one is let go — «Brain Rot Maxima»; a fire with no one behind it is not)
            if (by !== undefined && who && who !== 'dragon' && d.tame) {
                if (this.auth) this._offend(d, who);
                else if (this._t - (this._fireTold || -9) > 1) { this._fireTold = this._t; g.sync?.dragon?.({ e: 'hit', id: d.id, dmg: 0, kind, by: who }); }
            }
            return 0;
        }
        if (!this.auth) { g.sync?.dragon?.({ e: 'hit', id: d.id, dmg: Math.round(dmg * 10) / 10, kind, by: who }); return n; }
        if (rule?.stun) d.stun = Math.max(d.stun, rule.stun);
        if (rule?.blind) { d.blind = Math.max(d.blind, rule.blind); d.breath = null; }
        if (rule?.slow) d.slow = Math.max(d.slow, rule.slow);
        // it turns on whoever struck it (a player) — even a blow that did not hurt it
        if (who && who !== 'dragon' && this._playerPos(who)) this._anger(d, who, true);
        g.achievements?.hit('dragon', d.id, who); // (taking part: the achievement — even a blow that did not hurt it)
        if (n <= 0) return 0;
        d.hp = Math.max(0, d.hp - n);
        d.lastBy = who;
        if (!d.roared50 && d.hp <= DRAGON_HP * 0.5) { d.roared50 = true; d.wantRoar = true; } // (halfway: it roars at its next chance on its feet)
        this.log.push(`hit:${kind}:${Math.round(n)}`);
        const c = dragonCenter(d, _v3);
        for (let i = 0; i < 8; i++) g.fx?.spark(c, i % 2 ? 0xffd27a : 0x8a0f14, 0.2, _v2.set((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6), 0.6);
        if (d.hp <= 0) this._die(d);
        return n;
    }

    /** A blast at p (Bombardo, lightning, a cauldron…): it hurts if it reaches the body. */
    hitAt(p, radius, dmg, kind, by = undefined) {
        let any = false;
        for (const d of this.list) if (!d.dead && dragonDist(d, p) < radius) { this.hit(d, dmg, kind, by); any = true; }
        return any;
    }

    /** A ray / a cone (a beam, the Inferno): it touches the body. */
    hitRay(o, dir, len, width, dmg, kind, by = undefined) {
        let any = false;
        for (const d of this.list) {
            if (d.dead || d === this._flameOf) continue; // (its own flame never wounds it)
            const b = dragonBody(d, _c);
            let hit = false;
            for (let k = 0; k <= 4 && !hit; k++) {
                _q.lerpVectors(b.a, b.b, k / 4);
                const along = _v.subVectors(_q, o).dot(dir);
                if (along < -b.r || along > len + b.r) continue;
                hit = _v.addScaledVector(dir, -Math.max(0, Math.min(len, along))).length() < width + b.r;
            }
            if (hit) { this.hit(d, dmg, kind, by); any = true; }
        }
        return any;
    }

    /** A duel charge touched its body (DragonKinds.ON_DRAGON: «Авада» only wounds…). */
    boltAt(p, spell, by = undefined) {
        for (const d of this.list) {
            if (d.dead || dragonDist(d, p) > 0.4) continue;
            this.boltHit(d, spell, by, p);
            return true;
        }
        return false;
    }

    boltHit(d, spell, by = undefined, p = null) {
        // the strong charges and the ice («Айс Максима» by the part it hit — StrongMagic; plain «Айс»: no effect)
        if (this.game.strong?.boltHit?.('D', d, spell, by, p)) return;
        if (spell === 'Disarmor') return; // (scales are no armour: «Disarmor» does nothing — ArmorTypes.DISARMOR_TARGETS)
        // «Джолт»: a great heavy body only sways a little — it wakes and turns on the caster (no damage)
        if (spell === 'Jolt' || spell === 'JoltMaxima') {
            d.sweep = (Math.random() < 0.5 ? -1 : 1);
            const who = by === undefined || by === 'local' ? this.me : by;
            if (this.auth && who && this._playerPos(who)) this._anger(d, who, true);
            else if (!this.auth) this.game.sync?.dragon?.({ e: 'hit', id: d.id, dmg: 0, kind: 'Jolt', by: who });
            return;
        }
        this.hit(d, 4, spell, by);
    }

    /** (CreatureImpact.spellArea: «Вайнд», a blast's push, an earthquake…) it only sways a little. */
    push(name, casterId, pushAt, opts = {}) {
        if (!this.auth) return 0;
        let n = 0;
        for (const d of this.list) {
            if (d.dead || opts.skip?.(d)) continue;
            const v = pushAt(dragonCenter(d, _v3), d);
            if (!v) continue;
            opts.each?.(d, 'D', 'stagger');
            // (a great heavy body: a twelfth of the push, never off its feet)
            d.model.position.addScaledVector(_v.copy(v).setY(0), 0.08);
            d.sweep = Math.max(-1, Math.min(1, d.sweep + (Math.random() - 0.5)));
            if (name === 'Earthquake' || name === 'EarthquakeMaxima') this.hit(d, 0, 'Earthquake', casterId);
            if (casterId && this._playerPos(casterId)) this._anger(d, casterId, true);
            n++;
        }
        return n;
    }

    /** A loud thing at p (a blast, thunder, lightning): sleeping dragons near it wake up. */
    noise(p, by = null) {
        for (const d of this.list) {
            if (d.dead || d.model.position.distanceTo(p) > DRAGON.HEAR) continue;
            if (d.mode === 'sleep') this._wake(d, by && this._playerPos(by) ? by : null, false);
        }
    }

    /**
     * It turns on `who`. `offended`: they struck / hurt / robbed it — the grudge is written (the calming
     * spell will not take on them for a while: DragonTame.offence); `thief`: it was its hoard.
     * Its calmed one's (Brain Rot Maxima) own spell breaks the moment the calmed one's offended.
     * Without an offence, the one it is calmed to is never turned on.
     */
    _anger(d, who, offended = false, thief = false) {
        if (offended) this._offend(d, who, thief, false);
        else if (d.tame && d.tame.by === who) return;
        if (d.retreatT > 0) return; // (it is flying away hurt: the grudge is written, but it does not turn back until it has got away — DragonMind.MIND.HURT)
        d.aggro = who;
        d.target = who;
        if (d.mode === 'sleep' || d.mode === 'watch') { d.mode = 'watch'; d.sleepGoal = 0; d.wakeT = Math.min(d.wakeT || 9, 0.4); }
        else if (d.mode === 'landed') {
            // (sitting already: it fights from where it sits if they are near on the ground — it need not fly up; else it takes off after them)
            const tp = this._playerPos(who), p = d.model.position;
            if (tp && this._targetClass(tp) === 'ground' && Math.hypot(tp.x - p.x, tp.z - p.z) < MIND.LEAVE_FAR - 8) { d.mode = 'fight'; d.stay = 0; d.wantRoar = true; d.roarCd = 0; this.log.push('fight-from-rest'); }
            else this._takeOff(d, 'chase');
        } else if (d.mode === 'air') { if (d.purpose !== 'chase') d.stay = 0; d.purpose = 'chase'; }
        if (!d.chaseFrom) d.chaseFrom = d.home ? new THREE.Vector3(d.home.x, 0, d.home.z) : d.model.position.clone();
    }

    /** (host) `who` offended the dragon: remembered; if they hold the calming spell on it — it breaks (they are dropped, the dragon is after them). */
    _offend(d, who, thief = false, anger = true) {
        if (!who || who === 'dragon') return;
        const g = (d.grudge[who] = d.grudge[who] || { at: 0, thief: false });
        g.at = this._t;
        if (thief) g.thief = true;
        if (d.tame && d.tame.by === who) this.breakTame(d, 'attacked', who);
        if (anger && this._playerPos(who)) this._anger(d, who);
    }

    _wake(d, who, thief) {
        if (d.dead) return;
        if (d.mode === 'sleep') { d.mode = 'watch'; d.wakeT = DRAGON.WAKE / d.react; d.calmT = 0; this._roar(d); }
        if (who) { d.target = who; if (thief) d.aggro = who; }
    }

    _roar(d) {
        const g = this.game;
        g.sound?.playExplosion?.(d.model.position, g.character.group.position, 0.4);
        d.mouthT = 1.2;
        if (d.model.position.distanceTo(g.character.group.position) < 80) allLog('Мир', `${DRAGON_KINDS[d.kind].name} проснулся`);
    }

    _die(d, killer = d.lastBy) {
        if (d.dead) return;
        if (d.tame) this.breakTame(d, 'dead'); // (its rider comes down gently — DragonRide.onBroken)
        d.dead = true;
        d.mode = 'dead';
        d.breath = null; d.move = null; d.liftT = 0;
        const g = this.game;
        d.killer = killer || null;
        const c = dragonCenter(d, new THREE.Vector3());
        for (let i = 0; i < 70; i++) g.fx?.spark(c, i % 3 ? 0xff8a1e : 0x2a0a0a, 0.35, _v2.set((Math.random() - 0.5) * 14, Math.random() * 9, (Math.random() - 0.5) * 14), 1.4);
        g.hud?.notify?.(`🐉 ${DRAGON_KINDS[d.kind].name} повержен!`);
        if (d.lair) { const st = this.state[d.lair]; if (st?.d[d.slot]) { st.d[d.slot].dead = true; st.d[d.slot].hp = 0; } }
        if (this.auth) {
            // mana: a magical creature — the killer's maximum grows (once per kind; the host credits, Mana.creditKill)
            creditKill(g, killer, { kind: 'dragon' });
            g.achievements?.killed('dragon', d.id, killer, c); // (the achievement: to everyone who took part)
            // its wand: deep crimson, glowing like embers — every fire spell 60% stronger
            const p = c.clone().add(_v2.set(0, 1.5, 0));
            if (!d.annihilated) g.items?.spawnLoose(dragonWand(newUid()), p, { hover: true }); // («Дай»: no wand left — StrongMagic.annihilate)
        }
        d.fly = 0;
        d.deadT = 0;
    }

    // ================================================================ «Brain Rot Maxima» (the host decides; DragonTame.js, DragonRide.js)
    /**
     * (host) `who` casts the calming spell on dragon `d`. → the verdict (DragonTame.tameVerdict). Taken: the dragon
     * stops being after them, lets them near; flying, it comes down near them to be got on. Refused: it is angry at
     * them / they offended it / robbed it — the spell does not take; at best it lowers the anger a little.
     */
    tame(d, who) {
        const v = tameVerdict(d, who, this._t);
        if (!v.ok) {
            if (v.code === 'aggro' || d?.target === who) this.lowerAnger(d);
            this.log.push('tame-no:' + v.code);
            return v;
        }
        d.tame = { by: who, rider: null, at: this._t };
        if (d.target === who) { // (a neutral stare — an intruder, not a quarrel: it settles)
            d.target = null; d.breath = null;
            if (d.mode === 'chase' || d.mode === 'exit' || d.mode === 'fight') { d.mode = 'watch'; d.wakeT = 0; d.calmT = 0; d.move = null; } else if (d.mode === 'land') { d.mode = 'air'; d.purpose = d.lair ? 'home' : 'cruise'; } else if (d.mode === 'air' && d.purpose === 'chase') d.purpose = d.lair ? 'home' : 'cruise';
        }
        // flying past (or high over it): it comes down near them, to be got on
        if (d.mode === 'air' && d.purpose === 'cruise') {
            const tp = this._playerPos(who), p = d.model.position;
            if (tp) {
                const k = Math.max(1, Math.hypot(p.x - tp.x, p.z - tp.z));
                d.landAt = new THREE.Vector3(tp.x + (p.x - tp.x) / k * 12 * d.size, 0, tp.z + (p.z - tp.z) / k * 12 * d.size);
                d.dest = d.dest || p.clone();
            }
        }
        this.log.push('tame');
        this._sendSoon = true;
        return v;
    }

    /** (host) It is angry at the caster and the spell failed: at best the anger is lowered — its fire and blows wait, it slows (it still attacks). */
    lowerAnger(d) {
        if (!d || d.dead) return;
        d.breathCd = Math.max(d.breathCd, 0) + LOWER_ANGER.BREATH_WAIT;
        d.blowCd = Math.max(d.blowCd, 0) + LOWER_ANGER.BLOW_WAIT;
        d.slow = Math.max(d.slow, LOWER_ANGER.SLOW_T);
        d.mouthT = 0.8; // (it roars, bristles)
        this.log.push('lowered');
    }

    /** (host) `who` gets onto the dragon they calmed. → { ok, say? }. */
    mount(d, who) {
        if (!d || d.dead) return { ok: false, say: '🐉 Дракон мёртв' };
        if (!d.tame || d.tame.by !== who) return { ok: false, say: '🐉 Дракон не под вашим заклинанием' };
        if (d.tame.rider) return { ok: false, say: '🐉 На нём уже сидят' };
        const v = tameVerdict(d, who, this._t);
        if (!v.ok) return { ok: false, say: v.say };
        d.tame.rider = who;
        d.mode = 'ride'; d.target = null; d.breath = null; d.order = null; d.stun = 0;
        d.rideWalk = 0;
        this._sendSoon = true;
        this.log.push('mount');
        return { ok: true };
    }

    /** (host) The rider is down (landed, got off). The dragon stays where it is, calm while the spell is held. */
    dismounted(d, who) {
        if (!d?.tame || d.tame.rider !== who) return;
        d.tame.rider = null; d.order = null; d.rideWalk = 0;
        if (d.fly > 0.3) { d.mode = 'air'; d.purpose = 'cruise'; d.dest = null; }
        else { d.fly = 0; d.mode = d.lair && this.lairs.get(d.lair) && this.lairAt(d.model.position, 4) ? 'watch' : 'landed'; d.restT = 12; d.wakeT = 0; d.calmT = 0; d.vel.set(0, 0, 0); }
        this._sendSoon = true;
        this.log.push('dismount');
    }

    /** (host) The spell is let go (the caster, or by itself): the dragon is its own master again. */
    release(d, who) {
        if (!d?.tame || d.tame.by !== who) return;
        if (d.tame.rider) this.dismounted(d, d.tame.rider);
        d.tame = null; d.order = null;
        this.log.push('release');
    }

    /** (host) A player left the game: a dragon they tamed without riding it is its own master again (else «taken» for ever). */
    onLeave(id) {
        if (!this.auth) return;
        for (const d of this.list) if (d.tame?.by === id) { this.release(d, id); this._sendSoon = true; }
    }

    /** (host) The spell is torn (the caster struck the dragon, …): the caster's computer is told; a rider is dropped. */
    breakTame(d, why, offender = null) {
        const t = d?.tame;
        if (!t) return;
        d.tame = null; d.order = null;
        if (t.rider) { d.rideWalk = 0; d.mode = d.fly > 0.3 ? 'air' : 'watch'; d.purpose = 'cruise'; d.dest = null; d.wakeT = 0; d.calmT = 0; }
        if (t.by === this.me) this.game.dragonRide?.onBroken?.(d, why);
        else this.game.sync?.dragon?.({ e: 'untame', id: d.id, to: t.by, why });
        this._sendSoon = true;
        this.log.push('break:' + why);
    }

    /** (host) «Атак» from the rider: send the dragon at `target` — but only one it is ALREADY angry at. → { ok, why?, say? }. */
    order(d, who, target) {
        const v = attackVerdict(d, who, target, this._t);
        if (!v.ok) { this.log.push('order-no'); return v; }
        d.order = { target, until: this._t + TAME.ATTACK_T };
        this.log.push('order');
        return v;
    }

    /** The ids it is angry at now (not counting its rider): who «Атак» may name. */
    angryAt(d, rider = d.tame?.by) { return angryAt(d, rider, this._t); }

    /** (host) A ridden dragon on its rider's order: the fire at the one named — never at anything else, and it burns nothing else (no villagers, no trees). */
    _rideCombat(d, dt) {
        const o = d.order;
        if (!o) return;
        const tp = this._playerPos(o.target);
        if (!tp || this._t > o.until || !angryAt(d, d.tame.rider, this._t).includes(o.target)) { d.order = null; return; }
        if (d.breath || d.breathCd > 0 || d.blind > 0 || d.iceHeadT > 0) return;
        const p = d.model.position, dist = p.distanceTo(tp);
        if (dist >= flameReach(d.flame) || !facesTarget(d.model.rotation.y, p.x, p.z, tp.x, tp.z, FACE.BREATH)) return;
        const mouth = this._mouth(d, _v3), centre = _v2.copy(tp).add(_q.set(0, 0.6, 0));
        if (this.game.collision?.lineOfSight?.(mouth.x, mouth.y, mouth.z, centre.x, centre.y, centre.z, 1.5) === false) return;
        d.breath = { t: 0, dir: new THREE.Vector3().subVectors(centre, mouth).normalize(), aim: o.target, ride: true };
        d.breathCd = DRAGON.FLAME_REST + DRAGON.FLAME_TIME;
        this.log.push('breath:ordered');
    }

    /** (host) The rider's computer says where the dragon is under them (10 times a second). */
    _rideMsg(d, m, from) {
        if (!d?.tame || d.tame.rider !== from || !Array.isArray(m.p)) return;
        d.model.position.set(+m.p[0] || 0, +m.p[1] || 0, +m.p[2] || 0);
        d.model.rotation.y = +m.ry || 0;
        d.fly = Math.max(0, Math.min(1, +m.fly || 0));
        d.rideWalk = Math.max(0, Math.min(1, +m.walk || 0));
        d.vel.y = +m.vy || 0;
    }

    // ================================================================ players
    _playerPos(id) {
        const g = this.game;
        const seen = (p) => (p && g.invis ? g.invis.aiPos(id === 'local' ? this.me : id, p, true) : p); // (a boss: it sees the invisible)  (an invisible player: only where they were last noticed, for a few seconds — Invisibility.aiPos)
        if (id === this.me || id === 'local') return g.isDeadLocal || g.combat?.dead ? null : seen(g.character.group.position);
        const r = g.remotes?.get(id);
        return r && !r.dead ? seen(r.position) : null;
    }

    _players() {
        const out = [];
        const g = this.game;
        const me = this._playerPos(this.me);
        if (me) out.push({ id: this.me, p: me, local: true, run: !!g.character?.isRunning, light: !!g.wandMagic?.light });
        for (const [id, r] of g.remotes || []) { const p = !r.dead && r.position ? this._playerPos(id) : null; if (p) out.push({ id, p, local: false, run: false, light: !!r.lumos }); }
        return out;
    }

    _nearest(p, filter = null) {
        let best = null;
        for (const q of this._players()) {
            if (filter && !filter(q)) continue;
            const dd = q.p.distanceTo(p);
            if (!best || dd < best.d) best = { ...q, d: dd };
        }
        return best;
    }

    /** A player hurt by a dragon (their own computer counts it). */
    _hurt(id, dmg, kind, from, push = null) {
        const g = this.game;
        if (id === this.me) { this._hurtMe(dmg, kind, from, push); return; }
        g.sync?.dragon?.({ e: 'hurt', to: id, dmg, kind, f: [r2(from.x), r2(from.y), r2(from.z)], v: push ? [r2(push.x), r2(push.y), r2(push.z)] : null });
    }

    _hurtMe(dmg, kind, from, push) {
        const g = this.game, c = g.combat;
        if (!c || c.dead || g.isDeadLocal) return;
        // a raised «Protection» facing it stops a bite / a sweep too (the body still feels it)
        if (c.shieldFactor?.(from) >= 1) { c._blocked?.(from, 'bite'); if (push) g.knockback?.add(push.clone().multiplyScalar(0.3)); return; }
        if (c.frozen && kind === 'fire') c.frozenLeft = 0; // (the ice melts in the flame)
        if (c.enabled) c.damage(dmg, null, kind === 'fire' ? 'Inferno' : 'bite'); else g.damageLocalPlayer?.(dmg);
        if (kind === 'fire') g.burning?.ignite('p', g.localId, null); // (the dragon's flame sets me alight)
        if (push) g.knockback?.add(push);
        g.hud?.setVoice?.(kind === 'fire' ? `🔥 Пламя дракона: −${Math.round(dmg * 10) / 10}` : kind === 'tail' ? `🐉 Удар хвостом: −${dmg}` : kind === 'claw' || kind === 'dive' ? `🐉 Когти дракона: −${dmg}` : kind === 'gust' ? `🐉 Порыв крыльев: −${dmg}` : kind === 'quake' ? `🐉 Приземление дракона: −${dmg}` : `🐉 Укус дракона: −${dmg}`, true);
    }

    // ================================================================ lairs
    /** (host + guests) Lairs near the players: their heaps drawn; (host) their dragons and things out. */
    _updateLairs() {
        const g = this.game;
        const t = g.terrain?.data;
        if (!t?.lairsNear) return;
        const ps = this._players();
        const seen = new Set();
        for (const q of ps) for (const s of t.lairsNear(q.p.x, q.p.z, LAIR_NEAR)) seen.add(s);
        for (const s of seen) {
            const L = s.lair;
            let e = this.lairs.get(L.id);
            if (!e) { e = { sys: s, L, heap: null, active: false, hoard: rollHoard(createRng(L.seed ^ 0x601d)) }; this.lairs.set(L.id, e); }
            const st = this._lairState(e);
            if (!e.heap) e.heap = this._makeHeap(e);
            this._sizeHeap(e, st.loose);
            if (this.auth && !e.active) this._wakeLair(e, st);
            e.active = true;
        }
        // far from everybody: its dragons go back to rest (their health kept), its heap is put away
        for (const [id, e] of this.lairs) {
            if (seen.has(e.sys)) continue;
            const near = ps.some((q) => Math.hypot(q.p.x - e.L.x, q.p.z - e.L.z) < LAIR_FAR);
            if (near) continue;
            if (this.auth) for (const d of [...this.list]) if (d.lair === id && !d.dead && (d.mode === 'sleep' || d.mode === 'watch')) this._remove(d);
            if (e.heap) { g.scene.remove(e.heap.group); e.heap = null; }
            e.active = false;
            this.lairs.delete(id);
        }
    }

    /** Creative: exactly one dragon in a lair (the author saw two where he went to fight one). */
    _single() { return this.game.config?.mode === 'creative'; }

    /** A lair's saved state (made the first time: its hoard, its dragons). */
    _lairState(e) {
        let st = this.state[e.L.id];
        if (!st) {
            const rng = createRng(e.L.seed ^ 0xd7a6);
            const n = rng() < 0.25 && !this._single() ? 2 : 1; // (the roll is made either way: the rest of the lair's numbers stay as they were)
            const d = [];
            for (let i = 0; i < n; i++) {
                const r = rollDragon(rng, i && rng() < 0.6 ? d[0].kind : null); // (a pair: often of one kind)
                d.push({ kind: r.kind, react: r.react, flame: r.flame, hp: DRAGON_HP, dead: false });
            }
            st = this.state[e.L.id] = { loose: e.hoard.loose, spawned: false, items: [], d };
        }
        return st;
    }

    /** Where a lair's floor is (world y), and the hoard. */
    _floorY(L) { return L.F - 0.5; }

    /** (host) A player came near a lair: its dragons lie on the hoard; its pouches and eggs lie there (once). */
    _wakeLair(e, st) {
        const g = this.game, L = e.L;
        const fy = this._floorY(L);
        const hx = L.hoard.x, hz = L.hoard.z;
        const R = this._heapR(st.loose);
        st.d.forEach((s, i) => {
            if (i && this._single()) return; // (Creative: one dragon to a lair, even if a pair was rolled before)
            if (s.dead || this.list.some((d) => d.lair === L.id && d.slot === i)) return;
            // curled beside the heap, facing the mouth
            const side = i ? -1 : 1;
            const px = hx + L.dx * (R + 6) - L.dz * side * (i ? 7 : 2), pz = hz + L.dz * (R + 6) + L.dx * side * (i ? 7 : 2);
            const d = this.spawn({ id: `${L.id}:${i}`, kind: s.kind, react: s.react, flame: s.flame, hp: s.hp, lair: L.id, slot: i, pos: new THREE.Vector3(px, fy, pz), yaw: Math.atan2(-L.dx, -L.dz), mode: 'sleep' });
            d.home = { x: px, z: pz, yaw: d.model.rotation.y };
        });
        if (!st.spawned && g.items) {
            st.spawned = true;
            const rng = createRng(L.seed ^ 0xb4c5);
            const at = (a, r, up = 0.4) => new THREE.Vector3(hx + Math.cos(a) * r, fy + up, hz + Math.sin(a) * r);
            // pouches of coins: on the heap's slope and round it (picked up, their coins go into the hero's pouch)
            e.hoard.bags.forEach((n) => {
                const it = { kind: 'coins', uid: newUid(), count: n };
                g.items.spawnLoose(it, at(rng() * TAU, R * (0.6 + rng() * 0.7), 0.6));
                st.items.push(it.uid);
            });
            // one egg per dragon of the lair, nestled at the heap's foot
            st.d.forEach((s, i) => {
                if (i && this._single()) return;
                const it = dragonEgg(newUid(), s.kind);
                g.items.spawnLoose(it, at(rng() * TAU, R * 0.85 + i * 0.6, 0.5));
                st.items.push(it.uid);
            });
            // what is left of a knight who came for the gold (its bones: the heap's model): his named armour —
            // a whole magic set, its perks rolled now (and now and then a magic robe) — and his magic sword (Armor.js)
            const ba = this._bonesAt(L);
            (g.armor?.lairHoard() || []).forEach((it, i) => {
                g.items.spawnLoose(it, at(ba + (i - 1) * 0.16, BONES_R + (i % 2) * 0.5, 0.7));
                st.items.push(it.uid);
            });
            if (g.weapons?.spawnLying) {
                const w = g.weapons.markMagic(g.weapons.spawnLying('sword', hx + Math.cos(ba + 0.35) * BONES_R, fy, hz + Math.sin(ba + 0.35) * BONES_R, ba, 'lair' + L.id), 30 + Math.floor(rng() * 31));
                g.sync?.weaponAppeared?.(w, true); // (the lair's: anybody's to take)
            }
        }
    }

    /** Where round the heap the dead knight lies (always the same for a lair). */
    _bonesAt(L) { return createRng(L.seed ^ 0xb0e5)() * TAU; }

    // ---- the heap of loose coins
    _heapR(n) { return n > 0 ? 1.6 + 3.2 * Math.sqrt(Math.min(5000, n) / 5000) : 0; }
    _heapH(n) { return n > 0 ? 0.35 + 1.6 * Math.sqrt(Math.min(5000, n) / 5000) : 0; }

    _makeHeap(e) {
        const g = this.game, L = e.L;
        const group = new THREE.Group();
        group.position.set(L.hoard.x, this._floorY(L), L.hoard.z);
        const gold = new THREE.MeshLambertMaterial({ color: 0xd8a62a, emissive: 0x3a2400 });
        const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 8, 0, TAU, 0, Math.PI / 2), gold);
        group.add(dome);
        // single coins lying on its slope and round its foot (one draw for all of them)
        const coin = new THREE.CylinderGeometry(0.06, 0.06, 0.012, 8);
        const N = 260;
        const coins = new THREE.InstancedMesh(coin, new THREE.MeshLambertMaterial({ color: 0xffd34a, emissive: 0x4a3000 }), N);
        group.add(coins);
        // the bones of a knight in the gold (his armour and sword lie by them: _wakeLair)
        const bones = skeletonModel();
        const ba = this._bonesAt(L);
        bones.position.set(Math.cos(ba) * BONES_R, 0.02, Math.sin(ba) * BONES_R);
        bones.rotation.y = ba + 1.2;
        group.add(bones);
        g.scene.add(group);
        const rng = createRng(L.seed ^ 0xc011);
        const spots = [];
        for (let i = 0; i < N; i++) spots.push({ a: rng() * TAU, k: Math.sqrt(rng()) * 1.25, rx: rng() * 3, rz: rng() * 3 });
        return { group, dome, coins, spots, n: -1 };
    }

    _sizeHeap(e, n) {
        const h = e.heap;
        if (!h || h.n === n) return;
        h.n = n;
        const R = this._heapR(n), H = this._heapH(n);
        h.dome.visible = n > 0;
        h.dome.scale.set(R, H, R);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
        let k = 0;
        for (const sp of h.spots) {
            if (n <= 0 && sp.k < 1) continue;
            const r = sp.k * Math.max(R, 1.5);
            const y = sp.k < 1 && n > 0 ? H * Math.sqrt(Math.max(0, 1 - sp.k * sp.k)) : 0.01;
            q.setFromEuler(e3.set(sp.rx * 0.3, 0, sp.rz * 0.3));
            m.compose(_v.set(Math.cos(sp.a) * r, y + 0.01, Math.sin(sp.a) * r), q, s);
            h.coins.setMatrixAt(k++, m);
        }
        h.coins.count = k;
        h.coins.instanceMatrix.needsUpdate = true;
    }

    /** Is the point in a heap (in its dome)? → the lair entry, else null. */
    _heapAt(p) {
        for (const e of this.lairs.values()) {
            const st = this.state[e.L.id];
            const n = st ? st.loose : e.heap?.n ?? 0;
            if (!e.heap || n <= 0) continue;
            const R = this._heapR(n), H = this._heapH(n);
            const dx = p.x - e.L.hoard.x, dz = p.z - e.L.hoard.z, d = Math.hypot(dx, dz);
            if (d > R) continue;
            const top = this._floorY(e.L) + H * Math.sqrt(Math.max(0, 1 - (d * d) / (R * R)));
            if (p.y < top + 0.2 && p.y > this._floorY(e.L) - 0.3) return e;
        }
        return null;
    }

    /** Is the point in a lair (its hall, its mouth)? → the lair entry, else null. */
    lairAt(p, pad = 0) {
        for (const e of this.lairs.values()) {
            const L = e.L;
            if (p.y < L.F - 3 || p.y > L.F + LAIR.H + 4) continue;
            if (Math.hypot(p.x - L.x, p.z - L.z) < L.r + pad) return e;
            // (the mouth's tunnel)
            const ax = p.x - L.x, az = p.z - L.z, along = ax * L.dx + az * L.dz, off = Math.abs(-ax * L.dz + az * L.dx);
            if (along > 0 && along < Math.hypot(L.mouth.x - L.x, L.mouth.z - L.z) + LAIR.OUT + pad && off < LAIR.MOUTH_R + pad) return e;
        }
        return null;
    }

    // ---- the hands: scooping the loose gold
    _updateHands(dt) {
        const g = this.game, ch = g.character, items = g.items;
        if (!ch || !items || !this.lairs.size || g.combat?.dead || g.isDeadLocal) return;
        for (const side of ['right', 'left']) {
            const H = this.hands[side];
            const busy = !!(items.held[side] || g.weapons?.hands?.[side]?.held);
            const hp = ch.getHandWorldPosition(side, _v3);
            const curl = ch.getGripCurl ? ch.getGripCurl(side) : 0;
            if (busy && !H.n) { H.open = false; continue; }
            if (H.n <= 0) {
                // an open hand pushed into the heap, then its fingers closed: a handful
                const e = this._heapAt(hp);
                if (!e) { H.open = false; continue; }
                if (curl < 0.4) H.open = true;
                else if (H.open && curl > 0.6) {
                    H.open = false;
                    const want = HANDFUL.MIN + Math.floor(Math.random() * (HANDFUL.MAX - HANDFUL.MIN + 1));
                    if (this.auth) this._handful(side, this._take(e.L.id, want, this.me));
                    else g.sync?.dragon?.({ e: 'scoop', lair: e.L.id, n: want, side });
                }
                continue;
            }
            // a handful in the fist: opened — where?
            H.openT = curl < 0.35 ? (H.openT || 0) + dt : 0;
            if (H.openT < 0.08) continue;
            this._pour(side, hp);
        }
    }

    /** (host) Take up to `n` loose coins from a lair's heap for player `who`: how many. The dragons wake. */
    _take(lairId, n, who) {
        const st = this.state[lairId];
        if (!st || st.loose <= 0) return 0;
        const k = Math.max(0, Math.min(n, st.loose));
        st.loose -= k;
        const e = this.lairs.get(lairId);
        if (e) this._sizeHeap(e, st.loose);
        this._thief(lairId, who);
        this._sendSoon = true;
        return k;
    }

    /** (host) Somebody took from a lair's hoard: its dragons wake and go for them. */
    _thief(lairId, who) {
        for (const d of this.list) {
            if (d.lair !== lairId || d.dead) continue;
            const asleep = d.mode === 'sleep';
            this._wake(d, who, true);
            if (who) this._anger(d, who, true, true);
            if (asleep) d.wakeT = DRAGON.WAKE / d.react; // (it needs a moment to rise: how quick its kind is)
        }
        this.log.push('thief:' + lairId);
    }

    /** A handful of `n` coins is now in this hand. */
    _handful(side, n) {
        const g = this.game, H = this.hands[side];
        if (n <= 0) { g.hud?.toast?.('💰 Здесь уже нет монет'); return; }
        H.n = n;
        g.sound?.playCoins?.();
        // a few coins seen between the fingers
        if (!H.model) {
            const grp = new THREE.Group();
            const m = new THREE.MeshLambertMaterial({ color: 0xffd34a, emissive: 0x4a3000 });
            for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 8), m); c.position.set((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.06); c.rotation.set(Math.random(), 0, Math.random()); grp.add(c); }
            H.model = grp;
        }
        g.character.getGripObject?.(side)?.add(H.model);
        g.hud?.toast?.(`💰 Горсть монет: ${n} — высыпьте в открытый мешочек в другой руке или в мешочек на поясе`, 2200);
        this.log.push('scoop:' + side + ':' + n);
    }

    /** The hand with a handful opened at `hp`: into a pouch, onto the belt, back onto the heap — or they fall. */
    _pour(side, hp) {
        const g = this.game, H = this.hands[side], items = g.items, inv = g.inventory;
        let n = H.n;
        H.n = 0;
        H.openT = 0;
        H.model?.parent?.remove(H.model);
        const other = side === 'right' ? 'left' : 'right';
        const pouch = items?.held[other]?.item;
        const near = (p) => p && hp.distanceTo(p) < 0.4;
        let put = 0, where = '';
        if (pouch?.kind === 'coins' && near(g.character.getHandWorldPosition(other, _v2))) {
            pouch.count = (pouch.count || 0) + n; // (the pouch has no end)
            put = n; where = `в мешочек (в нём ${pouch.count})`;
            inv?._render?.();
        } else if (inv?.purse && inv.purse.any && g.currentPose?.purse?.off === true && inv.headDown && side !== (g.dom || 'right')) { // (the pouches are the other hand's: CoinBelt)
            const rest = inv.purse.add(n);
            put = n - rest; where = `в мешочек на поясе (${inv.purse.count})`;
            inv._render?.();
        }
        n -= put;
        if (put > 0) { g.sound?.playCoins?.(); g.hud?.toast?.(`💰 +${put} монет ${where}${n > 0 ? ` — ${n} не поместились и упали на землю` : ''}`, 1800); this.log.push('pour:' + put); }
        if (n <= 0) return;
        // the rest falls: in a lair — back to its heap (rolling down to it); elsewhere — a little heap of coins on the ground
        for (let i = 0; i < Math.min(10, n); i++) g.fx?.spark(hp, 0xffd34a, 0.05, _v.set((Math.random() - 0.5) * 1.5, -1 - Math.random() * 2, (Math.random() - 0.5) * 1.5), 0.6);
        const e = this.lairAt(hp, 2);
        if (e) {
            if (this.auth) { const st = this.state[e.L.id]; if (st) { st.loose += n; this._sizeHeap(e, st.loose); this._sendSoon = true; } }
            else g.sync?.dragon?.({ e: 'back', lair: e.L.id, n });
        } else if (this.auth || !g.sync) items?.spawnLoose({ kind: 'coins', uid: newUid(), count: n }, hp.clone(), { vel: new THREE.Vector3(0, -1, 0) });
        else g.sync?.dragon?.({ e: 'drop', n, p: [r2(hp.x), r2(hp.y), r2(hp.z)] });
        this.log.push('fall:' + n);
    }

    /** (host) Things of a lair's hoard (pouches, eggs) taken: its dragons wake. */
    _watchHoard() {
        const items = this.game.items;
        if (!items) return;
        for (const [id, st] of Object.entries(this.state)) {
            if (!st.items?.length || !this.lairs.has(id)) continue;
            const gone = st.items.filter((u) => !items.loose.has(u));
            if (!gone.length) continue;
            st.items = st.items.filter((u) => items.loose.has(u));
            const e = this.lairs.get(id);
            const near = this._nearest(new THREE.Vector3(e.L.hoard.x, this._floorY(e.L), e.L.hoard.z));
            this._thief(id, near?.id || null);
        }
    }

    // ================================================================ wanderers
    _wanderers(dt) {
        const g = this.game;
        this._wanderT -= dt;
        if (this._wanderT > 0) return;
        this._wanderT = WANDER.EVERY;
        if (this.list.some((d) => !d.lair && !d.dead)) return;
        if (Math.random() > WANDER.CHANCE && !this._forceWander) return;
        this._forceWander = false;
        const ps = this._players().filter((P) => earthly(P.p)); // (no dragons fly by off the Earth: Planets.earthly)
        if (!ps.length) return;
        const q = ps[Math.floor(Math.random() * ps.length)].p;
        const a = Math.random() * TAU, side = (Math.random() - 0.5) * 300;
        const from = new THREE.Vector3(q.x + Math.cos(a) * WANDER.FAR - Math.sin(a) * side * 0.3, 0, q.z + Math.sin(a) * WANDER.FAR + Math.cos(a) * side * 0.3);
        const to = new THREE.Vector3(q.x - Math.cos(a) * WANDER.FAR + Math.sin(a) * side, 0, q.z - Math.sin(a) * WANDER.FAR - Math.cos(a) * side);
        from.y = this._skyFloor(from.x, from.z) + WANDER.ALT + Math.random() * 25;
        const r = rollDragon(Math.random);
        const d = this.spawn({ id: 'dw' + Date.now().toString(36), kind: r.kind, react: r.react, flame: r.flame, pos: from, yaw: Math.atan2(-(to.x - from.x), -(to.z - from.z)), mode: 'air' });
        d.purpose = 'cruise';
        d.dest = to;
        d.cruiseY = from.y;
        // sometimes it lands somewhere along its way to rest
        if (Math.random() < WANDER.LAND) d.landAt = from.clone().lerp(to, 0.35 + Math.random() * 0.3);
        this.log.push('wanderer:' + r.kind);
        if (from.distanceTo(g.character.group.position) < 600) allLog('Мир', 'вдали пролетает дракон (' + r.kind + ')'); // (the journal only — no on-screen warning)
    }

    /**
     * The highest ground under / near a point (to fly over it). `fly`: also the floating islands
     * (generation 5) and the tree on one — a dragon flies over them, never through; for landing
     * (`fly` false) the ground itself.
     */
    _skyFloor(x, z, fly = true) {
        // (the world's height field — no chunk is made for it: a dragon flies far from the players)
        const data = this.game.terrain?.data, H = data?.heightAt;
        if (!H) return this.game.collision?.groundY?.(x, z) ?? 0;
        const top = fly && data.lush ? (ix, iz) => data.skyTopAt(ix, iz) : H;
        let y = top(Math.round(x), Math.round(z));
        for (const [ox, oz] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) y = Math.max(y, top(Math.round(x + ox), Math.round(z + oz)));
        return y - 0.5;
    }

    // ================================================================ the mind (host)
    _think(d, dt) {
        const g = this.game;
        const p = d.model.position;
        d.t += dt;
        d.stun = Math.max(0, d.stun - dt); d.blind = Math.max(0, d.blind - dt); d.slow = Math.max(0, d.slow - dt);
        // «Айс Максима» (StrongMagic): the head in ice — it shakes it, can't strike; a leg / the trunk — slower
        d.iceHeadT = Math.max(0, (d.iceHeadT || 0) - dt); d.iceSlowT = Math.max(0, (d.iceSlowT || 0) - dt);
        if (d.iceHeadT > 0) d.sweep = Math.sin(d.t * 9) * 0.8;
        d.breathCd -= dt * d.react; d.blowCd -= dt * d.react;
        if (d.mouthT > 0) d.mouthT -= dt;
        // (lost in Accentric's haze: slower, reeling — and half its blows don't come off: confusedMiss)
        const quick = d.react * (d.slow > 0 ? 0.55 : 1) * (d.iceSlowT > 0 ? d.iceSlowK || 0.5 : 1) * (d.accT > 0 ? 0.6 : 1);
        const lair = d.lair ? this.lairs.get(d.lair) : null;
        const L = lair?.L || null;
        // under a rider («Brain Rot Maxima»): the rider's computer flies it; here only the ordered fire
        if (d.tame?.rider) {
            if (!this._playerPos(d.tame.rider)) this.release(d, d.tame.by); // (the rider left / died)
            else { d.mode = 'ride'; d.target = null; this._rideCombat(d, dt); this._animate(d, dt, d.rideWalk); return; }
        }
        const calm = d.tame ? ((q) => q.id !== d.tame.by) : null; // (the one it is calmed to is no intruder, nobody to wake for)
        this._mindTick(d, dt);
        if (d.stun > 0) { d.breath = null; d.move = null; this._animate(d, dt, 0); return; }
        const tp = d.target ? this._playerPos(d.target) : null;
        if (d.target && !tp) { d.target = null; d.aggro = null; }
        switch (d.mode) {
            case 'sleep': {
                // who comes near: wakes it (nearer for one who sneaks in the dark; farther with a light / running)
                d.checkT = (d.checkT || 0) - dt;
                if (d.checkT <= 0) {
                    d.checkT = 0.3;
                    for (const q of this._players()) {
                        if (calm && !calm(q)) continue;
                        const dd = q.p.distanceTo(p);
                        if (dd < DRAGON.SLEEP_SEE || (q.light && dd < DRAGON.SLEEP_SEE_LIGHT) || (q.run && dd < DRAGON.SLEEP_SEE_RUN)) { d.wasAsleep = true; this._wake(d, q.id, false); break; }
                    }
                }
                this._animate(d, dt, 0);
                return;
            }
            case 'watch': {
                d.wakeT -= dt;
                // it rises, looks round at the nearest intruder
                const near = this._nearest(p, calm);
                if (near) this._lookAt(d, near.p, dt * 0.5);
                if (d.wakeT > 0) { this._animate(d, dt, 0); return; }
                const intr = d.retreatT > 0 ? null : this._intruder(d, L, calm); // (it flew away hurt: it does not turn back yet)
                if (d.aggro && tp) { d.target = d.aggro; d.mode = 'chase'; d.calmT = 0; }
                else if (intr) { d.target = intr.id; d.mode = 'chase'; d.calmT = 0; d.chaseFrom = null; }
                else {
                    d.calmT += dt;
                    if (d.calmT > DRAGON.CALM && L && !d.tame) { d.mode = 'sleep'; d.calmT = 0; d.wasAsleep = false; }
                    if (!L && !d.tame) this._takeOff(d, 'cruise'); // (calmed: it waits for its rider)
                }
                this._animate(d, dt, 0);
                return;
            }
            case 'chase': {
                if (!tp) { this._goHome(d, L); this._animate(d, dt, 0); return; }
                // fled out of the lair: it goes out after them — or gives up
                const inside = L ? !!this.lairAt(tp, 3) : true;
                const far = L ? Math.hypot(tp.x - L.x, tp.z - L.z) > DRAGON.GIVE_UP : (d.chaseFrom && tp.distanceTo(d.chaseFrom) > DRAGON.GIVE_UP);
                if (far) { d.target = null; d.aggro = null; this._goHome(d, L); this._animate(d, dt, 0); return; }
                if (L && !inside) {
                    if (!d.aggro && !this._intruder(d, L)) { d.target = null; this._goHome(d, L); this._animate(d, dt, 0); return; }
                    d.mode = 'exit'; d.exitStep = 0;
                    this._animate(d, dt, 0);
                    return;
                }
                const k = this._groundChase(d, tp, dt, quick, L);
                this._animate(d, dt, k);
                return;
            }
            case 'exit': {
                // out of the huge mouth: to the mouth, out onto the ledge — then it takes off
                const goal = d.exitStep === 0 ? L.mouth : L.out;
                const moved = this._walkTo(d, goal.x, goal.z, DRAGON.WALK * 1.3 * quick, dt, L, true);
                if (moved < 2.5) {
                    if (d.exitStep === 0) d.exitStep = 1;
                    else this._takeOff(d, d.target ? 'chase' : 'home');
                }
                if (d.target && tp && this.lairAt(tp, 3)) { d.mode = 'chase'; } // (they came back in)
                d.spread = Math.min(1, d.spread + dt * 0.8 * (d.exitStep ? 1 : 0));
                this._animate(d, dt, 1);
                return;
            }
            case 'air': {
                this._fly(d, tp, dt, quick, L);
                this._animate(d, dt, 0);
                return;
            }
            case 'land': { // (coming down by its target: DragonMind → `_landStep`)
                this._landStep(d, tp, dt, quick, L);
                this._animate(d, dt, 0);
                return;
            }
            case 'fight': { // (on its feet in the open: it bites, claws, sweeps its tail, beats its wings, breathes, roars)
                const k = this._fightStep(d, tp, dt, quick, L);
                this._animate(d, dt, k);
                return;
            }
            case 'enter': {
                // in through the mouth: glide down to its floor, walk back to the hoard
                const fy = this._floorY(L);
                if (d.enterStep === 0) {
                    const moved = this._flyTo(d, _v.set(L.out.x, fy + 7, L.out.z), DRAGON.FLY * 0.7 * quick, dt, false);
                    if (moved < 5) d.enterStep = 1;
                } else if (d.enterStep === 1) {
                    d.fly = Math.max(0, d.fly - dt * 0.8);
                    const moved = this._flyTo(d, _v.set(L.mouth.x, fy, L.mouth.z), DRAGON.FLY * 0.45 * quick, dt, false);
                    if (moved < 2.5) { d.enterStep = 2; d.fly = 0; }
                } else {
                    d.fly = 0;
                    const h = d.home || { x: L.hoard.x, z: L.hoard.z };
                    const moved = this._walkTo(d, h.x, h.z, DRAGON.WALK * quick, dt, L, false);
                    if (tp && this.lairAt(tp, 3)) { d.mode = 'chase'; break; }
                    if (moved < 2) { d.mode = 'watch'; d.calmT = 0; d.wakeT = 0; d.model.rotation.y = h.yaw ?? d.model.rotation.y; }
                }
                d.spread = Math.max(0, d.spread - dt * 0.6);
                this._animate(d, dt, d.enterStep === 2 ? 1 : 0);
                return;
            }
            case 'landed': {
                if (!d.tame) d.restT -= dt; // (calmed: it waits for its rider)
                const near = this._nearest(p, calm);
                if (near && near.d < WANDER.SEE) { this._wake(d, near.id, false); this._anger(d, near.id); return; }
                if (near) this._lookAt(d, near.p, dt * 0.3);
                if (d.restT <= 0) this._takeOff(d, 'cruise');
                this._animate(d, dt, 0);
                return;
            }
            default: this._animate(d, dt, 0);
        }
    }

    /** The intruder of its lair (nearest player in or near its hall, or at its mouth). */
    _intruder(d, L, calm = null) {
        if (!L) return null;
        return this._nearest(d.model.position, (q) => (!calm || calm(q)) && (!!this.lairAt(q.p, DRAGON.GUARD) || Math.hypot(q.p.x - L.mouth.x, q.p.z - L.mouth.z) < 25));
    }

    _goHome(d, L) {
        d.breath = null;
        d.target = null; d.aggro = null; d.chaseFrom = null;
        if (!L) { if (d.mode === 'chase' || d.mode === 'fight' || d.mode === 'land') this._takeOff(d, 'cruise'); else d.purpose = 'cruise'; return; }
        if (d.fly > 0.3) { d.mode = 'air'; d.purpose = 'home'; return; }
        // (on its feet far from its hall — after a fight on the ground: it does not walk through the mountain; it flies home)
        if (!this.lairAt(d.model.position, 2)) { this._takeOff(d, 'home'); return; }
        d.mode = 'enter'; d.enterStep = 2;
    }

    _takeOff(d, purpose) {
        const grounded = d.fly < 0.3;
        d.mode = 'air';
        d.purpose = purpose;
        d.sleep = 0;
        d.stay = 0; d.move = null; d.breath = null; d.landSpot = null; d.stuckT = 0; d.stuckDist = 1e9; d.dec = null;
        // (from the ground: a crouch, a run-up, wing-beats, the climb — `_lift`; already flying: it just goes on)
        d.liftT = grounded ? 0.001 : 0;
        if (grounded) d.vel.set(0, 0, 0);
        else d.vel.set(-Math.sin(d.model.rotation.y), 0.6, -Math.cos(d.model.rotation.y)).multiplyScalar(6);
        if (purpose === 'chase' && !d.chaseFrom) d.chaseFrom = d.model.position.clone();
        this.log.push('takeoff:' + purpose);
    }

    /** On its feet after somebody (in its hall, or in the open after landing): walks up, then bites / claws / sweeps its tail / beats its wings / breathes. → how much it walks (0–1). */
    _groundChase(d, tp, dt, quick, L) {
        const p = d.model.position, s = d.size;
        const to = _v.set(tp.x - p.x, 0, tp.z - p.z);
        const dist = to.length();
        const ang = this._angleTo(d, tp);
        if (d.move) { // (a move under way: the feet are planted; the head follows the target a little, a tail sweep and a roar do not)
            if (d.move.kind !== 'tail' && d.move.kind !== 'roar') this._lookAt(d, tp, dt * 0.4);
            return 0;
        }
        let walk = 0;
        if (dist > 7 * s && !d.breath) walk = this._walkTo(d, tp.x, tp.z, DRAGON.WALK * quick, dt, L, false, 6 * s) > 0 ? 1 : 0;
        else this._lookAt(d, tp, dt);
        this._attack(d, tp, dist, ang, dt);
        return walk;
    }

    /** How many players are within `r` m (flat) of the dragon. */
    _nearCount(d, r) {
        const p = d.model.position;
        let n = 0;
        for (const q of this._players()) if (Math.hypot(q.p.x - p.x, q.p.z - p.z) < r) n++;
        return n;
    }

    /** What it does on its feet (DragonMind.pickMove): a move is begun (it winds up, then strikes — `_moveTick`), or its fire. */
    _attack(d, tp, dist, ang, dt) {
        const s = d.size;
        const centre = _v2.copy(tp).add(_q.set(0, 0.6, 0));
        if (d.iceHeadT > 0) return; // (its head in the ice: no bite, no fire)
        if (d.fly < 0.3 && !d.move && !d.breath) {
            if (d.wantRoar && d.roarCd <= 0) { this._startMove(d, 'roar', ang); return; }
            const kind = pickMove({ dist, ang, size: s, blowCd: d.blowCd, gustCd: d.gustCd, crowd: this._nearCount(d, MOVES.gust.reach * s), last: d.lastMove, rnd: Math.random(),
                breathReady: d.breathCd <= 0 && d.blind <= 0 && dist > 4 * s && dist < flameReach(d.flame) });
            if (kind) {
                if (kind !== 'gust' && confusedMiss(d)) { d.blowCd = DRAGON.BLOW_REST; d.sweep = Math.random() - 0.5; return; } // (a wild snap at nothing)
                this._startMove(d, kind, ang);
                return;
            }
        }
        // its fire: in reach, turned fully to them («лицом к цели»), nothing solid between (and it can see)
        const reach = flameReach(d.flame);
        if (!d.breath && !d.move && d.breathCd <= 0 && d.blind <= 0 && dist > 4 * s && dist < reach && Math.abs(ang) < FACE.BREATH) {
            const mouth = this._mouth(d, _v3);
            if (confusedMiss(d)) d.breathCd = DRAGON.FLAME_REST; // (lost: the breath goes nowhere)
            else if (this.game.collision?.lineOfSight?.(mouth.x, mouth.y, mouth.z, centre.x, centre.y, centre.z, 1.5) !== false) {
                d.breath = { t: 0, dir: new THREE.Vector3().subVectors(centre, mouth).normalize(), aim: d.target };
                d.breathCd = DRAGON.FLAME_REST + DRAGON.FLAME_TIME;
                this.log.push('breath');
            }
        }
    }

    _angleTo(d, tp) {
        const p = d.model.position;
        const want = Math.atan2(-(tp.x - p.x), -(tp.z - p.z));
        return wrap(want - d.model.rotation.y);
    }

    _lookAt(d, tp, dt) {
        const a = this._angleTo(d, tp);
        const step = DRAGON.TURN * d.react * dt;
        d.model.rotation.y += Math.max(-step, Math.min(step, a));
        d.look += (Math.max(-1, Math.min(1, a)) - d.look) * Math.min(1, dt * 4);
    }

    /**
     * Walk towards (x, z) on its feet (cave floors too). In a lair it stays in its hall and the
     * mouth's tunnel. `level`: keep the floor's height (out on the ledge, before take-off).
     * → how far it still is.
     */
    _walkTo(d, x, z, speed, dt, L, level, stopAt = 0) {
        const p = d.model.position;
        let dx = x - p.x, dz = z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= stopAt) return 0;
        // a great body on its feet goes round the others on its way too (Crowd.js); in its lair it keeps to it
        if (speed > 0 && dist > 0.1) {
            const a = crowdStep(this.game, d, p, dx / dist, dz / dist, dist - stopAt, { r: BODY_R.dragon * (d.size || 1) / 1.25, speed, dt, look: 6, dy: 5 });
            if (!a) return dist;
            dx = a.x * dist; dz = a.z * dist;
        }
        const want = Math.atan2(-dx, -dz);
        const a = wrap(want - d.model.rotation.y);
        const step = DRAGON.TURN * d.react * dt;
        d.model.rotation.y += Math.max(-step, Math.min(step, a));
        // (it walks the way it faces: a great body turns first)
        const go = Math.min(dist - stopAt, speed * dt * Math.max(0, Math.cos(a)));
        p.x += -Math.sin(d.model.rotation.y) * go;
        p.z += -Math.cos(d.model.rotation.y) * go;
        if (L && !this.lairAt(p, 0) && !level) { // (never through the hall's wall)
            const ox = p.x - L.x, oz = p.z - L.z, o = Math.hypot(ox, oz), lim = L.r - 4 * d.size;
            if (o > lim && !this.lairAt(p, 1)) { p.x = L.x + ox / o * lim; p.z = L.z + oz / o * lim; }
        }
        const col = this.game.collision;
        const fy = L ? this._floorY(L) : null;
        let gy = col?.groundAt ? col.groundAt(p.x, p.z, p.y + 2.5) : col?.groundY(p.x, p.z) ?? p.y;
        if (level && fy != null) gy = Math.max(gy, fy);
        p.y += (gy - p.y) * Math.min(1, dt * 6);
        d.look += (Math.max(-1, Math.min(1, a)) - d.look) * Math.min(1, dt * 3);
        return dist;
    }

    /** Fly towards a point (steering, its speed). → how far it still is. `clear`: keep over the ground. */
    _flyTo(d, goal, speed, dt, clear = true) {
        const p = d.model.position;
        const to = _q.subVectors(goal, p);
        const dist = to.length();
        if (dist < 0.01) return 0;
        const want = to.multiplyScalar(1 / dist).multiplyScalar(Math.min(speed, dist * 1.5 + 2));
        d.vel.lerp(want, Math.min(1, dt * 1.2 * d.react));
        p.addScaledVector(d.vel, dt);
        if (clear) {
            const ahead = this._skyFloor(p.x + d.vel.x * 1.5, p.z + d.vel.z * 1.5);
            const floor = Math.max(this._skyFloor(p.x, p.z), ahead) + 7 * d.size;
            if (p.y < floor) { p.y += (floor - p.y) * Math.min(1, dt * 3); if (d.vel.y < 0) d.vel.y = 0; }
        }
        const h = Math.hypot(d.vel.x, d.vel.z);
        if (h > 0.5) {
            const want2 = Math.atan2(-d.vel.x, -d.vel.z);
            const a = wrap(want2 - d.model.rotation.y);
            d.model.rotation.y += Math.max(-dt * 2, Math.min(dt * 2, a));
            d.bank = Math.max(-0.5, Math.min(0.5, a));
        }
        return dist;
    }

    /** In the air: chasing (circling over them, breathing down), going home, cruising, landing. */
    _fly(d, tp, dt, quick, L) {
        if (d.liftT > 0) { this._lift(d, tp, dt); return; } // (from the ground: a crouch, the wing-beats, the climb)
        d.fly = Math.min(1, d.fly + dt * 1.5);
        d.spread = 1;
        const p = d.model.position;
        if (d.purpose === 'chase') {
            const home = L ? _v2.set(L.x, p.y, L.z) : d.chaseFrom;
            if (!tp || (home && Math.hypot(tp.x - home.x, tp.z - home.z) > DRAGON.GIVE_UP)) { d.target = null; d.aggro = null; d.breath = null; d.purpose = L ? 'home' : 'cruise'; this.log.push('giveup'); return; }
            if (L && this.lairAt(tp, 3)) { d.mode = 'enter'; d.enterStep = 0; return; } // (after them, into its lair)
            // the posture (DragonMind): hurt — away; the target on the ground and near — it comes down and fights on its feet; else it circles and dives
            const dec = this._decision(d, tp, L, 'air', dt);
            if (dec.act === 'retreat') { this._retreat(d, L, tp); return; }
            if (dec.act === 'land') { this._beginLanding(d, tp, dec.why); return; }
            const qk = quick * tiredK(d.stam, !!d.landSpot); // (tired and nowhere to sit: slower)
            // circle over them, a little above, then swoop and breathe
            d.orbit = (d.orbit ?? Math.random() * TAU) + dt * 0.35 * qk;
            const R = 16 * d.size;
            const dist = p.distanceTo(tp);
            // its fire ready and they are near: it swoops at them head first («лицом к цели»), not sideways from the circle
            const swoop = d.breathCd <= 0 && d.blind <= 0 && dist < flameReach(d.flame) * 1.4;
            // (fire not ready: a low pass with its talons — the dive)
            const dive = !swoop && d.diveCd <= 0 && !d.move && d.iceHeadT <= 0 && dist < 30 * d.size && d.stay > 2;
            if (swoop || dive) d.orbit = Math.atan2(p.z - tp.z, p.x - tp.x); // (the circle goes on from where it is)
            const goal = swoop ? _v3.set(tp.x + Math.cos(d.orbit) * 4 * d.size, tp.y + 7 * d.size, tp.z + Math.sin(d.orbit) * 4 * d.size)
                : dive ? _v3.set(tp.x + Math.cos(d.orbit) * 1.5 * d.size, tp.y + 1.6 * d.size, tp.z + Math.sin(d.orbit) * 1.5 * d.size)
                    : _v3.set(tp.x + Math.cos(d.orbit) * R, tp.y + 9 * d.size, tp.z + Math.sin(d.orbit) * R);
            this._flyTo(d, goal, DRAGON.FLY * qk * (dive ? 1.15 : 1), dt);
            if (dive && dist < 9 * d.size && !confusedMiss(d)) this._startMove(d, 'dive', 0);
            else if (dive && dist < 9 * d.size) d.diveCd = COOL.DIVE;
            // (in flight it breathes at them as it passes: its head turned down to them)
            if (!d.breath && d.breathCd <= 0 && d.blind <= 0 && d.iceHeadT <= 0 && dist < flameReach(d.flame) && confusedMiss(d)) d.breathCd = DRAGON.FLAME_REST; // (lost: no breath this pass)
            if (!d.breath && d.breathCd <= 0 && d.blind <= 0 && d.iceHeadT <= 0 && dist < flameReach(d.flame)) {
                const mouth = this._mouth(d, _v);
                const aim = _v2.copy(tp).add(_q.set(0, 0.6, 0)).sub(mouth).normalize();
                const fwd = _q.set(-Math.sin(d.model.rotation.y), 0, -Math.cos(d.model.rotation.y));
                if (aim.dot(fwd) > 0 && facesTarget(d.model.rotation.y, p.x, p.z, tp.x, tp.z, FACE.BREATH) && this.game.collision?.lineOfSight?.(mouth.x, mouth.y, mouth.z, tp.x, tp.y + 0.6, tp.z, 1.5) !== false) {
                    d.breath = { t: 0, dir: aim.clone(), aim: d.target };
                    d.breathCd = DRAGON.FLAME_REST + DRAGON.FLAME_TIME;
                    this.log.push('breath');
                }
            }
            return;
        }
        if (d.purpose === 'home' && L) {
            const fy = this._floorY(L);
            const goal = _v3.set(L.out.x, Math.max(fy + 7, this._skyFloor(L.out.x, L.out.z) + 6), L.out.z);
            if (this._flyTo(d, goal, DRAGON.FLY * quick, dt, false) < 8) { d.mode = 'enter'; d.enterStep = 0; }
            if (p.y < this._skyFloor(p.x, p.z) + 5 && Math.hypot(p.x - L.out.x, p.z - L.out.z) > 30) p.y += dt * 8; // (over the mountainside)
            return;
        }
        // cruising: high over the world from far away to far away (maybe landing on the way)
        if (!d.dest) { d.dest = p.clone().add(_v.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(WANDER.FAR * 2)); d.cruiseY = p.y; }
        if (d.landAt) {
            const gy = this._skyFloor(d.landAt.x, d.landAt.z, false);
            // (never down under a floating island: it flies on)
            if (this._skyFloor(d.landAt.x, d.landAt.z) > gy + 2) { d.landAt = null; return; }
            const hd = Math.hypot(p.x - d.landAt.x, p.z - d.landAt.z);
            const goal = _v3.set(d.landAt.x, hd < 30 ? gy : gy + 30, d.landAt.z);
            this._flyTo(d, goal, DRAGON.FLY * 0.8, dt, hd > 30);
            if (hd < 3 && p.y - gy < 1.5) {
                // (a dry spot under the open sky: else it flies on)
                if (this.game._flameBlock?.(p.x, gy + 0.6, p.z) === 'water') { d.landAt = null; return; }
                d.mode = 'landed'; d.fly = 0; d.landAt = null; d.restT = WANDER.REST[0] + Math.random() * (WANDER.REST[1] - WANDER.REST[0]);
                p.y = gy;
                d.vel.set(0, 0, 0);
                this.log.push('landed');
            }
            return;
        }
        d.cruiseY = Math.max(d.cruiseY || 0, this._skyFloor(p.x, p.z) + 35);
        this._flyTo(d, _v3.set(d.dest.x, d.cruiseY, d.dest.z), DRAGON.FLY * 0.9, dt);
        if (Math.hypot(p.x - d.dest.x, p.z - d.dest.z) < 20) {
            const near = this._nearest(p);
            if (!near || near.d > WANDER.GONE * 0.6) { d.gone = true; return; }
            d.dest = null;
        }
    }

    // ================================================================ the fighting mind (host; DragonMind.js has the table)
    /** (host, every frame) the clocks: how long in this posture, the cool-downs, the stamina, the move under way. */
    _mindTick(d, dt) {
        d.stay += dt;
        d.landFail = Math.max(0, d.landFail - dt); d.retreatT = Math.max(0, d.retreatT - dt);
        d.gustCd -= dt * d.react; d.roarCd -= dt; d.diveCd -= dt * d.react; d.smashT = Math.max(0, d.smashT - dt);
        d.stam = staminaStep(d.stam, d.fly > 0.5, d.mode === 'sleep', dt);
        if (d.move) this._moveTick(d, dt);
    }

    /** How high the target's feet are above the ground under it: 'ground' (it can sit down and fight) or 'high' (flying, on a tower, a roof, a deck, the sea). */
    _targetClass(tp) {
        const data = this.game.terrain?.data;
        const feet = tp.y - PLAYER_GROUND_OFFSET;
        const top = data?.heightAt ? data.heightAt(Math.round(tp.x), Math.round(tp.z)) - 0.5 : this.game.collision?.groundY?.(tp.x, tp.z) ?? feet;
        return targetClass(feet - top);
    }

    /** The posture's verdict, looked at 4 times a second (DragonMind.decide). `posture`: 'air' | 'ground'. */
    _decision(d, tp, L, posture, dt) {
        d.postT = (d.postT || 0) - dt;
        if (d.dec && d.postT > 0 && d.decFor === posture) return d.dec;
        d.postT = 0.25; d.decFor = posture;
        const p = d.model.position;
        let crowd = 1, canLand = false;
        if (tp) {
            crowd = 0;
            for (const q of this._players()) if (Math.hypot(q.p.x - tp.x, q.p.z - tp.z) <= MIND.CROWD_R) crowd++;
            if (posture === 'air') canLand = !!this._landingFor(d, tp);
        }
        d.dec = decide({ posture, stay: d.stay, dist: tp ? Math.hypot(tp.x - p.x, tp.z - p.z) : null, cls: tp ? this._targetClass(tp) : 'ground', hp: d.hp / DRAGON_HP, stam: d.stam, crowd, canLand, failT: d.landFail, cornered: d.cornered });
        return d.dec;
    }

    /** (host) Hurt: it flies away (to its lair, or far off) and keeps away a while; once — then it fights to the end. */
    _retreat(d, L, tp) {
        d.cornered = true;
        d.retreatT = MIND.RETREAT_T[0] + Math.random() * (MIND.RETREAT_T[1] - MIND.RETREAT_T[0]);
        const p = d.model.position;
        const away = tp ? _v.set(p.x - tp.x, 0, p.z - tp.z) : _v.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        if (away.lengthSq() < 1e-3) away.set(1, 0, 0);
        away.normalize();
        d.target = null; d.aggro = null; d.breath = null; d.move = null; d.landSpot = null; d.dec = null;
        if (d.fly < 0.3) this._takeOff(d, L ? 'home' : 'cruise'); else { d.mode = 'air'; d.purpose = L ? 'home' : 'cruise'; }
        if (!L) { d.dest = p.clone().addScaledVector(away, WANDER.FAR * 2); d.cruiseY = p.y + 20; }
        this.log.push('retreat');
        this._bellow(d);
    }

    // ---- landing
    /** A place to come down near the target (cached a few seconds): {x, y, z} or null. Never makes land in a frame; never water, a roof, a tree-top, a steep slope, under cover. */
    _landingFor(d, tp) {
        if (d.landFor && this._t - d.landCheckT < 3 && Math.hypot(tp.x - d.landFor.x, tp.z - d.landFor.z) < 12) return d.landSpot;
        d.landCheckT = this._t;
        d.landFor = { x: tp.x, z: tp.z };
        d.landSpot = this._findLanding(d, tp);
        return d.landSpot;
    }

    _findLanding(d, tp) {
        const g = this.game, data = g.terrain?.data, col = g.collision, p = d.model.position;
        if (!data?.heightAt || !col?.groundAt) return null;
        const H = (x, z) => data.heightAt(Math.round(x), Math.round(z)) - 0.5;
        const from = Math.atan2(p.z - tp.z, p.x - tp.x);
        for (const c of landCandidates(from, d.size)) {
            const x = tp.x + Math.cos(c.a) * c.r, z = tp.z + Math.sin(c.a) * c.r;
            if (data.landMade && !data.landMade(Math.round(x), Math.round(z))) continue; // (the land is not made there yet: never make it in a frame)
            const terrain = H(x, z), surface = col.groundAt(x, z, terrain + 45);
            if (surface == null) continue;
            const hs = [H(x + 5, z), H(x - 5, z), H(x, z + 5), H(x, z - 5)];
            const slope = Math.max(terrain, ...hs) - Math.min(terrain, ...hs);
            const water = g._flameBlock?.(x, surface + 0.6, z) === 'water' || g._flameBlock?.(x, surface - 0.4, z) === 'water';
            const open = col.lineOfSight ? col.lineOfSight(x, surface + 26, z, x, surface + 1.5, z, 1.5) !== false : true;
            if (spotOk({ made: true, water, terrain, surface, slope, open, toTarget: Math.hypot(x - tp.x, z - tp.z) })) return { x, y: surface, z };
        }
        return null;
    }

    _beginLanding(d, tp, why) {
        const spot = this._landingFor(d, tp);
        if (!spot) { d.landFail = MIND.LAND_FAIL; return; }
        d.mode = 'land'; d.landT = 0; d.stay = 0; d.highT = 0; d.breath = null; d.dec = null;
        this.log.push('land:' + why);
    }

    /** (host) Coming down on the place by its target: a gliding approach, a flare with the wings beating hard, the touchdown. */
    _landStep(d, tp, dt, quick, L) {
        const p = d.model.position, s = d.size;
        d.landT += dt;
        d.fly = Math.min(1, d.fly + dt * 1.5); d.spread = 1;
        const giveUp = (why) => { d.mode = 'air'; d.purpose = tp ? 'chase' : (L ? 'home' : 'cruise'); d.landFail = MIND.LAND_FAIL; d.stay = 0; d.landSpot = null; this.log.push('land-abort:' + why); };
        if (!tp) { d.target = null; giveUp('lost'); this._goHome(d, L); return; }
        if (d.landT > MIND.LAND_TIMEOUT) return giveUp('timeout');
        if (this._targetClass(tp) === 'high') { d.highT += dt; if (d.highT > 1.5) return giveUp('high'); } else d.highT = 0;
        const spot = this._landingFor(d, tp);
        if (!spot) return giveUp('nowhere');
        const hd = Math.hypot(p.x - spot.x, p.z - spot.z);
        d.spread = 1;
        if (hd > 9) {
            // the glide: lower as it nears, never under the ground in front of it
            const goal = _v3.set(spot.x, spot.y + Math.min(30 * s, hd * 0.5), spot.z);
            this._flyTo(d, goal, DRAGON.FLY * quick * (hd < 25 ? 0.6 : 0.9), dt, hd > 30);
        } else {
            // the flare: slow, nose up, wings beating, set down on the spot — facing the target
            const sink = Math.max(1.4, (p.y - spot.y) * 1.2);
            p.y = Math.max(spot.y, p.y - sink * dt);
            const k = Math.min(1, dt * 1.6), dx = spot.x - p.x, dz = spot.z - p.z;
            p.x += dx * k; p.z += dz * k;
            d.vel.set(dx * k / dt, -sink, dz * k / dt);
            this._lookAt(d, tp, dt * 1.3);
            d.model.rotation.x = -0.3 * Math.min(1, (p.y - spot.y) / 6); // (nose up as it flares)
            if (p.y - spot.y < 0.15) { this._touchdown(d, spot, tp); return; }
        }
        d.flapRate = hd < 9 ? 7 : 3.4;
    }

    /** It is down: dust, a shock wave through the creatures, the players near it hurt and flung, the roar. */
    _touchdown(d, spot, tp) {
        const p = d.model.position, s = d.size;
        p.set(spot.x, spot.y, spot.z);
        d.mode = 'fight'; d.fly = 0; d.vel.set(0, 0, 0); d.stay = 0; d.landSpot = null; d.dec = null; d.stuckT = 0; d.stuckDist = 1e9; d.flapRate = 0;
        d.model.rotation.x = 0; d.model.rotation.z = 0; d.bank = 0;
        d.blowCd = Math.max(d.blowCd, 0.6); // (it has to find its feet)
        d.wantRoar = Math.random() < 0.7; d.roarCd = Math.min(d.roarCd, 0);
        this._landFx(d);
        // the wave: the creatures round it (CreatureImpact), the players (their own computer counts the hurt)
        this._wash(d, LANDING.R * s, LANDING.PUSH, { toss: LANDING.TOSS, down: 2.6 });
        const from = dragonCenter(d, new THREE.Vector3());
        for (const q of this._players()) {
            if (d.tame && q.id === d.tame.by) continue;
            const dx = q.p.x - p.x, dz = q.p.z - p.z, dist = Math.hypot(dx, dz);
            if (dist > LANDING.R * s * 0.55 || q.p.y - p.y > 6 * s) continue;
            const v = new THREE.Vector3(dx, 0, dz);
            if (v.lengthSq() < 1e-3) v.set(1, 0, 0);
            v.normalize().multiplyScalar(waveAt(dist, s, 1)).setY(LANDING.TOSS + 1);
            this._hurt(q.id, LANDING.DMG, 'quake', from, v);
        }
        this.game.castleLife?.alarm?.(p.clone(), 'monster', null, 40);
        this.log.push('touchdown');
    }

    /** (every computer) The look and the sound of a landing: a thud, a ring of dust, the ground shaking under me. */
    _landFx(d) {
        const g = this.game, p = d.model.position, s = d.size;
        d.landCrouch = 1;
        g.sound?.playDragon?.(p, 'land', 1.2);
        this._dust(p, 46, 7 * s, 1.0);
        const me = g.character?.group.position;
        if (me && g.fx) { const k = 1 - Math.hypot(me.x - p.x, me.z - p.z) / (60 * s); if (k > 0) g.fx.shake = Math.max(g.fx.shake || 0, 0.7 * k); }
    }

    /** Dust kicked up round `at` (a ring of soft brown sparks). */
    _dust(at, n, radius, up) {
        const fx = this.game.fx;
        if (!fx?.spark) return;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, r = radius * (0.4 + Math.random() * 0.6);
            _v2.set(Math.cos(a) * r * 0.9, up * (1 + Math.random() * 2.2), Math.sin(a) * r * 0.9);
            _v3.set(at.x + Math.cos(a) * r * 0.25, at.y + 0.4, at.z + Math.sin(a) * r * 0.25);
            fx.spark(_v3, i % 3 ? 0x9a8a72 : 0xb8a888, 0.5 + Math.random() * 0.6, _v2, 1.1 + Math.random() * 0.8);
        }
    }

    /** (host) A gust of its wings / a landing's wave through the creatures round it (CreatureImpact: shoved, tossed, maybe knocked down). `opts.cone`: only in front (rad). */
    _wash(d, R, power, opts = {}) {
        const g = this.game;
        if (!this.auth || !g.creatureImpact?.spellArea) return;
        const p = d.model.position, ry = d.model.rotation.y, fx = -Math.sin(ry), fz = -Math.cos(ry);
        g.creatureImpact.spellArea('DragonSmash', null, (c) => {
            const dx = c.x - p.x, dz = c.z - p.z, dist = Math.hypot(dx, dz);
            if (dist > R || dist < 0.01) return null;
            if (opts.cone && (dx * fx + dz * fz) / dist < Math.cos(opts.cone)) return null;
            if (c.y - p.y > R * 0.6) return null;
            const w = power * (1 - dist / R * 0.7);
            return opts.cone ? new THREE.Vector3(fx * w, 0, fz * w) : new THREE.Vector3(dx / dist * w, 0, dz / dist * w);
        }, { from: p.clone(), toss: opts.toss ?? 3, down: opts.down ?? 2.4, skip: (c) => c === d });
    }

    // ---- take-off
    /** (host) The run-up: a crouch, the wings spread and beating, a short hop forward, the climb. Ends in the air. */
    _lift(d, tp, dt) {
        const prev = d.liftT;
        d.liftT += dt;
        const ph = liftPhase(d.liftT), p = d.model.position, ry = d.model.rotation.y, s = d.size / 1.25;
        const fx = -Math.sin(ry), fz = -Math.cos(ry);
        d.spread = ph.spread; d.flapRate = ph.flap;
        if (tp) this._lookAt(d, tp, dt * 0.6);
        if (prev < 0.45 && d.liftT >= 0.45) this._wash(d, 12 * d.size, 6, { toss: 2, down: 3 }); // (the first down-stroke: dust and wind)
        p.y += 15 * s * ph.climb * dt; p.x += fx * 4 * ph.climb * dt; p.z += fz * 4 * ph.climb * dt;
        d.fly = Math.max(d.fly, Math.min(1, ph.climb * 1.3));
        if (d.liftT >= MIND.LIFT_T) { d.liftT = 0; d.fly = 1; d.vel.set(fx * 9, 8 * s, fz * 9); d.flapRate = 0; }
    }

    // ---- the moves
    /** (host) Begins a move: it winds up (`moveAnim` shows it), the blow lands at MOVES[kind].hit (`_strike`). */
    _startMove(d, kind, ang = 0) {
        const M = MOVES[kind];
        d.moveId = ((d.moveId || 0) + 1) % 1000;
        d.move = { kind, t: 0, side: ang >= 0 ? 1 : -1, id: d.moveId, snd: false };
        d.lastMove = kind;
        if (kind === 'claw') d.clawLeg = ang >= 0 ? 0 : 1; // (the model's left fore leg is legs[0])
        if (kind === 'bite' || kind === 'claw' || kind === 'tail') d.blowCd = DRAGON.BLOW_REST;
        if (kind === 'gust') d.gustCd = COOL.GUST;
        if (kind === 'roar') { d.roarCd = COOL.ROAR; d.wantRoar = false; this.game.castleLife?.alarm?.(d.model.position.clone(), 'monster', null, 45); } // (it frightens the people)
        if (kind === 'dive') d.diveCd = COOL.DIVE;
        if (kind === 'tail') this._smashOn(d, M.end); // (the tail breaks what it sweeps through — DragonSmash)
        this._sendSoon = true;
        this.log.push('move:' + kind);
    }

    _moveTick(d, dt) {
        const m = d.move, M = MOVES[m.kind], prev = m.t;
        m.t += dt;
        for (let n = strikesDue(m.kind, prev, m.t); n > 0; n--) this._strike(d, m);
        if (m.t >= M.end) d.move = null;
    }

    /** (host) The blow lands: who is where NOW (a step aside dodges it). Players are hurt by their own computers; the creatures by DragonSmash / `_wash`. */
    _strike(d, m) {
        const M = MOVES[m.kind], s = d.size, p = d.model.position, ry = d.model.rotation.y;
        const from = dragonCenter(d, new THREE.Vector3());
        if (m.kind === 'gust') this._wash(d, MOVES.gust.reach * s, M.push, { cone: MOVES.gust.face, toss: 3, down: 2.8 });
        let n = 0;
        for (const q of this._players()) {
            if (d.tame && q.id === d.tame.by) continue; // (the one it is calmed to is never hurt)
            const dx = q.p.x - p.x, dz = q.p.z - p.z, dist = Math.hypot(dx, dz), ang = this._angleTo(d, q.p);
            if (q.p.y - p.y > (m.kind === 'gust' ? 12 : 7) * s) continue; // (too high above it: out of reach)
            let ok = false;
            if (m.kind === 'bite' || m.kind === 'claw') ok = q.id === d.target && aimedAt(m.kind, ang, dist, s);
            else if (m.kind === 'tail' || m.kind === 'gust') ok = aimedAt(m.kind, ang, dist, s);
            else if (m.kind === 'dive') ok = q.id === d.target && p.distanceTo(q.p) < M.reach * s + 2.5;
            if (!ok) continue;
            const v = new THREE.Vector3(dx, 0, dz);
            if (m.kind === 'gust') v.set(-Math.sin(ry), 0, -Math.cos(ry)); else if (v.lengthSq() < 1e-3) v.set(-Math.sin(ry), 0, -Math.cos(ry));
            v.normalize().multiplyScalar(M.push).setY(M.up);
            this._hurt(q.id, M.dmg, M.kind, from, v);
            n++;
        }
        this.log.push(m.kind + (n ? '' : '-miss'));
    }

    /** (host) The tail / wings / body strike through DragonSmash (blocks, ships, trees, creatures) for the next `t` s. */
    _smashOn(d, t) {
        if (d.smashT <= 0) this.smash?.forget(d.id); // (a fresh look: the parts' old places are no «speed»)
        d.smashT = Math.max(d.smashT, t);
    }

    /** (every computer) Sound of a move at its moment, once (the host plays what it starts; the guests what the host's state shows). */
    _moveSound(d) {
        const m = d.move;
        if (!m || m.snd) return;
        const M = MOVES[m.kind];
        if (m.t < M.snd) return;
        m.snd = true;
        const g = this.game, p = d.model.position;
        const me = g.character?.group.position;
        if (me && me.distanceTo(p) > 170) return;
        switch (m.kind) {
            case 'bite': g.sound?.playDragon?.(p, 'bite', 1); break;
            case 'claw': case 'dive': g.sound?.playDragon?.(p, 'claw', 0.9); break;
            case 'tail': g.sound?.playDragon?.(p, 'tail', 1); break;
            case 'gust': g.sound?.playDragon?.(p, 'wing', 1.2); this._dust(p, 18, 6 * d.size, 0.8); break;
            case 'roar': g.sound?.playDragon?.(p, 'roar', 1.1); d.mouthT = 1.2; break;
            default: break;
        }
    }

    /** (host) A roar (a retreat, a wake): the sound and the people's fear. */
    _bellow(d) {
        this.game.sound?.playDragon?.(d.model.position, 'roar', 1.1);
        d.mouthT = 1.2;
        this.game.castleLife?.alarm?.(d.model.position.clone(), 'monster', null, 45);
    }

    /** On its feet in the open: the posture's verdict, the walk, the moves. → how much it walks (0–1). */
    _fightStep(d, tp, dt, quick, L) {
        if (!tp) { d.target = null; d.aggro = null; this._goHome(d, L); return 0; }
        const p = d.model.position, s = d.size;
        const far = L ? Math.hypot(tp.x - L.x, tp.z - L.z) > DRAGON.GIVE_UP : (d.chaseFrom && tp.distanceTo(d.chaseFrom) > DRAGON.GIVE_UP);
        if (far) { d.target = null; d.aggro = null; d.breath = null; this._goHome(d, L); return 0; }
        const dec = this._decision(d, tp, L, 'ground', dt);
        if (dec.act === 'retreat') { this._retreat(d, L, tp); return 0; }
        if (dec.act === 'takeoff' && !d.move) { this._takeOff(d, 'chase'); this.log.push('takeoff-why:' + dec.why); return 0; }
        const dist = Math.hypot(tp.x - p.x, tp.z - p.z);
        const walk = this._groundChase(d, tp, dt, quick, null);
        // (stuck behind a rock / a wall / a cliff: it takes off over it)
        if (walk > 0 && dist > 8 * s) {
            if (dist < d.stuckDist - 1) { d.stuckDist = dist; d.stuckT = 0; }
            else if ((d.stuckT += dt) > MIND.STUCK_T) { d.landFail = MIND.LAND_FAIL * 1.5; this._takeOff(d, 'chase'); this.log.push('stuck'); return 0; }
        } else { d.stuckT = 0; d.stuckDist = dist; }
        return walk;
    }

    _mouth(d, out) {
        const m = d.model;
        m.updateMatrixWorld(true);
        return m.userData.jaw.getWorldPosition(out).add(_q.set(-Math.sin(m.rotation.y), 0, -Math.cos(m.rotation.y)).multiplyScalar(1.6 * d.size));
    }

    // ================================================================ fire
    /** Its breath this frame (every computer: the look, its own player; the host: the creatures, the world). */
    _breathe(d, dt) {
        const b = d.breath;
        if (!b) return;
        const g = this.game;
        b.t += dt;
        if (b.t > DRAGON.FLAME_TIME || d.dead || d.stun > 0) { d.breath = null; return; }
        d.mouthT = 0.3;
        const o = this._mouth(d, _v3.clone());
        // (host) it keeps it on its target, sweeping a little side to side
        if (this.auth && b.aim) {
            const tp = this._playerPos(b.aim);
            // (the neck turns the head only so far: a target gone round behind it is not followed by the flame)
            if (tp && facingError(d.model.rotation.y, d.model.position.x, d.model.position.z, tp.x, tp.z) < 1.2) {
                const want = _v.copy(tp).add(_q.set(0, 0.6, 0)).sub(o).normalize();
                b.dir.lerp(want, Math.min(1, dt * 1.6 * d.react)).normalize();
            }
            const sw = Math.sin(b.t * 2.6) * 0.012;
            b.dir.applyAxisAngle(_q.set(0, 1, 0), sw).normalize();
        }
        const dir = b.dir;
        // how far it reaches: water stops it (steam), stone and walls stop it, a house's sphere too
        const reach = flameReach(d.flame) * (b.k ?? 1); // («Империус Максима»: as big as the caster's «У» — DragonHowl.flameSize)
        b.stopT = (b.stopT || 0) - dt;
        if (b.stopT <= 0 || b.len == null) {
            b.stopT = 0.1;
            let len = reach, by = null;
            for (const s of g._flameWaters?.() || []) {
                const t = raySphere(o, dir, s, s.r, len);
                if (t != null && t < len) { len = t; by = 'water'; }
            }
            for (let s = 1.5; s < len; s += 1) {
                const k = g._flameBlock?.(o.x + dir.x * s, o.y + dir.y * s, o.z + dir.z * s);
                if (k === 'water' || k === 'solid') { len = s; by = k; break; }
            }
            len = g.wards?.clipRay?.(o, dir, len) ?? len;
            b.len = len; b.by = by;
        }
        this._drawFlame(d, o, dir, b.len, dt, b.k ?? 1);
        if (b.by === 'water' && Math.random() < dt * 20) g.fx?.spark(_v.copy(o).addScaledVector(dir, b.len), 0xe8eef2, 0.3, _v2.set((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.9);
        // my player in it (every computer: its own)
        const c = g.combat;
        d.meT -= dt;
        if (c && !c.dead && !g.isDeadLocal && d.meT <= 0 && g.dragonRide?.riding?.id !== d.id && !d.imp?.mine) { // (a rider on its back is never in its flame)
            const me = c.center ? c.center(_v) : _v.copy(g.character.group.position);
            if (inFlame(o, dir, b.len, me, 0.45)) {
                d.meT = DRAGON.FLAME_TICK;
                if (c.shieldFactor?.(o) >= 1) c._blocked?.(o, 'dragonFire'); // (a «Protection» facing the fire holds it — a beast's fire, not a spell: no mana)
                else this._hurtMe(Math.round(DRAGON.FLAME_PLAYER * d.flame * 10) / 10, 'fire', o, null);
            }
        }
        // (host) the creatures and the world: what any fire burns (Game._burnRay: trees, people,
        // animals, ships, paper, living trees, book-birds…); zombies; other dragons — not at all
        if (this.auth && !b.ride) { // (an ordered fire burns only the one named, whoever stands in it — no villagers, trees, ships: the dragon is no weapon)
            d.burnT -= dt;
            if (d.burnT <= 0) {
                d.burnT = 0.25 / Math.max(0.5, d.flame);
                this._flameOf = d;
                g._burnRay?.(o, dir, b.len, null); // (the people blame the dragon, not its master: Imperius is a servant's family — only a seen cast names the master)
                this._flameOf = null;
                // (a mind in it: the flame sets alight whom it touches — people, beasts, sailors, zombies — DragonImperius.FLAME_TARGETS)
                if (b.imp) g.burning?.igniteRay?.(o, dir, b.len, 0.7 + 0.085 * b.len, null);
                for (const z of g.zombies || []) {
                    if (z.isDead) continue;
                    _v.copy(z.group.position); _v.y += 1;
                    if (inFlame(o, dir, b.len, _v, 0.6)) g.damageZombie?.(z, 2 * d.flame, false, dir.clone(), 'dragon');
                }
            }
        }
    }

    _drawFlame(d, o, dir, len, dt, k = 1) {
        const fx = this.game.fx;
        if (!fx?.glow) return;
        const cols = DRAGON_KINDS[d.kind].fire;
        const V = 26, life = Math.max(0.08, len / V);
        const right = _q.crossVectors(dir, UP);
        if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
        right.normalize();
        const up = _v2.crossVectors(right, dir).normalize();
        d.fAcc = (d.fAcc || 0) + dt * 240;
        let n = Math.min(14, Math.floor(d.fAcc));
        d.fAcc -= n;
        for (; n > 0; n--) {
            const a = Math.random() * TAU, k = Math.random();
            const lat = 0.17 * V * (0.4 + Math.random() * 0.8) * Math.sqrt(k); // (a bigger «У»: a wider flame)
            const ca = Math.cos(a), sa = Math.sin(a);
            const sp = V * (0.9 + Math.random() * 0.2);
            const col = k < 0.15 ? cols[0] : k < 0.6 ? cols[1] : cols[2];
            fx.glow.spawn(o.x, o.y, o.z,
                dir.x * sp + (right.x * ca + up.x * sa) * lat, dir.y * sp + (right.y * ca + up.y * sa) * lat + 0.8, dir.z * sp + (right.z * ca + up.z * sa) * lat,
                col, (0.45 + Math.random() * 0.5) * d.size * Math.sqrt(k), life * (0.7 + Math.random() * 0.3), { shrink: -1.8, spin: 6 });
        }
    }

    // ================================================================ the look
    _animate(d, dt, walk) {
        d.walk += ((walk || 0) - d.walk) * Math.min(1, dt * 5);
        const target = d.mode === 'sleep' ? 1 : 0;
        d.sleep += (target - d.sleep) * Math.min(1, dt * 1.2);
        d.mouth += (((d.breath || d.mouthT > 0) ? 1 : 0) - d.mouth) * Math.min(1, dt * 8);
        d.lowerT = Math.max(0, (d.lowerT || 0) - dt);
        d.sweepT = Math.max(0, (d.sweepT || 0) - dt);
        d.lower += ((d.lowerT > 0 ? 1 : 0) - d.lower) * Math.min(1, dt * 8);
        d.sweep += ((d.sweepT > 0 ? Math.sign(d.look || 1) * 1 : 0) - d.sweep) * Math.min(1, dt * 7);
        if (d.mode !== 'air' && d.mode !== 'land' && !(d.liftT > 0)) d.spread = Math.max(0, d.spread - dt * 0.7);
        d.look *= Math.max(0, 1 - dt * 0.5);
        // the guests: the move and the take-off run on here from what the host last said (the host runs them in `_mindTick` / `_lift`)
        if (!this.auth) {
            if (d.move) { d.move.t += dt; if (d.move.t > MOVES[d.move.kind].end + 0.3) d.move = null; }
            if (d.liftT > 0) d.liftT = Math.min(MIND.LIFT_T, d.liftT + dt);
        }
        this._moveSound(d);
        // a move on its feet (DragonMind.moveAnim), the squat of a take-off / landing
        const ma = d.move ? moveAnim(d.move.kind, d.move.t, d.move.side) : null;
        const lp = d.liftT > 0 ? liftPhase(d.liftT) : null;
        d.landCrouch = Math.max(0, d.landCrouch - dt * 2.2);
        const crouch = lp ? lp.crouch : d.landCrouch;
        if (lp && d.liftT < 1.0) { // (dust under the beating wings, the wing-beats' sound)
            d.dustT = (d.dustT || 0) - dt;
            if (d.dustT <= 0 && d.liftT > 0.35) { d.dustT = 0.1; this._dust(d.model.position, 7, 6 * d.size, 1.2); }
        }
        this._sounds(d, dt, lp);
        poseDragon(d.model, { t: d.t, walk: d.walk, fly: d.fly, flap: lp ? lp.flap : d.flapRate || (3.2 + (d.vel.y > 0.5 ? 2 : 0)), mouth: Math.max(d.mouth, ma?.mouth || 0), look: d.look, lower: Math.max(d.lower, ma?.lower || 0), sleep: d.sleep,
            sweep: ma && ma.sweep ? ma.sweep : d.sweep, spread: lp ? Math.max(d.spread, lp.spread) : d.spread,
            lunge: ma?.lunge || 0, claw: ma?.claw || 0, clawLeg: d.clawLeg, rise: ma?.rise || 0, crouch, wingFlare: ma?.wingFlare || 0, beat: ma?.beat || 0 });
        // banking into its turns in the air, nose up as it climbs
        d.model.rotation.z = (d.bank || 0) * d.fly;
        // («Империус Максима»: the nose follows its path — down in a dive, as the hero's head is bowed)
        if (d.imp) d.model.rotation.x = Math.max(-0.75, Math.min(0.5, Math.atan2(d.vel.y, Math.max(4, Math.hypot(d.vel.x, d.vel.z))))) * d.fly;
        else d.model.rotation.x = Math.max(-0.3, Math.min(0.3, d.vel.y * 0.03)) * d.fly;
        d.bank = (d.bank || 0) * Math.max(0, 1 - dt * 2);
    }

    /** (every computer) Footfalls on the ground, the slow wing-beats in the air — near me only. */
    _sounds(d, dt, lp) {
        const g = this.game, p = d.model.position, me = g.character?.group.position;
        if (!me || d.dead || d.mode === 'sleep') return;
        const near = Math.abs(me.x - p.x) < 150 && Math.abs(me.z - p.z) < 150;
        if (d.walk > 0.3 && d.fly < 0.2 && d.mode !== 'ride') {
            d.stepT -= dt * (0.5 + d.walk);
            if (d.stepT <= 0) {
                d.stepT = 0.63 * 1.5 / Math.max(0.8, d.react);
                if (near) { g.sound?.playDragon?.(p, 'step', 0.9); const k = 1 - me.distanceTo(p) / 45; if (k > 0 && g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.12 * k); }
            }
        } else d.stepT = Math.min(d.stepT, 0.1);
        if (lp ? d.liftT > 0.3 : d.fly > 0.6 && d.mode !== 'ride') {
            d.wingT -= dt;
            if (d.wingT <= 0) { d.wingT = lp ? 0.45 : 2 * Math.PI / (d.flapRate || 3.4); if (near) g.sound?.playDragon?.(p, 'wing', lp ? 1.1 : 0.55); }
        } else d.wingT = 0;
    }

    /** Its shadow on the ground under it in the air (a soft dark patch). */
    _shadow(d) {
        const s = d.shadow, p = d.model.position;
        if (d.fly < 0.2 || d.dead) { s.visible = false; return; }
        const H = this.game.terrain?.data?.heightAt;
        const gy = H ? H(Math.round(p.x), Math.round(p.z)) - 0.5 : this.game.collision?.groundY?.(p.x, p.z) ?? 0;
        const h = p.y - gy;
        if (h < 1 || h > 160) { s.visible = false; return; }
        s.visible = true;
        s.position.set(p.x, gy + 0.08, p.z);
        s.scale.setScalar(6 * d.size * (1 + h / 120));
        s.material.opacity = 0.34 * Math.max(0.25, 1 - h / 160);
    }

    // ================================================================ frame
    update(dt) {
        if (!this.enabled) return;
        const g = this.game;
        this._t += dt;
        this._lairT -= dt;
        if (this._lairT <= 0) { this._lairT = 1; this._updateLairs(); if (this.auth) this._watchHoard(); }
        for (const d of this.list) if (d.one && (d.oneT += dt) > 0.5) { d.oneT = 0; d.one.check(); } // (a part repainted / hidden by the game: the one shape follows)
        if (this.auth) {
            this._wanderers(dt);
            for (const d of [...this.list]) {
                if (d.dead) {
                    d.deadT += dt;
                    // (it falls out of the sky; lies; is gone after a while)
                    const gy = g.collision?.groundAt ? g.collision.groundAt(d.model.position.x, d.model.position.z, d.model.position.y + 1) : 0;
                    d.model.position.y = Math.max(gy, d.model.position.y - dt * 14);
                    d.model.rotation.z += (Math.PI / 2 - d.model.rotation.z) * Math.min(1, dt * 2);
                    if (d.deadT > 40) this._remove(d);
                    continue;
                }
                if (d.imp && g.imperius?.step('D', d, dt)) continue; // («Империус Максима»: a mind in it — ImperiusControl.step)
                this._think(d, dt);
                if (d.gone) { this._remove(d); continue; }
                // a wanderer far from everybody is gone
                if (!d.lair && (this._nearest(d.model.position)?.d ?? Infinity) > WANDER.GONE) { this._remove(d); continue; }
                if (d.lair) { const st = this.state[d.lair]; if (st?.d[d.slot]) st.d[d.slot].hp = d.hp; }
            }
        } else {
            for (const d of this.list) {
                if (g.dragonRide?.riding === d) { d.t += dt; this._animate(d, dt, d.rideWalk); continue; } // (I fly it: my computer says where it is)
                if (d.imp?.mine && !d.dead && g.imperius?.step('D', d, dt)) continue; // (my mind is in it: my computer flies it)
                if (d.net) { d.model.position.lerp(d.net, Math.min(1, dt * 6)); d.model.rotation.y += wrap(d.netYaw - d.model.rotation.y) * Math.min(1, dt * 6); }
                d.t += dt;
                if (d.dead) { d.model.rotation.z += (Math.PI / 2 - d.model.rotation.z) * Math.min(1, dt * 2); continue; }
                this._animate(d, dt, d.netWalk || 0);
            }
        }
        for (const d of this.list) { this._breathe(d, dt); this._shadow(d); if (this.auth && (d.imp || d.smashT > 0)) this.smash.update(d, dt); }
        this._pushMeOut();
        this._updateHands(dt);
        this._bar();
        this._netSend(dt);
    }

    /** My body never walks into a dragon (it is solid): pushed out of its body. */
    _pushMeOut() {
        const g = this.game, p = g.character?.group.position;
        if (!p) return;
        for (const d of this.list) {
            if (d.dead || d.fly > 0.5 || g.dragonRide?.riding === d) continue;
            const b = dragonBody(d, _c);
            const ab = _v2.subVectors(b.b, b.a);
            const t = Math.max(0, Math.min(1, _v.subVectors(p, b.a).dot(ab) / ab.lengthSq()));
            const q = _v.copy(b.a).addScaledVector(ab, t);
            if (p.y > q.y + b.r + 1 || p.y < q.y - b.r - 2.5) continue;
            const dx = p.x - q.x, dz = p.z - q.z, dd = Math.hypot(dx, dz), R = b.r + 0.45;
            if (dd < R && dd > 1e-3) { p.x = q.x + dx / dd * R; p.z = q.z + dz / dd * R; }
        }
    }

    _bar() {
        if (!this._hud) return;
        const me = this.game.character?.group.position;
        const d = me && this.list.find((x) => !x.dead && x.mode !== 'sleep' && (x.target || x.mode === 'landed' || x.hp < DRAGON_HP) && x.model.position.distanceTo(me) < 120);
        this._hud.style.display = d ? 'block' : 'none';
        if (d) {
            if (this._barOf !== d.id) { this._barOf = d.id; this._hud.querySelector('.boss-name').textContent = '🐉 ' + DRAGON_KINDS[d.kind].name; }
            this._hud.querySelector('.boss-fill').style.width = (100 * d.hp / DRAGON_HP).toFixed(1) + '%';
        }
    }

    // ================================================================ network
    _netSend(dt) {
        const g = this.game;
        if (!this.auth || !g.sync) return;
        this._netT -= dt;
        if (this._netT > 0 && !this._sendSoon) return;
        this._sendSoon = false;
        this._netT = this.list.length ? 0.1 : 1;
        const l = this.list.map((d) => {
            const p = d.model.position, b = d.breath;
            return [d.id, KIND_IDS.indexOf(d.kind), r2(p.x), r2(p.y), r2(p.z), r2(d.model.rotation.y), Math.round(d.hp), STATES.indexOf(d.mode), b ? 1 : 0,
                b ? r2(b.dir.x) : 0, b ? r2(b.dir.y) : 0, b ? r2(b.dir.z) : 0, Math.round(d.fly * 100), d.lair || 0, d.slot || 0, r2(d.flame), r2(d.react), Math.round(d.walk * 10),
                d.move ? d.move.id : 0, d.move ? MOVE_IDS.indexOf(d.move.kind) + 1 : 0, d.move ? Math.round(d.move.t * 100) : 0, (d.move && d.move.side > 0 ? 1 : 0) | (d.clawLeg << 1), Math.round(d.liftT * 100)];
        });
        const h = [];
        for (const [id, e] of this.lairs) if (this.state[id]) h.push([id, this.state[id].loose]);
        g.sync.dragon?.({ e: 's', l, h });
    }

    /** (from NetSync) a `drg` message; `from`: who sent it (the host sees the guest's id). */
    onNet(m, from) {
        const g = this.game;
        switch (m.e) {
            case 's': if (!this.auth) this._applyState(m); break;
            case 'hit': if (this.auth) { const d = this.byId(m.id); if (d) this.hit(d, Math.min(200, +m.dmg || 0), m.kind, m.by || from); } break;
            case 'tame': if (this.auth) { const d = this.byId(m.id); if (d) { const v = this.tame(d, from); g.sync?.dragon?.({ e: 'tamed', id: m.id, to: from, ok: v.ok ? 1 : 0, say: v.say || '', code: v.code || '' }); } } break;
            case 'tamed': if (m.to === this.me) g.dragonRide?.onTamed?.(this.byId(m.id), { ok: !!m.ok, say: m.say, code: m.code }); break;
            case 'mount': if (this.auth) { const d = this.byId(m.id); const r = d ? this.mount(d, from) : { ok: false }; g.sync?.dragon?.({ e: 'mounted', id: m.id, to: from, ok: r.ok ? 1 : 0, say: r.say || '' }); } break;
            case 'mounted': if (m.to === this.me) g.dragonRide?.onMounted?.(this.byId(m.id), { ok: !!m.ok, say: m.say }); break;
            case 'dismount': if (this.auth) { const d = this.byId(m.id); if (d) this.dismounted(d, from); } break;
            case 'release': if (this.auth) { const d = this.byId(m.id); if (d) this.release(d, from); } break;
            case 'order': if (this.auth) { const d = this.byId(m.id); if (d) { const r = this.order(d, from, m.target); g.sync?.dragon?.({ e: 'ordered', id: m.id, to: from, ok: r.ok ? 1 : 0, say: r.say || '' }); } } break;
            case 'ordered': if (m.to === this.me) g.dragonRide?.onOrdered?.({ ok: !!m.ok, say: m.say }); break;
            case 'untame': if (m.to === this.me) g.dragonRide?.onBroken?.(this.byId(m.id), m.why); break;
            case 'ride': if (this.auth) this._rideMsg(this.byId(m.id), m, from); break;
            case 'hurt': if (m.to === this.me) this._hurtMe(Math.min(40, +m.dmg || 0), m.kind, vec(m.f), m.v ? vec(m.v) : null); break;
            case 'scoop': if (this.auth) { const n = this._take(m.lair, Math.min(HANDFUL.MAX, +m.n || 0), from); g.sync?.dragon?.({ e: 'got', to: from, side: m.side, n }); } break;
            case 'got': if (m.to === this.me && (m.side === 'right' || m.side === 'left')) this._handful(m.side, +m.n || 0); break;
            case 'back': if (this.auth) { const st = this.state[m.lair]; if (st) { st.loose += Math.min(HANDFUL.MAX, +m.n || 0); const e = this.lairs.get(m.lair); if (e) this._sizeHeap(e, st.loose); this._sendSoon = true; } } break;
            case 'drop': if (this.auth && Array.isArray(m.p)) g.items?.spawnLoose({ kind: 'coins', uid: newUid(), count: Math.min(HANDFUL.MAX, +m.n || 0) }, vec(m.p), { vel: new THREE.Vector3(0, -1, 0) }); break;
            default: break;
        }
    }

    _applyState(m) {
        const seen = new Set();
        for (const row of m.l || []) {
            const [id, ki, x, y, z, ry, hp, si, br, bx, by, bz, fly, lair, slot, flame, react, walk, mid, mv, mt, mf, lt] = row;
            seen.add(id);
            let d = this.list.find((q) => q.id === id);
            const kind = KIND_IDS[ki] || 'emerald';
            if (!d) d = this.spawn({ id, kind, react, flame, hp, lair: lair || null, slot, pos: new THREE.Vector3(x, y, z), yaw: ry, mode: STATES[si] || 'sleep' });
            d.hp = hp;
            const was = d.mode;
            d.mode = STATES[si] || d.mode;
            if (was === 'land' && d.mode === 'fight') this._landFx(d); // (it has come down: the thud, the dust, the shake — on every computer)
            if (this.game.dragonRide?.riding === d || d.imp?.mine) { seen.add(id); continue; } // (I fly it — on its back, or my mind in it)
            (d.net || (d.net = new THREE.Vector3())).set(x, y, z);
            d.netYaw = ry;
            d.fly = fly / 100;
            d.netWalk = (walk || 0) / 10;
            // (the move and the take-off the host is in: the guests play them on from here — `_animate`)
            if (mv && MOVE_IDS[mv - 1]) { if (d.lastMid !== mid) { d.lastMid = mid; d.move = { kind: MOVE_IDS[mv - 1], t: (mt || 0) / 100, side: mf & 1 ? 1 : -1, id: mid, snd: false }; } d.clawLeg = (mf >> 1) & 1; } else if (!mv) { d.move = null; d.lastMid = null; }
            if (lt) { if (!(d.liftT > 0) || lt / 100 > d.liftT) d.liftT = lt / 100; } else d.liftT = 0;
            if (d.mode === 'dead' && !d.dead) this._die(d, null);
            if (br) {
                if (!d.breath) d.breath = { t: 0, dir: new THREE.Vector3() };
                d.breath.dir.set(bx, by, bz).normalize();
                d.breath.t = Math.min(d.breath.t, DRAGON.FLAME_TIME - 0.2); // (the host says when it ends)
            } else d.breath = null;
        }
        for (const d of [...this.list]) if (!seen.has(d.id) && !d.dead) this._remove(d);
        for (const [id, loose] of m.h || []) {
            this.state[id] = this.state[id] || { loose, spawned: true, items: [], d: [] };
            this.state[id].loose = loose;
            const e = this.lairs.get(id);
            if (e) this._sizeHeap(e, loose);
        }
    }

    // ================================================================ save
    snapshot() {
        const out = {};
        for (const [id, st] of Object.entries(this.state)) out[id] = { loose: st.loose, spawned: !!st.spawned, items: st.items || [], d: st.d.map((s) => ({ kind: s.kind, react: s.react, flame: s.flame, hp: Math.round(s.hp), dead: !!s.dead })) };
        return out;
    }

    restore(s) {
        if (!s || typeof s !== 'object') return;
        for (const [id, st] of Object.entries(s)) {
            if (!st || !Array.isArray(st.d)) continue;
            this.state[id] = { loose: Math.max(0, +st.loose || 0), spawned: !!st.spawned, items: Array.isArray(st.items) ? st.items : [], d: st.d.filter((q) => DRAGON_KINDS[q.kind]).map((q) => ({ kind: q.kind, react: +q.react || 1, flame: +q.flame || 1, hp: Math.max(0, Math.min(DRAGON_HP, +q.hp || 0)), dead: !!q.dead })) };
        }
    }

    // ================================================================ tests / debugging
    /** (debug, tests) A dragon flies over right now (the host's next check). */
    summonWanderer() { this._forceWander = true; this._wanderT = 0; }

    dispose() {
        for (const d of [...this.list]) this._remove(d);
        for (const e of this.lairs.values()) if (e.heap) this.game.scene.remove(e.heap.group);
        this.lairs.clear();
        for (const s of ['right', 'left']) this.hands[s].model?.parent?.remove(this.hands[s].model);
        if (this._hud) this._hud.style.display = 'none';
    }
}

const UP = new THREE.Vector3(0, 1, 0);
const r2 = (v) => Math.round(v * 100) / 100;
const vec = (a) => new THREE.Vector3(+a[0] || 0, +a[1] || 0, +a[2] || 0);
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

/** Where the ray o + d·t (d unit) enters a sphere (c, r), within [0, maxT] — null: it misses. */
function raySphere(o, d, c, r, maxT) {
    const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
    const cc = ox * ox + oy * oy + oz * oz - r * r;
    if (cc <= 0) return 0;
    const b = ox * d.x + oy * d.y + oz * d.z;
    if (b > 0) return null;
    const disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t >= 0 && t <= maxT ? t : null;
}
