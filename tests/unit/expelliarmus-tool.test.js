/**
 * «Экспеллиармус» on a person with a tool (the author 05.11: «у фермера должна выпасть вила» — it was only a push): the pitchfork /
 * hoe / hammer / knife / bucket flies out of the hand — a thing of the world (ItemTypes 'tool' with the very shape it had in the hand);
 * once; the hand stays empty. «Левиоса» only lifts (nothing falls).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { disarmVillager } from '../../src/game/Expelliarmus.js';
import { heldDrop } from '../../src/game/Death.js';
import { makeItemModel, ITEM_INFO, describeItem } from '../../src/game/ItemTypes.js';

const person = (tool, extra = {}) => ({ x: 0, y: 0, z: 0, model: { toolKind: tool, setHeldTool(k) { this.toolKind = k; } }, ...extra });

test('«Экспеллиармус»: a farmer\'s pitchfork flies out of the hand, once; the hand stays empty', () => {
    const spawned = [];
    const g = { items: { spawnLoose: (it) => spawned.push(it) } };
    const c = person('pitchfork', { role: 'farmer' });
    assert.equal(disarmVillager(g, c), 'tool');
    assert.equal(spawned[0]?.kind, 'tool'); assert.equal(spawned[0].tool, 'pitchfork');
    assert.equal(c.model.toolKind, 'none'); assert.ok(c.toolGone);
    assert.equal(disarmVillager(g, c), null, 'once');
    assert.equal(heldDrop(c), null, 'nothing more falls when it dies');
    assert.equal(disarmVillager(g, person('basket')), null, 'a basket of a woman: not a tool to knock out');
});

test('a farmer who dies drops his pitchfork too', () => {
    const d = heldDrop(person('pitchfork'));
    assert.equal(d?.kind, 'tool');
});

test('every tool a person can drop is a thing with a name, a description and its model', () => {
    assert.ok(ITEM_INFO.tool);
    for (const t of ['pitchfork', 'hoe', 'hammer', 'knife', 'bucket']) {
        const m = makeItemModel({ kind: 'tool', tool: t });
        assert.ok(m.children.length, t);
        if (describeItem) assert.ok(describeItem({ kind: 'tool', tool: t })?.title, t);
    }
});
