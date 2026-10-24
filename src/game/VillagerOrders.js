/**
 * VillagerOrders.js — the castle's people carry out what they agreed to do.
 *
 * The host runs it (the host moves the villagers); a guest's orders come to
 * the host over the network (NetSync 'vord').
 *
 *  - follow_me: the villager walks after the player (the king's men follow
 *    him out of the castle land too);
 *  - stay (all: the whole army): stop, back to their posts;
 *  - gather_army: every knight of the castle — those out and those from the
 *    barracks — comes to the king and follows him;
 *  - attack {target}: a player (by name) → the knights go for them like for any
 *    enemy of the castle; zombies / the spider / animals / any enemies → the
 *    knights hunt the nearest such creature round the king and strike it with
 *    their swords (every blow is a real swing of the model: the damage lands
 *    when the swing reaches, `strikeNow`);
 *  - defend_castle: the knights go to the gate and onto the walls and strike
 *    any creature that comes near the castle.
 */

import { ARMY } from '../ai/TalkActions.js';
import { FACE, facesTarget } from './FaceTarget.js';
import { inHall, doorSpots } from './ThroneHall.js';

const WALK = 2.3, RUN = 5.6;
const HUNT = 45; // m round the king (or the knight) a hunted creature is looked for
const DEFEND = 30; // m beyond the castle land the defenders strike
const REACH = 2.6;
const BRISK = 4.4; // m/s: «уйдите» is done at once, but nobody runs through the hall
const MAX_ARMY = 14; // knights out at once by an order (a big army costs frames)

const dh0 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (o) => o?.group?.position || o?.position || o?.model?.position || (o?.x != null ? o : null); // (a villager is himself {x, y, z}; the Ice Castle's / the spider's body is its model)

export class VillagerOrders {
    constructor(life) {
        this.life = life;
    }

    get game() { return this.life.game; }

    /** The king, or his commander / deputy (Ranks.js). */
    _cmdr(cs, by) { return this.life.isCommander ? this.life.isCommander(cs, by) : by != null && this.life.state(cs.def.id).owner === by; }

