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
import { GRAB, STUN, DEATH, godStrike, rageTempo, grabPhase, deathPhase } from './DiabolosRules.js';
import { TALK, LINES, SITS, CAT_TALK, pickLine } from './DiabolosTalk.js';
import { DEVIL, WAKE, MOVES, MOVE_IDS, FIRE, BALL, STATES, ChainRope, leash, wakes, planMove, DIRECTOR, devilVerdict, furyAfter,
    inDevilFire, ballSpeed, ballVerdict, ballDamage, sleepDelay, yawTo, FACE_OK, seatFrom } from './DiabolosRules.js';
import { diabolosModel, poseDiabolos, chainLinkGeo, chainMaterial, anchorModel, eyeletWorld, mouthWorld, fistWorld, hoofWorld, devilHeat, devilWound, devilFar, chainGlowMaterial, devilChainLight, devilFireLight, aimArms, JOINTS } from '../entities/DiabolosModel.js';
import { DevilFires } from '../fx/DevilFires.js';
import { Chest } from '../entities/Chest.js';
import { makeDivineSword } from './DivineSword.js';
import { FarShape } from '../core/FarShape.js';
import { registerKind } from './CreatureImpact.js';
import { inHell } from '../world/HellMap.js';
import { ACTS, ACT_IDS, pickAct, actGap, moodFace, moveFace, blendFace } from './DiabolosActs.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _h = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0);
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ID = 'diabolos';
const ROCKS_MAX = 10;    // глыб пинка в воздухе одновременно
const ROCK_R = 2.3;      // м — радиус глыбы (масштаб формы)
const NET_DT = 0.2;
const DEVIL_VOICE = { voiceKey: 'diabolos', role: 'devil', female: false, volume: 1, over: true }; // (бас: роль devil — VoiceCast)      // с между строками состояния хоста
const SEEN_R = 4000;     // м: в аду ближе этого — загружен (виден с плато прибытия и издали; ад теперь без края — дальше не держим)
const PROXY_D = 640;     // м: дальше от камеры — рисуется ближе и меньше в ту же сторону (тот же угол; дальняя плоскость камеры 1000 м)
const POSE_FAR = 420;    // м: дальше — поза реже
const CHAIN_NEAR = 520;  // м: дальше цепь не считается (лежит, как легла)
const CHEST_STYLES = ['iron', 'rich', 'iron', 'rich', 'iron'];

export class Diabolos {
    constructor(game) {
        this.game = game;
        this.site = null;         // {x, z, r, anchor {x,y,z}, len, small}
        this.d = null;            // само существо (пока загружен)
        this.model = null; this.one = null; this.chainMesh = null; this.anchor = null;
        this.rope = new ChainRope();
        this.balls = [];          // шары огня в воздухе {id, p, v, t, mine (хост), dead}
        this._rockPool = [];      // глыбы пинка (ROCKS_MAX)
        this._ballPool = [];      // их меши (не больше BALL.MAX — общие форма и материал)
        this.held = null;         // меня держит в кулаке: {t, side}
        this.everWoke = false;    // сохранение: будили когда-нибудь (ачивка у разбудившего)
        this.log = [];            // (тесты и журнал) что было
        this._sitePoll = 0; this._netT = 0; this._poseT = 0; this._frame = 0;
        this._gy = new Float64Array(201); // (высоты земли под звеньями: звеньев не больше 200)
        this._talkT = 0; this._lines = new Map(); // речь: пауза между репликами, недавние реплики по ситуациям (DiabolosTalk)
        this._told = new Map();   // заклинание → время: «не действует» пишется в журнал не чаще раза в 10 с
        this._ballN = 0;
        this.everDead = false;    // сохранение: убит божественным мечом — навсегда (котловина пуста, цепь лежит, сундуки)
        this._chests = null;
        this._swordGiven = false; // (Творческий: меч у котловины положен в этой игре — не дублировать)
    }
    /** Убит навсегда (божественный меч перестаёт спрашивать — DivineSword). */
    get dead() { return this.everDead; }

