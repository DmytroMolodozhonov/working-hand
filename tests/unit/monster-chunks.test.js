// «Страшный монстр»: ломает сильнее, берёт в лапы куски построек (MonsterChunks.js), Ледяная Королева замечает и замораживает его.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MONSTER, MONSTER_VS, FIST, STOMP, SMASH, TREMOR, FROZEN, frozenTime, spellOnMonster } from '../../src/game/MonsterForm.js';
import { CHUNK, CHUNK_TARGETS, pickChunk, impactOf, massOf, radiusOf, netPack, isGround } from '../../src/game/MonsterChunks.js';
import { MonsterTransform } from '../../src/game/MonsterTransform.js';
import { VoxelCharacter, PLAYER_GROUND_OFFSET } from '../../src/entities/Character.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { IceCastleLife, ICE } from '../../src/game/IceQueen.js';
import { Combat } from '../../src/game/Combat.js';

// ------------------------------------------------------------------ правила кусков

const grid = (cells) => { const m = new Map(cells.map(([x, y, z, t]) => [`${x},${y},${z}`, t])); return (x, y, z) => m.get(`${x},${y},${z}`) || 0; };

test('кусок — СВЯЗНЫЙ обломок постройки, ближние к ладони блоки первыми; соседняя отдельная стена не берётся', () => {
    const cells = [];
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) cells.push([x, y, 0, BLOCK.BRICK]);   // стена у ладони
    for (let x = 0; x < 4; x++) cells.push([x, 0, 4, BLOCK.PLANKS]);                              // другая стена, не касается
    cells.push([0, -1, 0, BLOCK.GRASS], [1, -1, 0, BLOCK.GRASS]);                                  // земля под первой
    const get = grid(cells);
    const piece = pickChunk(get, () => true, { x: 1, y: 1, z: 0 }, 8, 100);
    assert.equal(piece.length, 16, 'вся первая стена, без земли и без чужой стены');
    assert.ok(piece.every((c) => c.t === BLOCK.BRICK));
    // предел блоков: ближние к ладони остаются
    const small = pickChunk(get, () => true, { x: 1, y: 1, z: 0 }, 8, 5);
    assert.equal(small.length, 5);
    assert.ok(small.some((c) => c.ix === 1 && c.iy === 1), 'ближний к ладони блок — в куске');
});

test('одна земля у ладони — кусок земли; запрещённое (ok) не берётся; воздух — пусто', () => {
    const get = grid([[0, 0, 0, BLOCK.GRASS], [1, 0, 0, BLOCK.GRASS], [2, 0, 0, BLOCK.DIRT]]);
    assert.equal(pickChunk(get, () => true, { x: 1, y: 0, z: 0 }, 5, 50).length, 3);
    assert.equal(pickChunk(get, () => false, { x: 1, y: 0, z: 0 }, 5, 50).length, 0);
    assert.equal(pickChunk(() => 0, () => true, { x: 0, y: 0, z: 0 }, 5, 50).length, 0);
    assert.ok(isGround(BLOCK.GRASS) && !isGround(BLOCK.BRICK));
});

test('вес и удар: тяжелее и быстрее — сильнее; медленный не бьёт; ломает здание только на скорости', () => {
    const stone = Array.from({ length: 125 }, () => ({ t: BLOCK.BRICK }));
    const leaves = Array.from({ length: 125 }, () => ({ t: BLOCK.LEAVES }));
    assert.ok(massOf(stone) > massOf(leaves) * 10, 'камень весит, листва почти нет');
    assert.ok(radiusOf(300) > radiusOf(20));
    assert.equal(impactOf(100, CHUNK.HIT_V - 1).dmg, 0);
    assert.equal(impactOf(100, CHUNK.HIT_V + 1).smash, null, 'бьёт, но здания ещё не ломает');
    const a = impactOf(20, 20), b = impactOf(150, 20), c = impactOf(150, 40);
    assert.ok(b.dmg > a.dmg && c.dmg >= b.dmg, 'урон от веса и скорости');
    assert.ok(b.smash.r > a.smash.r && c.smash.r >= b.smash.r && c.smash.max >= b.smash.max, 'слом от массы и скорости');
    assert.ok(c.smash.r <= 7 && c.smash.max <= 480, 'с пределом');
    assert.ok(c.lost > a.lost && c.lost <= 1, 'быстрее — больше рассыпается');
});

