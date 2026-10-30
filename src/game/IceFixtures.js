/**
 * IceFixtures.js — the Ice Castle's gates and its chandelier: strong, but not invulnerable
 * (CLAUDE.md: «Ничто не висит в воздухе… неуязвимы только дары богов» — they are not gifts of the gods).
 *
 * The gates (two leaves — Doors.js) hold a store of strength (GATE.HP):
 *  - while the queen lives her magic holds them: a plain blast («Бомбардо») barely scratches them
 *    (×GATE.PLAIN_K), «Бомбардо Максима» takes a good bite (several break them), «Total Destruction»,
 *    «Инспириус», a falling great wave — at once; fire is ice's weakness: «Инферно» melts them fastest,
 *    «Fire Maxima» and «Let the Hellfire Come» faster still (×GATE.FIRE_K × the fire's power);
 *  - cold of any kind (ice, «Frozen», snow, the rod) does nothing — it is the same ice;
 *  - when she falls her magic fades: the frost-glow goes out, the leaves crack and swing ajar, and
 *    what is left of them is plain ice (GATE.WEAK_HP: one «Бомбардо Максима», a few plain blasts,
 *    a moment of fire);
 *  - and whatever holds them up (the archway of ice round them: the lintel over them, the posts at
 *    their sides — Wreck.doorHeld) melted or blown away: they fall, as any door with no frame.
 * Broken, they burst into shards of ice: the way in is open (saved with the world).
 *
 * The chandelier hangs on a chain from a hook in the vault (you see what it hangs on). It falls
 * with a crash and shatters when the block of the hook is gone (melted, blown up, the roof caved in)
 * or when its chain breaks: a blast at it or its chain (CHAIN_HP), fire melts the frosted links.
 * Under it whoever stands is hurt. Its wreck stays on the floor (and blocks the way: a box).
 *
 * Who/what × how (CLAUDE.md):
 *  - blasts (Game.applyExplosion → Wreck.afterBlast, Total Destruction, Inspirius, the great wave):
 *    gates — damage by power; chandelier — its chain breaks (a plain blast: a third of it);
 *  - fire (IceQueen.meltAt: «Инферно», «Fire Maxima», the Hellfire, a dragon's fire): gates — ×FIRE_K;
 *    chandelier — the chain's frosted links melt;
 *  - cold spells — nothing (ice); «Левиоса» — nothing: the chandelier is chained up and the gates are
 *    hung on their posts, levitation lifts only what lies free (Levitation.js does not pick them);
 *  - duel bolts and lightning — nothing: they strike creatures, not the castle's ice;
 *  - creatures: the falling chandelier hurts whoever is under it (players: each computer its own; the
 *    castle's creatures: the host).
 * The host decides (the strength, the breaking, the fall) and tells the others in the castle's state
 * (IceQueen._netSend 'st'); guests' fire reaches the host as {e: 'fix'}.
 */

import * as THREE from 'three';
import { doorHeld, floorUnder } from './Wreck.js';
import { isSolid } from '../world/Terrain.js';
import { iceYaw, iceLocal } from '../world/IceCastle.js';
import { chandelierModel, iceChainModel, CHANDELIER_HUB, CHANDELIER_LOW } from './IceModels.js';

export const GATE = {
    HP: 160, // the gates' strength while the queen lives
    WEAK_HP: 30, // … and when she is gone: plain ice
    BLAST: 12, // damage of a blast of power 1 (× power)
    PLAIN_K: 0.25, // a plain blast (power ≤ 1) while her magic holds them: barely a scratch
    FIRE: 12, // damage of a fire of power 1 (× power × FIRE_K)
    FIRE_K: 3, // fire is ice's weakness
    FIRE_EVERY: 0.25, // s: fire counts this often (a stream of fire is called every frame)
    REACH: 3.5, // m: a blast this much beyond its radius still shakes the gates
    CHAIN_HP: 30, // the chandelier's chain
    CHAIN_K: 1, // blast damage on the chain (× BLAST × power)
    FALL_DMG: 22, // hurt to whoever is under the falling chandelier
    FALL_R: 3.6,
    CHECK: 0.5, // s: how often the supports are checked
};

