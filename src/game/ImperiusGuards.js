/**
 * ImperiusGuards.js — how a castle's guard treats a creature with a «Империус» mind in it, inside the castle's walls (the
 * throne hall too). Nobody reads minds: it is treated as the creature it is (the hero is suspected only by who saw the
 * cast — Blame.js), but a creature that walks about a castle on its own is noticed (the author):
 *   - a person (a villager, a knight, a wizard, a sailor) — first told to go («Уходи отсюда!»); still there — beaten (a few
 *     light blows); behaving madly — attacking people — killed (the knight's full blows);
 *   - a small animal (a pig, a sheep, a running book, a bird) — hardly minded: shooed out with the flat of the sword, never hurt;
 *   - a big one (a cow, a horse, the Pegasus) — led out, shoved towards the gate, never killed;
 *   - a zombie, a monster, the dragon, the spider — the castle's own fight with such (nothing new here).
 * (The host decides; one knight on duty for each such creature — CastleLife._think → guardStep.)
 *
 * And the hero (ImperiusControl): whatever becomes of the creature — killed by the guard, burnt, drowned, blown up, cut down,
 * gone far away — the mind simply comes back into the hero's own body, unhurt. The body stood where it was all the while: it is
 * not guarded (a zombie may find it; a blow on it brings the mind back), but nobody knows whose it is unless they saw the cast.
 */

import * as THREE from 'three';
import { STATS, WALK, RUN } from './CastleLife.js';
import { kindOf } from './Imperius.js';
import { BODIES } from './ImperiusBodies.js';

/** What the guard does with a creature of this kind in its castle (pure; tests/unit/imperius.test.js). */
export const GUARD_REACT = {
    villager: 'person', knight: 'person', wizard: 'person', sailor: 'person',
    pig: 'small', sheep: 'small', runbook: 'small', owl: 'small', bookbird: 'small', phoenix: 'small',
    cow: 'big', horse: 'big', pegasus: 'big',
    // (the castle's own fight with these — never a guard's «уходи»)
    zombie: null, dragon: null, spider: null, tree: null, skeleton: null, snowman: null, iceMonster: null, iceQueen: null, guardBeast: null,
    king: null, towerHead: null, blackbeard: null, pirateSkeleton: null, player: null,
};

/** The numbers. */
export const GUARD = {
    WARN_FOR: 18, // s told to go before the blows (a person)
    MAD: 2, // blows dealt by it to people: it is mad — killed
    NEAR: 2.6, // m: the guard this close acts
    EVERY: 1.4, // s between his blows / shoves
    SAY_EVERY: 4.5, // s between his words
    LOOK: 70, // m: a free knight this near takes the duty (a castle's courtyard and its walls)
    BEAT_DMG: 1, // a light blow (beaten, not killed)
};

/** The guard's step for a creature: 'warn' | 'beat' | 'kill' | 'shoo' (small) | 'lead' (big) | null (not his). */
export function guardMode(kind, warnedFor = 0, offences = 0) {
    const r = GUARD_REACT[kind];
    if (r === 'small') return 'shoo';
    if (r === 'big') return 'lead';
    if (r !== 'person') return null;
    if (offences >= GUARD.MAD) return 'kill';
    return warnedFor >= GUARD.WARN_FOR ? 'beat' : 'warn';
}

