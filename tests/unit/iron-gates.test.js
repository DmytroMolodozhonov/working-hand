/**
 * The keep's gates of the new generation are forged iron (src/game/GateModel.js; GATE_METAL_FROM_GEN): the author — «ворота замка — не деревянные,
 * а металлические… обычная «Бомбарда» их НЕ ломает (взрыв есть, ворота стоят, звон металла); ломает только «Бомбарда Максима»».
 * The leaves, the sound, and what each blast does to them; the older worlds keep their wooden-banded gates.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Alohomora, ALOHOMORA, TARGETS, IRON_GATE_VS } from '../../src/game/Alohomora.js';
import { forgedGateModel, gateVariant, GATE_VARIANTS } from '../../src/game/GateModel.js';
import { doorModel } from '../../src/game/Doors.js';
import { GATE_METAL_FROM_GEN, WORLD_GEN } from '../../src/world/Terrain.js';

const meshes = (g) => { const out = []; g.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };

function setup(gen) {
    const rang = [], shaken = [], alarms = [];
    const doors = new Map();
    const game = {
        gen, authority: true,
        character: { group: { position: { x: 0, y: 0, z: 0 } } },
        sound: { playIronGate: (p) => rang.push(p), playClang: () => {} },
        doors: { list: doors, remove: (id) => doors.delete(id) },
        fx: { debrisFrom: () => {} },
        castleLife: { alarm: (pos, kind) => alarms.push([pos, kind]) },
        hud: {},
    };
    const A = new Alohomora(game);
    const def = { id: 'cs0_0', throneGate: { x: 10, y: 0, z: 10, ry: 0, w: 5, h: 7 } };
    A.gateRecs.set(def.id, { def, ids: ['g0', 'g1'], auto: false, openT: 0 });
    for (const id of ['g0', 'g1']) doors.set(id, { id, x: 10, y: 0, z: 10, a: 0, gate: true, forged: gen >= GATE_METAL_FROM_GEN, model: new THREE.Group() });
    return { A, game, rang, alarms, shaken, doors };
}
const at = { x: 10, y: 3, z: 8 };

test('iron gates: the new generation and later; the one number', () => {
    assert.ok(Number.isInteger(GATE_METAL_FROM_GEN) && GATE_METAL_FROM_GEN > 8);
    assert.ok(WORLD_GEN >= GATE_METAL_FROM_GEN);
});

test('iron gates: a plain «Бомбардо» rings on them and they stand (any number of times); the people are alarmed once', () => {
    const { A, rang, alarms } = setup(GATE_METAL_FROM_GEN);
    for (let i = 0; i < 6; i++) A.blast(at, 5, 1);
    assert.equal(A._gate('cs0_0').broken, false);
    assert.equal(A._gate('cs0_0').hits, 0, 'the iron takes no wear from a plain blast');
    assert.ok(rang.length >= 6, 'a ring of iron for each blast');
    assert.equal(alarms.length, 1, 'one alarm for blasts in a row');
});

test('iron gates: «Бомбардо Максима» (power 3), Inspirius and the like (99) break them; the plain «Total Destruction» does not, its Maxima does', () => {
    for (const [power, soft, breaks] of [[3, false, true], [99, false, true], [99, true, false], [1, false, false], [1.5, false, false]]) {
        const { A, rang } = setup(GATE_METAL_FROM_GEN);
        A.blast(at, 5, power, soft);
        assert.equal(A._gate('cs0_0').broken, breaks, `power ${power}${soft ? ' soft' : ''}`);
        if (breaks) assert.ok(rang.length >= 1, 'the iron falls with a boom');
    }
});

test('iron gates: out of reach of the blast they feel nothing; a broken pair does not ring again', () => {
    const { A, rang } = setup(GATE_METAL_FROM_GEN);
    A.blast({ x: 80, y: 3, z: 80 }, 5, 1);
    assert.equal(rang.length, 0);
    A.blast(at, 5, 3);
    const n = rang.length;
    A.blast(at, 5, 3);
    assert.equal(rang.length, n);
});

test('iron gates: a world of an older generation keeps the wooden-banded gates — two blasts of «Бомбардо» break them, as before', () => {
    const { A, rang } = setup(GATE_METAL_FROM_GEN - 1);
    assert.equal(A.metalGates(), false);
    A.blast(at, 5, 1);
    assert.equal(A._gate('cs0_0').broken, false);
    A.blast(at, 5, 1);
    assert.equal(A._gate('cs0_0').broken, true);
    assert.equal(rang.length, 0, 'no iron ring there');
    const w = setup(GATE_METAL_FROM_GEN - 1);
    w.A.blast(at, 5, 99, true);
    assert.equal(w.A._gate('cs0_0').broken, true, 'the plain «Total Destruction» broke them before');
});

test('iron gates: the lock table says why (the codex and the tests read it)', () => {
    assert.match(TARGETS.throneGate.why, /кован|железн/);
    assert.equal(TARGETS.throneGate.plain, 'refuse');
    assert.equal(TARGETS.throneGate.maxima, 'unlock');
    assert.ok(ALOHOMORA.METAL_POWER > 1 && ALOHOMORA.METAL_POWER <= 3, 'a Maxima blast breaks them, a plain one does not');
});

test('iron gates: the leaf is a hinged group like every door; four shapes of draw a leaf; the hand takes the ring; varied from gate to gate', () => {
    for (const mirror of [false, true]) for (let vari = 0; vari < GATE_VARIANTS; vari++) {
        const g = forgedGateModel({ mirror, w: 2.5, h: 7, vari });
        const u = g.userData;
        assert.ok(u.hinge && u.knob && u.knob2 && u.forged);
        assert.equal(u.mirror, mirror);
        const ms = meshes(g);
        assert.ok(ms.length >= 3 && ms.length <= 5, `${ms.length} draws a leaf (iron, steel, rust, plate, rings)`);
        const box = new THREE.Box3().setFromObject(g);
        assert.ok(box.max.y >= 7 && box.max.y < 8, `the leaf is 7 high with its points: ${box.max.y}`);
        assert.ok(Math.abs((box.max.x - box.min.x) - 2.5) < 0.5, `2.5 wide: ${box.max.x - box.min.x}`);
        const k = new THREE.Vector3(); u.knob.getWorldPosition(k);
        assert.ok(k.y > 3 && k.y < 4, 'the ring at the hero\'s hand');
        assert.ok(mirror ? k.x < 0 : k.x > 0, 'on the free edge');
    }
    // different gates, different looks: the shapes (bars) or the leaf's count of triangles differ between variants
    const tri = [0, 1, 2, 3].map((v) => meshes(forgedGateModel({ w: 3.5, h: 7, vari: v })).reduce((a, m) => a + m.geometry.index.count, 0));
    assert.ok(new Set(tri).size >= 2, `the variants are not one: ${tri}`);
    assert.deepEqual([0, 1, 2, 3].map((v) => gateVariant('cs' + v)).every((v) => v >= 0 && v < GATE_VARIANTS), true);
    assert.equal(gateVariant('cs1_2'), gateVariant('cs1_2'));
    assert.ok(new Set(['cs0_0', 'cs1_0', 'cs2_5', 'cs-3_4', 'cs7_7', 'cs9_1'].map(gateVariant)).size >= 2, 'castles do not all get one look');
});

test('iron gates: doorModel gives a forged leaf for `forged`, the old banded one otherwise', () => {
    assert.ok(doorModel(0x5a3a1e, { gate: true, forged: true, w: 2.5, h: 7 }).userData.forged);
    assert.ok(!doorModel(0x5a3a1e, { gate: true, w: 2.5, h: 7 }).userData.forged);
});

test('iron gates: what each spell does to them is written down — only the strong blasts break them', () => {
    const breaks = Object.entries(IRON_GATE_VS).filter(([, v]) => v === 'breaks').map(([k]) => k).sort();
    assert.deepEqual(breaks, ['Boom', 'BombardoMaxima', 'Inspirius', 'TotalDestructionMaxima'].sort());
    assert.equal(IRON_GATE_VS.Bombardo, 'rings');
    assert.equal(IRON_GATE_VS.TotalDestruction, 'rings');
    assert.equal(IRON_GATE_VS.CircleAttack, 'rings');
    for (const v of Object.values(IRON_GATE_VS)) assert.ok(['breaks', 'rings', 'none'].includes(v));
});
