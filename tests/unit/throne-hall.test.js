// The throne room after a capture (the author: «рыцари идут прямо в трон… шли друг на друга»; «уйдите — кто-то ушёл, кто-то остался»;
// the vizier «должен встать рядом с дверями, чтобы всегда мочь меня услышать»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, isSolid } from '../../src/world/Terrain.js';
import { hallSpots, doorSpots, inHall, onDais, Claims } from '../../src/game/ThroneHall.js';
import { VillagerOrders } from '../../src/game/VillagerOrders.js';
import { detectOrder, validateCall, ARMY } from '../../src/ai/TalkActions.js';

const SEEDS = [4242, 12345, 777];
function castles(seed, n = 3) {
    const t = new TerrainData();
    t.generate({ seed, mountains: true });
    const out = [];
    for (let gz = -3; gz <= 3 && out.length < n; gz++) for (let gx = -3; gx <= 3 && out.length < n; gx++) { const c = t.castles.cellOf(gx, gz); if (c) out.push(c); }
    return { t, out };
}

test('throne room: free places in front of the dais, apart, on free floor, several seeds', () => {
    for (const seed of SEEDS) {
        const { t, out } = castles(seed);
        for (const def of out) {
            const spots = hallSpots(def);
            assert.ok(spots.length >= 8, `${def.id}: places ${spots.length}`);
            for (const [i, s] of spots.entries()) {
                assert.ok(inHall(def, s, 0), `${def.id} #${i} inside the hall`);
                assert.ok(!onDais(def, s, 0.5), `${def.id} #${i} not on the dais`);
                const L = Math.round(s.y + 1.5) + 1;
                for (let h = 0; h < 3; h++) assert.ok(!isSolid(t.get(Math.round(s.x), L + h, Math.round(s.z))), `${def.id} #${i} free at +${h}`);
                for (let j = 0; j < i; j++) assert.ok(Math.hypot(spots[j].x - s.x, spots[j].z - s.z) >= 2.5, `${def.id} places ${j}/${i} apart`);
            }
            const doors = doorSpots(def);
            assert.equal(doors.length, 4);
            for (const d of doors) {
                assert.ok(inHall(def, d, 0), `${def.id} door place inside`);
                assert.ok(Math.hypot(d.x - def.throneGate.x, d.z - def.throneGate.z) < 9, 'by the doors');
                assert.ok(Math.hypot(d.x - def.throneGate.x, d.z - def.throneGate.z) > 3.5 - 0.1, 'not in the doorway');
            }
        }
    }
});

test('claims: each follower his own place; a left place is free again', () => {
    const c = new Claims();
    const spots = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 6, z: 0 }];
    const a = { id: 1, x: 0, z: 0 }, b = { id: 2, x: 0.5, z: 0 }, d = { id: 3, x: 1, z: 0 };
    const sa = c.spot('k', spots, a, 0), sb = c.spot('k', spots, b, 0), sd = c.spot('k', spots, d, 0);
    assert.equal(new Set([sa, sb, sd]).size, 3);
    assert.equal(c.spot('k', spots, a, 0.5), sa);
    assert.equal(c.spot('k', spots, { id: 4, x: 0, z: 0 }, 0.5), null); // (no more places)
    assert.equal(c.spot('k', spots, { id: 4, x: 0, z: 0 }, 5) !== null, true); // (the old claims lapsed)
});

test('«уйдите» is the king\'s army-order; «не уходи» is not', () => {
    for (const s of ['Уйдите', 'уйди отсюда', 'расходитесь все', 'разойдись', 'отойдите от трона', 'все свободны']) assert.equal(detectOrder(s)?.name, 'dismiss', s);
    assert.equal(detectOrder('не уходи'), null);
    assert.equal(detectOrder('вольно')?.name, 'stay');
    assert.ok(ARMY.has('dismiss'));
    assert.equal(validateCall({ name: 'dismiss' }, { role: 'knight', playerIsKing: true }).ok, true);
    assert.equal(validateCall({ name: 'dismiss' }, { role: 'knight', playerIsKing: false }).ok, false);
});

