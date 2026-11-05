// The fire serpent's ways of attacking (the author 05.11: «укус 20 и поджог… поднять и бросить… поднять и проглотить — пройдёт по
// кишечнику и упадёт, всё время горит… пройти сквозь существо — огонь вдвойне. Несколько видов атак»): on a castle person (host) and on
// me (my own computer holds my body while I am in its jaws / inside it).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FireSerpent } from '../../src/game/FireSerpent.js';
import { SERPENT } from '../../src/game/FireSerpentRules.js';

function world() {
    const me = new THREE.Vector3(0, 2, 0);
    const v = { id: 'v1', x: 40, y: 0, z: 0, model: { group: { position: new THREE.Vector3(40, 1.95, 0) } } };
    const ignites = [], applies = [], dmg = [];
    const game = {
        scene: new THREE.Scene(), localId: 'me', authority: true, collision: { groundY: () => 0 },
        character: { group: { position: me }, verticalVelocity: 0 },
        combat: { enabled: true, fatigue: 900, check: () => null, pay() {}, damage: (d) => dmg.push(d) },
        hellfire: { state: { c: new THREE.Vector3(10, 0.5, 10), d: new THREE.Vector3(1, 0, 0), k: 0 }, _burn: () => false, _wet: () => 0, _worked() {} },
        burning: { ignite: (...a) => { ignites.push(a); return true; } },
        creatureImpact: { apply: (c, o) => applies.push(o) },
        servants: { damage: (ref, d) => dmg.push(d) },
        knockback: new THREE.Vector3(),
        duel: {
            _creature: (k, id) => (k === 'v' && id === 'v1' ? v : null),
            _bodyOf: (k, id, e) => { if (k !== 'v') return null; e.a.set(v.x, v.y + 0.5, v.z); e.b.set(v.x, v.y + 3, v.z); e.r = 0.6; return e; },
        },
        remotes: new Map(),
    };
    const fs = new FireSerpent(game);
    return { game, fs, v, me, ignites, applies, dmg };
}

const out = (fs, n) => { for (let i = 0; i < n; i++) fs.update(1 / 30); };

for (const att of ['toss', 'swallow', 'through', 'bite']) {
    test(`a castle person struck by «${att}»`, () => {
        const { fs, v, ignites, applies, dmg } = world();
        fs.cast(true);
        out(fs, 300); // (out of the fire, crawling)
        const s = fs.mine;
        fs._pickAttack = () => att;
        s.target = { k: 'v', id: 'v1' }; s.mode = 'strike'; s.modeT = 0; s.lunge = 0;
        let top = 0, inBody = false, struck = false;
        for (let i = 0; i < 30 * 25 && !(struck && !s.held && !s.thru); i++) {
            fs.update(1 / 30);
            if (fs.log.some((e) => e.ev === 'bite')) struck = true;
            top = Math.max(top, v.y);
            if (s.held?.att === 'swallow' && s.held.t > SERPENT.LIFT_S + 1) inBody = s.p.slice(N0(s), N0(s) + 40).some((p) => p.distanceTo(new THREE.Vector3(v.x, v.y + 1.6, v.z)) < 0.5);
        }
        assert.ok(struck, 'it struck');
        assert.ok(dmg.length >= 1, 'it hurt');
        assert.ok(ignites.length >= 1, 'set on fire');
        if (att === 'toss') {
            assert.ok(top > 10, `lifted high in its jaws: ${top.toFixed(1)} m`);
            assert.ok(applies.some((o) => Math.hypot(o.v.x, o.v.z) > 10), 'thrown far aside');
        }
        if (att === 'swallow') {
            assert.ok(inBody, 'slid down inside the body');
            assert.ok(ignites.some((a) => a[5] === true), 'burning twice as hard inside the fire');
            assert.ok(applies.length >= 1 && v.carriedBy == null, 'fell out of it at the end');
        }
        if (att === 'through') assert.ok(ignites.some((a) => a[5] === true), 'the fire twice as hard');
        if (att === 'bite') assert.equal(dmg[0], SERPENT.BITE, 'a bite: 20');
    });
}
function N0(s) { return Math.max(0, s.p.length - 3 - SERPENT.GUT_RINGS - 2); }

test('me swallowed by another\'s serpent: held inside its fire, burning, then out of its side', () => {
    const { game, fs, me, ignites } = world();
    fs.onNet({ by: 'p2', s: [0, 0, 0, 30, 8, 0, 300, 0, 100, 0, 20, 0] });
    for (let i = 0; i < 30; i++) { fs.onNet({ by: 'p2', s: [0, 0, 0, 30, 8, 0, 300, 0, 100, 0, 20, 0] }); fs.update(1 / 30); }
    fs.onBite('p2', 'swallow');
    assert.ok(fs.holding, 'held');
    let maxY = 0;
    for (let i = 0; i < 30 * 6 && fs.holding; i++) { fs.onNet({ by: 'p2', s: [0, 0, 0, 30, 8, 0, 300, 0, 100, 0, 20, 0] }); fs.update(1 / 30); maxY = Math.max(maxY, me.y); }
    assert.ok(!fs.holding, 'let go at last');
    assert.ok(maxY > 4, 'lifted up');
    assert.ok(ignites.length >= 2, 'burning: bitten and when it fell out');
    void game;
});
