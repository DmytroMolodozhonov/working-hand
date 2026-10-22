/**
 * NightLife.js — the night of the castles, villages, wizards' towers and ships.
 *
 * The day is 24 game minutes (Game.dayPhase: 0–0.75 day, 0.75–1 night). One game hour
 * before the night the merchants pack their goods off the counters and go home; half an
 * hour before it everybody finishes work and walks home — each to their own house, in
 * through the door (it opens and closes for them), to their own bed: they lie down under
 * the blanket, breathe, now and then turn over; a soft «z-z-z» over them when you are
 * close. More people than beds: the rest sleep on a straw mat on the floor. The knights
 * sleep in the barracks, the king in his bedchamber.
 *
 * At night the streets are empty: only the watch — 1–3 knights of a castle with torches —
 * stands at the gate and walks the walls and the village. At dawn everybody gets up and
 * goes back to work (the stalls fill again).
 *
 * Woken by: a blow or a touch of the hand, a talk (they mumble first; a second word wakes
 * them), a shout or a fight near, a broken window, a forced lock, a blast, fire, zombies
 * coming in — any danger of Danger.js heard close enough (castleLife.alarm feeds it). They
 * sit up, get out of bed and react like anybody awake (VillagerFear: hide, run, buckets;
 * knights fight); when it is calm again and still night, they go back to bed. The watch
 * seeing trouble shouts «Тревога!»: the sleeping knights jump up and come running.
 *
 * The wizards' tower: one wizard walks the rounds at night, the others sleep in the
 * tower's beds; trouble — he calls them and they all come (WizardLife._staff by day).
 * The ships: the crews sleep aboard (even in port) below deck, the captain in his cabin;
 * one sailor keeps the watch on deck with a torch; danger or an attack — «Полундра!»,
 * everybody up.
 *
 * Multiplayer: the host decides who sleeps where (CastleLife / Sailors send the poses:
 * modes 'sleep' / 'sleepMat' / 'situp'); every computer draws the blankets and the
 * «z-z-z». Nothing is saved: who sleeps follows from the time of day (shared dayStart).
 *
 * «На кого и на что»: tests/unit/night-life.test.js.
 */

import * as THREE from 'three';
import { DANGERS } from './Danger.js';
import { isWizSite } from './WizardLife.js';
import { VILLAGER_FOOT_OFFSET, VILLAGER_SIT_OFFSET, SLEEP_MODES } from '../entities/VillagerModel.js';
import { BED } from './BedModels.js';

export const HOUR = 1 / 24; // (of Game.dayPhase: one game hour = one real minute)
export const NIGHT = { START: 0.75, PACK: HOUR, HOME: HOUR / 2, DAWN: HOUR / 2 };
/** Bit of a knight's v.fx: a burning torch in the hand (the night watch; sent to guests). */
export const FX_TORCH = 256;
const WALK = 2.3;
const LOUD = new Set(['blast', 'ruin', 'quake', 'fall', 'circle', 'inspirius', 'boom']);
const BACK_TO_BED = 25; // s calm after waking: back to bed (still night)
const NEAR_BEDS = 45; // m: castle beds (barracks, bedrooms) get their sleepers when a player is this near
const FAR_BEDS = 75;
const ZZZ_NEAR = 16; // m: the «z-z-z» is seen this near
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const LINES = {
    close: ['Закрываемся! Приходите утром!', 'Всё, на сегодня торговля окончена.', 'Темнеет — пора домой. Завтра приходите!'],
    home: ['Пора и на покой...', 'Ох, устал я за день.', 'Домой, спать.'],
    mumble: ['Ммм...', 'Хррр... мм...', 'Ммм... отстань...', 'Ещё немножко...', 'Мм... что?..'],
    woke: ['А? Что такое?!', 'Кто здесь?!', 'Что случилось?!', 'Ой! Что?!'],
    wokeTalk: ['Ммм... кто здесь? Ночь же на дворе...', 'А?.. Ты чего меня будишь?', 'Ох... Что тебе нужно в такой час?'],
    wokeHit: ['Ай! Ты что?!', 'Ай! Кто это?!', 'Ох! Разбойник!'],
    morning: ['Доброе утро!', 'Ох, уже светает...', 'Ну, за работу.'],
    alarm: ['Тревога! Подъём! К оружию!', 'Тревога! Все наверх!', 'Подъём, братья! К оружию!'],
    wizAlarm: ['Тревога! Все сюда!', 'Просыпайтесь! Чужие в башне!'],
    sea: ['Полундра! Свистать всех наверх!', 'Подъём, братва! Тревога!'],
    nightShop: 'Ночью не торгую. Приходи утром!',
};
const TRADE_WORDS = /(куп|прода|почем|почём|сколько стоит|товар|торгу|цен[аы])/;

/** Where in the day: 'day' | 'pack' (merchants pack up) | 'home' (everybody home) | 'night' | 'dawn' (getting up). */
export function nightPart(phase) {
    if (!Number.isFinite(phase)) return 'day';
    if (phase >= NIGHT.START) return 'night';
    if (phase >= NIGHT.START - NIGHT.HOME) return 'home';
    if (phase >= NIGHT.START - NIGHT.PACK) return 'pack';
    if (phase < NIGHT.DAWN) return 'dawn';
    return 'day';
}
/** People go to bed / are asleep. */
export const sleepTime = (part) => part === 'home' || part === 'night';
/** The market is shut (no goods on the counters). */
export const shopsClosed = (part) => part !== 'day';
/** How many of the crowd walk about (of the day's number). */
export function crowdK(part) { return part === 'day' ? 1 : part === 'pack' ? 0.7 : part === 'dawn' ? 0.25 : 0; }
/** Knights awake on the night watch: 1 small castle … 3 a big one. */
export function watchCount(knights) { return Math.max(1, Math.min(3, 1 + (knights > 30 ? 1 : 0) + (knights > 60 ? 1 : 0))); }
/** Does a danger of `kind` (Danger.js) `dist` m away wake a sleeper? (asleep you hear less: a blast still wakes the village) */
export function wakesSleeper(kind, dist, r = 0) {
    const D = DANGERS[kind];
    if (!D) return false;
    return dist <= (r || D.r) + D.hear * (LOUD.has(kind) ? 0.7 : 0.45);
}
/** A sleeping place on a bed (Beds.js record {x, y, z, ry}): the middle of the body, the head to the pillow; `side` −1/+1 for two in one bed. */
export function bedPlace(b, side = 0) {
    const c = Math.cos(b.ry), s = Math.sin(b.ry);
    const lx = side * 0.62, lz = -0.25; // (the pillow is at the bed's −Z)
    return { x: b.x + lx * c + lz * s, y: b.y + BED.top, z: b.z - lx * s + lz * c, yaw: b.ry + Math.PI, bed: true, side, floor: b.y, half: BED.W / 2 };
}

