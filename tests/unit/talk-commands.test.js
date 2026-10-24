import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, COMMAND_IDS, COMMAND_ROLES, parseCommand, canDo, commandTable, scopeOf, pickGroup, pickTarget, formationSlots, commandAck, commandPool, sayReply } from '../../src/ai/TalkCommands.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { VillagerCommands } from '../../src/game/VillagerCommands.js';

const id = (t, o) => parseCommand(t, o)?.id ?? null;

// ---------------------------------------------------------------- reading the words: 3+ wordings per category
const PHRASES = {
    crouch: ['присядь', 'рыцарь, присядь на корточки', 'пригнись'],
    stand_up: ['встань', 'вставай', 'поднимись'],
    sit: ['сядь', 'садись на скамью', 'присядь на землю'],
    lie: ['ляг', 'ложись', 'полежи'],
    attn: ['смирно', 'стой смирно', 'вытянись'],
    nod: ['кивни', 'кивни головой', 'согласись'],
    bow_cmd: ['поклонись', 'отвесь поклон', 'склони голову'],
    wave: ['помаши', 'помаши рукой', 'махни рукой'],
    salute: ['отдай честь', 'салютуй', 'козырни'],
    dance: ['станцуй', 'танцуй', 'спляши'],
    laugh: ['смейся', 'рассмейся', 'хохочи'],
    turn_me: ['повернись ко мне', 'смотри на меня', 'обернись'],
    turn_away: ['повернись спиной', 'отвернись', 'не смотри на меня'],
    come: ['подойди', 'иди ко мне', 'иди сюда'],
    go_there: ['иди туда', 'отправляйся вон туда', 'пойди вон там'],
    hold: ['стой здесь', 'не уходи', 'оставайся тут'],
    wait: ['жди', 'подожди', 'обожди'],
    go_post: ['вернись на пост', 'на пост', 'возвращайся на пост'],
    go_home: ['иди домой', 'ступай домой', 'отправляйся домой'],
    go_barracks: ['иди в казарму', 'в казарму марш', 'отправляйтесь в казарму'],
    go_castle: ['иди в замок', 'иди к воротам', 'вернись в замок'],
    go_king: ['иди к королю', 'иди в тронный зал', 'иди к трону'],
    go_market: ['иди на рынок', 'иди к торговцу', 'ступай на рынок'],
    run: ['беги', 'бегом', 'живее'],
    walk: ['иди шагом', 'не беги', 'иди спокойно'],
    sneak: ['крадись', 'иди тихо', 'не шуми'],
    step_back: ['отступи', 'шаг назад', 'дай пройти'],
    spar_group: ['сразитесь друг с другом', 'подеритесь', 'устройте спарринг', 'потренируйтесь'],
    fight_him: ['сразись с ним', 'атакуй его', 'подерись с тем рыцарем'],
    fight_me: ['сразись со мной', 'давай на мечах', 'потренируемся'],
    stop_fight: ['прекратите бой', 'хватит драться', 'отбой'],
    spare: ['не трогай его', 'оставь его в покое', 'он мой друг'],
    guard_spot: ['охраняй это место', 'стереги вход', 'встань на стражу'],
    patrol: ['патрулируй', 'обойди дозором территорию', 'сделай обход'],
    surround: ['окружите меня', 'встаньте вокруг меня', 'берите меня в кольцо'],
    formation: ['построиться', 'встаньте в шеренгу', 'в колонну по одному'],
    weapon_away: ['убери меч', 'вложи меч в ножны', 'спрячь оружие'],
    weapon_out: ['достань меч', 'обнажи оружие', 'мечи наголо'],
    shield_up: ['подними щит', 'прикройся щитом', 'прими стойку'],
    give_item: ['дай мне меч', 'подай мне хлеб', 'отдай мне монеты'],
    bring: ['принеси мне воды', 'притащи ящик', 'сходи за водой'],
    open_door: ['открой дверь', 'распахни ворота', 'отвори дверь'],
    close_door: ['закрой дверь', 'запри ворота', 'захлопни дверь'],
    light_torch: ['зажги факел', 'разведи костер', 'запали факел'],
    put_out: ['потуши факел', 'погаси свечу', 'затуши костер'],
    break_block: ['сломай стену', 'разрушь дом', 'снеси забор'],
    build: ['построй дом', 'возведи стену', 'почини мост'],
    mount: ['сядь на коня', 'в седло', 'оседлай коня'],
    dismount: ['слезь с коня', 'спешься', 'веди коня'],
    ask_hp: ['ты ранен', 'как твое здоровье', 'сколько у тебя здоровья'],
    ask_sees: ['что видишь', 'кого ты видишь', 'доложи обстановку'],
    ask_role: ['ты кто', 'кем работаешь', 'какая у тебя должность'],
    sing: ['спой', 'спой песню', 'запевай'],
    joke: ['расскажи шутку', 'пошути', 'расскажи анекдот'],
    repeat: ['повтори', 'что ты сказал', 'не расслышал'],
    tell_spell: ['скажи заклинание', 'произнеси заклинание', 'покажи магию'],
    cast_light: ['зажги люмос', 'освети палочкой', 'создай светлячка'],
    cast_shield: ['защити щитом', 'поставь барьер', 'магический щит'],
    fly: ['лети', 'взлети', 'полетай'],
};

