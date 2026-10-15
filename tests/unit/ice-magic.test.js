// «Create an Ice Castle» and «Ice Bridge» (src/game/IceMagic.js) in a small world without a screen:
// the words, the cost, the water or snow it needs, the stamp, the castle rising after the hands, the bridge
// after the hand, a stop keeps what grew, the record saved and put back.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IceMagic, ICE_SPELL, iceMagicWords } from '../../src/game/IceMagic.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { iceCastleMagicPlan, iceBridgePlan, waterOrSnowNear } from '../../src/world/IceMagicPlan.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { BLOCK, isPalaceIce } from '../../src/world/Terrain.js';

function world({ water = true, snow = false, G = 10 } = {}) {
    const cells = new Map();
    const data = {
        get: (x, L, z) => cells.get(x + ',' + L + ',' + z) ?? (L <= G ? BLOCK.GRASS : BLOCK.AIR),
        set: (x, L, z, t) => cells.set(x + ',' + L + ',' + z, t),
        topLayer(x, z) { let L = G + 40; while (L > G - 5 && this.get(x, L, z) === BLOCK.AIR) L--; return L; },
        isSeaColumn: () => false,
    };
    // a pond (or a patch of snow) 16 m away
    for (let x = 16; x <= 20; x++) for (let z = -2; z <= 2; z++) data.set(x, G, z, water ? BLOCK.WATER : snow ? BLOCK.SNOW : BLOCK.GRASS);
    const g = {
        config: { mode: 'freeworld' }, authority: true, localId: 'local', scene: new THREE.Scene(),
        terrain: { data }, world: { trees: [] },
        character: { group: { position: new THREE.Vector3(0, G + 3.5, 0), rotation: { y: Math.PI } }, getHandWorldPosition: (s, v) => v.set(0, G + 2, 0), getHandDirection: (s, v) => v.set(0, 0, 1) },
        remotes: new Map(), currentPose: { stompAt: 0, legsSeenAt: 0 },
        collision: { groundY: () => G - 0.5 },
        doors: { list: new Map(), _place(d) { this.list.set(d.id, d); }, remove(id) { this.list.delete(id); } },
        beds: { list: new Map(), spawnBed(p, yaw, c, { id }) { this.list.set(id, { id, ...p, color: c }); } },
        combat: { enabled: true, fatigue: 600, paidCount: 0, check(n) { return this.fatigue < SPELL_COST[n] ? 'мало маны' : null; }, pay(n) { this.fatigue -= SPELL_COST[n]; } },
        mana: { got: [], success(n) { this.got.push(n); } },
        builder: { edits: 0, _sendEdits(l) { this.edits += l.length; } },
        hud: { said: '', setVoice(t) { this.said = t; }, toast() {} },
    };
    g.iceMagic = new IceMagic(g);
    const run = (s, each) => { for (let t = 0; t < s; t += 0.05) { each?.(t); g.iceMagic.update(0.05); } };
    return { g, data, G, run };
}

const iceCount = (data, cells) => cells.filter((c) => isPalaceIce(data.get(c[0], c[1], c[2]))).length;

test('the words: «Create an Ice Castle», «Ice Bridge» and the Russian ways — never the plain «Айс», never talk', () => {
    for (const s of ['Create an Ice Castle', 'криейт эн айс касл', 'айс кастл', 'создай ледяной замок', 'построй ледяной дворец']) assert.equal(matchSpell(s), 'IceCastle', s);
    for (const s of ['Ice Bridge', 'айс бридж', 'создай ледяной мост', 'айс бриж']) assert.equal(matchSpell(s), 'IceBridge', s);
    assert.equal(matchSpell('айс'), 'Ice');
    assert.equal(iceMagicWords('где ледяной замок королевы'), null);
    assert.equal(iceMagicWords('мост через реку'), null);
    assert.equal(matchSpell('Create a House'), 'CreateHouse');
    assert.equal(SPELL_COST.IceCastle, 500);
    assert.equal(SPELL_COST.IceBridge, 50);
});

