/**
 * HellPatrol.js — the patrols of the underworld's gargoyles (the author: «горгульи вокруг ПЕРИОДИЧЕСКИ летают, не супер-часто; иногда могут напасть, но
 * ПООДИНОЧКЕ, не массово: от 1 до 3 максимум»). Rules and numbers: HellGargoyleRules.js; the gargoyles themselves are the ordinary ones (Gargoyles.js:
 * model, flight, bite, weak spots) — here only WHERE they live and what they do between attacks.
 *
 *   Where     `hellPlan(seed).gargoyleLairs` (HellMap.js): 4–8 groups of 1–3, one group a lair. A group is made (a gargoyle a frame, only once the land is
 *             made) when a player is within 520 m of its lair and put away at 700 m. A killed one is a gap; +1 after 10 minutes (never above the group).
 *   Circle    they fly in circles 80–200 m across, 26–70 m up, over the lair (the group's own circle, the same for every computer of a seed).
 *   Meeting   a player seen within 60 m: the group rolls ONCE (35 %) — then 1–3 of its members (mostly 1) go for that player for 14–26 s; the others keep
 *             circling. Then the attackers return. The next roll — not before 40 s.
 *   Kin       they do not touch Tarons and the Devil (and those do not touch them).
 *   Head      a killed patrol gargoyle drops its head with 25 % (the item `gargoyleHead` — the foundation's; until it exists the drop is logged only).
 *   Fire      fire and lava do not hurt them there; «To the Sun» does not work there (no sun).
 * The host leads (spawns, the group's mind, kills); the guests see the gargoyles through the ordinary gargoyle snapshot (Gargoyles._netSend).
 */
import * as THREE from 'three';
import { HELL_GARGOYLE as H, groupCount, groupSizeOf, circleOf, circlePoint, newGroup, stepGroup, isAttacker, dropsHead } from './HellGargoyleRules.js';
import { inHell } from '../world/HellMap.js';
import { ITEM_INFO, newUid } from './ItemTypes.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const KEEP_R = 700, RESPAWN_S = 600, SPEED = 15 * H.SPEED;

export class HellPatrol {
    constructor(game) {
        this.game = game;
        this.groups = [];
        this.plan = null;
        this.clock = 0;
        this._planTried = false;
        this.enabled = true;
        this.log = [];
    }
    get auth() { return this.game.authority !== false; }
    get G() { return this.game.gargoyles; }
    _note(e) { this.log.push({ t: Math.round(this.clock), ...e }); if (this.log.length > 60) this.log.shift(); }

    setPlan(plan) {
        for (const g of this.groups) this._unload(g);
        this.groups = [];
        this.plan = plan || null;
        if (!plan?.gargoyleLairs?.length) return;
        const seed = plan.seed | 0, lairs = plan.gargoyleLairs, n = groupCount(seed, lairs.length);
        for (let i = 0; i < n; i++) {
            const lair = lairs[i];
            this.groups.push({ i, lair: { x: lair.x, y: lair.y, z: lair.z }, n: groupSizeOf(seed, i), circle: circleOf(seed, i), st: null, members: [], dead: 0, respawnT: 0, loaded: false, noTarget: 0 });
        }
    }
    get active() { return this.groups.length > 0; }

    /** A gargoyle of a patrol (the ordinary one + `patrol`: Gargoyles._think hands it to `drive`). */
    _make(gr, m) {
        const G = this.G;
        if (!G) return null;
        const c = circlePoint(gr.circle, this.clock, m);
        const x = gr.lair.x + c.x, z = gr.lair.z + c.z;
        const gy = this._ground(x, z);
        if (!this._made(x, z)) return null;
        const o = G.spawn(_v.set(x, Math.max(gy, gr.lair.y) + c.alt, z), { variant: (gr.i + m) % 3 });
        if (!o) return null;
        o.mode = 'roam'; o.life = Infinity; o.home = new THREE.Vector3(gr.lair.x, gr.lair.y, gr.lair.z);
        o.patrol = { gr, m };
        gr.members[m] = o;
        return o;
    }
    _ground(x, z) { const y = this.game.collision?.groundY?.(x, z); return Number.isFinite(y) ? y : 0; }
    _made(x, z) { const t = this.game.terrain?.data; return !t?.landMade || t.landMade(Math.round(x), Math.round(z)); }
    _unload(gr) {
        for (const o of gr.members) if (o && !o.dead) this.G?._remove?.(o);
        gr.members = []; gr.loaded = false; gr.st = null;
    }

