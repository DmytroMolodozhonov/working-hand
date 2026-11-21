/**
 * NatureAmbience.js — the small voices of a forest and of the shore (the author 21.11: «в лесу отдельные звуки интересные… какая-то птица
 * пролетела… то же самое у озера»). Every few seconds, while the hero walks in a forest or by water, ONE small thing happens somewhere near him:
 * a thrush sings in the crowns, a woodpecker drums on a far trunk, a bird bursts out of the leaves, a twig snaps, a squirrel scolds; by the water a frog
 * croaks, a fish jumps (with a ring of splash on the water), ducks quack, a kingfisher whistles, the bank laps. What happens follows the time of day
 * (birds by day, owl, crickets and frogs by night), the weather (a storm hushes the birds) and the place (a forest, a river, a lake — never the sea:
 * it has its own sounds, SeaSounds.js). The place is found a little at a time (a few samples a second), nothing is allocated per frame.
 *
 * Quiet by design: ≥ 2.2 s between sounds (the forest of 3–9 s), at most one at a time near the hero, volumes 0.35…0.9 and falling with distance.
 * `pick(habitat, night)` is pure (a test checks every sound can be chosen and the night/day split).
 */
import * as THREE from 'three';
import { FOREST_SOUNDS, SHORE_SOUNDS } from '../audio/NatureSounds.js';

const FOREST_BIOMES = new Set([1, 2, 3, 4, 5]); // forest, autumn, sakura, jungle, taiga (BIOMES order: the ones with many trees)
// [kind, weight, tree-height bird (comes from the crowns)]
const DAY_FOREST = [['thrush', 3, 1], ['finch', 3, 1], ['tit', 4, 1], ['cuckoo', 1.5, 1], ['woodpecker', 1.6, 1], ['crow', 1.2, 1], ['flush', 1.6, 0], ['gust', 1.8, 1], ['twig', 1.5, 0], ['squirrel', 1.2, 1], ['leaves', 1.4, 0]];
const NIGHT_FOREST = [['owl', 3, 1], ['cricket', 4, 0], ['leaves', 2, 0], ['twig', 2, 0], ['gust', 1.2, 1], ['flush', 0.5, 0]];
const DAY_SHORE = [['kingfisher', 2, 0], ['duck', 2.4, 0], ['heron', 1, 0], ['dragonfly', 2.4, 0], ['reeds', 2, 0], ['splash', 1.6, 0], ['plop', 2.6, 0], ['frog', 1, 0], ['lap', 2, 0]];
const NIGHT_SHORE = [['frog', 4, 0], ['peeper', 3, 0], ['cricket', 3, 0], ['plop', 2, 0], ['lap', 1.6, 0], ['reeds', 1, 0], ['owl', 1, 1]];
export const AMBIENCE = { MIN_GAP: 2.2, FOREST_GAP: [3, 9], SHORE_GAP: [3.5, 10], NIGHT_SLOW: 1.6, RANGE: [9, 32] };

/** What to play: habitat 'forest' | 'shore', night true/false, `r` a 0…1 random number → { kind, high } (high: from the crowns). Pure. */
export function pick(habitat, night, r) {
    const list = habitat === 'shore' ? (night ? NIGHT_SHORE : DAY_SHORE) : (night ? NIGHT_FOREST : DAY_FOREST);
    let total = 0; for (const e of list) total += e[1];
    let x = r * total;
    for (const e of list) { x -= e[1]; if (x <= 0) return { kind: e[0], high: !!e[2] }; }
    const e = list[list.length - 1];
    return { kind: e[0], high: !!e[2] };
}
export const ALL_PICKED = () => { const s = new Set(); for (const h of ['forest', 'shore']) for (const n of [false, true]) for (let i = 0; i < 200; i++) s.add(pick(h, n, i / 200).kind); return s; };

export class NatureAmbience {
    constructor(game) {
        this.game = game;
        this.t = 4; this._look = 0;
        this.habitat = { forest: false, water: null, lake: false };
        this._p = new THREE.Vector3();
        this.stats = { played: 0, kinds: {} };
    }

    get data() { return this.game.world?.terrain?.data; }

