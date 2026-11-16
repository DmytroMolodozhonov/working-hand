/**
 * Brawl.js — «Битва существ»: `g.brawl` (rules and numbers: BrawlRules.js).
 *
 * The player puts creatures of two teams on a bounded field (TutorialLand — a meadow with cliffs, nothing else) and starts the fight; then
 * watches as a camera (SpectatorCam.js: keyboard and mouse, no web camera). Zombies, animals and people are «servants» of their team
 * (Servants.js: the pseudo-master `brawl:A` / `brawl:B`), so the walking and the blows of every system are its own; the mages (ordinary and
 * elemental) fight by their OWN real brains, their foe a pseudo player id (foePos / _feedFoes). Nobody in this mode goes for the player: the hero is only the eye.
 *
 * Host only in a network game is not a thing here (a map for one); `authority` is always true.
 */
import * as THREE from 'three';
import { TEAMS, TEAM_IDS, masterOfTeam, teamOfMaster, fighterDef, BRAWL, pickEnemy, winnerOf, placePoints, foeId, isMage, teamAt } from './BrawlRules.js';
import { TUTORIAL } from '../world/TutorialLand.js';
import { SHARDS } from './ElementalRules.js';
import { elementalLook } from './ElementalTestSites.js';
import { earthLook } from './EarthMagicRules.js';