    /**
     * A villager agreed to an action (from the talk). Host: carry it out; guest: ask the host.
     * @param {object} v the villager
     * @param {string} name action name (TalkActions)
     * @param {object} [args]
     * @param {string} [by] player id who asked (default: me)
     */
    run(v, name, args = {}, by = this.game.localId) {
        if (!v || v.dead) return;
        if (!this.game.authority) { this.game.sync?.villagerOrder?.(v.id, name, args); return; }
        if (!this.permitted(v, name, args, by)) return;
        const cs = v.cs;
        const me = this.life._playerPos(by);
        switch (name) {
            case 'follow_me': case 'follow': {
                const king = this._cmdr(cs, by);
                v.follow = by; v.followT = king ? 600 : 90; v.followFar = king; v.path = null;
                v.order = null;
                break;
            }
            case 'stay': case 'stop_follow':
                if (args.all && this.life.state(cs.def.id).owner === by) {
                    for (const k of this._army(cs)) this._release(k);
                    for (const k of cs.active.values()) if (k.order?.kind === 'leave') this._release(k); // («вольно»: those sent away go back to their places)
                }
                this._release(v);
                break;
            case 'gather_army': {
                const army = this._muster(cs, by);
                for (const k of army) { k.follow = by; k.followT = 600; k.followFar = true; k.order = null; k.path = null; k.foe = null; k.investigate = null; }
                this._shout(army, ['За короля!', 'Строимся!', 'Идём, Ваше Величество!', 'К бою готовы!'], v);
                break;
            }
            case 'attack': {
                const army = this._muster(cs, by);
                if (args.playerId && args.playerId !== by) {
                    // a player: an enemy of the castle now (the usual fight)
                    cs.hostile.set(args.playerId, Date.now() + 180000);
                    for (const k of army) { k.foe = args.playerId; k.order = null; k.follow = null; }
                    if (args.playerId === this.game.localId) this.game.hud?.setVoice?.('⚔️ Король приказал страже взять вас!', true);
                    else this.game.sync?.villagerAlarm?.(args.playerId, cs.def.name);
                } else {
                    const what = ['zombies', 'spider', 'animals', 'enemies', 'sailors', 'dragon'].includes(args.target) ? args.target : 'enemies';
                    for (const k of army) { k.order = { kind: 'hunt', what, by, t: 180 }; k.follow = null; k.path = null; k.investigate = null; }
                }
                this._shout(army, ['В атаку!', 'Бей их!', 'За короля!', 'Вперёд!'], v);
                break;
            }
            case 'defend_castle': {
                const army = this._muster(cs, by);
                const posts = this._posts(cs);
                army.forEach((k, i) => { k.order = { kind: 'defend', by, t: 900, post: posts.length ? posts[i % posts.length] : null }; k.follow = null; k.path = null; });
                this._shout(army, ['Все на стены!', 'Держать ворота!', 'Защищать замок!'], v);
                break;
            }
            case 'guard_me': case 'guard': {
                // «охраняй меня»: a bodyguard — walks in the formation round the king, strikes whoever goes at him, no wandering after strangers
                v.follow = by; v.followT = 1800; v.followFar = true; v.guard = true; v.path = null; v.order = null; v.foe = null; v.investigate = null;
                const lord = this.life.state(cs.def.id).owner === by;
                this._shout([v], lord ? ['Буду рядом, государь!', 'Не отойду от вас!', 'Никто вас не тронет!'] : ['Ладно, прикрою!', 'Буду рядом.', 'Не бойся, я с тобой.']);
                break;
            }
            case 'rel': { // (a guest's talk moved a bar: the host writes it — RelationsLife)
                if (args.d && typeof args.d === 'object') this.life.rel.bump(v, by, { s: +args.d.s || 0, f: +args.d.f || 0, l: +args.d.l || 0 });
                return;
            }
            case 'companion': this.life.social.hostInvite(v, by, args); return; // (a friend goes on the road with the hero — SocialLife; the host decides again)
            case 'uncompanion': this.life.social.hostRelease(v, 'asked'); return;
            case 'cmd': this.life.cmds.run(v, args, by); return; // (a plain-word command: VillagerCommands.js — it checks itself)
            case 'dismiss': this._dismiss(v, by); break;
            case 'leave_me': this._dismiss(v, by, true); break;
            case 'bow': v.bowing = 1.6; break;
            case 'flee': v.fleeFrom = by; v.fleeT = 10; v.fleeing = false; v.path = null; break;
            case 'go_to': this._guide(v, { market: 'market', throne: 'throneFront', gate: 'gateOut', walls: 'wall', barracks: 'barracksDoor', home: 'home' }[args.place]); break;
            default:
                if (name.startsWith('guide:')) this._guide(v, { 'guide:market': 'market', 'guide:throne': 'throneFront', 'guide:gate': 'gateOut' }[name]);
                break;
        }
        if (me && !v.foe && name !== 'flee' && v.job !== 'king') v.yaw = Math.atan2(-(me.x - v.x), -(me.z - v.z));
        // (he sets off at once and answers on the way — a talk does not hold him where he stood: CastleLife «talking»)
        if (['follow_me', 'follow', 'gather_army', 'go_to', 'flee'].includes(name) || name.startsWith('guide:')) v.talking = 0;
    }

    /** (host) May `by` give this order? (a guest's order is checked again here) */
    permitted(v, name, args = {}, by) {
        if (name === 'cmd' || name === 'rel' || name === 'companion' || name === 'uncompanion') return true; // (VillagerCommands.run checks the rank itself)
        const king = this._cmdr(v.cs, by); // (the king, or the king's commander / deputy — Ranks.js)
        // (a bodyguard / a companion for one he chose to help — his character and how he takes me: Attitude.willDo)
        if (args.agreed && (name === 'guard_me' || name === 'guard' || name === 'follow_me' || name === 'follow') && v.role !== 'king') return true;
        if (ARMY.has(name)) {
            if (king) return true;
            return name === 'attack' && v.role === 'knight' && !args.playerId && (args.target === 'zombies' || args.target === 'spider');
        }
        if ((name === 'follow_me' || name === 'follow') && v.role === 'king') return false;
        // (a plain «иди за мной» to a busy villager: only wanderers leave their work, unless the king asks)
        if ((name === 'follow_me' || name === 'follow') && !king && v.job !== 'wander' && !v.guest) return false; // (the Creative guest is here to try it all)
        return true;
    }

