/**
 * Diabolos.js — Дьяволос, огромный прикованный дьявол ада: игровая часть (правила и числа — DiabolosRules.js,
 * модель — entities/DiabolosModel.js, звуки — audio/DiabolosSounds.js).
 *
 * Сидит в своей котловине (план ада: HellMap.hellPlan → devilSeat {x, z, r}, chainAnchor {x, y, z}, chainLen) и спит.
 * Будит его только то, что потревожило (DiabolosRules.wakes): попали, громко рядом, подошли вплотную, взяли из сундука
 * рядом, свет в лицо. Проснулся — злится на нарушителя (и на тех, кто рядом с ним), ходит за ним на цепи: цепь от якоря
 * к левому копыту — настоящая (верёвка из точек, одинаково на всех компьютерах), дальше CHAIN_LEN не пускает: он рвётся,
 * ревёт, бьёт по земле, плюёт огнём и шарами. Цели нет 25 с — идёт назад, садится и засыпает.
 * Бессмертен: здоровья нет, всё по нему — только «злит» (DiabolosRules.devilVerdict, причина — в журнал заклинаний).
 *
 * Сеть: хост ведёт (положение, поворот, состояние, ход — сообщение `dvl` раз в 0,2 с); шары — `dvb` (старт/взрыв),
 * гости рисуют полёт сами. Своего игрока каждый компьютер ранит сам (как огонь дракона). Сохранение — проснулся ли
 * когда-нибудь (ачивка), обиды не сохраняются: после загрузки он спит.
 *
 * Где он, если плана ада ещё нет: `place({devilSeat, chainAnchor, chainLen})` (стенд tools/devilbench.mjs, Творческий — на
 * будущее). Вдали (дальше ACTIVE_R от всех игроков) он выгружен: модели, цепи, шаров нет — ничего не копится.
 */

import * as THREE from 'three';
import { DEVIL, WAKE, MOVES, MOVE_IDS, FIRE, BALL, STATES, ChainRope, leash, wakes, chooseMove, devilVerdict, furyAfter,
    inDevilFire, ballSpeed, ballVerdict, ballDamage, sleepDelay, yawTo, FACE_OK, seatFrom } from './DiabolosRules.js';
import { diabolosModel, poseDiabolos, chainLinkGeo, chainMaterial, anchorModel, eyeletWorld, mouthWorld, fistWorld, hoofWorld, devilHeat, JOINTS } from '../entities/DiabolosModel.js';
import { FarShape } from '../core/FarShape.js';
import { registerKind } from './CreatureImpact.js';
import { crowdStep } from './CrowdSources.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _h = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0);
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ID = 'diabolos';
const NET_DT = 0.2;      // с между строками состояния хоста
const POSE_FAR = 420;    // м: дальше — поза реже
const CHAIN_NEAR = 520;  // м: дальше цепь не считается (лежит, как легла)
const GRAB_HOLD = 1.6;   // с в кулаке до броска

export class Diabolos {
    constructor(game) {
        this.game = game;
        this.site = null;         // {x, z, r, anchor {x,y,z}, len, small}
        this.d = null;            // само существо (пока загружен)
        this.model = null; this.one = null; this.chainMesh = null; this.anchor = null;
        this.rope = new ChainRope();
        this.balls = [];          // шары огня в воздухе {id, p, v, t, mine (хост), dead}
        this._ballPool = [];      // их меши (не больше BALL.MAX — общие форма и материал)
        this.held = null;         // меня держит в кулаке: {t, side}
        this.everWoke = false;    // сохранение: будили когда-нибудь (ачивка у разбудившего)
        this.log = [];            // (тесты и журнал) что было
        this._sitePoll = 0; this._netT = 0; this._poseT = 0; this._frame = 0;
        this._gy = new Float64Array(DEVIL.CHAIN_LINKS + 1);
        this._told = new Map();   // заклинание → время: «не действует» пишется в журнал не чаще раза в 10 с
        this._ballN = 0;
    }

    get auth() { return this.game.authority !== false; }
    /** Существо для поиска целей (заряды, удары): пока загружен. */
    targets() { return this.d && this.model ? [this.d] : []; }
    byId(id) { return this.d && (id === ID || id === this.d.id) ? this.d : null; }
    get list() { return this.d ? [this.d] : []; }

    // ================================================================ место
    /** Место из плана ада (контракт HellMap.hellPlan). Можно звать снова — новое место заменит старое. */
    place(plan) {
        const s = seatFrom(plan);
        if (!s) return false;
        if (this.site && Math.abs(this.site.x - s.x) < 0.5 && Math.abs(this.site.z - s.z) < 0.5) return true;
        this._unload();
        this.site = s;
        if (s.small) this._note(`⚠️ котловина Дьяволоса мала: r ${s.r.toFixed(0)} м < ${DEVIL.SEAT_MIN_R} (тело ${DEVIL.RADIUS} м + цепь ${DEVIL.CHAIN_LEN})`);
        return true;
    }
    /** План ада от фундамента (HellMap.js — его делает другая сессия): берём, когда появится. */
    _findSite() {
        const g = this.game;
        const plan = g.hell?.plan || g.hellPlan || (typeof g.hell?.hellPlan === 'function' ? g.hell.hellPlan() : null);
        if (plan) this.place(plan);
    }

    // ================================================================ игроки
    _players() {
        const g = this.game, out = this._pl || (this._pl = []);
        out.length = 0;
        const me = g.character?.group?.position;
        if (me && !g.isDeadLocal && !g.combat?.dead) out.push({ id: g.localId, p: me, feet: me.y - 1.95 * (g.character.size || 1), local: true, light: !!g.wandMagic?.light });
        for (const [id, r] of g.remotes || []) if (!r.dead && r.position) out.push({ id, p: r.position, feet: r.position.y - 1.95 * (r.character?.size || 1), local: false, light: !!r.lumos });
        return out;
    }
    _ground(x, z, fallback = 0) {
        const g = this.game, t = g.terrain?.data || g.world?.terrain?.data;
        if (t?.landMade && !t.landMade(x, z)) return fallback; // (землю в кадре не делаем: ждём воркеры)
        const y = g.collision?.groundY?.(x, z);
        return Number.isFinite(y) ? y : fallback;
    }

    // ================================================================ загрузка / выгрузка
    _load() {
        const g = this.game, s = this.site;
        const seed = Math.abs(Math.round(s.x * 7 + s.z * 13)) % 9973;
        const y = this._ground(s.x, s.z, 0);
        const anchor = { x: s.anchor.x, y: s.anchor.y ?? this._ground(s.anchor.x, s.anchor.z, y) + 2.5, z: s.anchor.z };
        // лицом от якоря (цепь тянется за ним назад)
        const yaw = Math.atan2(-(s.x - anchor.x), -(s.z - anchor.z)) + Math.PI;
        this.d = {
            id: ID, isDiabolos: true, ck: 'Y', seed, x: s.x, y, z: s.z, yaw, anchor,
            mode: 'sleep', modeT: 0, sit: 1, sleep: 1, eyes: 0.04, heat: 0.25, fury: 0,
            target: null, grudge: new Map(), lostT: 0, calmT: 0, sleepAt: sleepDelay(seed),
            move: null, rest: 0, cd: { fire: 0, ball: 0, grab: 0, clap: 0, roar: 0, rage: 0 },
            walkPh: 0, walkK: 0, strain: 0, stagger: 0, look: { yaw: 0, pitch: 0 }, aimDir: new THREE.Vector3(0, 0, -1),
            snoreT: 0, stepSide: 0, group: null, isDead: false, damageCooldown: 0, t: 0, wakeT: 0,
            bodyCapsule: (out) => this._capsule(out),
        };
        const m = this.model = diabolosModel();
        m.scale.setScalar(DEVIL.SCALE);
        m.position.set(s.x, y, s.z);
        m.rotation.y = yaw;
        m.userData.creature = this.d;
        this.d.group = m;
        g.scene?.add(m);
        this.one = new FarShape(m);
        this.one.set(true);
        const n = DEVIL.CHAIN_LINKS;
        this.chainMesh = new THREE.InstancedMesh(chainLinkGeo(), chainMaterial(), n);
        this.chainMesh.frustumCulled = false; // (звенья по всей котловине: сфера формы им не верна)
        this.chainMesh.castShadow = true; this.chainMesh.receiveShadow = true;
        this.chainMesh.name = 'diabolos-chain';
        g.scene?.add(this.chainMesh);
        this.anchor = anchorModel();
        this.anchor.position.set(anchor.x, anchor.y - 3, anchor.z);
        g.scene?.add(this.anchor);
        this.rope = new ChainRope();
        this._pose(0);
        this._note('😈 Дьяволос в мире (спит)');
    }