    update(dt, pos) {
        const g = this.game;
        if (!pos || !g.sound?.enabled || !this.data?.lush || g._inCave) return; // (in a cave: its own quiet)
        this._look -= dt;
        if (this._look <= 0) { this._look = 1.4 + Math.random() * 0.4; this._scan(pos); }
        this.t -= dt;
        if (this.t > 0) return;
        const night = !!g.isNight, h = this.habitat;
        const storm = g.storm?.raining ? g.storm.k || 1 : 0;
        const hasShore = !!h.water, wantShore = hasShore && (!h.forest || Math.random() < 0.55);
        if (!h.forest && !hasShore) { this.t = 2 + Math.random() * 2; return; }
        const gap = wantShore ? AMBIENCE.SHORE_GAP : AMBIENCE.FOREST_GAP;
        this.t = Math.max(AMBIENCE.MIN_GAP, gap[0] + Math.random() * (gap[1] - gap[0])) * (night ? AMBIENCE.NIGHT_SLOW : 1) * (1 + storm * 1.5);
        if (storm > 0.5 && !wantShore) return; // (a storm: the birds are quiet)
        if (g.dying || g.character?.dead) return;
        const e = pick(wantShore ? 'shore' : 'forest', night, Math.random());
        this._play(e, pos, wantShore);
    }

    _play(e, pos, shore) {
        const g = this.game, snd = g.sound, P = this._p;
        let x, z, y = pos.y;
        if (shore && this.habitat.water) { // (at the water, a little to either side of the nearest bit of it)
            x = this.habitat.water.x + (Math.random() - 0.5) * 10; z = this.habitat.water.z + (Math.random() - 0.5) * 10;
            y = this.habitat.water.y + 0.4;
        } else {
            const a = Math.random() * Math.PI * 2, d = AMBIENCE.RANGE[0] + Math.random() * (AMBIENCE.RANGE[1] - AMBIENCE.RANGE[0]);
            x = pos.x + Math.cos(a) * d; z = pos.z + Math.sin(a) * d;
            y = pos.y + (e.high ? 4 + Math.random() * 6 : 0.3);
        }
        P.set(x, y, z);
        const dist = Math.hypot(x - pos.x, z - pos.z);
        const vol = Math.max(0.3, Math.min(0.9, 1.1 - dist / 45)) * (e.kind === 'gust' ? 0.7 : 1);
        if (e.kind === 'owl') snd.playOwl?.(P, 'hoot');
        else snd.playNature?.(P, e.kind, vol);
        this.stats.played++; this.stats.kinds[e.kind] = (this.stats.kinds[e.kind] || 0) + 1;
        // a fish that jumps or a bird that lands leaves a ring and a spray on the water
        if ((e.kind === 'plop' || e.kind === 'splash') && shore) this._ring(x, y, z);
        // a bird bursting from the leaves: a few leaves fall
        else if (e.kind === 'flush') this._leaves(x, y + 1, z);
    }

    _ring(x, y, z) {
        const fx = this.game.fx;
        if (!fx?.debris) return;
        for (let i = 0; i < 9; i++) fx.debris.spawn(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 2.4, 3 + Math.random() * 2.5, (Math.random() - 0.5) * 2.4, i % 3 ? 0xcfe8f2 : 0xffffff, 0.08 + Math.random() * 0.08);
    }
    _leaves(x, y, z) {
        const fx = this.game.fx;
        if (!fx?.debris) return;
        for (let i = 0; i < 6; i++) fx.debris.spawn(x + (Math.random() - 0.5) * 2, y + Math.random() * 1.5, z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.6, 0.5 + Math.random(), (Math.random() - 0.5) * 1.6, [0x5f8f2a, 0x8aa83a, 0xb8872a][i % 3], 0.14 + Math.random() * 0.1);
    }

    /** Where we are: a forest (the biome under the hero), water near (a ring of samples; a lake or a river — not the sea). */
    _scan(pos) {
        const d = this.data, h = this.habitat, H = d.heightAt;
        h.forest = FOREST_BIOMES.has(d.biomeAt(Math.round(pos.x), Math.round(pos.z)));
        let best = null, bd = 1e9, lake = false;
        for (const r of [7, 14, 22, 32]) {
            for (let a = 0; a < 8; a++) {
                const ang = a * Math.PI / 4 + r * 0.37, x = Math.round(pos.x + Math.cos(ang) * r), z = Math.round(pos.z + Math.sin(ang) * r);
                const ground = H(x, z);
                if (H.sea || !(H.water > 0)) continue;
                if (r < bd) { bd = r; best = { x, z, y: ground + H.water - 0.5 }; lake = !H.river; }
            }
            if (best) break;
        }
        h.water = best; h.lake = lake;
        if (pos.y < (H(Math.round(pos.x), Math.round(pos.z)) - 3)) { h.forest = false; h.water = null; } // (under the ground: in a cave)
    }
}
export { FOREST_SOUNDS, SHORE_SOUNDS };
