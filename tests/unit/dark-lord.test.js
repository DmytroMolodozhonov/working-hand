// «Настоящий тёмный маг» (DarkLord.js, DarkLordLife.js): the turning at level 100, the outfit and the absorbed robe, the curse on armour,
// the world's answer, the cure potion (its recipe, one flask, the chance by mana cells) and death / the legacy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LORD, blocker, phaseAt, heightAt, darknessAt, TOTAL_T, SWAP_AT, lordRobe, unlordRobe, curseSeconds, curseTick, curseLeft, uncurse,
    CURE, cureChance, cureCost, cureRoll, cureWarning, reaction, sellMult, lordPrice, effectiveSkin,
} from '../../src/game/DarkLord.js';
import { CAULDRON, newBrew, addWater, addIngredient, stepBrew, takePortion, matchRecipe, recipeById } from '../../src/game/Potions.js';
import { makeRobe, makePiece, wornCode, wornEffects, armorName, magOf } from '../../src/game/ArmorTypes.js';
import { DarkLordLife } from '../../src/game/DarkLordLife.js';
import { DarkHero, addDark } from '../../src/game/DarkMagic.js';
import { ArmorSystem } from '../../src/game/Armor.js';
import { captureLegacy, wipeHero, absorbLegacy } from '../../src/game/Legacy.js';

const calm = { sinceHit: 100 };

// ------------------------------------------------------------------ when it begins
test('lord: nothing hinders → begins at once; a fight, a threat, sleep, water, a duel, the arena, another body, a fall → waits', () => {
    assert.equal(blocker(calm), null);
    assert.equal(blocker({ ...calm, sinceHit: 2 }), 'бой');
    assert.ok(blocker({ ...calm, danger: true }));
    for (const k of ['sleeping', 'swimming', 'duel', 'arena', 'imperius', 'down', 'lifted']) assert.ok(blocker({ ...calm, [k]: true }), k);
    assert.equal(blocker({ ...calm, dead: true }), 'dead');
});

test('lord: the rite — gather, rise ~5 m, hang, come down; the clothes change in the dark, in the middle', () => {
    assert.equal(heightAt(0), 0);
    assert.ok(Math.abs(heightAt(LORD.T_GATHER + LORD.T_RISE + 0.1) - LORD.RISE_H) < 1e-6);
    assert.equal(heightAt(TOTAL_T + 1), 0, 'let down');
    let prev = 0;
    for (let t = 0; t < LORD.T_GATHER + LORD.T_RISE; t += 0.05) { const h = heightAt(t); assert.ok(h >= prev - 1e-9, 'rises smoothly'); prev = h; }
    assert.ok(darknessAt(SWAP_AT) >= 0.99, 'the darkness is at its peak when the clothes change');
    assert.ok(heightAt(SWAP_AT) >= LORD.RISE_H - 1e-6, 'and he hangs high');
    assert.equal(phaseAt(TOTAL_T + 0.1).phase, 'done');
});

// ------------------------------------------------------------------ the robe
test('lord: a magic robe is absorbed — the reserve, the kind and the strong spells stay; no robe → a plain outfit; not taken off', () => {
    const robe = makeRobe(true, () => 0.5, 'strong'); robe.mag = 777; robe.magMax = 900;
    const out = lordRobe(robe);
    assert.equal(out.lord, true);
    assert.equal(out.mag, 777); assert.equal(out.magMax, 900); assert.equal(out.tier, 'strong'); assert.equal(out.magic, true);
    assert.equal(out.uid, robe.uid);
    assert.equal(wornCode({ robe: out }).r, 5, 'the outfit is robe code 5 (drawn by DarkLordLook)');
    assert.equal(armorName(out), 'Облачение тёмного мага ✨');
    const fx = wornEffects({ robe: out });
    assert.equal(fx.robe, 'magic', 'it does the robe’s work (magic robe: simple spells do nothing)');
    const plain = lordRobe(null, 'x1');
    assert.equal(plain.lord, true); assert.equal(plain.magic, false); assert.equal(wornEffects({ robe: plain }).robe, 'plain');
    // the cure: the absorbed robe is itself again (reserve as it is now), the given one is gone
    out.mag = 500;
    const back = unlordRobe(out);
    assert.equal(back.lord, undefined); assert.equal(back.mag, 500); assert.equal(back.magic, true); assert.equal(back.color, robe.color);
    assert.equal(unlordRobe(plain), null);
    const suit = { kind: 'robe', uid: 's', magic: true, archmage: true };
    assert.equal(lordRobe(suit, 'n').archmage, undefined, 'the High Mage’s suit is not absorbed (it is put by)');
});