/** A castle's own sleeping place (Castles.js def.beds record k): a bunk / a bed / a straw mat. */
function castlePlace(b, k) {
    const bunk = b.room === 'barracks' && !b.mat;
    return { ...b, key: 'c' + k, bed: !b.mat, floor: b.mat ? b.y : b.y - 2, half: b.room === 'king' ? 2.5 : bunk ? 0.5 : 1.5 };
}

export class NightLife {
    constructor(life) {
        this.life = life;
        this.game = life.game;
        this._t = 0;
        this._senseT = 0;
        this._tickT = 0;
        this._touchT = 0;
        this._zzz = null; // pool of «z» sprites
    }

    get auth() { return this.game.authority; }

    /** The part of the day now ('day' without a day cycle — survival nights keep their own rules). */
    part() {
        const g = this.game;
        if (!g.dayCycle || typeof g.dayPhase !== 'function') return 'day';
        return nightPart(g.dayPhase());
    }
    asleepTime() { return sleepTime(this.part()); }
    closed() { return shopsClosed(this.part()); }
    crowdK() { const g = this.game; return g.dayCycle ? crowdK(this.part()) : (g.isNight ? 0.35 : 1); }

    // ================================================================ host: the castles
    update(dt) {
        this._t += dt;
        if (!this.auth) return;
        const part = this.part();
        this._tickT -= dt;
        if (this._tickT <= 0) {
            this._tickT = 1;
            for (const cs of this.life.castles.values()) {
                if (!cs.awake || cs.def.kind === 'wander' || cs.def.kind === 'stall') continue; // (the Creative stall's merchant works all night)
                if (isWizSite(cs.def)) this._tower(cs, part);
                else this._castle(cs, part);
            }
        }
        this._senseT -= dt;
        if (this._senseT <= 0) { this._senseT = 0.5; this._sense(part); }
    }

    /** (host, from CastleLife._wake) A castle comes to life at night: only the watch is out. True: staffed. */
    staffNight(cs) {
        if (!this.asleepTime()) return false;
        cs.nightPart = this.part();
        this._watch(cs);
        return true;
    }

    _castle(cs, part) {
        const prev = cs.nightPart;
        if (prev !== part) {
            cs.nightPart = part;
            if (part === 'pack') this._closeStalls(cs);
            if (sleepTime(part)) { this._closeStalls(cs); this._watch(cs); }
            if (part === 'dawn') this._dawn(cs);
            if (part === 'day' && prev) { this._dayWatch(cs); this.life._staffDay(cs); }
        }
        if (sleepTime(part)) { this._sendHome(cs); this._fillBeds(cs); }
    }

    /** The merchants pack the goods off their counters (a minute of work) and go home. */
    _closeStalls(cs) {
        const g = this.game, talk = this.life.talk;
        cs.def.stalls.forEach((stall, i) => {
            const s = talk?.stalls?.get(talk._stallKey(cs.def, i));
            if (s) {
                for (const uid of s.goods) if (g.items?.loose.has(uid)) { g.items.removeLoose(uid); g.sync?.itemGone?.(uid, null, null); }
                s.goods = []; s.restockAt = 0;
            }
        });
        for (const v of cs.active.values()) {
            if (v.dead || v.job !== 'stall' || v.foe || v.pack) continue;
            v.pack = 3 + Math.random() * 3;
            this.life._say(v, pick(LINES.close), 4);
        }
    }

    /** The night watch: 1–3 knights (the gate, the walls, the village) with torches; the rest go to bed. */
    _watch(cs) {
        const L = this.life, def = cs.def;
        const st = L.state(def.id);
        const W = watchCount(def.knights);
        const watch = [];
        for (const v of cs.active.values()) if (v.watch && !v.dead) watch.push(v);
        const slot = (n) => {
            if (n === 0 && def.posts?.length) return { job: 'guard', post: def.posts[0] };
            if (n === 1 && def.wallWalk?.length >= 6) return { job: 'patrol' };
            return { job: 'rounds' };
        };
        // (the knights out already: the gate guard, a patrol, one in the yard keep watching)
        const cands = [...cs.active.values()].filter((v) => v.role === 'knight' && !v.dead && !v.watch && !v.sleep)
            .sort((a, b) => (a.job === 'guard' ? 0 : a.job === 'patrol' ? 1 : 2) - (b.job === 'guard' ? 0 : b.job === 'patrol' ? 1 : 2));
        for (let k = 1; watch.length < W && k <= def.knights; k++) {
            let v = cands.shift();
            if (!v) {
                if (cs.active.has(k) || st.killed.has(k)) continue;
                const p = def.posts?.[0] || def.gateIn || cs.graph.nodes[0];
                if (!p) break;
                v = L._activate(cs, k, { x: p.x, y: p.y, z: p.z, yaw: p.yaw ?? 0 }, 'yard');
                if (!v) continue;
            }
            const s = slot(watch.length);
            v.watch = true;
            v.fx = (v.fx | 0) | FX_TORCH;
            v.job = s.job; v.path = null;
            if (s.post) v.post = s.post;
            if (s.job === 'patrol') v.loopI = v.loopI ?? 0;
            v.rounds = s.job === 'rounds' ? { t: 0 } : null;
            watch.push(v);
        }
    }

