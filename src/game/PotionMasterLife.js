/**
 * PotionMasterLife.js — Мастер зелий Эрдвин в «Логове зельевара»: игровая часть (правила, слова и рецепты — PotionMaster.js).
 *
 * Он обычный житель (как Тихон у входа в Творческий — CreativeGuest.js: тот же мозг, голос, тело, коллизии, приказы), стоит у котла.
 * Сам варит: разжигает огонь («Fire»), наливает воду («Waterbollow»), ждёт кипения, берёт ингредиенты С ПОЛОК заклинанием «Вингардиум
 * Левиоса» (вещь поднимается, летит дугой над котёл — палочка ведёт её, искры следом — и отпускается над водой: падает сама, котёл
 * считает её как любую брошенную вещь), ждёт готовности, наливает колбу и кладёт её перед игроком. «Помоги» — готовит огонь и воду и
 * рассказывает рецепт, бросает игрок.
 *
 * Что может пойти не так (учтено):
 *  - игрок схватил вещь в полёте / взял с полки → берётся (или создаётся) другая, до 3 попыток на вещь;
 *  - котёл занят чужим зельем / жижей / пуст / не кипит → выливает старое, наливает воду, ждёт кипения (≤ 75 с, потом — «не закипает»);
 *  - костёр потушили посреди варки → разжигает снова; вода кончилась (вылили) → подливает;
 *  - слова «стоп» / игрок ушёл / мастера убили / место уснуло → работа отменяется без следа (вещи в полёте падают);
 *  - две просьбы сразу → «я занят»; нет котла → говорит; другой игрок (сеть) → правила хоста, гость слышит его речь как обычно;
 *  - его убили → при следующем входе в логово он снова на месте (это песочница);
 *  - три рецепта подряд — котёл каждый раз начинает с чистого.
 */

import * as THREE from 'three';
import { LAIR, racks as lairRacks } from '../world/PotionLairPlan.js';
import { CAULDRON, addWater, addIngredient, surfaceY, takePortion, boiling, newBrew, potionItem } from './Potions.js';
import { newUid } from './ItemTypes.js';
import { MASTER, LINES, FALLBACK, parseIntent, planOf, recipeLine, recipeAnswer, knownLine, hintLine, ingName, whereLine, ingredientsLine } from './PotionMaster.js';
import { lairIngredients, stockFor } from './PotionLair.js';

export const LAIR_SITE_ID = 'potionlair';
const CAULDRON_ID = 'potion_lair_cauldron';
const H = CAULDRON.H;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

const pick = (x) => (Array.isArray(x) ? x[Math.floor(Math.random() * x.length)] : x);
const ease = (k) => k * k * (3 - 2 * k);

/** Место для CastleLife (kind 'guest': ни страха, ни ночи, ни толпы — как у Тихона; `lair`: его сажает PotionLair, а не пробуждение места). */
export function lairDef() {
    const F = LAIR.F - 0.5;
    const spot = { x: LAIR.CX + 4.8, y: F, z: LAIR.CZ + 2.4, yaw: Math.atan2(-4.8, -2.4) + Math.PI };
    return {
        id: LAIR_SITE_ID, kind: 'guest', lair: true, name: 'Логово зельевара', x: LAIR.CX, z: LAIR.CZ, F, zone: 30, gx: 0, gz: 0,
        knights: 0, king: '', population: 1, color: 0x2d2a52, spot,
        people: [{ idx: 1, role: 'farmer', female: false, name: MASTER.NAME, home: -1, stall: -1, seed: MASTER.SEED, trade: 'potionmaster' }],
        houses: [], stalls: [], fields: [], posts: [], beds: [], chests: [], pens: [], graves: [], graveyards: [], rooms: [],
        nodes: [{ id: 0, x: spot.x, y: F, z: spot.z, tag: 'guest' }], edges: [],
    };
}

/** Одежда мастера: тёмная мантия, высокий колпак, длинная борода, фартук алхимика, палочка в руке. */
export function masterLook(L) {
    Object.assign(L, { female: false, hat: 'wizardTall', hatColor: 0x2d2a52, dress: true, dressColor: 0x2f2a4a, shirt: 0x2f2a4a, accent: 0xc9a64a, beard: 'long', hairColor: 0xd0d0d8, sleeves: 'long', apron: 0x4a3626, tool: 'wand' });
}

export class PotionMasterLife {
    constructor(game) {
        this.game = game;
        this.job = null;
        this.welcome = false;
        this._t = 0;
    }

