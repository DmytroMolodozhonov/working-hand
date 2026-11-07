/**
 * RainDouse.js — the rain puts fires out.
 *
 * The author 07.11: «дождь может тушить пожары, тушить даже огненные заклинания. Вообще всё тушит… Даже змея огненного может потушить. Адского.
 * Дождь в аду вызвать можно, но вызовет не дождь, а кровавый дождь. Он ничего не тушит.»
 *
 * What it does: while a real rain falls (`Storm.raining`, its strength `Storm.k` ≥ `RAIN.MIN_K`), every `RAIN.EVERY` s everything that burns UNDER THE OPEN SKY within `RAIN.R` m of a
 * player goes out — burning trees, grass, leaves, wood, houses (every computer: Fire.js is the same everywhere), campfires, burning living trees, ships' and carts' fires,
 * burning bodies (me, and — the host — the others), «Инферно» streams, «Fire Maxima» in flight / in bloom, the Hellfire (it shrinks while the rain falls on it) and the fire serpent
 * («Firefighting Maxima» puts it out in ~1.5 s: the rain does it slower — `RAIN.SERPENT`). Under a roof, in a cave, indoors and under water the rain does not reach:
 * nothing there is put out (`skyVisible`, the same test as the other sky spells). A little steam rises where a fire died.
 *
 * HELL: its rain is blood and puts out nothing (the decision is per place: `inHell(x, z)` — a fire in hell never goes out, a fire on the Earth does, whatever the caster did).
 *
 * ON WHOM AND ON WHAT: RAIN_TARGETS. «А если»: no rain / the storm only gathers (k small) → nothing; the rain stops → nothing more; the host far from the burning (it asks every player's
 * place, not only its own: `players()`); many burning blocks (a house) → one pass over the list, cheap `skyVisible` per COLUMN cached for the pass; I stand in hell while a fire burns on the Earth
 * → it still goes out there; space / other planets: their own clouds (terraformed green planets) — the same rules, no clouds there → no `Storm.raining`.
 */
import * as THREE from 'three';
import { inHell } from '../world/HellMap.js';
import { skyVisible } from './SkyRules.js';

export const RAIN = {
    MIN_K: 0.5, // the storm's strength from which the rain is wet enough to put fires out (it takes ~2.5 s of the 5 s it needs to build)
    EVERY: 0.5, // s between two passes
    R: 110, // m round each player: what the rain puts out (far from anyone nothing is simulated anyway)
    SERPENT: 0.6, // the share of the «Firefighting Maxima» hose the rain gives the serpent and the Hellfire (per second)
    STEAM: 6, // puffs of steam per pass at most
};

/** ON WHOM / ON WHAT (CLAUDE.md «кто/что × как действует»). Checked by tests/unit/rain-douse.test.js. */
export const RAIN_TARGETS = {
    blocks: { does: 'douse', why: 'горящие трава, листья, дерево, дома и стены замков гаснут под открытым небом' },
    trees: { does: 'douse', why: 'горящие деревья гаснут (что сгорело — сгорело)' },
    campfires: { does: 'douse', why: 'костёр под открытым небом гаснет; под крышей — нет' },
    livingTrees: { does: 'douse', why: 'горящее живое дерево перестаёт гореть' },
    burning: { does: 'douse', why: 'горящие игрок, зомби, жители, звери, моряки гаснут под открытым небом' },
    ships: { does: 'douse', why: 'пожар на палубе и парусах гаснет' }, carts: { does: 'douse', why: 'горящая повозка гаснет' },
    inferno: { does: 'douse', why: 'поток «Инферно» под дождём гаснет' },
    fireMaxima: { does: 'douse', why: 'огненная спираль «Fire Maxima» и её цветок под дождём гаснут' },
    hellfire: { does: 'douse', why: 'адский огонь «Let the Hellfire Come» под дождём уменьшается и гаснет' },
    fireSerpent: { does: 'douse', why: 'огненный змей под дождём слабеет и гаснет (медленнее, чем от «Firefighting Maxima»)' },
    dragons: { does: 'none', why: 'пламя дракона дождь не гасит (оно в пасти; дракон — не горящая вещь)' },
    torches: { does: 'none', why: 'факелы и фонари — убранство: стоят под навесами и не гаснут' },
    hell: { does: 'none', why: 'в аду дождь кровавый и ничего не тушит; решает место, где горит огонь' },
    roof: { does: 'none', why: 'под крышей, в пещере, в помещении и под водой дождь не достаёт — огонь там горит' },
    lava: { does: 'none', why: 'лава — не огонь, который можно залить' },
};

const _c = new THREE.Vector3();
const _s = new THREE.Vector3();

export class RainDouse {
    constructor(game) {
        this.game = game;
        this.t = 0;
        this._sky = new Map(); // "x,z" → open? (one pass)
        this._centers = [];
        this.log = []; // (tests / debugging)
        this._hit = (c, r) => this.reaches(c.x, c.y, c.z);
        this._reached = (x, y, z) => (y == null ? this.reaches(x, null, z) : this.reaches(x, y, z)); // (a tree: only along the ground — its own crown is no roof)
        this._steamLeft = 0;
    }