    _unload() {
        const g = this.game;
        if (this.model) {
            this.one?.set(false); this.one?.dispose?.();
            g.scene?.remove(this.model);
            this.model = null; this.one = null;
        }
        if (this.chainMesh) { g.scene?.remove(this.chainMesh); this.chainMesh.dispose?.(); this.chainMesh = null; }
        if (this.anchor) { g.scene?.remove(this.anchor); this.anchor = null; }
        for (const b of this.balls) this._ballGone(b, false);
        this.balls.length = 0;
        for (const m of this._ballPool) g.scene?.remove(m); // (пул шаров — тоже прочь: вдали ничего не висит в сцене)
        this._ballPool.length = 0;
        if (this.held) this._release(false);
        this.d = null;
        this.game.sound?.devilTheme?.(0, false);
    }

    // ================================================================ кадр
    update(dt) {
        const g = this.game;
        this._sitePoll -= dt;
        if (this._sitePoll <= 0) { this._sitePoll = 1; if (!this.site) this._findSite(); }
        if (!this.site) return;
        const ps = this._players();
        let near = Infinity;
        for (const q of ps) near = Math.min(near, Math.hypot(q.p.x - this.site.x, q.p.z - this.site.z));
        if (g.isDeadLocal && !ps.length && this.d) near = Infinity;
        if (!this.d) { if (near < DEVIL.ACTIVE_R && this._ground(this.site.x, this.site.z, NaN) === this._ground(this.site.x, this.site.z, NaN)) this._load(); else return; }
        else if (near > DEVIL.ACTIVE_R * 1.15) { this._unload(); return; } // (все ушли: засыпает и выгружается — после загрузки он снова спит)
        const d = this.d;
        d.t += dt;
        if (this.auth) this._think(d, dt, ps);
        else this._follow(d, dt);
        this._animate(d, dt);
        this._balls(dt);
        if (this.held) this._holdStep(dt);
        this._meHits(d, dt);
        this._sounds(d, dt);
        if (this.auth) { this._netT -= dt; if (this._netT <= 0) { this._netT = NET_DT; this._send(); } }
    }

    // ================================================================ разум (хост)
    _think(d, dt, ps) {
        d.modeT += dt;
        d.rest = Math.max(0, d.rest - dt);
        for (const k in d.cd) d.cd[k] = Math.max(0, d.cd[k] - dt);
        d.stagger = Math.max(0, d.stagger - dt);
        // обиды стареют; обидчик ушёл далеко — забыт
        for (const [id, gr] of d.grudge) {
            gr.t -= dt;
            const q = ps.find((x) => x.id === id);
            if (gr.t <= 0 || !q || Math.hypot(q.p.x - d.x, q.p.z - d.z) > DEVIL.FORGET_R) d.grudge.delete(id);
        }
        // спящего будит только то, что потревожило (сюда: подошли вплотную, свет в лицо)
        if (d.mode === 'sleep' || d.mode === 'sit') {
            for (const q of ps) {
                const dist = Math.hypot(q.p.x - d.x, q.p.z - d.z) - DEVIL.RADIUS;
                const why = wakes({ kind: 'near', d: dist }) || (q.light ? wakes({ kind: 'lumos', d: dist, aim: this._lightAim(q) }) : null);
                if (why) { this.disturb(q.id, why); break; }
            }
        }
        // кто рядом с обидчиком — тоже под гневом
        for (const q of ps) if (!d.grudge.has(q.id)) for (const [id] of d.grudge) {
            const o = ps.find((x) => x.id === id);
            if (o && o.p.distanceTo(q.p) <= DEVIL.NEAR_FRIEND) { d.grudge.set(q.id, { t: DEVIL.GRUDGE_T * 0.5, why: 'рядом с обидчиком' }); break; }
        }
        // цель: ближайший из обидчиков
        let tgt = null, best = Infinity;
        for (const q of ps) if (d.grudge.has(q.id)) { const dd = Math.hypot(q.p.x - d.x, q.p.z - d.z); if (dd < best) { best = dd; tgt = q; } }
        d.target = tgt?.id ?? null;
        switch (d.mode) {
            case 'sleep': d.sit = 1; return;
            case 'wake': if (d.modeT >= WAKE.GROGGY) this._setMode(d, 'stand'); return; // (потягивается, смотрит)
            case 'sit':
                if (d.target) { this._setMode(d, 'wake'); return; }
                if (d.modeT >= d.sleepAt) this._setMode(d, 'sleep');
                return;
            default: break;
        }
        if (d.move) { this._moveTick(d, dt, tgt); return; }
        if (!tgt) {
            d.lostT += dt;
            if (d.lostT > DEVIL.LOSE_T || !d.grudge.size) { this._goBack(d, dt); return; }
            this._walk(d, dt, null);
            return;
        }
        d.lostT = 0;
        const dist = Math.hypot(tgt.p.x - d.x, tgt.p.z - d.z);
        // цель за цепью? (копыто не дойдёт до неё — она дальше предела от якоря + досягаемость)
        const fo = this._footOff(d);
        const L = leash(d.anchor.x, d.anchor.z, tgt.p.x - fo.x, tgt.p.z - fo.z, fo.x, fo.z, this.site.len);
        const beyond = L.t >= 1 && L.d >= this.site.len * 0.99 && Math.hypot(tgt.p.x - d.anchor.x, tgt.p.z - d.anchor.z) > this.site.len + DEVIL.RADIUS;
        const turn = yawTo(d.yaw, d.x, d.z, tgt.p.x, tgt.p.z);
        const choice = d.stagger > 0 ? null : chooseMove({ dist, beyond, atLeash: d.strain > 0.85, faced: Math.abs(turn) < FACE_OK, rest: d.rest,
            fireCd: d.cd.fire, ballCd: d.cd.ball, grabCd: d.cd.grab, clapCd: d.cd.clap, roarCd: d.cd.roar, rageCd: d.cd.rage, air: tgt.feet - d.y > 30 });
        if (choice === 'turn' || choice === null) { this._turn(d, turn, dt); if (choice === null && !beyond && dist > MOVES.fist.reach * 0.8) this._walk(d, dt, tgt.p); else this._walk(d, 0, null); return; }
        if (choice === 'walk') { this._walk(d, dt, tgt.p); return; }
        this._startMove(d, choice, tgt);
    }

    _setMode(d, mode) {
        if (d.mode === mode) return;
        d.mode = mode; d.modeT = 0;
        if (mode === 'sit') d.sleepAt = sleepDelay(d.seed + d.t);
        if (mode === 'wake') { d.wakeT = d.t; this.game.sound?.playDevil?.(this.model.position, 'roar', 1.2, 0.85); }
        this._sendSoon = true;
        this._note(`😈 Дьяволос: ${mode}`);
    }

    /**
     * Потревожили (хост; гость — сообщение `dvl` e:'dist'): кто и почему. Спящий просыпается, бодрствующий злится сильнее.
     */
    disturb(by, why = 'по нему попали', point = null) {
        const d = this.d;
        if (!d) return;
        if (!this.auth) { this.game.sync?.diabolos?.({ e: 'dist', by, why }); return; }
        const g = this.game;
        if (by != null && by !== ID) d.grudge.set(by, { t: DEVIL.GRUDGE_T, why });
        if (d.mode === 'sleep' || d.mode === 'sit' || d.mode === 'back') {
            this._setMode(d, d.mode === 'back' ? 'stand' : 'wake');
            this._note(`😈 Дьяволос: решение — проснулся: ${why}${by != null ? ` (${by === g.localId ? 'вы' : 'игрок ' + by})` : ''}`);
            if (!this.everWoke) this.everWoke = true;
            if (by === g.localId || by === 'local') g.achievements?.gain?.('devilWoke');
            else if (by != null) g.sync?.diabolos?.({ e: 'woke', to: by });
            g.castleLife?.alarm?.(this.model.position, 'devil', null, 200);
        }
    }

