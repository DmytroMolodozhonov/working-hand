/**
 * Brawl.js — «Битва существ»: `g.brawl` (rules and numbers: BrawlRules.js).
 *
 * The player puts creatures of two teams on a bounded field (TutorialLand — a meadow with cliffs, nothing else) and starts the fight; then
 * watches or takes control of a fighter (SpectatorCam.js and BrawlControl.js). Zombies, animals and people are «servants» of their team
 * (Servants.js: the pseudo-master `brawl:A` / `brawl:B`), so the walking and the blows of every system are its own; the mages (ordinary and
 * elemental) fight by their OWN real brains, their foe a pseudo player id (foePos / _feedFoes). The hidden world hero only keeps the field loaded.
 *
 * Host only in a network game is not a thing here (a map for one); `authority` is always true.
 */
import * as THREE from 'three';
import { allLog } from '../core/AllLog.js';
import { TEAMS, TEAM_IDS, masterOfTeam, teamOfMaster, customFighter, BRAWL, pickEnemy, winnerOf, placePoints, foeId, isMage, teamAt } from './BrawlRules.js';
import { BrawlControl } from './BrawlControl.js';
import { TUTORIAL } from '../world/TutorialLand.js';
import { SHARDS } from './ElementalRules.js';
import { BLOCK } from '../world/Terrain.js';
import { elementalLook } from './ElementalTestSites.js';
import { earthLook } from './EarthMagicRules.js';
import { SUPER } from './WizardAI.js';
import { kindProfile, courageOf } from './ThreatRank.js';
import { saviorEntry, GX0, SAVIOR, stageOf } from './SaviorRules.js';

