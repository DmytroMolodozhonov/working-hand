// Хозяин большой лавки (ShopHallLife): раскладывает товары по полкам, на «сколько стоит…» идёт к полке и называет цену, на «да» берёт монеты,
// несёт покупку и отдаёт в руку; денег мало — не продаёт; гость ушёл — покупка остаётся на прилавке; выученный свиток не продаёт.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainData } from '../../src/world/Terrain.js';
import { ShopHallLife } from '../../src/game/ShopHallLife.js';
import { potionPrice } from '../../src/game/ShopHallGoods.js';

let site = null;
function village() {
    if (!site) { const t = new TerrainData(); t.generate({ seed: 4242, mountains: true, wizShops: true }); site = t.villages.spawnVillage(); }
    return site;
}

function fakeGame({ coins = 10000, known = null } = {}) {
    const def = village();
    const loose = new Map(), said = [], got = [];
    const g = {
        authority: true, localId: 'me', now: () => 0,
        character: { group: { position: new THREE.Vector3() } },
        hud: { setVoice() {} },
        inventory: { c: coins, coins() { return this.c; }, spendCoins(n) { if (this.c < n) return false; this.c -= n; return true; }, _render() {} },
        knownScrollFn: () => known,
        cauldrons: { list: new Map(), paid() {} },
        items: {
            loose, held: { right: null, left: null },
            spawnLoose(item, pos) { const L = { item, model: { position: pos.clone() }, vel: new THREE.Vector3(), spin: new THREE.Vector3() }; loose.set(item.uid, L); return L; },
            removeLoose(uid) { const L = loose.get(uid); loose.delete(uid); return L?.item; },
            pickUp(uid, to, side) { const L = loose.get(uid); if (!L) return; if (L.item.shop && !L.item.shop.paid) return; loose.delete(uid); delete L.item.shop; got.push({ item: L.item, side }); },
        },
    };
    const cs = { def, awake: true, active: new Map() };
    const life = {
        castles: new Map([[def.id, cs]]),
        _say(v, t) { said.push(t); },
        _ground() {},
        _steer(v, tx, tz, speed, dt, stopAt = 0) { // (straight on, as fast as asked)
            const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
            v.yaw = Math.atan2(-dx, -dz);
            if (d <= stopAt) { v.speed = 0; return d; }
            const s = Math.min(d - stopAt, speed * dt);
            v.x += dx / d * s; v.z += dz / d * s; v.speed = speed;
            return d - s;
        },
        rel: { bump() {} },
        talk: { _merchantOf: (d, i) => (i === keeper.entry.stall ? keeper : null) },
    };
    g.castleLife = life;
    const hall = def.halls.find((h) => h.kind === 'potions');
    const st = def.stalls[hall.stall];
    const keeper = { id: 'k', role: 'seller', job: 'stall', cs, entry: { stall: hall.stall }, x: st.back.x, y: st.back.y, z: st.back.z, yaw: 0, model: {} };
    return { g, def, hall, keeper, said, got, st };
}

function run(life, keeper, sec, g) { for (let t = 0; t < sec; t += 0.05) { life.update(0.05); life.step(keeper, 0.05); } void g; }

