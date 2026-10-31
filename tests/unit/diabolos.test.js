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
    assert.equal(devilVerdict('Boom').cat, 'stun', '«Бум» — растерян и злится (не убивает)');
    assert.equal(devilVerdict('Inspirius').cat, 'stun');
    assert.equal(devilVerdict('TotalDestructionMaxima').cat, 'stun');
    for (const s of Object.keys(SPELL_SOUND)) if (isDivine(s) && !['death', 'dark', 'self', 'stun'].includes(devilVerdict(s).cat)) assert.equal(devilVerdict(s).cat, 'gods', s);
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

test('место из плана ада (HellMap.hellPlan): малая котловина помечена', async () => {
    const s = seatFrom({ devilSeat: { x: 100, z: 200, r: 120 }, chainAnchor: { x: 100, y: 5, z: 240 }, chainLen: 70 });
    assert.equal(s.x, 100); assert.equal(s.len, 70); assert.equal(s.small, false); assert.equal(s.anchor.z, 240);
    assert.equal(seatFrom({ devilSeat: { x: 0, z: 0, r: 40 } }).small, true);
    assert.equal(seatFrom(null), null);
    // как в HellMap: столб в середине котловины — сидит в 40 м от него, лицом к дороге прибытия
    const h = seatFrom({ devilSeat: { x: 0, z: 0, r: 90, y: 14 }, chainAnchor: { x: 0, y: 23, z: 0 }, chainLen: 70, spawn: { x: 1250, z: 0 } });
    assert.equal(Math.round(h.x), DEVIL.SEAT_OFF); assert.equal(Math.round(h.z), 0); assert.equal(h.small, false);
    const { hellPlan } = await import('../../src/world/HellMap.js');
    const real = seatFrom(hellPlan(12345));
    assert.ok(real && !real.small, 'план ада: котловина ≥ 90 м');
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

test('характер: 20+ поступков с мимикой; у каждого своё лицо; у каждой ситуации есть поступок; звуки все синтезируются', async () => {
    const { ACTS, ACT_IDS, SITUATIONS, ACT_SOUNDS, pickAct, moodFace, blendFace } = await import('../../src/game/DiabolosActs.js');
    assert.ok(ACT_IDS.length >= 20, `поступков ${ACT_IDS.length}`);
    assert.deepEqual([...ACT_IDS].sort(), Object.keys(ACTS).sort(), 'ACT_IDS — все поступки');
    const faces = new Set();
    for (const id of ACT_IDS) {
        const A = ACTS[id];
        assert.ok(A.ru && A.dur > 0 && A.when.length, id);
        for (const k of [0, 0.3, 0.5, 0.8, 1]) {
            const f = A.face(k, 2.3), b = A.body(k, 2.3);
            for (const v of Object.values(f)) assert.ok(Number.isFinite(v), `${id}: лицо`);
            for (const v of Object.values(b)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${id}: тело`);
        }
        faces.add(JSON.stringify(Object.entries(A.face(0.5, 2.3)).map(([key, v]) => [key, Math.round(v * 10)]).sort()));
    }
    assert.equal(faces.size, ACT_IDS.length, 'у каждого поступка своя мимика');
    for (const s of SITUATIONS) assert.ok(pickAct(s, 0.5), `ситуация ${s} без поступка`);
    assert.equal(pickAct('taunt', 0.1), pickAct('taunt', 0.1), 'детерминированно');
    assert.notEqual(pickAct('sleep', 0.01, 'snoreDeep'), 'snoreDeep', 'не повторяет подряд');
    // язык (просьба автора): дразнит — язык высунут и болтается
    const tt = ACTS.tongueTaunt.face(0.5, 1);
    assert.ok(tt.tongue > 0.9 && tt.wag > 0.9);
    assert.ok(ACTS.lickLips.face(0.4, 1).lick > 0.5);
    assert.ok(blendFace(moodFace('angry', 0), { brow: 1 }, 1).brow === 1);
    const { DEVIL_SOUNDS, synthDevil } = await import('../../src/audio/DiabolosSounds.js');
    for (const k of ACT_SOUNDS) assert.ok(DEVIL_SOUNDS.includes(k), `звук ${k}`);
    const ctx = { sampleRate: 22050, createBuffer: (c, n) => { const a = new Float32Array(n); return { getChannelData: () => a }; } };
    for (const k of DEVIL_SOUNDS) { const d = synthDevil(ctx, k).getChannelData(); assert.ok(d.length > 100 && d.every(Number.isFinite), k); }
});

test('характер в игре: просыпается по-разному, над слабым смеётся, огнём наслаждается, божественное жалит, за цепью — дразнит', async () => {
    const { Diabolos } = await import('../../src/game/Diabolos.js');
    const me = new THREE.Vector3(0, 1.95, 200);
    const { g } = fakeGame(me);
    const dv = new Diabolos(g); g.diabolos = dv;
    dv.place({ devilSeat: { x: 0, z: 0, r: 120 }, chainAnchor: { x: 0, y: 4, z: 40 }, chainLen: 70 });
    dv.update(0.016);
    const seen = new Set();
    const run = (sec) => { for (let i = 0; i < sec * 30; i++) { dv.update(1 / 30); if (dv.d?.act) seen.add(dv.d.act.id); } };
    run(60);
    assert.ok([...seen].some((id) => ['snoreDeep', 'earFlick', 'sleepScratch', 'sleepMumble', 'smokePuff'].includes(id)), 'во сне живой');
    dv.disturb('me', 'по нему попали');
    run(8);
    assert.ok(seen.has('wakeOneEye'), 'открывает один глаз');
    assert.ok(seen.has('stretch') || seen.has('yawn'), 'потягивается или зевает');
    me.set(0, 1.95, 140);
    run(4);
    dv.d.move = null; dv.d.act = null;
    dv.hit(dv.d, 5, 'Bombardo', 'me'); assert.ok(['laugh', 'scoff'].includes(dv.d.act?.id), 'над слабым — смех/фырканье');
    dv.d.act = null; dv.d.reactT = 0; dv.hit(dv.d, 5, 'Inferno', 'me'); assert.equal(dv.d.act?.id, 'bask', 'огонь — наслаждается');
    dv.d.act = null; dv.d.reactT = 0; dv.hit(dv.d, 5, 'LevitationSuperMaxima', 'me'); assert.equal(dv.d.act?.id, 'headShake', 'божественное — трясёт головой');
    // за цепью — дразнит
    me.set(0, 1.95, -320);
    dv.d.act = null;
    run(60);
    assert.ok(['tongueTaunt', 'beckon', 'chainPull', 'lickLips'].some((id) => seen.has(id)), `дразнит: ${[...seen].join(', ')}`);
});

test('«Инспириус» / «Бум»: растерян 2–4 с (без атаки), ярость растёт с каждым попаданием, темп выше, потом гаснет — и он засыпает', async () => {
    const { godStrike, rageTempo, STUN } = await import('../../src/game/DiabolosRules.js');
    const gs = godStrike('Inspirius', 0.5);
    assert.ok(gs.stun >= STUN.S[0] && gs.stun <= STUN.S[1]);
    assert.ok(godStrike('TotalDestructionMaxima', 0.5).rage < gs.rage, 'Максима разрушения — слабее');
    assert.equal(godStrike('Bombardo'), null);
    assert.ok(rageTempo(1).rest < rageTempo(0).rest && rageTempo(1).fireTime > 1 && rageTempo(1).grabCd < 1);
    const { Diabolos } = await import('../../src/game/Diabolos.js');
    const me = new THREE.Vector3(0, 1.95, 120);
    const { g } = fakeGame(me);
    const dv = new Diabolos(g); g.diabolos = dv;
    dv.place({ devilSeat: { x: 0, z: 0, r: 120 }, chainAnchor: { x: 0, y: 4, z: 40 }, chainLen: 70 });
    dv.update(0.016);
    dv.hit(dv.d, 100, 'Inspirius', 'me');
    assert.equal(dv.d.mode, 'stun', 'спящий просыпается именно так — растерян');
    const r1 = dv.d.rage;
    for (let i = 0; i < 30; i++) { dv.update(1 / 30); assert.equal(dv.d.move, null, 'растерян — не атакует'); }
    dv.hit(dv.d, 100, 'Boom', 'me');
    assert.ok(dv.d.rage > r1, 'ярость растёт');
    assert.ok(!dv.d.isDead && !dv.dead);
    me.set(0, 1.95, -900);
    for (let i = 0; i < 30 * 240; i++) dv.update(1 / 30);
    assert.ok(dv.d.rage < 0.01, 'ярость погасла');
    assert.ok(['sit', 'sleep'].includes(dv.d.mode), dv.d.mode);
});

test('хват: подошёл — схватил, поднял, держит, хохочет и раздавил (щит не спасает); шаг в сторону — промах; «Инспириус» во время хвата — роняет', async () => {
    const { MOVES, GRAB, grabPhase } = await import('../../src/game/DiabolosRules.js');
    assert.deepEqual(['wind', 'lift', 'hold', 'laugh', 'crush'].map((p, i) => grabPhase([0.5, 2.5, 5, 8, 9.6][i])), ['wind', 'lift', 'hold', 'laugh', 'crush']);
    const { Diabolos } = await import('../../src/game/Diabolos.js');
    const run = (dv, sec) => { for (let i = 0; i < sec * 30; i++) dv.update(1 / 30); };
    const setup = () => {
        const me = new THREE.Vector3(0, 1.95, 200);
        const F = fakeGame(me);
        let died = null, shieldAsked = 0;
        F.g.combat.die = (by, how) => { died = how; F.g.combat.dead = true; };
        F.g.combat.breakShield = () => { shieldAsked++; return 'maxima'; };
        const dv = new Diabolos(F.g); F.g.diabolos = dv;
        dv.place({ devilSeat: { x: 0, z: 0, r: 120 }, chainAnchor: { x: 0, y: 4, z: 40 }, chainLen: 70 });
        dv.update(0.016); dv.disturb('me', 'тест'); run(dv, 9);
        const d = dv.d; d.act = null; d.stunT = 0; d.mode = 'walk';
        return { me, dv, d, F, get died() { return died; }, get shields() { return shieldAsked; } };
    };
    // 1) стоит у кисти — смерть
    let T = setup();
    T.dv.update(0.016);
    const fist = () => { T.dv.model.updateMatrixWorld(true); return T.dv.model.userData.bones; };
    fist();
    T.dv._startMove(T.d, 'grab', { id: 'me', p: T.me, feet: 0 }); T.d.move.side = 'R';
    // стоим там, где кисть будет в миг хвата
    for (let i = 0; i < 30 * MOVES.grab.hit - 2; i++) { const { fistWorld } = await import('../../src/entities/DiabolosModel.js'); T.dv.model.updateMatrixWorld(true); const f = fistWorld(T.dv.model, 'R', new THREE.Vector3()); T.me.set(f.x, 1.95, f.z); T.dv.update(1 / 30); }
    run(T.dv, 1);
    assert.ok(T.dv.holding, 'схвачен');
    run(T.dv, MOVES.grab.crush);
    assert.equal(T.died, 'devilCrush', 'раздавлен');
    assert.equal(T.shields, 0, 'щит даже не спрашивают — не спасает');
    // 2) отошёл во время замаха — промах
    T = setup();
    T.dv._startMove(T.d, 'grab', { id: 'me', p: T.me, feet: 0 }); T.d.move.side = 'R';
    T.me.set(200, 1.95, 200);
    run(T.dv, 3);
    assert.equal(T.dv.holding, false, 'промах');
    // 3) «Инспириус», пока держит — роняет
    T = setup();
    T.dv._grabMe('R', 7);
    run(T.dv, 1);
    assert.ok(T.dv.holding);
    T.dv.hit(T.d, 50, 'Inspirius', 'p2');
    assert.equal(T.dv.holding, false, 'выронил');
    assert.equal(T.died, null);
    assert.ok(T.F.g.combat.hp < 100, 'урон от падения');
});

test('божественный меч: пронзил (в руке или залпом) → 20 с смерти → мёртв навсегда, сундуки из пепла, ачивка; обычный меч не убивает', async () => {
    const { DEATH, deathPhase } = await import('../../src/game/DiabolosRules.js');
    assert.equal(deathPhase(0.5), 'shock'); assert.equal(deathPhase(3), 'agony'); assert.equal(deathPhase(8), 'fall'); assert.equal(deathPhase(15), 'ash');
    const { Diabolos } = await import('../../src/game/Diabolos.js');
    for (const via of ['hand', 'swarm']) {
        const me = new THREE.Vector3(0, 1.95, 60);
        const F = fakeGame(me); F.g.chests = [];
        const dv = new Diabolos(F.g); F.g.diabolos = dv;
        dv.place({ devilSeat: { x: 0, z: 0, r: 120 }, chainAnchor: { x: 0, y: 4, z: 40 }, chainLen: 70 });
        dv.update(0.016);
        // обычный клинок — только злит
        dv.hit(dv.d, 50, 'melee', 'me');
        assert.ok(!dv.dead && !dv.d.dying);
        // лезвие касается тела
        const p = dv.bladeHit(new THREE.Vector3(-40, 50, 0), new THREE.Vector3(0, 50, 0));
        assert.ok(p, 'лезвие у тела');
        assert.equal(dv.bladeHit(new THREE.Vector3(500, 5, 500), new THREE.Vector3(501, 5, 500)), null);
        dv.pierce(p, 'me', { via });
        assert.ok(dv.d.dying, 'умирает');
        assert.equal(dv.targets().length, 0, 'больше не цель');
        for (let i = 0; i < 30 * (DEATH.T + 1); i++) dv.update(1 / 30);
        assert.ok(dv.dead, 'мёртв');
        assert.equal(F.g.combat.hp, 100, 'тот, кто держал меч, не гибнет и не ранен');
        assert.equal(F.g.chests.filter((c) => c.room === 'diabolos').length, DEATH.CHESTS, 'сундуки босса');
        assert.ok(F.gained.includes(DEATH.ACH), 'ачивка «Победитель Дьяволоса»');
        assert.deepEqual(dv.snapshot(), { woke: true, dead: true });
        // загрузка: мёртв навсегда — котловина пуста
        const F2 = fakeGame(new THREE.Vector3(0, 1.95, 60)); F2.g.chests = [];
        const dv2 = new Diabolos(F2.g); F2.g.diabolos = dv2; dv2.restore(dv.snapshot());
        dv2.place({ devilSeat: { x: 0, z: 0, r: 120 }, chainAnchor: { x: 0, y: 4, z: 40 }, chainLen: 70 });
        dv2.update(0.016);
        assert.equal(dv2.d, null); assert.equal(dv2.targets().length, 0);
        assert.equal(F2.g.chests.length, DEATH.CHESTS, 'сундуки на месте');
    }
});

test('видит невидимых: невидимый игрок рядом — будит и становится целью, как видимый', async () => {
    const { SEES_INVISIBLE, DEVIL_SENSES } = await import('../../src/game/DiabolosRules.js');
    assert.equal(SEES_INVISIBLE, true); assert.ok(DEVIL_SENSES.seesInvisible.on && DEVIL_SENSES.seesInvisible.why);
    const { Diabolos } = await import('../../src/game/Diabolos.js');
    const me = new THREE.Vector3(0, 1.95, 300);
    const { g } = fakeGame(me);
    g.invis = { aiPos: () => null, hidden: () => true, isInvisible: () => true }; // (для всех остальных существ меня не видно)
    const dv = new Diabolos(g); g.diabolos = dv;
    dv.place({ devilSeat: { x: 0, z: 0, r: 120 }, chainAnchor: { x: 0, y: 4, z: 40 }, chainLen: 70 });
    dv.update(0.016);
    me.set(0, 1.95, 40); // подошёл вплотную невидимым
    for (let i = 0; i < 10; i++) dv.update(1 / 30);
    assert.notEqual(dv.d.mode, 'sleep', 'невидимый подошёл — проснулся');
    for (let i = 0; i < 30 * 8; i++) dv.update(1 / 30);
    assert.equal(dv.d.target, 'me', 'невидимый — цель');
});

test('режиссёр боя: за 2 минуты — не меньше 6 разных ходов, ходьба ≥ 30 % времени, один ход не больше 2 раз подряд (жалоба автора: «одно и то же»)', async () => {
    const { Diabolos } = await import('../../src/game/Diabolos.js');
    const { planMove } = await import('../../src/game/DiabolosRules.js');
    // чистые правила: тот же ход третий раз подряд — никогда
    for (let i = 0; i < 300; i++) {
        const r = planMove({ dist: 50, faced: true, rest: 0, cd: {}, recent: ['kick', 'kick'] });
        assert.notEqual(r.id, 'kick');
    }
    assert.equal(planMove({ dist: 50, faced: false, rest: 0, cd: {}, recent: [] }).kind, 'turn');
    assert.equal(planMove({ dist: 80, faced: true, rest: 0, cd: {}, recent: [], hidden: true }).peek, true, 'спрятался — идёт заглянуть');
    for (let i = 0; i < 200; i++) { const r = planMove({ dist: 20, faced: true, rest: 0, cd: {}, recent: [], air: true }); assert.ok(!['stomp', 'kick', 'fist'].includes(r.id), 'в воздухе копыто не достаёт'); }
    // в игре: игрок ходит кругом в пределах цепи
    const me = new THREE.Vector3(0, 1.95, -60);
    const { g } = fakeGame(me);
    const dv = new Diabolos(g);
    g.diabolos = dv;
    dv.place({ devilSeat: { x: 0, z: 0, r: 120 }, chainAnchor: { x: 0, y: 4, z: 40 }, chainLen: DEVIL.CHAIN_LEN });
    dv.update(0.016);
    dv.boltHit(dv.d, 'Bombardo', 'me');
    for (let i = 0; i < 30 * 12; i++) dv.update(1 / 30); // (проснулся, устрашил)
    const ids = [];
    let walk = 0, n = 0, t = 0;
    dv.log.length = 0;
    for (let i = 0; i < 30 * 120; i++) {
        t += 1 / 30;
        const a = t * 0.08, R = 55 + 35 * Math.sin(t * 0.05);
        me.set(Math.sin(a) * R, 1.95, 40 - Math.cos(a) * R - 40);
        g.combat.hp = 100;
        dv.update(1 / 30);
        n++; if (dv.d.walkFor > 0 || dv.d.walkK > 0.5) walk++;
    }
    for (const l of dv.log) { const m = /ход (\w+)/.exec(l); if (m) ids.push(m[1]); }
    const acts = dv.log.filter((l) => /^😈 Дьяволос: [А-Яа-яё]/.test(l) && !/решение|ход|stand|walk|act/.test(l)).length;
    const distinct = new Set(ids).size + (acts ? 1 : 0);
    console.log(`разных ${distinct}: ${[...new Set(ids)].join(",")}; поступков ${acts}; ходьба ${(walk / n * 100).toFixed(0)} %`);
    assert.ok(distinct >= 6, `разных ходов ${distinct}: ${[...new Set(ids)].join(',')} + поступков ${acts}`);
    assert.ok(walk / n >= 0.3, `ходьба ${(walk / n * 100).toFixed(0)} %`);
    for (let i = 2; i < ids.length; i++) assert.ok(!(ids[i] === ids[i - 1] && ids[i] === ids[i - 2]), `три раза подряд: ${ids[i]}`);
});

test('речь: бас (роль devil — ниже всех), троллит при попытках убить; ни слова о том, чем его убить (тайна игры)', async () => {
    const { LINES, CAT_TALK, pickLine } = await import('../../src/game/DiabolosTalk.js');
    const { castNeural } = await import('../../src/audio/VoiceCast.js');
    const dv = castNeural({ role: 'devil', voiceKey: 'diabolos' }), king = castNeural({ role: 'king', voiceKey: 'k' });
    assert.ok(dv.f0 < 70 && dv.f0 < king.f0, `бас ${dv.f0.toFixed(0)} Гц`);
    for (const [s, L] of Object.entries(LINES)) for (const l of L) assert.ok(!/меч(\s|$|[,.!?а-я])|клинок|клинк|жезл|посох|божествен|unitas|пентагр|рецепт|ритуал/i.test(l), `${s}: ${l}`);
    for (const c of Object.values(CAT_TALK)) assert.ok(LINES[c]?.length, c);
    assert.notEqual(pickLine('blast', 0.1, [0, 1, 2]), 0);
    // «Инспириус» у копыт: тело в 122 м — взрыв у ног попадает (раньше мерили от середины в 70 м над землёй)
    const { Diabolos } = await import('../../src/game/Diabolos.js');
    const { eachBody } = await import('../../src/game/MagicWave.js');
    const me = new THREE.Vector3(0, 1.95, -80);
    const { g, said } = fakeGame(me);
    const d = new Diabolos(g); g.diabolos = d;
    d.place({ devilSeat: { x: 0, z: 0, r: 120 }, chainAnchor: { x: 0, y: 4, z: 40 }, chainLen: DEVIL.CHAIN_LEN });
    d.update(0.016);
    d.boltHit(d.d, 'Bombardo', 'me');
    for (let i = 0; i < 30 * 12; i++) d.update(1 / 30);
    const at = new THREE.Vector3(d.d.x + 25, 1, d.d.z);
    let near = null;
    eachBody(g, (kind, c, q) => { if (kind === 'diabolos') near = q.distanceTo(at); }, at);
    assert.ok(near < 15, `до тела ${near?.toFixed(1)} м (Инспириус бьёт на 60)`);
    d.hit(d.d, 50, 'Inspirius', 'me');
    assert.ok(d.d.stunT > 0, 'растерян');
    assert.ok(said.some((s) => /Дьяволос: «/.test(s)), 'что-то сказал');
});
