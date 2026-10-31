// «Божественный меч» (DivineSword.js, UnitedRules.divineRecipe, UnitedPower): тайный рецепт Unitas — Ледяной Жезл + ВОЛШЕБНЫЙ меч,
// дар богов (ничто не уничтожает), касание убивает любого, ломбард не берёт, Левиоса поднимает, обряд в игре (настоящие вещи оружия в круге).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { isDivine, divineStrikeHit, DIVINE, DIVINE_KINDS, divineSwordItem, makeDivineSword, pierceDiabolos, diabolosTouch } from '../../src/game/DivineSword.js';
import { canUnite, mergeItems, divineRecipe, magicSword, riteThing, UNITED } from '../../src/game/UnitedRules.js';
import { isGodGift, isMagicItem, describeItem } from '../../src/game/ItemTypes.js';
import { fenceTakes, pawnPrice } from '../../src/game/WizardMarket.js';
import { WEAPON_SPECS } from '../../src/entities/WeaponModels.js';
import { Weapon } from '../../src/entities/Weapon.js';
import { WeaponSystem } from '../../src/game/Weapons.js';
import { UnitedPower } from '../../src/game/UnitedPower.js';
import { ACH_IDS, HIGH_IDS, achBonus, ACH_BY_ID } from '../../src/game/Achievements.js';

const rod = { kind: 'iceRod', uid: 'rod', godGift: true };
const sword = { kind: 'weapon', type: 'sword', magic: true, bonus: 30, uid: 'sw' }; // (a magic sword — the author: «с магическим мечом, а не обычным»)
const plain = { kind: 'weapon', type: 'sword', magic: false, bonus: 0, uid: 'pl' };

test('the secret recipe: the Ice Rod + a MAGIC sword (either order, enchanted too) → the divine sword, not a sum of buffs', () => {
    for (const [a, b] of [[rod, sword], [sword, rod]]) {
        const c = canUnite(a, b);
        assert.ok(c.ok && c.divine);
        const r = mergeItems(a, b, { uid: 'new' });
        assert.ok(r.ok && r.divine);
        assert.deepEqual(r.item, { kind: 'weapon', type: 'divine', godGift: true, magic: false, bonus: 0, uid: 'new' });
        assert.ok(isDivine(r.item) && isGodGift(r.item));
    }
    assert.ok(riteThing(rod), 'the circle counts the rod as a thing for the rite');
    assert.ok(canUnite(rod, { ...sword, ench: { tier: 1, kind: 'weapon' } }).divine, 'an enchanted magic sword is still a magic sword');
});

test('not the recipe: a plain sword, a united sword, a magic axe, the divine one, two rods, a rod with a wand — the usual answers, the secret not told', () => {
    for (const s of [plain, { ...plain, ench: { tier: 0, kind: 'weapon' } }, { ...sword, united: 2 }, { kind: 'weapon', type: 'axe', magic: true, bonus: 10 }, { kind: 'weapon', type: 'divine' }]) {
        assert.ok(!divineRecipe(rod, s), JSON.stringify(s));
        const c = canUnite(rod, s);
        assert.ok(!c.ok && !/жезл|меч|божеств/i.test(c.why), c.why);
    }
    assert.ok(!canUnite(rod, { ...rod, uid: 'r2' }).ok, 'rod + rod');
    assert.ok(!canUnite(rod, { kind: 'wand', power: 5, model: 1 }).ok, 'rod + wand');
    assert.ok(magicSword(sword) && !magicSword(plain));
});

test('two swords still unite as before (summed numbers), the result a sword — not divine', () => {
    const r = mergeItems({ ...sword, magic: true, bonus: 20 }, { ...sword, magic: true, bonus: 5, uid: 's2' }, { uid: 'x' });
    assert.ok(r.ok && !r.divine);
    assert.equal(r.item.type, 'sword');
    assert.equal(r.item.bonus, 25);
    assert.ok(!isDivine(r.item));
});

