/**
 * CircleAttack.js — «Circle Attack» («Сёркл Аттак») and «Circle Attack Maxima».
 *
 * The author: arms spread wide in a T (as for «Protection Maxima») and the words. A great
 * wave runs out all round the wizard: a golden ball of light grows from him and pushes
 * everyone away, rays of light strike 3–5 creatures, and the ground under the ball breaks
 * and heaves — band after band, like an earthquake, the houses fall — as the ball goes, not
 * all at once: all of it in 7 seconds. Who is close gets it at once, who is far has a couple
 * of seconds to hide. Only a little island round the wizard stays whole: him it never touches.
 *
 *   - near (the first third of the circle): −30, the middle: −20, the far third: −10;
 *     everyone it reaches is thrown off the feet and flies away — the closer, the further;
 *   - the rays: 3–5 random creatures (or players) in the circle, −10 more each;
 *   - «Circle Attack»: 30 m; a mana maximum of 100, 80 mana (as «Total Destruction»);
 *   - «Circle Attack Maxima» (the author left it to us — much stronger): 45 m, −45/−30/−15,
 *     5–8 rays of −15, they fly half as far again; a mana maximum of 200, 160 mana;
 *   - the music: a choir of light swells while the ball grows (SoundManager.playCircleAttack).
 *
 * Who / what it touches (CLAUDE.md «на кого и на что» — CIRCLE_TARGETS below).
 * Network: the caster sends the place and the rays ('circ'); every computer runs the same
 * wave and brings down the same blocks; the host hurts and throws the creatures, each
 * computer its own player.
 */

import * as THREE from 'three';
import { eachBody, hitBody, throwBody, ruinBand } from './MagicWave.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

export const CIRCLE = {
    NAME: 'CircleAttack',
    MIN_MAX_MANA: 100,
    COST: 80, // (as «Total Destruction» — the author)
    RADIUS: 30, // m
    ISLAND: 3, // m: the wizard's island — nothing happens there
    ZONES: [30, 20, 10], // harm: near / middle / far third of the circle
    RAYS: [3, 5], RAY_DMG: 10,
    FLY: 1,
    FRONT_T: 6, // s the ball takes to reach the edge
    TIME: 7, // s all of it
    BAND: 2, // m: the ground comes down in bands this wide (one a frame: a thin band — a light frame)
    MAXIMA: { NAME: 'CircleAttackMaxima', MIN_MAX_MANA: 200, COST: 160, RADIUS: 45, ISLAND: 4, ZONES: [45, 30, 15], RAYS: [5, 8], RAY_DMG: 15, FLY: 1.5 },
};

/** Who and what it touches — and how (CLAUDE.md). «Не действует» is written too, with why. */
export const CIRCLE_TARGETS = {
    me: 'волшебник стоит на своём островке — волна его не трогает никогда',
    players: 'другие игроки: −30/−20/−10 по зоне (Максима −45/−30/−15), сбивает с ног и отбрасывает (ближе — дальше); щит «Protection» — половина урона, купол «Protection Maxima» — четверть; каждый компьютер решает за своего игрока',
    zombies: 'урон по зоне, сбивает с ног и отбрасывает',
    castlePeople: 'жители, рыцари, король, волшебники: урон по зоне, отбрасывает; люди пугаются и прячутся (castleLife.alarm «circle»)',
    animals: 'урон по зоне, отбрасывает',
    sailors: 'моряки (ships.crew): урон по зоне, отбрасывает — на палубе и за борт',
    spider: 'гигантский паук: урон по зоне; слишком тяжёлый, чтобы улететь',
    dragons: 'урон по зоне (как взрыв); великан только качается',
    phoenixes: 'урон по зоне (свет и удар — не огонь), отбрасывает',
    livingTrees: 'ожившее дерево: урон по зоне и отбрасывает — такое мощное заклинание ломает и живое дерево (не только огонь)',
    bookBirds: 'книги-птицы сбивает на землю',
    rays: 'лучи света: 3–5 случайных существ или игроков в круге, −10 каждому (Максима 5–8 по −15)',
    ground: 'земля рушится и вздымается кольцами вслед за шаром (как землетрясение), дома и замки обрушаются',
    houseSphere: 'сфера «Protection House» держит: что внутри — цело (ломают её только четыре заклинания и «Inspirius»)',
    ships: 'корабль в круге получает удар волны (как от взрыва)',
    items: 'вещи на земле подбрасывает',
    water: 'вода не рушится; берег держит воду',
};

