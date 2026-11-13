// Fishing (Fishing.js, FishingRules.js, FishingRodModel.js): the rules by the hand — a cast is a real swing, a strike a real jerk, the fight a real pumping.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FISHING, castVelocity, isStrike, pickSpecies, FRESH_ARCH, fishLength, fishWeight, makeFishItem, fightStep, newFight, rodBend, fishValue, FISHING_TARGETS } from '../../src/game/FishingRules.js';
import { FISH_SPECIES, FISH_ITEM_SHADER_OK, fishItemCache } from '../../src/fx/ReefFish.js';
import { fishingRodModel, fishItemModel, BLANKS, blankOf } from '../../src/game/FishingRodModel.js';
import { ITEM_INFO, makeItemModel, foodHeal, LOOT_EXTRA, rollPortLoot } from '../../src/game/ItemTypes.js';
import { Fishing } from '../../src/game/Fishing.js';

const rnd = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

test('a cast: a hard swing forward throws far, a slow wave or a backswing throws nothing', () => {
    const face = { x: 0, z: -1 };
    assert.equal(castVelocity({ x: 0, y: 0, z: -1 }, face), null, 'slow');
    assert.equal(castVelocity({ x: 0, y: 1, z: 6 }, face), null, 'backwards');
    assert.equal(castVelocity({ x: 6, y: 0, z: 0 }, face), null, 'sideways');
    const weak = castVelocity({ x: 0, y: 1, z: -4.4 }, face), hard = castVelocity({ x: 0, y: 3, z: -14 }, face);
    assert.ok(weak && hard && hard.speed > weak.speed * 1.5, 'harder swing — faster float');
    assert.ok(hard.z < 0 && hard.y > 0, 'forward and up');
    assert.ok(castVelocity({ x: 0, y: -9, z: -9 }, face).y > 0, 'never thrown into the ground');
    assert.ok(hard.speed <= FISHING.CAST_MAX + 1e-9);
});

test('a strike: the rod jerked up or back (not down, not a twitch)', () => {
    const back = { x: 0, z: 1 };
    assert.ok(isStrike({ x: 0, y: 3.2, z: 0 }, back));
    assert.ok(isStrike({ x: 0, y: 0, z: 4 }, back));
    assert.ok(!isStrike({ x: 0, y: 1, z: 1 }, back));
    assert.ok(!isStrike({ x: 0, y: -4, z: -4 }, back));
});

test('which fish bites: the sea by depth, a lake — only the mullets, never a kind that lives deeper than the water', () => {
    assert.equal(FISH_SPECIES.filter((s) => s.arch === FRESH_ARCH).length, 5);
    assert.equal(FISH_SPECIES[FRESH_ARCH * 5].name, 'кефаль');
    const r = rnd(7);
    for (let i = 0; i < 300; i++) assert.equal(pickSpecies(FISH_SPECIES, { depth: 4, sea: false }, r).arch, FRESH_ARCH, 'a lake');
    const seen = new Set();
    for (let i = 0; i < 4000; i++) { const s = pickSpecies(FISH_SPECIES, { depth: 3, sea: true }, r); seen.add(s.id); assert.ok(s.depth[0] - 1 <= 3, `${s.name} lives at ${s.depth[0]}+ m`); }
    assert.ok(seen.size > 30, 'a wide variety at 3 m: ' + seen.size);
    const deep = new Set();
    for (let i = 0; i < 4000; i++) deep.add(pickSpecies(FISH_SPECIES, { depth: 25, sea: true }, r).id);
    assert.ok(deep.size > 60, 'the deep sea has more: ' + deep.size);
    let magic = 0; for (let i = 0; i < 4000; i++) if (pickSpecies(FISH_SPECIES, { depth: 15, sea: true }, r).magic) magic++;
    assert.ok(magic > 0 && magic < 400, 'the magic ones are rare: ' + magic);
});