    get auth() { return this.game.authority !== false; }
    get life() { return this.game.castleLife; }
    get cs() { return this.life?.castles?.get(LAIR_SITE_ID) || null; }
    get v() { const v = this.cs?.active.get(1); return v && !v.dead ? v : null; }
    get cauldron() { return this.game.cauldrons?.list.get(CAULDRON_ID) || null; }

    // ------------------------------------------------------------------ присутствие
    /** (PotionLair, пока зал построен и игрок рядом) мастер стоит на месте: после гибели / сна места — снова. */
    ensure() {
        const life = this.life, cs = this.cs;
        if (!this.auth || !life || !cs?.awake) return;
        const v = cs.active.get(1);
        if (v && !v.dead) { if (!v.potionMaster) this._mark(v); return; }
        const st = life.state(LAIR_SITE_ID);
        if (v?.dead) return; // (лежит убитый: поднимется при следующем входе)
        st.killed.delete(1);
        const spot = cs.def.spot;
        const n = life._activate(cs, 1, spot, 'stall', { post: spot, hp: MASTER.HP, look: masterLook });
        if (n) this._mark(n);
    }

    _mark(v) {
        v.potionMaster = true; v.guest = true; v.metMe = true; // (он помнит гостя: не здоровается заново, не «не узнаёт»)
        v.hp = v.maxHp = MASTER.HP;
        v.model?.setHeldTool?.('wand');
    }

    /** При входе героя в логово: поклон и приветствие (когда мастер на месте). */
    greet() { this.welcome = true; if (this.job) this._end(); }

    /** Новый вход: убитый встаёт, работа сброшена. */
    reset() {
        const cs = this.cs, life = this.life;
        this._end();
        if (cs && life) { life.state(LAIR_SITE_ID).killed.delete(1); const v = cs.active.get(1); if (v?.dead) life._deactivate(v); }
    }

    update(dt) {
        this._t += dt;
        if (this.welcome) {
            const v = this.v, me = this.game.character?.group.position;
            if (v && me && Math.hypot(v.x - me.x, v.z - me.z) < 22) { this.welcome = false; this.life._say(v, LINES.welcome, 8); }
        }
        if (this.job && !this.v) this._end(); // (место уснуло / убит: всё сброшено)
        if (this.show && !this.v) this.show = null;
    }

    // ------------------------------------------------------------------ речь (CastleTalk._hear)
    /** → реплика (строка) — слова поняты и дело сделано/начато; null — обычный разговор. */
    hear(v, text) {
        if (!this.auth || !v?.potionMaster) return null;
        const it = parseIntent(text);
        const g = this.game, c = this.cauldron;
        if (!it) return g.castleLife?.talk?.llm?.ready ? null : pick(FALLBACK); // (без нейросети — его собственная фраза, а не общая заготовка жителя; с нейросетью отвечает она по его описанию)
        switch (it.kind) {
            case 'hello': return pick(LINES.hello);
            case 'list': return knownLine();
            case 'ingredients': return ingredientsLine(lairIngredients());
            case 'where': {
                // («не рассказывать, где, а подойти к полке, указать и подсветить» — the author 06.11): он идёт к полке, ведёт туда палочкой, вещь светится
                const lair = this.game.potionLair;
                if (!lair?.plan) return 'Подойдите к полкам — сам покажу.';
                const stock = lair.stock || (lair.stock = stockFor(lair.plan.slots));
                const r = whereLine(it.things, stock, lairRacks());
                if (typeof r === 'string') return r;
                if (!r.found.length) return r.text;
                if (this.job) return LINES.busy(this.job.rec.name);
                this._show(r.found.map((e) => ({ x: LAIR.CX + e.slot.x, y: e.slot.y + 0.4, z: LAIR.CZ + e.slot.z })));
                return pick(['Сейчас покажу.', 'Идёмте, покажу.', 'Минутку — вот сюда.']);
            }
            case 'recipe': return recipeAnswer(it.rec);
            case 'know': return `Конечно знаю — ${recipeAnswer(it.rec)}`;
            case 'hint': return c ? hintLine(c.st.ings) : LINES.noCauldron;
            case 'stop': if (!this.job) return LINES.idle; this._end(); return LINES.stopped;
            case 'fire': if (!c) return LINES.noCauldron; this._castFire(v, c); return 'Готово, огонь горит.';
            case 'water': if (!c) return LINES.noCauldron; this._castWater(v, c); return 'Воды налил — скоро закипит.';
            case 'give': {
                if (!c) return LINES.noCauldron;
                if (c.st.phase !== 'ready') return c.st.phase === 'brewing' ? LINES.notReady : LINES.cantGive;
                return this._give(v, c) ? LINES.given : LINES.cantGive;
            }
            case 'help': case 'brew': {
                if (it.ask || !it.rec) return pick(LINES.askWhich);
                if (!c) return LINES.noCauldron;
                if (this.job) return LINES.busy(this.job.rec.name);
                this._begin(it.kind, it.rec);
                return it.kind === 'brew' ? `${LINES.start(it.rec.name)} ${recipeLine(it.rec)}` : `${LINES.startHelp(it.rec.name)} ${recipeLine(it.rec)}`;
            }
            default: return null;
        }
    }

