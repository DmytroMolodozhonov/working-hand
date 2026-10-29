// The Brightflower («Ярколето», PlantLife.BRIGHT, BrightFlower.js, fx/BrightFlowerModel.js): size, the breathing cup, where it grows,
// who it burns, what angers / calms it, what it leaves — and that the old worlds stay as they were.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PLANT_KINDS, BRIGHT, BRIGHT_TARGETS, WET_KINDS, brightOpen, plantGroupIn, plantGroupAt, plantId, FIRE_KINDS } from '../../src/game/PlantLife.js';
import { Plants } from '../../src/game/Plants.js';
import { cupLook, inBreath } from '../../src/game/BrightFlower.js';
import { stemGeometry, petalGeometry, flameGeometry, BF } from '../../src/fx/BrightFlowerModel.js';
import { ITEM_INFO } from '../../src/game/ItemTypes.js';
import { WORLD_GEN, BRIGHTFLOWER_FROM_GEN } from '../../src/world/Terrain.js';
import { APPLE } from '../../src/game/PlantLife.js';
import { BIOMES } from '../../src/world/Landscape.js';

function fakeGame(gen = WORLD_GEN) {
    const dropped = [];
    const g = {
        gen, authority: true, localId: 'me', scene: new THREE.Scene(), seed: 7,
        character: { group: new THREE.Group(), isCrouching: false }, remotes: new Map(), combat: { enabled: false, damage() {} }, hud: { setStatus() {} },
        collision: { boxes: [], addBox(b) { this.boxes.push(b); return this.boxes.length; }, removeBox() {} },
        items: { spawnLoose(it) { dropped.push(it); } }, fx: { spark() {} }, sound: { playPlant() {} }, fire: { ignite() {} },
        burning: { ignite() {}, igniteRay() {} }, castleLife: { byId: new Map(), list: [] }, animals: { list: [] }, zombies: [], world: {}, dropped,
    };
    g.character.group.position.set(100, 2, 100);
    g.damageLocalPlayer = (d) => { g.hurt = (g.hurt || 0) + d; };
    return g;
}
function withFlower(g = fakeGame()) {
    const P = new Plants(g);
    P.enabled = true;
    const grp = P._load('brightflower', 0, 0, [{ i: 0, x: 0, z: 0, y: 0, yaw: 0, h: 0.5, id: 'b0,0.0' }]);
    P.groups.set(grp.key, grp);
    return { g, P, p: grp.plants[0] };
}

test('size: twice a tulip — 2–2.5 m high, a cup ~1.3 m across; the model agrees', () => {
    const [a, b] = PLANT_KINDS.brightflower.height;
    assert.ok(a >= 2 && b <= 2.5);
    const pet = petalGeometry(); pet.computeBoundingBox();
    const w = pet.boundingBox.max.x - pet.boundingBox.min.x;
    assert.ok(w > 1.15 && w < 1.6, `cup ${w.toFixed(2)} m`);
    const stem = stemGeometry(); stem.computeBoundingBox();
    assert.ok(stem.boundingBox.max.y > BF.STEM_H && stem.boundingBox.max.y < BF.STEM_H + 0.4);
    const fl = flameGeometry(); fl.computeBoundingBox();
    assert.ok(fl.boundingBox.max.y > 1 && fl.boundingBox.max.y < 1.8);
});

test('petals carry a hinge, an axis and how far they shut (the video card opens and closes the cup)', () => {
    const g = petalGeometry(), n = g.getAttribute('position').count;
    for (const k of ['aHinge', 'aAxis', 'aClose', 'uv']) assert.equal(g.getAttribute(k).count, n, k);
    let shut = 0; const c = g.getAttribute('aClose');
    for (let i = 0; i < n; i++) if (c.getX(i) > 0.4) shut++;
    assert.ok(shut > n * 0.5, 'most petals turn a long way');
    assert.ok(g.index.count / 3 < 3000, 'a light shape');
});

test('the cup breathes: shut about a third of the time, open the rest; smooth; every flower on its own phase', () => {
    let open = 0, n = 2000, jump = 0, prev = brightOpen(0, 0.2);
    for (let i = 1; i <= n; i++) { const v = brightOpen(i * 0.1, 0.2); if (v > BRIGHT.FIRE_OPEN) open++; jump = Math.max(jump, Math.abs(v - prev)); prev = v; }
    assert.ok(open / n > 0.45 && open / n < 0.7, `open ${open / n}`);
    assert.ok(jump < 0.12, 'no sudden snap');
    assert.notEqual(brightOpen(5, 0.1), brightOpen(5, 0.6));
    let min = 1, max = 0; for (let t = 0; t < 40; t += 0.1) { const v = brightOpen(t, 0); min = Math.min(min, v); max = Math.max(max, v); }
    assert.ok(min === 0 && max === 1);
});