test('a catch is a real thing: size, weight, value, a food that feeds', () => {
    const sp = FISH_SPECIES[0], len = fishLength(sp, () => 0.5), it = makeFishItem(sp, len, 'u1');
    assert.equal(it.kind, 'fish'); assert.equal(it.species, 0); assert.ok(it.weight > 0 && fishValue(it) >= 1);
    assert.ok(fishWeight(1) > fishWeight(0.5) * 4, 'weight grows with size');
    assert.equal(foodHeal(it), 5); assert.equal(foodHeal({ ...it, cooked: true }), 10);
    assert.ok(ITEM_INFO.fish && ITEM_INFO.fishingRod);
});

// ---- the fight, as a hand does it
function fight(pump, { strength = 3, dt = 1 / 60, secs = 90, catchAt = 5 } = {}) {
    const f = newFight(12, strength, 1, 1.3);
    for (let t = 0; t < secs; t += dt) {
        const r = fightStep(f, dt, pump(t, f), undefined, catchAt);
        if (r) return { r, t, f };
    }
    return { r: null, t: secs, f };
}
test('the fight: pumping the rod up and down lands the fish', () => {
    // lift for ~0.5 s (the line comes in), lower for ~0.5 s (the slack is wound up)
    const pump = (t) => (Math.floor(t * 1) % 2 === 0 ? 2.0 : -2.0);
    for (const strength of [1.5, 3, 5]) { const o = fight(pump, { strength }); assert.equal(o.r, 'caught', `strength ${strength}: ${o.r} at ${o.t.toFixed(1)} s`); assert.ok(o.t < 60); }
});
test('the fight: yanking hard snaps the line, holding it slack lets the fish go', () => {
    assert.equal(fight(() => 6, { strength: 3 }).r, 'snapped');
    const idle = fight(() => 0, { strength: 3 });
    assert.ok(['slack', 'escaped'].includes(idle.r), idle.r);
});
test('the fight: a big strong fish takes longer than a small one', () => {
    const pump = (t) => (Math.floor(t) % 2 === 0 ? 2.0 : -2.0);
    const small = fight(pump, { strength: 1.5 }), big = fight(pump, { strength: 5 });
    assert.equal(small.r, 'caught'); assert.equal(big.r, 'caught');
    assert.ok(big.t >= small.t, `${big.t} vs ${small.t}`);
});
test('the rod bends with the tension, no more than 1', () => { assert.equal(rodBend(0), 0); assert.ok(rodBend(0.5) > 0 && rodBend(0.5) < 1); assert.equal(rodBend(5), 1); });

