/**
 * Titans.js — the seven titans alive on their planets (the rules: TitanRules.js; the bodies and their movements: TitanModels.js).
 *
 * The author 06.11: «не примитивные… разные анимации, взаимодействие… не разговаривают как дьявол, но и не банальные, у каждого свои
 * особенности». So every titan lives in four layers, each seen on its body:
 *  - ITS LIFE AT PEACE (no one near, seen from afar): the iron smith hammers on its anvil-rock (the clang rings far), the rock one sits —
 *    a hill among hills, the lava one sits in its lake pouring lava over itself, the ice guard stands with its glaive breathing frost,
 *    the shade creeps low, the worm swims under the sand (now and then its back breaks the dunes), the storm drifts drawing up dust.
 *  - ITS WAKING: a foe noticed — the hill stands up (stones pour off it), the others roar (the chest thrown back, the arms spread); no
 *    blow meanwhile. No words — they never speak (TitanRules).
 *  - ITS FIGHT IN THREE STAGES (titanStage: ≤ 2/3, ≤ 1/3 of its health): at each turn it roars and gets a new way to fight (TitanRules
 *    header — the list for each). Every blow is seen coming (a wind-up, a light gathering, a rumble, a spot on the ground).
 *  - ITS WOUNDS: struck hard and fast (STAGGER) it falls on one knee — blows then hurt more; the rock one loses its stones; the iron one
 *    cracks when quenched red-hot; the lava one crusts black; the ice one's shell melts off.
 * Each titan's own nature (TitanRules): the iron one's heat under the Sun and its magnet (the weapons fall by its feet, a few stick to
 * its breast till it shakes them off), the lava one's heat and its lake (a frozen lake does not heat it), the worm's ear (one who stands
 * or creeps is not heard; a blast elsewhere lures it; it never rises out of rock; a spell into its open mouth), the shade that moves only
 * while no one looks at it in a light, the storm's calm eye with its heart.
 *
 * WHERE: one titan on each planet but the Earth, at its home (Space.surfaceSpot(planet, 'titan')); in the world (body, mind) only while
 * a player on its planet is within ACTIVE_R; a dead one never comes back (saved). The host (or a single player) runs the minds; the
 * guests follow by `titan` messages (the state ~8 times a second, each effect as an event) and send their blows to the host — and what
 * only their own computer knows (the shade looked at in their light).
 */
import * as THREE from 'three';
import { registerKind } from './CreatureImpact.js';
import {
    TITANS, TITAN_IDS, TITAN, titanDamage, titanResist, titanMove, TITAN_BOLT, quakeAt, titanStage, STAGGER, staggerAfter, wormHears,
    WORM_LURE_R, shadeFrozen, heatBlow, lavaHeatStep, ironHeatStep, LAVA_CRUST, shellBlow, ICE_SHELL, STORM_EYE, WORM_MOUTH_MUL, rockChips,
} from './TitanRules.js';
import { titanModel, titanSamples, poseWalker, titanSite, cloneTitan } from './TitanModels.js';
import { GOD_SPELLS } from './Mana.js';
import { TitanBar } from '../ui/TitanBar.js';
import { BLOCK } from '../world/Terrain.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const X_AXIS = new THREE.Vector3(1, 0, 0), Y_AXIS = new THREE.Vector3(0, 1, 0);
const r2 = (x) => Math.round(x * 100) / 100;
const rand = (a) => a[0] + Math.random() * (a[1] - a[0]);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz)); // (the models look along −z)
const FACE_OK = 0.32; // rad: it strikes only this square to its foe
const fwdX = (yaw) => -Math.sin(yaw), fwdZ = (yaw) => -Math.cos(yaw);

/** Its life at peace (the act it loops) and its waking act, by kit. */
const PEACE = { iron: 'forge', rock: 'sit', fire: 'bathe', frost: 'guard', shade: 'crouch' };
const PEACE_T = { forge: 2.6, sit: 6, bathe: 5.5, guard: 9, crouch: 4 };
/** Hints shown once when a player finds out a titan's nature (only when he does something — CLAUDE.md «Подсказки»). */
const HINT = {
    quench: '💨 Раскалённое железо треснуло от холода!',
    crust: '🌑 Лава остыла чёрной коркой — титан замедлился',
    crustBreak: '💥 Остывшая корка раскалывается!',
    lakeFrozen: '🧊 Лавовое озеро затянуло льдом',
    mouth: '🪱 Прямо в раскрытую пасть!',
    rock: '🪨 Змей кружит у края камня — на камень он не выходит',
    lure: '🪱 Песок загудел там, где грохнуло — змей ушёл на звук',
    shell: '🧊 Титан оброс ледяным панцирем',
    shellGone: '🔥 Ледяной панцирь растаял!',
    heart: '🌀 Удар в самое сердце вихря!',
    feed: '🌪️ Ветер только кормит вихрь — он стал больше',
    frozenShade: '🔦 Под светом тень замерла и закрылась руками',
    stagger: '⚡ Титан пошатнулся и упал на колено!',
};