// ------------------------------------------------------------------ the curse on armour
test('lord: plain armour breaks after 600 s worn, magic after 1200 s; the time is on the piece (off and on again goes on)', () => {
    const plain = makePiece('chest'), magic = makePiece('helmet', { magic: true });
    assert.equal(curseSeconds(plain), 600); assert.equal(curseSeconds(magic), 1200);
    assert.equal(curseSeconds(makeRobe(true)), null, 'a robe never breaks of the curse');
    let broke = false;
    for (let t = 0; t < 599; t++) broke = curseTick(plain, 1);
    assert.equal(broke, false); assert.equal(plain.cursed, true); assert.equal(Math.round(curseLeft(plain)), 1);
    // taken off for an hour: nothing runs; put on — one more second
    assert.equal(curseTick(plain, 1), true);
    for (let t = 0; t < 1199; t++) assert.equal(curseTick(magic, 1), false);
    assert.equal(curseTick(magic, 1), true);
    const p2 = makePiece('legs'); curseTick(p2, 100);
    assert.equal(p2.curseT, 100); uncurse(p2); assert.equal(p2.cursed, undefined); assert.equal(p2.curseT, undefined);
    assert.equal(wornCode({ chest: Object.assign(makePiece('chest'), { cursed: true }), helmet: makePiece('helmet') }).dk, 2, 'black pieces are in the worn code (the others see them)');
});

// ------------------------------------------------------------------ the world
test('lord: knights strike, farmers run, traders split (refuse / dearer 1.5–2 / run), mages by place', () => {
    assert.equal(reaction({ role: 'knight', id: 'k1' }).do, 'attack');
    assert.equal(reaction({ role: 'farmer', id: 'f1' }).do, 'flee');
    assert.equal(reaction({ role: 'builder', id: 'b1' }).do, 'flee');
    assert.equal(reaction({ role: 'servant', id: 's' }).do, 'none');
    const n = { flee: 0, refuse: 0, sell: 0 };
    for (let i = 0; i < 600; i++) {
        const r = reaction({ role: 'merchant', id: 'm' + i });
        if (r.do === 'flee') n.flee++; else if (r.refuse) n.refuse++; else { n.sell++; assert.ok(r.mult >= 1.5 && r.mult <= 2); }
    }
    assert.ok(n.flee > 40 && n.refuse > 150 && n.sell > 150, JSON.stringify(n));
    assert.equal(reaction({ role: 'wanderer', id: 'w', wizard: true, wanderer: true }, 'small').do, 'flee');
    let town = 0;
    for (let i = 0; i < 200; i++) if (reaction({ role: 'teacher', id: 't' + i, wizard: true }, 'town').do === 'attack') town++;
    assert.ok(town > 100, 'the group in the towns fights');
    const small = new Set(); for (let i = 0; i < 300; i++) small.add(reaction({ role: 'seller', id: 'x' + i, wizard: true }, 'small').do);
    assert.ok(small.has('scorn') && small.has('flee'));
    assert.equal(sellMult('m5'), sellMult('m5'));
    assert.equal(lordPrice(100, 'm5'), Math.round(100 * sellMult('m5')));
    assert.equal(effectiveSkin(0, true), 100); assert.equal(effectiveSkin(30, false), 30);
});

