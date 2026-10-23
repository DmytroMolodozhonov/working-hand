// «Пентаграмма страшного монстра»: the rules (MonsterForm.js), the drawing (PentagramMonster.js in the shared table of Pentagrams.js), the form in a game
// (MonsterTransform.js on a real VoxelCharacter and a small stand-in game), the hooks in Game / Combat / Knockdown.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { MONSTER, MONSTER_VS, FIST_TARGETS, STOMP, fmtLeft, growAt, hpAfterFall, spellOnMonster, knocksMonster, fistPower, bodyBreaks, fistBreaks, softGround, footprint, crater, freeSpot } from '../../src/game/MonsterForm.js';
import { MONSTER_PENTAGRAM } from '../../src/game/PentagramMonster.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { figureIds, figureLines, recognizeAny, pentagramScroll } from '../../src/game/PentagramRules.js';
import { MonsterTransform, applyRemoteMonster } from '../../src/game/MonsterTransform.js';
import { VoxelCharacter, PLAYER_GROUND_OFFSET } from '../../src/entities/Character.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { DANGERS } from '../../src/game/Danger.js';
import { SPELL_SOUND, SPELL_GEN } from '../../src/audio/SpellMusic.js';
import { scrollKindLabel, DarkHero } from '../../src/game/DarkMagic.js';
import { describeItem } from '../../src/game/ItemTypes.js';

const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('the author\'s numbers: 200 mana, 10 minutes, 500 HP, ×7', () => {
    assert.equal(MONSTER.COST, 200);
    assert.equal(MONSTER.DURATION, 600);
    assert.equal(MONSTER.HP, 500);
    assert.equal(MONSTER.SCALE, 7);
    assert.equal(MONSTER.STEADY, 100);
    assert.ok(Math.abs(MONSTER.BODY_H - 24.5) < 1e-9 && Math.abs(MONSTER.RADIUS - 3.36) < 1e-9);
    // the run: a stride 7× longer, the speed not 7× (playable): 2.5…3×
    assert.ok(MONSTER.RUN_K >= 2.5 && MONSTER.RUN_K <= 3);
});

test('the clock on the screen', () => {
    assert.equal(fmtLeft(600), '10:00');
    assert.equal(fmtLeft(599.2), '10:00');
    assert.equal(fmtLeft(59.01), '1:00');
    assert.equal(fmtLeft(9), '0:09');
    assert.equal(fmtLeft(-3), '0:00');
});

test('the change: ×1 → ×7 in jolts, and back', () => {
    assert.equal(growAt(0).size, 1);
    assert.equal(growAt(1).size, 7);
    assert.equal(growAt(1).beast, 1);
    assert.equal(growAt(0, true).size, 7);
    assert.equal(growAt(1, true).size, 1);
    let last = 1;
    for (let k = 0; k <= 1.0001; k += 0.05) { const s = growAt(k).size; assert.ok(s >= 1 && s <= 7); last = s; }
    assert.equal(last, 7);
});

test('what acts on the monster — as on a dragon: simple spells and fire none, the gods\' all, Avada breaks the form', () => {
    for (const k of ['Inferno', 'fire', 'Fire', 'Stupefy', 'Jolt', 'JoltMaxima', 'Wind', 'Sapira', 'IceDuel', 'Ice', 'Levitation', 'Bombardo', 'Frozen', 'chill']) {
        assert.equal(spellOnMonster(k).k, 0, k);
        assert.equal(spellOnMonster(k).push, false, k);
    }
    for (const k of ['Boom', 'Die', 'ProtectionGods', 'FlyingMaxima']) { assert.equal(spellOnMonster(k).k, 1, k); assert.ok(knocksMonster(k), k); }
    assert.equal(spellOnMonster('Inspirius').k, 1); assert.ok(knocksMonster('Inspirius'));
    assert.equal(spellOnMonster('TotalDestructionMaxima').k, 1);
    assert.equal(spellOnMonster('BombardoMaxima').k, 0.5); assert.equal(knocksMonster('BombardoMaxima'), false);
    assert.equal(spellOnMonster('melee').k, 0.25);
    assert.equal(spellOnMonster('knight').k, 0.25);
    assert.equal(spellOnMonster('AvadaKedavra').breaks, true);
    assert.equal(knocksMonster('Jolt'), false);
    for (const [k, r] of Object.entries(MONSTER_VS)) assert.ok(r.does && r.why, k);
    assert.equal(hpAfterFall(20), 5);
    assert.equal(hpAfterFall(2), 1);
});