    _begin(kind, rec) {
        this.job = { kind, rec, phase: 'prep', t: 0, plan: planOf(rec), i: 0, sub: 'pick', cur: null, tries: 0 };
        g_log(this, `мастер зелий: ${kind === 'brew' ? 'варит сам' : 'помогает'} — ${rec.name}`);
    }

    _end() {
        const j = this.job;
        this.job = null;
        if (j?.cur?.L && this.game.items?.loose.has(j.cur.L.item.uid)) { j.cur.L.hover = null; } // (вещь в полёте падает)
    }

    // ------------------------------------------------------------------ работа (CastleLife._think → true: ход этого кадра его)
    step(v, dt) {
        const j = this.job;
        if (!v.potionMaster || v.dead) return false;
        // knocked down / getting up (the author 05.11: «после Джолта поднимается — всё равно делает сальто»): his own turning to the guest
        // used to go on every frame while the body got up — the doll rose one way, the model turned the other. Down — nothing of his own.
        const ci = this.game.creatureImpact;
        if (ci?.stateOf && ci.stateOf(v) !== 'up') { if (j) this._end(); this.show = null; return false; }
        // his wand knocked out («Экспеллиармус»): the work stops; a moment of shock, then he goes for it and picks it up (unless someone
        // took it — then he waits: a new one comes with his next coming into the lair)
        if (v.noWand) {
            if (j) this._end();
            this.show = null;
            const g = this.game, it = v.lostWand && g.items?.loose?.get(v.lostWand.uid);
            if (!it) { v.speed = 0; v.mode = 'idle'; return true; }
            v.lostWand.t = (v.lostWand.t || 0) + dt;
            if (v.lostWand.t < 1.2) { v.speed = 0; v.mode = 'stagger'; this.life._ground?.(v); return true; }
            const p = it.model.position, L = this.life;
            const d = L._steer ? L._steer(v, p.x, p.z, 3.2, dt, 0.8) : Math.hypot(p.x - v.x, p.z - v.z);
            v.mode = v.speed > 0 ? 'walk' : 'idle';
            L._ground?.(v);
            if (d <= 1.1 && Math.abs(p.y - v.y) < 3) {
                g.items.pickUp(v.lostWand.uid, '#' + v.id, 'right');
                v.noWand = false; v.lostWand = null;
                v.model?.setHeldTool?.('wand');
                L._say?.(v, 'Так-то лучше. Без палочки зелья не сваришь.', 4);
            }
            return true;
        }
        if (!j) return this.show ? this._showStep(v, dt) : this._idle(v, dt);
        const g = this.game, life = this.life, c = this.cauldron;
        if (!c) { life._say(v, LINES.noCauldron, 5); this._end(); return false; }
        if (v.stunT > 0 || v.lev || v.carriedBy || v.foe) { this._end(); return false; }
        j.t += dt;
        v.speed = 0;
        v.mode = 'idle';
        this._face(v, c.x, c.z, dt);
        const st = c.st;
        switch (j.phase) {
            case 'prep': {
                if (st.phase !== 'empty' && st.phase !== 'water') { life._say(v, LINES.reset, 4); c.st = newBrew(); g.cauldrons._send?.(c); g.cauldrons._event?.(c, 'water'); }
                if (!g.potionLair?._fire(c.x, c.z)) this._castFire(v, c);
                if (c.st.water < CAULDRON.FULL * 0.9) this._castWater(v, c);
                j.phase = 'boil'; j.t = 0;
                break;
            }
            case 'boil': {
                if (!g.potionLair?._fire(c.x, c.z)) this._castFire(v, c); // (потушили: разжигает снова)
                if (c.st.water < 0.3) this._castWater(v, c);
                if (boiling(c.st)) {
                    j.t = 0;
                    if (j.kind === 'help') { j.phase = 'watch'; life._say(v, 'Кипит! Бросайте — вот что нужно: ' + recipeLine(j.rec), 8); }
                    else { j.phase = 'throw'; j.sub = 'pick'; }
                } else if (j.t > MASTER.BOIL_WAIT) { life._say(v, 'Что-то не закипает… попробуйте позже.', 5); this._end(); }
                else if (!j.said && j.t > 3) { j.said = true; life._say(v, LINES.boiling, 4); }
                break;
            }
            case 'watch': { // («помоги»: бросает игрок)
                if (c.st.phase === 'brewing') { j.phase = 'brew'; j.t = 0; j.give = false; life._say(v, 'Отлично, пошло! Теперь ждём.', 4); }
                else if (c.st.phase === 'sludge') { life._say(v, LINES.spoiled, 5); this._end(); }
                else if (j.t > 150) { this._end(); }
                break;
            }
            case 'throw': this._throwStep(v, c, j, dt); break;
            case 'brew': {
                if (c.st.phase === 'ready') {
                    life._say(v, LINES.ready(j.rec.name), 6);
                    if (j.give !== false) this._give(v, c);
                    this._end();
                } else if (c.st.phase === 'sludge') { life._say(v, LINES.spoiled, 5); this._end(); }
                else if (c.st.phase === 'crumble') { this._end(); }
                else if (j.t > MASTER.BREW_WAIT) this._end();
                break;
            }
            default: this._end();
        }
        life._ground(v);
        return true;
    }

