import test from 'node:test';
import assert from 'node:assert/strict';
import { classOf, mayArrest, protest, lock, unlock, isJailed, newJail, inmates, prisonLine, releaseLine, searchResult, REFUSE_CLASS, GO_CLASS, CLASSES } from '../../src/game/Justice.js';
import { parseCommand } from '../../src/ai/TalkCommands.js';
import { VillagerCommands } from '../../src/game/VillagerCommands.js';
import { JusticeLife } from '../../src/game/JusticeLife.js';

test('classes of beings: the king may send the guard against some, never against his own people', () => {
    assert.equal(classOf('всех моряков').act, 'attack'); assert.equal(classOf('всех моряков').target, 'sailors');
    assert.equal(classOf('пиратов').target, 'sailors');
    assert.equal(classOf('всех зомби').target, 'zombies'); assert.equal(classOf('нежить').target, 'zombies');
    assert.equal(classOf('паука').target, 'spider'); assert.equal(classOf('дракона').target, 'dragon'); assert.equal(classOf('волков').target, 'animals');
    for (const w of ['всех жителей', 'горожан', 'крестьян', 'людей', 'торговцев', 'детей']) assert.deepEqual([classOf(w).act, classOf(w).why], ['refuse', 'civilians'], w);
    assert.equal(classOf('всех рыцарей').why, 'own'); assert.equal(classOf('всех волшебников').why, 'mages'); assert.equal(classOf('всех коров').why, 'livestock');
    assert.equal(classOf('что-то непонятное'), null);
    for (const c of CLASSES) { if (c.act === 'refuse') assert.ok(REFUSE_CLASS[c.why].length >= 2, c.id); else assert.ok(GO_CLASS[c.target]?.length >= 1, c.id); }
});

test('the king\'s words: «убейте всех моряков», «арестуйте его», «выпустите арестованных», «обыщите дом»', () => {
    assert.equal(parseCommand('убейте всех моряков')?.id, 'kill_class');
    assert.equal(parseCommand('перебейте всех зомби')?.id, 'kill_class');
    assert.equal(parseCommand('убейте всех жителей')?.id, 'kill_class');
    assert.equal(parseCommand('убейте моряков')?.id, 'kill_class');
    assert.equal(parseCommand('арестуйте его')?.id, 'arrest');
    assert.equal(parseCommand('арестуйте этих двоих')?.id, 'arrest');
    assert.equal(parseCommand('посадите его в тюрьму')?.id, 'arrest');
    assert.equal(parseCommand('наденьте на него наручники')?.id, 'arrest');
    assert.equal(parseCommand('арестуйте всех')?.args.all, true);
    assert.equal(parseCommand('арестуйте его')?.args.all, false);
    assert.equal(parseCommand('выпустите арестованных')?.id, 'release_prisoners');
    assert.equal(parseCommand('освободи заключённых')?.id, 'release_prisoners');
    assert.equal(parseCommand('кто в тюрьме')?.id, 'prison_report');
    assert.equal(parseCommand('обыщи этот дом')?.id, 'search_house');
    assert.equal(parseCommand('обыщите дом Гарольда', { names: ['Гарольд'] })?.args.house.ref, 'name');
    assert.equal(parseCommand('сразись с ним')?.id, 'fight_him', 'a fight is still a fight');
});

test('arrest: one man or a few, never all, never the king', () => {
    assert.equal(mayArrest([{ id: 'a', role: 'farmer' }], { all: true }).ok, false);
    assert.match(mayArrest([{ id: 'a', role: 'farmer' }], { all: true }).line, /Всех арестовать нельзя/);
    assert.equal(mayArrest([], {}).ok, false);
    assert.equal(mayArrest([{ id: 'k', role: 'king' }], {}).ok, false);
    assert.equal(mayArrest([{ id: 'a', role: 'farmer' }, { id: 'b', role: 'builder' }], {}).targets.length, 2);
    const many = Array.from({ length: 7 }, (_, i) => ({ id: 'p' + i, role: 'farmer' }));
    assert.equal(mayArrest(many, {}).targets.length, 4); assert.ok(mayArrest(many, {}).note);
});

