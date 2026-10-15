/**
 * Cannons.js — the guns of the ships and of the sea castles' ports.
 *
 * Loading is done by hand: take a cannonball from the shot rack beside the gun
 * (close the fingers on a ball), carry it to the gun's muzzle and put it in
 * (the ball leaves the hand into the barrel). «Fire» said with the hand at the
 * gun lights its fuse (no campfire needed); a moment later it fires: smoke, a
 * boom, the barrel jumps back, and the ball flies. It knocks holes in ships (the
 * sea comes in; enough holes and the ship sinks) and in walls (the port's stone),
 * and hurts whoever it hits. An empty gun only bangs.
 *
 * Multiplayer: the host decides what the ball breaks; everybody sees the shot.
 */

import * as THREE from 'three';
import { WATER_LEVEL_Y } from '../world/Terrain.js';
import { newUid } from './ItemTypes.js';

const FUSE = 1.6; // s
const BALL_SPEED = 70; // m/s
const GRAV = 9.8;
const TAKE_R = 0.55; // m: fingers closing this near a ball on the rack take it
const LOAD_R = 0.7; // m: a ball held this near the muzzle goes in
const CLOSE_CURL = 0.55, OPEN_CURL = 0.35, CLOSE_WINDOW = 900;
const LIGHT_RANGE = 30;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _o = { x: 0, y: 0, z: 0 };
const _l = { x: 0, y: 0, z: 0 };

let BALL_GEO = null;
const ballGeo = () => BALL_GEO || (BALL_GEO = new THREE.SphereGeometry(0.32, 10, 8));
const IRON = () => new THREE.MeshLambertMaterial({ color: 0x2b2b2e });

/** A gun on a port's wall (world-placed), with its own model and shot rack. */
function portGunModel() {
    const g = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x5a3a20 });
    const iron = IRON();
    const car = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.75, 2.4), wood);
    car.position.y = 0.38;
    g.add(car);
    for (const sx of [-0.75, 0.75]) for (const sz of [-0.9, 0.9]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 8), wood);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx, 0.3, sz);
        g.add(w);
    }
    const barrel = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.55, 3.0, 12), iron);
    b.rotation.x = -Math.PI / 2; // along −z (forward)
    barrel.add(b);
    const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    fuse.position.set(0, 0.5, 1.1);
    barrel.add(fuse);
    const ball = new THREE.Mesh(ballGeo(), iron);
    ball.position.set(0, 0, -1.25);
    ball.visible = false;
    barrel.add(ball);
    barrel.position.y = 1.35;
    g.add(barrel);
    const rack = new THREE.Group();
    const rb = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.2), wood);
    rb.position.y = 0.35;
    rack.add(rb);
    const balls = [];
    for (let k = 0; k < 6; k++) {
        const m = new THREE.Mesh(ballGeo(), iron);
        m.position.set((k % 2) * 0.4 - 0.2, 0.95, Math.floor(k / 2) * 0.4 - 0.4);
        rack.add(m);
        balls.push(m);
    }
    rack.position.set(2.0, 0, 0.6);
    g.add(rack);
    return { group: g, barrel, fuse, ball, balls };
}

export class Cannons {
    constructor(game, ships) {
        this.game = game;
        this.ships = ships;
        this.port = new Map(); // id → {id, x, y, z, yaw, loaded, fuse, recoil, balls, model}
        this.flying = []; // cannonballs in the air
        this._open = { left: 0, right: 0 };
        this._pf = { left: {}, right: {} };
        this.input = null; // (tests) side → {G, curl}
    }

    get auth() { return this.game.authority; }

    /** (from Ships._scan) a port's guns: [{x, y, z, yaw}] — y is the floor they stand on. */
    addPortGuns(castleId, list) {
        list.forEach((c, k) => {
            const id = `${castleId}:gun${k}`;
            if (this.port.has(id)) return;
            const gun = { id, port: true, x: c.x, y: c.y, z: c.z, yaw: c.yaw || 0, loaded: false, fuse: 0, recoil: 0, balls: 6, model: null };
            const saved = this._saved?.get(id);
            if (saved) { gun.loaded = !!saved.l; gun.balls = saved.b ?? 6; }
            this.port.set(id, gun);
        });
    }