/** How much a blow takes from the gates: kind 'blast' (with power) or 'fire' (power) or a cold spell. */
export function gateDamage(kind, power, queenDead) {
    if (kind === 'fire') return GATE.FIRE * power * GATE.FIRE_K;
    if (kind !== 'blast') return 0; // (cold, ice, snow: the same ice — nothing; the rest does not reach the castle's ice)
    if (power >= 20) return Infinity; // (Total Destruction, Inspirius, the great wave: nothing holds)
    return GATE.BLAST * power * (!queenDead && power <= 1 ? GATE.PLAIN_K : 1);
}

/** The gates' strength now: her magic gone, no more than plain ice. */
export function gateCap(queenDead) { return queenDead ? GATE.WEAK_HP : GATE.HP; }

/**
 * Is the hook's block still part of the vault — not a lone block left in the air when the vault round it
 * was blown away or melted (CLAUDE.md: nothing hangs in the air)? It is, when a solid block touches it
 * (at its sides or over it).
 */
export function hookHeld(t, x, L, z) {
    x = Math.round(x); z = Math.round(z);
    if (!isSolid(t.get(x, L, z))) return false;
    if (isSolid(t.get(x, L + 1, z))) return true;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if ((dx || dz) && isSolid(t.get(x + dx, L, z + dz))) return true;
    return false;
}

/**
 * Does the hook's block stand on the castle — a chain of solid blocks from it down to the palace's floor (`floorL`)? «Ничто не висит
 * в воздухе»: a lone column of the spire left over the blown vault is not a hook (hookHeld looks only at the neighbours). A greedy
 * search, the lowest neighbour first — an intact vault is a short way down its rings and walls; a cut-off piece is searched whole
 * (≤ `cap` blocks; one bigger than that is a mass the collapse rules deal with themselves: held).
 */
export function hookGrounded(t, x, L, z, floorL, cap = 1500) {
    x = Math.round(x); z = Math.round(z);
    if (!isSolid(t.get(x, L, z))) return false;
    const seen = new Set();
    const key = (a, l, b) => ((a + 4096) * 8192 + (b + 4096)) * 512 + (l + 128);
    const stack = [[x, L, z]];
    seen.add(key(x, L, z));
    while (stack.length) {
        const [a, l, b] = stack.pop();
        if (l <= floorL) return true;
        if (seen.size > cap) return true;
        // (pushed last = taken first: below, then the four sides, then above)
        for (const [da, dl, db] of NEIGHBOURS) {
            const na = a + da, nl = l + dl, nb = b + db, k = key(na, nl, nb);
            if (seen.has(k)) continue;
            seen.add(k);
            if (isSolid(t.get(na, nl, nb))) stack.push([na, nl, nb]);
        }
    }
    return false;
}
const NEIGHBOURS = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]];

/** Are the land chunks round the hall made (the support check must not ask the world to make them in a frame)? */
export function hallLoaded(t, P) {
    if (!t?.landMade || !P?.chandelier) return false;
    const X = P.chandelier.x, Z = P.chandelier.z;
    for (const [dx, dz] of [[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20], [14, 14], [-14, 14], [14, -14], [-14, -14]]) if (!t.landMade(X + dx, Z + dz)) return false;
    return true;
}

/** The first solid layer above (x, L0, z) within `up` layers (the hook of a chandelier); null: none (yet). */
export function hookAbove(t, x, L0, z, up = 26) {
    for (let L = L0; L <= L0 + up; L++) if (isSolid(t.get(Math.round(x), L, Math.round(z)))) return L;
    return null;
}

const _v = new THREE.Vector3();

export class IceFixtures {
    /** @param life IceCastleLife */
    constructor(life) {
        this.life = life;
        this.leaves = null; // the gate leaves' ids while they are put up
        this.held0 = new Map(); // leaf id → it was held by its frame (only a frame once seen can fall away)
        this.ch = null; // the chandelier: {model, chain, hookL, hookY, y, vy, falling, wreck, boxId}
        this._fireT = 0;
        this._checkT = 0;
        this._glowDead = null;
    }

    get game() { return this.life.game; }
    get plan() { return this.life.plan; }
    get st() { return this.life.state; }
    get auth() { return this.life.auth; }

