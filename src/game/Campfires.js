/**
 * Campfires.js — the spell «Fire» and campfires.
 *
 * Raise a hand, point at the ground (up to 25 m) and say «Fire» («Файр»,
 * «Костёр»): a campfire lights up there — a ring of stones, crossed logs and
 * flickering flames, embers and a little smoke. At night it glows and lights
 * the ground around it.
 *
 *  - It burns 3 minutes; near the end the flames get small, then only embers
 *    are left for a while, then it is gone.
 *  - Firewood: hold wood in the hand (the chosen wood stack) at the fire for a
 *    moment — one block goes in, +1 minute (up to 10 minutes). Embers light up
 *    again from new wood.
 *  - Cooking: meat (or a fish) lying in the fire or held in the flames for
 *    3 seconds gets cooked: meat → steak, fish → cooked fish.
 *  - Standing in the fire hurts a little (1 HP a second), zombies and
 *    animals too. The fire never spreads to blocks or trees.
 *
 * Multiplayer: the host owns the campfires (guests ask it to light one or to
 * add wood); everybody sees them. They are saved with the world.
 */

import * as THREE from 'three';
import { isWood } from '../world/Terrain.js';

export const CAMPFIRE = {
    BURN: 180, // s a fresh campfire burns
    WOOD: 60, // s one block of wood adds
    MAX: 600, // s at most
    FADE: 25, // s before the end the flames shrink
    EMBERS: 15, // s of glowing embers after the flames are gone
    RANGE: 25, // m the spell reaches
    MAX_FIRES: 12,
    COOK_TIME: 3, // s in the flames
    COOK_R: 1.2, // m from the centre: in the fire
    FEED_R: 1.5, // m: the hand with wood at the fire
    FEED_TIME: 0.6, // s to hold the wood there
    HURT_R: 0.9, // m: standing in the fire
};

// ------------------------------------------------------------------ pure logic
/** Can this thing be cooked on a fire? */
export function canCook(item) {
    return !!item && (item.kind === 'meat' || (item.kind === 'fish' && !item.cooked));
}

/** Cook a thing (meat → steak, fish → cooked). Returns true if it changed. */
export function cookItem(item) {
    if (!canCook(item)) return false;
    if (item.kind === 'meat') item.kind = 'steak';
    else item.cooked = true;
    return true;
}

/** Seconds left after `n` blocks of wood go into a fire with `left` seconds (embers light up again). */
export function addWoodTime(left, n = 1) {
    return Math.min(CAMPFIRE.MAX, Math.max(0, left) + CAMPFIRE.WOOD * n);
}

/** How big the flames are (0 — only embers / gone, 1 — full fire). */
export function flameSize(left) {
    if (left <= 0) return 0;
    return Math.max(0.18, Math.min(1, left / CAMPFIRE.FADE));
}

/** «2 мин 30 с». */
export function burnText(left) {
    const s = Math.max(0, Math.round(left));
    const m = Math.floor(s / 60);
    return m ? `${m} мин${s % 60 ? ' ' + (s % 60) + ' с' : ''}` : `${s} с`;
}

// --------------------------------------------------------------------- looks
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
let SH = null; // shared geometries / materials

function glowTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

