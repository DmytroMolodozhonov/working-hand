// «Зелье крепкой кожи» (Skin.js): простое лезвие не берёт — ни удар, ни стрела, ни отсечение; волшебное оружие и заклинания берут; броня всё равно изнашивается; один раз; смерть снимает, «Give Me My Power» возвращает.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, matchRecipe, INGREDIENT_RU } from '../../src/game/Potions.js';
import { Skin, SKIN } from '../../src/game/Skin.js';
import { Combat } from '../../src/game/Combat.js';
import { captureLegacy, absorbLegacy, wipeHero } from '../../src/game/Legacy.js';
import { perkBits, PERK } from '../../src/game/Dread.js';

test('рецепт: свои три ингредиента (ни в одном другом зелье), одна колба', () => {
    const r = RECIPES.find((x) => x.id === 'skin');
    assert.ok(r); assert.equal(Object.keys(r.ingredients).length, 3); assert.equal(r.portions, 1);
    for (const k of Object.keys(r.ingredients)) { assert.ok(INGREDIENT_RU[k], k); assert.ok(!RECIPES.some((o) => o.id !== 'skin' && o.ingredients[k]), `${k} уже в другом зелье`); }
    assert.equal(matchRecipe(r.ingredients, Object.keys(r.ingredients))?.id, 'skin');
    assert.equal(perkBits({ skin: 1 }), PERK.SKIN);
});

function fakeGame() {
    const sparks = [], absorbed = [];
    const g = { bonus: { hp: 0, fatigue: 0 }, localId: 'A', hud: { setVoice() {}, update() {} }, perf: { note() {} }, fx: { spark: (...a) => sparks.push(a) }, sound: { playHit() {} },
        armor: { absorb: (a, k) => { absorbed.push([a, k]); return a; } }, remotes: new Map(), sparks, absorbed };
    g.skin = new Skin(g);
    return g;
}
function fakeCombat(g) {
    const taken = [];
    const c = { game: g, enabled: true, dead: false, frozen: false, shield: null, hp: 20, taken,
        die() { this.dead = true; }, center: () => ({ x: 0, y: 0, z: 0 }) };
    // (the real Combat.damage's first lines: the skin's check, then the damage is «taken»)
    c.damage = function (amount, byId, kind) { if (this.dead) return; if (this.game.skin?.shrugs(kind)) { this.game.skin.slid(amount, kind); return; } taken.push([amount, kind]); };
    c.meleeHit = Combat.prototype.meleeHit;
    return c;
}

test('простое лезвие не берёт: удар клинком игрока, рыцарь, стрела — урона нет; кулак и волшебное оружие — берут; броня изнашивается', () => {
    const g = fakeGame(); const c = fakeCombat(g);
    // без зелья — как раньше
    assert.equal(c.meleeHit(5, 'B', false, [0, 0, 0]), true);
    assert.equal(c.taken.length, 1);
    g.skin.drink();
    c.taken.length = 0; g.absorbed.length = 0;
    assert.equal(c.meleeHit(5, 'B', false, [0, 0, 0]), false, 'клинок: удар скользнул (и без толчка)');
    assert.equal(c.taken.length, 0, 'нет урона');
    assert.deepEqual(g.absorbed[0], [5, 'melee'], 'броня приняла удар');
    c.damage(3, null, 'knight'); c.damage(4, 'B', 'arrow');
    assert.equal(c.taken.length, 0, 'меч рыцаря и стрела — тоже');
    assert.equal(g.absorbed.length, 3);
    // не лезвие: кулак (без среза), огонь, укус, «Sectura»
    assert.equal(c.meleeHit(2, 'B', false, null), true); // кулак
    for (const k of ['Inferno', 'bite', 'poison', 'Slash', 'fall', 'Bombardo']) c.damage(5, null, k);
    assert.equal(c.taken.length, 1 + 6, 'кулак и всё остальное берёт');
    // волшебный клинок берёт
    assert.equal(c.meleeHit(8, 'B', true, [0, 0, 0]), true);
    assert.equal(c.taken.length, 8, 'волшебное оружие ранит');
    assert.ok(g.skin.shrugs('arrow') && !g.skin.shrugs('arrow', true) && !g.skin.shrugs('Slash'));
});

test('один раз; смерть снимает; «Give Me My Power» возвращает флаг (не удвоить)', () => {
    const g = fakeGame();
    g.maxHP = 20; g.playerHP = 20; g.combat = { enabled: false };
    assert.equal(g.skin.cantDrink(), null);
    g.skin.drink();
    assert.ok(g.skin.cantDrink());
    const rec = captureLegacy(g);
    assert.equal(rec?.skin, 1);
    wipeHero(g);
    assert.equal(g.skin.on(), false, 'смерть сняла');
    g.mana = null; g.achievements = null;
    absorbLegacy(g, rec);
    assert.equal(g.skin.on(), true, 'вернулось');
    assert.ok(g.skin.cantDrink());
});

test('слова: «Sectura» и огонь не среди лезвий; лезвия — рыцарь и стрела', () => {
    assert.ok(SKIN.BLADE_KINDS.has('knight') && SKIN.BLADE_KINDS.has('arrow'));
    assert.ok(!SKIN.BLADE_KINDS.has('Slash'));
});