    _dayWatch(cs) {
        for (const v of cs.active.values()) {
            if (!v.watch) continue;
            v.watch = false; v.fx = (v.fx | 0) & ~FX_TORCH;
            if (v.rounds) { v.rounds = null; v.job = 'yard'; v.path = null; }
        }
    }

    /** Everybody not on watch and not busy (a fight, danger) goes to bed — or back to it after being woken. */
    _sendHome(cs) {
        const calm = this.life.fright.quietFor(cs) > 20;
        for (const v of [...cs.active.values()]) {
            if (v.dead || v.sleep || v.watch || v.goingHome || v.pack) continue;
            if (v.foe || v.fear || v.investigate || v.order || v.servantOf != null || v.handLink || v.lev || v.follow || v.fleeT > 0 || v.fireT > 0 || v.talking > 0) continue;
            if (v.job === 'rebuild' || !calm) continue;
            if (v.wokeAt != null && this._t - v.wokeAt < BACK_TO_BED) continue;
            this._goRest(v);
        }
    }

    /** Off to bed: the own bed (or the one woken from), else home through the door. */
    _goRest(v) {
        const cs = v.cs, def = cs.def, g = cs.graph;
        let place = v.restAt && this._free(cs, v.restAt.key, v) ? v.restAt : null;
        if (!place && v.house != null) place = this._freePlace(cs, this._housePlaces(def, v.house), v);
        if (!place && v.role === 'king') place = this._freePlace(cs, this._castleBeds(def, 'king'), v);
        if (!place && v.role === 'advisor') place = this._freePlace(cs, this._castleBeds(def, 'bedroom'), v);
        if (v.role === 'king' || v.role === 'advisor') { v.dayJob = v.dayJob || v.job; v.dayPost = v.dayPost || v.post; }
        if (place) { this._toBed(v, place, Math.hypot(place.x - v.x, place.z - v.z) < 8 && Math.abs(place.y - v.y) < 3 ? 'side' : 'go'); return; }
        if (v.role === 'knight') {
            // to the barracks (a bunk when somebody is near to see it; else into it, out of sight)
            const door = g.tagged('barracksDoor')[0] ?? g.tagged('keepDoor')[0] ?? g.tagged('gateIn')[0];
            v.dayJob = 'yard';
            v.sleep = { phase: 'go', node: door ?? g.nearest(v.x, v.y, v.z), place: null, barracks: true };
            v.path = null; v.seated = false;
            if (Math.random() < 0.3) this.life._say(v, pick(LINES.home), 3);
            return;
        }
        if (isWizSite(def) || v.role === 'king' || v.role === 'advisor') {
            const n = g.tagged('keepIn')[0] ?? g.tagged('home')[0] ?? g.nearest(v.x, v.y, v.z);
            v.sleep = { phase: 'go', node: n, place: null };
            v.path = null; v.seated = false;
            return;
        }
        // a townsman: home along the paths (CastleLife's wanderer: in through the door → arriveHome)
        this.life.chores?.end(v); // (the chore left: home for the night)
        v.job = 'wander'; v.trips = 0; v.waitT = 0; v.post = null; v.purpose = 'home';
        v.goingHome = true; v.path = null; v.seated = false;
        this.life._goTo(v, this.life._homeNode(v));
        if (Math.random() < 0.25) this.life._say(v, pick(LINES.home), 3);
    }

    /** (host, from CastleLife's wanderer reaching home) In through the door at night: to bed. False: out of sight as usual. */
    arriveHome(v) {
        if (!this.asleepTime()) return false;
        const def = v.cs.def, h = v.entry.home;
        if (h == null || h < 0 || !def.houses[h]) return false;
        const place = this._freePlace(v.cs, this._housePlaces(def, h), v);
        if (!place) return false;
        v.goingHome = false; v.job = 'home'; v.house = h; v.homeAt = def.houses[h].inside;
        this._toBed(v, place, 'side');
        return true;
    }

    _toBed(v, place, phase) {
        const cs = v.cs;
        (cs.bedUse || (cs.bedUse = new Map())).set(place.key, v);
        v.restAt = place;
        v.sleep = { phase, place, node: phase === 'go' ? this._nodeFor(cs, place) : null, t: 0 };
        v.path = null; v.goingHome = false;
    }

    _nodeFor(cs, place) {
        if (place.house != null) { const h = cs.def.houses[place.house]; if (h?.homeNode != null) return h.homeNode; }
        return cs.graph.nearest(place.x, place.y, place.z, 4);
    }

    _free(cs, key, v = null) {
        const o = cs.bedUse?.get(key);
        return !o || o === v || o.dead || o.removable || o.restAt?.key !== key;
    }

    _freePlace(cs, list, v) {
        for (const p of list) if (this._free(cs, p.key, v)) return p;
        return null;
    }

    /** The sleeping places of a village house (or the tower): its beds (two in one), then mats on the floor. */
    _housePlaces(def, hIdx) {
        const g = this.game, h = def.houses[hIdx];
        if (!h) return [];
        const rec = g.houses?.active.get(h.id);
        const out = [];
        const wiz = isWizSite(def);
        (rec?.bedIds || []).forEach((id, k) => {
            const b = g.beds?.list.get(id);
            if (!b || g.beds.lying === id) return; // (a player lies in it)
            if (wiz) out.push({ ...bedPlace(b, 0), key: `h${hIdx}:${k}`, house: hIdx });
            else for (const side of [-1, 1]) out.push({ ...bedPlace(b, side), key: `h${hIdx}:${k}${side}`, house: hIdx });
        });
        if (!wiz && h.inside) {
            const b0 = out[0];
            const yaw = b0 ? b0.yaw : 0;
            // a straw mat on the floor in the middle of the room, along the bed
            out.push({ x: h.inside.x + Math.sin(yaw) * 0.6, y: h.inside.y, z: h.inside.z + Math.cos(yaw) * 0.6, yaw, mat: true, key: `h${hIdx}:m`, house: hIdx, floor: h.inside.y });
        }
        return out;
    }

