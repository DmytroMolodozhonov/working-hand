/**
 * WizardLife.js — the life of the wizards (a part of CastleLife for the wizards'
 * towers and the wandering wizards).
 *
 * Day: the Master sits in his study (now and then he looks through the telescope),
 * a teacher teaches at the lectern (sparks at the training dummies), another brews
 * at a cauldron, the scroll seller stands behind the counter, students practise at
 * the desks and walk about the floors (the library, the hall, the laboratory…).
 * Now and then somebody practises a simple spell for real to see: «Левиоса» on a
 * book or an apple (sometimes it only jerks and drops: «Не Левиоса́, а Леви́оса!»),
 * sparks, a glowing line in the air. Night: the students stay in the dormitory,
 * two teachers keep watch at the door with «Люмос» on their wands, the Master
 * looks at the stars, the shop is closed.
 *
 * The host decides (like all the castle people); what is seen goes to everyone
 * as `v.fx` bits and is drawn by src/fx/WizardFx.js on every computer.
 */

import { WIZ, WIZ_ROLE_RU, wizardRoster, wizardStats, rollMana } from './WizardAI.js';
import { EXPELLIARMUS } from './Expelliarmus.js';
import { WizardFx, FX } from '../fx/WizardFx.js';
import { WizardFight } from './WizardFight.js';
import { DANGERS } from './Danger.js';
import { staffVillage, crowdVillage, villageTrip } from './WizVillages.js';
import { reactLag, reactLagText, knowsFirefighting, canDome, SHIELD, HUNT, huntRole, huntStart, huntStep, huntLeash, seededRng, LONERS, npcSweeps, SMOKE, MAGIC_REACT, reaction, chooseShield } from './WizardMind.js';
import { hashString } from '../core/math.js';

export { FX };
export const isWizSite = (def) => !!def && (def.kind === 'tower' || def.kind === 'wander' || def.kind === 'wizvillage' || (def.kind === 'hamlet' && !!def.mage)); // (a wizards' hamlet: Hamlets.js)
/** A wizards' place that keeps a day and a night (a tower, a settlement — not the wanderers of the roads). */
export const isWizHome = (def) => !!def && (def.kind === 'tower' || def.kind === 'wizvillage');

const WALK = 2.3;
const PRACTICE_NEAR = 40; // m: practice only where a player can see it
const PRACTICE_MAX = 3; // at once, per tower
const WIZ_JOBS = new Set(['sit', 'teach', 'brew', 'desk', 'watch', 'star']);
export { WIZ_JOBS };

export const WIZ_SHOUT = {
    ambient: {
        student: ['Вингардиум Левиоса… ой, опять не так.', 'Завтра экзамен по зельям!', 'Кто взял мою книгу заклинаний?', 'Наставник опять задал три свитка.', 'Смотри, у меня почти получилось!'],
        teacher: ['Взмах и рывок, взмах и рывок.', 'Тише в библиотеке!', 'Палочку держите крепче.', 'Не торопитесь, произносите чётко.'],
        seller: ['Свитки! Свитки здоровья и силы!', 'Редкие свитки — подходите!', 'Возьмите свиток — я назову цену.'],
        master: ['Звёзды сегодня ясные…', 'Академия стоит уже триста лет.', 'Знание — сильнейшее из заклинаний.'],
        wanderer: ['Долгая дорога…', 'Ветер сегодня с севера.', 'Видал я и не такое в пути.'],
        mage: ['Травы сегодня хорошо сохнут.', 'Тихо у нас, спокойно.', 'Опять зелье не загустело…', 'Звёзды сегодня ясные.', 'Огонь не гаси — он у нас всю ночь горит.'],
    },
    fight: ['Как ты смеешь — в академии!', 'Палочки к бою!', 'Ты пожалеешь об этом!', 'Защищайтесь, ученики!'],
    levFail: ['Не Левиоса́, а Леви́оса!', 'Взмах и рывок! Ещё раз.', 'Не так резко, плавнее!'],
    oops: ['Ой!', 'Опять упала…', 'Ну вот…'],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** Danger kinds (Danger.DANGERS) → the kind of magic in WizardMind.MAGIC_REACT. */
const MAGIC_OF = { blast: 'blast', boom: 'blast', inspirius: 'blast', ruin: 'quake', quake: 'quake', circle: 'quake', castlemagic: 'quake', fire: 'fire', ice: 'ice', uproot: 'wind', die: 'curse', dark: 'curse' };
const FIRE_LINES = ['Огонь! За стену!', 'В здание, там не достанет!', 'Разойдитесь, не толпитесь!', 'Прочь от пламени!'];
const DANGER_LINES = {
    brave: ['Что это было?! За мной!', 'Взрыв в академии! Палочки наготове!', 'Кто посмел?! Проверить!', 'Это нападение! Все наверх!'],
    timid: ['А-а-а! Бежим!', 'Помогите!', 'Наставник!', 'Башня рушится!'],
};

function turn(a, b, k) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, k);
}

export class WizardLife {
    constructor(life) {
        this.life = life;
        this.game = life.game;
        this.fx = new WizardFx(this.game);
        this.fight = new WizardFight(this); // (a fight: duel spells, shields, the circle's plans)
        this._dayT = 0;
        this._practiceT = 0;
    }