test('fists: every kind of creature and the world has a row; a slow hand is no blow', () => {
    for (const k of ['zombie', 'villager', 'animal', 'sailor', 'tree', 'dragon', 'spider', 'ice', 'phoenix', 'owl', 'player', 'blocks', 'items', 'ships', 'godGift']) assert.ok(FIST_TARGETS[k]?.how, k);
    assert.equal(fistPower(5), 0);
    assert.ok(fistPower(20) > 0 && fistPower(20) < 1);
    assert.equal(fistPower(80), 1);
});

test('blocks: the body breaks what is built and trees, never the ground; nothing breaks bedrock, the enchanted stone', () => {
    for (const t of [BLOCK.PLANKS, BLOCK.CS_GREY, BLOCK.BRICK, BLOCK.FENCE, BLOCK.WOOD, BLOCK.LEAVES, BLOCK.ROOF_RED, BLOCK.THATCH]) assert.ok(bodyBreaks(t), t);
    for (const t of [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND, BLOCK.BEDROCK, BLOCK.WATER, BLOCK.AIR, BLOCK.ENCHANTED, BLOCK.ARCANE_WARD]) assert.equal(bodyBreaks(t), false, t);
    assert.ok(fistBreaks(BLOCK.STONE) && fistBreaks(BLOCK.DIRT));
    for (const t of [BLOCK.BEDROCK, BLOCK.WATER, BLOCK.ENCHANTED, BLOCK.ENCHANTED_SEAT, BLOCK.ARCANE_WARD]) assert.equal(fistBreaks(t), false, t);
    assert.ok(softGround(BLOCK.GRASS) && !softGround(BLOCK.STONE) && !softGround(BLOCK.PLANKS));
});

test('a footprint: a heel, a pad and four toes (≈ 3.5 × 5 m), the heel deeper on a run; a crater from a jump', () => {
    const f = footprint(0, true);
    const xs = f.map((c) => c.dx), zs = f.map((c) => c.dz);
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 2 && Math.max(...xs) - Math.min(...xs) <= 4);
    assert.ok(Math.max(...zs) - Math.min(...zs) >= 4 && Math.max(...zs) - Math.min(...zs) <= 6);
    assert.ok(f.some((c) => c.depth === 2) && f.every((c) => c.depth >= 1 && c.depth <= 2));
    assert.ok(footprint(0, false).every((c) => c.depth === 1));
    // turned with the body
    const g = footprint(Math.PI / 2), gx = g.map((c) => c.dx);
    assert.ok(Math.max(...gx) - Math.min(...gx) >= 4);
    assert.ok(crater(3).length > 20 && crater(3).some((c) => c.depth === 2));
    assert.ok(STOMP.EVERY >= 1 && STOMP.MAX <= 400); // (a limit: every dent goes over the network and into the save)
});

test('after the change back: out of the ceiling and the rock — up the column, then round', () => {
    // a room 3 m high is too low for… no: a house the monster filled — the man stands on its floor (fits there)
    const solid = new Set();
    const key = (x, y, z) => `${Math.round(x)},${Math.floor(y)},${Math.round(z)}`;
    // rock from y 0 to 10 everywhere within 3 m, the open ground beyond
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = 0; y < 10; y++) solid.add(key(x, y, z));
    const fits = (x, feet, z) => { for (let y = Math.floor(feet); y < feet + 3.5; y++) if (solid.has(key(x, y, z))) return false; return true; };
    const floor = (x, z, fromY) => { for (let y = Math.floor(fromY); y > -20; y--) if (solid.has(key(x, y, z))) return y + 1; return 0; };
    const s = freeSpot(fits, floor, 0, 2, 0); // (in the rock)
    assert.ok(s, 'a place found');
    assert.ok(fits(s.x, s.y, s.z));
    // free already: stays
    assert.deepEqual(freeSpot(fits, floor, 10, 0, 10), { x: 10, y: 0, z: 10 });
});