    /** The state kept with the castle's: {gateHp, gateBroken, chandFallen}. */
    static initState(s) {
        if (s.gateHp == null) s.gateHp = GATE.HP;
        s.gateBroken = !!s.gateBroken;
        s.chandFallen = !!s.chandFallen;
        return s;
    }

    // ---------------------------------------------------------------- put up / taken down (near / far)
    make() {
        const g = this.game, P = this.plan;
        if (!P) return;
        IceFixtures.initState(this.st);
        this.leaves = ['iceGateL', 'iceGateR'];
        if (!this.st.gateBroken) {
            const ry = iceYaw(P);
            const gv = Math.round((P.gate.x - P.x) * [0, 1, 0, -1][P.rot] + (P.gate.z - P.z) * [1, 0, -1, 0][P.rot]);
            for (const s of [-1, 1]) {
                const at = iceLocal(P, s * 1.25, gv + 0.1);
                const ajar = this.st.queenDead ? 0.3 : 0;
                g.doors?._place?.({ id: s < 0 ? 'iceGateL' : 'iceGateR', x: at.x, y: P.gate.y, z: at.z, ry, color: 0xcdeffd, a: ajar, w: 2.5, h: 6, gen: true, gate: true, ice: true, mirror: s > 0 });
            }
        }
        this._glowDead = null;
        this.ch = { model: null, chain: null, hookL: null, y: 0, vy: 0, falling: false, wreck: false, boxId: null };
    }

    drop() {
        const g = this.game;
        for (const id of this.leaves || []) g.doors?.remove?.(id);
        this.leaves = null;
        this.held0.clear();
        this._dropChandelier();
        this.ch = null;
    }

    _dropChandelier() {
        const g = this.game, c = this.ch;
        if (!c) return;
        if (c.model) g.scene?.remove(c.model);
        if (c.chain) g.scene?.remove(c.chain);
        if (c.boxId != null) g.collision?.removeBox(c.boxId);
        c.model = c.chain = null; c.boxId = null;
    }

    // ---------------------------------------------------------------- frame
    update(dt) {
        if (!this.leaves || !this.plan) return;
        this._updateChandelier(dt);
        this._glow();
        if (this._fireT > 0) this._fireT -= dt;
        if ((this._checkT -= dt) > 0) return;
        this._checkT = GATE.CHECK;
        if (!this.auth) return;
        // (host) the supports: the gates' archway, the chandelier's hook
        const t = this.game.world?.terrain?.data;
        if (!t) return;
        const loaded = hallLoaded(t, this.plan);
        if (!this.st.gateBroken && loaded) for (const id of this.leaves) {
            const d = this.game.doors?.list.get(id);
            if (!d) continue;
            const held = doorHeld(t, d);
            if (held) this.held0.set(id, true);
            else { this.breakGates('frame'); break; } // (no frame — seen held before or the castle woke up already blown apart: «ничто не висит в воздухе»)
        }
        const c = this.ch;
        if (c && !this.st.chandFallen && c.hookL != null && loaded) {
            const P = this.plan, X = P.chandelier.x, Z = P.chandelier.z;
            // (the hook's block gone, or left alone in the air over a blown vault: the chain has nothing to hang on)
            if (!hookHeld(t, X, c.hookL, Z) || ((this._groundT = (this._groundT || 0) + 1) % 3 === 0 && !hookGrounded(t, X, c.hookL, Z, P.floor))) this.fallChandelier('hook');
        }
    }

    /** Her magic in the gates: the frost-glow while she lives, plain ice when she is gone. */
    _glow() {
        const dead = !!this.st.queenDead;
        if (this._glowDead === dead) return;
        const d = this.game.doors?.list.get('iceGateL');
        if (!d) return;
        this._glowDead = dead;
        d.model.traverse((o) => { if (o.isMesh && o.material?.emissive && o.material.transparent) o.material.emissive.setHex(dead ? 0x0a1c28 : 0x24597a); });
    }