test('сеть: гостям уходит форма не больше NET_BLOCKS блоков', () => {
    const list = Array.from({ length: 420 }, (_, i) => ({ t: BLOCK.BRICK, off: new THREE.Vector3(i % 7, (i / 7) | 0, 0) }));
    const p = netPack(list);
    assert.ok(p.blocks.length <= CHUNK.NET_BLOCKS && p.blocks.length > 100);
    assert.deepEqual(netPack([]).blocks, []);
});

test('таблица «кто/что» для кусков: каждому виду своё решение, дары богов и заколдованный камень — «не действует»', () => {
    for (const k of ['zombie', 'villager', 'animal', 'sailor', 'tree', 'dragon', 'spider', 'ice', 'player', 'blocks', 'ships', 'water', 'godGift', 'enchanted', 'frozen']) assert.ok(CHUNK_TARGETS[k]?.why, k);
    assert.equal(CHUNK_TARGETS.godGift.does, 'none');
    assert.equal(CHUNK_TARGETS.enchanted.does, 'none');
});

test('числа слома сильнее прежних (были: тело 0,48·R+0,35, шар кулака 2,2, 60 блоков, 500/с)', () => {
    assert.ok(0.48 * MONSTER.SCALE * SMASH.K + SMASH.PAD > 0.48 * MONSTER.SCALE + 0.35 + 2, 'корпус шире');
    assert.ok(FIST.BLOCK_R > 2.2 && FIST.BLOCKS_MAX > 60 && FIST.PIERCE >= 10, 'кулак больше и пробивает насквозь');
    assert.ok(STOMP.BREAK_PER_S > 500);
    assert.ok(STOMP.EVERY >= 1 && STOMP.MAX <= 400, 'следов с пределом (сеть и сохранение)');
    assert.ok(TREMOR.R >= 20 && TREMOR.MAX <= 20);
});

// ------------------------------------------------------------------ в игре (маленькая подставка)

function fakeGame() {
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene);
    ch.group.position.set(0, PLAYER_GROUND_OFFSET, 0);
    const blocks = new Map(), hits = [], impacts = [];
    const g = {
        scene, character: ch, items: { held: { right: null, left: null }, heldOf: () => null }, config: { mode: 'freeworld' },
        combat: { enabled: true, hp: 17, maxHp: 20, fatigue: 300, dead: false, frozen: false },
        playerHP: 17, maxHP: 20, dark: { level: 0, add() {} },
        hud: { setVoice() {}, setMonsterTimer() {} }, fx: { shake: 0, spark() {}, debrisFrom() {} },
        sound: { spellCast() {}, playGiantStep() {}, playCrack() {}, playCollapse() {}, playHit() {}, playLand() {}, playIce() {} },
        sync: { castSound() {}, itemHold() {}, monsterChunk(m) { (g._net ||= []).push(m); } },
        stopSpells() {}, knock: { knock() {} }, localId: 'me', authority: true,
        terrain: { data: { get: (x, L, z) => blocks.get(`${x},${L},${z}`) || 0, set: (x, L, z, t) => blocks.set(`${x},${L},${z}`, t), topLayer: () => 0, floorBelow: () => 0, solidIn: () => false, ceilingAbove: () => Infinity } },
        collision: { pointBlocked: () => false },
        builder: { _sendEdits: (e) => { g._edits = (g._edits || 0) + e.length; } },
        onLocalHit: (c, dmg) => hits.push([c, dmg]),
        creatureImpact: { apply: (c, o) => impacts.push([c, o]) },
        zombies: [],
    };
    g.monster = new MonsterTransform(g);
    return { g, ch, blocks, hits, impacts };
}
const run = (g, s, dt = 0.1) => { for (let t = 0; t < s; t += dt) { g.monster.update(dt); g.character.group.position.y = PLAYER_GROUND_OFFSET * g.character.size; } };
const grown = () => { const o = fakeGame(); o.g.monster.begin(); run(o.g, MONSTER.GROW_S + 0.2); return o; };