test('every command has several wordings that read right', () => {
    const bad = [];
    for (const [want, list] of Object.entries(PHRASES)) {
        for (const t of list) { const got = id(t, { names: ['Гарольд'] }); if (got !== want) bad.push(`${t} → ${got} (нужно ${want})`); }
    }
    assert.deepEqual(bad, []);
});

test('ordinary talk is not a command', () => {
    for (const t of ['привет', 'как тебя зовут', 'расскажи про короля', 'сколько стоит меч', 'погоди а где у вас рынок', 'я хочу купить хлеб', 'иди за мной', 'стой', 'что нового в замке', 'у меня хватит денег на это']) assert.equal(id(t), null, t);
});

test('the author\'s own phrases', () => {
    assert.equal(id('сразитесь друг с другом'), 'spar_group');
    assert.equal(id('присядь'), 'crouch');
    assert.equal(id('сразись с ним'), 'fight_him');
    assert.equal(parseCommand('сразитесь друг с другом насмерть').args.mode, 'deadly');
    assert.equal(parseCommand('сразитесь друг с другом').args.mode, 'spar');
});

test('every command has a row: all roles answer (can or a reason), nothing is silent', () => {
    for (const cid of COMMAND_IDS) {
        const c = COMMANDS[cid];
        assert.ok(c.cat && c.do, cid);
        for (const king of [false, true]) for (const role of COMMAND_ROLES) {
            const r = canDo(cid, role, { playerIsKing: king }, () => 0);
            assert.ok(r.ok || (typeof r.line === 'string' && r.line.length > 3), `${cid} × ${role}: no answer`);
        }
        // a wizard of any role-flag too
        const w = canDo(cid, 'farmer', { wizard: true }, () => 0);
        assert.ok(w.ok || w.line, cid);
    }
    assert.equal(commandTable(true).length, COMMAND_IDS.length);
});

test('«не могу» by role and reason', () => {
    assert.match(canDo('tell_spell', 'knight', {}).line, /волшебник|маг|воин|Заклинания/);
    assert.match(canDo('tell_spell', 'farmer', {}).line, /волшебник|маг|Колдовать|магам/);
    assert.equal(canDo('tell_spell', 'wizard', {}).ok, true);
    assert.equal(canDo('cast_light', 'wizard', {}).ok, true);
    assert.equal(canDo('fly', 'knight', {}).ok, false);
    assert.equal(canDo('build', 'builder', {}).ok, false);
    // (what the game cannot do for him — a horse, a door, a torch, a block — he answers in words: `say:no_…`)
    for (const cid of ['mount', 'dismount', 'open_door', 'close_door', 'break_block', 'throw_it', 'give_item', 'bring', 'pick_up']) assert.match(COMMANDS[cid].do, /^say:no_/, cid);
    // a stranger cannot command the guard; the king can
    assert.equal(canDo('spar_group', 'knight', {}).why, 'rank');
    assert.equal(canDo('spar_group', 'knight', { playerIsKing: true }).ok, true);
    assert.equal(canDo('formation', 'knight', {}).why, 'rank');
    assert.equal(canDo('formation', 'knight', { playerIsKing: true }).ok, true);
    // civilians do not fight; a knight does not run away
    assert.equal(canDo('fight_him', 'farmer', { playerIsKing: true }).ok, false);
    assert.equal(canDo('retreat_far', 'knight', {}).ok, false);
    assert.match(canDo('retreat_far', 'knight', {}).line, /бегут|бегство|отступает/i);
    // the king of the castle takes no orders from a stranger, but answers talk
    assert.equal(canDo('crouch', 'king', {}).why, 'king');
    assert.equal(canDo('ask_hp', 'king', {}).ok, true);
    // polite requests anyone can do
    for (const role of ['knight', 'farmer', 'merchant', 'builder']) assert.equal(canDo('crouch', role, {}).ok, true, role);
    for (const role of ['knight', 'farmer', 'merchant']) assert.equal(canDo('come', role, {}).ok, true, role);
});

