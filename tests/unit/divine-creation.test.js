// «Да пусть создастся …» (DivineCreation.js, CreationWords/Rules/Prompt, world/CreationBuild.js): the words, the recipe
// (from the network or from the words), the cost (1000, back when the gods fail), a whole building in a small world
// without a screen, saved and loaded the same, the caster never walled in.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DivineCreation, packGrid, unpackGrid } from '../../src/game/DivineCreation.js';
import { creationWords } from '../../src/game/CreationWords.js';
import { sanitizeRecipe, guessRecipe, forbidden, CREATION, CAPS, WALK_KEYS, FLY_KEYS } from '../../src/game/CreationRules.js';
import { parseAnswer, answerProblem, CREATION_SCHEMA } from '../../src/game/CreationPrompt.js';
import { creationPlan, recipeRect } from '../../src/world/CreationBuild.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('the words: «Да пусть создастся …» and its forms; talk never casts', () => {
    for (const [t, d] of [['Да пусть создастся замок из белого камня', 'замок из белого камня'], ['пусть создастся существо с крыльями', 'существо с крыльями'],
        ['да создастся колодец', 'колодец'], ['да будет создана статуя свиньи', 'статуя свиньи'], ['Да сотворится город', 'город'], ['ну, да пусть создастся мост', 'мост'],
        ['да пусть создасться дерево', 'дерево'], ['пусть появится башня', 'башня'], ['Да пусть создастся', '']]) assert.equal(creationWords(t)?.desc, d, t);
    for (const t of ['пусть он создаст замок', 'да, создастся впечатление что', 'да, пусть будет так', 'создай замок', 'я хочу создать дом', 'пусть будет свет', 'создастся замок']) assert.equal(creationWords(t), null, t);
    // first in the matcher: the description's own words are no other spell
    assert.equal(matchSpell('Да пусть создастся замок с огнём на башнях и фонтаном'), 'DivineCreation');
    assert.equal(matchSpell('создай замок'), 'CreateCastle');
});

test('the recipe from the words alone: a castle, a creature (20 health by default), a plant, a statue; the forbidden refused', () => {
    const c = guessRecipe('замок из белого камня с шестью башнями и рвом');
    assert.equal(c.type, 'build'); assert.equal(c.parts[0].kind, 'castle'); assert.equal(c.parts[0].towers, 6); assert.ok(c.parts[0].moat); assert.equal(c.style.wall, 'white');
    const k = guessRecipe('существо с большими глазами, тонкими ногами, крыльями, умеющее летать, магическое');
    assert.equal(k.type, 'creature'); assert.equal(k.hp, CAPS.HP_DEFAULT); assert.ok(k.fly); assert.notEqual(k.wings, 'none'); assert.ok(k.eyes.size > 1); assert.ok(k.legThick < 1); assert.ok(k.abilities.includes('glow'));
    assert.equal(guessRecipe('существо, 50 здоровья, плюётся огнём').hp, 50);
    assert.ok(guessRecipe('существо, 50 здоровья, плюётся огнём').abilities.includes('fireBreath'));
    const p = guessRecipe('дерево с синими листьями, светится, быстро размножается в лесу');
    assert.equal(p.type, 'plant'); assert.equal(p.form, 'tree'); assert.equal(p.spread, 'often'); assert.deepEqual(p.habitat, ['forest']); assert.ok(p.glow);
    const s = guessRecipe('статуя свиньи');
    assert.equal(s.type, 'build'); assert.equal(s.parts[0].kind, 'statue'); assert.equal(s.parts[0].subject, 'pig');
    assert.ok(forbidden('голая статуя')); assert.equal(forbidden('статуя рыцаря'), null);
});