    update(dt) {
        if (!this.enabled) return;
        const g = this.game;
        if (!this.plan && !this._planTried) {
            const p = g.character?.group?.position, T = g.terrain?.data;
            if (p && T?.hell && inHell(p.x, p.z, 600)) { this._planTried = true; this.setPlan(T.hellPlan); }
        }
        if (!this.active || !this.G) return;
        this.clock += dt;
        const me = g.character.group.position;
        const people = [me];
        for (const r of g.remotes?.values?.() || []) if (r.position && !r.dead) people.push(r.position);
        let alive = 0;
        for (const gr of this.groups) {
            const d = people.reduce((m, q) => Math.min(m, hdist(q, gr.lair)), 1e9);
            if (gr.loaded && d > KEEP_R) { this._unload(gr); continue; }
            if (!gr.loaded) {
                if (d < H.LOAD_R && this.auth) {
                    // made a gargoyle a frame (the land under the lair first)
                    if (!this._made(gr.lair.x, gr.lair.z)) continue;
                    gr.loaded = true; gr.st = newGroup(gr.n - gr.dead);
                }
                else continue;
            }
            if (!this.auth) continue;
            // the group's gaps: made one a frame; +1 after RESPAWN_S
            const want = Math.max(0, gr.n - gr.dead);
            if (gr.dead > 0) { gr.respawnT += dt; if (gr.respawnT >= RESPAWN_S) { gr.respawnT = 0; gr.dead--; } }
            for (let m = 0; m < gr.n - gr.dead; m++) {
                if (!gr.members[m] || gr.members[m].dead) { if (gr.members[m]?.dead) { gr.members[m] = null; continue; } if (this._total() < H.DRAW_MAX) this._make(gr, m); break; }
            }
            gr.st.n = Math.max(1, want);
            this._mind(gr, dt, people);
            alive += gr.members.filter((o) => o && !o.dead).length;
        }
    }
    _total() { return this.groups.reduce((s, gr) => s + gr.members.filter((o) => o && !o.dead).length, 0); }

    /** The group's mind: does anyone of it see a player? (rolls, an attack, the return). */
    _mind(gr, dt, people) {
        const live = gr.members.filter((o) => o && !o.dead);
        if (!live.length) return;
        let seen = false, near = null;
        for (const o of live) for (const q of this.G.victims || []) {
            if (q.k !== 'p' || q.roofed) continue;
            if (hdist(q.pos, o.model.position) <= H.SEE && Math.abs(q.pos.y - o.model.position.y) < H.ALT[1] + 40) { seen = true; near = q; break; }
        }
        const over = live.some((o) => hdist(o.model.position, gr.lair) > 250);
        const hasTarget = live.some((o, i) => isAttacker(gr.st, i) && o.target);
        gr.noTarget = gr.st.mode === 'attack' && !hasTarget ? gr.noTarget + dt : 0;
        const ev = stepGroup(gr.st, dt, { seen, rolls: Math.random, over, victimGone: gr.noTarget > 4 });
        for (const e of ev) {
            this._note({ ev: e, group: gr.i, attackers: gr.st.attackers, mode: gr.st.mode });
            if (e === 'attack' && near) {
                // the attackers: the first of the group by index (isAttacker); they get the player as their prey now
                this.G.game.hud?.setVoice?.('🜏 Горгулья заметила вас…', false);
            }
            if (e === 'return') for (const o of live) { o.target = null; o.flee = Math.max(o.flee || 0, 0); }
        }
    }

    /**
     * Called by Gargoyles._think for a patrol member. true: it flew its patrol this frame (the rest of the mind is skipped);
     * false: it is an attacker now — the ordinary hunt runs, but only on players (Gargoyles._pick).
     */
    drive(o, dt) {
        const P = o.patrol, gr = P?.gr;
        if (!gr?.st) return true;
        if (isAttacker(gr.st, P.m)) return false;
        if (o.target) o.target = null;
        if (o.carry) return false;
        const c = circlePoint(gr.circle, this.clock, P.m);
        _w.set(gr.lair.x + c.x, Math.max(this._ground(gr.lair.x + c.x, gr.lair.z + c.z), gr.lair.y) + c.alt, gr.lair.z + c.z);
        o.mode = 'roam';
        this.G._fly(o, _w, SPEED * 1.15, dt, { k: 1.6 });
        o.a.mode = o.vel.y > 1 ? 'fly' : o.a.mode === 'glide' && o.t % 3 > 0.05 ? 'glide' : Math.random() < 0.004 ? 'glide' : 'fly';
        this.G._orient(o, dt);
        return true;
    }

    /** A patrol gargoyle was killed: the gap in its group; the head (25 %). */
    onDie(o) {
        const gr = o.patrol?.gr;
        if (!gr) return;
        gr.dead = Math.min(gr.n, gr.dead + 1);
        gr.members[o.patrol.m] = null;
        if (!this.auth) return;
        const p = o.model.position;
        if (dropsHead(Math.random())) {
            if (ITEM_INFO.gargoyleHead) this.game.items?.spawnLoose?.({ kind: 'gargoyleHead', uid: newUid(), count: 1 }, _v.set(p.x, p.y, p.z).clone(), { vel: new THREE.Vector3(0, 2, 0) });
            else this._note({ ev: 'head-pending', group: gr.i }); // (the foundation's item is not in the game yet)
        }
    }

    dispose() { for (const gr of this.groups) this._unload(gr); this.groups = []; }
}
