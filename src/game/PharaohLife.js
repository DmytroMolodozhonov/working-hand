/**
 * PharaohLife.js — the pyramids alive (the rules: PharaohRules.js; the buildings: src/world/Pyramids.js; the models: PharaohModels.js).
 *
 *  - PHARAOH SANDY sleeps in the great golden sarcophagus in the burial chamber. He rises when a hero comes to the sarcophagus (the tomb's curse), when
 *    his chests are touched, when his mummies are fought near him, when he is hit. He talks no tongue of ours — only strange syllables. He fights with
 *    his staff (−12), the SAND WAVE (a ring rushing along the floor from his feet: −8 and a push), a SWARM OF LOCUSTS (each bites at most once in 1.8 s)
 *    and the TOMB'S CURSE (−1 HP/s for 8 s on one foe). Dark magic hurts him half, «Nihilis Atra» twice. His death: +150 mana cells, his three chests open.
 *  - THE SLEEPING MUMMIES lie in plain sarcophagi along the walls of the great pyramid's rooms; when a hero comes near, the lid slides aside, the
 *    mummy rises — in sight — and steps out to fight; a blast or a fight near wakes the sleepers of the room.
 *  - THE SKELETON-MUMMIES of the middle pyramid's maze stand at its junctions (the black ship's skeletons, wrapped in bandages): they go for a foe, strike
 *    facing him, go back to their post. Zombies wander the dead ends (they are the world's own zombies).
 *  - THE TRAPS: a plate of another colour in the small pyramid's corridor — step on it and a volley of darts flies across (−4); the sand patch in the Hall of
 *    Sand — stood on for a moment it gives way in a wave and you fall 7 blocks into a pit of sand (a stair leads out).
 *  - THE TORCHES are put out (blocks): «Fire» pointed at one, or «Inferno» swept along them, lights it (an edit: saved, the same for everybody); a lit torch
 *    lights the room (FireLights).
 *  - THE JEWELS: gold ornaments on stands (set out once): small ones go to the backpack and sell for good money, big ones are carried in the hands.
 * The host (or a single player) runs every mind; the guests see them by `pyr` messages and send their blows to the host. Saved: who is dead, the traps' state.
 */
import * as THREE from 'three';
import { VillagerModel } from '../entities/VillagerModel.js';
import { Chest } from '../entities/Chest.js';
import { registerKind } from './CreatureImpact.js';
import { PHARAOH, MUMMY, GUARD, TRAPS, LINES, pharaohDamage, BOLT_DMG, fightMove, locustMayBite, onSandTrap } from './PharaohRules.js';
import { sarcophagusModel, pharaohLook, mummyLook, guardLook, dressPharaoh, locustGeometry, locustMaterial, dartGeometry, dartMaterial, waveRing, pharaohSamples } from './PharaohModels.js';
import { PYR, PB, pyrUV, pyrLocal } from '../world/Pyramids.js';
import { GOD_SPELLS } from './Mana.js';
import { pirateBoneDamage } from './Sailors.js';
import { FACE, facesTarget, turnToward, yawTo } from './FaceTarget.js';
import { newUid } from './ItemTypes.js';

const ACTIVE_R = 300, GONE_R = 420; // m from the great pyramid's middle: the pyramids' life is made / put away
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const r2 = (x) => Math.round(x * 100) / 100;
const feet = (p, out) => out.set(p.x, p.y - 1.95, p.z);

export class PharaohLife {
    constructor(game) {
        this.game = game;
        this.state = { pharaohDead: false, mummiesDead: [], guardsDead: [], seen: false, zombies: false, jewels: false, sandDone: false, woken: [] };
        this.on = false;
        this.pharaoh = null; // {kind: 'pharaoh', model, pos, yaw, hp, mode, …}
        this.mummies = []; // the sleepers: {kind: 'mummy', i, sarc, lid, model, home, mode: 'sleep'|'rising'|'awake', riseT…}
        this.guards = []; // the maze's skeleton-mummies
        this.list = []; // (CreatureImpact)
        this._chests = [];
        this._lit = []; this._litT = 0;
        this._locusts = []; this._locustMesh = null;
        this._fx = []; // darts, waves: {mesh, t, …}
        this._netT = 0; this._sayT = 0;
        this._alarm = 0;
        this._plateCool = new Map();
        this._sandOn = 0; this._sandWave = null;
        this.mapMark = null;
    }

    get auth() { return !this.game.sync || !!this.game.authority; }
    get plan() { const t = this.game.terrain?.data || this.game.world?.terrain?.data; return t?.pyr?.plan || null; }
    _data() { return this.game.terrain?.data || this.game.world?.terrain?.data; }
    /** The middle of the great pyramid (world). */
    _centre(P) { return pyrLocal(P, PYR.BIG.u, PYR.BIG.v); }

    // ------------------------------------------------------------------ life near the pyramids
    update(dt) {
        const g = this.game, P = this.plan;
        if (!P || !(dt > 0)) return;
        dt = Math.min(dt, 0.1);
        const me = g.character?.group?.position;
        if (!me) return;
        const c0 = this._centre(P), d = Math.hypot(me.x - c0.x, me.z - c0.z);
        if (!this.on && d < ACTIVE_R && (this._data()?.landMade?.(Math.round(c0.x), Math.round(c0.z)) ?? true)) this._build(P);
        else if (this.on && d > GONE_R && !this._fightNear()) this._drop();
        if (!this.state.seen && d < 220) {
            this.state.seen = true;
            g.hud?.setVoice?.('🔺 Над песками — три огромные пирамиды. В самой большой, говорят, спит фараон', true);
        }
        this.mapMark = this.state.seen ? { x: c0.x, z: c0.z, name: 'Пирамиды Фараона Песчаного', icon: '🔺' } : null;
        if (!this.on) return;
        this._torches(dt, me);
        if (this.auth) { this._think(dt); this._netSend(dt); } else this._follow(dt);
        this._draw(dt);
    }

    _fightNear() { const c = this.pharaoh; return !!c && !c.dead && c.mode === 'fight'; }