    /**
     * Без дела: он видит героя во всём зале (не только вплотную): поворачивается к нему, а когда показывает место на полке, ведёт
     * туда палочкой, и вещь светится искрами (4 с). Вне зала — стоит на своём месте (false: обычный житель).
     */
    _idle(v, dt) {
        const g = this.game, me = g.character?.group.position;
        if (!me || !g.potionLair?.inLair || v.foe || v.stunT > 0 || v.lev || v.carriedBy) return false;
        if (this.pointT > 0 && this.pointAt?.length) {
            this.pointT -= dt;
            const p = this.pointAt[0];
            this._face(v, p.x, p.z, dt);
            this._aim(v, _a.set(p.x, p.y, p.z));
            v.mode = 'cast'; v.speed = 0;
            if (this._t - (this._markT || 0) > 0.05) {
                this._markT = this._t;
                for (const q of this.pointAt) {
                    g.fx?.spark?.(_b.set(q.x + (Math.random() - 0.5) * 0.4, q.y + Math.random() * 1.4, q.z + (Math.random() - 0.5) * 0.4), 0xffd86a, 0.14, _c.set(0, 0.7, 0), 0.9);
                    if (g.fireLights) g.fireLights.want(q.x, q.y + 0.6, q.z, 0.5);
                }
            }
        } else {
            this._face(v, me.x, me.z, dt * 0.7); // (смотрит на гостя, пока тот в зале)
            v.mode = v.talking > 0 ? 'talk' : 'idle'; v.speed = 0;
        }
        this.life._ground(v);
        return true;
    }

    _point(list) { this.pointAt = list; this.pointT = 5; }

    /** Показать вещи на полке: подойти, указать палочкой (вещь светится), вернуться на место. */
    _show(list) {
        const p = list[0], north = p.z - LAIR.CZ < 0;
        this.show = { list, phase: 'walk', t: 0, stand: { x: p.x, z: p.z + (north ? 3.4 : -3.4) } };
        this.pointT = 0;
    }

