// A villager's character, his attitude to the player, the player's standing — and whether he does what he is asked
// (the author: «у жителей характер от 0 до 100… отношение растёт или падает… король — стараются подчиняться,
// но бывают и те, кто не подчиняется; рыцари подчиняются всегда»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { characterOf, startAttitude, willDo } from '../../src/game/Attitude.js';
import { TownNews } from '../../src/game/TownNews.js';

const share = (kind, status, role = 'farmer') => {
    let y = 0;
    for (let i = 0; i < 1000; i++) {
        const c = characterOf(i * 7919, role);
        if (willDo(kind, { c, att: startAttitude(c, i * 7919), status, role }, (i % 10) / 10 + 0.05).yes) y++;
    }
    return y / 1000;
};

test('the same villager has the same character every time; traits are 0–100', () => {
    assert.deepEqual(characterOf(42, 'farmer'), characterOf(42, 'farmer'));
    for (const v of Object.values(characterOf(7, 'merchant'))) assert.ok(v >= 0 && v <= 100);
    assert.ok(characterOf(9, 'knight').obedience >= 88);
});

test('who helps whom: a stranger — about half; the king — nearly all, a stubborn few not; knights always; a wanted man — nobody', () => {
    const s = share('serve', 'traveller');
    assert.ok(s > 0.3 && s < 0.7, `stranger ${s}`);
    const k = share('serve', 'king');
    assert.ok(k > 0.85 && k < 1, `king ${k}`);
    assert.equal(share('serve', 'king', 'knight'), 1);
    assert.equal(share('army', 'traveller', 'knight'), 0);
    assert.equal(share('serve', 'outlaw'), 0);
    assert.ok(share('favor', 'traveller') > share('serve', 'traveller'));
    assert.equal(willDo('serve', { c: characterOf(1), status: 'traveller', guest: true }).yes, true); // (the Creative guest)
});

test('town news: what happened, merged when repeated, and who did it only if seen', () => {
    let t = 0;
    const n = new TownNews({ now: () => t });
    n.add('c1', 'blast', { by: 'p1', byName: 'Дима', seen: true });
    t += 1000;
    n.add('c1', 'blast', { by: 'p1', byName: 'Дима', seen: true });
    n.add('c1', 'fire', { by: 'p2', seen: false });
    const told = n.told('c1', 'p1');
    assert.equal(told.length, 2);
    assert.match(told[0], /несколько взрывов.*твой собеседник/);
    assert.match(told[1], /пожар.*никто не видел/);
    t += 31 * 60e3;
    assert.equal(n.told('c1').length, 0); // (old news is forgotten)
});