test('whatever the network writes, the recipe is safe: clamped, white-listed, its gaps from the words', () => {
    const r = sanitizeRecipe({ type: 'creature', name: 'Дракоша', creature: { plan: 'nonsense', size: 999, hp: 1e9, legs: 40, walk: 'teleport', fly: 'rocket', abilities: ['nuke', 'fireBreath'], temper: 'hostile' } }, 'дракон', 1);
    assert.ok(r.size <= CAPS.SIZE_MAX && r.hp <= CAPS.HP_MAX && r.legs <= CAPS.LEGS_MAX);
    assert.ok(WALK_KEYS.includes(r.walk)); assert.ok(r.fly === null || FLY_KEYS.includes(r.fly));
    assert.deepEqual(r.abilities.filter((a) => a === 'nuke'), []);
    const b = sanitizeRecipe({ type: 'build', build: { parts: [{ kind: 'castle', size: [1e6, -5, 'x'] }, { kind: 'spaceship', size: [1, 1, 1] }] } }, 'замок', 1);
    assert.equal(b.parts[0].kind, 'castle'); assert.ok(b.parts.every((q) => q.size.every(Number.isFinite)));
    assert.ok(b.parts[0].size[0] <= 110);
    // broken JSON, a cut-off answer, text round it
    assert.equal(parseAnswer('мусор'), null);
    assert.equal(parseAnswer('Вот: {"type":"build","name":"Дом","build":{"parts":[{"kind":"house","size":[14,11,11]}]}} готово').type, 'build');
    assert.equal(parseAnswer('{"type":"build","name":"Дом","build":{"parts":[{"kind":"house","size":[14,11').type, 'build');
    assert.match(answerProblem({ type: 'build', build: {} }), /частей/);
    assert.ok(CREATION_SCHEMA.properties.creature.properties.walk.enum.length === 10 && CREATION_SCHEMA.properties.creature.properties.fly.enum.length === 11);
});

test('every part builds from the ground, the same on every computer; doors 3 × 6, nothing over the size of the world', () => {
    const grid = (r) => { const w = Math.ceil(r.x1 - r.x0) + 20, d = Math.ceil(r.z1 - r.z0) + 20, x0 = Math.floor(r.x0) - 10, z0 = Math.floor(r.z0) - 10; const G = new Int16Array(w * d); for (let k = 0; k < d; k++) for (let i = 0; i < w; i++) G[k * w + i] = 20 + Math.round(2 * Math.sin((x0 + i) / 11)); return { x0, z0, w, d, G, wet: new Uint8Array(w * d) }; };
    for (const desc of ['город с 12 домами и стенами', 'замок с 4 башнями и рвом', 'дом', 'башня', 'мост', 'колодец', 'фонтан', 'статуя дракона', 'пирамида', 'храм', 'маяк', 'мельница', 'корабль', 'сад', 'беседка', 'купол', 'лабиринт', 'арка', 'обелиск', 'стена', 'таверна', 'лестница']) {
        const r = sanitizeRecipe(null, desc, 3);
        const rect = recipeRect(r, 0, 0, 0), gr = grid(rect);
        const a = creationPlan({ recipe: r, seed: 5, x: 0, z: 0, face: 0, grid: gr, G: 20 });
        const b = creationPlan({ recipe: r, seed: 5, x: 0, z: 0, face: 0, grid: gr, G: 20 });
        assert.ok(a.n > 50, desc + ': blocks');
        assert.deepEqual(Array.from(a.cells.slice(0, 500)), Array.from(b.cells.slice(0, 500)), desc + ': the same plan twice');
        assert.ok(a.top - 20 <= CREATION.MAX_H + 10, desc + ': not too high');
        for (const d of a.doors) assert.ok(d.w >= 3 && d.h >= 5, desc + ': a door the hero passes');
        assert.ok(!a.full, desc + ': within the limit');
    }
});

test('the ground\'s heights packed for the record come back the same', () => {
    const G = new Int16Array(12).map((_, i) => 30 + (i % 5) - 2); G[3] = -32768;
    const wet = new Uint8Array(12); wet[7] = 1;
    const back = unpackGrid(packGrid({ x0: -3, z0: 4, w: 4, d: 3, G, wet }, 30));
    assert.deepEqual(Array.from(back.G), Array.from(G)); assert.deepEqual(Array.from(back.wet), Array.from(wet));
});

