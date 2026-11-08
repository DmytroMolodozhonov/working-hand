// The author's «Сильные руки»: fifty to draw, a carnivorous head and 150 to receive the gift.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PentagramResist } from '../../src/game/PentagramResist.js';
import { holdsWand, findGripHead } from '../../src/game/ResistRules.js';
import { figureIds, CAST_COST, PENT, figureOf } from '../../src/game/PentagramRules.js';
import { pentagramWords, pentagramSpell } from '../../src/game/PentagramWords.js';
import { captureLegacy, wipeHero, absorbLegacy } from '../../src/game/Legacy.js';

function rite() {
    const head = { kind: 'carnivoreHead', count: 2 };
    const events = [], loose = new Map([['head', { item: head, rest: true, model: { position: new THREE.Vector3() } }]]);
    const g = { combat: { fatigue: 200 }, items: { loose, removeLoose: (uid) => { loose.delete(uid); events.push(uid); } },
        hud: { setVoice: (s) => events.push(s) }, sync: { itemGone: (uid) => events.push('net:' + uid) }, perf: {} };
    const r = g.resist = new PentagramResist(g);
    const ctx = { m: { x: 0, y: 0, z: 0, r: 3.5 }, pays: true, mana: 200, hint: (s) => events.push(s), fx: () => events.push('fx') };
    return { g, r, head, events, loose, ctx };
}

test('every drawing costs 50; Stronghands has its own learnt, white permanent figure', () => {
    assert.equal(PENT.COST, 50);
    for (const id of figureIds()) assert.equal(CAST_COST[id], 50, id);
    const d = figureOf('grip').def;
    assert.equal(d.dark, false); assert.equal(d.permanent, true); assert.equal(d.cost, 150);
    assert.equal(pentagramSpell('grip'), 'Pentagranium Stronghands');
    for (const phrase of ['Pentagranium Stronghands', 'пентаграниум стронгхэндс', 'пентаграниум стронг хэндс']) assert.equal(pentagramWords(phrase), 'grip');
    assert.equal(pentagramWords('стронгхэндс'), null);
});

test('one head must lie in the circle: wrong / moving / far away / no mana / dead consumes nothing', () => {
    for (const reason of ['wrong', 'moving', 'far', 'mana', 'dead']) {
        const { g, r, head, loose, ctx } = rite();
        if (reason === 'wrong') head.kind = 'apple';
        if (reason === 'moving') loose.get('head').rest = false;
        if (reason === 'far') loose.get('head').model.position.x = 8;
        if (reason === 'mana') ctx.mana = 149;
        if (reason === 'dead') g.combat.dead = true;
        assert.equal(r.useCircle('grip', ctx), false, reason);
        assert.equal(g.combat.fatigue, 200); assert.equal(head.count, 2); assert.equal(r.strongHands, false);
    }
    assert.equal(findGripHead([{ item: { kind: 'carnivoreHead', count: 0 } }]), null);
});

test('the rite pays exactly 150, burns ONE head, does not charge a second time', () => {
    const { g, r, head, ctx, events, loose } = rite();
    assert.equal(r.useCircle('grip', ctx), true);
    assert.equal(r.strongHands, true); assert.equal(g.combat.fatigue, 50); assert.equal(head.count, 1);
    assert.ok(events.includes('fx')); assert.equal(r.useCircle('grip', ctx), false);
    assert.equal(g.combat.fatigue, 50); assert.equal(head.count, 1);
    r.restore(null); g.combat.fatigue = ctx.mana = 200;
    assert.equal(r.useCircle('grip', ctx), true);
    assert.equal(loose.size, 0); assert.ok(events.includes('net:head'));
});

test('Creative permits the rite without a head or mana; the wand remains vulnerable only to a lost clash', () => {
    const { r, ctx, loose, g } = rite(); loose.clear(); ctx.pays = false; ctx.mana = Infinity;
    assert.ok(r.useCircle('grip', ctx)); assert.equal(g.combat.fatigue, 200);
    assert.equal(holdsWand(r.strongHands), true); assert.equal(holdsWand(r.strongHands, true), false);
    assert.equal(holdsWand(false), false);
});

test('save / load and legacy: death takes the gift and recovered power restores it', () => {
    const { g, r, ctx } = rite(); r.useCircle('grip', ctx);
    const loaded = new PentagramResist({}); loaded.restore(JSON.parse(JSON.stringify(r.snapshot())));
    assert.ok(loaded.strongHands); loaded.restore({ d: 1 }); assert.equal(loaded.strongHands, false, 'old saves have no new gift');
    g.character = { group: { position: new THREE.Vector3() } }; g.config = { mode: 'freeworld' };
    const rec = captureLegacy(g);
    assert.equal(rec.resist.h, 1);
    wipeHero(g); assert.equal(r.strongHands, false);
    absorbLegacy(g, rec); assert.equal(r.strongHands, true);
});