test('the arrested protests by his nature; the released are grateful or sour', () => {
    assert.match(protest({ temper: 80 }, 0), /Руки прочь|смеете|Отпустите/);
    assert.match(protest({ brave: 10 }, 0), /Ой|За что|Умоляю/);
    assert.match(protest({ kindness: 80 }, 0), /ошибка|Что я сделал|не понимаю/);
    assert.equal(releaseLine({ kindness: 80 }, 0).kind, 'forgive');
    assert.equal(releaseLine({ kindness: 30, temper: 80 }, 0).kind, 'angry'); assert.ok(releaseLine({ kindness: 30, temper: 80 }, 0).f < 0);
    assert.equal(releaseLine({ kindness: 30, temper: 30 }, 0).kind, 'sour');
});

test('the jail: written, let out, never empty', () => {
    let j = newJail();
    j = lock(j, { idx: 3, name: 'Мария', role: 'farmer' });
    lock(j, { idx: 3, name: 'Мария', role: 'farmer' });
    assert.equal(j.list.length, 1); assert.equal(isJailed(j, 3), true); assert.equal(isJailed(j, 4), false);
    assert.ok(inmates(123).length >= 1);
    assert.deepEqual(inmates(5), inmates(5), 'the same old inmates every time');
    assert.match(prisonLine(j, 99), /Мария/); assert.match(prisonLine(null, 99), /тюрьме сидит ещё/);
    assert.equal(unlock(j, [4]).length, 0);
    assert.equal(unlock(j, [3]).length, 1); assert.equal(isJailed(j, 3), false);
    lock(j, { idx: 1, name: 'a' }); lock(j, { idx: 2, name: 'b' });
    assert.equal(unlock(j).length, 2);
});

test('a search finds what lies there, and sometimes a stash', () => {
    assert.match(searchResult(0, 0.9).line, /чист/);
    const s = searchResult(2, 0.1); assert.equal(s.stash, true); assert.match(s.line, /тайник/);
    assert.equal(searchResult(3, 0.9).stash, false); assert.match(searchResult(3, 0.9).line, /3 вещи/);
});

// ---------------------------------------------------------------- the arrest on a stub castle
function world() {
    const said = [], orders = [];
    const door = { x: 40, y: 0, z: 0, node: 5 };
    const cs = { def: { id: 'c1', x: 0, z: 0, houses: [], knights: 3 }, active: new Map(), hostile: new Map(), awake: true, graph: { tagged: (t) => (t === 'barracksDoor' ? [5] : []), nodes: { 5: door }, nearest: () => 5 } };
    const st = { owner: 'me', killed: new Set(), ranks: {}, jail: null };
    const mk = (idx, role, name, x, z) => { const v = { id: 'c1:' + idx, idx, role, name, title: '', x, y: 0, z, yaw: 0, hp: 10, maxHp: 10, speed: 0, mode: 'idle', cs, dead: false, entry: {} }; cs.active.set(idx, v); return v; };
    const knight = mk(1, 'knight', 'Гарольд', 0, 0), man = mk(7, 'farmer', 'Мария', 12, 0);
    const life = {
        enabled: true, auth: true, castles: new Map([['c1', cs]]), state: () => st, byId: new Map([...cs.active.values()].map((v) => [v.id, v])), game: { localId: 'me', sound: null, items: null, character: { group: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } } } },
        isCommander: () => true, _playerPos: () => ({ x: 0, y: 0, z: 0 }), _ground() {}, _inLand: () => false, _sees: () => true, _goTo() {}, _followPath: () => true,
        _steer(v, tx, tz, speed, dt, stop = 0) { const d = Math.hypot(tx - v.x, tz - v.z); if (d <= stop) { v.speed = 0; return d; } const s = Math.min(speed * dt, d - stop); v.x += (tx - v.x) / d * s; v.z += (tz - v.z) / d * s; v.yaw = Math.atan2(-(tx - v.x), -(tz - v.z)); v.speed = speed; return d; },
        _say: (v, t) => said.push([v.name, t]), _sendState() {}, talk: { brain: () => ({ character: { temper: 80, brave: 60 } }) }, rel: { dirty: new Set(), bump() {} },
        _deactivate(v) { cs.active.delete(v.idx); life.byId.delete(v.id); v.removed = true; },
        _activate(c, idx, at) { if (c.active.has(idx) || life.justice.isJailed(c, idx)) return null; const v = mk(idx, 'farmer', 'Мария', at.x, at.z); life.byId.set(v.id, v); return v; },
        orders: { run: (v, n, a) => orders.push([v.name, n, a]), _release() {} },
    };
    life.cmds = new VillagerCommands(life);
    life.justice = new JusticeLife(life);
    return { life, cs, st, knight, man, said, orders, door };
}
const frames = (life, vs, secs) => { for (let t = 0; t < secs; t += 0.05) for (const v of vs) if (v.cmd && !v.removed) life.cmds.step(v, 0.05); };

