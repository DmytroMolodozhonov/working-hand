/**
 * DarkRaiders.js — the dark mage raiders (the author 21.11): «чёрные маги: от 40 до 80 чёрной магии, от 50 до 100 ячеек маны — не суперсильные; своё облачение, особый скин;
 * сами нападают на игрока, преимущественно недалеко от поселения волшебников; встречаются как дома одиночных волшебников. Не в первые два дня игры; не в пещерах;
 * маг-налётчик может зайти в пещеру, только если бежит за тобой».
 *
 * WHO: one dark mage (sometimes two) on foot — a castle person of a road site of the wandering wizards (kind 'wander': the ordinary wizard's mind, magic and fight,
 * WizardLife / WizardFight, the same rules as for the player — ArmorTypes, mana, spells of his rank), role «wanderer» with his own entry: black magic 40…80 (the level
 * of the marks on his body: DarkSkin.js, DarkMagic.darkOfEntry), 50…100 cells of mana (a beginner below 75, above — an adept), a black robe of his own (VillagerOutfits
 * «blackmage»: torn cape, spiked pauldrons, red runes). He is no crime to kill (CastleLife._offence).
 *
 * WHERE / WHEN: out of the hero's sight, 95…140 m from him, mostly (85 %) where a wizards' settlement or the tower is within RAID.SETTLE_R of the place; never in the world's
 * first two days (the play time is kept in the save — BanditGangs.playMs); never for a hero underground. He walks straight at the hero (the road walkers' own way
 * round hills and water: Travelers._footHeading / _hillWay); within NOTICE m he makes the hero his foe — from then the wizard's own fight leads (he comes, he casts). The hero
 * far off or dead: he walks away and is gone. If the hero went into a cave the raider follows only while he has him as his foe (the standard wizard's chase).
 *
 * WHO / WHAT × HOW: a wizard like any other — every spell, blow, blast, push, Leviosa, fear works on him as on any wizard of the world; the host leads, the guests see a castle
 * wizard (their ids); a hero that cannot be hurt (Creative, the lesson, the school, the duel mode) meets none; none off the Earth.
 */

import { BANDIT, DAY_MS, RAID_FREE_DAYS, inCaveAt } from './BanditGangs.js';
import { outOfSight } from './Animals.js';
import { earthly } from '../world/Planets.js';
import { CappedLog } from '../core/CappedLog.js';
import { allLog } from '../core/AllLog.js';
import * as THREE from 'three';

export const RAID = {
    EVERY: 25, CHANCE: 0.12, CHANCE_NIGHT: 0.09, // a try's chance (as often as the houses of lone wizards are met)
    MAX: 1, MAX_ALL: 2,
    NEAR: [95, 140],
    SETTLE_R: 520, // m: a wizards' place near the spot — the raiders are mostly from there
    ELSEWHERE: 0.15, // the share that comes from no settlement at all
    DARK: [40, 80], MANA: [50, 100],
    NOTICE: 105, LOSE: 220, GONE: 330,
    PAIR: 0.25, // a second mage with the first
    WALK: 3.6, RUN: 5.4, // m/s
    HOSTILE_MS: 5 * 60 * 1000,
};

const MALE = ['Мортис', 'Некрас', 'Зарвен', 'Вальмор', 'Грозд', 'Ксадрин', 'Морвуд', 'Тарнак'];
const FEMALE = ['Вельмира', 'Некрона', 'Морвейн', 'Зарнива', 'Ксанья', 'Тальвира', 'Мортейя', 'Ночная'];
const SHOUT = {
    sight: ['Я чую твою силу. Она будет моей.', 'Тьма голодна.', 'Ты не уйдёшь.', 'Твоя мана мне пригодится.', 'Тебя прислала сама тьма.'],
    flee: ['Ты ещё пожалеешь…', 'Тьма вернётся!', 'Не сегодня…'],
};
const pick = (a, rnd = Math.random) => a[Math.floor(rnd() * a.length) % a.length];