// ------------------------------------------------------------------ shared effect shapes (made once)
let _fx = null;
function fxShapes() {
    if (_fx) return _fx;
    const mk = (o) => { const m = new THREE.MeshStandardMaterial(o); m.userData.shared = true; return m; };
    const basic = (o) => { const m = new THREE.MeshBasicMaterial(o); m.userData.shared = true; return m; };
    _fx = {
        ball: new THREE.IcosahedronGeometry(1, 2),
        rough: (() => { const g = new THREE.DodecahedronGeometry(1, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.82 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } g.computeVertexNormals(); return g; })(),
        fireM: mk({ color: 0xffa040, emissive: 0xff6010, emissiveIntensity: 3, roughness: 1 }),
        rockM: mk({ color: 0x8a867e, roughness: 1 }),
        darkM: basic({ color: 0x041018, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
        spike: new THREE.ConeGeometry(1, 1, 6),
        iceM: mk({ color: 0xd8f2ff, emissive: 0x4ab0ff, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.9 }),
        stoneM: mk({ color: 0x8c887f, roughness: 1 }),
        ironM: mk({ color: 0xff8a30, emissive: 0xff5a10, emissiveIntensity: 2.2, roughness: 0.6 }),
        rayM: basic({ color: 0xfff6d0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
        boltM: new THREE.LineBasicMaterial({ color: 0xd8e8ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }),
        shardM: basic({ color: 0xfff0b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
        markM: basic({ color: 0xffd080, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        frostM: basic({ color: 0xe8f6ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
        heartM: basic({ color: 0xbfe0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
        ring: new THREE.RingGeometry(0.9, 1, 48),
        disc: new THREE.CircleGeometry(1, 32),
        cyl: new THREE.CylinderGeometry(1, 1, 1, 10, 1, true),
        cone: new THREE.ConeGeometry(1, 1, 16, 1, true),
    };
    _fx.boltM.userData.shared = true;
    for (const k of ['ball', 'rough', 'spike', 'ring', 'disc', 'cyl', 'cone']) _fx[k].userData.shared = true;
    return _fx;
}

export class Titans {
    constructor(game) {
        this.game = game;
        this.state = { dead: [], dents: {}, cages: [] };
        this.active = new Map(); // id → titan (only those with a player near)
        this.list = []; // (CreatureImpact)
        this.fxList = []; // flying blobs, spikes, rays, bolts, markers — each {mesh, t, life, step(f, dt) → done}
        this._later = []; // [{t, fn}] small delays (the swallowed one spat out…)
        this._netT = 0;
        this._seen = new Set();
        this._hinted = new Set();
        this._looks = new Map(); // the shade: who looks at it in a light (id → {on, t}) — mine here, the guests' by message
        this._lookSent = null;
    }

    get auth() { return !this.game.sync || !!this.game.authority; }
    get data() { return this.game.terrain?.data || this.game.world?.terrain?.data || null; }
    isDead(id) { return this.state.dead.includes(id); }
    deadSet() { return new Set(this.state.dead); }

    /** A titan's home (its planet's spot): {x, y, z} or null. */
    home(id) {
        const def = TITANS[id], S = this.game.space;
        if (!def || !S?.surfaceSpot) return null;
        return S.surfaceSpot(def.planet, 'titan');
    }

    /**
     * The mark of the planet's titan on the minimap (the author 07.11: «на каждой планете должно быть указание, где этот Титан… а у меня указывался какой-то замок»):
     * always — however far, asleep or awake (where it stands now, or its home), until it is dead — with its own icon (⚡ → the colossus badge in Hud.placeIcon), never a castle.
     */
    markOf(realm) {
        for (const id of TITAN_IDS) {
            const def = TITANS[id];
            if (def.planet !== realm || this.isDead(id)) continue;
            const T = this.active.get(id);
            if (T && T.mode !== 'dying') return { x: T.pos.x, z: T.pos.z, name: def.name, icon: '⚡', always: true, titan: id };
            const h = this.home(id);
            if (h) return { x: h.x, z: h.z, name: def.name, icon: '⚡', always: true, titan: id };
        }
        return null;
    }

    /** The ground height (the top of the land) under (x, z). */
    ground(x, z) {
        const d = this.data;
        if (!d) return 0;
        const L = d.topLayer ? d.topLayer(Math.round(x), Math.round(z)) : d.heightAt(Math.round(x), Math.round(z));
        return L + 1;
    }
    /** The block on top of the land at (x, z). */
    groundBlock(x, z) {
        const d = this.data;
        if (!d?.topLayer || !d.get) return null;
        const ix = Math.round(x), iz = Math.round(z);
        return d.get(ix, d.topLayer(ix, iz), iz);
    }

    /** The Sun's height over a titan's place on its planet (−1…1; 1 — straight overhead). */
    sunAt(T) {
        const S = this.game.space, p = S?.planets?.get?.(T.def.planet);
        if (!p || !S.localSun) return 0.5;
        let y = 0.5;
        try { y = S.localSun(p, T.pos.x, T.pos.z, S.now()).y; } catch { y = 0.5; }
        const L = this.game.helios?.lightAt?.(T.pos.x, T.pos.y ?? 0, T.pos.z); // («Helios»: the gods' Sun over it is a Sun too — Helios.js)
        return L ? Math.max(y, 0.9 * L.k) : y;
    }

    hint(key) {
        if (this._hinted.has(key)) return;
        this._hinted.add(key);
        this.game.hud?.setVoice?.(HINT[key], true);
    }

    /**
     * Ready one titan's body ahead (its textures painted, its shaders compiled) when the hero reaches its planet — never on the loading
     * screen (the friend's stalling load, 06.11). Done once per look, in an idle moment; the body is kept for _build.
     */
    warm(id) {
        const def = TITANS[id];
        if (!def || this._warmed?.has(id)) return;
        (this._warmed || (this._warmed = new Set())).add(id);
        const run = () => {
            try {
                const g = this.game, m = titanModel(def.look);
                (this._spare || (this._spare = new Map())).set(id, m);
                const sc = new THREE.Scene();
                sc.add(m);
                const site = titanSite(def.look);
                if (site.children.length) { (this._sites || (this._sites = new Map())).set(id, site); sc.add(site); }
                if (g.renderer?.compile && g.camera) g.renderer.compile(sc, g.camera);
                sc.remove(m); sc.remove(site);
                if (!this._fxWarm && g.renderer?.compile && g.camera) { this._fxWarm = true; const s2 = new THREE.Scene(); for (const x of Titans.samplesFx()) s2.add(x); g.renderer.compile(s2, g.camera); }
            } catch (e) { console.warn('titan warm', id, e); }
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 0);
    }

    // ------------------------------------------------------------------ in the world / out
    update(dt) {
        const g = this.game;
        if (!(dt > 0)) return;
        dt = Math.min(dt, 0.1);
        const realm = g.space?.realm;
        for (const id of TITAN_IDS) if (realm === TITANS[id].planet && !this.isDead(id)) this.warm(id); // (on its planet: its body readied in an idle moment)
        const me = g.character?.group?.position;
        for (const id of TITAN_IDS) {
            const T = this.active.get(id), def = TITANS[id];
            if (this.isDead(id)) { if (T && T.mode !== 'dying') this._drop(id); }
            else if (!T && me && realm === def.planet) {
                const h = this.home(id);
                if (h && Math.hypot(me.x - h.x, me.z - h.z) < TITAN.ACTIVE_R && (this.data?.landMade?.(Math.round(h.x), Math.round(h.z)) ?? true)) this._build(id, h);
            } else if (T && T.mode !== 'dying' && (realm !== def.planet || Math.hypot(me.x - T.pos.x, me.z - T.pos.z) > TITAN.GONE_R) && !this._remoteNear(T)) this._drop(id);
        }
        for (let i = this._later.length - 1; i >= 0; i--) { const l = this._later[i]; l.t -= dt; if (l.t <= 0) { this._later.splice(i, 1); try { l.fn(); } catch (e) { console.warn('titan later', e); } } }
        for (const T of this.active.values()) {
            if (T.def.kit === 'shade') this._myLook(T);
            if (this.auth) this._think(T, dt); else this._follow(T, dt);
            this._draw(T, dt);
        }
        this._stepFx(dt);
        this._bar(me);
        if (this.auth) this._netSend(dt);
        this.mapMark = this.markOf(realm);
    }

    /** The health bar: the nearest awake titan within BAR_R that is fighting (or was just hurt); nothing otherwise. */
    _bar(me) {
        let best = null, bd = TITAN.BAR_R;
        if (me) for (const T of this.active.values()) {
            if (T.mode !== 'fight' && !(T.hurtT > 0)) continue;
            const d = Math.hypot(me.x - T.pos.x, me.z - T.pos.z);
            if (d < bd) { bd = d; best = T; }
        }
        (this._barUi || (this._barUi = new TitanBar())).show(best ? { name: best.def.name, hp: best.hp, max: best.def.hp } : null);
    }

    _remoteNear(T) {
        for (const r of this.game.remotes?.values?.() || []) if (r.position && Math.hypot(r.position.x - T.pos.x, r.position.z - T.pos.z) < TITAN.GONE_R) return true;
        return false;
    }

    _build(id, h) {
        const g = this.game, def = TITANS[id];
        const model = this._spare?.get(id) || titanModel(def.look);
        this._spare?.delete(id);
        if (def.look !== 'worm') model.scale.setScalar(def.look === 'storm' ? def.height : def.height);
        g.scene.add(model);
        const y = this.ground(h.x, h.z);
        // its place at peace: the anvil a little before the smith, the lake round the lava one's home
        let site = this._sites?.get(id) || null;
        if (!site && (def.look === 'iron' || def.look === 'lava')) site = titanSite(def.look);
        if (site) {
            site.scale.setScalar(def.height);
            const ax = def.look === 'iron' ? h.x : h.x, az = def.look === 'iron' ? h.z - def.height * 0.32 : h.z;
            site.position.set(ax, this.ground(ax, az), az);
            g.scene.add(site);
        }
        const T = {
            isTitan: true, id, def, model, site, kind: 'titan', r: def.radius, h: def.height,
            pos: new THREE.Vector3(h.x, y, h.z), home: new THREE.Vector3(h.x, y, h.z), yaw: 0,
            hp: def.hp, mode: 'peace', foe: null, ph: 0, stepSide: 0, speed: 0, blowCool: 2, rangedCool: rand(def.ranged.every), t: 0,
            act: null, stage: 1, stagLog: [], stagCool: 0, roarT: rand(TITAN.ROAR_EVERY), wanderTo: null, dents: this.state.dents[id] || 0,
            hurtT: 0, dieT: 0, heat: def.kit === 'iron' ? 0.4 : 1, shell: 0, club: false, stuck: 0, shakeT: 0, chips: 0, lit: 0, frozenLook: false,
            // the worm: under / rising / up / diving / breach; the shade: blink, decoys; the storm: eye, size, minis; the lava one's lake
            wm: 'under', wT: 4, heard: null, up: 0, blinkCool: def.blink ? rand(def.blink.every) : 0, magnetCool: def.magnet ? rand(def.magnet.every) : 0,
            special: [12, 16], specialCool: 10, cageCool: 14, decoys: [], minis: [], grow: 1, eyeT: new Map(), lakeFrozenT: 0, breachCool: 0,
            get isDead() { return this.mode === 'dying'; }, get group() { return this.model; }, get position() { return this.pos; },
        };
        // the smith stands at its anvil; the lava one sits in the middle of its lake
        if (def.kit === 'iron') T.yaw = 0;
        T.bodyCapsule = (out) => titanBody(T, out);
        this.active.set(id, T);
        this.list.push(T);
        if (!this._seen.has(id)) { this._seen.add(id); g.hud?.setVoice?.(`⚡ Вдалеке земля дрожит: здесь живёт ${def.name} — осколок силы богов`, true); }
    }

    _drop(id) {
        const T = this.active.get(id);
        if (!T) return;
        const sc = this.game.scene;
        sc.remove(T.model);
        if (T.site) sc.remove(T.site);
        for (const d of T.decoys) sc.remove(d.model);
        for (const m of T.minis) sc.remove(m.model);
        if (T.heartMesh) sc.remove(T.heartMesh);
        if (T.mode !== 'dying') {
            // (kept for a return: never made twice; its props as they were at the start)
            T.model.rotation.set(0, 0, 0); T.model.quaternion.identity();
            const R = T.model.userData.rig;
            if (R) { for (const b of R.blades || []) b.visible = false; for (const b of R.shell || []) b.visible = false; for (const c of R.chips || []) c.visible = true; if (R.club) R.club.visible = false; }
            (this._spare || (this._spare = new Map())).set(id, T.model);
        }
        this.active.delete(id);
        this.list = this.list.filter((x) => x !== T);
    }

    // ------------------------------------------------------------------ the players
    _players(T) {
        const g = this.game, out = this._pl || (this._pl = []);
        out.length = 0;
        const info = { key: 'titan', x: T.pos.x, z: T.pos.z };
        const seen = (id, p) => (g.invis ? g.invis.aiPos(id, p, info) : p);
        if (!g.isDeadLocal && !g.combat?.dead && g.space?.realm === T.def.planet) {
            const p = seen(g.localId, g.character.group.position);
            const v = g.character?.velocity;
            if (p) out.push({ id: g.localId, p: new THREE.Vector3(p.x, p.y - 1.95, p.z), speed: v ? Math.hypot(v.x || 0, v.z || 0) : (g.character?.speed || 0), crouch: !!g.character?.isCrouching, local: true });
        }
        for (const [id, r] of g.remotes || []) {
            if (r.dead || !r.position) continue;
            const p = seen(id, r.position);
            if (p && Math.hypot(p.x - T.pos.x, p.z - T.pos.z) < TITAN.LOSE) out.push({ id, p: new THREE.Vector3(p.x, p.y - 1.95, p.z), speed: r.speed ?? 3, crouch: !!r.crouch });
        }
        return out;
    }

    /** Hurt a player (mine here; another's told to his computer). push: a world velocity to throw him. */
    _hurt(T, pl, dmg, kind, push = null, msg = '') {
        const g = this.game;
        if (pl.local || pl.id === g.localId) this._hurtMe(T, dmg, kind, push, msg);
        else g.sync?.titan?.({ e: 'hurt', id: T?.id, to: pl.id, dmg, kind, push: push ? [r2(push.x), r2(push.y), r2(push.z)] : null, msg });
    }
    _hurtMe(T, dmg, kind, push = null, msg = '') {
        const g = this.game, c = g.combat;
        if (!c || c.dead || g.isDeadLocal) return;
        if (dmg > 0) { if (c.enabled) c.damage(dmg, 'titan', kind === 'fire' ? 'Inferno' : kind === 'frost' || kind === 'freeze' ? 'Ice' : 'melee'); else g.damageLocalPlayer?.(dmg); }
        if (kind === 'fire') g.burning?.ignite?.('p', g.localId, null);
        if (kind === 'freeze') c.freeze?.('titan', T?.def?.ranged?.freeze || 2.5);
        if (kind === 'blind') g.hud?.flash?.('#fff8e0', 0.9, (T?.def?.ranged?.blind || 3) * 1000);
        if (kind === 'dark') { g.hud?.flash?.('#000000', 0.85, (T?.def?.ranged?.dark || 6) * 1000); g.wandMagic?._nox?.(false); } // (its dark puts the lights out)
        if (kind === 'swallow') {
            // inside it: dark, the walls closing — then spat out high
            g.hud?.flash?.('#0a0302', 0.97, 2300);
            g.cameraShake?.(0.6, 2);
            g.sound?.playTitan?.(g.character.group.position, 'swallow', 1);
            if (push) { const p = push.clone(); this._later.push({ t: 1.9, fn: () => g.knockback?.add?.(p) }); }
            if (msg) g.hud?.setVoice?.(msg, true);
            return;
        }
        if (push) g.knockback?.add?.(push);
        if (msg) g.hud?.setVoice?.(msg, true);
    }

    _roar(T, vol = 1) {
        const g = this.game;
        g.sound?.playTitan?.(T.pos, T.def.kit === 'storm' ? 'howl' : 'roar', vol);
        const me = g.character?.group?.position;
        if (me && me.distanceTo(T.pos) < 260) g.cameraShake?.(0.25, 1.4);
    }

    // ------------------------------------------------------------------ actions (one at a time; each a timeline of events)
    /** Start an action: `name` — its pose (TitanModels ACTS / 'blow' / 'stomp' / a kit's own), `dur` s, `ev` [[t (0…1), fn]]. */
    _act(T, name, dur, ev = [], opts = {}) {
        T.act = { name, t: 0, dur, ev: ev.map(([at, fn]) => ({ at, fn, done: false })), ...opts };
        T.speed = 0;
        if (this.auth && this.game.sync) this.game.sync.titan?.({ e: 'act', id: T.id, n: name, d: r2(dur) });
        return T.act;
    }
    _stepAct(T, dt) {
        const A = T.act;
        if (!A) return false;
        A.t += dt / A.dur;
        for (const e of A.ev) if (!e.done && A.t >= e.at) { e.done = true; try { e.fn(); } catch (err) { console.warn('titan act', A.name, err); } }
        if (A.move) A.move(dt);
        if (A.t >= 1) { T.act = null; A.end?.(); }
        return true;
    }

    // ------------------------------------------------------------------ the minds (host)
    _think(T, dt) {
        T.t += dt;
        if (T.mode === 'dying') return;
        T.stagCool -= dt;
        const players = this._players(T);
        const foe = this._foe(T, players);
        T.foe = foe ? foe.id : null;
        // waking (the first foe): the hill stands up, the others roar — no blow meanwhile
        if (T.mode === 'peace' && foe && (!T.act || T.act.name === PEACE[T.def.kit])) { T.act = null; this._wake(T); }
        else if (T.mode === 'fight' && !foe && !T.act && T.t - (T.lostT ?? T.t) > 25) { T.mode = 'peace'; } // (no one for long: back to its life)
        if (foe) T.lostT = T.t;
        // a new stage (never in the middle of an action: it finishes it first)
        if (T.mode === 'fight' && !T.act && titanStage(T.hp, T.def.hp) > T.stage) { T.stage++; this._stage(T); }
        if (T.mode === 'fight' && foe && !T.act) { T.roarT -= dt; if (T.roarT <= 0) { T.roarT = rand(TITAN.ROAR_EVERY); this._roar(T, 0.8); } }
        if (T.def.kit === 'worm') return this._thinkWorm(T, dt, foe, players);
        if (T.def.kit === 'storm') return this._thinkStorm(T, dt, foe, players);
        this._thinkWalker(T, dt, foe, players);
    }

    /** Its foe: the one it fights (while near), else the nearest it notices (the worm: the one it hears; the hill asleep: one near). */
    _foe(T, players) {
        let foe = T.foe != null ? players.find((q) => q.id === T.foe) : null;
        if (foe && foe.p.distanceTo(T.pos) > TITAN.LOSE) foe = null;
        if (foe && T.def.kit === 'worm' && T.wm === 'under' && !(Math.hypot(foe.p.x - T.pos.x, foe.p.z - T.pos.z) < wormHears(foe.speed, foe.crouch) + 30)) foe = null; // (it lost the steps)
        if (foe) return foe;
        let best = null, bd = 1e9;
        for (const q of players) {
            const d = Math.hypot(q.p.x - T.pos.x, q.p.z - T.pos.z);
            const see = T.def.kit === 'worm' ? wormHears(q.speed, q.crouch) : T.mode === 'peace' && T.def.kit === 'rock' ? 110 : TITAN.SEE;
            if (d < see && d < bd) { bd = d; best = q; }
        }
        return best;
    }

    _wake(T) {
        const g = this.game, def = T.def;
        T.mode = 'fight';
        if (def.kit === 'worm' || def.kit === 'storm') { this._roar(T, 1.2); return; }
        if (def.kit === 'rock') {
            // the hill stands up: a long grinding groan, stones pouring off it
            g.sound?.playTitan?.(T.pos, 'rise', 1.6);
            this._act(T, 'rise', 5, [[0.15, () => this._quake(T.pos, 1.2, this._players(T))], [0.5, () => this._quake(T.pos, 1.5, this._players(T))], [0.92, () => this._roar(T, 1.4)]], {
                move: () => { if (Math.random() < 0.6) this._dust(_v.set(T.pos.x + (Math.random() - 0.5) * def.radius * 2, T.pos.y + Math.random() * def.height * 0.5, T.pos.z + (Math.random() - 0.5) * def.radius * 2), 2, 0x9a968e); },
            });
            return;
        }
        this._act(T, 'roar', TITAN.WAKE_T, [[0.2, () => this._roar(T, 1.4)]]);
    }

    /** The turn to a new stage: a roar, the body's change, its new way to fight. */
    _stage(T) {
        const g = this.game, k = T.def.kit, n = T.stage;
        const ev = [[0.15, () => this._roar(T, 1.5)]];
        if (k === 'frost' && n === 2) ev.push([0.6, () => { T.shell = T.def.hp * ICE_SHELL.PART; g.sound?.playTitan?.(T.pos, 'frost', 1.6); this.hint('shell'); this._sync(T, { e: 'fx', k: 'shell', id: T.id }); }]);
        if (k === 'shade' && n === 2) ev.push([0.7, () => this._decoys(T)]);
        if (k === 'storm' && n === 3) ev.push([0.6, () => this._split(T)]);
        if (k === 'rock' && n === 3) { this._tearPillar(T); return; }
        if (k === 'worm' || k === 'storm') { for (const [, fn] of ev) fn(); return; }
        this._act(T, 'roar', TITAN.STAGE_T, ev);
    }

    _thinkWalker(T, dt, foe, players) {
        const def = T.def, k = def.kit;
        T.blowCool -= dt; T.rangedCool -= dt; T.specialCool -= dt; T.cageCool -= dt;
        this._nature(T, dt, foe, players);
        if (this._stepAct(T, dt)) return;
        if (T.mode === 'peace') return this._peace(T, dt);
        if (!foe) return this._walkTo(T, dt, T.home.x, T.home.z, 0.45, players);
        // the shade frozen under a look in the light: it can do nothing (and it covers its face)
        if (k === 'shade' && T.frozenLook) { T.speed = 0; T.coverT = (T.coverT || 0) + dt; return; }
        T.coverT = 0;
        // the lava one crusted: back to its lake to heat (while the lake is not frozen)
        if (k === 'fire' && T.heat < LAVA_CRUST && T.lakeFrozenT <= 0) {
            const d = Math.hypot(T.home.x - T.pos.x, T.home.z - T.pos.z);
            if (d > def.height * 0.25) return this._walkTo(T, dt, T.home.x, T.home.z, 1, players);
            this._act(T, 'bathe', 4, [[0.5, () => this._lavaPour(T)]]);
            return;
        }
        // the iron one shakes off the weapons stuck on it now and then
        if (k === 'iron' && T.stuck > 0 && T.t - T.shakeT > 14) { T.shakeT = T.t; this._shake(T); return; }
        const dist = Math.hypot(foe.p.x - T.pos.x, foe.p.z - T.pos.z);
        const want = yawTo(T.pos.x, T.pos.z, foe.p.x, foe.p.z);
        const facing = Math.abs(angDiff(T.yaw, want)) < FACE_OK;
        const reach = def.reach * (T.club ? 1.5 : 1);
        if (def.magnet) { T.magnetCool -= dt; if (T.magnetCool <= 0 && dist < def.magnet.r) { T.magnetCool = rand(def.magnet.every); this._magnet(T, players); return; } }
        if (def.blink) { T.blinkCool -= dt; if (T.blinkCool <= 0 && dist > reach * 1.2) { T.blinkCool = rand(def.blink.every) * (T.stage >= 3 ? 0.6 : 1); this._blink(T, foe); return; } }
        // its special of the stage (when ready, facing)
        if (facing && T.specialCool <= 0 && this._special(T, foe, dist, players)) return;
        const move = titanMove({ foe, dist, reach, facing, blowCool: T.blowCool, rangedCool: T.rangedCool, farHome: false });
        if (move === 'blow') { this._melee(T, foe, dist, players); return; }
        if (move === 'ranged') { T.rangedCool = rand(def.ranged.every) * (T.stage >= 3 ? 0.75 : 1); this._ranged(T, foe, players); return; }
        if (move === 'turn') { this._turn(T, want, dt); T.speed = 0; return; }
        this._walkTo(T, dt, foe.p.x, foe.p.z, 1, players);
    }

    /** Walk towards (tx, tz) at `pace` of its walk (turning first; the steps shake the ground). */
    _walkTo(T, dt, tx, tz, pace, players) {
        const def = T.def;
        const wy = yawTo(T.pos.x, T.pos.z, tx, tz);
        const d = Math.hypot(tx - T.pos.x, tz - T.pos.z);
        this._turn(T, wy, dt);
        let sp = def.walk * pace * Math.max(0, Math.cos(angDiff(T.yaw, wy)));
        if (def.kit === 'fire' && T.heat < LAVA_CRUST) sp *= 0.6; // (crusted: slow)
        if (def.kit === 'fire' && T.heat > 0.85) sp *= 1.15; // (hot: quick)
        if (def.kit === 'shade') sp *= T.mode === 'fight' ? 2.2 : 0.6; // (unseen, it creeps fast)
        if (d < 3) sp = 0;
        T.speed = sp;
        T.pos.x += fwdX(T.yaw) * sp * dt;
        T.pos.z += fwdZ(T.yaw) * sp * dt;
        T.pos.y = this.ground(T.pos.x, T.pos.z);
        const was = T.ph;
        T.ph += (sp / def.walk) * Math.PI / TITAN.STEP_T * dt;
        if (Math.floor(was / Math.PI) !== Math.floor(T.ph / Math.PI)) this._step(T, players);
    }

    _turn(T, want, dt) {
        const d = angDiff(T.yaw, want), s = TITAN.TURN * dt * (T.def.kit === 'shade' ? 2 : 1);
        T.yaw += Math.abs(d) < s ? d : Math.sign(d) * s;
    }

    /** Its life at peace (no foe): each its own, looped (a pose `peace` with its cycle; the smith's clang, the lava poured…). */
    _peace(T, dt) {
        const def = T.def, k = def.kit, act = PEACE[k];
        // the shade and the ice guard walk a little round home; the others stay at their place
        if (k === 'shade') {
            if (!T.wanderTo || Math.hypot(T.wanderTo.x - T.pos.x, T.wanderTo.z - T.pos.z) < 15) { const a = Math.random() * 6.28, r = Math.random() * TITAN.HOME_R * 0.7; T.wanderTo = { x: T.home.x + Math.cos(a) * r, z: T.home.z + Math.sin(a) * r }; }
            this._walkTo(T, dt, T.wanderTo.x, T.wanderTo.z, 1, []);
            return;
        }
        // back to its place first (after a fight)
        const at = this._peaceSpot(T), d = Math.hypot(at.x - T.pos.x, at.z - T.pos.z);
        if (d > 6) { this._walkTo(T, dt, at.x, at.z, 0.6, []); return; }
        const wantYaw = k === 'iron' ? T.homeYaw ?? 0 : T.yaw;
        if (Math.abs(angDiff(T.yaw, wantYaw)) > 0.05) { this._turn(T, wantYaw, dt); return; }
        const ev = [];
        if (k === 'iron') ev.push([0.6, () => this._anvilStrike(T)]);
        if (k === 'fire') ev.push([0.62, () => this._lavaPour(T)]);
        if (k === 'frost') ev.push([0.5, () => this._frostBreathIdle(T)]);
        this._act(T, act, PEACE_T[act], ev);
    }
    _peaceSpot(T) {
        if (T.def.kit === 'iron') return { x: T.home.x, z: T.home.z + 0 }; // (behind its anvil, facing it)
        return T.home;
    }

    /** The nature of each that runs all the time: heat, the lake, the shell's look, the shade's light. */
    _nature(T, dt, foe, players) {
        const k = T.def.kit;
        if (k === 'iron') T.heat = ironHeatStep(T.heat, dt, this.sunAt(T));
        if (k === 'fire') {
            T.lakeFrozenT = Math.max(0, T.lakeFrozenT - dt);
            const inLake = Math.hypot(T.home.x - T.pos.x, T.home.z - T.pos.z) < T.def.height * 0.42;
            T.heat = lavaHeatStep(T.heat, dt, inLake, T.lakeFrozenT > 0);
        }
        if (k === 'shade') {
            // looked at in a light by anyone (mine and the guests' — their own computers know their light and their eyes)
            const looks = [];
            for (const [id, l] of this._looks) if (T.t - l.t < 1.5 || id === this.game.localId) looks.push(l);
            const fl = shadeFrozen(looks);
            if (fl && !T.frozenLook && T.mode === 'fight') { this.hint('frozenShade'); }
            T.frozenLook = fl && T.mode === 'fight';
            let lit = fl ? 1 : 0;
            if (this.game.burning?.near?.(T.pos, 30)) lit = 1;
            if (T.flashT > 0) lit = 1;
            T.lit += (lit - T.lit) * Math.min(1, dt * 4);
            // the shadows of itself: they creep with it, melt in light or at a blow
            this._stepDecoys(T, dt, foe, players);
        }
        if (k === 'frost' && T.stage >= 3 && foe) this._blizzard(T, dt, players);
        void players;
    }

    // ------------------------------------------------------------------ the blows near (each its own)
    _melee(T, foe, dist, players) {
        const k = T.def.kit, g = this.game;
        T.blowCool = TITAN.BLOW_EVERY * (T.stage >= 3 ? 0.75 : 1);
        g.sound?.playTitan?.(T.pos, 'windup', 1);
        if (dist < T.def.reach * 0.45 && k !== 'frost' && Math.random() < 0.5) {
            this._act(T, 'stomp', 1.6, [[0.6, () => this._stomp(T, this._players(T))]]);
            return;
        }
        if (k === 'frost') { this._act(T, 'thrust', 2.0, [[0.62, () => this._blowLands(T, this._players(T), 0.75)]]); return; }
        if (k === 'iron' && T.stage >= 3 && Math.random() < 0.4) { this._slam2(T); return; }
        this._act(T, 'blow', TITAN.BLOW_T, [[0.6, () => this._blowLands(T, this._players(T), 0.6)]]);
        void foe; void players;
    }

    /** One step: the ground shakes round the foot, a hero right by it thrown down; a dent pressed into the ground (the ice one: ice). */
    _step(T, players) {
        const g = this.game, def = T.def;
        T.stepSide = 1 - T.stepSide;
        const side = T.stepSide ? 1 : -1, w = def.radius * 0.45;
        const fx = T.pos.x + Math.cos(T.yaw) * w * side, fz = T.pos.z - Math.sin(T.yaw) * w * side;
        const foot = _v.set(fx, this.ground(fx, fz), fz);
        // (the shade creeping unseen: its steps are silent and shake nothing)
        if (def.kit === 'shade' && T.mode === 'fight' && T.lit < 0.5) return;
        g.sound?.playTitan?.(foot, 'step', T.def.kit === 'shade' ? 0.5 : 1);
        this._quake(foot, def.kit === 'shade' ? 0.5 : 1, players);
        this._dent(T, foot);
        if (def.kit === 'fire' && T.heat >= LAVA_CRUST) this._fireGround(foot);
        if (def.kit === 'frost') this._dust(foot, 10, 0xeaf8ff);
        g.sync?.titan?.({ e: 'step', id: T.id, p: [r2(foot.x), r2(foot.y), r2(foot.z)] });
    }

    /** The ground shakes at `p` (k 0…1): the camera of each one near, a hero by it thrown down (and a little hurt). */
    _quake(p, k, players) {
        const g = this.game, me = g.character?.group?.position;
        if (me) { const d = Math.hypot(me.x - p.x, me.z - p.z), q = quakeAt(d) * k; if (q > 0.02) g.cameraShake?.(q * 0.8, 0.7); }
        if (!this.auth) return;
        for (const pl of players) {
            const d = Math.hypot(pl.p.x - p.x, pl.p.z - p.z);
            if (d > TITAN.KNOCK_R * k || pl.p.y - p.y > 6) continue;
            const push = new THREE.Vector3(pl.p.x - p.x, 0, pl.p.z - p.z).normalize().multiplyScalar(8 * (1 - d / (TITAN.KNOCK_R * k))).setY(5);
            this._hurt(null, pl, Math.round(TITAN.STEP_DMG * (1 - d / (TITAN.KNOCK_R * k))), 'melee', push, d < 8 ? '⚡ Земля уходит из-под ног!' : '');
        }
    }

    /** A footprint: a shallow dent in the ground (a few blocks taken off the top; the ice one leaves ice). Never past DENT_MAX. */
    _dent(T, p, r0 = 0, deep = 1) {
        const g = this.game, d = this.data;
        if (!this.auth || !d || T.dents >= TITAN.DENT_MAX || T.def.flies || !g.builder?._sendEdits) return;
        T.dents++;
        this.state.dents[T.id] = T.dents;
        const r = r0 || Math.max(2, Math.round(T.def.radius * 0.35)), edits = [];
        const ice = T.def.kit === 'frost' && !r0;
        for (let dz = -r; dz <= r; dz++) for (let dx = -Math.round(r * 0.7); dx <= Math.round(r * 0.7); dx++) {
            if ((dx * dx) / ((r * 0.7) ** 2 + 0.01) + (dz * dz) / (r * r) > 1) continue;
            const x = Math.round(p.x + dx), z = Math.round(p.z + dz), L = d.topLayer ? d.topLayer(x, z) : null;
            if (L == null || L < 2) continue;
            if (d.godGiftAt?.(x, L, z)) continue; // (the gods' gifts are never broken)
            if (ice) { edits.push([x, L, z, BLOCK.ICE]); continue; }
            for (let k = 0; k < deep; k++) if (L - k >= 2) edits.push([x, L - k, z, BLOCK.AIR]);
        }
        if (edits.length) g.builder._sendEdits(edits);
    }

    /** A blow lands: a wide strike in front of it (and a quake there). `at` — how far forward (of its reach). */
    _blowLands(T, players, at = 0.6) {
        const def = T.def, g = this.game, reach = def.reach * (T.club ? 1.5 : 1);
        const fx = T.pos.x + fwdX(T.yaw) * reach * at, fz = T.pos.z + fwdZ(T.yaw) * reach * at;
        const p = _v2.set(fx, this.ground(fx, fz), fz);
        g.sound?.playTitan?.(p, def.kit === 'iron' ? 'anvil' : 'slam', 1);
        g.fx?.explosion?.(p.clone(), 4, 1.5);
        this._dust(p, 18, def.kit === 'frost' ? 0xeaf8ff : 0x9a8a78);
        this._quake(p, 1.4, players);
        const dmg = def.blow * (T.club ? 1.3 : 1) * (def.kit === 'fire' && T.heat < LAVA_CRUST ? 0.7 : 1);
        for (const pl of players) {
            const d = Math.hypot(pl.p.x - p.x, pl.p.z - p.z);
            if (d > reach * 0.5) continue;
            const push = new THREE.Vector3(pl.p.x - T.pos.x, 0, pl.p.z - T.pos.z).normalize().multiplyScalar(16).setY(9);
            this._hurt(T, pl, Math.round(dmg * (1 - d / (reach * 0.5) * 0.5)), def.kit === 'fire' && T.heat >= LAVA_CRUST ? 'fire' : def.kit === 'frost' ? 'freeze' : 'melee', push, `⚡ Удар титана: −${Math.round(dmg)}`);
        }
        g.sync?.titan?.({ e: 'slam', id: T.id, p: [r2(p.x), r2(p.y), r2(p.z)] });
    }

    /** The stomp under its feet: a big quake; the rock one raises a ring of stone spikes. */
    _stomp(T, players) {
        const g = this.game;
        const p = _v2.set(T.pos.x, T.pos.y, T.pos.z);
        g.sound?.playTitan?.(p, 'slam', 1.4);
        this._quake(p, 2, players);
        if (T.def.kit === 'rock') for (const pl of players) if (pl.p.distanceTo(T.pos) < T.def.reach * 1.5) this._spikes(T, pl, 'stone');
        if (T.def.kit === 'frost') for (const pl of players) if (pl.p.distanceTo(T.pos) < T.def.reach * 1.5) this._spikes(T, pl, 'ice');
    }

    // ------------------------------------------------------------------ the ranged blows and the specials (each titan its own)
    _ranged(T, foe, players) {
        const k = T.def.kit;
        if (k === 'iron') { if (this.sunAt(T) > 0.1) this._sunRay(T, foe); else this._magnet(T, players); } // (no Sun over it: no ray — the magnet instead)
        else if (k === 'fire') this._throwAct(T, foe, 'fire');
        else if (k === 'rock') this._throwAct(T, foe, 'rock');
        else if (k === 'frost') { if (Math.random() < 0.5) this._breath(T, foe); else this._spikesAct(T, foe); }
        else if (k === 'shade') this._darkWave(T);
    }

    /** The stage's special (true if one began): iron — the clap (2) / both fists into the ground (3); rock — the roll (2+); lava — the eruption (2) / the fire rain (3); ice — the cage; shade — the darkness more often. */
    _special(T, foe, dist, players) {
        const k = T.def.kit, n = T.stage;
        const ready = (s) => { T.specialCool = rand(s); return true; };
        if (k === 'iron' && n >= 2 && dist < 120) { if (n >= 3 && Math.random() < 0.5) this._slam2(T); else this._clap(T); return ready([10, 15]); }
        if (k === 'rock' && n >= 2 && dist > 30 && dist < 200) { this._roll(T, foe); return ready([14, 20]); }
        if (k === 'fire' && n >= 2 && T.heat >= LAVA_CRUST && dist < 200) { if (n >= 3 && Math.random() < 0.5) this._fireRain(T, foe); else this._eruption(T, foe); return ready([10, 15]); }
        if (k === 'frost' && T.cageCool <= 0 && dist < 150) { T.cageCool = n >= 3 ? 16 : 24; this._cageAct(T, foe); return ready([8, 12]); }
        if (k === 'shade' && n >= 3 && dist < 140) { this._darkWave(T); return ready([7, 10]); }
        void players;
        return false;
    }

    _chest(T, out = new THREE.Vector3()) { return out.set(T.pos.x, T.pos.y + T.def.height * 0.66, T.pos.z); }
    /** A joint's world position (the rig's group). */
    _joint(T, g, out = new THREE.Vector3()) { T.model.updateMatrixWorld(true); return g.getWorldPosition(out); }
    _hands(T, out) {
        const R = T.model.userData.rig;
        if (!R?.armL) return this._chest(T, out);
        this._joint(T, R.armL.hand, out);
        return out.add(this._joint(T, R.armR.hand, _v4)).multiplyScalar(0.5);
    }

    /** The smith's hammer on its anvil (its life at peace): the clang far, sparks. */
    _anvilStrike(T) {
        const g = this.game, s = T.site;
        const p = s ? _v.set(s.position.x, s.position.y + T.def.height * 0.165, s.position.z) : this._chest(T, _v);
        g.sound?.playTitan?.(p, 'anvil', 1.5);
        for (let i = 0; i < 26; i++) g.fx?.spark?.(p, i % 3 ? 0xffc060 : 0xfff2c0, 0.6, _v2.set((Math.random() - 0.5) * 18, 4 + Math.random() * 10, (Math.random() - 0.5) * 18), 0.6 + Math.random() * 0.6);
        g.fx?.lightFlash?.(p.clone(), 0xffc070, 4, 0.25, 40);
    }

    /** Lava scooped and poured over itself (its life at peace / heating): drips of fire off its head and shoulders. */
    _lavaPour(T) {
        const g = this.game, top = _v.set(T.pos.x, T.pos.y + T.def.height * 0.55, T.pos.z);
        g.sound?.playTitan?.(top, 'erupt', 0.6);
        for (let i = 0; i < 30; i++) g.fx?.spark?.(_v2.set(top.x + (Math.random() - 0.5) * T.def.radius * 1.6, top.y + Math.random() * 6, top.z + (Math.random() - 0.5) * T.def.radius * 1.6), i % 2 ? 0xff7a10 : 0xffc040, 1, _v3.set((Math.random() - 0.5) * 2, -4 - Math.random() * 6, (Math.random() - 0.5) * 2), 1.2 + Math.random());
    }

    _frostBreathIdle(T) {
        const g = this.game, h = this._joint(T, T.model.userData.rig.head, _v);
        for (let i = 0; i < 18; i++) g.fx?.spark?.(h, 0xeaf8ff, 1.6, _v2.set(fwdX(T.yaw) * (4 + Math.random() * 4) + (Math.random() - 0.5) * 2, -1 + Math.random() * 2, fwdZ(T.yaw) * (4 + Math.random() * 4) + (Math.random() - 0.5) * 2), 2 + Math.random());
    }

    /** Thrown things: a boulder torn from the ground (Saturn — a real pit stays) / balls of lava (Venus) — bent, lifted with both hands, hurled. */
    _throwAct(T, foe, what) {
        const g = this.game, S = fxShapes();
        const held = new THREE.Mesh(what === 'fire' ? S.ball : S.rough, what === 'fire' ? S.fireM : S.rockM);
        held.visible = false;
        g.scene.add(held);
        const size = what === 'fire' ? 3 : 4.5;
        held.scale.setScalar(size);
        let target = foe.p.clone();
        g.sound?.playTitan?.(T.pos, what === 'fire' ? 'erupt' : 'windup', 1);
        this._act(T, 'throw', 3.2, [
            [0.3, () => {
                // the grip: a boulder torn out of the ground before it (a pit stays) / lava scooped up
                const gx = T.pos.x + fwdX(T.yaw) * T.def.radius * 1.2, gz = T.pos.z + fwdZ(T.yaw) * T.def.radius * 1.2;
                if (what === 'rock') { this._dent(T, _v.set(gx, 0, gz), 4, 3); g.sound?.playTitan?.(T.pos, 'crash', 1); }
                this._dust(_v.set(gx, this.ground(gx, gz), gz), 24, what === 'fire' ? 0xff8a20 : 0x9a8a78);
                held.visible = true;
            }],
            [0.76, () => {
                const foeNow = this._players(T).find((q) => q.id === T.foe);
                if (foeNow) target = foeNow.p.clone().add(_v.set((foeNow.p.x - T.pos.x) * 0.04, 0, (foeNow.p.z - T.pos.z) * 0.04));
                held.visible = false;
                const from = this._hands(T, new THREE.Vector3());
                const n = what === 'fire' ? (T.stage >= 3 ? 4 : 3) : (T.stage >= 3 ? 2 : 1);
                for (let i = 0; i < n; i++) this._flyBlob(T, from, target.clone().add(_v.set((Math.random() - 0.5) * 14 * i, 0, (Math.random() - 0.5) * 14 * i)), what);
                g.sound?.playTitan?.(T.pos, what === 'fire' ? 'fire' : 'throw', 1);
                if (this.auth) g.sync?.titan?.({ e: 'throw', id: T.id, w: what, f: [r2(from.x), r2(from.y), r2(from.z)], to: [r2(target.x), r2(target.y), r2(target.z)], n });
            }],
        ], {
            move: () => { if (held.visible) { this._hands(T, held.position); if (what === 'fire' && Math.random() < 0.6) g.fx?.spark?.(held.position, 0xff8a20, 0.6, _v.set(0, -2, 0), 0.6); } },
            end: () => g.scene.remove(held),
        });
    }

    /** One thing flying on an arc from `from` to `to` (a lava ball / a boulder) — its impact hurts round it. */
    _flyBlob(T, from, to, what) {
        const g = this.game, S = fxShapes(), R = T.def.ranged;
        const dist = from.distanceTo(to), tt = Math.max(1.2, dist / (R.speed || 34)), grav = 18;
        const vel = new THREE.Vector3((to.x - from.x) / tt, (to.y - from.y) / tt + grav * tt / 2, (to.z - from.z) / tt);
        const mesh = new THREE.Mesh(what === 'fire' ? S.ball : S.rough, what === 'fire' ? S.fireM : S.rockM);
        mesh.scale.setScalar(what === 'fire' ? 2.2 : 3.2);
        mesh.position.copy(from);
        const mark = this._marker(to, R.r, what === 'fire' ? 0xff7a20 : 0xd8c8a0, tt + 0.2); // (where it will fall — run!)
        this._addFx({
            mesh, t: 0, life: tt + 0.6,
            step: (f, dt) => {
                vel.y -= grav * dt;
                mesh.position.addScaledVector(vel, dt);
                mesh.rotation.x += dt * 2; mesh.rotation.y += dt * 1.3;
                if (what === 'fire' && Math.random() < 0.7) g.fx?.spark?.(mesh.position, 0xff8a20, 0.5, _v.set((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2), 0.6);
                if ((vel.y < 0 && mesh.position.y <= this.ground(mesh.position.x, mesh.position.z)) || f.t > tt + 0.4) { this._impact(T, mesh.position.clone(), what); mark && (mark.t = mark.life); return true; }
                return false;
            },
        });
    }

    _impact(T, p, what) {
        const g = this.game, R = T.def.ranged;
        g.fx?.explosion?.(p, R.r * 0.6, what === 'fire' ? 1.5 : 1);
        g.sound?.playTitan?.(p, what === 'fire' ? 'burst' : 'crash', 1);
        if (what === 'fire') this._fireGround(p);
        else this._dust(p, 30, 0x9a8a78);
        const me = g.character?.group?.position;
        if (me) { const d = me.distanceTo(p); if (d < R.r * 3) g.cameraShake?.(0.4 * (1 - d / (R.r * 3)), 0.5); }
        if (what === 'rock') this.noise(p); // (a boulder's crash is heard by the sand too)
        if (!this.auth) return;
        for (const pl of this._players(T)) {
            const d = pl.p.distanceTo(p);
            if (d > R.r) continue;
            const push = new THREE.Vector3(pl.p.x - p.x, 0, pl.p.z - p.z).normalize().multiplyScalar(10 * (1 - d / R.r)).setY(6);
            this._hurt(T, pl, Math.round(R.dmg * (1 - d / R.r * 0.5)), what === 'fire' ? 'fire' : 'melee', push, what === 'fire' ? `🔥 Лава титана: −${R.dmg}` : `🪨 Валун титана: −${R.dmg}`);
        }
    }

    /** A glowing ring on the ground where something will strike (a lava ball, a lightning, a geyser, a falling worm) — `life` s. */
    _marker(p, r, col, life) {
        const S = fxShapes(), g = this.game;
        const m = new THREE.Mesh(S.ring, S.markM);
        m.rotation.x = -Math.PI / 2;
        m.position.set(p.x, this.ground(p.x, p.z) + 0.25, p.z);
        m.scale.setScalar(r);
        m.onBeforeRender = () => { S.markM.color.setHex(col); };
        const f = {
            mesh: m, t: 0, life,
            step: (ff) => { const k = Math.min(1, ff.t / Math.max(0.2, life)); m.scale.setScalar(r * (1.25 - 0.25 * k)); m.material.opacity = 0.35 + 0.4 * Math.abs(Math.sin(ff.t * 10)); return false; },
        };
        this._addFx(f);
        void g;
        return f;
    }

    /** Burning ground where lava touched (Venus): sparks and smoke a while (the fire of the world: Burning). */
    _fireGround(p) {
        const g = this.game;
        if (this.auth) g.burning?.igniteAt?.(p, 3);
        for (let i = 0; i < 14; i++) g.fx?.spark?.(_v.set(p.x + (Math.random() - 0.5) * 6, p.y + 0.3, p.z + (Math.random() - 0.5) * 6), i % 2 ? 0xff7a10 : 0xffc040, 0.6, _v2.set(0, 2 + Math.random() * 3, 0), 1 + Math.random());
    }

    _spikesAct(T, foe) {
        this._act(T, 'slam2', 2.6, [[0.66, () => { const f = this._players(T).find((q) => q.id === T.foe) || foe; this._spikes(T, f, 'ice'); this._dust(_v.set(T.pos.x + fwdX(T.yaw) * T.def.radius, T.pos.y, T.pos.z + fwdZ(T.yaw) * T.def.radius), 30, 0xeaf8ff); }]]);
    }

    /** Spikes out of the ground round the foe: ice (Neptune — they freeze) or stone (Saturn's stomp). A warning crackle first. */
    _spikes(T, foe, what) {
        const g = this.game, S = fxShapes(), R = T.def.ranged, n = 10, rad = what === 'ice' ? (R.r || 14) * 0.55 : 7;
        const c = foe.p.clone();
        g.sound?.playTitan?.(c, what === 'ice' ? 'frost' : 'crash', 1);
        this._marker(c, rad, what === 'ice' ? 0xbfe6ff : 0xd8c8a0, 0.75);
        const meshes = [];
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, rr = rad * (0.6 + Math.random() * 0.5);
            const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr, y = this.ground(x, z);
            const m = new THREE.Mesh(S.spike, what === 'ice' ? S.iceM : S.stoneM);
            const h = 5 + Math.random() * 5;
            m.scale.set(1.1 + Math.random() * 0.6, 0.01, 1.1 + Math.random() * 0.6);
            m.position.set(x, y - 0.5, z);
            m.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
            m.userData.h = h;
            g.scene.add(m);
            meshes.push(m);
        }
        let hit = false;
        const holder = new THREE.Group();
        this._addFx({
            mesh: holder, extra: meshes, t: 0, life: 4,
            step: (f) => {
                const k = f.t < 0.7 ? 0 : f.t < 0.95 ? (f.t - 0.7) / 0.25 : f.t > 3.3 ? Math.max(0, 1 - (f.t - 3.3) / 0.7) : 1;
                for (const m of meshes) { m.scale.y = 0.01 + m.userData.h * k; m.position.y = this.ground(m.position.x, m.position.z) - 0.5 + m.scale.y / 2; }
                if (!hit && f.t >= 0.75 && this.auth) {
                    hit = true;
                    for (const pl of this._players(T)) if (pl.p.distanceTo(c) < rad * 1.2) this._hurt(T, pl, R.dmg || 6, what === 'ice' ? 'freeze' : 'melee', new THREE.Vector3(0, 9, 0), what === 'ice' ? `❄️ Ледяные шипы: −${R.dmg}, вы вмёрзли` : '🪨 Каменные шипы из-под земли!');
                }
                return false;
            },
        });
        if (this.auth) g.sync?.titan?.({ e: 'spikes', id: T.id, w: what, p: [r2(c.x), r2(c.y), r2(c.z)] });
    }

    /** Mercury: the mirror on its breast gathers the sunlight 1.2 s — then a beam along that line (blinds). Only under the Sun. */
    _sunRay(T, foe) {
        const g = this.game, S = fxShapes(), R = T.def.ranged;
        const from = this._chest(T).add(_v.set(fwdX(T.yaw) * T.def.radius * 0.8, -T.def.height * 0.05, fwdZ(T.yaw) * T.def.radius * 0.8));
        const aim = foe.p.clone().setY(foe.p.y + 1.6);
        const dir = aim.clone().sub(from).normalize();
        const beam = new THREE.Mesh(S.cyl, S.rayM);
        beam.visible = false;
        g.sound?.playTitan?.(from, 'charge', 1);
        T.mirrorT = 1.2;
        this._act(T, 'roar', 2.2, []); // (it stands still, its breast to the foe, the mirror gathering)
        let hit = false;
        this._addFx({
            mesh: beam, t: 0, life: 2.1,
            step: (f) => {
                if (f.t < 1.2) { if (Math.random() < 0.8) { _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(14); g.fx?.spark?.(_v2.copy(from).add(_v), 0xfff4c0, 1.2, _v3.copy(_v).multiplyScalar(-2), 0.45); } return false; } // (the light streams into the mirror)
                beam.visible = true;
                const len = R.len, w = R.r * (1 - Math.max(0, f.t - 1.6) / 0.5);
                beam.position.copy(from).addScaledVector(dir, len / 2);
                beam.quaternion.setFromUnitVectors(Y_AXIS, dir);
                beam.scale.set(Math.max(0.05, w), len, Math.max(0.05, w));
                if (!hit) {
                    hit = true;
                    g.sound?.playTitan?.(from, 'ray', 1);
                    g.fx?.lightFlash?.(from.clone(), 0xfff4c0, 6, 0.6, 120);
                    if (this.auth) for (const pl of this._players(T)) {
                        _v.copy(pl.p).setY(pl.p.y + 1.6).sub(from);
                        const t = Math.max(0, Math.min(len, _v.dot(dir)));
                        if (_v.addScaledVector(dir, -t).length() < R.r + 0.8) this._hurt(T, pl, R.dmg, 'blind', null, `☀️ Солнечный луч титана: −${R.dmg}, вы ослеплены`);
                    }
                }
                return false;
            },
        });
        if (this.auth) g.sync?.titan?.({ e: 'ray', id: T.id, to: [r2(aim.x), r2(aim.y), r2(aim.z)] });
    }

    /** Mercury's magnet: a hum; the weapons in the hands of players near fly to it — they fall by its feet, a few stick to its breast. */
    _magnet(T, players) {
        const g = this.game;
        g.sound?.playTitan?.(T.pos, 'magnet', 1);
        this._act(T, 'roar', 1.8, []);
        for (const pl of players) {
            if (pl.p.distanceTo(T.pos) > T.def.magnet.r) continue;
            if (pl.local) { if (this._magnetMe(T)) T.stuck = Math.min(4, T.stuck + 1); }
            else g.sync?.titan?.({ e: 'magnet', id: T.id, to: pl.id });
        }
    }
    _magnetMe(T) {
        const g = this.game, it = g.items;
        let took = false;
        for (const side of ['right', 'left']) {
            const held = it?.held?.[side];
            const kind = held?.item?.kind || '';
            if (!held || !/sword|axe|shield|hammer|spear|blade|pistol|saber|rapier|mace|dagger/i.test(kind)) continue;
            // a throw that falls by its feet: from the hand to a spot just before it
            const from = g.character.group.position;
            const to = _v.set(T.pos.x + (from.x - T.pos.x) * 0.1, T.pos.y, T.pos.z + (from.z - T.pos.z) * 0.1);
            const tt = 1.4, grav = 9.8 * 2;
            const vel = new THREE.Vector3((to.x - from.x) / tt, (to.y - from.y) / tt + grav * tt / 2, (to.z - from.z) / tt);
            if (it._throw) { it._throw(side, vel, { why: 'магнит железного титана' }); took = true; }
        }
        g.hud?.setVoice?.(took ? '🧲 Титан вырвал оружие у вас из рук — оно упало у его ног' : '🧲 Железо вокруг тянет к титану', true);
        return took;
    }

    /** The iron one shakes off the weapons stuck on its breast: they fall to the ground (seen falling). */
    _shake(T) {
        const g = this.game;
        this._act(T, 'shake', 2.2, [[0.4, () => {
            const R = T.model.userData.rig;
            for (const b of R.blades || []) if (b.visible) { b.getWorldPosition(_v); this._fallingBit(_v, 1.2, fxShapes().stoneM, 0); }
            T.stuck = 0;
            g.sound?.playTitan?.(T.pos, 'clap', 0.6);
        }]]);
    }

    /** Stage 2 iron: the clap — a ring of sparks runs along the ground; one standing in it is thrown down. */
    _clap(T) {
        const g = this.game;
        this._act(T, 'clap', 2.4, [[0.55, () => {
            const h = this._hands(T, new THREE.Vector3());
            g.sound?.playTitan?.(h, 'clap', 1.6);
            g.fx?.lightFlash?.(h.clone(), 0xffd890, 8, 0.4, 160);
            this._shockRing(T, T.pos.clone(), 110, 9, 'clap');
        }]]);
    }

    /** A ring along the ground from `c` out to `R` (m): sparks (clap) / frost (the ice breath ring); `dmg` to one it passes (not if jumping). */
    _shockRing(T, c, R, dmg, kind) {
        const g = this.game, S = fxShapes();
        const ring = new THREE.Mesh(S.ring, S.markM);
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(c).setY(c.y + 0.6);
        ring.onBeforeRender = () => { S.markM.color.setHex(kind === 'clap' ? 0xffc060 : 0xd8f0ff); };
        const hitIds = new Set(), life = R / 60;
        this._addFx({
            mesh: ring, t: 0, life,
            step: (f) => {
                const rr = 4 + f.t * 60;
                ring.scale.setScalar(rr);
                ring.material.opacity = 0.7 * (1 - f.t / life);
                for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28; g.fx?.spark?.(_v.set(c.x + Math.cos(a) * rr, this.ground(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr) + 0.4, c.z + Math.sin(a) * rr), kind === 'clap' ? 0xffd070 : 0xeaf8ff, 0.7, _v2.set(0, 3 + Math.random() * 4, 0), 0.6); }
                if (this.auth) for (const pl of this._players(T)) {
                    if (hitIds.has(pl.id)) continue;
                    const d = Math.hypot(pl.p.x - c.x, pl.p.z - c.z);
                    if (Math.abs(d - rr) < 4) { hitIds.add(pl.id); if (pl.p.y - this.ground(pl.p.x, pl.p.z) < 1.2) this._hurt(T, pl, dmg, 'melee', new THREE.Vector3(pl.p.x - c.x, 0, pl.p.z - c.z).normalize().multiplyScalar(12).setY(7), '⚡ Волна по земле сбила вас с ног — её можно перепрыгнуть'); }
                }
                return false;
            },
        });
        if (this.auth) g.sync?.titan?.({ e: 'fx', k: 'ring', id: T.id, p: [r2(c.x), r2(c.y), r2(c.z)], r: R, kind });
    }

    /** Stage 3 iron: both fists into the ground — molten iron runs from there towards the foe (burning ground). */
    _slam2(T) {
        const g = this.game;
        this._act(T, 'slam2', 2.8, [[0.66, () => {
            const p = _v.set(T.pos.x + fwdX(T.yaw) * T.def.radius * 1.4, 0, T.pos.z + fwdZ(T.yaw) * T.def.radius * 1.4);
            p.y = this.ground(p.x, p.z);
            g.sound?.playTitan?.(p, 'slam', 1.6);
            this._quake(p, 2, this._players(T));
            this._dent(T, p, 5, 2);
            this._line(T, p.clone(), T.yaw, 70, 'iron');
        }]]);
    }

    /** A line of bursts running along the ground from `from` along `yaw`, `len` m: molten iron (iron) / lava geysers (fire). */
    _line(T, from, yaw, len, what) {
        const g = this.game, n = Math.round(len / 9);
        for (let i = 1; i <= n; i++) {
            const x = from.x + fwdX(yaw) * i * 9, z = from.z + fwdZ(yaw) * i * 9, p = new THREE.Vector3(x, this.ground(x, z), z);
            this._marker(p, 5, what === 'iron' ? 0xff9040 : 0xff6010, 0.6 + i * 0.18);
            this._later.push({ t: 0.6 + i * 0.18, fn: () => this._burst(T, p, what) });
        }
        if (this.auth) g.sync?.titan?.({ e: 'fx', k: 'line', id: T.id, p: [r2(from.x), r2(from.y), r2(from.z)], y: r2(yaw), l: len, w: what });
    }
    _burst(T, p, what) {
        const g = this.game, S = fxShapes();
        g.sound?.playTitan?.(p, 'erupt', 0.8);
        const col = what === 'iron' ? 0xffa040 : 0xff6a10;
        for (let i = 0; i < 26; i++) g.fx?.spark?.(_v.set(p.x + (Math.random() - 0.5) * 3, p.y + 0.5, p.z + (Math.random() - 0.5) * 3), i % 2 ? col : 0xffd060, 1.1, _v2.set((Math.random() - 0.5) * 5, 10 + Math.random() * 14, (Math.random() - 0.5) * 5), 1 + Math.random() * 0.8);
        const col2 = new THREE.Mesh(S.cyl, what === 'iron' ? S.ironM : S.fireM);
        col2.position.set(p.x, p.y, p.z);
        this._addFx({ mesh: col2, t: 0, life: 1.1, step: (f) => { const k = Math.sin(Math.min(1, f.t / 1.1) * Math.PI); col2.scale.set(1.6 * k + 0.1, 16 * k + 0.1, 1.6 * k + 0.1); col2.position.y = p.y + col2.scale.y / 2; return false; } });
        this._fireGround(p);
        if (!this.auth) return;
        for (const pl of this._players(T)) { const d = Math.hypot(pl.p.x - p.x, pl.p.z - p.z); if (d < 5) this._hurt(T, pl, 7, 'fire', new THREE.Vector3(0, 12, 0), what === 'iron' ? '🔥 Расплавленное железо!' : '🌋 Лава бьёт из-под земли!'); }
    }

    /** Stage 2 lava: the eruption — a punch into the ground, geysers running at the foe. */
    _eruption(T, foe) {
        this._act(T, 'slam2', 2.6, [[0.66, () => {
            const f = this._players(T).find((q) => q.id === T.foe) || foe;
            const p = _v.set(T.pos.x + fwdX(T.yaw) * T.def.radius * 1.2, 0, T.pos.z + fwdZ(T.yaw) * T.def.radius * 1.2);
            p.y = this.ground(p.x, p.z);
            this._quake(p, 1.6, this._players(T));
            this._line(T, p.clone(), yawTo(p.x, p.z, f.p.x, f.p.z), Math.min(160, Math.hypot(f.p.x - p.x, f.p.z - p.z) + 25), 'fire');
        }]]);
    }

    /** Stage 3 lava: the rain of fire — it roars to the sky; burning stones fall round the foe (each spot glows first). */
    _fireRain(T, foe) {
        const g = this.game;
        this._act(T, 'roar', 3, [[0.3, () => {
            const f = this._players(T).find((q) => q.id === T.foe) || foe, c = f.p.clone(), pts = [];
            for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, r = Math.random() * 45; pts.push([r2(c.x + Math.cos(a) * r), r2(c.z + Math.sin(a) * r)]); }
            this._rain(T, pts);
            g.sound?.playTitan?.(T.pos, 'fire', 1.4);
            if (this.auth) g.sync?.titan?.({ e: 'fx', k: 'rain', id: T.id, pts });
        }]]);
    }

    /** The burning stones falling from the sky on `pts` ([x, z]), one after another (each spot glows while it falls). */
    _rain(T, pts) {
        pts.forEach(([x, z], i) => {
            const p = new THREE.Vector3(x, this.ground(x, z), z);
            this._later.push({ t: 0.05 + i * 0.22, fn: () => this._flyBlob(T, p.clone().add(_v.set(15, 120, 6)), p, 'fire') });
        });
    }

    /** Neptune: the frost breath — a cone from its mouth along its look (drawn in, then out). */
    _breath(T, foe) {
        const g = this.game, S = fxShapes();
        void foe;
        this._act(T, 'breath', 3.2, [[0.4, () => {
            const R = T.model.userData.rig, h = this._joint(T, R.head, new THREE.Vector3());
            g.sound?.playTitan?.(h, 'frost', 1.6);
            const dir = new THREE.Vector3(fwdX(T.yaw), -0.35, fwdZ(T.yaw)).normalize();
            const cone = new THREE.Mesh(S.cone, S.frostM);
            const len = 70;
            cone.position.copy(h).addScaledVector(dir, len / 2);
            cone.quaternion.setFromUnitVectors(_v.set(0, -1, 0), dir);
            let hitIds = new Set();
            this._addFx({
                mesh: cone, t: 0, life: 1.6,
                step: (f) => {
                    const k = Math.min(1, f.t / 0.4);
                    cone.scale.set(len * 0.28 * k, len * k, len * 0.28 * k);
                    cone.position.copy(h).addScaledVector(dir, len * k / 2);
                    for (let i = 0; i < 8; i++) g.fx?.spark?.(_v.copy(h).addScaledVector(dir, Math.random() * len * k).add(_v2.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8)), 0xeaf8ff, 1.4, _v3.copy(dir).multiplyScalar(8), 0.8);
                    if (this.auth && f.t > 0.3) for (const pl of this._players(T)) {
                        if (hitIds.has(pl.id)) continue;
                        _v.copy(pl.p).setY(pl.p.y + 1.6).sub(h);
                        const t = _v.dot(dir);
                        if (t < 0 || t > len) continue;
                        if (_v.addScaledVector(dir, -t).length() < 4 + t * 0.28) { hitIds.add(pl.id); this._hurt(T, pl, 5, 'freeze', null, '❄️ Морозное дыхание — вы вмёрзли в лёд'); }
                    }
                    return false;
                },
            });
            if (this.auth) g.sync?.titan?.({ e: 'fx', k: 'breath', id: T.id });
        }]]);
    }
    _blizzard(T, dt, players) {
        const g = this.game, me = g.character?.group?.position;
        if (me && me.distanceTo(T.pos) < 300) for (let i = 0; i < 3; i++) g.fx?.spark?.(_v.set(me.x + (Math.random() - 0.5) * 40, me.y + Math.random() * 20, me.z + (Math.random() - 0.5) * 40), 0xffffff, 0.35, _v2.set(-8, -3, 2), 2);
        T.blizT = (T.blizT || 0) - dt;
        if (T.blizT > 0 || !this.auth) return;
        T.blizT = 3;
        for (const pl of players) if (pl.p.distanceTo(T.pos) < 250 && !(pl.speed > 1)) this._hurt(T, pl, 1, 'freeze', null, '🌨️ В метель нельзя стоять на месте — вы примерзаете');
    }

    /** Neptune: a cage of ice round the foe — real ice blocks (break them out); they melt away later by themselves. */
    _cageAct(T, foe) {
        this._act(T, 'roar', 2.2, [[0.5, () => { const f = this._players(T).find((q) => q.id === T.foe) || foe; this._cage(T, f.p); }]]);
    }
    _cage(T, c) {
        const g = this.game, d = this.data;
        if (!this.auth || !d || !g.builder?._sendEdits) return;
        g.sound?.playTitan?.(c, 'frost', 1.6);
        const edits = [], blocks = [], cx = Math.round(c.x), cz = Math.round(c.z), R = 4;
        for (let a = 0; a < 40; a++) {
            const x = Math.round(cx + Math.cos(a / 40 * Math.PI * 2) * R), z = Math.round(cz + Math.sin(a / 40 * Math.PI * 2) * R);
            const L = d.topLayer(x, z);
            if (L == null) continue;
            for (let y = 1; y <= 7; y++) {
                if (blocks.some((b) => b[0] === x && b[1] === L + y && b[2] === z)) continue;
                if (d.get(x, L + y, z) !== BLOCK.AIR) continue;
                edits.push([x, L + y, z, BLOCK.ICE]); blocks.push([x, L + y, z]);
            }
        }
        // the lid
        const top = d.topLayer(cx, cz) + 8;
        for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) if (x * x + z * z <= R * R && d.get(cx + x, top, cz + z) === BLOCK.AIR) { edits.push([cx + x, top, cz + z, BLOCK.ICE]); blocks.push([cx + x, top, cz + z]); }
        if (!edits.length) return;
        g.builder._sendEdits(edits);
        const cage = { blocks, t: 25 };
        this.state.cages.push(cage);
        this._later.push({ t: 25, fn: () => this._melt(cage) });
        g.hud?.setVoice?.('🧊 Ледяная клетка! Ломайте лёд — «Бомбардо», огонь, кулаки', true);
    }
    /** A cage melts away (the blocks still ice — the ones broken already are not touched). */
    _melt(cage) {
        const g = this.game, d = this.data;
        const i = this.state.cages.indexOf(cage);
        if (i >= 0) this.state.cages.splice(i, 1);
        if (!d || !g.builder?._sendEdits) return;
        const edits = cage.blocks.filter((b) => d.get(b[0], b[1], b[2]) === BLOCK.ICE).map((b) => [b[0], b[1], b[2], BLOCK.AIR]);
        if (edits.length) g.builder._sendEdits(edits);
    }

    /** Uranus: a wave of darkness from it — the light round a hero it reaches goes out a while. */
    _darkWave(T) {
        const g = this.game, S = fxShapes(), R = T.def.ranged;
        const ring = new THREE.Mesh(S.ball, S.darkM);
        ring.position.copy(T.pos).setY(T.pos.y + 4);
        g.sound?.playTitan?.(T.pos, 'dark', 1);
        this._act(T, 'roar', 2, []);
        const hitIds = new Set();
        this._addFx({
            mesh: ring, t: 0, life: 2.4,
            step: (f) => {
                const rr = 5 + f.t * 70;
                ring.scale.set(rr, rr * 0.35, rr);
                ring.material.opacity = 0.55 * (1 - f.t / 2.4);
                if (this.auth) for (const pl of this._players(T)) if (!hitIds.has(pl.id) && Math.abs(pl.p.distanceTo(T.pos) - rr) < 6) { hitIds.add(pl.id); this._hurt(T, pl, R.dmg, 'dark', null, `🌑 Волна тьмы: −${R.dmg}, свет вокруг погас`); }
                return false;
            },
        });
        if (this.auth) g.sync?.titan?.({ e: 'dark', id: T.id });
    }

    /** Uranus: it melts into the dark and comes out beside the foe (behind him, facing him). */
    _blink(T, foe) {
        const g = this.game, B = T.def.blink;
        const back = Math.atan2(foe.p.z - T.pos.z, foe.p.x - T.pos.x), a = back + (Math.random() - 0.5) * 1.2, r = rand(B.far);
        this._dust(T.pos, 40, 0x0a2a30);
        T.pos.set(foe.p.x + Math.cos(a) * r, 0, foe.p.z + Math.sin(a) * r);
        T.pos.y = this.ground(T.pos.x, T.pos.z);
        T.yaw = yawTo(T.pos.x, T.pos.z, foe.p.x, foe.p.z);
        T.blowCool = Math.min(T.blowCool, 0.8);
        this._dust(T.pos, 40, 0x0a2a30);
        g.sound?.playTitan?.(T.pos, 'dark', 0.8);
    }

    /** My own eyes on the shade (every computer for itself): looking at it, with a light — told to the host when it changes. */
    _myLook(T) {
        const g = this.game, cam = g.camera, me = g.character?.group?.position;
        if (!cam || !me) return;
        cam.getWorldDirection(_v);
        _v2.copy(titanCenter(T, _v3)).sub(cam.position);
        const dist = _v2.length();
        const dot = dist > 1 ? _v.dot(_v2.normalize()) : 0;
        const lit = !!(g.wandMagic?.light || g.wandMagic?.follow) || (g.fireLights?.near?.(T.pos, 40) ?? false) || ((g.helios?.lightAt?.(me.x, me.y, me.z)?.k ?? 0) > 0.5); // (+ the gods' Sun: Helios.js)
        const on = dist < 220 && dot > 0.82 && lit;
        const id = g.localId ?? 'me';
        this._looks.set(id, { on, lit, dot, t: T.t });
        const now = T.t;
        if (!this.auth && (this._lookSent !== on || (on && now - (this._lookAt || 0) > 1))) { this._lookSent = on; this._lookAt = now; g.sync?.titan?.({ e: 'look', id: T.id, on, dot: r2(dot), lit }); }
    }

    /** Stage 2 shade: shadows of itself — two, from both sides of the foe; they melt in a light or at a blow. */
    _decoys(T) {
        const g = this.game;
        for (const d of T.decoys) g.scene.remove(d.model);
        T.decoys = [];
        for (let i = 0; i < 2; i++) {
            const model = cloneTitan(T.model);
            model.scale.copy(T.model.scale);
            const a = T.yaw + (i ? 1.6 : -1.6), r = 40;
            const pos = new THREE.Vector3(T.pos.x + Math.cos(a) * r, 0, T.pos.z + Math.sin(a) * r);
            pos.y = this.ground(pos.x, pos.z);
            g.scene.add(model);
            T.decoys.push({ model, pos, yaw: T.yaw, ph: Math.random() * 6, blowT: 0, cool: 3 + i, alive: true, gone: 0 });
            this._dust(pos, 30, 0x0a2a30);
        }
        g.sound?.playTitan?.(T.pos, 'dark', 1.2);
    }
    _stepDecoys(T, dt, foe, players) {
        for (const d of T.decoys) {
            if (!d.alive) { d.gone += dt; continue; }
            // a light near it — it melts (the true one only freezes): a player with a light within 50 m
            if (players.some((pl) => this._looks.get(pl.id)?.lit && Math.hypot(pl.p.x - d.pos.x, pl.p.z - d.pos.z) < 50)) { this._decoyGone(T, d); continue; }
            if (!foe) continue;
            const dist = Math.hypot(foe.p.x - d.pos.x, foe.p.z - d.pos.z), want = yawTo(d.pos.x, d.pos.z, foe.p.x, foe.p.z);
            d.yaw += Math.max(-dt, Math.min(dt, angDiff(d.yaw, want)));
            d.cool -= dt;
            if (d.blowT > 0) { d.blowT += dt / 1.8; if (d.blowT >= 0.6 && !d.hit) { d.hit = true; if (this.auth) for (const pl of players) if (Math.hypot(pl.p.x - d.pos.x, pl.p.z - d.pos.z) < 18) this._hurt(T, pl, 4, 'dark', null, '🌑 Тень задела вас'); } if (d.blowT >= 1) { d.blowT = 0; d.hit = false; d.cool = 4; } continue; }
            if (dist < 22 && d.cool <= 0) { d.blowT = 0.001; continue; }
            if (dist > 12) { const sp = T.def.walk * 1.8; d.pos.x += fwdX(d.yaw) * sp * dt; d.pos.z += fwdZ(d.yaw) * sp * dt; d.pos.y = this.ground(d.pos.x, d.pos.z); d.ph += Math.PI / TITAN.STEP_T * dt * 1.8; }
        }
        T.decoys = T.decoys.filter((d) => d.alive || d.gone < 3);
    }
    _decoyGone(T, d) {
        d.alive = false; d.gone = 0;
        this._dust(d.pos, 50, 0x1a4a50);
        this.game.sound?.playTitan?.(d.pos, 'dark', 0.6);
        this.game.scene.remove(d.model);
    }

    /** Stage 2+ rock: curled into a boulder, it rolls at the foe in a straight line (the rumble first — step aside!). */
    _roll(T, foe) {
        const g = this.game;
        const dir = yawTo(T.pos.x, T.pos.z, foe.p.x, foe.p.z);
        g.sound?.playTitan?.(T.pos, 'rumble', 1.4);
        T.rollAng = 0;
        const hitIds = new Set();
        this._act(T, 'curl', 7, [[0.2, () => { T.yaw = dir; g.sound?.playTitan?.(T.pos, 'rise', 1); }]], {
            move: (dt) => {
                const a = T.act?.t ?? 1;
                if (a < 0.2 || a > 0.85) return;
                const sp = 20;
                T.pos.x += fwdX(T.yaw) * sp * dt; T.pos.z += fwdZ(T.yaw) * sp * dt;
                T.pos.y = this.ground(T.pos.x, T.pos.z);
                T.rollAng += sp * dt / (T.def.height * 0.22);
                this._quake(T.pos, 0.5, []);
                if (Math.random() < 0.8) this._dust(T.pos, 3, 0x9a8a78);
                if (Math.random() < 0.05) this._dent(T, T.pos, 0, 1);
                if (this.auth) for (const pl of this._players(T)) {
                    if (hitIds.has(pl.id)) continue;
                    const d = Math.hypot(pl.p.x - T.pos.x, pl.p.z - T.pos.z);
                    if (d < T.def.height * 0.24) { hitIds.add(pl.id); this._hurt(T, pl, 14, 'melee', new THREE.Vector3(fwdX(T.yaw) * 20 + (pl.p.x - T.pos.x) * 0.5, 14, fwdZ(T.yaw) * 20 + (pl.p.z - T.pos.z) * 0.5), '🪨 Катящаяся гора сбила вас!'); }
                }
            },
            end: () => { T.rollAng = 0; },
        });
    }

    /** Stage 3 rock: it tears a pillar of stone out of the ground (a deep pit stays) — a club from now on. */
    _tearPillar(T) {
        const g = this.game;
        this._act(T, 'throw', 4, [
            [0.15, () => this._roar(T, 1.5)],
            [0.3, () => { const p = _v.set(T.pos.x + fwdX(T.yaw) * T.def.radius * 1.2, 0, T.pos.z + fwdZ(T.yaw) * T.def.radius * 1.2); this._dent(T, p, 5, 6); g.sound?.playTitan?.(T.pos, 'crash', 1.6); this._dust(p.setY(this.ground(p.x, p.z)), 60, 0x8a7a68); T.club = true; }],
        ], { end: () => { T.club = true; } });
    }

    _fallingBit(p, s, mat, spin = 2) {
        const S = fxShapes(), m = new THREE.Mesh(S.rough, mat);
        m.scale.setScalar(s);
        m.position.copy(p);
        const vel = new THREE.Vector3((Math.random() - 0.5) * 6, 2, (Math.random() - 0.5) * 6);
        this._addFx({ mesh: m, t: 0, life: 6, step: (f, dt) => { vel.y -= 18 * dt; m.position.addScaledVector(vel, dt); m.rotation.x += dt * spin; const gy = this.ground(m.position.x, m.position.z) + s * 0.6; if (m.position.y < gy) { m.position.y = gy; if (vel.y < -4) { this.game.sound?.playTitan?.(m.position, 'crash', 0.5); this._dust(m.position, 12, 0x9a8a78); } vel.set(vel.x * 0.4, Math.abs(vel.y) * 0.2, vel.z * 0.4); } return false; } });
    }

    // ------------------------------------------------------------------ the sandworm
    _thinkWorm(T, dt, foe, players) {
        const def = T.def, g = this.game;
        T.wT -= dt; T.rangedCool -= dt; T.breachCool -= dt;
        T.stagT = Math.max(0, (T.stagT || 0) - dt);
        if (foe) T.heard = foe.p.clone(); // (it follows the steps it hears)
        if (T.wm === 'under') {
            // swims under the sand to where it heard steps (or wanders): fast; the hump over the dunes shows where
            const to = T.heard || T.wanderTo || T.home;
            const wy = yawTo(T.pos.x, T.pos.z, to.x, to.z);
            this._turn(T, wy, dt * 3);
            const dist = Math.hypot(to.x - T.pos.x, to.z - T.pos.z);
            const sp = Math.min(def.walk * (T.stage >= 2 ? 1.25 : 1), dist);
            const nx = T.pos.x + fwdX(T.yaw) * sp * dt, nz = T.pos.z + fwdZ(T.yaw) * sp * dt;
            // it never goes under rock: it turns along the edge
            if (this._isRock(nx, nz)) { T.yaw += dt * 1.5; if (foe && this._isRock(foe.p.x, foe.p.z) && dist < 40) this.hint('rock'); }
            else { T.pos.x = nx; T.pos.z = nz; }
            T.pos.y = this.ground(T.pos.x, T.pos.z);
            T.speed = sp;
            if (T.heard && dist < 10 && !foe) T.heard = null; // (came to the noise — nothing there)
            if (!T.heard && (!T.wanderTo || dist < 15)) { const a = Math.random() * 6.28, r = Math.random() * TITAN.HOME_R; T.wanderTo = new THREE.Vector3(T.home.x + Math.cos(a) * r, 0, T.home.z + Math.sin(a) * r); }
            T.rumbleT = (T.rumbleT || 0) - dt;
            if (T.rumbleT <= 0) { T.rumbleT = 0.5; this._quake(T.pos, 0.6, []); }
            // its life at peace: now and then its back breaks the dunes (seen from afar)
            if (!foe && T.wT <= 0) { T.wT = 25 + Math.random() * 20; T.wm = 'back'; T.backT = 0; g.sound?.playTitan?.(T.pos, 'rumble', 0.8); }
            if (foe && T.stage >= 3 && T.breachCool <= 0 && dist < 160 && dist > 40) { this._breachStart(T, foe); return; }
            if (foe && dist < 6 && T.wT <= 0 && !this._isRock(foe.p.x, foe.p.z)) { T.wm = 'rising'; T.wT = 1.6; T.riseAt = foe.p.clone(); g.sound?.playTitan?.(T.pos, 'rumble', 1.2); this._marker(T.riseAt, def.radius, 0xd89060, 1.6); }
            return;
        }
        if (T.wm === 'back') {
            T.backT += dt;
            T.pos.x += fwdX(T.yaw) * def.walk * 0.5 * dt; T.pos.z += fwdZ(T.yaw) * def.walk * 0.5 * dt;
            T.pos.y = this.ground(T.pos.x, T.pos.z);
            if (foe || T.backT > 9) { T.wm = 'under'; T.wT = 4; }
            return;
        }
        if (T.wm === 'rising') {
            // the rumble under the foe: the ground shakes harder — run! then it bursts up
            if (Math.random() < 0.4) this._quake(T.riseAt, 1.2, []);
            if (T.wT <= 0) {
                T.wm = 'up'; T.wT = 5 + Math.random() * 2; T.up = 0;
                T.pos.set(T.riseAt.x, this.ground(T.riseAt.x, T.riseAt.z), T.riseAt.z);
                g.sound?.playTitan?.(T.pos, 'burst', 1.6);
                g.fx?.explosion?.(T.pos.clone(), def.radius, 2);
                this._dust(T.pos, 80, 0xc8885a);
                // the swallow: who stands in the circle of its mouth — dark inside, then spat out
                let swallowed = false;
                for (const pl of players) {
                    const d = Math.hypot(pl.p.x - T.pos.x, pl.p.z - T.pos.z);
                    if (d < def.radius) { swallowed = true; this._hurt(T, pl, def.blow, 'swallow', new THREE.Vector3((Math.random() - 0.5) * 20, 26, (Math.random() - 0.5) * 20), `🪱 Песчаный змей проглотил вас и выплюнул: −${def.blow}`); }
                    else if (d < def.radius * 2.5) this._hurt(T, pl, 4, 'melee', new THREE.Vector3(pl.p.x - T.pos.x, 0, pl.p.z - T.pos.z).normalize().multiplyScalar(14).setY(8), '🪱 Песок взрывается под ногами!');
                }
                if (swallowed) this._later.push({ t: 0.5, fn: () => g.sound?.playTitan?.(T.pos, 'swallow', 1.4) });
                this._quake(T.pos, 2.5, players);
                this._roar(T, 1.2);
            }
            return;
        }
        if (T.wm === 'up') {
            // up and arched: it can be hurt now (its open mouth most); it turns to the foe and sweeps its tail
            T.up = Math.min(1, T.up + dt * 1.5);
            if (T.stagT > 0) { T.wT = Math.max(T.wT, T.stagT); return; } // (staggered: it thrashes on the sand, longer up)
            if (foe) this._turn(T, yawTo(T.pos.x, T.pos.z, foe.p.x, foe.p.z), dt * 2);
            if (foe && T.rangedCool <= 0) {
                T.rangedCool = rand(def.ranged.every);
                const R = def.ranged;
                g.sound?.playTitan?.(T.pos, 'slam', 1.2);
                this._dust(T.pos, 40, 0xc8885a);
                for (const pl of players) { const d = pl.p.distanceTo(T.pos); if (d < R.r * 2 && d > def.radius) this._hurt(T, pl, R.dmg, 'melee', new THREE.Vector3(pl.p.x - T.pos.x, 0, pl.p.z - T.pos.z).normalize().multiplyScalar(16).setY(7), `🪱 Хвост змея: −${R.dmg}`); }
            }
            if (T.wT <= 0) { T.wm = 'diving'; T.wT = 1.4; g.sound?.playTitan?.(T.pos, 'rumble', 1); }
            return;
        }
        if (T.wm === 'diving') {
            T.up = Math.max(0, T.up - dt * 0.8);
            if (T.wT <= 0) { T.wm = 'under'; T.wT = 3 + Math.random() * 3; T.up = 0; }
            return;
        }
        if (T.wm === 'breach') {
            // stage 3: it leaps out whole along an arc and falls head first where the foe stood
            T.breachT += dt / 3.6;
            const B = T.breach;
            if (T.breachT >= 0.82 && !B.hit) {
                B.hit = true;
                g.sound?.playTitan?.(B.to, 'burst', 1.8);
                g.fx?.explosion?.(B.to.clone(), def.radius * 1.5, 2.5);
                this._dust(B.to, 120, 0xc8885a);
                this._quake(B.to, 3, players);
                for (const pl of players) { const d = Math.hypot(pl.p.x - B.to.x, pl.p.z - B.to.z); if (d < def.radius * 2) this._hurt(T, pl, 22, 'melee', new THREE.Vector3(pl.p.x - B.to.x, 0, pl.p.z - B.to.z).normalize().multiplyScalar(18).setY(14), '🪱 Змей обрушился на вас с неба!'); }
            }
            if (T.breachT >= 1) { T.wm = 'up'; T.wT = 4; T.up = 1; T.pos.copy(B.to); T.breach = null; }
        }
    }
    _isRock(x, z) { const b = this.groundBlock(x, z); return b === BLOCK.PLANET_ROCK || b === BLOCK.STONE; }
    _breachStart(T, foe) {
        const g = this.game, to = foe.p.clone();
        to.y = this.ground(to.x, to.z);
        const back = Math.atan2(T.pos.z - to.z, T.pos.x - to.x);
        const from = new THREE.Vector3(to.x + Math.cos(back) * 120, 0, to.z + Math.sin(back) * 120);
        from.y = this.ground(from.x, from.z);
        T.wm = 'breach'; T.breachT = 0; T.breach = { from, to, hit: false }; T.breachCool = 22;
        T.yaw = yawTo(from.x, from.z, to.x, to.z);
        this._marker(to, T.def.radius * 2, 0xff9050, 3);
        g.sound?.playTitan?.(from, 'burst', 1.6);
        this._dust(from, 100, 0xc8885a);
        this._roar(T, 1.5);
        if (this.auth) g.sync?.titan?.({ e: 'fx', k: 'breach', id: T.id, f: [r2(from.x), r2(from.y), r2(from.z)], to: [r2(to.x), r2(to.y), r2(to.z)] });
    }

    /** A loud blast heard (a Bombardo, a lightning, a boulder's crash): the sandworm goes there. */
    noise(p) {
        if (!this.auth || !p) return;
        for (const T of this.active.values()) {
            if (T.def.kit !== 'worm' || T.mode === 'dying' || T.wm !== 'under') continue;
            if (Math.hypot(p.x - T.pos.x, p.z - T.pos.z) > WORM_LURE_R) continue;
            T.heard = new THREE.Vector3(p.x, p.y, p.z);
            T.foe = null;
            if (T.mode === 'peace') T.mode = 'fight';
            this.hint('lure');
        }
    }

    // ------------------------------------------------------------------ the living storm
    _thinkStorm(T, dt, foe, players) {
        const def = T.def, g = this.game;
        T.rangedCool -= dt; T.specialCool -= dt;
        T.stagT = Math.max(0, (T.stagT || 0) - dt);
        const to = foe ? foe.p : (T.pos.distanceTo(T.home) > TITAN.HOME_R ? T.home : (T.wanderTo || T.home));
        if (!foe && (!T.wanderTo || T.pos.distanceTo(T.wanderTo) < 30)) { const a = Math.random() * 6.28; T.wanderTo = new THREE.Vector3(T.home.x + Math.cos(a) * TITAN.HOME_R * 0.6, 0, T.home.z + Math.sin(a) * TITAN.HOME_R * 0.6); }
        const dx = to.x - T.pos.x, dz = to.z - T.pos.z, d = Math.hypot(dx, dz) || 1;
        const sp = T.stagT > 0 ? 0 : Math.min(def.walk * (foe ? 1 : 0.5), d);
        T.pos.x += dx / d * sp * dt; T.pos.z += dz / d * sp * dt;
        T.pos.y = this.ground(T.pos.x, T.pos.z);
        T.speed = sp;
        const R = def.radius * T.grow, pullR = def.pull.r * T.grow;
        // the pull and the throw (for each player: mine here, the others' told every 0.25 s as a push); the calm eye inside
        T.pullT = (T.pullT || 0) - dt;
        const tick = T.pullT <= 0;
        if (tick) T.pullT = 0.25;
        for (const pl of players) {
            const ex = T.pos.x - pl.p.x, ez = T.pos.z - pl.p.z, e = Math.hypot(ex, ez);
            if (e > pullR) { T.eyeT.delete(pl.id); continue; }
            if (e < R * STORM_EYE.PART) {
                // in the eye: still — its heart above; thrown out after a while
                const t = (T.eyeT.get(pl.id) || 0) + dt;
                T.eyeT.set(pl.id, t);
                if (t > STORM_EYE.EYE_T && tick) { T.eyeT.delete(pl.id); this._hurt(T, pl, 4, 'melee', new THREE.Vector3(-ex / (e || 1) * 26, 30, -ez / (e || 1) * 26), '🌪️ Вихрь вышвырнул вас из своего сердца!'); }
                else if (t < dt * 1.5 && pl.local) g.hud?.setVoice?.('🌀 Внутри вихря тихо… над вами светится его сердце', true);
                continue;
            }
            T.eyeT.delete(pl.id);
            if (e < R * 0.9) {
                if (tick) this._hurt(T, pl, 0, 'melee', new THREE.Vector3(-ex / (e || 1) * 18 + ez / (e || 1) * 12, 26, -ez / (e || 1) * 18 - ex / (e || 1) * 12), '🌪️ Стена вихря подхватила вас и швырнула!');
            } else if (tick) {
                const k = def.pull.speed * (1 - e / pullR) * T.grow;
                this._hurt(T, pl, 0, 'melee', new THREE.Vector3(ex / e * k + ez / e * k * 0.6, 0.4, ez / e * k - ex / e * k * 0.6), '');
            }
        }
        // the small whirls of stage 3 (orbiting it): they pull too
        for (const m of T.minis) {
            m.ang += dt * 0.25;
            m.pos.set(T.pos.x + Math.cos(m.ang) * 120, 0, T.pos.z + Math.sin(m.ang) * 120);
            m.pos.y = this.ground(m.pos.x, m.pos.z);
            m.boltT -= dt;
            if (tick) for (const pl of players) { const ex = m.pos.x - pl.p.x, ez = m.pos.z - pl.p.z, e = Math.hypot(ex, ez); if (e < 60 && e > 1) this._hurt(T, pl, 0, 'melee', e < 12 ? new THREE.Vector3(-ex / e * 14, 18, -ez / e * 14) : new THREE.Vector3(ex / e * 4, 0.3, ez / e * 4), ''); }
            if (foe && m.boltT <= 0 && m.pos.distanceTo(foe.p) < 200) { m.boltT = 5 + Math.random() * 3; this._boltAct(T, foe.p.clone(), m.pos); }
        }
        if (T.stagT > 0) return;
        if (foe && T.rangedCool <= 0 && foe.p.distanceTo(T.pos) < TITAN.SEE) { T.rangedCool = rand(def.ranged.every) * (T.stage >= 3 ? 0.8 : 1); this._boltAct(T, foe.p.clone()); }
        if (foe && T.stage >= 2 && T.specialCool <= 0 && foe.p.distanceTo(T.pos) < 260) { T.specialCool = rand([7, 11]); this._hurlDebris(T, foe); }
        T.howlT = (T.howlT || 0) - dt;
        if (T.howlT <= 0) { T.howlT = 7 + Math.random() * 6; g.sound?.playTitan?.(T.pos, 'howl', foe ? 1.2 : 0.7); }
    }

    /** A lightning from the whirl: a spot of light on the ground first (a second to jump away) — then the bolt. */
    _boltAct(T, at, from = null) {
        at.y = this.ground(at.x, at.z);
        this._marker(at, T.def.ranged.r + 1.5, 0xc8dcff, 1.1);
        const src = from ? from.clone() : null;
        this._later.push({ t: 1.1, fn: () => { if (this.active.get(T.id) === T && T.mode !== 'dying') this._bolt(T, at, src); } });
        if (this.auth) this.game.sync?.titan?.({ e: 'fx', k: 'mark', id: T.id, p: [r2(at.x), r2(at.y), r2(at.z)], r: T.def.ranged.r + 1.5, c: 0xc8dcff, l: 1.1 });
    }

    /** A lightning bolt from the whirl to `at` (a white flash of the funnel first). */
    _bolt(T, at, src = null) {
        const g = this.game, S = fxShapes(), R = T.def.ranged;
        const base = src || T.pos;
        const from = new THREE.Vector3(base.x + (Math.random() - 0.5) * 20, base.y + T.def.height * (src ? 0.3 : 0.4 + Math.random() * 0.4) * T.grow, base.z + (Math.random() - 0.5) * 20);
        const pts = [];
        const n = 14;
        for (let i = 0; i <= n; i++) { const t = i / n; pts.push(from.clone().lerp(at, t).add(_v.set((Math.random() - 0.5) * 8 * Math.sin(t * Math.PI), (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8 * Math.sin(t * Math.PI)))); }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), S.boltM);
        T.flashT = 0.25;
        g.fx?.lightFlash?.(at.clone(), 0xc8dcff, 8, 0.3, 80);
        g.sound?.playTitan?.(at, 'thunder', 1.4);
        this._addFx({ mesh: line, t: 0, life: 0.35, ownGeo: true, step: () => { line.visible = Math.random() > 0.3; return false; } });
        if (this.auth) {
            for (const pl of this._players(T)) if (pl.p.distanceTo(at) < R.r + 2) this._hurt(T, pl, R.dmg, 'melee', new THREE.Vector3(0, 6, 0), `⚡ Молния вихря: −${R.dmg}`);
            g.sync?.titan?.({ e: 'bolt', id: T.id, p: [r2(at.x), r2(at.y), r2(at.z)] });
        }
    }

    /** Stage 2 storm: what it drew up (rocks, clods) flies out of the whirl at the foe. */
    _hurlDebris(T, foe) {
        const g = this.game, n = T.stage >= 3 ? 4 : 3;
        g.sound?.playTitan?.(T.pos, 'throw', 1.2);
        for (let i = 0; i < n; i++) {
            const a = Math.random() * 6.28, from = new THREE.Vector3(T.pos.x + Math.cos(a) * T.def.radius, T.pos.y + T.def.height * (0.3 + Math.random() * 0.3), T.pos.z + Math.sin(a) * T.def.radius);
            const to = foe.p.clone().add(_v.set((Math.random() - 0.5) * 24, 0, (Math.random() - 0.5) * 24));
            this._later.push({ t: i * 0.35, fn: () => this._flyBlob(T, from, to, 'rock') });
        }
        if (this.auth) g.sync?.titan?.({ e: 'fx', k: 'debris', id: T.id, to: [r2(foe.p.x), r2(foe.p.y), r2(foe.p.z)], n });
    }

    /** Stage 3 storm: it splits — two smaller whirls tear away and circle it. */
    _split(T) {
        const g = this.game;
        if (T.minis.length) return;
        for (let i = 0; i < 2; i++) {
            const model = cloneTitan(T.model);
            const m = { model, ang: i * Math.PI, pos: T.pos.clone(), boltT: 3 + i * 2 };
            g.scene.add(model);
            T.minis.push(m);
        }
        g.sound?.playTitan?.(T.pos, 'howl', 1.6);
        g.cameraShake?.(0.4, 1.5);
    }

    // ------------------------------------------------------------------ blows on it
    targets() {
        const out = this._targ || (this._targ = []);
        out.length = 0;
        for (const T of this.active.values()) if (T.mode !== 'dying' && this.hittable(T)) out.push(T);
        return out;
    }
    byId(id) { return this.active.get(id) || null; }
    /** May a blow reach it now? (the worm only when out of the sand) */
    hittable(T) { return T.def.kit !== 'worm' || T.wm === 'up' || T.wm === 'diving' || T.wm === 'rising' || T.wm === 'breach'; }

    /**
     * A blow (host): HP by the rules — the gods' spells ×3, «Дай» a third, its own immunities, then each one's nature (heat, the shell,
     * the eye's heart, the open mouth, the shade unlit), staggered ×1.5; a blow big and fast enough staggers it. `pos` — where it struck.
     */
    hit(T, dmg, spell = null, by = null, kind = null, pos = null) {
        const g = this.game;
        if (!T || T.mode === 'dying' || !this.hittable(T)) return;
        if (!this.auth) { g.sync?.titan?.({ e: 'hit', id: T.id, dmg, spell, by, kind, pos: pos ? [r2(pos.x), r2(pos.y), r2(pos.z)] : null }); return; }
        const what = spell || kind || '';
        let d = titanDamage(spell, dmg, { god: GOD_SPELLS.has(spell), hpMax: T.def.hp });
        d *= titanResist(T.id, what);
        const k = T.def.kit;
        // the storm: the wind's spells feed it (it grows — no harm)
        if (k === 'storm' && STORM_EYE.WIND_RE.test(what)) { T.grow = Math.min(STORM_EYE.GROW_MAX, T.grow + STORM_EYE.GROW); this.hint('feed'); return; }
        if (k === 'storm' && pos && Math.hypot(pos.x - T.pos.x, pos.z - T.pos.z) < T.def.radius * T.grow * STORM_EYE.PART) { d *= STORM_EYE.HEART_MUL; this.hint('heart'); T.flashT = 0.3; }
        if (k === 'worm' && pos && T.wm === 'up') { const m = this._mouth(T, _v); if (m.distanceTo(pos) < T.def.radius * 1.4) { d *= WORM_MOUTH_MUL; this.hint('mouth'); } }
        if (k === 'iron' || k === 'fire') {
            const hb = heatBlow(T.def.look, T.heat, what);
            if (hb.mul > 1 || hb.cool > 0) {
                if (k === 'iron' && hb.mul > 1) { this.hint('quench'); g.sound?.playTitan?.(T.pos, 'crack', 1.2); this._steam(T); }
                if (k === 'fire' && hb.cool > 0) { const was = T.heat; T.heat = Math.max(0, T.heat - hb.cool); this._steam(T); g.sound?.playTitan?.(T.pos, 'quench', 1); if (was >= LAVA_CRUST && T.heat < LAVA_CRUST) this.hint('crust'); }
                else if (k === 'fire' && hb.mul > 1) { this.hint('crustBreak'); g.sound?.playTitan?.(T.pos, 'crack', 1.2); T.heat = Math.min(1, T.heat + 0.1); }
                if (k === 'iron') T.heat = Math.max(0, T.heat - hb.cool);
            }
            d *= hb.mul;
        }
        if (k === 'shade' && T.lit < 0.5) d *= 0.25;
        if (k === 'frost' && T.shell > 0) {
            const sb = shellBlow(T.shell, d, what);
            T.shell = sb.shell; d = sb.through;
            g.sound?.playTitan?.(T.pos, 'crack', 0.8);
            if (T.shell <= 0) { this.hint('shellGone'); this._sync(T, { e: 'fx', k: 'shellGone', id: T.id }); this._shellOff(T); }
        }
        if (T.stagT > 0) d *= STAGGER.MUL;
        if (!(d > 0)) { if (spell || kind) g.hud?.setVoice?.(`⚡ ${T.def.name}: это его не берёт`, true); return; }
        T.hp -= d;
        T.hurtT = 0.25;
        if (by != null) { T.foe = by; g.achievements?.hit?.('titan_' + T.id, T.id, by); }
        if (T.mode === 'peace') { T.mode = 'fight'; if (!T.act || T.act.name === PEACE[k]) { T.act = null; this._wake(T); } }
        if (T.hp <= 0) { this._dies(T, by); return; }
        // staggered by a blow big and fast
        const st = staggerAfter(T.stagLog, T.t, d, T.def.hp, T.stagCool > 0 ? Infinity : 0);
        if (st.stagger && T.mode === 'fight') this._stagger(T);
    }

    /** Staggered: the walkers fall on one knee (the action broken), the worm thrashes up, the storm sags. */
    _stagger(T) {
        const g = this.game;
        T.stagCool = STAGGER.COOL;
        T.stagT = STAGGER.T;
        g.sound?.playTitan?.(T.pos, 'death', 0.35);
        g.cameraShake?.(0.4, 1.2);
        this.hint('stagger');
        if (T.def.kit === 'worm') { if (T.wm === 'up') T.wT = Math.max(T.wT, STAGGER.T); return; }
        if (T.def.kit === 'storm') return;
        if (T.act?.end) T.act.end();
        T.act = null;
        this._act(T, 'kneel', STAGGER.T, [[0.12, () => { this._quake(T.pos, 1.2, this._players(T)); this._dust(T.pos, 40, 0x9a8a78); }]], { end: () => { T.stagT = 0; } });
    }

    hitAt(pos, radius, dmg, spell = null, by = null) {
        for (const T of this.active.values()) {
            // the shade's shadows melt at a blow
            for (const d of T.decoys) if (d.alive && Math.hypot(pos.x - d.pos.x, pos.z - d.pos.z) < radius + T.def.radius) this._decoyGone(T, d);
            if (T.mode === 'dying' || !this.hittable(T)) continue;
            const d = Math.hypot(pos.x - T.pos.x, pos.z - T.pos.z);
            const r = T.def.radius * (T.grow || 1);
            if (d < radius + r && pos.y > T.pos.y - 4 && pos.y < T.pos.y + T.def.height * (T.grow || 1) + 4) this.hit(T, dmg * Math.max(0.4, 1 - Math.max(0, d - r) / (radius + 1)), spell, by, null, pos);
            // a cold blow on the frozen-over lava lake / on the lake: it freezes over
            if (T.def.kit === 'fire' && spell && /Ice|Frozen|Water|Wave/.test(spell) && Math.hypot(pos.x - T.home.x, pos.z - T.home.z) < T.def.height * 0.45) { T.lakeFrozenT = 35; this.hint('lakeFrozen'); }
        }
    }

    /** Something cold struck the ground at `p` (an «Ice» charge…): the lava titan's lake there freezes over a while. */
    coldAt(p) {
        if (!this.auth || !p) return;
        for (const T of this.active.values()) if (T.def.kit === 'fire' && T.mode !== 'dying' && Math.hypot(p.x - T.home.x, p.z - T.home.z) < T.def.height * 0.45) { T.lakeFrozenT = 35; this.hint('lakeFrozen'); }
    }

    hitRay(o, d, len, width, dmg, spell = null, by = null) {
        for (const T of this.active.values()) {
            if (T.mode === 'dying' || !this.hittable(T)) continue;
            const c = titanCenter(T, _v2);
            _v.subVectors(c, o);
            const t = Math.max(0, Math.min(len, _v.dot(d)));
            if (_v.addScaledVector(d, -t).length() < width + T.def.radius + T.def.height * 0.3) this.hit(T, dmg, spell, by, null, o.clone().addScaledVector(d, t));
        }
    }

    boltHit(T, spell, by, front = null) { this.hit(T, TITAN_BOLT[spell] ?? 4, spell, by, null, front || null); }

    /** The worm's mouth (its head) in the world. */
    _mouth(T, out) { const R = T.model.userData.rig; return R?.head ? R.head.getWorldPosition(out) : titanCenter(T, out); }

    _steam(T) {
        const c = titanCenter(T, _v);
        for (let i = 0; i < 40; i++) this.game.fx?.spark?.(_v2.set(c.x + (Math.random() - 0.5) * T.def.radius * 2, c.y + (Math.random() - 0.5) * T.def.height * 0.5, c.z + (Math.random() - 0.5) * T.def.radius * 2), 0xf0f0f0, 2.2, _v3.set((Math.random() - 0.5) * 3, 5 + Math.random() * 5, (Math.random() - 0.5) * 3), 1.5 + Math.random());
    }
    _shellOff(T) {
        for (const b of T.model.userData.rig?.shell || []) if (b.visible) { b.getWorldPosition(_v); this._fallingBit(_v, 2.5, fxShapes().iceM); }
    }

    _dies(T, by) {
        const g = this.game;
        if (T.act?.end) T.act.end();
        T.act = null;
        T.mode = 'dying'; T.dieT = 0;
        this.state.dead.push(T.id);
        this._roar(T, 1.4);
        g.sound?.playTitan?.(T.pos, 'death', 1.6);
        g.cameraShake?.(0.8, 2.5);
        g.achievements?.killed?.('titan_' + T.id, T.id, by, T.pos);
        g.hud?.setVoice?.(`⚡ ${T.def.name} пал. Из его тела поднимается осколок силы богов и уходит к Солнцу…`, true);
        for (const d of T.decoys) if (d.alive) this._decoyGone(T, d);
        this._shard(T);
        g.godhood?.titanDied?.(T.id);
        if (g.sync) g.sync.titan?.({ e: 'dead', id: T.id });
    }

    /** The shard of the gods' power rising from the fallen titan up to the sky (a glowing crystal, a trail of sparks). */
    _shard(T) {
        const g = this.game, S = fxShapes();
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), S.shardM);
        m.position.copy(T.pos).setY(T.pos.y + T.def.height * 0.5);
        g.fx?.lightFlash?.(m.position.clone(), 0xfff0b0, 10, 3, 200);
        this._addFx({
            mesh: m, t: 0, life: 9, ownGeo: true,
            step: (f, dt) => {
                m.rotation.y += dt * 3; m.rotation.x += dt;
                m.position.y += (f.t < 2 ? 2 : 25) * dt;
                m.scale.setScalar(1 + Math.sin(f.t * 8) * 0.15);
                if (Math.random() < 0.8) g.fx?.spark?.(m.position, 0xffe8a0, 0.8, _v.set((Math.random() - 0.5) * 3, -2, (Math.random() - 0.5) * 3), 1.2);
                return false;
            },
        });
    }

    // ------------------------------------------------------------------ drawing (every computer)
    _draw(T, dt) {
        const m = T.model, def = T.def;
        T.hurtT = Math.max(0, (T.hurtT || 0) - dt);
        T.flashT = Math.max(0, (T.flashT || 0) - dt);
        T.mirrorT = Math.max(0, (T.mirrorT || 0) - dt);
        if (def.look === 'worm') return this._drawWorm(T, dt);
        if (def.look === 'storm') return this._drawStorm(T, dt);
        const R = m.userData.rig;
        if (T.mode === 'dying') {
            // it falls forward, slowly, and crumbles into the ground
            T.dieT += dt;
            const k = Math.min(1, T.dieT / 3.5);
            m.position.copy(T.pos);
            m.quaternion.setFromAxisAngle(Y_AXIS, T.yaw).multiply(_q.setFromAxisAngle(X_AXIS, -k * k * 1.45));
            m.position.y = T.pos.y - Math.max(0, T.dieT - 3) * 4;
            if (T.dieT < 6 && Math.random() < 0.9) this._dust(_v.copy(T.pos).add(_v2.set((Math.random() - 0.5) * def.radius * 3, def.height * Math.random() * 0.6, (Math.random() - 0.5) * def.radius * 3)), 3, def.look === 'lava' ? 0xff6010 : def.look === 'ice' ? 0xd8f0ff : def.look === 'shade' ? 0x1a4a50 : 0x8a867e);
            if (T.dieT > 8) this._drop(T.id);
            return;
        }
        // the pose: its action (with its weight fading in and out), else the walk
        const A = T.act;
        const pose = { ph: T.ph, k: Math.min(1, T.speed / Math.max(0.1, def.walk * 0.45)), breathe: T.t * 1.4 };
        if (A) {
            const a = Math.min(1, A.t), w = Math.min(1, a * A.dur / 0.3, (1 - a) * A.dur / 0.3 + (A.name === 'sit' || A.name === 'bathe' || A.name === 'forge' || A.name === 'guard' ? 1 : 0));
            if (A.name === 'blow') pose.blow = a;
            else if (A.name === 'stomp') pose.stomp = a;
            else { pose.act = A.name; pose.a = A.name === 'guard' ? T.t / 9 : a; pose.w = A.name === 'kneel' || A.name === 'rise' ? 1 : w; }
        } else if (def.kit === 'shade') { pose.act = T.frozenLook ? 'cover' : 'crouch'; pose.a = T.t * 0.3 % 1; pose.w = 1; }
        else if (T.mode === 'peace' && def.kit === 'rock') { pose.act = 'sit'; pose.a = 1; } // (asleep between its cycles)
        poseWalker(m, pose);
        // where it is, turned; the rock one rolling turns round its middle
        m.quaternion.setFromAxisAngle(Y_AXIS, T.yaw);
        m.position.copy(T.pos);
        if (A?.name === 'curl' && T.rollAng) {
            const c = def.height * 0.22;
            _q.setFromAxisAngle(X_AXIS, -T.rollAng);
            m.quaternion.multiply(_q);
            _v.set(0, c, 0).applyQuaternion(m.quaternion);
            m.position.set(T.pos.x - _v.x, T.pos.y + c - _v.y, T.pos.z - _v.z);
        }
        // its props: the stones left on it, the weapons stuck, the shell, the club
        if (R) {
            const fallen = def.kit === 'rock' ? rockChips(T.hp, def.hp, R.chips.length) : 0;
            if (fallen > T.chips) { for (let i = T.chips; i < fallen; i++) { const c = R.chips[i]; c.getWorldPosition(_v); c.visible = false; this._fallingBit(_v, c.userData.s * def.height * 1.1, fxShapes().rockM); } T.chips = fallen; }
            for (let i = 0; i < R.blades.length; i++) R.blades[i].visible = i < T.stuck;
            const sh = T.shell > 0 ? T.shell / (def.hp * ICE_SHELL.PART) : 0;
            for (const b of R.shell) { b.visible = sh > 0; b.scale.setScalar(0.4 + 0.6 * sh); }
            if (R.club) R.club.visible = !!T.club;
        }
        // the glow breathing; red when hurt; the heat (iron: red-hot under the Sun; lava: dark crust when cool); the shade seen in light only
        for (const mat of m.userData.glow || []) {
            if (mat.userData.base == null) mat.userData.base = mat.emissiveIntensity;
            let k = 1 + 0.15 * Math.sin(T.t * 2.2);
            if (def.look === 'lava') k *= 0.2 + 0.8 * Math.min(1, T.heat / 0.8);
            mat.emissiveIntensity = mat.userData.base * k + (T.hurtT > 0 ? 1.5 : 0) + (def.look === 'iron' && T.mirrorT > 0 ? 3 : 0);
        }
        if (def.look === 'iron') {
            const body = m.userData.glow?.[1];
            if (body) { const hot = Math.max(0, (T.heat - 0.5) / 0.5); body.emissive.setRGB(1, 0.35 + 0.3 * (1 - hot), 0.1); body.emissiveIntensity = hot * 0.9 + (T.hurtT > 0 ? 1.5 : 0); }
            if (T.heat > 0.7 && Math.random() < 0.2) this.game.fx?.spark?.(_v.set(T.pos.x + (Math.random() - 0.5) * def.radius * 2, T.pos.y + def.height * (0.3 + Math.random() * 0.6), T.pos.z + (Math.random() - 0.5) * def.radius * 2), 0xff9a40, 0.4, _v2.set(0, 3, 0), 0.8); // (heat shimmer)
        }
        if (def.look === 'shade') {
            const op = 0.12 + 0.78 * T.lit;
            m.traverse((o) => { if (o.material && o.material.transparent) o.material.opacity = op; });
            for (const d of T.decoys) {
                if (!d.alive) continue;
                poseWalker(d.model, { ph: d.ph, k: 1, breathe: T.t, act: 'crouch', a: 0, w: 1, blow: d.blowT });
                d.model.quaternion.setFromAxisAngle(Y_AXIS, d.yaw);
                d.model.position.copy(d.pos);
            }
        }
        if (def.look === 'lava' && T.heat >= LAVA_CRUST && Math.random() < 0.5) this.game.fx?.spark?.(_v.set(T.pos.x + (Math.random() - 0.5) * def.radius * 1.6, T.pos.y + def.height * (0.5 + Math.random() * 0.5), T.pos.z + (Math.random() - 0.5) * def.radius * 1.6), 0xff8a20, 0.8, _v2.set(0, 4 + Math.random() * 4, 0), 1.2);
        if (def.look === 'lava' && T.site) { const fr = T.site.getObjectByName('frozen'); if (fr) fr.material.opacity = T.lakeFrozenT > 0 ? Math.min(0.75, T.lakeFrozenT / 3) : 0; }
        if (def.look === 'ice' && Math.random() < 0.6) this.game.fx?.spark?.(_v.set(T.pos.x + (Math.random() - 0.5) * 40, T.pos.y + 3 + Math.random() * def.height, T.pos.z + (Math.random() - 0.5) * 40), 0xffffff, 0.3, _v2.set(-3 + Math.random(), -1.5, Math.random()), 2.5); // (its snowstorm)
    }

    /** The worm's rings along its body: under — a hump of sand moving; up — an arch out of the ground, the mouth open; its leap. */
    _drawWorm(T, dt) {
        const R = T.model.userData.rig, def = T.def, n = R.rings.length, thick = def.radius * 2;
        const fx = fwdX(T.yaw), fz = fwdZ(T.yaw);
        if (T.mode === 'dying') { T.dieT += dt; T.up = Math.max(0, 1 - T.dieT / 4); if (T.dieT > 6) { this._drop(T.id); return; } }
        // the sand wave over it while under (the dunes run) — dust on the surface
        if ((T.wm === 'under' || T.wm === 'rising') && Math.random() < (T.wm === 'rising' ? 1 : 0.6)) for (let i = 0; i < 3; i++) this.game.fx?.spark?.(_v.set(T.pos.x + (Math.random() - 0.5) * thick * 1.5, T.pos.y + 0.5, T.pos.z + (Math.random() - 0.5) * thick * 1.5), 0xc8885a, 1.4, _v2.set((Math.random() - 0.5) * 3, 3 + Math.random() * 4, (Math.random() - 0.5) * 3), 1.4);
        if (T.wm === 'breach' && T.breach) return this._drawBreach(T, R, thick);
        if (T.wm === 'back') {
            // its back breaking the dunes: three humps of rings rolling forward, then gone
            T.model.visible = true;
            const len = n * thick * 0.42, k = Math.sin(Math.min(1, (T.backT || 0) / 9) * Math.PI);
            for (let i = 0; i < n; i++) {
                const s = i / (n - 1), along = s * len;
                const h = (Math.sin(s * Math.PI * 3 - T.t * 2) * 0.5 + 0.2) * thick * 0.8 * k - thick * 0.6;
                R.rings[i].position.set(T.pos.x - fx * along * 0.6, T.pos.y + h, T.pos.z - fz * along * 0.6);
                R.rings[i].scale.setScalar(thick);
                if (i) { _v.subVectors(R.rings[i - 1].position, R.rings[i].position); if (_v.lengthSq() > 1e-4) R.rings[i].quaternion.setFromUnitVectors(_v2.set(0, 0, -1), _v.normalize()); }
            }
            R.head.position.copy(R.rings[0].position).y -= thick; R.head.scale.setScalar(thick);
            if (Math.random() < 0.5) this._dust(R.rings[Math.floor(Math.random() * n)].position, 3, 0xc8885a);
            return;
        }
        const up = T.up || 0;
        T.model.visible = up > 0.02 || T.wm === 'rising';
        if (!T.model.visible) return;
        const H = def.height * 0.38 * up, len = n * thick * 0.42;
        const thrash = (T.stagT || 0) > 0 ? Math.sin(T.t * 9) * 0.35 : 0;
        let headPos = null;
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1); // (0 the head … 1 the tail, deep in the ground)
            // the arch: the head high over its hole, the body curving back down into the sand behind (staggered: it thrashes)
            const along = s * len, h = H * Math.max(0, Math.cos(s * Math.PI * 0.75)) * (1 - Math.abs(thrash) * 0.5) - s * thick * 2 + Math.sin(T.t * 2 + s * 6) * thick * 0.08;
            const side = Math.sin(s * Math.PI) * thrash * len * 0.15;
            const x = T.pos.x - fx * along * 0.5 + fz * side, z = T.pos.z - fz * along * 0.5 - fx * side;
            const ring = R.rings[i];
            ring.position.set(x, T.pos.y + h - thick * 0.3, z);
            ring.scale.setScalar(thick);
            const prev = i ? R.rings[i - 1].position : null;
            if (prev) { _v.subVectors(prev, ring.position); if (_v.lengthSq() > 1e-4) ring.quaternion.setFromUnitVectors(_v2.set(0, 0, -1), _v.normalize()); }
            else { ring.quaternion.setFromEuler(_e.set(-Math.PI / 2 * up, T.yaw, 0, 'YXZ')); headPos = ring.position; }
        }
        R.head.position.copy(headPos).add(_v.set(0, thick * 0.25, 0));
        R.head.quaternion.copy(R.rings[0].quaternion);
        R.head.scale.setScalar(thick);
        const open = (T.stagT || 0) > 0 ? 0.35 : T.wm === 'up' ? 0.6 + 0.3 * Math.sin(T.t * 3) : T.wm === 'rising' ? 1 : 0.2;
        for (const p of R.petals) p.rotation.x = -open * 1.7; // (the flower of the mouth wide open: the rings of teeth seen)
        if (T.mode === 'dying') for (const r of R.rings) r.position.y -= T.dieT * 3;
    }
    /** The leap: the whole body along a high arc from `from` to `to`, the head leading, the mouth wide. */
    _drawBreach(T, R, thick) {
        const B = T.breach, n = R.rings.length, t0 = T.breachT;
        T.model.visible = true;
        const apex = 90;
        const at = (t, out) => { const tt = Math.max(0, Math.min(1, t)); out.lerpVectors(B.from, B.to, tt); out.y = B.from.y + (B.to.y - B.from.y) * tt + 4 * apex * tt * (1 - tt) - (t < 0 || t > 1 ? thick * 3 : 0); return out; };
        for (let i = 0; i < n; i++) {
            const t = t0 * 1.2 - i * 0.022;
            at(t, R.rings[i].position);
            R.rings[i].scale.setScalar(thick);
            if (i) { _v.subVectors(R.rings[i - 1].position, R.rings[i].position); if (_v.lengthSq() > 1e-4) R.rings[i].quaternion.setFromUnitVectors(_v2.set(0, 0, -1), _v.normalize()); }
            else { at(t + 0.01, _v); _v.sub(R.rings[0].position); if (_v.lengthSq() > 1e-6) R.rings[0].quaternion.setFromUnitVectors(_v2.set(0, 0, -1), _v.normalize()); }
        }
        R.head.position.copy(R.rings[0].position);
        R.head.quaternion.copy(R.rings[0].quaternion);
        R.head.scale.setScalar(thick);
        for (const p of R.petals) p.rotation.x = -1.7;
        // its shadow-mark: the dust where its body leaves the sand
        if (Math.random() < 0.6) this._dust(B.from, 4, 0xc8885a);
    }

    _drawStorm(T, dt) {
        const m = T.model, R = m.userData.rig, def = T.def;
        const sag = (T.stagT || 0) > 0 ? 0.65 : 1;
        const H = def.height * T.grow;
        m.position.copy(T.pos);
        m.scale.set(H, H * sag, H);
        const mat = m.userData.stormMat;
        mat.userData.uT.value += dt * (sag < 1 ? 0.4 : 1);
        mat.userData.uFlash.value = T.flashT > 0 ? 1 : Math.max(0, mat.userData.uFlash.value - dt * 3);
        R.funnels.forEach((f, i) => { f.rotation.y += dt * (1.2 + i * 0.5) * (i % 2 ? -1 : 1) * sag; f.position.x = Math.sin(T.t * 0.7 + i) * 0.015; });
        // the face turns to the foe (or wanders)
        const foe = T.foe != null ? this._players(T).find((q) => q.id === T.foe) : null;
        R.face.rotation.y = foe ? Math.atan2(-(foe.p.x - T.pos.x), -(foe.p.z - T.pos.z)) : T.t * 0.2;
        R.face.position.set(Math.sin(R.face.rotation.y) * -0.17, 0.68, Math.cos(R.face.rotation.y) * -0.17);
        R.mouth.scale.y = 0.7 + 0.3 * Math.sin(T.t * 3);
        // the debris it carries round
        for (let i = 0; i < 60; i++) {
            const a = T.t * (1.5 + (i % 5) * 0.3) + i * 2.4, h = ((i * 0.137 + T.t * 0.05) % 1), rr = 0.05 + 0.2 * h ** 1.4;
            _m.compose(_v.set(Math.cos(a) * rr, h, Math.sin(a) * rr), _q.setFromEuler(_e.set(a, a * 0.7, 0)), _s.setScalar(1 + (i % 3)));
            R.debris.setMatrixAt(i, _m);
        }
        R.debris.instanceMatrix.needsUpdate = true;
        // its heart in the calm eye: a slow pulse of light half way up (brighter when struck)
        if (!T.heartMesh) { T.heartMesh = new THREE.Mesh(fxShapes().ball, fxShapes().heartM); this.game.scene.add(T.heartMesh); }
        T.heartMesh.position.set(T.pos.x, T.pos.y + H * 0.45 * sag, T.pos.z);
        T.heartMesh.scale.setScalar(def.radius * T.grow * 0.12 * (1 + 0.15 * Math.sin(T.t * 3)) * (T.flashT > 0 ? 1.5 : 1));
        for (const mm of T.minis) { mm.model.position.copy(mm.pos); mm.model.scale.setScalar(H * 0.45); mm.model.rotation.y += dt * 2; }
        if (T.mode === 'dying') {
            T.dieT += dt;
            const k = Math.max(0, 1 - T.dieT / 5);
            m.scale.set(H * (1 + T.dieT * 0.2), H * k, H * (1 + T.dieT * 0.2));
            for (const mm of T.minis) mm.model.scale.setScalar(H * 0.45 * k);
            T.heartMesh.visible = false;
            if (T.dieT > 5.5) this._drop(T.id);
        }
    }

    _dust(p, n, col) {
        const fx = this.game.fx;
        if (!fx?.spark) return;
        for (let i = 0; i < n; i++) fx.spark(_v4.set(p.x + (Math.random() - 0.5) * 6, p.y + Math.random() * 6, p.z + (Math.random() - 0.5) * 6), col, 1.6, _v3.set((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4), 1.5 + Math.random());
    }

    // ------------------------------------------------------------------ effects
    _addFx(f) { this.game.scene.add(f.mesh); this.fxList.push(f); if (this.fxList.length > 80) this._endFx(this.fxList.shift()); }
    _endFx(f) {
        const sc = this.game.scene;
        sc.remove(f.mesh);
        for (const m of f.extra || []) sc.remove(m);
        if (f.ownGeo) f.mesh.geometry?.dispose?.();
    }
    _stepFx(dt) {
        for (let i = this.fxList.length - 1; i >= 0; i--) {
            const f = this.fxList[i];
            f.t += dt;
            if (f.step(f, dt) || f.t > f.life) { this._endFx(f); this.fxList.splice(i, 1); }
        }
    }

    // ------------------------------------------------------------------ the network
    _sync(T, m) { if (this.auth) this.game.sync?.titan?.(m); }
    _netSend(dt) {
        const g = this.game;
        if (!g.sync || !this.active.size) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.12;
        const s = [];
        for (const T of this.active.values()) s.push([T.id, r2(T.pos.x), r2(T.pos.y), r2(T.pos.z), r2(T.yaw), T.mode, Math.round(T.hp), r2(T.speed), T.act?.name || null, r2(T.act?.t || 0), r2(T.act?.dur || 1), T.wm, r2(T.up || 0), T.foe, r2(T.lit || 0), {
            st: T.stage, h: r2(T.heat), sh: Math.round(T.shell), c: T.club ? 1 : 0, k: T.stuck, ra: r2(T.rollAng || 0), sg: r2(T.stagT || 0), fl: T.frozenLook ? 1 : 0, gr: r2(T.grow), lf: r2(T.lakeFrozenT),
            d: T.decoys.filter((d) => d.alive).map((d) => [r2(d.pos.x), r2(d.pos.y), r2(d.pos.z), r2(d.yaw), r2(d.blowT)]), mi: T.minis.length, bt: r2(T.breachT || 0),
        }]);
        g.sync.titan?.({ e: 'st', s });
    }

    _follow(T, dt) {
        T.t += dt;
        const S = this._net?.get(T.id);
        if (!S) return;
        const k = Math.min(1, dt * 8);
        T.pos.x += (S[1] - T.pos.x) * k; T.pos.y += (S[2] - T.pos.y) * k; T.pos.z += (S[3] - T.pos.z) * k;
        T.yaw += angDiff(T.yaw, S[4]) * k;
        if (S[5] === 'dying' && T.mode !== 'dying') { T.mode = 'dying'; T.dieT = 0; this._shard(T); }
        else if (S[5] !== 'dying') T.mode = S[5];
        T.hp = S[6]; T.speed = S[7];
        // its action: the name and where in it (advanced here between two states)
        if (S[8]) { if (!T.act || T.act.name !== S[8]) T.act = { name: S[8], t: S[9], dur: S[10], ev: [] }; else T.act.t = Math.max(T.act.t, S[9]); T.act.t = Math.min(1, T.act.t + dt / T.act.dur); }
        else T.act = null;
        T.wm = S[11]; T.up = S[12]; T.foe = S[13]; T.lit = S[14];
        const x = S[15] || {};
        T.stage = x.st || 1; T.heat = x.h ?? T.heat; T.shell = x.sh || 0; T.club = !!x.c; T.stuck = x.k || 0; T.rollAng = x.ra || 0; T.stagT = x.sg || 0; T.frozenLook = !!x.fl; T.grow = x.gr || 1; T.lakeFrozenT = x.lf || 0; T.breachT = x.bt || 0;
        // the shade's shadows (as many as the host has)
        const ds = x.d || [];
        while (T.decoys.length < ds.length) { const model = cloneTitan(T.model); model.scale.copy(T.model.scale); this.game.scene.add(model); T.decoys.push({ model, pos: new THREE.Vector3(), yaw: 0, ph: 0, blowT: 0, alive: true, gone: 0 }); }
        while (T.decoys.length > ds.length) { const d = T.decoys.pop(); this._dust(d.pos, 40, 0x1a4a50); this.game.scene.remove(d.model); }
        ds.forEach((r, i) => { const d = T.decoys[i]; d.pos.set(r[0], r[1], r[2]); d.yaw = r[3]; d.blowT = r[4]; d.ph += dt * 2; });
        if ((x.mi || 0) > T.minis.length) this._split(T);
        for (const m of T.minis) { m.ang = (m.ang || 0) + dt * 0.25; m.pos.set(T.pos.x + Math.cos(m.ang) * 120, this.ground(T.pos.x + Math.cos(m.ang) * 120, T.pos.z + Math.sin(m.ang) * 120), T.pos.z + Math.sin(m.ang) * 120); }
        if (T.def.kit !== 'worm' && T.def.kit !== 'storm') T.ph += (T.speed / T.def.walk) * Math.PI / TITAN.STEP_T * dt;
        T.backT = T.wm === 'back' ? (T.backT || 0) + dt : 0;
    }

    /** A `titan` message (NetSync). */
    onNet(m, from) {
        const g = this.game, T = this.active.get(m.id);
        if (m.e === 'st') { this._net = new Map((m.s || []).map((r) => [r[0], r])); return; }
        if (m.e === 'hurt') { if (m.to === g.localId) this._hurtMe(T || { def: TITANS[m.id] }, m.dmg, m.kind, m.push ? new THREE.Vector3(...m.push) : null, m.msg); return; }
        if (m.e === 'magnet') { if (m.to === g.localId && T && this._magnetMe(T)) g.sync?.titan?.({ e: 'stuck', id: m.id }); return; }
        if (m.e === 'dead') { if (!this.state.dead.includes(m.id)) this.state.dead.push(m.id); g.godhood?.titanDied?.(m.id); return; }
        if (!this.auth) {
            // the effects the host made: shown here the same (no damage — the host told us that apart)
            if (!T) return;
            if (m.e === 'step') this._quake(_v.set(...m.p), 1, []);
            else if (m.e === 'slam') { g.fx?.explosion?.(new THREE.Vector3(...m.p), 4, 1.5); this._quake(_v.set(...m.p), 1.4, []); }
            else if (m.e === 'throw') { const f = new THREE.Vector3(...m.f), to = new THREE.Vector3(...m.to); for (let i = 0; i < (m.n || 1); i++) this._flyBlob(T, f, to.clone().add(_v.set((Math.random() - 0.5) * 14 * i, 0, (Math.random() - 0.5) * 14 * i)), m.w); }
            else if (m.e === 'spikes') this._spikes(T, { p: new THREE.Vector3(...m.p) }, m.w);
            else if (m.e === 'ray') this._sunRay(T, { p: new THREE.Vector3(...m.to).setY(m.to[1] - 1.6) });
            else if (m.e === 'dark') this._darkWave(T);
            else if (m.e === 'bolt') this._bolt(T, new THREE.Vector3(...m.p));
            else if (m.e === 'act') { T.act = { name: m.n, t: 0, dur: m.d, ev: [] }; this._actSound(T, m.n); }
            else if (m.e === 'fx') this._fxNet(T, m);
            return;
        }
        if (m.e === 'hit' && T) this.hit(T, m.dmg, m.spell, m.by ?? from, m.kind, m.pos ? new THREE.Vector3(...m.pos) : null);
        if (m.e === 'look' && T) this._looks.set(from, { on: !!m.on, lit: !!m.lit, dot: m.dot || 0, t: T.t });
        if (m.e === 'stuck' && T) T.stuck = Math.min(4, T.stuck + 1);
    }
    /** The host's effects of the specials, replayed here. */
    _fxNet(T, m) {
        const p = m.p ? new THREE.Vector3(...m.p) : null;
        if (m.k === 'ring') this._shockRing(T, p, m.r, 0, m.kind);
        else if (m.k === 'line') this._line(T, p, m.y, m.l, m.w);
        else if (m.k === 'rain') this._rain(T, m.pts || []);
        else if (m.k === 'breath') this._breath(T, null);
        else if (m.k === 'mark') this._marker(p, m.r, m.c, m.l);
        else if (m.k === 'debris') { const to = new THREE.Vector3(...m.to); for (let i = 0; i < m.n; i++) { const a = Math.random() * 6.28; this._flyBlob(T, new THREE.Vector3(T.pos.x + Math.cos(a) * T.def.radius, T.pos.y + T.def.height * 0.4, T.pos.z + Math.sin(a) * T.def.radius), to.clone().add(_v.set((Math.random() - 0.5) * 24, 0, (Math.random() - 0.5) * 24)), 'rock'); } }
        else if (m.k === 'breach') { T.wm = 'breach'; T.breachT = 0; T.breach = { from: new THREE.Vector3(...m.f), to: new THREE.Vector3(...m.to), hit: true }; this._marker(T.breach.to, T.def.radius * 2, 0xff9050, 3); }
        else if (m.k === 'shellGone') this._shellOff(T);
        else if (m.k === 'shell') this.game.sound?.playTitan?.(T.pos, 'frost', 1.6);
    }
    _actSound(T, n) {
        const s = this.game.sound;
        if (n === 'rise') s?.playTitan?.(T.pos, 'rise', 1.6);
        else if (n === 'roar') s?.playTitan?.(T.pos, 'roar', 1.2);
        else if (n === 'blow' || n === 'stomp' || n === 'thrust') s?.playTitan?.(T.pos, 'windup', 1);
    }

    // ------------------------------------------------------------------ the save
    snapshot() { return { dead: [...this.state.dead], dents: { ...this.state.dents }, cages: this.state.cages.map((c) => ({ blocks: c.blocks })) }; }
    restore(s) {
        if (!s) return;
        for (const id of [...this.active.keys()]) this._drop(id);
        this.state = { dead: (s.dead || []).filter((id) => TITANS[id]), dents: { ...(s.dents || {}) }, cages: [] };
        // an ice cage saved in the middle: it melts as soon as the land is there (never left standing for ever)
        for (const c of s.cages || []) { const cage = { blocks: c.blocks || [] }; this.state.cages.push(cage); this._later.push({ t: 3, fn: () => this._melt(cage) }); }
    }
    dispose() { this._barUi?.dispose(); for (const id of [...this.active.keys()]) this._drop(id); for (const f of this.fxList) this._endFx(f); this.fxList.length = 0; this._later.length = 0; }

    /** Shapes and materials to compile when a titan's planet is reached (Titans.warm). */
    static samplesFx() {
        const S = fxShapes();
        return [new THREE.Mesh(S.ball, S.fireM), new THREE.Mesh(S.rough, S.rockM), new THREE.Mesh(S.spike, S.iceM), new THREE.Mesh(S.spike, S.stoneM), new THREE.Mesh(S.cyl, S.rayM), new THREE.Mesh(S.ball, S.darkM), new THREE.Mesh(S.ring, S.markM), new THREE.Mesh(S.cone, S.frostM), new THREE.Mesh(S.ball, S.heartM), new THREE.Mesh(S.cyl, S.ironM)];
    }
    static samples() { return [...titanSamples(), ...Titans.samplesFx()]; }
}

/** A charge's target capsule (Duel._bodies): from the feet to the head (the worm — its raised head; the storm — its heart). */
export function titanBody(T, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const p = T.pos, def = T.def;
    if (def.look === 'worm') { out.r = def.radius; out.a.set(p.x, p.y, p.z); out.b.set(p.x, p.y + def.height * 0.38 * (T.up || 0), p.z); return out; }
    const g = T.grow || 1;
    out.r = def.radius * g;
    out.a.set(p.x, p.y + out.r, p.z);
    out.b.set(p.x, p.y + def.height * g * (def.flies ? 0.8 : 0.85), p.z);
    return out;
}
export function titanCenter(T, out = new THREE.Vector3()) { return out.set(T.pos.x, T.pos.y + (T.def.look === 'worm' ? T.def.height * 0.3 * (T.up || 0) : T.def.height * (T.grow || 1) * 0.55), T.pos.z); }

// pushes and gusts (CreatureImpact): a titan does not fall and is not thrown — a mountain does not reel
registerKind('W', {
    name: 'titan', faces: -1,
    list: (g) => g.titans?.list || [],
    get: (g, id) => g.titans?.byId(id),
    alive: (c) => c.mode !== 'dying' && (c.def.kit !== 'worm' || c.wm === 'up'),
    body: () => 'titan',
    centre: (c, out) => titanCenter(c, out),
    pivot: () => ({ obj: null, base: 0, lie: 0 }),
    head: () => null, arms: () => [], legs: () => [],
    move() {},
    toss() {},
    hold() {},
    frozen: () => false,
    noKnock: () => true,
    struck(g, c, o) { if (o.by != null) c.foe = o.by; },
});