    _lightAim(q) {
        // свет в лицо: тот, кто светит, смотрит на голову (у меня — камера; у других — их взгляд, если есть)
        const g = this.game, d = this.d;
        const head = _u.set(d.x, d.y + (d.sit > 0.5 ? 55 : 110), d.z);
        if (q.local) {
            const cam = g.camera;
            if (!cam) return 0;
            cam.getWorldDirection(_w);
            return _w.dot(head.sub(cam.position).normalize());
        }
        const r = g.remotes?.get(q.id);
        const ry = r?.rotation?.y ?? r?.yaw;
        if (!Number.isFinite(ry)) return 0;
        _w.set(-Math.sin(ry), 0, -Math.cos(ry));
        head.sub(q.p); head.y = 0;
        return _w.dot(head.normalize());
    }

    _footOff(d) {
        // левое копыто от середины тела (в мире): по повороту тела
        const lx = JOINTS.feL[0] * DEVIL.SCALE, lz = JOINTS.feL[2] * DEVIL.SCALE;
        const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
        return { x: lx * c + lz * s, z: -lx * s + lz * c };
    }

    _turn(d, ang, dt) {
        const k = clamp(ang, -DEVIL.TURN * dt, DEVIL.TURN * dt);
        d.yaw += k;
        d.walkK = Math.max(d.walkK, Math.min(0.35, Math.abs(ang) * 0.6)); // (поворот — переступает)
        d.walkPh += Math.abs(k) * 3;
    }

    /** Шаг к точке (или стоит): Pilot/crowdStep обходит игроков и других; цепь держит копыто у предела. */
    _walk(d, dt, to) {
        if (!to || dt <= 0) { d.walkK = Math.max(0, d.walkK - dt * 1.5); d.strain = Math.max(0, d.strain - dt); return; }
        const dx = to.x - d.x, dz = to.z - d.z, dist = Math.hypot(dx, dz) || 1;
        const ang = yawTo(d.yaw, d.x, d.z, to.x, to.z);
        this._turn(d, ang, dt);
        if (Math.abs(ang) > 1.1) return; // (сначала развернуться всем телом)
        const sp = DEVIL.WALK * (1 - 0.5 * Math.min(1, Math.abs(ang)));
        let sx = dx / dist * sp * dt, sz = dz / dist * sp * dt;
        try {
            const a = crowdStep(this.game, d, { x: d.x, y: d.y, z: d.z }, dx / dist, dz / dist, sp * dt, { r: DEVIL.RADIUS, id: 9001, skip: (b) => b.ref === d });
            if (a && Number.isFinite(a.x)) { sx = a.x; sz = a.z; }
        } catch (_) { /* (толпа не сломает шаг: идёт прямо) */ }
        const fo = this._footOff(d);
        const L = leash(d.anchor.x, d.anchor.z, d.x + sx, d.z + sz, fo.x, fo.z, this.site.len);
        // мягкая пружина: у грани шаг вязнет, у предела — стоит (цепь держит копыто)
        const k = 1 - 0.85 * L.t;
        d.x += (L.x - d.x) * k; d.z += (L.z - d.z) * k;
        d.strain += ((L.t > 0.6 ? L.t : 0) - d.strain) * Math.min(1, dt * 3);
        d.walkK = Math.min(1, d.walkK + dt * 1.2) * (L.at ? 0.4 : 1);
        d.walkPh += dt * sp / 7.5 * Math.PI; // (шаг ~15 м)
        d.y += (this._ground(d.x, d.z, d.y) - d.y) * Math.min(1, dt * 4);
    }

    _goBack(d, dt) {
        const s = this.site, dist = Math.hypot(s.x - d.x, s.z - d.z);
        if (d.mode !== 'back') this._setMode(d, 'back');
        if (dist > 4) { this._walk(d, dt, { x: s.x, z: s.z }); return; }
        // на месте: разворот лицом от якоря и сесть
        const want = Math.atan2(-(s.x - d.anchor.x), -(s.z - d.anchor.z)) + Math.PI;
        let a = want - d.yaw; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
        if (Math.abs(a) > 0.1) { this._turn(d, a, dt); return; }
        d.grudge.clear();
        this._setMode(d, 'sit');
    }

    // ---- ходы
    _startMove(d, id, tgt) {
        const M = MOVES[id];
        d.move = { id, t: 0, hit: false, to: tgt.id, aim: tgt.p.clone(), feet: tgt.feet, side: Math.random() < 0.5 ? 'L' : 'R', n: 0, fireT: 0, sweep: Math.random() < 0.5 ? -1 : 1 };
        d.mode = 'act'; d.modeT = 0;
        if (id === 'fire') d.cd.fire = 18 - 6 * d.fury;
        if (id === 'ball') d.cd.ball = 3.2 - 1.4 * d.fury;
        if (id === 'grab') d.cd.grab = 14;
        if (id === 'clap') d.cd.clap = 9;
        if (id === 'roar') d.cd.roar = 12;
        if (id === 'rage') d.cd.rage = 7;
        this._sendSoon = true;
        this._note(`😈 Дьяволос: ход ${id} → ${tgt.id === this.game.localId ? 'вы' : tgt.id} (${Math.round(Math.hypot(tgt.p.x - d.x, tgt.p.z - d.z))} м)`);
        if (M.wind <= 0) this._sound(id);
    }

    _moveTick(d, dt, tgt) {
        const m = d.move, M = MOVES[m.id];
        const prev = m.t;
        m.t += dt;
        // смотрит и поворачивается за целью до удара (шаг в сторону во время замаха — промах)
        if (tgt && m.t < M.hit) { this._turn(d, yawTo(d.yaw, d.x, d.z, tgt.p.x, tgt.p.z) * 0.6, dt); m.aim.copy(tgt.p); m.feet = tgt.feet; }
        if (prev < M.wind * 0.3 && m.t >= M.wind * 0.3) this._sound(m.id, true);
        if (!m.hit && m.t >= M.hit) { m.hit = true; this._strike(d, m); }
        if (m.id === 'fire' && m.t >= M.hit && m.t < M.hit + FIRE.TIME) this._fireStep(d, m, dt);
        if (m.id === 'rage') { d.strain = 1; if (Math.floor(prev / 0.9) !== Math.floor(m.t / 0.9) && m.t > 0.5) this._slam(d, hoofWorld(this.model, m.n++ % 2 ? 'R' : 'L', _a), MOVES.rage.wave, 'rage'); }
        if (m.t >= M.dur) { d.move = null; d.rest = M.rest * (1 - 0.35 * d.fury); d.mode = 'walk'; this._sendSoon = true; }
    }

    /** (хост) Миг удара: куда пришлось — то и задето (игроков ранит их компьютер — _meHits по ходу из состояния). */
    _strike(d, m) {
        const g = this.game;
        switch (m.id) {
            case 'fist': this._slam(d, fistWorld(this.model, m.side, _a).setY(d.y), MOVES.fist.wave, 'fist'); break;
            case 'stomp': this._slam(d, hoofWorld(this.model, 'R', _a), MOVES.stomp.wave, 'stomp'); break;
            case 'clap': this._clap(d); break;
            case 'roar': g.castleLife?.alarm?.(this.model.position, 'devil', null, 220); this._tremor(d, this.model.position, 60, 0.6); break;
            case 'ball': this._spitBall(d, m); break;
            case 'grab': {
                if (m.to == null) break;
                const q = this._players().find((x) => x.id === m.to);
                if (!q || q.p.distanceTo(fistWorld(this.model, m.side, _a)) > 14 + DEVIL.SCALE * 0.1) break; // (отошёл — промах)
                if (q.local) this._grabMe(m.side); else g.sync?.diabolos?.({ e: 'grab', to: q.id, s: m.side });
                break;
            }
            default: break;
        }
    }

    /** Удар по земле: взрыв (ломает блоки, ранит существ — Game.explode с виновником 'diabolos': по игрокам — сами), волна, тремор. */
    _slam(d, at, R, kind) {
        const g = this.game;
        const y = this._ground(at.x, at.z, d.y);
        _h.set(at.x, y + 1, at.z);
        if (this.auth) {
            g.explode?.(_h.clone(), kind === 'stomp' ? 7 : 9, ID, 1.5);
            g.creatureImpact?.spellArea?.('DiabolosSlam', null, (c) => {
                const dx = c.x - _h.x, dz = c.z - _h.z, dist = Math.hypot(dx, dz);
                if (dist > R || dist < 0.01 || c.isDiabolos) return null;
                const w = 16 * (1 - dist / R * 0.7);
                return new THREE.Vector3(dx / dist * w, 0, dz / dist * w);
            }, { from: _h.clone(), toss: 5, down: 3 });
            g.sync?.diabolos?.({ e: 'slam', k: kind, p: [r2(_h.x), r2(_h.y), r2(_h.z)] });
        }
        this._slamFx(_h, R, kind);
        this._tremor(d, _h, 60, kind === 'stomp' ? 1 : 0.8);
        this._meSlam(_h, R, kind);
    }