export const BRAWL_SITE = 'brawlfield';
export const BRAWL_ELEM_SITE = 'brawlelem'; // (the real elemental mages: a site of the kind 'elemental', as the Creative fixtures)
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class Brawl {
    constructor(game) {
        this.game = game;
        this.roster = new Map(); // 'k:id' → {k, id, team, type, def}
        this.state = 'setup'; // 'setup' | 'fight' | 'over'
        this.winner = null;
        this.overAt = 0;
        this._list = []; // (the enemy search: refilled once a frame)
        this._listAt = -1;
        this._frame = 0;
        this._person = 0; // (the people made so far: their index in the field's site)
        this._elemN = 0; // (…and the elemental mages' in theirs)
        this.onChange = null; // (the panel: counts, state)
        this._makeMarkers();
        this._strip = null; // (the strip between the teams: made once the ground is there — _makeStrip)
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

    /** The elemental mages' place (kind 'elemental': their brain runs by `foe`, as the Creative fixtures'). */
    _elemSite() {
        const life = this.game.castleLife;
        let def = life?.extra?.get(BRAWL_ELEM_SITE);
        if (!def && life) {
            const G = this.groundAt(0, 0);
            def = {
                id: BRAWL_ELEM_SITE, kind: 'elemental', name: 'Битва существ', x: 0, z: 0, F: G, zone: 80, gx: 0, gz: 0, knights: 0, population: 0, color: 0x555a66,
                people: [], houses: [], stalls: [], fields: [], posts: [], beds: [], chests: [], pens: [], graves: [], graveyards: [], rooms: [], nodes: [], edges: [],
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
            zb.group.rotation.y = team === 'A' ? Math.PI / 2 : -Math.PI / 2; // (facing the other team: A looks to +x)
        } else if (def.kind === 'a') {
            const a = g.animals?._spawn(def.type, new THREE.Vector3(x, y, z), { yaw: team === 'A' ? -Math.PI / 2 : Math.PI / 2 });
            if (!a) { this.why = 'не получилось'; return null; }
            a.servantOf = masterOfTeam(team);
            a.servantUntil = 0;
            a.state = 'graze'; a.attacker = null;
            e = this._join('a', a.id, team, def);
        } else if (def.kind === 'v' && def.elemental) {
            const life = g.castleLife, site = this._elemSite();
            if (!life || !site) { this.why = 'жители недоступны'; return null; }
            const idx = ++this._elemN, m = idx;
            const el = def.elemental;
            site.people.push({ idx, seed: 20261117 + m * 131, role: 'mage', element: el, name: def.label + ' ' + m, female: el === 'water' || m % 4 === 0, mana: def.mana, robe: false, look: el === 'earth' ? earthLook() : elementalLook(el, { tank: el === 'water' }) });
            const cs = life._runtime(site);
            if (!cs.awake) cs.awake = true;
            const yaw = team === 'A' ? Math.PI * 1.5 : Math.PI * 0.5;
            const v = life._activate(cs, idx, { x, y, z, yaw }, 'elemental');
            if (!v) { this.why = 'не получилось'; return null; }
            v.brawl = { team, def, elemental: true };
            v.yaw = yaw;
            e = this._join('v', v.id, team, def);
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
            if (!isMage(def)) { v.servantOf = masterOfTeam(team); v.servantUntil = 0; } // (a knight is a servant of its team; a mage fights by his own brain: _feedFoes)
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
        const site = life?.extra?.get(BRAWL_SITE);
        if (site) { site.people.length = 0; life.state(BRAWL_SITE).killed.clear(); }
        const es = life?.extra?.get(BRAWL_ELEM_SITE);
        if (es) { es.people.length = 0; life.state(BRAWL_ELEM_SITE).killed.clear(); }
        this._person = 0; this._elemN = 0;
        this.state = 'setup';
        this.winner = null;
        this._changed();
    }

    /**
     * The WHOLE field clean (the author 17.11: «кнопка полной очистки карты от повреждений и трупов»): everybody off it, every body and
     * skeleton, everything lying about, the falling pieces landed first, the ground made again where it was broken (craters, ruins).
     * → what was taken away {fighters, bodies, items, chunks}.
     */
    sweep() {
        const g = this.game, out = { fighters: this.count(), bodies: 0, items: 0, chunks: 0, fires: 0, weapons: 0 };
        g.falling?.clear?.(); // (the pieces in the air land — then the ground is made again below them)
        out.fires = this._fireOut();
        this.clear();
        // (whoever else is on the field: a stray zombie, an animal, a corpse nobody put there)
        for (const z of [...(g.zombies || [])]) g.removeZombie(z);
        for (const a of [...(g.animals?.list || [])]) g.animals._remove(a);
        const life = g.castleLife;
        for (const id of [BRAWL_SITE, BRAWL_ELEM_SITE]) {
            const cs = life?.castles?.get(id);
            if (cs) for (const v of [...cs.active.values()]) { v.dead = true; life._deactivate(v); }
        }
        const bodies = g.death?.bodies;
        if (bodies) for (const id of [...bodies.keys()]) { g.death.removeBody(id, false); out.bodies++; }
        const loose = g.items?.loose;
        if (loose) for (const uid of [...loose.keys()]) { g.items.removeLoose(uid); out.items++; }
        out.chunks = g.terrain?.data?.resetModified?.() || 0;
        this._stripToGround();
        // (swords, axes, bows, shields lying about — what the knights dropped, what a blast threw: every weapon not held by a hand)
        out.weapons = 0;
        for (const w of [...(g.weapons?.weapons || [])]) { if (w.holder || g.fixedWeapons?.includes?.(w.id)) continue; g.weapons.remove(w); out.weapons++; }
        g.terrain?.data?.settling?.clear?.();
        this._changed();
        return out;
    }

    /**
     * Every fire on the field out (the author 17.11: «после очистки поля не исчезает огонь»): burning trees and blocks, campfires, the Hellfire
     * and the fires it left, the streams of «Инферно», «Fire Maxima», the fire serpents, everything that burns (creatures). → how many kinds were found alight.
     */
    _fireOut() {
        const g = this.game;
        let n = 0;
        const G = this.groundAt(0, 0);
        if ((g.fire?.douse?.(_v.set(0, G, 0), 400) || 0) > 0) n++; // (trees, grass, houses, wood: Fire.js)
        for (const cf of [...(g.campfires?.list?.values() || [])]) { g.campfires._out(cf); n++; }
        if (g.hellfire && (g.hellfire.state || g.hellfire.left?.length || g.hellfire.npcs?.size || g.hellfire.remote?.size)) n++;
        g.hellfire?.clear?.(); // (the blaze, the ring, what it left on the ground)
        for (const s of g.spells?.spells || []) if (s.kind === 'Inferno' && s.life > 0) { s.life = 0; n++; }
        const fx = g.vortex?.effects;
        if (fx) for (let i = fx.length - 1; i >= 0; i--) if (fx[i].kind === 'fire') { fx.splice(i, 1); n++; }
        try { if (g.fireSerpent?.douse?.(() => true, 10)) n++; } catch (e) { /* no serpent */ }
        if (g.burning?.douseWhere?.(() => true)) n++; // (whoever burns: me and the others)
        g.burnWreck?.fuel?.clear?.();
        return n;
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

    /** The place of the creature `bf|k|id` as a player's place (feet + 2: CastleLife._playerPos's measure), or null when it is gone — the real elemental mages aim at it. */
    foePos(id) {
        const m = /^bf\|([zav])\|(.+)$/.exec(id);
        if (!m) return null;
        const k = m[1], key = k === 'v' ? m[2] : +m[2];
        const p = this.game.servants?.pos(k, key, _d);
        return p ? { x: p.x, y: p.y + 2, z: p.z } : null;
    }

    /** (a few times a second) The elemental mages' foes: the nearest living fighter of the other team, none before the fight / after it. */
    _feedFoes() {
        const L = this.game.castleLife;
        const list = this.state === 'fight' ? this._enemies() : null;
        for (const e of this.roster.values()) {
            if (!isMage(e.def)) continue;
            const v = L?.byId.get(e.id);
            if (!v || v.dead) continue;
            if (!list) { v.foe = null; continue; }
            // (a foe is KEPT: the mage's own mind starts a new fight — a reaction time of seconds — at every change of the foe,
            //  so the nearest one flipping between running zombies kept him forever «reacting»: he changes only when the foe is
            //  gone, or another is much nearer for a while)
            const cur = v.foe && list.find((o) => foeId(o.k, o.id) === v.foe && o.team !== e.team);
            const en = pickEnemy(e.team, v, list);
            const dist = (o) => Math.hypot(o.x - v.x, o.z - v.z);
            const now = performance.now();
            if (cur && (!en || cur === en || dist(cur) < dist(en) * 1.8 || now - (v.brawlFoeAt || 0) < 6000)) continue;
            v.foe = en ? foeId(en.k, en.id) : null;
            v.brawlFoeAt = now;
            if (v.foe && v.cs?.hostile) v.cs.hostile.set(v.foe, Date.now() + 30000); // (the ordinary mages fight whom their place holds hostile: WizardFight)
        }
    }

    // ----------------------------------------------------------- the water mage's shards
    /** (IceShards._bodies) Every fighter on the field as a capsule {id, a, b, r, ref}: the shards fly through the friends and hit the foes (shardHit). */
    shardTargets(out) {
        if (this.state !== 'fight') return;
        const s = this.game.servants;
        for (const e of this.roster.values()) {
            const p = s.pos(e.k, e.id, _d);
            if (!p) continue;
            const r = e.k === 'a' ? (e.type === 'horse' ? 1.0 : 0.8) : 0.7, h = e.k === 'a' ? 1.6 : 3.2;
            out.push({ id: foeId(e.k, e.id), a: new THREE.Vector3(p.x, p.y + 0.3, p.z), b: new THREE.Vector3(p.x, p.y + h, p.z), r, ref: { k: e.k, id: e.id }, team: e.team });
        }
    }

    /** A shard `s` (caster `s.by`) reached the fighter `b`: the foe's — it is hurt (true), a friend's — nothing (false: the shard flies on). */
    shardHit(s, b) {
        const g = this.game, caster = g.castleLife?.byId.get(s.by), team = caster?.brawl?.team;
        if (!team || b.team === team) return false;
        const len = Math.hypot(s.vx, s.vz) || 1;
        g.servants.damage(b.ref, SHARDS.DAMAGE, _d.set(s.vx / len, 0, s.vz / len), masterOfTeam(team), 'servant', { x: caster.x, z: caster.z });
        return true;
    }

    // ----------------------------------------------------------------- the air mage's lift
    /** (LevitationMaxima.npcPlayer) The air mage `v` lifts the creature `ref` {k, id} of the other team: the game's own hold (Levitation.grab) raised by the wind. → true when taken. */
    liftCreature(v, ref) {
        const g = this.game, lev = g.levitation, a = v.elemental;
        const c = lev?._creature(ref.k, ref.id);
        if (!c || !a || c.lev || a.carry) return false;
        if (!lev.grab(ref.k, c, v.id, 'right', 6)) return false;
        a.carry = { ck: ref.k, c };
        a.liftAck = true; a.liftHeld = true; // (held: after the time it is THROWN — ElementalMages: liftT, liftHeld)
        return true;
    }

    /** (ElementalMages.endLift) The lift ends: `thr` {x, y, z} — the creature is thrown with it (the swing), none — it is let fall. */
    throwCarried(v, cr, thr) {
        const c = cr.c, L = c.lev;
        if (!L || L.by !== v.id) return;
        if (thr) L.vel.set(thr.x, thr.y, thr.z);
        this.game.levitation.letGo(cr.ck, c, false);
    }

    /** (a few times a second) A carried creature that died or got away: the mage's hold ends, no throw. */
    _watchCarry() {
        const L = this.game.castleLife;
        for (const e of this.roster.values()) {
            if (!e.def.elemental) continue;
            const v = L?.byId.get(e.id), a = v?.elemental;
            if (!a?.carry) continue;
            if (v.dead || !a.carry.c.lev || a.carry.c.lev.by !== v.id) { a.carry = null; a.liftHeld = false; }
        }
    }

    // ------------------------------------------------------------------ the strip
    /**
     * The strip between the teams, lying on the ground (a ribbon that follows its bumps): a dashed white line in the middle, red on the left
     * and blue on the right. One mesh, one small texture. Made once the land is there.
     */
    _makeStrip() {
        const g = this.game, W = BRAWL.STRIP, Lz = BRAWL.EDGE * 2 + 6, N = 60;
        const cv = document.createElement('canvas');
        cv.width = 128; cv.height = 256;
        const x = cv.getContext('2d');
        const gr = x.createLinearGradient(0, 0, 128, 0);
        gr.addColorStop(0, 'rgba(255,90,68,0.55)'); gr.addColorStop(0.42, 'rgba(255,90,68,0.12)');
        gr.addColorStop(0.58, 'rgba(74,144,255,0.12)'); gr.addColorStop(1, 'rgba(74,144,255,0.55)');
        x.fillStyle = gr; x.fillRect(0, 0, 128, 256);
        x.fillStyle = 'rgba(255,255,255,0.85)';
        for (let y = 0; y < 256; y += 32) x.fillRect(61, y, 6, 18); // (the dashed line of the middle)
        x.fillStyle = 'rgba(255,255,255,0.5)';
        x.fillRect(0, 0, 4, 256); x.fillRect(124, 0, 4, 256); // (the edges)
        const tex = new THREE.CanvasTexture(cv);
        tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, Lz / 8);
        tex.anisotropy = 4;
        const geo = new THREE.PlaneGeometry(W, Lz, 1, N);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setY(i, this.groundAt(pos.getX(i), pos.getZ(i)) + 0.07);
        pos.needsUpdate = true;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide, fog: false });
        const m = new THREE.Mesh(geo, mat);
        m.frustumCulled = false;
        m.renderOrder = 4;
        g.scene.add(m);
        this._strip = m;
    }

    /** The ribbon follows the ground again (after the whole field was made clean: the craters are gone). */
    _stripToGround() {
        const m = this._strip;
        if (!m) return;
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setY(i, this.groundAt(pos.getX(i), pos.getZ(i)) + 0.07);
        pos.needsUpdate = true;
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
        if (!this._strip && this._frame > 20 && this.game.terrain?.data?.landMade?.(0, 0) !== false) this._makeStrip();
        if (this.state === 'fight') {
            const w = winnerOf(this.aliveCount(), true);
            if (w) {
                this.state = 'over';
                this.winner = w;
                this.overAt = performance.now();
                this.game.hud?.setVoice?.(w === 'draw' ? '🤝 Все пали — ничья' : `🏆 Победа: ${TEAMS[w].label}`, true);
                this._changed();
            }
        }
        if (this._frame % 2 === 0) this._updateMarkers();
        if (this._frame % 12 === 3) { this._feedFoes(); this._watchCarry(); }
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
        if (this._strip) { this.game.scene.remove(this._strip); this._strip.geometry.dispose(); this._strip.material.map?.dispose(); this._strip.material.dispose(); }
        this.markers.geometry.dispose();
        this.markers.material.dispose();
    }
}