test('the villagers fear it: a danger row, heard and seen far', () => {
    assert.ok(DANGERS.monster && DANGERS.monster.see >= 150 && DANGERS.monster.ru);
});

test('its sounds: the roar and the tune of the change (SPELL_SOUND), short and loud enough', () => {
    for (const n of ['MonsterForm', 'MonsterBack']) assert.ok(SPELL_SOUND[n]?.cast && SPELL_GEN[SPELL_SOUND[n].cast], n);
    assert.ok(SPELL_GEN[SPELL_SOUND.MonsterForm.theme]);
    const roar = SPELL_GEN.fxMonsterRoar(22050);
    assert.ok(roar.length / 22050 <= 2);
    assert.ok(src('src/audio/SoundManager.js').includes('giantStep'), 'heavy steps, made ahead');
});

// ------------------------------------------------------------------ the pentagram

test('the pentagram row in the shared table: dark, one use, blood-red; a drawing-scroll teaches it', () => {
    assert.equal(PENTAGRAMS.monster, MONSTER_PENTAGRAM);
    assert.equal(MONSTER_PENTAGRAM.id, 'monster');
    assert.equal(MONSTER_PENTAGRAM.dark, true);
    assert.equal(MONSTER_PENTAGRAM.once, true);
    assert.equal(MONSTER_PENTAGRAM.cost, MONSTER.COST);
    assert.ok(figureIds().includes('monster'));
    const sc = pentagramScroll('monster', 'u1');
    assert.equal(sc.pent, 'monster');
    assert.equal(sc.dark, true);
    assert.deepEqual(scrollKindLabel(sc)?.text, 'Чёрная пентаграмма');
    assert.match(describeItem(sc).title, /монстра/);
});

test('the drawing (a circle, a fanged maw) is told from the others, drawn any way round', () => {
    let s = 5;
    const j = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5) * 0.15;
    const drawing = (id, cx, cz, R, rot) => {
        const pts = [];
        for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2; pts.push([cx + Math.cos(a) * R + j(), cz + Math.sin(a) * R + j()]); }
        for (const poly of figureLines(id, rot)) { const P = [...poly, poly[0]]; for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < 6; k++) { const u = k / 6; pts.push([cx + (P[i][0] + (P[i + 1][0] - P[i][0]) * u) * R + j(), cz + (P[i][1] + (P[i + 1][1] - P[i][1]) * u) * R + j()]); } }
        return pts;
    };
    for (const rot of [0, 1.7, 3.6, 5.2]) {
        const r = recognizeAny(drawing('monster', 5, -3, 3, rot));
        assert.equal(r.id, 'monster', 'turned ' + rot);
        assert.ok(r.ok);
    }
    for (const id of ['teleport', 'life', 'mend', 'breakward']) assert.notEqual(recognizeAny(drawing(id, 0, 0, 3, 0.4)).id, 'monster', id);
});

test('standing in my lit monster pentagram 0.8 s: the form begins and the drawing burns out; no mana — a hint, it stays', () => {
    const stand = MONSTER_PENTAGRAM.stand;
    const a = fakeGame();
    const m = {};
    assert.equal(stand(a.g, m, 0.5, true), false);
    assert.equal(stand(a.g, m, 0.4, true), true);
    assert.equal(a.g.monster.active, true);
    const b = fakeGame({ mana: 50 });
    const said = []; b.g.hud.setVoice = (t) => said.push(t);
    const m2 = {};
    stand(b.g, m2, 1, true);
    assert.equal(stand(b.g, m2, 1, true), false);
    assert.equal(b.g.monster.active, false);
    assert.ok(said.some((t) => /маны/.test(t)));
    assert.equal(stand(b.g, m2, 1, false), false); // (out of the circle: the next try)
    assert.match(src('src/game/Pentagranium.js'), /TABLE\[m\.pent\]\?\.stand/);
});

// ------------------------------------------------------------------ the form in a game