    /** Shows the way: walks to a place of the castle (a wanderer leaves what they did). */
    _guide(v, tag) {
        if (!tag || (v.job !== 'wander' && v.job !== 'net')) return;
        const list = tag === 'wall' ? (v.cs.def.wallWalk || []) : v.cs.graph.tagged(tag);
        if (!list.length) return;
        v.waitT = 0; v.purpose = tag; this.life._goTo(v, list[0]); v.guiding = 30;
    }

    /** The knights of the castle out now (+ the advisor stays by the throne). */
    _army(cs) {
        return [...cs.active.values()].filter((k) => !k.dead && k.role === 'knight');
    }

    /** All the castle's knights: those out, and more come out of the barracks (up to MAX_ARMY). */
    _muster(cs, by) {
        const life = this.life;
        const def = cs.def;
        const st = life.state(def.id);
        const from = cs.graph.tagged('barracksDoor').concat(cs.graph.tagged('keepDoor'), cs.graph.tagged('gateIn'));
        let n = this._army(cs).length;
        for (let k = 1; k <= def.knights && n < MAX_ARMY && from.length; k++) {
            if (cs.active.has(k) || st.killed.has(k)) continue;
            const node = cs.graph.nodes[from[n % from.length]];
            if (life._activate(cs, k, { x: node.x + (Math.random() - 0.5) * 2, y: node.y, z: node.z + (Math.random() - 0.5) * 2 }, 'yard')) n++;
        }
        // (an order from the king — the knights forget an old quarrel with him)
        for (const k of this._army(cs)) if (k.foe === by) k.foe = null;
        return this._army(cs);
    }

    /**
     * «Уйдите» (the king's word): EVERYBODY of the castle in the throne room — and the ones round the king, wherever
     * he stands — go away, each to his own place outside it (the barracks door, the yard, the keep's door…), not
     * into each other. The vizier goes to the doors, inside the hall, and stays there to hear the king.
     */
    _dismiss(v0, by, alone = false) {
        const life = this.life, cs = v0.cs, def = cs.def;
        const me = life._playerPos(by);
        if (!me) return;
        const mine = (v) => Math.abs(v.y - (me.y - 1.95)) < 5;
        // (alone: «уйди» to one villager — only he goes, for a while, and says nothing more: his answer was his word)
        const group = alone ? (v0.dead || v0.role === 'king' ? [] : [v0]) : [...cs.active.values()].filter((v) => !v.dead && v.role !== 'king' && !v.foe && mine(v)
            && (v === v0 || inHall(def, v, 3) || Math.hypot(v.x - me.x, v.z - me.z) < 12));
        const exits = this._exits(cs);
        const load = new Array(exits.length).fill(0);
        const door = doorSpots(def);
        group.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
        let named = 0;
        for (const v of group) {
            v.follow = null; v.followFar = false; v.path = null; v.investigate = null; v.talking = 0; v.seated = false; v.bowing = 0;
            if (v.task) { v.task.by = null; v.task = null; }
            if (v.job === 'rebuild') v.job = 'wander';
            if (v.role === 'advisor' && door.length) { v.order = { kind: 'door', by, t: 1e9, spot: door[0], walkT: 0 }; continue; }
            if (!exits.length) { v.order = null; continue; }
            // the exit with the fewest people sent to it so far, near him first
            let bi = 0, bs = Infinity;
            exits.forEach((e, i) => { const sc = load[i] * 6 + Math.hypot(e.x - v.x, e.z - v.z); if (sc < bs) { bs = sc; bi = i; } });
            const k = load[bi]++, e = exits[bi];
            const ring = k === 0 ? [0, 0] : [Math.cos((k - 1) * 1.047) * 2.7 * (1 + Math.floor((k - 1) / 6)), Math.sin((k - 1) * 1.047) * 2.7 * (1 + Math.floor((k - 1) / 6))];
            v.order = { kind: 'leave', by, t: alone ? 60 : 600, dest: { x: e.x + ring[0], z: e.z + ring[1], node: e.node }, walkT: 0, direct: false };
            if (!alone && named++ < 2 && Math.random() < 0.6) life._say(v, ['Слушаюсь, Ваше Величество.', 'Как прикажете.', 'Удаляюсь.', 'Да, государь.'][Math.floor(Math.random() * 4)], 2.5);
        }
    }

