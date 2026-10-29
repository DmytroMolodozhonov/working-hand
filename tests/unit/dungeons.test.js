/**
 * Данжи (Dungeons.js, DungeonBuild.js, DungeonRuins.js): шесть развалин на земле и шесть подземелий, сундуки, проходимость, сохранения.
 * Что проверяем «а если»: данж не выходит за свою клетку, не лежит на чужой земле, на воде и у старта; к каждому сундуку можно дойти от входа
 * по настоящим блокам мира, в сундуке нет камня; старые миры и миры без данжей остаются прежними; один и тот же мир — одни и те же данжи.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, WORLD_GEN, DUNGEON_FROM_GEN } from '../../src/world/Terrain.js';
import { DUNGEON, KINDS, KIND_IDS, SURFACE_IDS, UNDER_IDS, pickKind, chestCount } from '../../src/world/DungeonRules.js';
import { DungeonIndex } from '../../src/world/Dungeons.js';
import { checkDungeon } from '../../src/world/DungeonCheck.js';
import { rollDungeonLoot } from '../../src/game/ItemTypes.js';
import { MECHANICS } from '../../src/ui/Codex.js';
import { worldHoverNote } from '../../src/game/WorldSave.js';
import { createRng } from '../../src/core/math.js';

const RECIPE = { mountains: true, seas: true, lush: true, deepCaves: true, slopes: true, wizHuts: true, furnish: true };
const world = (seed, dungeons = true) => { const t = new TerrainData(); t.generate({ seed, ...RECIPE, dungeons }); return t; };
const scan = (t, R) => { const out = []; for (let gz = -R; gz <= R; gz++) for (let gx = -R; gx <= R; gx++) { const s = t.dungeons.cellOf(gx, gz); if (s) out.push(s); } return out; };

test('six ruins on the ground (three magical, three plain, each trio small / middling / great) and six under it (three small, three middling)', () => {
    const ground = SURFACE_IDS.map((k) => KINDS[k]);
    assert.equal(ground.length, 6);
    for (const magic of [true, false]) assert.deepEqual(ground.filter((k) => k.magic === magic).map((k) => k.size).sort(), ['L', 'M', 'S']);
    const under = UNDER_IDS.map((k) => KINDS[k]);
    assert.equal(under.length, 6);
    assert.deepEqual(under.map((k) => k.size).sort(), ['M', 'M', 'M', 'S', 'S', 'S']);
    // bigger means more chests and more land
    for (const magic of [true, false]) {
        const [s, m, l] = ['S', 'M', 'L'].map((z) => ground.find((k) => k.magic === magic && k.size === z));
        assert.ok(s.zone < m.zone && m.zone < l.zone && s.chests[1] < m.chests[1] && m.chests[1] < l.chests[1]);
    }
    for (const k of KIND_IDS) { assert.ok(KINDS[k].name && KINDS[k].look && KINDS[k].chests[0] >= 1); if (KINDS[k].under) assert.ok(KINDS[k].chests[1] <= 5, 'under the ground: at most 5 chests'); }
    // the picker reaches every kind
    const seen = new Set();
    for (let i = 0; i < 400; i++) for (const u of [false, true]) seen.add(pickKind(u, (i % 20) / 20 + 0.01, Math.floor(i / 20) / 20 + 0.01));
    for (const k of KIND_IDS) assert.ok(seen.has(k), k + ' is never picked');
    for (const k of KIND_IDS) { const a = KINDS[k].chests; assert.equal(chestCount(k, 0), a[0]); assert.equal(chestCount(k, 0.9999), a[1]); }
});

test('the world is the same on every computer: same seed, same dungeons, the same blocks; the workers hand the main thread plain records', () => {
    const a = scan(world(21), 8), b = scan(world(21), 8), c = scan(world(22), 8);
    assert.ok(a.length > 15, `dungeons in the world: ${a.length}`);
    assert.deepEqual(a.map((s) => [s.id, s.type, s.x, s.z, s.F, s.rot, s.want]), b.map((s) => [s.id, s.type, s.x, s.z, s.F, s.rot, s.want]));
    assert.notDeepEqual(a.map((s) => s.id + s.type), c.map((s) => s.id + s.type));
    assert.deepEqual(a[0].ready().chests, b[0].ready().chests);
    assert.equal(a[0].ready().parts.length, b[0].ready().parts.length);
    // the record the worker sends (structured-clone safe) makes the same dungeon on the main thread
    const t = world(21), m = world(21);
    const t0 = t.dungeons.cellOf(a[0].gx, a[0].gz);
    const cx = Math.floor(a[0].gx / 2), cz = Math.floor(a[0].gz / 2);
    const sent = JSON.parse(JSON.stringify(t.dungeons.export4(cx, cz)));
    assert.equal(m.dungeons.has4(cx, cz), false);
    m.dungeons.adopt(sent);
    assert.equal(m.dungeons.has4(cx, cz), true);
    const back = m.dungeons.cellOf(a[0].gx, a[0].gz);
    assert.equal(back.id, t0.id);
    assert.deepEqual(back.ready().chests, t0.ready().chests);
});

test('placement: inside its own cell, away from the start, dry, never on another site\'s land; all kinds turn up; the great ones are rarer', () => {
    const counts = {};
    for (const seed of [5, 21, 33]) {
        const t = world(seed), list = scan(t, 10);
        for (const s of list) {
            counts[s.type] = (counts[s.type] || 0) + 1;
            const C = DUNGEON.CELL;
            assert.ok(s.x0 >= s.gx * C && s.x1 < (s.gx + 1) * C && s.z0 >= s.gz * C && s.z1 < (s.gz + 1) * C, `${s.id}: leaves its cell`);
            assert.ok(Math.hypot(s.x, s.z) >= DUNGEON.MIN_SPAWN, `${s.id}: too near the start`);
            const raw = t.rawHeight;
            raw(s.x, s.z);
            assert.ok(!raw.water && !raw.sea, `${s.id}: in the water`);
            // other sites: none of their land inside the dungeon's land
            const K = KINDS[s.type], R = K.under ? DUNGEON.PAD : K.zone;
            for (const [dx, dz] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R], [R, R], [-R, -R]]) {
                assert.ok(!t.castles.landAt(s.x + dx, s.z + dz) && !t.towers.landAt(s.x + dx, s.z + dz) && !t.villages.landAt(s.x + dx, s.z + dz) && !t.hamlets.landAt(s.x + dx, s.z + dz), `${s.id}: on a castle's / village's land`);
            }
            // its land is levelled: the ground at its middle is the plan's floor (ruins) / the yard's level (under the ground)
            assert.equal(t.heightAt(s.x, s.z), K.under ? s.land : s.F, `${s.id}: the land is not levelled`);
        }
    }
    for (const k of KIND_IDS) assert.ok(counts[k] > 0, `${k}: none in three worlds (${JSON.stringify(counts)})`);
    assert.ok(counts.ruin_fort + counts.ruin_citadel < counts.ruin_tower + counts.ruin_chapel, 'the great ones are rarer than the small ones');
});

test('every kind: chests in number, none in a block, each one can be walked to from the way in; nothing leaves its land (real blocks of a real world)', () => {
    const picked = {};
    for (const seed of [21, 5, 7]) {
        const t = world(seed);
        for (const s of scan(t, 10)) {
            if ((picked[s.type] || 0) >= 2) continue;
            picked[s.type] = (picked[s.type] || 0) + 1;
            const K = KINDS[s.type], c = checkDungeon(t, s);
            assert.deepEqual(c.problems, [], `${s.id} ${s.type}: ${c.problems.join('; ')}`);
            assert.ok(c.chests >= K.chests[0] && c.chests <= K.chests[1], `${s.type}: ${c.chests} chests (${K.chests})`);
            assert.equal(c.reached, c.chests, `${s.id}: unreachable chests`);
            const b = s.ready();
            // the chests are spread: not two in one spot, and (with three or more) not all in one room
            for (let i = 0; i < b.chests.length; i++) for (let j = i + 1; j < b.chests.length; j++) assert.ok(Math.hypot(b.chests[i].x - b.chests[j].x, b.chests[i].z - b.chests[j].z) > 4, `${s.id}: two chests together`);
            if (b.chests.length >= 3) assert.ok(new Set(b.chests.map((x) => x.room)).size >= 2, `${s.id}: all the chests in one room`);
            for (const ch of b.chests) {
                assert.equal(ch.look, K.look);
                if (K.under) assert.equal(ch.flavor, undefined, 'under the ground the chests are as a cave\'s');
                else assert.equal(ch.flavor, K.magic ? 'magic' : 'ruin');
                assert.ok(Number.isFinite(ch.x) && Number.isFinite(ch.y) && Number.isFinite(ch.z) && Number.isFinite(ch.a));
            }
        }
    }
    for (const k of KIND_IDS) assert.ok(picked[k], `${k}: not found in three worlds`);
});

test('a world of an older generation (or made without dungeons) has none and is the same land as before', () => {
    assert.ok(WORLD_GEN >= DUNGEON_FROM_GEN && DUNGEON_FROM_GEN === 15);
    const a = world(21, true), b = world(21, false);
    assert.equal(b.dungeons, null);
    assert.equal(b.sites.dungeons, null);
    assert.equal(typeof b.dungeonsNear(0, 0, 500, true).length, 'number');
    assert.equal(b.dungeonsNear(0, 0, 500).length, 0);
    // away from every dungeon the land is identical
    const list = scan(a, 6);
    let same = 0, n = 0;
    for (let x = -600; x <= 600; x += 41) for (let z = -600; z <= 600; z += 43) {
        if (list.some((s) => x >= s.x0 - 12 && x <= s.x1 + 12 && z >= s.z0 - 12 && z <= s.z1 + 12)) continue;
        n++; if (a.heightAt(x, z) === b.heightAt(x, z)) same++;
    }
    assert.ok(n > 100 && same === n, `${same} of ${n} columns the same away from the dungeons`);
    assert.match(worldHoverNote({ gen: 10 }), /данжей/);
    assert.doesNotMatch(worldHoverNote({ gen: WORLD_GEN }), /данжей/);
});

test('the chests: magical ruins hold almost only magical things (mostly scrolls), plain ones plain things and weapons, now and then a magical one', () => {
    const r = createRng(31);
    const count = (flavor, size) => {
        const c = { scroll: 0, spell: 0, pent: 0, wand: 0, magicRobe: 0, magic: 0, plain: 0, weapon: 0, food: 0, total: 0 };
        for (let i = 0; i < 4000; i++) for (const it of rollDungeonLoot(r, flavor, 3, size)) {
            c.total++;
            const isMagic = !!(it.magic || it.kind === 'scroll' || it.kind === 'wand' || it.kind === 'hammer' || it.kind === 'backpack');
            if (it.kind === 'scroll') { c.scroll++; if (it.stat === 'spell') c.spell++; if (it.stat === 'pentagram') c.pent++; assert.ok(it.stat === 'spell' || it.stat === 'pentagram', 'only spell and pentagram scrolls (no health / mana scrolls)'); }
            if (it.kind === 'wand') c.wand++;
            if (it.kind === 'robe' && it.magic) c.magicRobe++;
            if (isMagic) c.magic++; else c.plain++;
            if (it.kind === 'weapon' || it.kind === 'shield' || it.kind === 'bow' || it.kind === 'arrows' || it.kind === 'armor') c.weapon++;
            if (['bread', 'cheese', 'steak', 'pie', 'apple'].includes(it.kind)) c.food++;
        }
        return c;
    };
    for (const size of ['S', 'M', 'L']) {
        const m = count('magic', size);
        assert.ok(m.scroll / m.total > 0.55, `magic ${size}: scrolls ${(100 * m.scroll / m.total).toFixed(0)} %`);
        assert.ok(m.pent / m.total > 0.05, `magic ${size}: pentagram scrolls turn up (${(100 * m.pent / m.total).toFixed(1)} %)`);
        assert.ok(m.plain / m.total < 0.1, `magic ${size}: hardly anything plain (${(100 * m.plain / m.total).toFixed(1)} %)`);
        assert.ok(m.wand > 0);
        const p = count('ruin', size);
        assert.ok(p.weapon / p.total > 0.4, `plain ${size}: weapons, shields, armour, bows ${(100 * p.weapon / p.total).toFixed(0)} %`);
        assert.ok(p.food > 0 && p.magic / p.total > 0.05 && p.magic / p.total < 0.4, `plain ${size}: a magical thing now and then (${(100 * p.magic / p.total).toFixed(0)} %)`);
    }
    assert.equal(rollDungeonLoot(r, 'magic', 3, 'S').length, 3);
    assert.equal(rollDungeonLoot(r, 'ruin', 2, 'L').length, 2);
    assert.equal(rollDungeonLoot(r, 'ruin').length, 3);
});

test('the player\'s guide tells how to find a dungeon, what is in it and what to fear — in plain words, to «вы»', () => {
    const m = MECHANICS.find((x) => /Данжи/.test(x.title));
    assert.ok(m, 'a «Данжи» section in the mechanics');
    const text = [m.lead, ...m.points].join(' ');
    for (const word of ['развалин', 'подземель', 'сундук', 'свитк', 'Опасности', 'Где искать']) assert.match(text, new RegExp(word), word);
    assert.match(text, /вы|вас|вам/i);
});

test('the dungeon index: landAt gives the levelled ground only where a dungeon\'s land is; the ground yard of a stair is small', () => {
    const t = world(21), idx = t.dungeons;
    const list = scan(t, 6);
    const ruin = list.find((s) => !s.under), under = list.find((s) => s.under);
    assert.ok(ruin && under);
    assert.ok(idx.landAt(ruin.x, ruin.z) && idx.landAt(ruin.x, ruin.z).w === 1);
    assert.equal(idx.landAt(ruin.x + KINDS[ruin.type].zone + DUNGEON.BLEND + 3, ruin.z), null);
    assert.ok(idx.landAt(under.x, under.z).w === 1);
    assert.equal(idx.landAt(under.x + DUNGEON.PAD + DUNGEON.BLEND + 2, under.z), null, 'only the yard is levelled, the land over the halls is as it was');
    assert.ok(t.sites.landAt(ruin.x, ruin.z), 'the sites index asks it');
    assert.ok(idx.near(ruin.x, ruin.z, 5).includes(ruin));
    assert.equal(idx.byId(ruin.id), ruin);
    assert.equal(t.dungeonsNear(ruin.x, ruin.z, 20).includes(ruin), true);
    // a chunk gets its blocks: the parts the chunk's lists give
    const lists = t.sites.partsForChunk(Math.floor(ruin.x / 16), Math.floor(ruin.z / 16), 16);
    assert.ok(lists.some((l) => l.length));
});
