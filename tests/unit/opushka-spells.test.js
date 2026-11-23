import test from 'node:test';
import assert from 'node:assert/strict';
import { CylinderGeometry, Scene, Vector3 } from 'three';
import { OpushkaSpells, SPELLS } from '../../special/opushka-spells.js';

const landscape = {
    groundH: () => -5,
    waterAt: () => 2,
    trees: () => [],
    rocks: () => [],
};

test('Bombardo stops at the water surface while a beam can cross it', () => {
    const spells = new OpushkaSpells(landscape);
    const start = new Vector3(0, 2, 0), end = new Vector3(0, -1, 0);
    assert.equal(spells._worldHit(start, end, 0.1), null);
    const hit = spells._worldHit(start, end, 0.1, true);
    assert.equal(hit.kind, 'water');
    assert.ok(Math.abs(hit.p.y) < 1e-9);
    assert.equal(hit.t, 2 / 3);
});

test('the host turns opposing charges into a single synchronized beam clash', () => {
    const messages = [];
    const network = { isHost: true, localId: 'H', send: (message) => messages.push(message) };
    const remotes = new Map([['guest', { P: { pos: new Vector3(12, 0, 0) } }]]);
    const spells = new OpushkaSpells({
        ...landscape,
        scene: new Scene(),
        player: () => ({ pos: new Vector3() }),
        remotes: () => remotes,
        net: () => network,
        hud() {},
    });
    spells.beamGeo = new CylinderGeometry();
    const cast = (by, name, direction, from, to) => ({
        by, id: by + ':1', name, S: SPELLS[name], age: 0.5,
        dir: new Vector3(direction, 0, 0), previous: new Vector3(from, 1, 0), p: new Vector3(to, 1, 0),
    });
    const a = cast('H', 'AvadaKedavra', 1, 4, 6);
    const b = cast('guest', 'Jolt', -1, 8, 6.2);
    spells.bolts = [a, b];

    network.isHost = false;
    assert.equal(spells._tryClash(a, a.previous, a.p), false);
    network.isHost = true;
    assert.equal(spells._tryClash(a, a.previous, a.p), true);
    assert.ok(a.done && b.done);
    assert.equal(spells.clashes.size, 1);
    assert.equal(messages[0].mode, 'start');

    spells.netClash({ id: messages[0].id, mode: 'end' });
    assert.equal(spells.clashes.size, 0);
    assert.equal(spells.api.scene.children.length, 0);
});