    /** Every gun near a point: {gun, ship|null, state, muzzle (world), dir (world), fusePt (world)}. */
    *_guns() {
        for (const s of this.ships.awake) {
            for (const spec of s.layout.cannons) {
                const st = s.guns.get(spec.id);
                if (st) yield { key: s.id + '/' + spec.id, ship: s, spec, st };
            }
        }
        for (const gun of this.port.values()) yield { key: gun.id, ship: null, spec: gun, st: gun };
    }

    _muzzle(G, out) {
        if (G.ship) { const m = G.spec.muzzle; G.ship.pose.toWorld(m.x, m.y, m.z, _o); return out.set(_o.x, _o.y, _o.z); }
        const g = G.spec;
        return out.set(g.x - Math.sin(g.yaw) * 1.45, g.y + 1.35, g.z - Math.cos(g.yaw) * 1.45);
    }

    _dir(G, out) {
        if (G.ship) { G.ship.pose.dirToWorld(G.spec.side, 0, _o); return out.set(_o.x, 0.02, _o.z).normalize(); }
        return out.set(-Math.sin(G.spec.yaw), 0.02, -Math.cos(G.spec.yaw)).normalize();
    }

    _fusePt(G, out) {
        if (G.ship) {
            const sp = G.spec;
            G.ship.pose.toWorld(sp.x - sp.side * 1.1, sp.y + 1.85, sp.z, _o);
            return out.set(_o.x, _o.y, _o.z);
        }
        const g = G.spec;
        return out.set(g.x + Math.sin(g.yaw) * 1.1, g.y + 1.85, g.z + Math.cos(g.yaw) * 1.1);
    }

    /** The racks: {key, ship|null, id, n, pos (world)} */
    *_racks() {
        for (const s of this.ships.awake) {
            for (const r of s.layout.racks) yield { key: s.id + '/' + r.id, ship: s, id: r.id, n: s.racks.get(r.id) ?? 0, local: r };
        }
        for (const gun of this.port.values()) yield { key: gun.id + '/rack', ship: null, id: gun.id, n: gun.balls, gun };
    }

    _rackPos(R, out) {
        if (R.ship) { R.ship.pose.toWorld(R.local.x, R.local.y + 0.25, R.local.z, _o); return out.set(_o.x, _o.y, _o.z); }
        const g = R.gun;
        const c = Math.cos(g.yaw), s = Math.sin(g.yaw);
        return out.set(g.x + 2.0 * c + 0.6 * s, g.y + 0.95, g.z - 2.0 * s + 0.6 * c);
    }

    /** Is this hand busy with a cannonball? (it does not take the wheel then) */
    busy(side) {
        return this.game.items?.held[side]?.item.kind === 'cannonball';
    }

    _hand(side) {
        if (this.input) return this.input(side);
        const g = this.game;
        const f = g.weapons.palmFrame(side, this._pf[side]);
        return { G: f.G, curl: g.character.getGripCurl(side) };
    }