    get auth() { return this.game.authority; }

    /** A wizard has just come out (on every computer): stats, mana, wand. */
    init(v) {
        // his rank's habits and his own mana (WizardAI.WIZ_RANKS: rolled from the world — the same on every computer)
        const e = v.entry, rank = e.rank || 'adept';
        const max = e.mana ?? rollMana(rank, Math.random);
        const W = wizardStats(v.role, rank, max);
        v.wizard = true;
        v.rank = rank;
        v.skillRole = { novice: 'student', adept: 'adept', teacher: 'teacher', master: 'master', elder: 'teacher' }[rank] || v.role;
        v.W = W;
        v.mana = max; v.maxMana = max;
        v.castCd = 1 + Math.random(); v.domeCd = 0; v.windCd = 0; v.blinkCd = 0;
        // his own traits (WizardMind): how fast he reacts to trouble, whether he knows «Firefighting», whether he may raise the dome («Protection Maxima»)
        v.reactLag = reactLag(rank, seededRng(hashString(String(v.id) + ':react')));
        v.knowsFire = knowsFirefighting(v.id, rank);
        if (!W.dome && canDome(max, rank)) W.dome = { ...SHIELD.DOME }; // (a strong wizard's dome: not only the Master's)
        v.fx = 0; v.aimPitch = 0;
        v.title = e.elder ? 'Старейшина' : WIZ_ROLE_RU[v.role][v.entry.female ? 1 : 0]; // (a settlement's Elder: WizVillages.js)
    }

    // ---------------------------------------------------------- who is where
    /** (host) The tower's people at their places for the day / the night. */
    wake(cs) {
        if (!isWizHome(cs.def)) return;
        cs.wizNight = this.game.isNight;
        this._staff(cs);
    }

    _spots(def, kind) { return (def.spots || []).filter((s) => s.kind === kind); }

    _staff(cs) {
        if (cs.def.kind === 'wizvillage') { staffVillage(this.life, cs); return; } // (a settlement: WizVillages.js)
        const L = this.life, def = cs.def;
        const st = L.state(def.id);
        const night = cs.wizNight;
        const put = (idx, post, job) => {
            if (!post) return null;
            const at = { x: post.x, y: post.y, z: post.z, yaw: post.yaw ?? 0 };
            let v = cs.active.get(idx);
            if (v) { if (!v.foe && !v.dead) { v.job = job; v.post = at; v.path = null; } return v; }
            if (st.killed.has(idx)) return null;
            return L._activate(cs, idx, at, job, { post: at });
        };
        // the Master: in the study by day, asleep in the tower at night (NightLife.js)
        if (!st.kingDead) {
            if (night) L.night.towerRest(cs, 0);
            else put(0, def.throne, 'sit');
        }
        // the scroll sellers: behind the counter by day; gone home at night
        def.stalls.forEach((s, i) => {
            const idx = 1 + i;
            if (!night) put(idx, { ...s.back, yaw: s.yaw }, 'stall');
            else { const v = cs.active.get(idx); if (v && !v.foe && !v.dead && !v.pack && !v.goingHome && !v.sleep) L._deactivate(v); } // (a packing seller finishes and walks home — NightLife.duty)
        });
        // teachers: at the lectern and a cauldron by day; two on watch at the door at night
        const T0 = 1 + def.stalls.length;
        const lect = this._spots(def, 'lectern')[0], caul = this._spots(def, 'cauldron');
        for (let k = 0; k < Math.min(2, def.teachers || 0); k++) {
            const idx = T0 + k;
            // (at night one of them walks the rounds through the tower; the other sleeps — NightLife.js)
            if (night && k === 0) L.night.towerWatch(put(idx, def.posts[k], 'watch'));
            else if (night) L.night.towerRest(cs, idx);
            else { const v = put(idx, k === 0 ? lect : caul[0], k === 0 ? 'teach' : 'brew'); if (v) { v.watch = false; v.rounds = null; } }
        }
        // students practising at the desks by day
        if (!night) {
            const desks = this._spots(def, 'desk');
            desks.forEach((d, k) => {
                const busy = [...cs.active.values()].some((v) => v.job === 'desk' && v.post && Math.hypot(v.post.x - d.x, v.post.z - d.z) < 0.5);
                if (busy) return;
                const idx = L._freeCommoner(cs, 'student');
                if (idx >= 0) put(idx, { ...d, yaw: d.yaw ?? 0 }, 'desk');
            });
        } else {
            for (const v of [...cs.active.values()]) if (v.job === 'desk' && !v.foe) L._deactivate(v);
        }
    }

