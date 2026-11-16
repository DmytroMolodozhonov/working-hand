/**
 * Brawl.js — «Битва существ»: `g.brawl` (rules and numbers: BrawlRules.js).
 *
 * The player puts creatures of two teams on a bounded field (TutorialLand — a meadow with cliffs, nothing else) and starts the fight; then
 * watches as a camera (SpectatorCam.js: keyboard and mouse, no web camera). Zombies, animals and people are «servants» of their team
 * (Servants.js: the pseudo-master `brawl:A` / `brawl:B`), so the walking and the blows of every system are its own; the mages also cast
 * bolts at their foes (casterStep). Nobody in this mode goes for the player: the hero is only the eye.
 *
 * Host only in a network game is not a thing here (a map for one); `authority` is always true.
 */
import * as THREE from 'three';
import { TEAMS, TEAM_IDS, masterOfTeam, teamOfMaster, fighterDef, BRAWL, pickEnemy, casterMove, winnerOf, placePoints } from './BrawlRules.js';
import { FACE, facesTarget } from './FaceTarget.js';
import { WALK, RUN } from './CastleLife.js';
import { TUTORIAL } from '../world/TutorialLand.js';

export const BRAWL_SITE = 'brawlfield';
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class Brawl {
    constructor(game) {
        this.game = game;
        this.roster = new Map(); // 'k:id' → {k, id, team, type, def}
        this.state = 'setup'; // 'setup' | 'fight' | 'over'
        this.winner = null;
        this.overAt = 0;
        this.bolts = [];
        this._boltMat = new Map();
        this._boltGeo = new THREE.SphereGeometry(0.34, 10, 8);
        this._list = []; // (the enemy search: refilled once a frame)
        this._listAt = -1;
        this._frame = 0;
        this._person = 0; // (the people made so far: their index in the field's site)
        this.onChange = null; // (the panel: counts, state)
        this._makeMarkers();
        this._quiet();
    }

    /** Only what the player puts on the field: no herds, wild plants, birds, bosses (as the tutorial's meadow: Tutorial._quiet), no wandering zombies. */
    _quiet() {
        const g = this.game;
        for (const k of ['flora', 'canaries', 'owls', 'phoenixes', 'spencers', 'dragons', 'plants', 'gargoyles', 'spiders', 'tarons', 'hellPatrol', 'crystals']) if (g[k] && 'enabled' in g[k]) g[k].enabled = false;
        if (g.books) g.books._spawnT = Infinity;
        if (g.animals) g.animals.noWild = true; // (its own update stays: the animals of the teams walk and fight)
    }

    // ------------------------------------------------------------- the field
    /** The ground under (x, z): the meadow is flat, a hill is not. */
    groundAt(x, z) {
        const c = this.game.collision;
        const y = c?.groundY ? c.groundY(x, z) : null;
        return Number.isFinite(y) ? y : TUTORIAL.G + 1;
    }

    /** The people's place for CastleLife (a site like the tutorial's wizard): one, kept awake over the whole field. */
    _site() {
        const life = this.game.castleLife;
        if (!life) return null;
        let def = life.extra?.get(BRAWL_SITE);
        if (!def) {
            const G = this.groundAt(0, 0);
            def = {
                id: BRAWL_SITE, kind: 'wander', name: 'Битва существ', x: 0, z: 0, F: G, zone: 80, gx: 0, gz: 0,
                knights: 0, king: '', population: 0, color: 0x555a66, spot: { x: 0, y: G, z: 0, yaw: 0 },
                people: [], houses: [], stalls: [], fields: [], posts: [], beds: [], chests: [], pens: [], graves: [], graveyards: [], rooms: [],
                nodes: [{ id: 0, x: 0, y: G, z: 0, tag: 'guest' }], edges: [],
            };
            life.addSite(def);
        }
        return def;
    }

    // --------------------------------------------------------------- putting
    count(team = null) {
        let n = 0;
        for (const e of this.roster.values()) if (!team || e.team === team) n++;
        return n;
    }

    /** Put a fighter of kind `typeId` of `team` at (x, z). → the entry, or null (why: this.why). */
    spawn(typeId, team, x, zc) {
        const g = this.game, def = fighterDef(typeId);
        this.why = '';
        if (!def || !TEAMS[team]) { this.why = 'нет такого бойца'; return null; }
        if (this.state === 'over') this.clear(); // (a new round: the old field goes)
        if (this.count() >= BRAWL.MAX) { this.why = 'на поле уже много бойцов'; return null; }
        const z = zc, y = this.groundAt(x, zc);
        let e = null;
        if (def.kind === 'z') {
            const zb = g._createZombie(new THREE.Vector3(x, y + 0.5, zc));
            e = this._join('z', zb.id, team, def);
            zb.setThrall(true);
            zb.thrallOwner = masterOfTeam(team);
            zb.thrallUntil = Infinity;
            zb.group.rotation.y = team === 'A' ? -Math.PI / 2 : Math.PI / 2;
        } else if (def.kind === 'a') {
            const a = g.animals?._spawn(def.type, new THREE.Vector3(x, y, z), { yaw: team === 'A' ? -Math.PI / 2 : Math.PI / 2 });
            if (!a) { this.why = 'не получилось'; return null; }
            a.servantOf = masterOfTeam(team);
            a.servantUntil = 0;
            a.state = 'graze'; a.attacker = null;
            e = this._join('a', a.id, team, def);
        } else if (def.kind === 'v') {
            const life = g.castleLife, site = this._site();
            if (!life || !site) { this.why = 'жители недоступны'; return null; }
            const idx = ++this._person;
            const m = this._person;
            site.people.push({ idx, role: def.role, female: m % 3 === 0, name: def.label + ' ' + m, home: -1, stall: -1, seed: 20261116 + m * 97, rank: def.rank, brave: 1, mana: def.mana });
            const cs = life._runtime(site);
            if (!cs.awake) cs.awake = true;
            const yaw = team === 'A' ? Math.PI * 1.5 : Math.PI * 0.5;
            const v = life._activate(cs, idx, { x, y, z, yaw }, 'stall', { post: { x, y, z, yaw }, hp: undefined });
            if (!v) { this.why = 'не получилось'; return null; }
            v.servantOf = masterOfTeam(team);
            v.servantUntil = 0;
            v.brawl = { team, def };
            v.yaw = yaw;
            e = this._join('v', v.id, team, def);
        }
        this._changed();
        return e;
    }

    _join(k, id, team, def) {
        const e = { k, id, team, type: def.id, def };
        this.roster.set(k + ':' + id, e);
        return e;
    }

    /** Take everybody off the field. */
    clear() {
        const g = this.game, life = g.castleLife;
        for (const e of [...this.roster.values()]) {
            if (e.k === 'z') { const z = g.zombieById?.get(e.id); if (z) g.removeZombie(z); }
            else if (e.k === 'a') { const a = g.animals?.byId.get(e.id); if (a) g.animals._remove(a); }
            else if (e.k === 'v') { const v = life?.byId.get(e.id); if (v) { v.dead = true; life._deactivate(v); } }
        }
        this.roster.clear();
        for (const b of this.bolts) this._dropBolt(b);
        this.bolts.length = 0;
        const site = life?.extra?.get(BRAWL_SITE);
        if (site) { site.people.length = 0; life.state(BRAWL_SITE).killed.clear(); }
        this._person = 0;
        this.state = 'setup';
        this.winner = null;
        this._changed();
    }

    start() {
        if (this.state === 'fight') return false;
        const a = this.aliveCount();
        if (!(a.A > 0 && a.B > 0)) { this.why = 'нужны бойцы с обеих сторон'; return false; }
        this.state = 'fight';
        this.winner = null;
        this.game.hud?.setVoice?.('⚔️ Бой начался', true);
        this._changed();
        return true;
    }

    // ------------------------------------------------------------ the search
    _alive(e) {
        const s = this.game.servants;
        return !!s?.find(e.k, e.id);
    }

    aliveCount() {
        const out = { A: 0, B: 0 };
        for (const e of this.roster.values()) if (this._alive(e)) out[e.team]++;
        return out;
    }

    /** (Servants.enemyFor for a brawl master) the nearest living fighter of the other team: {k, id, x, z} | null. */
    enemyFor(self, master, me) {
        if (this.state !== 'fight') return null;
        const team = teamOfMaster(master);
        if (!team) return null;
        const list = this._enemies();
        const e = pickEnemy(team, me, list);
        return e ? { k: e.k, id: e.id, x: e.x, z: e.z } : null;
    }

    /** All the living fighters with their places, made once a frame. */
    _enemies() {
        if (this._listAt === this._frame) return this._list;
        this._listAt = this._frame;
        const s = this.game.servants, out = this._list;
        out.length = 0;
        for (const e of this.roster.values()) {
            const p = s.pos(e.k, e.id, _v);
            if (!p) continue;
            out.push({ k: e.k, id: e.id, team: e.team, x: p.x, z: p.z });
        }
        return out;
    }

    // ----------------------------------------------------------------- mages
    /**
     * (CastleLife._serve) What a mage-servant does instead of the sword: keeps its distance, turns to the foe, casts a bolt.
     * → true when it handled the frame.
     */
    casterStep(v, sv, dt) {
        const b = v.brawl, C = b?.def?.caster;
        if (!C) return false;
        const L = this.game.castleLife;
        v.speed = 0;
        const e = this.state === 'fight' ? sv.enemy : null;
        if (!e) { v.mode = 'idle'; L._ground(v); return true; }
        const d = Math.hypot(e.x - v.x, e.z - v.z);
        const mv = casterMove(d);
        if (mv === 'close') { v.path = null; L._steer(v, e.x, e.z, RUN, dt, BRAWL.KEEP[1] - 1); v.mode = v.speed > WALK * 1.2 ? 'run' : 'walk'; }
        else if (mv === 'back') { const k = 8 / Math.max(0.5, d); v.path = null; L._steer(v, v.x + (v.x - e.x) * k, v.z + (v.z - e.z) * k, WALK * 1.3, dt, 0.3); v.mode = 'walk'; }
        else { L._steer(v, e.x, e.z, 0, dt, 99); v.mode = 'idle'; }
        v.castT = (v.castT ?? 0.6 + Math.random()) - dt;
        if (v.castT <= 0 && mv !== 'close' && facesTarget(v.yaw, v.x, v.z, e.x, e.z, FACE.SPELL)) { // («лицом к цели»)
            v.castT = C.every * (0.8 + Math.random() * 0.5);
            this._fire(v, e, C, b.team);
        }
        L._ground(v);
        return true;
    }

    _fire(v, e, C, team) {
        const g = this.game, target = g.servants.pos(e.k, e.id, _d);
        if (!target) return;
        const from = new THREE.Vector3(v.x, v.y + 3.1, v.z);
        const to = new THREE.Vector3(target.x, target.y + (e.k === 'a' ? 1.2 : 2.2), target.z);
        const dir = to.sub(from).normalize();
        const mesh = new THREE.Mesh(this._boltGeo, this._matFor(C.color));
        mesh.position.copy(from);
        g.scene.add(mesh);
        this.bolts.push({ mesh, dir, color: C.color, dmg: C.dmg, team, t: BRAWL.BOLT_LIFE, by: masterOfTeam(team), from: { x: v.x, z: v.z } });
        g.sound?.playHit?.();
        for (let i = 0; i < 6; i++) g.fx?.spark(from, C.color, 0.14, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.35);
    }

    _matFor(color) {
        let m = this._boltMat.get(color);
        if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }); this._boltMat.set(color, m); }
        return m;
    }

    _dropBolt(b) { this.game.scene.remove(b.mesh); }

    _updateBolts(dt) {
        const g = this.game, s = g.servants;
        for (let i = this.bolts.length - 1; i >= 0; i--) {
            const b = this.bolts[i];
            b.t -= dt;
            _v.copy(b.dir).multiplyScalar(BRAWL.BOLT_SPEED * dt);
            b.mesh.position.add(_v);
            const p = b.mesh.position;
            g.fx?.spark(p, b.color, 0.12, _d.set((Math.random() - 0.5) * 1.2, Math.random() * 0.8, (Math.random() - 0.5) * 1.2), 0.28);
            let hit = null;
            for (const e of this._enemies()) {
                if (e.team === b.team) continue;
                const q = s.pos(e.k, e.id, _d);
                if (!q) continue;
                const dx = q.x - p.x, dz = q.z - p.z;
                if (dx * dx + dz * dz < BRAWL.BOLT_HIT_R * BRAWL.BOLT_HIT_R && p.y > q.y - 0.5 && p.y < q.y + 4.2) { hit = e; break; }
            }
            const wall = !hit && g.collision?.pointBlocked?.(p.x, p.y, p.z);
            if (hit) {
                s.damage({ k: hit.k, id: hit.id }, b.dmg, b.dir, b.by, 'servant', b.from);
                this._burst(p, b.color);
            }
            if (hit || wall || b.t <= 0) { if (wall) this._burst(p, b.color); this._dropBolt(b); this.bolts.splice(i, 1); }
        }
    }

    _burst(p, color) {
        const fx = this.game.fx;
        if (!fx) return;
        for (let i = 0; i < 16; i++) fx.spark(p, color, 0.2, new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 5, (Math.random() - 0.5) * 7), 0.5);
    }

    // --------------------------------------------------------------- markers
    /** A ring on the ground under each fighter in its team's colour (one InstancedMesh). */
    _makeMarkers() {
        const geo = new THREE.RingGeometry(1.0, 1.35, 28).rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
        const m = new THREE.InstancedMesh(geo, mat, BRAWL.MAX + 4);
        m.count = 0;
        m.frustumCulled = false;
        m.renderOrder = 5;
        this.markers = m;
        this.game.scene.add(m);
        this._mm = new THREE.Matrix4();
        this._mc = new THREE.Color();
    }

    _updateMarkers() {
        const m = this.markers, s = this.game.servants;
        let n = 0;
        for (const e of this.roster.values()) {
            const p = s.pos(e.k, e.id, _v);
            if (!p) continue;
            const r = e.k === 'a' && e.type === 'horse' ? 1.5 : e.k === 'a' ? 1.1 : 0.9;
            this._mm.makeScale(r, 1, r).setPosition(p.x, this.groundAt(p.x, p.z) + 0.08, p.z);
            m.setMatrixAt(n, this._mm);
            m.setColorAt(n, this._mc.setHex(TEAMS[e.team].color));
            n++;
        }
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // ----------------------------------------------------------------- frame
    update(dt) {
        this._frame++;
        if (this.state === 'fight') {
            this._updateBolts(dt);
            const w = winnerOf(this.aliveCount(), true);
            if (w) {
                this.state = 'over';
                this.winner = w;
                this.overAt = performance.now();
                this.game.hud?.setVoice?.(w === 'draw' ? '🤝 Все пали — ничья' : `🏆 Победа: ${TEAMS[w].label}`, true);
                this._changed();
            }
        } else if (this.bolts.length) this._updateBolts(dt);
        if (this._frame % 2 === 0) this._updateMarkers();
        if (this._frame % 30 === 0) { // (no stranger on the field: a zombie nobody put there goes)
            for (const z of [...this.game.zombies]) if (!this.roster.has('z:' + z.id) && !z.isDying) this.game.removeZombie(z);
        }
        if (this._frame % 20 === 0) this._changed(true);
    }

    _changed(soft = false) {
        this.onChange?.({ state: this.state, winner: this.winner, total: { A: this.count('A'), B: this.count('B') }, alive: this.aliveCount(), soft });
    }

    dispose() {
        try { this.clear(); } catch (e) { /* the game is going down: nothing to take off */ }
        this.game.scene.remove(this.markers);
        this.markers.geometry.dispose();
        this.markers.material.dispose();
        this._boltGeo.dispose();
        for (const m of this._boltMat.values()) m.dispose();
    }
}