    update(dt) {
        const g = this.game;
        // port gun models near the players
        const me = g.character.group.position;
        for (const gun of this.port.values()) {
            const near = Math.hypot(me.x - gun.x, me.z - gun.z) < 260;
            if (near && !gun.model) {
                gun.model = portGunModel();
                gun.model.group.position.set(gun.x, gun.y, gun.z);
                gun.model.group.rotation.y = gun.yaw;
                g.scene.add(gun.model.group);
            } else if (!near && gun.model) {
                g.scene.remove(gun.model.group);
                gun.model = null;
            }
        }
        // fuses and recoil
        for (const G of this._guns()) {
            const st = G.st;
            if (st.fuse > 0) {
                st.fuse -= dt;
                if (Math.random() < dt * 25) g.fx?.spark(this._fusePt(G, _v), 0xffb030, 0.12, _w.set((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2), 0.3);
                if (st.fuse <= 0) { st.fuse = 0; if (this.auth) this.fire(G); }
            }
            if (st.recoil > 0) st.recoil = Math.max(0, st.recoil - dt * 0.8);
            this._draw(G);
        }
        for (const R of this._racks()) {
            if (R.ship) R.ship.model?.setRack(R.id, R.n);
            else if (R.gun.model) R.gun.model.balls.forEach((b, i) => { b.visible = i < R.n; });
        }
        this._hands(dt);
        this._fly(dt);
    }

    _draw(G) {
        const st = G.st;
        if (G.ship) { G.ship.model?.setCannon(G.spec.id, { recoil: st.recoil * 1.6, fuse: st.fuse > 0, loaded: st.loaded }); return; }
        const m = G.spec.model;
        if (!m) return;
        m.barrel.position.z = st.recoil * 1.6;
        m.fuse.material.color.setHex(st.fuse > 0 ? 0xffa020 : 0x222222);
        m.ball.visible = st.loaded;
    }

    /** Taking a ball off a rack; putting a held ball into a muzzle. */
    _hands(dt) {
        const g = this.game;
        if (!g.currentPose && !this.input) return;
        if (g.isDeadLocal || g.combat?.dead) return;
        const now = performance.now();
        for (const side of ['left', 'right']) {
            const h = this._hand(side);
            if (!h?.G) continue;
            if (h.curl < OPEN_CURL) this._open[side] = now;
            const held = g.items?.held[side];
            if (held && held.item.kind === 'cannonball') {
                // into the nearest muzzle within reach
                for (const G of this._guns()) {
                    if (G.st.loaded || G.st.fuse > 0) continue;
                    if (this._muzzle(G, _v).distanceTo(h.G) > LOAD_R) continue;
                    g.items.releaseHand(side);
                    this.load(G, true);
                    break;
                }
                continue;
            }
            if (held || g.weapons?.hands[side]?.held || g.books?.reading?.handBusy?.(side) || this.ships.helm.held[side]) continue;
            if (h.curl < CLOSE_CURL || now - this._open[side] > CLOSE_WINDOW) continue;
            for (const R of this._racks()) {
                if (R.n <= 0) continue;
                if (this._rackPos(R, _v).distanceTo(h.G) > TAKE_R + 0.4) continue;
                this.takeBall(R, side);
                this._open[side] = 0; // (one ball per closing of the fingers)
                break;
            }
        }
        void dt;
    }

    takeBall(R, side) {
        const g = this.game;
        if (R.ship) { R.ship.racks.set(R.id, Math.max(0, R.n - 1)); R.ship.changed = true; } else R.gun.balls = Math.max(0, R.n - 1);
        g.items.takeIntoHand({ kind: 'cannonball', uid: newUid() }, side);
        if (!this.auth) g.sync?.net.send({ t: 'scan', k: 'take', s: R.ship?.id || null, r: R.id });
        else this._event(R.ship, { k: 'rack', r: R.id, n: R.ship ? R.ship.racks.get(R.id) : R.gun.balls });
        if (!this._toldTake) { this._toldTake = true; g.hud.setVoice('⚫ Ядро в руке. Поднесите его к жерлу пушки — и оно ляжет в ствол', true); }
    }

    load(G, mine = false) {
        const g = this.game;
        G.st.loaded = true;
        if (G.ship) G.ship.changed = true;
        g.sound?.playClang?.(0.4);
        if (mine) {
            if (!this.auth) g.sync?.net.send({ t: 'scan', k: 'load', s: G.ship?.id || null, g: G.spec.id });
            else this._event(G.ship, { k: 'load', g: G.spec.id });
            g.hud.setVoice('💣 Пушка заряжена. Покажите на неё рукой и скажите «Fire» — загорится фитиль', true);
        }
    }

    /** «Fire» with the hand at a gun: its fuse is lit. Returns 'Fire' / null when it is about a gun, undefined if no gun is aimed at. */
    tryLight(side, isFinal) {
        const g = this.game, ch = g.character;
        const o = ch.getHandWorldPosition(side, new THREE.Vector3());
        const d = ch.getHandDirection(side, new THREE.Vector3()).normalize();
        let best = null, bestS = Infinity;
        for (const G of this._guns()) {
            const p = this._fusePt(G, _v);
            const tx = p.x - o.x, ty = p.y - o.y, tz = p.z - o.z;
            const along = tx * d.x + ty * d.y + tz * d.z;
            if (along < 0 || along > LIGHT_RANGE) continue;
            const off = Math.hypot(tx - d.x * along, ty - d.y * along, tz - d.z * along);
            const allow = 1.4 + along * 0.06;
            if (off > allow) continue;
            const s = off / allow + along / LIGHT_RANGE * 0.2;
            if (s < bestS) { bestS = s; best = G; }
        }
        if (!best) return undefined;
        const say = (t) => { if (isFinal) g.hud.setVoice(t, true); };
        if (best.st.fuse > 0) { say('🔥 Фитиль уже горит — отойдите!'); return null; }
        const tired = g.combat.check('Fire');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('Fire');
        const fp = this._fusePt(best, new THREE.Vector3());
        for (let i = 0; i < 12; i++) g.fx?.spark(_w.copy(o).lerp(fp, i / 12), i % 2 ? 0xffb347 : 0xff6a00, 0.1, _d.set(0, 0.5, 0), 0.4);
        if (this.auth) this.light(best, g.localId);
        else g.sync?.net.send({ t: 'scan', k: 'light', s: best.ship?.id || null, g: best.spec.id });
        say(best.st.loaded ? '🔥 Фитиль горит… Сейчас выстрелит!' : '🔥 Фитиль горит — но пушка не заряжена: будет только холостой выстрел');
        return 'Fire';
    }

    light(G, by) {
        G.st.fuse = FUSE;
        G.st.by = by;
        this._event(G.ship, { k: 'light', g: G.spec.id });
    }

    /** (host) Bang: the ball (if loaded) flies (st.pitch: the barrel raised — the black ship's gunners aim, Blackbeard.js). */
    fire(G) {
        const loaded = G.st.loaded;
        G.st.loaded = false;
        G.st.recoil = 1;
        if (G.ship) G.ship.changed = true;
        this._shot(G, loaded, G.st.by || null, true);
        this._event(G.ship, { k: 'fire', g: G.spec.id, l: loaded ? 1 : 0, p: G.st.pitch ? Math.round(G.st.pitch * 1000) / 1000 : undefined });
        G.st.pitch = 0;
    }

    /** A ship's gun by its ship and id ({ship, spec, st}) — for the AI that fires it. */
    gunOf(s, id) { return this._find(s.id, id); }

    /** The shot as everybody sees it; `real`: the host's ball, which breaks things. */
    _shot(G, loaded, by, real) {
        const g = this.game;
        const m = this._muzzle(G, new THREE.Vector3());
        const d = this._dir(G, new THREE.Vector3());
        if (G.st.pitch) { const h = Math.hypot(d.x, d.z) || 1; const c = Math.cos(G.st.pitch); d.set((d.x / h) * c, Math.sin(G.st.pitch), (d.z / h) * c); } // (the barrel raised: the ball flies in an arc)
        G.st.recoil = 1;
        g.sound?.playExplosion?.(m, g.character.group.position, 0.5);
        g.fx?.lightFlash?.(m, 0xffc070, 3, 0.15, 30);
        for (let i = 0; i < 26; i++) {
            const sp = 4 + Math.random() * 8;
            g.fx?.spark(m, i % 3 ? 0xd8d8d8 : 0xffa040, 0.6 + Math.random() * 0.6, _w.set(d.x * sp + (Math.random() - 0.5) * 2, d.y * sp + Math.random() * 2, d.z * sp + (Math.random() - 0.5) * 2), 1.2 + Math.random());
        }
        // the shooter feels it
        const me = g.character.group.position;
        g.fx.shake = Math.max(g.fx.shake || 0, Math.max(0, 0.8 - m.distanceTo(me) / 40));
        if (!loaded) return;
        const mesh = new THREE.Mesh(ballGeo(), IRON());
        mesh.position.copy(m);
        g.scene.add(mesh);
        this.flying.push({ p: m.clone(), v: d.multiplyScalar(BALL_SPEED), mesh, t: 0, ship: G.ship, by, real });
    }

    _fly(dt) {
        const g = this.game;
        const data = g.terrain?.data;
        for (let i = this.flying.length - 1; i >= 0; i--) {
            const b = this.flying[i];
            b.t += dt;
            let done = b.t > 8;
            const steps = Math.max(1, Math.ceil((b.v.length() * dt) / 1.0));
            const h = dt / steps;
            for (let k = 0; k < steps && !done; k++) {
                b.v.y -= GRAV * h;
                b.p.addScaledVector(b.v, h);
                // the sea
                if (b.p.y < WATER_LEVEL_Y && g.swim?.waterAt?.(b.p.x, b.p.z)) {
                    g.sound?.playSplash?.();
                    for (let j = 0; j < 14; j++) g.fx?.spark(b.p, 0xdff4ff, 0.4, _w.set((Math.random() - 0.5) * 3, 4 + Math.random() * 5, (Math.random() - 0.5) * 3), 1);
                    done = true;
                    break;
                }
                // ships (not the one that fired, for the first moment)
                for (const s of this.ships.awake) {
                    if (s === b.ship && b.t < 0.25) continue;
                    if (!s.collider.hasXZ(b.p.x, b.p.z)) continue;
                    if (!s.collider.pointBlocked(b.p.x, b.p.y, b.p.z)) continue;
                    if (b.real && this.auth) this.ships.cannonHit(s, b.p, b.v, b.by);
                    g.sound?.playExplosion?.(b.p, g.character.group.position, 0.4);
                    done = true;
                    break;
                }
                if (done) break;
                // walls, rock, the ground
                if (data && data.isSolidAt(b.p.x, b.p.y, b.p.z)) {
                    if (b.real && this.auth) g.explode(b.p.clone(), 1.8, b.by || 'local', 0.5);
                    done = true;
                    break;
                }
                // creatures in the way
                if (b.real && this.auth && this._hitCreature(b)) { done = true; break; }
            }
            b.mesh.position.copy(b.p);
            if (done || b.p.y < -40) {
                g.scene.remove(b.mesh);
                b.mesh.material.dispose();
                this.flying.splice(i, 1);
            }
        }
    }

    /** (host) A ball through a body: zombies, animals, villagers, sailors, players. */
    _hitCreature(b) {
        const g = this.game;
        const p = b.p;
        const dir = _d.copy(b.v).normalize();
        const near = (q, r) => Math.abs(q.x - p.x) < r && Math.abs(q.z - p.z) < r && p.y > q.y - 1 && p.y < q.y + 4.5;
        for (const z of g.zombies) {
            if (z.isDead || !near(z.group.position, 1.2)) continue;
            g.damageZombie(z, 14, false, dir.clone(), b.by);
            z.velocity?.addScaledVector(dir, 10);
            return true;
        }
        for (const a of g.animals?.list || []) {
            if (a.dead || !near(a.group.position, 1.6)) continue;
            g.animals.hit(a, 14, dir.clone(), b.by);
            return true;
        }
        for (const v of g.castleLife?.targets?.() || []) {
            if (v.dead || !near(v.group.position, 1.2)) continue;
            g.castleLife.hit(v, 14, dir.clone(), b.by, {});
            return true;
        }
        for (const v of this.ships.crew.targets?.() || []) {
            if (v.dead || !near(v.group.position, 1.2)) continue;
            this.ships.crew.hit(v, 14, dir.clone(), b.by, { kind: 'cannon' });
            return true;
        }
        // players
        const me = g.character.group.position;
        if (!g.isDeadLocal && Math.hypot(me.x - p.x, me.z - p.z) < 1.1 && p.y > me.y - 2.2 && p.y < me.y + 1.5 && b.by !== g.localId) {
            if (g.combat?.enabled) g.combat.damage(8, b.by, 'Cannon'); else g.damageLocalPlayer(8);
            return true;
        }
        for (const [id, r] of g.remotes) {
            if (r.dead || id === b.by) continue;
            const q = r.position;
            if (Math.hypot(q.x - p.x, q.z - p.z) < 1.1 && p.y > q.y - 2.2 && p.y < q.y + 1.5) {
                g.sync?.playerHit?.(id, 8, false, null);
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------ network
    _event(ship, e) {
        const g = this.game;
        if (!g.sync || !this.auth) return;
        const m = { gk: e.k, g: e.g, r: e.r, n: e.n, l: e.l, p: e.p };
        if (ship) g.sync.net.send({ t: 'shipev', id: ship.id, k: 'gun', ...m });
        else g.sync.net.send({ t: 'scan', port: 1, ...m });
    }

    _find(shipId, gunId) {
        if (shipId) {
            const s = this.ships.list.get(shipId);
            if (!s || !s.awake) return null;
            const spec = s.layout.cannons.find((c) => c.id === gunId);
            const st = spec && s.guns.get(spec.id);
            return st ? { ship: s, spec, st } : null;
        }
        const gun = this.port.get(gunId);
        return gun ? { ship: null, spec: gun, st: gun } : null;
    }

    /** A ship's gun event on a guest (from Ships._applyEvent). */
    applyEvent(s, m) {
        this._guestEvent(s, { k: m.gk, g: m.g, r: m.r, n: m.n, l: m.l, p: m.p });
    }

    /** 'scan' messages: guests ask the host; the host tells about the port's guns. */
    onNet(m, isHost) {
        const g = this.game;
        if (isHost) {
            if (m.k === 'take') {
                if (m.s) { const s = this.ships.list.get(m.s); if (s && s.racks.has(m.r)) { s.racks.set(m.r, Math.max(0, s.racks.get(m.r) - 1)); s.changed = true; this._event(s, { k: 'rack', r: m.r, n: s.racks.get(m.r) }); } }
                else { const gun = this.port.get(m.r); if (gun) { gun.balls = Math.max(0, gun.balls - 1); this._event(null, { k: 'rack', r: gun.id, n: gun.balls }); } }
            } else if (m.k === 'load') {
                const G = this._find(m.s, m.g);
                if (G && !G.st.loaded) { this.load(G); this._event(G.ship, { k: 'load', g: G.spec.id }); }
            } else if (m.k === 'light') {
                const G = this._find(m.s, m.g);
                if (G && !(G.st.fuse > 0)) this.light(G, m.from);
            }
            return;
        }
        if (m.port) this._guestEvent(null, { k: m.gk, g: m.g, r: m.r, n: m.n, l: m.l });
        void g;
    }

    /** On a guest: what happened to a gun (ship guns come through 'shipev' k:'gun'). */
    _guestEvent(ship, m) {
        if (m.k === 'rack') {
            if (ship) { if (ship.racks.has(m.r)) ship.racks.set(m.r, m.n); } else { const gun = this.port.get(m.r); if (gun) gun.balls = m.n; }
            return;
        }
        const G = this._find(ship?.id || null, m.g);
        if (!G) return;
        if (m.k === 'load') G.st.loaded = true;
        else if (m.k === 'light') G.st.fuse = FUSE;
        else if (m.k === 'fire') { G.st.fuse = 0; G.st.loaded = false; G.st.pitch = +m.p || 0; this._shot(G, !!m.l, null, false); G.st.pitch = 0; }
    }

    // ------------------------------------------------------------ saving
    snapshot() {
        const out = [];
        for (const gun of this.port.values()) if (gun.loaded || gun.balls !== 6) out.push([gun.id, gun.loaded ? 1 : 0, gun.balls]);
        return out;
    }

    restore(list) {
        this._saved = new Map();
        for (const [id, l, b] of list || []) {
            this._saved.set(id, { l, b });
            const gun = this.port.get(id);
            if (gun) { gun.loaded = !!l; gun.balls = b ?? 6; }
        }
    }

    dispose() {
        const g = this.game;
        for (const b of this.flying) g.scene.remove(b.mesh);
        this.flying = [];
        for (const gun of this.port.values()) if (gun.model) g.scene.remove(gun.model.group);
    }
}