    /** The castle's own beds (Castles.js def.beds): 'barracks' | 'bedroom' | 'king'. */
    _castleBeds(def, room) {
        const out = [];
        (def.beds || []).forEach((b, k) => { if (b.room === room) out.push(castlePlace(b, k)); });
        return out;
    }

    /**
     * (host, from CastleLife.spawnFamily at night) A house near a player: its people are in bed asleep.
     * The tower: the master and the students in the tower's beds.
     */
    familyAsleep(cs, def, hIdx) {
        const L = this.life, st = L.state(def.id);
        const places = this._housePlaces(def, hIdx);
        const out = [];
        for (const v of cs.active.values()) if (v.house === hIdx && v.job === 'home' && !v.dead) out.push(v);
        const take = (idx) => {
            if (idx == null || idx < 0 || cs.active.has(idx) || st.killed.has(idx)) return;
            const place = this._freePlace(cs, places, null);
            if (!place) return;
            const v = L._activate(cs, idx, { x: place.x, y: place.y, z: place.z, yaw: place.yaw }, 'home');
            if (!v) return;
            v.house = hIdx; v.homeAt = def.houses[hIdx].inside;
            this._toBed(v, place, 'lie');
            this._lieNow(v);
            out.push(v);
        };
        if (isWizSite(def)) {
            if (!st.kingDead && !cs.active.has(0)) take(0);
            for (let n = 0; n < 4 && out.length < places.length; n++) take(L._freeCommoner(cs, 'student'));
            return out;
        }
        const house = def.houses[hIdx];
        const want = Math.min(places.length, house.rich ? 3 : 2 + (hIdx % 2));
        for (const idx of L._homesOf(def).get(hIdx) || []) { if (out.length >= want) break; take(idx); }
        return out;
    }

    /** Castle beds near a player get their sleepers (the knights in the barracks, the king, the advisor); far — gone again. */
    _fillBeds(cs) {
        const L = this.life, def = cs.def, st = L.state(def.id);
        if (!def.beds?.length) return;
        cs.bedT = (cs.bedT || 0) - 1;
        if (cs.bedT > 0) return;
        cs.bedT = 2;
        const players = L._players();
        const near = (p, R) => players.some((pl) => Math.hypot(pl.p.x - p.x, pl.p.z - p.z) < R && Math.abs(pl.p.y - 1.95 - p.y) < 14);
        let knight = 1, bedrooms = 0;
        def.beds.forEach((b, k) => {
            const key = 'c' + k;
            const o = cs.bedUse?.get(key);
            if (o && !this._free(cs, key)) {
                if (o.sleep?.phase === 'lie' && !near(b, FAR_BEDS)) L._deactivate(o); // (nobody about: out of sight)
                return;
            }
            if (b.room === 'bedroom') bedrooms++;
            if (!near(b, NEAR_BEDS)) return;
            let idx = null, job = 'yard', post = null;
            if (b.room === 'barracks') {
                while (knight <= def.knights && (cs.active.has(knight) || st.killed.has(knight))) knight++;
                if (knight > def.knights) return;
                idx = knight++;
            } else if (b.room === 'king') {
                if (st.kingDead || cs.active.has(0)) return;
                idx = 0; job = 'king'; post = def.throne;
            } else if (bedrooms === 1 && !cs.active.has(-1) && !st.killed.has(-1)) {
                idx = -1; job = 'guard';
            } else {
                idx = L._freeCommoner(cs); job = 'wander';
                if (idx < 0) return;
            }
            const place = castlePlace(b, k);
            const v = L._activate(cs, idx, { x: b.x, y: b.y, z: b.z, yaw: b.yaw }, job, { post });
            if (!v) return;
            v.dayJob = job; v.dayPost = post;
            if (idx === -1) { const tf = def.throneFront; v.dayPost = v.post = tf ? { x: tf.x, y: tf.y, z: tf.z, yaw: def.throne.yaw } : null; }
            this._toBed(v, place, 'lie');
            this._lieNow(v);
        });
    }

    _lieNow(v) {
        const p = v.sleep.place;
        v.x = p.x; v.z = p.z; v.yaw = p.yaw;
        v.y = p.y + VILLAGER_FOOT_OFFSET - VILLAGER_SIT_OFFSET;
        v.seated = true; v.speed = 0;
        v.mode = p.mat ? 'sleepMat' : 'sleep';
    }

    /** Dawn: the sleepers get up one by one over half a minute. */
    _dawn(cs) {
        for (const v of cs.active.values()) if (v.sleep?.phase === 'lie') v.sleep.wakeAt = this._t + Math.random() * 25;
    }