    _build(P) {
        const g = this.game, S = this.state;
        this.on = true;
        const ry = P.yaw;
        // ---- the great golden sarcophagus and the pharaoh in it
        const gs = this.goldSarc = sarcophagusModel(true);
        // (the game's world: layer L's top surface is at y = L − 0.5, and the plan's «y» is layer + 0.5 — so a surface is the plan's y − 1; the dais' top is layer F+3)
        gs.position.set(P.pharaoh.x, P.pharaoh.y - 2.0, P.pharaoh.z);
        gs.rotation.y = ry; // (lying along the burial chamber's v axis, the head to the back)
        g.scene.add(gs);
        this.goldBox = g.collision?.addBox?.(new THREE.Box3().setFromObject(gs));
        const model = new VillagerModel(pharaohLook(), { castleColor: 0xc89a2a });
        model.group.scale.setScalar(1.1);
        this._finery = dressPharaoh(model);
        g.scene.add(model.group);
        const ph = this.pharaoh = {
            kind: 'pharaoh', id: 'pp', isPharaoh: true, model, pos: model.group.position, yaw: ry, hp: PHARAOH.HP, dead: S.pharaohDead, mode: S.pharaohDead ? 'gone' : 'sleep',
            foe: null, cool: 0, waveCool: 4, locustCool: 8, curseCool: 12, t: 0, r: 0.7, h: 3.9, speed: 0, anim: 'idle', sayT: 6, riseT: 0, windup: 0, curse: null, lonely: 0,
            get isDead() { return this.dead || this.mode === 'sleep' || this.mode === 'gone'; }, get group() { return this.model.group; }, get position() { return this.model.group.position; },
            bodyCapsule: (out) => pharaohBody(ph, out),
        };
        model.group.position.set(P.pharaoh.x, P.pharaoh.y - 2.0, P.pharaoh.z);
        model.group.visible = false;
        if (S.pharaohDead) { gs.userData.lid.position.x = 1.4; gs.userData.lid.rotation.z = -0.3; }
        // ---- the sleepers: a plain sarcophagus each, a mummy in it
        const dead = new Set(S.mummiesDead), woken = new Set(S.woken);
        this.mummies = P.sleepers.map((sl, i) => {
            const sarc = sarcophagusModel(false);
            sarc.position.set(sl.x, sl.y - 1.0, sl.z);
            sarc.rotation.y = P.yaw + (sl.yawL || 0) + Math.PI / 2;
            g.scene.add(sarc);
            const mm = new VillagerModel(mummyLook(i), { castleColor: 0xcfc19a });
            mm.group.position.set(sl.x, sl.y - 1.0 - 1.7, sl.z);
            mm.group.visible = false;
            g.scene.add(mm.group);
            const c = { kind: 'mummy', i, id: 'pm' + i, isPharaohKin: true, sarc, lid: sarc.userData.lid, model: mm, home: sl, room: sl.room, hp: MUMMY.HP, dead: dead.has(i), mode: 'sleep', riseT: 0, foe: null, cool: 0, yaw: sarc.rotation.y, r: 0.55, h: 3.4, speed: 0, anim: 'idle',
                get isDead() { return this.dead || this.mode === 'sleep' || this.mode === 'rising'; }, get group() { return this.model.group; }, get position() { return this.model.group.position; },
                bodyCapsule: (out) => pharaohBody(c, out) };
            if (c.dead || woken.has(i)) { c.mode = 'awake'; c.lid.position.x = 1.3; c.lid.rotation.z = -0.28; if (c.dead) mm.group.visible = false; else { mm.group.visible = true; mm.group.position.set(sl.x + 2.2, sl.y - 1.0, sl.z); } } else c.box = g.collision?.addBox?.(new THREE.Box3().setFromObject(sarc));
            return c;
        });
        // ---- the maze's skeleton-mummies
        const gdead = new Set(S.guardsDead);
        this.guards = P.posts.map((post, i) => {
            const mm = new VillagerModel(guardLook(i), { castleColor: 0xb8a878 });
            mm.group.position.set(post.x, post.y, post.z);
            mm.group.rotation.y = P.yaw;
            g.scene.add(mm.group);
            const c = { kind: 'guard', i, id: 'pg' + i, isPharaohKin: true, model: mm, post, hp: GUARD.HP, dead: gdead.has(i), mode: 'idle', foe: null, cool: 0, yaw: P.yaw, r: 0.55, h: 3.4, speed: 0, anim: 'idle',
                get isDead() { return this.dead; }, get group() { return this.model.group; }, get position() { return this.model.group.position; }, bodyCapsule: (out) => pharaohBody(c, out) };
            if (c.dead) mm.group.visible = false;
            return c;
        });
        this.list = [this.pharaoh, ...this.mummies, ...this.guards];
        // ---- the chests: the pyramid's, and the pharaoh's three (locked while he lives: the tomb's curse wakes him)
        this._chests = (P.chests || []).map((c) => {
            const chest = new Chest(g.scene, new THREE.Vector3(c.x, c.y - 0.5, c.z), 'loot', ry + Math.PI, 'py' + c.id, { style: 'rich' });
            chest.room = c.boss ? 'pharaoh' : 'pyramid';
            chest.pyrRoom = c.room;
            chest.locked = !!c.boss && !S.pharaohDead;
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision?.addBox(chest.getCollisionBox());
            if (g._openedChests?.has(chest.id)) chest.setOpenInstant();
            g.chests?.push(chest);
            return chest;
        });
        // ---- the jewels (once) and the zombies (once per visit of the host)
        if (this.auth && !S.jewels) { S.jewels = true; this._setJewels(P); }
        if (this.auth && !S.zombies) { S.zombies = true; for (const z of P.zombieSpots || []) g._createZombie?.(new THREE.Vector3(z.x, z.y + 0.5, z.z)); }
        // ---- the locusts: one InstancedMesh (hidden until a swarm)
        this._locustMesh = new THREE.InstancedMesh(locustGeometry(), locustMaterial(), PHARAOH.LOCUSTS.N);
        this._locustMesh.frustumCulled = false; this._locustMesh.count = 0;
        g.scene.add(this._locustMesh);
    }

    _drop() {
        const g = this.game;
        this.on = false;
        const rm = (m) => { if (!m) return; g.scene.remove(m.group); m.dispose?.(); };
        if (this.pharaoh) { rm(this.pharaoh.model); this.pharaoh = null; }
        for (const c of this.mummies) { g.scene.remove(c.sarc); rm(c.model); if (c.box != null) g.collision?.removeBox?.(c.box); }
        for (const c of this.guards) rm(c.model);
        this.mummies = []; this.guards = []; this.list = [];
        if (this.goldSarc) { g.scene.remove(this.goldSarc); this.goldSarc = null; if (this.goldBox != null) g.collision?.removeBox?.(this.goldBox); }
        for (const ch of this._chests) { const k = g.chests?.indexOf(ch); if (k >= 0) g.chests.splice(k, 1); if (ch.boxId != null) g.collision?.removeBox?.(ch.boxId); ch.dispose?.(); g.scene.remove(ch.mesh); }
        this._chests = [];
        if (this._locustMesh) { g.scene.remove(this._locustMesh); this._locustMesh = null; }
        this._locusts = [];
        for (const f of this._fx) g.scene.remove(f.mesh);
        this._fx = [];
    }

    // ------------------------------------------------------------------ the jewels
    _setJewels(P) {
        const g = this.game;
        const KINDS = ['goldScarab', 'goldAnkh', 'goldBracelet', 'goldNecklace'];
        let k = 0;
        for (const j of P.jewels || []) {
            const kind = j.big ? (k % 2 ? 'goldIdol' : 'goldMask') : KINDS[k % KINDS.length];
            g.items?.spawnLoose?.({ kind, uid: newUid(), count: 1 }, new THREE.Vector3(j.x, j.y + 0.3, j.z), { rise: false });
            k++;
        }
    }

    // ------------------------------------------------------------------ who is near
    _players() {
        const g = this.game, out = this._pl || (this._pl = []);
        out.length = 0;
        const ph = this.pharaoh, info = ph && !ph.dead && ph.mode !== 'sleep' ? { key: 'pharaoh', x: ph.pos.x, z: ph.pos.z, say: () => {} } : null;
        const seen = (id, p) => (g.invis ? g.invis.aiPos(id, p, info) : p);
        if (!g.isDeadLocal && !g.combat?.dead) { const p = seen(g.localId, g.character.group.position); if (p) out.push({ id: g.localId, p: feet(p, new THREE.Vector3()), raw: g.character.group.position, fly: !!(g.flight?.active || g.wingFlight?.active) }); }
        for (const [id, r] of g.remotes || []) { if (r.dead) continue; const p = seen(id, r.position); if (p) out.push({ id, p: feet(p, new THREE.Vector3()), raw: r.position, fly: false }); }
        return out;
    }

