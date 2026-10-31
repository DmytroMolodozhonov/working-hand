// Дьяволос (DiabolosRules.js, Diabolos.js, DiabolosModel.js): размеры ×5 монстра, сон и пробуждение, цепь держит, бессмертие
// по ВСЕМ заклинаниям, шар ломает любой щит и не ранит при щите, без щита ранит; модель ≤ 5 отрисовок.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { DEVIL, WAKE, FIRE, BALL, MOVES, MOVE_IDS, ChainRope, leash, wakes, chooseMove, devilVerdict, ballVerdict, ballDamage, seatFrom, yawTo } from '../../src/game/DiabolosRules.js';
import { MONSTER } from '../../src/game/MonsterForm.js';
import { flameReach } from '../../src/game/DragonKinds.js';
import { SPELL_SOUND } from '../../src/audio/SpellMusic.js';
import { isDivine } from '../../src/game/ProtectionGods.js';
import { DEVIL_SOUNDS } from '../../src/audio/DiabolosSounds.js';

test('размеры: в 5 раз больше монстра пентаграммы; огонь в 5 раз длиннее и шире драконьего', () => {
    assert.equal(DEVIL.HEIGHT, MONSTER.BODY_H * 5);
    assert.ok(DEVIL.RADIUS >= MONSTER.RADIUS * 5, 'упитанный: не уже ×5 монстра');
    assert.equal(DEVIL.SCALE, DEVIL.HEIGHT / DEVIL.MODEL_H);
    assert.equal(FIRE.LEN, flameReach(1) * 5);
    // конус драконьего огня: 0,7 + 0,17·путь (Dragons.inFlame) — у конца ×5
    const dragonEnd = 0.7 + flameReach(1) * 0.17, devilEnd = FIRE.R0 + FIRE.LEN * FIRE.SLOPE;
    assert.ok(Math.abs(devilEnd / dragonEnd - 5) < 1e-9);
    assert.ok(DEVIL.CHAIN_LINKS >= 40 && DEVIL.LINK_LEN >= 3 && DEVIL.LINK_LEN <= 4);
    assert.ok(DEVIL.CHAIN_LINKS * DEVIL.LINK_PITCH > DEVIL.CHAIN_LEN, 'цепь длиннее хода — у предела натягивается, а не рвётся');
    assert.ok(DEVIL.SEAT_MIN_R >= DEVIL.CHAIN_LEN + DEVIL.RADIUS - 5);
    assert.equal(BALL.R * 2, 6);
    assert.ok(BALL.SPEED[0] >= 28 && BALL.SPEED[1] <= 38, 'медленно — можно увернуться');
});

test('сон: не будят шаги и далёкий шум; будят попадание, громко рядом, вплотную, сундук, свет в лицо', () => {
    assert.equal(wakes({ kind: 'step', d: 5 }), null);
    assert.equal(wakes({ kind: 'noise', d: 80, loud: true }), null);
    assert.equal(wakes({ kind: 'noise', d: 10, loud: false }), null);
    assert.ok(wakes({ kind: 'noise', d: 30, loud: true }));
    assert.ok(wakes({ kind: 'hit' }));
    assert.ok(wakes({ kind: 'near', d: WAKE.NEAR - 1 }));
    assert.equal(wakes({ kind: 'near', d: WAKE.NEAR + 5 }), null);
    assert.ok(wakes({ kind: 'chest', d: 30 }));
    assert.ok(wakes({ kind: 'lumos', d: 50, aim: 0.99 }));
    assert.equal(wakes({ kind: 'lumos', d: 50, aim: 0.5 }), null, 'свет мимо лица — спит');
});

test('цепь: копыто никогда не дальше CHAIN_LEN от якоря; у грани натяжение растёт', () => {
    let prevT = -1;
    for (let r = 0; r <= 300; r += 10) {
        const L = leash(0, 0, r, 0, 0, 0);
        assert.ok(Math.hypot(L.x, L.z) <= DEVIL.CHAIN_LEN + 1e-6, `r=${r}`);
        assert.ok(L.t >= prevT - 1e-9); prevT = L.t;
    }
    assert.equal(leash(0, 0, 10, 0).t, 0);
    assert.ok(leash(0, 0, 500, 0).at);
    // со смещением копыта
    for (let k = 0; k < 40; k++) {
        const a = k * 0.7, fx = Math.cos(a) * 12, fz = Math.sin(a) * 12;
        const L = leash(5, -3, 5 + Math.cos(a * 1.3) * 400, -3 + Math.sin(a * 1.3) * 400, fx, fz);
        assert.ok(Math.hypot(L.x + fx - 5, L.z + fz + 3) <= DEVIL.CHAIN_LEN + 1e-6);
    }
});