/** The numbers of one form. */
export function circleForm(max) {
    const M = CIRCLE.MAXIMA;
    return max
        ? { name: M.NAME, label: 'Circle Attack Maxima', minMax: M.MIN_MAX_MANA, R: M.RADIUS, island: M.ISLAND, zones: M.ZONES, rays: M.RAYS, rayDmg: M.RAY_DMG, fly: M.FLY }
        : { name: CIRCLE.NAME, label: 'Circle Attack', minMax: CIRCLE.MIN_MAX_MANA, R: CIRCLE.RADIUS, island: CIRCLE.ISLAND, zones: CIRCLE.ZONES, rays: CIRCLE.RAYS, rayDmg: CIRCLE.RAY_DMG, fly: CIRCLE.FLY };
}

/** How far the wave has gone at `t` s (fast near the wizard, then slower: the far ones have time to hide). */
export function circleFront(t, R) {
    return R * Math.pow(Math.min(1, Math.max(0, t) / CIRCLE.FRONT_T), 0.6);
}

/** The harm at distance `d` (0: the island, or out of the circle). */
export function circleDamage(d, f) {
    if (d > f.R + 1) return 0; // (the island keeps only the wizard: whoever stands on it by him is struck at once)
    return d <= f.R / 3 ? f.zones[0] : d <= 2 * f.R / 3 ? f.zones[1] : f.zones[2];
}

/** How hard it throws at distance `d`: the closer, the further one flies. */
export function circleThrow(d, f) {
    const k = Math.max(0, 1 - d / f.R);
    return { speed: (6 + 24 * k) * f.fly, toss: (4 + 12 * k) * f.fly }; // (a knight in armour flies too — it is heavier, CreatureImpact)
}

/** Why it can't be cast now (null: it can): 'max' — the mana maximum is too small, 'mana' — not enough mana. */
export function circleBlock({ enabled, max, mana }, f) {
    if (!enabled) return null; // (Creative: no mana rules)
    if ((max || 30) < f.minMax) return 'max';
    if ((mana ?? 0) < (f.name === CIRCLE.NAME ? CIRCLE.COST : CIRCLE.MAXIMA.COST)) return 'mana';
    return null;
}

const GOLD = 0xffd447;
const DUST = [0x9a8f80, 0x8a7d6c, 0xa89c8a, 0x7b7064];
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

const SHELL_VS = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vP = position;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SHELL_FS = `
uniform float uT; uniform float uA; uniform vec3 uC;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    // the light runs over the ball in bands (the magic pouring out of it)
    float a = atan(vP.z, vP.x);
    float rays = pow(abs(sin(a * 9.0 + uT * 1.7)), 18.0) * 0.6 + pow(abs(sin(a * 5.0 - uT * 1.1 + vP.y * 3.0)), 30.0) * 0.5;
    float bands = 0.5 + 0.5 * sin(vP.y * 14.0 - uT * 6.0);
    float k = rim * (0.75 + 0.25 * bands) + rays * (0.25 + rim);
    gl_FragColor = vec4(uC * (0.6 + 0.8 * k), k * uA);
}`;

export class CircleAttack {
    constructor(game) {
        this.game = game;
        this.list = []; // waves going on (mine and others')
    }

    /** Is one of mine still going (one at a time)? */
    get busy() { return this.list.some((d) => d.mine); }

    /**
     * The words heard: arms spread in a T.
     * @returns {string|null} the spell name when cast
     */
    cast(isFinal, name = CIRCLE.NAME) {
        const g = this.game, ch = g.character;
        const max = name === CIRCLE.MAXIMA.NAME, f = circleForm(max);
        const hint = (t) => { if (isFinal) g.hud?.setVoice(t, true); return null; };
        if (this.busy) return null;
        if (!max && !isFinal) return null; // (wait: maybe «…Максима»)
        const c = g.combat;
        const why = circleBlock({ enabled: !!c?.enabled, max: c?.maxFatigue, mana: c?.fatigue }, f);
        if (why === 'max') return hint(`🔷 «${f.label}» подвластно только сильным магам: нужен <b>максимум маны ${f.minMax}</b> (у вас ${Math.floor(c.maxFatigue || 30)})`);
        if (!ch.isTPose?.()) return hint(`✋ Разведите руки в стороны, <b>как буква T</b> (как для «Protection Maxima»), и скажите «${f.label}»`);
        const tired = c?.check(f.name);
        if (tired) { g.hud?.setVoice(tired, true); return null; }
        c?.pay(f.name);
        const me = ch.group.position;
        const p = new THREE.Vector3(me.x, me.y - PLAYER_GROUND_OFFSET, me.z);
        const rays = this._pickRays(p, f);
        this.start(p, g.localId, true, max, rays);
        g.sync?.circleAttack?.(p, max, rays);
        g.hud?.setVoice(`🌟 <b>${f.label}!</b> Волна идёт кругом — вы на своём островке`, true);
        return f.name;
    }