    // ---------------------------------------------------------- one sleeper (host)
    /**
     * (host, from CastleLife._think) One step of somebody going to bed / asleep / getting up.
     * True: handled this frame.
     */
    step(v, dt) {
        const S = v.sleep;
        const L = this.life;
        // thrown, lifted, stunned, on fire, a foe: awake at once (the body, not the mind)
        if (v.lev || v.stunT > 0 || v.vy || v.fireT > 0 || v.foe || v.climb) { this._drop(v); return false; }
        switch (S.phase) {
            case 'go': {
                if (!v.path) { if (!L._goTo(v, S.node)) { S.phase = S.place ? 'side' : 'gone'; return true; } }
                if (L._followPath(v, dt, (v.walk || WALK) * 0.9)) { v.path = null; S.phase = S.place ? 'side' : 'gone'; }
                v.mode = 'walk'; v.seated = false;
                L._ground(v);
                return true;
            }
            case 'gone': {
                // at the barracks / keep door: a free bunk with somebody near to see it — else in, out of sight
                if (S.barracks) {
                    const p = this._freePlace(v.cs, this._castleBeds(v.cs.def, 'barracks'), v);
                    const seen = p && L._players().some((pl) => Math.hypot(pl.p.x - p.x, pl.p.z - p.z) < NEAR_BEDS);
                    if (p && seen) { this._toBed(v, p, 'go'); return true; }
                }
                L._deactivate(v);
                return true;
            }
            case 'side': {
                const p = S.place;
                const sp = S.spot || (S.spot = this._bedside(v, p));
                S.t += dt;
                const d = L._steer(v, sp.x, sp.z, WALK * 0.7, dt, 0.25);
                v.mode = v.speed > 0 ? 'walk' : 'idle'; v.seated = false;
                L._ground(v);
                if (d < 0.5 || S.t > 8) { S.phase = 'lie'; S.t = 0; this._lieNow(v); }
                return true;
            }
            case 'lie': {
                if (S.wakeAt != null && this._t >= S.wakeAt) { this.wake(v, 'morning'); return true; }
                this._lieNow(v);
                return true;
            }
            case 'up': {
                // sat up on the bed's side, a stretch — then up on the feet beside it
                S.t -= dt;
                const p = S.place, sp = S.spot || (S.spot = this._bedside(v, p));
                v.x = p.x + (sp.x - p.x) * 0.45; v.z = p.z + (sp.z - p.z) * 0.45;
                v.y = p.y; v.seated = true; v.speed = 0; v.mode = 'situp';
                v.yaw = Math.atan2(-(sp.x - p.x), -(sp.z - p.z)) + Math.PI; // (facing out of the bed)
                if (S.t > 0) return true;
                v.x = sp.x; v.z = sp.z; v.seated = false; v.mode = 'idle';
                v.y = p.floor ?? p.y;
                L._ground(v);
                this._afterWake(v, S);
                return true;
            }
            default: this._drop(v); return false;
        }
    }

    /** The point beside the bed / the mat to step from and to (the side with room). */
    _bedside(v, p) {
        const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
        const off = p.mat ? 1.5 : (p.half ?? BED.W / 2) + 1.0 + Math.abs(p.side || 0) * 0.2;
        const sides = p.side ? [p.side, -p.side] : [1, -1];
        for (const s of sides) {
            const x = p.x + rx * off * s, z = p.z + rz * off * s;
            if (this.life._walkable(x, z, p.floor ?? p.y)) return { x, z };
        }
        return { x: p.x + rx * off * sides[0], z: p.z + rz * off * sides[0] };
    }

    _afterWake(v, S) {
        v.sleep = null;
        v.wokeAt = this._t;
        if (S.why === 'morning') {
            v.restAt = null;
            if (v.cs.bedUse?.get(S.place.key) === v) v.cs.bedUse.delete(S.place.key);
            if (v.dayJob) { v.job = v.dayJob; v.post = v.dayPost || v.post; v.dayJob = null; }
            if (v.job === 'wander') { v.trips = 1 + Math.floor(Math.random() * 3); v.goingHome = false; }
            if (v.job === 'home') v.waitT = 3 + Math.random() * 8;
            if (Math.random() < 0.3) this.life._say(v, pick(LINES.morning), 3);
            return;
        }
        if (S.why === 'talk' && S.by != null) { v.talking = 4; v.talkTo = S.by; }
        if (v.dayJob && v.role === 'king') { v.job = 'king'; v.post = v.dayPost; } // (up: the king stands about; back to bed soon)
    }

    /** No longer in or going to bed (keeps where the bed was: back to it when calm). */
    _drop(v) {
        const S = v.sleep;
        if (!S) return;
        v.sleep = null;
        v.seated = false;
        v.wokeAt = this._t;
        if (S.phase === 'lie' || S.phase === 'up') { v.y = S.place.floor ?? S.place.y; if (v.mode !== 'dead') v.mode = 'idle'; }
        if (v.dayJob && (v.role === 'king' || v.role === 'advisor')) { v.job = v.dayJob; v.post = v.dayPost; }
    }

    /** Wake a sleeper (why: 'hit' | 'danger' | 'noise' | 'talk' | 'alarm' | 'morning'). */
    wake(v, why = 'noise', by = null) {
        const S = v?.sleep;
        if (!S || v.dead) return false;
        if (S.phase !== 'lie') { if (S.phase !== 'up' && why !== 'morning') this._drop(v); return false; }
        S.phase = 'up'; S.why = why; S.by = by;
        S.t = why === 'hit' || why === 'danger' || why === 'alarm' ? 0.7 : 1.6;
        S.spot = null;
        const line = why === 'morning' ? null : why === 'talk' ? pick(LINES.wokeTalk) : why === 'hit' ? pick(LINES.wokeHit) : pick(LINES.woke);
        if (line) this.life._say(v, line, 3);
        return true;
    }

    /** Spoken to / touched while asleep: a mumble; again soon after — awake. (host) True: a sleeper was there. */
    rouse(v, by = null) {
        const S = v?.sleep;
        if (!S || S.phase !== 'lie') return false;
        S.rouse = S.rouseAt != null && this._t - S.rouseAt < 20 ? (S.rouse || 0) + 1 : 1;
        S.rouseAt = this._t;
        if (S.rouse >= 2) this.wake(v, 'talk', by);
        else this.life._say(v, pick(LINES.mumble), 2.5);
        return true;
    }

    /** A noise at `pos` (a shout, a broken pane, a lock forced, a fight): sleepers within `r` m wake. */
    noise(pos, r = 15) {
        if (!this.auth || !pos) return;
        for (const v of this.life.byId.values()) {
            if (v.sleep?.phase !== 'lie') continue;
            if (Math.abs(v.x - pos.x) > r || Math.abs(v.z - pos.z) > r) continue;
            if (Math.hypot(v.x - pos.x, v.z - pos.z) < r && Math.abs(v.y - (pos.y ?? v.y)) < 12) this.wake(v, 'noise');
        }
    }

