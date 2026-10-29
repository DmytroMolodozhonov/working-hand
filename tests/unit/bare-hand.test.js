// «Колдовать без палочки» (BareHand.js, Pentagranium «Palmaris»): что можно голой рукой, обряд пентаграммы, смерть/возврат, Творческий, Империус.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Pentagranium } from '../../src/game/Pentagranium.js';
import { bareGate, BARE_FREE, BARE, BARE_HINT } from '../../src/game/BareHand.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { pentagramWords, pentagramSpell } from '../../src/game/PentagramWords.js';
import { figureOf, pentagramScroll } from '../../src/game/PentagramRules.js';
import { captureLegacy, wipeHero, absorbLegacy } from '../../src/game/Legacy.js';
import { readFileSync } from 'node:fs';

test('без палочки с начала — только Акцио и Protection (и «стоп»); всё остальное требует палочку', () => {
    const bare = { hasWand: false };
    for (const n of ['Accio', 'Protection', 'ProtectionMaxima', 'ProtectionGods', 'ProtectionGodsMaxima', 'Stand', 'Stop']) assert.ok(bareGate(n, bare).ok, n);
    for (const n of ['Lumos', 'Bombardo', 'Stupefy', 'Fire', 'Flight', 'Pentagranium', 'AvadaKedavra', 'Rescue', 'Inferno', 'Maxima']) assert.deepEqual(bareGate(n, bare), { ok: false, why: 'wand' }, n);
    assert.deepEqual([...BARE_FREE].sort(), ['Accio', 'Protection', 'ProtectionGods', 'ProtectionGodsMaxima', 'ProtectionMaxima']);
    assert.match(BARE_HINT, /только Акцио и Protection/);
});

test('с палочкой в руке (любой, любая рука) можно всё; в Творческом тоже; мастер пентаграммы — тоже', () => {
    assert.ok(bareGate('Bombardo', { hasWand: true }).ok);
    assert.ok(bareGate('Bombardo', { hasWand: false, creative: true }).ok);
    assert.ok(bareGate('Bombardo', { hasWand: false, bareMaster: true }).ok);
});

test('Империус: заклинания героя останавливает Concentration раньше, чем дело дойдёт до палочки', () => {
    // (Game._castLocalSpell: focus.gate comes first, the wand gate after it — under «Империус» the hero casts nothing, wand or not)
    const src = readFileSync(new URL('../../src/game/Game.js', import.meta.url), 'utf8');
    assert.ok(src.indexOf('this.focus.gate(name, isFinal') < src.indexOf('bareGate(name'));
    assert.ok(src.indexOf('bareGate(name') < src.indexOf("if (name === 'Accio') return this._castAccio"));
});

const stub = ({ mode = 'freeworld', fatigue = 100 } = {}) => {
    const said = [], sent = [];
    const g = {
        config: { mode }, said,
        hud: { setVoice: (t) => said.push(t) },
        combat: { enabled: mode !== 'creative', fatigue, dead: false, _hudKey: '' },
        terrain: { data: { topLayer: () => 1, get: () => 1 } },
        fx: { spark() {}, lightFlash() {} },
        character: { group: { position: new THREE.Vector3(0, 0, 0) }, getHandWorldPosition: (s, o) => o.set(s === 'left' ? -1 : 1, 3, 0) },
        sync: { pentagram: (m) => sent.push(m) },
        sound: { playSpellFxAt() {} },
        mana: { success() {}, onDeath() {} }, achievements: { onDeath() {}, done: new Set() }, perf: { note() {} },
        bonus: {}, maxHP: 20, playerHP: 20,
    };
    g.pentagranium = new Pentagranium(g);
    g.pentagranium.fx = { trailBegin() {}, trailEnd() {}, trailPulse() {}, add() {}, set() {}, remove() {}, ambient() {}, sampleModels: () => [] };
    return { g, p: g.pentagranium, said, sent };
};
const mark = (p) => p._place('m1', 'me', 'bare', 0, 0, 0, 3.5, 0);