    _slamFx(p, R, kind) {
        const g = this.game, fx = g.fx;
        g.sound?.playDevil?.(p, kind === 'stomp' || kind === 'rage' ? 'step' : 'slam', 1.4);
        if (!fx) return;
        for (let i = 0; i < 46; i++) {
            const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 14;
            fx.smoke?.spawn?.(p.x + Math.cos(a) * R * 0.3, p.y + 0.5, p.z + Math.sin(a) * R * 0.3, Math.cos(a) * sp, 1 + Math.random() * 4, Math.sin(a) * sp, i % 3 ? 0x4a3a32 : 0x7a5a44, 3 + Math.random() * 4, 2.4, { shrink: -0.8 });
        }
        for (let i = 0; i < 30; i++) fx.spark?.(p, i % 2 ? 0xff7a1a : 0x3a2a22, 0.6, _w.set((Math.random() - 0.5) * 30, 8 + Math.random() * 16, (Math.random() - 0.5) * 30), 1.4);
        fx.lightFlash?.(p, 0xff5a1a, 4, 0.4, 80);
    }

    /** Тремор: земля дрожит у всех в радиусе — камера (у меня), существа шатаются (CreatureImpact у хоста). */
    _tremor(d, p, R, k) {
        const g = this.game, me = g.character?.group?.position;
        if (me) { const dist = me.distanceTo(p); if (dist < R * 1.6) g.cameraShake?.(k * (1 - dist / (R * 1.6)), 0.6); }
    }

    /** Хлопок ладонями: волна огня конусом вперёд (MOVES.clap). */
    _clap(d) {
        const g = this.game, p = this.model.position;
        _v.set(-Math.sin(d.yaw), 0, -Math.cos(d.yaw));
        const from = _w.copy(p).addScaledVector(_v, 20); from.y = d.y + 40;
        this._flameBurst(from, _v, MOVES.clap.reach, 0.9);
        if (this.auth) g._burnRay?.(from.clone(), _v.clone().setY(-0.25).normalize(), MOVES.clap.reach, ID);
        g.sound?.playDevil?.(from, 'clap', 1.3);
        const me = g.character?.group?.position;
        if (me && !g.isDeadLocal && !this.held) {
            const dx = me.x - from.x, dz = me.z - from.z, dist = Math.hypot(dx, dz);
            if (dist < MOVES.clap.reach && (dx * _v.x + dz * _v.z) / (dist || 1) > Math.cos(MOVES.clap.cone)) this._hurtFire(MOVES.clap.dmg, from);
        }
    }

    // ---- струя огня
    _fireStep(d, m, dt) {
        const g = this.game;
        const o = mouthWorld(this.model, _a);
        // по дуге: от одного края к другому, к цели и вниз
        const k = (m.t - MOVES.fire.hit) / FIRE.TIME;
        const dx = m.aim.x - o.x, dy = (m.feet ?? m.aim.y) - o.y, dz = m.aim.z - o.z, hl = Math.hypot(dx, dz) || 1;
        const sweep = m.sweep * FIRE.ARC * (0.5 - k) * 2;
        const ca = Math.cos(sweep), sa = Math.sin(sweep);
        const dir = d.aimDir.set((dx * ca - dz * sa) / hl, dy / Math.max(hl, 20), (dx * sa + dz * ca) / hl).normalize();
        this._flameDraw(o, dir, dt);
        m.fireT -= dt;
        if (m.fireT <= 0) {
            m.fireT = FIRE.TICK;
            if (this.auth) g._burnRay?.(o.clone(), dir.clone(), FIRE.LEN, ID);
        }
    }
    _flameDraw(o, dir, dt) {
        const fx = this.game.fx;
        if (!fx?.glow) return;
        const V = 62, life = FIRE.LEN / V;
        _u.crossVectors(dir, _y); if (_u.lengthSq() < 1e-4) _u.set(1, 0, 0); _u.normalize();
        _h.crossVectors(_u, dir).normalize();
        this._fAcc = (this._fAcc || 0) + dt * 260;
        let n = Math.min(18, Math.floor(this._fAcc)); this._fAcc -= n;
        const cols = [0xfff2b0, 0xffa01a, 0xd8380a];
        for (; n > 0; n--) {
            const a = Math.random() * Math.PI * 2, k = Math.random();
            const lat = FIRE.SLOPE * V * (0.4 + Math.random() * 0.8) * Math.sqrt(k);
            const ca = Math.cos(a), sa = Math.sin(a), sp = V * (0.9 + Math.random() * 0.2);
            fx.glow.spawn(o.x, o.y, o.z, dir.x * sp + (_u.x * ca + _h.x * sa) * lat, dir.y * sp + (_u.y * ca + _h.y * sa) * lat + 1.5, dir.z * sp + (_u.z * ca + _h.z * sa) * lat,
                k < 0.15 ? cols[0] : k < 0.6 ? cols[1] : cols[2], (2.2 + Math.random() * 2.6) * (0.4 + Math.sqrt(k)) * 2.2, life * (0.7 + Math.random() * 0.3), { shrink: -1.4, spin: 3 });
        }
        if (Math.random() < dt * 6) fx.smoke?.spawn?.(o.x + dir.x * FIRE.LEN * 0.8, o.y + dir.y * FIRE.LEN * 0.8 + 8, o.z + dir.z * FIRE.LEN * 0.8, 0, 4, 0, 0x2a1a14, 10, 3, { shrink: -1 });
    }
    _flameBurst(o, dir, len, k) {
        const fx = this.game.fx;
        if (!fx?.glow) return;
        for (let i = 0; i < 90; i++) {
            const a = (Math.random() - 0.5) * 1.2, sp = 30 + Math.random() * 30;
            const c = Math.cos(a), s = Math.sin(a);
            fx.glow.spawn(o.x, o.y - Math.random() * 20, o.z, (dir.x * c - dir.z * s) * sp, Math.random() * 6 - 8, (dir.x * s + dir.z * c) * sp, i % 3 ? 0xff8a1a : 0xffe08a, 3 + Math.random() * 4, len / sp * k, { shrink: -1.2, spin: 2 });
        }
    }