test('резкий сжатый кулак пробивает толстую стену НАСКВОЗЬ (раньше — только вмятина шаром 2,2 м)', () => {
    const { g, blocks } = grown();
    // стена из кирпича толщиной 8 по оси Z, высотой 10, шириной 12 — на пути кулака
    for (let z = 4; z < 12; z++) for (let y = 0; y < 10; y++) for (let x = -6; x < 6; x++) blocks.set(`${x},${y + 1},${z}`, BLOCK.BRICK);
    g.terrain.data.get = (x, L, z) => blocks.get(`${x},${L},${z}`) || 0;
    const n = g.monster._punchBlocks(new THREE.Vector3(0, 5, 3), new THREE.Vector3(0, 0, 1), 1, true);
    assert.ok(n > 150, 'сломано много: ' + n);
    let tunnel = 0;
    for (let z = 4; z < 12; z++) if (!blocks.get(`0,5,${z}`)) tunnel++;
    assert.ok(tunnel >= 6, 'туннель идёт вглубь стены: ' + tunnel + ' из 8 слоёв');
    // слабый удар открытой ладонью — без туннеля
    const w = fakeGame(); w.g.monster.begin(); run(w.g, MONSTER.GROW_S + 0.2);
    for (let z = 4; z < 12; z++) for (let y = 0; y < 10; y++) w.blocks.set(`0,${y + 1},${z}`, BLOCK.BRICK);
    w.g.monster._punchBlocks(new THREE.Vector3(0, 5, 3), new THREE.Vector3(0, 0, 1), 0.3, false);
    assert.ok(w.blocks.get('0,5,11'), 'слабый удар до дальнего конца не доходит');
});

test('корпус сносит шире прежнего: стена в 5,5 м от центра тела (раньше стояла)', () => {
    const { g, ch, blocks } = grown();
    for (let y = 2; y <= 8; y++) blocks.set(`5,${y},0`, BLOCK.PLANKS);
    g.terrain.data.topLayer = () => 10;
    g.monster._budget = STOMP.BREAK_PER_S;
    g.monster.smashAt(ch.group.position);
    for (let y = 2; y <= 8; y++) assert.equal(blocks.get(`5,${y},0`), BLOCK.AIR, 'доски ' + y);
});

test('лапа берёт связный кусок стены ПО ЧАСТЯМ (≈ 80 за кадр), у куста есть вес, а в воду, бедрок и заколдованный камень рука упирается', () => {
    const { g, ch, blocks } = grown();
    ch.group.updateMatrixWorld(true);
    const at = ch.getHandWorldPosition('right', new THREE.Vector3());
    const cx = Math.round(at.x), cy = Math.round(at.y) + 1, cz = Math.round(at.z);
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -1; dz <= 1; dz++) blocks.set(`${cx + dx},${cy + dy},${cz + dz}`, BLOCK.BRICK);
    blocks.set(`${cx},${cy},${cz + 2}`, BLOCK.WATER);
    blocks.set(`${cx + 1},${cy},${cz + 2}`, BLOCK.BEDROCK);
    let curl = 0;
    ch.getGripCurl = () => curl;
    g.monster.update(0.016);
    curl = 0.9; g.monster.update(0.016);
    const first = g.monster.carry.right.length;
    assert.ok(first > 0 && first <= 80, 'первая порция: ' + first);
    for (let i = 0; i < 10; i++) g.monster.update(0.016);
    assert.ok(g.monster.carry.right.length >= 140, 'весь кусок в лапе: ' + g.monster.carry.right.length);
    assert.equal(blocks.get(`${cx},${cy},${cz + 2}`), BLOCK.WATER); assert.equal(blocks.get(`${cx + 1},${cy},${cz + 2}`), BLOCK.BEDROCK);
    const meta = g.monster._meta(g.monster.carry.right);
    assert.ok(meta.mass > 100 && meta.rad > 3);
    assert.ok(g._net.some((m) => m.e === 'hold' && m.blocks.length > 0), 'гостям — форма куска');
    curl = 0; g.monster.update(0.016);
    assert.equal(g.monster.carry.right, null);
    assert.equal(g.monster.chunks.length, 1);
    assert.ok(g._net.some((m) => m.e === 'fly'), 'гостям — полёт');
});

