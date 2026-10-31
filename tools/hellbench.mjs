// Замер АДА без игры (HellMap.js — план, HellLand.js — блоки): сколько чего на карте, цена чанка (в воркере), проходимость дорог (ступень ≤ 1 блок,
// воздух над головой ≥ 5, не лава), мосты над лавой, высота неба над дорогами, точки прибытия/метки на твёрдом.
// Usage: node tools/hellbench.mjs [--seeds 1,4242,777] [--chunks 120] [--check]
import { TerrainData, BLOCK, CHUNK, isSolid } from '../src/world/Terrain.js';
import { HELL, hellPlan } from '../src/world/HellMap.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const seeds = arg('--seeds', '1,4242,777,20261015').split(',').map(Number);
const NCH = Number(arg('--chunks', 120));
const check = process.argv.includes('--check');
const LIMIT = { chunkMean: 30, chunkMax: 90, planMs: 400 }; // (ms; only tighten)
let bad = 0;
const fail = (s) => { bad++; console.log('  ✗ ' + s); };

for (const seed of seeds) {
    const t0 = performance.now();
    const P = hellPlan(seed);
    const planMs = performance.now() - t0;
    const d = new TerrainData();
    d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, hell: true });
    console.log(`seed ${seed}: plan ${planMs.toFixed(0)} ms — лагеря ${P.taronCamps.length}, логова ${P.gargoyleLairs.length}, лавопады ${P.lavaFalls.length}, фонтаны ${P.fountains.length}, мосты ${P.bridges.length}, арки ${P.arches.length}, шпили ${P.spires.length}, плато ${P.mesas.length}, вулканы ${P.craters.length}, титаны ${P.titans.length}, колонны ${P.pillars.length}`);
    if (planMs > LIMIT.planMs) fail(`план ${planMs.toFixed(0)} мс > ${LIMIT.planMs}`);
    // the cost of a chunk (what a worker pays): round the arrival, the basin and random places
    const times = [];
    const pick = [];
    for (let i = 0; i < NCH; i++) {
        const c = i % 3 === 0 ? P.spawn : i % 3 === 1 ? P.devilSeat : { x: HELL.CX + (((i * 7919) % 4000) - 2000), z: HELL.CZ + (((i * 104729) % 4000) - 2000) };
        pick.push([Math.floor(c.x / CHUNK) + ((i * 3) % 7) - 3, Math.floor(c.z / CHUNK) + ((i * 5) % 7) - 3]);
    }
    for (const [cx, cz] of pick) { if (d.hasChunk(cx, cz)) continue; const t = performance.now(); d.chunk(cx, cz); times.push(performance.now() - t); }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length, max = times.at(-1);
    console.log(`  чанк: среднее ${mean.toFixed(1)} мс, 95% ${times[Math.floor(times.length * 0.95)].toFixed(1)} мс, макс ${max.toFixed(1)} мс (${times.length} шт., в воркере)`);
    if (mean > LIMIT.chunkMean) fail(`чанк в среднем ${mean.toFixed(1)} мс > ${LIMIT.chunkMean}`);
    if (max > LIMIT.chunkMax) fail(`чанк максимум ${max.toFixed(1)} мс > ${LIMIT.chunkMax}`);
    // the roads: walkable all the way
    let steps = 0, worst = 0, lowRoof = 0, lavaOn = 0, overLava = 0, meters = 0;
    for (const r of P.roads) {
        let prev = null;
        for (let i = 1; i < r.length; i++) {
            const a = r[i - 1], b = r[i], L = Math.hypot(b.x - a.x, b.z - a.z);
            for (let s = 0; s <= L; s += 1) {
                const x = Math.round(a.x + (b.x - a.x) * s / L), z = Math.round(a.z + (b.z - a.z) * s / L), f = d.heightAt(x, z);
                meters++;
                if (d.get(x, f, z) === BLOCK.HELL_LAVA) lavaOn++;
                let room = 0; while (room < 40 && !isSolid(d.get(x, f + 1 + room, z))) room++;
                if (room < 5) lowRoof++;
                for (let y = f - 1; y > f - 30; y--) { const t = d.get(x, y, z); if (t === BLOCK.HELL_LAVA) { overLava++; break; } if (t !== BLOCK.AIR && t !== BLOCK.HELL_BRICK) break; }
                if (prev != null) { const st = Math.abs(f - prev); if (st > 1) steps++; worst = Math.max(worst, st); }
                prev = f;
            }
        }
    }
    console.log(`  дороги: ${meters} м, ступеней > 1: ${steps} (худшая ${worst}), низко над головой: ${lowRoof}, лава на дороге: ${lavaOn}, мостом над лавой: ${overLava} м`);
    if (steps) fail(`${steps} ступеней выше блока на дорогах`);
    if (lowRoof) fail(`${lowRoof} м дороги с низким потолком`);
    if (lavaOn) fail(`${lavaOn} м дороги — лава`);
    if (!overLava) fail('ни одного моста над лавой');
    // the arrival and the mark: firm floor, room overhead
    for (const [n, p] of [['прибытие', P.spawn], ['метка', P.returnMark]]) {
        const f = d.heightAt(p.x, p.z);
        let room = 0; while (room < 10 && d.get(p.x, f + 1 + room, p.z) === BLOCK.AIR) room++;
        if (!isSolid(d.get(p.x, f, p.z)) || room < 6) fail(`${n}: пол ${d.get(p.x, f, p.z)}, воздуха ${room}`);
    }
    for (const c of P.taronCamps) if (d.heightAt(c.x, c.z) !== c.y) fail(`лагерь ${c.x},${c.z} не на своём плато`);
    for (const L of P.gargoyleLairs) { const f = d.heightAt(L.x, L.z); if (Math.abs(f - L.y) > 2) fail(`логово ${L.x},${L.z}: верх ${f} ≠ ${L.y}`); }
}
console.log(bad ? `✗ ${bad} проблем` : '✓ ад в порядке');
if (check && bad) process.exit(1);