test('isDivine: the cell record, the Weapon, a «divine» record; nothing else; its touch kills anyone', () => {
    assert.ok(isDivine({ kind: 'weapon', type: 'divine' }) && isDivine({ type: 'divine' }) && isDivine({ divine: true }));
    assert.ok(!isDivine({ kind: 'weapon', type: 'sword' }) && !isDivine(rod) && !isDivine(null) && !isDivine({ kind: 'wand', type: 'divine' }));
    assert.ok(DIVINE_KINDS.has('divine'));
    assert.deepEqual(divineStrikeHit({ type: 'divine' }), { kill: true, dmg: DIVINE.KILL, pierces: true });
    assert.deepEqual(divineStrikeHit(sword), { kill: false, dmg: 0, pierces: false });
    assert.ok(DIVINE.KILL >= 1e6 && DIVINE.TOUCH_SPEED <= 1.5, 'a touch of the moving blade, any health');
    const w = new Weapon(new THREE.Scene(), 'divine', { headless: true });
    assert.equal(w.type, 'divine');
    assert.ok(w.godGift && isDivine(w));
    assert.equal(w.damageScale, DIVINE.KILL);
    assert.equal(new Weapon(new THREE.Scene(), 'sword', { headless: true }).damageScale, 1);
});

test('its size from the plain sword: longer (+~15 %), lighter, the same grip; held as a sword', () => {
    const d = WEAPON_SPECS.divine, s = WEAPON_SPECS.sword;
    assert.equal(d.scale, s.scale);
    assert.ok(d.length > s.length * 1.1 && d.length < s.length * 1.25, `${d.length} vs ${s.length}`);
    assert.ok(d.mass < s.mass, 'lighter');
    assert.ok(d.handle[1] - d.handle[0] >= s.handle[1] - s.handle[0], 'a whole hand on the grip');
    assert.ok(Math.abs(d.handleRadius - s.handleRadius) < 0.005);
});

test('a gift of the gods: every destroyer asks isGodGift / w.godGift — Liquidation, the held-thing breaker, «Дай», death drops', () => {
    assert.ok(isGodGift({ kind: 'weapon', type: 'divine' }), 'without the flag, by its type');
    const src = (f) => fs.readFileSync(new URL('../../src/game/' + f, import.meta.url), 'utf8');
    assert.match(src('Liquidation.js'), /if \(w\.godGift\)/, 'Liquidation leaves a divine weapon');
    assert.match(src('HeldBreak.js'), /godGift: !!w\.godGift/, 'the held-weapon breaker sees it');
    assert.match(src('Death.js'), /d\.type === 'divine' \? 'divine'/, 'the owner\'s death: it drops by the body as itself');
    assert.match(src('Death.js'), /isGodGift\(d\)/, '«Дай»: only the gods\' gifts are left');
    assert.match(fs.readFileSync(new URL('../../src/net/NetSync.js', import.meta.url), 'utf8'), /m\.type === 'divine' \? 'divine'/, 'the network keeps its type');
});

test('no buyer takes it: the fence refuses, the pawnshop price is 0, the merchant says no', () => {
    const it = divineSwordItem('u1');
    assert.ok(!fenceTakes(it));
    assert.equal(pawnPrice(it), 0);
    assert.ok(isMagicItem(it));
    assert.match(fs.readFileSync(new URL('../../src/game/CastleTalk.js', import.meta.url), 'utf8'), /if \(isDivine\(found\.item\)\)/);
});

test('the description: «вы», no recipe, no Diabolos; the codex and the Unitas scroll never tell the secret', () => {
    const d = describeItem(divineSwordItem());
    const all = d.title + ' ' + d.lines.join(' ');
    assert.match(all, /Клинок, светящийся неземным светом/);
    assert.ok(!/Жезл|Unitas|пентаграм|Дьявол|Королев/i.test(all), all);
    const codex = fs.readFileSync(new URL('../../src/ui/Codex.js', import.meta.url), 'utf8');
    assert.ok(!/[Бб]ожественн\S* меч|divineSword/.test(codex), 'the codex says nothing of it');
});

test('the achievement «Божественный клинок»: +100 cells, not needed for «Высший маг»', () => {
    assert.equal(ACH_BY_ID.divineBlade.mana, 100);
    assert.ok(!HIGH_IDS.includes('divineBlade') && ACH_IDS.includes('divineBlade') && ACH_BY_ID.divineBlade.extra);
    assert.ok(achBonus(HIGH_IDS).high, 'all but it → still the High Mage');
    assert.equal(achBonus(['divineBlade']).mana, 100);
    assert.ok(!achBonus(['divineBlade']).high);
});