function world({ mode = 'freeworld', mana = 1500 } = {}) {
    const cells = new Map();
    const G = 10;
    const data = {
        get: (x, L, z) => cells.get(x + ',' + L + ',' + z) ?? (L <= G ? BLOCK.GRASS : BLOCK.AIR),
        set: (x, L, z, t) => cells.set(x + ',' + L + ',' + z, t),
        topLayer(x, z) { let L = G + 80; while (L > G - 20 && this.get(x, L, z) === BLOCK.AIR) L--; return L; },
        isSeaColumn: () => false,
    };
    const g = {
        config: { mode }, authority: true, localId: 'local', scene: new THREE.Scene(),
        terrain: { data }, world: { trees: [], removeTree() {} },
        character: { group: { position: new THREE.Vector3(0, G + 3.5, -40), rotation: { y: 0 } }, getHandWorldPosition: (s, v) => v.set(0, G + 4, -40), getHandDirection: (s, v) => v.set(0, -0.2, 1).normalize() }, remotes: new Map(),
        collision: { _n: 0, addBox() { return ++this._n; }, removeBox() {}, groundY: () => G + 0.5 },
        items: { loose: new Map(), heldOf: (k) => (k === 'wand' ? { side: 'right' } : null), spawnLoose() {}, removeLoose() {} },
        doors: { list: new Map(), _place(d) { this.list.set(d.id, d); }, remove(id) { this.list.delete(id); } },
        beds: { list: new Map(), spawnBed(p, yaw, c, { id }) { const b = { id, ...p }; this.list.set(id, b); return b; }, removeBed(id) { this.list.delete(id); } },
        houses: { panes: [], setExtraPanes(k, l) { this.panes = l; } },
        chests: [],
        combat: { enabled: true, fatigue: mana, maxFatigue: 3000 },
        mana: { got: [], success(n) { this.got.push(n); } },
        builder: { edits: 0, _sendEdits(l) { this.edits += l.length; } },
        hud: { said: '', setVoice(t) { this.said = t; } },
    };
    const dc = new DivineCreation(g);
    dc.syncPlans = true;
    dc.testAim = { x: 0, z: -10 };
    g.divine = dc;
    return { g, data, G, dc };
}

const run = async (dc, s = 80) => { for (let t = 0; t < s; t += 0.1) { dc.update(0.1); await new Promise((r) => setImmediate(r)); } };

test('a building, start to end: −1000 mana, the gods\' answer (the network\'s JSON), its blocks, doors, beds, chests; the caster outside it', async () => {
    const { g, data, dc } = world();
    dc.testAsk = async () => ({ type: 'build', name: 'Белый дом', build: { style: { wall: 'white', roof: 'blueroof' }, parts: [{ kind: 'house', size: [16, 12, 11] }] } });
    assert.equal(dc.cast(true, 'Да пусть создастся белый дом с синей крышей'), 'DivineCreation');
    assert.ok(dc.listening, 'the gods listen till the speaker is quiet (the description may go on)');
    await run(dc, 2);
    assert.equal(g.combat.fatigue, 500);
    await run(dc, 60);
    assert.equal(dc.magic, null);
    const rec = [...dc.list.values()][0];
    assert.ok(rec && !rec.building, 'made');
    assert.equal(rec.recipe.name, 'Белый дом');
    assert.ok(g.doors.list.size >= 1 && g.beds.list.size >= 1 && g.chests.length >= 1);
    assert.deepEqual(g.mana.got, ['DivineCreation']);
    const me = g.character.group.position;
    assert.ok(!(me.x > rec.rect.x0 && me.x < rec.rect.x1 && me.z > rec.rect.z0 && me.z < rec.rect.z1), 'the caster is not inside it');
    let white = 0;
    const P = dc.plan(rec);
    for (let i = 0; i < P.n; i++) if (P.cells[i * 5 + 3] === BLOCK.CS_WHITE && data.get(P.cells[i * 5], P.cells[i * 5 + 1], P.cells[i * 5 + 2]) === BLOCK.CS_WHITE) white++;
    assert.ok(white > 50, 'its white walls are there');
    // saved and loaded into a fresh world: the same blocks back, the chests' things kept
    rec.store = { 0: [{ kind: 'apple', uid: 'a1' }] };
    const snap = JSON.parse(JSON.stringify(dc.snapshot()));
    const w2 = world();
    w2.dc.restore(snap);
    for (let i = 0; i < 20000 && (w2.dc._repairQ.length || w2.dc._repairAfter > 0); i++) w2.dc.update(0.1);
    const r2 = [...w2.dc.list.values()][0];
    assert.equal(r2.store[0][0].kind, 'apple');
    const P2 = w2.dc.plan(r2);
    let back = 0, solid = 0;
    for (let i = 0; i < P2.n; i++) if (P2.cells[i * 5 + 3]) { solid++; if (w2.data.get(P2.cells[i * 5], P2.cells[i * 5 + 1], P2.cells[i * 5 + 2]) === P2.cells[i * 5 + 3]) back++; }
    assert.equal(back, solid, 'its blocks are back after a load');
});