// ------------------------------------------------------------------ the cure potion
const boiled = () => {
    const st = newBrew();
    addWater(st, CAULDRON.FULL);
    for (let t = 0; t < CAULDRON.BOIL_TIME + 0.5; t += 0.1) stepBrew(st, 0.1, Math.random, true);
    return st;
};
const run = (st, secs, rng = Math.random) => { let ev = null, e; for (let t = 0; t < secs; t += 0.1) { e = stepBrew(st, 0.1, rng, true); if (e) ev = e; } return ev; };

test('cure: the feather → the golden apple → the Baksadi pear, in that order only', () => {
    const r = recipeById('lordcure');
    assert.equal(r.name, 'Зелье снятия проклятия тёмного мага');
    const good = ['phoenixFeather', 'apple', 'baksadi_pear'];
    assert.equal(matchRecipe({ phoenixFeather: 1, apple: 1, baksadi_pear: 1 }, good).id, 'lordcure');
    for (const bad of [['apple', 'phoenixFeather', 'baksadi_pear'], ['baksadi_pear', 'apple', 'phoenixFeather'], ['phoenixFeather', 'baksadi_pear', 'apple']]) {
        assert.equal(matchRecipe({ phoenixFeather: 1, apple: 1, baksadi_pear: 1 }, bad), null, bad.join());
    }
    assert.equal(matchRecipe({ phoenixFeather: 1, apple: 1 }, ['phoenixFeather', 'apple']), null);
    assert.equal(matchRecipe({ apple: 1, crystal: 1 }, ['apple', 'crystal']).id, 'heal', 'the other recipes ignore the order');
    // in the cauldron
    const st = boiled();
    for (const k of good) assert.equal(addIngredient(st, k), 'in');
    assert.equal(run(st, 0.1), 'brew');
    const wrong = boiled();
    for (const k of ['apple', 'phoenixFeather', 'baksadi_pear']) addIngredient(wrong, k);
    assert.equal(run(wrong, CAULDRON.WINDOW + 1), 'late', 'the wrong order is a grey sludge');
});

test('cure: it brews 2.5–3.5 minutes and gives exactly ONE flask; the rest goes dark and crumbles', () => {
    const st = boiled();
    for (const k of CURE.ORDER) addIngredient(st, k);
    run(st, 0.1, () => 0);
    assert.equal(st.dur, 150);
    assert.equal(run(st, 160, Math.random), 'ready');
    assert.equal(st.rec, 'lordcure'); assert.equal(st.por, 1);
    assert.equal(takePortion(st), 'lordcure');
    assert.equal(st.phase, 'crumble');
    assert.equal(takePortion(st), null, 'a second flask cannot be had');
    assert.equal(addIngredient(st, 'apple'), 'spoil', 'a thing dropped into the crumbling rest only spoils it');
    const st2 = boiled();
    for (const k of CURE.ORDER) addIngredient(st2, k);
    run(st2, 0.1); run(st2, 220); takePortion(st2);
    assert.equal(run(st2, CURE.CRUMBLE_S - 1), null);
    assert.equal(run(st2, 2), 'crumbled');
    assert.equal(st2.phase, 'empty'); assert.equal(st2.water, 0);
});

test('cure: the chance by mana cells — <100 none, 100 → 20 %, linear, 500 and more → sure', () => {
    assert.equal(cureChance(0), 0); assert.equal(cureChance(99), 0);
    assert.ok(Math.abs(cureChance(100) - 0.2) < 1e-9);
    assert.ok(Math.abs(cureChance(300) - 0.6) < 1e-9);
    assert.equal(cureChance(500), 1); assert.equal(cureChance(5000), 1);
    assert.equal(cureCost(5000), 500); assert.equal(cureCost(500), 500);
    assert.equal(cureCost(300), 300, 'less than 500: all of them');
    assert.equal(cureCost(100), 100); assert.equal(cureCost(99), 0, 'under 100 nothing is taken (nothing happens)');
    assert.deepEqual(cureRoll(500, () => 0.999), { ok: true, cost: 500, chance: 1 });
    assert.equal(cureRoll(300, () => 0.59).ok, true); assert.equal(cureRoll(300, () => 0.61).ok, false);
    assert.equal(cureRoll(50, () => 0).ok, false);
    assert.match(cureWarning(800), /500 ячеек маны/);
    assert.match(cureWarning(300), /все ячейки/);
    assert.match(cureWarning(40), /не сработает/);
});