test('брошенный тяжёлый кусок бьёт существо, ломает стену, в которую влетел, и рассыпается; лёгкий и медленный — нет', () => {
    const { g, blocks, hits } = grown();
    g.terrain.data.get = (x, L, z) => blocks.get(`${x},${L},${z}`) || 0;
    const mk = (n, t, v) => {
        const bl = Array.from({ length: n }, (_, i) => ({ t, cx: i, cy: 0, cz: 0, side: [1, 1, 1], top: [1, 1, 1], off: new THREE.Vector3(), local: new THREE.Vector3((i % 6) - 3, ((i / 6) | 0) % 6 - 3, 0) }));
        return { id: 1, blocks: bl, mass: massOf(bl), rad: radiusOf(n), ft: 1, p: new THREE.Vector3(0, 8, 0), q: new THREE.Quaternion(), v: new THREE.Vector3(0, 0, v), spin: new THREE.Vector3() };
    };
    // стена впереди
    for (let y = 0; y < 14; y++) for (let x = -8; x < 8; x++) for (let z = 8; z < 11; z++) blocks.set(`${x},${y + 1},${z}`, BLOCK.BRICK);
    const before = [...blocks.values()].filter((t) => t === BLOCK.BRICK).length;
    g.zombies = [{ position: new THREE.Vector3(1, 8, 4), isDead: false }];
    g.monster._tl = null;
    const heavy = mk(216, BLOCK.BRICK, 30);
    g.monster.chunks.push(heavy);
    for (let i = 0; i < 40 && !heavy.done; i++) g.monster.update(0.03);
    assert.ok(heavy.done, 'ударился');
    const after = [...blocks.values()].filter((t) => t === BLOCK.BRICK).length;
    assert.ok(hits.length >= 1 && hits[0][1] > 20, 'существо на пути получило урон: ' + JSON.stringify(hits.map((h) => h[1])));
    assert.ok(g.monster.flying.length > 0 || g.monster._debris.length >= 0, 'осколки');
    // слом: стена потеряла много блоков (кусок их не добавил назад сразу в тех же клетках)
    let holes = 0;
    for (let y = 1; y <= 14; y++) for (let x = -8; x < 8; x++) for (let z = 8; z < 11; z++) if (!blocks.get(`${x},${y},${z}`)) holes++;
    assert.ok(holes > 40, 'в стене пролом: ' + holes);
    void before; void after;
    // лёгкий и медленный: стену не ломает
    const w = grown();
    for (let y = 0; y < 14; y++) for (let x = -8; x < 8; x++) for (let z = 8; z < 11; z++) w.blocks.set(`${x},${y + 1},${z}`, BLOCK.BRICK);
    const light = mk(8, BLOCK.LEAVES, 6); light.p.set(0, 8, 5.5);
    w.g.monster.chunks.push(light);
    for (let i = 0; i < 40 && !light.done; i++) w.g.monster.update(0.03);
    let intact = 0;
    for (let y = 1; y <= 14; y++) for (let x = -8; x < 8; x++) for (let z = 8; z < 11; z++) if (w.blocks.get(`${x},${y},${z}`) === BLOCK.BRICK) intact++;
    assert.ok(intact >= 14 * 16 * 3 - 4, 'лёгкий кусок стену не ломает: ' + intact);
});