    /** (host) Keep a few students and teachers about near the players (fewer at night). */
    crowd(cs, dt) {
        const L = this.life, def = cs.def;
        if ((cs.wizAlarmUntil || 0) > Date.now()) return; // (an alarm: nobody new strolls out as if nothing happened)
        if (def.kind === 'wizvillage') { crowdVillage(L, cs, dt); return; }
        if (def.kind !== 'tower') return;
        cs.spawnT -= dt;
        if (cs.spawnT > 0) return;
        cs.spawnT = 0.9;
        const players = L._players().filter((pl) => L._inLand(def, pl.p, 40));
        if (!players.length) return;
        const q = [0.45, 0.65, 0.85, 1][this.game.quality?.level ?? 3] ?? 1;
        const want = Math.round(Math.min(6, 2 + def.population / 12) * (this.game.isNight ? 0 : 1) * q); // (at night they sleep — NightLife.js)
        let count = 0;
        for (const v of cs.active.values()) if (v.job === 'wander' && !v.dead) count++;
        for (const v of [...cs.active.values()]) {
            if (v.job !== 'wander' || v.foe) continue;
            if (!players.some((pl) => Math.hypot(pl.p.x - v.x, pl.p.z - v.z) < 100)) { L._deactivate(v); count--; }
        }
        if (count >= want) return;
        // out of a house or a room on another floor, not right before the player's eyes
        const pl = players[Math.floor(Math.random() * players.length)];
        const g = cs.graph;
        const from = g.tagged('home').concat(g.tagged('room'));
        let node = -1;
        for (let t = 0; t < 14; t++) {
            const n = g.nodes[from[Math.floor(Math.random() * from.length)]];
            if (!n) continue;
            const d = Math.hypot(n.x - pl.p.x, n.z - pl.p.z), dy = Math.abs(n.y - (pl.p.y - 1.95));
            if ((d > 22 && d < 70) || (dy > 6 && d < 40)) { node = n.id; break; }
        }
        if (node < 0) return;
        const idx = L._freeCommoner(cs, Math.random() < 0.8 ? 'student' : null);
        if (idx < 0) return;
        const n = g.nodes[node];
        const v = L._activate(cs, idx, { x: n.x, y: n.y, z: n.z }, 'wander');
        if (v) {
            v.node = node; v.trips = 1 + Math.floor(Math.random() * 3);
            if (Math.random() < 0.4) v.waitT = 4 + Math.random() * 12; else L._nextTrip(v);
        }
    }

    /** A wandering wizard picks where to go (rooms of the tower, the shop, home, the plaza). */
    nextTrip(v) {
        if (v.trips <= 0) return false; // (home: the usual way)
        if (v.cs.def.kind === 'wizvillage') return villageTrip(this.life, v);
        const L = this.life, g = v.cs.graph;
        v.trips--;
        const choose = (tag) => { const l = g.tagged(tag); return l.length ? l[Math.floor(Math.random() * l.length)] : -1; };
        const r = Math.random();
        let node = r < 0.55 ? choose('room') : r < 0.65 ? choose('stall') : r < 0.75 ? choose('cauldron') : r < 0.88 ? choose('ring') : choose('home');
        if (node < 0) node = choose('room');
        if (node < 0) return false;
        v.purpose = g.nodes[node]?.tag || '';
        L._goTo(v, node);
        return true;
    }