    _showStep(v, dt) {
        const g = this.game, life = this.life, S = this.show, me = g.character?.group.position;
        S.t += dt;
        if (v.foe || v.stunT > 0 || v.lev || v.carriedBy || !me || !g.potionLair?.inLair) { this.show = null; return false; }
        v.speed = 0;
        if (S.phase === 'walk') {
            const d = life._steer(v, S.stand.x, S.stand.z, 3.6, dt, 0.7);
            v.mode = v.speed > 3 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
            if (d < 1.1 || S.t > 14) { S.phase = 'point'; S.t = 0; this.pointAt = S.list; this.pointT = 8; life._say(v, pick(['Вот он!', 'Здесь.', 'Смотрите — светится.']), 3); }
        } else if (S.phase === 'point') {
            this.pointT -= dt;
            const p = S.list[0];
            this._face(v, p.x, p.z, dt);
            this._aim(v, _a.set(p.x, p.y, p.z));
            v.mode = 'cast';
            if (this._t - (this._markT || 0) > 0.05) {
                this._markT = this._t;
                for (const q of S.list) {
                    g.fx?.spark?.(_b.set(q.x + (Math.random() - 0.5) * 0.4, q.y + Math.random() * 1.4, q.z + (Math.random() - 0.5) * 0.4), 0xffd86a, 0.14, _c.set(0, 0.7, 0), 0.9);
                    g.fireLights?.want(q.x, q.y + 0.6, q.z, 0.5);
                }
            }
            if (this.pointT <= 0) { S.phase = 'back'; S.t = 0; }
        } else { // back
            const post = this.cs?.def.spot;
            const d = post ? life._steer(v, post.x, post.z, 3.0, dt, 0.5) : 0;
            v.mode = v.speed > 0 ? 'walk' : 'idle';
            if (d < 0.9 || S.t > 14) this.show = null;
        }
        life._ground(v);
        return true;
    }

    // ---- «Вингардиум Левиоса»: ингредиент с полки → над котёл
    _throwStep(v, c, j, dt) {
        const g = this.game, items = g.items, life = this.life;
        if (j.i >= j.plan.length) { j.phase = 'brew'; j.t = 0; j.give = true; return; }
        const kind = j.plan[j.i];
        const cx = c.x, cz = c.z, top = g.cauldrons.fy(c) + H + MASTER.ABOVE;
        switch (j.sub) {
            case 'pick': {
                const L = this._fromShelf(kind);
                if (!L) { if (++j.tries > 3) { life._say(v, `Не нахожу ${ingName(kind)}…`, 4); this._end(); } return; }
                L.hover = L.model.position.clone();
                j.cur = { L, from: L.model.position.clone(), t: 0 };
                j.sub = 'fly'; j.t = 0;
                v.model.castNow = true;
                if (j.i === 0 || Math.random() < 0.35) life._say(v, LINES.lift, 2.5);
                break;
            }
            case 'fly': {
                const cur = j.cur, L = cur.L;
                if (!items.loose.has(L.item.uid)) { j.sub = 'pick'; j.tries++; if (j.tries > 4) this._end(); return; } // (схватили в полёте)
                cur.t += dt;
                const k = Math.min(1, cur.t / MASTER.LIFT_T), e = ease(k);
                _a.set(cx, top, cz);
                L.hover.copy(cur.from).lerp(_a, e);
                L.hover.y += Math.sin(Math.PI * e) * MASTER.ARC;
                v.mode = 'cast';
                this._aim(v, L.hover);
                if (Math.random() < dt * 22) g.fx?.spark(_b.copy(L.hover), 0xb9a0ff, 0.09, _c.set((Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4), 0.6);
                if (k >= 1) { j.sub = 'sink'; j.t = 0; cur.t2 = 0; }
                break;
            }
            case 'sink': {
                // (вещь опускается над самой водой и растворяется ровно в котле — по одной, по порядку; никакой физики падения: она не зацепится за край)
                const cur = j.cur, L = cur.L;
                if (!items.loose.has(L.item.uid)) { j.sub = 'pick'; j.tries++; if (j.tries > 4) this._end(); return; }
                v.mode = 'cast';
                cur.t2 += dt;
                const k = Math.min(1, cur.t2 / 0.8), water = g.cauldrons.fy(c) + surfaceY(c.st) + 0.12;
                L.hover.set(cx, top + (water - top) * ease(k), cz);
                this._aim(v, L.hover);
                if (k < 1) break;
                const res = addIngredient(c.st, L.item.kind, L.item.count || 1);
                if (res === 'in' || res === 'spoil') {
                    items.removeLoose(L.item.uid);
                    g.sync?.itemGone?.(L.item.uid, null, null);
                    g.water?._splash?.(_a.set(cx, water, cz), 0.8, 14);
                    g.sound?.playSplash?.();
                    g.cauldrons._event?.(c, res === 'spoil' ? 'spoil' : 'ing', kind);
                    g.cauldrons._send?.(c, res === 'spoil' ? 'spoil' : 'ing', kind);
                    j.i++; j.sub = 'gap'; j.t = 0; j.tries = 0; j.cur = null;
                } else if (res === 'cold') { // (вода остыла — ждёт кипения, вещь висит над ней)
                    cur.t2 = 0.8;
                    if (!j.saidCold) { j.saidCold = true; this.life._say(v, LINES.boiling, 4); }
                    if (!g.potionLair?._fire(c.x, c.z)) this._castFire(v, c);
                    if ((j.coldT = (j.coldT || 0) + dt) > MASTER.BOIL_WAIT) this._end();
                } else if (res === 'dry') { this._castWater(v, c); }
                else { items.removeLoose(L.item.uid); j.i++; j.sub = 'gap'; j.t = 0; j.cur = null; } // (то, что в воде не растворяется)
                break;
            }
            case 'gap':
                if (j.t >= MASTER.GAP_T) { j.sub = 'pick'; j.t = 0; }
                break;
            default: j.sub = 'pick';
        }
    }

    /** Вещь с полки: лежащая в своём месте — берётся, нет — берёт новую из «запасов» полки. */
    _fromShelf(kind) {
        const g = this.game, lair = g.potionLair, items = g.items;
        const e = lair?.stock?.find((x) => x.item.kind === kind);
        if (!e) return this._conjure(kind);
        const sx = LAIR.CX + e.slot.x, sz = LAIR.CZ + e.slot.z;
        for (const L of items.loose.values()) {
            const p = L.model?.position;
            if (!p || L.item.kind !== kind || L.hover || L.inCaul) continue;
            if (Math.abs(p.x - sx) < 0.7 && Math.abs(p.z - sz) < 0.7 && p.y > e.slot.y - 0.3 && p.y < e.slot.y + 1.2) return L;
        }
        return this._conjure(kind, _a.set(sx, e.slot.y + 0.3, sz));
    }

    _conjure(kind, at = null) {
        const g = this.game, v = this.v;
        const pos = at || _a.set(LAIR.CX, LAIR.F + 6, LAIR.CZ - 8);
        return g.items.spawnLoose({ kind, uid: newUid() }, pos, { broadcast: false }) || null;
    }

    // ---- заклинания
    _castFire(v, c) {
        const g = this.game, y = LAIR.F - 0.5;
        this.life._say(v, LINES.fire, 2);
        v.model.castNow = true;
        this._sparks(v, c.x, y + 0.5, c.z, 0xff9a3a);
        g.sound?.playInferno?.();
        if (!g.potionLair?._fire(c.x, c.z)) { const f = g.campfires?.kindle(c.x, y, c.z); if (f) f.left = 420; }
    }

    _castWater(v, c) {
        const g = this.game;
        this.life._say(v, LINES.water, 2);
        v.model.castNow = true;
        this._sparks(v, c.x, g.cauldrons.fy(c) + H, c.z, 0x6ac0ff);
        addWater(c.st, CAULDRON.FULL);
        g.cauldrons._event?.(c, 'water');
        g.cauldrons._send?.(c, 'water');
        g.sound?.playSplash?.();
    }

    _sparks(v, x, y, z, color) {
        const fx = this.game.fx;
        if (!fx?.spark) return;
        const from = _a.set(v.x, v.y + 2.9, v.z), to = _b.set(x, y, z);
        for (let i = 0; i < 16; i++) fx.spark(_c.copy(from).lerp(to, i / 16), color, 0.12, new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.6, (Math.random() - 0.5) * 0.4), 0.7);
    }