    /** Places outside the throne room where the people sent away stand: the keep's door, the barracks, the yard, the gate. */
    _exits(cs) {
        const g = cs.graph, def = cs.def;
        const out = [];
        for (const tag of ['keepDoor', 'barracksDoor', 'yard', 'gateIn', 'well']) {
            for (const id of g.tagged(tag)) {
                const n = g.nodes[id];
                if (n && !inHall(def, n, 2) && !out.some((o) => Math.hypot(o.x - n.x, o.z - n.z) < 5)) out.push({ x: n.x, y: n.y, z: n.z, node: id });
            }
        }
        return out;
    }

    /** A person sent away (or the vizier at the doors) walks on: false → the normal life goes on (danger, a fight). */
    _away(v, o, dt) {
        const life = this.life, def = v.cs.def;
        if (v.fear) return false;
        const dest = o.kind === 'door' ? o.spot : o.dest;
        const d = Math.hypot(dest.x - v.x, dest.z - v.z);
        v.seated = false;
        if (d > 0.9) {
            o.walkT += dt;
            if (!o.direct) {
                if (!v.path) life._goTo(v, o.kind === 'door' ? v.cs.graph.nearest(dest.x, dest.y ?? v.y, dest.z, 8) : dest.node);
                if (life._followPath(v, dt, BRISK)) { v.path = null; o.direct = true; }
            } else life._steer(v, dest.x, dest.z, BRISK, dt, 0.5);
            // (no way through for too long: still inside the hall → by the paths again; outside → stays where he is)
            if (o.walkT > 30) {
                o.walkT = 0; o.direct = false; v.path = null;
                if (o.kind === 'leave' && !inHall(def, v, 0.5)) o.dest = { x: v.x, z: v.z, node: o.dest.node };
            }
            v.mode = v.speed > WALK ? 'run' : v.speed > 0 ? 'walk' : 'idle';
        } else {
            v.speed = 0; v.path = null; v.mode = 'idle'; o.walkT = 0;
            if (o.kind === 'door') v.yaw = dest.yaw;
        }
        life._ground(v);
        return true;
    }

    _release(v) {
        this.life.cmds?.clear(v);
        v.follow = null; v.followFar = false; v.order = null; v.path = null; v.guard = null; v.gOwner = null; v.gFoe = null; v.gSlot = null; v.guardOrder = null;
    }

    /**
     * The army answers an order: not a choir all at once (one voice would cut the other, and the one I spoke to
     * answers already — CastleTalk): two more at most, one after another, 0.35–1 s apart; while a voice still
     * speaks, the others' words are only seen over their heads (CastleTalk.voice).
     */
    _shout(army, lines, skip = null) {
        const few = army.filter((k) => k !== skip && !k.dead).slice(0, 2);
        const used = new Set();
        few.forEach((k, i) => {
            if (i > 0 && Math.random() < 0.4) return;
            const fresh = lines.filter((l) => !used.has(l));
            const line = fresh[Math.floor(Math.random() * fresh.length)] || lines[0];
            used.add(line);
            setTimeout(() => { if (!k.dead && !(k.stunT > 0)) this.life._say(k, line, 2.5); }, 350 + i * 450 + Math.random() * 200);
        });
    }

    /** Places to defend: the gate, the wall walk, the posts. */
    _posts(cs) {
        const g = cs.graph;
        const ids = g.tagged('gateIn').concat(g.tagged('gateOut'));
        const wall = cs.def.wallWalk || [];
        for (let i = 0; i < wall.length; i += Math.max(1, Math.floor(wall.length / 8))) ids.push(wall[i]);
        const out = ids.map((id) => g.nodes[id]).filter(Boolean).map((n) => ({ x: n.x, y: n.y, z: n.z, node: n.id }));
        for (const p of cs.def.posts || []) out.push({ x: p.x, y: p.y, z: p.z, node: g.nearest(p.x, p.y, p.z) });
        return out;
    }