// ---------------------------------------------------------------------------- pure rules (tested)
/** One raider's numbers: black magic and mana from the ranges, the rank by the mana (a beginner below 75, above — an adept). */
export function raiderStats(rnd = Math.random) {
    const dark = RAID.DARK[0] + Math.floor(rnd() * (RAID.DARK[1] - RAID.DARK[0] + 1));
    const mana = RAID.MANA[0] + Math.floor(rnd() * (RAID.MANA[1] - RAID.MANA[0] + 1));
    return { dark, mana, rank: mana < 75 ? 'novice' : 'adept' };
}

/** Is a wizards' place (tower, settlement of wizards, a hamlet of wizards) the kind they come from? */
export const isWizPlace = (c) => !!c && (c.kind === 'tower' || c.kind === 'wizvillage' || (c.kind === 'hamlet' && !!c.mage));

/** May a raider come at this spot: a wizards' place near it, or by the small chance of none (`rnd`). */
export const settleOk = (nearPlaces, rnd = Math.random) => nearPlaces > 0 || rnd() < RAID.ELSEWHERE;

export class DarkRaiders {
    constructor(game) {
        this.game = game;
        this.parties = new Map();
        this._t = RAID.EVERY * 0.7;
        this._n = 0;
        this._checkT = 0;
        this.log = new CappedLog();
    }

    get auth() { return this.game.authority; }
    get life() { return this.game.castleLife; }
    get bandits() { return this.game.bandits; }

    update(dt) {
        if (this._broken) return;
        try { this._update(dt); } catch (e) { // (a fault never stops the game: written once, the raiders put away)
            this._broken = true; console.error('[DarkRaiders]', e);
            allLog('Ошибки', `чёрные маги-налётчики отключены из-за ошибки: ${e?.message || e}`);
            try { this.dispose(); } catch (e2) { /* */ }
        }
    }

    _update(dt) {
        const L = this.life, B = this.bandits;
        if (!this.auth || !L?.enabled || !L.index || !B) return;
        this._t -= dt;
        if (this._t <= 0) {
            this._t = RAID.EVERY * (0.8 + Math.random() * 0.4);
            if (B.open() && B.enabled() && this.parties.size < Math.min(RAID.MAX_ALL, RAID.MAX * Math.max(1, L._players().length)) && Math.random() < (this.game.isNight ? RAID.CHANCE_NIGHT : RAID.CHANCE)) this.spawnNear();
        }
        this._checkT -= dt;
        const check = this._checkT <= 0;
        if (check) this._checkT = 0.5;
        for (const P of [...this.parties.values()]) this._party(P, dt, check);
    }

    // ---------------------------------------------------------------- the coming
    spawnNear(o = {}) {
        const g = this.game, L = this.life, idx = L?.index;
        if (!idx?.towers?.wanderDef) return false;
        const players = L._players();
        if (!players.length) return false;
        const pl = o.player || players[Math.floor(Math.random() * players.length)];
        if (!earthly(pl.p) || inCaveAt(g, pl.p)) return false; // (nobody comes to a cave)
        if (idx.landAt?.(Math.round(pl.p.x), Math.round(pl.p.z))) return false;
        const look = pl.id === g.localId ? g.animals?._look?.(_look) : null;
        for (let k = 0; k < 14; k++) {
            const a = Math.random() * Math.PI * 2, d = RAID.NEAR[0] + Math.random() * (RAID.NEAR[1] - RAID.NEAR[0]);
            const x = o.at?.x ?? pl.p.x + Math.cos(a) * d, z = o.at?.z ?? pl.p.z + Math.sin(a) * d;
            if (!o.at && look && !outOfSight(pl.p, look, x, z)) continue;
            if (!o.at && players.some((q) => Math.hypot(q.p.x - x, q.p.z - z) < RAID.NEAR[0] * 0.8)) continue;
            if (idx.landAt?.(Math.round(x), Math.round(z))) continue;
            if (g.travelers && !g.travelers._placeFree(x, z, 0, false, { into: null })) continue;
            const places = (idx.near?.(x, z, RAID.SETTLE_R) || []).filter(isWizPlace).length;
            if (!o.at && !settleOk(places)) continue;
            return this._make(x, z, pl.id, o);
        }
        return false;
    }