    _face(v, x, z, dt) {
        const want = Math.atan2(-(x - v.x), -(z - v.z));
        let d = want - v.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        v.yaw += d * Math.min(1, dt * 8);
    }

    /** Палочка ведёт вещь: поворот и наклон руки. */
    _aim(v, p) {
        this._face(v, p.x, p.z, 0.05);
        const dx = p.x - v.x, dz = p.z - v.z, dy = p.y - (v.y + 2.9);
        v.model.aimPitch = Math.max(-0.9, Math.min(1.1, Math.atan2(dy, Math.hypot(dx, dz))));
    }

    // ---- колба с зельем перед игроком
    _give(v, c) {
        const g = this.game, items = g.items, me = g.character?.group.position;
        if (!me) return false;
        const color = c.st.color;
        const rec = takePortion(c.st);
        if (!rec) return false;
        g.cauldrons._send?.(c);
        const yaw = g.character.group.rotation.y;
        const pos = new THREE.Vector3(me.x - Math.sin(yaw) * 1.4, me.y - 0.7, me.z - Math.cos(yaw) * 1.4);
        items.spawnLoose(potionItem(rec, color, newUid()), pos, { hover: true, broadcast: false });
        v.model.castNow = true;
        return true;
    }
}

function g_log(self, text) { self.life?.alog?.note?.(text); }