    get auth() { return this.game.authority !== false; }
    /** Существо для поиска целей (заряды, удары): пока загружен. */
    targets() { return this.d && this.model && !this.d.dying ? [this.d] : []; }
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
        const g = this.game, T = g.terrain?.data || g.world?.terrain?.data, me = g.character?.group?.position;
        // (TerrainData.hellPlan — HellMap.hellPlan(seed), сделан один раз, ~30 мс: только когда герой у ада, как у Таронов)
        if (T?.hell && me && inHell(me.x, me.z, 600) && T.hellPlan) this.place(T.hellPlan);
    }

    // ================================================================ игроки
    /** Игроки — по НАСТОЯЩЕМУ месту: он видит невидимых (DiabolosRules.SEES_INVISIBLE — g.invis.aiPos тут не спрашивается). */
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
        if (this.everDead) { this._loadRemains(); return; }
        const seed = Math.abs(Math.round(s.x * 7 + s.z * 13)) % 9973;
        // (пол котловины ещё не сделан воркерами — издали: слой пола из плана ада, верх блока = слой + 1; придёт земля — уточнится)
        const gy = this._ground(s.x, s.z, NaN);
        this._yGuess = !Number.isFinite(gy);
        const y = Number.isFinite(gy) ? gy : s.y != null ? s.y + 1 : 0;
        const anchor = { x: s.anchor.x, y: s.anchor.y ?? this._ground(s.anchor.x, s.anchor.z, y) + 2.5, z: s.anchor.z };
        // лицом от якоря (цепь тянется за ним назад)
        const yaw = Math.atan2(-(s.x - anchor.x), -(s.z - anchor.z)); // (вперёд = (−sin, −cos): ОТ столба, к дороге; было «+π» — сидел лицом к столбу, и под Империусом шёл прямо в него)
        this.d = {
            id: ID, isDiabolos: true, ck: 'Y', seed, x: s.x, y, z: s.z, yaw, anchor,
            mode: 'sleep', modeT: 0, sit: 1, sleep: 1, eyes: 0.04, heat: 0.25, fury: 0,
            target: null, grudge: new Map(), lostT: 0, calmT: 0, sleepAt: sleepDelay(seed),
            move: null, rest: 0, cd: { fire: 0, ball: 0, grab: 0, clap: 0, roar: 0, rage: 0, kick: 0 }, recent: [], walkShare: 0.5, walkFor: 0, peek: false, losT: 0, hidden: false, lastSeen: null,
            walkPh: 0, walkK: 0, strain: 0, stagger: 0, look: { yaw: 0, pitch: 0 }, aimDir: new THREE.Vector3(0, 0, -1),
            rage: 0, stunT: 0, dying: null,
            act: null, actNext: 4, lastAct: null, reactT: 0, intimidated: false, wakeWhy: '', rnd: seed * 0.618 % 1,
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
        // («Империус Максима»: глаза того, кто в нём, — перед лицом, а не внутри головы — жалоба автора «вижу текстуры внутри него»)
        this.d.eyeAnchor = new THREE.Object3D();
        this.d.eyeAnchor.position.set(0, 0.06, -0.42);
        m.userData.bones.head.add(this.d.eyeAnchor);
        m.userData.farRadius = DEVIL.SCALE * 3.2; // (сфера отсечения — на ВСЮ гору 122 м: без неё FarShape брал 4 м у ног, и он «мигал», когда ноги уходили с экрана — жалоба автора)
        this.one = new FarShape(m);
        this.one.set(true);
        this.rope = new ChainRope(Math.ceil(this.site.len * 1.12 / DEVIL.LINK_PITCH)); // (звеньев — на длину цепи этой котловины)
        this._makeChain(this.rope.n, true);
        this._fires(y);
        this.anchor = anchorModel();
        this.anchor.position.set(anchor.x, anchor.y - 3, anchor.z);
        g.scene?.add(this.anchor);
        this._pose(0);
        this._note('😈 Дьяволос в мире (спит)');
        this._creativeSword();
    }

    /** Цепь: звенья (InstancedMesh) + ореол божественного света — вторая InstancedMesh с ТЕМИ ЖЕ матрицами (2 отрисовки, без ламп). */
    _makeChain(n, alive) {
        const g = this.game;
        this.chainMesh = new THREE.InstancedMesh(chainLinkGeo(), chainMaterial(), n);
        this.chainMesh.frustumCulled = false; // (звенья по всей котловине: сфера формы им не верна)
        this.chainMesh.castShadow = true; this.chainMesh.receiveShadow = true;
        this.chainMesh.name = 'diabolos-chain';
        g.scene?.add(this.chainMesh);
        this.chainGlow = new THREE.InstancedMesh(chainLinkGeo(), chainGlowMaterial(), n);
        this.chainGlow.instanceMatrix = this.chainMesh.instanceMatrix;
        this.chainGlow.frustumCulled = false;
        this.chainGlow.name = 'diabolos-chain-glow';
        this.chainGlow.renderOrder = 2;
        this.chainGlow.visible = alive;
        g.scene?.add(this.chainGlow);
        if (alive) devilChainLight(1);
    }

    /** Огонь котловины (чаши по кругу, проход к дороге прибытия) — и его отсвет на нём. */
    _fires(y) {
        const s = this.site, sp = this.game.terrain?.data?.hellPlan?.spawn;
        const road = sp ? Math.atan2(sp.z - s.cz, sp.x - s.cx) : Math.atan2(s.z - s.anchor.z, s.x - s.anchor.x);
        (this.fires || (this.fires = new DevilFires(this.game))).build(s.cx ?? s.x, s.cz ?? s.z, s.y != null ? s.y + 1 : y, road);
        devilFireLight(1);
    }

    _unload() {
        const g = this.game;
        this._proxK = 1; devilFar(1);
        if (this.model) {
            this.one?.set(false); this.one?.dispose?.();
            g.scene?.remove(this.model);
            this.model = null; this.one = null;
        }
        if (this.chainMesh) { g.scene?.remove(this.chainMesh); this.chainMesh.dispose?.(); this.chainMesh = null; }
        if (this.chainGlow) { g.scene?.remove(this.chainGlow); this.chainGlow = null; }
        this.fires?.dispose(); devilFireLight(0);
        if (this.anchor) { g.scene?.remove(this.anchor); this.anchor = null; }
        this._dropChests();
        this._remains = false;
        for (const b of this.balls) this._ballGone(b, false);
        this.balls.length = 0;
        for (const m of this._rockPool) g.scene?.remove(m);
        this._rockPool.length = 0;
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
        this.fires?.update(dt, this.game.character?.group?.position);
        if (this.d) this._voiceWarm(dt);
        const ps = this._players();
        let near = Infinity;
        for (const q of ps) { const dd = Math.hypot(q.p.x - this.site.x, q.p.z - this.site.z); near = Math.min(near, inHell(q.p.x, q.p.z) && dd < SEEN_R ? 0 : dd); } // (в аду — виден отовсюду: гора в 122 м над дымкой; автор не нашёл его с плато прибытия в 1250 м)
        if (g.isDeadLocal && !ps.length && this.d) near = Infinity;
        if (this._remains) { if (near > DEVIL.ACTIVE_R * 1.15) this._unload(); return; } // (убит: только цепь, якорь, сундуки)
        if (!this.d) { if (near < DEVIL.ACTIVE_R && (this.site.y != null || Number.isFinite(this._ground(this.site.x, this.site.z, NaN)))) this._load(); else return; }
        else if (near > DEVIL.ACTIVE_R * 1.15 && !this.d.dying) { this._unload(); return; } // (все ушли: засыпает и выгружается — после загрузки он снова спит)
        if (this._remains || !this.d) return;
        const d = this.d;
        d.t += dt;
        if (d.dying) this._dyingTick(d, dt);
        else if (d.imp && g.imperius?.step?.('dv', d, dt)) { if (d.move) this._moveTick(d, dt, null); } // (в нём чужой разум: ходит и бьёт по воле того, кто в нём)
        else if (this.auth) this._think(d, dt, ps);
        else this._follow(d, dt);
        if (!this.d) return; // (умер в этот кадр — останки уже на месте)
        if (this._yGuess) { const gy = this._ground(d.x, d.z, NaN); if (Number.isFinite(gy)) { d.y = gy; this._yGuess = false; } } // (пол котловины пришёл от воркеров)
        this._animate(d, dt);
        this._farProxy(d);
        this._balls(dt);
        if (this.held) this._holdStep(dt);
        this._meHits(d, dt);
        this._sounds(d, dt);
        if (this.auth) { this._netT -= dt; if (this._netT <= 0) { this._netT = NET_DT; this._send(); } }
    }

    // ================================================================ разум (хост)
    _think(d, dt, ps) {
        d.modeT += dt;
        d.reactT = Math.max(0, d.reactT - dt);
        d.rage = Math.max(0, d.rage - STUN.RAGE_DECAY * dt);
        if (d.stunT > 0) { // растерян: вздрагивает, морщится, ревёт от боли — без атаки
            d.stunT -= dt; d.move = null; d.act = null; this._walk(d, 0, null);
            if (d.stunT <= 0) { this._setMode(d, 'stand'); this._say('stunOver', true); }
            return;
        }
        if (d.act) { d.act.t += dt; if (d.act.t >= ACTS[d.act.id].dur) { d.lastAct = d.act.id; d.act = null; this._sendSoon = true; } }
        d.actNext -= dt;
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
        // кто-то из тех, на кого он зол, погиб — торжествует (ачивок за него нет: убить его нельзя, а он — может)
        for (const [id] of d.grudge) {
            const dead = id === this.game.localId ? (this.game.isDeadLocal || this.game.combat?.dead) : this.game.remotes?.get(id)?.dead;
            if (dead) { d.grudge.delete(id); if (!d.move) this._act(d, 'killed', true); this._say('killed', true); }
        }
        switch (d.mode) {
            case 'sleep': d.sit = 1; if (!d.act && d.actNext <= 0) this._act(d, 'sleep'); return;
            case 'wake':
                // просыпается не сразу: один глаз → потягивается/зевает (или сразу обнюхивает того, кто подошёл вплотную)
                if (!d.act) {
                    if (d.modeT < 0.2) this._act(d, 'wake', true, 'wakeOneEye');
                    else if (d.wakeStep !== 2 && d.modeT < 4) { d.wakeStep = 2; this._act(d, /вплотную/.test(d.wakeWhy) ? 'closeLook' : 'wake', true, /вплотную/.test(d.wakeWhy) ? 'sniffClose' : null); }
                    else this._setMode(d, 'stand');
                }
                if (d.modeT > 9) { d.act = null; this._setMode(d, 'stand'); }
                return;
            case 'sit':
                if (d.target) { this._setMode(d, 'wake'); return; }
                if (d.modeT >= d.sleepAt && !d.act) { this._setMode(d, 'sleep'); return; }
                if (!d.act && d.actNext <= 0) this._act(d, 'idle');
                return;
            default: break;
        }
        if (d.move) { this._moveTick(d, dt, tgt); return; }
        if (d.act) { this._walk(d, 0, null); return; } // (пока поступок — стоит; удар подождёт)
        if (!tgt) {
            d.lostT += dt;
            if (d.lostT > DEVIL.LOSE_T || !d.grudge.size) { this._goBack(d, dt); return; }
            this._walk(d, dt, null);
            if (d.actNext <= 0) this._act(d, 'idle'); // (потерял — нюхает воздух, осматривается)
            return;
        }
        d.lostT = 0;
        const dist = Math.hypot(tgt.p.x - d.x, tgt.p.z - d.z);
        // цель за цепью? (копыто не дойдёт до неё — она дальше предела от якоря + досягаемость)
        const fo = this._footOff(d);
        const L = leash(d.anchor.x, d.anchor.z, tgt.p.x - fo.x, tgt.p.z - fo.z, fo.x, fo.z, this.site.len);
        const beyond = L.t >= 1 && L.d >= this.site.len * 0.99 && Math.hypot(tgt.p.x - d.anchor.x, tgt.p.z - d.anchor.z) > this.site.len + DEVIL.RADIUS;
        const turn = yawTo(d.yaw, d.x, d.z, tgt.p.x, tgt.p.z);
        // видит ли цель (раз в 0,5 с: от груди к ней; за скалой/столбом — подходит туда, где видел, и заглядывает)
        d.losT -= dt;
        if (d.losT <= 0) {
            d.losT = 0.5;
            const los = this.game.collision?.lineOfSight?.(d.x, d.y + 40, d.z, tgt.p.x, tgt.p.y, tgt.p.z, 1);
            d.hidden = los === false;
            if (!d.hidden) d.lastSeen = { x: tgt.p.x, z: tgt.p.z };
        }
        d.walkShare += ((d.walkFor > 0 ? 1 : 0) - d.walkShare) * Math.min(1, dt / 20); // (доля ходьбы за ~20 с)
        if (d.stagger > 0) { this._walk(d, 0, null); return; }
        if (d.walkFor > 0) { // идёт: к цели (или туда, где видел) — до ближней полосы или пока не кончился заход
            d.walkFor -= dt;
            const to = d.peek && d.lastSeen ? d.lastSeen : tgt.p;
            const dd = Math.hypot(to.x - d.x, to.z - d.z);
            if (dd < (d.peek ? 24 : DIRECTOR.CLOSE * 0.7) || (beyond && d.strain > 0.85) || (d.peek && !d.hidden)) {
                d.walkFor = 0;
                if (d.peek) { d.peek = false; if (d.hidden) { this._act(d, 'idle', true, 'lookAround'); return; } }
            } else { this._walk(d, dt, to); return; }
        }
        const plan = planMove({ dist, beyond, atLeash: d.strain > 0.85, faced: Math.abs(turn) < FACE_OK, rest: d.rest, cd: d.cd, air: tgt.feet - d.y > 30, high: tgt.feet - d.y > 110,
            hidden: d.hidden && !!d.lastSeen, recent: d.recent, walkShare: d.walkShare, fury: d.fury, rage: d.rage, lastAct: d.lastAct }, () => { d.rnd = (d.rnd * 9301 + 49297) % 233280 / 233280; return d.rnd; });
        // подначки в бою без повода (и мушке в воздухе)
        d.talkIdle = (d.talkIdle ?? TALK.IDLE_EVERY[0]) - dt;
        if (d.talkIdle <= 0) { d.talkIdle = TALK.IDLE_EVERY[0] + d.rnd * (TALK.IDLE_EVERY[1] - TALK.IDLE_EVERY[0]); this._say(tgt.feet - d.y > 30 ? 'fly' : 'idle'); }
        const attack = plan.kind === 'move' && !plan.bluff;
        // характер: перед первым ударом — устрашение; цель за цепью и ему нечем ответить — дразнит (язык, «иди сюда», рвёт цепь)
        if (attack && !d.intimidated) { d.intimidated = true; if (this._act(d, 'intimidate')) return; }
        if (beyond && plan.kind !== 'move' && d.actNext <= 0 && Math.abs(turn) < 0.8) { if (this._act(d, 'taunt')) { this._remember(d, 'act'); this._say(dist > this.site.len + 90 ? 'run' : 'taunt'); return; } }
        switch (plan.kind) {
            case 'turn': case 'wait': this._turn(d, turn, dt); this._walk(d, 0, null); return;
            case 'walk': if (plan.peek) this._say('hide'); d.walkFor = plan.t; d.peek = !!plan.peek; this._remember(d, 'walk'); this._walk(d, dt, d.peek && d.lastSeen ? d.lastSeen : tgt.p); this._note(`😈 Дьяволос: решение — ${d.peek ? 'идёт заглянуть, где вы' : 'идёт к цели'}`); return;
            case 'act': if (this._act(d, 'idle', true, plan.id)) this._remember(d, 'act'); else this._walk(d, 0, null); return;
            default: this._remember(d, plan.bluff ? 'bluff' : plan.id); this._startMove(d, plan.id, tgt, plan.bluff); return;
        }
    }
    /** (хост) Реплика ситуации: бас и текст у всех рядом (сеть — `say`). Не чаще TALK.GAP, важное — всегда. */
    _say(sit, urgent = false) {
        const d = this.d;
        if (!d || !this.auth || !LINES[sit]) return;
        const now = d.t;
        if (!urgent && now - this._talkT < TALK.GAP) return;
        if (urgent && now - this._talkT < 1.2) return; // (не перебивает сам себя на полуслове)
        const last = this._lines.get(sit) || [];
        d.rnd = (d.rnd * 9301 + 49297) % 233280 / 233280;
        const i = pickLine(sit, d.rnd, last);
        if (i < 0) return;
        last.unshift(i); if (last.length > Math.max(1, LINES[sit].length - 1)) last.length = Math.max(1, LINES[sit].length - 1);
        this._lines.set(sit, last);
        this._talkT = now;
        this._speak(sit, i);
        this.game.sync?.diabolos?.({ e: 'say', s: SITS.indexOf(sit), i });
    }
    /**
     * Голос — нейросеть голосов жителей (как у них, басом). Она грузится сама только у замков — в аду их нет, и его реплики шли
     * одним текстом (жалоба автора). Пока он в мире: просим загрузку, а когда готова — заранее делаем его короткие реплики.
     */
    _voiceWarm(dt) {
        this._vwT = (this._vwT || 0) - dt;
        if (this._vwT > 0) return;
        this._vwT = 2;
        const talk = this.game.castleLife?.talk, sp = talk?.speech;
        if (!talk?.voiceOn || !sp) return;
        if (!sp.neural?.ready) { sp.preload?.(); return; }
        if (this._voicePrepared) return;
        this._voicePrepared = true;
        const short = [];
        for (const L of Object.values(LINES)) for (const l of L) if (l.length <= 40) short.push(l);
        sp.prepare?.(short, DEVIL_VOICE);
    }
    /** Сказать у себя: текст внизу экрана и бас (роль `devil` — VoiceCast), если я рядом. */
    _speak(sit, i) {
        const g = this.game, d = this.d, text = LINES[sit]?.[i];
        if (!d || !text) return;
        const me = g.character?.group?.position;
        if (!me || Math.hypot(me.x - d.x, me.z - d.z) > TALK.HEAR_R) return;
        g.hud?.setVoice?.(`😈 Дьяволос: «${text}»`, true);
        const talk = g.castleLife?.talk;
        if (talk?.voiceOn && talk.speech?.supported) { if (!talk.speech.neural?.ready) talk.speech.preload?.(); talk.speech.say(text, { ...DEVIL_VOICE, shout: /!$/.test(text) }); } // (игрок говорит заклинание — реплика ждёт, пока он договорит: не мешает распознаванию)
        this._note(`😈 Дьяволос говорит: «${text}»`);
    }
    /**
     * Под «Империус Максима» (автор: «у него же целый список взаимодействий»): всё, что умеет он сам, — по телу того, кто в нём.
     *  ноги: шаг/бег на месте — идёт по котловине (на своей цепи), поворот тела — поворот;
     *  руки: его руки повторяют ваши (плечо, локоть, кулак — `aimArms`);
     *  взмах рукой вперёд/вниз — удар кулаком (той рукой), рука вытянута и кулак сжат — хватает (кто у кисти — того и схватил),
     *  ладони сошлись — хлопок огнём, прыжок — топот копытом; долгое «У» — струя огня;
     *  голосом: «огонь», «шар», «пинок», «рёв», «ярость» — эти его ходы (heardOrder).
     */
    driven(d, I, dt) {
        if (!d || d.dying) return;
        d.mode = d.move ? 'act' : 'walk'; d.sit = Math.max(0, d.sit - dt); d.target = null; d.act = null;
        for (const k in d.cd) d.cd[k] = Math.max(0, d.cd[k] - dt);
        this._ctlArms = I.armsPose || null;
        if (Number.isFinite(I.yaw)) { let a = I.yaw - d.yaw; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; this._turn(d, a, dt * 2.2); } // (по воле того, кто в нём, — поворот вдвое живее)
        const walking = (I.walk || 0) > 0.02 && !d.move;
        if (walking) this._walkAhead(d, dt, I.run ? 1.35 : 1);
        else this._walk(d, 0, null);
        if (d.move) return;
        const ahead = this._ahead(d, 45);
        const A = I.armsPose, order = this._order; this._order = null;
        if (order && !(d.cd[order] > 0)) { this._startMove(d, order, this._aimFor(d, order) || ahead); this._note(`😈 по воле того, кто в нём: ${order}`); return; }
        if (I.fire?.start && !(d.cd.fire > 0)) { this._startMove(d, 'fire', ahead); d.cd.fire = 8; return; } // (только начало долгого «У»: ответ «воя» есть всегда — раньше он сам дышал огнём каждые 8 с и стоял)
        if (I.jump && !(d.cd.stomp > 0)) { d.cd.stomp = 2; this._startMove(d, 'stomp', ahead); return; }
        if (A?.left?.ha && A?.right?.ha && !(d.cd.clap > 0)) { // (ладони сошлись перед грудью — хлопок)
            const gap = A.left.ha.distanceTo(A.right.ha), was = this._clapGap ?? gap;
            this._clapGap = gap;
            if (gap < 0.28 && was - gap > 0.04 && A.left.ha.z < A.left.sh.z - 0.15) { d.cd.clap = 3; this._startMove(d, 'clap', ahead); return; }
        }
        if (A && !(d.cd.grab > 0)) for (const side of ['left', 'right']) { // (рука вытянута вперёд, кулак сжался — хват)
            const a = A[side];
            if (!a?.ha || a.seen === false) continue;
            const reach = a.ha.distanceTo(a.sh), fwd = a.sh.z - a.ha.z;
            const was = this._curl?.[side] ?? a.curl;
            (this._curl || (this._curl = {}))[side] = a.curl;
            if (reach > 1.35 && fwd > 0.9 && a.curl > 0.75 && was < 0.6) {
                d.cd.grab = 6;
                const tg = this._aimFor(d, 'grab') || ahead;
                this._startMove(d, 'grab', tg);
                d.move.side = side === 'left' ? 'L' : 'R';
                return;
            }
        }
        if (I.strikeNow) { I.strikeNow = false; const tg = this._aimFor(d, 'fist') || ahead; this._startMove(d, 'fist', tg); }
    }
    /** Шаг вперёд по взгляду (на своей цепи; столб обходит). */
    _walkAhead(d, dt, k = 1) {
        const to = this._ahead(d, 30);
        const w = DEVIL.WALK; DEVIL.WALK = w * k;
        try { this._walk(d, dt, to); } finally { DEVIL.WALK = w; }
    }
    _ahead(d, r) { return { id: null, x: d.x - Math.sin(d.yaw) * r, z: d.z - Math.cos(d.yaw) * r, p: new THREE.Vector3(d.x - Math.sin(d.yaw) * r, d.y, d.z - Math.cos(d.yaw) * r), feet: d.y }; }
    /** Кого бить/хватать по воле того, кто в нём: ближайший игрок перед ним в досягаемости хода (не сам вселившийся — его тело стоит). */
    _aimFor(d, id) {
        const M = MOVES[id], by = d.imp?.by;
        let best = null, bd = Infinity;
        for (const q of this._players()) {
            if (q.id === by) continue;
            const dist = Math.hypot(q.p.x - d.x, q.p.z - d.z);
            if (dist > (M?.reach ?? 60) + 10) continue;
            if (Math.abs(yawTo(d.yaw, d.x, d.z, q.p.x, q.p.z)) > 0.9) continue;
            if (dist < bd) { bd = dist; best = q; }
        }
        return best;
    }
    /** Его ходы голосом того, кто в нём. → true (фраза — приказ ему, не заклинание). */
    heardOrder(text) {
        const s = String(text || '').toLowerCase();
        const id = /огон|огнём|пламя|fire|дыхни/.test(s) ? 'fire' : /шар|ball|плюнь|плюй/.test(s) ? 'ball' : /пин|kick|камн|глыб/.test(s) ? 'kick'
            : /рёв|рев|рычи|ори|roar|ррр/.test(s) ? 'roar' : /ярост|rage|бей землю/.test(s) ? 'rage' : /хлоп|clap/.test(s) ? 'clap' : /топ|stomp|раздав/.test(s) ? 'stomp' : null;
        if (!id) return false;
        this._order = id;
        return true;
    }
    /** Чужой разум ушёл (вырвался / отпустили): смотрит вокруг и злится на того, кто был в голове. */
    freed(d) {
        if (!d) return;
        d.move = null; d.walkFor = 0;
        if (this.auth) { d.mode = 'stand'; d.modeT = 0; }
    }
    /** (компьютер того, кто в нём) Вырвался сам: ярость на этого игрока и реплика. */
    brokeFree(by) {
        const d = this.d;
        if (!d) return;
        if (!this.auth) { this.game.sync?.diabolos?.({ e: 'dist', by, why: 'вырвался из-под Империуса' }); return; }
        d.grudge.set(by, { t: DEVIL.GRUDGE_T * 2, why: 'был в его голове' });
        d.rage = Math.min(1, d.rage + 0.4);
        this._say('broke', true);
    }
    /** Память последних ходов (режиссёр не повторяет один ход больше 2 раз подряд). */
    _remember(d, id) { d.recent.unshift(id); if (d.recent.length > 6) d.recent.length = 6; }

    _setMode(d, mode) {
        if (d.mode === mode) return;
        d.mode = mode; d.modeT = 0;
        if (mode === 'sit') { d.sleepAt = sleepDelay(d.seed + d.t); d.intimidated = false; this._act(d, 'sitDown', true); }
        if (mode === 'wake') d.wakeStep = 0;
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
            d.wakeWhy = why;
            this._setMode(d, d.mode === 'back' ? 'stand' : 'wake');
            this._say('woke', true);
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

    /** Шаг к точке (или стоит): прямо (бог не обходит мелочь у ног); цепь держит копыто у предела, столб — обходит. */
    _walk(d, dt, to) {
        if (!to || dt <= 0) { d.walkK = Math.max(0, d.walkK - dt * 1.5); d.strain = Math.max(0, d.strain - dt); return; }
        const dx = to.x - d.x, dz = to.z - d.z, dist = Math.hypot(dx, dz) || 1;
        const ang = yawTo(d.yaw, d.x, d.z, to.x, to.z);
        this._turn(d, ang, dt);
        if (Math.abs(ang) > 1.1) return; // (сначала развернуться всем телом)
        const sp = DEVIL.WALK * (1 - 0.5 * Math.min(1, Math.abs(ang)));
        // (бог ростом 122 м идёт прямо: общий «пилот» обхода принимал уступы земли, чаши огня и людей у ног за стены — и он еле полз
        //  (замер в игре: 1,3 м/с вместо 5,2). Держат его только цепь и столб; люди у ног — под копытом)
        const sx = dx / dist * sp * dt, sz = dz / dist * sp * dt;
        const fo = this._footOff(d);
        const L = leash(d.anchor.x, d.anchor.z, d.x + sx, d.z + sz, fo.x, fo.z, this.site.len);
        // мягкая пружина: у грани шаг вязнет, у предела — стоит (цепь держит копыто)
        const k = 1 - 0.85 * L.t;
        d.x += (L.x - d.x) * k; d.z += (L.z - d.z) * k;
        // столб цепи — сквозь него не проходит (обходит боком)
        const px = d.x - d.anchor.x, pz = d.z - d.anchor.z, pd = Math.hypot(px, pz), keep = DEVIL.PILLAR_R + DEVIL.RADIUS;
        if (pd < keep) { // (упёрся в столб — выталкивает на край и ведёт вдоль него, в ту сторону, куда шёл: обходит, а не стоит)
            const kk = keep / (pd || 1); d.x = d.anchor.x + (pd ? px * kk : keep); d.z = d.anchor.z + pz * kk;
            const nx = (d.x - d.anchor.x) / keep, nz = (d.z - d.anchor.z) / keep, side = (sx * nz - sz * nx) >= 0 ? 1 : -1, st = Math.hypot(sx, sz);
            d.x += nz * side * st; d.z += -nx * side * st;
        }
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
        const want = Math.atan2(-(s.x - d.anchor.x), -(s.z - d.anchor.z)); // (лицом от столба)
        let a = want - d.yaw; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
        if (Math.abs(a) > 0.1) { this._turn(d, a, dt); return; }
        d.grudge.clear();
        this._setMode(d, 'sit');
    }

    // ---- ходы
    _startMove(d, id, tgt, bluff = false) {
        const M = MOVES[id];
        d.move = { id, bluff, t: 0, hit: false, to: tgt.id, aim: tgt.p.clone(), feet: tgt.feet, side: Math.random() < 0.5 ? 'L' : 'R', n: 0, fireT: 0, sweep: Math.random() < 0.5 ? -1 : 1 };
        d.mode = 'act'; d.modeT = 0;
        const T = rageTempo(d.rage); // (ярость от божественного: чаще, ближе, дольше)
        if (id === 'fire') { d.cd.fire = (18 - 6 * d.fury) * T.cd; d.move.fireLen = FIRE.TIME * T.fireTime; }
        if (id === 'ball') d.cd.ball = (6 - 2 * d.fury) * T.cd; // (шары — реже: не «одно и то же»)
        if (id === 'grab') d.cd.grab = GRAB.CD * T.grabCd;
        if (id === 'clap') d.cd.clap = 9;
        if (id === 'roar') d.cd.roar = bluff ? 7 : 12;
        if (id === 'kick') d.cd.kick = 5;
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
        if (m.id === 'grab' && m.victim != null && prev < M.laugh && m.t >= M.laugh) this._say('crush', true);
        if (m.id === 'fire' && m.t >= M.hit && m.t < M.hit + (m.fireLen || FIRE.TIME)) this._fireStep(d, m, dt);
        if (m.id === 'rage') { d.strain = 1; if (Math.floor(prev / 0.9) !== Math.floor(m.t / 0.9) && m.t > 0.5) this._slam(d, hoofWorld(this.model, m.n++ % 2 ? 'R' : 'L', _a), MOVES.rage.wave, 'rage'); }
        if (m.id === 'fire' && m.fireLen > FIRE.TIME && m.t >= M.dur - 0.01 && m.t < M.hit + m.fireLen + 0.5) { /* (дольше струя) */ }
        if (m.t >= M.dur + (m.id === 'fire' ? Math.max(0, (m.fireLen || FIRE.TIME) - FIRE.TIME) : 0)) { d.move = null; d.rest = M.rest * (1 - 0.35 * d.fury) * rageTempo(d.rage).rest; d.mode = 'walk'; this._sendSoon = true; }
    }

    /** (хост) Миг удара: куда пришлось — то и задето (игроков ранит их компьютер — _meHits по ходу из состояния). */
    _strike(d, m) {
        const g = this.game;
        switch (m.id) {
            case 'fist': this._slam(d, fistWorld(this.model, m.side, _a).setY(d.y), MOVES.fist.wave, 'fist'); break;
            case 'stomp': this._slam(d, hoofWorld(this.model, 'R', _a), MOVES.stomp.wave, 'stomp'); break;
            case 'clap': this._clap(d); break;
            case 'roar': g.castleLife?.alarm?.(this.model.position, 'devil', null, 220); if (!m.bluff) this._tremor(d, this.model.position, 60, 0.6); break; // (блеф: рёв и рывок вперёд — без удара)
            case 'kick': this._kickRocks(d, m); break;
            case 'ball': this._spitBall(d, m); break;
            case 'grab': {
                if (m.to == null) break;
                const q = this._players().find((x) => x.id === m.to);
                // (замах был виден 2 с: в миг хвата цель должна быть у кисти — шаг в сторону, и промах)
                if (!q || Math.hypot(q.p.x - _a.copy(fistWorld(this.model, m.side, _a)).x, q.p.z - _a.z) > GRAB.CATCH_R) { m.missed = true; this._note('😈 Дьяволос: хват — промах'); break; }
                m.victim = q.id;
                this._say('grab', true);
                if (q.local) this._grabMe(m.side, MOVES.grab.crush - MOVES.grab.hit); else g.sync?.diabolos?.({ e: 'grab', to: q.id, s: m.side, c: r2(MOVES.grab.crush - MOVES.grab.hit) });
                this._note(`😈 Дьяволос: решение — схватил ${q.local ? 'вас' : q.id}`);
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
    /** (хост) Пинок: копыто подбрасывает глыбы базальта дугой к цели (разброс по месту цели; шаг в сторону — промах). */
    _kickRocks(d, m) {
        const K = MOVES.kick, o0 = hoofWorld(this.model, 'R', _a).clone();
        o0.y = this._ground(o0.x, o0.z, d.y) + 4;
        this._slamFx(o0, 14, 'kick');
        for (let i = 0; i < K.n; i++) {
            if (this._rocks() >= ROCKS_MAX) break;
            const ax = m.aim.x + (Math.random() - 0.5) * K.r * 2.4, az = m.aim.z + (Math.random() - 0.5) * K.r * 2.4;
            const o = _u.set(o0.x + (Math.random() - 0.5) * 6, o0.y + Math.random() * 3, o0.z + (Math.random() - 0.5) * 6);
            const dx = ax - o.x, dz = az - o.z, hd = Math.hypot(dx, dz) || 1;
            const T = 1.1 + hd / 70 + Math.random() * 0.35; // (высокая дуга: видно, куда летит)
            const ty = (m.feet ?? m.aim.y) + 0.5;
            const v = new THREE.Vector3(dx / T, (ty - o.y) / T + 0.5 * BALL.GRAVITY * T, dz / T);
            const id = ++this._ballN;
            this._addBall(id, o, v, true, true);
            this.game.sync?.diabolos?.({ e: 'b', id, rk: 1, o: [r2(o.x), r2(o.y), r2(o.z)], v: [r2(v.x), r2(v.y), r2(v.z)] });
        }
    }
    _rocks() { let n = 0; for (const b of this.balls) if (b.rock) n++; return n; }
    _addBall(id, o, v, mine, rock = false) {
        if (rock) {
            const b = { id, rock: true, p: o.clone(), v: v.clone(), t: 0, mine, mesh: this._rockMesh(), trail: 0, spin: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4) };
            b.mesh.position.copy(o); b.mesh.visible = true;
            const s = ROCK_R * (0.7 + Math.random() * 0.6); b.mesh.scale.set(s, s * (0.75 + Math.random() * 0.3), s * (0.8 + Math.random() * 0.4)); b.r = s;
            this.balls.push(b);
            return;
        }
        const b = { id, p: o.clone(), v: v.clone(), t: 0, mine, mesh: this._ballMesh(), trail: 0 };
        b.mesh.position.copy(o);
        b.mesh.visible = true;
        this.balls.push(b);
        this.game.sound?.playDevil?.(o, 'ball', 1.1);
        this.game.fx?.lightFlash?.(o, 0xff7a1a, 3, 0.25, 60);
    }
    _rockMesh() {
        let m = this._rockPool.find((x) => !x.visible);
        if (m) return m;
        m = rockModel();
        this.game.scene?.add(m);
        this._rockPool.push(m);
        return m;
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
            if (b.rock) {
                b.mesh.rotation.x += b.spin.x * dt; b.mesh.rotation.y += b.spin.y * dt; b.mesh.rotation.z += b.spin.z * dt;
                b.trail -= dt;
                if (b.trail <= 0 && fx?.smoke) { b.trail = 0.07; fx.smoke.spawn(b.p.x, b.p.y, b.p.z, 0, 0.6, 0, 0x3a2a22, 1.6, 1.1, { shrink: -1 }); }
                let hit = b.t > BALL.LIFE || b.p.y < this._ground(b.p.x, b.p.z, -1e9) + b.r * 0.6;
                const coll = g.collision;
                if (!hit && coll?.lineOfSight && coll.lineOfSight(_v.x, _v.y, _v.z, b.p.x, b.p.y, b.p.z, 0.5) === false) hit = true;
                if (!hit) for (const q of this._players()) { _w.set(q.p.x, q.p.y - 0.8, q.p.z); if (_w.distanceTo(b.p) < b.r + 1.4) { hit = true; break; } }
                if (hit) this._rockLand(b);
                continue;
            }
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
    /** Глыба упала: пыль, осколки, гул; ломает немного камня (хост), ранит моего игрока рядом (каждый — своего). */
    _rockLand(b, tell = true) {
        const g = this.game, p = b.p, fx = g.fx;
        b.mesh.visible = false;
        const i = this.balls.indexOf(b); if (i >= 0) this.balls.splice(i, 1);
        g.sound?.playDevil?.(p, 'step', 0.7, 1.4);
        if (fx?.smoke) for (let k = 0; k < 10; k++) fx.smoke.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 8, 2 + Math.random() * 4, (Math.random() - 0.5) * 8, 0x4a3a30, 3, 1.4, { shrink: -1.4 });
        if (fx?.glow) for (let k = 0; k < 14; k++) fx.glow.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 16, 4 + Math.random() * 8, (Math.random() - 0.5) * 16, 0xff6a1a, 0.6 + Math.random() * 0.6, 0.5, { shrink: -1 });
        if (this.auth) {
            g.explode?.(p.clone(), 2.2, ID, 0.6);
            if (tell) g.sync?.diabolos?.({ e: 'bx', id: b.id, p: [r2(p.x), r2(p.y), r2(p.z)] });
        }
        const me = g.character?.group?.position;
        if (!me || g.isDeadLocal || g.combat?.dead) return;
        const K = MOVES.kick, dist = Math.hypot(me.x - p.x, me.y - 0.8 - p.y, me.z - p.z);
        if (dist > K.r) return;
        const push = _u.set(me.x - p.x, 0, me.z - p.z).normalize().multiplyScalar(8 * (1 - dist / K.r)).setY(3);
        if ((g.combat?.shieldFactor?.(p) ?? 0) >= 1) { g.knockback?.add?.(push.clone().multiplyScalar(0.3)); return; } // (камень — не заклинание: щит держит его бесплатно, как снежок)
        this._hurtMe(Math.round(K.dmg * (1 - dist / K.r * 0.6)), 'melee', p, push.clone(), `🪨 Глыба из-под копыта Дьяволоса!`);
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
        if (shield === 'gods') { if (this.auth && this.d) this._act(this.d, 'surprised', true); return; } // (шар не взял золотую защиту — удивлён)
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

    // ---- хват и раздавливание (GRAB): держит перед мордой, хохочет, сжимает кулак
    /** Меня схватили: crushIn — через сколько с раздавит. Щиты, вихри, дары, устойчивость, мантия не спасают. */
    _grabMe(side, crushIn = 7.4) {
        const g = this.game;
        if (g.isDeadLocal || g.combat?.dead || this.held) return;
        // слетает с седла / с дракона, полёт прерван, «Империус» отпускает разум в своё тело — его и держат
        try { g.animals?.riding && g.animals.dismount?.(); } catch (_) { /* */ }
        try { g.dragonRide?.busy && g.dragonRide.stop?.('grab'); } catch (_) { /* */ }
        try { g.imperius?.busy && g.imperius.stop?.('grab'); } catch (_) { /* */ }
        g.flight?.land?.('grab');
        this.held = { t: 0, side, crushIn, last: null, said: 0 };
        g.hud?.setVoice?.('😈 Дьяволос схватил вас! Колдовать в его кулаке нельзя', true);
        g.sound?.playDevil?.(fistWorld(this.model, side, _a), 'roar', 1, 1.15);
    }
    _holdStep(dt) {
        const g = this.game, h = this.held, me = g.character.group.position;
        if (!this.model || !this.d || this.d.dying || g.isDeadLocal || g.combat?.dead) { this._release('drop'); return; }
        // вернулся по метке / телепорт: тело не там, где кулак его держал — хват сорван
        if (h.last && me.distanceTo(h.last) > 30) { this.held = null; return; }
        h.t += dt;
        const p = fistWorld(this.model, h.side, _a);
        me.set(p.x, p.y + 1, p.z);
        (h.last || (h.last = new THREE.Vector3())).copy(me);
        if (h.said === 0 && h.t > h.crushIn - 2.2) { h.said = 1; g.hud?.setVoice?.('😈 Дьяволос хохочет, сжимая кулак…', true); g.cameraShake?.(0.25, 2); }
        if (h.t >= h.crushIn) this._crushMe();
    }
    _crushMe() {
        const g = this.game, c = g.combat;
        this.held = null;
        g.sound?.playDevil?.(g.character.group.position, 'crack', 1.5, 0.7);
        if (c?.enabled) c.die(ID, 'devilCrush');
        else { // (Творческий: смерти нет — выпускает с уроном)
            g.damageLocalPlayer?.(GRAB.CREATIVE_DMG);
            this._dropToGround();
            g.hud?.setVoice?.(`😈 Дьяволос сжал кулак: −${GRAB.CREATIVE_DMG}`, true);
        }
    }
    /** Хват сорван (оторопь от божественного, смерть, отключение): жертва падает к земле под кистью — удар о землю. */
    _release(why = 'drop') {
        const g = this.game;
        if (!this.held) return;
        this.held = null;
        if (why === 'drop' && !g.isDeadLocal && !g.combat?.dead) {
            this._dropToGround();
            const dmg = Math.round(30 * GRAB.FALL_DMG);
            if (g.combat?.enabled) g.combat.damage(dmg, ID, 'fall'); else g.damageLocalPlayer?.(dmg);
            g.hud?.setVoice?.(`😈 Дьяволос выронил вас! −${dmg}`, true);
        }
    }
    _dropToGround() {
        const g = this.game, me = g.character.group.position;
        me.y = this._ground(me.x, me.z, me.y - 100) + 1.95 + 0.5;
    }
    /** Меня держат: тело ведёт кулак (Game: физика героя выключена, как в лапах паучихи). */
    get holding() { return !!this.held; }

    // ================================================================ характер: поступки (DiabolosActs)
    /** (хост) Начать поступок ситуации `sit` (или прямо `id`). force — даже если таймер не дошёл. → начат ли. */
    _act(d, sit, force = false, id = null) {
        if (!d || d.move) return false;
        if (!force && d.actNext > 0) return false;
        d.rnd = (d.rnd * 9301 + 49297) % 233280 / 233280; // (детерминированный выбор: тот же мир — тот же характер)
        const pick = id || pickAct(sit, d.rnd, d.lastAct);
        if (!pick) return false;
        d.act = { id: pick, t: 0, snd: 0, fx: 0 };
        d.actNext = ACTS[pick].dur + actGap(sit, (d.rnd * 7.13) % 1);
        this._sendSoon = true;
        this._note(`😈 Дьяволос: ${ACTS[pick].ru}`);
        return true;
    }
    /** (хост) Реакция на удар по категории (DEVIL_VS): над слабым смеётся, огнём наслаждается, божественное жалит. Не чаще раза в 7 с. */
    _react(d, cat, wasAwake) {
        if (!wasAwake || d.reactT > 0 || d.move) return;
        d.reactT = 7;
        const sit = cat === 'fire' ? 'hitFire' : cat === 'gods' ? 'hitDivine' : 'hitWeak';
        this._act(d, sit, true);
    }

    // ================================================================ попадания по нему (все места поиска целей)
    /** Заряд дуэли (Duel, вид 'Y'). */
    boltHit(c, spell, by) { this._struck(spell, by); }
    /** Удар/заклинание по существу. */
    hit(c, dmg, spell, by) { this._struck(spell, by, dmg); }
    /** Взрыв/волна рядом: попал ли по телу. */
    hitAt(pos, r, dmg, spell, by) {
        const d = this.d;
        if (!d || by === ID || !pos) return false;
        if (this.nearest(pos, _v).distanceTo(pos) > r) { this.noise(pos, by); return false; }
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
        const wasAwake = d.mode !== 'sleep' && d.mode !== 'sit';
        this.disturb(by, 'по нему попали');
        const gs = godStrike(spell, d.rnd);
        if (gs) { this._stun(d, gs, by); return; }
        this._react(d, v.cat, wasAwake);
        if (wasAwake && by != null && by !== ID) this._say(CAT_TALK[v.cat] || 'blast'); // (особенно троллит, когда его пытаются уничтожить)
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
    /** Ближайшая к точке `at` точка его тела (капсула: ноги… плечи) — взрыв у копыт попадает, а не «мимо середины в 70 м над землёй». */
    nearest(at, out) {
        const c = this._capsule(this._cap2 || (this._cap2 = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }));
        const d = this.d, foot = d.y + 2; // (копыта и голени — тоже тело: низ капсулы опускается до земли)
        const y = clamp(at.y, foot, c.b.y);
        out.set(c.a.x, y, c.a.z);
        const dx = at.x - out.x, dz = at.z - out.z, h = Math.hypot(dx, dz);
        const r = y < c.a.y ? DEVIL.RADIUS * 0.7 : c.r;
        if (h > 1e-6) { const k = Math.min(r, h) / h; out.x += dx * k; out.z += dz * k; }
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

    /** Вдали (камера дальше PROXY_D): он рисуется ближе в k раз и во столько же раз меньше, в ту же сторону — тот же силуэт под тем же углом,
     *  а дальняя плоскость камеры (1000 м) его не режет; туман шейдер считает по настоящему расстоянию (devilFar). Логика берёт d.x/d.y/d.z —
     *  а позицию модели _animate ставит заново каждый кадр; ближе PROXY_D всё как есть (бой, огонь, хват — только вблизи). */
    _farProxy(d) {
        const m = this.model, cam = this.game.camera;
        if (!m || !cam) return;
        const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
        const D = Math.hypot(m.position.x - cx, m.position.y + 60 - cy, m.position.z - cz);
        const k = D > PROXY_D ? PROXY_D / D : 1;
        if (k < 1) m.position.set(cx + (m.position.x - cx) * k, cy + (m.position.y - cy) * k, cz + (m.position.z - cz) * k);
        if (k !== this._proxK) { m.scale.setScalar(DEVIL.SCALE * k); this._proxK = k; }
        devilFar(1 / k);
    }

    _visible() {
        const cam = this.game.camera;
        if (!cam || !this.model) return true;
        _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        _fr.setFromProjectionMatrix(_pm);
        const k = this._proxK || 1, m = this.model;
        _sph.center.set(m.position.x, m.position.y + 60 * k, m.position.z); _sph.radius = 110 * k; // (вдали — там, где нарисован)
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
        const wakeK = 0; // (пробуждение играют поступки: один глаз, потягивается, зевает — DiabolosActs)
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
        P.kick = mv?.id === 'kick' ? (k < M.hit ? -0.35 * wind : Math.max(0, 1 - after * 1.6)) * (k < M.hit ? 1 : 1) : 0; // (замах ногой назад, потом пинок вперёд)
        P.stretch = wakeK;
        P.eyes = d.eyes;
        // мимика: настроение, поверх — ход боя или поступок
        const mood = d.mode === 'sleep' ? 'sleep' : d.strain > 0.6 ? 'strain' : mv ? 'attack' : d.target != null ? 'angry' : 'calm';
        let face = moodFace(mood, d.t);
        if (mv) face = blendFace(face, moveFace(mv.id, k / (M.dur || 1)), 1);
        P.actW = 0; P.head = null; P.shake = 0; P.shrug = 0; P.tail = 0;
        const ac = d.act && ACTS[d.act.id];
        if (ac) {
            const ak = Math.min(1, d.act.t / ac.dur);
            const w = Math.min(1, ak / 0.12, (1 - ak) / 0.12);
            face = blendFace(face, ac.face(ak, d.t), w);
            const b = ac.body(ak, d.t) || {};
            P.actW = w;
            for (const key in b) {
                if (key === 'armL' || key === 'armR') P[key] = b[key];
                else if (key === 'head') P.head = b.head;
                else if (key === 'heat') d.heat = Math.max(d.heat, b.heat);
                else if (typeof b[key] === 'number') P[key] = (key in P && typeof P[key] === 'number' ? P[key] * (1 - w) : 0) + b[key] * w;
            }
        }
        P.squeezeL = 0; P.squeezeR = 0;
        if (mv?.id === 'grab' && k >= M.hit) face = this._grabPose(d, mv, k, P, face);
        if (d.mode === 'stun' && d.stunT > 0) face = this._stunPose(d, P, face);
        if (d.dying) face = this._dyingPose(d, P);
        P.face = face;
        poseDiabolos(m, P);
        // («Империус Максима»: руки повторяют руки того, кто в нём — пока нет его собственного удара/хвата)
        if (d.imp?.mine && this._ctlArms && !d.move) aimArms(m, this._ctlArms, 0.85);
    }

    /** Хват: кулак у морды, пальцы сжимаются, хохот, раздавил. */
    _grabPose(d, mv, k, P, face) {
        const M = MOVES.grab, ph = grabPhase(k), side = mv.side || 'R';
        const up = Math.min(1, (k - M.hit) / (M.lift - M.hit));
        const arm = { rot: { sx: 0.9 + 1.05 * up, ab: -0.2 * up, tw: 0.2, el: 0.6 + 1.15 * up, ha: 0.3 } };
        P[side === 'L' ? 'armL' : 'armR'] = arm; P.actW = 1;
        const sq = ph === 'crush' ? 1 : ph === 'laugh' ? 0.45 + 0.1 * Math.sin(d.t * 14) : ph === 'hold' ? 0.25 + 0.15 * Math.max(0, Math.sin(d.t * 3)) : 0.1;
        P[side === 'L' ? 'squeezeL' : 'squeezeR'] = sq;
        P.head = { yaw: (side === 'L' ? 0.25 : -0.25) * up, pitch: -0.15 * up + (ph === 'laugh' ? 0.35 : 0), roll: ph === 'hold' ? 0.15 * Math.sin(d.t * 0.8) : 0 };
        if (ph === 'hold') return blendFace(face, { lid: 0.8, brow: 0.5, browR: 0.4, tilt: 0.3, snarl: 0.4, ear: 0.8, pupil: 0.6, tongue: 0.4 * Math.max(0, Math.sin(d.t * 1.3)), lick: 0.6 }, 1);
        if (ph === 'laugh') { P.shake = 1; P.jaw = 0.5 + 0.3 * Math.abs(Math.sin(d.t * 11)); return blendFace(face, { lid: 0.35, brow: 0.7, tilt: -0.3, snarl: 0.6, ear: 0.5 }, 1); }
        if (ph === 'crush') { P.jaw = 0.2; return blendFace(face, { lid: 0.9, brow: -1, snarl: 1, ear: -0.8, nostril: 1, pupil: 0.4 }, 1); }
        return face;
    }
    /** Растерян (божественное): морщится, жмурится, отшатывается, трясёт головой — без атаки. */
    _stunPose(d, P, face) {
        const t = d.t;
        P.lean = -0.35 + 0.15 * Math.sin(t * 7); P.shake = 0.5;
        P.head = { yaw: 0.3 * Math.sin(t * 9), pitch: 0.2, roll: 0.2 * Math.sin(t * 6) };
        P.armL = { rot: { sx: 1.2, ab: 0.2, el: 1.7, ha: -0.4 } }; P.armR = { rot: { sx: 1.0, ab: 0.4, el: 1.2, ha: -0.6 } }; P.actW = 0.8;
        P.jaw = 0.6 + 0.2 * Math.sin(t * 5);
        return blendFace(face, { lid: 0.15, brow: -0.6, tilt: 0.7, snarl: 0.7, ear: -1, nostril: 1, pupil: 1.5 }, 1);
    }
    /** Смерть по фазам (DEATH): удивлён → хватается за рану, ревёт → на колени → рассыпается. */
    _dyingPose(d, P) {
        const D = d.dying, t = D.t, ph = deathPhase(t);
        P.actW = 1; P.walk.k = 0;
        if (ph === 'shock') {
            P.head = { pitch: -0.5 * Math.min(1, t * 2), yaw: 0, roll: 0 }; P.lean = -0.2; P.jaw = 0.4;
            P.armL = { rot: { sx: 0.6, ab: 0.5, el: 1.0, ha: -0.5 } }; P.armR = { rot: { sx: 0.6, ab: 0.5, el: 1.0, ha: -0.5 } };
            return { lid: 1, brow: 1, tilt: 0.7, ear: 1, pupil: 1.6, snarl: 0 };
        }
        if (ph === 'agony') {
            const r = Math.sin(t * 3.1);
            P.armL = { rot: { sx: 0.5 + 0.12 * r, ab: -0.5, el: 1.35, ha: 0.7 } }; P.armR = { rot: { sx: 0.5 - 0.12 * r, ab: -0.45, el: 1.4, ha: 0.7 } }; // (держится за рану на брюхе)
            P.lean = 0.3 + 0.2 * r; P.shake = 0.8; P.jaw = 0.65 + 0.3 * Math.abs(Math.sin(t * 2.3)); P.maw = 0.7 + 0.3 * Math.random();
            P.head = { pitch: 0.35 * Math.max(0, Math.sin(t * 1.7)), yaw: 0.3 * Math.sin(t * 2.2), roll: 0.2 * Math.sin(t * 1.4) };
            return { lid: 1, brow: -0.4, tilt: 0.8, snarl: 1, ear: -1, nostril: 1, pupil: 1.4 };
        }
        const fall = Math.min(1, (t - 6) / 4);
        P.sit = Math.max(P.sit, 0.72 * fall); P.lean = 0.6 * fall; P.breath = 1;
        P.armL = { rot: { sx: 0.7 + 0.5 * (ph === 'ash' ? 1 : 0), ab: ph === 'ash' ? 0.9 : -0.3, el: ph === 'ash' ? 0.4 : 1.4, ha: 0.2 } };
        P.armR = { rot: { sx: 0.4, ab: ph === 'ash' ? 0.9 : 0.1, el: ph === 'ash' ? 0.4 : 0.9, ha: 0.2 } };
        P.head = ph === 'ash' ? { pitch: 0.6, yaw: 0, roll: 0 } : { pitch: -0.4 * fall, yaw: 0.1 * Math.sin(t), roll: 0.15 * fall };
        P.jaw = ph === 'ash' ? 0.8 : 0.3 + 0.15 * Math.sin(t * 1.5);
        return ph === 'ash' ? { lid: 0.2, brow: 0.5, tilt: 0.5, snarl: 0.2, ear: -0.5, pupil: 1 } : { lid: 0.45 - 0.2 * fall, brow: 0.3, tilt: 0.8, snarl: 0.3, ear: -0.8, nostril: 0.5 };
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
        const ac = d.act && ACTS[d.act.id];
        if (ac) {
            const ak = d.act.t / ac.dur;
            // (счётчик — отдельно: `g.sound?.…(…++)` без звука не вычислил бы аргумент — цикл без конца)
            while (ac.snd && d.act.snd < ac.snd.length && ak >= ac.snd[d.act.snd].t) { const kind = ac.snd[d.act.snd].k; d.act.snd++; g.sound?.playDevil?.(mouthWorld(this.model, _a), kind, 1.2); }
            while (ac.fx && d.act.fx < ac.fx.length && ak >= ac.fx[d.act.fx].t) { const kind = ac.fx[d.act.fx].k; d.act.fx++; this._actFx(kind); }
        }
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

    /** Частицы поступков: дым из ноздрей, из пасти, кольца дыма. */
    _actFx(kind) {
        const fx = this.game.fx;
        if (!fx?.smoke || !this.model) return;
        const o = mouthWorld(this.model, _a);
        const yaw = this.d.yaw, fx0 = -Math.sin(yaw), fz0 = -Math.cos(yaw);
        if (kind === 'smokeRing') {
            // кольцо: 14 клубов по кругу, летят вперёд-вверх вместе
            for (let i = 0; i < 14; i++) {
                const a = i / 14 * Math.PI * 2, rx = Math.cos(a) * 3, ry = Math.sin(a) * 3;
                fx.smoke.spawn(o.x + fz0 * rx, o.y + 3 + ry, o.z - fx0 * rx, fx0 * 6, 2.5, fz0 * 6, 0x6a5a54, 2.2, 4, { shrink: -0.4 });
            }
            return;
        }
        const n = kind === 'mouthSmoke' ? 18 : 10;
        for (let i = 0; i < n; i++) fx.smoke.spawn(o.x + (Math.random() - 0.5) * 3, o.y + (kind === 'mouthSmoke' ? 0 : 2.5), o.z + (Math.random() - 0.5) * 3,
            fx0 * (3 + Math.random() * 3), 1.5 + Math.random() * 2, fz0 * (3 + Math.random() * 3), i % 2 ? 0x3a302c : 0x5a4a44, 2.5 + Math.random() * 2, 3, { shrink: -0.8 });
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

    // ================================================================ сильнейшее божественное: оторопь, потом ярость (STUN)
    _stun(d, gs, by) {
        d.stunT = Math.max(d.stunT, gs.stun);
        d.rage = Math.min(1, d.rage + gs.rage);
        d.move = null; d.act = null;
        if (by != null) d.grudge.set(by, { t: DEVIL.GRUDGE_T * 1.5, why: 'божественное' });
        this._setMode(d, 'stun');
        // держал кого-то — роняет (единственный честный шанс спасти схваченного)
        for (const q of this._players()) if (q.local && this.held) this._release('drop');
        this.game.sync?.diabolos?.({ e: 'drop' });
        for (const [id] of this.game.remotes || []) this.game.sync?.diabolos?.({ e: 'drop', to: id });
        this.game.sound?.playDevil?.(this.model.position, 'pain', 1.6);
        this._say('stun', true);
        this._note(`😈 Дьяволос растерян (${gs.stun.toFixed(1)} с), ярость ${Math.round(d.rage * 100)}%`);
    }

    // ================================================================ божественный меч: единственная смерть (DEATH)
    /**
     * Где отрезок a–b (лезвие или путь летящего меча за кадр) касается тела → точка (Vector3) или null. Контракт с DivineSword.js.
     */
    bladeHit(a, b) {
        const d = this.d;
        if (!d || d.dying || !this.model) return null;
        const cap = this._capsule(this._cap || (this._cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }));
        // ближайшие точки двух отрезков (лезвие и ось тела)
        const u = _u.subVectors(b, a), v = _h.subVectors(cap.b, cap.a), w0 = _w.subVectors(a, cap.a);
        const A = u.dot(u), B = u.dot(v), C = v.dot(v), D = u.dot(w0), E = v.dot(w0), den = A * C - B * B;
        let sc = den > 1e-9 ? clamp((B * E - C * D) / den, 0, 1) : 0, tc = C > 1e-9 ? clamp((A * E - B * D) / den || E / C, 0, 1) : 0;
        if (den <= 1e-9) tc = C > 1e-9 ? clamp(E / C, 0, 1) : 0;
        sc = A > 1e-9 ? clamp((B * tc - D) / A, 0, 1) : 0;
        const p = new THREE.Vector3().copy(a).addScaledVector(u, sc), q = _v.copy(cap.a).addScaledVector(v, tc);
        return p.distanceTo(q) <= cap.r + 0.5 ? p : null;
    }
    /** Пронзили божественным мечом (DivineSword: в руке или вонзился залпом). Обычный клинок сюда не попадает. */
    pierce(point, by, { via = 'hand' } = {}) {
        const d = this.d, g = this.game;
        if (!d || d.dying || this.everDead || !point) return false;
        if (by === 'local') by = g.localId;
        if (!this.auth) { g.sync?.diabolos?.({ e: 'pierce', p: [r2(point.x), r2(point.y), r2(point.z)], by, via }); return true; }
        this._note(`😈 Дьяволос: решение — пронзён божественным мечом (${via === 'swarm' ? 'залпом' : 'в руке'}) — умирает`);
        this._startDying(d, point, by, 0);
        g.sync?.diabolos?.({ e: 'die', w: [r2(point.x), r2(point.y), r2(point.z)], by, t: 0 });
        if (by === g.localId) g.achievements?.gain?.(DEATH.ACH); else if (by != null) g.sync?.diabolos?.({ e: 'slain', to: by });
        return true;
    }
    _startDying(d, point, by, t0) {
        d.dying = { t: t0, by, wound: this.model.worldToLocal(point.clone()), nextSlam: 1.4, nextFire: 1.8, chainT: 3.2, flash: false, ash: 0 };
        d.move = null; d.act = null; d.stunT = 0; d.mode = 'dying';
        this._say('dying', true);
        if (this.held) this._release('drop'); // (держал игрока — роняет)
        this.balls.forEach((b) => this._ballGone(b, false)); this.balls.length = 0;
        this.game.castleLife?.alarm?.(this.model.position, 'devil', null, 400); // (Тароны, горгульи — пугаются: Danger)
        this.game.sound?.playDevil?.(this.model.position, 'pain', 1.8, 0.9);
    }
    /** Таймлайн смерти: одинаково у всех (хост начал, гости — по сообщению «die»). */
    _dyingTick(d, dt) {
        const D = d.dying, g = this.game, p = this.model.position;
        D.t += dt;
        const t = D.t, ph = deathPhase(t);
        d.modeT += dt;
        // рана расходится по телу светом (шейдер: фронт от точки удара), к пеплу — тело растворяется
        const front = 0.12 + Math.max(0, t - 0.6) * 0.24, glow = Math.min(1, 0.4 + t / 10), dissolve = clamp((t - 14.5) / 5, 0, 1);
        devilWound(D.wound, front, glow, dissolve);
        if (ph === 'agony') {
            if (t >= D.nextSlam) { D.nextSlam = t + 0.9 + Math.random() * 0.6; this._slamFx(hoofWorld(this.model, Math.random() < 0.5 ? 'L' : 'R', _a), 22, 'rage'); if (this.auth) g.explode?.(_a.clone(), 6, ID, 1); g.sound?.playDevil?.(p, 'pain', 1.4, 0.95 + Math.random() * 0.1); }
            if (t >= D.nextFire) { D.nextFire = t + 1.1 + Math.random(); const a = Math.random() * Math.PI * 2; this._flameBurst(mouthWorld(this.model, _a).clone(), _w.set(Math.cos(a), 0, Math.sin(a)), 70, 0.8); g.sound?.playDevil?.(p, 'fire', 0.9); }
        }
        if (t >= D.chainT && !this.rope.free) { this.rope.free = true; g.sound?.playDevil?.(eyeletWorld(this.model, _a), 'chainBreak', 1.6); this._note('😈 Дьяволос: цепь лопнула'); }
        if (this.rope.free) { const k = Math.max(0, 1 - (t - D.chainT) / 4); devilChainLight(k); if (this.chainGlow) this.chainGlow.visible = k > 0.01; } // (цепь лопнула — божественный свет гаснет за 4 с)
        if (ph === 'fall' || ph === 'ash') {
            // осыпается золой и светом; рога трескаются (искры у рогов)
            const fx = g.fx;
            if (fx?.glow) for (let i = 0; i < 4; i++) {
                const y = d.y + (0.4 + Math.random() * 2.6) * DEVIL.SCALE * (1 - d.sit * 0.35);
                fx.glow.spawn(d.x + (Math.random() - 0.5) * 40, y, d.z + (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 3, 3 + Math.random() * 5, (Math.random() - 0.5) * 3, Math.random() < 0.6 ? 0xffe2a0 : 0x6a5a50, 1.5 + Math.random() * 3, 2.5, { shrink: -0.6, spin: 2 });
            }
            if (Math.random() < dt * 1.5 && fx?.spark) fx.spark(_w.set(d.x, d.y + 3.6 * DEVIL.SCALE, d.z), 0xfff0c0, 1, _u.set((Math.random() - 0.5) * 20, 10, (Math.random() - 0.5) * 20), 1.2);
            if (Math.random() < dt * 0.5) g.sound?.playDevil?.(p, 'crack', 1.2, 0.6);
        }
        if (ph === 'ash' && !D.flash) {
            D.flash = true;
            g.fx?.lightFlash?.(_w.set(d.x, d.y + 60, d.z), 0xfff4d0, 10, 1.2, 400);
            this._tremor(d, p, 300, 1.4);
            g.sound?.playDevil?.(p, 'boom', 1.8, 0.7);
        }
        if (ph === 'ash' && g.fx?.glow) for (let i = 0; i < 10; i++) { // столб светящегося пепла вверх
            const a = Math.random() * Math.PI * 2, r = Math.random() * 30 * (1 - dissolve * 0.5);
            g.fx.glow.spawn(d.x + Math.cos(a) * r, d.y + Math.random() * 120, d.z + Math.sin(a) * r, Math.cos(a) * 2, 18 + Math.random() * 20, Math.sin(a) * 2, Math.random() < 0.7 ? 0xfff2c8 : 0xffb050, 2 + Math.random() * 3, 3, { shrink: -0.5, spin: 1 });
        }
        if (t >= DEATH.T) this._died(d);
    }
    _died(d) {
        const g = this.game;
        this.everDead = true;
        g.sound?.playDevil?.(this.model.position, 'sigh', 1.6, 0.6); // (последний выдох — потом тишина)
        g.sound?.devilTheme?.(0, false);
        devilWound(null, 0, 0, 0);
        this._note('😈 Дьяволос мёртв — из пепла остались сундуки');
        const keepRope = this.rope;
        this._unload();
        this.rope = keepRope;
        this._loadRemains();
    }
    /** Убит: столб, цепь лежит (сорвана с копыта), сундуки из пепла. */
    _loadRemains() {
        const g = this.game, s = this.site;
        this._remains = true;
        // (пол котловины ещё не сделан воркерами — издали: слой пола из плана ада, верх блока = слой + 1; придёт земля — уточнится)
        const gy = this._ground(s.x, s.z, NaN);
        this._yGuess = !Number.isFinite(gy);
        const y = Number.isFinite(gy) ? gy : s.y != null ? s.y + 1 : 0;
        const anchor = { x: s.anchor.x, y: s.anchor.y ?? y + 2.5, z: s.anchor.z };
        this.anchor = anchorModel(); this.anchor.position.set(anchor.x, anchor.y - 3, anchor.z); g.scene?.add(this.anchor);
        // цепь: лежит от кольца в сторону места, где он сидел
        const R = this.rope.ready ? this.rope : new ChainRope(Math.ceil(this.site.len * 1.12 / DEVIL.LINK_PITCH));
        R.free = true;
        if (!R.ready) R.lay(anchor, { x: s.x, y: y + 0.6, z: s.z }, (x, z) => this._ground(x, z, y));
        for (let i = 0; i < 240; i++) R.step(1 / 60, anchor, null, (x, z) => this._ground(x, z, y));
        this.rope = R;
        this._makeChain(R.n, false); devilChainLight(0); // (мёртв: цепь лопнула и погасла)
        this._fires(y);
        this._linksFrom(R);
        this._makeChests(y);
    }
    _linksFrom(R) {
        for (let i = 0; i < R.n; i++) {
            R.at(i, _v); R.at(i + 1, _w);
            const dir = _u.subVectors(_w, _v); const L = dir.length() || 1; dir.multiplyScalar(1 / L);
            _q.setFromUnitVectors(_y, dir); if (i % 2) _q.multiply(_qr90);
            _a.addVectors(_v, _w).multiplyScalar(0.5); _m.compose(_a, _q, _s); this.chainMesh.setMatrixAt(i, _m);
        }
        this.chainMesh.instanceMatrix.needsUpdate = true;
    }
    /** Сундуки босса (правило «боссы всегда с сундуками»): самое ценное — сильнейшие пентаграммы, высшие вещи, ключ (Items.lootChest 'diabolos'). */
    _makeChests(y) {
        const g = this.game, s = this.site;
        if (this._chests || !g.scene) return;
        this._chests = [];
        for (let i = 0; i < DEATH.CHESTS; i++) {
            const a = (i / DEATH.CHESTS) * Math.PI * 2 + 0.4, x = s.x + Math.cos(a) * DEATH.CHEST_R, z = s.z + Math.sin(a) * DEATH.CHEST_R;
            const cy = this._ground(x, z, y);
            const chest = new Chest(g.scene, new THREE.Vector3(x, cy, z), 'loot', Math.atan2(s.x - x, s.z - z), 'devilChest' + i, { scale: 3, style: CHEST_STYLES[i % CHEST_STYLES.length] });
            chest.room = 'diabolos';
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision?.addBox?.(chest.getCollisionBox());
            if (g._openedChests?.has(chest.id)) chest.setOpenInstant?.();
            g.chests?.push(chest);
            this._chests.push(chest);
            g.fx?.lightFlash?.(_v.set(x, cy + 2, z), 0xffe0a0, 3, 0.6, 40);
        }
    }
    _dropChests() {
        const g = this.game;
        for (const c of this._chests || []) {
            if (c.isOpen) (g._openedChests = g._openedChests || new Set()).add(c.id);
            if (c.boxId != null) g.collision?.removeBox?.(c.boxId);
            c.dispose?.();
            const i = g.chests?.indexOf(c);
            if (i >= 0) g.chests.splice(i, 1);
        }
        this._chests = null;
    }
    /** Творческий: у края котловины, в 25 м от его места, на земле — божественный меч (один; унесли — в этой игре не появится снова). */
    /** Божественный меч Творческого, пока лежит на земле (не в руке, не в сумке): {x, z} — для миникарты (HellGate.mapMarks). */
    swordMark() {
        const g = this.game;
        if (g.config?.mode !== 'creative') return null;
        const w = (g.weapons?.weapons || []).find((x) => x.id === 'divine-creative');
        if (!w || w.holder || !w.position || w.removed) return null;
        return w.position;
    }
    _creativeSword() {
        const g = this.game, s = this.site;
        if (this._swordGiven || g.config?.mode !== 'creative' || !this.auth) return;
        if ((g.weapons?.weapons || []).some((w) => w.id === 'divine-creative')) { this._swordGiven = true; return; }
        const a = Math.atan2(s.x - s.anchor.x, s.z - s.anchor.z) + Math.PI / 2;
        const x = s.x + Math.sin(a) * 25, z = s.z + Math.cos(a) * 25;
        try { makeDivineSword(g, x, this._ground(x, z, s.y ?? 0) + 0.3, z, { id: 'divine-creative', hover: false, yaw: a }); this._swordGiven = true; } catch (e) { console.warn('divine sword', e); }
    }

    // ================================================================ сеть
    _send() {
        const d = this.d, g = this.game;
        if (!d || !g.sync?.diabolos || !(g.remotes?.size)) return;
        const m = d.move;
        g.sync.diabolos({ e: 'st', r: [r2(d.x), r2(d.y), r2(d.z), r2(d.yaw), STATES.indexOf(d.mode), m ? MOVE_IDS.indexOf(m.id) : -1, m ? r2(m.t) : 0, m?.side === 'L' ? 0 : 1, r2(d.strain), r2(d.fury), d.target ?? '',
            m ? r2(m.aim.x) : 0, m ? r2(m.feet ?? m.aim.y) : 0, m ? r2(m.aim.z) : 0, m?.sweep ?? 1, d.act ? ACT_IDS.indexOf(d.act.id) : -1, d.act ? r2(d.act.t) : 0, r2(d.rage)] });
    }
    /** (гость) Сообщение хоста / (хост) просьба гостя. */
    onNet(m, from, isHost = this.auth) {
        if (!m) return;
        const g = this.game;
        switch (m.e) {
            case 'say': if (!isHost) this._speak(SITS[m.s], m.i); return;
            case 'st': {
                if (isHost || !this.d || this.d.dying || !Array.isArray(m.r)) return;
                const [x, y, z, yaw, si, mi, mt, sd, strain, fury, tgt, ax, ay, az, sw, ai, at] = m.r;
                const d = this.d;
                const aid = ACT_IDS[ai];
                if (!aid) d.act = null;
                else if (!d.act || d.act.id !== aid || Math.abs(d.act.t - at) > 0.6) {
                    // (пришёл посреди поступка: уже прошедшие звуки не играем разом)
                    const A = ACTS[aid], k0 = (+at || 0) / A.dur;
                    d.act = { id: aid, t: +at || 0, snd: (A.snd || []).filter((x) => x.t < k0).length, fx: (A.fx || []).filter((x) => x.t < k0).length };
                }
                d.nx = +x; d.ny = +y; d.nz = +z; d.nyaw = +yaw;
                d.mode = STATES[si] || d.mode; d.strain = +strain || 0; d.fury = +fury || 0; d.target = tgt === '' ? null : tgt;
                d.rage = +m.r[17] || 0; d.stunT = d.mode === 'stun' ? Math.max(d.stunT, 0.3) : 0;
                const id = MOVE_IDS[mi];
                if (!id) d.move = null;
                else if (!d.move || d.move.id !== id || Math.abs(d.move.t - mt) > 0.6) d.move = { id, t: +mt, hit: +mt >= MOVES[id].hit, side: sd ? 'R' : 'L', aim: new THREE.Vector3(+ax, +ay, +az), feet: +ay, fireT: 0, sweep: +sw || 1, n: 0 };
                else d.move.aim.set(+ax, +ay, +az);
                return;
            }
            case 'b': if (!isHost && this.d && Array.isArray(m.o)) this._addBall(m.id, _v.fromArray(m.o), _w.fromArray(m.v), false, !!m.rk); return;
            case 'bx': { if (isHost) return; const b = this.balls.find((x) => x.id === m.id); if (b?.rock) { b.p.fromArray(m.p); this._rockLand(b, false); return; } if (b) { b.p.fromArray(m.p); this._ballGone(b, true); this.balls.splice(this.balls.indexOf(b), 1); this._meBall(b.p); } return; }
            case 'slam': if (!isHost && this.d && Array.isArray(m.p)) { _h.fromArray(m.p); const R = MOVES[m.k]?.wave ?? 20; this._slamFx(_h, R, m.k); this._tremor(this.d, _h, 60, 0.8); this._meSlam(_h, R, m.k); } return;
            case 'grab': if (m.to === g.localId && this.model) this._grabMe(m.s === 'L' ? 'L' : 'R'); return;
            case 'woke': if (m.to === g.localId) g.achievements?.gain?.('devilWoke'); return;
            case 'dist': if (isHost) this.disturb(from ?? m.by, String(m.why || 'потревожили').slice(0, 40)); return;
            case 'hit': if (isHost && this.d && !this.d.dying) { const v = devilVerdict(m.s); if (v.anger) { const aw = this.d.mode !== 'sleep' && this.d.mode !== 'sit'; this.d.fury = furyAfter(this.d.fury, 10); this.d.stagger = Math.max(this.d.stagger, v.stagger); this.disturb(from ?? m.by, 'по нему попали'); const gs = godStrike(m.s, this.d.rnd); if (gs) this._stun(this.d, gs, from ?? m.by); else this._react(this.d, v.cat, aw); } } return;
            case 'drop': if (m.to === g.localId) this._release('drop'); return;
            case 'pierce': if (isHost && Array.isArray(m.p)) this.pierce(_v.fromArray(m.p), from ?? m.by, { via: m.via }); return;
            case 'die': if (!isHost && this.d && !this.d.dying && Array.isArray(m.w)) this._startDying(this.d, _v.fromArray(m.w), m.by, +m.t || 0); return;
            case 'slain': if (m.to === g.localId) g.achievements?.gain?.(DEATH.ACH); return;
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
        if (d.stunT > 0) d.stunT -= dt;
        if (d.act) { d.act.t += dt; if (d.act.t >= ACTS[d.act.id].dur) d.act = null; }
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
    snapshot() { return { woke: !!this.everWoke, ...(this.everDead ? { dead: true } : {}) }; }
    restore(s) { this.everWoke = !!s?.woke; this.everDead = !!s?.dead; } // (после загрузки он спит: обиды не сохраняются; убит — навсегда)

    /** Образцы для прогрева шейдеров (Game.prewarm): модель на FarShape, звено, якорь, шар. */
    sampleModels() {
        const m = diabolosModel();
        new FarShape(m).set(true);
        const c = new THREE.InstancedMesh(chainLinkGeo(), chainMaterial(), 2);
        const cg = new THREE.InstancedMesh(chainLinkGeo(), chainGlowMaterial(), 2);
        return [m, c, cg, ...DevilFires.samples(), anchorModel(), ballModel(), rockModel()];
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

// ------------------------------------------------------------------ глыба пинка: базальт с прожилками жара
let _rockGeo = null, _rockMat = null;
/** Глыба из-под копыта: неровный многогранник (вершины сдвинуты шумом), тёмный базальт со сколами и тлеющими прожилками (шейдер). */
export function rockModel() {
    if (!_rockGeo) {
        _rockGeo = new THREE.IcosahedronGeometry(1, 1);
        const P = _rockGeo.attributes.position, col = [];
        for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
            const n = 0.72 + 0.5 * Math.abs(Math.sin(x * 5.1 + y * 3.7) * Math.cos(z * 4.3 - x * 2.1));
            P.setXYZ(i, x * n, y * n * 0.86, z * n);
            const k = 0.12 + 0.1 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
            col.push(k * 1.25, k * 0.95, k * 0.85);
        }
        _rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        _rockGeo.computeVertexNormals();
        _rockGeo.userData.keep = true;
        _rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x000000 });
        _rockMat.name = 'diabolos-rock';
        _rockMat.userData.shared = true;
        _rockMat.onBeforeCompile = (sh) => {
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRp = position;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vRp;
float rh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rh(i), rh(i + vec3(1,0,0)), f.x), mix(rh(i + vec3(0,1,0)), rh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rh(i + vec3(0,0,1)), rh(i + vec3(1,0,1)), f.x), mix(rh(i + vec3(0,1,1)), rh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
                .replace('#include <color_fragment>', `#include <color_fragment>
float rN = 0.6 * rn(vRp * 4.0) + 0.4 * rn(vRp * 11.0);
diffuseColor.rgb *= 0.7 + 0.6 * rN;`)
                .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float rC = 1.0 - smoothstep(0.0, 0.05, abs(rn(vRp * 2.6 + vec3(3.1)) - 0.5));
totalEmissiveRadiance += vec3(1.0, 0.35, 0.05) * rC * 0.9;`);
        };
        _rockMat.customProgramCacheKey = () => 'diabolos-rock';
    }
    const m = new THREE.Mesh(_rockGeo, _rockMat);
    m.castShadow = true;
    m.visible = false;
    m.name = 'diabolos-rock';
    return m;
}