test('«уйдите»: everybody in the hall leaves it for his own place within 10 s; the vizier stands by the doors', () => {
    for (const seed of SEEDS) {
        const { out } = castles(seed, 2);
        for (const def of out) {
            const room = def.rooms.find((r) => r.kind === 'throne');
            const spots = hallSpots(def);
            const exitsNodes = [{ x: def.throneGate.x + 12, y: 0, z: def.throneGate.z }, { x: def.throneGate.x + 12, y: 0, z: def.throneGate.z + 14 }, { x: def.throneGate.x + 18, y: 0, z: def.throneGate.z - 10 }];
            const nodes = exitsNodes.map((n, i) => ({ ...n, id: i }));
            const dsp = doorSpots(def)[0];
            nodes.push({ x: dsp.x, y: 0, z: dsp.z, id: 3 }); // (a hall node by the doors)
            const g = { nodes, tagged: (tag) => (tag === 'keepDoor' || tag === 'yard' || tag === 'barracksDoor' ? nodes.filter((n) => n.id === (tag === 'keepDoor' ? 0 : tag === 'yard' ? 1 : 2)).map((n) => n.id) : []), nearest: () => 3 };
            const people = spots.slice(0, 9).map((s, i) => ({ id: i + 1, x: s.x, y: 0, z: s.z, yaw: 0, role: i === 0 ? 'advisor' : 'knight', hp: 5, speed: 0, path: null, cs: null, dead: false }));
            const vizier = people[0];
            const cs = { def, graph: g, active: new Map(people.map((p) => [p.id, p])) };
            for (const p of people) p.cs = cs;
            const said = [];
            const life = {
                game: { localId: 'me', authority: true }, state: () => ({ owner: 'me' }),
                _playerPos: () => ({ x: def.throne.x + (def.throneFront.x - def.throne.x) * 0.2, y: 1.95, z: def.throne.z }),
                _say: (v, t) => said.push(t), _ground() {},
                _goTo(v, node) { v.goal = node; v.path = [node]; },
                _followPath(v, dt, speed) { const n = nodes[v.goal]; return this._step(v, n.x, n.z, speed, dt, 0.6) <= 0.6; },
                _steer(v, x, z, speed, dt, stop) { return this._step(v, x, z, speed, dt, stop); },
                _step(v, x, z, speed, dt, stop) { const d = Math.hypot(x - v.x, z - v.z); if (d > stop) { const s = Math.min(d - stop, speed * dt); v.x += (x - v.x) / d * s; v.z += (z - v.z) / d * s; v.speed = speed; } else v.speed = 0; return d; },
            };
            const orders = new VillagerOrders(life);
            orders.run(people[1], 'dismiss', {}, 'me');
            assert.equal(vizier.order.kind, 'door');
            const dests = people.filter((p) => p.order.kind === 'leave').map((p) => p.order.dest);
            assert.equal(dests.length, 8, 'all knights sent');
            for (let i = 0; i < dests.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.hypot(dests[i].x - dests[j].x, dests[i].z - dests[j].z) >= 2.6, 'each his own place');
            for (let t = 0; t < 10; t += 0.1) for (const p of people) orders.step(p, 0.1);
            for (const p of people) {
                if (p === vizier) { assert.ok(inHall(def, p, 0.5), 'the vizier stays in the hall'); assert.ok(Math.hypot(p.x - def.throneGate.x, p.z - def.throneGate.z) < 9, 'by the doors'); }
                else assert.ok(!inHall(def, p, 0), `${def.id}: knight ${p.id} left the hall (at ${p.x.toFixed(1)},${p.z.toFixed(1)})`);
            }
            void room;
        }
    }
});

test('«разойдитесь» и родня: каждая фраза понята, с «пожалуйста» и после «рыцари/стража»; «идите за мной» — не расход', () => {
    const words = ['разойдитесь', 'расходитесь', 'разойдись', 'разойтись', 'отойдите', 'отойди', 'уходите', 'уйдите', 'идите', 'покиньте зал', 'оставьте нас', 'свободны'];
    for (const w of words) for (const f of [w, `${w} пожалуйста`, `рыцари ${w}`, `стража, ${w}, пожалуйста`]) assert.equal(detectOrder(f)?.name, 'dismiss', f);
    for (const w of ['по местам', 'на посты', 'вольно', 'отставить']) assert.equal(detectOrder(`рыцари ${w}`)?.name, 'stay', w);
    for (const f of ['идите за мной', 'идите сюда', 'иди ко мне']) assert.notEqual(detectOrder(f)?.name, 'dismiss', f);
});