    _make(x, z, targetId, o = {}) {
        const g = this.game, L = this.life, idx = L.index;
        const n = o.n || (Math.random() < RAID.PAIR ? 2 : 1);
        const slot = [...Array(6).keys()].find((k) => ![...this.parties.values()].some((P) => P.slot === k)) ?? 0;
        const def = idx.towers.wanderDef(100 + slot, 78, 'ww'); // (a few road sites of wizards of their own: 'ww<100+slot>_78')
        const killed = L.state(def.id).killed;
        const nums = [];
        for (let i = 1; i < 600 && nums.length < n; i++) if (!L.castles.get(def.id)?.active?.has(i) && !killed.has(i)) nums.push(i);
        if (nums.length < n) return false;
        const serial = ++this._n;
        def.people = nums.map((idxN, i) => {
            const st = raiderStats(), female = Math.random() < 0.45;
            return {
                idx: idxN, role: 'wanderer', female, name: pick(female ? FEMALE : MALE), title: female ? 'Чёрная волшебница' : 'Чёрный маг',
                home: -1, stall: -1, seed: (Math.imul(serial + 11, 2654435761) ^ Math.imul(i + 1, 40503)) >>> 0, brave: 1, wizard: true,
                robe: Math.random() < 0.5, rank: st.rank, mana: st.mana, dark: st.dark, outfit: 'blackmage',
            };
        });
        def.population = n + 1; def.outlaw = true; def.color = 0x2a0e16;
        const cs = L._runtime(def);
        def.x = x; def.z = z;
        const P = { id: 'raid' + serial, slot, cs, members: [], target: targetId, t: 0, state: 'hunt', nav: null };
        def.people.forEach((e, k) => {
            const at = { x: x + k * 2.4, z: z + k * 1.2 };
            at.y = g.collision?.groundY ? g.collision.groundY(at.x, at.z) : 0;
            const v = L._activate(cs, e.idx, { x: at.x, y: at.y, z: at.z, yaw: 0 }, 'road');
            if (!v) return;
            v.raider = { P }; v.party = null; v.outlaw = true;
            P.members.push(v);
        });
        if (!P.members.length) return false;
        this.parties.set(P.id, P);
        this.log.push({ ev: 'spawn', id: P.id, n: P.members.length, dark: def.people.map((e) => e.dark), mana: def.people.map((e) => e.mana) });
        allLog('Жители', `чёрные маги-налётчики: ${P.members.length}, тьма ${def.people.map((e) => e.dark).join('/')}, мана ${def.people.map((e) => e.mana).join('/')}, в ${Math.round(x)}, ${Math.round(z)}`);
        return P;
    }

    // ---------------------------------------------------------------- the party
    _party(P, dt, check) {
        const L = this.life, g = this.game;
        P.members = P.members.filter((v) => !v.removable);
        const alive = P.members.filter((v) => !v.dead);
        if (!alive.length) { this._remove(P); return; }
        const lead = alive[0];
        P.cs.def.x = lead.x; P.cs.def.z = lead.z; // (the site walks with them: the leash of a wizard's fight)
        P.t += dt;
        if (!check) return;
        const players = L._players();
        const cur = players.find((q) => q.id === P.target);
        let tg = cur && Math.hypot(cur.p.x - lead.x, cur.p.z - lead.z) < RAID.LOSE ? cur : null;
        if (!tg) { let bd = RAID.LOSE; for (const q of players) { const d = Math.hypot(q.p.x - lead.x, q.p.z - lead.z); if (d < bd) { bd = d; tg = q; } } }
        P.target = tg?.id ?? null;
        P.fp = tg ? { x: tg.p.x, y: tg.p.y, z: tg.p.z } : null;
        if (!tg && P.state === 'hunt') { P.noT = (P.noT || 0) + 0.5; if (P.noT > 15) { P.state = 'leave'; this._say(P, pick(SHOUT.flee)); } } else P.noT = 0;
        if (tg && P.state === 'hunt') {
            for (const v of alive) {
                if (v.foe || Math.hypot(tg.p.x - v.x, tg.p.z - v.z) > RAID.NOTICE) continue;
                v.foe = tg.id; v.path = null;
                P.cs.hostile.set(tg.id, Date.now() + RAID.HOSTILE_MS);
                if (!P.said) { P.said = true; this._say(P, pick(SHOUT.sight), v); }
            }
        }
        // (who has lost his foe — the hero died or got away: hunting again or leaving)
        if (this._gone(P, alive)) this._remove(P);
    }