test('water or snow near is needed: none — a hint, nothing paid', () => {
    const { g } = world({ water: false });
    assert.equal(g.iceMagic.cast('IceCastle'), null);
    assert.match(g.hud.said, /воды|снега/);
    assert.equal(g.combat.fatigue, 600);
    const { data, G } = world({ water: false, snow: true });
    assert.equal(waterOrSnowNear(data, 0, 0, 30)?.what, 'snow');
    assert.equal(waterOrSnowNear(data, 0, 0, 8), null);
    assert.ok(G);
});

test('the castle: the words, a stamp — the snowflake floor spreads; the hands up — it rises after them; done: gates, bed, 500 mana', () => {
    const { g, data, G, run } = world();
    const M = g.iceMagic;
    assert.equal(M.cast('IceCastle'), 'IceCastle');
    assert.ok(M.pending, 'waits for the stamp');
    run(1);
    assert.equal(M.magic, null, 'no stamp yet: nothing');
    // the foot comes down (PoseInterpreter.stompAt)
    g.currentPose.stompAt = performance.now() + 1;
    run(0.1);
    assert.ok(M.magic, 'the stamp starts it');
    assert.equal(g.combat.fatigue, 100, '500 paid');
    M.testLift = 0.2; // (the hands down)
    run(ICE_SPELL.FLOOR_T + 1);
    const rec = M.magic.rec;
    const plan = M.planNow(rec);
    assert.equal(iceCount(data, plan.floor), plan.floor.length, 'the floor is all ice');
    assert.equal(data.get(rec.x, G, rec.z), plan.floor.find((c) => c[0] === rec.x && c[2] === rec.z)[3]);
    assert.ok(iceCount(data, plan.cells) < 5, 'hands down: no castle yet');
    // the hands half up: the castle about half grown — and it waits there
    M.testLift = (ICE_SPELL.LIFT_LO + ICE_SPELL.LIFT_HI) / 2;
    run(5);
    const half = iceCount(data, plan.cells);
    assert.ok(half > plan.cells.length * 0.25 && half < plan.cells.length * 0.8, `half: ${half} / ${plan.cells.length}`);
    M.testLift = 0.2;
    run(2);
    assert.equal(iceCount(data, plan.cells), half, 'hands lowered: it waits');
    // straight up: done
    M.testLift = 2;
    run(8);
    assert.equal(M.magic, null, 'done');
    assert.ok(iceCount(data, plan.cells) > plan.cells.length * 0.97);
    assert.ok(g.doors.list.has(rec.id + 'gL') && g.doors.list.has(rec.id + 'gR'), 'the ice gates');
    assert.ok(g.beds.list.has(rec.id + 'b'), 'a bed');
    assert.deepEqual(g.mana.got, ['IceCastle']);
    // the record saved and put back in another world
    const snap = M.snapshot();
    assert.equal(snap.list[0].f, 1);
    const w2 = world();
    w2.g.iceMagic.restore(snap);
    w2.run(1);
    assert.ok(iceCount(w2.data, plan.cells) > plan.cells.length * 0.97, 'put back from the save');
});

test('no legs in the picture: both hands brought down hard are the stamp', () => {
    const { g, run } = world();
    const M = g.iceMagic;
    M.cast('IceCastle');
    M.testLift = 1.2; run(0.2);
    M.testLift = 0.1; run(0.1);
    assert.ok(M.magic, 'the hands slammed down: it starts');
});

test('«стоп» while it rises: what has grown stays, the magic ends (no gates)', () => {
    const { g, data, run } = world();
    const M = g.iceMagic;
    M.cast('IceCastle');
    M.stamp();
    M.testLift = ICE_SPELL.LIFT_LO + 0.3;
    run(ICE_SPELL.FLOOR_T + 4);
    const rec = M.magic.rec, plan = M.planNow(rec);
    const n = iceCount(data, plan.cells);
    assert.ok(n > 0);
    assert.equal(M.stopMine('stop'), true);
    assert.equal(M.magic, null);
    assert.equal(g.doors.list.size, 0);
    assert.ok(M.list.get(rec.id).f > 0 && M.list.get(rec.id).f < 1);
    run(2);
    assert.equal(iceCount(data, plan.cells), n);
});