const SAY = {
    warn: ['Уходи отсюда!', 'Эй, тебе здесь не место. Уходи!', 'Пошёл вон из замка!', 'Чего бродишь? Вон отсюда!'],
    beat: ['Я предупреждал!', 'Сказано — вон!', 'Получай, раз не понимаешь!'],
    kill: ['Он взбесился! Убить его!', 'Стража! Он нападает на людей!'],
    shoo: ['Кыш отсюда!', 'А ну пошла вон!', 'Кто пустил сюда скотину?'],
    lead: ['Пошла, пошла отсюда!', 'Уведите отсюда эту животину!', 'Кто оставил ворота открытыми?'],
    done: ['И чтоб я тебя здесь больше не видел!', 'Так-то лучше.'],
};
const _p = new THREE.Vector3();
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class ImperiusGuards {
    constructor(game) {
        this.game = game;
        this._t = 0;
    }

    /** (host) Every few frames: a free knight takes the duty for each taken creature inside a castle's walls. */
    update(dt) {
        const g = this.game, L = g.castleLife;
        if (!g.authority || !L?.castles || !g.imperius?.hosted?.size) return;
        this._t -= dt;
        if (this._t > 0) return;
        this._t = 0.4;
        for (const H of g.imperius.hosted.values()) {
            const B = BODIES[H.sys], c = B?.find(g, H.id);
            if (!c || B.dead(c) || H.sys === 'pl') continue;
            const kind = kindOf(H.sys, c);
            if (GUARD_REACT[kind] == null) continue;
            const p = B.pos(c, _p);
            const cs = this._castleAt(p);
            if (!cs) { c._impInside = 0; continue; }
            c._impInside = (c._impInside || 0) + 0.4;
            if ([...cs.active.values()].some((v) => v.impDuty?.id === H.id && v.impDuty.sys === H.sys && !v.dead)) continue;
            let best = null, bd = GUARD.LOOK;
            for (const v of cs.active.values()) {
                if (v.dead || v.role !== 'knight' || v.foe || v.impDuty || v.imp || v.seated || v.stunT > 0) continue;
                const d = Math.hypot(v.x - p.x, v.z - p.z);
                if (d < bd) { bd = d; best = v; }
            }
            if (best) best.impDuty = { sys: H.sys, id: H.id, kind, cs, sayT: 0, hitT: 0.5, warnT: 0 };
        }
    }

    /** The castle (awake) whose walls hold this point, or null. */
    _castleAt(p) {
        const L = this.game.castleLife;
        for (const cs of L.castles.values()) if (cs.awake && L._inWalls(cs.def, p)) return cs;
        return null;
    }

    /** (CastleLife._think, host) a knight on duty: to the creature, his words, his blows. → true: his step is done. */
    guardStep(v, dt) {
        const g = this.game, L = g.castleLife, D = v.impDuty;
        const B = BODIES[D.sys], c = B?.find(g, D.id);
        const p = c ? B.pos(c, _p) : null;
        // gone, dead, out of the walls, its mind gone home (an ordinary creature again — no business of his)
        if (!c || B.dead(c) || !c.imp || !L._inWalls(D.cs.def, p) || v.foe) {
            if (c && !B.dead(c) && !v.foe) L._say(v, pick(SAY.done), 3);
            v.impDuty = null;
            return false;
        }
        D.warnT += dt; D.sayT -= dt; D.hitT -= dt;
        const mode = guardMode(D.kind, D.warnT, c._impOffence || 0);
        D.mode = mode;
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        if (d > GUARD.NEAR) {
            L._goSpot(v, p.x, p.z, mode === 'kill' || d > 12 ? RUN : WALK, dt, GUARD.NEAR - 0.3, p.y); // (by the castle's ways: round the walls, through the gates)
            L._ground(v);
            v.mode = v.speed > WALK + 0.1 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
        } else {
            v.speed = 0;
            v.yaw = Math.atan2(-(p.x - v.x), -(p.z - v.z)); // («лицом к цели»)
            if (D.sayT <= 0) { D.sayT = GUARD.SAY_EVERY; L._say(v, pick(SAY[mode]), 3); }
            if (mode !== 'warn' && D.hitT <= 0) { D.hitT = GUARD.EVERY; v.mode = 'attack'; } // (the blow lands at the sword's own moment: guardStrike)
            else if (v.mode !== 'attack') v.mode = 'idle';
        }
        return true;
    }

    /** (CastleLife, host) a knight on duty brought his sword down: the blow (a shove for animals). */
    guardStrike(v) {
        const g = this.game, D = v.impDuty;
        const B = BODIES[D?.sys], c = B?.find(g, D.id);
        if (!c || B.dead(c)) return;
        const p = B.pos(c, _p);
        const dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz) || 1;
        if (d > GUARD.NEAR + 1) return; // (stepped away in time)
        const ux = dx / d, uz = dz / d;
        if (D.mode === 'shoo' || D.mode === 'lead') {
            // the flat of the sword: shoved on towards the way out — never hurt
            const k = D.mode === 'lead' ? 6 : 4;
            if (D.sys === 'a') g.animals?.push?.(c, new THREE.Vector3(ux * k, 1.5, uz * k), 0.3);
            else if (c.vel?.set) c.vel.set(ux * k, 1.5, uz * k);
            return;
        }
        if (D.sys !== 'v' && D.sys !== 's') return;
        const dmg = D.mode === 'kill' ? (STATS.knight?.dmg ?? 3) : GUARD.BEAT_DMG;
        const dir = new THREE.Vector3(ux, 0, uz);
        if (D.sys === 'v') g.castleLife.hit(c, dmg, dir, null, { guard: true });
        else g.ships?.crew?.hit?.(c, dmg, dir, null, {});
    }
}