test('groups of 3–10, rare (about 0.3× as often as apple trees), warm biomes only', () => {
    let n = 0, sum = 0, groups = 0, cells = 0;
    for (let gx = -40; gx < 40; gx++) for (let gz = -40; gz < 40; gz++) {
        cells++;
        const d = plantGroupIn('brightflower', gx, gz, 77);
        if (!d) continue;
        groups++; sum += d.members.length;
        assert.ok(d.members.length >= 3 && d.members.length <= 10);
    }
    assert.ok(Math.abs(groups / cells / (APPLE.RATE * 0.3) - 1) < 0.15, `rate ${groups / cells}`);
    assert.ok(sum / groups > 4.5 && sum / groups < 7.5);
    assert.deepEqual(PLANT_KINDS.brightflower.biomes, ['meadow', 'steppe', 'emerald']);
    assert.equal(plantId('brightflower', 3, -4, 2), 'b3,-4.2');
    assert.equal(plantGroupAt('brightflower', 1, 1, 5), plantGroupAt('brightflower', 1, 1, 5));
});

test('only worlds of generation ≥ BRIGHTFLOWER_FROM_GEN have them: an older world grows none, a new one does', () => {
    assert.ok(WORLD_GEN >= BRIGHTFLOWER_FROM_GEN);
    const run = (gen, biome) => {
        const g = fakeGame(gen), P = new Plants(g), grown = [];
        P._load = (kind) => { grown.push(kind); return null; };
        g.terrain = { data: { topLayer: () => 0, get: () => 1, landMade: () => true, biomeAt: () => biome, sites: null } };
        for (let i = 0; i < 60; i++) P._around({ x: i * 150, z: -i * 90 });
        return grown;
    };
    const meadow = BIOMES.findIndex((b) => b.id === 'meadow'), taiga = BIOMES.findIndex((b) => b.id === 'taiga');
    assert.ok(!run(BRIGHTFLOWER_FROM_GEN - 1, meadow).includes('brightflower'), 'no Brightflowers in an older world');
    assert.ok(run(BRIGHTFLOWER_FROM_GEN, meadow).includes('brightflower'), 'a new world grows them in a meadow');
    assert.ok(!run(BRIGHTFLOWER_FROM_GEN, taiga).includes('brightflower'), 'but not in the taiga');
});

test('touching it, a blow, a blast, a bolt make it angry; fire does nothing and angers nothing', () => {
    const { P, p } = withFlower();
    P.hit(p, 5, 'Inferno', 'me'); P.hit(p, 5, 'Fire', 'me'); P.hit(p, 5, 'Hellfire', 'me');
    assert.equal(p.hp, p.maxHp, 'fire does not hurt it');
    assert.equal(p.bf.angryT, 0, 'fire does not anger it');
    P.hit(p, 2, 'melee', 'me');
    assert.ok(p.hp < p.maxHp && p.bf.angryT === BRIGHT.ANGRY_T, 'a blade hurts and angers');
    p.bf.angryT = 0; P.hit(p, 1, 'fist', 'me');
    assert.equal(p.bf.angryT, BRIGHT.ANGRY_T);
    p.bf.angryT = 0; P.hit(p, 3, 'Bombardo', null);
    assert.ok(p.dead || p.bf.angryT > 0, 'a blast hurts it');
});

test('cold and water put it to sleep (no damage): closed, no flame, no anger; then it wakes', () => {
    const { P, p } = withFlower();
    P.hit(p, 2, 'melee', 'me');
    for (const k of ['Frozen', 'Ice', 'Water', 'cold']) { p.bf.sleepT = 0; p.bf.angryT = 5; const hp = p.hp; P.hit(p, 5, k, 'me'); assert.equal(p.hp, hp, k); assert.equal(p.bf.sleepT, BRIGHT.SLEEP_T, k); assert.equal(p.bf.angryT, 0, k); }
    assert.ok(WET_KINDS.has('Frozen') && WET_KINDS.has('Water'));
    P.hit(p, 2, 'melee', 'me');
    assert.equal(p.bf.angryT, 0, 'asleep: it is not angered');
    // update: the cup shuts
    for (let i = 0; i < 60; i++) P.bright.update(1 / 30, new THREE.Vector3(5, 2, 5));
    assert.ok(p.bf.open < 0.05 && p.bf.flame === 0);
    p.bf.sleepT = 0.1;
    for (let i = 0; i < 10; i++) P.bright.update(1 / 30, new THREE.Vector3(5, 2, 5));
    assert.equal(p.bf.sleepT <= 0, true);
});