function fakeGame({ mana = 300, mode = 'freeworld' } = {}) {
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene);
    ch.group.position.set(0, PLAYER_GROUND_OFFSET, 0);
    const said = [], sent = [], sounds = [];
    const wand = { kind: 'wand', uid: 'w1' };
    const wandModel = new THREE.Group();
    const items = { held: { right: { item: wand, model: wandModel }, left: null }, heldOf: (k) => (items.held.right?.item.kind === k ? { side: 'right', ...items.held.right } : null), _throw() {} };
    const blocks = new Map();
    const g = {
        scene, character: ch, items, config: { mode },
        combat: { enabled: mode === 'freeworld', hp: 17, maxHp: 20, fatigue: mana, dead: false },
        playerHP: 17, maxHP: 20,
        dark: new DarkHero(null),
        hud: { setVoice: (t) => said.push(t), setMonsterTimer: (...a) => { g._timer = a; } },
        fx: { shake: 0, spark() {}, debrisFrom() {} },
        sound: { spellCast: (n) => sounds.push(n), playGiantStep: () => sounds.push('step') },
        sync: { castSound() {}, itemHold: (side, it) => sent.push([side, it?.kind || null]) },
        stopSpells: () => { g._stopped = true; },
        knock: { knock: () => { g._knocked = true; } },
        localId: 'me',
        terrain: { data: { get: (x, L, z) => blocks.get(`${x},${L},${z}`) || 0, set: (x, L, z, t) => blocks.set(`${x},${L},${z}`, t), topLayer: () => 0, floorBelow: () => 0, solidIn: () => false, ceilingAbove: () => Infinity } },
        collision: { pointBlocked: () => false },
        builder: { _sendEdits: (e) => { g._edits = (g._edits || 0) + e.length; } },
    };
    g.monster = new MonsterTransform(g);
    return { g, ch, said, sent, sounds, blocks };
}

// (Character.update keeps the body on its feet as it grows and shrinks: the feet on the ground at y 0)
const run = (g, s, dt = 0.1) => { for (let t = 0; t < s; t += dt) { g.monster.update(dt); g.character.group.position.y = PLAYER_GROUND_OFFSET * g.character.size; } };

test('standing on it: 200 mana, +1 dark, everything held stops, the wand hidden, 500 HP; ×7 after the change', () => {
    const { g, ch, sent, sounds } = fakeGame();
    assert.equal(g.monster.begin(), true);
    assert.equal(g.combat.fatigue, 100);
    assert.equal(g.dark.level, 1);
    assert.equal(g._stopped, true);
    assert.equal(g.monster.hidesWand, true);
    assert.equal(g.items.held.right.model.visible, false);
    assert.deepEqual(sent.at(-1), ['right', null]);
    assert.equal(g.combat.hp, 500);
    assert.equal(g.combat.maxHp, 500);
    assert.ok(sounds.includes('MonsterForm'));
    run(g, MONSTER.GROW_S + 0.2);
    assert.equal(g.monster.phase, 'on');
    assert.equal(ch.size, 7);
    assert.equal(ch.group.scale.x, 7);
    assert.equal(ch.sizeRun, MONSTER.RUN_K);
    assert.equal(g.monster.look.on, true);
    assert.equal(g._timer[0], '10:00');
    // the eyes ×7 (the camera goes with them)
    ch.group.updateMatrixWorld(true);
    const eyes = ch.getHeadPosition(new THREE.Vector3()).y - (ch.group.position.y - PLAYER_GROUND_OFFSET * 7);
    assert.ok(Math.abs(eyes - 4.15 * 7) < 0.5, String(eyes));
    assert.deepEqual(g.monster.netFlag(), [7, 1, g.monster.netFlag()[2]]);
    // a second pentagram does nothing meanwhile
    assert.equal(g.monster.begin(), false);
});

test('without 200 mana: nothing (the mana stays), and Creative is free', () => {
    const a = fakeGame({ mana: 150 });
    assert.equal(a.g.monster.begin(), false);
    assert.equal(a.g.combat.fatigue, 150);
    assert.equal(a.g.monster.active, false);
    const b = fakeGame({ mana: 0, mode: 'creative' });
    assert.equal(b.g.monster.begin(), true);
});

