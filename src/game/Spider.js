/**
 * Spider.js — the boss: a giant spider that comes out at night.
 *
 *  - 200 HP. Comes once a night to a player, hides again at dawn.
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

import * as THREE from 'three';
import { rollWand, rollLoot } from './ItemTypes.js';

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
export function spiderGroundY(collision, x, z, ry = 0) {
    let y = collision.groundY(x, z);
    const fx = Math.sin(ry) * SIZE, fz = Math.cos(ry) * SIZE;
    const sx = Math.cos(ry) * SIZE, sz = -Math.sin(ry) * SIZE;
    // (under the head, the tail and both flanks: the body's own footprint)
    for (const [l, w] of [[BODY.z0 - 1, 0], [BODY.z1 + 1.5, 0], [0.8, 1.6], [0.8, -1.6]]) {
        y = Math.max(y, collision.groundY(x + fx * l + sx * w, z + fz * l + sz * w) - 0.5 * SIZE);
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
        this._nightDone = false;
        this.held = null; // (me) seized by a spider: {spider, biteT}
        this.webbed = 0;
        this.enabled = !game.config.map && game.config.mode !== 'test' && game.config.mode !== 'creative';
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

    /** Targets for weapons. */
    targets() { return this.list.filter((s) => !s.dead); }

    // -------------------------------------------------------------- damage
    hit(s, dmg, kind = null, by = undefined) {
        if (!s || s.dead) return;
        if (kind === 'Ice' || kind === 'Frozen' || kind === 'Wind') return; // it doesn't care
        if (kind === 'AvadaKedavra') dmg = 25;
        if (!this.auth) { this.game.sync?.bossHit?.(s.id, dmg, kind); return; }
        s.lastBy = by === undefined ? this.game.localId : by; // (who struck: the killer gets +20 mana)
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
            this.boltHit(s, spell, by);
            return true;
        }
        return false;
    }

    /** A duel charge touched this spider's body. */
    boltHit(s, spell, by = undefined) { this.hit(s, spell === 'AvadaKedavra' ? 25 : spell === 'SapiraDuel' ? 10 : 4, spell, by); }

    byId(id) { return this.list.find((s) => s.id === id && !s.dead) || null; }

    _die(s, killer = s.lastBy) {
        s.dead = true;
        const g = this.game;
        s.killer = killer || null;
        if (killer && (killer === g.localId || killer === 'local')) g.mana?.spiderKilled(); // +20 to the mana maximum
        if (this.held?.spider === s) this._free();
        const c = spiderCenter(s, new THREE.Vector3());
        for (let i = 0; i < 80; i++) g.fx.spark(c, i % 2 ? 0x6bff6b : 0x222222, 0.25 * SIZE, _v2.set((Math.random() - 0.5) * 12 * SIZE, Math.random() * 8 * SIZE, (Math.random() - 0.5) * 12 * SIZE), 1.4);
        g.hud.notify?.('🕷️ Гигантская паучиха побеждена!');
        // treasure: always a wand, and more
        if (this.auth) {
            const p = s.model.position.clone().add(_v.set(0, 2.2 * SIZE, 0));
            [rollWand(), ...rollLoot(Math.random, { key: 0 })].forEach((it, i) => { // (its wand is the precious thing)
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
        if (g.combat.shieldFactor(from) >= 1) { g.combat._blocked(from, kind === 'web' ? 'Sands' : 'Thunderwave'); return; }
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
        if (id === g.localId || id === 'local') return g.isDeadLocal || g.combat.dead ? null : g.character.group.position;
        const r = g.remotes.get(id);
        return r && !r.dead ? r.position : null;
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
        const near = this._nearestPlayer(s.model.position);
        s.target = near?.id || null;
        const tp = near ? this._playerPos(near.id) : null;
        const p = s.model.position;
        let moving = false;
        if (s.holding) {
            // holding someone: stands still, the victim's computer takes the bites
            const hp = this._playerPos(s.holding);
            if (!hp) s.holding = null;
        } else if (tp && near.d > STOP * SIZE) {
            const to = _v.set(tp.x - p.x, 0, tp.z - p.z).normalize();
            p.addScaledVector(to, SPEED * (s.legK ?? 1) * dt); // (legs cut off: slower)
            s.model.rotation.y = Math.atan2(-to.x, -to.z);
            moving = true;
        } else if (tp) s.model.rotation.y = Math.atan2(-(tp.x - p.x), -(tp.z - p.z));
        p.y += (spiderGroundY(g.collision, p.x, p.z, s.model.rotation.y) - p.y) * Math.min(1, dt * 6);
        // tricks (at least 3 s apart)
        s.nextPoison -= dt; s.nextWeb -= dt; s.nextGrab -= dt; s.nextAny -= dt;
        if (tp && s.nextAny <= 0 && !s.holding) {
            if (s.nextGrab <= 0 && near.d < GRAB * SIZE) {
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

    _animate(s, k, dt) {
        s.walkT += dt * 7 * k;
        s.model.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(s.walkT + i * 1.3) * 0.35 * k; });
        const f = s.holding ? Math.sin(performance.now() / 120) * 0.3 : 0;
        s.model.userData.fangs.forEach((m, i) => { m.rotation.z = (i ? -1 : 1) * f; });
    }

    update(dt) {
        if (!this.enabled) return;
        const g = this.game;
        const night = g.isNight;
        // one spider a night (the host decides)
        if (this.auth) {
            if (night && !this._nightDone && !this.list.length) {
                const me = g.character.group.position;
                const a = Math.random() * Math.PI * 2;
                const p = new THREE.Vector3(me.x + Math.cos(a) * 40, 0, me.z + Math.sin(a) * 40);
                p.y = spiderGroundY(g.collision, p.x, p.z);
                this.spawn(p);
                this._nightDone = true;
                g.hud.notify?.('🕷️ Из темноты выходит гигантская паучиха...');
                g.sync?.bossNotice?.();
            }
            if (!night) {
                this._nightDone = false;
                for (const s of [...this.list]) if (!s.dead) this._remove(s); // hides at dawn
            }
            for (const s of this.list) if (!s.dead) this._think(s, dt);
        } else {
            for (const s of this.list) if (s.net) { s.model.position.lerp(s.net, Math.min(1, dt * 6)); this._animate(s, s.netMoving ? 1 : 0, dt); }
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
            const s = this.list.find((x) => !x.dead && x.model.position.distanceTo(g.character.group.position) < 70 * SIZE);
            this._hud.style.display = s ? 'block' : 'none';
            if (s) this._hud.querySelector('.boss-fill').style.width = (100 * s.hp / HP).toFixed(1) + '%';
        }
        this._netSend(dt);
    }

    _netSend(dt) {
        const g = this.game;
        if (!this.auth || !g.sync) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.1;
        const r = (v) => Math.round(v * 100) / 100;
        g.sync.bosses?.(this.list.map((s) => [s.id, r(s.model.position.x), r(s.model.position.y), r(s.model.position.z), r(s.model.rotation.y), Math.round(s.hp), s.dead ? 1 : 0, s.holding || 0, s.killer || 0]));
    }

    /** (guests) the host's spiders. */
    applyNet(list) {
        const seen = new Set();
        for (const [id, x, y, z, ry, hp, dead, holding, killer] of list || []) {
            seen.add(id);
            let s = this.list.find((q) => q.id === id);
            if (!s) s = this.spawn(new THREE.Vector3(x, y, z), id, hp);
            const prev = s.net ? s.net.clone() : null;
            s.net = (s.net || new THREE.Vector3()).set(x, y, z);
            s.netMoving = prev ? prev.distanceTo(s.net) > 0.05 : false;
            s.model.rotation.y = ry;
            s.hp = hp;
            s.holding = holding || null;
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