    _hurtPlayer(id, dmg, kind, from) {
        const g = this.game;
        if (id === g.localId) {
            if (g.wards?.shields?.(g.character.group.position, from)) return;
            g.combat?.damage?.(dmg, 'pharaoh', kind);
            g.fx?.blood?.(g.character.group.position.clone(), 5);
        } else g.sync?.pyr?.({ e: 'hurt', to: id, dmg, kind });
    }

    _say(t) {
        const g = this.game, c = this.pharaoh;
        if (!t || !c) return;
        g.hud?.setVoice?.(`🔺 Фараон: «${t}»`, true);
        g.sound?.playPharaoh?.(c.pos, 'chant');
        if (g.sync && this.auth) g.sync.pyr?.({ e: 'say', t });
    }

    _ground(x, z, y) { const col = this.game.collision; return col?.groundAt ? col.groundAt(x, z, y + 2) : col?.groundY ? col.groundY(x, z) : y; }
    _step(c, dx, dz) {
        const p = c.model.group.position, col = this.game.collision;
        p.x += dx; p.z += dz;
        col?.resolveCylinder?.(p, c.r, p.y, c.h, 1.05);
        const gy = this._ground(p.x, p.z, p.y);
        if (gy < p.y + 1.2) p.y += (gy - p.y) * 0.5;
    }
    _nearest(players, from, max = 1e9) {
        let best = null, bd = max;
        for (const q of players) { const d = from.distanceTo(q.p); if (d < bd) { bd = d; best = q; } }
        return best ? { q: best, d: bd } : null;
    }

    // ------------------------------------------------------------------ the minds (host)
    _think(dt) {
        const P = this.plan, players = this._players();
        this._thinkSleepers(dt, P, players);
        this._thinkPharaoh(dt, P, players);
        for (const c of this.guards) if (!c.dead) this._thinkGuard(c, dt, players, GUARD);
        this._thinkLocusts(dt, players);
        this._traps(dt, P, players);
        if (this._alarm > 0) { this._alarm -= dt; if (this._alarm <= 0 && this.pharaoh?.mode === 'sleep') this.wakePharaoh('attack'); }
    }

    /** Something plainly attacked the pyramids at `pos` (a blast, a killed mummy): the sleepers near it wake, the pharaoh stirs. */
    attacked(pos, by = null) {
        const P = this.plan;
        if (!P || !pos) return;
        const c0 = this._centre(P);
        if (Math.hypot(pos.x - c0.x, pos.z - c0.z) > PYR.BIG.half + 60) return;
        if (!this.auth) { this.game.sync?.pyr?.({ e: 'att', p: [r2(pos.x), r2(pos.y), r2(pos.z)], by }); return; }
        for (const c of this.mummies) if (c.mode === 'sleep' && c.home && Math.hypot(c.home.x - pos.x, c.home.z - pos.z) < MUMMY.NOISE_R) this._wakeMummy(c, by);
        if (this.pharaoh?.mode === 'sleep' && this.pharaoh.pos && Math.hypot(this.pharaoh.pos.x - pos.x, this.pharaoh.pos.z - pos.z) < 40 && !(this._alarm > 0)) this._alarm = PHARAOH.WAKE_DELAY;
    }

    // ---- the sleepers
    _wakeMummy(c, foe = null) {
        if (c.mode !== 'sleep') return;
        c.mode = 'rising'; c.riseT = 0; c.foe = foe;
        this.state.woken.push(c.i);
        this.game.sound?.playPharaoh?.(c.home, 'lid');
        if (this.game.sync && this.auth) this.game.sync.pyr?.({ e: 'wake', i: c.i });
    }
    _thinkSleepers(dt, P, players) {
        const g = this.game;
        for (const c of this.mummies) {
            if (c.dead) continue;
            if (c.mode === 'sleep') {
                for (const q of players) if (Math.hypot(q.p.x - c.home.x, q.p.z - c.home.z) < MUMMY.WAKE_R && Math.abs(q.p.y - c.home.y) < 5) { this._wakeMummy(c, q.id); break; }
                continue;
            }
            if (c.mode === 'rising') { c.riseT += dt; if (c.riseT >= MUMMY.RISE_T) { c.mode = 'awake'; if (c.box != null) { g.collision?.removeBox?.(c.box); c.box = null; } } continue; }
            this._thinkGuard(c, dt, players, { ...MUMMY, HOME: c.home });
        }
    }

    /** A guard / an awake mummy: goes for a foe in SEE, strikes facing him, goes back to the post (the black ship's skeletons' logic). */
    _thinkGuard(c, dt, players, R) {
        const p = c.model.group.position;
        c.cool -= dt;
        const home = c.post || c.home;
        let tgt = c.foe != null ? players.find((q) => q.id === c.foe) : null;
        if (!tgt) { const n = this._nearest(players, p, R.SEE); if (n) { tgt = n.q; c.foe = tgt.id; } }
        const fromHome = Math.hypot(p.x - home.x, p.z - home.z);
        if (tgt && Math.hypot(tgt.p.x - home.x, tgt.p.z - home.z) > R.LEASH) { tgt = null; c.foe = null; }
        if (!tgt) {
            if (fromHome > 1.2) { const dx = home.x - p.x, dz = home.z - p.z, d = Math.hypot(dx, dz); c.yaw = turnToward(c.yaw, yawTo(p.x, p.z, home.x, home.z), 4 * dt); this._step(c, dx / d * R.WALK * dt, dz / d * R.WALK * dt); c.anim = 'walk'; c.speed = R.WALK; }
            else { c.anim = 'idle'; c.speed = 0; }
            return;
        }
        const dx = tgt.p.x - p.x, dz = tgt.p.z - p.z, d = Math.hypot(dx, dz) || 1;
        c.yaw = turnToward(c.yaw, yawTo(p.x, p.z, tgt.p.x, tgt.p.z), 5 * dt);
        if (d > R.REACH) { this._step(c, dx / d * R.RUN * dt, dz / d * R.RUN * dt); c.anim = 'run'; c.speed = R.RUN; return; }
        c.anim = 'attack'; c.speed = 0;
        if (c.cool <= 0 && facesTarget(c.yaw, p.x, p.z, tgt.p.x, tgt.p.z, FACE.MELEE)) { c.cool = R.COOL; this._hurtPlayer(tgt.id, R.DMG, 'blade', p); this.game.sound?.playHit?.(); }
    }