// ---- the rod and the fish as models
test('the rod: a many-part model of 4 bending pieces, a tip at the top guide, three blank colours by uid, bends towards a direction', () => {
    const m = fishingRodModel({ uid: 'r1' });
    let n = 0; m.traverse(() => n++);
    assert.ok(n >= 45, 'many details: ' + n);
    m.updateMatrixWorld(true);
    const tip = new THREE.Vector3(); m.userData.tip.getWorldPosition(tip);
    assert.ok(Math.abs(tip.y - FISHING.TIP_Y) < 0.03 && Math.abs(tip.x) < 0.01);
    m.userData.bend(1, 0, 1); m.updateMatrixWorld(true);
    const bent = new THREE.Vector3(); m.userData.tip.getWorldPosition(bent);
    assert.ok(bent.x > 0.2 && bent.y < tip.y, `bent towards +x: ${bent.x.toFixed(2)}`);
    m.userData.bend(0, 0, 0); m.updateMatrixWorld(true);
    m.userData.tip.getWorldPosition(bent);
    assert.ok(bent.distanceTo(tip) < 1e-6, 'straight again');
    assert.equal(m.userData.segs.length, 4);
    const names = new Set(Array.from({ length: 60 }, (_, i) => blankOf({ uid: 'x' + i }).name));
    assert.equal(names.size, BLANKS.length);
    assert.equal(blankOf({ uid: 'x1' }), blankOf({ uid: 'x1' }), 'the same rod is always the same');
});
test('the fish: every one of the hundred is a model; the shader goes through the item\'s own matrix; the geometries are bounded', () => {
    assert.ok(FISH_ITEM_SHADER_OK);
    for (const sp of FISH_SPECIES) { const m = fishItemModel({ species: sp.id, len: sp.len }); assert.ok(m.children.length); }
    for (const sp of FISH_SPECIES) fishItemModel({ species: sp.id, len: 0.3, cooked: true });
    assert.ok(fishItemCache() <= 200, 'at most 200 geometries: ' + fishItemCache());
    const a = fishItemModel({ species: 3, len: 0.2 }), b = fishItemModel({ species: 3, len: 0.5 });
    assert.equal(a.children[0].children[0].geometry, b.children[0].children[0].geometry, 'one geometry per kind');
    const box = new THREE.Box3().setFromObject(makeItemModel({ kind: 'fish', species: 9, len: 0.4 }));
    assert.ok(box.max.y - box.min.y > 0.5 && box.max.y - box.min.y < 1.6, 'a fish of 40 cm is the hero\'s ~1 m thing: ' + (box.max.y - box.min.y));
});
test('the rod in the hand: ~4.4 m — two bodies of the hero, not more', () => {
    const box = new THREE.Box3().setFromObject(makeItemModel({ kind: 'fishingRod', uid: 'a' }));
    const L = box.max.y - box.min.y;
    assert.ok(L > 4 && L < 5, 'length ' + L);
});
test('port chests and ships can hold a rod now (the old placeholder is filled)', () => {
    assert.equal(typeof LOOT_EXTRA.fishingRod, 'function');
    assert.equal(LOOT_EXTRA.fishingRod(Math.random).kind, 'fishingRod');
    let got = 0; const r = rnd(5);
    for (let i = 0; i < 200; i++) if (rollPortLoot(r).some((x) => x.kind === 'fishingRod')) got++;
    assert.ok(got > 20, 'a rod in ' + got + ' of 200 port chests');
});

// ---- the whole chain with a made-up world: cast → float on the water → bite → strike → fight → landed
function world() {
    const scene = new THREE.Scene();
    const rod = fishingRodModel({ uid: 'q' }); rod.scale.setScalar(2.1); scene.add(rod);
    const heroPos = new THREE.Vector3(0, 0, 0);
    const spawned = [], voice = [];
    const g = {
        scene, isDeadLocal: false, combat: { dead: false },
        character: { group: { position: heroPos, rotation: { y: 0 } } },
        items: { heldOf: (k) => (k === 'fishingRod' ? { side: 'right', model: rod, item: { kind: 'fishingRod' } } : null), spawnLoose: (it, pos, o) => { spawned.push({ it, pos, o }); return {}; } },
        hud: { setVoice: (t) => voice.push(t) },
        sound: { playSplashAt() {}, playHit() {} }, fx: { spark() {} },
        collision: { groundY: () => 0, groundAt: () => 0 },
        world: { terrain: { data: { get: () => 0, floorBelow: () => 0, landMade: () => true } } },
        sea: null,
    };
    return { g, rod, heroPos, spawned, voice };
}
test('a cast with the real Fishing: a swing forward flings the float far; a walk throws nothing', () => {
    const { g, rod, heroPos } = world();
    const F = new Fishing(g);
    const dt = 1 / 60;
    // standing: the rod still — nothing
    for (let i = 0; i < 30; i++) F.update(dt);
    assert.equal(F.state, 'rig');
    // walking: the hero and the rod move together at 6 m/s — not a cast
    for (let i = 0; i < 60; i++) { heroPos.z -= 6 * dt; rod.position.z -= 6 * dt; F.update(dt); }
    assert.equal(F.state, 'rig', 'a walk is no cast');
    // a swing: the rod's butt moves forward fast, then stops
    const z0 = rod.position.z;
    for (let i = 0; i < 12; i++) { rod.position.z -= 0.9 * (i + 1) * dt * 1.2; F.update(dt); }
    for (let i = 0; i < 10; i++) F.update(dt);
    assert.ok(['cast', 'ground'].includes(F.state) || F.log.includes('cast'), 'the swing threw the float: ' + F.log.join(','));
    assert.ok(F.b.z < z0 - 3, 'the float went forward: ' + (F.b.z - z0).toFixed(1));
});
test('a rod put away winds the float in at once (nothing is left half done)', () => {
    const { g } = world();
    const F = new Fishing(g);
    for (let i = 0; i < 5; i++) F.update(1 / 60);
    F.state = 'float'; F.fish = { sp: FISH_SPECIES[0], len: 0.2 }; F.fight = newFight(10, 2);
    g.items.heldOf = () => null;
    F.update(1 / 60);
    assert.equal(F.state, 'rig'); assert.equal(F.fight, null); assert.equal(F.fish, null);
});
test('the targets table names every case', () => {
    for (const k of ['water', 'land', 'players', 'creatures', 'ships', 'cast', 'bite', 'fight', 'drop', 'network']) assert.ok(FISHING_TARGETS[k]?.why, k);
});