    /**
     * (host) Something dreadful at `pos` (a blast that broke half the tower, a quake, lightning…):
     * nobody of the tower goes on walking calmly by. The brave wizards go to see what it was (and
     * who: the culprit seen near — the whole tower goes for him, CastleLife._catch); the timid
     * students run from it. (Asleep: NightLife wakes them by the noise first.)
     */
    danger(pos, kind, by = null, r = null, via = kind === 'quake' ? 'quake' : kind === 'fire' ? 'fire' : null) {
        const L = this.life, now = Date.now();
        const D = DANGERS[kind] || DANGERS.blast;
        const isPlayer = L._isPlayer(by);
        const bp = isPlayer ? L._playerPos(by) : null;
        for (const cs of L.castles.values()) {
            if (!cs.awake || !isWizSite(cs.def) || !L._inLand(cs.def, pos, D.hear * 0.5)) continue;
            if (isPlayer && by === L.state(cs.def.id).owner) continue;
            let seen = false, said = false;
            for (const v of cs.active.values()) {
                if (v.dead || v.sleep || v.lev || v.servantOf != null || v.foe) continue;
                const d = Math.hypot(v.x - pos.x, v.z - pos.z);
                if (d > D.hear) continue;
                v.practice = null;
                if (bp && !seen && L._knows(v, by, pos, via)) seen = true; // (only who saw him do it knows: no mind-reading — Blame.js)
                if (L._fights(v)) {
                    // (the Master keeps his place unless it is close; the others come — a tower has paths)
                    if ((v.role === 'master' && d > 30) || (!cs.graph.nodes.length && !LONERS.has(v.role)) || (v.investigate && v.investigate.t > 10) || v.hunt) { v.yaw = Math.atan2(-(pos.x - v.x), -(pos.z - v.z)); v.seated = false; continue; }
                    if (WIZ_JOBS.has(v.job) && v.job !== 'sit') { v.job = 'wander'; v.post = null; v.trips = 0; } // (the lectern, the cauldron left: nobody goes on as if nothing happened)
                    // what kind of magic it was decides the first thing he does (WizardMind.MAGIC_REACT): a blast — the shield; lightning, a quake, fire — away / under a roof
                    const rk = MAGIC_OF[kind], close = d < (r ?? D.r) + D.near;
                    if (rk && close) {
                        const act = reaction({ kind: rk, mana: v.mana, noWand: v.noWand, hpK: v.hp / (v.maxHp || 1), burning: false, knowsFire: v.knowsFire, sheltered: false });
                        if (act === 'shield' && !(v.fx & (FX.SHIELD | FX.DOME)) && v.mana >= SHIELD.COST_HAND) {
                            v.mana -= SHIELD.COST_HAND; v.shieldT = 2.5; v.fx |= FX.SHIELD; v.yaw = Math.atan2(-(pos.x - v.x), -(pos.z - v.z));
                            L.alog?.decision(v, `${rk}: ${MAGIC_REACT[rk].why} → поднял щит`);
                        } else if (act === 'run' || act === 'shelter') {
                            v.fleeAt = { x: pos.x, z: pos.z, r: (r ?? D.r) + 8 }; v.fleeFrom = null; v.fleeT = 9; v.fleeing = false; v.flee = null; v.path = null; v.seated = false;
                            if (act === 'shelter') v.shelter = true;
                            L.alog?.decision(v, `${rk}: ${MAGIC_REACT[rk].why} → ${act === 'shelter' ? 'в безопасное место' : 'прочь'}`);
                            if (!said) { said = true; L._say(v, pick(DANGER_LINES.timid), 2.5); }
                            continue;
                        }
                    }
                    const lvl = isPlayer ? L.wantedLevel(by) : 0;
                    // who hunts, who keeps the place (the more the wanted level, the more go; a beginner hides — it is logical)
                    const role = huntRole({ role: v.role, rank: v.rank, level: lvl, saw: false, tied: v.role === 'master', hasWand: !v.noWand });
                    const at = { x: pos.x, y: pos.y ?? v.y, z: pos.z };
                    v.seated = false;
                    if (role === 'hunt') {
                        this.later(v, 'тревога → розыск', () => { if (!v.dead && !v.foe) this.startHunt(v, { x: at.x, z: at.z, dx: 0, dz: 0 }, lvl, 'грохнуло, виновник не виден'); }, pos);
                    } else if (role === 'hide' && v.rank === 'novice') {
                        // (a beginner hides — it is logical: away from it, by the building's ways to the farthest place, under a roof if there is one)
                        v.fleeAt = { x: pos.x, z: pos.z, r: (r ?? D.r) + 6 }; v.fleeFrom = null; v.fleeT = 8; v.fleeing = false; v.flee = null; v.path = null; v.shelter = true;
                        L.alog?.decision(v, 'тревога: начинающий прячется (в укрытие, под крышу)');
                    } else {
                        this.later(v, 'тревога → осмотр места', () => { if (!v.dead && !v.foe) { v.investigate = { x: at.x, y: at.y, z: at.z, by: null, t: 45 }; v.path = null; v.lookT = 0; } }, pos);
                    }
                    if (!said) { said = true; L._say(v, pick(DANGER_LINES.brave), 3); }
                } else {
                    // the timid: away from it (and from the hole it left — dreadful too), whoever heard it;
                    // the near ones longer. Never towards it, never past the one who did it (CastleLife._fleeStep)
                    const near = d < (r ?? D.r) + D.near + 8;
                    v.fleeAt = { x: pos.x, z: pos.z, r: (r ?? D.r) + 6 }; v.fleeFrom = null; v.fleeT = near ? 12 : 7; v.fleeing = false; v.seated = false; v.flee = null; v.path = null;
                    if (near && Math.random() < 0.4) L._say(v, pick(DANGER_LINES.timid), 2.5);
                }
            }
            if (seen) L._catch(cs, by, pos);
            if (isWizHome(cs.def)) cs.wizAlarmUntil = Math.max(cs.wizAlarmUntil || 0, now + (isPlayer ? 60000 : 30000)); // (no going to bed in the middle of it, no strolling to the arena)
        }
    }

    // ------------------------------------------------------------ reacting late, hunting
    /** Turned towards the trouble, the wand not out yet — he has not understood (a beginner) or is only pulling it out. */
    _lost(v, dt) {
        const to = v.later.to;
        v.speed = 0; v.path = null; v.seated = false;
        if (to) v.yaw = turn(v.yaw, Math.atan2(-(to.x - v.x), -(to.z - v.z)), dt * 4);
        v.mode = 'idle';
        this.life._ground(v);
    }

    /** (host) Do it after his own reaction time; the log says how long and why («решение:»). */
    later(v, what, fn, to = null) {
        if (v.later) return false;
        const lag = v.reactLag || { t: 0.5, level: 2 };
        if (lag.t <= 0.2) { fn(); return true; }
        v.later = { t: lag.t, fn, to };
        this.life.alog?.decision(v, `${what}: ${reactLagText(lag)}`);
        return true;
    }