    /**
     * (CastleTalk.hear) Spoken to: a sleeper mumbles (a second word wakes him); a merchant woken at
     * night does not trade. True: handled (no talk).
     */
    heard(v, text) {
        const g = this.game;
        if (SLEEP_MODES.has(v.mode) || v.sleep?.phase === 'lie') {
            if (this.auth) this.rouse(v, g.localId);
            else g.sync?.villagerTalk?.(v.id);
            return true;
        }
        if (v.role === 'merchant' && this.closed() && TRADE_WORDS.test(String(text || '').toLowerCase())) {
            if (this.auth) { v.talking = 3; v.talkTo = g.localId; }
            this.life._say(v, LINES.nightShop, 4);
            return true;
        }
        return false;
    }

    /** (host) The merchants packing up / the watch walking its rounds — from CastleLife._think after the dangers. */
    duty(v, dt) {
        const L = this.life;
        if (v.pack > 0) {
            v.pack -= dt;
            v.mode = 'work'; v.speed = 0;
            if (v.pack <= 0) { v.pack = 0; this._goRest(v); }
            L._ground(v);
            return true;
        }
        if (!v.rounds) return false;
        const R = v.rounds;
        const g = v.cs.graph;
        if (R.wait > 0) { R.wait -= dt; v.mode = 'idle'; v.speed = 0; v.yaw += dt * 0.3; L._ground(v); return true; }
        if (!v.path) {
            const opts = isWizSite(v.cs.def)
                ? g.nodes.filter((n) => n.tag).map((n) => n.id)
                : g.tagged('yard').concat(g.tagged('well'), g.tagged('gateIn'), g.tagged('market'), g.tagged('home'), g.tagged('stall'));
            if (!opts.length || !L._goTo(v, opts[Math.floor(Math.random() * opts.length)])) { R.wait = 3; return true; }
        }
        if (L._followPath(v, dt, WALK * 0.75)) { v.path = null; R.wait = 4 + Math.random() * 8; }
        v.mode = 'walk';
        L._ground(v);
        return true;
    }

    // ---------------------------------------------------------- sensing (host)
    _sense(part) {
        const L = this.life;
        const F = L.fright;
        const dangers = F ? [...F.list.values()].filter((d) => F.now - d.at < 3) : [];
        for (const v of L.byId.values()) {
            const S = v.sleep;
            if (!S || S.phase !== 'lie' || v.dead) continue;
            if (S.wakeAt == null && !sleepTime(part)) S.wakeAt = this._t + Math.random() * 20; // (the morning came)
            for (const d of dangers) {
                if (Math.abs(d.x - v.x) > 120 || Math.abs(d.z - v.z) > 120) continue;
                if (wakesSleeper(d.kind, Math.hypot(d.x - v.x, d.z - v.z), d.r)) { this.wake(v, 'danger'); break; }
            }
        }
        // the watch sees trouble: «Тревога!» — the sleeping knights jump up and come
        for (const cs of L.castles.values()) {
            if (!cs.awake || cs.def.kind === 'stall' || !sleepTime(cs.nightPart || part) || isWizSite(cs.def)) continue;
            let w = null;
            for (const v of cs.active.values()) if (v.watch && !v.dead && (v.foe || v.investigate)) { w = v; break; }
            if (!w || (cs.alarmAt != null && this._t - cs.alarmAt < 40)) continue;
            cs.alarmAt = this._t;
            L._say(w, pick(LINES.alarm), 4);
            for (const v of cs.active.values()) if (v.role === 'knight' && v.sleep) this.wake(v, 'alarm');
            const at = w.investigate || { x: w.x, y: w.y, z: w.z };
            L._sendGuards(cs, at, w.foe || w.investigate?.by || null, 3);
        }
        this._sailorSense(dangers);
    }

    // ---------------------------------------------------------- the wizards' tower (host)
    /** (WizardLife._staff at night) One of the tower's people goes to bed (or out of sight). */
    towerRest(cs, idx) {
        const v = cs.active.get(idx);
        if (!v || v.dead || v.foe || v.sleep) return;
        if (cs.def.kind === 'tower') v.house = cs.def.houses.findIndex((h) => h.bedSpots?.length);
        if (v.house < 0) v.house = null;
        this._goRest(v);
    }

    /** (WizardLife._staff at night) The one wizard awake: rounds through the tower. */
    towerWatch(v) {
        if (!v || v.dead) return;
        v.watch = true;
        v.rounds = v.rounds || { t: 0 };
    }

    _tower(cs, part) {
        cs.nightPart = part;
        if (!sleepTime(part) || cs.wizNight === false) return;
        // trouble in the tower at night: the watching wizard calls everybody (they come to their day places)
        const now = Date.now();
        let w = null;
        for (const v of cs.active.values()) if (!v.dead && !v.sleep && (v.foe || (v.hurtAt && now - v.hurtAt < 5000))) { w = v; break; }
        if (!w && this.life.fright?.near(cs.def.x, cs.def.z, 30).some((d) => this.life.fright.now - d.at < 2)) w = [...cs.active.values()].find((v) => v.watch && !v.dead) || null;
        if (!w || cs.wizAlarmUntil > now) return;
        cs.wizAlarmUntil = now + 180000;
        this.life._say(w, pick(LINES.wizAlarm), 4);
        for (const v of cs.active.values()) if (v.sleep) this.wake(v, 'alarm');
        cs.wizNight = false;
        this.life.wizards._staff(cs);
    }

    // ================================================================ the ships (host)
    _crew() { return this.game.ships?.crew || null; }

    /** The ship's night watch: the boatswain (or the first sailor alive). */
    sailorWatch(s, list) {
        let best = null;
        for (const v of list || []) if (!v.dead && v.role !== 'captain' && !v.overboard && (!best || v.idx < best.idx)) best = v;
        return best;
    }

