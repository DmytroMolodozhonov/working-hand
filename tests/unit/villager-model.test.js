import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ROLES, TOOLS, VillagerModel, villagerLook, prewarmVillagers, VILLAGER_MATERIALS, ATTACK_PERIOD } from '../../src/entities/VillagerModel.js';
import { SpeechBubble, wrapText } from '../../src/ui/SpeechBubble.js';

const meshes = (g) => { const out = []; g.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
const run = (v, seconds, state, dt = 1 / 60) => { for (let i = 0; i < Math.round(seconds / dt); i++) v.update(dt, state); };
const boxOf = (obj) => { obj.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(obj); };

for (const role of ROLES) {
    test(`${role}: builds for many seeds within 16 meshes`, () => {
        for (const female of [false, true, undefined]) {
            for (let seed = 0; seed < 40; seed++) {
                const v = new VillagerModel(villagerLook(seed, role, female), { castleColor: 0x8e2b2b });
                const n = meshes(v.group).length;
                assert.ok(n <= 16, `${role} seed ${seed}: ${n} meshes`);
                assert.equal(n, v.meshCount);
                assert.ok(v.handSlot.parent === v.rightArm);
                for (const m of meshes(v.group)) assert.ok(m.material.isMeshLambertMaterial);
            }
        }
    });

    test(`${role}: feet at −1.95, head top at 2.7…3.4`, () => {
        for (let seed = 0; seed < 12; seed++) {
            const v = new VillagerModel(villagerLook(seed, role), { tool: 'none' });
            v.update(1 / 60, { mode: 'idle' });
            const legs = boxOf(v.leftLeg).union(boxOf(v.rightLeg));
            assert.ok(Math.abs(legs.min.y + 1.95) < 0.02, `feet ${legs.min.y}`);
            const all = boxOf(v.group);
            assert.ok(all.max.y >= 2.68 && all.max.y <= (role === 'king' ? 3.4 : 3.3), `top ${all.max.y}`);
            assert.ok(Math.abs(all.min.y + 1.95) < 0.02, `bottom ${all.min.y}`);
        }
    });
}

test('materials and geometries are shared between villagers', () => {
    const a = new VillagerModel(villagerLook(7, 'knight'));
    const b = new VillagerModel(villagerLook(7, 'knight'));
    const c = new VillagerModel(villagerLook(8, 'knight'));
    const ma = meshes(a.group), mb = meshes(b.group);
    assert.equal(ma.length, mb.length);
    for (let i = 0; i < ma.length; i++) {
        assert.equal(ma[i].material, mb[i].material);
        assert.equal(ma[i].geometry, mb[i].geometry);
    }
    // all villagers (any look) use the same single material
    for (const m of meshes(c.group)) assert.equal(m.material, VILLAGER_MATERIALS.normal);
    // the same tool has the same geometry
    assert.equal(a.tool.geometry, c.tool.geometry);
});

test('looks are deterministic for a seed', () => {
    for (const role of ROLES) {
        assert.deepEqual(villagerLook(42, role), villagerLook(42, role));
        assert.deepEqual(villagerLook(42, role, true), villagerLook(42, role, true));
    }
    const differ = new Set();
    for (let s = 0; s < 20; s++) differ.add(JSON.stringify(villagerLook(s, 'farmer')));
    assert.ok(differ.size > 15, 'seeds give different looks');
    assert.equal(villagerLook(3, 'king').hat, 'crown');
    assert.equal(villagerLook(3, 'king').tool, 'bigsword');
    assert.equal(villagerLook(3, 'builder').tool, 'hammer');
    assert.equal(villagerLook(3, 'knight').tool, 'sword');
    assert.ok(villagerLook(3, 'king').female === false);
});

test('walking moves the legs, standing still does not', () => {
    const v = new VillagerModel(villagerLook(1, 'farmer'));
    run(v, 0.5, { mode: 'idle', speed: 0 });
    assert.ok(Math.abs(v.leftLeg.rotation.x) < 0.01);
    const seen = new Set();
    for (let i = 0; i < 60; i++) { v.update(1 / 60, { mode: 'walk', speed: 1.6 }); seen.add(v.leftLeg.rotation.x.toFixed(2)); }
    assert.ok(seen.size > 10, 'leg angle changes over time');
    let maxL = 0;
    for (let i = 0; i < 60; i++) { v.update(1 / 60, { mode: 'run', speed: 6 }); maxL = Math.max(maxL, Math.abs(v.leftLeg.rotation.x)); }
    assert.ok(maxL > 0.5, `running swings more ${maxL}`);
    // a foot stays on the ground
    const legs = boxOf(v.leftLeg).union(boxOf(v.rightLeg));
    assert.ok(Math.abs(legs.min.y + 1.95) < 0.1, `grounded ${legs.min.y}`);
});

test('dead: falls on its back in ~0.6 s and stays', () => {
    const v = new VillagerModel(villagerLook(2, 'knight'));
    run(v, 0.2, { mode: 'walk' });
    v.update(1 / 60, { mode: 'dead' });
    run(v, 0.7, { mode: 'dead' });
    assert.ok(Math.abs(v.root.rotation.x - Math.PI / 2) < 1e-6, `lying ${v.root.rotation.x}`);
    assert.ok(v.isDeadDone);
    const head = v.getHeadWorldPosition();
    assert.ok(head.y < -0.8 && head.z > 2, `head on the ground behind ${head.toArray()}`);
    run(v, 2, { mode: 'dead' });
    assert.ok(Math.abs(v.root.rotation.x - Math.PI / 2) < 1e-6);
    assert.ok(v.getHeadWorldPosition().distanceTo(head) < 1e-6, 'does not move any more');
    // revived
    v.update(1 / 60, { mode: 'idle' });
    assert.equal(v.root.rotation.x, 0);
});

test('attack: strikeNow exactly once per swing', () => {
    const v = new VillagerModel(villagerLook(5, 'knight'), { shield: true });
    for (const dt of [1 / 60, 1 / 30, 1 / 144]) {
        v.update(dt, { mode: 'idle' });
        let strikes = 0, phases = new Set();
        const cycles = 5;
        const n = Math.round(cycles * ATTACK_PERIOD / dt);
        for (let i = 0; i < n; i++) {
            v.update(dt, { mode: 'attack' });
            if (v.strikeNow) { strikes++; assert.ok(Math.abs(v.attackPhase - 0.5) < 0.1 + dt / ATTACK_PERIOD, `phase ${v.attackPhase}`); }
            phases.add(Math.floor(v.attackPhase * 10));
        }
        assert.equal(strikes, cycles, `dt ${dt}`);
        assert.ok(phases.size >= 8, 'phase runs 0..1');
    }
    v.update(1 / 60, { mode: 'idle' });
    assert.equal(v.strikeNow, false);
});

test('all modes and tools animate without errors; flash restores the material', () => {
    const v = new VillagerModel(villagerLook(9, 'king'));
    for (const mode of ['idle', 'walk', 'run', 'sit', 'bow', 'talk', 'work', 'attack', 'block', 'flee', 'cheer']) {
        run(v, 0.5, { mode, speed: mode === 'run' ? 5 : undefined });
        for (const o of [v.body, v.head, v.leftArm, v.rightArm, v.leftLeg, v.rightLeg]) assert.ok(Number.isFinite(o.rotation.x) && Number.isFinite(o.rotation.z), mode);
    }
    for (const t of TOOLS) { v.setHeldTool(t); assert.equal(v.toolKind, t); assert.equal(!!v.tool, t !== 'none'); }
    assert.ok(meshes(v.group).length <= 16);
    v.flashHit();
    assert.ok(meshes(v.group).every((m) => m.material === VILLAGER_MATERIALS.hit));
    run(v, 0.3, { mode: 'idle' });
    assert.ok(meshes(v.group).every((m) => m.material === VILLAGER_MATERIALS.normal));
    v.setHeldTool('sword');
    v.lookAt(new THREE.Vector3(10, 0, 0));
    run(v, 1, { mode: 'idle' });
    assert.ok(v.head.rotation.y < -1.0 && v.head.rotation.y >= -1.23, `head turned right ${v.head.rotation.y}`);
    const hand = v.getRightHandWorldPosition();
    assert.ok(hand.x > 0.4, `right hand on the right ${hand.x}`);
    const scene = new THREE.Scene();
    scene.add(v.group);
    v.dispose();
    assert.equal(v.group.parent, null);
});

test('prewarm samples use private geometry', () => {
    const groups = prewarmVillagers();
    assert.ok(groups.length >= ROLES.length);
    const ref = new VillagerModel(villagerLook(1, 'builder', false));
    const shared = new Set(meshes(ref.group).map((m) => m.geometry));
    for (const g of groups) for (const m of meshes(g)) assert.ok(!shared.has(m.geometry));
});

test('SpeechBubble is a harmless no-op in node', () => {
    const b = new SpeechBubble();
    assert.equal(b.visible, false);
    b.show('Привет, путник! Добро пожаловать в наш замок.', { name: 'Мельник Иван', seconds: 1, color: 0x2e86c1 });
    assert.equal(b.visible, true);
    const cam = new THREE.PerspectiveCamera();
    b.update(0.1, new THREE.Vector3(0, 3, 0), cam);
    assert.equal(b.sprite.visible, false);
    for (let i = 0; i < 20; i++) b.update(0.1, new THREE.Vector3(0, 3, 0), cam);
    b.update(0.1, null, null);
    assert.equal(b.visible, false);
    b.dispose();
});

test('wrapText: ≤ 28 chars per line, ≤ 4 lines', () => {
    const lines = wrapText('Король велел построить новую стену до заката, а у нас ещё не хватает камней и досок для лесов и крыши, да и обед уже давно остыл на столе у мельника');
    assert.ok(lines.length <= 4);
    for (const l of lines) assert.ok(l.length <= 28, l);
    assert.ok(lines[3].endsWith('…'));
    assert.deepEqual(wrapText('Привет!'), ['Привет!']);
    assert.ok(wrapText('Ааааааааааааааааааааааааааааааааааааааааа').every((l) => l.length <= 28));
});
