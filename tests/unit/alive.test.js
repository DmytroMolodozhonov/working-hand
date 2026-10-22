import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { Game } from '../../src/game/Game.js';
import { LivingTrees, ALIVE, aliveDamage, aliveDrain, livingTreeModel, treeFollowPlan } from '../../src/game/LivingTrees.js';
import { Servants, servantPlan, SERVANT } from '../../src/game/Servants.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { SCROLL_SPELL_COLOR, SCROLL_RIBBON_RU, rollKeyItem } from '../../src/game/ItemTypes.js';

test('«Alive» is heard in its many sounds, and the other spells still are', () => {
    for (const w of ['alive', 'Alive!', 'алайв', 'Элайв', 'алив', 'алаив', 'элайф', 'оживи', 'a live']) assert.equal(matchSpell(w), 'Alive', w);
    const old = { 'атак': 'Attack', 'брейнрот': 'Brainrot', 'инферно': 'Inferno', 'айс': 'Ice', 'флайн': 'Flight', 'lightning strike': 'LightningStrike', 'вайнд': 'Wind', 'авада кедавра': 'AvadaKedavra', 'вингардиум левиоса': 'Levitation', 'стоп': 'Stand', 'бомбардо': 'Bombardo', 'даст': 'Sands', 'gather': 'Gather', 'люмос': 'Lumos', 'fire': 'Fire', 'сапира': 'Sapira', 'тандервейв': 'Thunderwave' };
    for (const [w, n] of Object.entries(old)) assert.equal(matchSpell(w), n, w);
});

test('«Alive»: 25 mana, 15 HP; only fire hurts the tree; its life drains the mana (not in Creative)', () => {
    assert.equal(SPELL_COST.Alive, 25);
    assert.equal(ALIVE.COST, 25);
    assert.equal(ALIVE.HP, 15);
    assert.equal(ALIVE.DRAIN, 0.5);
    assert.equal(ALIVE.RANGE, 50);
    for (const k of ['Inferno', 'FireMaxima', 'campfire', 'burn']) assert.equal(aliveDamage(k, 3), 3, k);
    for (const k of ['AvadaKedavra', 'melee', 'Sapira', 'SapiraDuel', 'Stupefy', 'tree', null]) assert.equal(aliveDamage(k, 999), 0, String(k));
    // (the author: lightning and the mightiest spells — 80+ mana — break a living tree too)
    for (const k of ['Lightning', 'LightningStrike', 'Bombardo', 'BombardoMaxima', 'TotalDestruction', 'TotalDestructionMaxima', 'CircleAttack', 'CircleAttackMaxima', 'Inspirius']) assert.equal(aliveDamage(k, 7), 7, k);
    assert.equal(aliveDrain(10, 2), 9);
    assert.equal(aliveDrain(0.2, 1), 0);
    assert.equal(aliveDrain(10, 2, true), 10, 'Creative: no limit');
});

test('«Alive» outside Creative only after burning its scroll; the scroll is in the chest loot', () => {
    assert.ok(SCROLL_SPELL_COLOR.Alive && SCROLL_RIBBON_RU.Alive);
    const g = (mode, spells = {}) => { const o = Object.create(Game.prototype); o.config = { mode }; o.bonus = { spells }; return o; };
    assert.equal(g('creative').knowsSpell('Alive'), true);
    for (const m of ['freeworld']) {
        assert.equal(g(m).knowsSpell('Alive'), false, m);
        assert.equal(g(m, { Alive: true }).knowsSpell('Alive'), true, m);
    }
    let a = 1;
    const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    let n = 0;
    for (let i = 0; i < 20000; i++) { const it = rollKeyItem(r); if (it.kind === 'scroll' && it.spell === 'Alive') n++; } // (a chest's one precious thing)
    assert.ok(n > 50, `Alive scrolls drop (${n})`);
});

// ---------------------------------------------------------------- a small world
function fakeGame({ mode = 'creative', mana = 30, enabled = false } = {}) {
    const said = [];
    const scene = new THREE.Scene();
    const me = new THREE.Vector3(0, 2, 0);
    const g = {
        config: { mode }, authority: true, localId: 'me', scene, remotes: new Map(), zombies: [], zombieById: new Map(),
        character: { group: { position: me } },
        hud: { setVoice: (t) => said.push(t), toast: (t) => said.push(t), setFatigue() {}, hidePvp() {} },
        fx: { spark() {} },
        collision: { groundY: () => 0, resolveCylinder() {} },
        combat: { fatigue: mana, maxFatigue: 30, enabled, costOf: () => 25, check: () => null },
        said,
    };
    g.servants = new Servants(g);
    g.livingTrees = new LivingTrees(g);
    return g;
}
const D = { x: 6, y: 0, z: 0, ry: 0, kind: 0, trunk: 0x8b4513, leaf: 0x228b22, h: 11 };
const run = (g, s, dt = 0.05) => { for (let t = 0; t < s; t += dt) g.livingTrees.update(dt); };

