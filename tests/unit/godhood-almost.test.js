/** «Почти стал богом» (автор 08.11: «ничего не происходит»): десять секунд идут с того момента, как мир ПОКАЗАН игроку, а не за экраном загрузки. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Godhood } from '../../src/game/Godhood.js';

function make(revealed) {
    const toasts = [];
    const g = { revealed, hud: { toast: (t) => toasts.push(t) }, character: { group: { position: { clone() { return this; } } } }, sound: {}, renderer: null };
    const G = new Godhood(g);
    G.ascend = (test) => { G._ascended = test; };
    G.almostT = 10; G._almostToast = true;
    return { G, toasts };
}

test('behind the loading screen the ten seconds do not run and nothing is said', () => {
    const { G, toasts } = make(false);
    for (let i = 0; i < 300; i++) G.update(0.1);
    assert.equal(G.almostT, 10);
    assert.equal(G._ascended, undefined);
    assert.equal(toasts.length, 0);
});

test('once the world is shown the words come at once and the ascension starts after ten seconds', () => {
    const { G, toasts } = make(true);
    G.update(0.1);
    assert.equal(toasts.length, 1);
    for (let i = 0; i < 105; i++) G.update(0.1);
    assert.equal(G._ascended, true);
});
