/**
 * The land tornado and the whirlpool (the author 07.11): rarer than the waterspouts by exactly 2× and 3×; the land tornado never in water; a whirlpool draws big ships faster, small ones can
 * get out but not past the point of no return; Captain Black Moustache gets out nine times in ten, never easily.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TORNADO, WHIRL, landCount, whirlCount, landTornadoesOf, whirlDraw, shipNet, luckOf, tornadoPush, tearHits, isSoil, LAND_TARGETS, WHIRL_TARGETS } from '../../src/world/TornadoWeather.js';
import { BLOCK } from '../../src/world/Terrain.js';

// the spouts' own count rule (OceanWeather.spoutsOf): 0 under 0.35, 1 under 0.8, else 2
const spoutCount = (n) => (n < 0.35 ? 0 : n < 0.8 ? 1 : 2);
const mean = (f) => { let s = 0; const N = 100000; for (let i = 0; i < N; i++) s += f((i + 0.5) / N); return s / N; };

test('land tornadoes come half as often as spouts; whirlpools a third as often', () => {
    const sp = mean(spoutCount), ld = mean(landCount), wh = mean(whirlCount);
    assert.ok(Math.abs(sp / ld - 2) < 0.01, `spouts / land = ${sp / ld}`);
    assert.ok(Math.abs(sp / wh - 3) < 0.01, `spouts / whirlpools = ${sp / wh}`);
});

test('land tornadoes: born on land only, in a storm; the natural list is the same for the same time', () => {
    const land = () => true;
    let found = null;
    for (let t = 100000; t < 100000 + 3600 * 24 && !found; t += 120) {
        const a = landTornadoesOf(1234, t, 0, 0, land, []);
        if (a.length) found = { t, a };
    }
    if (found) {
        const b = landTornadoesOf(1234, found.t, 0, 0, land, []);
        assert.deepEqual(a2ids(found.a), a2ids(b));
        for (const tn of found.a) assert.ok(tn.land && tn.k >= 0 && tn.k <= 1);
    }
    // no land → none
    for (let t = 100000; t < 100000 + 3600 * 6; t += 120) assert.equal(landTornadoesOf(1234, t, 0, 0, () => false, []).length, 0);
});
const a2ids = (a) => a.map((x) => `${x.id}:${x.x.toFixed(2)}`).sort();

test('a bigger ship is drawn in harder; the draw grows towards the middle', () => {
    const w = { k: 1, spin: 1 };
    const small = whirlDraw(w, 44, 60, {}).in, big = whirlDraw(w, 92, 60, {}).in;
    assert.ok(big > small * 1.5, `${big} vs ${small}`);
    assert.ok(whirlDraw(w, 60, 20, {}).in > whirlDraw(w, 60, 100, {}).in * 3);
    assert.equal(whirlDraw(w, 60, WHIRL.PULL + 1, {}), null);
    assert.ok(whirlDraw(w, 60, WHIRL.R - 1, {}).eye);
});

test('a small handy ship can get out from the rim; a big one cannot get far in; nobody ordinary gets out past the point of no return', () => {
    const w = { k: 1, spin: 1 };
    const opts = { wind: 0.6, crew: 1 };
    assert.ok(shipNet(w, 44, 100, opts).net < 0, 'a pinnace claws out from the rim');
    assert.ok(shipNet(w, 92, 40, opts).net > 0, 'a big ship at 40 m is dragged');
    assert.ok(shipNet(w, 80, 70, opts).net < shipNet(w, 80, 30, opts).net, 'deeper in is worse');
    for (const L of [44, 60, 80]) assert.ok(shipNet(w, L, WHIRL.NO_RETURN - 8, opts).net > -0.5, `no ordinary hull of ${L} m climbs out of the inner water`);
    // a drifting hull (no one sailing) is dragged in from farther out
    assert.ok(shipNet(w, 44, 90, { wind: 0.6, crew: 0.1 }).net > shipNet(w, 44, 90, opts).net);
});

test('Captain Black Moustache gets out nine times in ten — and it is never easy', () => {
    const w = { k: 1, spin: 1 };
    let out = 0, N = 2000;
    for (let i = 0; i < N; i++) {
        const luck = luckOf('whirl:' + i, 'blackship');
        const r = shipNet(w, 92, WHIRL.R + 6, { wind: 0.6, crew: 1.6, black: true, blackLuck: luck });
        if (!r.lost && r.net < 0) out++;
    }
    assert.ok(Math.abs(out / N - WHIRL.BLACK_ESCAPE) < 0.03, `escaped ${out / N}`);
    const strain = shipNet(w, 92, 40, { wind: 0.6, crew: 1.6, black: true, blackLuck: 0.1 });
    assert.equal(strain.fight, 1, 'she strains with everything');
    assert.ok(strain.net < 0 && strain.net > -2, `a crawl, not a sprint: ${strain.net}`);
    assert.ok(shipNet(w, 92, 40, { black: true, blackLuck: 0.95, crew: 1.6, wind: 0.6 }).net > 0, 'the tenth time she is dragged');
    assert.equal(shipNet(w, 92, WHIRL.R - 2, { black: true, blackLuck: 0.95, crew: 1.6, wind: 0.6 }).lost, true);
});

test('a land tornado pushes round and lifts in the core, out of reach nothing', () => {
    const tn = { x: 0, z: 0, k: 1, spin: 1 };
    const f = tornadoPush(tn, 3, 0, 0, {});
    assert.ok(f && f.core && f.vy > 10);
    assert.equal(tornadoPush(tn, TORNADO.PULL + 5, 0, 0, {}), null);
    assert.equal(tornadoPush({ ...tn, k: 0 }, 3, 0, 0, {}), null);
});

test('what it tears: loose ground at once, wood in two, brick in three, castle stone in four; rock, water, ice, enchanted, pyramids never', () => {
    assert.equal(tearHits(BLOCK.DIRT), 1);
    assert.equal(tearHits(BLOCK.THATCH), 1);
    assert.equal(tearHits(BLOCK.PLANKS), 2);
    assert.equal(tearHits(BLOCK.ROOF_RED), 2);
    assert.equal(tearHits(BLOCK.BRICK), 3);
    assert.equal(tearHits(BLOCK.CS_GREY), 4);
    for (const t of [BLOCK.STONE, BLOCK.DEEPSTONE, BLOCK.BEDROCK, BLOCK.WATER, BLOCK.ICE, BLOCK.ENCHANTED, BLOCK.GHOST_STONE, BLOCK.HELL_BASALT, BLOCK.PYR_STONE, BLOCK.AIR]) assert.equal(tearHits(t), 0, String(t));
    assert.ok(isSoil(BLOCK.GRASS) && !isSoil(BLOCK.PLANKS));
});

test('the "who / what" tables decide every case with a reason', () => {
    for (const T of [LAND_TARGETS, WHIRL_TARGETS]) for (const [k, v] of Object.entries(T)) assert.ok(v.does && v.why.length > 10, k);
});

test('wiring: the spells, the hooks and the world update are in place', async () => {
    const fs = await import('node:fs');
    const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
    assert.match(src('src/game/Game.js'), /landTornado\?\.update/);
    assert.match(src('src/game/Game.js'), /whirlpool\?\.update/);
    assert.match(src('src/game/Game.js'), /name === 'Whirlpool'/);
    assert.match(src('src/fx/SpellManager.js'), /return 'Whirlpool'/);
    assert.match(src('src/game/Combat.js'), /Whirlpool: 400/);
    assert.match(src('src/game/ItemTypes.js'), /\['Whirlpool', /);
    assert.match(src('src/game/Blackbeard.js'), /nearWhirl/);
});

// ------------------------------------------------------------ Whirlpool: the host's ships step with stand-in ships
import { Whirlpool } from '../../src/game/Whirlpool.js';

function pool(ships, wind = 6) {
    const sunk = [], fled = [];
    const g = { game: null, weatherClock: 1000, wind: { speed: wind }, authority: true, fx: null, hud: { setVoice() {} }, fleet: { flee: (s, yaw, secs) => fled.push(s.name) }, ships: { awake: new Set(ships), me: null, _startSinking: (s) => { s.state = 'sinking'; sunk.push(s.name); } } };
    const W = new Whirlpool(g);
    W.list = [{ id: 'w1', x: 0, z: 0, k: 1, spin: 1, d: 0 }];
    return { W, g, sunk, fled };
}
const ship = (name, L, x, z, { sail = 1, black = false } = {}) => ({ id: name, name, state: 'free', st: { x, z, yaw: 0, u: 0, v: 0, r: 0 }, cls: { L, id: black ? 'blackship' : 'galleon', magic: black }, sails: [{ target: sail }], changed: false });
const run = (P, sec) => { for (let i = 0; i < sec * 20; i++) P.W._pushShips(0.05, 1000 + i * 0.05); };
const dist = (s) => Math.hypot(s.st.x, s.st.z);

test('a big ship in the pull is dragged towards the middle; crews put the helm over; one in the eye goes down', () => {
    const big = ship('big', 92, 60, 0);
    const P = pool([big]);
    run(P, 60);
    assert.ok(dist(big) < 40, `the big ship was dragged in: ${dist(big).toFixed(1)}`);
    assert.ok(P.fled.includes('big'), 'the helm was put over');
    const lost = ship('lost', 80, 10, 0);
    const P2 = pool([lost]);
    run(P2, 20);
    assert.ok(P2.sunk.includes('lost'), 'in the eye: the hull goes down');
});

test('a small ship under sail near the rim is not dragged in (she can get out); a drifting one is', () => {
    const sailing = ship('sailing', 44, 85, 0, { sail: 1 }), drifting = ship('drifting', 44, 85, 0, { sail: 0 });
    const P = pool([sailing]), P2 = pool([drifting]);
    run(P, 40); run(P2, 40);
    assert.ok(dist(sailing) >= 85, `sailing stays out: ${dist(sailing).toFixed(1)}`);
    assert.ok(dist(drifting) < 80, `drifting is drawn in: ${dist(drifting).toFixed(1)}`);
});

test('Captain Black Moustache: with the luck of 9 in 10 she creeps out, never fast; with the bad tenth she is dragged in and goes down', () => {
    // find a whirl/ship id pair of each luck
    let good = null, bad = null;
    for (let i = 0; i < 400 && !(good && bad); i++) { const l = luckOf('w1', 'blackship'); if (l < WHIRL.BLACK_ESCAPE) good = 'w1'; else bad = 'w1'; break; }
    const b = ship('blackship', 92, 70, 0, { black: true });
    const P = pool([b]);
    const luck = luckOf('w1', b.id);
    run(P, 40);
    if (luck < WHIRL.BLACK_ESCAPE) assert.ok(dist(b) > 70, `she crept out (luck ${luck.toFixed(2)}): ${dist(b).toFixed(1)}`);
    else assert.ok(dist(b) < 70, `dragged (luck ${luck.toFixed(2)}): ${dist(b).toFixed(1)}`);
    assert.ok(dist(b) - 70 < 35, 'never a sprint');
    // an ordinary ship of her size is dragged
    const o = ship('galleon', 92, 70, 0);
    const P2 = pool([o]);
    run(P2, 40);
    assert.ok(dist(o) < 70, 'an ordinary hull of the same size is not so lucky');
    assert.equal(good !== null || bad !== null, true);
});