    // ---- the pharaoh
    wakePharaoh(why, foe = null) {
        const c = this.pharaoh, P = this.plan, g = this.game;
        if (!c || c.dead || c.mode !== 'sleep') return;
        if (!this.auth) { g.sync?.pyr?.({ e: 'wakeph', why, by: foe }); return; }
        c.mode = 'rising'; c.riseT = 0; c.foe = foe; c.model.group.visible = true;
        c.pos.set(P.pharaoh.x, P.pharaoh.y - 2.0 - 1.2, P.pharaoh.z);
        g.sound?.playPharaoh?.(c.pos, 'lid');
        this._say(pick(LINES.wake));
        if (g.sync) g.sync.pyr?.({ e: 'wakeph' });
    }
    _thinkPharaoh(dt, P, players) {
        const c = this.pharaoh, g = this.game;
        if (!c || c.dead) return;
        c.t += dt;
        if (c.mode === 'sleep') {
            for (const q of players) if (Math.hypot(q.p.x - P.pharaoh.x, q.p.z - P.pharaoh.z) < PHARAOH.WAKE_R && Math.abs(q.p.y - P.pharaoh.y) < 5) { this.wakePharaoh('guest', q.id); break; }
            return;
        }
        if (c.mode === 'rising') {
            c.riseT += dt;
            const k = Math.min(1, c.riseT / PHARAOH.RISE_T);
            c.pos.y = P.pharaoh.y - 2.0 - 1.2 + Math.min(1, k * 1.6) * 2.7; // the lid slides, he sits up and stands on the sarcophagus' edge (1.5 high)
            if (k >= 1) {
                c.mode = 'fight'; c.pos.x += Math.cos(c.yaw) * 2.8; c.pos.z -= Math.sin(c.yaw) * 2.8;
                if (this.goldBox != null) { g.collision?.removeBox?.(this.goldBox); this.goldBox = null; }
            }
            return;
        }
        const home = P.pharaoh;
        const tgt = (c.foe != null && players.find((q) => q.id === c.foe)) || this._nearest(players, c.pos, PHARAOH.SEE)?.q || null;
        if (!tgt || Math.hypot(tgt.p.x - home.x, tgt.p.z - home.z) > PHARAOH.LEASH) {
            // nobody near: back to his sarcophagus, he lies down
            if ((c.lonely += dt) > 14) { c.mode = 'sleep'; c.model.group.visible = false; c.hp = Math.min(PHARAOH.HP, c.hp + 80); c.foe = null; if (this.goldSarc) { this.goldSarc.userData.lid.position.x = 0; this.goldSarc.userData.lid.rotation.z = 0; } if (this.goldBox == null && this.goldSarc) this.goldBox = g.collision?.addBox?.(new THREE.Box3().setFromObject(this.goldSarc)); c.pos.set(home.x, home.y - 2.0, home.z); }
            c.anim = 'idle'; c.speed = 0;
            return;
        }
        c.lonely = 0;
        const dx = tgt.p.x - c.pos.x, dz = tgt.p.z - c.pos.z, dist = Math.hypot(dx, dz) || 1;
        c.cool -= dt; c.waveCool -= dt; c.locustCool -= dt; c.curseCool -= dt;
        const want = yawTo(c.pos.x, c.pos.z, tgt.p.x, tgt.p.z);
        c.sayT -= dt;
        if (c.sayT <= 0 && c.windup <= 0) { c.sayT = PHARAOH.SAY_EVERY[0] + Math.random() * (PHARAOH.SAY_EVERY[1] - PHARAOH.SAY_EVERY[0]); this._say(pick(LINES.attack)); }
        if (c.windup > 0) {
            // the sand wave's wind-up: he plants the staff and the floor trembles
            c.windup -= dt; c.anim = 'attack'; c.speed = 0; c.yaw = turnToward(c.yaw, want, 2 * dt);
            if (c.windup <= 0) this._sandWaveFire(c, players);
            return;
        }
        const facing = facesTarget(c.yaw, c.pos.x, c.pos.z, tgt.p.x, tgt.p.z, FACE.MELEE);
        const move = fightMove({ dist, cool: c.cool, waveCool: c.waveCool, locustCool: c.locustCool, curseCool: c.curseCool, facing, hpK: c.hp / PHARAOH.HP });
        c.yaw = turnToward(c.yaw, want, 4 * dt);
        if (move === 'staff') {
            c.anim = 'attack'; c.speed = 0; c.cool = PHARAOH.COOL;
            this._hurtPlayer(tgt.id, PHARAOH.STAFF, 'staff', c.pos);
            g.sound?.playPharaoh?.(c.pos, 'staff');
        } else if (move === 'wave') {
            c.waveCool = PHARAOH.SAND_WAVE.COOL; c.windup = PHARAOH.SAND_WAVE.WINDUP; this._say(pick(LINES.sand));
            if (g.sync) g.sync.pyr?.({ e: 'windup' });
        } else if (move === 'locust') {
            c.locustCool = PHARAOH.LOCUSTS.EVERY; this._say(pick(LINES.locust)); this._spawnLocusts(c);
        } else if (move === 'curse') {
            c.curseCool = PHARAOH.CURSE.EVERY; this._curse(c, tgt);
        } else if (dist > PHARAOH.REACH * 0.8) {
            const sp = dist > 14 ? PHARAOH.RUN : PHARAOH.WALK;
            this._step(c, dx / dist * sp * dt, dz / dist * sp * dt); c.anim = sp > PHARAOH.WALK ? 'run' : 'walk'; c.speed = sp;
        } else { c.anim = 'idle'; c.speed = 0; }
        // the tomb's curse ticks
        if (c.curse && c.curse.t > 0) {
            c.curse.t -= dt; c.curse.acc += dt;
            if (c.curse.acc >= 1) { c.curse.acc -= 1; this._hurtPlayer(c.curse.id, PHARAOH.CURSE.DPS, 'curse', c.pos); }
            if (c.curse.t <= 0) c.curse = null;
        }
    }