function shared() {
    if (SH) return SH;
    const lam = (color, emissive = 0) => { const m = new THREE.MeshLambertMaterial({ color, emissive }); m.userData.shared = true; return m; };
    const add = (color, opacity) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }); m.userData.shared = true; return m; };
    const tex = glowTexture();
    SH = {
        stone: new THREE.BoxGeometry(0.38, 0.28, 0.34),
        log: new THREE.BoxGeometry(0.22, 0.22, 1.5),
        stick: new THREE.BoxGeometry(0.13, 0.13, 1.05),
        ash: new THREE.BoxGeometry(1.25, 0.05, 1.25),
        flameBig: new THREE.ConeGeometry(0.42, 1.35, 6),
        flameSmall: new THREE.ConeGeometry(0.24, 0.9, 6),
        plane: new THREE.PlaneGeometry(1, 1),
        stoneA: lam(0x8d8d8d), stoneB: lam(0x6c6a66),
        wood: lam(0x6b4423), woodEnd: lam(0xa77b4a),
        coal: lam(0x2a2420, 0x521500), ashM: lam(0x3a3430, 0x1a0700),
        outer: add(0xff5a00, 0.7), mid: add(0xff9a1a, 0.75), inner: add(0xffe27a, 0.85),
        halo: new THREE.SpriteMaterial({ map: tex, color: 0xffa040, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
        pool: new THREE.MeshBasicMaterial({ map: tex, color: 0xff8a30, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    SH.halo.userData.shared = true;
    SH.pool.userData.shared = true;
    return SH;
}

/** The model of a campfire (about 1.8 m across). */
export function campfireModel() {
    const S = shared();
    const g = new THREE.Group();
    // a ring of stones
    const n = 11;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const s = new THREE.Mesh(S.stone, i % 3 ? S.stoneA : S.stoneB);
        const r = 0.82 + ((i * 37) % 7) * 0.012;
        s.position.set(Math.cos(a) * r, 0.12 + (i % 2) * 0.03, Math.sin(a) * r);
        s.rotation.y = -a + ((i * 53) % 5) * 0.08;
        s.scale.setScalar(0.85 + ((i * 29) % 5) * 0.06);
        s.castShadow = true;
        g.add(s);
    }
    const ash = new THREE.Mesh(S.ash, S.ashM);
    ash.position.y = 0.03;
    g.add(ash);
    // crossed logs (#) and a little teepee of sticks
    const logs = [];
    for (const [x, z, ry, y] of [[0, -0.26, Math.PI / 2, 0.12], [0, 0.26, Math.PI / 2, 0.12], [-0.26, 0, 0, 0.32], [0.26, 0, 0, 0.32]]) {
        const l = new THREE.Mesh(S.log, S.wood);
        l.position.set(x, y, z);
        l.rotation.y = ry;
        l.castShadow = true;
        g.add(l);
        logs.push(l);
    }
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const st = new THREE.Mesh(S.stick, S.wood);
        st.position.set(Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3);
        st.lookAt(0, 1.1, 0); // the stick leans in: its long side points at the top of the teepee
        g.add(st);
        logs.push(st);
    }
    // flames
    const flames = new THREE.Group();
    flames.position.y = 0.42;
    g.add(flames);
    const tongues = [];
    const mk = (geo, mat, x, z, s) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, 0, z);
        m.userData.base = { x, z, s, ph: Math.random() * 10 };
        flames.add(m);
        tongues.push(m);
    };
    for (let i = 0; i < 3; i++) { const a = i * 2.1; mk(S.flameBig, S.outer, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.9 + i * 0.1); }
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 1; mk(S.flameSmall, S.mid, Math.cos(a) * 0.14, Math.sin(a) * 0.14, 1.1); }
    mk(S.flameSmall, S.inner, 0, 0, 0.9);
    mk(S.flameSmall, S.inner, 0.08, -0.05, 0.7);
    // the glow: a soft halo and a warm pool of light on the ground
    const halo = new THREE.Sprite(S.halo);
    halo.position.y = 1.0;
    halo.scale.setScalar(3.4);
    g.add(halo);
    const pool = new THREE.Mesh(S.plane, S.pool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.06;
    pool.scale.setScalar(7);
    g.add(pool);
    g.userData = { flames, tongues, logs, halo, pool };
    return g;
}

function disposeFire(model) {
    // geometries and materials are shared: nothing to free
    model.parent?.remove(model);
}