test('the gods fail: no network and nonsense → the words are read; too long → the mana comes back; not enough mana / forbidden → nothing paid', async () => {
    const a = world();
    a.dc.testAsk = async () => 'никакого json тут нет';
    assert.equal(a.dc.cast(true, 'да пусть создастся колодец'), 'DivineCreation');
    await run(a.dc, 40);
    const rec = [...a.dc.list.values()][0];
    assert.equal(rec?.recipe.parts[0].kind, 'well', 'the words read when the answer is nonsense');
    const b = world();
    b.dc.testAsk = () => new Promise(() => {});
    b.dc.cast(true, 'да пусть создастся башня');
    await run(b.dc, 2);
    assert.equal(b.g.combat.fatigue, 500);
    await run(b.dc, CREATION.THINK_MAX + 2);
    assert.equal(b.g.combat.fatigue, 1500, 'the mana back');
    assert.equal(b.dc.magic, null);
    const c = world({ mana: 900 });
    assert.equal(c.dc.cast(true, 'да пусть создастся башня'), null);
    assert.match(c.g.hud.said, /маны/);
    assert.equal(c.dc.cast(true, 'да пусть создастся голая статуя'), null);
    assert.equal(c.g.combat.fatigue, 900);
    // a lone opener: the next phrase is the description
    const d = world();
    d.dc.testAsk = async () => null;
    assert.equal(d.dc.cast(true, 'да пусть создастся'), null);
    assert.ok(d.dc.listening);
    assert.equal(d.dc.hearDesc('маленький', false), true, 'still being said');
    assert.equal(d.dc.hearDesc('маленький колодец', true), true, 'the description is taken');
    assert.equal(d.dc.hearDesc('из белого камня', true), true, 'and its next phrase too');
    await run(d.dc, 2);
    assert.equal(d.g.combat.fatigue, 500);
    assert.match(d.dc.magic?.desc || '', /колодец из белого камня/, 'one description of both phrases');
    // a lone opener and nothing said: the gods stop listening, nothing paid
    const q = world();
    q.dc.cast(true, 'да пусть создастся');
    await run(q.dc, CREATION.LISTEN + 1);
    assert.equal(q.dc.listening, null);
    assert.equal(q.g.combat.fatigue, 1500);
    // a saved world while the gods think: the mana back on load
    const e = world();
    e.dc.testAsk = () => new Promise(() => {});
    e.dc.cast(true, 'да пусть создастся башня');
    await run(e.dc, 2);
    const snap = e.dc.snapshot();
    assert.equal(snap.refund, CREATION.COST);
});

test('Creative: free, no wand needed', async () => {
    const { g, dc } = world({ mode: 'creative', mana: 0 });
    g.combat.enabled = false;
    g.items.heldOf = () => null;
    dc.testAsk = async () => null;
    assert.equal(dc.cast(true, 'да пусть создастся колодец'), 'DivineCreation');
    await run(dc, 30);
    assert.equal(dc.list.size, 1);
});