test('цепь-верёвка: лежит на земле (не сквозь), звенья не растягиваются, одинаково на всех компьютерах', () => {
    const ground = (x, z) => 2 * Math.sin(x * 0.05) + Math.cos(z * 0.07);
    const A = new ChainRope(), B = new ChainRope();
    const a = { x: 0, y: 6, z: 0 }, h = { x: 20, y: 9, z: 0 };
    for (let i = 0; i < 600; i++) {
        h.x = 20 + 50 * Math.sin(i * 0.01); h.z = 30 * Math.sin(i * 0.013); h.y = ground(h.x, h.z) + 9;
        A.step(1 / 60, a, h, ground); B.step(1 / 60, a, h, ground);
    }
    const p = {}, q = {};
    let maxStretch = 0;
    for (let i = 0; i <= A.n; i++) {
        A.at(i, p); B.at(i, q);
        assert.equal(p.x, q.x); assert.equal(p.y, q.y); assert.equal(p.z, q.z);
        if (i > 0 && i < A.n) assert.ok(p.y >= ground(p.x, p.z) + 0.5 - 1e-6, `звено ${i} в земле`);
        if (i) { A.at(i - 1, q); maxStretch = Math.max(maxStretch, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / A.pitch); }
    }
    assert.ok(maxStretch < 1.08, `звено растянуто ×${maxStretch.toFixed(2)}`);
    // массив высот (раз в кадр) — то же, что функция
    const C = new ChainRope(); const gy = new Float64Array(C.n + 1).fill(0);
    C.step(1 / 60, a, { x: 30, y: 2, z: 0 }, gy);
    C.at(10, p); assert.ok(p.y >= 0.5 - 1e-6);
});

test('бессмертие: ни одно заклинание (все из игры), оружие и божественное его не берут — у каждого причина', () => {
    const all = [...Object.keys(SPELL_SOUND), 'melee', 'fist', 'arrow', 'Cauldron', 'crush', 'dragonFire', 'Lightning', 'DevilBall'];
    for (const s of all) {
        const v = devilVerdict(s);
        assert.equal(v.acts, false, s);
        assert.ok(v.why && v.why.length > 8, `${s}: нет причины`);
    }
    assert.equal(devilVerdict('Die').cat, 'death', '«Дай» не берёт — он его создал');
    assert.equal(devilVerdict('AvadaKedavra').cat, 'death');
    assert.equal(devilVerdict('Imperius').cat, 'dark');
    assert.equal(devilVerdict('Hellfire').cat, 'dark');
    assert.equal(devilVerdict('Inferno').cat, 'fire');
    assert.equal(devilVerdict('Frozen').cat, 'cold');
    assert.equal(devilVerdict('WindMaxima').cat, 'push');
    assert.equal(devilVerdict('melee').cat, 'weapon');
    assert.equal(devilVerdict('Boom').cat, 'gods');
    assert.equal(devilVerdict('Inspirius').cat, 'gods');
    for (const s of Object.keys(SPELL_SOUND)) if (isDivine(s) && !['death', 'dark', 'self'].includes(devilVerdict(s).cat)) assert.equal(devilVerdict(s).cat, 'gods', s);
    assert.equal(devilVerdict('LevitationSuperMaxima').cat, 'gods');
    assert.equal(devilVerdict('Lumos').anger, false, 'свет в руке — не нападение');
    assert.equal(devilVerdict('Bombardo').anger, true);
});

test('шар огня: Protection / Maxima / заслон / щит из вещей — СЛОМАН, вам ноль; без щита −25 и огонь; защита богов держит', () => {
    for (const shield of ['protection', 'maxima', 'vortex', 'swarm']) {
        const v = ballVerdict({ shield, d: 0 });
        assert.equal(v.breaks, true, shield);
        assert.equal(v.dmg, 0, shield);
    }
    const bare = ballVerdict({ shield: null, d: 0 });
    assert.equal(bare.dmg, BALL.DMG); assert.ok(bare.ignite);
    assert.equal(ballVerdict({ shield: null, d: BALL.BLAST_R + 1 }).dmg, 0);
    assert.ok(ballVerdict({ shield: null, armor: true, d: 0 }).wear > 0, 'мантия не защищает — прочность сгорает');
    const gods = ballVerdict({ shield: 'gods' });
    assert.equal(gods.breaks, false); assert.equal(gods.dmg, 0);
    assert.ok(ballDamage(0) > ballDamage(10));
});

