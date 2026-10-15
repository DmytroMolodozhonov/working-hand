// «Create a Castle» (src/game/CastleMagic.js, src/world/MagicCastle.js): the words, the cost (500 mana,
// Creative free), the stone round the place, and a whole castle in a small world without a screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CastleMagic, castleProblem, stoneAround } from '../../src/game/CastleMagic.js';
import { castleLayout, CASTLE } from '../../src/world/MagicCastle.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('the words: «Create a Castle», «Создай замок» — never «замок» alone, never the house', () => {
    for (const t of ['Create a Castle', 'криейт э касл', 'крейт э кастл', 'создай замок', 'Сотвори замок', 'построй замок']) assert.equal(matchSpell(t), 'CreateCastle', t);
    for (const t of ['замок', 'открой замок', 'lock']) assert.notEqual(matchSpell(t), 'CreateCastle', t);
    assert.equal(matchSpell('Create a House'), 'CreateHouse');
});

test('the cost: 500 mana and stone round it; Creative — free', () => {
    assert.match(castleProblem({ mana: 499, free: false, stone: 1e4 }), /маны/);
    assert.equal(castleProblem({ mana: 500, free: false, stone: 1e4 }), null);
    assert.match(castleProblem({ mana: 900, free: false, stone: 10 }), /камня/);
    assert.equal(castleProblem({ mana: 0, free: true, stone: 0 }), null);
});

function world({ under = BLOCK.STONE, mode = 'freeworld' } = {}) {
    const cells = new Map();
    const G = 10;
    const data = {
        get: (x, L, z) => cells.get(x + ',' + L + ',' + z) ?? (L <= G - 3 ? under : L <= G ? BLOCK.GRASS : BLOCK.AIR),
        set: (x, L, z, t) => cells.set(x + ',' + L + ',' + z, t),
        topLayer(x, z) { let L = G + 80; while (L > G - 20 && this.get(x, L, z) === BLOCK.AIR) L--; return L; },
        isSeaColumn: () => false,
    };
    const g = {
        config: { mode }, authority: true, localId: 'local', scene: new THREE.Scene(),
        terrain: { data }, world: { trees: [], removeTree() {} },
        character: { group: { position: new THREE.Vector3(0, G + 3.5, -60), rotation: { y: 0 } } }, remotes: new Map(),
        collision: { _n: 0, addBox() { return ++this._n; }, removeBox() {}, groundY: () => G - 0.5 },
        items: { loose: new Map(), heldOf: (k) => (k === 'wand' ? { side: 'right' } : null), spawnLoose() {}, removeLoose() {} },
        doors: { list: new Map(), _place(d) { this.list.set(d.id, d); }, remove(id) { this.list.delete(id); } },
        beds: { list: new Map(), spawnBed(p, yaw, c, { id }) { const b = { id, ...p }; this.list.set(id, b); return b; }, removeBed(id) { this.list.delete(id); } },
        houses: { panes: [], setExtraPanes(k, l) { this.panes = l; } },
        chests: [],
        combat: { enabled: true, fatigue: 600 },
        mana: { got: [], success(n) { this.got.push(n); } },
        builder: { edits: 0, _sendEdits(l) { this.edits += l.length; } },
        hud: { said: '', setVoice(t) { this.said = t; } },
    };
    g.castleMagic = new CastleMagic(g);
    g.castleMagic.syncCells = true;
    return { g, data, G };
}

test('stone: the rock under the ground counts; on deep sand there is none', () => {
    assert.ok(stoneAround(world().data, 0, 0) >= CASTLE.STONE_NEED);
    assert.equal(stoneAround(world({ under: BLOCK.SAND }).data, 0, 0), 0);
    const { g } = world({ under: BLOCK.SAND });
    assert.match(String(g.castleMagic._hostStart({ at: [0, 0, 0], c: [0, -60] }, 'local')), /камня/);
});

test('a whole castle in 30 s: −500 mana, its gate towards the caster, doors, beds, chests with things, glass; saved and back', () => {
    const { g, data } = world();
    assert.equal(g.castleMagic._hostStart({ at: [0, 0, 0], c: [0, -60] }, 'local'), true);
    assert.equal(g.combat.fatigue, 100);
    for (let t = 0; t < CASTLE.TIME + 1; t += 0.05) g.castleMagic.update(0.05);
    assert.equal(g.castleMagic.magic, null);
    const rec = [...g.castleMagic.list.values()][0];
    assert.ok(rec);
    const lay = castleLayout(rec);
    assert.ok(lay.doors.find((d) => d.id === 'gL').z < 0, 'the gate faces the caster');
    assert.equal([...g.doors.list.values()].filter((d) => d.metal).length, 5);
    assert.equal(g.beds.list.size, 4);
    assert.equal(g.chests.length, 3);
    assert.ok(Object.values(rec.store).every((l) => l.length >= 2), 'useful things in every chest');
    assert.ok(g.houses.panes.length > 10);
    const P = g.castleMagic.cells(rec);
    let solid = 0, have = 0;
    for (let i = P.nAir; i < P.n; i++) { if (P.cells[i * 5 + 3] === BLOCK.AIR) continue; solid++; if (data.get(P.cells[i * 5], P.cells[i * 5 + 1], P.cells[i * 5 + 2]) === P.cells[i * 5 + 3]) have++; }
    assert.ok(have > solid * 0.97, `${have}/${solid}`);
    assert.deepEqual(g.mana.got, ['CreateCastle']);
    // saved and loaded on another computer: the same castle, its chests' things
    const snap = JSON.parse(JSON.stringify(g.castleMagic.snapshot()));
    const w2 = world();
    w2.g.castleMagic.restore(snap);
    for (let i = 0; i < 400 && w2.g.castleMagic._repairQ.length; i++) w2.g.castleMagic.update(0.016);
    assert.equal(w2.g.chests.length, 3);
    assert.equal(w2.data.get(P.cells[(P.n - 1) * 5], P.cells[(P.n - 1) * 5 + 1], P.cells[(P.n - 1) * 5 + 2]), P.cells[(P.n - 1) * 5 + 3]);
});