    // -------------------------------------------------------- creatures
    /** Living creatures of a kind (zombies, the spider, animals; 'enemies' = all of them). */
    creatures(what) {
        const g = this.game;
        const out = [];
        if (what === 'zombies' || what === 'enemies') for (const z of g.zombies || []) if (!z.isDead && !z.isDying) out.push({ kind: 'z', obj: z });
        if (what === 'spider' || what === 'enemies') for (const s of g.spiders?.targets?.() || []) out.push({ kind: 's', obj: s });
        if (what === 'dragon' || what === 'enemies') for (const d of g.dragons?.targets?.() || []) out.push({ kind: 'D', obj: d });
        if (what === 'animals') for (const a of g.animals?.targets?.() || []) out.push({ kind: 'a', obj: a });
        if (what === 'sailors') for (const v of g.ships?.crew?.byId?.values?.() || []) if (!v.dead && !v.overboard && !g.ships.loyalTo(v.ship, g.localId)) out.push({ kind: 'S', obj: v }); // (the ships' crews: not the hero's own)
        return out;
    }

    _nearest(what, x, z, R) {
        let best = null, bd = R;
        for (const c of this.creatures(what)) {
            const p = posOf(c.obj);
            if (!p) continue;
            const d = Math.hypot(p.x - x, p.z - z);
            if (d < bd) { bd = d; best = c; }
        }
        return best;
    }

    _alive(c) {
        if (!c) return false;
        const o = c.obj;
        return !(o.isDead || o.isDying || o.dead);
    }

    // -------------------------------------------------------- each frame (host)
    /**
     * A villager with an order: moves / fights. Returns true when it handled the frame.
     * (Called from CastleLife._think after the castle's own fights.)
     */
    step(v, dt) {
        const o = v.order;
        if (!o) return false;
        o.t -= dt;
        if (o.t <= 0) { this._release(v); return false; }
        const life = this.life;
        v.seated = false;
        if (o.kind === 'leave' || o.kind === 'door') return this._away(v, o, dt);
        if (o.kind === 'hunt') {
            const kp = life._playerPos(o.by);
            const cx = kp ? kp.x : v.x, cz = kp ? kp.z : v.z;
            if (!this._alive(o.prey) || (o.retargetT = (o.retargetT || 0) - dt) <= 0) {
                o.retargetT = 1;
                o.prey = this._nearest(o.what, v.x, v.z, HUNT) || this._nearest(o.what, cx, cz, HUNT);
            }
            if (!o.prey) {
                // nobody to fight: they stay by the king
                const hs = kp && life._hallSlot?.(v, kp); // (the king on his throne: each on his own free place before the dais)
                if (hs) { const dh = life._steer(v, hs.x, hs.z, dh0(hs, v) > 8 ? RUN : WALK, dt, 0.5); v.mode = dh > 0.7 ? (v.speed > WALK ? 'run' : 'walk') : 'block'; }
                else if (kp) {
                    const d = life._steer(v, kp.x, kp.z, Math.hypot(kp.x - v.x, kp.z - v.z) > 8 ? RUN : WALK, dt, 4);
                    v.mode = d > 4.2 ? (v.speed > WALK ? 'run' : 'walk') : 'block';
                } else { v.speed = 0; v.mode = 'block'; }
                o.idleT = (o.idleT || 0) + dt;
                if (o.idleT > 25) { this._release(v); if (kp) { v.follow = o.by; v.followT = 600; v.followFar = true; } }
                life._ground(v);
                return true;
            }
            o.idleT = 0;
            this._fightCreature(v, o.prey, dt);
            return true;
        }
        if (o.kind === 'defend') {
            const def = v.cs.def;
            // a creature at the walls: strike it
            if (!this._alive(o.prey) || (o.retargetT = (o.retargetT || 0) - dt) <= 0) {
                o.retargetT = 1;
                const c = this._nearest('enemies', v.x, v.z, 18);
                const p = c && posOf(c.obj);
                o.prey = p && life._inLand(def, p, DEFEND) ? c : null;
            }
            if (o.prey) { this._fightCreature(v, o.prey, dt); return true; }
            const p = o.post;
            if (!p) { v.mode = 'block'; v.speed = 0; return true; }
            const d = Math.hypot(p.x - v.x, p.z - v.z);
            if (d > 1.5) {
                if (!v.path) life._goTo(v, p.node);
                if (life._followPath(v, dt, RUN)) { v.path = null; life._steer(v, p.x, p.z, WALK, dt); }
                v.mode = v.speed > WALK ? 'run' : 'walk';
            } else {
                v.speed = 0; v.path = null;
                v.mode = 'block'; // (on guard, the shield up)
                const k = life._playerPos(o.by);
                v.yaw = Math.atan2(-(v.x - def.x), -(v.z - def.z)) + Math.PI; // (facing out of the castle)
                if (k && Math.hypot(k.x - v.x, k.z - v.z) < 4) v.yaw = Math.atan2(-(k.x - v.x), -(k.z - v.z));
            }
            life._ground(v);
            return true;
        }
        return false;
    }

