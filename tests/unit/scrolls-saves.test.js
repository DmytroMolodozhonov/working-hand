/**
 * Scrolls and saved worlds: only the one who burnt a scroll learns it (two
 * players with the same name never share what they learned), the health
 * scroll heals in the free world, every saved world knows its game version.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldKeeper, worldVersionLabel, setGameVersion, GAME_VERSION, playerSnapshot, applyPlayerSnapshot } from '../../src/game/WorldSave.js';
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

test('free world: a burnt health scroll raises health for good and heals that much', () => {
    const g = combatGame();
    g.combat.hp = 10;
    ItemSystem.prototype.applyScroll.call({ game: g }, { kind: 'scroll', stat: 'hp', amount: 3 });
    assert.equal(g.combat.maxHp, PVP.MAX_HP + 3);
    assert.equal(g.combat.hp, 13);
    g.combat.update(1 / 60);
    assert.deepEqual(g.shown, [13, 23], 'the bar shows the new maximum');
    g.combat.hp = 0; g.combat.dead = true;
    g.combat.revive();
    assert.equal(g.combat.hp, 23, 'back to life with the bigger health');
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
