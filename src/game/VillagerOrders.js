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

const WALK = 2.3, RUN = 5.6;
const HUNT = 45; // m round the king (or the knight) a hunted creature is looked for
const DEFEND = 30; // m beyond the castle land the defenders strike
const REACH = 2.6;
const MAX_ARMY = 14; // knights out at once by an order (a big army costs frames)

const posOf = (o) => o?.group?.position || o?.position || null;

export class VillagerOrders {
    constructor(life) {
        this.life = life;
    }

    get game() { return this.life.game; }

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
                const king = this.life.state(cs.def.id).owner === by;
                v.follow = by; v.followT = king ? 600 : 90; v.followFar = king; v.path = null;
                v.order = null;
                break;
            }
            case 'stay': case 'stop_follow':
                if (args.all && this.life.state(cs.def.id).owner === by) { for (const k of this._army(cs)) this._release(k); }
                this._release(v);
                break;
            case 'gather_army': {
                const army = this._muster(cs, by);
                for (const k of army) { k.follow = by; k.followT = 600; k.followFar = true; k.order = null; k.path = null; k.foe = null; k.investigate = null; }
                this._shout(army, ['За короля!', 'Строимся!', 'Идём, Ваше Величество!', 'К бою готовы!']);
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
                    const what = ['zombies', 'spider', 'animals', 'enemies'].includes(args.target) ? args.target : 'enemies';
                    for (const k of army) { k.order = { kind: 'hunt', what, by, t: 180 }; k.follow = null; k.path = null; k.investigate = null; }
                }
                this._shout(army, ['В атаку!', 'Бей их!', 'За короля!', 'Вперёд!']);
                break;
            }
            case 'defend_castle': {
                const army = this._muster(cs, by);
                const posts = this._posts(cs);
                army.forEach((k, i) => { k.order = { kind: 'defend', by, t: 900, post: posts.length ? posts[i % posts.length] : null }; k.follow = null; k.path = null; });
                this._shout(army, ['Все на стены!', 'Держать ворота!', 'Защищать замок!']);
                break;
            }
            case 'bow': v.bowing = 1.6; break;
            case 'flee': v.fleeFrom = by; v.fleeT = 10; v.fleeing = false; v.path = null; break;
            case 'go_to': this._guide(v, { market: 'market', throne: 'throneFront', gate: 'gateOut', walls: 'wall', barracks: 'barracksDoor', home: 'home' }[args.place]); break;
            default:
                if (name.startsWith('guide:')) this._guide(v, { 'guide:market': 'market', 'guide:throne': 'throneFront', 'guide:gate': 'gateOut' }[name]);
                break;
        }
        if (me && !v.foe && name !== 'flee' && v.job !== 'king') v.yaw = Math.atan2(-(me.x - v.x), -(me.z - v.z));
    }

    /** (host) May `by` give this order? (a guest's order is checked again here) */
    permitted(v, name, args = {}, by) {
        const king = this.life.state(v.cs.def.id).owner === by && by != null;
        if (ARMY.has(name)) {
            if (king) return true;
            return name === 'attack' && v.role === 'knight' && !args.playerId && (args.target === 'zombies' || args.target === 'spider');
        }
        if ((name === 'follow_me' || name === 'follow') && v.role === 'king') return false;
        // (a plain «иди за мной» to a busy villager: only wanderers leave their work, unless the king asks)
        if ((name === 'follow_me' || name === 'follow') && !king && v.job !== 'wander') return false;
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

    _release(v) {
        v.follow = null; v.followFar = false; v.order = null; v.path = null;
    }

    _shout(army, lines) {
        const few = army.slice(0, 3);
        few.forEach((k, i) => { if (i === 0 || Math.random() < 0.5) this.life._say(k, lines[Math.floor(Math.random() * lines.length)], 2.5); });
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
        if (o.kind === 'hunt') {
            const kp = life._playerPos(o.by);
            const cx = kp ? kp.x : v.x, cz = kp ? kp.z : v.z;
            if (!this._alive(o.prey) || (o.retargetT = (o.retargetT || 0) - dt) <= 0) {
                o.retargetT = 1;
                o.prey = this._nearest(o.what, v.x, v.z, HUNT) || this._nearest(o.what, cx, cz, HUNT);
            }
            if (!o.prey) {
                // nobody to fight: they stay by the king
                if (kp) {
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
        const o = v.order;
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
    }
}