    /** Where a sailor sleeps aboard: the captain in his cabin, the crew below by the hammocks (ship's frame). */
    _sailorPlace(s, v, list) {
        const Lt = s.layout;
        const nodes = v.role === 'captain' ? Lt.nodes.filter((n) => n.tag === 'cabin') : Lt.nodes.filter((n) => n.tag === 'hammock' || n.tag?.startsWith('hammock:'));
        const base = nodes.length ? nodes : Lt.nodes.filter((n) => n.tag === 'store').concat(Lt.nodes.filter((n) => n.id === v.home));
        if (!base.length) return null;
        const sleepers = (list || []).filter((o) => o.role !== 'captain' && o !== this.sailorWatch(s, list)).sort((a, b) => a.idx - b.idx);
        const i = Math.max(0, sleepers.indexOf(v));
        const n = base[i % base.length];
        const k = Math.floor(i / base.length);
        const OFF = [[0, 0], [2.3, 0], [-2.3, 0], [0, 4.4], [2.3, 4.4], [-2.3, 4.4], [0, -4.4], [2.3, -4.4], [-2.3, -4.4]];
        const [ox, oz] = OFF[k % OFF.length];
        return { x: n.x + ox, y: n.y, z: n.z + oz, yaw: 0, node: n.id };
    }

    /**
     * (host, from Sailors._think when no foe) A sailor's night: to his place below and asleep; the
     * watch walks the deck as by day. True: handled this frame.
     */
    sailor(v, s, dt) {
        const C = this._crew();
        const list = C?.crews.get(s.id);
        const part = this.part();
        const S = v.nsleep;
        if (S) {
            if (v.stunT > 0 || v.vy || v.overboard || v.foe) { if (S.phase === 'up') v.l.y = S.place.y; v.nsleep = null; return false; }
            if (S.phase === 'lie') {
                if (!sleepTime(part) && S.wakeAt == null) S.wakeAt = this._t + Math.random() * 20;
                if (S.wakeAt != null && this._t >= S.wakeAt) this.wakeSailor(v, 'morning');
                else { v.l.x = S.place.x; v.l.y = S.place.y; v.l.z = S.place.z; v.lyaw = S.place.yaw; v.mode = 'sleepMat'; v.speed = 0; v.path = null; return true; }
            }
            if (S.phase === 'up') {
                // (sat up on the deck: the body lowered by the legs' length, then up on the feet)
                S.t -= dt; v.mode = 'situp'; v.speed = 0;
                v.l.y = S.place.y - (VILLAGER_FOOT_OFFSET - VILLAGER_SIT_OFFSET);
                if (S.t <= 0) { v.l.y = S.place.y; v.nsleep = null; v.wokeAt = this._t; v.mode = 'idle'; v.waitT = 1; if (S.why === 'talk' && S.by) { v.talking = 5; v.talkTo = S.by; } }
                return true;
            }
            return false;
        }
        if (!sleepTime(part) || v.talking > 0 || s.hostile.size || s.flooded) return false;
        if (v === this.sailorWatch(s, list)) return false; // (the watch: walks the stations as by day)
        if (v.wokeAt != null && this._t - v.wokeAt < BACK_TO_BED) return false;
        const P = this._sailorPlace(s, v, list);
        if (!P) return false;
        const d = Math.hypot(P.x - v.l.x, P.z - v.l.z);
        if (d < 0.6 && Math.abs(P.y - v.l.y) < 1) { v.toBedT = 0; v.nsleep = { phase: 'lie', place: P }; v.path = null; return true; }
        if (v.path) return false; // (Sailors walks him along the route)
        if (v.node !== P.node) {
            v.path = C._route(s, v.node, P.node); v.pathI = 0;
            if (v.path) return false;
        }
        C._steer(v, s, P.x, P.z, WALK, dt); v.mode = 'walk';
        v.toBedT = (v.toBedT || 0) + dt;
        // (blocked on the way to his place: lies down where he is)
        if (v.toBedT > 8) { v.toBedT = 0; v.nsleep = { phase: 'lie', place: { ...P, x: v.l.x, y: v.l.y, z: v.l.z } }; }
        return true;
    }

    /** (host) A sailor wakes ('hit' | 'alarm' | 'danger' | 'talk' | 'morning'). */
    wakeSailor(v, why = 'noise', by = null) {
        const S = v?.nsleep;
        if (!S || v.dead || S.phase !== 'lie') return false;
        v.nsleep = { phase: 'up', place: S.place, t: why === 'morning' || why === 'talk' ? 1.4 : 0.5, why, by };
        const C = this._crew();
        if (why === 'talk') C?._say(v, pick(LINES.wokeTalk), 3);
        else if (why === 'hit') C?._say(v, pick(LINES.wokeHit), 3);
        return true;
    }

    /** (host) A sailor spoken to / touched asleep: a mumble; again — awake. True: he was asleep. */
    rouseSailor(v, by = null) {
        const S = v?.nsleep;
        if (!S || S.phase !== 'lie') return false;
        S.rouse = S.rouseAt != null && this._t - S.rouseAt < 20 ? (S.rouse || 0) + 1 : 1;
        S.rouseAt = this._t;
        if (S.rouse >= 2) this.wakeSailor(v, 'talk', by);
        else this._crew()?._say(v, pick(LINES.mumble), 2.5);
        return true;
    }

    /** (host) The whole crew up: the watch shouts «Полундра!». */
    crewAlarm(s, shout = true) {
        const C = this._crew();
        const list = C?.crews.get(s.id);
        if (!list || !list.some((v) => v.nsleep?.phase === 'lie')) return;
        const w = this.sailorWatch(s, list);
        if (shout && w && !w.nsleep) C._say(w, pick(LINES.sea), 4);
        for (const v of list) this.wakeSailor(v, 'alarm');
    }