test('Combat.breakShield: шар снимает Protection и Maxima целиком (каждый раз заново), заслон и щит из вещей', async () => {
    const { Combat } = await import('../../src/game/Combat.js');
    const said = [];
    const mk = (shield, extra = {}) => ({ dead: false, shield, game: { hud: { setVoice: (t) => said.push(t) }, ...extra }, shieldFactor: () => 1, _shatter(t) { this.shield = null; said.push(t); }, _godsFx() {} });
    for (const type of [1, 2]) {
        const c = mk({ type, left: 9, side: 'right' });
        assert.equal(Combat.prototype.breakShield.call(c, new THREE.Vector3()), type === 2 ? 'maxima' : 'protection');
        assert.equal(c.shield, null, 'щит снят — нужно сказать заклинание снова');
        assert.equal(Combat.prototype.breakShield.call(c, new THREE.Vector3()), null, 'второй шар: щита нет — урон идёт');
    }
    let took = null;
    const v = mk(null, { groundVortex: { covers: () => true, take: (f, k) => { took = k; return false; } } });
    assert.equal(Combat.prototype.breakShield.call(v, new THREE.Vector3()), 'vortex'); assert.equal(took, 'DevilBall');
    const s = mk(null, { levMax: { swarm: { faces: () => true, took: (f, k) => { took = k; return true; } } } });
    assert.equal(Combat.prototype.breakShield.call(s, new THREE.Vector3()), 'swarm');
    const g = mk({ type: 2, left: 9, gods: true });
    assert.equal(Combat.prototype.breakShield.call(g, new THREE.Vector3()), 'gods'); assert.ok(g.shield, 'защиту богов не ломает');
    const { sweepsShield } = await import('../../src/game/GroundVortexRules.js');
    assert.ok(sweepsShield('DevilBall'));
});

test('выбор хода: лицом к цели, вблизи — копыто/хват/кулак, дальше — шары и струя, у предела цепи — ярость', () => {
    const base = { rest: 0, faced: true, fireCd: 0, ballCd: 0, grabCd: 0, clapCd: 0, roarCd: 0, rageCd: 0 };
    assert.equal(chooseMove({ ...base, faced: false, dist: 30 }), 'turn');
    assert.equal(chooseMove({ ...base, dist: 15 }), 'stomp');
    assert.equal(chooseMove({ ...base, dist: 40 }), 'grab');
    assert.equal(chooseMove({ ...base, dist: 50, grabCd: 5 }), 'fist');
    assert.equal(chooseMove({ ...base, dist: 58, grabCd: 5 }), 'clap');
    assert.equal(chooseMove({ ...base, dist: 58, grabCd: 5, clapCd: 5 }), 'ball');
    assert.equal(chooseMove({ ...base, dist: 100, beyond: true, atLeash: true }), 'rage');
    assert.equal(chooseMove({ ...base, dist: 100, beyond: true, rageCd: 3 }), 'fire');
    assert.equal(chooseMove({ ...base, dist: 180, beyond: true, rageCd: 3 }), 'ball');
    assert.equal(chooseMove({ ...base, rest: 1, dist: 10 }), null);
    for (const id of MOVE_IDS) assert.ok(MOVES[id], id);
    assert.ok(Math.abs(yawTo(0, 0, 0, 0, -10)) < 1e-9, 'модель смотрит в −Z');
});

test('место из плана ада (HellMap.hellPlan): малая котловина помечена', () => {
    const s = seatFrom({ devilSeat: { x: 100, z: 200, r: 120 }, chainAnchor: { x: 100, y: 5, z: 240 }, chainLen: 70 });
    assert.equal(s.x, 100); assert.equal(s.len, 70); assert.equal(s.small, false); assert.equal(s.anchor.z, 240);
    assert.equal(seatFrom({ devilSeat: { x: 0, z: 0, r: 40 } }).small, true);
    assert.equal(seatFrom(null), null);
});

