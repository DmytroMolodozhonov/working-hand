/**
 * Dragons.js — dragons: rare, in their lairs high in the big mountains, now and then flying over
 * the world. (Kinds, strength, the table «на кого и на что»: DragonKinds.js; looks: DragonModel.js;
 * the lairs themselves are carved into the mountains by the terrain: src/world/DragonLairs.js.)
 *
 *  - 1000 HP. Fire of any kind does nothing to it (DragonKinds.FIRE_KINDS); the other spells and
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
 *  - The hoard: a heap of loose coins (1000–5000 coins in the lair altogether, DragonKinds.rollHoard)
 *    and pouches lying on and round it (none full, some empty), one egg per dragon of the lair. Loose
 *    coins are scooped by hand — an open hand pushed into the heap, the fingers closed: a handful —
 *    and poured into an open pouch held in the other hand (or into the pouches tied on the belt:
 *    the hand opened at the right hip). Opened anywhere else — they fall (back onto the heap in
 *    the lair). Taking anything wakes the dragons.
 *  - Multiplayer: the host moves the dragons and decides (hits, the hoard); everybody sees them
 *    (`drg` messages). Every computer burns its own player in the flame. Saved with the world.
 */

import * as THREE from 'three';
import { DRAGON_HP, DRAGON_KINDS, KIND_IDS, DRAGON, rollDragon, flameReach, dragonDamage, isFire, rollHoard, HANDFUL, dragonWand, dragonEgg } from './DragonKinds.js';
import { dragonModel, poseDragon, BODY, SCALE } from './DragonModel.js';
import { LAIR } from '../world/DragonLairs.js';
import { newUid } from './ItemTypes.js';
import { createRng } from '../core/math.js';
import { creditKill } from './Mana.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Vector3();
const _c = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
const TAU = Math.PI * 2;
const POUCH = 100;
/** Wandering dragons: checked this often (s) by the host; this chance a check brings one. */
const WANDER = { EVERY: 60, CHANCE: 0.075, /* (half as often as before — the author asked) */ FAR: 340, ALT: 50, LAND: 0.3, REST: [25, 50], SEE: 22, GONE: 520 };
/** Lairs: their dragons come out when a player is this near (m); go back to rest beyond FAR. */
const LAIR_NEAR = 170, LAIR_FAR = 320;
const STATES = ['sleep', 'watch', 'chase', 'exit', 'air', 'enter', 'landed', 'dead'];

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
        this._lairT = 0;
        this._wanderT = WANDER.EVERY * 0.5;
        this._netT = 0;
        this._hurtT = 0;
        this.log = []; // (tests) what happened
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
        const K = DRAGON_KINDS[kind];
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.visible = false;
        this.game.scene.add(shadow);
        const d = {
            id, kind, react, flame, hp, lair, slot, model, group: model, shadow, mode, size: SCALE * K.size,
            isDragon: true, dead: false, get isDead() { return this.dead; }, get position() { return this.model.position; },
            bodyCapsule: (out) => dragonBody(d, out),
            t: Math.random() * 10, fly: mode === 'air' ? 1 : 0, sleep: mode === 'sleep' ? 1 : 0, walk: 0, mouth: 0, look: 0, lower: 0, sweep: 0, spread: 0,
            vel: new THREE.Vector3(), target: null, aggro: null, wakeT: 0, calmT: 0, breath: null, breathCd: 2, blowCd: 0, stun: 0, blind: 0, slow: 0,
            path: null, purpose: null, home: null, dest: null, landAt: null, restT: 0, damageCooldown: 0, burnT: 0, meT: 0,
        };
        this.list.push(d);
        return d;
    }

    _remove(d) {
        const i = this.list.indexOf(d);
        if (i >= 0) this.list.splice(i, 1);
        this.game.scene.remove(d.model);
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
        if (isFire(kind)) {
            // (fire: nothing — a few sparks off its scales, and the one who burnt it is told once)
            if (who === this.me && !this._fireSaid) { this._fireSaid = true; g.hud?.setVoice?.('🐉 Огонь дракону не страшен — жгите хоть адским пламенем', true); }
            this.log.push('fire:' + kind);
            return 0;
        }
        if (!this.auth) { g.sync?.dragon?.({ e: 'hit', id: d.id, dmg: Math.round(dmg * 10) / 10, kind, by: who }); return n; }
        if (rule?.stun) d.stun = Math.max(d.stun, rule.stun);
        if (rule?.blind) { d.blind = Math.max(d.blind, rule.blind); d.breath = null; }
        if (rule?.slow) d.slow = Math.max(d.slow, rule.slow);
        // it turns on whoever struck it (a player) — even a blow that did not hurt it
        if (who && who !== 'dragon' && this._playerPos(who)) this._anger(d, who);
        if (n <= 0) return 0;
        d.hp = Math.max(0, d.hp - n);
        d.lastBy = who;
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
            if (d.dead) continue;
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
            this.boltHit(d, spell, by);
            return true;
        }
        return false;
    }

    boltHit(d, spell, by = undefined) {
        // «Джолт»: a great heavy body only sways a little — it wakes and turns on the caster (no damage)
        if (spell === 'Jolt' || spell === 'JoltMaxima') {
            d.sweep = (Math.random() < 0.5 ? -1 : 1);
            const who = by === undefined || by === 'local' ? this.me : by;
            if (this.auth && who && this._playerPos(who)) this._anger(d, who);
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
            if (casterId && this._playerPos(casterId)) this._anger(d, casterId);
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

    _anger(d, who) {
        d.aggro = who;
        d.target = who;
        if (d.mode === 'sleep' || d.mode === 'watch') { d.mode = 'watch'; d.sleepGoal = 0; d.wakeT = Math.min(d.wakeT || 9, 0.4); }
        else if (d.mode === 'landed') this._takeOff(d, 'chase');
        else if (d.mode === 'air') d.purpose = 'chase';
        if (!d.chaseFrom) d.chaseFrom = d.home ? new THREE.Vector3(d.home.x, 0, d.home.z) : d.model.position.clone();
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
        if (d.model.position.distanceTo(g.character.group.position) < 80) g.hud?.notify?.(`🐉 ${DRAGON_KINDS[d.kind].name} проснулся!`);
    }

    _die(d, killer = d.lastBy) {
        if (d.dead) return;
        d.dead = true;
        d.mode = 'dead';
        d.breath = null;
        const g = this.game;
        d.killer = killer || null;
        const c = dragonCenter(d, new THREE.Vector3());
        for (let i = 0; i < 70; i++) g.fx?.spark(c, i % 3 ? 0xff8a1e : 0x2a0a0a, 0.35, _v2.set((Math.random() - 0.5) * 14, Math.random() * 9, (Math.random() - 0.5) * 14), 1.4);
        g.hud?.notify?.(`🐉 ${DRAGON_KINDS[d.kind].name} повержен!`);
        if (d.lair) { const st = this.state[d.lair]; if (st?.d[d.slot]) { st.d[d.slot].dead = true; st.d[d.slot].hp = 0; } }
        if (this.auth) {
            // mana: a magical creature — the killer's maximum grows (once per kind; the host credits, Mana.creditKill)
            creditKill(g, killer, { kind: 'dragon' });
            // its wand: deep crimson, glowing like embers — every fire spell 60% stronger
            const p = c.clone().add(_v2.set(0, 1.5, 0));
            g.items?.spawnLoose(dragonWand(newUid()), p, { hover: true });
        }
        d.fly = 0;
        d.deadT = 0;
    }

    // ================================================================ players
    _playerPos(id) {
        const g = this.game;
        const seen = (p) => (p && g.invis ? g.invis.aiPos(id === 'local' ? this.me : id, p) : p); // (an invisible player: only where they were last noticed, for a few seconds — Invisibility.aiPos)
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
        if (push) g.knockback?.add(push);
        g.hud?.setVoice?.(kind === 'fire' ? `🔥 Пламя дракона: −${Math.round(dmg * 10) / 10}` : kind === 'tail' ? `🐉 Удар хвостом: −${dmg}` : `🐉 Укус дракона: −${dmg}`, true);
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

    /** A lair's saved state (made the first time: its hoard, its dragons). */
    _lairState(e) {
        let st = this.state[e.L.id];
        if (!st) {
            const rng = createRng(e.L.seed ^ 0xd7a6);
            const n = rng() < 0.25 ? 2 : 1;
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
            // pouches: on the heap's slope and round it (none full; some empty, to gather into)
            e.hoard.bags.forEach((n) => {
                const it = { kind: 'coins', uid: newUid(), count: n };
                g.items.spawnLoose(it, at(rng() * TAU, R * (0.6 + rng() * 0.7), 0.6));
                st.items.push(it.uid);
            });
            // one egg per dragon of the lair, nestled at the heap's foot
            st.d.forEach((s, i) => {
                const it = dragonEgg(newUid(), s.kind);
                g.items.spawnLoose(it, at(rng() * TAU, R * 0.85 + i * 0.6, 0.5));
                st.items.push(it.uid);
            });
        }
    }

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
            if (who) this._anger(d, who);
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
            const k = Math.max(0, Math.min(n, POUCH - (pouch.count || 0)));
            pouch.count = (pouch.count || 0) + k;
            put = k; where = `в мешочек (в нём ${pouch.count})`;
            inv?._render?.();
        } else if (inv?.purse && inv.purse.count > 0 && g.currentPose?.purse?.right === true && side === 'right') {
            const rest = inv.purse.add(n);
            put = n - rest; where = `в мешочки на поясе (${inv.purse.count})`;
            inv._render?.();
        }
        n -= put;
        if (put > 0) { g.sound?.playCoins?.(); g.hud?.toast?.(`💰 +${put} монет ${where}${n > 0 ? ` — ${n} не влезли и упали` : ''}`, 1800); this.log.push('pour:' + put); }
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
        const ps = this._players();
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
        if (from.distanceTo(g.character.group.position) < 600) g.hud?.notify?.('🐉 Высоко в небе пролетает дракон…');
    }

    /** The highest ground under / near a point (to fly over it). */
    _skyFloor(x, z) {
        // (the world's height field — no chunk is made for it: a dragon flies far from the players)
        const H = this.game.terrain?.data?.heightAt;
        if (!H) return this.game.collision?.groundY?.(x, z) ?? 0;
        let y = H(Math.round(x), Math.round(z));
        for (const [ox, oz] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) y = Math.max(y, H(Math.round(x + ox), Math.round(z + oz)));
        return y - 0.5;
    }

    // ================================================================ the mind (host)
    _think(d, dt) {
        const g = this.game;
        const p = d.model.position;
        d.t += dt;
        d.stun = Math.max(0, d.stun - dt); d.blind = Math.max(0, d.blind - dt); d.slow = Math.max(0, d.slow - dt);
        d.breathCd -= dt * d.react; d.blowCd -= dt * d.react;
        if (d.mouthT > 0) d.mouthT -= dt;
        const quick = d.react * (d.slow > 0 ? 0.55 : 1);
        const lair = d.lair ? this.lairs.get(d.lair) : null;
        const L = lair?.L || null;
        if (d.stun > 0) { d.breath = null; this._animate(d, dt, 0); return; }
        const tp = d.target ? this._playerPos(d.target) : null;
        if (d.target && !tp) { d.target = null; d.aggro = null; }
        switch (d.mode) {
            case 'sleep': {
                // who comes near: wakes it (nearer for one who sneaks in the dark; farther with a light / running)
                d.checkT = (d.checkT || 0) - dt;
                if (d.checkT <= 0) {
                    d.checkT = 0.3;
                    for (const q of this._players()) {
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
                const near = this._nearest(p);
                if (near) this._lookAt(d, near.p, dt * 0.5);
                if (d.wakeT > 0) { this._animate(d, dt, 0); return; }
                const intr = this._intruder(d, L);
                if (d.aggro && tp) { d.target = d.aggro; d.mode = 'chase'; d.calmT = 0; }
                else if (intr) { d.target = intr.id; d.mode = 'chase'; d.calmT = 0; d.chaseFrom = null; }
                else {
                    d.calmT += dt;
                    if (d.calmT > DRAGON.CALM && L) { d.mode = 'sleep'; d.calmT = 0; d.wasAsleep = false; }
                    if (!L) this._takeOff(d, 'cruise');
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
                d.restT -= dt;
                const near = this._nearest(p);
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
    _intruder(d, L) {
        if (!L) return null;
        return this._nearest(d.model.position, (q) => !!this.lairAt(q.p, DRAGON.GUARD) || Math.hypot(q.p.x - L.mouth.x, q.p.z - L.mouth.z) < 25);
    }

    _goHome(d, L) {
        d.breath = null;
        d.target = null; d.aggro = null; d.chaseFrom = null;
        if (!L) { if (d.mode === 'chase') this._takeOff(d, 'cruise'); else d.purpose = 'cruise'; return; }
        if (d.fly > 0.3) { d.mode = 'air'; d.purpose = 'home'; return; }
        d.mode = 'enter'; d.enterStep = 2;
    }

    _takeOff(d, purpose) {
        d.mode = 'air';
        d.purpose = purpose;
        d.sleep = 0;
        d.vel.set(-Math.sin(d.model.rotation.y), 0.6, -Math.cos(d.model.rotation.y)).multiplyScalar(6);
        if (purpose === 'chase' && !d.chaseFrom) d.chaseFrom = d.model.position.clone();
        this.log.push('takeoff:' + purpose);
    }

    /** On its feet after somebody (in its hall): breathes, bites, sweeps its tail. → how much it walks (0–1). */
    _groundChase(d, tp, dt, quick, L) {
        const p = d.model.position, s = d.size;
        const to = _v.set(tp.x - p.x, 0, tp.z - p.z);
        const dist = to.length();
        const ang = this._angleTo(d, tp);
        let walk = 0;
        if (dist > 7 * s && !d.breath) walk = this._walkTo(d, tp.x, tp.z, DRAGON.WALK * quick, dt, L, false, 6 * s) > 0 ? 1 : 0;
        else this._lookAt(d, tp, dt);
        this._attack(d, tp, dist, ang, dt);
        return walk;
    }

    /** Bite / tail / fire at the target when it can. */
    _attack(d, tp, dist, ang, dt) {
        const s = d.size;
        const centre = _v2.copy(tp).add(_q.set(0, 0.6, 0));
        if (d.blowCd <= 0 && !d.breath && d.fly < 0.3) {
            if (dist < 7.5 * s && Math.abs(ang) < 0.7) {
                d.blowCd = DRAGON.BLOW_REST; d.mouthT = 0.5; d.lowerT = 0.5;
                const push = _v.set(tp.x - d.model.position.x, 0, tp.z - d.model.position.z).normalize().multiplyScalar(6).setY(3);
                this._hurt(d.target, DRAGON.BITE, 'bite', dragonCenter(d, _v3), push.clone());
                this.log.push('bite');
                return;
            }
            if (dist < 10 * s && Math.abs(ang) > 1.9) {
                d.blowCd = DRAGON.BLOW_REST; d.sweepT = 0.6;
                const push = _v.set(tp.x - d.model.position.x, 0, tp.z - d.model.position.z).normalize().multiplyScalar(11).setY(5);
                this._hurt(d.target, DRAGON.TAIL, 'tail', dragonCenter(d, _v3), push.clone());
                this.log.push('tail');
                return;
            }
        }
        // its fire: in reach, the head turned to them, nothing solid between (and it can see)
        const reach = flameReach(d.flame);
        if (!d.breath && d.breathCd <= 0 && d.blind <= 0 && dist > 4 * s && dist < reach && Math.abs(ang) < 0.55) {
            const mouth = this._mouth(d, _v3);
            if (this.game.collision?.lineOfSight?.(mouth.x, mouth.y, mouth.z, centre.x, centre.y, centre.z, 1.5) !== false) {
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
        const dx = x - p.x, dz = z - p.z, dist = Math.hypot(dx, dz);
        if (dist <= stopAt) return 0;
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
        d.fly = Math.min(1, d.fly + dt * 1.5);
        d.spread = 1;
        const p = d.model.position;
        if (d.purpose === 'chase') {
            const home = L ? _v2.set(L.x, p.y, L.z) : d.chaseFrom;
            if (!tp || (home && Math.hypot(tp.x - home.x, tp.z - home.z) > DRAGON.GIVE_UP)) { d.target = null; d.aggro = null; d.breath = null; d.purpose = L ? 'home' : 'cruise'; this.log.push('giveup'); return; }
            if (L && this.lairAt(tp, 3)) { d.mode = 'enter'; d.enterStep = 0; return; } // (after them, into its lair)
            // circle over them, a little above, then swoop and breathe
            d.orbit = (d.orbit ?? Math.random() * TAU) + dt * 0.35 * quick;
            const R = 16 * d.size;
            const goal = _v3.set(tp.x + Math.cos(d.orbit) * R, tp.y + 9 * d.size, tp.z + Math.sin(d.orbit) * R);
            this._flyTo(d, goal, DRAGON.FLY * quick, dt);
            const dist = p.distanceTo(tp);
            // (in flight it breathes at them as it passes: its head turned down to them)
            if (!d.breath && d.breathCd <= 0 && d.blind <= 0 && dist < flameReach(d.flame)) {
                const mouth = this._mouth(d, _v);
                const aim = _v2.copy(tp).add(_q.set(0, 0.6, 0)).sub(mouth).normalize();
                const fwd = _q.set(-Math.sin(d.model.rotation.y), 0, -Math.cos(d.model.rotation.y));
                if (aim.dot(fwd) > -0.2 && this.game.collision?.lineOfSight?.(mouth.x, mouth.y, mouth.z, tp.x, tp.y + 0.6, tp.z, 1.5) !== false) {
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
            const gy = this._skyFloor(d.landAt.x, d.landAt.z);
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
            if (tp) {
                const want = _v.copy(tp).add(_q.set(0, 0.6, 0)).sub(o).normalize();
                b.dir.lerp(want, Math.min(1, dt * 1.6 * d.react)).normalize();
            }
            const sw = Math.sin(b.t * 2.6) * 0.012;
            b.dir.applyAxisAngle(_q.set(0, 1, 0), sw).normalize();
        }
        const dir = b.dir;
        // how far it reaches: water stops it (steam), stone and walls stop it, a house's sphere too
        const reach = flameReach(d.flame);
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
        this._drawFlame(d, o, dir, b.len, dt);
        if (b.by === 'water' && Math.random() < dt * 20) g.fx?.spark(_v.copy(o).addScaledVector(dir, b.len), 0xe8eef2, 0.3, _v2.set((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.9);
        // my player in it (every computer: its own)
        const c = g.combat;
        d.meT -= dt;
        if (c && !c.dead && !g.isDeadLocal && d.meT <= 0) {
            const me = c.center ? c.center(_v) : _v.copy(g.character.group.position);
            if (inFlame(o, dir, b.len, me, 0.45)) {
                d.meT = DRAGON.FLAME_TICK;
                if (c.shieldFactor?.(o) >= 1) c._blocked?.(o, 'dragonFire'); // (a «Protection» facing the fire holds it — a beast's fire, not a spell: no mana)
                else this._hurtMe(Math.round(DRAGON.FLAME_PLAYER * d.flame * 10) / 10, 'fire', o, null);
            }
        }
        // (host) the creatures and the world: what any fire burns (Game._burnRay: trees, people,
        // animals, ships, paper, living trees, book-birds…); zombies; other dragons — not at all
        if (this.auth) {
            d.burnT -= dt;
            if (d.burnT <= 0) {
                d.burnT = 0.25 / Math.max(0.5, d.flame);
                g._burnRay?.(o, dir, b.len, null);
                for (const z of g.zombies || []) {
                    if (z.isDead) continue;
                    _v.copy(z.group.position); _v.y += 1;
                    if (inFlame(o, dir, b.len, _v, 0.6)) g.damageZombie?.(z, 2 * d.flame, false, dir.clone(), 'dragon');
                }
            }
        }
    }

    _drawFlame(d, o, dir, len, dt) {
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
            const lat = 0.17 * V * (0.4 + Math.random() * 0.8);
            const ca = Math.cos(a), sa = Math.sin(a);
            const sp = V * (0.9 + Math.random() * 0.2);
            const col = k < 0.15 ? cols[0] : k < 0.6 ? cols[1] : cols[2];
            fx.glow.spawn(o.x, o.y, o.z,
                dir.x * sp + (right.x * ca + up.x * sa) * lat, dir.y * sp + (right.y * ca + up.y * sa) * lat + 0.8, dir.z * sp + (right.z * ca + up.z * sa) * lat,
                col, (0.45 + Math.random() * 0.5) * d.size, life * (0.7 + Math.random() * 0.3), { shrink: -1.8, spin: 6 });
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
        if (d.mode !== 'air') d.spread = Math.max(0, d.spread - dt * 0.7);
        d.look *= Math.max(0, 1 - dt * 0.5);
        poseDragon(d.model, { t: d.t, walk: d.walk, fly: d.fly, flap: 3.2 + (d.vel.y > 0.5 ? 2 : 0), mouth: d.mouth, look: d.look, lower: d.lower, sleep: d.sleep, sweep: d.sweep, spread: d.spread });
        // banking into its turns in the air, nose up as it climbs
        d.model.rotation.z = (d.bank || 0) * d.fly;
        d.model.rotation.x = Math.max(-0.3, Math.min(0.3, d.vel.y * 0.03)) * d.fly;
        d.bank = (d.bank || 0) * Math.max(0, 1 - dt * 2);
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
                this._think(d, dt);
                if (d.gone) { this._remove(d); continue; }
                // a wanderer far from everybody is gone
                if (!d.lair && (this._nearest(d.model.position)?.d ?? Infinity) > WANDER.GONE) { this._remove(d); continue; }
                if (d.lair) { const st = this.state[d.lair]; if (st?.d[d.slot]) st.d[d.slot].hp = d.hp; }
            }
        } else {
            for (const d of this.list) {
                if (d.net) { d.model.position.lerp(d.net, Math.min(1, dt * 6)); d.model.rotation.y += wrap(d.netYaw - d.model.rotation.y) * Math.min(1, dt * 6); }
                d.t += dt;
                if (d.dead) { d.model.rotation.z += (Math.PI / 2 - d.model.rotation.z) * Math.min(1, dt * 2); continue; }
                this._animate(d, dt, d.netWalk || 0);
            }
        }
        for (const d of this.list) { this._breathe(d, dt); this._shadow(d); }
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
            if (d.dead || d.fly > 0.5) continue;
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
                b ? r2(b.dir.x) : 0, b ? r2(b.dir.y) : 0, b ? r2(b.dir.z) : 0, Math.round(d.fly * 100), d.lair || 0, d.slot || 0, r2(d.flame), r2(d.react), Math.round(d.walk * 10)];
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
            const [id, ki, x, y, z, ry, hp, si, br, bx, by, bz, fly, lair, slot, flame, react, walk] = row;
            seen.add(id);
            let d = this.list.find((q) => q.id === id);
            const kind = KIND_IDS[ki] || 'emerald';
            if (!d) d = this.spawn({ id, kind, react, flame, hp, lair: lair || null, slot, pos: new THREE.Vector3(x, y, z), yaw: ry, mode: STATES[si] || 'sleep' });
            (d.net || (d.net = new THREE.Vector3())).set(x, y, z);
            d.netYaw = ry;
            d.hp = hp;
            d.mode = STATES[si] || d.mode;
            d.fly = fly / 100;
            d.netWalk = (walk || 0) / 10;
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
