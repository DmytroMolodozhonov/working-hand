/**
 * Cauldrons.js — the big black cauldrons in the world: moved by hands, filled with water,
 * brewing potions (what goes on inside: Potions.js).
 *
 *  - Heavy. It moves only when BOTH hands work on it: open palms pressed against its belly push
 *    it (only the part of the hands' move that goes into it), fingers closed on the rim or a
 *    handle drag it any way. One hand barely rocks it. A fast shove high on it with both hands
 *    knocks it over; so does a blast nearby. Overturned, it pours out everything inside.
 *    To stand it up: both hands on the rim / the handles, lift — it rises as far as the hands
 *    lift it; let go before it balances and it falls back. «Вингардиум Левиоса» lifts it too
 *    (and tilted in the air it pours out). «Акцио» does not work on it: it is far too heavy to
 *    fly into a hand (and would not fit in one) — Accio looks only at things and weapons.
 *  - Water: a «Waterbollow» ball thrown or dropped into its opening pours in (a small ball fills
 *    a third, one big ball fills it). Ice does not pour: a frozen ball lies on it like on any
 *    box until it is melted. Rain falling into an open cauldron fills it slowly.
 *  - Things thrown or dropped into the opening: in the water they dissolve (ingredients);
 *    in a dry one, or things that never dissolve (a wand, a flask…), they lie on the bottom.
 *  - An empty flask held in the hand and dipped into a ready potion fills with one portion.
 *  - Where: the master of cauldrons and potions sells them at his stall by a wizards' house
 *    (the price is named when you start moving it; «да» pays; carried off unpaid — a thief);
 *    and a forgotten, rusty one lies now and then in a cave chamber, often overturned.
 *
 * What acts on it (and what does not, and why):
 *   blasts («Бомбардо», cannon balls, …) — thrown aside, a near one knocked over (Game.applyExplosion → blast);
 *   «Вингардиум Левиоса» — lifted, carried slowly, pours out tilted, falls when let go (and hurts
 *     whoever it falls on: zombies, animals, people of the castles and the ships, the spider, me);
 *   a «Waterbollow» ball — pours in; ice, «Water Vortex», waves — no (a vortex / a wave does not
 *     fill a pot: only water brought and poured in by hand counts);
 *   «Акцио», «Вайнд», punches, blades, arrows — no: far too heavy (a blade or an arrow just rings on the iron);
 *   fire, «Инферно», lightning — no: iron does not burn;
 *   creatures — they bump into it like into a chest (its box); it does not chase or hurt them by itself;
 *   ships — it can stand on a deck, but it does not sail with the ship (left where it was put).
 *
 * Multiplayer: the host owns every cauldron's insides (water, things, brewing, portions) and
 * where it stands; the player whose hands move it moves it on their own computer and tells the
 * host, the host tells everybody. Saved with the world.
 */

import * as THREE from 'three';
import { makeCauldronModel } from './CauldronModel.js';
import { disposeModel, newUid, ITEM_INFO, makeItemModel } from './ItemTypes.js';
import { CAULDRON, boiling, newBrew, addWater, addIngredient, stepBrew, takePortion, spill, fullness, ingCount, surfaceY, innerRadius, wallRadius, recipeById, rollCaveCauldron, SLUDGE, INGREDIENT_RU } from './Potions.js';
import { createRng, hashString } from '../core/math.js';

const H = CAULDRON.H;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const LOCAL_BOX = new THREE.Box3(new THREE.Vector3(-CAULDRON.R_BODY, 0, -CAULDRON.R_BODY), new THREE.Vector3(CAULDRON.R_BODY, H, CAULDRON.R_BODY));
const _box = new THREE.Box3();
const _col = new THREE.Color(), _col2 = new THREE.Color();
const WATER_COLOR = 0x3a6fa8;
const GRIP = 0.55; // fingers this closed hold the rim / a handle
const BALANCE = 0.55; // rad: lifted past this, it stands up by itself
const r2 = (v) => Math.round(v * 100) / 100;
/** Hung over a campfire: its feet this high over the ground (the flames lick its bottom, not its legs). */
const HANG = 0.75;
/** The holder over a campfire: a tripod of three poles, its top this high over the ground, its feet this far out. */
const TRIPOD = { TOP: HANG + H + 3.6, FOOT: 3.4 };

export const CAULDRON_HANDS = { WALL_IN: 0.35, WALL_OUT: 0.5, RIM: 0.42, HANDLE: 0.45, TIP_SPEED: 3.2, MAX_STEP: 0.35 };

/**
 * Where a hand is against the cauldron (in its own frame: y up its axis, feet at 0):
 * 'rim' | 'handle' | 'wall' | null.
 */
export function handContact(l) {
    const rho = Math.hypot(l.x, l.z), y = l.y;
    if (Math.hypot(Math.abs(l.x) - (CAULDRON.R_RIM + 0.28), y - (H - 0.42), l.z) < CAULDRON_HANDS.HANDLE) return 'handle';
    if (y > H - 0.5 && y < H + 0.45 && Math.abs(rho - CAULDRON.R_RIM) < CAULDRON_HANDS.RIM) return 'rim';
    if (y > 0.35 && y < H) {
        const w = wallRadius(y);
        if (rho < w + CAULDRON_HANDS.WALL_OUT && rho > w - CAULDRON_HANDS.WALL_IN) return 'wall';
    }
    return null;
}

/**
 * How two hands move a standing cauldron this frame (pure): each hand {contact, grip, d: [dx, dz]
 * its move, n: [nx, nz] the way from the hand into the cauldron}. A gripping hand drags it all the
 * way it moves; an open hand only pushes (the part of its move into the cauldron). It takes both
 * hands; returns [dx, dz] of the cauldron.
 */
export function pushMove(hands) {
    const parts = [];
    for (const h of hands) {
        if (!h || !h.contact) continue;
        if (h.grip) { parts.push(h.d); continue; }
        const into = h.d[0] * h.n[0] + h.d[1] * h.n[1];
        parts.push(into > 0 ? [h.n[0] * into, h.n[1] * into] : [0, 0]);
    }
    if (parts.length < 2) return [0, 0];
    return [(parts[0][0] + parts[1][0]) / 2 * 0.9, (parts[0][1] + parts[1][1]) / 2 * 0.9];
}

