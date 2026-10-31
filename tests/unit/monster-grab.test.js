// Монстр пентаграммы берёт существ в лапу: схватить, держать, раздавить, бросить (GrabRules.js, MonsterGrab.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GRAB_RULES as R, GRAB_TARGETS, GRAB_CRIES, BODY_KG, BODY_LEN, grabVerdict, fits, squeezeOf, smoothSqueeze, squeezeDps, squeezeStep, throwSpeed, throwGain, choked, wizardFreeT, shownCurl, wrapOf, squashOf } from '../../src/game/GrabRules.js';
import { MonsterGrab, grabKind } from '../../src/game/MonsterGrab.js';

// ------------------------------------------------------------------ правила

test('таблица «кто/что»: люди, звери, зомби, моряки — да; большие и бестелесные — нет, у каждого причина', () => {
    for (const k of ['player', 'villager', 'knight', 'king', 'wizard', 'zombie', 'animal', 'sailor', 'skeleton', 'blackbeard']) assert.equal(GRAB_TARGETS[k].does, 'grab', k);
    for (const k of ['dragon', 'spider', 'iceQueen', 'iceGiant', 'snowman', 'tree', 'phoenix', 'owl', 'ghost', 'spencer', 'gargoyle', 'canary', 'taron', 'devil', 'monster', 'imperius', 'arena', 'rider', 'held', 'dead']) {
        assert.equal(GRAB_TARGETS[k].does, 'no', k);
        assert.ok(GRAB_TARGETS[k].why.length > 10, k);
    }
    assert.equal(grabVerdict('nothing').ok, false);
    for (const k of Object.keys(GRAB_CRIES)) assert.ok(GRAB_CRIES[k].length >= 3, k);
});

test('по размеру: человек, корова, лошадь помещаются в кулак ×7; Тарон (7 м) — нет; маленький монстр берёт меньше', () => {
    for (const k of ['villager', 'knight', 'cow', 'horse', 'bull', 'pig', 'sheep']) assert.ok(fits(BODY_LEN[k]), k);
    assert.equal(fits(7), false);
    assert.equal(fits(BODY_LEN.cow, 3.5), false); // (пока растёт ×3,5 — корова ещё не помещается)
    // ладонь монстра: 0,28 × 0,45 героя × 7 × 1,55 ≈ 3 × 4,9 м — человек 3,5 м лежит в ней
    assert.ok(0.45 * 7 * 1.55 >= BODY_LEN.villager);
});

test('сжатие: лёгкий кулак держит без урона, сильнее — ранит, до конца дольше CRUSH_T — раздавлен', () => {
    assert.equal(squeezeOf(0.65, 0.9), 0);
    assert.equal(squeezeOf(0.72, 0.9), 0);
    assert.ok(squeezeOf(0.8, 0.9) > 0.3 && squeezeOf(0.8, 0.9) < 0.7);
    assert.equal(squeezeOf(0.95, 0.9), 1);
    // кулак этого игрока слабый (учёт HandTrack.closedRef): его «до конца» ниже — давит тот же кулак
    assert.ok(squeezeOf(0.86, 0.84) >= 0.99);
    assert.equal(squeezeDps(0.2), 0);
    assert.ok(squeezeDps(0.6) > 0 && squeezeDps(0.6) < squeezeDps(0.89));
    const st = {};
    let dmg = 0, crush = false, t = 0;
    for (; t < 3 && !crush; t += 1 / 60) { const r = squeezeStep(st, 0.6, 1 / 60); dmg += r.dmg; crush = r.crush; }
    assert.equal(crush, false);
    assert.ok(dmg > 5 && dmg < 30, `за 3 с при 0,6 — ${dmg}`);
    const st2 = {};
    let tc = 0;
    for (; tc < 3; tc += 1 / 60) if (squeezeStep(st2, 0.95, 1 / 60).crush) break;
    assert.ok(Math.abs(tc - R.CRUSH_T) < 0.05, `раздавлен через ${tc.toFixed(2)} с`);
    // дрожь пальцев: короткий всплеск не давит
    let k = 0;
    for (let i = 0; i < 3; i++) k = smoothSqueeze(k, 1, 1 / 60);
    assert.ok(k < 0.35);
    // отпустил сжатие — отсчёт до «раздавлен» сбрасывается
    const st3 = {};
    for (let i = 0; i < 20; i++) squeezeStep(st3, 0.95, 1 / 60);
    squeezeStep(st3, 0.5, 1 / 60);
    assert.equal(st3.crushT, 0);
});