    /** Players' places (the host sees every player's fire; a guest only its own surroundings). */
    players() {
        const g = this.game, out = this._centers;
        out.length = 0;
        const me = g.character?.group?.position;
        if (me) out.push(me);
        if (g.authority) for (const r of g.remotes?.values?.() || []) if (r.position) out.push(r.position);
        return out;
    }

    /** Does the rain reach (x, y, z): near a player, not in hell, under the open sky. */
    reaches(x, y, z) {
        if (inHell(x, z)) return false;
        let near = false;
        for (const p of this._centers) if (Math.abs(p.x - x) < RAIN.R && Math.abs(p.z - z) < RAIN.R && Math.hypot(p.x - x, p.z - z) < RAIN.R) { near = true; break; }
        if (!near) return false;
        if (y == null) return true; // (near a player, not in hell: a tree stands in the open by its nature)
        const key = Math.round(x) + ',' + Math.round(z) + ',' + Math.round(y / 3);
        let open = this._sky.get(key);
        if (open === undefined) {
            open = !skyVisible(this.game, x, y - 1, z);
            if (this._sky.size > 4000) this._sky.clear();
            this._sky.set(key, open);
        }
        return open;
    }

    update(dt) {
        const g = this.game, st = g.storm;
        if (!st?.raining || st.k < RAIN.MIN_K) return;
        this.t += dt;
        if (this.t < RAIN.EVERY) return;
        const step = this.t; this.t = 0;
        if (g.space?.offEarth && !g.space?.hasClouds?.()) return;
        this._sky.clear();
        this._steamLeft = RAIN.STEAM;
        this.players();
        const n = this.pass(step);
        if (n > 0) { this.log.push({ t: Math.round(performance.now()) / 1000, out: n }); if (this.log.length > 40) this.log.shift(); }
    }

    /** One pass over everything that burns. @returns how many fires went out */
    pass(dt) {
        const g = this.game, auth = !!g.authority;
        let n = 0;
        // blocks and trees (every computer): where the rain falls
        n += g.fire?.douseWhere?.(this._reached, (x, y, z) => this._steam(x, y, z)) || 0;
        // creatures that burn (me; the host — the others)
        n += g.burning?.douseWhere?.(this._hit) || 0;
        if (auth) {
            for (const cf of [...(g.campfires?.list?.values() || [])]) {
                if (!this.reaches(cf.x, cf.y + 0.4, cf.z)) continue;
                g.campfires._out?.(cf); this._steam(cf.x, cf.y + 0.6, cf.z); n++;
            }
            for (const t of g.livingTrees?.list || []) {
                if (!(t.burnT > 0) || t.phase === 'burn' || t.isDead) continue;
                const p = t.model?.position;
                if (!p || !this.reaches(p.x, p.y + 2, p.z)) continue;
                t.burnT = 0; this._steam(p.x, p.y + 3, p.z); n++;
            }
            for (const c of this.players()) {
                n += g.ships?.douse?.(c, RAIN.R) || 0; // (a deck's fire is in the open: the ship's own roofs are not trees' roofs)
                n += g.carriages?.douse?.(c, RAIN.R) || 0;
            }
        }
        // «Инферно» streams (anyone's): a flame in the rain goes out
        for (const s of g.spells?.spells || []) {
            if (s.kind !== 'Inferno' || !s.flame || !(s.life > 0) || !(s.flame.len > 0)) continue;
            const f = s.flame;
            let wet = false;
            for (let j = 0.5; j <= f.len && !wet; j += 3) wet = this.reaches(f.o.x + f.d.x * j, f.o.y + f.d.y * j, f.o.z + f.d.z * j);
            if (!wet) continue;
            s.life = 0; n++;
            this._steam(f.o.x + f.d.x * 3, f.o.y + f.d.y * 3, f.o.z + f.d.z * 3);
            if (s.by === g.localId || s.by === 'local') g.hud?.setVoice?.('🌧️ Дождь залил ваше пламя «Инферно»', true);
        }
        // «Fire Maxima» (every computer keeps its own): in flight / in bloom
        const fx = g.vortex?.effects;
        if (fx) for (let i = fx.length - 1; i >= 0; i--) {
            const e = fx[i];
            if (e.kind !== 'fire') continue;
            const head = e.bloomed ? e.p : _c.copy(e.o).lerp(e.p, Math.min(1, e.t / (e.travel || 1)));
            if (!this.reaches(head.x, head.y, head.z)) continue;
            this._steam(head.x, head.y, head.z); fx.splice(i, 1); n++;
        }
        // the Hellfire and the fire serpent: the rain smothers them slowly (the same call as «Firefighting Maxima», a share of its strength)
        const k = dt * RAIN.SERPENT;
        if (g.hellfire?.douse?.(this._hit, k)) n++;
        if (g.fireSerpent?.douse?.(this._hit, k)) n++;
        return n;
    }

    _steam(x, y, z) {
        if (this._steamLeft <= 0) return;
        this._steamLeft--;
        this.game.firefighting?._steam?.(_s.set(x, y, z), 1);
    }
}
