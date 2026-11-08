// Все заклинания богов лежат в библиотеке Храма богов на Венере (автор 07.11: «перепроверь… и будущие тоже — обязательно»):
// каждое божественное заклинание — свиток на своём постаменте, нигде больше (ни в сундуках, ни в лавках), с цветом ленты, строкой для игрока и карточкой «Боги» в справочнике.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLE_SCROLLS, templePlan } from '../../src/world/GodsTemple.js';
import { GOD_SPELLS } from '../../src/game/Mana.js';
import { DIVINE_SPELLS } from '../../src/game/ProtectionGods.js';
import { TEMPLE_SCROLL_LINE, SCROLL_SPELL_COLOR, SCROLL_RIBBON_RU, SCROLL_WEIGHTS, SPELL_RU } from '../../src/game/ItemTypes.js';
import { SHOP_SPELLS } from '../../src/game/WizardShop.js';
import { SPELLS } from '../../src/ui/Codex.js';

const NOT_SCROLLS = new Set(['FlyingMaxima']); // («Flying Maxima» — дар богов при 1000 ячейках маны, без свитка)

test('божественные заклинания = свитки храма (+ Flying Maxima); у каждого постамент, строка, цвет и лента', () => {
    assert.equal(new Set(TEMPLE_SCROLLS).size, TEMPLE_SCROLLS.length, 'без повторов');
    for (const s of TEMPLE_SCROLLS) { assert.ok(GOD_SPELLS.has(s), s + ' — божественное'); assert.ok(DIVINE_SPELLS.has(s), s + ' — божественное для щитов и боссов'); }
    for (const s of GOD_SPELLS) assert.ok(TEMPLE_SCROLLS.includes(s) || NOT_SCROLLS.has(s), s + ' — божественное, но свитка в храме нет: добавьте в GodsTemple.TEMPLE_SCROLLS и постамент');
    assert.deepEqual(Object.keys(TEMPLE_SCROLL_LINE).sort(), [...TEMPLE_SCROLLS].sort(), 'у каждого свитка храма есть строка для игрока (ItemTypes.TEMPLE_SCROLL_LINE) и лишних нет');
    for (const s of TEMPLE_SCROLLS) { assert.ok(SCROLL_SPELL_COLOR[s], s + ': цвет ленты'); assert.ok(SCROLL_RIBBON_RU[s], s + ': лента словами'); }
    const plan = templePlan();
    assert.equal(plan.pedestals.length, TEMPLE_SCROLLS.length, 'по постаменту на свиток');
    for (const s of TEMPLE_SCROLLS) assert.equal(plan.pedestals.filter((p) => p.spell === s).length, 1, s + ': ровно один постамент');
    for (const a of plan.pedestals) for (const b of plan.pedestals) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 1.9, `${a.spell} и ${b.spell} слиплись`);
});

test('свитки богов — только в храме: не в сундуках и не в лавках', () => {
    const weights = new Set(SCROLL_WEIGHTS.map((w) => (Array.isArray(w) ? w[0] : w)));
    const shop = new Set(SHOP_SPELLS);
    for (const s of TEMPLE_SCROLLS) { assert.ok(!weights.has(s), s + ' выпадает в сундуках'); assert.ok(!shop.has(s), s + ' продаётся'); }
});

test('карточки вкладки «Боги» в справочнике — только заклинания богов', () => {
    const godNames = new Set([...TEMPLE_SCROLLS.map((s) => SPELL_RU[s] || s), 'Flying Maxima']);
    for (const c of SPELLS.filter((q) => q.cat === 'gods')) {
        const ok = godNames.has(c.name) || [...godNames].some((n) => n.toLowerCase() === c.name.toLowerCase());
        assert.ok(ok, `«${c.name}» в «Боги», но не заклинание богов`);
    }
    for (const s of TEMPLE_SCROLLS) assert.ok(SPELLS.some((c) => c.cat === 'gods' && (c.name === (SPELL_RU[s] || s) || c.name.toLowerCase() === (SPELL_RU[s] || s).toLowerCase())), s + ': нет карточки в «Боги»');
});