// ------------------------------------------------------------------ the game side
function fakeGame({ cells = 600 } = {}) {
    const calls = [];
    const g = {
        localId: 'me', authority: true, remotes: new Map(), calls,
        character: { group: { position: { x: 0, y: 12, z: 0 } }, verticalVelocity: 0, onGround: true, swimY: null },
        combat: { enabled: true, dead: false, maxFatigue: cells, fatigue: cells, hurtAt: -1e9, _hudKey: '', maxHp: 20, hp: 20, damage() {} },
        hud: { setVoice(t) { calls.push(t); }, toast() {}, update() {} },
        sync: { darkLord(m) { calls.push(m); }, armor() {} },
        mana: { growth: 400, onDeath() {} },
        bonus: { hp: 0, fatigue: 0 },
        items: { held: { right: null, left: null } },
        inventory: { slots: [null, null], storeItem(it) { this.slots[0] = it; return true; } },
        breakward: { marked: true, bar: { reset() {} }, _hud() {}, onDeath() {} },
        flight: { active: false }, castleLife: null, focus: { lose() {} }, impact: {},
        isDeadLocal: false, maxHP: 20, playerHP: 20,
    };
    g.dark = new DarkHero(g);
    g.darkLord = new DarkLordLife(g);
    g.armor = new ArmorSystem(g);
    return g;
}
const play = (g, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) { g.darkLord.update(dt); g.armor.update(dt); } };

test('lord game: level 100 with a fight going on waits; when it is quiet the rite begins, the outfit is on in the middle, the mark falls off', () => {
    const g = fakeGame();
    g.combat.hurtAt = performance.now();
    const robe = makeRobe(true, () => 0.5, 'mid'); robe.mag = 420;
    g.armor.worn.robe = robe;
    addDark(g.dark, 100, 'ritual');
    assert.equal(g.darkLord.want, true);
    play(g, 3);
    assert.equal(g.darkLord.rite, null, 'a fresh hit: it waits');
    assert.equal(g.darkLord.on, false);
    assert.ok(g.calls.some((c) => typeof c === 'string' && /подождёт/.test(c)), 'and says so');
    g.combat.hurtAt = -1e9; // calm
    play(g, 5);
    assert.ok(g.darkLord.rite, 'the rite is on');
    assert.equal(g.darkLord.lifting, true);
    assert.ok(g.character.group.position.y > 12 + 2, 'the hero hangs in the air');
    play(g, 20);
    assert.equal(g.darkLord.rite, null);
    assert.equal(g.darkLord.on, true);
    assert.ok(Math.abs(g.character.group.position.y - 12) < 1e-6, 'let down where he rose');
    assert.equal(g.armor.worn.robe.lord, true);
    assert.equal(g.armor.worn.robe.mag, 420, 'the absorbed robe’s reserve is the same');
    assert.equal(g.breakward.marked, false, 'the protection mark is gone');
    assert.ok(g.calls.some((c) => typeof c === 'string' && /метка снята/.test(c)));
    assert.ok(g.calls.some((c) => c.k === 'begin') && g.calls.some((c) => c.k === 'end'), 'the others are told');
    // not taken off, nothing goes on over it
    assert.equal(g.armor.wear(makeRobe(true), {}), false);
    assert.equal(g.armor.worn.robe.lord, true);
    assert.ok(g.calls.some((c) => typeof c === 'string' && /часть вас самих/.test(c)));
    g.armor.disarmorMe('x', {});
    assert.equal(g.armor.worn.robe?.lord, true, 'Disarmor does not take it');
});