    /** 3–5 (Maxima 5–8) random creatures or players in the circle: the rays strike them. */
    _pickRays(p, f) {
        const g = this.game, all = [];
        const inCircle = (q) => { const d = Math.hypot(q.x - p.x, q.z - p.z); return d >= f.island && d <= f.R && Math.abs(q.y - p.y) < 25; };
        eachBody(g, (kind, c, q) => { if (inCircle(q)) all.push({ p: [q.x, q.y + 0.3, q.z].map((v) => Math.round(v * 100) / 100) }); });
        for (const [id, r] of g.remotes || []) if (r.position && inCircle(r.position)) all.push({ pl: id });
        for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
        const n = f.rays[0] + Math.floor(Math.random() * (f.rays[1] - f.rays[0] + 1));
        return all.slice(0, n).map((r, i) => ({ ...r, t: Math.round((0.3 + 1.2 * i / Math.max(1, n - 1) + Math.random() * 0.15) * 100) / 100 }));
    }

    /** It begins at `p` (the wizard's feet): my cast, or another player's from the network. */
    start(p, by, mine = false, max = false, rays = []) {
        const g = this.game;
        const f = circleForm(max);
        const d = { p: p.clone(), c: p.clone(), by, mine, max, f, t: 0, front: 0, band: f.island, hit: new Set(), meDone: false, shipT: false, rays: (rays || []).map((r) => ({ ...r, done: false })), harmT: 0 };
        this._build(d);
        this.list.push(d);
        const me = g.character?.group.position;
        g.sound?.playCircleAttack?.(d.p, me, max);
        g.fx?.lightFlash?.(_v.copy(d.p).setY(d.p.y + 1.6), GOLD, 16, 0.9, 90);
        if (g.authority) g.castleLife?.alarm(d.p, 'circle', by, f.R); // (the people near flee and hide)
        return d;
    }

    update(dt) {
        this._warmT = (this._warmT || 0) + dt;
        if (!this._warmed && this._warmT > 2) this._warm();
        else if (this._warmed && !this._soundReady && this._warmT > 4) this._soundReady = this.game.sound?.prepareCircleAttack?.() ?? true; // (its music made early, a few ms a frame)
        if (!this.list.length) return;
        dt = Math.min(dt, 0.05);
        for (const d of [...this.list]) {
            d.t += dt;
            d.front = circleFront(d.t, d.f.R);
            this._follow(d);
            this._ground(d);
            this._harm(d, dt);
            this._rays(d);
            this._look(d, dt);
            if (d.t > CIRCLE.TIME + 0.8) this._end(d);
        }
    }

    /**
     * The ball, the rays and the island stay with the wizard: if he walks, they go with him (d.c);
     * nothing can push him off his island while it lasts (holdsMe — BodyImpact). Only the ground
     * breaks round the place where it began (d.p: the same blocks on every computer).
     */
    _follow(d) {
        const g = this.game;
        const at = d.by === g.localId ? g.character?.group.position : g.remotes?.get(d.by)?.position;
        if (at) d.c.set(at.x, at.y - PLAYER_GROUND_OFFSET, at.z);
        if (d.look) d.look.grp.position.copy(d.c);
        if (d.mine) g.knockback?.set(0, 0, 0); // (no blast moves him either)
    }

    /** Is a wave of mine going on (then nothing pushes me: I stand on my island)? */
    holdsMe() { return this.list.some((d) => d.mine); }

    // ------------------------------------------------------------------- the ground
    /** The ground comes down band after band behind the ball (one band a frame at most). */
    _ground(d) {
        const R = d.f.R;
        if (d.band >= R || d.front < Math.min(R, d.band + CIRCLE.BAND)) return;
        const r1 = Math.min(R, d.band + CIRCLE.BAND);
        ruinBand(this.game, d.p, d.band, r1, R, d.by, 'circle');
        d.band = r1;
    }