export class Cauldrons {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // id -> cauldron
        this.caves = new Set(); // caves already looked into (runtime)
        this.sold = {}; // stall key -> cauldrons sold there (the next one's id)
        this.restockAt = {}; // stall key -> when the master puts out a new one
        this._prev = { right: null, left: null };
        this._caveT = 0;
        this._shopT = 0;
        this._hintAt = new Map();
        this._dip = { side: null, t: 0, asked: 0 };
        this._sendT = 0;
    }

    get auth() { return this.game.authority; }

    // ================================================================= cauldrons
    /** A cauldron appears (or an existing one takes this state). rec: {id, x, y, z, yaw, tilt, tdir, old, shop, home, st}. */
    spawn(rec) {
        let c = this.list.get(rec.id);
        if (!c) {
            const { group, liquid, bubbles } = makeCauldronModel({ old: !!rec.old });
            c = {
                id: rec.id, x: 0, y: 0, z: 0, yaw: 0, tilt: 0, tdir: 0, old: !!rec.old, shop: null, home: null,
                st: newBrew(), group, mesh: group, liquid, bubbles, boxId: null, pos: new THREE.Vector3(),
                lev: false, fall: null, q: null, vel: new THREE.Vector3(), tiltW: 0, slide: new THREE.Vector3(),
                myMoveAt: 0, moverAt: 0, seed: Math.random() * 10, bub: [], churn: 0,
            };
            this.game.scene.add(group);
            this.list.set(rec.id, c);
        }
        this._apply(c, rec);
        return c;
    }

    _apply(c, rec) {
        for (const k of ['x', 'y', 'z', 'yaw', 'tilt', 'tdir']) if (Number.isFinite(+rec[k])) c[k] = +rec[k];
        if ('shop' in rec) c.shop = rec.shop ? { stall: String(rec.shop.stall), price: Math.max(1, +rec.shop.price || CAULDRON.PRICE) } : null;
        if ('fire' in rec) c.fire = rec.fire ?? null;
        if ('home' in rec) c.home = rec.home && Number.isFinite(+rec.home.x) ? { x: +rec.home.x, z: +rec.home.z } : null;
        if (rec.st) c.st = { ...newBrew(), ...rec.st, ings: { ...(rec.st.ings || {}) } };
        if (Array.isArray(rec.q) && Array.isArray(rec.c)) {
            // (lifted by magic or falling: as it is in the air)
            c.q = (c.q || new THREE.Quaternion()).fromArray(rec.q);
            c.pos.fromArray(rec.c);
            c.lev = !!rec.lev; c.fall = rec.lev ? null : (c.fall || { vel: new THREE.Vector3() });
            this._placeFree(c);
        } else {
            c.lev = false; c.fall = null; c.q = null;
            this._place(c);
        }
    }

    /** Standing (or lying) on the ground: its model from its feet, turn and tilt. */
    _place(c) {
        this._pose(c, c.tilt, c.group.position, c.group.quaternion);
        this._afterMove(c);
    }

    /** Where its feet are and how it is turned when tilted by `tilt` (it tips about the edge of its belly on the side it falls to). */
    _pose(c, tilt, pos, quat) {
        const dir = _v.set(Math.sin(c.tdir), 0, Math.cos(c.tdir));
        const axis = _v2.crossVectors(UP, dir).normalize();
        _q.setFromAxisAngle(axis, tilt);
        _q2.setFromAxisAngle(UP, c.yaw);
        quat.copy(_q).multiply(_q2);
        const R = CAULDRON.R_BODY;
        const pivot = _v3.set(c.x + dir.x * R, this.fy(c), c.z + dir.z * R);
        const off = _v2.set(-dir.x * R, 0, -dir.z * R).applyQuaternion(_q);
        pos.copy(pivot).add(off);
    }

    /**
     * Both hands hold it (lying or half up): the tilt at which the places the fingers closed on
     * follow the hands best — it rises as far as the hands lift it, never by itself.
     */
    _followTilt(c, grips, hands) {
        const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
        let best = c.tilt, bestE = Infinity;
        for (let k = -6; k <= 6; k++) {
            const t = Math.max(0, Math.min(Math.PI / 2, c.tilt + k * 0.03));
            this._pose(c, t, pos, quat);
            m.compose(pos, quat, one);
            let e = 0;
            for (const side of ['right', 'left']) e += _v.copy(grips[side]).applyMatrix4(m).distanceToSquared(hands[side]);
            if (e < bestE - 1e-6) { bestE = e; best = t; }
        }
        return best;
    }

    /** In the air (magic or falling): its middle and turn. */
    _placeFree(c) {
        const g = c.group;
        g.quaternion.copy(c.q);
        g.position.copy(c.pos).sub(_v.set(0, H / 2, 0).applyQuaternion(c.q));
        this._afterMove(c, true);
    }

    _afterMove(c, free = false) {
        const g = c.group;
        g.updateMatrixWorld(true);
        if (!free) c.pos.set(0, H / 2, 0).applyMatrix4(g.matrixWorld);
        // the solid box round it (players and creatures bump into it; walls of its opening do not stop things falling in)
        const col = this.game.collision;
        if (c.boxId != null) col.removeBox(c.boxId);
        c.boxId = null;
        if (!c.lev && !c.fall) {
            _box.copy(LOCAL_BOX).applyMatrix4(g.matrixWorld);
            // (hung over a fire: the box from the ground up, so nobody walks into the fire under it)
            if (c.fire) _box.min.y = Math.min(_box.min.y, c.y);
            c.boxId = col.addBox({ minX: _box.min.x + 0.12, maxX: _box.max.x - 0.12, minY: _box.min.y, maxY: _box.max.y, minZ: _box.min.z + 0.12, maxZ: _box.max.z - 0.12, kind: 'cauldron' });
        }
        // things lying on its bottom go with it
        const d = c._last ? _v.subVectors(c.pos, c._last) : null;
        if (d && d.lengthSq() > 1e-8 && this.game.items) for (const L of this.game.items.loose.values()) if (L.inCaul === c.id) L.model.position.add(d);
        (c._last || (c._last = new THREE.Vector3())).copy(c.pos);
    }

    /** Its feet's height: on the ground — or hung in its holder over a campfire. */
    fy(c) { return c.y + (c.fire ? HANG : 0); }

    /** Is it standing on its feet (open side up)? */
    upright(c) { return !c.lev && !c.fall && c.tilt < 0.2; }

    // ================================================================= frame
    update(dt) {
        const g = this.game;
        if (this.auth) {
            this._caveT -= dt;
            if (this._caveT <= 0) { this._caveT = 2; this._caves(); }
            this._shopT -= dt;
            if (this._shopT <= 0) { this._shopT = 4; this._shops(); }
        }
        if (!this.list.size) return;
        const me = g.character.group.position;
        if (g.currentPose && !g.combat?.dead && !g.isDeadLocal) this._hands(dt);
        else this._prev.right = this._prev.left = null;
        this._dipFlask(dt);
        const now = performance.now();
        for (const c of this.list.values()) {
            if (this.auth) this._hostStep(c, dt, now);
            else {
                // (the host's clock comes now and then; in between, the same clock here)
                const st = c.st, f = c.fire ? g.campfires?.list.get(c.fire) : null;
                st.heat = f && f.left > 0 && st.water >= 0.3 ? Math.min(1, (st.heat || 0) + dt / CAULDRON.BOIL_TIME) : Math.max(0, (st.heat || 0) - dt / CAULDRON.COOL_TIME);
                if (st.phase === 'brewing') st.t += dt;
                if (st.phase === 'water' && st.win > 0) st.win = Math.max(0, st.win - dt);
            }
            this._holder(c);
            const d2 = c.pos.distanceToSquared(me);
            c.group.visible = d2 < 160 * 160; // (far ones — every cave's flown over — not drawn)
            if (d2 < 90 * 90) this._visual(c, dt, me);
            // the countdown: all the ingredients in before it runs out
            if (c.st.phase === 'water' && c.st.win > 0 && ingCount(c.st) && this._near(c, 20)) this._hint(c, `⏳ ${Math.ceil(c.st.win)} с — бросьте остальные ингредиенты`, 'win', 900);
        }
        // a thing carried by «Левиоса» over the opening: let go there, it falls in (like one dropped by hand)
        const ls = this.auth ? g.levitation?.state : null;
        if (ls?.kind === 'item' && ls.obj?.model) {
            const p = ls.obj.model.position;
            for (const c of this.list.values()) {
                if (!this.upright(c)) continue;
                const y = p.y - this.fy(c);
                if (Math.hypot(p.x - c.x, p.z - c.z) < CAULDRON.R_IN - 0.2 && y < H + 1.0 && y > CAULDRON.BOTTOM) { g.levitation.release(true); break; }
            }
        }
        if (this.auth) {
            this._sendT -= dt;
            if (this._sendT <= 0) {
                this._sendT = 0.1;
                for (const c of this.list.values()) if (c.moved) { c.moved = false; this._send(c); }
            }
        }
    }

    /** (host) brewing, rain, gravity, magic, the shop's watch. */
    _hostStep(c, dt, now) {
        const g = this.game;
        const f = this._fireUnder(c);
        const ev = stepBrew(c.st, dt, Math.random, !!(f && f.left > 0));
        if (ev) { this._event(c, ev); this._send(c, ev); }
        const st = c.st;
        if ((st.phase === 'brewing' || st.win > 0 || (c.fire && st.water > 0.3 && st.heat < 1)) && (c._syncT = (c._syncT || 0) + dt) > 4) { c._syncT = 0; this._send(c); }
        // rain falling into its opening
        if (g.storm?.raining && this.upright(c) && (c.st.phase === 'empty' || c.st.phase === 'water') && c.st.water < CAULDRON.FULL) {
            const sky = g.terrain?.data?.skyAt ? g.terrain.data.skyAt(c.x, c.y + H + 1, c.z) : 1;
            if (sky > 0.9) { addWater(c.st, 0.035 * dt); if ((c._rainT = (c._rainT || 0) + dt) > 2) { c._rainT = 0; this._send(c); } }
        }
        if (c.lev) return; // (the magic carries it: Levitation)
        if (c.fall) { this._fallStep(c, dt); return; }
        // tipping: gravity takes a cauldron no hand holds (towards standing, or towards lying)
        // (a hand holding it up stops it; once it is falling — tiltW — it falls)
        const held = now - Math.max(c.myMoveAt, c.moverAt) < 400 && !c.tiltW;
        if (!held && c.tilt > 0.001 && c.tilt < Math.PI / 2 - 0.001) this._gravity(c, dt);
        // slid by a blast
        if (c.slide.lengthSq() > 0.01) {
            this._slide(c, c.slide.x * dt, c.slide.z * dt);
            c.slide.multiplyScalar(Math.max(0, 1 - 4 * dt));
            c.moved = true;
        }
        if (c.tilt > CAULDRON.SPILL_TILT) this._spill(c);
    }

    /**
     * (host) The campfire it stands on. Pushed / carried onto a burning one, it is hung in a holder
     * over it (a tripod, chains to its handles); pulled off it (or knocked over, lifted), it is down
     * on the ground again — and it has to go well away before it hangs there again.
     */
    _fireUnder(c) {
        const camp = this.game.campfires;
        if (!camp?.list) return null;
        const free = this.upright(c);
        if (c.fire) {
            const f = camp.list.get(c.fire);
            if (f && free && Math.hypot(c.x - f.x, c.z - f.z) < 1.0) return f;
            c.leftFire = c.fire;
            c.fire = null;
            if (!c.lev && !c.fall) this._place(c);
            c.moved = true;
            return null;
        }
        if (!free) return null;
        for (const f of camp.list.values()) {
            const d = Math.hypot(c.x - f.x, c.z - f.z);
            if (c.leftFire === f.id) { if (d > 2.6) c.leftFire = null; else continue; }
            if (f.left <= 0 || d > 1.4 || Math.abs(c.y - f.y) > 1.6) continue;
            c.fire = f.id;
            c.x = f.x; c.z = f.z;
            this._place(c);
            this._clang(c, 0.4);
            this._hint(c, c.st.water > 0.3 ? '🔥 Котёл над костром — вода греется, скоро закипит' : '🔥 Котёл над костром — теперь налейте воды («Waterbollow»)', 'fire');
            c.moved = true;
            return f;
        }
        return null;
    }

    /** The holder over a campfire (every computer): three poles lashed at the top, two chains down to the handles. */
    _holder(c) {
        if (!c.fire) { if (c.tripod) c.tripod.visible = false; return; }
        if (!c.tripod) {
            const t = new THREE.Group();
            const wood = new THREE.MeshLambertMaterial({ color: 0x5a3c22 }), iron = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.6, metalness: 0.6 });
            t.userData.poles = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1, 7), wood); m.castShadow = true; t.add(m); return m; });
            t.userData.chains = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), iron); t.add(m); return m; });
            t.userData.lash = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.35, 8), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
            t.add(t.userData.lash);
            this.game.scene.add(t);
            c.tripod = t;
        }
        const t = c.tripod;
        t.visible = true;
        const top = _v.set(c.x, c.y + TRIPOD.TOP, c.z);
        t.userData.lash.position.copy(top);
        const seg = (m, a, b) => {
            _v3.subVectors(b, a);
            m.position.copy(a).addScaledVector(_v3, 0.5);
            m.scale.set(1, _v3.length(), 1);
            m.quaternion.setFromUnitVectors(UP, _v3.normalize());
        };
        t.userData.poles.forEach((m, i) => {
            const a = c.yaw + Math.PI / 2 + (i * 2 * Math.PI) / 3; // (clear of the handles)
            seg(m, _v2.set(c.x + Math.sin(a) * TRIPOD.FOOT, c.y, c.z + Math.cos(a) * TRIPOD.FOOT), top);
        });
        c.group.updateMatrixWorld(true);
        t.userData.chains.forEach((m, i) => seg(m, top, _v2.set((i ? -1 : 1) * (CAULDRON.R_RIM + 0.28), H - 0.15, 0).applyMatrix4(c.group.matrixWorld)));
    }

    /**
     * It falls the rest of the way by itself: a turning speed (tiltW, rad/s; a shove gives it one)
     * that gravity pulls back onto its feet before the balance point, and down onto its side past it.
     */
    _gravity(c, dt) {
        c.tiltW = (c.tiltW || 0) + (c.tilt < BALANCE ? -6 : 6) * dt;
        c.tilt = Math.max(0, Math.min(Math.PI / 2, c.tilt + c.tiltW * dt));
        if (c.tilt <= 0 || c.tilt >= Math.PI / 2) {
            c.tiltW = 0;
            this._clang(c, c.tilt <= 0 ? 0.5 : 0.8);
            if (c.tilt <= 0) this._near(c, 15) && this._hint(c, '🫕 Котёл стоит на ногах', 'up');
        }
        this._place(c);
        c.moved = true;
    }

    _clang(c, power) {
        const g = this.game;
        if (this._near(c, 30)) g.sound?.playClang?.(power);
        for (let i = 0; i < 12; i++) g.fx?.spark(_v.set(c.pos.x + (Math.random() - 0.5) * 3, c.y + 0.2, c.pos.z + (Math.random() - 0.5) * 3), 0x8a7d6b, 0.1, _v2.set((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2), 0.6);
    }

    /** (host) Overturned: everything inside pours out; things on its bottom fall out. */
    _spill(c) {
        const g = this.game;
        const dir = _v3.set(Math.sin(c.tdir), 0, Math.cos(c.tdir));
        if (c.lev && c.q) dir.copy(UP).applyQuaternion(c.q).setY(0).normalize();
        for (const L of g.items?.loose.values() || []) {
            if (L.inCaul !== c.id) continue;
            L.inCaul = null; L.rest = false;
            L.model.position.copy(c.pos).addScaledVector(dir, H / 2 + 0.4);
            L.vel.copy(dir).multiplyScalar(2.5).setY(1.5);
        }
        if (!spill(c.st)) return;
        this._pourFx(c, dir);
        this._event(c, 'spill');
        this._send(c, 'spill');
    }

    _pourFx(c, dir) {
        const g = this.game;
        const p = _v.copy(c.pos).addScaledVector(dir, H / 2 + 0.3);
        const ground = g.collision.surfaceY(p.x, p.z);
        g.water?._splash?.(_v2.set(p.x, ground, p.z), 2.2, 45);
        if (this._near(c, 30)) g.sound?.playSplash?.();
    }

    // ================================================================= hands
    /** My two hands on a cauldron: push, drag, knock over, stand up. */
    _hands(dt) {
        const g = this.game, ch = g.character;
        const me = ch.group.position;
        const hands = {};
        for (const side of ['right', 'left']) {
            const p = ch.getHandWorldPosition(side, new THREE.Vector3());
            const busy = !!(g.items?.held[side] || g.weapons?.hands?.[side]?.held || g.boards?.handBusy?.(side));
            const prev = this._prev[side];
            const d = prev ? _v.subVectors(p, prev).clone() : new THREE.Vector3();
            if (d.length() > CAULDRON_HANDS.MAX_STEP) d.setLength(0); // (a jump of the tracking, not a push)
            hands[side] = { p, d, busy, curl: ch.getGripCurl ? ch.getGripCurl(side) : 0, tracked: ch.isHandTracked ? ch.isHandTracked(side) : true };
            this._prev[side] = p;
        }
        let best = null;
        for (const c of this.list.values()) {
            if (c.lev || c.fall || c.pos.distanceToSquared(me) > 100) continue;
            if (performance.now() - c.moverAt < 400 && c.moverId && c.moverId !== g.localId) continue; // (another's hands on it)
            _inv.copy(c.group.matrixWorld).invert();
            const touch = {};
            let n = 0;
            for (const side of ['right', 'left']) {
                const h = hands[side];
                if (h.busy || !h.tracked) continue;
                const l = _v.copy(h.p).applyMatrix4(_inv);
                const contact = handContact(l);
                if (!contact) continue;
                const grip = contact !== 'wall' && h.curl > GRIP;
                const nx = c.pos.x - h.p.x, nz = c.pos.z - h.p.z, nl = Math.hypot(nx, nz) || 1;
                touch[side] = { contact, grip, d: [h.d.x, h.d.z], dy: h.d.y, n: [nx / nl, nz / nl], hy: l.y, local: l.clone() };
                n++;
            }
            if (n && (!best || n > best.n)) best = { c, touch, n };
        }
        for (const c of this.list.values()) if (c.grips && (!best || best.c !== c || !best.touch.right?.grip || !best.touch.left?.grip)) c.grips = null; // (let go)
        if (!best) return;
        const { c, touch } = best;
        const both = best.n === 2;
        const R = touch.right, L = touch.left;
        let changed = false;
        if (c.tilt < 0.05) {
            // standing: push / drag along the ground
            const [mx, mz] = pushMove([R, L]);
            const speed = Math.hypot(mx, mz) / Math.max(dt, 1e-3);
            if (both && !R.grip && !L.grip && R.hy > 0.72 * H && L.hy > 0.72 * H && speed > CAULDRON_HANDS.TIP_SPEED) {
                // a hard shove high on it: over it goes
                c.tdir = Math.atan2(mx, mz);
                c.tilt = 0.12; c.tiltW = Math.max(3.5, speed * 0.8);
                this._place(c);
                changed = true;
                this._hint(c, '💥 Котёл опрокинулся! Поставить: обе руки на край или ручки — и поднимайте', 'tip');
            } else if (Math.hypot(mx, mz) > 1e-4) {
                changed = this._slide(c, mx, mz) || changed;
            } else if (!both && (Math.hypot(...(R || L).d) > 0.02)) {
                this._hint(c, '🫕 Котёл тяжёлый — толкайте двумя руками (или возьмитесь обеими за край / ручки и тяните)', 'heavy', 8000);
            }
        } else if (both && R.grip && L.grip) {
            // lying: both hands on the rim / the handles lift it — the places they hold follow them
            if (!c.grips) c.grips = { right: R.local.clone(), left: L.local.clone() };
            c.tilt = this._followTilt(c, c.grips, { right: hands.right.p, left: hands.left.p });
            c.tiltW = 0;
            if (c.tilt <= 0) { c.grips = null; this._clang(c, 0.5); this._hint(c, '🫕 Котёл стоит на ногах', 'up'); }
            this._place(c);
            changed = true;
        } else if (both) {
            // lying, pushed by open hands: it slides (and rolls a little) along the ground
            const [mx, mz] = pushMove([R, L]);
            if (Math.hypot(mx, mz) > 1e-4) changed = this._slide(c, mx, mz) || changed;
        }
        if (!changed) return;
        c.myMoveAt = performance.now();
        c.moverId = g.localId;
        this._shopWatch(c);
        if (this.auth) c.moved = true;
        else this._sendMove(c);
    }

    /** Move it along the ground by (dx, dz), if nothing is in the way. Returns true if it moved. */
    _slide(c, dx, dz) {
        const col = this.game.collision;
        const x = c.x + dx, z = c.z + dz;
        const r = c.tilt > 0.6 ? CAULDRON.R_BODY * 0.8 : CAULDRON.R_BODY * 0.85;
        const y0 = c.y;
        const ny = col.groundAt ? col.groundAt(x, z, y0 + 1.2) : col.groundY(x, z);
        if (ny > y0 + 0.65) return false; // (a step / a wall)
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
            const gy = col.groundAt ? col.groundAt(px, pz, y0 + 1.2) : col.groundY(px, pz);
            if (gy > y0 + 0.9) return false;
        }
        for (const b of col.queryBoxes(x - r, x + r, z - r, z + r)) {
            if (b.id === c.boxId || b.maxY < y0 + 0.4 || b.minY > y0 + H) continue;
            const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
            if (Math.hypot(cx - x, cz - z) < r) return false;
        }
        c.x = x; c.z = z; c.y = ny > y0 - 3 ? ny : y0;
        this._place(c);
        return true;
    }

    /** (guest) My hands moved it: the host hears where it is now. */
    _sendMove(c) {
        const now = performance.now();
        if (now - (c._mvSent || 0) < 90) return;
        c._mvSent = now;
        this.game.sync?.cauldron?.({ t: 'caulmv', id: c.id, p: [r2(c.x), r2(c.y), r2(c.z)], yaw: r2(c.yaw), tilt: r2(c.tilt), tdir: r2(c.tdir) });
    }

    // ================================================================= the shop
    /** My hands took the master's cauldron: he names the price; carried far unpaid — a theft. */
    _shopWatch(c) {
        if (!c.shop || !c.home) return;
        const d = Math.hypot(c.x - c.home.x, c.z - c.home.z);
        const talk = this.game.castleLife?.talk;
        if (d > 0.4 && !c.offered) { c.offered = true; talk?.offerCauldron?.(c); }
        if (d > 14) {
            talk?.cauldronStolen?.(c);
            this.clearShop(c.id);
        }
    }

    /** Paid (or gone unpaid): it is nobody's goods any more. */
    clearShop(id) {
        const c = this.list.get(id);
        if (!c || !c.shop) return;
        if (this.auth) {
            const key = c.shop.stall;
            c.shop = null;
            this.sold[key] = (this.sold[key] || 0) + 1;
            this.restockAt[key] = performance.now() + 120000;
            this._send(c);
        } else {
            c.shop = null;
            this.game.sync?.cauldron?.({ t: 'caulshop', id });
        }
    }

    paid(id) { this.clearShop(id); }

    /** (host) The masters of cauldrons put one out by their stall (when theirs was sold). */
    _shops() {
        const life = this.game.castleLife;
        if (!life?.castles) return;
        const now = performance.now();
        for (const cs of life.castles.values()) {
            if (!cs.awake || cs.def.kind !== 'tower') continue;
            cs.def.stalls.forEach((s, i) => {
                if (!s.potions || !s.cauldron) return;
                const key = cs.def.id + ':s' + i;
                for (const c of this.list.values()) if (c.shop?.stall === key) return;
                if (now < (this.restockAt[key] || 0)) return;
                for (const c of this.list.values()) if (Math.hypot(c.x - s.cauldron.x, c.z - s.cauldron.z) < 3.6) return; // (its place taken)
                const col = this.game.collision;
                const y = col.groundAt ? col.groundAt(s.cauldron.x, s.cauldron.z, s.cauldron.y + 1.5) : col.groundY(s.cauldron.x, s.cauldron.z);
                const c = this.spawn({ id: `shop:${key}:${this.sold[key] || 0}`, x: s.cauldron.x, y, z: s.cauldron.z, yaw: s.cauldron.yaw || 0, tilt: 0, tdir: 0, shop: { stall: key, price: CAULDRON.PRICE }, home: { x: s.cauldron.x, z: s.cauldron.z } });
                this._send(c);
            });
        }
    }

    // ================================================================= caves
    /** (host) A forgotten cauldron in a cave chamber now and then: old, rusty, often overturned. */
    _caves() {
        const g = this.game, t = g.terrain?.data;
        if (!t?.cavesNear || g.config?.map || g.config?.mode === 'test') return;
        const p = g.character.group.position;
        for (const cv of t.cavesNear(p.x, p.z, 90)) {
            if (this.caves.has(cv.id)) continue;
            this.caves.add(cv.id);
            const id = 'cave:' + cv.id;
            if (this.list.has(id)) continue;
            const rng = createRng(hashString('cauldron:' + cv.id + ':' + (t.seed ?? 0)));
            const roll = rollCaveCauldron(rng, !!cv.test); // (the creative test cave: always one, to try)
            if (!roll) continue;
            const spot = this.caveSpot(cv, roll, t);
            if (!spot) continue;
            const y = g.collision.groundAt ? g.collision.groundAt(spot.x, spot.z, spot.y + 1) : spot.y;
            const c = this.spawn({ id, x: spot.x, y, z: spot.z, yaw: roll.yaw, tilt: roll.tipped ? Math.PI / 2 : 0, tdir: roll.dir, old: true });
            this._send(c);
        }
    }

    /** A free spot in one of the cave's chambers (away from its chests), or null. */
    caveSpot(cv, roll, t) {
        const rooms = (cv.chambers?.length ? cv.chambers : [{ x: cv.kx, z: cv.kz, F: cv.F, r: cv.r }]).filter((c) => c.r >= 4.5);
        if (!rooms.length) return null;
        const first = Math.floor(roll.at * rooms.length) % rooms.length;
        const chests = cv.chests || [{ x: cv.kx + 0.5, z: cv.kz + 0.5 }];
        // (its chosen chamber first, then the others: a flat free spot away from the chests)
        for (let j = 0; j < rooms.length; j++) {
            const room = rooms[(first + j) % rooms.length];
            for (let k = 0; k < 24; k++) {
                const a = roll.dir + k * 0.8, d = Math.min(room.r - 2.5, [3.5, 2, 5][k % 3]);
                if (d < 0) continue;
                const x = Math.round(room.x + Math.cos(a) * d) + 0.5, z = Math.round(room.z + Math.sin(a) * d) + 0.5;
                if (chests.some((ch) => Math.hypot(ch.x - x, ch.z - z) < 4.5)) continue;
                const sp = t.chestSpot ? t.chestSpot({ x, y: room.F, z, a }) : { x, y: room.F, z };
                if (sp) return sp;
            }
        }
        return null;
    }

    // ================================================================= water and things
    /**
     * A falling «Waterbollow» ball over a standing cauldron's opening pours into it (every computer
     * sees it go in; the host fills it). Ice does not pour. True: the ball is gone.
     */
    catchBall(b) {
        if (b.frozen) return false;
        for (const c of this.list.values()) {
            if (!this.upright(c)) continue;
            const dx = b.pos.x - c.x, dz = b.pos.z - c.z;
            if (Math.hypot(dx, dz) > CAULDRON.R_IN + b.r * 0.4) continue;
            const y = b.pos.y - this.fy(c);
            if (y - b.r > H + 0.3 || y < CAULDRON.BOTTOM - 0.3 || b.vel.y > 1) continue; // (its bottom at the rim: in it goes)
            const g = this.game;
            const vol = (4 / 3) * Math.PI * b.r ** 3;
            g.water?._splash?.(_v.set(b.pos.x, this.fy(c) + surfaceY(c.st) + 0.1, b.pos.z), 1 + b.r * 0.6, 20 + b.r * 12);
            if (this._near(c, 30)) g.sound?.playSplash?.();
            c.splashT = 1;
            if (this.auth) {
                const before = c.st.water;
                const over = addWater(c.st, vol);
                if (over > 0.3) g.water?._splash?.(_v.set(c.x, this.fy(c) + H, c.z), 2.4, 30); // (runs over the rim)
                if (c.st.water > before) { this._event(c, 'water'); this._send(c, 'water'); }
            }
            return true;
        }
        return false;
    }

    /**
     * (from Items' physics) A loose thing at `p` inside a standing cauldron's opening:
     * 'in' — it falls on through the opening (the walls round it don't stop it);
     * 'stop' — it reached the water (dissolved: gone) or the bottom (lies there); null — not in one.
     */
    intoOpening(L, p) {
        if (L.hover || L.lev || L.accio) return null;
        for (const c of this.list.values()) {
            if (!this.upright(c)) continue;
            const dx = p.x - c.x, dz = p.z - c.z;
            if (dx * dx + dz * dz > (CAULDRON.R_IN - 0.15) ** 2) continue;
            const y = p.y - this.fy(c);
            if (y > H + 0.35 || y < CAULDRON.BOTTOM - 0.6) continue;
            const wet = c.st.water > 0.3;
            const top = wet ? surfaceY(c.st) : CAULDRON.BOTTOM + 0.12;
            if (y > top + 0.05) return 'in';
            const g = this.game;
            if (!this.auth) { L.model.position.set(p.x, this.fy(c) + top, p.z); L.vel.set(0, 0, 0); return 'stop'; }
            const kind = L.item.kind;
            const res = addIngredient(c.st, kind, L.item.count || 1);
            if (res === 'in' || res === 'spoil') {
                g.items.removeLoose(L.item.uid);
                g.sync?.itemGone?.(L.item.uid, null, null);
                g.water?._splash?.(_v.set(p.x, this.fy(c) + top, p.z), 0.8, 14);
                if (this._near(c, 25)) g.sound?.playSplash?.();
                this._event(c, res === 'spoil' ? 'spoil' : 'ing', kind);
                this._send(c, res === 'spoil' ? 'spoil' : 'ing', kind);
                return 'stop';
            }
            // dry, or a thing that never dissolves: it lies on the bottom
            L.model.position.set(p.x, this.fy(c) + CAULDRON.BOTTOM + 0.15, p.z);
            L.vel.set(0, 0, 0); L.spin.set(0, 0, 0); L.rest = true; L.inCaul = c.id;
            if (res === 'dry') this._hint(c, '🫕 Котёл сухой — сначала налейте воды («Waterbollow» у реки, принесите шар и плесните в котёл). Вещь лежит на дне', 'dry', 6000);
            else if (res === 'cold') this._send(c, 'cold');
            if (res === 'cold') this._event(c, 'cold');
            if (wet) g.water?._splash?.(_v.set(p.x, this.fy(c) + top, p.z), 0.6, 8);
            return 'stop';
        }
        return null;
    }

    /** An empty flask dipped into a ready cauldron fills with one portion. */
    _dipFlask(dt) {
        const g = this.game, items = g.items;
        if (!items) return;
        let found = null;
        for (const side of ['right', 'left']) {
            const h = items.held[side];
            if (!h || h.item.kind !== 'flask') continue;
            const p = h.model.position;
            for (const c of this.list.values()) {
                if (!this.upright(c) || c.st.water < 0.3) continue;
                const dx = p.x - c.x, dz = p.z - c.z, y = p.y - this.fy(c);
                // (the flask really in the liquid: under its surface — a low level needs the hand deeper)
                if (y < CAULDRON.BOTTOM || y > surfaceY(c.st) - 0.05 || Math.hypot(dx, dz) > innerRadius(y) - 0.05) continue;
                found = { side, c };
            }
        }
        if (!found) { this._dip.t = 0; return; }
        this._dip.t += dt;
        if (this._dip.t < 0.4) return;
        const { side, c } = found;
        const ph = c.st.phase;
        if (ph !== 'ready') {
            this._dip.t = -1.5; // (says it once a while)
            const why = ph === 'brewing' ? '🫧 Ещё варится — подождите' : ph === 'sludge' ? '💨 Это не зелье, а жижа — опрокиньте котёл и налейте воды заново' : '💧 Это просто вода — сначала сварите зелье';
            g.hud.setVoice?.(why, true);
            return;
        }
        this._dip.t = -1;
        if (this.auth) {
            const color = c.st.color;
            const rec = takePortion(c.st);
            if (rec) { this._fill(side, rec, color); this._send(c); }
        } else if (performance.now() - this._dip.asked > 1500) {
            this._dip.asked = performance.now();
            g.sync?.cauldron?.({ t: 'caulfill', id: c.id, side });
        }
    }

    /** My flask is full now (one empty flask of the stack becomes the potion; the rest go to a slot). */
    _fill(side, rec, color) {
        const g = this.game, items = g.items;
        const h = items.held[side];
        if (!h || h.item.kind !== 'flask') return;
        const left = (h.item.count || 1) - 1;
        items.releaseHand(side);
        items.takeIntoHand({ kind: 'potion', uid: newUid(), rec, color }, side, { closed: true });
        if (left > 0) {
            const rest = { kind: 'flask', uid: newUid(), count: left };
            if (!g.inventory?.storeItem?.(rest)) items._noRoom?.(rest);
        }
        const r = recipeById(rec);
        g.hud.setVoice?.(`🧪 Колба наполнена: ${r ? r.name : 'зелье'}! Поднесите ко рту, чтобы выпить`, true);
        g.sound?.playWaterRise?.();
    }

    // ================================================================= magic, blasts
    /** (host) «Вингардиум Левиоса» takes it. */
    levStart(c) {
        c.lev = true;
        c.fall = null;
        c.q = c.group.quaternion.clone();
        c.vel.set(0, 0, 0);
        this._placeFree(c);
        c.moved = true;
    }

    /** (host) Carried by the magic after the hand: slowly (it is heavy), turning with the wrist. */
    levMove(c, target, q, dt) {
        _v.subVectors(target, c.pos);
        c.vel.lerp(_v.multiplyScalar(2.5), Math.min(1, dt * 4));
        c.pos.addScaledVector(c.vel, dt);
        const ground = this.game.collision.surfaceY(c.pos.x, c.pos.z);
        if (c.pos.y < ground + H / 2) c.pos.y = ground + H / 2;
        c.q.slerp(q, Math.min(1, dt * 4));
        this._placeFree(c);
        c.x = c.pos.x; c.z = c.pos.z;
        this._shopWatch(c); // (lifted off the master's stall: he names the price / carried far — a theft)
        // tilted in the air: it pours out
        if (_v.copy(UP).applyQuaternion(c.q).y < Math.cos(CAULDRON.SPILL_TILT)) this._spill(c);
        c.moved = true;
    }

    /** (host) The magic lets it go: it falls. */
    levDrop(c, vel, gentle = false) {
        c.lev = false;
        c.fall = { vel: vel.clone(), top: c.pos.y, soft: gentle };
        c.moved = true;
    }

    _fallStep(c, dt) {
        const g = this.game, f = c.fall;
        f.vel.y -= 18 * dt;
        if (f.soft) { f.vel.y = Math.max(f.vel.y, -2.5); f.vel.x *= 0.9; f.vel.z *= 0.9; } // (let down gently by the magic)
        c.pos.addScaledVector(f.vel, dt);
        const up = _v3.copy(UP).applyQuaternion(c.q);
        const ground = g.collision.groundAt ? g.collision.groundAt(c.pos.x, c.pos.z, c.pos.y) : g.collision.surfaceY(c.pos.x, c.pos.z);
        // (its lowest point: half its height along its axis, or its belly when it lies)
        const half = Math.abs(up.y) * H / 2 + Math.sqrt(Math.max(0, 1 - up.y * up.y)) * CAULDRON.R_BODY;
        if (c.pos.y - half > ground) { this._placeFree(c); c.moved = true; return; }
        // landed: on its feet, or on its side
        const speed = -f.vel.y;
        const lying = up.y < Math.cos(0.9);
        c.tilt = lying ? Math.PI / 2 : 0;
        c.tdir = Math.atan2(up.x, up.z);
        c.yaw = new THREE.Euler().setFromQuaternion(c.q, 'YXZ').y;
        const feet = _v.copy(c.pos).addScaledVector(up, -H / 2);
        c.x = lying ? c.pos.x - Math.sin(c.tdir) * CAULDRON.R_BODY * 0.5 : feet.x;
        c.z = lying ? c.pos.z - Math.cos(c.tdir) * CAULDRON.R_BODY * 0.5 : feet.z;
        c.y = ground;
        c.fall = null; c.q = null;
        this._place(c);
        this._clang(c, Math.min(1, 0.4 + speed / 15));
        if (speed > 6) this._crush(c, speed);
        if (lying) this._spill(c);
        c.moved = true;
    }

    /** (host) A heavy cauldron fell on somebody: who was under it is hurt. */
    _crush(c, speed) {
        const g = this.game;
        const dmg = Math.min(14, Math.round(speed * 0.8));
        const at = _v.set(c.pos.x, c.y + 1, c.pos.z), r = CAULDRON.R_BODY;
        for (const z of g.zombies || []) if (!z.isDead && z.group.position.distanceTo(at) < r + 0.6) g.damageZombie?.(z, dmg, false, _v2.set(0, 0, 1), null);
        g.animals?.hitAt?.(at, r, dmg, null);
        g.castleLife?.hitAt?.(at, r, dmg, null);
        g.ships?.crew?.hitAt?.(at, r, dmg, null, 'Cauldron');
        g.spiders?.hitAt?.(at, r, dmg, 'Cauldron', null);
        g.dragons?.hitAt?.(at, r, dmg, 'Cauldron', null);
        g.iceCastle?.hitAt?.(at, r, dmg, 'Cauldron', null);
        g.phoenixes?.hitAt?.(at, r, dmg, 'Cauldron', null); // (a phoenix standing there; in the air it is not under it)
        g.owls?.hitAt?.(at, r, dmg, 'Cauldron', null); // (an owl sitting there: it darts away untouched)
        // (a living tree: not hurt — only fire hurts it; book-birds are in the air, it falls past them)
        const me = g.character.group.position;
        if (Math.hypot(me.x - at.x, me.z - at.z) < r + 0.5 && Math.abs(me.y - 2 - c.y) < 3 && !g.isDeadLocal) {
            if (g.combat?.enabled) g.combat.damage(dmg, null, 'collapse'); else g.damageLocalPlayer?.(dmg);
            g.hud?.setVoice?.(`🫕 На вас упал котёл: −${dmg}`, true);
        }
    }

    /** A blast nearby: a cauldron is thrown aside, a near one knocked over (the host decides). */
    blast(pos, radius, power = 1) {
        if (!this.auth) return;
        for (const c of this.list.values()) {
            if (c.lev) continue;
            const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
            if (d > radius + 3) continue;
            const k = Math.max(0, 1 - d / (radius + 3)) * Math.sqrt(power);
            const dir = _v.set(c.pos.x - pos.x, 0, c.pos.z - pos.z);
            if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
            dir.normalize();
            c.slide.addScaledVector(dir, 6 * k);
            if (k > 0.3 && c.tilt < 0.05 && !c.fall) { c.tdir = Math.atan2(dir.x, dir.z); c.tilt = 0.12; c.tiltW = 3 + 2 * k; }
            c.moved = true;
        }
    }

    // ================================================================= look
    _visual(c, dt, me) {
        const g = this.game, st = c.st;
        const wet = this.upright(c) || c.lev ? st.water > 0.05 : false;
        const liq = c.liquid;
        liq.visible = wet;
        c.splashT = Math.max(0, (c.splashT || 0) - dt);
        if (!wet) { c.bubbles.count = 0; return; }
        const sy = surfaceY(st);
        const r = innerRadius(sy);
        liq.position.y = sy + Math.sin(performance.now() * 0.004) * 0.015 * (st.phase === 'brewing' ? 3 : 1);
        liq.scale.set(r, r, 1);
        c.churn += dt;
        const m = liq.material;
        let bubbles = 0, glow = 0;
        if (st.phase === 'water') {
            _col.setHex(WATER_COLOR);
            if (ingCount(st)) _col.lerp(_col2.setHSL((c.seed * 0.1 + c.churn * 0.03) % 1, 0.4, 0.4), 0.3);
            // heating: first steam, then small bubbles, then a rolling boil
            const heat = st.heat || 0;
            bubbles = heat > 0.55 ? Math.round(4 + 14 * (heat - 0.55) / 0.45) : 0;
            if (heat > 0.3 && Math.random() < dt * 10 * heat) g.fx?.spark(_v.set(c.x + (Math.random() - 0.5) * r * 1.4, this.fy(c) + sy + 0.2, c.z + (Math.random() - 0.5) * r * 1.4), 0xeeeeee, 0.12, _v2.set((Math.random() - 0.5) * 0.5, 1.2 + Math.random(), (Math.random() - 0.5) * 0.5), 1.3);
            if (boiling(st) && me && c.pos.distanceTo(me) < 22 && (c._bubT = (c._bubT || 0) - dt) <= 0) { c._bubT = 2.5 + Math.random() * 1.5; g.sound?.playWaterRise?.(); }
        } else if (st.phase === 'brewing') {
            // magic: colours swirl, it churns, steam and sparks rise
            const k = Math.min(1, st.t / 4);
            _col.setHSL((c.seed + c.churn * 0.12) % 1, 0.85, 0.5);
            _col.lerp(_col2.setHex(WATER_COLOR), 1 - k);
            bubbles = 10 + Math.round(12 * k);
            glow = 0.45 * k + 0.15 * Math.sin(c.churn * 5);
            if (Math.random() < dt * 14) g.fx?.spark(_v.set(c.x + (Math.random() - 0.5) * r * 1.6, this.fy(c) + sy + 0.2, c.z + (Math.random() - 0.5) * r * 1.6), Math.random() < 0.6 ? 0xeeeeee : _col.getHex(), 0.12, _v2.set((Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6), 1.2);
            if (Math.random() < dt * 2) g.fx?.spark(_v.set(c.x, this.fy(c) + sy + 0.3, c.z), _col2.setHSL(Math.random(), 1, 0.6).getHex(), 0.08, _v2.set((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.9);
            if (me && c.pos.distanceTo(me) < 22 && (c._bubT = (c._bubT || 0) - dt) <= 0) { c._bubT = 2.2 + Math.random() * 1.5; g.sound?.playWaterRise?.(); }
        } else if (st.phase === 'ready') {
            _col.setHex(st.color || 0x9fd8ff);
            bubbles = 2;
            glow = 0.35 + 0.1 * Math.sin(c.churn * 2);
            if (Math.random() < dt * 3) g.fx?.spark(_v.set(c.x + (Math.random() - 0.5) * r, this.fy(c) + sy + 0.15, c.z + (Math.random() - 0.5) * r), st.color || 0x9fd8ff, 0.07, _v2.set(0, 0.8, 0), 0.9);
        } else if (st.phase === 'sludge') {
            _col.setHex(SLUDGE);
            bubbles = 4;
            if (Math.random() < dt * 2) g.fx?.spark(_v.set(c.x + (Math.random() - 0.5) * r, this.fy(c) + sy + 0.3, c.z + (Math.random() - 0.5) * r), 0x8a9a5a, 0.15, _v2.set(0, 0.7, 0), 1.6);
        } else _col.setHex(WATER_COLOR);
        m.color.lerp(_col, Math.min(1, dt * 3));
        m.emissive.copy(m.color).multiplyScalar(Math.max(0, glow));
        m.roughness = st.phase === 'sludge' ? 0.9 : 0.15;
        // bubbles rising and bursting at the surface
        const B = c.bubbles;
        while (c.bub.length < bubbles) c.bub.push({ a: Math.random() * 6.28, d: Math.random(), t: Math.random(), s: 0.04 + Math.random() * 0.08 });
        c.bub.length = Math.min(c.bub.length, bubbles);
        let i = 0;
        for (const b of c.bub) {
            b.t += dt * (st.phase === 'brewing' ? 1.6 : 0.6);
            if (b.t > 1) { b.t = 0; b.a = Math.random() * 6.28; b.d = Math.random(); }
            const rr = Math.sqrt(b.d) * r * 0.85, s = b.s * (st.phase === 'sludge' ? 2.2 : 1) * (0.5 + b.t);
            _m.makeScale(s, s * 0.7, s).setPosition(Math.cos(b.a) * rr, sy + 0.02 + b.t * 0.06, Math.sin(b.a) * rr);
            B.setMatrixAt(i++, _m);
        }
        B.count = i;
        B.instanceMatrix.needsUpdate = true;
        B.material.color.copy(m.color).lerp(_col2.setHex(0xffffff), 0.5);
    }

    // ================================================================= hints
    _near(c, d) { return c.pos.distanceTo(this.game.character.group.position) < d; }

    _hint(c, text, key, every = 4000) {
        const now = performance.now();
        if (now - (this._hintAt.get(key) || -1e9) < every) return;
        this._hintAt.set(key, now);
        this.game.hud?.setVoice?.(text, true);
    }

    /** Something happened in a cauldron (on every computer near it). */
    _event(c, ev, kind = null) {
        const g = this.game;
        if (!this._near(c, 18)) return;
        const st = c.st;
        switch (ev) {
            case 'water': {
                const k = Math.round(fullness(st) * 100);
                if (st.phase !== 'water' && st.phase !== 'empty') break;
                this._hint(c, k >= 98 ? '💧 Котёл полон — теперь бросайте ингредиенты' : `💧 Вода в котле: ${k}% — плесните ещё`, 'water', 500);
                break;
            }
            case 'ing': {
                const name = INGREDIENT_RU[kind] || (ITEM_INFO[kind]?.name || 'вещь').toLowerCase();
                this._hint(c, `🫕 ${name} в котле (всего: ${ingCount(st)})`, 'ing', 300);
                break;
            }
            case 'brew': g.hud?.notify?.('🫧 Котёл закипает — зелье варится (подождите, от 30 секунд до минуты)'); break;
            case 'ready': {
                const r = recipeById(st.rec);
                g.hud?.notify?.(`🧪 Зелье готово! (${r ? r.name : 'зелье'}) — окуните пустую колбу в котёл`);
                for (let i = 0; i < 40; i++) g.fx?.spark(_v.set(c.x, this.fy(c) + H, c.z), st.color || 0xffffff, 0.1, _v2.set((Math.random() - 0.5) * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 4), 1.2);
                g.sound?.playWaterRise?.();
                break;
            }
            case 'boil': g.hud?.notify?.(`🫧 Вода закипела — бросайте ингредиенты: на все у вас ${CAULDRON.WINDOW} секунд с первого`); break;
            case 'cold': this._hint(c, c.fire ? '🫕 Вода ещё не кипит — подождите (эта вещь утонула и не считается)' : '🫕 Котёл не на костре — разожгите «Fire», поставьте котёл на огонь и дождитесь кипения', 'cold', 3000); break;
            case 'late': g.hud?.notify?.('⌛ Не успели — зелье испорчено: серая жижа. Опрокиньте котёл, чтобы вылить, и начните заново'); break;
            case 'out': g.hud?.notify?.('🔥 Огонь погас (или котёл сняли с костра) — зелье испорчено. Опрокиньте котёл и начните заново'); break;
            case 'sludge': g.hud?.notify?.('💨 Фу… Ничего не вышло — серая вонючая жижа. Опрокиньте котёл руками, чтобы вылить, и налейте воды заново'); break;
            case 'spoil': this._hint(c, '💨 Зелье испорчено — в котле жижа', 'spoil'); break;
            case 'spill': this._hint(c, '💦 Всё вылилось из котла', 'spill'); break;
            default: break;
        }
    }

    // ================================================================= network / save
    _rec(c) {
        const d = { id: c.id, x: r2(c.x), y: r2(c.y), z: r2(c.z), yaw: r2(c.yaw), tilt: r2(c.tilt), tdir: r2(c.tdir), old: c.old ? 1 : 0, shop: c.shop, home: c.home, fire: c.fire || null, st: { ...c.st, t: r2(c.st.t), dur: r2(c.st.dur), water: r2(c.st.water) } };
        if ((c.lev || c.fall) && c.q) { d.q = c.q.toArray().map(r2); d.c = c.pos.toArray().map(r2); d.lev = c.lev ? 1 : 0; }
        return d;
    }

    /** (host) Tell everybody this cauldron's state (with a one-off event to show). */
    _send(c, ev = null, kind = null) {
        if (!this.auth) return;
        this.game.sync?.cauldron?.({ t: 'caul', d: this._rec(c), ev: ev || undefined, k: kind || undefined });
    }

    /** Messages: 'caul' (host → all), 'caulmv' / 'caulfill' / 'caulshop' (guest → host), 'caulfilled' (host → a guest). */
    onNet(m) {
        const g = this.game;
        if (m.t === 'caul') {
            if (this.auth || !m.d?.id) return;
            const c = this.list.get(m.d.id);
            const mine = c && performance.now() - c.myMoveAt < 600; // (my hands are moving it: my place for it holds)
            const before = c ? { phase: c.st.phase, water: c.st.water } : null;
            const d = mine ? { ...m.d, x: c.x, y: c.y, z: c.z, yaw: c.yaw, tilt: c.tilt, tdir: c.tdir, q: undefined } : m.d;
            const cc = this.spawn(d);
            if (m.ev) this._event(cc, m.ev, typeof m.k === 'string' ? m.k : null);
            else if (before && cc.st.water > before.water + 0.2) this._event(cc, 'water');
            if (before && before.water > 0.3 && cc.st.water < 0.05 && m.ev === 'spill') this._pourFx(cc, _v3.set(Math.sin(cc.tdir), 0, Math.cos(cc.tdir)));
        } else if (m.t === 'caulmv') {
            if (!this.auth) return;
            const c = this.list.get(m.id);
            if (!c || c.lev || c.fall || !Array.isArray(m.p)) return;
            const [x, y, z] = m.p.map(Number);
            if (![x, y, z].every(Number.isFinite) || Math.hypot(x - c.x, z - c.z) > 4) return;
            c.x = x; c.y = y; c.z = z;
            if (Number.isFinite(+m.yaw)) c.yaw = +m.yaw;
            if (Number.isFinite(+m.tilt)) c.tilt = Math.max(0, Math.min(Math.PI / 2, +m.tilt));
            if (Number.isFinite(+m.tdir)) c.tdir = +m.tdir;
            c.moverId = m.from; c.moverAt = performance.now();
            this._place(c);
            c.moved = true;
        } else if (m.t === 'caulfill') {
            if (!this.auth) return;
            const c = this.list.get(m.id);
            if (!c || c.st.phase !== 'ready') return;
            const color = c.st.color;
            const rec = takePortion(c.st);
            if (!rec) return;
            g.sync?.cauldron?.({ t: 'caulfilled', to: m.from, id: c.id, rec, color, side: m.side === 'left' ? 'left' : 'right' });
            this._send(c);
        } else if (m.t === 'caulfilled') {
            if (m.to !== g.localId && m.to !== g.sync?.me) return;
            this._fill(m.side === 'left' ? 'left' : 'right', String(m.rec), +m.color || 0x9fd8ff);
        } else if (m.t === 'caulshop') {
            if (this.auth) this.clearShop(m.id);
        }
    }

    snapshot() {
        return { list: [...this.list.values()].map((c) => this._rec(c)), sold: { ...this.sold } };
    }

    restore(s) {
        if (!s) return;
        const list = Array.isArray(s) ? s : s.list || [];
        if (s.sold && typeof s.sold === 'object') Object.assign(this.sold, s.sold);
        for (const d of list) {
            if (!d || typeof d.id !== 'string' || ![d.x, d.y, d.z].every(Number.isFinite)) continue;
            this.spawn({ ...d, q: undefined, c: undefined, lev: 0 });
        }
    }

    /** Samples for compiling the shaders while loading: a cauldron (water and bubbles seen), an old one, a potion flask. */
    sampleModels() {
        const out = [];
        for (const old of [false, true]) {
            const { group, liquid, bubbles } = makeCauldronModel({ old });
            liquid.visible = true;
            bubbles.count = 1;
            bubbles.setMatrixAt(0, new THREE.Matrix4());
            group.scale.setScalar(0.01);
            out.push(group);
        }
        out.push(makeItemModel({ kind: 'potion', color: 0xff00ff }), makeItemModel({ kind: 'flask' }));
        return out;
    }

    dispose() {
        for (const c of this.list.values()) {
            if (c.boxId != null) this.game.collision.removeBox(c.boxId);
            if (c.tripod) { this.game.scene.remove(c.tripod); disposeModel(c.tripod); }
            this.game.scene.remove(c.group);
            disposeModel(c.group);
        }
        this.list.clear();
    }
}