test('lord game: armour worn by a dark mage turns black and breaks (600 s / 1200 s) with the message; a sword-less robe-less hero too', () => {
    const g = fakeGame();
    addDark(g.dark, 100); g.combat.hurtAt = -1e9;
    play(g, 20);
    assert.equal(g.armor.worn.robe.lord, true, 'no robe before: the outfit is on anyway');
    assert.equal(g.armor.worn.robe.magic, false);
    const plain = makePiece('chest'), magic = makePiece('helmet', { magic: true });
    g.armor.wear(plain, { quiet: true }); g.armor.wear(magic, { quiet: true });
    assert.equal(plain.cursed, true, 'black at once'); assert.equal(wornCode(g.armor.worn).dk, 3);
    g.calls.length = 0;
    play(g, 599, 1);
    assert.ok(g.armor.worn.chest, 'still on at 599 s');
    play(g, 2, 1);
    assert.equal(g.armor.worn.chest, null, 'the plain breastplate broke at 600 s');
    assert.ok(g.calls.some((c) => /сломаны проклятием тёмного мага/.test(c)));
    assert.ok(g.armor.worn.helmet, 'the magic helmet holds');
    play(g, 599, 1);
    assert.equal(g.armor.worn.helmet, null, 'and breaks at 1200 s');
});

test('lord game: the potion — the warning first, the same flask is drunk only after it was taken from the mouth and brought again', () => {
    const g = fakeGame({ cells: 700 });
    addDark(g.dark, 100); g.combat.hurtAt = -1e9;
    play(g, 20);
    const flask = { uid: 'p1', rec: 'lordcure' };
    assert.equal(g.darkLord.drinkCure(flask), 'warn');
    assert.ok(g.calls.some((c) => typeof c === 'string' && /потеряете 500 ячеек маны/.test(c)));
    assert.equal(g.darkLord.drinkCure(flask), 'none', 'still at the mouth: not drunk');
    assert.equal(g.combat.maxFatigue, 700);
    g.darkLord.mouthFree();
    assert.equal(g.darkLord.drinkCure(flask), 'drink');
    assert.equal(g.combat.maxFatigue, 200, '500 cells taken');
    assert.equal(g.darkLord.on, false); assert.equal(g.dark.level, 0);
    assert.equal(g.armor.worn.robe, null, 'the given outfit is gone');
});

test('lord game: the cure with little mana — 300 cells take all of them (30 % to fail), under 100 nothing works', () => {
    const lift = (cells, roll) => {
        const g = fakeGame({ cells });
        g.mana.growth = Math.max(0, cells - 30);
        addDark(g.dark, 100); g.combat.hurtAt = -1e9; play(g, 20);
        const robe0 = g.armor.worn.robe;
        const _r = Math.random; Math.random = () => roll;
        try {
            const f = { uid: 'p' + cells };
            g.darkLord.drinkCure(f); g.darkLord.mouthFree();
            assert.equal(g.darkLord.drinkCure(f), 'drink');
        } finally { Math.random = _r; }
        return { g, robe0 };
    };
    const a = lift(300, 0.3);
    assert.equal(a.g.darkLord.on, false, '60 % chance, rolled 0.3: lifted');
    assert.equal(a.g.combat.maxFatigue, 30, 'all the cells went (down to the base)');
    const b = lift(300, 0.9);
    assert.equal(b.g.darkLord.on, true, 'rolled 0.9: stays cursed');
    assert.equal(b.g.combat.maxFatigue, 30, 'but the cells are gone all the same');
    const c = lift(60, 0);
    assert.equal(c.g.darkLord.on, true); assert.equal(c.g.combat.maxFatigue, 60, 'under 100: nothing happens, nothing taken');
});