    // ------------------------------------------------------------------- the harm
    _harm(d, dt) {
        const g = this.game, p = d.c, f = d.f, front = d.front; // (round the wizard where he is now)
        // me: every computer its own player (the wizard himself: never — he stands on his island)
        if (!d.meDone && d.by !== g.localId && g.character) {
            const me = g.character.group.position;
            const dist = Math.hypot(me.x - p.x, me.z - p.z);
            if (dist > f.R + 1 || Math.abs(me.y - PLAYER_GROUND_OFFSET - p.y) > 25) { if (front >= f.R) d.meDone = true; }
            else if (dist < f.island) d.meDone = front >= f.island; // (on the island too: safe)
            else if (dist <= front) { d.meDone = true; this._hurtMe(d, dist, me); }
        }
        if (!g.authority) return;
        d.harmT -= dt;
        if (d.harmT > 0 && front < f.R) return;
        d.harmT = 0.05;
        eachBody(g, (kind, c, q) => {
            if (d.hit.has(c)) return;
            const dist = Math.hypot(q.x - p.x, q.z - p.z);
            if (dist > front || dist > f.R + 1 || Math.abs(q.y - p.y) > 25) return;
            d.hit.add(c);
            if (g.wards?.shields(_a.set(p.x, p.y + 1, p.z), q)) return; // (in a house's sphere of protection)
            const dir = new THREE.Vector3(q.x - p.x, 0, q.z - p.z);
            if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
            dir.normalize();
            // thrown first (a body killed by the blow would no longer fly), then hurt
            const th = circleThrow(dist, f);
            throwBody(g, kind, c, dir.clone().multiplyScalar(th.speed), th.toss, f.name, d.by, p);
            hitBody(g, kind, c, q, circleDamage(dist, f), dir, f.name, d.by, f.name);
        });
        // a ship in the circle takes the wave's blow; the weapons lying there jump
        if (!d.shipT && front >= f.R * 0.5) { d.shipT = true; g.ships?.blast?.(p, f.R, d.max ? 3 : 2, d.by); g.houses?.hitAt?.(p, f.R); }
        for (const w of g.weapons?.weapons || []) {
            if (w.holder || w._circle === d) continue;
            const dist = Math.hypot(w.position.x - p.x, w.position.z - p.z);
            if (dist > front || dist > f.R + 2) continue;
            w._circle = d;
            w.hover = null;
            w.wake?.();
            if (!w.remoteTarget) w.velocity.add(_b.set(w.position.x - p.x, 0, w.position.z - p.z).normalize().multiplyScalar(6).setY(5 + Math.random() * 4));
        }
    }