test('бросок: тяжелее тело — медленнее; быстрее лапы не бывает; держимого волшебника душит сильное сжатие', () => {
    assert.ok(throwGain(BODY_KG.villager) > throwGain(BODY_KG.cow));
    assert.ok(throwSpeed(30, 75) > 25);
    assert.equal(throwSpeed(200, 4), R.V_MAX);
    assert.ok(throwSpeed(30, 600) < throwSpeed(30, 75));
    assert.ok(choked(0.6) && !choked(0.3));
    assert.equal(wizardFreeT('novice'), null);
    assert.ok(wizardFreeT('master', 0) < wizardFreeT('adept', 0));
});

test('пальцы лапы ложатся на тело, сжатие вдавливает глубже, тело сплющивается', () => {
    assert.equal(shownCurl(0.3, 0.6, 0), 0.3);
    assert.equal(shownCurl(0.95, 0.6, 0), 0.6);
    assert.ok(shownCurl(0.95, 0.6, 1) > 0.75 && shownCurl(0.95, 0.6, 1) <= 0.95);
    assert.ok(wrapOf('cow') < wrapOf('villager'));
    assert.ok(squashOf(1) < 0.85 && squashOf(0) === 1);
});

// ------------------------------------------------------------------ игровая часть на макете игры

/** Мир: пол на y = 0, стена — x ≥ wallX (если задана). Монстр (×7) с кистью в `palm`. */
function world({ wallX = Infinity } = {}) {
    const palm = new THREE.Vector3(0, 12, 0);
    const curl = { left: 0, right: 0 };
    const grip = new THREE.Object3D(); // (лицо ладони — её −Z)
    const ch = {
        size: 7, group: new THREE.Group(), handVelocity: { left: new THREE.Vector3(), right: new THREE.Vector3() },
        getHandWorldPosition: (s, out = new THREE.Vector3()) => out.copy(palm),
        getGripObject: () => grip,
        getGripCurl: (s) => curl[s], handLost: () => false, isHandTracked: () => true,
        getActiveHands: () => ({ left: null, right: null }),
        armState: () => ({ hand: new THREE.Vector3(0.4, 1, -0.6), reach: 0.9, forward: 0.8, up: 0, palmUp: 0, vRel: new THREE.Vector3(), speed: 0, vWorld: new THREE.Vector3() }),
    };
    ch.group.position.set(0, 14, 12);
    const solid = (x) => x >= wallX;
    const collision = {
        groundAt: () => 0, groundY: () => 0, surfaceY: () => 0,
        lineOfSight: (ax, ay, az, bx, by, bz) => !(solid(ax) || solid(bx)),
    };
    const said = [], hits = [], letGo = [], sent = [], alarms = [];
    const v = { id: 'c1:3', isVillager: true, role: 'farmer', x: 1, y: 9, z: 0, yaw: 0, hp: 20, dead: false, model: { group: new THREE.Group() } };
    const castleLife = {
        targets: () => (v.dead ? [] : [v]), byId: new Map([[v.id, v]]),
        _say: (c, t) => said.push(t), alarm: (...a) => alarms.push(a), reportCrime() {},
        hit: (c, d, dir, by, o) => { hits.push({ d, o }); c.hp -= o?.pierce ? c.hp : d; if (c.hp <= 0) c.dead = true; },
    };
    const levitation = {
        lifted: null,
        _centre: (ck, c, out) => { out.set(c.x, c.y + 2.4, c.z); return 2.4; },
        _kicking() {},
        letGo: (ck, c) => { letGo.push({ ck, vel: c.lev.vel.clone().multiplyScalar(1.5), top: c.lev.top }); c.lev = null; },
        dropMe(gentle) { this.dropped = gentle; this.lifted = null; },
    };
    const g = {
        localId: 'me', authority: true, character: ch, collision, castleLife, levitation, zombies: [], remotes: new Map(),
        monster: { active: true, _grabCd: 0 }, fx: { shake: 0, spark() {} }, hud: { setVoice: (t) => said.push(t) },
        sync: { monsterGrab: (m) => sent.push(m) }, config: {},
    };
    const mg = new MonsterGrab(g);
    g.monsterGrab = mg;
    return { g, mg, ch, v, palm, curl, said, hits, letGo, sent, alarms };
}