test('group words and targets', () => {
    assert.equal(scopeOf('вы двое присядьте').n, 2);
    assert.equal(scopeOf('все встаньте').kind, 'all');
    assert.equal(scopeOf('рыцари стройтесь').kind, 'all');
    assert.equal(scopeOf('левый присядь').kind, 'left');
    assert.equal(scopeOf('ближайший иди сюда').kind, 'nearest');
    assert.equal(scopeOf('вы трое идите домой').n, 3);
    assert.equal(scopeOf('присядь').kind, 'none');
    assert.equal(parseCommand('сразись с Гарольдом', { names: ['Гарольд'] }).args.target.ref, 'name');
    assert.equal(parseCommand('сразись с левым').args.target.ref, 'left');
    assert.equal(parseCommand('сразись с ближайшим').args.target.ref, 'nearest');
    assert.equal(parseCommand('сразись с ним').args.target.ref, 'point');
    assert.equal(parseCommand('все встаньте в круг').args.form, 'circle');
    assert.equal(parseCommand('в колонну').args.form, 'column');
    // a group by position: me at the origin looking along −z (yaw 0): right is +x
    const list = [{ id: 'a', x: -3, z: -8, d: 8.5 }, { id: 'b', x: 4, z: -6, d: 7.2 }, { id: 'c', x: 0, z: -12, d: 12 }];
    const me = { x: 0, z: 0, yaw: 0 };
    assert.deepEqual(pickGroup({ kind: 'all' }, list, me).map((v) => v.id), ['b', 'a', 'c']);
    assert.deepEqual(pickGroup({ kind: 'n', n: 2 }, list, me).map((v) => v.id), ['b', 'a']);
    assert.equal(pickGroup({ kind: 'left' }, list, me)[0].id, 'a');
    assert.equal(pickGroup({ kind: 'right' }, list, me)[0].id, 'b');
    assert.equal(pickGroup({ kind: 'nearest' }, list, me)[0].id, 'b');
});

test('pointing: the hand picks the one it points at, not the nearest', () => {
    const c = [{ id: 'a', x: -3, y: 2, z: -8, d: 8.5 }, { id: 'b', x: 4, y: 2, z: -6, d: 7.2 }, { id: 'c', x: 0.4, y: 2, z: -20, d: 20 }];
    const ray = { o: { x: 0, y: 2, z: 0 }, d: { x: 0, y: 0, z: -1 } }; // straight ahead
    assert.equal(pickTarget({ ref: 'point' }, c, { x: 0, z: 0, yaw: 0 }, ray).id, 'c');
    const toA = { o: { x: 0, y: 2, z: 0 }, d: { x: -3 / 8.54, y: 0, z: -8 / 8.54 } };
    assert.equal(pickTarget({ ref: 'point' }, c, { x: 0, z: 0, yaw: 0 }, toA).id, 'a');
    assert.equal(pickTarget({ ref: 'point' }, c, { x: 0, z: 0, yaw: 0 }, { o: ray.o, d: { x: 1, y: 0, z: 0 } }), null, 'nobody there');
    assert.equal(pickTarget({ ref: 'name', name: 'Гарольд' }, [{ id: 'z', name: 'Гарольд', x: 0, z: 0, d: 1 }], { x: 0, z: 0, yaw: 0 }, null).id, 'z');
});

test('formations: a slot for everybody, apart, in the right shape', () => {
    for (const kind of ['line', 'column', 'circle', 'wedge', 'shields', 'two']) {
        const s = formationSlots(kind, 7, { x: 0, z: 0 }, 0);
        assert.equal(s.length, 7, kind);
        for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) assert.ok(Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z) > 1.2, `${kind}: ${i}/${j} too close`);
    }
    const circle = formationSlots('circle', 8, { x: 10, z: 10 }, 0);
    for (const p of circle) { const r = Math.hypot(p.x - 10, p.z - 10); assert.ok(r >= 3.4, 'a ring round the player'); }
    // a line stands in front of me (yaw 0 → −z) and faces me
    const line = formationSlots('line', 3, { x: 0, z: 0 }, 0);
    assert.ok(line.every((p) => p.z < -5), 'in front');
    assert.ok(Math.abs(Math.cos(line[0].yaw) - 1) > 1.9, 'faces back toward me (yaw π)');
    // a column stands behind
    assert.ok(formationSlots('column', 3, { x: 0, z: 0 }, 0).every((p) => p.z > 1), 'behind');
});

