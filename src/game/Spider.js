/**
 * Spider.js — the boss: a giant spider that comes out at night.
 *
 *  - 200 HP. She lives in her own lairs (src/world/SpiderLairs.js: rare — three times rarer than
 *    castles, on dry land only). At night she is out at her lair (made when a player comes near
 *    enough), by day she hides. She never comes to anyone by herself and isn't on the minimap:
 *    she has to be found.
 *  - She never attacks first: she wanders quietly round her lair, even with someone right beside
 *    her. Only once a player or a creature attacks her (a weapon, a spell, an arrow, Bombardo…: any
 *    hit, any duel charge, «Джолт») she fights — the tricks below — until the night is over.
 *  - Killed, she never comes back to that lair (`slain`, saved with the world by the host).
 *  - Never in a cave (the lairs are on the open ground, away from caves), never made inside rock
 *    (on the column's top, only once its ground is loaded). She spits and grabs only at one she
 *    sees (Collision.lineOfSight from her mouth), and her poison and web stop at rock and walls.
 *  - Poison: every 15 s it spits green poison at its target: −7 HP.
 *  - Web: every 7 s a web flies at its target: stuck for 4 seconds.
 *  - Grab: every 30 s, when close, a 44% chance to seize its target in its
 *    fangs and bite: −5 HP, and again every 5 s. Only «Protection Maxima»
 *    frees you.
 *  - Between two of its tricks at least 3 seconds pass.
 *  - Wind can't move it, freezing doesn't work on it, «Авада Кедавра» only
 *    takes 20 HP. Swords, axes, arrows, fire, Bombardo, lightning hurt it.
 *  - When it dies it leaves treasure (always a wand).
 *
 * Size: twice the old one (SIZE = 2) — the body, its legs and steps, its speed,
 * the reach of the bite / grab / spit and the body weapons and spells hit are all
 * measured in its own size.
 *
 * Multiplayer: the host moves it and decides; everybody sees it.
 */

import { confusedMiss } from './StrongSpells.js';
import { crowdStep } from './CrowdSources.js';
import { BODY_R } from './Crowd.js';
import * as THREE from 'three';
import { rollWand, rollLoot, newUid } from './ItemTypes.js';
import { FACE, facesTarget, turnToward, yawTo } from './FaceTarget.js';
import { earthly } from '../world/Planets.js';
import { isGodSpell } from './DragonKinds.js';
import { spiderLairOf, spiderLairsNear } from '../world/SpiderLairs.js';
import { denSpots, denAxisPoints } from '../world/SpiderDens.js';
import { BLOCK } from '../world/Terrain.js';

const HP = 200;
/** How big it is against the first (smaller) spider: everything below scales with it. */
export const SIZE = 2;
/** Walking speed: the legs are twice as long, so the same step rate covers twice the ground. */
const SPEED = 4.2 * SIZE;
/** The body as a capsule in the model's own (unscaled) units: along it, nose to tail. */
const BODY = { y: 2.6, z0: -1.0, z1: 2.4, r: 1.7 };
/** Where the fangs are (unscaled): a seized wizard hangs there. */
const MOUTH = { fwd: 2.6, up: 1.6 };
/** Reaches (unscaled): it stops this close; it grabs within this. */
const STOP = 3.2, GRAB = 4.5;
/** m: at night a lair's spider is made when a player comes this close, taken away again past LAIR_GONE. */
const LAIR_NEAR = 120, LAIR_GONE = 200;
/** m round her lair she wanders while nobody has attacked her, and how fast (slow, unhurried). */
const HOME_R = 14, CALM_SPEED = 1.2 * SIZE;
const SPIDER_TURN = 2.6; // rad/s — how fast the giant spider turns round (FaceTarget: «лицом к цели»)
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };

/** The spider's body as a capsule {a, b, r} in the world (into `out`). */
export function spiderBody(s, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const m = s.model, ry = m.rotation.y;
    const fx = Math.sin(ry) * SIZE, fz = Math.cos(ry) * SIZE; // (the model's +z, scaled)
    const y = m.position.y + BODY.y * SIZE;
    out.a.set(m.position.x + fx * BODY.z0, y, m.position.z + fz * BODY.z0);
    out.b.set(m.position.x + fx * BODY.z1, y, m.position.z + fz * BODY.z1);
    out.r = BODY.r * SIZE;
    return out;
}

/** The middle of its body (where spells and arrows are aimed). */
export function spiderCenter(s, out = new THREE.Vector3()) {
    const b = spiderBody(s, _c);
    return out.addVectors(b.a, b.b).multiplyScalar(0.5);
}

/** How far a point is from the spider's body surface (≤ 0: inside it). */
export function spiderDist(s, p) {
    const b = spiderBody(s, _c);
    const ab = _v2.subVectors(b.b, b.a);
    const t = Math.max(0, Math.min(1, _v.subVectors(p, b.a).dot(ab) / ab.lengthSq()));
    return _v.copy(b.a).addScaledVector(ab, t).distanceTo(p) - b.r;
}

