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
import { newUid } from './ItemTypes.js';
import { detectOrder } from '../ai/TalkActions.js';
import { titleFor, vizierLine, RANK_KEYS } from './Ranks.js';
import { parseCommand, parseCommands, canDo, COMMANDS, ONLY_ACTIVE, commandAck, sayReply, pickGroup, pickTarget, formationSlots, SPAR_REFUSALS } from '../ai/TalkCommands.js';

const SHOUT_HEAR = 30; // m: a shouted order is heard by the guard this far (as for the army's orders)
const MAX_GROUP = 10; // people carrying out one command (a bigger crowd costs frames)
const GROUP_DEFAULT = new Set(['spar_group', 'formation', 'surround']); // said to nobody in particular → all the knights near
const normalizeForTitle = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е');
const SPARRERS = new Set(['knight']);
/** What can follow another command in a chain («иди домой и ляг»): states that need nothing resolved at the talk (a target, a place by hand). */
const CHAINABLE = new Set(['pose', 'face', 'hold', 'release', 'walk', 'pace', 'weapon']);
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
        return this._parseAll(text)[0] || null;
    }

    /** The commands in the words: one, or a chain («подойди и поклонись»). */
    _parseAll(text) {
        if (this._lastText === text) return this._lastParse;
        this._lastText = text;
        this._lastParse = parseCommands(text, { names: this._names() });
        return this._lastParse;
    }

    _names() {
        const out = [];
        for (const p of this.talk._players?.() || []) if (p.name) out.push(p.name); // (the players: «это мой друг Олег»)
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
    hear(v, text, info = {}, again = false) {
        const all = this._parseAll(text);
        let cmd = all[0];
        if (!cmd) return false;
        const g = this.game, life = this.life, talk = this.talk;
        // «делай это», «давай», «как я сказал»: the last command once more (what was asked a minute ago)
        if (cmd.id === 'do_it') {
            const last = this._last;
            if (again || !last || performance.now() - last.at > 90000) return false;
            return this.hear(v, last.text, info, true);
        }
        const chain = all.slice(1).filter((c) => CHAINABLE.has(COMMANDS[c.id].do.split(':')[0]) && c.id !== 'do_it');
        if (!again) this._last = { text, at: performance.now() };
        const def = COMMANDS[cmd.id];
        const army = detectOrder(text, talk._players());
        if (army && !NEW_WINS.has(cmd.id)) return false; // («собери войско», «в атаку на зомби»: the king's orders, VillagerOrders)
        const me = g.character.group.position;
        const ctxOf = (k) => ({ playerIsKing: life.isCommander(k.cs, g.localId), playerIsOwner: life.state(k.cs.def.id).owner === g.localId, wizard: !!k.wizard, female: !!k.entry?.female });
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
        if (kind === 'say') {
            if (cmd.id === 'give_item') { const r = this._fetch(doers, lead, cmd, text, reply, ack); if (r !== null) return r; } // («дай мне меч»: a sword lying near is brought; his own he keeps)
            this._log(text, cmd, lead, 'ответ'); reply(this._sayLine(what, lead, text)); return true;
        }
        if (kind === 'cast') return this._cast(lead, what, cmd, text);
        if (kind === 'rank') return this._rank(lead, what, cmd, text, reply);
        if (kind === 'social') return this._social(lead, what, cmd, text, reply);

        // --- a target: «сразись с ним», «не трогай его»
        let foe = null, foes = [];
        if (def.needsTarget || cmd.id === 'spar_group') {
            if (def.needsTarget) {
                const t = this._target(cmd, lead, doers);
                if (t.line && army) return false; // («бей их»: no one pointed at — the army's old order)
                if (t.line) { reply(t.line); this._log(text, cmd, lead, 'цель: ' + t.why); return true; }
                if (t.creature) return this._huntCreature(doers, t.creature, text, cmd, lead, ack());
                foe = t.v; foes = t.vs || [];
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
                const targets = foes.length ? foes : [foe];
                const attackers = doers.filter((k) => !targets.includes(k)).slice(0, 4);
                if (!attackers.length) { reply(pick(SPAR_REFUSALS.self)); return true; }
                // each attacker takes a target (round the list); a knight attacked fights back at him — a fair fight, not a beating
                attackers.forEach((k, i) => {
                    const f = targets[i % targets.length];
                    life.orders.run(k, 'cmd', { id: cmd.id === 'attack_him' ? 'attack_him' : 'fight_him', foe: f.id, mode: cmd.args.mode }, by);
                    if (cmd.id === 'fight_him' && f.role === 'knight' && i < targets.length) life.orders.run(f, 'cmd', { id: 'fight_him', foe: k.id, mode: cmd.args.mode }, by);
                });
                reply(cmd.id === 'attack_him' ? pick(['Задержу!', 'Есть, берём его!']) : cmd.args.mode === 'deadly' ? pick(['Он сам напросился. К бою!', 'Что ж, бой насмерть!', 'Приказ есть приказ — бой!']) : pick(['Есть! Покажу, чему меня учили.', 'Слушаюсь! Сразимся.', 'Принял вызов!']));
                this._log(text, cmd, lead, `бой: ${attackers.length} против ${targets.map((f) => f.name).join(', ')}, ${cmd.args.mode}`);
                return true;
            }
            case 'spare': {
                for (const k of doers) life.orders.run(k, 'cmd', { id: 'spare', foe: foe?.id }, by);
                reply(pick(['Не трону.', 'Хорошо, он свой.', 'Понял, не буду.']));
                return true;
            }
            case 'fight_me': sendAll(); reply(pick(['Что ж, потренируемся! Защищайтесь!', 'Принимаю! В полсилы, конечно.', 'Слушаюсь. Только без обид!'])); return this._done(text, cmd, lead);
            case 'tidy': case 'bring': case 'pick_up': case 'give_item': return this._fetch(doers, lead, cmd, text, reply, ack);
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
        // --- the common case: the same command to each (a pose, a walk, a hold…), and what follows it in a chain
        const then = chain.filter((c) => doers.every((k) => canDo(c.id, k.role, ctxOf(k)).ok)).map((c) => ({ id: c.id, pace: c.args.pace, dir: c.args.dir, dist: c.args.dist, mode: c.args.mode })).slice(0, 3);
        sendAll(() => ({ form: cmd.args.form, dist: cmd.args.dist, ...(then.length ? { then } : {}) }));
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
        // «вы двое», «один из вас»: the ones I look at first — the attention's score, then the angle to my gaze, then the distance
        if (scope.kind === 'n' || scope.kind === 'any') {
            const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
            for (const e of list) {
                const cos = e.d > 0.1 ? ((e.x - me.x) * fx + (e.z - me.z) * fz) / e.d : 1;
                e.rank = -(this.talk.attention?.score?.(e.id) || 0) * 10 + Math.acos(Math.max(-1, Math.min(1, cos))) * 3 + e.d * 0.05;
            }
            list.sort((a, b) => a.rank - b.rank);
            for (const e of list) e.d = list.indexOf(e); // (pickGroup takes the nearest first: the rank is now the "distance")
        }
        const picked = pickGroup(scope, list, { x: me.x, z: me.z, yaw }, MAX_GROUP).filter(Boolean).map((e) => e.k);
        // (the one addressed leads the answer when he is among them)
        const i = picked.indexOf(v);
        if (i > 0) { picked.splice(i, 1); picked.unshift(v); }
        return picked.length ? picked : [v];
    }

    /** Whom «с ним» is about: the pointed / looked-at / named one, a place round someone («сзади тебя»), the people near (and the creatures). */
    _target(cmd, lead, doers) {
        const g = this.game, life = this.life;
        const me = g.character.group.position;
        const t = cmd.args.target;
        if (t.ref === 'player') return { line: null, v: null };
        const skip = new Set(doers.map((k) => k.id));
        const c = [];
        for (const k of life.byId.values()) {
            if (k.dead || (skip.has(k.id) && cmd.id !== 'spare')) continue;
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
        // a place round the listener (or me): «те, что сзади тебя» — one, or all of them for a «тех»
        if (t.ref === 'region') {
            const o = t.of === 'me' ? { x: me.x, z: me.z, yaw } : { x: lead.x, z: lead.z, yaw: lead.yaw };
            const fx = -Math.sin(o.yaw), fz = -Math.cos(o.yaw);
            const inside = c.filter((e) => {
                const dx = e.x - o.x, dz = e.z - o.z, d = Math.hypot(dx, dz);
                if (d < 0.5 || d > 28 || e.k === lead) return false;
                const fwd = (dx * fx + dz * fz) / d, side = (dx * -fz + dz * fx) / d; // side: + to the right
                switch (t.side) {
                    case 'behind': return fwd < -0.25;
                    case 'front': return fwd > 0.25;
                    case 'left': return side < -0.3;
                    case 'right': return side > 0.3;
                    default: return d < 12;
                }
            }).sort((a, b) => Math.hypot(a.x - o.x, a.z - o.z) - Math.hypot(b.x - o.x, b.z - o.z));
            if (!inside.length) return { line: pick(SPAR_REFUSALS.none), why: 'в той стороне никого' };
            return this._judge(cmd, lead, t.plural ? inside.slice(0, 4) : [inside[0]]);
        }
        const one = pickTarget(t, c.concat(cr), { x: me.x, z: me.z, yaw }, ray, 0.3);
        if (!one) return { line: pick(SPAR_REFUSALS.none), why: t.ref === 'none' ? 'нет цели' : 'не нашёл цель' };
        if (one.e) {
            const kind = one.e.kind === 's' ? 'spider' : one.e.kind === 'a' ? 'animals' : one.e.kind === 'D' ? 'dragon' : 'zombies';
            return { creature: kind };
        }
        // «тех, на кого я показываю»: the ones standing close to the pointed one
        let list = [one];
        if (t.plural && one.k) list = c.filter((e) => e.k && Math.hypot(e.x - one.x, e.z - one.z) < 5).slice(0, 4);
        return this._judge(cmd, lead, list);
    }

    /** The chosen ones are fit to be fought? (a king, a civilian, himself — no, with the reason said). */
    _judge(cmd, lead, list) {
        const ok = [];
        let why = null;
        for (const e of list) {
            const f = e.k;
            if (cmd.id === 'spare') { ok.push(f); continue; }
            if (f === lead) { why = why || { line: pick(SPAR_REFUSALS.self), why: 'сам' }; continue; }
            if (f.role === 'king') { why = why || { line: pick(SPAR_REFUSALS.king), why: 'король' }; continue; }
            if (cmd.id !== 'attack_him' && f.role !== 'knight' && !f.wizard) { why = why || { line: pick(SPAR_REFUSALS.civilian), why: 'мирный' }; continue; }
            ok.push(f);
        }
        if (!ok.length) return why || { line: pick(SPAR_REFUSALS.none), why: 'нет цели' };
        return { v: ok[0], vs: ok };
    }

    /** The loose things the pointing ray touches (a cone narrowing with the distance): the nearest to the ray, and its heap when `heap`. */
    _pointedThings(kinds, heap) {
        const ray = this.pointRay(), items = this.game.items;
        if (!ray || !items?.loose) return [];
        const all = [];
        for (const L of items.loose.values()) {
            const it = L.item;
            if (!it || L.hover || L.away || (it.shop && !it.shop.paid) || it.godGift) continue;
            const p = L.model.position;
            all.push({ uid: it.uid, kind: it.kind, x: p.x, y: p.y, z: p.z });
        }
        let best = null, ba = Infinity;
        for (const e of all) {
            if (kinds && !kinds.has(e.kind)) continue;
            const dx = e.x - ray.o.x, dy = e.y - ray.o.y, dz = e.z - ray.o.z, len = Math.hypot(dx, dy, dz);
            if (len < 0.5 || len > 40) continue;
            const ang = Math.acos(Math.max(-1, Math.min(1, (ray.d.x * dx + ray.d.y * dy + ray.d.z * dz) / len)));
            const lim = Math.max(0.06, Math.min(0.3, Math.atan2(1.0, len)));
            if (ang < lim && ang < ba) { ba = ang; best = e; }
        }
        if (!best) return [];
        if (!heap) return [best];
        return all.filter((e) => (!kinds || kinds.has(e.kind)) && Math.hypot(e.x - best.x, e.z - best.z) < 3).slice(0, 12);
    }

    /**
     * «Убери доспехи сзади по сундукам», «принеси мне меч», «собери вещи»: the things lying in the place named, taken by the
     * knights one by one (VillagerCommands._fetch). → true; null when `give_item` found nothing to bring (he then says what he keeps).
     */
    _fetch(doers, lead, cmd, text, reply, ack) {
        const g = this.game, life = this.life, items = g.items;
        const f = cmd.args.items || {};
        const me = g.character.group.position, yaw = g.character.group.rotation.y;
        const kinds = f.kinds ? new Set(f.kinds) : null;
        const o = f.area === 'me' ? { x: me.x, z: me.z, yaw } : { x: lead.x, z: lead.z, yaw: lead.yaw };
        const fx = -Math.sin(o.yaw), fz = -Math.cos(o.yaw);
        const found = [];
        for (const L of items?.loose?.values() || []) {
            const it = L.item;
            if (!it || L.hover || L.away || (it.shop && !it.shop.paid) || it.godGift || (kinds && !kinds.has(it.kind))) continue;
            const p = L.model.position;
            const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
            if (d > (f.area === 'me' ? 10 : 18) || Math.hypot(p.x - me.x, p.z - me.z) > 30) continue;
            if (f.area === 'behind' && (d < 0.8 || (dx * fx + dz * fz) / d > -0.2)) continue;
            found.push({ uid: it.uid, d });
        }
        found.sort((a, b) => a.d - b.d);
        // «вот эти убери»: only the things my hand (or my gaze) is on — the one nearest the ray, and, for «эти», the heap round it
        if (f.pointed) {
            const pointed = this._pointedThings(kinds, !!f.plural);
            if (pointed.length) { found.length = 0; for (const e of pointed) found.push({ uid: e.uid, d: Math.hypot(e.x - lead.x, e.z - lead.z) }); found.sort((a, b) => a.d - b.d); }
            else if (!kinds || !found.length) {
                reply(pick(['На какие вещи вы показываете? Я там ничего не вижу.', 'Покажите рукой точнее — не пойму, какие вещи.']));
                this._log(text, cmd, lead, 'показанных вещей не нашёл');
                return true;
            }
        }
        if (!found.length) {
            if (cmd.id === 'give_item') return null;
            reply(pick(['Не вижу тут ничего такого.', `Не вижу, где лежат ${f.label || 'вещи'}.`, 'Нечего убирать — там пусто.']));
            this._log(text, cmd, lead, 'вещей не нашёл');
            return true;
        }
        // where they go: to me; beside the nearest chest; a pile before me
        let dest, say;
        if (cmd.id === 'bring' || cmd.id === 'give_item') { dest = { kind: 'me' }; say = ack(); }
        else {
            let chest = null, bd = 80;
            for (const c of g.chests || []) { const p = c.mesh?.position; if (!p) continue; const d = Math.hypot(p.x - o.x, p.z - o.z); if (d < bd) { bd = d; chest = c; } }
            if (cmd.id === 'tidy' && chest) {
                const cy = chest.mesh.rotation.y || 0;
                dest = { kind: 'spot', x: chest.mesh.position.x, z: chest.mesh.position.z, yaw: cy };
                say = f.toChest ? 'В сундук вещи не положишь — сложу рядом с ним.' : ack();
            } else {
                dest = { kind: 'spot', x: me.x - Math.sin(yaw) * 5, z: me.z - Math.cos(yaw) * 5, yaw: yaw + Math.PI };
                say = cmd.id === 'tidy' ? 'Сундука рядом нет — сложу кучей перед вами.' : ack();
            }
        }
        // shared out: the nearest to each knight, a few each
        const by = g.localId, share = doers.slice(0, 4).map(() => []);
        found.slice(0, share.length * 6).forEach((e, i) => share[i % share.length].push(e.uid));
        doers.slice(0, 4).forEach((k, i) => { if (share[i].length) life.orders.run(k, 'cmd', { id: cmd.id === 'give_item' ? 'bring' : cmd.id, uids: share[i], dest }, by); });
        reply(say);
        this._log(text, cmd, lead, `вещей: ${found.length} (${f.label}), ${dest.kind}`);
        return true;
    }

    /**
     * «Это мой друг», «слушайтесь его», «он мой наместник» — said to the vizier: whom (a name, the hand, or the only other player)
     * and which step; the host keeps it (VillagerCommands 'rank') and the whole castle knows (the castle's state).
     */
    _rank(lead, what, cmd, text, reply) {
        const g = this.game, life = this.life;
        const me = g.character.group.position;
        const players = (this.talk._players?.() || []).filter((p) => p.id !== g.localId);
        if (!players.length) { reply('Кроме вас, Ваше Величество, здесь никого нет. Когда придёт друг — укажите на него.'); this._log(text, cmd, lead, 'некому'); return true; }
        const cands = [];
        for (const p of players) {
            const pos = life._playerPos(p.id);
            if (pos) cands.push({ id: p.id, name: p.name, x: pos.x, y: pos.y + 1.6, z: pos.z, d: Math.hypot(pos.x - me.x, pos.z - me.z) });
        }
        const t = cmd.args.target;
        let who = null;
        if (t.ref === 'name') who = players.find((p) => p.name === t.name) ? cands.find((c) => c.name === t.name) || { id: players.find((p) => p.name === t.name).id, name: t.name } : null;
        else if (t.ref === 'point' || t.ref === 'nearest' || t.ref === 'left' || t.ref === 'right') who = pickTarget(t, cands, { x: me.x, z: me.z, yaw: g.character.group.rotation.y }, this.pointRay(), 0.3);
        if (!who && players.length === 1) who = cands[0] || { id: players[0].id, name: players[0].name };
        if (!who) { reply(pick(['О ком речь, Ваше Величество? Назовите имя или покажите на него.', 'Не пойму, о ком вы. Покажите рукой.'])); this._log(text, cmd, lead, 'кто — не понял'); return true; }
        const level = what === 'none' ? 0 : RANK_KEYS[what] || 1;
        const title = titleFor(level, normalizeForTitle(text));
        const before = life.rankOf(lead.cs, who.id);
        life.orders.run(lead, 'cmd', { id: cmd.id, pid: who.id, pname: who.name, title }, g.localId);
        reply(vizierLine(level, who.name, title, before < 9 ? before : 0));
        this._log(text, cmd, lead, `ранг ${level} (${title}) → ${who.name}`);
        return true;
    }

    /** The life of a person: his goal, the road together, a spell shown, what a friend may ask (Lives.js / SocialLife). */
    _social(lead, what, cmd, text, reply) {
        const g = this.game, life = this.life, soc = life.social;
        if (!soc) return false;
        const done = (why) => { this._log(text, cmd, lead, why); return true; };
        switch (what) {
            case 'ask_goal': reply(soc.askGoal(lead)); return done('цель');
            case 'my_goal': reply(soc.heroSays(lead, text)); return done('моя цель: ' + (soc.heroGoal?.text || ''));
            case 'show_off': soc.watch(lead); reply(pick(['Ну, показывай!', 'О? Что ты задумал? Смотрю.', 'Я весь внимание.', 'Давай, удиви меня.'])); return done('смотрит');
            case 'invite': {
                const r = soc.invite(lead);
                reply(r.line);
                if (r.answer === 'join' || r.answer === 'help') life.orders.run(lead, 'companion', {}, g.localId);
                return done(`в путь: ${r.answer}${r.need != null ? ` (нужно ${r.need})` : ''}`);
            }
            case 'uninvite': {
                if (!lead.companion) { reply(pick(['Я и так никуда не иду с тобой.', 'Хорошо.'])); return done('не спутник'); }
                life.orders.run(lead, 'uncompanion', {}, g.localId);
                return done('отпущен');
            }
            default: break;
        }
        // what a friend may give: ask_enter | ask_rummage | ask_loan | ask_purse | ask_wand | ask_tool | ask_house
        const key = what.replace('ask_', '');
        const r = soc.ask(lead, key);
        reply(r.line);
        if (r.yes && r.give) {
            const p = g.character.group.position;
            g.items?.spawnLoose({ kind: 'coins', uid: newUid(), count: r.give }, new THREE.Vector3(p.x + 0.6, p.y - 0.4, p.z), {});
            g.hud?.setVoice?.(`💰 ${lead.name} одолжил вам ${r.give} монет`, true);
        }
        return done(`${key}: ${r.yes ? 'да (' + r.by + ')' : 'нет'}`);
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