test('replies: acks by role, answers to «ты ранен», jokes and songs have lines', () => {
    for (const role of COMMAND_ROLES) {
        assert.ok(commandAck('crouch', role, {}, () => 0) !== undefined);
        assert.ok(commandPool(role, {}).length > 0, role);
    }
    assert.match(sayReply('hp', { role: 'knight', hpRatio: 1 }, () => 0), /./);
    assert.notEqual(sayReply('hp', { role: 'knight', hpRatio: 0.1 }, () => 0), sayReply('hp', { role: 'knight', hpRatio: 1 }, () => 0));
    for (const k of ['sing', 'joke', 'sees', 'no_items', 'no_door', 'no_break', 'no_build', 'no_horse', 'no_fly', 'no_shoot', 'no_light']) {
        for (const role of ['knight', 'farmer', 'wizard', 'advisor', 'king', 'sailor', 'merchant']) assert.ok(sayReply(k, { role, wizard: role === 'wizard' }, () => 0).length > 3, `${k} ${role}`);
    }
});

test('commands are ordinary speech: none of the phrases casts a spell', () => {
    const spells = [];
    for (const [cid, list] of Object.entries(PHRASES)) for (const t of list) { const sp = matchSpell(t); if (sp) spells.push(`${t} → ${sp}`); }
    // («зажги люмос» and «создай светлячка» are words of a real spell: said by a wizard-friend they are the player's cast first)
    // Known: these wordings are ALSO spell phrases; the spell wins unless the villager is called by name or role
    // («рыцарь, подними щит» → the knight; «подними щит» alone → the player's Protection). A new collision fails here.
    const known = new Set(['атакуй его → Attack', 'подними щит → Protection', 'прикройся щитом → Protection', 'запри ворота → Sapira', 'разведи костер → Fire', 'запали факел → Sapira', 'затуши костер → Fire', 'запевай → Sapira', 'защити щитом → Protection', 'магический щит → Protection', 'взлети → Flight', 'полетай → Flight']);
    assert.deepEqual(spells.filter((s) => !known.has(s) && !/люмос|Lumos/i.test(s)), []);
});

// ---------------------------------------------------------------- the game side on a stub castle
function stubLife() {
    const life = {
        byId: new Map(),
        game: { fx: null, sound: null, character: { group: { position: { x: 0, y: 2, z: 0 } } } },
        state: () => ({ owner: 'me' }),
        _playerPos: () => ({ x: 0, y: 0, z: 0 }),
        _ground() {}, _inLand: () => false, _sees: () => true,
        _steer(v, tx, tz, speed, dt, stop = 0) {
            const d = Math.hypot(tx - v.x, tz - v.z);
            if (d <= stop) { v.speed = 0; return d; }
            const s = Math.min(speed * dt, d - stop);
            v.x += (tx - v.x) / d * s; v.z += (tz - v.z) / d * s; v.speed = speed; return d;
        },
        _say() {}, hit(v, dmg) { v.hp -= dmg; if (v.hp <= 0) v.dead = true; },
        orders: { _release(v) { v.order = null; }, _posts: () => [{ x: 10, y: 0, z: 0, node: 1 }, { x: 10, y: 0, z: 10, node: 2 }] },
    };
    life.cmds = new VillagerCommands(life);
    return life;
}
const person = (life, id, role, x, z) => { const v = { id, name: id, role, x, y: 0, z, yaw: 0, hp: 20, maxHp: 20, speed: 0, mode: 'idle', cs: { def: { id: 'c' }, graph: { tagged: () => [], nodes: [], nearest: () => 0 } } }; life.byId.set(id, v); return v; };
const run = (life, v, secs) => { for (let t = 0; t < secs; t += 0.05) life.cmds.step(v, 0.05); };