test('хват: житель в ладони — в лапе (сам не ходит), крик и тревога «монстр»; разжал без замаха — выпал, падает с высоты', () => {
    const W = world();
    W.curl.right = 0.7;
    assert.equal(W.mg.tryGrab('right'), true);
    assert.equal(W.v.lev?.paw, true);
    assert.ok(W.alarms.some((a) => a[1] === 'monster'));
    assert.ok(W.said.length > 0);
    assert.ok(W.sent.some((m) => m.e === 'ok'));
    for (let i = 0; i < 30; i++) { W.mg.stepMine(1 / 60); W.mg.update(1 / 60); }
    // тело у ладони: середина перед ладонью (HOLD_OUT), ноги над полом
    assert.ok(new THREE.Vector3(W.v.x, W.v.y + 2.4, W.v.z).distanceTo(W.palm) < 1.6);
    assert.equal(W.hits.length, 0, 'лёгкий кулак без урона');
    // пальцы раскрылись — тело выпало (ThrowModel или запасной путь DROP_OPEN_T)
    W.curl.right = 0.1;
    for (let i = 0; i < 40 && W.mg.holds('right'); i++) { W.mg.stepMine(1 / 60); W.mg.update(1 / 60); }
    assert.equal(W.mg.holds('right'), false);
    assert.equal(W.letGo.length, 1, 'падает (Levitation.letGo — удар о землю по высоте)');
    assert.ok(W.letGo[0].top > 8);
    assert.equal(W.v.lev, null);
});

test('раздавить до конца: доспех не спасает (рыцарю 200 ХП — всё равно раздавлен за CRUSH_T)', () => {
    const W = world();
    W.v.role = 'knight'; W.v.hp = 200;
    W.curl.right = 0.7;
    W.mg.tryGrab('right');
    W.curl.right = 0.99;
    for (let i = 0; i < 90 && !W.v.dead; i++) { W.mg.stepMine(1 / 60); W.mg.update(1 / 60); }
    assert.ok(W.v.dead && W.v.crushed);
    assert.ok(W.hits.some((h) => h.o.pierce));
});

test('давить: сильный кулак ранит по времени, до конца — раздавлен (тело «раздавлен», хруст у всех)', () => {
    const W = world();
    W.curl.right = 0.7;
    W.mg.tryGrab('right');
    W.curl.right = 0.82;
    for (let i = 0; i < 60; i++) { W.mg.stepMine(1 / 60); W.mg.update(1 / 60); }
    assert.ok(W.hits.length > 0 && W.hits.every((h) => h.o.kind === 'crush'));
    assert.ok(!W.v.dead, 'за секунду средним сжатием не умер');
    W.curl.right = 0.99;
    for (let i = 0; i < 90 && !W.v.dead; i++) { W.mg.stepMine(1 / 60); W.mg.update(1 / 60); }
    assert.ok(W.v.dead && W.v.crushed);
    assert.ok(W.sent.some((m) => m.e === 'crush'));
    assert.equal(W.mg.holds('right'), false);
    assert.ok(Math.abs(W.v.y) < 0.2, 'тело на полу, не в воздухе');
});

test('стена: тело не идёт сквозь неё — упирается; ладонь ушла за стену далеко — выскользнуло и падает', () => {
    const W = world({ wallX: 3 });
    W.curl.right = 0.7;
    W.mg.tryGrab('right');
    W.palm.set(6, 12, 0); // (лапа за стеной)
    for (let i = 0; i < 5; i++) { W.mg.stepMine(1 / 60); W.mg.update(1 / 60); }
    assert.ok(W.v.x < 3, `тело до стены: x ${W.v.x.toFixed(2)}`);
    W.palm.set(12, 12, 0);
    for (let i = 0; i < 5; i++) { W.mg.stepMine(1 / 60); W.mg.update(1 / 60); }
    assert.equal(W.mg.holds('right'), false);
    assert.ok(W.v.x < 3);
});