    // ---- шары огня
    _spitBall(d, m) {
        if (this.balls.length >= BALL.MAX) return;
        const o = mouthWorld(this.model, _a).clone();
        const tgtY = (m.feet ?? m.aim.y) + 1.5;
        const dx = m.aim.x - o.x, dz = m.aim.z - o.z, hd = Math.hypot(dx, dz) || 1;
        const sp = ballSpeed(hd), T = hd / sp;
        // прицел с упреждением тяжести (дуга видна)
        const vy = (tgtY - o.y) / T + 0.5 * BALL.GRAVITY * T;
        const v = new THREE.Vector3(dx / hd * sp, vy, dz / hd * sp);
        const id = ++this._ballN;
        this._addBall(id, o, v, true);
        this.game.sync?.diabolos?.({ e: 'b', id, o: [r2(o.x), r2(o.y), r2(o.z)], v: [r2(v.x), r2(v.y), r2(v.z)] });
    }
    _addBall(id, o, v, mine) {
        const b = { id, p: o.clone(), v: v.clone(), t: 0, mine, mesh: this._ballMesh(), trail: 0 };
        b.mesh.position.copy(o);
        b.mesh.visible = true;
        this.balls.push(b);
        this.game.sound?.playDevil?.(o, 'ball', 1.1);
        this.game.fx?.lightFlash?.(o, 0xff7a1a, 3, 0.25, 60);
    }
    _ballMesh() {
        let m = this._ballPool.find((x) => !x.visible);
        if (m) return m;
        m = ballModel();
        this.game.scene?.add(m);
        this._ballPool.push(m);
        return m;
    }
    _balls(dt) {
        const g = this.game, fx = g.fx;
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const b = this.balls[i];
            b.t += dt;
            _v.copy(b.p);
            b.v.y -= BALL.GRAVITY * dt;
            b.p.addScaledVector(b.v, dt);
            b.mesh.position.copy(b.p);
            b.mesh.rotation.y += dt * 4; b.mesh.rotation.x += dt * 3;
            const s = 1 + 0.12 * Math.sin(b.t * 31);
            b.mesh.scale.setScalar(BALL.R * s);
            // след: жар, искры, дым (как снаряды Королевы — свечение и след)
            if (fx?.glow) for (let k = 0; k < 3; k++) fx.glow.spawn(b.p.x + (Math.random() - 0.5) * 3, b.p.y + (Math.random() - 0.5) * 3, b.p.z + (Math.random() - 0.5) * 3,
                -b.v.x * 0.15 + (Math.random() - 0.5) * 4, -b.v.y * 0.15 + Math.random() * 3, -b.v.z * 0.15 + (Math.random() - 0.5) * 4, k ? 0xff7a1a : 0xffe08a, 1.6 + Math.random() * 1.8, 0.7, { shrink: -1.2, spin: 4 });
            b.trail -= dt;
            if (b.trail <= 0 && fx?.smoke) { b.trail = 0.05; fx.smoke.spawn(b.p.x, b.p.y, b.p.z, 0, 1.5, 0, 0x2a1810, 2.5, 1.6, { shrink: -1.2 }); }
            // во что попал: стена (блоки), земля, игрок — взрыв
            let hit = b.t > BALL.LIFE;
            const coll = g.collision;
            if (!hit && coll?.lineOfSight && coll.lineOfSight(_v.x, _v.y, _v.z, b.p.x, b.p.y, b.p.z, 0.5) === false) hit = true;
            if (!hit && b.p.y < this._ground(b.p.x, b.p.z, -1e9) + 0.5) hit = true;
            if (!hit) for (const q of this._players()) { _w.set(q.p.x, q.p.y - 0.8, q.p.z); if (_w.distanceTo(b.p) < BALL.R + 1.2) { hit = true; break; } }
            if (hit && (b.mine || !this.auth)) this._explodeBall(b, true);
            else if (hit) this._explodeBall(b, true);
        }
    }
    _explodeBall(b, tell) {
        const g = this.game, p = b.p;
        this._ballGone(b, true);
        const i = this.balls.indexOf(b); if (i >= 0) this.balls.splice(i, 1);
        if (this.auth) {
            g.explode?.(p.clone(), 5, ID, 1);
            g.castleLife?.alarm?.(p, 'devil', null, 40);
            if (tell) g.sync?.diabolos?.({ e: 'bx', id: b.id, p: [r2(p.x), r2(p.y), r2(p.z)] });
        }
        this._meBall(p);
    }
    _ballGone(b, boom) {
        b.mesh.visible = false;
        if (!boom) return;
        const g = this.game, fx = g.fx, p = b.p;
        g.sound?.playDevil?.(p, 'boom', 1.5);
        fx?.explosion?.(p, BALL.BLAST_R * 0.6, 2);
        fx?.lightFlash?.(p, 0xff6a10, 6, 0.5, 120);
        if (fx?.glow) for (let i = 0; i < 70; i++) {
            const a = Math.random() * Math.PI * 2, e = Math.random() * 1.4 - 0.2, sp = 10 + Math.random() * 18;
            fx.glow.spawn(p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 4, Math.sin(a) * Math.cos(e) * sp, i % 3 ? 0xff7a1a : 0xffe8a0, 2 + Math.random() * 3, 0.6 + Math.random() * 0.6, { shrink: -1.4, spin: 3 });
        }
    }

    // ================================================================ по мне (каждый компьютер — своего игрока)
    _meShield(from, kind) { return this.game.combat?.breakShield?.(from, kind) ?? null; }

    _hurtMe(dmg, kind, from, push = null, msg = '') {
        const g = this.game, c = g.combat;
        if (!c || c.dead || g.isDeadLocal || dmg <= 0) return;
        if (c.enabled) c.damage(dmg, ID, kind === 'fire' ? 'Inferno' : 'melee'); else g.damageLocalPlayer?.(dmg);
        if (kind === 'fire') { g.burning?.ignite?.('p', g.localId, null); if (c.frozen) c.frozenLeft = 0; }
        if (kind === 'fire') g.armor?.pierce?.('Inferno', dmg); // (мантия не держит адский огонь: её запас прочности сгорает — как у Королевы)
        if (push) g.knockback?.add?.(push);
        g.hud?.setVoice?.(msg || `😈 Дьяволос: −${Math.round(dmg)}`, true);
    }
    _hurtFire(dmg, from) {
        const c = this.game.combat;
        if (c?.devilFire?.(from, FIRE.SHIELD_K)) return; // (щит держит, но платит вдвое)
        this._hurtMe(dmg, 'fire', from, null, `🔥 Огонь Дьяволоса: −${dmg}`);
    }

    /** Мой игрок в волне удара по земле (кулак / копыто / ярость). Щит ломается, но спасает. */
    _meSlam(p, R, kind) {
        const g = this.game, me = g.character?.group?.position;
        if (!me || g.isDeadLocal || g.combat?.dead || this.held) return;
        const feet = me.y - 1.95;
        const dist = Math.hypot(me.x - p.x, me.z - p.z);
        if (dist > R || feet - p.y > 12) return;
        const M = MOVES[kind === 'rage' ? 'rage' : kind];
        const push = _w.set(me.x - p.x, 0, me.z - p.z).normalize().multiplyScalar(14 * (1 - dist / R)).setY(6);
        const sh = this._meShield(p, 'DevilFist');
        if (sh && sh !== 'hand') { g.knockback?.add?.(push.clone().multiplyScalar(0.4)); return; }
        if (kind === 'stomp' && dist < 9) { this._hurtMe(sh === 'hand' ? 45 : 999, 'melee', p, push.clone(), '😈 Копыто Дьяволоса!'); return; }
        const dmg = Math.round((M.dmg ?? 15) * (kind === 'stomp' ? 0.35 : 1) * (1 - dist / R * 0.75) * (sh === 'hand' ? 0.4 : 1));
        this._hurtMe(dmg, 'melee', p, push.clone(), kind === 'rage' ? `😈 Земля дрожит: −${dmg}` : `😈 Удар Дьяволоса: −${dmg}`);
    }

    /** Взрыв шара у меня: щит ломается целиком (меня не задело) — без щита −25 и огонь (DiabolosRules.ballVerdict). */
    _meBall(p) {
        const g = this.game, me = g.character?.group?.position;
        if (!me || g.isDeadLocal || g.combat?.dead) return;
        _w.set(me.x, me.y - 0.8, me.z);
        const dist = _w.distanceTo(p);
        if (dist > BALL.BLAST_R) return;
        const shield = this._meShield(p, 'DevilBall');
        const v = ballVerdict({ shield, armor: !!(g.armor?.fx?.magicSet || g.armor?.fx?.robe === 'magic'), d: dist });
        this.log.push(`ball:${shield || 'none'}:${v.dmg}`);
        const push = _u.set(me.x - p.x, 0, me.z - p.z).normalize().multiplyScalar(10 * (1 - dist / BALL.BLAST_R)).setY(4);
        if (v.breaks && !v.dmg) { g.knockback?.add?.(push.clone().multiplyScalar(0.3)); return; }
        if (shield === 'gods') return;
        this._hurtMe(v.dmg, 'fire', p, push.clone(), `🔥 Шар огня Дьяволоса: −${v.dmg}`);
        if (!v.ignite) g.burning?.extinguish?.('p', g.localId);
    }

    /** Ход в состоянии (у гостя — из сети) задевает моего игрока огнём: струя. */
    _meHits(d, dt) {
        const g = this.game, m = d.move;
        if (!m || m.id !== 'fire' || m.t < MOVES.fire.hit || m.t > MOVES.fire.hit + FIRE.TIME) { this._fireTick = 0; return; }
        if (!this.auth) this._fireStep(d, m, dt); // (у гостя струю рисует он сам — по ходу из сети)
        const me = g.character?.group?.position;
        if (!me || g.isDeadLocal || g.combat?.dead) return;
        this._fireTick = (this._fireTick || 0) - dt;
        if (this._fireTick > 0) return;
        this._fireTick = FIRE.TICK;
        const o = mouthWorld(this.model, _a);
        if (inDevilFire(o, d.aimDir, me, 0.6)) this._hurtFire(FIRE.PLAYER, o.clone());
    }

    // ---- хват и бросок
    _grabMe(side) {
        const g = this.game;
        if (g.isDeadLocal || g.combat?.dead) return;
        const from = fistWorld(this.model, side, _a).clone();
        const sh = this._meShield(from, 'DevilFist');
        if (sh && sh !== 'hand') { g.hud?.setVoice?.('😈 Дьяволос схватил — щит сломался, вы выскользнули', true); return; }
        this.held = { t: 0, side };
        g.flight?.land?.('grab');
        g.hud?.setVoice?.('😈 Дьяволос схватил вас!', true);
        g.sound?.playDevil?.(from, 'roar', 1, 1.15);
    }
    _holdStep(dt) {
        const g = this.game, h = this.held;
        if (!this.model || g.isDeadLocal || g.combat?.dead) { this._release(false); return; }
        h.t += dt;
        const p = fistWorld(this.model, h.side, _a);
        g.character.group.position.set(p.x, p.y + 2, p.z);
        if (h.t >= GRAB_HOLD) this._release(true);
    }
    _release(thrown) {
        const g = this.game, d = this.d;
        this.held = null;
        if (!thrown || !d) return;
        // бросок на ~60 м: от него, вверх под 40°
        const me = g.character.group.position;
        _w.set(me.x - d.x, 0, me.z - d.z).normalize();
        const v = Math.sqrt(MOVES.grab.throwM * 9.8 / Math.sin(2 * 0.7));
        g.knockback?.add?.(new THREE.Vector3(_w.x * v * Math.cos(0.7), v * Math.sin(0.7), _w.z * v * Math.cos(0.7)));
        this._hurtMe(MOVES.grab.dmg, 'melee', me, null, `😈 Дьяволос швырнул вас: −${MOVES.grab.dmg}`);
    }
    /** Меня держат: тело ведёт кулак (Game: физика героя выключена, как в лапах паучихи). */
    get holding() { return !!this.held; }

    // ================================================================ попадания по нему (все места поиска целей)
    /** Заряд дуэли (Duel, вид 'Y'). */
    boltHit(c, spell, by) { this._struck(spell, by); }
    /** Удар/заклинание по существу. */
    hit(c, dmg, spell, by) { this._struck(spell, by, dmg); }
    /** Взрыв/волна рядом: попал ли по телу. */
    hitAt(pos, r, dmg, spell, by) {
        const d = this.d;
        if (!d || by === ID || !pos) return false;
        if (this._centre(_v).distanceTo(pos) > r + DEVIL.BELLY_R) { this.noise(pos, by); return false; }
        this._struck(spell, by, dmg);
        return true;
    }
    /** Луч (Сапира, Громовая волна, лёд, Инферно…). */
    hitRay(o, dir, len, width, dmg, spell, by) {
        const d = this.d;
        if (!d || by === ID) return false;
        this._capsule(this._cap || (this._cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }));
        const c = _v.copy(this._cap.a).lerp(this._cap.b, 0.5);
        const along = _w.subVectors(c, o).dot(dir);
        if (along < 0 || along > len + DEVIL.BELLY_R) return false;
        const off = _w.subVectors(c, o).addScaledVector(dir, -along).length();
        if (off > DEVIL.BELLY_R * 1.6 + (width || 0)) return false;
        this._struck(spell, by, dmg);
        return true;
    }
    /** Шум (взрыв, крик) у `pos`: громко и близко — проснулся. */
    noise(pos, by = null, loud = true) {
        const d = this.d;
        if (!d || by === ID || !pos) return;
        const dist = Math.hypot(pos.x - d.x, pos.z - d.z) - DEVIL.RADIUS;
        const why = wakes({ kind: 'noise', d: dist, loud });
        if (why) this.disturb(by === 'local' ? this.game.localId : by, why);
    }
    /** Открыли сундук рядом. */
    chestOpened(pos, by) {
        const d = this.d;
        if (!d || !pos) return;
        const why = wakes({ kind: 'chest', d: Math.hypot(pos.x - d.x, pos.z - d.z) - DEVIL.RADIUS });
        if (why) this.disturb(by ?? this.game.localId, why);
    }

    _struck(spell, by, dmg = 0) {
        const d = this.d, g = this.game;
        if (!d) return;
        if (by === 'local') by = g.localId;
        const v = devilVerdict(spell);
        const now = d.t;
        if (by === g.localId && (now - (this._told.get(spell) ?? -99)) > 10) {
            this._told.set(spell, now);
            if (this._told.size > 64) this._told.clear();
            g.spellLog?.note?.(`😈 Дьяволос: ${spell} — ${v.why}`);
            if (v.anger) g.hud?.setVoice?.(`😈 ${v.cat === 'death' || v.cat === 'dark' ? 'Дьяволос сам создал это заклинание — оно его не берёт' : v.cat === 'gods' ? 'Даже заклинание богов не убивает Дьяволоса' : 'Дьяволоса нельзя убить'}`, true);
        }
        this.log.push(`hit:${spell}:${v.cat}`);
        if (this.log.length > 200) this.log.splice(0, 100);
        if (!v.anger) return;
        if (!this.auth) { g.sync?.diabolos?.({ e: 'hit', by, s: String(spell || '').slice(0, 24) }); return; }
        d.fury = furyAfter(d.fury, dmg || 10);
        d.stagger = Math.max(d.stagger, v.stagger);
        this.disturb(by, 'по нему попали');
    }

    /** Тело для зарядов и ударов: от таза до плеч (сидя — ниже), радиус брюха. */
    _capsule(out) {
        const d = this.d, S = DEVIL.SCALE;
        const top = d.sit > 0.5 ? 2.3 : 2.9, bot = d.sit > 0.5 ? 0.7 : 1.4;
        out.a.set(d.x, d.y + bot * S, d.z);
        out.b.set(d.x, d.y + top * S, d.z);
        out.r = DEVIL.BELLY_R;
        return out;
    }
    _centre(out) { const d = this.d; return out.set(d.x, d.y + (d.sit > 0.5 ? 1.3 : 2.0) * DEVIL.SCALE, d.z); }

    // ================================================================ вид
    _animate(d, dt) {
        const want = d.mode === 'sleep' ? 1 : 0;
        d.sleep += (want - d.sleep) * Math.min(1, dt * (want ? 0.4 : 1.6));
        const sitWant = d.mode === 'sleep' || d.mode === 'sit' ? 1 : d.mode === 'wake' ? clamp(1 - (d.modeT - 1.2) / 1.8, 0, 1) : 0;
        d.sit += (sitWant - d.sit) * Math.min(1, dt * 1.1);
        d.eyes += ((d.mode === 'sleep' ? 0.04 : 1) - d.eyes) * Math.min(1, dt * (d.mode === 'sleep' ? 0.8 : 3));
        const mad = d.mode === 'act' || d.strain > 0.6 ? 1 : d.target ? 0.6 : d.mode === 'sleep' ? 0.12 : 0.3;
        d.heat += (Math.min(1, mad + d.fury * 0.3) - d.heat) * Math.min(1, dt * 1.5);
        devilHeat(d.heat, d.t);
        const m = this.model;
        m.position.set(d.x, d.y + (d.stagger > 0 ? -Math.sin(d.stagger * 9) * 0.6 : 0), d.z);
        m.rotation.y = d.yaw;
        // голова — к цели (глаза следят)
        const q = d.target != null ? this._players().find((x) => x.id === d.target) : null;
        if (q) {
            const ang = yawTo(d.yaw, d.x, d.z, q.p.x, q.p.z);
            const dist = Math.hypot(q.p.x - d.x, q.p.z - d.z);
            d.look.yaw += (clamp(-ang, -0.9, 0.9) * -1 - d.look.yaw) * Math.min(1, dt * 3);
            d.look.pitch += (clamp(Math.atan2(q.feet - (d.y + 105), Math.max(dist, 1)), -0.6, 0.5) - d.look.pitch) * Math.min(1, dt * 3);
        } else { d.look.yaw *= 1 - Math.min(1, dt); d.look.pitch *= 1 - Math.min(1, dt); }
        this._pose(dt);
        this._chain(dt);
    }

    _visible() {
        const cam = this.game.camera;
        if (!cam || !this.model) return true;
        _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        _fr.setFromProjectionMatrix(_pm);
        _sph.center.set(this.d.x, this.d.y + 60, this.d.z); _sph.radius = 110;
        return _fr.intersectsSphere(_sph);
    }

    _pose(dt) {
        const d = this.d, m = this.model, g = this.game;
        if (!m) return;
        const me = g.character?.group?.position;
        const far = me ? Math.hypot(me.x - d.x, me.z - d.z) > POSE_FAR : false;
        this._frame++;
        this._poseT += dt;
        if (dt > 0 && (!this._visible() || (far && this._frame % 4))) return; // (вне кадра не позируется; вдали — реже)
        const mv = d.move, M = mv ? MOVES[mv.id] : null, k = mv ? mv.t : 0;
        const wind = M ? clamp(k / Math.max(0.01, M.wind), 0, 1) : 0, after = M ? clamp((k - M.hit) / Math.max(0.01, M.dur - M.hit), 0, 1) : 0;
        const hitK = M ? (k < M.hit ? wind : 1 - after) : 0;
        const side = mv?.side || 'R';
        const arm = (sd) => {
            if (!mv) return null;
            switch (mv.id) {
                case 'fist': return sd === side ? { raise: k < M.hit ? wind : 0, slam: k >= M.hit ? 1 - after * 0.6 : 0 } : { fwd: 0.2 };
                case 'grab': return sd === side ? { fwd: hitK * 0.9, grab: k > M.hit ? 1 : wind * 0.5 } : null;
                case 'rage': return { raise: 0.5 + 0.5 * Math.sin(k * 7 + (sd === 'L' ? 0 : 2)), slam: 0.3 * Math.max(0, Math.sin(k * 7 + (sd === 'L' ? 1.5 : 3.5))) };
                case 'roar': return { raise: 0.25 * hitK, fwd: 0.2 };
                default: return null;
            }
        };
        const wakeK = d.mode === 'wake' ? clamp(Math.sin(clamp(d.modeT / WAKE.GROGGY, 0, 1) * Math.PI), 0, 1) : 0;
        const P = this._P || (this._P = { walk: {}, look: {} });
        P.sit = d.sit; P.sleep = d.sleep; P.t = d.t; P.breath = d.mode === 'act' ? 1 : 0.6;
        P.walk.ph = d.walkPh; P.walk.k = d.walkK * (1 - d.sit);
        P.look.yaw = d.look.yaw; P.look.pitch = d.look.pitch;
        const roar = mv && (mv.id === 'roar' || mv.id === 'rage') ? hitK : 0;
        const fireOn = mv?.id === 'fire' ? (k < M.hit ? wind : k < M.hit + FIRE.TIME ? 1 : 1 - after) : 0;
        const ballOn = mv?.id === 'ball' ? hitK : 0;
        P.jaw = Math.max(roar, fireOn * (k >= (M?.hit ?? 0) ? 1 : 0.3), ballOn, wakeK * 0.8, d.strain * 0.4);
        P.maw = Math.max(fireOn, ballOn * 1.2, d.mode === 'sleep' ? 0.12 + 0.08 * Math.sin(d.t * 0.9) : 0.2);
        P.inhale = mv && (mv.id === 'fire' || mv.id === 'ball') && k < M.hit ? wind : 0;
        P.fireAim = mv?.id === 'fire' && k >= M.hit ? -0.25 : 0;
        P.armL = arm('L'); P.armR = arm('R');
        P.clap = mv?.id === 'clap' ? (k < M.hit ? wind : 1 - after) : 0;
        P.lean = mv?.id === 'fist' || mv?.id === 'grab' ? hitK * 0.8 : mv?.id === 'rage' ? 0.6 : 0;
        P.strain = d.strain;
        P.stomp = mv?.id === 'stomp' ? (k < M.hit ? wind : Math.max(0, 1 - after * 3)) * (k < M.hit ? 1 : 0) : 0;
        P.stretch = wakeK;
        P.eyes = d.eyes;
        poseDiabolos(m, P);
    }

    _chain(dt) {
        const d = this.d, m = this.model, g = this.game;
        if (!this.chainMesh) return;
        const me = g.character?.group?.position;
        if (me && Math.hypot(me.x - d.x, me.z - d.z) > CHAIN_NEAR && this.rope.ready) return; // (далеко: цепь лежит, как легла)
        m.updateMatrixWorld(true);
        const h = eyeletWorld(m, _h);
        const a = d.anchor;
        // земля под звеньями — раз в кадр по каждому (верёвка спрашивает массив, а не землю 14 раз за шаг)
        const R = this.rope, n = R.n;
        if (!R.ready) R.lay(a, h, (x, z) => this._ground(x, z, d.y));
        for (let i = 0; i <= n; i++) this._gy[i] = this._ground(R.p[i * 3], R.p[i * 3 + 2], d.y);
        R.step(dt, a, h, this._gy);
        // звенья: каждое между двумя точками, через одно повёрнуто на 90° (продеты друг в друга)
        for (let i = 0; i < n; i++) {
            R.at(i, _v); R.at(i + 1, _w);
            const dir = _u.subVectors(_w, _v);
            const L = dir.length() || 1;
            dir.multiplyScalar(1 / L);
            _q.setFromUnitVectors(_y, dir);
            if (i % 2) _q.multiply(_qr90);
            _a.addVectors(_v, _w).multiplyScalar(0.5);
            _m.compose(_a, _q, _s);
            this.chainMesh.setMatrixAt(i, _m);
        }
        this.chainMesh.instanceMatrix.needsUpdate = true;
        // звон: по скорости звеньев и натяжению
        this._clank = (this._clank || 0) - dt;
        if (this._clank <= 0 && (R.speed > 1.2 || (d.strain > 0.8 && d.move?.id === 'rage'))) {
            this._clank = 0.35 + Math.random() * 0.4;
            const at = R.at(Math.floor(n * (0.3 + Math.random() * 0.6)), _v);
            g.sound?.playDevil?.(at, 'chain', Math.min(1.4, 0.4 + R.speed * 0.15 + d.strain * 0.5));
        }
    }

    _sounds(d, dt) {
        const g = this.game, me = g.character?.group?.position;
        if (!me) return;
        const dist = Math.hypot(me.x - d.x, me.z - d.z);
        // тема босса: тихо во сне рядом, сильно в бою
        const near = clamp(1 - (dist - 150) / 400, 0, 1);
        g.sound?.devilTheme?.(near * (d.mode === 'sleep' || d.mode === 'sit' ? 0.25 : 1), d.mode !== 'sleep' && d.mode !== 'sit');
        if (d.mode === 'sleep') {
            d.snoreT -= dt;
            if (d.snoreT <= 0) {
                d.snoreT = 4.2 + Math.random() * 1.6;
                g.sound?.playDevil?.(this.model.position, 'snore', 1.3, 0.9 + Math.random() * 0.15);
                // дым из ноздрей на выдохе
                const fx = g.fx;
                if (fx?.smoke) { mouthWorld(this.model, _a); for (let i = 0; i < 10; i++) fx.smoke.spawn(_a.x + (Math.random() - 0.5) * 3, _a.y + 2, _a.z, (Math.random() - 0.5) * 2, 1.5 + Math.random(), -2 - Math.random() * 2, i % 2 ? 0x3a302c : 0x5a4a44, 2.5 + Math.random() * 2, 3, { shrink: -0.8 }); }
            }
        }
        // шаги: копыто встало — топот, тремор
        if (d.walkK > 0.3 && d.sit < 0.2) {
            const side = Math.sin(d.walkPh) > 0 ? 1 : 0;
            if (side !== d.stepSide) {
                d.stepSide = side;
                const hp = hoofWorld(this.model, side ? 'L' : 'R', _a);
                g.sound?.playDevil?.(hp, 'step', 1.2, 0.9 + Math.random() * 0.15);
                this._tremor(d, hp, 60, 0.35);
                if (g.fx?.smoke) for (let i = 0; i < 8; i++) g.fx.smoke.spawn(hp.x + (Math.random() - 0.5) * 8, hp.y, hp.z + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, 1 + Math.random() * 2, (Math.random() - 0.5) * 6, 0x5a4638, 3 + Math.random() * 3, 1.8, { shrink: -0.6 });
                if (this.auth && d.walkK > 0.5) g.creatureImpact?.spellArea?.('DiabolosSlam', null, (c) => { const dx = c.x - hp.x, dz = c.z - hp.z, dd = Math.hypot(dx, dz); return dd < 30 && dd > 0.01 && !c.isDiabolos ? new THREE.Vector3(dx / dd * 3, 0, dz / dd * 3) : null; }, { from: hp.clone(), toss: 1, down: 0.5 });
            }
        }
    }

    _sound(id, wind = false) {
        const g = this.game, p = this.model?.position;
        if (!p) return;
        if (wind) {
            if (id === 'fire' || id === 'ball') g.sound?.playDevil?.(p, 'inhale', 1.3);
            else if (id === 'roar' || id === 'rage') g.sound?.playDevil?.(p, 'roar', 1.5);
            return;
        }
        if (id === 'rage') g.sound?.playDevil?.(p, 'roar', 1.5, 1.05);
    }

    // ================================================================ сеть
    _send() {
        const d = this.d, g = this.game;
        if (!d || !g.sync?.diabolos || !(g.remotes?.size)) return;
        const m = d.move;
        g.sync.diabolos({ e: 'st', r: [r2(d.x), r2(d.y), r2(d.z), r2(d.yaw), STATES.indexOf(d.mode), m ? MOVE_IDS.indexOf(m.id) : -1, m ? r2(m.t) : 0, m?.side === 'L' ? 0 : 1, r2(d.strain), r2(d.fury), d.target ?? '',
            m ? r2(m.aim.x) : 0, m ? r2(m.feet ?? m.aim.y) : 0, m ? r2(m.aim.z) : 0, m?.sweep ?? 1] });
    }
    /** (гость) Сообщение хоста / (хост) просьба гостя. */
    onNet(m, from, isHost = this.auth) {
        if (!m) return;
        const g = this.game;
        switch (m.e) {
            case 'st': {
                if (isHost || !this.d || !Array.isArray(m.r)) return;
                const [x, y, z, yaw, si, mi, mt, sd, strain, fury, tgt, ax, ay, az, sw] = m.r;
                const d = this.d;
                d.nx = +x; d.ny = +y; d.nz = +z; d.nyaw = +yaw;
                d.mode = STATES[si] || d.mode; d.strain = +strain || 0; d.fury = +fury || 0; d.target = tgt === '' ? null : tgt;
                const id = MOVE_IDS[mi];
                if (!id) d.move = null;
                else if (!d.move || d.move.id !== id || Math.abs(d.move.t - mt) > 0.6) d.move = { id, t: +mt, hit: +mt >= MOVES[id].hit, side: sd ? 'R' : 'L', aim: new THREE.Vector3(+ax, +ay, +az), feet: +ay, fireT: 0, sweep: +sw || 1, n: 0 };
                else d.move.aim.set(+ax, +ay, +az);
                return;
            }
            case 'b': if (!isHost && this.d && Array.isArray(m.o)) this._addBall(m.id, _v.fromArray(m.o), _w.fromArray(m.v), false); return;
            case 'bx': { if (isHost) return; const b = this.balls.find((x) => x.id === m.id); if (b) { b.p.fromArray(m.p); this._ballGone(b, true); this.balls.splice(this.balls.indexOf(b), 1); this._meBall(b.p); } return; }
            case 'slam': if (!isHost && this.d && Array.isArray(m.p)) { _h.fromArray(m.p); const R = MOVES[m.k]?.wave ?? 20; this._slamFx(_h, R, m.k); this._tremor(this.d, _h, 60, 0.8); this._meSlam(_h, R, m.k); } return;
            case 'grab': if (m.to === g.localId && this.model) this._grabMe(m.s === 'L' ? 'L' : 'R'); return;
            case 'woke': if (m.to === g.localId) g.achievements?.gain?.('devilWoke'); return;
            case 'dist': if (isHost) this.disturb(from ?? m.by, String(m.why || 'потревожили').slice(0, 40)); return;
            case 'hit': if (isHost && this.d) { const v = devilVerdict(m.s); if (v.anger) { this.d.fury = furyAfter(this.d.fury, 10); this.d.stagger = Math.max(this.d.stagger, v.stagger); this.disturb(from ?? m.by, 'по нему попали'); } } return;
            default: return;
        }
    }
    /** (гость) Между строками хоста: тело плавно идёт к присланному, ход доигрывается сам. */
    _follow(d, dt) {
        if (d.nx != null) {
            const k = Math.min(1, dt * 5);
            const dx = d.nx - d.x, dz = d.nz - d.z;
            d.walkK += ((Math.hypot(dx, dz) > 0.05 ? 1 : 0) - d.walkK) * Math.min(1, dt * 3);
            d.walkPh += Math.hypot(dx, dz) * k / 7.5 * Math.PI;
            d.x += dx * k; d.y += (d.ny - d.y) * k; d.z += dz * k;
            let a = d.nyaw - d.yaw; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
            d.yaw += a * k;
        }
        d.modeT += dt;
        if (d.move) {
            const M = MOVES[d.move.id];
            const prev = d.move.t;
            d.move.t += dt;
            if (prev < M.wind * 0.3 && d.move.t >= M.wind * 0.3) this._sound(d.move.id, true);
            if (d.move.id === 'clap' && prev < M.hit && d.move.t >= M.hit) this._clap(d);
            if (d.move.id === 'roar' && prev < M.hit && d.move.t >= M.hit) this._tremor(d, this.model.position, 60, 0.6);
            if (d.move.t >= M.dur) d.move = null;
        }
    }

    // ================================================================ сохранение
    snapshot() { return { woke: !!this.everWoke }; }
    restore(s) { this.everWoke = !!s?.woke; } // (после загрузки он спит: обиды не сохраняются)

    /** Образцы для прогрева шейдеров (Game.prewarm): модель на FarShape, звено, якорь, шар. */
    sampleModels() {
        const m = diabolosModel();
        new FarShape(m).set(true);
        const c = new THREE.InstancedMesh(chainLinkGeo(), chainMaterial(), 2);
        return [m, c, anchorModel(), ballModel()];
    }

    _note(t) {
        this.log.push(t);
        if (this.log.length > 200) this.log.splice(0, 100);
        try { this.game.spellLog?.note?.(t); } catch (_) { /* (журнал не ломает игру) */ }
    }

    dispose() { this._unload(); }
}
const _qr90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

