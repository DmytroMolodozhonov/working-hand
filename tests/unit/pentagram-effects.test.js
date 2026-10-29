// Каждое «Pentagranium <Имя>» даёт СВОЙ эффект (горгульи — вылет, а не пустой рисунок), отказ — с понятной подсказкой; пауза после «Pentagranium».
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Pentagranium, PAUSE_MS } from '../../src/game/Pentagranium.js';
import { PENT_NAMES, pentagramWords } from '../../src/game/PentagramWords.js';
import { figureIds, CAST_COST } from '../../src/game/PentagramRules.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

function stub({ fatigue = 500, ritual = { ok: true }, mode = 'creative', can = { ok: true } } = {}) {
    const said = [], calls = { ritual: 0, enchant: 0 };
    const g = {
        config: { mode }, hud: { setVoice: (t) => said.push(t) },
        combat: { enabled: true, fatigue, _hudKey: '' },
        terrain: { data: { topLayer: () => 1, get: () => 1, raycast(o, d) { const t = (0.5 - o.y) / d.y; return t > 0 ? { x: o.x + d.x * t, y: 0.5, z: o.z + d.z * t } : null; } } },
        fx: { spark() {}, lightFlash() {} }, character: { group: { position: new THREE.Vector3(0, 0, 0) } }, sync: { pentagram() {} },
        mana: { success() {} }, dark: { level: 0, skin: 0, onGrow() {} }, castleLife: { alarm() {} }, perf: { note() {} }, death: { bodies: new Map(), falling: new Set() },
        gargoyles: { startRitual() { calls.ritual++; return ritual; }, canRitual() { return can; } },
        enchantCircles: { add() { calls.enchant++; return {}; } },
    };
    const p = new Pentagranium(g);
    p.fx = { trailBegin() {}, trailEnd() {}, trailAdd() {}, trailPulse() {}, trailLine() {}, trailBreak() {}, add() {}, set() {}, remove() {}, ambient() {}, sampleModels: () => [] };
    return { g, p, said, calls };
}
const aim = () => ({ origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1).normalize() });

test('Creative: every name said in full makes ITS pentagram with no conditions; the effect happens (gargoyles fly out, enchant lays its circle)', () => {
    for (const id of figureIds()) {
        const mode = id === 'gargoyles' || id === 'monster' || id === 'breakward' ? 'creative' : 'freeworld'; // (those three need a body (and a horn) on the circle outside Creative: Offerings.js)
        const t = stub({ mode });
        t.p.learnFigure(id);
        const phrase = `пентаграниум ${PENT_NAMES[id].say[0]}`;
        assert.equal(matchSpell(phrase), 'Pentagranium', phrase);
        assert.equal(t.p.cast(true, phrase, aim()), 'Pentagranium', id);
        const m = [...t.p.marks.values()][0];
        if (id === 'enchant') { assert.equal(m, undefined, 'its circle is laid by EnchantCircles; the mark is not kept'); assert.equal(t.calls.enchant, 1); continue; }
        assert.equal(m?.pent, id, id);
        assert.equal(t.g.combat.fatigue, 500 - (mode === 'creative' ? 0 : CAST_COST[id] || 0), `${id}: its mana at the word`);
        if (id === 'gargoyles') assert.equal(t.calls.ritual, 1, 'the gargoyles\' ritual starts at the word');
        else assert.equal(t.calls.ritual, 0);
        if (id === 'enchant') assert.equal(t.calls.enchant, 1);
    }
});

test('after a cast the frames go on: an interim look (the pause) must not break the list of the saved marks', () => {
    const t = stub();
    t.p.learnFigure('life');
    t.p.cast(false, 'пентаграниум вита', aim());
    for (let i = 0; i < 20; i++) t.p.update(0.05); // (it once threw: the wait used the name of the saved marks' list)
    assert.ok(Array.isArray(t.p._pending));
});

test('Creative: gargoyles refuse with a clear reason and nothing is drawn (mana, a burnt place, another ritual, no ground)', () => {
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

test('Survival: the gargoyles and the monster make only the picture at the word — no ritual, no mana — and wait for what must lie on the circle', () => {
    for (const id of ['gargoyles', 'monster', 'breakward']) {
        const t = stub({ mode: 'survival' });
        t.p.learnFigure(id);
        assert.equal(t.p.cast(true, `пентаграниум ${PENT_NAMES[id].say[0]}`, aim()), 'Pentagranium', id);
        const m = [...t.p.marks.values()][0];
        assert.equal(m?.pent, id); assert.equal(m.offer, id, 'it waits for the offering');
        assert.equal(t.g.combat.fatigue, 500, 'no mana at the word'); assert.equal(t.calls.ritual, 0, 'no ritual yet');
        assert.ok(m.life > 100, 'the picture does not burn out in 6 s while it waits');
        assert.match(t.said.at(-1), id === 'gargoyles' ? /три тела/ : id === 'monster' ? /рог Минотавра/ : /одно тело/);
    }
});

test('Survival: the gargoyles refuse at the word only for a reason of the PLACE (no ground, a burnt place) — mana and bodies come later', () => {
    for (const [why, re] of [['spent', /выжжена/], ['realm', /на землю/], ['off', /не выпускаются/]]) {
        const t = stub({ mode: 'survival', can: { ok: false, why } });
        t.p.learnFigure('gargoyles');
        assert.equal(t.p.cast(true, 'пентаграниум гаргульес', aim()), null, why);
        assert.equal(t.p.marks.size, 0, why); assert.match(t.said.at(-1), re, why);
    }
    const busy = stub({ mode: 'survival', can: { ok: false, why: 'busy' } });
    busy.p.learnFigure('gargoyles');
    assert.equal(busy.p.cast(true, 'пентаграниум гаргульес', aim()), 'Pentagranium', 'another ritual near is checked when the things are laid');
    const poor = stub({ mode: 'survival', fatigue: 0 });
    poor.p.learnFigure('gargoyles');
    assert.equal(poor.p.cast(true, 'пентаграниум гаргульес', aim()), 'Pentagranium', 'no mana is needed to draw it');
});