test('the shelves fill with every potion, the keeper shows the asked one, names its price, sells it and brings it into the hand', () => {
    const { g, hall, keeper, said, got } = fakeGame();
    const me = g.character.group.position;
    me.set(hall.inside.x, hall.inside.y, hall.inside.z);
    const life = new ShopHallLife(g);
    for (let i = 0; i < 80; i++) life.update(0.31); // (a few goods a look)
    const goods = [...g.items.loose.values()].filter((L) => L.item.shop?.stall === g.castleLife.castles.values().next().value.def.id + ':s' + hall.stall); // (the scroll hall near fills too)
    assert.ok(goods.length >= 40, `goods on the shelves (${goods.length})`);
    const odd = goods.find((L) => !(L.rest && L.item.shop?.hall === 'potions')); assert.ok(!odd, 'lying still, priced, the hall’s: ' + JSON.stringify(odd?.item));
    // the hero came in: the keeper greets him and comes up
    run(life, keeper, 8, g);
    assert.ok(said.some((t) => /лавк/i.test(t)), 'a greeting');
    assert.ok(Math.hypot(keeper.x - me.x, keeper.z - me.z) < 3.5, 'the keeper came up');
    // «сколько стоит зелье удачи»: the price, the good shown
    const r = life.hear(keeper, 'сколько стоит зелье удачи');
    assert.match(r, new RegExp(String(potionPrice('luck'))));
    assert.equal(life.offer.kind, 'good');
    const L = g.items.loose.get(life.offer.uids[0]);
    assert.equal(L.item.rec, 'luck');
    run(life, keeper, 12, g);
    assert.ok(Math.hypot(keeper.x - L.model.position.x, keeper.z - L.model.position.z) < 2.6, 'he went to its shelf');
    // «да»: the coins taken, he brings it into the hand
    const r2 = life.hear(keeper, 'да, беру');
    assert.ok(r2);
    assert.equal(g.inventory.c, 10000 - potionPrice('luck'));
    run(life, keeper, 25, g);
    assert.equal(got.length, 1, 'given into the hand');
    assert.equal(got[0].item.rec, 'luck');
    assert.ok(!got[0].item.shop, 'his: no price on it');
});

test('not enough coins: nothing sold; flasks by number; the hero gone — the paid good lies on the counter', () => {
    const { g, hall, keeper, got, st } = fakeGame({ coins: 30 });
    const me = g.character.group.position;
    me.set(hall.inside.x, hall.inside.y, hall.inside.z);
    const life = new ShopHallLife(g);
    for (let i = 0; i < 80; i++) life.update(0.31);
    assert.match(life.hear(keeper, 'почём зелье исцеления'), /700/);
    assert.match(life.hear(keeper, 'да'), /Не хватает 670/);
    assert.equal(g.inventory.c, 30, 'no coin taken');
    assert.match(life.hear(keeper, 'дайте одну колбу'), /20 монет/);
    life.hear(keeper, 'да');
    assert.equal(g.inventory.c, 10);
    me.set(hall.door.x + 30, hall.door.y, hall.door.z + 30); // (went away)
    run(life, keeper, 20, g);
    assert.equal(got.length, 0);
    const onCounter = [...g.items.loose.values()].filter((L) => L.item.kind === 'flask' && !L.item.shop);
    assert.equal(onCounter.length, 1, 'the paid flask lies on the counter');
    const p = onCounter[0].model.position;
    assert.ok(p.x >= st.counter.x0 - 0.5 && p.x <= st.counter.x1 + 0.5 && p.z >= st.counter.z0 - 0.5 && p.z <= st.counter.z1 + 0.5);
});

test('the scroll hall: a known scroll is not sold, a dark spell is refused', () => {
    const def = village();
    const { g, keeper } = fakeGame({ known: (it) => it.spell === 'ToTheSun' });
    const hall = def.halls.find((h) => h.kind === 'scrolls');
    keeper.entry.stall = hall.stall;
    g.character.group.position.set(hall.inside.x, hall.inside.y, hall.inside.z);
    const life = new ShopHallLife(g);
    for (let i = 0; i < 80; i++) life.update(0.31);
    assert.ok([...g.items.loose.values()].every((L) => L.item.spell !== 'ToTheSun'), 'a scroll the stocker knows is not laid out');
    assert.match(life.hear(keeper, 'покажите свиток ту зе сан'), /уже знаете/);
    assert.match(life.hear(keeper, 'продайте авада кедавра'), /Чёрной магии/);
    assert.match(life.hear(keeper, 'сколько стоит свиток лайтнинг страйк'), /монет/);
});