test('the bridge: pointed 30 m away — it grows after the hand as far as the hand points, and reaches the end', () => {
    const { g, data, G, run } = world();
    const M = g.iceMagic;
    M.testAim = { x: 0, z: 30 };
    assert.equal(M.cast('IceBridge'), 'IceBridge');
    assert.equal(g.combat.fatigue, 550, '50 mana');
    const rec = M.magic.rec, plan = M.plan(rec);
    // the hand lowered to a third of the way: the bridge stops there
    M.testAim = { x: 0, z: 1.5 + 28.5 / 3 };
    run(4);
    const third = iceCount(data, plan.cells);
    assert.ok(third > plan.cells.length * 0.2 && third < plan.cells.length * 0.5, `a third: ${third} / ${plan.cells.length}`);
    M.testAim = { x: 0, z: 30 };
    run(5);
    assert.equal(M.magic, null, 'done');
    assert.ok(iceCount(data, plan.cells) > plan.cells.length * 0.95);
    // an arch: higher in the middle than at the ends, with railings
    const deckAt = (z) => Math.max(...plan.cells.filter((c) => c[0] === 0 && c[2] === z).map((c) => c[1]));
    assert.ok(deckAt(16) > deckAt(3) + 2 && deckAt(16) > deckAt(29) + 2, 'an arch');
    assert.ok(plan.cells.some((c) => Math.abs(c[0]) === 2 && c[1] > G + 2), 'railings');
    assert.deepEqual(g.mana.got, ['IceBridge']);
});

test('the plans: the castle has a dome, spires, a throne, gates; the bridge an arch — the same on every computer', () => {
    const a = iceCastleMagicPlan({ x: 0, z: 0, G: 10, rot: 0 }), b = iceCastleMagicPlan({ x: 0, z: 0, G: 10, rot: 0 });
    assert.deepEqual(a.cells.slice(0, 50), b.cells.slice(0, 50));
    assert.ok(a.cells.some((c) => c[1] >= 10 + 30), 'tall spires and the finial');
    // the gates' archway is open (no ice where the gate is, from the floor up 6)
    for (let L = 11; L <= 16; L++) assert.ok(!a.cells.some((c) => c[0] === 0 && c[2] === 11 && c[1] === L), `gate open at ${L}`);
    const br = iceBridgePlan({ ax: 0, aL: 11, az: 0, bx: 20, bL: 11, bz: 0 });
    assert.ok(br.top > 11 + 2);
});

test('ice made in the warm stands a game day, then melts away by two days; in the mountains\' snow it never melts', () => {
    const build = (cold) => {
        const w = world();
        if (cold) for (let x = -14; x <= 14; x++) for (let z = -14; z <= 30; z++) w.data.set(x, w.G, z, BLOCK.SNOW);
        const M = w.g.iceMagic;
        M.testAim = { x: 0, z: 25 };
        M.cast('IceBridge');
        w.run(6);
        const rec = [...M.list.values()][0], plan = M.plan(rec);
        return { ...w, M, rec, plan };
    };
    const warm = build(false);
    assert.equal(warm.rec.cold, false);
    const n0 = iceCount(warm.data, warm.plan.cells);
    assert.ok(n0 > warm.plan.cells.length * 0.9);
    warm.M._warmth(ICE_SPELL.MELT_START - 10);
    assert.equal(iceCount(warm.data, warm.plan.cells), n0, 'a day: whole');
    warm.M._warmth((ICE_SPELL.MELT_END - ICE_SPELL.MELT_START) / 2 + 10);
    const half = iceCount(warm.data, warm.plan.cells);
    assert.ok(half < n0 * 0.7 && half > n0 * 0.3, `half melted: ${half} / ${n0}`);
    // (the highest blocks went first)
    const top = Math.max(...warm.plan.cells.map((c) => c[1]));
    assert.ok(!warm.plan.cells.some((c) => c[1] === top && isPalaceIce(warm.data.get(c[0], c[1], c[2]))));
    for (let i = 0; i < 20; i++) warm.M._warmth(ICE_SPELL.MELT_END / 20);
    assert.equal(iceCount(warm.data, warm.plan.cells), 0, 'two days: all gone');
    assert.equal(warm.M.list.size, 0);
    const cold = build(true);
    assert.equal(cold.rec.cold, true);
    const c0 = iceCount(cold.data, cold.plan.cells);
    for (let i = 0; i < 10; i++) cold.M._warmth(ICE_SPELL.MELT_END);
    assert.equal(iceCount(cold.data, cold.plan.cells), c0, 'in the cold: never melts');
});