test('a pose is held, then he goes back to his life', () => {
    const life = stubLife(); const v = person(life, 'k1', 'knight', 5, 5);
    assert.equal(life.cmds.run(v, { id: 'crouch' }, 'me'), true);
    life.cmds.step(v, 0.05); assert.equal(v.mode, 'crouch');
    run(life, v, 7); assert.equal(v.cmd, null, 'the pose ended');
    life.cmds.run(v, { id: 'sit' }, 'me'); life.cmds.step(v, 0.05);
    assert.equal(v.seated, true); assert.equal(v.mode, 'sit');
    life.cmds.run(v, { id: 'stand_up' }, 'me'); assert.equal(v.seated, false); assert.equal(v.cmd, null);
    life.cmds.run(v, { id: 'lie' }, 'me'); life.cmds.step(v, 0.05); assert.equal(v.cmdLie, true);
});

test('a stranger\'s order to the guard is not carried out (the host checks again)', () => {
    const life = stubLife(); life.state = () => ({ owner: 'someone else' });
    const v = person(life, 'k1', 'knight', 5, 5), w = person(life, 'k2', 'knight', 8, 5);
    assert.equal(life.cmds.run(v, { id: 'spar_group', foe: 'k2' }, 'me'), false);
    assert.equal(v.cmd, undefined);
    assert.equal(life.cmds.run(v, { id: 'crouch' }, 'me'), true, 'a polite request is');
});

test('two knights spar: they meet, touch, and bow — nobody is hurt', () => {
    const life = stubLife();
    const a = person(life, 'a', 'knight', 0, 0), b = person(life, 'b', 'knight', 12, 0);
    life.cmds.run(a, { id: 'spar_group', foe: 'b', mode: 'spar' }, 'me');
    life.cmds.run(b, { id: 'spar_group', foe: 'a', mode: 'spar' }, 'me');
    let met = false;
    for (let t = 0; t < 40; t += 0.05) {
        life.cmds.step(a, 0.05); life.cmds.step(b, 0.05);
        if (Math.hypot(a.x - b.x, a.z - b.z) < 3) met = true;
        // the model's own swing: every 0.8 s each one
        if (a.mode === 'attack' && Math.round(t * 20) % 16 === 0) life.cmds.strike(a);
        if (b.mode === 'attack' && Math.round(t * 20) % 16 === 8) life.cmds.strike(b);
        if (a.cmd?.kind === 'pose') break;
    }
    assert.ok(met, 'they walked up to each other');
    assert.equal(a.hp, 20); assert.equal(b.hp, 20);
    assert.equal(a.cmd?.mode, 'bow', 'the end of the spar: a bow');
});

test('a fight to the death: blows land, one falls or yields', () => {
    const life = stubLife();
    const a = person(life, 'a', 'knight', 0, 0), b = person(life, 'b', 'knight', 1.5, 0);
    life.cmds.run(a, { id: 'spar_group', foe: 'b', mode: 'deadly' }, 'me');
    life.cmds.run(b, { id: 'spar_group', foe: 'a', mode: 'deadly' }, 'me');
    for (let t = 0; t < 120 && !a.dead && !b.dead && a.cmd?.kind === 'spar'; t += 0.05) {
        life.cmds.step(a, 0.05); life.cmds.step(b, 0.05);
        if (a.mode === 'attack' && Math.round(t * 20) % 10 === 0) life.cmds.strike(a);
    }
    assert.ok(b.hp < 20 || b.dead, 'a blow landed');
});

test('a walk to me: he comes, stops at 2.6 m, turns to me', () => {
    const life = stubLife(); const v = person(life, 'f', 'farmer', 20, 0);
    life.cmds.run(v, { id: 'come', pace: 'walk' }, 'me');
    run(life, v, 15);
    const d = Math.hypot(v.x, v.z);
    assert.ok(d < 3.3 && d > 1.5, `distance ${d}`);
});

test('formation: they walk to their slots and stand there', () => {
    const life = stubLife(); const ks = [0, 1, 2].map((i) => person(life, 'k' + i, 'knight', 20 + i * 2, 20));
    const slots = formationSlots('line', 3, { x: 0, z: 0 }, 0);
    ks.forEach((k, i) => life.cmds.run(k, { id: 'formation', slot: slots[i], form: 'line' }, 'me'));
    for (let t = 0; t < 40; t += 0.05) ks.forEach((k) => life.cmds.step(k, 0.05));
    ks.forEach((k, i) => assert.ok(Math.hypot(k.x - slots[i].x, k.z - slots[i].z) < 0.6, `knight ${i} at his place`));
    assert.equal(ks[0].mode, 'attn');
});
