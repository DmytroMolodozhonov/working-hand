/**
 * Scrolls and saved worlds: only the one who burnt a scroll learns it (two
 * players with the same name never share what they learned), the health
 * scroll heals in the free world, every saved world knows its game version.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cleanWorldName, WorldKeeper, worldVersionLabel, setGameVersion, GAME_VERSION, playerSnapshot, applyPlayerSnapshot } from '../../src/game/WorldSave.js';
import { uniqueName } from '../../src/net/Network.js';
import { Combat, PVP } from '../../src/game/Combat.js';
import { ItemSystem } from '../../src/game/Items.js';

function stubGame({ pid = 'H', name = 'Игрок' } = {}) {
    return {
        config: { mode: 'freeworld' }, seed: 7, active: true, explosions: [], blockEdits: [], world: { trees: [] }, iceCells: [], chests: [],
        weapons: { weapons: [] }, character: { group: { position: new THREE.Vector3(1, 2, 3) } }, net: { name, pid },
        playerHP: 20, bonus: null,
    };
}

test('two players called the same never get each other\'s names', () => {
    assert.equal(uniqueName('Игрок', ['Игрок']), 'Игрок 2');
    assert.equal(uniqueName('Игрок', ['Игрок', 'Игрок 2']), 'Игрок 3');
    assert.equal(uniqueName('Аня', ['Игрок']), 'Аня');
});

test('a server keeps each player\'s things under their own lasting id: same names, different spells', () => {
    const k = new WorldKeeper(stubGame());
    k.notePlayer('G', 'Игрок', { bonus: { spells: { LightningStrike: true } } });
    assert.equal(k.playerFor('H', 'Игрок', { self: true })?.bonus?.spells, undefined, 'the host did not learn the guest\'s scroll');
    assert.equal(k.playerFor('G', 'Игрок').bonus.spells.LightningStrike, true, 'the guest keeps theirs');
    // the host's own saved things are under the host's id, not the shared name
    const snap = k.snapshot();
    assert.ok(snap.players['id:H'] && snap.players['id:G']);
    assert.equal(snap.players['Игрок'], undefined);
    // a newcomer with the same name and no saved things gets nothing of anybody's
    assert.equal(k.playerFor('X', 'Игрок'), null);
});

test('an old save kept by name: the host gets their own back; a guest never gets the host\'s name', () => {
    const k = new WorldKeeper(stubGame(), { players: { 'Игрок': { hp: 9 }, 'Аня': { hp: 5 } } });
    assert.equal(k.playerFor('G', 'Игрок'), null, 'a guest called like the host does not take the host\'s things');
    assert.equal(k.playerFor('A', 'Аня').hp, 5, 'Аня comes back to her old things…');
    assert.equal(k.players['Аня'], undefined, '…once: they move to her id');
    assert.equal(k.playerFor('H', 'Игрок', { self: true }).hp, 9);
});

test('every save says which version of the game wrote it; the menu marks other versions', () => {
    setGameVersion({ date: 'd', sha: 's' });
    const k = new WorldKeeper(stubGame());
    const snap = k.snapshot();
    assert.deepEqual(snap.version, { date: 'd', sha: 's' });
    assert.deepEqual(snap.createdVersion, { date: 'd', sha: 's' });
    assert.deepEqual(worldVersionLabel({ version: { date: '09.10.2026 14:05', sha: 'abc1234' } }, { sha: 'abc1234' }), { text: 'версия от 09.10.2026 14:05 (abc1234)', old: false });
    assert.equal(worldVersionLabel({ version: { date: '09.10.2026 14:05', sha: 'abc1234' } }, { sha: 'fff0000' }).old, true);
    assert.match(worldVersionLabel({}).text, /неизвестна/);
    assert.equal(worldVersionLabel({}).old, true);
    setGameVersion(null);
    assert.deepEqual(GAME_VERSION, { date: '', sha: '' });
});

const rng = (seed) => { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };

function combatGame() {
    const g = {
        config: { mode: 'freeworld' }, localId: 'me', knockback: new THREE.Vector3(), remotes: new Map(), killCount: 0, punchCount: 0,
        weapons: { hasWeapon: () => false }, fx: { spark() {}, lightFlash() {} },
        hud: { update(hp, max) { g.shown = [hp, max]; }, setFatigue() {}, setStatus() {}, setFrozenOverlay() {}, damageFlash() {}, setVoice() {}, toast() {} },
        character: { group: { position: new THREE.Vector3() }, getHandWorldPosition: (s, o = new THREE.Vector3()) => o, getHandDirection: (s, o = new THREE.Vector3()) => o.set(0, 0, -1), isArmExtended: () => false, isTPose: () => false },
        playerName: () => null, onLocalDeath() {}, maxHP: 20, playerHP: 20,
    };
    g.combat = new Combat(g);
    return g;
}

test('the scrolls of health and of mana cells are gone: an old one in a save is an apple, a burnt one does nothing, none are rolled', async () => {
    const { retireScroll, retireScrollsIn, rollScroll, rollLoot, rollStoreLoot, SCROLL_WEIGHTS } = await import('../../src/game/ItemTypes.js');
    const { rollWizardHouseLoot, rollShopScroll } = await import('../../src/game/WizardShop.js');
    // a save: slots, loose things, a body's things
    const save = {
        slots: [{ kind: 'scroll', uid: 'a', stat: 'hp', amount: 3 }, { kind: 'scroll', uid: 'b', stat: 'fatigue', amount: 5 }, { kind: 'scroll', uid: 'c', stat: 'spell', spell: 'Thunderwave' }, null],
        items: [{ item: { kind: 'scroll', uid: 'd', stat: 'hp', amount: 1 }, p: [0, 0, 0] }],
        bodies: [{ lg: { items: [{ kind: 'scroll', uid: 'e', stat: 'fatigue', amount: 2 }] } }],
    };
    assert.equal(retireScrollsIn(save), 4);
    assert.deepEqual(save.slots[0], { uid: 'a', kind: 'apple', count: 1 });
    assert.equal(save.slots[1].kind, 'apple');
    assert.deepEqual(save.slots[2], { kind: 'scroll', uid: 'c', stat: 'spell', spell: 'Thunderwave' }, 'a spell scroll is left as it is');
    assert.equal(save.items[0].item.kind, 'apple');
    assert.equal(save.bodies[0].lg.items[0].kind, 'apple');
    assert.equal(retireScrollsIn(save), 0, 'nothing left to turn');
    assert.equal(retireScroll({ kind: 'pentagram' }).kind, 'pentagram');
    // burnt by some old client: nothing happens to the health or the mana
    const g = combatGame();
    g.combat.hp = 10;
    ItemSystem.prototype.applyScroll.call({ game: g }, { kind: 'scroll', stat: 'hp', amount: 3 });
    ItemSystem.prototype.applyScroll.call({ game: g }, { kind: 'scroll', stat: 'fatigue', amount: 5 });
    assert.ok(!(g.combat.maxHp > PVP.MAX_HP), 'no more health');
    assert.equal(g.combat.hp, 10);
    assert.deepEqual(g.bonus, { hp: 0, fatigue: 0 }, 'no bonus either');
    // none turn up anywhere any more: not in the tables, not in the chests, not in the wizards' houses and shops
    assert.ok(!SCROLL_WEIGHTS.some(([k]) => k === 'hp' || k === 'fatigue'));
    const r = rng(77);
    const bad = (it) => it.kind === 'scroll' && (it.stat === 'hp' || it.stat === 'fatigue');
    for (let i = 0; i < 3000; i++) {
        assert.ok(![rollScroll(r), rollScroll(r, true), rollShopScroll(r), ...rollLoot(r, { deep: true, count: 3 }), ...rollLoot(r, { count: 3 }), ...rollStoreLoot(r, 'scrolls', 3), ...rollWizardHouseLoot(r, i % 2 === 0, 3, i % 3 === 0)].some(bad));
    }
});

test('«Выживание»: health and mana are as they were when the player left, not full again', () => {
    const g = combatGame();
    g.combat.hp = 13; g.combat.fatigue = 12.5;
    const snap = JSON.parse(JSON.stringify(playerSnapshot(g)));
    const g2 = combatGame();
    applyPlayerSnapshot(g2, snap);
    assert.equal(g2.combat.hp, 13);
    assert.equal(g2.playerHP, 13);
    assert.equal(g2.combat.fatigue, 12.5);
});

test('the heart and the new name of a world survive the autosave', () => {
    const k = new WorldKeeper(stubGame(), { name: 'Мой мир', fav: true });
    const s = k.snapshot();
    assert.equal(s.fav, true);
    assert.equal(s.name, 'Мой мир');
    assert.equal(cleanWorldName('   a\n  b  '), 'a b');
    assert.equal(cleanWorldName('x'.repeat(100)).length, 40);
    assert.equal(cleanWorldName('   '), '');
});