    _sailorSense(dangers) {
        const C = this._crew();
        if (!C || !dangers.length) return;
        for (const [sid, list] of C.crews) {
            const s = C.ships.list.get(sid);
            if (!s || !list.some((v) => v.nsleep?.phase === 'lie')) continue;
            const w = this.sailorWatch(s, list);
            for (const d of dangers) {
                const near = (v) => Math.hypot(d.x - v.x, d.z - v.z);
                // (the watch sees it from the deck: everybody up; or it is loud enough to wake them below)
                if ((w && !w.nsleep && near(w) < (DANGERS[d.kind]?.see || 30) * 0.6) || list.some((v) => v.nsleep && wakesSleeper(d.kind, near(v), d.r))) { this.crewAlarm(s); break; }
            }
        }
    }

    // ================================================================ every computer
    /**
     * Touching a sleeper with the hand (hers / his body under the blanket) rouses them; the watch's
     * torches; the «z-z-z» over the sleepers near me.
     */
    visuals(dt) {
        const g = this.game;
        const me = g.character?.group?.position;
        if (!me) return;
        const night = this.asleepTime();
        // torches: the knights of the watch (host's v.fx), the ship's watch
        for (const v of this.life.byId.values()) if (v.role === 'knight' && v.model?.setTorch) v.model.setTorch(!v.dead && !!(v.fx & FX_TORCH));
        const C = this._crew();
        if (C) for (const [sid, list] of C.crews) {
            const s = C.ships.list.get(sid);
            const w = night && s ? this.sailorWatch(s, list) : null;
            for (const v of list) v.model?.setTorch?.(v === w && !SLEEP_MODES.has(v.mode));
        }
        const sleepers = [];
        for (const v of this.life.byId.values()) if (SLEEP_MODES.has(v.mode) && !v.dead && Math.abs(v.x - me.x) < ZZZ_NEAR && Math.abs(v.z - me.z) < ZZZ_NEAR) sleepers.push(v);
        if (C) for (const v of C.byId.values()) if (SLEEP_MODES.has(v.mode) && !v.dead && Math.abs(v.x - me.x) < ZZZ_NEAR && Math.abs(v.z - me.z) < ZZZ_NEAR) sleepers.push(v);
        this._touch(sleepers, dt);
        this._zzzStep(sleepers, dt);
    }

    _touch(sleepers, dt) {
        const g = this.game, ch = g.character;
        if (!sleepers.length || !ch?.getHandWorldPosition || g.isDeadLocal) return;
        const hands = [ch.getHandWorldPosition('left', _h1), ch.getHandWorldPosition('right', _h2)];
        for (const v of sleepers) {
            const yaw = v.group.rotation.y, hx = Math.sin(yaw), hz = Math.cos(yaw);
            const y = v.group.position.y - VILLAGER_FOOT_OFFSET + 0.7;
            let touch = false;
            for (const h of hands) {
                if (!h || Math.abs(h.y - y) > 1.2) continue;
                // (distance from the hand to the body's line, feet to head)
                const dx = h.x - v.group.position.x, dz = h.z - v.group.position.z;
                const along = Math.max(-2, Math.min(2, dx * hx + dz * hz));
                if (Math.hypot(dx - hx * along, dz - hz * along) < 1.15) { touch = true; break; }
            }
            v._touchT = touch ? (v._touchT || 0) + dt : 0;
            if (v._touchT > 0.5 && !v._touched) {
                v._touched = true;
                if (v.isSailor) { if (this.auth) this.rouseSailor(v, g.localId); else g.sync?.net?.send?.({ t: 'screw', talk: 1, id: v.id }); }
                else if (this.auth) this.rouse(v, g.localId);
                else g.sync?.villagerTalk?.(v.id);
            }
            if (!touch && v._touchT === 0) v._touched = false;
        }
    }

    _zzzStep(sleepers, dt) {
        if (typeof document === 'undefined') return;
        const g = this.game;
        if (!this._zzz) {
            if (!sleepers.length) return;
            const c = document.createElement('canvas');
            c.width = c.height = 64;
            const x = c.getContext('2d');
            x.font = 'bold 50px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
            x.lineWidth = 6; x.strokeStyle = 'rgba(30,40,80,0.8)'; x.strokeText('z', 32, 34);
            x.fillStyle = '#e8f0ff'; x.fillText('z', 32, 34);
            const tex = new THREE.CanvasTexture(c);
            this._zzz = [];
            for (let i = 0; i < 12; i++) {
                const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
                s.visible = false; s.renderOrder = 997;
                g.scene.add(s);
                this._zzz.push({ s, t: 1, x: 0, y: 0, z: 0 });
            }
        }
        for (const v of sleepers) {
            v._zT = (v._zT ?? Math.random() * 2) - dt;
            if (v._zT > 0) continue;
            v._zT = 1.3 + Math.random() * 0.6;
            const z = this._zzz.find((q) => q.t >= 1);
            if (!z) break;
            const yaw = v.group.rotation.y;
            z.x = v.group.position.x + Math.sin(yaw) * 1.7; z.z = v.group.position.z + Math.cos(yaw) * 1.7;
            z.y = v.group.position.y - VILLAGER_FOOT_OFFSET + 1.3;
            z.t = 0; z.dx = (Math.random() - 0.5) * 0.4;
        }
        for (const q of this._zzz) {
            if (q.t >= 1) { q.s.visible = false; continue; }
            q.t = Math.min(1, q.t + dt / 2.6);
            q.s.visible = true;
            q.s.position.set(q.x + q.dx * q.t + Math.sin(q.t * 7) * 0.12, q.y + q.t * 1.4, q.z);
            const k = 0.25 + q.t * 0.35;
            q.s.scale.set(k, k, 1);
            q.s.material.opacity = q.t < 0.2 ? q.t / 0.2 * 0.9 : 0.9 * (1 - (q.t - 0.2) / 0.8);
        }
    }

    dispose() {
        for (const q of this._zzz || []) { this.game.scene.remove(q.s); q.s.material.dispose(); }
        this._zzz = null;
    }
}

const _h1 = new THREE.Vector3();
const _h2 = new THREE.Vector3();