test('the living tree: comes alive in ~3 s; Avada / swords do nothing; Inferno burns it down', () => {
    const g = fakeGame();
    const t = g.livingTrees.spawn(D, 'me');
    assert.equal(t.hp, 15);
    run(g, 1.5);
    assert.equal(t.phase, 'rise');
    assert.ok(t.form > 0.4 && t.form < 0.6, 'driven, not at once');
    run(g, 1.7);
    assert.equal(t.phase, 'alive');
    g.livingTrees.hit(t, 999, 'AvadaKedavra');
    g.livingTrees.hit(t, 8, 'melee');
    g.livingTrees.hit(t, 30, 'Sapira');
    assert.equal(t.hp, 15);
    g.livingTrees.hit(t, 3, 'Inferno');
    assert.equal(t.hp, 12);
    assert.ok(t.burnT > 0, 'it burns');
    for (let i = 0; i < 4 && !t.isDead; i++) { g.livingTrees.hit(t, 3, 'Inferno'); run(g, 0.6); }
    assert.equal(t.phase, 'burn');
    run(g, ALIVE.COLLAPSE + 0.2);
    assert.equal(g.livingTrees.list.length, 0, 'burnt down and gone');
    // «Бомбардо» tears another one apart: no fire, it topples like a felled trunk
    const t2 = g.livingTrees.spawn(D, 'me');
    run(g, 3.3);
    g.livingTrees.hit(t2, 6, 'Bombardo');
    assert.equal(t2.hp, 9);
    assert.ok(!(t2.burnT > 0), 'a burst does not set it alight');
    g.livingTrees.hit(t2, 24, 'BombardoMaxima');
    assert.equal(t2.phase, 'fall', 'torn apart');
});

test('the living tree lives on its caster\'s mana: no regeneration, it drains; mana gone → it stiffens and falls', () => {
    const g = fakeGame({ mode: 'freeworld', mana: 5, enabled: true });
    const t = g.livingTrees.spawn(D, 'me');
    assert.equal(g.livingTrees.draining, true, 'the free world\'s regeneration stops');
    run(g, 4);
    assert.ok(Math.abs(g.combat.fatigue - 3) < 0.05, `drained 0.5/s (${g.combat.fatigue})`);
    run(g, 6.2);
    assert.equal(g.combat.fatigue, 0);
    assert.equal(t.phase, 'stiff');
    assert.match(g.said.join(' '), /Мана кончилась/);
    run(g, ALIVE.STIFFEN + 0.1);
    assert.equal(t.phase, 'fall');
    run(g, 3);
    assert.equal(g.livingTrees.list.length, 0, 'fell over (the fallen tree is laid as blocks)');
});

test('Creative: the tree doesn\'t take mana; «стоп» ends it; farther than 50 m it ends too', () => {
    const g = fakeGame({ mana: 30 });
    const t = g.livingTrees.spawn(D, 'me');
    run(g, 10);
    assert.equal(g.combat.fatigue, 30);
    assert.equal(t.phase, 'alive');
    assert.equal(g.livingTrees.stopMine(), true);
    assert.equal(t.phase, 'stiff');
    const t2 = g.livingTrees.spawn(D, 'me');
    run(g, 3.2);
    assert.equal(t2.phase, 'alive');
    g.character.group.position.set(80, 2, 0);
    run(g, 0.1);
    assert.equal(t2.phase, 'stiff');
    assert.match(g.said.join(' '), /дальше 50 м/);
});

test('a golden tree doesn\'t come alive', () => {
    const g = fakeGame();
    g.builder = { _hand: () => ({ side: 'right', o: new THREE.Vector3(0, 2, 0), d: new THREE.Vector3(1, 0, 0) }), _treeOnRay: () => null, _hitCell: () => null };
    g.animals = { trees: new Map([['k', { x: 6, y: 0, z: 0, model: {} }]]) };
    assert.equal(g.livingTrees.cast(true), null);
    assert.match(g.said.at(-1), /Золотые деревья не оживают/);
});