// -------------------------------------------------------------------- system
export class Campfires {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // id -> {id, x, y, z, left, model, cook: Map, acc}
        this._lastCast = 0;
        this._feedT = 0;
        this._feedCool = 0;
        this._hurtT = 0;
        this._heldCook = { right: 0, left: 0 };
        this._looseT = 0;
        // ONE light for the nearest fire at night: made now, before the shaders are compiled
        this.light = new THREE.PointLight(0xff9a40, 0, 24, 2);
        this.light.castShadow = false;
        game.scene?.add(this.light);
    }

    get auth() { return this.game.authority; }

    // ------------------------------------------------------------- the spell
    /**
     * «Fire»: a campfire where the raised hand points.
     * @param {boolean} isFinal  the microphone's final phrase
     * @param {boolean} [force]  (debug) no raised hand needed
     */
    cast(isFinal, force = false) {
        const g = this.game;
        const ch = g.character;
        const now = performance.now();
        if (now - this._lastCast < 2500) return null; // (the final version of an already cast phrase)
        const pref = g.magicHand || g.lastMagicHand || 'right';
        let side = null;
        if (force) side = 'right';
        else if (ch.isArmRaised(pref) || g.isMagicActive || Date.now() - (g.lastMagicTime || 0) < 1500) side = pref;
        else side = ['right', 'left'].find((s) => ch.isArmRaised(s)) || null;
        const say = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (!side) return say('🔥 Поднимите руку, покажите на землю и скажите «Fire»');
        const tired = g.combat.check('Fire');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        const spot = this.aim(side);
        if (!spot) return say('🔥 Покажите рукой на землю (не дальше 25 м)');
        if (spot.water) return say('🔥 На воде костёр не загорится — покажите на сушу');
        for (const f of this.list.values()) {
            if (Math.hypot(f.x - spot.x, f.z - spot.z) < 2.2 && Math.abs(f.y - spot.y) < 2) return say('🔥 Здесь уже есть костёр — подбросьте в него дров');
        }
        g.combat.pay('Fire');
        this._lastCast = now;
        // a stream of sparks from the hand to the spot
        const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
        const to = _v2.set(spot.x, spot.y + 0.5, spot.z);
        for (let i = 0; i < 18; i++) {
            const p = _v.copy(hand).lerp(to, i / 18);
            g.fx?.spark(p, i % 2 ? 0xffb347 : 0xff6a00, 0.1, new THREE.Vector3((Math.random() - 0.5), Math.random(), (Math.random() - 0.5)), 0.5);
        }
        g.sound?.playInferno?.();
        if (this.auth) this.kindle(spot.x, spot.y, spot.z);
        else g.sync?.campfire?.({ t: 'cfask', p: [r2(spot.x), r2(spot.y), r2(spot.z)] });
        g.hud.setVoice('🔥 Костёр горит! Подержите у огня руку с деревом — будет гореть дольше. Мясо в огне пожарится', true);
        return 'Fire';
    }

    /** Where the hand points at the ground: {x, y, z, water} or null. */
    aim(side) {
        const g = this.game;
        const ch = g.character;
        const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
        const dir = ch.getHandDirection(side, new THREE.Vector3()).normalize();
        let hit = null;
        for (let k = 0.5; k <= CAMPFIRE.RANGE; k += 0.25) {
            const p = _v.copy(hand).addScaledVector(dir, k);
            const gy = g.collision.groundAt(p.x, p.z, p.y);
            if (p.y <= gy + 0.05) { hit = { x: p.x, y: gy, z: p.z }; break; }
        }
        if (!hit) {
            // pointing far ahead (not at the sky): the fire lights a few steps in front
            if (dir.y > 0.35) return null;
            const fl = _v2.set(dir.x, 0, dir.z);
            if (fl.lengthSq() < 1e-4) return null;
            fl.normalize();
            const x = hand.x + fl.x * 5, z = hand.z + fl.z * 5;
            hit = { x, y: g.collision.groundAt(x, z, ch.group.position.y + 1), z };
        }
        hit.water = !!g.swim?.waterAt?.(hit.x, hit.z);
        return hit;
    }

    // ---------------------------------------------------------- fires (host)
    /** (authority) Light a new campfire and tell everybody. */
    kindle(x, y, z, left = CAMPFIRE.BURN) {
        // too many: the one closest to going out goes out
        if (this.list.size >= CAMPFIRE.MAX_FIRES) {
            const old = [...this.list.values()].sort((a, b) => a.left - b.left)[0];
            this._out(old);
        }
        const id = 'f' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
        const f = this._place({ id, x, y, z, left });
        this._send(f);
        return f;
    }

    _place(d) {
        let f = this.list.get(d.id);
        if (!f) {
            const model = campfireModel();
            this.game.scene.add(model);
            f = { id: d.id, x: d.x, y: d.y, z: d.z, left: d.left, model, cook: new Map(), acc: 0, accE: 0, coal: false };
            this.list.set(d.id, f);
        }
        f.x = d.x; f.y = d.y; f.z = d.z; f.left = d.left;
        f.model.position.set(f.x, f.y, f.z);
        return f;
    }

    _remove(f) {
        if (!f) return;
        disposeFire(f.model);
        this.list.delete(f.id);
    }

    /** (authority) The fire is gone. */
    _out(f) {
        this._remove(f);
        this.game.sync?.campfire?.({ t: 'cf', d: { id: f.id, left: -999 } });
    }

    _send(f) {
        this.game.sync?.campfire?.({ t: 'cf', d: { id: f.id, x: r2(f.x), y: r2(f.y), z: r2(f.z), left: Math.round(f.left * 10) / 10 } });
    }

    /** (authority) Wood went into a fire. */
    addWood(f, n = 1) {
        if (!f) return;
        f.left = addWoodTime(f.left, n);
        this._send(f);
    }

    nearest(p, maxDist = Infinity) {
        let best = null, bd = maxDist;
        for (const f of this.list.values()) {
            const d = Math.hypot(f.x - p.x, f.z - p.z);
            if (d < bd && Math.abs(p.y - f.y) < 4) { bd = d; best = f; }
        }
        return best;
    }

    // ------------------------------------------------------------- frame
    update(dt) {
        const g = this.game;
        if (!this.list.size) { this.light.intensity = 0; return; }
        const night = g.dayCycle ? (g.world?.nightAmount || 0) : (g.isNight ? 1 : 0);
        const S = shared();
        S.halo.opacity = 0.12 + 0.55 * night;
        S.pool.opacity = 0.06 + 0.42 * night;
        const t = performance.now() / 1000;
        const cam = g.camera?.position;
        for (const f of [...this.list.values()]) {
            f.left -= dt;
            if (f.left <= -CAMPFIRE.EMBERS) {
                if (this.auth) this._out(f); else this._remove(f);
                continue;
            }
            this._animate(f, dt, t, cam);
        }
        this._light(night, t);
        this._feed(dt);
        this._cookHeld(dt);
        this._hurt(dt);
        if (this.auth) {
            this._looseT += dt;
            if (this._looseT >= 0.25) { this._cookLoose(this._looseT); this._looseT = 0; }
        }
    }

    _animate(f, dt, t, cam) {
        const fx = this.game.fx;
        const U = f.model.userData;
        const k = flameSize(f.left);
        U.flames.visible = k > 0;
        // burnt logs glow as embers at the end
        const coal = f.left < CAMPFIRE.FADE * 0.6;
        if (coal !== f.coal) { f.coal = coal; for (const l of U.logs) l.material = coal ? shared().coal : shared().wood; }
        if (k > 0) {
            for (const m of U.tongues) {
                const b = m.userData.base;
                const fl = 0.8 + 0.25 * Math.sin(t * 9 + b.ph) + 0.15 * Math.sin(t * 23 + b.ph * 2);
                m.scale.set(b.s * k * (0.9 + 0.1 * Math.sin(t * 7 + b.ph)), b.s * k * fl, b.s * k);
                m.position.set(b.x * k + Math.sin(t * 5 + b.ph) * 0.04, (m.geometry.parameters.height * m.scale.y) / 2, b.z * k);
                m.rotation.y = t * 0.6 + b.ph;
            }
        }
        const ember = f.left <= 0 ? Math.max(0, 1 + f.left / CAMPFIRE.EMBERS) : 1;
        U.halo.scale.setScalar((k > 0 ? 2.2 + 1.6 * k : 1.4 * ember) * (0.95 + 0.06 * Math.sin(t * 11 + f.x)));
        U.halo.position.y = k > 0 ? 0.6 + 0.5 * k : 0.3;
        U.pool.scale.setScalar(k > 0 ? 3.5 + 4 * k : 2.5 * ember);
        // voxel flames, embers and smoke (only when somebody can see them)
        if (!fx || (cam && cam.distanceToSquared(f.model.position) > 80 * 80)) return;
        f.acc += dt * (k > 0 ? 22 * k : 0);
        while (f.acc >= 1) {
            f.acc -= 1;
            fx.glow.spawn(f.x + (Math.random() - 0.5) * 0.7 * k, f.y + 0.4 + Math.random() * 0.4, f.z + (Math.random() - 0.5) * 0.7 * k,
                (Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 1.3, (Math.random() - 0.5) * 0.3,
                [0xffe08a, 0xffa020, 0xff6a00, 0xff3c00][(Math.random() * 4) | 0], (0.2 + Math.random() * 0.25) * (0.5 + 0.5 * k), 0.45 + Math.random() * 0.35, { shrink: 0.5, spin: 3 });
        }
        f.accE += dt * (k > 0 ? 4 : 1.5 * ember);
        while (f.accE >= 1) {
            f.accE -= 1;
            // a tiny spark flies up high
            fx.glow.spawn(f.x + (Math.random() - 0.5) * 0.5, f.y + 0.5, f.z + (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.8, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 0.8, 0xffb040, 0.06, 1 + Math.random(), { shrink: 0.02, spin: 2 });
            if (Math.random() < 0.4) {
                const gr = 70 + ((Math.random() * 40) | 0);
                fx.smoke.spawn(f.x + (Math.random() - 0.5) * 0.3, f.y + 1.2 + 1.2 * k, f.z + (Math.random() - 0.5) * 0.3,
                    (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, (gr << 16) | (gr << 8) | gr, 0.2 + Math.random() * 0.2, 2.2, { shrink: -0.3 });
            }
        }
    }

    /** The one light: over the nearest burning fire, at night. */
    _light(night, t) {
        const g = this.game;
        const me = g.character.group.position;
        let best = null, bd = 45;
        for (const f of this.list.values()) {
            if (f.left <= -CAMPFIRE.EMBERS * 0.5) continue;
            const d = Math.hypot(f.x - me.x, f.z - me.z);
            if (d < bd) { bd = d; best = f; }
        }
        if (!best || night < 0.05) { this.light.intensity = 0; return; }
        const k = best.left > 0 ? flameSize(best.left) : 0.25 * Math.max(0, 1 + best.left / CAMPFIRE.EMBERS);
        this.light.position.set(best.x, best.y + 1.6, best.z);
        this.light.intensity = 2.4 * night * k * (0.9 + 0.08 * Math.sin(t * 13) + 0.05 * Math.sin(t * 31));
    }

    // ----------------------------------------------------- wood and cooking
    /** The chosen wood stack held at a fire for a moment: one block goes in. */
    _feed(dt) {
        const g = this.game;
        this._feedCool = Math.max(0, this._feedCool - dt);
        const s = g.inventory?.inHand?.kind === 'res' ? g.inventory.inHand.stack : null;
        if (!s || !isWood(s.block) || s.count <= 0 || this._feedCool > 0) { this._feedT = 0; return; }
        const hand = g.character.getGripObject('right').getWorldPosition(_v);
        const f = this._fireAt(hand, CAMPFIRE.FEED_R, 2.8);
        if (!f) { this._feedT = 0; return; }
        if (f.left > CAMPFIRE.MAX - 20) { this._feedT = 0; if (!this._fullSaid) { this._fullSaid = true; g.hud.setVoice('🔥 Костёр и так горит вовсю — дров хватит', true); } return; }
        this._fullSaid = false;
        this._feedT += dt;
        if (this._feedT < CAMPFIRE.FEED_TIME) return;
        this._feedT = 0;
        this._feedCool = 0.6;
        if (!g.inventory.take(s, 1)) return;
        const after = addWoodTime(f.left);
        if (this.auth) this.addWood(f); else { f.left = after; g.sync?.campfire?.({ t: 'cfwood', id: f.id }); }
        for (let i = 0; i < 14; i++) g.fx?.spark(_v2.set(f.x, f.y + 0.6, f.z), i % 2 ? 0xffb347 : 0xffe08a, 0.08, new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.8);
        g.hud.setVoice(`🪵 Дрова в костре! Будет гореть ещё ${burnText(after)}`, true);
    }

    /** A burning (or glowing) fire whose flames reach the point. */
    _fireAt(p, r, up, burning = false) {
        for (const f of this.list.values()) {
            if (burning && f.left <= 0) continue;
            const dy = p.y - f.y;
            if (dy < -0.6 || dy > up) continue;
            if (Math.hypot(p.x - f.x, p.z - f.z) < r) return f;
        }
        return null;
    }

    _cooked(item, pos) {
        const g = this.game;
        for (let i = 0; i < 12; i++) g.fx?.spark(pos, i % 3 ? 0xffd27a : 0xffffff, 0.06, new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.5);
        return item.kind === 'fish' ? '🔥 Рыба пожарилась' : '🔥 Мясо пожарилось';
    }

    /** Meat / fish held in the flames for 3 s. */
    _cookHeld(dt) {
        const g = this.game;
        const items = g.items;
        if (!items) return;
        for (const side of ['right', 'left']) {
            const h = items.held[side];
            if (!h || !canCook(h.item) || !this._fireAt(h.model.position, CAMPFIRE.COOK_R + 0.2, 2.6, true)) { this._heldCook[side] = 0; continue; }
            this._heldCook[side] += dt;
            if (Math.random() < dt * 8) g.fx?.spark(h.model.position, 0xffd27a, 0.05, _v2.set((Math.random() - 0.5), 1.5, (Math.random() - 0.5)), 0.4);
            if (this._heldCook[side] < CAMPFIRE.COOK_TIME) continue;
            this._heldCook[side] = 0;
            const pos = h.model.position.clone();
            const item = items.releaseHand(side);
            cookItem(item);
            items.takeIntoHand(item, side);
            g.hud.setVoice(this._cooked(item, pos), true);
        }
    }

    /** (authority) Things lying in the fire: meat / fish cook, loose firewood burns. */
    _cookLoose(dt) {
        const g = this.game;
        const items = g.items;
        if (!items?.loose.size) return;
        for (const f of this.list.values()) {
            if (f.left <= 0) { f.cook.clear(); continue; }
            for (const [uid, L] of [...items.loose]) {
                const p = L.model.position;
                if (L.hover || Math.hypot(p.x - f.x, p.z - f.z) > CAMPFIRE.COOK_R || p.y - f.y > 1.6 || p.y - f.y < -0.6) { f.cook.delete(uid); continue; }
                const kind = L.item.kind;
                if (kind === 'wood' || kind === 'log' || kind === 'firewood') {
                    items.removeLoose(uid);
                    g.sync?.itemGone?.(uid, null, null);
                    this.addWood(f, L.item.count || 1);
                    continue;
                }
                if (!canCook(L.item)) continue;
                const t = (f.cook.get(uid) || 0) + dt;
                f.cook.set(uid, t);
                if (Math.random() < 0.5) g.fx?.spark(p, 0xffd27a, 0.05, _v2.set((Math.random() - 0.5), 1.5, (Math.random() - 0.5)), 0.4);
                if (t < CAMPFIRE.COOK_TIME) continue;
                f.cook.delete(uid);
                const pos = p.clone();
                const item = items.removeLoose(uid);
                g.sync?.itemGone?.(uid, null, null);
                cookItem(item);
                items.spawnLoose(item, pos);
                const near = g.character.group.position.distanceTo(pos) < 15;
                const msg = this._cooked(item, pos);
                if (near) g.hud.setVoice(msg, true);
            }
        }
    }

    /** Standing in the fire hurts: me (on my own computer), zombies and animals (authority). */
    _hurt(dt) {
        const g = this.game;
        this._hurtT += dt;
        if (this._hurtT < 1) return;
        this._hurtT = 0;
        const me = g.character.group.position;
        // (the body's origin is 2 m above the feet)
        const feet = _v.set(me.x, me.y - 2, me.z);
        if (!g.combat?.dead && !g.isDeadLocal && this._fireAt(feet, CAMPFIRE.HURT_R, 1.2, true)) {
            if (g.combat?.enabled) g.combat.damage(1, null, 'Inferno');
            else g.damageLocalPlayer?.(1);
            if (g.config?.mode !== 'creative') g.hud.setVoice('🔥 Горячо! Отойдите от костра', true);
        }
        if (!this.auth) return;
        for (const z of g.zombies || []) {
            if (z.isDead) continue;
            const f = this._fireAt(z.group.position, CAMPFIRE.HURT_R + 0.2, 1.2, true);
            if (f) g.damageZombie(z, 1, false, _v2.set(z.group.position.x - f.x, 0, z.group.position.z - f.z).normalize(), null);
        }
        for (const a of g.animals?.list || []) {
            if (a.dead) continue;
            const f = this._fireAt(a.group.position, CAMPFIRE.HURT_R + 0.3, 1.2, true);
            if (f) g.animals.hit(a, 1, _v2.set(a.group.position.x - f.x, 0, a.group.position.z - f.z).normalize(), null, true);
        }
    }

    // ---------------------------------------------------------- network / save
    /** Messages: 'cf' (host → all: a fire's state), 'cfask' / 'cfwood' (guest → host). */
    onNet(m) {
        const g = this.game;
        if (m.t === 'cf') {
            if (g.authority || !m.d) return;
            if (m.d.left <= -CAMPFIRE.EMBERS) this._remove(this.list.get(m.d.id));
            else this._place(m.d);
        } else if (m.t === 'cfask') {
            if (!g.authority || !Array.isArray(m.p)) return;
            const [x, y, z] = m.p.map(Number);
            if (![x, y, z].every(Number.isFinite)) return;
            for (const f of this.list.values()) if (Math.hypot(f.x - x, f.z - z) < 2.2 && Math.abs(f.y - y) < 2) return;
            this.kindle(x, y, z);
        } else if (m.t === 'cfwood') {
            if (g.authority) this.addWood(this.list.get(m.id));
        }
    }

    snapshot() {
        return [...this.list.values()].filter((f) => f.left > 0).map((f) => ({ id: f.id, x: r2(f.x), y: r2(f.y), z: r2(f.z), left: Math.round(f.left) }));
    }

    restore(list) {
        for (const d of list || []) {
            if (!d || !d.id || !(d.left > 0) || ![d.x, d.y, d.z].every(Number.isFinite)) continue;
            this._place({ id: d.id, x: d.x, y: d.y, z: d.z, left: Math.min(CAMPFIRE.MAX, d.left) });
        }
    }

    /** One sample for compiling the shaders while loading. */
    sampleModel() {
        const m = campfireModel();
        // (own geometries: prewarm disposes the sample's geometries, the shared ones stay)
        m.traverse((o) => { if (o.isMesh) o.geometry = o.geometry.clone(); });
        return m;
    }

    dispose() {
        for (const f of [...this.list.values()]) this._remove(f);
        this.light.parent?.remove(this.light);
    }
}

const r2 = (v) => Math.round(v * 100) / 100;
