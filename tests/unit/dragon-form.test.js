// «Зелье превращения в дракона» (src/game/DragonForm.js): the potion, the room it needs, the dragon of one's own body driven as
// «Империус Максима» (no mana, no link, «стоп» does not end it), the end where the dragon stands, killed — no loot, half the health.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DRAGON_FORM, DRAGON_FORM_TARGETS, roomFor, DragonForm } from '../../src/game/DragonForm.js';
import { imperiusOf, NET_SPELL, upkeep, linkAt } from '../../src/game/Imperius.js';
import { RECIPES, recipeById, INGREDIENT_RU } from '../../src/game/Potions.js';
import { POTION_FX, PotionEffects } from '../../src/game/PotionEffects.js';
import { Dragons } from '../../src/game/Dragons.js';
import { ImperiusControl } from '../../src/game/ImperiusControl.js';
import { VoxelCharacter, PLAYER_GROUND_OFFSET } from '../../src/entities/Character.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('the potion: a dragon egg and a phoenix feather, 10 minutes, not dark magic', () => {
    const r = recipeById('dragonform');
    assert.deepEqual(r.ingredients, { dragonEgg: 1, phoenixFeather: 1 });
    assert.equal(r.effect.timed, 'dragon');
    assert.equal(POTION_FX.dragon.s, 600);
    assert.equal(DRAGON_FORM.S, 600);
    assert.ok(INGREDIENT_RU.dragonEgg);
    assert.equal(RECIPES.filter((x) => x.id === 'dragonform').length, 1);
    for (const [k, v] of Object.entries(DRAGON_FORM_TARGETS)) assert.ok(v.does && v.why, k);
});

test('the mind in the form: no mana, no link that tears, the Maxima\'s fire; its own net name', () => {
    assert.equal(upkeep('DragonForm', 10), 0);
    assert.equal(linkAt('DragonForm', 50000).torn, false);
    assert.equal(linkAt('DragonForm', 50000).dark, 0);
    assert.equal(imperiusOf('DragonForm').COST, 0);
    assert.equal(NET_SPELL.DragonForm, 2);
});

test('room for a dragon: an open field yes; a cave, a roof, a house no; leaves and flowers do not count', () => {
    const open = () => 0;
    assert.equal(roomFor(open, 0, 10, 0), true);
    const roof = (x, y, z) => (y === 16 ? BLOCK.PLANKS : 0);
    assert.equal(roomFor(roof, 0, 10, 0), false, 'a roof 6 m up');
    const wall = (x, y, z) => (x === 2 && y < 14 ? BLOCK.STONE : 0);
    assert.equal(roomFor(wall, 0, 10, 0), false, 'a wall 2 m off');
    const bush = (x, y, z) => (y === 11 ? BLOCK.LEAVES : y === 12 ? BLOCK.FLOWERS : 0);
    assert.equal(roomFor(bush, 0, 10, 0), true, 'it pushes through the leaves');
    assert.equal(roomFor((x, y, z) => (y === 30 ? BLOCK.STONE : 0), 0, 10, 0), true, 'a cloud of stone high over it — free');
});

/** A small world: the real dragons, the real «Империус», a hero; the host alone. */
function world() {
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene);
    ch.group.position.set(5, 10 + PLAYER_GROUND_OFFSET, 5);
    const said = [];
    const g = {
        scene, character: ch, authority: true, localId: 'me', config: { mode: 'free' }, remotes: new Map(),
        camera: new THREE.PerspectiveCamera(), hud: { setVoice: (t) => said.push(t), notify: (t) => said.push(t) }, perf: { note() {} },
        terrain: { data: { get: () => 0, topLayer: () => 9, landMade: () => true } },
        collision: { groundAt: () => 10 },
        combat: { enabled: true, hp: 20, maxHp: 20, fatigue: 0, maxFatigue: 30, drain: () => true, stun() {}, dead: false },
        items: { spawnLoose() { g._loot = (g._loot || 0) + 1; } },
        achievements: { killed() { g._ach = true; } },
        said,
    };
    g.dragons = new Dragons(g);
    g.dragons.enabled = true;
    g.imperius = new ImperiusControl(g);
    g.dragonForm = new DragonForm(g);
    g.potionFx = new PotionEffects(g);
    return g;
}

/** The potion drunk and the change gone through (CLAUDE.md: a change is never instant — DRAGON_FORM.CHANGE_S, with pain). */
function drink(g) {
    g.potionFx.start('dragon');
    for (let t = 0; t < DRAGON_FORM.CHANGE_S + 0.1; t += 0.05) g.dragonForm.update(0.05);
}