// ------------------------------------------------------------------ шар огня: ядро и оболочка
let _ballGeo = null, _ballMat = null, _ballCore = null;
/** Шар огня: тёмная кора лавы с раскалёнными трещинами (шейдер), внутри — яркое ядро; размер — масштабом (BALL.R). */
export function ballModel() {
    if (!_ballGeo) {
        _ballGeo = new THREE.IcosahedronGeometry(1, 3);
        _ballGeo.userData.keep = true;
        _ballMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
        _ballMat.name = 'diabolos-ball';
        _ballMat.userData.shared = true;
        _ballMat.onBeforeCompile = (sh) => {
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBp = position;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vBp;
float bh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bh(i), bh(i + vec3(1,0,0)), f.x), mix(bh(i + vec3(0,1,0)), bh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(bh(i + vec3(0,0,1)), bh(i + vec3(1,0,1)), f.x), mix(bh(i + vec3(0,1,1)), bh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
                .replace('#include <color_fragment>', `#include <color_fragment>
float n = 0.6 * bn(vBp * 3.0) + 0.4 * bn(vBp * 7.0);
float crack = 1.0 - smoothstep(0.0, 0.08, abs(n - 0.5));
vec3 crust = vec3(0.16, 0.05, 0.02) * (0.6 + n);
vec3 hot = mix(vec3(1.0, 0.45, 0.05), vec3(1.0, 0.95, 0.6), crack);
diffuseColor.rgb = mix(crust, hot, clamp(crack * 1.4 + 0.25, 0.0, 1.0));
diffuseColor.a = 0.97;`);
        };
        _ballMat.customProgramCacheKey = () => 'diabolos-ball';
        _ballCore = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
        _ballCore.name = 'diabolos-ball-glow';
        _ballCore.userData.shared = true;
    }
    const g = new THREE.Group();
    const crust = new THREE.Mesh(_ballGeo, _ballMat);
    const halo = new THREE.Mesh(_ballGeo, _ballCore);
    halo.scale.setScalar(1.35);
    g.add(crust, halo);
    g.visible = false;
    g.name = 'diabolos-ball';
    return g;
}

// ------------------------------------------------------------------ тело для толчков (CreatureImpact): не сдвинуть
registerKind('Y', {
    name: 'diabolos', faces: -1,
    list: (g) => g.diabolos?.list || [],
    get: (g, id) => g.diabolos?.byId(id),
    alive: (c) => !!c && !c.isDead,
    body: () => 'dragon',
    centre: (c, out) => out.set(c.x, c.y + 60, c.z),
    pivot: (c) => ({ obj: c.group, base: c.group?.position.y ?? 0, lie: 0 }),
    head: () => null, arms: () => [], legs: () => [],
    move() {}, toss() {}, hold() {}, frozen: () => false, noKnock: () => true,
    // «не действует»: слишком велик (DiabolosRules.DEVIL_VS.push) — толчок только злит, если это нападение
    immune: (g, c, o) => { if (o?.spell && o.spell !== 'DiabolosSlam' && o.by != null) g.diabolos?.hit(c, 0, o.spell, o.by); return true; },
});