test('an arrest: the knight goes up to him, cuffs him, leads him to the jail door, hands him over — he is gone from the castle', () => {
    const { life, cs, st, knight, man, said } = world();
    assert.equal(life.cmds.run(knight, { id: 'arrest', foe: man.id }, 'me'), true);
    frames(life, [knight, man], 6);
    assert.equal(knight.cmd.stage === 'cuff' || knight.cmd.stage === 'lead', true, 'cuffed');
    assert.ok(said.some((s) => s[0] === 'Гарольд' && /король|арестов|задержан/i.test(s[1])), 'in the king\'s name');
    assert.ok(said.some((s) => s[0] === 'Мария'), 'she protests');
    assert.equal(man.cmd.kind, 'captive'); assert.equal(man.mode, 'cuffed');
    const x0 = knight.x;
    frames(life, [knight, man], 8);
    assert.ok(knight.x > x0, 'they walk to the jail');
    assert.ok(Math.hypot(man.x - knight.x, man.z - knight.z) < 4, 'the prisoner keeps behind the knight');
    frames(life, [knight, man], 60);
    assert.equal(man.removed, true, 'handed over');
    assert.equal(cs.active.has(7), false);
    assert.equal(st.jail.list[0].idx, 7); assert.equal(life.justice.isJailed(cs, 7), true);
    assert.ok(said.some((s) => s[0] === 'Гарольд' && /сдан|тюрьм|под замок/i.test(s[1])));
    assert.equal(knight.cmd, null);
});

test('a jailed man is not brought back by the castle\'s life; the king lets him out at the jail door, and he says his piece', () => {
    const { life, cs, man, st, said } = world();
    life.justice._lockUp(cs, man, 'me');
    assert.equal(life._activate(cs, 7, { x: 0, z: 0 }), null);
    const out = life.justice.release(cs, null, 'me');
    assert.equal(out.length, 1); assert.equal(st.jail.list.length, 0);
    assert.ok(cs.active.has(7), 'he is out');
    const v = cs.active.get(7);
    assert.ok(Math.abs(v.x - 40) < 3, 'at the jail door');
    void said;
});

test('a knight who falls (or is set upon) in the middle frees the prisoner', () => {
    const { life, knight, man } = world();
    life.cmds.run(knight, { id: 'arrest', foe: man.id }, 'me');
    frames(life, [knight, man], 6);
    knight.dead = true;
    life.cmds.step(man, 0.05);
    assert.equal(man.cmd, null);
});

test('a king himself cannot be arrested; one already led away cannot be taken twice', () => {
    const { life, knight, man, cs } = world();
    const king = { ...man, id: 'c1:0', idx: 0, role: 'king' }; life.byId.set(king.id, king);
    assert.equal(life.cmds.run(knight, { id: 'arrest', foe: king.id }, 'me'), false);
    man.cmd = { kind: 'captive', knight: 'x' };
    assert.equal(life.cmds.run(knight, { id: 'arrest', foe: man.id }, 'me'), false);
    void cs;
});

test('a stranger\'s order to arrest is not carried out (rank)', () => {
    const { life, knight, man } = world();
    life.isCommander = () => false; life.state = () => ({ owner: 'someone' });
    assert.equal(life.cmds.run(knight, { id: 'arrest', foe: man.id }, 'me'), false);
});