    /**
     * (host) The hunt for the one who did it. `at`: where he was last known (a seen culprit's last place, the place a shot came from,
     * a blast) with the way he was going (dx, dz). The wizard walks there, looks round, then checks the likely places;
     * what he SEES (not an invisible hero he never noticed) ends it — a fight. Out of time or too far from home — he gives up.
     */
    startHunt(v, at, level = 0, why = '') {
        if (!v.W || v.noWand || v.dead || v.hunt) return false;
        v.hunt = huntStart(at, level, this.clock());
        v.huntLevel = level;
        v.huntHome = { x: v.x, z: v.z };
        v.huntSaw = !!at.saw;
        v.seated = false; v.path = null;
        if (WIZ_JOBS.has(v.job) && v.job !== 'sit') { v.job = 'wander'; v.post = null; v.trips = 0; }
        this.life.alog?.decision(v, `розыск (степень ${level}): идёт к последнему месту (${at.x.toFixed(0)}, ${at.z.toFixed(0)}), ищет ${HUNT[level].search} с${why ? ' — ' + why : ''}`);
        return true;
    }

    clock() { return performance.now() / 1000; }

    /**
     * (host) A shot flew by a wizard (a «Бомбардо», a charge) and he saw WHERE it came from, not who: with a wand in his hand he does not
     * stand about — the shield towards it, and (a lone wizard of the road / a hamlet / a settlement: always; a tower's wizard by the wanted
     * level) he goes there, even far from home, and searches (WizardMind.huntRole). A beginner without nerve hides instead (returns false —
     * the usual «look at the place»).
     */
    answerShot(v, by, from) {
        const L = this.life;
        if (!v.W || v.noWand || v.dead) return false;
        const lvl = L.wantedLevel(by) || 0;
        const role = huntRole({ role: v.role, rank: v.rank, level: lvl, saw: true, tied: v.role === 'master' || v.job === 'stall', timid: !WizardFight.fights(v), hasWand: true });
        // the shield first, facing the place it came from (the hand one; a strong wizard with a volley coming — the dome: WizardFight._react)
        const sh = chooseShield({ mana: v.mana, maxMana: v.maxMana, rank: v.rank, spell: 'Bombardo', incoming: 1, foes: 1, hpK: v.hp / (v.maxHp || 1), domeReady: false });
        if (sh === 'hand' && !(v.fx & (FX.SHIELD | FX.DOME))) {
            v.mana -= SHIELD.COST_HAND; v.shieldT = Math.max(v.shieldT || 0, 2.5); v.fx |= FX.SHIELD;
            v.yaw = Math.atan2(-(from.x - v.x), -(from.z - v.z));
            L.alog?.decision(v, 'видел, откуда прилетело: поднял щит Protection в ту сторону');
        }
        if (role !== 'hunt') return false;
        const at = { x: from.x, z: from.z, dx: from.x - v.x, dz: from.z - v.z, saw: true };
        L.alog?.decision(v, `видел, откуда прилетело (${from.x.toFixed(0)}, ${from.z.toFixed(0)}) в ${Math.hypot(from.x - v.x, from.z - v.z).toFixed(0)} м: идёт туда${LONERS.has(v.role) ? ' (одиночка — отрывается от дома)' : ''}`);
        this.later(v, 'ответ на выстрел', () => { if (!v.dead && !v.foe) this.startHunt(v, at, lvl, 'выстрел откуда-то'); }, from);
        return true;
    }

    /**
     * (host) A great fire (the Hellfire) at (x, z) of radius R, `heat` 0…1 how close: a wizard runs to a SAFE place — behind a wall, into a
     * building, where the fire does not reach — and not in a heap with the others (CastleLife._fleeExtras: a place loses score for every runner
     * already going there). There: the shield towards the fire; then he answers whoever did it, if known (the usual fight takes him again).
     */
    fireRun(v, x, z, R, heat) {
        if (heat < 0.05 || v.noWand && heat < 0.3 || v.arena || v.dead) return; // (an arena duellist is led by the arena; the dead run from nothing)
        const L = this.life, f = v.fleeAt;
        if (v.sleep) L.night?.wake?.(v, 'alarm'); // (asleep in a house that burns: up)
        if (!v.shelter || !f || Math.hypot(f.x - x, f.z - z) > 4) {
            const first = !v.shelter;
            v.fleeAt = { x, z, r: R + 14 }; v.fleeFrom = null; v.fleeing = false; v.flee = null; v.path = null; v.seated = false; v.investigate = null; v.hunt = null; v.later = null;
            if (WIZ_JOBS.has(v.job) && v.job !== 'wander') { v.job = 'wander'; v.post = null; v.trips = 0; }
            if (first) {
                L.alog?.decision(v, `пожар (адский огонь, радиус ${R.toFixed(0)} м): бежит в безопасное место — за стену, в здание, не в кучу`);
                if (Math.random() < 0.5) L._say(v, pick(FIRE_LINES), 2.5);
            }
        }
        v.shelter = true;
        v.fleeT = Math.max(v.fleeT || 0, 6);
    }

