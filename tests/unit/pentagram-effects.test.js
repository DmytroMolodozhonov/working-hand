// Каждое «Pentagranium <Имя>» даёт СВОЙ эффект (горгульи — вылет, а не пустой рисунок), отказ — с понятной подсказкой; пауза после «Pentagranium».
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Pentagranium, PAUSE_MS } from '../../src/game/Pentagranium.js';
import { PENT_NAMES, pentagramWords } from '../../src/game/PentagramWords.js';
import { figureIds, CAST_COST } from '../../src/game/PentagramRules.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

function stub({ fatigue = 500, ritual = { ok: true } } = {}) {
    const said = [], calls = { ritual: 0, enchant: 0 };
    const g = {
        config: { mode: 'freeworld' }, hud: { setVoice: (t) => said.push(t) },
        combat: { enabled: true, fatigue, _hudKey: '' },
        terrain: { data: { topLayer: () => 1, get: () => 1, raycast(o, d) { const t = (0.5 - o.y) / d.y; return t > 0 ? { x: o.x + d.x * t, y: 0.5, z: o.z + d.z * t } : null; } } },
        fx: { spark() {}, lightFlash() {} }, character: { group: { position: new THREE.Vector3(0, 0, 0) } }, sync: { pentagram() {} },
        mana: { success() {} }, dark: { level: 0, skin: 0, onGrow() {} }, castleLife: { alarm() {} }, perf: { note() {} }, death: { bodies: new Map(), falling: new Set() },
        gargoyles: { startRitual() { calls.ritual++; return ritual; } },
        enchantCircles: { add() { calls.enchant++; return {}; } },
    };
    const p = new Pentagranium(g);
    p.fx = { trailBegin() {}, trailEnd() {}, trailAdd() {}, trailPulse() {}, trailLine() {}, trailBreak() {}, add() {}, set() {}, remove() {}, ambient() {}, sampleModels: () => [] };
    return { g, p, said, calls };
}
const aim = () => ({ origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1).normalize() });

test('every name: said in full it makes ITS pentagram; the effect happens (gargoyles fly out, enchant lays its circle)', () => {
    for (const id of figureIds()) {
        const t = stub();
        t.p.learnFigure(id);
        const phrase = `пентаграниум ${PENT_NAMES[id].say[0]}`;
        assert.equal(matchSpell(phrase), 'Pentagranium', phrase);
        assert.equal(t.p.cast(true, phrase, aim()), 'Pentagranium', id);
        const m = [...t.p.marks.values()][0];
        if (id === 'enchant') { assert.equal(m, undefined, 'its circle is laid by EnchantCircles; the mark is not kept'); assert.equal(t.calls.enchant, 1); continue; }
        assert.equal(m?.pent, id, id);
        assert.equal(t.g.combat.fatigue, 500 - (CAST_COST[id] || 0), `${id}: its mana at the word`);
        if (id === 'gargoyles') assert.equal(t.calls.ritual, 1, 'the gargoyles\' ritual starts at the word');
        else assert.equal(t.calls.ritual, 0);
        if (id === 'enchant') assert.equal(t.calls.enchant, 1);
    }
});

test('gargoyles refuse with a clear reason and nothing is drawn (mana, a burnt place, another ritual, no ground)', () => {
    for (const [why, re] of [['mana', /Нужно 150 маны/], ['spent', /выжжена/], ['busy', /идёт ритуал/], ['realm', /на землю/], ['off', /не выпускаются/]]) {
        const t = stub({ ritual: { ok: false, why, need: 150 } });
        t.p.learnFigure('gargoyles');
        assert.equal(t.p.cast(true, 'пентаграниум гаргульес', aim()), null, why);
        assert.equal(t.p.marks.size, 0, why);
        assert.match(t.said.at(-1), re, why);
    }
});

test('the voice: «Гаргульес», «Гаргулес», «Gargules» and the doubled «н» of «пентагранниум» are the gargoyles', () => {
    for (const t of ['пентаграниум гаргульес', 'пентагранниум гаргульес', 'пентаграниум гаргулес', 'Pentagranium Gargules', 'пентаграниум гаргойлис', 'пентагранием гаргуль']) {
        assert.equal(pentagramWords(t), 'gargoyles', t);
        assert.equal(matchSpell(t), 'Pentagranium', t);
    }
});

test('a name is not taken by its first sounds: the longest match wins; «Pentagranium» alone and half a name do nothing', () => {
    assert.equal(pentagramWords('пентаграниум телепортис'), 'teleport');
    for (const t of ['пентаграниум', 'пентаграниум те', 'пентаграниум гар', 'пентаграниум мон', 'пентаграниум дна']) assert.equal(pentagramWords(t), null, t);
    // (a short stem inside a longer name never wins over the longer one)
    assert.equal(pentagramWords('пентаграниум диаболус вита'), 'devil', 'the first of equal length wins, the longer beats the shorter: «диаболус» > «вита»');
});

test('while the phrase is still being said the name must hold half a second (or the phrase end): a changing name casts nothing', () => {
    const t = stub();
    for (const id of ['teleport', 'life', 'devil']) t.p.learnFigure(id);
    const real = performance.now;
    let now = 1000;
    performance.now = () => now;
    try {
        assert.equal(t.p.cast(false, 'пентаграниум вита', aim()), null, 'first look: wait');
        now += 200;
        assert.equal(t.p.cast(false, 'пентаграниум телепортис', aim()), null, 'the name changed: wait again');
        now += 200;
        assert.equal(t.p.cast(false, 'пентаграниум телепортис', aim()), null, 'held 200 ms: not yet');
        now += PAUSE_MS;
        assert.equal(t.p.cast(false, 'пентаграниум телепортис', aim()), 'Pentagranium');
        assert.equal([...t.p.marks.values()][0].pent, 'teleport');
        // the end of the phrase casts at once
        const u = stub(); u.p.learnFigure('life');
        assert.equal(u.p.cast(true, 'пентаграниум вита', aim()), 'Pentagranium');
    } finally { performance.now = real; }
});