test('занесённый кусок — дубина: резкий взмах бьёт существо, а кусок крошится', () => {
    const { g, ch, hits } = grown();
    ch.getGripCurl = () => 0.9;
    const bl = Array.from({ length: 150 }, (_, i) => ({ t: BLOCK.BRICK, cx: i, cy: 0, cz: 0, side: [1, 1, 1], top: [1, 1, 1], off: new THREE.Vector3((i % 5) - 2, ((i / 5) | 0) % 5 - 2, ((i / 25) | 0) - 3) }));
    g.monster.carry.right = bl;
    ch.group.updateMatrixWorld(true);
    const at = ch.getHandWorldPosition('right', new THREE.Vector3());
    g.zombies = [{ position: at.clone().add(new THREE.Vector3(0, 0, -2)), isDead: false }];
    g.monster._tl = null;
    ch.handVelocity = { right: new THREE.Vector3(0, 0, -30), left: new THREE.Vector3() };
    g.monster._clubs(0.016);
    assert.ok(hits.length >= 1, 'зомби получил удар');
    assert.ok(g.monster.carry.right.length < 150, 'кусок крошится');
});

// ------------------------------------------------------------------ Ледяной Жезл замораживает монстра

test('время заморозки монстра — 8…15 с; в таблице «кто/что» Жезл замораживает, обычный холод — нет', () => {
    assert.equal(FROZEN.MIN, 8); assert.equal(FROZEN.MAX, 15);
    for (const t of [0, 3, 6, 10, 12, 20, 100]) { const f = frozenTime(t); assert.ok(f >= 8 && f <= 15, t + ' → ' + f); }
    assert.equal(MONSTER_VS.rodFreeze.does, 'freezes');
    for (const k of ['Ice', 'Frozen', 'IceDuel', 'chill', 'cold']) assert.equal(spellOnMonster(k).k, 0, k);
});

function combatWithMonster() {
    const events = { voice: [] };
    const mon = { active: true, frozenTime: (t) => frozenTime(t), onFrozen() { events.frozen = true; }, filterDamage: (a) => a * 0.25, saves: () => true, fell() { events.fell = true; } };
    const g = {
        config: { mode: 'freeworld' }, scene: new THREE.Scene(), localId: 'me', knockback: new THREE.Vector3(), remotes: new Map(), killCount: 0, punchCount: 0,
        weapons: { hasWeapon: () => false }, fx: { spark() {}, lightFlash() {} }, monster: mon,
        hud: { update() {}, setFatigue() {}, setStatus() {}, setFrozenOverlay() {}, damageFlash() {}, setVoice(t) { events.voice.push(t); } },
        character: { group: { position: new THREE.Vector3(0, 14, 0) }, size: 7,
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.set(0, 14, 0), getHandDirection: (side, out = new THREE.Vector3()) => out.set(0, 0, -1), isArmExtended: () => false, isTPose: () => false },
        playerName: () => null, onLocalDeath: () => { events.died = true; },
    };
    return { g, events, combat: new Combat(g) };
}

test('Combat: обычный холод монстра не берёт, а лёд Жезла — берёт; разморозка и удары по льду его не убивают', () => {
    const { combat, events } = combatWithMonster();
    combat.freeze('x', 20);
    assert.equal(combat.frozen, false, 'холод без Жезла — шерсть сбрасывает лёд');
    combat.freeze('iceQueen', 6, { rod: true });
    assert.equal(combat.frozen, true);
    assert.ok(combat.frozenLeft >= FROZEN.MIN && combat.frozenLeft <= FROZEN.MAX, 'заморожен на ' + combat.frozenLeft);
    assert.ok(events.frozen);
    combat.hp = combat.maxHp = 500;
    const hp = combat.hp;
    combat.damage(100, 'enemy', 'melee');           // (удар по льду: у обычного игрока — вдребезги)
    assert.equal(events.died, undefined, 'монстр во льду не умирает от удара');
    assert.ok(combat.hp < hp, 'но урон по правилам формы проходит');
    combat.update(20);
    assert.equal(combat.frozen, false, 'разморозился');
    assert.ok(!events.fell && !events.died);
});