export const BRAWL_SITE = 'brawlfield';
export const BRAWL_ELEM_SITE = 'brawlelem'; // (the real elemental mages: a site of the kind 'elemental', as the Creative fixtures)
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class Brawl {
    constructor(game) {
        this.game = game;
        this.roster = new Map(); // 'k:id' → {k, id, team, type, def}
        this.state = 'setup'; // 'setup' | 'countdown' | 'fight' | 'over'
        this.countdown = 0;
        this.control = new BrawlControl(this);
        this.winner = null;
        this.overAt = 0;
        this._aims = new Map(); // 'k:id' → {target: 'k:id', t}: whom each fighter went for lately (the others read «it is after me» from it — ThreatRank)
        this._list = []; // (the enemy search: refilled once a frame)
        this._listAt = -1;
        this._frame = 0;
        this._person = 0; // (the people made so far: their index in the field's site)
        this._elemN = 0; // (…and the elemental mages' in theirs)
        this.onChange = null; // (the panel: counts, state)
        this._makeMarkers();
        this._stripBuilt = false; // (the strip between the teams: blocks, laid once the ground is there — _buildStrip)
        this._muteHero(game);
        if (game.world) game.world.duelFar = 115; // (only the field and the cliffs round it are drawn and made: nothing beyond is of any use — FPS and loading)
        this._quiet();
    }

    /**
     * The player here is only an observer (the author 17.11: «не должно начисляться баллы, писаться подсказки или начисляться мана — я наблюдатель»):
     * no deeds and no mana cells (Achievements), no hints and notices on the screen (only the battle's own words), no animation of mana.
     */
    _muteHero(g) {
        const A = g.achievements;
        if (A) for (const k of ['hit', 'fought', 'killed', 'award', 'gain', 'masterKilled', 'towerWrecked', 'checkTower', 'towerLeftHere']) if (typeof A[k] === 'function') A[k] = () => false;
        const h = g.hud;
        if (h) {
            const mine = (t) => /^(⚔️|🏆|🤝)/.test(String(t ?? '').replace(/<[^>]*>/g, '').trim());
            for (const k of ['setVoice', 'setStatus', 'showHint', 'setHint', 'toast', 'notify', 'setNotice', 'damageFlash', 'manaPulse', 'flashMana']) {
                const o = h[k];
                if (typeof o === 'function') h[k] = (t, ...a) => (k === 'setVoice' || k === 'setStatus' ? (mine(t) ? o.call(h, t, ...a) : undefined) : undefined);
            }
        }
    }

    /** Only what the player puts on the field: no herds, wild plants, birds, bosses (as the tutorial's meadow: Tutorial._quiet), no wandering zombies. */
    _quiet() {
        const g = this.game;
        for (const k of ['flora', 'canaries', 'owls', 'phoenixes', 'spencers', 'dragons', 'plants', 'gargoyles', 'spiders', 'tarons', 'hellPatrol', 'crystals']) if (g[k] && 'enabled' in g[k]) g[k].enabled = false;
        if (g.books) g.books._spawnT = Infinity;
        if (g.animals) g.animals.noWild = true;
        this._hideExtras(); // (its own update stays: the animals of the teams walk and fight)
    }

    /** The scene's leftovers of the ordinary world (the author 17.11: «торнадо сзади, всякое бесполезное»): flowers, magic plants, river rocks, blast rocks — hidden, never drawn. */
    _hideExtras() {
        const sc = this.game.scene;
        if (!sc) return;
        const A = this.game.animals; // (the RUNNING book — the «runner» system's animal 'runbook': nobody on the field put it)
        if (A?.byId) for (const a of [...A.byId.values()]) if (a.type === 'runbook' && !this.roster.has('a:' + a.id)) A._remove(a);
        for (const o of sc.children) if (o.visible && /^(magicFlora|brightFlowers|river-rocks|boom-rocks|boom-ring|reefFish|bodyFinder|apple-gold)$/.test(o.name || '')) o.visible = false;
    }

    // ------------------------------------------------------------- the field
    /** The ground under (x, z): the meadow is flat, a hill is not. */
    groundAt(x, z) {
        const c = this.game.collision;
        let y = c?.groundY ? c.groundY(x, z) : null;
        // (the collision of a chunk that is not registered yet answers 0: a fighter put there stood UNDER the ground and was pushed out sideways — the author 17.11: «зомби не спавнится»; the terrain's own top layer is the truth: its block's centre is at the layer, the surface half a block above the groundY the collision gives)
        const t = this.game.terrain?.data;
        if (t?.topLayer && !(y > TUTORIAL.G - 3)) { const L = t.topLayer(Math.round(x), Math.round(z)); if (Number.isFinite(L) && L > TUTORIAL.G - 3) y = L - 0.5; }
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
    spawn(typeId, team, x, zc, options = null) {
        const g = this.game, def = customFighter(typeId, options);
        this.why = '';
        if (!def || !TEAMS[team]) { this.why = 'нет такого бойца'; return null; }
        if (this.state === 'countdown') { this.why = 'дождитесь начала боя'; return null; }
        if (this.state === 'over') this.clear(); // (a new round: the old field goes)
        if (this.count() >= BRAWL.MAX) { this.why = 'на поле уже много бойцов'; return null; }
        if (g.terrain?.data?.landMade && !g.terrain.data.landMade(x, zc)) { this.why = 'поле ещё строится — подождите секунду'; return null; }
        const z = zc, y = this.groundAt(x, zc);
        let e = null;
        if (def.kind === 'z') {
            const zb = g._createZombie(new THREE.Vector3(x, y + 0.5, zc));
            e = this._join('z', zb.id, team, def);
            zb.group.position.y = y + (zb.gOff ?? 1); // (the Zombie constructor always starts at y = 0.5 and ignores the height: on this land the ground is at ~10, the zombie stood inside it and was pushed out sideways — «зомби не спавнится», 17.11)
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
        } else if (def.kind === 'v' && def.savior) {
            const life = g.castleLife, site = this._site();
            if (!life || !site || !g.savior) { this.why = 'жители недоступны'; return null; }
            if (g.savior.v && !g.savior.v.dead && this.roster.has('v:' + g.savior.v.id)) { this.why = 'Спаситель на поле только один'; return null; }
            const idx = ++this._person;
            site.people.push({ ...saviorEntry(GX0 + idx, 0), idx });
            const cs = life._runtime(site);
            if (!cs.awake) cs.awake = true;
            const yaw = team === 'A' ? Math.PI * 1.5 : Math.PI * 0.5;
            const v = life._activate(cs, idx, { x, y: y + SAVIOR.FLY_H, z, yaw }, 'savior');
            if (!v) { this.why = 'не получилось'; return null; }
            v.brawl = { team, def };
            if (isMage(def)) { v.reactLag = BRAWL.REACT; v.readyUntil = Date.now() + 60000; } // (a mage is ready at once)
            if (isMage(def)) { v.keepAway = true; v.W = { ...v.W, range: [14, 26], blink: v.W.blink || { cd: 8 } }; } // (the author 17.11: a mage of any rank keeps away and does not let the enemy come near — runs off, shoves him back, blinks away)
            v.yaw = yaw;
            g.savior.adoptBrawl(v, stageOf(0));
            e = this._join('v', v.id, team, def);
        } else if (def.kind === 'v' && def.elemental) {
            const life = g.castleLife, site = this._elemSite();
            if (!life || !site) { this.why = 'жители недоступны'; return null; }
            const idx = ++this._elemN, m = idx;
            const el = def.elemental;
            site.people.push({ idx, seed: 20261117 + m * 131, role: 'mage', element: el, name: def.custom ? def.label : def.label + ' ' + m, female: el === 'water' || m % 4 === 0, mana: def.mana, robe: false, look: el === 'earth' ? earthLook() : elementalLook(el, { tank: el === 'water' }) });
            const cs = life._runtime(site);
            if (!cs.awake) cs.awake = true;
            const yaw = team === 'A' ? Math.PI * 1.5 : Math.PI * 0.5;
            const v = life._activate(cs, idx, { x, y, z, yaw }, 'elemental');
            if (!v) { this.why = 'не получилось'; return null; }
            if (def.custom) v.mana = v.maxMana = def.mana;
            v.brawl = { team, def, elemental: true };
            v.reactLag = BRAWL.REACT; v.readyUntil = Date.now() + 60000; // (ready at once: not the seconds of a first surprise the ordinary roll gives — _feedFoes keeps it)
            v.yaw = yaw;
            e = this._join('v', v.id, team, def);
        } else if (def.kind === 'v') {
            const life = g.castleLife, site = this._site();
            if (!life || !site) { this.why = 'жители недоступны'; return null; }
            const idx = ++this._person;
            const m = this._person;
            site.people.push({ idx, role: def.role, female: m % 3 === 0, name: def.custom ? def.label : def.label + ' ' + m, home: -1, stall: -1, seed: 20261116 + m * 97, rank: def.rank, brave: 1, mana: def.mana, ...(def.outfit ? { outfit: def.outfit } : {}) });
            const cs = life._runtime(site);
            if (!cs.awake) cs.awake = true;
            const yaw = team === 'A' ? Math.PI * 1.5 : Math.PI * 0.5;
            const v = life._activate(cs, idx, { x, y, z, yaw }, 'stall', { post: { x, y, z, yaw }, hp: undefined });
            if (!v) { this.why = 'не получилось'; return null; }
            if (!isMage(def)) { v.servantOf = masterOfTeam(team); v.servantUntil = 0; } // (a knight is a servant of its team; a mage fights by his own brain: _feedFoes)
            v.brawl = { team, def };
            // (17.11: the mage's range on the field was given to the Saviour alone — the ordinary mages kept their tower range (8–16 m) and stood idle out of reach
            //  of an air mage at 21–24 m. Every mage of any rank: ready at once, keeps away and fights from 14–26 m, shoves a near foe back, blinks away)
            if (isMage(def)) { v.reactLag = BRAWL.REACT; v.readyUntil = Date.now() + 60000; v.keepAway = true; v.W = { ...v.W, range: [14, 26], blink: v.W?.blink || { cd: 8 } }; }
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

    /** Take one fighter off the field (a test, a sweep of one): the creature and its place in the roster. */
    removeFighter(k, id) {
        const g = this.game, life = g.castleLife;
        if (this.control.entry?.k === k && this.control.entry.id === id) this.control.release(false);
        if (k === 'z') { const z = g.zombieById?.get(id); if (z) g.removeZombie(z); }
        else if (k === 'a') { const a = g.animals?.byId.get(id); if (a) g.animals._remove(a); }
        else if (k === 'v') { const v = life?.byId.get(id); if (v) { v.dead = true; life._deactivate(v); } }
        this.roster.delete(k + ':' + id);
        this._changed();
    }

    /** Take everybody off the field. */
    clear() {
        this.control.release(false);
        this._endCountdown();
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
        this._stripBuilt = false; this._buildStrip(); // (the ground was made again: the strip of blocks with it)
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
        if (this.state !== 'setup') return false;
        const a = this.aliveCount();
        if (!(a.A > 0 && a.B > 0)) { this.why = 'нужны бойцы с обеих сторон'; return false; }
        if (this.control.entry) {
            this.state = 'countdown';
            this.countdown = BRAWL.COUNTDOWN;
            this._showGlass();
            this._changed();
        } else this._beginFight(a);
        return true;
    }

    _showGlass() {
        if (!this.glass) {
            const half = BRAWL.EDGE + 4;
            const geometry = new THREE.BoxGeometry(.08, 16, half * 2);
            const pane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
                color: 0x89d8f7, transparent: true, opacity: .24, depthWrite: false,
            }));
            const lines = [0, -6, -half, 0, -6, half, 0, 8, -half, 0, 8, half];
            for (let z = -half; z <= half; z += 7) lines.push(0, -8, z, 0, 8, z);
            const grid = new THREE.BufferGeometry();
            grid.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
            const edges = new THREE.LineSegments(grid, new THREE.LineBasicMaterial({
                color: 0xc9f2ff, transparent: true, opacity: .66, depthWrite: false,
            }));
            pane.add(edges);
            pane.renderOrder = 6;
            this.game.scene.add(pane);
            this.glass = pane;
        }
        this.glass.position.y = this.groundAt(0, 0) + 6;
        this.glass.visible = true;
    }

    _endCountdown() {
        this.countdown = 0;
        if (this.glass) this.glass.visible = false;
    }

    _beginFight(a = this.aliveCount()) {
        this._endCountdown();
        this.state = 'fight';
        this.winner = null;
        this._logT = 0; this._hook();
        allLog('Битва', `бой начался: красных ${a.A}, синих ${a.B}; бойцы: ` + [...this.roster.values()].map((e) => `${e.team}:${e.type}#${e.id}`).join(' '));
        this.game.hud?.setVoice?.('⚔️ Бой начался', true);
        this._feedFoes();
        this._changed();
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

    /**
     * (Servants.enemyFor for a brawl master) the foe of one fighter: no longer just the nearest one (the author 19.11: «кто ближе, кто опаснее, на кого отвлекаться первым»):
     * ThreatRank weighs the creatures of the other team by their power, how soon they are here, whether they are after ME, whom they have hurt, how near death they are
     * — and the choice is kept (no running between two) until a rival is clearly worse for him. A team fighter never runs (the fight must end): the stance only shapes the target.
     * → {k, id, x, z} | null. Thought of ≈ 3 times a second for each, the answer kept between.
     */
    enemyFor(self, master, me) {
        if (this.state !== 'fight') return null;
        const team = teamOfMaster(master);
        if (!team) return null;
        const list = this._enemies();
        const T = this.game.threats, c = self && this.game.servants?.find(self.k, self.id);
        if (!T || !c) { const e = pickEnemy(team, me, list); return e ? { k: e.k, id: e.id, x: e.x, z: e.z } : null; }
        const key = self.k + ':' + self.id, now = performance.now() / 1000;
        const mind = T.mind(c);
        if (!(c._thinkT > now) || !c._tmFoe) {
            c._thinkT = now + 0.28 + Math.random() * 0.12;
            const atts = [];
            for (const e of list) if (e.team !== team) atts.push(this.attackerOf(e, key));
            if (!atts.length) { c._tmFoe = null; return null; }
            const ent = this.roster.get(key);
            const P = kindProfile(ent?.type), my = { x: me.x, z: me.z, hp: this._hpFrac(self.k, c), maxHp: 20, power: P.power, reach: P.reach, speed: P.speed, ranged: P.ranged, courage: courageOf(ent?.type), armor: 0, allies: [] };
            const d = mind.think(my, atts, T.book(c), now, { noFlee: true });
            c._tmFoe = d.foe;
            c._tmStance = d.stance;
            if (d.changed && d.foe != null) this._hook?.({ ev: 'target', by: key, foe: d.foe, why: d.why });
        }
        const e = c._tmFoe != null ? list.find((o) => foeId(o.k, o.id) === c._tmFoe && o.team !== team) : null;
        const pick = e || pickEnemy(team, me, list);
        if (!pick) return null;
        this._aims.set(key, { target: pick.k + ':' + pick.id, t: now });
        return { k: pick.k, id: pick.id, x: pick.x, z: pick.z };
    }

    /** How much of its life a fighter has left (0…1). */
    _hpFrac(k, c) {
        const f = k === 'v' ? c.hp / (c.maxHp || 1) : k === 'a' ? c.hp / (c.baseHp || c.hp || 1) : k === 'z' ? c.health / (c.maxHealth || 5) : 1;
        return Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 1;
    }

    /** A fighter of the field as an attacker of `selfKey` (ThreatRank's shape): its power by kind, its life, and whether it has chosen THIS one lately. */
    attackerOf(e, self) {
        const selfKey = typeof self === 'string' ? self : 'v:' + self.id;
        const c = this.game.servants?.find(e.k, e.id), P = kindProfile(e.def?.id || e.type);
        const a = this._aims.get(e.k + ':' + e.id), now = performance.now() / 1000;
        const aimed = a && now - a.t < 1.6 ? (a.target === selfKey ? 1 : 0.15) : 0.45; // (it is after me / after another / not known yet)
        return { id: foeId(e.k, e.id), x: e.x, z: e.z, hp: c ? this._hpFrac(e.k, c) : 1, power: P.power, reach: P.reach, speed: P.speed, ranged: P.ranged, aimed, down: !!(c && (c.stunT > 0 || c.down || c.lying)), airborne: !!(c && (c.fly || c.lev)) };
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
            if (!isMage(e.def) || e === this.control.entry) continue;
            const v = L?.byId.get(e.id);
            if (!v || v.dead) continue;
            v.reactLag = BRAWL.REACT; v.readyUntil = Date.now() + 60000; // (in the middle of a battle a mage is on his guard: not the seconds of a first surprise before he lifts the wand — knights cross the field in two)
            if (!list) { v.foe = null; continue; }
            // (the author 17.11: «в режиме боёв враждебность должна быть максимальная всегда у всех соперников» — every fighter of the other team is HIS
            //  enemy for the whole fight, not one foe for 30 s: the ordinary mage's own mind drops a foe that is not held hostile, and never looks at the others)
            if (v.cs?.hostile) for (const o of list) if (o.team !== e.team) v.cs.hostile.set(foeId(o.k, o.id), Date.now() + 600000);
            // (a foe is KEPT: the mage's own mind starts a new fight — a reaction time of seconds — at every change of the foe,
            //  so the nearest one flipping between running zombies kept him forever «reacting»: he changes only when the foe is
            //  gone, or another is much nearer for a while)
            // (19.11: the foe is chosen by ThreatRank — who is the danger to HIM, whom first — and kept; Threats.step also decides the stance, and for a field fighter never to run)
            const T = this.game.threats;
            if (T) {
                T.step(v, 0, { event: 'feed' });
                if (v.foe != null && !list.some((o) => foeId(o.k, o.id) === v.foe && o.team !== e.team)) v.foe = null; // (his foe is gone: the nearest of the other team, below)
            }
            if (!v.foe) {
                const en = pickEnemy(e.team, v, list);
                v.foe = en ? foeId(en.k, en.id) : null;
                v.brawlFoeAt = performance.now();
            }
            if (v.foe && v.cs?.hostile) v.cs.hostile.set(v.foe, Date.now() + 30000); // (the ordinary mages fight whom their place holds hostile: WizardFight)
            if (v.foe) this._aims.set('v:' + v.id, { target: v.foe.slice(3).replace('|', ':'), t: performance.now() / 1000 }); // (whom he is after: the others read it)
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
     * The strip between the teams — made of ORDINARY BLOCKS laid into the ground's top layer (the author 17.11: «не нарисованная, а из обычных
     * блоков»): red edge on the left, blue on the right, grey between, a dashed white line along the middle. Made once the land is there, and
     * again after the field was made clean (the ground is made again then).
     */
    /** The tutorial's little hill is in the middle of the field — the strip must run straight and the teams must see each other: its blocks are taken off. → false: its land is not made yet. */
    _levelHill(data) {
        const H = TUTORIAL.HILL, R = Math.ceil(H.r + 1.5), G = TUTORIAL.G;
        if (data.landMade && (!data.landMade(H.x - R, H.z) || !data.landMade(H.x + R, H.z) || !data.landMade(H.x, H.z - R) || !data.landMade(H.x, H.z + R))) return false;
        for (let ix = H.x - R; ix <= H.x + R; ix++) for (let iz = H.z - R; iz <= H.z + R; iz++) {
            if (Math.hypot(ix - H.x, iz - H.z) > H.r + 1.5) continue;
            const top = data.topLayer(ix, iz);
            if (top <= G) continue;
            for (let L = top; L > G; L--) data.set(ix, L, iz, BLOCK.AIR);
            data.set(ix, G, iz, BLOCK.GRASS);
        }
        // the tutorial's cobbled ring and the path round it (r < 10, under the strip): grass like all the field — the field is clean and even
        const R2 = TUTORIAL.PATH[1] + 1;
        if (data.landMade && (!data.landMade(-R2, -R2) || !data.landMade(R2, R2))) return false;
        for (let ix = -Math.ceil(R2); ix <= Math.ceil(R2); ix++) for (let iz = -Math.ceil(R2); iz <= Math.ceil(R2); iz++) {
            if (Math.hypot(ix, iz) > R2) continue;
            const top = data.topLayer(ix, iz), t = data.get(ix, top, iz);
            if (t === BLOCK.PATH || t === BLOCK.COBBLE) data.set(ix, top, iz, BLOCK.GRASS);
        }
        return true;
    }

    _buildStrip() {
        const data = this.game.terrain?.data;
        if (!data) return false;
        const half = BRAWL.STRIP / 2, z0 = -BRAWL.EDGE - 3, z1 = BRAWL.EDGE + 3; // (an EVEN width: a block ix covers x ∈ [ix, ix+1), so −half … half−1 is exactly symmetric about x = 0; the dashed middle line is the two middle blocks)
        let n = 0;
        if (!this._levelHill(data)) return false;
        for (let iz = z0; iz <= z1; iz++) {
            if (data.landMade && !data.landMade(0, iz)) return false;
            for (let ix = -half; ix < half; ix++) {
                const type = ix === -half ? BLOCK.ROOF_RED : ix === half - 1 ? BLOCK.ROOF_BLUE : (ix === 0 || ix === -1) && ((iz >> 1) & 1) ? BLOCK.CS_WHITE : BLOCK.CS_GREY;
                const L = data.topLayer(ix, iz);
                if (data.get(ix, L, iz) !== type) { data.set(ix, L, iz, type); n++; }
            }
        }
        this._stripBuilt = true;
        return true;
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
    /** «Битва» in the general journal (Настройки → Журнал → Общие логи): who casts what at whom, blows on the mages, a snapshot of every mage each 2 s — for the analysis of a fight. */
    _hook() {
        if (this._hooked) return;
        this._hooked = true;
        const g = this.game, mine = (id) => typeof id === 'string' && this.roster.has('v:' + id);
        const em = g.elementalMages;
        if (em?.cast) { const o = em.cast.bind(em); em.cast = (v, name, ...a) => { if (this.state === 'fight' && mine(v?.id)) allLog('Битва', `${v.name || v.id} (${v.element}) колдует ${name} на ${v.foe || '—'}`); return o(v, name, ...a); }; }
        const duel = g.duel;
        if (duel?._addBolt) { const o = duel._addBolt.bind(duel); duel._addBolt = (b) => { if (this.state === 'fight' && b && mine(b.by)) allLog('Битва', `${b.by} пускает заряд ${b.spell} → ${b.tk}:${b.tid}`); return o(b); }; }
        const ci = g.creatureImpact;
        if (ci?.apply) { const o = ci.apply.bind(ci); ci.apply = (c, op) => { const r = o(c, op); if (this.state === 'fight' && r !== 'none' && (mine(op?.by) || this.roster.has('v:' + c?.id)) && this._isMageId(c?.id)) allLog('Битва', `толчок ${op?.spell || op?.kind || '?'} от ${op?.by || '—'} на ${c?.id ?? c?.name ?? '?'}: ${r}`); return r; }; }
        const sv = g.servants;
        if (sv?.damage) { const o = sv.damage.bind(sv); sv.damage = (ref, ...a) => { if (this.state === 'fight' && ref?.k === 'v' && this._isMageId(ref.id)) allLog('Битва', `урон по ${ref?.k}:${ref?.id}: ${Math.round((a[0] ?? 0) * 10) / 10} от ${a[2] || '—'}`); return o(ref, ...a); }; }
    }

    /** How many fighters of the OTHER team stand round the foe of `v` (a crowd calls for a group spell). */
    crowdAround(v) {
        const f = v.foe && this.foePos(v.foe);
        if (!f) return 1;
        const e = this.roster.get('v:' + v.id), team = e?.team;
        let n = 0, near = 0;
        for (const o of this._enemies()) {
            if (o.team === team) continue;
            if (Math.hypot(o.x - f.x, o.z - f.z) < SUPER.CROWD_R) n++; // (a crowd round his foe)
            if (Math.hypot(o.x - v.x, o.z - v.z) < SUPER.CROWD_R + 6) near++; // (or a crowd coming at him)
        }
        return Math.max(1, n, near);
    }

    /** What the dead dropped: a weapon lying on the field for 15 s is taken away (hundreds of them hung in the scene — the weak cards gave up). */
    _tidyWeapons() {
        const g = this.game, now = performance.now();
        for (const w of [...(g.weapons?.weapons || [])]) {
            if (w.holder || g.fixedWeapons?.includes?.(w.id)) { w._lyingAt = 0; continue; }
            if (!w._lyingAt) { w._lyingAt = now; continue; }
            if (now - w._lyingAt > 15000) g.weapons.remove(w);
        }
    }

    /**
     * Friendly fire (the author 17.11: «защита от убийства союзников — один задевает другого, пусть расходятся и проверяют, есть ли союзник впереди»):
     * is a fighter of the caster's OWN team in his line of fire to `fp` (a thin corridor), or — for a spell that hits a place — near the target?
     * true: he does not cast; he steps aside (v.brawlSide) and tries again. Only the team counts: the enemy in the way is a target, not an obstacle.
     */
    allyBlock(v, fp, name = '') {
        const e0 = this.roster.get('v:' + v.id);
        if (!e0 || this.state !== 'fight') return false;
        const s = this.game.servants, dx = fp.x - v.x, dz = fp.z - v.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
        const area = /Bombardo|Fireball|Inferno|Thunderwave|Earthquake|WindImpulse|Hellfire|Serpent/.test(name);
        for (const e of this.roster.values()) {
            if (e === e0 || e.team !== e0.team) continue;
            const p = s.pos(e.k, e.id, _d);
            if (!p) continue;
            const ox = p.x - v.x, oz = p.z - v.z, along = ox * ux + oz * uz, lat = Math.abs(ox * -uz + oz * ux);
            let hit = along > 1 && along < L + 1.2 && lat < 1.7; // (in the line)
            if (!hit && area && Math.hypot(p.x - fp.x, p.z - fp.z) < 4.8) hit = true; // (a blast / a quake on the place where his friend stands)
            if (!hit) continue;
            const sg = (ox * -uz + oz * ux) > 0 ? -1 : 1; // (aside: to the other side of the friend)
            v.brawlSide = { x: -uz * sg, z: ux * sg, t: 1.3 };
            return true;
        }
        return false;
    }

    _isMageId(id) { const e = this.roster.get('v:' + id); return !!e && isMage(e.def); }

    _snapshot() {
        const L = this.game.castleLife;
        for (const e of this.roster.values()) {
            const v = e.k === 'v' ? L?.byId.get(e.id) : null;
            if (!v || v.dead || !isMage(e.def)) continue; // (the mages only: the rest are counted below — fifty lines every two seconds were a flood)
            const a = v.elemental || v.earth || {}, foe = v.foe ? this.foePos(v.foe) : null;
            allLog('Битва', `${e.team}:${e.type}#${e.id} hp ${Math.round(v.hp)} мана ${Math.round(v.mana ?? 0)} режим ${v.mode}${a.phase ? '/' + a.phase : ''}${v.fly ? ' летит' : ''}${v.stunT > 0 ? ' оглушён' : ''} цель ${v.foe || '—'} дист ${foe ? Math.round(Math.hypot(foe.x - v.x, foe.z - v.z)) : '—'} реакция ${v.reactLag?.t ?? '—'}`);
        }
        const al = this.aliveCount();
        let hurt = 0; for (const e of this.roster.values()) if (e.k === 'v' && !isMage(e.def)) { const v = L?.byId.get(e.id); if (v && !v.dead && v.hp < v.maxHp * 0.5) hurt++; }
        allLog('Битва', `раненых рыцарей (<50%): ${hurt}; живых: красные ${al.A}, синие ${al.B}`);
    }

    update(dt, elapsed = dt) {
        this._frame++;
        if (this.control.entry && !this._alive(this.control.entry)) {
            this.control.release();
        }
        if (this.state === 'countdown') {
            const seconds = Math.ceil(this.countdown);
            this.countdown -= elapsed;
            if (this.countdown <= 0 || !this.control.entry) this._beginFight();
            else if (seconds !== Math.ceil(this.countdown)) this._changed();
        }
        if (!this._stripBuilt && this._frame > 20 && this.game.terrain?.data?.landMade?.(0, 0) !== false) this._buildStrip();
        if (this.state === 'fight') {
            this._logT = (this._logT || 0) + dt; if (this._logT >= 2) { this._logT = 0; this._snapshot(); }
            const w = winnerOf(this.aliveCount(), true);
            if (w) {
                this.state = 'over';
                this.winner = w;
                this.control.release(false);
                allLog('Битва', `бой окончен: ${w === 'draw' ? 'ничья' : 'победа ' + w}`);
                this.overAt = performance.now();
                this.game.hud?.setVoice?.(w === 'draw' ? '🤝 Все пали — ничья' : `🏆 Победа: ${TEAMS[w].label}`, true);
                this._changed();
            }
        }
        if (this._frame % 2 === 0) this._updateMarkers();
        if (this.control.entry && this._frame % 6 === 0) this.game.brawlPanel?.updateStatus();
        if (this._frame % 12 === 3) { this._feedFoes(); this._watchCarry(); }
        if (this._frame % 30 === 0) { // (no stranger on the field: a zombie nobody put there goes)
            for (const z of [...this.game.zombies]) if (!this.roster.has('z:' + z.id) && !z.isDying) this.game.removeZombie(z);
        }
        if (this._frame % 30 === 0 && this.state !== 'setup') this._changed(true); // (the panel's counters: only while there is a fight to count)
        if (this._frame % 90 === 7) { this._tidyWeapons(); this._hideExtras(); }
    }

    _changed(soft = false) {
        this.onChange?.({ state: this.state, winner: this.winner, countdown: Math.ceil(this.countdown), total: { A: this.count('A'), B: this.count('B') }, alive: this.aliveCount(), soft });
    }

    dispose() {
        try { this.clear(); } catch (e) { /* the game is going down: nothing to take off */ }
        this.game.scene.remove(this.markers);
        this.markers.geometry.dispose();
        this.markers.material.dispose();
        if (this.glass) {
            this.game.scene.remove(this.glass);
            this.glass.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
        }
    }
}