test('the change takes its time and hurts: no dragon at once; −HP; then the dragon (the author 05.11)', () => {
    const g = world();
    const hp0 = g.combat.hp;
    g.potionFx.start('dragon');
    g.dragonForm.update(0.05);
    assert.equal(g.dragonForm.active, false, 'not at once');
    assert.equal(g.dragons.list.length, 0);
    for (let t = 0; t < DRAGON_FORM.CHANGE_S + 0.1; t += 0.05) g.dragonForm.update(0.05);
    assert.ok(g.dragonForm.active, 'a dragon after the change');
    assert.equal(g.combat.hp, hp0 - DRAGON_FORM.PAIN, 'it hurt');
});

test('drunk: the hero is a dragon — hidden, carried in it; «стоп» does not end it; the time out — a man where the dragon stands', () => {
    const g = world(), ch = g.character;
    assert.equal(g.dragonForm.cantNow(), null);
    drink(g);
    assert.ok(g.dragonForm.active, 'a dragon now');
    const d = g.dragons.list.find((x) => x.form === 'me');
    assert.ok(d, 'the dragon of my body');
    assert.equal(g.dragons.list.length, 1);
    // flown off somewhere: the body goes along, unseen
    d.model.position.set(60, 40, -30);
    g.dragonForm.update(0.016);
    assert.equal(ch.group.visible, false);
    assert.ok(Math.abs(ch.group.position.x - 60) < 1e-6 && Math.abs(ch.group.position.z + 30) < 1e-6);
    // nothing touches the body; «стоп» is not the end
    assert.equal(g.imperius.interruptByDamage(5, 'melee'), false);
    assert.equal(g.imperius.stop('stop'), false);
    assert.ok(g.dragonForm.active);
    // drunk again: the time again, no second dragon
    g.potionFx.left.dragon = 10;
    g.potionFx.start('dragon');
    assert.equal(g.potionFx.left.dragon, 600);
    assert.equal(g.dragons.list.length, 1);
    // the time out: a man again, on the ground under the dragon, never a fall
    g.potionFx.update(601);
    assert.equal(g.dragonForm.active, false);
    assert.equal(g.imperius.name, null);
    assert.equal(ch.group.visible, true);
    assert.ok(Math.abs(ch.group.position.x - 60) < 1e-6, 'where the dragon was');
    assert.ok(Math.abs(ch.group.position.y - (10 + PLAYER_GROUND_OFFSET)) < 1e-6, 'on the ground, not in the air');
    assert.equal(g.dragons.list.length, 0, 'the dragon is gone');
});

test('the potion of resetting ends it too', () => {
    const g = world();
    drink(g);
    assert.ok(g.dragonForm.active);
    assert.ok(g.potionFx.resetAll());
    assert.equal(g.dragonForm.active, false);
    assert.equal(g.dragons.list.filter((d) => !d.dead).length, 0);
});

test('the dragon killed: a man again with half the health — no wand, no achievement off one\'s own body', () => {
    const g = world();
    drink(g);
    const d = g.dragons.list[0];
    g.dragons._die(d, 'someone');
    g.imperius.update(0.016);
    assert.equal(g.dragonForm.active, false);
    assert.equal(g.combat.hp, Math.round((20 - DRAGON_FORM.PAIN) * DRAGON_FORM.HP_AFTER)); // (half of what was left after the change's pain)
    assert.ok(!g._loot && !g._ach, 'nothing drops');
    assert.equal(g.potionFx.has('dragon'), false, 'the clock stopped');
});

test('no room — not drunk: in a cave / under a roof, in the saddle, in the water', () => {
    const g = world();
    g.terrain.data.get = (x, y, z) => (y === 15 ? BLOCK.STONE : 0);
    assert.match(g.dragonForm.cantNow(), /тесно/);
    g.terrain.data.get = () => 0;
    g.animals = { riding: true };
    assert.match(g.dragonForm.cantNow(), /встаньте на землю/);
    g.animals = null;
    g.character.swimming = true;
    assert.match(g.dragonForm.cantNow(), /воды/);
});

test('loaded in the form: on the ground, a dragon again with the time left', () => {
    const g = world();
    g.character.group.position.y = 80; // (saved high in the air)
    g.potionFx.restore({ left: { dragon: 300 } });
    g.potionFx.update(0.016);
    assert.ok(g.dragonForm.active);
    const d = g.dragons.list[0];
    assert.ok(Math.abs(d.model.position.y - 10) < 1e-6, 'the dragon stands on the ground');
});
