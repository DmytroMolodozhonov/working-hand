// Count Sracula: his numbers and what hurts him (VampireRules.js), the castle's plan (world/VampireCastle.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VAMPIRE, BATS, GUARDS, vampDamage, fightMove, batMayBite, darkAt, LINES } from '../../src/game/VampireRules.js';
import { vampireCastlePlan, vampLocal, vampUV, inVampKeep, VAMP } from '../../src/world/VampireCastle.js';
import { DARK_SPELLS } from '../../src/game/DarkMagic.js';
import { SPAWN_IDS, farTarget } from '../../src/game/SpawnSpots.js';
import { ACHIEVEMENTS } from '../../src/game/Achievements.js';

test('граф: числа автора (200 HP, удар −10, 20 с в облике мыши, 50 мышей по −1 раз в 10 с, 10 стражей, +150 ячеек)', () => {
    assert.equal(VAMPIRE.HP, 200);
    assert.equal(VAMPIRE.BLOW, 10);
    assert.equal(VAMPIRE.BAT_T, 20);
    assert.equal(BATS.N, 50);
    assert.equal(BATS.BITE, 1);
    assert.equal(BATS.COOL, 10);
    assert.equal(GUARDS.N, 10);
    const a = ACHIEVEMENTS.find((x) => x.id === 'vampire');
    assert.ok(a, 'ачивка за графа');
    assert.equal(a.mana, 150);
});

test('граф: тёмная магия — вдвое слабее, «Nihilis» — вдвое сильнее, божественное — полностью', () => {
    assert.equal(vampDamage('Stupefy', 10), 10);
    assert.equal(vampDamage('NihilisAtra', 10), 20);
    const dark = [...DARK_SPELLS][0];
    assert.ok(dark, 'есть тёмные заклинания');
    assert.equal(vampDamage(dark, 10), 5);
    assert.equal(vampDamage(dark, 10, true), 10, 'божественное бьёт полностью');
    assert.equal(vampDamage('AvadaKedavra', 25), DARK_SPELLS.has('AvadaKedavra') ? 12.5 : 25);
    assert.equal(vampDamage('Stupefy', 0), 0);
});

test('мышь кусает не чаще раза в 10 секунд', () => {
    assert.equal(batMayBite(undefined, 0), true);
    assert.equal(batMayBite(5, 14.9), false);
    assert.equal(batMayBite(5, 15), true);
});

test('бой графа: бросок вблизи лицом к цели, издали идёт, раненый — оборачивается мышью', () => {
    const base = { dist: 8, cool: 0, hpK: 1, batCool: 5, high: false, facing: true };
    assert.equal(fightMove(base), 'rush');
    assert.equal(fightMove({ ...base, facing: false }), 'stalk', 'не бросается боком/спиной');
    assert.equal(fightMove({ ...base, dist: 20 }), 'walk');
    assert.equal(fightMove({ ...base, hpK: 0.4, batCool: 0 }), 'bat');
    assert.equal(fightMove({ ...base, cool: 1 }), 'stalk');
});

test('тучи: тёмно над землёй графа и плавно светлеет вдали', () => {
    assert.equal(darkAt(0, 280, 120), 0.82);
    assert.equal(darkAt(280 + 120, 280, 120), 0);
    const mid = darkAt(340, 280, 120);
    assert.ok(mid > 0 && mid < 0.82);
    assert.ok(darkAt(300, 280, 120) > darkAt(380, 280, 120));
    assert.ok(typeof LINES.sunBlocked === 'string' && LINES.sunBlocked.length > 10);
});

test('замок: склеп, гроб, 2 сундука, 10 постов стражи, мост и подход; всё на своих местах', () => {
    for (const rot of [0, 1, 2, 3]) {
        const S = { x: 900, z: -400, rot, h0: 20, F: 60 };
        const P = vampireCastlePlan(S);
        assert.ok(P && P.parts.length > 30, 'много частей замка');
        assert.equal(P.posts.length, GUARDS.N);
        assert.equal(P.chests.length, 2);
        for (const k of ['hall', 'throne', 'crypt', 'coffin', 'gate', 'bridge', 'approach']) assert.ok(Number.isFinite(P[k]?.x) && Number.isFinite(P[k]?.z), k);
        assert.ok(inVampKeep(P, P.crypt.x, P.crypt.z), 'склеп под крышей');
        assert.ok(!inVampKeep(P, P.approach.x, P.approach.z), 'подход снаружи');
        // the local ↔ world mapping is one: back and forth gives the same
        const w = vampLocal(S, 5, -7), uv = vampUV(S, w.x - S.x, w.z - S.z);
        assert.ok(Math.abs(uv.u - 5) < 1e-9 && Math.abs(uv.v + 7) < 1e-9, `rot ${rot}: ${JSON.stringify(uv)}`);
        // the approach is beyond the gorge, the coffin inside the crag
        assert.ok(Math.hypot(P.approach.x - S.x, P.approach.z - S.z) > VAMP.R + VAMP.GORGE);
        assert.ok(Math.hypot(P.coffin.x - S.x, P.coffin.z - S.z) < VAMP.R);
    }
});

test('«Где появиться»: у замка графа — на подходе, лицом к воротам', () => {
    assert.ok(SPAWN_IDS.includes('vampire'));
    const P = vampireCastlePlan({ x: 900, z: -400, rot: 1, h0: 20, F: 60 });
    const t = farTarget('vampire', { vamp: { plan: P } });
    assert.ok(t, 'точка есть');
    const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), gx = P.gate.x - t.x, gz = P.gate.z - t.z;
    assert.ok((fx * gx + fz * gz) / Math.hypot(gx, gz) > 0.95, 'смотрит на ворота');
    assert.equal(farTarget('vampire', {}), null, 'в старом мире замка нет');
});