test('модель: рост ×35 = 122,5 м до макушки, рога выше; копыта на земле стоя и сидя; ≤ 5 отрисовок с цепью и якорем', async () => {
    const { diabolosModel, poseDiabolos, hoofWorld, eyeletWorld, chainLinkGeo, anchorModel } = await import('../../src/entities/DiabolosModel.js');
    const m = diabolosModel();
    m.scale.setScalar(DEVIL.SCALE);
    poseDiabolos(m, {}); m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    assert.ok(box.max.y >= DEVIL.HEIGHT && box.max.y <= DEVIL.HEIGHT * 1.2, `верх ${box.max.y.toFixed(1)} м`);
    assert.ok(box.min.y > -1, 'стоит на земле');
    const _v = new THREE.Vector3();
    for (const sd of ['L', 'R']) assert.ok(Math.abs(hoofWorld(m, sd, _v).y) < 0.15 * DEVIL.SCALE);
    poseDiabolos(m, { sit: 1, sleep: 1 }); m.updateMatrixWorld(true);
    for (const sd of ['L', 'R']) assert.ok(Math.abs(hoofWorld(m, sd, _v).y) < 0.15 * DEVIL.SCALE, 'сидя копыта на земле');
    assert.ok(eyeletWorld(m, _v).y > 0, 'ушко кандалов над землёй');
    const mats = new Set();
    m.traverse((o) => { if (o.isMesh) mats.add(o.material); });
    assert.ok(mats.size <= 3, `материалов тела ${mats.size}`);
    assert.ok(mats.size + 2 <= 5, 'тело (FarShape: по материалу) + цепь + якорь ≤ 5');
    assert.ok(chainLinkGeo().attributes.position.count > 100);
    assert.ok(anchorModel().isMesh);
});

/** Мини-игра для системы: плоская земля, я — игрок. */
function fakeGame(me) {
    const said = [], gained = [], booms = [];
    const g = {
        scene: new THREE.Scene(), localId: 'me', authority: true, remotes: new Map(),
        character: { group: { position: me, rotation: { y: 0 } }, size: 1 },
        collision: { groundY: () => 0, lineOfSight: () => true },
        hud: { setVoice: (t) => said.push(t) }, spellLog: { note() {} },
        achievements: { gain: (id) => gained.push(id) },
        explode: (p, r, by) => booms.push({ p, r, by }),
        combat: { dead: false, enabled: true, hp: 100, damage(d) { this.hp -= d; }, breakShield: () => null, devilFire: () => false },
        knockback: { add() {} },
    };
    return { g, said, gained, booms };
}

test('Дьяволос в игре: спит → разбудили → идёт за обидчиком, но цепь держит; бессмертен; успокаивается и засыпает', async () => {
    const { Diabolos } = await import('../../src/game/Diabolos.js');
    const me = new THREE.Vector3(0, 1.95, 200);
    const { g, gained } = fakeGame(me);
    const dv = new Diabolos(g);
    g.diabolos = dv;
    assert.ok(dv.place({ devilSeat: { x: 0, z: 0, r: 120 }, chainAnchor: { x: 0, y: 4, z: 40 }, chainLen: DEVIL.CHAIN_LEN }));
    dv.update(0.016);
    assert.ok(dv.d, 'загружен рядом с игроком');
    assert.equal(dv.d.mode, 'sleep');
    for (let i = 0; i < 60; i++) dv.update(0.05);
    assert.equal(dv.d.mode, 'sleep', 'издалека не просыпается');
    // по нему — «Авада»: не убивает, будит
    dv.boltHit(dv.d, 'AvadaKedavra', 'me');
    assert.equal(dv.d.isDead, false);
    assert.equal(dv.d.mode, 'wake');
    assert.deepEqual(gained, ['devilWoke']);
    // всё подряд — не умирает никогда
    for (const s of Object.keys(SPELL_SOUND)) dv.hit(dv.d, 999, s, 'me');
    assert.equal(dv.d.isDead, false);
    // идёт за мной, а я далеко за пределом цепи — копыто не дальше CHAIN_LEN от якоря
    me.set(0, 1.95, -260);
    let maxHoof = 0;
    for (let i = 0; i < 1800; i++) {
        dv.update(1 / 30);
        const fo = dv._footOff(dv.d);
        maxHoof = Math.max(maxHoof, Math.hypot(dv.d.x + fo.x - dv.d.anchor.x, dv.d.z + fo.z - dv.d.anchor.z));
    }
    assert.ok(maxHoof <= DEVIL.CHAIN_LEN + 0.5, `копыто ушло на ${maxHoof.toFixed(1)} м`);
    assert.ok(dv.d.strain > 0.5 || dv.log.some((l) => /ход rage|ход fire|ход ball/.test(l)), 'у грани злится и бьёт издалека');
    // ушёл совсем далеко — забыл, вернулся, сел, уснул
    me.set(0, 1.95, -600);
    for (let i = 0; i < 30 * 220; i++) dv.update(1 / 30);
    assert.ok(['sit', 'sleep'].includes(dv.d.mode), `режим ${dv.d.mode}`);
    // все ушли за ACTIVE_R — выгружен, ничего не копится
    me.set(0, 1.95, -DEVIL.ACTIVE_R * 2);
    dv.update(0.016);
    assert.equal(dv.d, null);
    assert.equal(g.scene.children.filter((o) => /diabolos/.test(o.name)).length, 0, 'модель и цепь убраны');
});