test('10 minutes later: back to a man — the size, the wand in the hand, the old health', () => {
    const { g, ch, sent } = fakeGame();
    g.monster.begin();
    run(g, MONSTER.GROW_S + 0.2);
    g.combat.hp = 321; // (hurt as a monster)
    ch.group.position.y = PLAYER_GROUND_OFFSET * 7; // (Character.update stands the ×7 body on its feet)
    run(g, MONSTER.DURATION, 1);
    assert.equal(g.monster.phase, 'shrink');
    run(g, MONSTER.SHRINK_S + 0.3);
    assert.equal(g.monster.active, false);
    assert.equal(ch.size, 1);
    assert.equal(ch.group.scale.x, 1);
    assert.equal(g.monster.look.on, false);
    assert.equal(g.items.held.right.model.visible, true);
    assert.deepEqual(sent.at(-1), ['right', 'wand']);
    assert.equal(g.combat.hp, 17);
    assert.equal(g.combat.maxHp, 20);
    assert.equal(g._timer[0], null);
    assert.ok(Math.abs(ch.group.position.y - PLAYER_GROUND_OFFSET) < 1e-6, 'feet where the monster stood');
});

test('damage while a monster: simple spells nothing, blades a quarter; killed — a man with a quarter of his health, knocked down', () => {
    const { g } = fakeGame();
    g.monster.begin();
    run(g, MONSTER.GROW_S + 0.2);
    assert.equal(g.monster.filterDamage(10, 'Stupefy'), 0);
    assert.equal(g.monster.filterDamage(10, 'Inferno'), 0);
    assert.equal(g.monster.filterDamage(10, 'melee'), 2.5);
    assert.equal(g.monster.filterDamage(10, 'Boom'), 10);
    assert.equal(g.monster.stuns('Stupefy'), false);
    assert.equal(g.monster.knocks('Jolt'), false);
    assert.equal(g.monster.pushedBy({ spell: 'WindMaxima' }), false);
    assert.equal(g.monster.pushedBy({ spell: 'Inspirius' }), true);
    g.combat.hp = 0;
    g.monster.fell(null, 'melee');
    assert.equal(g.combat.hp, 1); // (not dead)
    assert.equal(g.monster.phase, 'shrink');
    run(g, 2);
    assert.equal(g.monster.active, false);
    assert.equal(g.combat.hp, hpAfterFall(17));
    assert.equal(g._knocked, true);
});

test('Avada on the monster tears the form; «Дай» of the gods kills the man too', () => {
    const a = fakeGame();
    a.g.monster.begin(); run(a.g, MONSTER.GROW_S + 0.2);
    assert.equal(a.g.monster.filterDamage(30, 'AvadaKedavra'), 0);
    assert.equal(a.g.monster.phase, 'shrink');
    const b = fakeGame();
    b.g.monster.begin(); run(b.g, MONSTER.GROW_S + 0.2);
    assert.equal(b.g.monster.saves('die', 'x'), false); // (Combat.die goes on)
    assert.equal(b.g.monster.active, false);
    assert.equal(b.ch.size, 1);
    const c = fakeGame();
    c.g.monster.begin(); run(c.g, MONSTER.GROW_S + 0.2);
    assert.equal(c.g.monster.saves('decap', 'x'), true); // (the beast's head, not the man's)
});

test('saving or leaving during the form: the man\'s place and health, never the form', () => {
    const { g, ch } = fakeGame();
    g.monster.begin(); run(g, MONSTER.GROW_S + 0.2);
    ch.group.position.y = PLAYER_GROUND_OFFSET * 7; // (Character.update stands the ×7 body on its feet)
    const h = g.monster.humanPos();
    assert.ok(Math.abs(h.y - PLAYER_GROUND_OFFSET) < 1e-6);
    assert.equal(g.monster.origHp, 17);
    assert.match(src('src/game/WorldSave.js'), /monster\?\.active \? game\.monster\.humanPos\(\)/);
    assert.match(src('src/game/WorldSave.js'), /monster\?\.active \? game\.monster\.origHp/);
    g.monster.dispose(); // (Game.dispose: before the last save)
    assert.equal(g.monster.active, false);
    assert.equal(ch.size, 1);
    assert.equal(g.combat.hp, 17);
});