    /** (host) A frame of running from a great fire; true — busy with it. Safe and a foe known: the fight goes on from the refuge. */
    shelterStep(v, dt) {
        const L = this.life;
        if (!(v.fleeT > 0) || !v.fleeAt) { v.shelter = false; return false; }
        const f = v.fleeAt, d = Math.hypot(f.x - v.x, f.z - v.z) - (f.r || 0);
        const safe = d > 25;
        if (safe) {
            // the shield towards the fire while it is near (5 mana; the dome for the strong when it is really worth it — a big fire is)
            if (!(v.fx & (FX.SHIELD | FX.DOME)) && v.mana >= SHIELD.COST_HAND && d < 45 && !v.noWand) {
                v.mana -= SHIELD.COST_HAND; v.shieldT = 3; v.fx |= FX.SHIELD;
            }
            if (v.fx & FX.SHIELD) { v.shieldT = (v.shieldT || 0) - dt; if (v.shieldT <= 0) v.fx &= ~FX.SHIELD; }
            if (v.foe) return false; // (answering the one who did it: the usual fight)
        }
        L._fleeStep(v, dt);
        return true;
    }

    /** (host) One frame of a hunt: true — busy with it. */
    hunting(v, dt) {
        const L = this.life, h = v.hunt;
        const cs = v.cs, now = Date.now();
        // who is in sight? any known enemy of the place (or the one hunted) that he really sees
        v.huntLookT = (v.huntLookT || 0) - dt;
        if (v.huntLookT <= 0) {
            v.huntLookT = 0.4;
            const ids = new Set(); for (const [pid, until] of cs.hostile) if (until > now) ids.add(pid);
            if (v.huntBy != null) ids.add(v.huntBy);
            let sees = null;
            for (const pid of ids) {
                const p = L._playerPos(pid);
                if (p && Math.hypot(p.x - v.x, p.z - v.z) < 55 && L._sees(v, p)) { sees = pid; break; }
            }
            if (sees != null) {
                v.foe = sees; v.hunt = null; v.huntBy = null; v.path = null;
                if (v.engage) v.engage.t = 0; // (he has been hunting: no new lag)
                L._say(v, 'Вот он!', 3);
                L.alog?.decision(v, 'розыск: увидел — бой');
                return false;
            }
        }
        // too far from home for this level: gives up
        const home = v.huntHome || { x: v.cs.def.x, z: v.cs.def.z };
        const leash = huntLeash({ role: v.role, level: v.huntLevel ?? 0, saw: v.huntSaw });
        if (Math.hypot(v.x - home.x, v.z - home.z) > leash + 40) { this._endHunt(v, 'слишком далеко от дома'); return false; }
        const st = huntStep(h, v, false, dt);
        if (st.a === 'give') { this._endHunt(v, 'время вышло, никого не нашёл'); return false; }
        if (st.a === 'look') {
            v.speed = 0; v.path = null; v.mode = 'idle';
            v.yaw = turn(v.yaw, v.yaw + 1.2, dt * 1.2); // (looking round)
            L._ground(v);
            return true;
        }
        const g = st.goal;
        // (the land there is not made yet — far from the hero: he waits and looks, the workers make it; the land is never made in a frame)
        const td = this.game.world?.terrain?.data;
        if (td?.landMade && !td.landMade(g.x, g.z)) { v.speed = 0; v.path = null; v.mode = 'idle'; L._ground(v); return true; }
        L._goSpot(v, g.x, g.z, WALK * 1.9, dt, 1.5);
        v.mode = v.speed > WALK * 1.4 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
        L._ground(v);
        return true;
    }

    _endHunt(v, why) {
        v.hunt = null; v.huntBy = null; v.huntLevel = 0; v.path = null;
        this.life.alog?.decision(v, `розыск окончен: ${why}`);
        if (Math.random() < 0.5) this.life._say(v, 'Ушёл… Но я запомню.', 3);
    }

    /**
     * (host) A wizard turns a wave of smoke aside with a stroke of the wand (SmokeSwipe — the same as the hero's): smoke thick round him, a wand in
     * the hand, 3 mana, nothing else on his mind. → the bit FX.SWIPE for 0.5 s (every computer throws its own smoke).
     */
    _smoke(v, dt) {
        if (v.swipeT > 0) { v.swipeT -= dt; return FX.SWIPE; }
        v.smokeChk = (v.smokeChk || 0) - dt;
        if (v.smokeChk > 0) return 0;
        v.smokeChk = 0.5;
        const sm = this.game.fx?.smoke;
        if (!sm || sm.active < 20 || v.dead || v.noWand || v.lev || v.stunT > 0 || v.sleep) return 0;
        const me = this.game.character?.group.position;
        if (me && Math.hypot(v.x - me.x, v.z - me.z) > 60) return 0; // (only where somebody sees it)
        if (!npcSweeps({ smokeNear: sm.countNear(v.x, v.y + 2.5, v.z, 6) >= 12, mana: v.mana, noWand: v.noWand, castCd: v.smokeCd = (v.smokeCd || 0) - 0.5, busy: !!(v.foe || v.prep || v.castT > 0) })) return 0;
        v.mana -= SMOKE.COST; v.smokeCd = 2.5; v.swipeT = 0.5;
        this.life.alog?.decision(v, `дым идёт на него: росчерк палочкой сверху вниз наискось (${SMOKE.COST} маны, без слов)`);
        return FX.SWIPE;
    }