    /** Up to the creature and strike with the sword (the blow lands when the swing does). */
    _fightCreature(v, c, dt) {
        const life = this.life;
        const p = posOf(c.obj);
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        const reach = c.kind === 's' ? REACH + 2.5 : REACH;
        if (d > reach) {
            // inside the castle along the paths; outside straight on
            if (d > 10 && life._inLand(v.cs.def, { x: v.x, z: v.z }, 0) && !life._sees(v, { x: p.x, y: p.y + 1, z: p.z })) {
                v.chaseT = (v.chaseT || 0) - dt;
                if (v.chaseT <= 0 || !v.path) { v.chaseT = 1.5; life._goTo(v, v.cs.graph.nearest(p.x, p.y, p.z, 8)); }
                life._followPath(v, dt, RUN);
            } else life._steer(v, p.x, p.z, RUN, dt, reach - 0.4);
            v.mode = v.speed > 0 ? 'run' : 'attack';
        } else {
            life._steer(v, p.x, p.z, 0, dt, 9);
            v.speed = 0;
            v.mode = 'attack';
            v.swearT = (v.swearT ?? 3) - dt;
            if (v.swearT <= 0) { v.swearT = 8 + Math.random() * 8; if (Math.random() < 0.4) life._say(v, ['Получай, нечисть!', 'Сгинь!', 'За короля!', 'Руби!'][Math.floor(Math.random() * 4)], 2); }
        }
        life._ground(v);
    }

    /** (host) the sword swing of a knight with an order reached: the creature takes the blow. */
    strike(v) {
        const o = v.order?.prey ? v.order : v.guardOrder; // (a bodyguard's blow: Bodyguard.js)
        const c = o?.prey;
        if (!c || !this._alive(c)) return;
        const p = posOf(c.obj);
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        if (d > (c.kind === 's' ? REACH + 3 : REACH + 0.8)) return;
        if (!facesTarget(v.yaw, v.x, v.z, p.x, p.z, FACE.MELEE)) return; // («лицом к цели»: not from the side / behind)
        const g = this.game;
        const dmg = v.role === 'king' ? 5 : 3;
        const dir = { x: (p.x - v.x) / (d || 1), y: 0, z: (p.z - v.z) / (d || 1) };
        if (c.kind === 'z') {
            const THREE_dir = p.clone ? p.clone().set(dir.x, 0, dir.z) : null;
            g.damageZombie?.(c.obj, dmg, true, THREE_dir, o.by);
        } else if (c.kind === 'a') g.animals?.hit?.(c.obj, dmg, p.clone ? p.clone().set(dir.x, 0, dir.z) : null, o.by);
        else if (c.kind === 's') g.spiders?.hit?.(c.obj, dmg * 2, 'melee');
        else if (c.kind === 'D') g.dragons?.hit?.(c.obj, dmg * 2, 'melee', o.by);
        else if (c.kind === 'I') g.iceCastle?.hit?.(c.obj, dmg, 'servant', o.by);
        else if (c.kind === 'S') g.ships?.crew?.hit?.(c.obj, dmg, { x: dir.x, y: 0, z: dir.z }, null, { weapon: true, kind: 'knight' });
        // (a knight / a wizard who went at the king: a guard's blow is nobody's «crime» — not the king's: `by` stays empty)
        else if (c.kind === 'v') g.castleLife?.hit?.(c.obj, dmg, dir, null, { via: 'guard' });
    }
}
