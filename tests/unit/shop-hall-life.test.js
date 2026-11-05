// Большая лавка (ShopHallLife): полки заполняются; продавец на названный товар идёт к полке и «Вингардиум Левиоса» переносит его на свой
// прилавок; оплата — мешочек на прилавке и «беру» (обычная оплата CastleTalk.pay со сдачей); неоплаченное возвращается на полку, когда герой
// ушёл; вынесенный без оплаты товар — кража (охранник зовёт); купленное место пополняется только на следующий день; комната ингредиентов.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainData } from '../../src/world/Terrain.js';
import { ShopHallLife } from '../../src/game/ShopHallLife.js';
import { potionPrice, ingredientPrice } from '../../src/game/ShopHallGoods.js';

let site = null;
function village() {
    if (!site) { const t = new TerrainData(); t.generate({ seed: 4242, mountains: true, wizShops: true }); site = t.villages.spawnVillage(); }
    return site;
}

function fakeGame({ kind = 'potions', known = null } = {}) {
    const def = village();
    const loose = new Map(), said = [], crimes = [], paid = [];
    const g = {
        authority: true, localId: 'me', isNight: false,
        character: { group: { position: new THREE.Vector3() } },
        hud: { setVoice() {} },
        inventory: { c: 10000, coins() { return this.c; }, spendCoins(n) { if (this.c < n) return false; this.c -= n; return true; }, _render() {} },
        knownScrollFn: () => known,
        cauldrons: { list: new Map(), paid() {} },
        items: {
            loose, held: { right: null, left: null },
            spawnLoose(item, pos) { const L = { item, model: { position: pos.clone() }, vel: new THREE.Vector3(), spin: new THREE.Vector3() }; loose.set(item.uid, L); return L; },
            removeLoose(uid) { const L = loose.get(uid); loose.delete(uid); return L?.item; },
            pickUp(uid) { loose.delete(uid); },
        },
    };
    const cs = { def, awake: true, active: new Map() };
    const hall = def.halls.find((h) => h.kind === kind);
    const st = def.stalls[hall.stall];
    const mk = (id, stall) => ({ id, role: 'seller', job: 'stall', cs, entry: { stall }, x: def.stalls[stall].back.x, y: def.stalls[stall].back.y, z: def.stalls[stall].back.z, yaw: 0, model: {} });
    const keeper = mk('k', hall.stall);
    const potions = def.halls.find((h) => h.kind === 'potions');
    const guard = mk('g', potions.guard);
    let purse = null;
    const talk = {
        stalls: new Map(),
        _merchantOf: (d, i) => (i === keeper.entry.stall ? keeper : null),
        _pursePay: () => purse,
        pay(coinUid, goodUid) { paid.push(goodUid); const L = loose.get(goodUid); L.item.shop.paid = true; },
    };
    const life = {
        castles: new Map([[def.id, cs]]), byId: new Map([['k', keeper], ['g', guard]]), talk,
        _say(v, t) { said.push(t); },
        _ground() {},
        _steer(v, tx, tz, speed, dt, stopAt = 0) {
            const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
            v.yaw = Math.atan2(-dx, -dz);
            if (d <= stopAt) { v.speed = 0; return d; }
            const s = Math.min(d - stopAt, speed * dt);
            v.x += dx / d * s; v.z += dz / d * s; v.speed = speed;
            return d - s;
        },
        rel: { bump() {} },
        reportCrime(v, by, k) { crimes.push([v.id, by, k]); },
    };
    g.castleLife = life;
    return { g, def, hall, keeper, guard, said, crimes, paid, st, setPurse: (p) => { purse = p; } };
}

function run(sh, people, sec) { for (let t = 0; t < sec; t += 0.05) { sh.update(0.05); for (const v of people) sh.step(v, 0.05); } }
const onCounter = (st, p) => p.x >= st.counter.x0 - 0.7 && p.x <= st.counter.x1 + 0.7 && p.z >= st.counter.z0 - 0.7 && p.z <= st.counter.z1 + 0.7;

test('a potion asked: «Левиоса» to the counter, paid with the pouch on the counter; its place refills only the next day', () => {
    const { g, hall, keeper, guard, said, paid, st, setPurse } = fakeGame();
    const me = g.character.group.position;
    me.set(hall.inside.x, hall.inside.y, hall.inside.z);
    const sh = new ShopHallLife(g);
    for (let i = 0; i < 80; i++) sh.update(0.31);
    run(sh, [keeper, guard], 6);
    assert.ok(said.length >= 1, 'greeted');
    const r = sh.hear(keeper, 'хочу купить зелье удачи');
    assert.match(r, new RegExp(String(potionPrice('luck'))));
    const uid = sh.offer.uids[0], L = g.items.loose.get(uid);
    run(sh, [keeper, guard], 20);
    assert.ok(said.includes('Вингардиум Левиоса!'), 'the spell said');
    assert.ok(L.onCounter && onCounter(st, L.model.position), 'the potion lies on his counter');
    assert.ok(g.castleLife.talk.stalls.get(`${village().id}:s${hall.stall}`).goods.includes(uid), 'a good of his stall: the usual payment');
    assert.equal(sh.hear(keeper, 'беру'), 'Кладите мешочек с монетами на прилавок — сдачу верну.', 'no pouch yet');
    setPurse({ item: { uid: 'pouch' } });
    assert.equal(sh.hear(keeper, 'да'), true, 'paid the usual way (CastleTalk.pay: the change on the counter)');
    assert.deepEqual(paid, [uid]);
    g.items.loose.delete(uid); // (the hero takes it)
    const count = () => [...g.items.loose.values()].filter((x) => x.item.rec === 'luck').length;
    for (let i = 0; i < 10; i++) sh.update(0.31);
    const before = count();
    for (let i = 0; i < 40; i++) sh.update(0.31);
    assert.equal(count(), before, 'not refilled the same day');
    g.isNight = true; sh.update(0.1); g.isNight = false; // (a night passes — the morning)
    for (let i = 0; i < 40; i++) sh.update(0.31);
    assert.equal(count(), before + 1, 'refilled the next day');
});