test('пентаграмма «Palmaris»: белая, своё имя и свой рисунок, свой свиток, 50 маны при входе', () => {
    assert.equal(pentagramWords('пентаграниум пальмарис'), 'bare');
    assert.equal(pentagramSpell('bare'), 'Pentagranium Palmaris');
    assert.equal(PENTAGRAMS.bare.dark, false);
    assert.equal(PENTAGRAMS.bare.cost, BARE.COST);
    assert.ok(figureOf('bare'));
    const sc = pentagramScroll('bare', 1);
    assert.equal(sc.pent, 'bare');
    assert.equal(sc.dark, false);
});

test('до обряда ничего нет; в круге мана берётся, когда простоял; повторно — нет', () => {
    const { g, p } = stub({ fatigue: 100 });
    assert.equal(p.bare, false);
    const m = mark(p);
    p.bareStand(m, 0.5, true);
    assert.equal(p.bare, false, 'ещё не простоял');
    assert.equal(g.combat.fatigue, 100, 'мана при входе не берётся сразу — только когда обряд пошёл');
    p.bareStand(m, 1, true);
    assert.equal(p.bare, true);
    assert.equal(g.combat.fatigue, 100 - BARE.COST);
    assert.ok(m.bareRite);
    p.bareStand(m, 5, true);
    assert.equal(g.combat.fatigue, 100 - BARE.COST, 'второй раз не списывается');
});

test('мало маны: ничего не списано и не выучено; вышел и вошёл — вторая попытка', () => {
    const { g, p, said } = stub({ fatigue: 30 });
    const m = mark(p);
    p.bareStand(m, 2, true);
    assert.equal(p.bare, false);
    assert.equal(g.combat.fatigue, 30);
    assert.ok(said.some((t) => /Нужно 50 маны/.test(t)));
    g.combat.fatigue = 80;
    p.bareStand(m, 2, true);
    assert.equal(p.bare, false, 'пока не вышел из круга — не пробует');
    p.bareStand(m, 0.1, false);
    p.bareStand(m, 2, true);
    assert.equal(p.bare, true);
});

test('не начинается: под Империусом, в облике монстра, мёртвым; не учится дважды', () => {
    for (const set of [(g) => { g.imperius = { active: true }; }, (g) => { g.monster = { active: true }; }, (g) => { g.combat.dead = true; }]) {
        const { g, p } = stub();
        set(g);
        p.bareStand(mark(p), 2, true);
        assert.equal(p.bare, false);
        assert.equal(g.combat.fatigue, 100);
    }
    const { g, p } = stub();
    p.bare = true;
    p.bareStand(mark(p), 2, true);
    assert.equal(g.combat.fatigue, 100, 'уже умеет — мана не берётся');
});

test('создать пентаграмму повторно, когда уже умеешь, нельзя (ничего не тратится)', () => {
    const { g, p, said } = stub();
    p.learnFigure('bare');
    p.bare = true;
    const aim = { origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1).normalize() };
    assert.equal(p.cast(true, 'пентаграниум пальмарис', aim), null);
    assert.equal(p.marks.size, 0);
    assert.ok(said.some((t) => /уже умеете/.test(t)));
});

test('обряд виден всем: сообщение в сеть, у гостя тот же рисунок; рисунок гаснет после обряда', () => {
    const { p, sent } = stub();
    const m = mark(p);
    p.bareStand(m, 2, true);
    assert.ok(sent.some((s) => s.k === 'bare' && s.id === 'm1'));
    const guest = stub();
    const gm = mark(guest.p);
    guest.p.onNet('them', { k: 'bare', id: 'm1' });
    assert.ok(gm.bareRite && !guest.p.bare, 'гость видит анимацию, но умения не получает');
    for (let t = 0; t < 12; t += 0.1) p.update(0.1);
    assert.ok(!p.marks.has('m1'), 'рисунок погас');
    assert.equal(p.bare, true, 'умение осталось');
});

test('смерть забирает, «Give Me My Power» возвращает; сохранение мира помнит', () => {
    const { g, p } = stub();
    p.bare = true;
    assert.equal(p.bareSnapshot(), 1);
    const rec = captureLegacy(g);
    assert.equal(rec.bare, 1);
    wipeHero(g);
    assert.equal(p.bare, false);
    assert.equal(p.bareSnapshot(), null);
    absorbLegacy(g, rec);
    assert.equal(p.bare, true);
    const { p: p2 } = stub();
    p2.bareRestore(p.bareSnapshot());
    assert.equal(p2.bare, true);
    p2.bareRestore(null);
    assert.equal(p2.bare, false);
});