/**
 * Where the body stands on the ground: the highest ground under its body (not only
 * under its middle), so on a slope or in a hollow the big body never sinks into earth.
 */
export function spiderGroundY(collision, x, z, ry = 0, reach = null) {
    // (`reach`: in her den — the cave's floor under her, never the mountain's top above it: Collision.groundAt)
    const gy = reach == null || !collision.groundAt ? (a, b) => collision.groundY(a, b) : (a, b) => collision.groundAt(a, b, reach);
    let y = gy(x, z);
    const fx = Math.sin(ry) * SIZE, fz = Math.cos(ry) * SIZE;
    const sx = Math.cos(ry) * SIZE, sz = -Math.sin(ry) * SIZE;
    // (under the head, the tail and both flanks: the body's own footprint)
    for (const [l, w] of [[BODY.z0 - 1, 0], [BODY.z1 + 1.5, 0], [0.8, 1.6], [0.8, -1.6]]) {
        y = Math.max(y, gy(x + fx * l + sx * w, z + fz * l + sz * w) - 0.5 * SIZE);
    }
    return y;
}

export function spiderModel() {
    const g = new THREE.Group();
    const black = new THREE.MeshLambertMaterial({ color: 0x1b1418 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2c2228 });
    const red = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const mark = new THREE.MeshLambertMaterial({ color: 0x8e1b1b });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    box(2.6, 1.5, 2.2, dark, 0, 2.2, -1.2); // head + chest
    box(3.6, 2.6, 4.0, black, 0, 2.8, 2.0); // abdomen
    box(1.2, 0.2, 1.6, mark, 0, 4.12, 2.2); // the red mark
    for (const [x, y] of [[-0.6, 2.6], [0.6, 2.6], [-0.3, 2.85], [0.3, 2.85], [-0.9, 2.3], [0.9, 2.3]]) box(0.22, 0.22, 0.1, red, x, y, -2.32);
    const fangs = [box(0.25, 0.7, 0.25, dark, -0.45, 1.4, -2.3), box(0.25, 0.7, 0.25, dark, 0.45, 1.4, -2.3)];
    const legs = [];
    for (let i = 0; i < 8; i++) {
        const side = i < 4 ? -1 : 1;
        const k = i % 4;
        const hip = new THREE.Group();
        hip.position.set(side * 1.2, 2.4, -1.8 + k * 0.9);
        hip.rotation.y = side * (0.5 - k * 0.35);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, 0.32), black);
        upper.position.x = side * 1.3;
        upper.rotation.z = side * 0.55;
        upper.position.y = 0.65;
        hip.add(upper);
        const knee = new THREE.Group();
        knee.position.set(side * 2.5, 1.35, 0);
        hip.add(knee);
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.26, 3.6, 0.26), black);
        lower.position.set(side * 0.55, -1.7, 0);
        lower.rotation.z = side * 0.3;
        knee.add(lower);
        g.add(hip);
        legs.push(hip);
    }
    g.userData = { legs, fangs };
    // (built in the first spider's units, then grown as a whole: legs, fangs, eyes)
    g.scale.setScalar(SIZE);
    return g;
}

