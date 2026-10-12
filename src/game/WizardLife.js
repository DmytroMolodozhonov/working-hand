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
 * two teachers keep watch at the door with «Lumos» on their wands, the Master
 * looks at the stars, the shop is closed.
 *
 * The host decides (like all the castle people); what is seen goes to everyone
 * as `v.fx` bits and is drawn by src/fx/WizardFx.js on every computer.
 */

import { WIZ, WIZ_ROLE_RU, wizardRoster } from './WizardAI.js';
import { EXPELLIARMUS } from './Expelliarmus.js';
import { WizardFx, FX } from '../fx/WizardFx.js';
import { WizardFight } from './WizardFight.js';

export { FX };
export const isWizSite = (def) => !!def && (def.kind === 'tower' || def.kind === 'wander');

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
    },
    fight: ['Как ты смеешь — в академии!', 'Палочки к бою!', 'Ты пожалеешь об этом!', 'Защищайтесь, ученики!'],
    levFail: ['Не Левиоса́, а Леви́оса!', 'Взмах и рывок! Ещё раз.', 'Не так резко, плавнее!'],
    oops: ['Ой!', 'Опять упала…', 'Ну вот…'],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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
        const W = WIZ[v.role];
        v.wizard = true;
        v.W = W;
        v.mana = W.mana; v.maxMana = W.mana;
        v.castCd = 1 + Math.random(); v.domeCd = 0; v.windCd = 0; v.blinkCd = 0;
        v.fx = 0; v.aimPitch = 0;
        v.title = WIZ_ROLE_RU[v.role][v.entry.female ? 1 : 0];
    }

    // ---------------------------------------------------------- who is where
    /** (host) The tower's people at their places for the day / the night. */
    wake(cs) {
        if (cs.def.kind !== 'tower') return;
        cs.wizNight = this.game.isNight;
        this._staff(cs);
    }

    _spots(def, kind) { return (def.spots || []).filter((s) => s.kind === kind); }

    _staff(cs) {
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
        // the Master: in the study by day, at the telescope by night
        if (!st.kingDead) {
            const tel = this._spots(def, 'telescope')[0];
            put(0, night && tel ? tel : def.throne, night && tel ? 'star' : 'sit');
        }
        // the scroll sellers: behind the counter by day; gone home at night
        def.stalls.forEach((s, i) => {
            const idx = 1 + i;
            if (!night) put(idx, { ...s.back, yaw: s.yaw }, 'stall');
            else { const v = cs.active.get(idx); if (v && !v.foe && !v.dead) L._deactivate(v); }
        });
        // teachers: at the lectern and a cauldron by day; two on watch at the door at night
        const T0 = 1 + def.stalls.length;
        const lect = this._spots(def, 'lectern')[0], caul = this._spots(def, 'cauldron');
        for (let k = 0; k < Math.min(2, def.teachers || 0); k++) {
            const idx = T0 + k;
            if (night) put(idx, def.posts[k], 'watch');
            else put(idx, k === 0 ? lect : caul[0], k === 0 ? 'teach' : 'brew');
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
        if (def.kind !== 'tower') return;
        cs.spawnT -= dt;
        if (cs.spawnT > 0) return;
        cs.spawnT = 0.9;
        const players = L._players().filter((pl) => L._inLand(def, pl.p, 40));
        if (!players.length) return;
        const q = [0.45, 0.65, 0.85, 1][this.game.quality?.level ?? 3] ?? 1;
        const want = Math.round(Math.min(6, 2 + def.population / 12) * (this.game.isNight ? 0.3 : 1) * q);
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
        if (v.foe && W) return this.fight.step(v, dt);
        return false;
    }

    /**
     * (host) «Expelliarmus» knocked the wand out: once it lies still, the wizard runs to it and
     * takes it back. Somebody was quicker (a player took it): it is theirs, the wizard stays
     * without a wand. Can't get there for long (a wall, water): he calls it back — «Accio!».
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
            v.model?.setHeldTool('wand');
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
                for (const cs of L.castles.values()) if (cs.awake && cs.def.kind === 'tower' && cs.wizNight !== g.isNight) { cs.wizNight = g.isNight; this._staff(cs); }
            }
            this._practice(dt, wizards);
            this.fight.update(dt); // (the circles after a foe: plans and roles)
            const night = g.isNight;
            for (const v of wizards) {
                let f = 0;
                if (night && !v.dead && (v.job === 'watch' || v.job === 'wander' || v.speed > 0.3 || v.role === 'wanderer')) f |= FX.LUMOS;
                if (v.practice) f |= v.practice.bits;
                if (v.job === 'brew' && v.mode === 'work') f |= FX.BREW;
                if (v.job === 'teach' && v.sparkT > 0) { v.sparkT -= dt; f |= FX.SPARK; }
                if (v.noWand) f = FX.NOWAND; // (no wand in the hand: no Lumos, no magic of the hand — seen by all)
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
            // the wand in the hand, or knocked out by «Expelliarmus» (FX.NOWAND)
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
            if (v.practice || v.dead || v.noWand || v.foe || v.fleeT > 0 || v.talking > 0 || v.speed > 0.3 || v.seated) continue;
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