test('not paid and the hero left: back on its shelf; a good carried out of the shop — a theft', () => {
    const { g, hall, keeper, guard, crimes, said } = fakeGame();
    const me = g.character.group.position;
    me.set(hall.inside.x, hall.inside.y, hall.inside.z);
    const sh = new ShopHallLife(g);
    for (let i = 0; i < 80; i++) sh.update(0.31);
    sh.hear(keeper, 'дайте зелье исцеления');
    const L = g.items.loose.get(sh.offer.uids[0]), home = L.model.position.clone();
    run(sh, [keeper, guard], 20);
    assert.ok(L.onCounter);
    me.set(hall.door.x + 40, hall.door.y, hall.door.z + 40); // (went away)
    run(sh, [keeper, guard], 4);
    assert.ok(!L.onCounter && L.model.position.distanceTo(home) < 0.3, 'back on its shelf');
    // something (Акцио) carried a good out of the shop
    const X = [...g.items.loose.values()].find((x) => x.item.shop && !x.onCounter);
    X.model.position.set(hall.door.x + 20, hall.door.y, hall.door.z + 20);
    me.set(hall.inside.x, hall.inside.y, hall.inside.z);
    run(sh, [keeper, guard], 1);
    assert.equal(crimes.length, 1, 'the guard calls it a theft');
    assert.equal(crimes[0][0], 'g');
    assert.ok(said.some((t) => /Вор|Стой/.test(t)));
});

test('a good moved inside the shop flies back; the ingredients’ room: prices 100…700, no dragon egg; a dark spell and a known scroll refused', () => {
    const A = fakeGame({ kind: 'ingredients' });
    A.g.character.group.position.set(A.hall.inside.x, A.hall.inside.y, A.hall.inside.z);
    const sh = new ShopHallLife(A.g);
    for (let i = 0; i < 80; i++) sh.update(0.31);
    const ing = [...A.g.items.loose.values()].filter((x) => x.item.shop?.hall === 'ingredients');
    assert.ok(ing.length >= 28, `every ingredient on the shelves (${ing.length})`);
    assert.ok(ing.every((x) => x.item.kind !== 'dragonEgg' && x.item.shop.price >= 100 && x.item.shop.price <= 700));
    assert.match(sh.hear(A.keeper, 'сколько стоит перо феникса'), new RegExp(String(ingredientPrice('phoenixFeather'))));
    assert.match(sh.hear(A.keeper, 'продайте яйцо дракона'), /не держим/);
    const X = ing.find((x) => x.item.kind === 'wool'), home = X.model.position.clone();
    X.model.position.x += 2; // (pushed off its place)
    run(sh, [A.keeper, A.guard], 7);
    assert.ok(X.model.position.distanceTo(home) < 0.3, 'back on its place');
    const B = fakeGame({ kind: 'scrolls', known: (it) => it.spell === 'ToTheSun' });
    B.g.character.group.position.set(B.hall.inside.x, B.hall.inside.y, B.hall.inside.z);
    const s2 = new ShopHallLife(B.g);
    for (let i = 0; i < 80; i++) s2.update(0.31);
    assert.match(s2.hear(B.keeper, 'покажите свиток ту зе сан'), /уже знаете/);
    assert.match(s2.hear(B.keeper, 'продайте авада кедавра'), /Чёрной магии/);
    const C = fakeGame();
    C.g.character.group.position.set(C.hall.inside.x, C.hall.inside.y, C.hall.inside.z);
    const s3 = new ShopHallLife(C.g);
    for (let i = 0; i < 80; i++) s3.update(0.31);
    assert.match(s3.hear(C.keeper, 'сколько стоит зелье превращения в дракона'), /не продаём/);
    assert.match(s3.hear(C.keeper, 'дайте три колбы'), /60 монет/);
});

test('«хочу купить» with no good made out: the words over every good near — then the buyer names one', () => {
    const { g, hall, keeper } = fakeGame();
    g.character.group.position.set(hall.inside.x, hall.inside.y, hall.inside.z);
    const sh = new ShopHallLife(g);
    for (let i = 0; i < 80; i++) sh.update(0.31);
    const texts = new Map();
    sh.labels(texts);
    assert.equal(texts.size, 0, 'no words before asking');
    assert.match(sh.hear(keeper, 'хочу купить зелье'), /название/);
    sh.labels(texts);
    assert.ok(texts.size >= 5, `words over the goods near (${texts.size})`);
    assert.ok([...texts.values()].every((t) => t && !/^Зелье /.test(t)), 'short names: «Удачи», «Колба»…');
});
