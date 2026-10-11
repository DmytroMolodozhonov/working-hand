import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/game/Game.js';
import { rollKeyItem, describeItem, makeItemModel, SCROLL_SPELL_COLOR, SCROLL_RIBBON_RU } from '../../src/game/ItemTypes.js';

/** A small seeded random (the same rolls every run). */
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Just the part of the game that decides which spells the player knows. */
function game(mode, spells = {}) {
    const g = Object.create(Game.prototype);
    g.config = { mode };
    g.bonus = { hp: 0, fatigue: 0, spells };
    return g;
}

test('Авада Кедавра: outside Creative only a burnt scroll teaches it', () => {
    for (const mode of ['survival', 'freeworld', 'labyrinth']) {
        assert.equal(game(mode).knowsSpell('AvadaKedavra'), false, `${mode}: not without the scroll`);
        assert.equal(game(mode, { AvadaKedavra: true }).knowsSpell('AvadaKedavra'), true, `${mode}: known after the scroll burns`);
        // another spell's scroll doesn't teach it
        assert.equal(game(mode, { LightningStrike: true }).knowsSpell('AvadaKedavra'), false, `${mode}: another scroll doesn't teach it`);
        // the other duel spells stay free
        assert.equal(game(mode).knowsSpell('Stupefy'), true);
        assert.equal(game(mode).knowsSpell('Sapira'), true);
    }
    assert.equal(game('creative').knowsSpell('AvadaKedavra'), true, 'Creative knows everything');
    assert.equal(game('test').knowsSpell('AvadaKedavra'), true);
});

test('Авада Кедавра said without the scroll: refused, and the hint names its scroll and ribbon', () => {
    const g = game('survival');
    const said = [];
    g.active = true;
    g.combat = { dead: false };
    g.hud = { setVoice: (t) => said.push(t) };
    assert.equal(g.castLocalSpell('авада кедавра', true), null);
    assert.equal(said.length, 1);
    assert.match(said[0], /свиток «Авада Кедавра»/);
    assert.match(said[0], /зелёная лента/);
    assert.match(said[0], /Инферно/);
    // an unfinished phrase is refused quietly
    assert.equal(g.castLocalSpell('авада', false), null);
    assert.equal(said.length, 1);
});

test('the Авада Кедавра scroll: rare chest loot with its own green ribbon', () => {
    const r = seeded(121);
    const count = {};
    let all = 0;
    for (let i = 0; i < 20000; i++) {
        for (const it of [rollKeyItem(r)]) { // (a chest's one precious thing)
            all++;
            if (it.kind === 'scroll' && it.stat === 'spell') count[it.spell] = (count[it.spell] || 0) + 1;
        }
    }
    const avada = count.AvadaKedavra || 0;
    assert.ok(avada > 0, 'it can be found in a chest');
    assert.ok(avada / all < 0.015, `it is rare (${avada} of ${all})`);
    for (const s of ['LightningStrike', 'Thunderwave', 'ToTheSun']) assert.ok(avada < count[s], `rarer than the «${s}» scroll (${avada} < ${count[s]})`);
    // its own ribbon colour (not like the other scrolls)
    const col = SCROLL_SPELL_COLOR.AvadaKedavra;
    assert.ok(col, 'it has a ribbon colour');
    const others = [0x3a9ad9, 0x8e2b2b, ...Object.entries(SCROLL_SPELL_COLOR).filter(([k]) => k !== 'AvadaKedavra').map(([, c]) => c)];
    assert.ok(!others.includes(col), 'a colour of its own');
    assert.equal(SCROLL_RIBBON_RU.AvadaKedavra, 'зелёная');
    const g = (col >> 8) & 0xff, red = col >> 16, b = col & 0xff;
    assert.ok(g > red && g > b, 'green');
    // the model's ribbon and «Раскрой свои секреты» use it
    const scroll = { kind: 'scroll', uid: 's', stat: 'spell', spell: 'AvadaKedavra' };
    const model = makeItemModel(scroll);
    const colours = [];
    model.traverse((o) => { if (o.material?.color) colours.push(o.material.color.getHex()); });
    assert.ok(colours.includes(col), 'the ribbon on the scroll is green');
    const info = describeItem(scroll);
    assert.equal(info.color, col);
    assert.match(info.title, /Авада Кедавра/);
});