test('Diabolos is asked safely: no game.diabolos / no pierce → nothing; with them → pierce(point, by, {via})', () => {
    assert.equal(diabolosTouch({}, new THREE.Vector3(), new THREE.Vector3()), null);
    assert.equal(pierceDiabolos({}, new THREE.Vector3(), 'me'), false);
    const calls = [];
    const g = { diabolos: { bladeHit: (a, b) => (b.y > 1 ? new THREE.Vector3(0, 1, 0) : null), pierce: (p, by, o) => calls.push([p.y, by, o.via]) } };
    assert.equal(diabolosTouch(g, new THREE.Vector3(), new THREE.Vector3(0, 0.5, 0)), null);
    const p = diabolosTouch(g, new THREE.Vector3(), new THREE.Vector3(0, 2, 0));
    assert.ok(pierceDiabolos(g, p, 'me', 'swarm'));
    assert.deepEqual(calls, [[1, 'me', 'swarm']]);
    g.diabolos.dead = true;
    assert.equal(diabolosTouch(g, new THREE.Vector3(), new THREE.Vector3(0, 2, 0)), null, 'dead: no more asking');
});

// ------------------------------------------------------------------ the rite in the game (headless: the real weapon system, the real UnitedPower)
function fakeGame() {
    const scene = new THREE.Scene();
    const sent = [];
    const loose = new Map();
    const g = {
        scene, headless: true, renderer: null, authority: true, localId: 'me', character: { group: { position: new THREE.Vector3(30, 0, 0) } },
        world: { collision: null }, now: () => performance.now(), hud: { setVoice() {} }, sound: null, fx: null,
        sync: { pentagram: (m) => sent.push(['pgm', m]), weaponGone: (w) => sent.push(['wgone', w.id]), weaponAppeared: (w) => sent.push(['wnew', w.type]), itemGone: (u) => sent.push(['gone', u]) },
        items: {
            loose,
            removeLoose: (u) => loose.delete(u),
            spawnLoose: (it, p, o = {}) => { const model = new THREE.Object3D(); model.position.copy(p); const L = { item: it, model, rest: true, hover: o.hover ? { y: p.y } : null }; loose.set(it.uid, L); return L; },
        },
        death: { bodies: new Map([['b1', { id: 'b1', k: 'v', x: 0.5, y: 0, z: 0 }]]), removeBody(id) { this.bodies.delete(id); } },
        achievements: { got: [], gain(k) { this.got.push(k); } },
        pentagranium: { marks: new Map([['m1', { id: 'm1', pent: 'unity', fade: 1, x: 0, y: 0, z: 0, life: 100 }]]) },
    };
    g.weapons = new WeaponSystem(g);
    const lay = (it, x, z) => g.items.spawnLoose(it, new THREE.Vector3(x, 0.2, z));
    lay({ kind: 'carnivoreHead', uid: 'h1' }, -0.6, 0.4);
    return { g, sent, lay };
}

test('the rite: the rod (a loose thing) and a magic sword (a Weapon lying still) in the circle → white-gold rite, both gone, a divine sword falls onto the circle', () => {
    const { g, sent, lay } = fakeGame();
    lay(rod, 0.8, -0.5);
    const sw = g.weapons.markMagic(g.weapons.spawn('sword', new THREE.Vector3(-0.8, 0.2, -0.6), new THREE.Quaternion(), 'S1'), 25);
    sw.sleeping = true;
    const U = new UnitedPower(g);
    U.update(0.5);
    assert.ok(U.run, 'the rite began by itself');
    assert.ok(U.run.divine, 'the holy look');
    assert.ok(sw.ritual && !g.weapons.grab(sw, 'left'), 'the magic holds the sword: no hand takes it in the rite');
    const start = sent.find((s) => s[0] === 'pgm')[1];
    assert.equal(start.dv, 1);
    assert.equal(start.res.type, 'divine');
    for (let i = 0; i < 400 && U.run; i++) { U.update(1 / 60); }
    assert.ok(!U.run, 'the rite ended');
    assert.ok(!g.items.loose.has('rod'), 'the rod is spent');
    assert.ok(!g.weapons.byId.has('S1'), 'the magic sword is gone');
    const made = g.weapons.weapons.filter((w) => w.type === 'divine');
    assert.equal(made.length, 1, 'one divine sword');
    assert.ok(made[0].godGift && !made[0].ritual, 'free, a gift of the gods');
    assert.deepEqual(g.achievements.got, ['divineBlade']);
    assert.ok(sent.some((s) => s[0] === 'wgone' && s[1] === 'S1') && sent.some((s) => s[0] === 'wnew' && s[1] === 'divine'), 'the others are told');
    assert.ok(!g.death.bodies.has('b1'), 'the body burnt');
});