export class Spiders {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.shots = []; // poison / web flying
        this._netT = 0;
        this.slain = new Set(); // (host) lairs whose spider was killed: she never comes back there (saved with the world)
        this._lairs = new Map(); // cell → its lair or null (a cache, cleared when it grows)
        this._lairFn = (gx, gz) => this._lairOf(gx, gz);
        this._near = [];
        this._lairT = 0;
        this._denT = 0;
        this._left = new Map(); // (host, this night) lair → {hp, angry} of a spider taken away because everyone went far
        this.held = null; // (me) seized by a spider: {spider, biteT}
        this.webbed = 0;
        this.enabled = !game.config.map && game.config.mode !== 'test' && game.config.mode !== 'creative';
        // (Creative: no night spiders outside, but her cave — «Где появиться → Логово паучихи» — is hers at any hour: `denOnly`, found by the author 30.10:
        // `enabled` is off there, the whole update returned and she was never made)
        this.denOnly = !this.enabled && !game.config.map && game.config.mode === 'creative';
        this._hud = typeof document !== 'undefined' ? document.getElementById('boss-bar') || this._makeHud() : null;
    }

    get auth() { return this.game.authority; }

    _makeHud() {
        const el = document.createElement('div');
        el.id = 'boss-bar';
        el.innerHTML = '<div class="boss-name">🕷️ Гигантская паучиха</div><div class="boss-track"><div class="boss-fill"></div></div>';
        document.body.appendChild(el);
        return el;
    }

    spawn(pos, id = null, hp = HP) {
        const model = spiderModel();
        model.position.copy(pos);
        this.game.scene.add(model);
        const s = {
            id: id ?? 'sp' + Date.now().toString(36), model, group: model, hp, dead: false, isBoss: true,
            get isDead() { return this.dead; }, get position() { return this.model.position; },
            size: SIZE, bodyCapsule: (out) => spiderBody(s, out),
            home: { x: pos.x, z: pos.z }, lair: null, angry: false, goal: null, wanderT: 0,
            damageCooldown: 0, target: null, walkT: 0, nextAny: 0, nextPoison: 6, nextWeb: 3, nextGrab: 12, holding: null, t: 0,
        };
        this.list.push(s);
        return s;
    }

    _remove(s) {
        this.game.scene.remove(s.model);
        s.model.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        this.list.splice(this.list.indexOf(s), 1);
    }

    /** (host) She was attacked: from now on (till the night is over) she fights. */
    anger(s) {
        if (!s || s.dead || s.angry) return;
        s.angry = true;
        s.goal = null;
        s.nextAny = Math.max(s.nextAny || 0, 1); // (a moment to turn on them)
    }

    /** Targets for weapons. */
    targets() { return this.list.filter((s) => !s.dead); }

    // -------------------------------------------------------------- damage
    hit(s, dmg, kind = null, by = undefined) {
        if (!s || s.dead) return;
        if (!this.auth) { this.game.sync?.bossHit?.(s.id, dmg, kind); return; }
        this.anger(s); // (attacked — even by what can't hurt her: she fights now)
        if (!isGodSpell(kind) && (kind === 'Ice' || kind === 'Frozen' || kind === 'Wind')) return; // it doesn't care (a spell of the gods — it does)
        if (kind === 'AvadaKedavra') dmg = 25;
        s.lastBy = by === undefined ? this.game.localId : by; // (who struck: the killer gets the mana)
        this.game.achievements?.hit('spider', s.id, s.lastBy); // (everyone who took part gets the achievement)
        s.hp = Math.max(0, s.hp - dmg);
        const c = spiderCenter(s, new THREE.Vector3());
        for (let i = 0; i < 10; i++) this.game.fx.spark(c, 0x6bff6b, 0.15 * SIZE, _v2.set((Math.random() - 0.5) * 5 * SIZE, Math.random() * 4 * SIZE, (Math.random() - 0.5) * 5 * SIZE), 0.6);
        if (s.hp <= 0) this._die(s);
    }

    /** A blast at p (Bombardo, lightning…): it hurts if it reaches the body, not only the middle. */
    hitAt(p, radius, dmg, kind, by = undefined) { for (const s of this.list) if (!s.dead && spiderDist(s, p) < radius) this.hit(s, dmg, kind, by); }

    /** A beam / a cone (fire, thunder…) along o + d·t: it hurts when it touches the body. */
    hitRay(o, d, len, width, dmg, kind) {
        const q = new THREE.Vector3();
        let any = false;
        for (const s of this.list) {
            if (s.dead) continue;
            const b = spiderBody(s, _c);
            // (the body's nearest point to the ray, tried along its length)
            let hit = false;
            for (let k = 0; k <= 4 && !hit; k++) {
                q.lerpVectors(b.a, b.b, k / 4);
                const along = _v.subVectors(q, o).dot(d);
                if (along < -b.r || along > len + b.r) continue;
                hit = _v.addScaledVector(d, -Math.max(0, Math.min(len, along))).length() < width + b.r;
            }
            if (hit) { this.hit(s, dmg, kind); any = true; }
        }
        return any;
    }

    /** A duel charge reached it (Авада Кедавра = 20): it touched the body. */
    boltAt(p, spell, by = undefined) {
        for (const s of this.list) {
            if (s.dead || spiderDist(s, p) > 0.3) continue;
            this.boltHit(s, spell, by, p);
            return true;
        }
        return false;
    }

    /** A duel charge touched this spider's body. */
    boltHit(s, spell, by = undefined, p = null) {
        if (this.auth) this.anger(s); // (any duel charge at her is an attack)
        // the strong charges and the ice («Айс Максима» by the part it hit — StrongMagic; plain «Айс»: no effect)
        if (this.game.strong?.boltHit?.('s', s, spell, by, p)) return;
        if (spell === 'Expelliarmus') return; // (no wand, no weapon in its legs: nothing to knock out — no effect)
        if (spell === 'Disarmor') return; // (its shell is its own: nothing to take off — no effect, ArmorTypes.DISARMOR_TARGETS)
        if (spell === 'Jolt' || spell === 'JoltMaxima') { this.jolt(s, spell, by); return; }
        this.hit(s, spell === 'AvadaKedavra' ? 25 : spell === 'SapiraDuel' ? 10 : 4, spell, by);
    }

    /**
     * (host) «Джолт» on the spider: too big and too many legs to be thrown over — it only reels back
     * a little (Maxima: further) and is dazed for a moment (no tricks); no damage.
     */
    jolt(s, spell, by = undefined) {
        const g = this.game, max = spell === 'JoltMaxima';
        this.anger(s);
        const p = s.model.position;
        const from = by != null ? g.duel?._casterAt?.(by, { group: s.model }) : null;
        const d = _v.set(from ? p.x - from.x : -Math.sin(s.model.rotation.y), 0, from ? p.z - from.z : -Math.cos(s.model.rotation.y));
        if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
        d.normalize().multiplyScalar(max ? 9 : 3);
        s.reel = { vx: d.x, vz: d.z, t: max ? 1.2 : 0.6, T: max ? 1.2 : 0.6 };
        s.nextAny = Math.max(s.nextAny || 0, max ? 4 : 2);
    }

    byId(id) { return this.list.find((s) => s.id === id && !s.dead) || null; }

    _die(s, killer = s.lastBy) {
        s.dead = true;
        const g = this.game;
        s.killer = killer || null;
        if (this.auth && s.lair) this.slain.add(s.lair); // (she never comes back to this lair)
        if (killer && (killer === g.localId || killer === 'local')) g.mana?.magicKill('spider'); // (mana: the first one, to whoever struck the last blow — every computer knows the killer)
        if (this.held?.spider === s) this._free();
        const c = spiderCenter(s, new THREE.Vector3());
        if (this.auth) g.achievements?.killed('spider', s.id, killer, c); // (the achievement: to all who took part — the host decides)
        for (let i = 0; i < 80; i++) g.fx.spark(c, i % 2 ? 0x6bff6b : 0x222222, 0.25 * SIZE, _v2.set((Math.random() - 0.5) * 12 * SIZE, Math.random() * 8 * SIZE, (Math.random() - 0.5) * 12 * SIZE), 1.4);
        g.hud.notify?.('🕷️ Гигантская паучиха побеждена!');
        // treasure: always a wand, and more
        if (this.auth && !s.annihilated) { // («Дай»: her things are gone with her — StrongMagic.annihilate)
            const p = s.model.position.clone().add(_v.set(0, 2.2 * SIZE, 0));
            // (and its web: a skein of it — an ingredient of the invisibility potion, Potions.js)
            [rollWand(), { kind: 'web', uid: newUid(), count: 1 }, ...rollLoot(Math.random, { key: 0 })].forEach((it, i) => { // (its wand is the precious thing)
                if (it.kind === 'weapon') return;
                g.items.spawnLoose(it, p.clone().add(_v2.set((i - 1) * 0.9 * SIZE, 0, 0)), { hover: true });
            });
        }
        setTimeout(() => this._remove(s), 1500);
        s.model.rotation.z = Math.PI;
    }

    // ------------------------------------------------------------- tricks
    _shoot(s, kind, toId) {
        const g = this.game;
        const tp = this._playerPos(toId);
        if (!tp) return;
        // (from its mouth: as high and as far forward as its grown head)
        const from = s.model.position.clone().add(_v.set(0, 2.2 * SIZE, 0)).addScaledVector(_v2.set(-Math.sin(s.model.rotation.y), 0, -Math.cos(s.model.rotation.y)), 2.4 * SIZE);
        this._fire(kind, from, toId);
        g.sync?.bossShot?.(kind, from, toId);
    }

    _fire(kind, from, toId) {
        const mesh = new THREE.Mesh(kind === 'web' ? new THREE.TorusGeometry(0.45 * SIZE, 0.06 * SIZE, 4, 12) : new THREE.SphereGeometry(0.3 * SIZE, 8, 6), new THREE.MeshBasicMaterial({ color: kind === 'web' ? 0xeeeeee : 0x5cff3a, transparent: true, opacity: 0.85 }));
        mesh.position.copy(from);
        this.game.scene.add(mesh);
        this.shots.push({ kind, mesh, toId, life: 4 });
    }

    _updateShots(dt) {
        const g = this.game;
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const sh = this.shots[i];
            sh.life -= dt;
            const tp = this._playerPos(sh.toId);
            if (!tp || sh.life <= 0) { this._dropShot(i); continue; }
            const goal = _v.copy(tp).add(_v2.set(0, 0.6, 0));
            const to = _v2.subVectors(goal, sh.mesh.position);
            const d = to.length();
            sh.mesh.position.addScaledVector(to.normalize(), Math.min(d, 16 * dt));
            const q = sh.mesh.position;
            if (g.collision?.pointBlocked?.(q.x, q.y, q.z)) { g.fx.spark(q, sh.kind === 'web' ? 0xffffff : 0x5cff3a, 0.12, _v2.set(0, 1, 0), 0.5); this._dropShot(i); continue; } // (rock, a wall: it splashes there, never flies through)
            sh.mesh.rotation.x += dt * 8;
            if (Math.random() < 0.6) g.fx.spark(sh.mesh.position, sh.kind === 'web' ? 0xffffff : 0x5cff3a, 0.08, _v2.set(0, 0.5, 0), 0.4);
            if (d < 0.8) {
                if (sh.toId === g.localId) this._iAmHit(sh.kind, sh.mesh.position);
                this._dropShot(i);
            }
        }
    }

    _dropShot(i) {
        const sh = this.shots[i];
        this.game.scene.remove(sh.mesh);
        sh.mesh.geometry.dispose(); sh.mesh.material.dispose();
        this.shots.splice(i, 1);
    }

    /** Poison / web reached me. */
    _iAmHit(kind, from) {
        const g = this.game;
        if (g.combat.shieldFactor(from) >= 1 && g.combat._blocked(from, kind === 'web' ? 'web' : 'poison')) return; // (not a spell: it costs the shield no mana)
        if (kind === 'poison') {
            if (g.combat.enabled) g.combat.damage(7, null, 'poison'); else g.damageLocalPlayer(7);
            g.hud.setVoice('☠️ Яд паучихи: −7 HP', true);
            for (let i = 0; i < 20; i++) g.fx.spark(g.combat.center(_v), 0x5cff3a, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.8);
        } else {
            this.webbed = 4;
            g.hud.setVoice('🕸️ Вас опутала паутина — 4 секунды не двинуться!', true);
        }
    }

    /** (me) seized: −5 now and every 5 s; only Protection Maxima frees. */
    _seized(s) {
        const g = this.game;
        this.held = { spider: s, biteT: 5 };
        if (g.combat.enabled) g.combat.damage(5, null, 'bite'); else g.damageLocalPlayer(5);
        g.hud.setVoice('🕷️ Паучиха схватила вас! Только «Protection Maxima» освободит', true);
    }

    _free() {
        const s = this.held?.spider;
        this.held = null;
        if (s) s.holding = null;
        this.game.sync?.bossFree?.(s?.id);
    }

    /** (from Game) Protection Maxima was cast: break free. */
    onDome() {
        if (!this.held) return;
        const s = this.held.spider;
        this._free();
        const g = this.game;
        g.knockback.add(_v.subVectors(g.character.group.position, s.model.position).setY(0).normalize().multiplyScalar(10).setY(4));
        g.hud.setVoice('🛡️ Вы вырвались!', true);
    }

    _playerPos(id) {
        const g = this.game;
        const seen = (p) => (p && g.invis ? g.invis.aiPos(id === 'local' ? g.localId : id, p, true) : p); // (a boss: she sees the invisible)  (an invisible player: only where they were last noticed, for a few seconds — Invisibility.aiPos)
        if (id === g.localId || id === 'local') return g.isDeadLocal || g.combat.dead ? null : seen(g.character.group.position);
        const r = g.remotes.get(id);
        return r && !r.dead ? seen(r.position) : null;
    }

    _nearestPlayer(p) {
        const g = this.game;
        let best = null;
        const consider = (id, pos) => { if (!pos) return; const d = pos.distanceTo(p); if (!best || d < best.d) best = { id, d }; };
        consider(g.localId, this._playerPos(g.localId));
        for (const [id] of g.remotes) consider(id, this._playerPos(id));
        return best;
    }

    // --------------------------------------------------------------- frame
    _think(s, dt) {
        const g = this.game;
        s.t += dt;
        const near = s.angry ? this._nearestPlayer(s.model.position) : null; // (calm: she goes after nobody)
        s.target = near?.id || null;
        const tp = near ? this._playerPos(near.id) : null;
        const p = s.model.position;
        let moving = false;
        // «Айс Максима» (StrongMagic): a leg / the trunk in ice — slower; its head — no tricks (nextAny); Accentric's haze — slower, half the tricks fail
        s.iceSlowT = Math.max(0, (s.iceSlowT || 0) - dt); s.iceHeadT = Math.max(0, (s.iceHeadT || 0) - dt);
        const slowK = (s.legK ?? 1) * (s.iceSlowT > 0 ? s.iceSlowK || 0.5 : 1) * (s.accT > 0 ? 0.6 : 1);
        if (s.iceHeadT > 0) s.model.rotation.z = 0.1 * Math.sin(s.t * 10);
        if (s.holding) {
            // holding someone: stands still, the victim's computer takes the bites
            const hp = this._playerPos(s.holding);
            if (!hp) s.holding = null;
        } else if (s.reel) {
            // reeling back from a «Джолт»: the legs scramble, it slides back and sways
            p.x += s.reel.vx * dt; p.z += s.reel.vz * dt;
            s.reel.vx *= Math.max(0, 1 - 3 * dt); s.reel.vz *= Math.max(0, 1 - 3 * dt);
            s.reel.t -= dt;
            s.model.rotation.z = 0.12 * Math.sin((s.reel.T - s.reel.t) * 14) * Math.max(0, s.reel.t / s.reel.T);
            if (s.reel.t <= 0) { s.reel = null; s.model.rotation.z = 0; }
            moving = true;
        } else if (tp && near.d > STOP * SIZE) {
            const to = _v.set(tp.x - p.x, 0, tp.z - p.z).normalize();
            // (round the others on its way — trees that walk, beasts, people it isn't after; Crowd.js)
            const a = crowdStep(g, s, p, to.x, to.z, near.d - STOP * SIZE, { r: BODY_R.spider, speed: SPEED * slowK, dt, look: 5, dy: 4 });
            if (a) { to.set(a.x, 0, a.z); p.addScaledVector(to, SPEED * slowK * dt); } // (legs cut off: slower)
            s.model.rotation.y = turnToward(s.model.rotation.y, Math.atan2(-to.x, -to.z), SPIDER_TURN * dt);
            moving = true;
        } else if (tp) s.model.rotation.y = turnToward(s.model.rotation.y, yawTo(p.x, p.z, tp.x, tp.z), SPIDER_TURN * dt); // (a big body: it turns, never spins round at once)
        else if (!s.angry) moving = this._wander(s, dt, slowK);
        p.y += (spiderGroundY(g.collision, p.x, p.z, s.model.rotation.y, s.den ? p.y + 3 : null) - p.y) * Math.min(1, dt * 6);
        // («не видит — не нападает»: rock, a wall, a hill between them — no tricks; checked 4 times a second)
        s.seeT = (s.seeT || 0) - dt;
        if (!tp) s.sees = false;
        else if (s.seeT <= 0) { s.seeT = 0.25; s.sees = this._sees(s, tp); }
        // tricks (at least 3 s apart)
        s.nextPoison -= dt; s.nextWeb -= dt; s.nextGrab -= dt; s.nextAny -= dt;
        // («лицом к цели»: it grabs and spits only at one right in front of it)
        if (tp && s.sees && s.nextAny <= 0 && !s.holding && facesTarget(s.model.rotation.y, p.x, p.z, tp.x, tp.z, FACE.SHOT)) {
            if (confusedMiss(s)) s.nextAny = 3; // (lost in the haze: the trick goes nowhere)
            else if (s.nextGrab <= 0 && near.d < GRAB * SIZE) {
                s.nextGrab = 30; s.nextAny = 3;
                if (Math.random() < 0.44) {
                    s.holding = near.id;
                    if (near.id === g.localId) this._seized(s);
                    else g.sync?.bossGrab?.(s.id, near.id);
                }
            } else if (s.nextPoison <= 0 && near.d < 30 * SIZE) { s.nextPoison = 15; s.nextAny = 3; this._shoot(s, 'poison', near.id); }
            else if (s.nextWeb <= 0 && near.d < 25 * SIZE) { s.nextWeb = 7; s.nextAny = 3; this._shoot(s, 'web', near.id); }
        }
        this._animate(s, moving ? 1 : 0, dt);
    }

    /** Can she see a player at `tp` from her mouth (nothing solid between)? */
    _sees(s, tp) {
        const col = this.game.collision, m = s.model, ry = m.rotation.y;
        const fx = m.position.x - Math.sin(ry) * 2.4 * SIZE, fy = m.position.y + 2.2 * SIZE, fz = m.position.z - Math.cos(ry) * 2.4 * SIZE;
        return col?.lineOfSight?.(fx, fy, fz, tp.x, tp.y + 1, tp.z, 1) !== false;
    }

    /** Calm: she wanders slowly round her lair, now and then sits still. */
    _wander(s, dt, slowK) {
        const p = s.model.position;
        s.wanderT -= dt;
        if (s.wanderT <= 0) {
            s.wanderT = 4 + Math.random() * 6;
            const a = Math.random() * Math.PI * 2, r = Math.random() * HOME_R;
            s.goal = Math.random() < 0.4 ? null : { x: s.home.x + Math.cos(a) * r, z: s.home.z + Math.sin(a) * r };
        }
        if (!s.goal) return false;
        const dx = s.goal.x - p.x, dz = s.goal.z - p.z, d = Math.hypot(dx, dz);
        if (d < 1) { s.goal = null; return false; }
        const to = _v.set(dx / d, 0, dz / d);
        const sp = CALM_SPEED * slowK;
        const a = crowdStep(this.game, s, p, to.x, to.z, d, { r: BODY_R.spider, speed: sp, dt, look: 5, dy: 4 });
        if (!a) return false; // (someone in her way: she waits)
        to.set(a.x, 0, a.z);
        p.addScaledVector(to, Math.min(d, sp * dt));
        s.model.rotation.y = turnToward(s.model.rotation.y, Math.atan2(-to.x, -to.z), SPIDER_TURN * dt);
        return true;
    }

    _animate(s, k, dt) {
        s.walkT += dt * 7 * k;
        s.model.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(s.walkT + i * 1.3) * 0.35 * k; });
        const f = s.holding ? Math.sin(performance.now() / 120) * 0.3 : 0;
        s.model.userData.fangs.forEach((m, i) => { m.rotation.z = (i ? -1 : 1) * f; });
    }

    update(dt) {
        if (!this.enabled && !this.denOnly) return;
        const g = this.game;
        const night = g.isNight && this.enabled;
        // at night she is out at her lairs near the players (the host decides)
        if (this.auth) {
            this._denT -= dt;
            if (this._denT <= 0) { this._denT = 1; this._visitDens(); } // (her cave is dark day and night: she is there at any hour)
            if (night) {
                this._lairT -= dt;
                if (this._lairT <= 0) { this._lairT = 1; this._visitLairs(); } // (once a second is plenty)
            } else if (this.enabled) {
                for (const s of [...this.list]) if (!s.dead && !s.imp && !s.den) this._remove(s); // hides at dawn (not while a mind is in her: «Империус Максима»)
                this._left.clear();
            }
            for (const s of this.list) if (!s.dead && !s.lev && !(s.imp && g.imperius?.step('sp', s, dt))) this._think(s, dt); // (held up by «Левиоса Максима»: it carries her; a mind in her — ImperiusControl.step)
        } else {
            for (const s of this.list) if (s.imp?.mine && !s.dead && g.imperius?.step('sp', s, dt)) { /* (my mind in her) */ } else if (s.net) { s.model.position.lerp(s.net, Math.min(1, dt * 6)); this._animate(s, s.netMoving ? 1 : 0, dt); }
        }
        this._updateShots(dt);
        // me: webbed / held
        if (this.webbed > 0) { this.webbed -= dt; g.combat.webbed = this.webbed > 0; }
        else g.combat.webbed = false;
        if (this.held) {
            const s = this.held.spider;
            if (!s || s.dead || !this.list.includes(s)) this._free();
            else {
                const mouth = _v.copy(s.model.position).add(_v2.set(-Math.sin(s.model.rotation.y) * MOUTH.fwd * SIZE, MOUTH.up * SIZE, -Math.cos(s.model.rotation.y) * MOUTH.fwd * SIZE));
                g.character.group.position.lerp(mouth, Math.min(1, dt * 8));
                this.held.biteT -= dt;
                if (this.held.biteT <= 0) {
                    this.held.biteT = 5;
                    if (g.combat.enabled) g.combat.damage(5, null, 'bite'); else g.damageLocalPlayer(5);
                    g.hud.setVoice('🕷️ Укус! Скажите «Protection Maxima»', true);
                }
            }
        }
        // boss bar
        if (this._hud) {
            // (only in a fight: a calm spider gives herself away by nothing — she has to be found)
            const s = this.list.find((x) => !x.dead && x.angry && x.model.position.distanceTo(g.character.group.position) < 70 * SIZE);
            this._hud.style.display = s ? 'block' : 'none';
            if (s) this._hud.querySelector('.boss-fill').style.width = (100 * s.hp / HP).toFixed(1) + '%';
        }
        this._netSend(dt);
    }

    /** A cell's lair (cached; the cache never grows without end). */
    _lairOf(gx, gz) {
        const key = gx * 65536 + gz;
        if (this._lairs.has(key)) return this._lairs.get(key);
        if (this._lairs.size > 256) this._lairs.clear();
        const t = this.game.terrain?.data, H = t?.heightAt;
        // (dry land only, never on a castle's / a tower's land or in its village)
        // (and never in a cave: away from the caves and the dragons' lairs — «в пещерах паучиха не живёт»)
        const L = H ? spiderLairOf(gx, gz, this.game.seed, (x, z) => { H(x, z); return !!(H.water || H.sea || t.sites?.landAt(x, z) || t.cavesNear?.(x, z, 30)?.length || t.lairsNear?.(x, z, 40)?.length); }) : null;
        this._lairs.set(key, L);
        return L;
    }

    /** (host, at night) The spiders of the lairs near the players are out; the ones everyone left far behind go. */
    _visitLairs() {
        const g = this.game;
        const ps = [];
        if (g.character?.group) ps.push(g.character.group.position);
        for (const [, r] of g.remotes || []) if (r?.position) ps.push(r.position);
        for (const p of ps) {
            if (!earthly(p)) continue; // (never on another planet)
            for (const L of spiderLairsNear(p.x, p.z, LAIR_NEAR, this._lairFn, this._near)) {
                if (this.slain.has(L.id) || this.list.some((s) => s.lair === L.id)) continue;
                const t = g.terrain?.data;
                if (t?.hasChunk && !t.hasChunk(Math.floor(L.x / 32), Math.floor(L.z / 32))) continue; // (its ground not loaded yet: never made in the rock — nor the ground made in a frame)
                const was = this._left.get(L.id);
                this._left.delete(L.id);
                const pos = new THREE.Vector3(L.x, spiderGroundY(g.collision, L.x, L.z), L.z);
                const s = this.spawn(pos, 'sp' + L.id.replace(',', '_'), was?.hp ?? HP);
                s.lair = L.id;
                s.angry = !!was?.angry;
                s.model.rotation.y = Math.random() * Math.PI * 2;
            }
        }
        for (const s of [...this.list]) {
            if (s.dead || !s.lair || s.holding) continue;
            const q = s.model.position;
            if (ps.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < LAIR_GONE)) continue;
            if (s.hp < HP || s.angry) this._left.set(s.lair, { hp: s.hp, angry: s.angry });
            this._remove(s);
        }
    }

    /**
     * (host) Her cave (worlds with the places apart — SpiderDens.js): the spider lies at the back of the hall whenever a player is
     * near, day or night (the cave is dark either way); far from everybody she is put away again with her health kept.
     * Never made in the rock or before the ground is there (no ground made in a frame).
     */
    _visitDens() {
        const g = this.game, t = g.terrain?.data;
        if (!t?.densNear) return;
        const ps = [];
        if (g.character?.group) ps.push(g.character.group.position);
        for (const [, r] of g.remotes || []) if (r?.position) ps.push(r.position);
        for (const p of ps) {
            if (!earthly(p)) continue;
            for (const D of t.densNear(p.x, p.z, LAIR_NEAR)) {
                const L = D.lair;
                if (this.slain.has(L.id) || this.list.some((s) => s.lair === L.id)) continue;
                if (!denAxisPoints(L).every((q) => t.landMade(q.x, q.z)) || !t.landMade(L.mouth.x, L.mouth.z)) continue; // (the whole hall's ground here first)
                const at = denSpots(L, (x, z) => { let n = 0; while (n < 16 && t.get(Math.round(x), L.F + 1 + n, Math.round(z)) === BLOCK.AIR) n++; return n; }).spider; // (under the dome's high middle: she is ~9 m tall)
                const was = this._left.get(L.id);
                this._left.delete(L.id);
                const pos = new THREE.Vector3(at.x, spiderGroundY(g.collision, at.x, at.z, 0, L.F + 1.5), at.z);
                const s = this.spawn(pos, 'sp' + L.id, was?.hp ?? HP);
                s.lair = L.id; s.den = true;
                s.angry = !!was?.angry;
                s.model.rotation.y = Math.atan2(-L.dx, -L.dz); // (her face to the mouth: she sees who comes in)
            }
        }
        for (const s of [...this.list]) {
            if (s.dead || !s.den || s.holding) continue;
            const q = s.model.position;
            if (ps.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < LAIR_GONE)) continue;
            if (s.hp < HP || s.angry) this._left.set(s.lair, { hp: s.hp, angry: s.angry });
            this._remove(s);
        }
    }

    /** (host) For the world's save: the lairs whose spider was killed. */
    snapshot() { return [...this.slain]; }
    restore(a) { this.slain = new Set(Array.isArray(a) ? a : []); }

    _netSend(dt) {
        const g = this.game;
        if (!this.auth || !g.sync) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.1;
        const r = (v) => Math.round(v * 100) / 100;
        g.sync.bosses?.(this.list.map((s) => [s.id, r(s.model.position.x), r(s.model.position.y), r(s.model.position.z), r(s.model.rotation.y), Math.round(s.hp), s.dead ? 1 : 0, s.holding || 0, s.killer || 0, s.angry ? 1 : 0]));
    }

    /** (guests) the host's spiders. */
    applyNet(list) {
        const seen = new Set();
        for (const [id, x, y, z, ry, hp, dead, holding, killer, angry] of list || []) {
            seen.add(id);
            let s = this.list.find((q) => q.id === id);
            if (!s) s = this.spawn(new THREE.Vector3(x, y, z), id, hp);
            const prev = s.net ? s.net.clone() : null;
            s.net = (s.net || new THREE.Vector3()).set(x, y, z);
            s.netMoving = prev ? prev.distanceTo(s.net) > 0.05 : false;
            s.model.rotation.y = ry;
            s.hp = hp;
            s.holding = holding || null;
            s.angry = !!angry;
            if (dead && !s.dead) this._die(s, killer || null);
        }
        for (const s of [...this.list]) if (!seen.has(s.id) && !s.dead) this._remove(s);
    }

    dispose() {
        for (const s of [...this.list]) this._remove(s);
        for (let i = this.shots.length - 1; i >= 0; i--) this._dropShot(i);
        if (this._hud) this._hud.style.display = 'none';
    }
}