    _updateChandelier(dt) {
        const g = this.game, P = this.plan, c = this.ch;
        if (!c || !P.chandelier) return;
        const X = P.chandelier.x, Z = P.chandelier.z;
        let floor = P.floor - 0.5; // (the hall's walking height)
        if (!c.model) {
            if (this.st.chandFallen) { this._wreck(); return; }
            const t = g.world?.terrain?.data;
            if (!t) return;
            const hub = P.chandelier.y - 2 + CHANDELIER_HUB;
            const L = hookAbove(t, X, Math.round(hub + 1.5) + 1, Z);
            if (!hallLoaded(t, P)) return; // (the land is not here yet: the hall is looked at when it is)
            if (L == null || !hookGrounded(t, X, L, Z, P.floor)) {
                // (the vault is gone — blown apart, melted, fallen while the castle slept: nothing to hang on; the host lays it on the floor)
                if (this.auth) { this.st.chandFallen = true; this.life._sendSoon = true; this._wreck(); }
                return;
            }
            c.hookL = L;
            c.hookY = L - 1.5; // (the block's underside)
            c.y = P.chandelier.y - 2;
            c.model = chandelierModel();
            c.model.position.set(X, c.y, Z);
            c.chain = iceChainModel(c.hookY - (c.y + CHANDELIER_HUB));
            c.chain.position.set(X, c.hookY, Z);
            g.scene?.add(c.model, c.chain);
            // (it is a thing, not a picture: a bolt bursts on it, nobody flies through it)
            if (g.collision?.addBox) c.boxId = g.collision.addBox({ minX: X - 2, maxX: X + 2, minY: c.y - CHANDELIER_LOW, maxY: c.y + CHANDELIER_HUB, minZ: Z - 2, maxZ: Z + 2, kind: 'chandelier' });
            return;
        }
        if (this.st.chandFallen && !c.falling && !c.wreck) this._startFall(); // (the host's word reached me)
        if (!c.falling) return;
        // (what is under it NOW: the floor may be blown away too — it falls on to whatever is left; nothing to the bedrock: it is gone.
        // Asked from where it WAS, before the step: a long frame never carries it through the floor)
        if ((c.landT = (c.landT || 0) - dt) <= 0 || c.rest == null) { c.landT = 0.1; c.rest = this._restY(c.y - CHANDELIER_LOW); }
        c.vy -= 20 * dt;
        c.y += c.vy * dt;
        if (c.rest != null) c.y = Math.max(c.y, c.rest + CHANDELIER_LOW);
        c.model.position.y = c.y;
        c.model.rotation.z = Math.min(0.5, c.model.rotation.z + dt * 0.4);
        if (c.rest == null) { if (c.y < (this.game.world?.terrain?.data?.bedrockTop ?? -40)) { this._crash(_v.set(X, c.y, Z)); this._dropChandelier(); c.falling = false; c.wreck = true; } return; }
        floor = c.rest;
        if (c.y - CHANDELIER_LOW > floor) return;
        // the crash: it shatters on the floor
        c.falling = false;
        c.y = floor + CHANDELIER_LOW;
        this._crash(_v.set(X, floor + 0.5, Z));
        this._wreck();
    }

    /** It lies broken on the floor: tipped over, half its height, a box to walk round. */
    _wreck() {
        const g = this.game, P = this.plan, c = this.ch;
        if (c.wreck) return;
        c.wreck = true;
        if (c.chain) { g.scene?.remove(c.chain); c.chain = null; }
        if (!c.model) { c.model = chandelierModel(); g.scene?.add(c.model); }
        // (a gift of the gods is not broken by its fall: it lies whole on whatever floor is left under it, tilted on its rim)
        const floor = c.rest ?? this._restY(P.chandelier.y) ?? P.floor - 0.5;
        c.rest = floor;
        c.model.position.set(P.chandelier.x, floor + 2.4, P.chandelier.z);
        c.model.rotation.set(0.35, 0.7, 0.9);
        c.model.scale.set(1, 1, 1);
        if (c.boxId == null && g.collision) c.boxId = g.collision.addBox({ minX: P.chandelier.x - 2.4, maxX: P.chandelier.x + 2.4, minY: floor, maxY: floor + 2.4, minZ: P.chandelier.z - 2.4, maxZ: P.chandelier.z + 2.4, kind: 'wreck' });
    }