    // ------------------------------------------------------------ thinking
    /** (host) Before the usual thinking: true = handled here. (The fight comes here — see defence.) */
    think(v, dt) {
        const W = v.W;
        if (W) {
            v.mana = Math.min(v.maxMana, v.mana + W.regen * dt);
            v.castCd -= dt; v.domeCd -= dt; v.windCd -= dt; v.blinkCd -= dt;
        }
        if (v.practice) {
            v.practice.t -= dt;
            if (v.practice.t <= 0 || v.foe || v.fleeT > 0 || v.speed > 0.3) v.practice = null;
        }
        if (v.lostWand) return this._fetchWand(v, dt);
        // a reaction that waits for his wits (WizardMind.REACT_LAG): a beginner stands lost a few seconds, the Master at once
        if (v.later) { v.later.t -= dt; if (v.later.t <= 0) { const f = v.later.fn; v.later = null; f(); } else if (!v.foe && !(v.fleeT > 0)) { this._lost(v, dt); return true; } }
        // a great fire near: to a safe place, spread out, shield up — then back at the one who did it
        if (W && v.shelter && this.shelterStep(v, dt)) return true;
        // a search for the one who did it (the last known place, then the likely ways)
        if (W && v.hunt && !v.foe && this.hunting(v, dt)) return true;
        // (no fight yet, but a player's spell flies at him: a shield — or a spell back, and the beams meet in a duel)
        if (W && !v.foe && !v.noWand && WizardFight.fights(v)) this.fight._react(v, dt);
        if (W && !v.foe && this.fight._prepTick(v, dt)) { this.life._ground(v); return true; } // (saying a spell at a creature / back at a charge)
        if (W && !v.foe && this.fight.holdStill(v, dt)) return true; // (he just cast at a creature: stands in his pose)
        if (W && v.threatAt && this.fight.pursueThreat(v, dt)) return true; // (turning to a creature that hurt him, to answer it)
        if (v.foe && W) return this.fight.step(v, dt);
        return false;
    }

    /**
     * (host) «Экспеллиармус» knocked the wand out: once it lies still, the wizard runs to it and
     * takes it back. Somebody was quicker (a player took it): it is theirs, the wizard stays
     * without a wand. Can't get there for long (a wall, water): he calls it back — «Акцио!».
     */
    _fetchWand(v, dt) {
        const L = this.life, g = this.game, lw = v.lostWand;
        const it = g.items?.loose.get(lw.uid);
        if (!it) { v.lostWand = null; L._say(v, 'Мою палочку забрали!', 3); return false; }
        lw.t += dt;
        const p = it.model.position;
        const back = () => {
            g.items.pickUp(lw.uid, '#' + v.id, 'right'); // (gone from the world for everybody)
            v.noWand = false; v.lostWand = null;
            v.model?.setHeldTool(v.wandItem?.staff ? 'staff' : 'wand'); // (a wanderer's staff back in his hand)
        };
        if (lw.t > EXPELLIARMUS.FETCH_GIVE_UP) { L._say(v, 'Акцио!', 3); back(); return true; }
        if (!it.rest) { v.mode = 'idle'; v.speed = 0; v.yaw = turn(v.yaw, Math.atan2(-(p.x - v.x), -(p.z - v.z)), dt * 6); return true; }
        const d = L._steer(v, p.x, p.z, WALK * 1.8, dt, 0.8);
        v.mode = v.speed > 0 ? 'walk' : 'idle';
        L._ground(v);
        if (d <= 1.0 && Math.abs(p.y - v.y) < 2.5) back();
        return true;
    }

    /** (host) A wizard at its place: the Master's chair, the lectern, a cauldron, a desk, the watch, the telescope. */
    job(v, dt) {
        const L = this.life, p = v.post;
        if (!p) { v.job = 'wander'; return; }
        const d = Math.hypot(p.x - v.x, p.z - v.z), dy = Math.abs(p.y - v.y);
        if (d > 1.5 || dy > 2) {
            v.seated = false;
            if (!v.path) L._goTo(v, v.cs.graph.nearest(p.x, p.y, p.z));
            if (L._followPath(v, dt, WALK)) { v.path = null; L._steer(v, p.x, p.z, WALK, dt); }
            v.mode = 'walk';
            L._ground(v);
            return;
        }
        v.x += (p.x - v.x) * Math.min(1, dt * 4); v.z += (p.z - v.z) * Math.min(1, dt * 4);
        v.yaw = turn(v.yaw, p.yaw ?? v.yaw, dt * 4);
        v.speed = 0; v.path = null;
        if (v.job === 'sit') { v.y = p.y; v.seated = true; v.mode = v.talking > 0 ? 'talk' : 'sit'; return; }
        v.seated = false;
        v.mode = v.talking > 0 ? 'talk' : v.practice ? 'practice'
            : v.job === 'teach' ? 'talk' : v.job === 'brew' ? 'work' : v.job === 'desk' ? 'practice' : v.job === 'star' ? 'idle' : 'idle';
        L._ground(v);
    }