test('the body breaks the house it walks into; the ground stays; the enchanted stone stays', () => {
    const { g, ch, blocks } = fakeGame();
    g.monster.begin(); run(g, MONSTER.GROW_S + 0.2);
    // a plank wall and an enchanted wall in the monster's body, 3 m above its feet; the ground (grass) at its feet
    for (let y = 2; y <= 6; y++) { blocks.set(`2,${y},0`, BLOCK.PLANKS); blocks.set(`-2,${y},0`, BLOCK.ENCHANTED); }
    blocks.set('0,0,0', BLOCK.GRASS);
    g.terrain.data.topLayer = () => 10;
    g.terrain.data.set = (x, L, z, t) => { if (blocks.get(`${x},${L},${z}`) === BLOCK.ENCHANTED) return; blocks.set(`${x},${L},${z}`, t); }; // (TerrainData's own guard)
    g.monster._budget = 500;
    g.monster.smashAt(ch.group.position);
    for (let y = 2; y <= 6; y++) { assert.equal(blocks.get(`2,${y},0`), BLOCK.AIR, 'planks ' + y); assert.equal(blocks.get(`-2,${y},0`), BLOCK.ENCHANTED); }
    assert.equal(blocks.get('0,0,0'), BLOCK.GRASS);
    g.monster.update(0.016); // (the edits go out: Collapse, the network, the save)
    assert.ok(g._edits >= 5);
});

test('another player in the monster form: the same model on their bones, ×7 by the group\'s scale', () => {
    const scene = new THREE.Scene();
    const av = { character: new VoxelCharacter(scene, { remote: true }) };
    applyRemoteMonster(av, [7, 1, 0]);
    assert.equal(av.character.size, 7);
    assert.equal(av._monster.on, true);
    applyRemoteMonster(av, null);
    assert.equal(av.character.size, 1);
    assert.equal(av._monster.on, false);
});

test('the hooks: no spell but «стоп» as a monster; hits, stuns, falls, pushes, steadiness go through the form', () => {
    const game = src('src/game/Game.js');
    assert.match(game, /monster\?\.active && !\(name === 'Stand'/);
    assert.match(game, /wandSide\(\) \{\n\s+if \(this\.monster\?\.hidesWand\) return null;/);
    assert.match(src('src/game/Combat.js'), /mon\.filterDamage\(amount, kind, byId\)/);
    assert.match(src('src/game/Combat.js'), /monster\.saves\(how, byId\)/);
    assert.match(src('src/game/Combat.js'), /monster\.stuns\(kind\)/);
    assert.match(src('src/game/Knockdown.js'), /monster\.knocks\(kind, cause\)/);
    assert.match(src('src/game/BodyImpact.js'), /monster\.pushedBy\(o\)/);
    assert.match(src('src/game/Steadiness.js'), /monster\?\.active \? STEADY\.MAX/);
    assert.match(src('src/net/NetSync.js'), /mo: g\.monster\?\.netFlag\(\)/);
    assert.match(game, /monsterSamples\(\)/); // (its shaders on the loading screen)
});

test('a paw closed at a wall takes a piece of it; opened — the piece flies and lies where it fell', () => {
    const { g, ch, blocks } = fakeGame();
    g.monster.begin(); run(g, MONSTER.GROW_S + 0.2);
    ch.group.updateMatrixWorld(true);
    const at = ch.getHandWorldPosition('right', new THREE.Vector3());
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) blocks.set(`${Math.round(at.x) + dx},${Math.round(at.y) + dy + 1},${Math.round(at.z)}`, BLOCK.BRICK);
    let curl = 0;
    ch.getGripCurl = () => curl;
    g.monster.update(0.016);
    curl = 0.9; g.monster.update(0.016);
    assert.ok(g.monster.carry.right?.length >= 9, 'the bricks in the paw');
    assert.equal(blocks.get(`${Math.round(at.x)},${Math.round(at.y) + 1},${Math.round(at.z)}`), BLOCK.AIR);
    curl = 0; g.monster.update(0.016);
    assert.equal(g.monster.carry.right, null);
    assert.ok(g.monster.flying.length >= 9);
    // the ground: a floor at y 0 (layer 1)
    g.terrain.data.get = (x, L, z) => (L <= 0 ? BLOCK.STONE : blocks.get(`${x},${L},${z}`) || 0);
    for (let i = 0; i < 300 && g.monster.flying.length; i++) g.monster.update(0.016);
    assert.equal(g.monster.flying.length, 0);
    assert.ok([...blocks.values()].filter((t) => t === BLOCK.BRICK).length >= 9, 'lying again as blocks: ' + [...blocks.entries()].filter(([, t]) => t).map(([k, t]) => k + '=' + t).join(' '));
});