    /** The wave reached me: thrown off my feet, away from the wizard, and hurt. */
    _hurtMe(d, dist, me) {
        const g = this.game, f = d.f;
        if (g.isDeadLocal) return;
        if (g.wards?.shields(_a.set(d.c.x, d.c.y + 1, d.c.z), me)) return; // (inside a house's sphere)
        const th = circleThrow(dist, f);
        if (!g.flight?.active) {
            _v.set(me.x - d.c.x, 0, me.z - d.c.z);
            if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1);
            g.impact?.apply({ v: _v.normalize().multiplyScalar(th.speed), from: d.c.clone(), by: d.by, spell: f.name, always: { down: 3 }, toss: th.toss, jolt: 3, down: 3 });
        }
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 1.6);
        this._damageMe(circleDamage(dist, f), d);
    }

    _damageMe(dmg, d) {
        const g = this.game, c = g.combat, s = c?.shield;
        if (s && s.left > 0) dmg *= s.type === 2 ? 0.25 : 0.5; // (a «Protection» shield takes part of it; the dome more)
        dmg = Math.round(dmg);
        if (dmg <= 0) return;
        if (c?.enabled) c.damage(dmg, d.by === g.localId ? null : d.by, d.f.name);
        else g.damageLocalPlayer?.(dmg);
    }

    // ------------------------------------------------------------------- the rays
    _rays(d) {
        const g = this.game;
        for (const r of d.rays) {
            if (r.done || d.t < r.t) continue;
            r.done = true;
            let end = null;
            if (r.pl) {
                if (r.pl === g.localId) end = _b.copy(g.character.group.position);
                else { const rem = g.remotes?.get(r.pl); if (rem?.position) end = _b.copy(rem.position); }
            } else if (r.p) end = _b.set(r.p[0], r.p[1], r.p[2]);
            if (!end) continue;
            const from = _a.copy(d.c).setY(d.c.y + 1.5);
            if (g.fx?.straightBeam) {
                g.fx.straightBeam(from, end, 0.09, 0xfff6c0, 1, 0.55, null, THREE.AdditiveBlending);
                g.fx.straightBeam(from, end, 0.45, GOLD, 0.35, 0.7, null, THREE.AdditiveBlending);
            }
            g.fx?.lightFlash?.(end, GOLD, 6, 0.35, 20);
            for (let i = 0; i < 14; i++) g.fx?.spark?.(_v.copy(end), i % 2 ? GOLD : 0xffffff, 0.12 + Math.random() * 0.15, new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 6, (Math.random() - 0.5) * 6), 0.6);
            // the harm: my own player — here; a creature — the host
            if (r.pl === g.localId && d.by !== g.localId && !g.isDeadLocal) this._damageMe(d.f.rayDmg, d);
            if (!r.pl && g.authority) {
                let best = null, bd = 3;
                eachBody(g, (kind, c, q) => { const dd = q.distanceTo(end); if (dd < bd) { bd = dd; best = { kind, c, q: q.clone() }; } });
                if (best) hitBody(g, best.kind, best.c, best.q, d.f.rayDmg, _v.subVectors(best.q, d.c).setY(0).normalize(), d.f.name, d.by, null);
            }
        }
    }

    // ------------------------------------------------------------------- the look
    /** Its look built once early, off screen, its shaders compiled then (not on the first cast); kept. */
    _warm() {
        const g = this.game;
        this._warmed = true;
        if (!g.renderer?.compile || !g.camera || !g.scene) return;
        const scene = g.scene, tmp = new THREE.Scene();
        tmp.fog = scene.fog; // (the same programs as in the world: with its fog)
        try {
            g.scene = tmp;
            this._build({ p: new THREE.Vector3(), f: circleForm(true), max: true });
            g.renderer.compile(tmp, g.camera);
        } catch (e) { /* (only a head start) */ } finally { g.scene = scene; }
        this._warmKeep = tmp;
    }

    _build(d) {
        const g = this.game;
        if (!g.scene) return;
        const grp = new THREE.Group();
        grp.position.copy(d.p);
        // the golden ball of light that grows from the wizard
        const shellMat = new THREE.ShaderMaterial({
            vertexShader: SHELL_VS, fragmentShader: SHELL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            uniforms: { uT: { value: 0 }, uA: { value: 1 }, uC: { value: new THREE.Color(GOLD) } },
        });
        const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), shellMat);
        shell.scale.setScalar(0.5);
        grp.add(shell);
        // its foot on the ground: a burning golden ring that runs out with it
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 128), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.25;
        grp.add(ring);
        // the island: a disc of light under the wizard and a thin shimmering dome over him
        const islandMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const island = new THREE.Mesh(new THREE.CircleGeometry(d.f.island, 48), islandMat);
        island.rotation.x = -Math.PI / 2;
        island.position.y = 0.08;
        grp.add(island);
        const domeMat = new THREE.ShaderMaterial({
            vertexShader: SHELL_VS, fragmentShader: SHELL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            uniforms: { uT: { value: 0 }, uA: { value: 0.7 }, uC: { value: new THREE.Color(0xfff0c0) } },
        });
        const dome = new THREE.Mesh(new THREE.SphereGeometry(d.f.island, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
        grp.add(dome);
        // the rays of light pouring out of him all round
        const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff3b8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
        const beams = new THREE.Group();
        beams.position.y = 1.5;
        const n = d.max ? 24 : 16;
        for (let i = 0; i < n; i++) {
            const geo = new THREE.CylinderGeometry(0.02, 0.18 + Math.random() * 0.2, 1, 6, 1, true);
            geo.translate(0, 0.5, 0);
            const m = new THREE.Mesh(geo, beamMat);
            m.rotation.z = -Math.PI / 2 + (Math.random() - 0.3) * 0.7; // (out and a little up or down)
            const piv = new THREE.Group();
            piv.rotation.y = (i / n) * Math.PI * 2 + Math.random() * 0.2;
            piv.add(m);
            beams.add(piv);
            m.userData.w = 0.7 + Math.random() * 0.6;
        }
        grp.add(beams);
        g.scene.add(grp);
        d.look = { grp, shell, shellMat, ring, ringMat, island, islandMat, dome, domeMat, beams, beamMat }; // (its light: the game's one flash light — a new light makes every material rebuild)
    }

    _look(d, dt) {
        const g = this.game, L = d.look, fx = g.fx;
        const k = Math.min(1, d.t / CIRCLE.TIME);
        const fade = d.t < CIRCLE.TIME - 1.2 ? 1 : Math.max(0, (CIRCLE.TIME + 0.6 - d.t) / 1.8);
        const r = Math.max(0.5, d.front);
        if (L) {
            L.shell.scale.setScalar(r);
            L.shellMat.uniforms.uT.value = d.t;
            L.shellMat.uniforms.uA.value = (0.55 + 0.45 * (1 - k)) * fade;
            L.ring.scale.setScalar(r);
            L.ringMat.opacity = 0.9 * fade;
            L.domeMat.uniforms.uT.value = d.t * 1.5;
            L.domeMat.uniforms.uA.value = 0.75 * fade;
            L.islandMat.opacity = (0.35 + 0.15 * Math.sin(d.t * 7)) * fade;
            L.beams.rotation.y += dt * 0.35;
            L.beamMat.opacity = 0.55 * fade * (0.8 + 0.2 * Math.sin(d.t * 11));
            for (const piv of L.beams.children) { const m = piv.children[0]; m.scale.set(1, r * m.userData.w, 1); }
            if (fade > 0.05) g.fx?.lightFlash?.(_v.copy(d.c).setY(d.c.y + 2), GOLD, (d.max ? 9 : 6) * fade * (0.85 + 0.15 * Math.sin(d.t * 13)), 0.15, 80);
        }
        if (!fx || d.front >= d.f.R + 0.5 && d.t > CIRCLE.FRONT_T + 0.3) return;
        // where the front runs now: the earth jumps up, dust, stones, golden sparks
        const data = g.world?.terrain?.data;
        const n = Math.min(24, Math.ceil(r * (d.max ? 1 : 0.8))); // (capped: the particle pools and the frame)
        for (let i = 0; i < n; i++) {
            if (Math.random() > dt * 30) continue;
            const a = Math.random() * Math.PI * 2;
            const x = d.c.x + Math.cos(a) * r, z = d.c.z + Math.sin(a) * r;
            const y = data ? data.topLayer(Math.round(x), Math.round(z)) - 0.5 : d.c.y;
            if (Math.abs(y - d.c.y) > 30) continue;
            const ox = Math.cos(a), oz = Math.sin(a);
            fx.smoke?.spawn(x, y + 0.3, z, ox * 2, 1 + Math.random() * 2.5, oz * 2, DUST[(Math.random() * DUST.length) | 0], 1 + Math.random() * 1.6, 1.8 + Math.random() * 1.2, { shrink: -0.35, spin: 1 });
            fx.debris?.spawn(x, y + 0.4, z, ox * (2 + Math.random() * 3), 4 + Math.random() * 6, oz * (2 + Math.random() * 3), 0x6b5f52, 0.18 + Math.random() * 0.25, 1.4, { shrink: 0.1, fade: false, spin: 8 });
            if (Math.random() < 0.6) fx.glow?.spawn(x, y + 0.6 + Math.random() * 2, z, ox * 3, 1 + Math.random() * 2, oz * 3, Math.random() < 0.5 ? GOLD : 0xfff6d0, 0.5 + Math.random() * 0.6, 0.6 + Math.random() * 0.4, { shrink: 0.8 });
        }
        // the ground shakes under whoever the front is near (felt further away too)
        const me = g.character?.group.position;
        if (me) {
            const dist = Math.hypot(me.x - d.c.x, me.z - d.c.z);
            const near = Math.max(0, 1 - Math.abs(dist - d.front) / 20);
            fx.shake = Math.max(fx.shake || 0, (d.by === g.localId ? 0.5 : 0) + near * (d.max ? 1.3 : 1));
        }
        // a crack of stone now and then
        if (d.t > (d.crackT || 0)) { d.crackT = d.t + 0.35 + Math.random() * 0.4; const a = Math.random() * Math.PI * 2; g.sound?.playCrack?.(_v.set(d.c.x + Math.cos(a) * r, d.c.y, d.c.z + Math.sin(a) * r), 1.2); }
    }

    _end(d) {
        const L = d.look;
        if (L) {
            this.game.scene?.remove(L.grp);
            L.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
            for (const m of [L.shellMat, L.ringMat, L.islandMat, L.domeMat, L.beamMat]) m.dispose();
            d.look = null;
        }
        const i = this.list.indexOf(d);
        if (i >= 0) this.list.splice(i, 1);
        if (d.mine) this.game.mana?.success?.(d.f.name);
    }

    /** Everything going on ends now (a new world, the game ends). */
    clear() {
        for (const d of [...this.list]) { d.mine = false; this._end(d); } // (no mana counted: it was cut short)
        this.list = [];
    }
}