    // ----------------------------------------------------------- the frame
    update(dt) {
        const L = this.life, g = this.game;
        const wizards = [];
        for (const v of L.byId.values()) if (v.wizard) wizards.push(v);
        if (this.auth) {
            // day ↔ night: the people change places
            this._dayT -= dt;
            if (this._dayT <= 0) {
                this._dayT = 5;
                for (const cs of L.castles.values()) if (cs.awake && isWizHome(cs.def) && cs.wizNight !== g.isNight && !(cs.wizAlarmUntil > Date.now())) { cs.wizNight = g.isNight; this._staff(cs); }
            }
            this._practice(dt, wizards);
            this.fight.update(dt); // (the circles after a foe: plans and roles)
            const night = g.isNight;
            for (const v of wizards) {
                let f = 0;
                if (night && !v.dead && (v.job === 'watch' || v.job === 'wander' || v.speed > 0.3 || v.role === 'wanderer')) f |= FX.LUMOS;
                if (v.practice && v.arena) v.practice = null; // (the arena leads him: think() — and the practice timer — is not reached, a stale Levitation glow would stay on a duellist all the fight)
                if (v.practice) f |= v.practice.bits;
                if (v.job === 'brew' && v.mode === 'work') f |= FX.BREW;
                if (v.job === 'teach' && v.sparkT > 0) { v.sparkT -= dt; f |= FX.SPARK; }
                if (v.prep) f |= FX.CAST; // (saying a spell: the wand glows — seen by all, before the charge flies)
                if (v.noWand) f = FX.NOWAND; // (no wand in the hand: no Lumos, no magic of the hand — seen by all)
                f |= this._smoke(v, dt);
                v.fx = (v.fx & (FX.SHIELD | FX.DOME | FX.BLINK)) | f;
            }
        }
        // every computer: aim, the hats under low ceilings, the visible magic
        const t = g.world?.terrain?.data;
        this._hatT = (this._hatT || 0) - dt;
        const hats = this._hatT <= 0;
        if (hats) this._hatT = 0.25;
        for (const v of wizards) {
            v.model.setAim(v.aimPitch || 0);
            // the wand in the hand, or knocked out by «Экспеллиармус» (FX.NOWAND)
            if (!v.dead && v.model.look?.tool === 'wand' && v.model.limbs?.rightArm == null) { const want = (v.fx & FX.NOWAND) ? 'none' : 'wand'; if (v.model.toolKind !== want) v.model.setHeldTool(want); }
            if (hats && t && v.group.visible && !v.dead) {
                // (the hat's tip reaches into the 6th layer over the feet: a 5-high doorway folds it)
                const L0 = Math.round(v.y + 1.5);
                v.model.setHatTilt(t.solidIn(Math.round(v.x), Math.round(v.z), L0 + 5, L0 + 5) ? 1 : 0);
            }
        }
        this.fx.update(dt, wizards, (v) => this._dummy(v));
    }

    _dummy(v) {
        const ds = v.cs?.def?.dummies;
        if (!ds?.length) return null;
        let best = null, bd = Infinity;
        for (const d of ds) { const k = Math.hypot(d.x - v.x, d.z - v.z) + Math.abs(d.y - v.y) * 3; if (k < bd) { bd = k; best = d; } }
        return bd < 20 ? best : null;
    }

    /** (host) Now and then a wizard near a player practises a spell for real. */
    _practice(dt, wizards) {
        this._practiceT -= dt;
        if (this._practiceT > 0) return;
        this._practiceT = 0.8;
        const L = this.life;
        const players = L._players();
        const busy = new Map();
        for (const v of wizards) if (v.practice) busy.set(v.cs, (busy.get(v.cs) || 0) + 1);
        for (const v of wizards) {
            if (v.practice || v.arena || v.dead || v.noWand || v.foe || v.fleeT > 0 || v.talking > 0 || v.speed > 0.3 || v.seated) continue;
            if (v.cs.hostile?.size) continue;
            if (!players.some((pl) => Math.hypot(pl.p.x - v.x, pl.p.z - v.z) < PRACTICE_NEAR)) continue;
            if ((busy.get(v.cs) || 0) >= PRACTICE_MAX) continue;
            // the teacher at the lectern: a burst of sparks at a dummy
            if (v.job === 'teach') { if (Math.random() < 0.15) v.sparkT = 0.35; continue; }
            if (Math.random() > (v.job === 'desk' ? 0.18 : 0.08)) continue;
            const r = Math.random();
            let bits;
            if (r < 0.45) bits = v.role === 'student' && Math.random() < 0.35 ? FX.LEVFAIL : FX.LEV;
            else if (r < 0.7) bits = FX.DRAW;
            else bits = FX.LEV;
            v.practice = { bits, t: bits === FX.LEVFAIL ? 2.6 : 3 + Math.random() * 4 };
            busy.set(v.cs, (busy.get(v.cs) || 0) + 1);
            if (bits === FX.LEVFAIL) {
                // the teacher nearby corrects — or the student sighs
                const teacher = [...v.cs.active.values()].find((o) => !o.dead && (o.role === 'teacher' || o.role === 'master') && Math.hypot(o.x - v.x, o.z - v.z) < 12 && Math.abs(o.y - v.y) < 3);
                setTimeout(() => { if (!v.dead && v.cs.active.get(v.idx) === v) L._say(teacher && !teacher.dead ? teacher : v, pick(teacher ? WIZ_SHOUT.levFail : WIZ_SHOUT.oops)); }, 1500);
            }
        }
    }
}

export { wizardRoster };
