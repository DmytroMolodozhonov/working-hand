/**
 * «Левиоса» on a person: after a moment of flailing in the air its hands open and what it held falls — a farmer's pitchfork (the author
 * 05.11: «у фермера должна выпасть вила»), a smith's hammer, a knight's sword; a wizard keeps his wand; only once; a tool is a thing of
 * the world now (ItemTypes 'tool' with the very model it had in the hand).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DeathSystem, LIFT_DROP_T, heldDrop } from '../../src/game/Death.js';
import { makeItemModel, ITEM_INFO, describeItem } from '../../src/game/ItemTypes.js';

const fake = () => {
    const dropped = [];
    const game = { items: { auth: true, spawnLoose: (it) => dropped.push(it) }, weapons: { byId: new Map(), spawn: (t) => { dropped.push({ kind: 'weapon', type: t }); return { wake() {} }; }, markMagic: (w) => w } };
    return { D: new DeathSystem(game), dropped };
};
const person = (tool, extra = {}) => ({ x: 0, y: 5, z: 0, yaw: 0, model: { toolKind: tool, setHeldTool(k) { this.toolKind = k; } }, ...extra });

test('a farmer lifted: the pitchfork falls after a moment of flailing, once; the hand stays empty', () => {
    const { D, dropped } = fake();
    const c = person('pitchfork'), lev = {};
    assert.equal(D.liftedDrop(c, lev, LIFT_DROP_T * 0.5), null, 'not at once');
    const d = D.liftedDrop(c, lev, LIFT_DROP_T);
    assert.equal(d?.kind, 'tool'); assert.equal(d.tool, 'pitchfork');
    assert.equal(dropped.length, 1);
    assert.equal(c.model.toolKind, 'none'); assert.ok(c.toolGone);
    assert.equal(D.liftedDrop(c, lev, 5), null, 'once');
    assert.equal(heldDrop(c), null, 'nothing more to drop');
});

test('a wizard keeps his wand; a body lifted dead drops nothing more; a knight drops his sword', () => {
    const { D, dropped } = fake();
    assert.equal(D.liftedDrop(person('wand', { wizard: true }), {}, 1), null);
    assert.equal(D.liftedDrop(person('pitchfork'), { body: true }, 1), null);
    assert.equal(dropped.length, 0);
    const k = person('sword', { role: 'knight' });
    D.liftedDrop(k, {}, 1);
    assert.ok(k.disarmed);
});

test('every tool a person can drop is a thing with a name, a description and its model', () => {
    assert.ok(ITEM_INFO.tool);
    for (const t of ['pitchfork', 'hoe', 'hammer', 'knife', 'bucket']) {
        const m = makeItemModel({ kind: 'tool', tool: t });
        assert.ok(m.children.length, t);
        if (describeItem) assert.ok(describeItem({ kind: 'tool', tool: t })?.title, t);
    }
});