test('a sharp stop below the casting threshold still releases the saved forward swing',()=>{
 for(const side of ['left','right'])for(const fps of [20,30,60,120]){
  const {g,rod}=world(),F=new Fishing(g),dt=1/fps;
  g.items.heldOf=()=>({side,model:rod,item:{kind:'fishingRod'}});
  F.update(dt);F.tipV.set(0,1,-6);F._rig(dt,new THREE.Vector3(0,0,-1));
  assert.equal(F.state,'rig');F.tipV.set(0,0,0);F._rig(dt,new THREE.Vector3(0,0,-1));
  assert.equal(F.state,'cast',`${side}, ${fps} FPS: stop must release tackle`);
 }
});

test('no free line before casting; retrieves hide tackle and tracking loss cannot trigger a cast',()=>{
 const {g,rod}=world(),F=new Fishing(g),dt=1/60;
 F.update(dt);assert.equal(F.line.visible,false);assert.equal(F.floatM.visible,false);
 F.tipV.set(0,0,-6);F._rig(dt,new THREE.Vector3(0,0,-1));
 g.character.isHandTracked=()=>false;F.update(dt);assert.equal(F.state,'rig');
 assert.equal(F.swing.peak,0);
 g.character.isHandTracked=()=>true;
 F.tipV.set(0,0,-6);F._rig(dt,new THREE.Vector3(0,0,-1));F.tipV.set(0,0,0);F._rig(dt,new THREE.Vector3(0,0,-1));
 F._draw({model:rod},dt);assert.equal(F.line.visible,true);assert.equal(F.floatM.visible,true);
 F.reset();F.update(dt);assert.equal(F.line.visible,false);assert.equal(F.floatM.visible,false);
});

test('backswing, sideways motion, expired swing and swimming do not release the tackle',()=>{
 for(const velocity of [[0,0,8],[8,0,0]]){
  const {g}=world(),F=new Fishing(g);F.update(1/60);
  F.tipV.set(...velocity);F._rig(.02,new THREE.Vector3(0,0,-1));F.tipV.set(0,0,0);F._rig(.02,new THREE.Vector3(0,0,-1));assert.equal(F.state,'rig');
 }
 for(const swimming of [false,true]){
  const {g}=world(),F=new Fishing(g);F.update(1/60);
  F.tipV.set(0,0,-7);F._rig(.02,new THREE.Vector3(0,0,-1));
  g.swim={swimming};F.tipV.set(0,0,0);F._rig(.7,new THREE.Vector3(0,0,-1));assert.equal(F.state,'rig');
 }
});