test('стена между ладонью и телом — не берётся (лапа ломает кусок постройки, как раньше)', () => {
    const W = world({ wallX: 0.5 });
    W.palm.set(0, 12, 0); W.v.x = 1;
    W.curl.right = 0.7;
    assert.equal(W.mg.tryGrab('right'), false);
});

test('одно тело — одной лапой; монстр кончился — тела падают', () => {
    const W = world();
    W.curl.left = W.curl.right = 0.7;
    W.mg.tryGrab('right');
    assert.equal(W.mg.tryGrab('left'), true); // (в ладони — то же тело, уже в другой лапе: «уже держит другая лапа»)
    assert.equal(W.mg.holds('left'), false);
    W.g.monster.active = false;
    W.mg.update(1 / 60);
    assert.equal(W.mg.holds('right'), false);
    assert.equal(W.v.lev, null);
});

test('бросок: замах лапой — тело летит со скоростью кисти × вес (ThrowModel)', () => {
    const W = world();
    W.curl.right = 0.7;
    W.mg.tryGrab('right');
    for (let i = 0; i < 30; i++) { W.mg.stepMine(1 / 60); W.mg.update(1 / 60); }
    // ThrowModel решил «бросок» (его разбор кисти — throwbench; здесь — что лапа делает с его решением)
    W.mg._trk.right.decide = () => ({ act: 'throw', why: 'бросок', v: { x: 0, y: 8, z: -28 }, speed: 29 });
    W.mg.stepMine(1 / 60);
    assert.equal(W.letGo.length, 1);
    const sp = W.letGo[0].vel.length();
    assert.ok(Math.abs(sp - throwSpeed(Math.hypot(8, 28), BODY_KG.villager)) < 0.5, `вылет ${sp.toFixed(1)} м/с`);
    assert.ok(W.sent.some((m) => m.e === 'let' && m.th === 1));
});

test('держимый игрок: висит в лапе на своём компьютере, вырывается сам за 5 с, монстру — «вырвался»', () => {
    const W = world();
    // этот компьютер — жертва: монстр — другой игрок 'm'
    const mc = W.ch;
    W.g.remotes.set('m', { character: mc, lastUpdate: performance.now(), dead: false });
    const me = { group: new THREE.Group(), verticalVelocity: 0, onGround: true };
    me.group.position.set(1, 9 + 2, 0);
    W.g.character = me;
    W.g.monster.active = false;
    W.g.knockback = new THREE.Vector3();
    W.g.combat = { enabled: true, dead: false, damage(d) { this.hp = (this.hp ?? 20) - d; }, die() { this.dead = true; } };
    W.mg.onNet({ e: 'hold', by: 'm', s: 1, k: 'p', id: 'me' });
    assert.equal(W.g.levitation.lifted?.paw, true);
    for (let t = 0; t < 4.9; t += 1 / 30) { W.g.remotes.get('m').lastUpdate = performance.now(); W.mg.update(1 / 30); }
    assert.ok(W.g.levitation.lifted, 'ещё держит');
    for (let t = 0; t < 0.3; t += 1 / 30) { W.g.remotes.get('m').lastUpdate = performance.now(); W.mg.update(1 / 30); }
    assert.equal(W.g.levitation.lifted, null);
    assert.ok(W.sent.some((m) => m.e === 'end' && m.to === 'm' && m.w === 'free'));
});

test('вид держимого — по таблице: рыцарь, король, волшебник, скелет, звери', () => {
    assert.equal(grabKind('v', { role: 'knight' }), 'knight');
    assert.equal(grabKind('v', { role: 'farmer', wizard: true }), 'wizard');
    assert.equal(grabKind('s', { role: 'skeleton' }), 'skeleton');
    assert.equal(grabKind('a', { type: 'cow' }), 'cow');
    assert.equal(grabKind('p', {}), 'player');
});