    _say(P, text, who = null) { const v = who || P.members.find((m) => !m.dead); if (v && text) this.life._say(v, text, 3); }

    /** (host, Travelers.step) A raider with no foe yet: on foot straight at the hero (the road walkers' way), or away. True: handled. */
    step(v, dt) {
        const R = v.raider, L = this.life;
        if (!R) return false;
        const P = R.P;
        if (v.foe) return false; // (the wizard's own fight leads him: WizardLife.think)
        if (v.talking > 0) { v.speed = 0; v.mode = 'talk'; L._ground(v); return true; }
        const fp = P.state === 'hunt' ? P.fp : null;
        const T = this.game.travelers;
        if (!T) { v.speed = 0; v.mode = 'idle'; return true; }
        const goal = fp ? { x: fp.x, z: fp.z, r: 0, into: null } : { x: v.x + (v.x - (P.fp?.x ?? v.x)) * 3 + 80, z: v.z + (v.z - (P.fp?.z ?? v.z)) * 3, r: 0, into: null }; // (away from the hero)
        const left = Math.hypot(goal.x - v.x, goal.z - v.z);
        R.nav = R.nav || { footSide: (v.idx & 1) ? 1 : -1, id: v.id, dest: goal };
        R.nav.dest = goal;
        v.roadT = (v.roadT || 0) - dt;
        if (v.roadT <= 0 || v.roadAim == null) { v.roadT = 0.8; v.roadAim = T._footHeading(v, R.nav); }
        const aim = v.roadAim == null ? T._hillWay(R.nav, v, left, false, dt, goal) : null;
        const tx = aim ? aim.x : v.roadAim != null ? v.x - Math.sin(v.roadAim) * 6 : goal.x, tz = aim ? aim.z : v.roadAim != null ? v.z - Math.cos(v.roadAim) * 6 : goal.z;
        const sp = fp && left > 40 ? RAID.RUN : RAID.WALK;
        L._steer(v, tx, tz, sp, dt);
        v.mode = v.speed > 4 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
        L._ground(v);
        return true;
    }

    _gone(P, alive) {
        const g = this.game, L = this.life;
        const x = alive[0].x, z = alive[0].z;
        const players = L._players();
        const dmin = Math.min(...players.map((pl) => Math.hypot(pl.p.x - x, pl.p.z - z)), Infinity);
        if (dmin > RAID.GONE * 2) return true;
        if (P.state === 'leave' || (!P.target && P.t > 40)) {
            const look = g.animals?._look?.(_look), me = g.character?.group.position;
            return dmin > RAID.GONE || (dmin > 150 && (!look || !me || outOfSight(me, look, x, z, 1.2)));
        }
        return false;
    }

    _remove(P) {
        const L = this.life;
        for (const v of P.members) if (!v.dead && !v.removable) L._deactivate(v);
        for (const v of P.members) { v.raider = null; }
        P.members = [];
        this.parties.delete(P.id);
        this.log.push({ ev: 'gone', id: P.id });
    }

    dispose() { for (const P of [...this.parties.values()]) this._remove(P); }
}

const _look = new THREE.Vector3();
void BANDIT; void DAY_MS; void RAID_FREE_DAYS;
