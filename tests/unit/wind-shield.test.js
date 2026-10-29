import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { CreatureImpact } from '../../src/game/CreatureImpact.js';
import { windShieldRule, creatureSteady } from '../../src/game/Steadiness.js';
import { SPELL_PHYSICS } from '../../src/game/Impact.js';
import { FX } from '../../src/fx/WizardFx.js';

test('rule: no shield — unchanged; dome — nothing; hand shield + Wind Maxima — steady > push', () => {
    const P = SPELL_PHYSICS.WindMaxima.push;
    assert.equal(windShieldRule('WindMaxima', { steady: 100 }), null);
    assert.equal(windShieldRule('WindMaxima', { shield: 'dome', steady: 1 }), 'none');
    assert.equal(windShieldRule('Wind', { shield: 'dome', steady: 1 }), 'none');
    assert.equal(windShieldRule('WindMaxima', { shield: 'hand', facing: true, steady: P + 1 }), 'held');
    assert.equal(windShieldRule('WindMaxima', { shield: 'hand', facing: true, steady: P }), 'fall');
    assert.equal(windShieldRule('WindMaxima', { shield: 'hand', facing: true, steady: 60 }), 'fall');
    assert.equal(windShieldRule('WindMaxima', { shield: 'hand', facing: false, steady: 100 }), null, 'from behind: no shield');
    assert.equal(windShieldRule('Wind', { shield: 'hand', facing: true, steady: 100 }), null, 'plain Wind: by chance as before');
    assert.equal(windShieldRule('Bombardo', { shield: 'dome' }), null);
});

function wiz(role, rank, fx, id) {
    const scene = new THREE.Scene();
    const model = new VillagerModel(villagerLook(3, 'farmer'), {});
    scene.add(model.group);
    const v = { id, isVillager: true, wizard: true, role, rank, fx, model, group: model.group, x: 10, y: -0.5, z: 0, yaw: Math.PI / 2, dead: false, stunT: 0, vy: 0, mode: 'idle', speed: 0 }; // (yaw π/2: faces −X, towards the caster at x = 0)
    model.group.position.set(v.x, v.y + 1.95, v.z);
    const hud = []; 
    const g = { scene, authority: true, localId: 'me', remotes: new Map(), fx: { spark() {} }, collision: { resolveCylinder() {} }, zombies: [], zombieById: new Map(), hud: { setVoice: (t) => hud.push(t) },
        castleLife: { byId: new Map([[id, v]]), _walkable: () => true }, sync: { creatureImpacts() {} } };
    g.creatureImpact = new CreatureImpact(g);
    return { v, g, ci: g.creatureImpact, hud };
}
const push = (v, x = 60) => ({ v: new THREE.Vector3(x, 0, 0), by: 'me', spell: 'WindMaxima', from: new THREE.Vector3(0, 0, 0) });

test('wizard, no shield: Wind Maxima fells even the Master', () => {
    const { v, ci } = wiz('master', 'master', 0, 'cs0_0:m');
    assert.equal(creatureSteady('v', v), 100);
    assert.equal(ci.apply(v, push(v)), 'knockdown');
});
test('wizard, hand shield in front: the Master (100) stays, a novice falls', () => {
    const m = wiz('master', 'master', FX.SHIELD, 'cs0_0:m');
    assert.equal(m.ci.apply(m.v, push(m.v)), 'stagger');
    const n = wiz('student', 'novice', FX.SHIELD, 'cs0_0:n');
    assert.ok(creatureSteady('v', n.v) < 79);
    assert.equal(n.ci.apply(n.v, push(n.v)), 'knockdown');
});
test('wizard, hand shield but the wind from behind: falls like without a shield', () => {
    const m = wiz('master', 'master', FX.SHIELD, 'cs0_0:m');
    m.v.yaw = -Math.PI / 2; // (faces +X, away from the caster)
    assert.equal(m.ci.apply(m.v, push(m.v)), 'knockdown');
});
test('wizard, dome: nothing at all, Wind too; the caster hears why', () => {
    const w = wiz('student', 'novice', FX.DOME, 'cs0_0:n');
    const x0 = w.v.group.position.x;
    assert.equal(w.ci.apply(w.v, push(w.v)), 'none');
    assert.equal(w.ci.apply(w.v, { ...push(w.v, 20), spell: 'Wind' }), 'none');
    assert.equal(w.ci.stateOf(w.v), 'up');
    w.ci.update(0.5);
    assert.equal(w.v.group.position.x, x0);
    assert.ok(w.hud.some((t) => /остановил даже воздух/.test(t)));
});