    _sandWaveFire(c, players) {
        const g = this.game, W = PHARAOH.SAND_WAVE;
        g.sound?.playPharaoh?.(c.pos, 'sand');
        this._ring(c.pos.x, c.pos.y, c.pos.z, W.R);
        if (g.sync) g.sync.pyr?.({ e: 'wave', p: [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z)] });
        for (const q of players) {
            const d = Math.hypot(q.p.x - c.pos.x, q.p.z - c.pos.z);
            if (d < W.R && Math.abs(q.p.y - c.pos.y) < 2.4 && !q.fly) { this._hurtPlayer(q.id, W.DMG, 'sand', c.pos); this._push(q.id, q.p.x - c.pos.x, q.p.z - c.pos.z, W.PUSH); }
        }
    }
    _push(id, dx, dz, speed) {
        const g = this.game, d = Math.hypot(dx, dz) || 1;
        if (id === g.localId) { if (g.knockback) { g.knockback.x += dx / d * speed; g.knockback.z += dz / d * speed; } } else g.sync?.pyr?.({ e: 'push', to: id, x: r2(dx / d * speed), z: r2(dz / d * speed) });
    }
    _curse(c, tgt) {
        c.curse = { id: tgt.id, t: PHARAOH.CURSE.T, acc: 0 };
        this._say(pick(LINES.curse));
        this.game.sound?.playPharaoh?.(c.pos, 'curse');
        this._curseFx(tgt.id);
        if (this.game.sync) this.game.sync.pyr?.({ e: 'curse', to: tgt.id });
    }
    _curseFx(id) {
        const g = this.game;
        if (id !== g.localId) return;
        g.hud?.setVoice?.('💀 Проклятие гробницы: тьма сжимает вас, силы уходят', true);
    }

    // ---- the locusts
    _spawnLocusts(c) {
        const N = PHARAOH.LOCUSTS.N;
        this._locusts = [];
        for (let i = 0; i < N; i++) this._locusts.push({ i, p: new THREE.Vector3(c.pos.x + (Math.random() - 0.5) * 3, c.pos.y + 2 + Math.random() * 2, c.pos.z + (Math.random() - 0.5) * 3), v: new THREE.Vector3(), t: PHARAOH.LOCUSTS.T + Math.random() * 3, last: -1e9, foe: null, ph: Math.random() * 6.28, yaw: 0 });
        this._locustMesh.count = N;
        this.game.sound?.playPharaoh?.(c.pos, 'locust');
        if (this.game.sync) this.game.sync.pyr?.({ e: 'locust' });
    }
    _thinkLocusts(dt, players) {
        const now = performance.now() / 1000;
        for (const L of this._locusts) {
            if (L.t <= 0) continue;
            L.t -= dt;
            const q = this._nearest(players, L.p, 40)?.q;
            if (!q) { L.v.multiplyScalar(0.9); continue; }
            const may = locustMayBite(L.last, now), off = may ? 0 : 1, a = performance.now() / 1000 * 3 + L.i;
            _v.set(q.p.x + Math.cos(a) * (0.8 + off * 4), q.p.y + 2.1 + Math.sin(a * 1.3) * 0.8 + off * 2, q.p.z + Math.sin(a) * (0.8 + off * 4));
            _v2.subVectors(_v, L.p); const d = _v2.length();
            if (d > 1e-3) L.p.addScaledVector(_v2, Math.min(1, PHARAOH.LOCUSTS.SPEED * dt / d));
            if (may && L.p.distanceTo(_v.set(q.p.x, q.p.y + 2.1, q.p.z)) < 0.9) { L.last = now; this._hurtPlayer(q.id, PHARAOH.LOCUSTS.BITE, 'locust', L.p); }
        }
    }

    // ---- the traps
    _traps(dt, P, players) {
        const g = this.game;
        // the plate: a volley of darts
        for (const [i, pl] of (P.plates || []).entries()) {
            const cd = (this._plateCool.get(i) || 0) - dt; this._plateCool.set(i, cd);
            if (cd > 0) continue;
            for (const q of players) if (Math.abs(q.p.x - pl.x) < pl.hw && Math.abs(q.p.z - pl.z) < pl.hw && Math.abs(q.p.y - pl.y) < 1.4) { this._fireDarts(i, P, players); break; }
        }
        // the false floor
        const T = P.sandTrap;
        if (T && !this.state.sandDone) {
            const bx = this._sandBox(P);
            let on = false;
            for (const q of players) if (!q.fly && onSandTrap(bx, q.p.x, q.p.z, q.p.y, T.floorL - 0.5)) { on = true; break; }
            this._sandOn = on ? this._sandOn + dt : Math.max(0, this._sandOn - dt);
            if (this._sandOn >= TRAPS.SAND.HOLD) this._sandFall(P, bx, players.find((q) => onSandTrap(bx, q.p.x, q.p.z, q.p.y, T.floorL - 0.5)));
        }
        if (this._sandWave) this._stepSandWave(dt);
    }
    _sandBox(P) {
        const T = P.sandTrap;
        if (this._sbx) return this._sbx;
        const a = pyrLocal(P, T.u0, T.v0), b = pyrLocal(P, T.u1 + 1, T.v1 + 1);
        return (this._sbx = { minX: Math.min(a.x, b.x) - 0.5, maxX: Math.max(a.x, b.x) - 0.5, minZ: Math.min(a.z, b.z) - 0.5, maxZ: Math.max(a.z, b.z) - 0.5 });
    }
    _fireDarts(i, P, players) {
        const g = this.game, pl = P.plates[i];
        this._plateCool.set(i, TRAPS.DARTS.COOL);
        g.sound?.playPharaoh?.(pl, 'plate');
        g.hud?.setVoice?.('🪤 Плита провалилась под ногой — из стен вылетают дротики!', true);
        this._dartFx(P, pl);
        if (g.sync) g.sync.pyr?.({ e: 'darts', i });
        // the hurt: whoever stands in the corridor's stretch across the plate (the dart's flight takes a third of a second: the hit comes then)
        this._pending = (this._pending || []).concat([{ at: performance.now() + 330, pl }]);
        setTimeout(() => {
            if (!this.on || !this.auth) return;
            for (const q of this._players()) if (Math.abs(q.p.x - pl.x) < TRAPS.DARTS.SPAN && Math.abs(q.p.z - pl.z) < TRAPS.DARTS.SPAN && Math.abs(q.p.y - pl.y) < 3) this._hurtPlayer(q.id, TRAPS.DARTS.DMG, 'dart', pl);
        }, 330);
    }
    _dartFx(P, pl) {
        const g = this.game;
        g.sound?.playPharaoh?.(pl, 'dart');
        for (const s of P.dartSlits || []) {
            if (Math.hypot(s.x - pl.x, s.z - pl.z) > TRAPS.DARTS.SPAN + 2) continue;
            const m = new THREE.Mesh(dartGeometry(), dartMaterial());
            m.position.set(s.x, s.y - 1, s.z);
            const to = _v.set(pl.x * 2 - s.x, s.y - 1, pl.z * 2 - s.z); // across the corridor, to the other wall
            m.lookAt(to);
            m.userData.fly = { from: new THREE.Vector3(s.x, s.y - 1, s.z), to: to.clone(), t: 0 };
            g.scene.add(m); this._fx.push({ mesh: m, t: 0, kind: 'dart' });
        }
    }
    _sandFall(P, bx, who) {
        const g = this.game, T = P.sandTrap;
        this.state.sandDone = true;
        g.sound?.playPharaoh?.(T.c, 'floor');
        g.hud?.setVoice?.('⏳ Песок под ногами ушёл — пол был ложным!', true);
        const cx = who?.p.x ?? T.c.x, cz = who?.p.z ?? T.c.z;
        this._sandWave = { cells: [], t: 0, cx, cz, i: 0 };
        const stair = T.stair;
        for (let u = T.u0; u <= T.u1; u++) for (let v = T.v0; v <= T.v1; v++) {
            if (u >= stair.u0 && u <= stair.u1 && v >= stair.v0 && v <= stair.v1) continue; // (the stair's top stays)
            const w = pyrLocal(P, u, v);
            this._sandWave.cells.push({ x: w.x, z: w.z, d: Math.hypot(w.x - cx, w.z - cz) });
        }
        this._sandWave.cells.sort((a, b) => a.d - b.d);
        if (g.sync) g.sync.pyr?.({ e: 'floor' });
    }
    _stepSandWave(dt) {
        const g = this.game, W = this._sandWave, P = this.plan, T = P.sandTrap;
        W.t += dt;
        const upto = Math.floor(W.t * TRAPS.SAND.WAVE * 12);
        const edits = [];
        while (W.i < W.cells.length && W.i < upto) {
            const c = W.cells[W.i++];
            this._data()?.set(c.x, T.floorL, c.z, 0);
            edits.push([c.x, T.floorL, c.z, 0]);
            if (Math.random() < 0.3) g.fx?.spark?.(_v.set(c.x, T.floorL + 0.6, c.z), 0xe8c880, 0.12, _v2.set((Math.random() - 0.5), Math.random() * 1.5, (Math.random() - 0.5)), 0.7);
        }
        if (edits.length) g.builder?._sendEdits?.(edits);
        if (W.i >= W.cells.length) this._sandWave = null;
    }

    // ---- the torches (every computer: they are blocks)
    /** The put-out torch a ray from `o` along `d` meets (or passes within a block of its end), or null → {x, L, z}. */
    torchAim(o, d, range = 25) {
        const P = this.plan, data = this._data();
        if (!P || !data) return null;
        for (let k = 0.5; k <= range; k += 0.25) {
            const x = Math.round(o.x + d.x * k), y = o.y + d.y * k, z = Math.round(o.z + d.z * k), L = Math.floor(y + 1.5); // (layer L spans y from L − 1.5 to L − 0.5)
            const t = data.get(x, L, z);
            if (t === PB.TORCH_OFF) return { x, L, z };
            if (t !== 0 && t !== 8) {
                // a wall: a put-out torch right by where the ray ended (an aim a little off)
                for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0, 2, 0], [0, -2, 0]]) if (data.get(x + dx, L + dy, z + dz) === PB.TORCH_OFF) return { x: x + dx, L: L + dy, z: z + dz };
                return null;
            }
        }
        return null;
    }
    lightTorch(t, by = null) {
        const g = this.game, data = this._data();
        if (!data || data.get(t.x, t.L, t.z) !== PB.TORCH_OFF) return false;
        data.set(t.x, t.L, t.z, PB.TORCH_ON);
        g.builder?._sendEdits?.([[t.x, t.L, t.z, PB.TORCH_ON]]);
        g.sound?.playPharaoh?.({ x: t.x, y: t.L - 1, z: t.z }, 'torch');
        for (let i = 0; i < 10; i++) g.fx?.spark?.(_v.set(t.x, t.L - 0.3, t.z), i % 2 ? 0xffb347 : 0xff6a00, 0.1, _v2.set((Math.random() - 0.5), Math.random() * 1.5, (Math.random() - 0.5)), 0.6);
        void by;
        return true;
    }
    /** «Inferno» along a beam: every put-out torch the beam touches lights. */
    fireBeam(o, d, len) {
        const data = this._data();
        if (!this.plan || !data) return;
        for (let k = 0.5; k <= len; k += 0.5) {
            const x = Math.round(o.x + d.x * k), L = Math.floor(o.y + d.y * k + 1.5), z = Math.round(o.z + d.z * k);
            for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) if (data.get(x + dx, L + dy, z + dz) === PB.TORCH_OFF) this.lightTorch({ x: x + dx, L: L + dy, z: z + dz });
            if (data.get(x, L, z) !== 0 && data.get(x, L, z) !== 8 && data.get(x, L, z) !== PB.TORCH_OFF) break;
        }
    }
    _torches(dt, me) {
        const g = this.game, P = this.plan, data = this._data();
        if (!P || !data) return;
        this._litT -= dt;
        if (this._litT <= 0) {
            this._litT = 0.5;
            this._lit = [];
            for (const t of P.torches) if (Math.hypot(t.x - me.x, t.z - me.z) < 70 && data.get(t.x, t.y, t.z) === PB.TORCH_ON) this._lit.push(t);
            this._lit.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
        }
        for (let i = 0; i < Math.min(6, this._lit.length); i++) { const t = this._lit[i]; g.fireLights?.want?.(t.x, t.y - 0.8, t.z, 0.9); if (Math.random() < dt * 5) g.fx?.spark?.(_v.set(t.x, t.y - 0.35, t.z), Math.random() < 0.5 ? 0xffb347 : 0xff6a00, 0.09, _v2.set((Math.random() - 0.5) * 0.4, 0.8, (Math.random() - 0.5) * 0.4), 0.5); }
    }

    // ------------------------------------------------------------------ effects
    _ring(x, y, z, R) {
        const g = this.game, m = waveRing();
        m.position.set(x, y + 0.2, z); m.scale.setScalar(0.5);
        g.scene.add(m);
        this._fx.push({ mesh: m, t: 0, kind: 'ring', R, own: true });
        for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28; g.fx?.spark?.(_v.set(x, y - 1.2, z), 0xe8c880, 0.16, _v2.set(Math.cos(a) * 7, 0.6 + Math.random(), Math.sin(a) * 7), 0.8); }
    }
    _stepFx(dt) {
        const g = this.game;
        for (let i = this._fx.length - 1; i >= 0; i--) {
            const f = this._fx[i]; f.t += dt;
            if (f.kind === 'ring') { const k = f.t / 0.9; f.mesh.scale.setScalar(0.5 + k * f.R); f.mesh.material = f.mesh.material; if (k >= 1) { g.scene.remove(f.mesh); this._fx.splice(i, 1); } }
            else if (f.kind === 'dart') { const F = f.mesh.userData.fly, k = Math.min(1, f.t / 0.34); f.mesh.position.lerpVectors(F.from, F.to, k); if (f.t > 0.9) { g.scene.remove(f.mesh); this._fx.splice(i, 1); } }
        }
    }

    // ------------------------------------------------------------------ drawing
    _draw(dt) {
        const g = this.game;
        this._stepFx(dt);
        const gs = this.goldSarc, c = this.pharaoh;
        if (c && !c.dead) {
            const shown = c.mode !== 'sleep' && c.mode !== 'gone';
            c.model.group.visible = shown;
            c.model.group.rotation.y = c.yaw;
            if (gs) {
                const open = c.mode === 'sleep' ? 0 : c.mode === 'rising' ? Math.min(1, c.riseT / (PHARAOH.RISE_T * 0.4)) : 1;
                gs.userData.lid.position.x += (open * 1.7 - gs.userData.lid.position.x) * Math.min(1, dt * 4);
                gs.userData.lid.rotation.z += (-open * 0.32 - gs.userData.lid.rotation.z) * Math.min(1, dt * 4);
            }
            if (shown) c.model.update(dt, { mode: c.anim === 'run' ? 'run' : c.anim === 'walk' ? 'walk' : c.anim === 'attack' ? 'attack' : 'idle', speed: c.speed });
        }
        for (const m of this.mummies) {
            const open = m.mode === 'sleep' ? 0 : m.mode === 'rising' ? Math.min(1, m.riseT / (MUMMY.RISE_T * 0.4)) : 1;
            m.lid.position.x += (open * 1.3 - m.lid.position.x) * Math.min(1, dt * 4);
            m.lid.rotation.z += (-open * 0.28 - m.lid.rotation.z) * Math.min(1, dt * 4);
            if (m.dead) { if (m.deadT != null) { m.deadT += dt; m.model.update(dt, { mode: 'dead' }); if (m.deadT > 20) m.model.group.visible = false; } continue; }
            if (m.mode === 'sleep') { m.model.group.visible = false; continue; }
            m.model.group.visible = true;
            if (m.mode === 'rising') {
                // in sight: the bandaged body rises out of the coffin, then stands on its edge
                const k = Math.max(0, (m.riseT - MUMMY.RISE_T * 0.25) / (MUMMY.RISE_T * 0.75));
                const p = m.model.group.position;
                p.x = m.home.x; p.z = m.home.z; p.y = m.home.y - 1.0 - 1.7 + Math.min(1, k) * (1.7 + (m.sarc.userData.top || 1.05));
                m.model.group.rotation.y = m.yaw; m.model.update(dt, { mode: 'idle', speed: 0 });
                continue;
            }
            m.model.group.rotation.y = m.yaw;
            m.model.update(dt, { mode: m.anim || 'idle', speed: m.speed });
        }
        for (const gd of this.guards) {
            if (gd.dead) { if (gd.deadT != null) { gd.deadT += dt; gd.model.update(dt, { mode: 'dead' }); if (gd.deadT > 20) gd.model.group.visible = false; } continue; }
            gd.model.group.rotation.y = gd.yaw;
            gd.model.update(dt, { mode: gd.anim || 'idle', speed: gd.speed });
        }
        if (this._locustMesh) {
            let n = 0;
            for (const L of this._locusts) {
                if (L.t <= 0) continue;
                const dir = _v.subVectors(L.p, L.prev || L.p);
                L.prev = (L.prev || new THREE.Vector3()).copy(L.p);
                const yaw = dir.lengthSq() > 1e-6 ? Math.atan2(-dir.x, -dir.z) : L.yaw;
                L.yaw = yaw;
                _q.setFromEuler(_e.set(0, yaw, Math.sin(performance.now() / 40 + L.ph) * 0.3, 'YXZ'));
                _m.compose(L.p, _q, _s.set(1.6, 1.6 + 0.4 * Math.sin(performance.now() / 25 + L.ph), 1.6));
                this._locustMesh.setMatrixAt(n++, _m);
            }
            this._locustMesh.count = n;
            this._locustMesh.instanceMatrix.needsUpdate = true;
        }
    }

    // ------------------------------------------------------------------ blows on them (spells, blades) — host decides
    targets() {
        if (!this.on) return [];
        const out = this._targ || (this._targ = []);
        out.length = 0;
        const c = this.pharaoh;
        if (c && !c.dead && c.mode !== 'sleep' && c.mode !== 'gone') out.push(c);
        for (const m of this.mummies) if (!m.dead && m.mode === 'awake') out.push(m);
        for (const gd of this.guards) if (!gd.dead) out.push(gd);
        return out;
    }
    byId(id) { if (id === 'pp') return this.pharaoh; return this.mummies.find((m) => m.id === id) || this.guards.find((m) => m.id === id) || null; }
    posOf(c) { return c.model.group.position; }

    hit(c, dmg, spell = null, by = null) {
        const g = this.game;
        if (!c || c.dead || !(dmg > 0)) return;
        if (!this.auth) { g.sync?.pyr?.({ e: 'hit', id: c.id, dmg, spell, by }); return; }
        if (c.kind === 'pharaoh') {
            const was = c.hp;
            c.hp -= pharaohDamage(spell, dmg, GOD_SPELLS.has(spell));
            c.model.flashHit?.(0.18);
            if (c.mode === 'sleep') this.wakePharaoh('attack', by);
            if (by != null) c.foe = by;
            if (was - c.hp >= 8 && Math.random() < 0.3) this._say(pick(LINES.hurt));
            if (c.hp <= 0) this._pharaohDies(by);
            return;
        }
        if ((c.mode === 'sleep' || c.mode === 'rising') && !/^Nihilis/.test(spell || '')) { if (c.kind === 'mummy') this._wakeMummy(c, by); return; }
        const d = spell === 'blade' || spell == null ? dmg : pirateBoneDamage(spell, dmg, true);
        c.hp -= d;
        c.model.flashHit?.(0.15);
        if (by != null) c.foe = by;
        this.attacked(c.model.group.position, by);
        if (c.hp <= 0) {
            c.dead = true; c.deadT = 0;
            (c.kind === 'mummy' ? this.state.mummiesDead : this.state.guardsDead).push(c.i);
            g.sound?.playPharaoh?.(c.model.group.position, 'rise');
        }
    }

    hitAt(pos, radius, dmg, spell = null, by = null) {
        if (!this.on || !pos) return;
        for (const c of this.list) { if (c.dead || c.mode === 'sleep' || c.mode === 'rising') continue; const p = this.posOf(c); if (p.distanceTo(pos) < radius + c.r + 1.5) this.hit(c, dmg * Math.max(0.3, 1 - p.distanceTo(pos) / (radius + 2)), spell, by); }
        this.attacked(pos, by);
    }
    hitRay(o, d, len, width, dmg, spell = null, by = null) {
        if (!this.on) return;
        const near = (p, r) => { _v.subVectors(p, o); const t = Math.max(0, Math.min(len, _v.dot(d))); return _v.addScaledVector(d, -t).length() < width + r; };
        for (const c of this.list) if (!c.dead && c.mode !== 'sleep' && c.mode !== 'rising' && near(_v2.copy(this.posOf(c)).setY(this.posOf(c).y + 1.6), c.r + 0.8)) this.hit(c, dmg, spell, by);
    }
    boltHit(c, spell, by, front = null) {
        void front;
        const dmg = BOLT_DMG[spell] ?? 4;
        if (spell === 'Stupefy' && c) c.cool = Math.max(c.cool || 0, 2);
        this.hit(c, dmg, spell, by);
    }

    /** A chest of the pharaoh's was touched while he lives: the tomb's curse wakes him (Game.openChest asks). */
    chestTouched(chest, by = null) {
        if (chest?.room === 'pharaoh' && !this.state.pharaohDead) this.wakePharaoh('guest', by);
    }

    _pharaohDies(by) {
        const c = this.pharaoh, g = this.game;
        c.dead = true; this.state.pharaohDead = true; c.mode = 'gone';
        this._say(pick(LINES.death));
        g.sound?.playPharaoh?.(c.pos, 'die');
        for (let i = 0; i < 90; i++) g.fx?.spark?.(_v.set(c.pos.x + (Math.random() - 0.5) * 2, c.pos.y + Math.random() * 3.5, c.pos.z + (Math.random() - 0.5) * 2), i % 2 ? 0xe8c880 : 0xb89a5a, 0.25, _v2.set((Math.random() - 0.5) * 3, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 3), 1.4);
        c.model.group.visible = false;
        for (const ch of this._chests) if (ch.room === 'pharaoh') ch.locked = false;
        for (const L of this._locusts) L.t = 0;
        g.achievements?.killed?.('pharaoh', 'pharaoh', by, c.pos);
        g.hud?.setVoice?.('🔺 Фараон Песчаный рассыпался песком. Его сундуки в погребальной палате теперь открыты', true);
    }

    // ------------------------------------------------------------------ the network
    _netSend(dt) {
        const g = this.game;
        if (!g.sync || !this.on) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.12;
        const c = this.pharaoh;
        const MODE = { sleep: 0, rising: 1, awake: 2, fight: 3, gone: 4, idle: 2 };
        g.sync.pyr?.({ e: 'st',
            c: c ? [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r2(c.yaw), MODE[c.mode] ?? 0, Math.round(c.hp), c.anim || 'idle', r2(c.speed || 0), r2(c.riseT || 0)] : null,
            m: this.mummies.map((x) => [r2(x.model.group.position.x), r2(x.model.group.position.y), r2(x.model.group.position.z), r2(x.yaw), x.anim || 'idle', MODE[x.mode] ?? 0, x.dead ? 1 : 0, r2(x.riseT || 0)]),
            g: this.guards.map((x) => [r2(x.model.group.position.x), r2(x.model.group.position.y), r2(x.model.group.position.z), r2(x.yaw), x.anim || 'idle', x.dead ? 1 : 0]),
            l: this._locusts.filter((L) => L.t > 0).flatMap((L) => [L.i, r2(L.p.x), r2(L.p.y), r2(L.p.z)]),
            dead: this.state.pharaohDead ? 1 : 0 });
    }
    _follow(dt) {
        const S = this._net;
        if (!S) return;
        const c = this.pharaoh, k = Math.min(1, dt * 10);
        const MODES = ['sleep', 'rising', 'awake', 'fight', 'gone'];
        if (c && S.c) {
            const [x, y, z, yaw, mode, hp, anim, speed, riseT] = S.c;
            c.pos.x += (x - c.pos.x) * k; c.pos.y += (y - c.pos.y) * k; c.pos.z += (z - c.pos.z) * k;
            c.yaw = yaw; c.mode = MODES[mode] === 'awake' ? 'fight' : MODES[mode]; c.hp = hp; c.anim = anim; c.speed = speed; c.riseT = riseT;
        }
        (S.m || []).forEach((r, i) => {
            const m = this.mummies[i]; if (!m) return;
            m.mode = MODES[r[5]] === 'fight' ? 'awake' : MODES[r[5]]; m.dead = !!r[6]; m.riseT = r[7];
            if (m.mode === 'awake' || m.dead) { const p = m.model.group.position; p.x += (r[0] - p.x) * k; p.y += (r[1] - p.y) * k; p.z += (r[2] - p.z) * k; m.yaw = r[3]; m.anim = r[4]; if (m.box != null) { this.game.collision?.removeBox?.(m.box); m.box = null; } }
        });
        (S.g || []).forEach((r, i) => { const gd = this.guards[i]; if (!gd) return; const p = gd.model.group.position; p.x += (r[0] - p.x) * k; p.y += (r[1] - p.y) * k; p.z += (r[2] - p.z) * k; gd.yaw = r[3]; gd.anim = r[4]; if (r[5]) gd.dead = true; });
        const L = S.l || [];
        if (!this._locustMesh) return;
        for (let j = 0; j + 3 < L.length; j += 4) { let q = this._locusts.find((o) => o.i === L[j]); if (!q) { q = { i: L[j], p: new THREE.Vector3(L[j + 1], L[j + 2], L[j + 3]), t: 5, ph: Math.random() * 6.28, yaw: 0 }; this._locusts.push(q); } q.p.lerp(_v.set(L[j + 1], L[j + 2], L[j + 3]), k); q.t = 1; }
        this._locusts = this._locusts.filter((q) => L.includes(q.i));
        if (S.dead && !this.state.pharaohDead) { this.state.pharaohDead = true; if (c) { c.dead = true; c.mode = 'gone'; c.model.group.visible = false; } for (const ch of this._chests) if (ch.room === 'pharaoh') ch.locked = false; }
    }
    onNet(m, from) {
        const g = this.game;
        if (m.e === 'st') { this._net = m; return; }
        if (m.e === 'say') { if (!this.auth) { g.hud?.setVoice?.(`🔺 Фараон: «${m.t}»`, true); g.sound?.playPharaoh?.(this.pharaoh?.pos || g.character.group.position, 'chant'); } return; }
        if (m.e === 'hurt') { if (m.to === g.localId) g.combat?.damage?.(m.dmg, 'pharaoh', m.kind); return; }
        if (m.e === 'push') { if (m.to === g.localId && g.knockback) { g.knockback.x += m.x; g.knockback.z += m.z; } return; }
        if (m.e === 'curse') { this._curseFx(m.to); return; }
        if (m.e === 'wave') { if (!this.auth) { g.sound?.playPharaoh?.(_v.set(m.p[0], m.p[1], m.p[2]), 'sand'); this._ring(m.p[0], m.p[1], m.p[2], PHARAOH.SAND_WAVE.R); } return; }
        if (m.e === 'darts') { if (!this.auth && this.plan) this._dartFx(this.plan, this.plan.plates[m.i]); return; }
        if (m.e === 'floor') { if (!this.auth) { this.state.sandDone = true; g.sound?.playPharaoh?.(this.plan?.sandTrap?.c, 'floor'); } return; }
        if (m.e === 'wake') { if (!this.auth) { const c = this.mummies[m.i]; if (c && c.mode === 'sleep') { c.mode = 'rising'; c.riseT = 0; g.sound?.playPharaoh?.(c.home, 'lid'); } } return; }
        if (m.e === 'wakeph') { if (this.auth) this.wakePharaoh(m.why || 'guest', m.by ?? from); else if (this.pharaoh) g.sound?.playPharaoh?.(this.pharaoh.pos, 'lid'); return; }
        if (m.e === 'locust') { if (!this.auth) g.sound?.playPharaoh?.(this.pharaoh?.pos, 'locust'); return; }
        if (!this.auth) return;
        if (m.e === 'hit') { const c = this.byId(m.id); if (c) this.hit(c, m.dmg, m.spell, m.by ?? from); return; }
        if (m.e === 'att') this.attacked(_v.set(m.p[0], m.p[1], m.p[2]), m.by ?? from);
    }

    // ------------------------------------------------------------------ the save
    snapshot() { return { ...this.state, mummiesDead: [...this.state.mummiesDead], guardsDead: [...this.state.guardsDead], woken: [...this.state.woken] }; }
    restore(s) {
        if (!s) return;
        this.state = { pharaohDead: !!s.pharaohDead, mummiesDead: [...(s.mummiesDead || [])], guardsDead: [...(s.guardsDead || [])], seen: !!s.seen, zombies: !!s.zombies, jewels: !!s.jewels, sandDone: !!s.sandDone, woken: [...(s.woken || [])] };
        if (this.on) this._drop();
    }
    dispose() { if (this.on) this._drop(); }

    /** Shapes and materials to compile on the loading screen (Game.prewarm). */
    static samples() { return pharaohSamples(); }
}

