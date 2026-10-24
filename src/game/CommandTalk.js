/**
 * CommandTalk.js — the player's plain-word commands to the castle's people (the author: «рыцари не понимают команд…
 * постоянное живое взаимодействие и огромное количество команд… если не может — отвечает, что не может»).
 *
 * The words are read by the rules at once (src/ai/TalkCommands.js: many wordings, groups, targets), no neural net.
 * Here the game side of a talk: WHO hears (the one I address, or «все», «вы двое», «левый», «ближайший»), WHOM «с ним» is
 * about (the hand / wand / gaze I point with — `pointRay`, a side, a name), what each one says (one or two voices at most —
 * no choir — the rest just do it), and the command goes to the host as an order 'cmd' (VillagerOrders → VillagerCommands).
 * Refusals are answers too: the reason by the role («Я не волшебник», «Я подчиняюсь только королю»).
 */

import * as THREE from 'three';
import { detectOrder } from '../ai/TalkActions.js';
import { parseCommand, canDo, COMMANDS, ONLY_ACTIVE, commandAck, sayReply, pickGroup, pickTarget, formationSlots, SPAR_REFUSALS } from '../ai/TalkCommands.js';

const SHOUT_HEAR = 30; // m: a shouted order is heard by the guard this far (as for the army's orders)
const MAX_GROUP = 10; // people carrying out one command (a bigger crowd costs frames)
const GROUP_DEFAULT = new Set(['spar_group', 'formation', 'surround']); // said to nobody in particular → all the knights near
const SPARRERS = new Set(['knight']);
/** Commands that win over the king's old army-order reader (it knows no hand pointing, pairs or formations). */
const NEW_WINS = new Set(['spar_group', 'fight_him', 'attack_him', 'formation', 'surround', 'guard_spot', 'patrol', 'stop_fight']);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class CommandTalk {
    constructor(talk, journal = () => {}) {
        this.talk = talk;
        this.journal = journal;
    }

    get game() { return this.talk.game; }
    get life() { return this.talk.life; }

    /** Are these words a command (for `claims`: the villager hears them, not a spell)? */
    matches(text) {
        return !!this._parse(text);
    }

    _parse(text) {
        if (this._lastText === text) return this._lastParse;
        this._lastText = text;
        this._lastParse = parseCommand(text, { names: this._names() });
        return this._lastParse;
    }

    _names() {
        const out = [];
        for (const v of this.life.byId.values()) if (!v.dead && v.name) out.push(v.name);
        return out.length > 80 ? out.slice(0, 80) : out;
    }

    /** The ray I point along: a raised hand (or the wand), otherwise the gaze. */
    pointRay() {
        const g = this.game, ch = g.character;
        const wand = g.wandSide?.();
        const pref = g.magicHand || g.lastMagicHand || g.dom || 'right';
        for (const side of wand ? [wand] : [pref, pref === 'right' ? 'left' : 'right']) {
            if (!ch.isArmRaised || !ch.isArmRaised(side)) continue;
            try {
                g.duel?._myRay?.(side, _o, _d);
                if (_d.lengthSq() > 0.01) return { o: { x: _o.x, y: _o.y, z: _o.z }, d: { x: _d.x, y: _d.y, z: _d.z }, hand: true };
            } catch (_) { /* (no hand ray: the gaze) */ }
        }
        const cam = g.camera;
        if (!cam) return null;
        cam.getWorldPosition(_o); cam.getWorldDirection(_d);
        return { o: { x: _o.x, y: _o.y, z: _o.z }, d: { x: _d.x, y: _d.y, z: _d.z }, hand: false };
    }

    /** Where on the ground I point (a march along the ray until it meets the ground), or null. */
    pointGround() {
        const ray = this.pointRay();
        const col = this.game.collision;
        if (!ray || !col?.groundY) return null;
        let last = null;
        for (let t = 1; t <= 60; t += 1) {
            const x = ray.o.x + ray.d.x * t, y = ray.o.y + ray.d.y * t, z = ray.o.z + ray.d.z * t;
            const gy = col.groundY(x, z);
            if (y <= gy + 0.2) return { x, z };
            last = { x, z };
        }
        return ray.hand ? last : null; // (a gaze into the sky points at nothing; a hand points far)
    }

    // ------------------------------------------------------------------ the talk
    /** → true: the words were a command to `v` (answered); false: not mine. */
    hear(v, text, info = {}) {
        const cmd = this._parse(text);
        if (!cmd) return false;
        const g = this.game, life = this.life, talk = this.talk;
        const def = COMMANDS[cmd.id];
        const army = detectOrder(text, talk._players());
        if (army && !NEW_WINS.has(cmd.id)) return false; // («собери войско», «в атаку на зомби»: the king's orders, VillagerOrders)
        const me = g.character.group.position;
        const ctxOf = (k) => ({ playerIsKing: life.state(k.cs.def.id).owner === g.localId, wizard: !!k.wizard, female: !!k.entry?.female });
        const busy = (k) => k.cmd || k.order || k.follow || k.foe;
        const group = this._group(v, cmd, def);
        // (a word that matters only while something is going on — «хватит», «встань» — is an ordinary word otherwise)
        if (ONLY_ACTIVE.has(cmd.id) && !group.some((k) => busy(k) || k.seated)) return false;
        const lead = group[0] || v;
        const lctx = ctxOf(lead);
        this._begin(lead, text, info);
        const can = canDo(cmd.id, lead.role, lctx);
        if (!can.ok) { this._log(text, cmd, lead, 'не может: ' + can.why); talk._sayReply(lead, can.line); return true; }
        // the members that can do it (the lead can); the rest just do nothing
        const doers = group.filter((k) => canDo(cmd.id, k.role, ctxOf(k)).ok);
        const reply = (line) => { if (line) talk._sayReply(lead, line); };
        const [kind, what] = def.do.split(':');
        const ctx = { role: lead.role, wizard: !!lead.wizard, female: !!lead.entry?.female };
        const ack = () => {
            const sp = talk.speech, vo = talk._voiceOpts?.(lead);
            return commandAck(cmd.id, lead.role, ctx, Math.random, vo && sp?.isReady ? (l) => sp.isReady(l, vo) : null);
        };

        // --- talk-only commands (the answer is the action)
        if (kind === 'say') { this._log(text, cmd, lead, 'ответ'); reply(this._sayLine(what, lead, text)); return true; }
        if (kind === 'cast') return this._cast(lead, what, cmd, text);

        // --- a target: «сразись с ним», «не трогай его»
        let foe = null;
        if (def.needsTarget || cmd.id === 'spar_group') {
            if (def.needsTarget) {
                const t = this._target(cmd, lead, doers);
                if (t.line && army) return false; // («бей их»: no one pointed at — the army's old order)
                if (t.line) { reply(t.line); this._log(text, cmd, lead, 'цель: ' + t.why); return true; }
                if (t.creature) return this._huntCreature(doers, t.creature, text, cmd, lead, ack());
                foe = t.v;
            }
        }
        const by = g.localId;
        const sendAll = (extra = (k) => ({})) => { for (const k of doers) life.orders.run(k, 'cmd', { id: cmd.id, pace: cmd.args.pace, dir: cmd.args.dir, mode: cmd.args.mode, ...extra(k) }, by); };

        switch (cmd.id) {
            case 'spar_group': {
                const list = doers.filter((k) => SPARRERS.has(k.role));
                if (list.length < 2) { reply(pick(SPAR_REFUSALS.noone)); this._log(text, cmd, lead, 'некому драться'); return true; }
                const pairs = this._pairs(list);
                for (const [a, b] of pairs) {
                    life.orders.run(a, 'cmd', { id: 'spar_group', foe: b.id, mode: cmd.args.mode }, by);
                    life.orders.run(b, 'cmd', { id: 'spar_group', foe: a.id, mode: cmd.args.mode }, by);
                }
                reply(cmd.args.mode === 'deadly' ? pick(['Насмерть так насмерть. К бою!', 'Как прикажете — без пощады!']) : pick(['Есть, потренируемся!', 'Слушаюсь! Покажем, как мы сражаемся!', 'Так точно, спарринг!']));
                this._log(text, cmd, lead, `спарринг ${pairs.length} пар, ${cmd.args.mode}`);
                return true;
            }
            case 'fight_him': case 'attack_him': {
                if (!foe) return true;
                const attackers = doers.filter((k) => k !== foe).slice(0, 3);
                if (!attackers.length) { reply(pick(SPAR_REFUSALS.self)); return true; }
                for (const k of attackers) life.orders.run(k, 'cmd', { id: cmd.id === 'attack_him' ? 'attack_him' : 'fight_him', foe: foe.id, mode: cmd.args.mode }, by);
                if (cmd.id === 'fight_him' && foe.role === 'knight') life.orders.run(foe, 'cmd', { id: 'fight_him', foe: attackers[0].id, mode: cmd.args.mode }, by);
                reply(cmd.id === 'attack_him' ? pick(['Задержу!', 'Есть, берём его!']) : cmd.args.mode === 'deadly' ? pick(['Он сам напросился. К бою!', 'Что ж, бой насмерть!']) : pick(['Есть! Покажу, чему меня учили.', 'Слушаюсь! Сразимся.', 'Принял вызов!']));
                this._log(text, cmd, lead, `бой с ${foe.name}, ${cmd.args.mode}`);
                return true;
            }
            case 'spare': {
                for (const k of doers) life.orders.run(k, 'cmd', { id: 'spare', foe: foe?.id }, by);
                reply(pick(['Не трону.', 'Хорошо, он свой.', 'Понял, не буду.']));
                return true;
            }
            case 'fight_me': sendAll(); reply(pick(['Что ж, потренируемся! Защищайтесь!', 'Принимаю! В полсилы, конечно.', 'Слушаюсь. Только без обид!'])); return this._done(text, cmd, lead);
            case 'formation': case 'surround': return this._formation(doers, cmd, lead, text, reply);
            case 'come': {
                sendAll();
                reply(ack());
                return this._done(text, cmd, lead);
            }
            case 'go_there': case 'look_there': {
                const point = this.pointGround();
                if (cmd.id === 'go_there' && !point) { reply(pick(['Куда? Покажите рукой.', 'Не понял, куда идти — покажите.'])); return true; }
                sendAll(() => ({ point }));
                if (cmd.id === 'go_there') reply(ack());
                return this._done(text, cmd, lead);
            }
            default: break;
        }
        // --- the common case: the same command to each (a pose, a walk, a hold…)
        sendAll(() => ({ form: cmd.args.form }));
        const a = ack();
        if (a) reply(a);
        // (several answered: a second voice now and then, never a choir)
        if (doers.length >= 3 && a && Math.random() < 0.5) {
            const k2 = doers.find((k) => k !== lead);
            if (k2) setTimeout(() => { if (!k2.dead) life._say(k2, commandAck(cmd.id, k2.role, ctxOf(k2)) || a, 2.5); }, 650 + Math.random() * 300);
        }
        return this._done(text, cmd, lead);
    }

    _done(text, cmd, lead) { this._log(text, cmd, lead, 'выполняется'); return true; }

    _log(text, cmd, v, what) { this.journal(`разговор: «${text}» → команда ${cmd.id} (${COMMANDS[cmd.id].cat}) — ${v.title || ''} ${v.name || ''}: ${what}`); }

    _begin(v, text, info) {
        const g = this.game, talk = this.talk;
        const tr = talk._traceTurn(v, text, info);
        talk.trace.mark(tr, 'rules');
        v.talking = 4; v.talkTo = g.localId;
        talk.attention?.talkedWith(v.id, performance.now());
        if (!g.authority) g.sync?.villagerTalk?.(v.id);
        const me = g.character.group.position;
        if (!v.foe) v.yaw = Math.atan2(-(me.x - v.x), -(me.z - v.z));
    }

    /** The people the command is for: the one I speak to, or a group by the scope words. */
    _group(v, cmd, def) {
        const g = this.game, life = this.life;
        const me = g.character.group.position;
        let scope = cmd.args.scope;
        if (scope.kind === 'none' && GROUP_DEFAULT.has(cmd.id)) scope = { kind: 'all' };
        if (scope.kind === 'none') return [v];
        const sameClass = (k) => (v.role === 'knight' ? k.role === 'knight' : k.role === v.role) && k.cs === v.cs;
        const list = [];
        for (const k of life.byId.values()) {
            if (k.dead || k.sleep || !sameClass(k) || Math.abs(k.y - (me.y - 1.95)) > 8) continue;
            const d = Math.hypot(k.x - me.x, k.z - me.z);
            if (d > SHOUT_HEAR) continue;
            list.push({ k, id: k.id, x: k.x, z: k.z, d });
        }
        if (!list.length) return [v];
        const yaw = g.character.group.rotation.y;
        const picked = pickGroup(scope, list, { x: me.x, z: me.z, yaw }, MAX_GROUP).filter(Boolean).map((e) => e.k);
        // (the one addressed leads the answer when he is among them)
        const i = picked.indexOf(v);
        if (i > 0) { picked.splice(i, 1); picked.unshift(v); }
        return picked.length ? picked : [v];
    }

    /** Whom «с ним» is about: the pointed / looked-at / named one, among the people near (and the creatures). */
    _target(cmd, lead, doers) {
        const g = this.game, life = this.life;
        const me = g.character.group.position;
        const t = cmd.args.target;
        if (t.ref === 'player') return { line: null, v: null };
        const skip = new Set(doers.map((k) => k.id));
        const c = [];
        for (const k of life.byId.values()) {
            if (k.dead || skip.has(k.id) && cmd.id !== 'spare') continue;
            const d = Math.hypot(k.x - me.x, k.z - me.z);
            if (d > 45) continue;
            c.push({ k, id: k.id, x: k.x, y: k.y + 2.2, z: k.z, d, name: k.name });
        }
        const ray = this.pointRay();
        const yaw = g.character.group.rotation.y;
        // the creatures too (a zombie, the spider): «сразись с ним», the hand on a zombie
        const cr = [];
        for (const e of life.orders.creatures('enemies')) {
            const p = e.obj.group?.position || e.obj.position || e.obj.model?.position || (e.obj.x != null ? e.obj : null);
            if (!p) continue;
            const d = Math.hypot(p.x - me.x, p.z - me.z);
            if (d < 45) cr.push({ e, id: 'c' + cr.length, x: p.x, y: p.y + 1.2, z: p.z, d });
        }
        const pickAmong = pickTarget(t, c.concat(cr), { x: me.x, z: me.z, yaw }, ray, 0.3);
        if (!pickAmong && t.ref === 'none') return { line: pick(SPAR_REFUSALS.none), why: 'нет цели' };
        if (!pickAmong) return { line: pick(SPAR_REFUSALS.none), why: 'не нашёл цель' };
        if (pickAmong.e) {
            const kind = pickAmong.e.kind === 's' ? 'spider' : pickAmong.e.kind === 'a' ? 'animals' : pickAmong.e.kind === 'D' ? 'dragon' : 'zombies';
            return { creature: kind };
        }
        const f = pickAmong.k;
        if (cmd.id === 'spare') return { v: f };
        if (f === lead) return { line: pick(SPAR_REFUSALS.self), why: 'сам' };
        if (f.role === 'king') return { line: pick(SPAR_REFUSALS.king), why: 'король' };
        if (cmd.id !== 'attack_him' && f.role !== 'knight' && !f.wizard) return { line: pick(SPAR_REFUSALS.civilian), why: 'мирный' };
        return { v: f };
    }

    _huntCreature(doers, kind, text, cmd, lead, ack) {
        const life = this.life, by = this.game.localId;
        const what = kind === 'dragon' ? 'enemies' : kind;
        for (const k of doers.slice(0, 6)) life.orders.run(k, 'attack', { target: what }, by);
        this.talk._sayReply(lead, pick(['В бой!', 'Бей его!', 'Есть, уничтожим!']));
        this._log(text, cmd, lead, 'в бой с существом ' + kind);
        return true;
    }

    /** Pairs for a spar: each with the nearest free one. */
    _pairs(list) {
        const left = list.slice(0, MAX_GROUP), out = [];
        while (left.length >= 2) {
            const a = left.shift();
            let bi = 0, bd = Infinity;
            left.forEach((b, i) => { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < bd) { bd = d; bi = i; } });
            out.push([a, left.splice(bi, 1)[0]]);
        }
        return out;
    }

    _formation(doers, cmd, lead, text, reply) {
        const g = this.game, life = this.life;
        const members = doers.filter((k) => k.role === 'knight').slice(0, MAX_GROUP);
        if (!members.length) { reply(pick(SPAR_REFUSALS.noone)); return true; }
        const me = g.character.group.position;
        const yaw = g.character.group.rotation.y;
        const form = cmd.args.form || 'line';
        const slots = formationSlots(form, members.length, { x: me.x, z: me.z }, yaw);
        // nearest slot first, so they do not cross
        const left = slots.slice();
        const order = members.slice().sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
        for (const k of order) {
            let bi = 0, bd = Infinity;
            left.forEach((s, i) => { const d = Math.hypot(s.x - k.x, s.z - k.z); if (d < bd) { bd = d; bi = i; } });
            const s = left.splice(bi, 1)[0];
            life.orders.run(k, 'cmd', { id: cmd.id, slot: s, form }, g.localId);
        }
        const names = { line: 'в шеренгу', column: 'в колонну', circle: 'в круг', wedge: 'клином', shields: 'стеной щитов', two: 'в две шеренги' };
        reply(pick([`Есть! Строимся ${names[form] || ''}!`, 'Слушаюсь! Становись!', 'Так точно, строимся!']));
        this._log(text, cmd, lead, `строй ${form}, ${members.length} чел.`);
        return true;
    }

    /** The wizard's magic on a request (the rest cannot: canDo said so before). */
    _cast(lead, what, cmd, text) {
        const g = this.game, life = this.life, talk = this.talk;
        if (what === 'shield') { // «защити меня» — a wizard walks beside and strikes whoever goes at me
            life.orders.run(lead, 'guard_me', { agreed: true }, g.localId);
            talk._sayReply(lead, pick(['Протего! Я прикрою.', 'Буду рядом — никто вас не тронет.']));
            return this._done(text, cmd, lead);
        }
        life.orders.run(lead, 'cmd', { id: cmd.id }, g.localId);
        const word = what === 'light' ? 'Люмос!' : pick(['Люмос!', 'Лувиатус!', 'Аква!']);
        talk._sayReply(lead, what === 'light' ? 'Люмос!' : `Смотри! ${word}`);
        if (g.fx?.spark) for (let i = 0; i < 8; i++) g.fx.spark(_o.set(lead.x - Math.sin(lead.yaw) * 1.4, lead.y + 3.4, lead.z - Math.cos(lead.yaw) * 1.4), what === 'light' ? 0xfff3b0 : 0xb48cff, 0.1, _d.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.7);
        return this._done(text, cmd, lead);
    }

    _sayLine(what, v, text) {
        const g = this.game, me = g.character.group.position;
        let zombies = 0;
        for (const z of g.zombies || []) if (!z.isDead && !z.isDying) { const p = z.group?.position || z.position; if (p && Math.hypot(p.x - v.x, p.z - v.z) < 40) zombies++; }
        let nearby = 0;
        for (const k of this.life.byId.values()) if (k !== v && !k.dead && Math.hypot(k.x - v.x, k.z - v.z) < 15) nearby++;
        const ctx = { role: v.role, wizard: !!v.wizard, hpRatio: v.maxHp ? v.hp / v.maxHp : 1, zombies, nearby, danger: v.cs.hostile.size > 0, roleLine: this._roleLine(v) };
        if (what === 'repeat') return this.talk._lastSpoken || 'Я ещё ничего не говорил.';
        return sayReply(what, ctx);
    }

    _roleLine(v) {
        const t = v.title ? v.title + ' ' : '';
        switch (v.role) {
            case 'knight': return `Я ${t}${v.name || ''} — рыцарь, служу королю и охраняю замок.`.replace('  ', ' ');
            case 'advisor': return 'Я советник короля. Подсказываю, как лучше управлять замком.';
            case 'king': return 'Я король. Это мой замок и мои люди.';
            case 'merchant': return 'Я торговец. Покупаю и продаю — заходи к прилавку.';
            case 'seller': return 'Я продавец. Посмотри, что у меня есть.';
            case 'builder': return 'Я строитель. Чиню стены и дома, когда что-то ломается.';
            case 'farmer': return 'Я земледелец. Растим хлеб и кормим замок.';
            default: return v.wizard ? 'Я волшебник. Изучаю магию и варю зелья.' : 'Живу здесь и помогаю, чем могу.';
        }
    }
}
