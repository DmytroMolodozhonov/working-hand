/**
 * «Выстрел без цели»: любое дуэльное заклинание можно послать, когда на линии руки никого нет —
 * заряд создан, летит туда, куда указывает рука, и гаснет у первой преграды или раньше конца дальности (DuelRange.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Duel, DUEL_SPELLS } from '../../src/game/Duel.js';
import { DUEL_RANGE } from '../../src/game/DuelRange.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// my shoulder; the arm (+ wand) reaches 2 m forward along −Z (a big hero: a man is ~4 m tall)
const SHOULDER = V(0, 3, 0), TIP = V(0, 3, -2), DIR = V(0, 0, -1);

/** A knight `dist` m before my shoulder (hip 1.95 above his feet), a wall from z0 to z1 (or none). */
function world({ dist = null, wall = null, knightZ = null } = {}) {
    const kz = knightZ ?? (dist !== null ? -dist : null);
    const knights = kz === null ? [] : [{ id: 'k1', isVillager: true, x: 0, y: 0, z: kz, yaw: 0, group: { position: V(0, 1.95, kz) } }];
    const byId = new Map(knights.map((k) => [k.id, k]));
    const anchor = new THREE.Object3D();
    anchor.position.copy(SHOULDER);
    const meGroup = new THREE.Group();
    meGroup.position.set(0, 1.95, 1.2); // (behind the shoulder: my own body is never hit)
    const g = {
        localId: 'me', authority: true, scene: new THREE.Scene(), remotes: new Map(), zombies: [], zombieById: new Map(),
        animals: null, books: null, spiders: null, sync: null, sound: null,
        castleLife: { byId, targets: () => knights, wardOff: () => false },
        terrain: wall ? { data: { isSolidAt: (x, y, z) => z <= wall[0] && z >= wall[1] } } : null,
        fx: { spark() {}, lightFlash() {} }, hud: { setVoice() {}, flashColor() {} },
        castOrigin: (side, out = new THREE.Vector3()) => out.copy(TIP),
        character: {
            group: meGroup, rightArmAnchor: anchor, leftArmAnchor: anchor,
            isArmRaised: () => true,
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.copy(TIP),
            getHandDirection: (side, out = new THREE.Vector3()) => out.copy(DIR),
            getPointingDirection: (side, out = new THREE.Vector3()) => out.copy(DIR),
        },
        combat: { dead: false, enabled: false, center: (out) => out.copy(meGroup.position), shieldFactor: () => 0 },
        levitation: { liftMe() {} },
        creatureImpact: { spellHit() {} },
    };
    const d = new Duel(g);
    d._drawBolt = () => {};
    d._burst = () => {};
    const hits = [];
    d.applyToCreature = (spell, c) => hits.push([spell, c.id]);
    return { g, d, hits };
}

const run = (d, secs = 2, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) d.update(dt); };

for (const spell of Object.keys(DUEL_SPELLS)) {
    test(`«${spell}» без цели: заряд создан и гаснет в конце дальности (не летит в пустоту до 200 м)`, () => {
        const { d } = world({});
        d.game.strong = { terror() {} };
        const b = d.cast(spell, null, 'right', 200);
        assert.ok(b, 'заряд создан');
        assert.ok(b.rng <= DUEL_RANGE.EMPTY, `пустая линия: потолок ${b.rng}`);
        let far = 0;
        for (let t = 0; t < 8; t += 1 / 30) { d.update(1 / 30); far = Math.max(far, b.traveled || 0); }
        assert.equal(d.bolts.has(b.id), false, 'погас');
        assert.ok(far <= b.rng + 3, `долетел ${far} при потолке ${b.rng}`);
    });
    test(`«${spell}» без цели у стены: гаснет на стене`, () => {
        const { d } = world({ wall: [-12, -14] });
        d.game.strong = { terror() {} };
        const b = d.cast(spell, null, 'right', 200);
        let far = 0;
        for (let t = 0; t < 8; t += 1 / 30) { d.update(1 / 30); far = Math.max(far, b.traveled || 0); }
        assert.equal(d.bolts.has(b.id), false);
        assert.ok(far < 14, `дальше стены: ${far}`);
    });
}

test('короткая мана — короткий выстрел: 5 маны → 5 м', () => {
    const { d } = world({});
    const b = d.cast('Stupefy', null, 'right', 5);
    assert.equal(b.rng, 5);
});