test('the tree monster\'s model: root legs, branch arms with twig fingers, glowing eyes, a jagged mouth, its own colours', () => {
    const m = livingTreeModel({ trunk: 0xd8d8d0, leaf: 0x8fcf4a, h: 10 });
    const u = m.userData;
    assert.equal(u.legs.length, 2);
    assert.equal(u.arms.length, 2);
    assert.equal(u.eyes.length, 2);
    assert.ok(u.mouth.children.length >= 8, 'teeth');
    assert.equal(u.mats[0].color.getHex(), 0xd8d8d0);
    assert.equal(u.mats[2].color.getHex(), 0x8fcf4a);
});

test('the living tree walks after its master, beats the enemy «Атак» points at', () => {
    const g = fakeGame();
    const hits = [];
    const zombie = { id: 7, isDead: false, group: { position: new THREE.Vector3(30, 0, 0) } };
    g.zombies.push(zombie); g.zombieById.set(7, zombie);
    g.damageZombie = (z, dmg) => hits.push(dmg);
    const t = g.livingTrees.spawn({ ...D, x: 20 }, 'me');
    run(g, 3.2);
    // the zombie is far from both: it follows me
    g.zombies.length = 0; g.zombieById.clear();
    run(g, 4);
    assert.ok(t.model.position.x < 12, `came after me (${t.model.position.x.toFixed(1)})`);
    assert.ok(t.model.position.x > SERVANT.FOLLOW - 0.5, 'not on top of me');
    // a big tree keeps a comfortable distance (5 m from its crown's edge), and steps back when I come at it
    run(g, 4);
    const keep = ALIVE.KEEP + ALIVE.CROWN * t.model.userData.s;
    assert.ok(t.model.position.x > keep - ALIVE.SLACK - 0.1, `keeps its distance (${t.model.position.x.toFixed(1)})`);
    g.character.group.position.x = 4;
    run(g, 3);
    assert.ok(t.model.position.x - 4 > keep - ALIVE.SLACK - 0.1, `stepped back (${(t.model.position.x - 4).toFixed(1)})`);
    g.character.group.position.x = 0;
    assert.equal(treeFollowPlan({ x: 3, z: 0 }, { x: 0, z: 0 }, 1).mode, 'back');
    g.zombies.push(zombie); g.zombieById.set(7, zombie);
    zombie.group.position.set(-30, 0, 0);
    g.servants.command('me', { k: 'z', id: 7 });
    run(g, 12);
    assert.ok(hits.length >= 2 && hits.every((d) => d === ALIVE.DMG), `it went and struck (${hits})`);
});

test('servant plan: strike in reach, chase the enemy, else follow the master at a distance', () => {
    assert.equal(servantPlan({ x: 0, z: 0 }, null, { x: 2, z: 0 }, 3).mode, 'strike');
    const c = servantPlan({ x: 0, z: 0 }, null, { x: 10, z: 0 }, 3);
    assert.equal(c.mode, 'chase');
    assert.ok(c.x > 7 && c.x < 10);
    assert.equal(servantPlan({ x: 0, z: 0 }, { x: 3, z: 0 }, null, 3).mode, 'stay');
    const f = servantPlan({ x: 0, z: 0 }, { x: 8, z: 0 }, null, 3);
    assert.equal(f.mode, 'follow');
    assert.ok(Math.abs(f.x - (8 - SERVANT.FOLLOW)) < 1e-6);
    assert.equal(servantPlan({ x: 0, z: 0 }, { x: 30, z: 0 }, null, 3).mode, 'chase');
});