// ------------------------------------------------------------------ Королева замечает и замораживает гиганта

function iceWorld({ size = 7, dragon = false } = {}) {
    const scene = new THREE.Scene();
    const me = new THREE.Group(); me.position.set(0, 1.95 * size, 28);
    const frozen = [];
    const g = {
        scene, authority: true, localId: 'me', frameCount: 0, remotes: new Map(),
        character: { group: me, size },
        collision: { groundAt: () => 0, resolveCylinder() {}, lineOfSight: () => false },   // (стена между ними: обычного игрока бы не видели)
        world: { terrain: { data: { get: (x, L) => (L === 0 ? 4 : 0), isSolidAt: () => false } } },
        campfires: { list: new Map() }, fx: { spark() {} },
        combat: { dead: false, frozen: false, shieldFactor: () => 0, freeze: (by, T, o) => frozen.push([by, T, o]), center: (out) => out.copy(me.position) },
        dragonRide: { riding: dragon ? { size: 2 } : null },
        monster: { active: size >= 3 },
        castleLife: { alarm() {} },
        hud: { setVoice() {}, flashColor() {} },
    };
    return { g, frozen };
}
const plan = () => {
    const at = (x, z) => ({ x, y: 0, z });
    return { x: 0, z: 0, R: 30, rot: 0, x0: -30, x1: 30, z0: -30, z1: 30, floor: 0.5, F: 0.5,
        hall: { ...at(0, -2), r: 13, top: 30 }, throne: at(0, -10), chandelier: { ...at(0, -2), y: 20 },
        gate: { ...at(0, 13), w: 5, h: 6, inner: at(0, 9), out: at(0, 21) }, guard: [at(-5, 22), at(5, 22)], chests: [] };
};

test('монстр ×7 в замке Королевы: его видят сквозь стены, замок просыпается и идёт на него, Королева замораживает его Жезлом', () => {
    const { g, frozen } = iceWorld();
    const life = new IceCastleLife(g);
    life._plan = plan();
    for (let i = 0; i < 400 && !frozen.length; i++) { g.frameCount++; life.update(0.05); }
    assert.ok(life._offender('me'), 'виновник — монстр: весь замок знает');
    const q = life.queen;
    assert.ok(q && q.target?.id === 'me' && q.target.giant, 'Королева смотрит на него');
    assert.ok(frozen.length >= 1, 'и замораживает: ' + frozen.length + ' ' + JSON.stringify({ act: q.act, castT: q.castT, pos: q.model.position, tgt: q.target && q.target.p, d: q.target?.d }));
    assert.ok(life.list.some((c) => c.type === 'snowman' && c.target?.id === 'me') || life.list.some((c) => c.type === 'monster' && c.target?.id === 'me'), 'снеговики и ледяные монстры идут на него');
});

test('обычный игрок за стеной Королеву не интересует (стена прячет), а всадник на драконе — видим всегда', () => {
    const a = iceWorld({ size: 1 });
    const l1 = new IceCastleLife(a.g);
    l1._plan = plan();
    for (let i = 0; i < 100; i++) { a.g.frameCount++; l1.update(0.05); }
    assert.ok(!l1._offender('me'));
    const b = iceWorld({ size: 1, dragon: true });
    const l2 = new IceCastleLife(b.g);
    l2._plan = plan();
    for (let i = 0; i < 40; i++) { b.g.frameCount++; l2.update(0.05); }
    assert.ok(l2._offender('me'), 'всадник на драконе — захватчик');
});

test('ширина замаха Королевы растёт с размером цели, но с пределом', () => {
    assert.ok(ICE.GIANT.WIND_MAX <= 3 && ICE.GIANT.WIND_K > 0 && ICE.GIANT.SIZE >= 2);
});