test('angry: opens wide, turns on the offender, breathes a cone that burns the player in it (1.5 HP a second + burning), never one behind it', () => {
    const { g, P, p } = withFlower();
    g.character.group.position.set(7, 3.6, 0); // (~3.5 m hero: eyes at 3.6 → feet 1.6… the chest at 2.6)
    let burned = 0; g.burning.ignite = (k, id) => { if (k === 'p' && id === 'me') burned++; };
    P.hit(p, 2, 'melee', 'me');
    for (let i = 0; i < 120; i++) P.bright.update(1 / 30, g.character.group.position);
    assert.ok(p.bf.open > 0.95 && p.bf.flame > 1, 'open wide, the flame leaps');
    assert.ok(p.bf.dir.x > 0.7, `turned towards me: ${p.bf.dir.x.toFixed(2)}`);
    assert.ok(g.hurt > 0 && burned > 0, 'I am burned');
    assert.ok(g.hurt < BRIGHT.ANGRY_T * 2.2, 'about 1.5 HP a second at most');
    // behind it — nothing
    const g2 = fakeGame(); const b = withFlower(g2);
    g2.character.group.position.set(7, 3.6, 0);
    b.P.hit(b.p, 2, 'melee', 'me');
    g2.character.group.position.set(-40, 3.6, 0); // (far: out of its sight)
    for (let i = 0; i < 60; i++) b.P.bright.update(1 / 30, g2.character.group.position);
    assert.ok(!g2.hurt, 'out of reach: no burn');
});

test('the cone: 11.5 m long, a hand wide at the mouth, widening a little; a thing behind or to the side is not in it', () => {
    const top = { x: 0, y: 2, z: 0 }, dir = { x: 1, y: 0, z: 0 };
    assert.ok(inBreath(top, dir, { x: 6, y: 2, z: 0.5 }));
    assert.ok(inBreath(top, dir, { x: 11, y: 2.5, z: 1 }));
    assert.ok(!inBreath(top, dir, { x: 14, y: 2, z: 0 }), 'beyond its reach');
    assert.ok(!inBreath(top, dir, { x: -3, y: 2, z: 0 }), 'behind');
    assert.ok(!inBreath(top, dir, { x: 5, y: 2, z: 5 }), 'to the side');
    const look = cupLook({ x: 0, y: 2, z: 0 }, { x: 6, y: 0, z: 0 });
    assert.ok(look.reach && look.x > 0.9 && look.y > -0.2, 'the cup cannot look far under its horizon');
    assert.ok(!cupLook({ x: 0, y: 2, z: 0 }, { x: 40, y: 0, z: 0 }).reach);
    assert.deepEqual([cupLook({ x: 0, y: 0, z: 0 }, null).y], [1]);
});

test('killed: it leaves its heart (a «Сердцевина Ярколета»), once; a blast of gods kills it', () => {
    const { g, P, p } = withFlower();
    assert.equal(PLANT_KINDS.brightflower.drop, 'brightCore');
    assert.ok(ITEM_INFO.brightCore && ITEM_INFO.brightCore.stack === 10);
    P.hit(p, 1, 'Inspirius', 'me');
    assert.ok(p.dead);
    assert.equal(g.dropped.filter((d) => d.kind === 'brightCore').length, 1);
    P.hit(p, 99, 'melee', 'me');
    assert.equal(g.dropped.length, 1, 'once');
    assert.ok(!P.byId.has('b0,0.0') || p.dead);
});

test('creatures that touch the stem anger it (the host); walkers go round it', async () => {
    const { g, P, p } = withFlower();
    const crowd = await import('../../src/game/CrowdSources.js');
    assert.ok(typeof crowd.crowdNear === 'function');
    P.bright.anger(p, null, { x: 0.4, y: 1, z: 0 });
    assert.equal(p.bf.angryT, BRIGHT.ANGRY_T);
    assert.ok(p.bf.foe, 'it remembers where the creature touched it');
});

test('«кто/что»: the table names every kind of target and the fire / cold / gods rows', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'dragons', 'iceCastle', 'canaries', 'items', 'fire', 'cold', 'gods']) assert.ok(BRIGHT_TARGETS[k]?.why, k);
    assert.equal(BRIGHT_TARGETS.fire.does, 'immune');
    assert.ok(FIRE_KINDS.has('Inferno'));
});