test('«Брейнрот» on an animal and on a villager makes a servant that fights the master\'s enemies', () => {
    const g = fakeGame();
    const cow = { id: 3, dead: false, state: 'attack', attacker: 'me', group: { position: new THREE.Vector3(5, 0, 0) }, target: new THREE.Vector3() };
    const knight = { id: 'v1', dead: false, x: -5, y: 0, z: 0, foe: 'me' };
    g.animals = { list: [cow], byId: new Map([[3, cow]]), hit: () => {} };
    g.castleLife = { byId: new Map([['v1', knight]]), hit: () => {} };
    assert.equal(g.servants.make('a', 3, 'me'), true);
    assert.equal(cow.servantOf, 'me');
    assert.equal(cow.state, 'graze', 'it stops attacking its master');
    assert.equal(g.servants.make('v', 'v1', 'me'), true);
    assert.equal(knight.servantOf, 'me');
    assert.equal(knight.foe, null);
    assert.deepEqual(g.servants.of('me').map((s) => s.k).sort(), ['a', 'v']);
    // a zombie near: both go for it, not for each other
    const z = { id: 9, isDead: false, group: { position: new THREE.Vector3(6, 0, 3) } };
    g.zombies.push(z); g.zombieById.set(9, z);
    assert.deepEqual(g.servants.enemyFor({ k: 'a', id: 3 }, 'me', cow.group.position)?.k, 'z');
    assert.deepEqual(g.servants.enemyFor({ k: 'v', id: 'v1' }, 'me', new THREE.Vector3(-5, 0, 0))?.k, 'z');
    const p = g.servants.plan('a', cow, cow.group.position, 3.5);
    assert.equal(p.mode, 'strike');
    // somebody else's knight going for me is an enemy too
    const foe = { id: 'v2', dead: false, x: 1, y: 0, z: 2, foe: 'me' };
    g.castleLife.byId.set('v2', foe);
    g.zombies.length = 0; g.zombieById.clear();
    assert.equal(g.servants.enemyFor({ k: 'a', id: 3 }, 'me', cow.group.position)?.id, 'v2');
    // the time runs out: free again
    cow.servantUntil = performance.now() - 1;
    assert.equal(g.servants.plan('a', cow, cow.group.position, 2), null);
    assert.equal(cow.servantOf, null);
});

test('«Брейнрот» on somebody\'s living tree: it obeys the new master for a while', () => {
    const g = fakeGame();
    const t = g.livingTrees.spawn(D, 'other');
    assert.equal(g.servants.make('t', t.id, 'me'), true);
    assert.equal(t.master, 'me');
    assert.equal(t.owner, 'other', 'its life still hangs on its caster');
    t.masterUntil = performance.now() - 1;
    g.servants.plan('t', t, t.model.position, 3);
    assert.equal(t.master, 'other');
});

test('«Атек» as it is often heard: still «Attack»', () => {
    for (const w of ['атек', 'Атек!', 'аттек', 'эттек', 'атак']) assert.equal(matchSpell(w), 'Attack', w);
    assert.equal(matchSpell('вейв атек'), 'WaveAttack');
});

test('Creative: «Атак» at another player — the tree goes and strikes; their computer throws them back (no damage)', () => {
    const g = fakeGame();
    const sent = [];
    const friend = { dead: false, position: new THREE.Vector3(-14, 0, 0), character: { group: { position: new THREE.Vector3(-14, 0, 0) } } };
    g.remotes.set('friend', friend);
    g.sync = { servantHit: (to, dmg, dir, by, kind) => sent.push({ to, dmg, by, kind, dx: dir.x }) };
    const t = g.livingTrees.spawn({ ...D }, 'me');
    run(g, 3.2);
    g.servants.command('me', { k: 'p', id: 'friend' });
    run(g, 12);
    assert.ok(sent.length >= 1 && sent.every((s) => s.to === 'friend' && s.by === 'me' && s.kind === 'tree' && s.dx < 0), JSON.stringify(sent));
    assert.ok(t.model.position.x < 0, 'it walked to them');
    // on their computer (Creative): thrown back, the HP stays
    const v = fakeGame();
    v.knockback = new THREE.Vector3();
    let hp = 10;
    v.damageLocalPlayer = (d) => { if (v.config.mode !== 'creative') hp -= d; };
    v.servants.hitMe(ALIVE.DMG, new THREE.Vector3(-1, 0, 0), 'me', 'tree');
    assert.equal(hp, 10);
    assert.ok(v.knockback.x < -5 && v.knockback.y > 0);
    assert.match(v.said.at(-1), /Живое дерево ударило вас/);
});

test('«Alive»: a trunk just beside the line of the hand still counts (a hand never points exactly); one far off does not', () => {
    const g = fakeGame();
    const cells = new Map();
    for (let L = 1; L <= 5; L++) cells.set(`10,${L},0`, 6); // an oak trunk 10 m ahead, one block thick
    for (let x = 9; x <= 11; x++) for (let z = -1; z <= 1; z++) cells.set(`${x},6,${z}`, 7);
    g.builder = { data: { get: (x, L, z) => cells.get(`${x},${L},${z}`) || 0 }, _treeOnRay: () => null, _hitCell: () => null };
    const o = new THREE.Vector3(0, 1.5, 0);
    const near = g.livingTrees.aimAt(o, new THREE.Vector3(10, 0, 0.9).normalize()); // (~5° beside the trunk)
    assert.ok(near && near.cell && near.kind === 0, JSON.stringify(near));
    assert.equal(g.livingTrees.aimAt(o, new THREE.Vector3(10, 0, 4).normalize()), null); // (~22° off)
});