test('по сети: строка состояния восстанавливает ход у гостя; сохранение — только «будили»', async () => {
    const { Diabolos } = await import('../../src/game/Diabolos.js');
    const me = new THREE.Vector3(0, 1.95, 100);
    const host = fakeGame(me).g, guest = fakeGame(me.clone()).g;
    guest.authority = false;
    const H = new Diabolos(host), G = new Diabolos(guest);
    host.diabolos = H; guest.diabolos = G;
    const plan = { devilSeat: { x: 0, z: 0, r: 120 }, chainAnchor: { x: 0, y: 4, z: 40 }, chainLen: 70 };
    H.place(plan); G.place(plan);
    H.update(0.016); G.update(0.016);
    let sent = null;
    host.sync = { diabolos: (m) => { sent = m; } };
    host.remotes.set('x', { position: new THREE.Vector3(0, 1.95, 3000) });
    H.disturb('me', 'тест');
    for (let i = 0; i < 200 && !(sent?.e === 'st' && sent.r[5] >= 0); i++) H.update(0.05);
    assert.equal(sent?.e, 'st');
    G.onNet(sent, 'host', false);
    assert.equal(G.d.mode, H.d.mode);
    assert.deepEqual(H.snapshot(), { woke: true });
    G.restore({ woke: true }); assert.equal(G.everWoke, true);
});

test('звуки и подключение: всё синтезируется заранее; места поиска целей знают Дьяволоса', () => {
    for (const k of ['snore', 'step', 'chain', 'roar', 'inhale', 'fire', 'ball', 'boom', 'clap', 'theme', 'drums']) assert.ok(DEVIL_SOUNDS.includes(k), k);
    const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    assert.match(src('src/audio/SoundManager.js'), /DEVIL_SOUNDS\.map\(\(k\) => \['dvl_'/, 'звуки — в prewarm');
    const g = src('src/game/Game.js');
    assert.match(g, /lightningAt:.*this\.diabolos\?\.hitAt/, 'молния');
    assert.match(g.slice(g.indexOf('    explode(')), /this\.diabolos\?\.hitAt\(pos, radius/, 'взрывы');
    assert.match(g, /this\.diabolos\?\.hitRay\(o, d, len, width/, 'лучи (birdRay)');
    assert.match(g, /this\.diabolos\?\.hitRay\(o, d, len, 0\.6, 0, 'Inferno'/, 'Инферно');
    assert.match(g, /z\.isDiabolos\) \{ this\.diabolos\.hit/, 'оружие и кулаки');
    assert.match(g, /this\.diabolos\.targets\(\)/, 'клинки ищут его');
    assert.match(g, /best\?\.k === 'Y'/, '«Брейнрот» отказывает');
    assert.match(g, /sampleModels\(\)/, 'прогрев шейдеров');
    const d = src('src/game/Duel.js');
    assert.match(d, /diabolos\?\.targets\(\)/, 'заряды дуэли (Авада, Дай…)');
    assert.match(d, /b\.tk === 'Y'/, 'заряд долетел — Diabolos.boltHit');
    assert.match(src('src/game/Gear.js'), /diabolos\?\.hitAt/, 'стрелы');
    assert.match(src('src/game/Levitation.js'), /kind: 'diabolos'/, '«Левиоса» не поднимет');
    assert.match(src('src/game/WaterVortex.js'), /b\.kind === 'Y'/, 'вода');
    assert.match(src('src/game/Hellfire.js'), /b\.kind === 'Y'/, 'адский огонь');
    assert.match(src('src/game/MagicWave.js'), /diabolos/, '«Круговая атака», «Инспириус», «Бум»');
    assert.match(src('src/game/TotalDestruction.js'), /diabolos\?\.hitAt/, '«Тотальное разрушение»');
    assert.match(src('src/net/NetSync.js'), /case 'dvl': case 'dvb'/, 'сеть');
    assert.match(src('src/game/WorldSave.js'), /diabolos: g\.diabolos\?\.snapshot/, 'сохранение');
});