    /** The walking height under the chandelier's lowest point (null: nothing there). */
    _restY(fromY) {
        const t = this.game.world?.terrain?.data, P = this.plan;
        if (!t || !P?.chandelier) return null;
        return floorUnder(t, P.chandelier.x, fromY, P.chandelier.z);
    }

    _startFall() {
        const g = this.game, c = this.ch;
        if (!c?.model || c.falling || c.wreck) return;
        c.falling = true;
        c.vy = 0;
        if (c.boxId != null) { g.collision?.removeBox(c.boxId); c.boxId = null; } // (it falls: the box of it hanging goes)
        if (c.chain) { g.scene?.remove(c.chain); c.chain = null; } // (the chain snaps: its end goes with it)
        g.sound?.playClang?.(0.5);
    }

    _crash(p) {
        const g = this.game;
        const me = g.character?.group.position;
        if (g.sound?.playExplosion && me) g.sound.playExplosion(p, me, 0.35);
        g.sound?.playFrozenHit?.();
        const debris = [];
        for (let i = 0; i < 30; i++) debris.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y + Math.random() * 1.5, z: p.z + (Math.random() - 0.5) * 6, color: i % 3 ? 0xcdeffd : 0xe8fbff, size: 0.5 });
        g.fx?.debrisFrom?.(debris, p, 40);
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, me && me.distanceTo(p) < 25 ? 0.6 : 0.2);
        // whoever is under it: me (every computer its own), the castle's creatures (the host)
        if (me && Math.hypot(me.x - p.x, me.z - p.z) < GATE.FALL_R && Math.abs(me.y - 1.95 - p.y) < 3 && !g.isDeadLocal) {
            if (g.combat?.enabled) g.combat.damage(GATE.FALL_DMG, null, 'collapse'); else g.damageLocalPlayer?.(GATE.FALL_DMG);
            g.hud?.setVoice?.(`💥 На вас рухнула люстра: −${GATE.FALL_DMG}`, true);
        }
        if (this.auth) {
            this.life.hitAt?.(p, GATE.FALL_R, GATE.FALL_DMG, 'collapse');
            g.castleLife?.hitAt?.(p, GATE.FALL_R, GATE.FALL_DMG, null);
            g.animals?.hitAt?.(p, GATE.FALL_R, GATE.FALL_DMG, null);
        }
    }

    // ---------------------------------------------------------------- blows (the host decides)
    /** A blast at pos (every computer runs it; the host decides). power: 0 a falling roof, 99 nothing holds. */
    blast(pos, radius, power) {
        if (!this.auth || !this.leaves || !(power > 0)) return;
        this._gateBlow(pos, radius + GATE.REACH, 'blast', power);
        this._chainBlow(pos, radius + 1, GATE.BLAST * GATE.CHAIN_K * power);
    }

    /** Fire at pos (the caster's computer: IceQueen.meltAt) — a guest sends it to the host. */
    fire(pos, radius, power) {
        if (!this.leaves || this._fireT > 0) return;
        if (!this._nearGate(pos, radius + 1.5) && !this._nearChain(pos, radius + 1)) return;
        this._fireT = GATE.FIRE_EVERY;
        if (!this.auth) { this.game.sync?.ice?.({ e: 'fix', p: [pos.x, pos.y, pos.z].map((v) => Math.round(v * 100) / 100), r: radius, pw: power }); return; }
        this.applyFire(pos, radius, power);
    }

    /** (host) A guest's fire, or my own. */
    applyFire(pos, radius, power) {
        if (!this.auth || !this.leaves) return;
        power = Math.max(0, Math.min(3, +power || 0));
        radius = Math.max(0, Math.min(10, +radius || 0));
        this._gateBlow(pos, radius + 1.5, 'fire', power);
        this._chainBlow(pos, radius + 1, GATE.FIRE * power * GATE.FIRE_K);
    }

    _nearGate(pos, r) {
        const G = this.plan?.gate;
        return !!G && Math.hypot(G.x - pos.x, G.y + 3 - pos.y, G.z - pos.z) < r + 2.5;
    }

    _nearChain(pos, r) {
        const P = this.plan, c = this.ch;
        if (!P?.chandelier || !c?.model || c.falling || c.wreck) return false;
        const top = c.hookY ?? c.y + CHANDELIER_HUB;
        const y = Math.max(c.y - CHANDELIER_LOW, Math.min(top, pos.y));
        return Math.hypot(P.chandelier.x - pos.x, y - pos.y, P.chandelier.z - pos.z) < r + 3.2;
    }

    _gateBlow(pos, r, kind, power) {
        const st = this.st;
        if (st.gateBroken || !this._nearGate(pos, r)) return;
        IceFixtures.initState(st);
        st.gateHp = Math.min(st.gateHp, gateCap(st.queenDead)) - gateDamage(kind, power, st.queenDead);
        this.life._sendSoon = true;
        if (st.gateHp <= 0) { this.breakGates(kind); return; }
        for (const id of this.leaves) { const d = this.game.doors?.list.get(id); if (d) d.shakeT = 0.5; }
        const G = this.plan.gate;
        for (let i = 0; i < 8; i++) this.game.fx?.spark?.(_v.set(G.x + (Math.random() - 0.5) * 4, G.y + 1 + Math.random() * 5, G.z), kind === 'fire' ? 0xd8f4ff : 0xe8fbff, 0.2, new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.8);
    }

    _chainBlow(pos, r, dmg) {
        const st = this.st, c = this.ch;
        if (st.chandFallen || !(dmg > 0) || !this._nearChain(pos, r)) return;
        c.hp = (c.hp ?? GATE.CHAIN_HP) - dmg;
        if (c.hp <= 0) this.fallChandelier('chain');
    }

    /** (host, and everyone from the state) The gates burst into shards of ice: the way is open. */
    breakGates(why = null) {
        const g = this.game, st = this.st;
        const was = st.gateBroken;
        st.gateBroken = true;
        st.gateHp = 0;
        this.life._sendSoon = true;
        for (const id of this.leaves || []) {
            const d = g.doors?.list.get(id);
            if (!d) continue;
            const debris = [];
            for (let i = 0; i < 16; i++) debris.push({ x: d.x + (Math.random() - 0.5) * 2.5, y: d.y + 0.5 + Math.random() * 5.5, z: d.z + (Math.random() - 0.5) * 2.5, color: i % 3 ? 0xcdeffd : 0xe8fbff, size: 0.7 });
            g.fx?.debrisFrom?.(debris, _v.set(d.x, d.y + 2.5, d.z), 30);
            g.doors.remove(id);
        }
        if (!was) {
            g.sound?.playFrozenHit?.();
            if (why === 'fire') for (let i = 0; i < 20; i++) g.fx?.spark?.(_v.set(this.plan.gate.x, this.plan.gate.y + Math.random() * 5, this.plan.gate.z), 0xd8f4ff, 0.3, new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2), 1.2); // (steam)
        }
    }

    /** (host, and everyone from the state) The chandelier comes down. */
    fallChandelier() {
        if (this.st.chandFallen && (this.ch?.falling || this.ch?.wreck)) return;
        this.st.chandFallen = true;
        this.life._sendSoon = true;
        this._startFall();
    }

    /** The queen fell: her magic leaves the gates — plain ice now, the leaves crack and swing ajar. */
    queenFell() {
        const g = this.game, st = this.st;
        IceFixtures.initState(st);
        st.gateHp = Math.min(st.gateHp, GATE.WEAK_HP);
        if (!this.leaves || st.gateBroken) return;
        g.sound?.playFrozenHit?.();
        if (!this.auth) return;
        for (const id of this.leaves) {
            const d = g.doors?.list.get(id);
            if (!d || d.holdSide || Math.abs(d.a) > 0.3) continue;
            g.doors._setAngle(d, 0.3);
            g.sync?.doorAngle?.(id, d.a);
        }
    }

    /** The others: the host's word ({gh, gb, cf} in the castle's state). */
    applyNet(s) {
        if (!s) return;
        const st = this.st;
        if (Number.isFinite(s.gh)) st.gateHp = s.gh;
        if (s.gb && !st.gateBroken) this.breakGates();
        if (s.cf && !st.chandFallen) { st.chandFallen = true; this._startFall(); }
    }

    netState() { const st = this.st; return { gh: Math.round(st.gateHp ?? GATE.HP), gb: st.gateBroken ? 1 : 0, cf: st.chandFallen ? 1 : 0 }; }
}