/** A target capsule (Duel._bodies): from the feet to the head. */
export function pharaohBody(c, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const p = c.model.group.position;
    out.r = c.r + 0.15;
    out.a.set(p.x, p.y + out.r, p.z);
    out.b.set(p.x, p.y + c.h - out.r, p.z);
    return out;
}
export function pharaohCenter(c, out = new THREE.Vector3()) { const p = c.model.group.position; return out.set(p.x, p.y + c.h * 0.55, p.z); }

// pushes, gusts, knockdowns (CreatureImpact): the mummies and skeleton-mummies are thrown like any skeleton; the pharaoh only reels (a king of the dead is no man of bones)
registerKind('H', {
    name: 'pharaoh', faces: -1,
    list: (g) => g.pharaoh?.list || [],
    get: (g, id) => g.pharaoh?.byId(id),
    alive: (c) => !c.dead && c.mode !== 'sleep' && c.mode !== 'rising' && c.mode !== 'gone',
    body: (c) => (c.kind === 'pharaoh' ? 'pharaoh' : 'skeleton'),
    centre: (c, out) => { const p = c.model.group.position; return out.set(p.x, p.y + 1.8, p.z); },
    pivot: () => ({ obj: null, base: 0, lie: 0 }),
    head: (c) => c.model?.head || null, arms: () => [], legs: () => [],
    move(g, c, dx, dz) { g.pharaoh?._step(c, dx, dz); },
    toss() {},
    hold(g, c, t) { c.cool = Math.max(c.cool || 0, Math.min(t, 1.5)); },
    frozen: () => false,
    noKnock: (c) => c.kind === 'pharaoh',
    struck(g, c, o) { if (o.by != null) c.foe = o.by; },
});
void PHARAOH;
void pyrUV;
