// Падение выбитой палочки на арене дуэлей: node tools/wandbench.mjs [--check]
import * as THREE from 'three';
import { TerrainData } from '../src/world/Terrain.js';
import { CollisionWorld as Collision } from '../src/world/Collision.js';
import { ItemSystem as Items } from '../src/game/Items.js';
import { pickFlight } from '../src/game/Expelliarmus.js';
import { onArenaFloor } from '../src/world/DuelArenas.js';

export function arenaWorld() {
    const t = new TerrainData();
    t.generate({ seed: 7, mountains: true, seas: true, lush: true, deepCaves: true });
    const towers = t.towers.near(0, 0, 2000).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    for (const tw of towers) { const a = t.sites.arenas.ofTower(tw); if (a) return { t, a }; }
    throw new Error('no arena');
}
export function makeItems(t) {
    const col = new Collision(); col.setTerrain(t);
    const it = Object.create(Items.prototype);
    Object.defineProperty(it, 'auth', { value: true });
    it.game = { collision: col, world: { terrain: { data: t } } };
    return { it, col };
}
/** Одна палочка: выбита в точке `at` (м), летит по pickFlight; → {y, floor, fell} */
export function dropWand(it, col, at, rng) {
    const f = pickFlight(it.game, at, rng);
    const L = { model: new THREE.Group(), vel: f.vel.clone(), spin: f.spin.clone(), t: 0, item: { kind: 'wand' } };
    L.model.position.copy(at);
    const DT = +process.env.DT || 1 / 60;
    for (let i = 0; i < 8 / DT && !L.rest; i++) it._physics(L, DT);
    for (let i = 0; i < 6 / DT; i++) it._physics(L, DT); // (it lies: the host looks at it twice a second)
    const p = L.model.position, fl = col.groundAt(p.x, p.z, p.y + 0.6);
    return { p, floor: fl, rest: !!L.rest, lowest: 0, ok: L.rest && Math.abs(p.y - fl - 0.12) < 0.3 };
}
if (process.argv[1].endsWith('wandbench.mjs')) {
    const { t, a } = arenaWorld(), { it, col } = makeItems(t);
    let seed = 5; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cx = a.centre.x, cz = a.centre.z, fy = col.groundAt(cx, cz, 5);
    let bad = 0, n = 0;
    for (let k = 0; k < (+process.env.N || 400); k++) {
        const ang = rng() * 6.283, r = rng() * (process.argv.includes('--stands') ? 24 : 12);
        const px = cx + Math.cos(ang) * r, pz = cz + Math.sin(ang) * r * 0.9;
        const at = new THREE.Vector3(px, col.groundAt(px, pz, fy + 20) + 2.6, pz);
        const o = dropWand(it, col, at, rng); n++;
        if (!o.ok) { bad++; if (bad < 8) console.log('BAD', at.toArray().map(v => v.toFixed(1)), '→', o.p.toArray().map(v => v.toFixed(1)), 'floor', o.floor.toFixed(1)); }
    }
    console.log(`arena floor y=${fy.toFixed(1)}, wands ${n}, bad ${bad}`);
    if (process.argv.includes('--check') && bad) process.exit(1);
}