test('the rite needs it all: no rod (only the sword) / one more thing / a plain sword — no rite, nothing spent', () => {
    for (const setup of [
        (g, lay) => { const w = g.weapons.spawn('sword', new THREE.Vector3(0.6, 0.2, 0), new THREE.Quaternion(), 'S'); w.sleeping = true; },
        (g, lay) => { lay(rod, 0.8, -0.5); lay({ kind: 'iceRod', uid: 'rod2' }, 0.2, 0.9); const w = g.weapons.markMagic(g.weapons.spawn('sword', new THREE.Vector3(-0.8, 0.2, -0.6), new THREE.Quaternion(), 'S'), 30); w.sleeping = true; },
        (g, lay) => { lay(rod, 0.8, -0.5); const w = g.weapons.spawn('sword', new THREE.Vector3(-0.8, 0.2, -0.6), new THREE.Quaternion(), 'S'); w.sleeping = true; },
    ]) {
        const { g, lay } = fakeGame();
        setup(g, lay);
        const U = new UnitedPower(g);
        U.update(0.5);
        assert.ok(!U.run, 'no rite');
        assert.ok(g.weapons.byId.has('S') && g.death.bodies.has('b1'), 'nothing spent');
    }
});

test('a sword held in a hand / still falling is not taken by the circle', () => {
    const { g, lay } = fakeGame();
    lay(rod, 0.8, -0.5);
    const w = g.weapons.markMagic(g.weapons.spawn('sword', new THREE.Vector3(-0.8, 0.2, -0.6), new THREE.Quaternion(), 'S'), 20);
    w.sleeping = false; // (still moving)
    const U = new UnitedPower(g);
    U.update(0.5);
    assert.ok(!U.run);
    w.sleeping = true; w.holder = { playerId: 'p2', side: 'left' };
    U._scanT = 0; U.update(0.5);
    assert.ok(!U.run);
});

test('makeDivineSword: a floating divine sword of the weapon system (for Creative at Diabolos), told to the others', () => {
    const { g, sent } = fakeGame();
    const w = makeDivineSword(g, 3, 2, 4);
    assert.ok(w && w.type === 'divine' && w.godGift && w.hover);
    assert.ok(sent.some((s) => s[0] === 'wnew' && s[1] === 'divine'));
    const l = makeDivineSword(g, 6, 0, 4, { hover: false, id: 'D2' });
    assert.ok(l.id === 'D2' && !l.hover);
    assert.equal(makeDivineSword({}, 0, 0, 0), null, 'no weapon system: nothing');
});

test('UNITED unchanged: 120 mana, +30 dark (the secret rite costs the same)', () => {
    assert.equal(UNITED.COST, 120);
    assert.equal(UNITED.DARK, 30);
});

test('the touch kills the creatures that ignore a plain blade: a living tree, the ice ones, an owl take it as DivineSword', async () => {
    const { aliveDamage } = await import('../../src/game/LivingTrees.js');
    const { iceDamage } = await import('../../src/game/IceQueen.js');
    const { isStrong } = await import('../../src/game/Owls.js');
    assert.equal(aliveDamage('melee', 5), 0);
    assert.equal(aliveDamage('DivineSword', DIVINE.KILL), DIVINE.KILL);
    for (const t of ['queen', 'monster', 'snowman']) assert.equal(iceDamage(t, 'DivineSword', DIVINE.KILL), DIVINE.KILL, t);
    assert.ok(isStrong('DivineSword') && !isStrong('melee'));
    assert.match(fs.readFileSync(new URL('../../src/game/Game.js', import.meta.url), 'utf8'), /isWeapon && isDivineThing\(weapon\)/);
});