test('lord game: the absorbed robe comes back after the cure with its own reserve', () => {
    const g = fakeGame({ cells: 900 });
    const robe = makeRobe(true, () => 0.1, 'simple'); robe.mag = 150;
    g.armor.worn.robe = robe;
    addDark(g.dark, 100); g.combat.hurtAt = -1e9; play(g, 20);
    assert.equal(g.armor.worn.robe.lord, true);
    g.armor.worn.robe.mag = 90; // (spent on the way)
    g.darkLord.lift();
    assert.equal(g.armor.worn.robe.lord, undefined);
    assert.equal(magOf(g.armor.worn.robe), 90);
    assert.equal(g.armor.worn.robe.color, robe.color);
    assert.equal(g.armor.wear(makeRobe(false), { quiet: true }), true, 'the robe can be changed again');
});

test('lord game: the rite is torn off by death; nothing is half-done (the hero is let down, no outfit)', () => {
    const g = fakeGame();
    addDark(g.dark, 100); g.combat.hurtAt = -1e9;
    play(g, 6);
    assert.ok(g.darkLord.rite);
    g.combat.dead = true;
    play(g, 0.2);
    assert.equal(g.darkLord.rite, null); assert.equal(g.darkLord.on, false);
    assert.equal(g.darkLord.lifting, false);
});

test('lord game: death takes the outfit into the legacy; the body gives it back with the absorbed robe', () => {
    const g = fakeGame({ cells: 400 });
    g.books = { learned: new Set() };
    const robe = makeRobe(true, () => 0.9, 'strong'); robe.mag = 640;
    g.armor.worn.robe = robe;
    addDark(g.dark, 100); g.combat.hurtAt = -1e9; play(g, 20);
    const piece = makePiece('legs'); g.armor.wear(piece, { quiet: true });
    const rec = captureLegacy(g);
    assert.equal(rec.lord.on, 1);
    assert.equal(rec.lord.robe.mag, 640, 'the robe he had is kept');
    assert.equal(rec.lord.robe.lord, undefined);
    wipeHero(g);
    const dropped = g.armor.takeOffAll({ suit: true });
    assert.equal(g.darkLord.on, false); assert.equal(g.dark.level, 0);
    assert.equal(g.armor.worn.robe, null, 'the outfit does not lie on the ground');
    assert.equal(dropped.some((d) => d.lord), false);
    assert.equal(dropped.find((d) => d.piece === 'legs').cursed, undefined, 'the dropped steel is plain again');
    // the new life is a clean one: no outfit, no level (JSON roundtrip as in the world’s save)
    absorbLegacy(g, JSON.parse(JSON.stringify(rec)));
    assert.equal(g.darkLord.on, true, 'the legacy gives the outfit back…');
    assert.equal(g.armor.worn.robe.lord, true);
    assert.equal(g.armor.worn.robe.mag, 640, '…with the absorbed robe’s reserve');
    assert.equal(g.dark.level, 100);
    assert.equal(g.darkLord.rite, null, 'no second rite');
    assert.equal(g.darkLord.want, false);
});

test('lord game: a save keeps it (the outfit is in the armour’s list); a load of level 100 without the outfit begins the rite again', () => {
    const g = fakeGame();
    addDark(g.dark, 100); g.combat.hurtAt = -1e9; play(g, 20);
    const snap = JSON.parse(JSON.stringify({ armor: g.armor.snapshot(), dl: g.darkLord.snapshot(), dark: g.dark.snapshot() }));
    const h = fakeGame();
    h.dark.restore(snap.dark); h.armor.restore(snap.armor); h.darkLord.restore(snap.dl);
    assert.equal(h.darkLord.on, true); assert.equal(h.darkLord.want, false);
    play(h, 5);
    assert.equal(h.darkLord.rite, null, 'no rite again');
    assert.equal(h.armor.worn.robe.lord, true);
    const k = fakeGame();
    k.dark.restore({ level: 100, skin: 100 }); k.combat.hurtAt = -1e9;
    play(k, 5);
    assert.ok(k.darkLord.rite, 'level 100 but no outfit: the rite');
});
