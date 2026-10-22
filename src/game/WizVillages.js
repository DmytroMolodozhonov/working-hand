/**
 * WizVillages.js — the life of the wizards' settlements (src/world/WizardVillages.js).
 *
 * The people (a part of CastleLife / WizardLife — the host decides, as for all the castle people):
 *  - by day the Elder sits in his chair in the town hall, the sellers stand behind their counters in
 *    the crooked market lane, a wizard brews at the big cauldron, another reads in the library, two
 *    warm themselves at the central fire; the townsfolk come out of their houses near the players and
 *    walk about: to the market, the plaza, the gardens, the hall and the library, back home;
 *  - at night most sleep at home (NightLife: in their beds), the shops shut, three wizards walk the
 *    streets with «Люмос» on their wands; trouble — everybody is up (NightLife._tower).
 * Kill a seller and his counter is free to take — but the wizards who saw it come for you (CastleLife).
 *
 * The place (every computer; the host makes what is shared):
 *  - the central fire never goes out: the host keeps a campfire burning in its ring (Campfires.js);
 *  - the plaque on the statue's pedestal: «Coprus the Clever» (one shared texture);
 *  - the library's table: 2–5 scrolls of simple spells; taken — gone for good (remembered as an opened
 *    chest: `_openedChests`, saved with the world); the books of the world's history lie on its desk
 *    (`def.lore` — LoreLibrary.js lays them when the place wakes).
 */

import * as THREE from 'three';
import { CAMPFIRE } from './Campfires.js';
import { spellScroll, makeItemModel } from './ItemTypes.js';
import { CHUNK, chunkKey } from '../world/Terrain.js';

const SCROLL_TAKEN = 1.2; // m: a library scroll moved this far from its place (or picked up) is taken

/** The day places besides the Elder and the sellers: the brewer, the librarian, two at the fire. */
function villagePosts(def) {
    const out = [];
    for (const s of def.spots || []) {
        if (s.kind === 'cauldron') out.push({ key: 'brew', at: { x: s.x, y: s.y, z: s.z, yaw: s.yaw ?? 0 }, job: 'brew' });
        if (s.kind === 'desk') out.push({ key: 'library', at: { x: s.x, y: s.y, z: s.z, yaw: s.yaw ?? 0 }, job: 'desk' });
    }
    const f = def.fire;
    if (f) {
        for (const [k, dx, dz] of [['fire0', 4.2, 1.2], ['fire1', -3.8, -1.9]]) {
            const x = f.x + dx, z = f.z + dz;
            out.push({ key: k, at: { x, y: f.y, z, yaw: Math.atan2(dx, dz) }, job: 'star' }); // (facing the fire)
        }
    }
    return out;
}

/** Is the land at (x, z) made on this computer? (A person put where it is not would make it now, in the frame: wait for it.) */
function landReady(L, x, z) {
    const d = L.game.world?.terrain?.data;
    return !d?.chunks || d.chunks.has(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
}

const STAFF_STEP = 4; // people made at most in one go (a model each: flying in, all at once was a long frame); the rest next frames

/** (host) The settlement's people at their places for the day / the night (a few at a time: `cs.vstaff` — crowdVillage goes on). */
export function staffVillage(L, cs) {
    const def = cs.def;
    const st = L.state(def.id);
    const night = cs.wizNight;
    let made = 0;
    cs.vstaff = false;
    const put = (idx, post, job) => {
        if (!post || idx < 0) return null;
        const at = { x: post.x, y: post.y, z: post.z, yaw: post.yaw ?? 0 };
        let v = cs.active.get(idx);
        if (v) { if (!v.foe && !v.dead) { v.job = job; v.post = at; v.path = null; } return v; }
        if (st.killed.has(idx)) return null;
        if (made >= STAFF_STEP || !landReady(L, at.x, at.z)) { cs.vstaff = true; return null; }
        made++;
        return L._activate(cs, idx, at, job, { post: at });
    };
    // the Elder: in his chair in the hall by day, asleep at home at night
    if (!st.kingDead) {
        if (night) L.night.towerRest(cs, 0);
        else put(0, def.throne, 'sit');
    }
    // the sellers: behind their counters by day; at night the goods are packed away and they go home
    if (night) L.night?._closeStalls?.(cs);
    def.stalls.forEach((s, i) => {
        const idx = 1 + i;
        if (!night) put(idx, { ...s.back, yaw: s.yaw }, 'stall');
        else { const v = cs.active.get(idx); if (v && !v.foe && !v.dead) L._deactivate(v); }
    });
    const posts = cs.vposts || (cs.vposts = villagePosts(def));
    if (!night) {
        for (const v of [...cs.active.values()]) if (v.watch && !v.foe && !v.dead) { v.watch = false; v.rounds = null; L._deactivate(v); } // (the night watch goes to bed)
        for (const p of posts) {
            if ([...cs.active.values()].some((v) => v.vpost === p.key && !v.dead)) continue;
            const v = put(L._freeCommoner(cs), p.at, p.job);
            if (v) v.vpost = p.key;
        }
    } else {
        for (const v of [...cs.active.values()]) if (v.vpost && !v.foe && !v.dead) L._deactivate(v);
        // the night watch: three wizards walk the streets (NightLife: the rounds between the tagged places)
        let n = 0;
        for (const v of cs.active.values()) if (v.watch && !v.dead) n++;
        const plaza = cs.graph.tagged('plaza');
        for (let k = n; k < 3 && plaza.length; k++) {
            const node = cs.graph.nodes[plaza[(k * 2) % plaza.length]];
            const v = put(L._freeCommoner(cs), { x: node.x, y: node.y, z: node.z }, 'watch');
            if (v) { v.post = null; L.night.towerWatch(v); }
        }
    }
}

/** (host) Keep townsfolk about near the players (none at night: they sleep — NightLife). */
export function crowdVillage(L, cs, dt) {
    const def = cs.def;
    if (cs.vstaff) staffVillage(L, cs); // (the day's / the night's places not all taken yet)
    cs.spawnT -= dt;
    if (cs.spawnT > 0) return;
    cs.spawnT = 0.8;
    const players = L._players().filter((pl) => L._inLand(def, pl.p, 40));
    if (!players.length) return;
    if (L.fright?.quietFor(cs) < 40) return; // (danger about: nobody comes out now — VillagerFear.js)
    const q = [0.45, 0.65, 0.85, 1][L.game.quality?.level ?? 3] ?? 1;
    const want = Math.round(Math.min(14, 5 + def.population / 30) * (L.night?.crowdK() ?? (L.game.isNight ? 0 : 1)) * q);
    let count = 0;
    for (const v of cs.active.values()) if (v.job === 'wander' && !v.dead) count++;
    for (const v of [...cs.active.values()]) {
        if (v.job !== 'wander' || v.foe) continue;
        if (!players.some((pl) => Math.hypot(pl.p.x - v.x, pl.p.z - v.z) < 100)) { L._deactivate(v); count--; }
    }
    if (count >= want) return;
    // out of a house (or into the street from a garden), not right before the player's eyes
    const pl = players[Math.floor(Math.random() * players.length)];
    const g = cs.graph;
    const from = g.tagged('home');
    let node = -1;
    for (let t = 0; t < 12 && from.length; t++) {
        const n = g.nodes[from[Math.floor(Math.random() * from.length)]];
        const d = Math.hypot(n.x - pl.p.x, n.z - pl.p.z);
        if (d > 22 && d < 70 && landReady(L, n.x, n.z)) { node = n.id; break; }
    }
    if (node < 0) return;
    const idx = L._freeCommoner(cs);
    if (idx < 0) return;
    const n = g.nodes[node];
    const v = L._activate(cs, idx, { x: n.x, y: n.y, z: n.z }, 'wander');
    if (v) {
        v.node = node; v.trips = 1 + Math.floor(Math.random() * 3);
        if (Math.random() < 0.4) v.waitT = 4 + Math.random() * 12; else L._nextTrip(v);
    }
}

/** A townsman picks where to go: the market, the plaza and its fire, a garden, the hall, the library… */
export function villageTrip(L, v) {
    const g = v.cs.graph;
    v.trips--;
    const choose = (tag) => { const l = g.tagged(tag); return l.length ? l[Math.floor(Math.random() * l.length)] : -1; };
    const r = Math.random();
    let node = r < 0.22 ? choose('stall') : r < 0.34 ? choose('market') : r < 0.52 ? choose('plaza') : r < 0.62 ? choose('garden')
        : r < 0.74 ? choose('room') : r < 0.78 ? choose('cauldron') : r < 0.84 ? choose('ring') : choose('home');
    if (node < 0) node = choose('plaza');
    if (node < 0) return false;
    v.purpose = g.nodes[node]?.tag || '';
    L._goTo(v, node);
    return true;
}

// ------------------------------------------------------------ the place
const PLAQUE_W = 2.9, PLAQUE_H = 0.9;
let _plaque = null;
/** The plaque's shape, texture and material (shared by every settlement). */
function plaqueParts() {
    if (_plaque) return _plaque;
    let map = null;
    if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = 512; c.height = 160;
        const x = c.getContext('2d');
        x.fillStyle = '#2c2a33'; x.fillRect(0, 0, 512, 160);
        x.strokeStyle = '#c9a44a'; x.lineWidth = 8; x.strokeRect(10, 10, 492, 140);
        x.fillStyle = '#e8c766'; x.font = 'bold 54px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('Coprus the Clever', 256, 82);
        map = new THREE.CanvasTexture(c);
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 4;
    }
    _plaque = { geo: new THREE.PlaneGeometry(PLAQUE_W, PLAQUE_H), mat: new THREE.MeshLambertMaterial({ map, color: 0xffffff }) };
    return _plaque;
}

export class WizVillages {
    constructor(game) {
        this.game = game;
        this.plaques = new Map(); // site id -> mesh
        this.scrolls = new Map(); // site id -> [{id, uid, x, y, z}]
        this.fires = new Map(); // site id -> its campfire (the host's)
        this._t = 0;
        plaqueParts(); // (made now: prewarm compiles its material)
    }

    get auth() { return this.game.authority; }

    /** For Game.prewarm: the plaque, and every kind of good the market's counters show (WizardMarket.js). */
    sampleModels() {
        const P = plaqueParts();
        const goods = [{ kind: 'potion', rec: 'heal', color: 0xe0405a }, { kind: 'potion', rec: 'invis', color: 0x9a7bd8 }, { kind: 'flask', count: 3 }, { kind: 'crystal', count: 1 },
            { kind: 'web', count: 1 }, { kind: 'glass', count: 3 }, { kind: 'minotaurHorn' }, { kind: 'phoenixFeather', count: 1 }, { kind: 'owlFeather', count: 1 },
            { kind: 'book', id: 123456, spells: [] }, { kind: 'robe', magic: false, color: 0x2c3e7a }, { kind: 'armor', piece: 'legs', magic: true }, { kind: 'shield', type: 2, magic: true, max: 30 },
            { kind: 'wand', model: 7, color: 0x33aa66, power: 20 }, { kind: 'scroll', stat: 'spell', spell: 'Thunderwave' }];
        return [new THREE.Mesh(P.geo, P.mat), ...goods.map((it) => makeItemModel(it))];
    }

    update(dt) {
        this._t -= dt;
        if (this._t > 0) return;
        this._t = 1;
        const g = this.game, life = g.castleLife;
        if (!life?.castles) return;
        const seen = new Set();
        for (const cs of life.castles.values()) {
            if (cs.def.kind !== 'wizvillage' || !cs.awake) continue;
            const def = cs.def;
            seen.add(def.id);
            this._plaque(def);
            if (this.auth && landReady(life, def.fire.x, def.fire.z)) { this._fire(def); this._library(def); } // (the middle's land made here first)
        }
        for (const [id, m] of [...this.plaques]) if (!seen.has(id)) { g.scene.remove(m); this.plaques.delete(id); }
        for (const id of [...this.scrolls.keys()]) if (!seen.has(id)) this._putAway(id);
        for (const [id, f] of [...this.fires]) if (!seen.has(id)) { this.fires.delete(id); if (this.auth && g.campfires?.list.get(f.id) === f) g.campfires._out(f); } // (nobody near: the wizards' fire is not left burning on)
    }

    _plaque(def) {
        if (this.plaques.has(def.id) || !def.statue) return;
        const P = plaqueParts();
        const m = new THREE.Mesh(P.geo, P.mat);
        m.position.set(def.statue.x, def.statue.y, def.statue.z);
        m.rotation.y = def.statue.ry;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        this.game.scene.add(m);
        this.plaques.set(def.id, m);
    }

    /** (host) The central fire: a campfire kept burning in its ring of stones. */
    _fire(def) {
        const g = this.game, c = g.campfires, at = def.fire;
        if (!c || !at) return;
        let f = c.nearest(at, 2.2);
        if (!f) {
            const col = g.collision;
            const y = col?.groundAt ? col.groundAt(at.x, at.z, at.y + 2) : at.y;
            f = c.kindle(at.x, y ?? at.y, at.z, CAMPFIRE.MAX);
        } else if (f.left < CAMPFIRE.MAX - 120) c.addWood(f, 2); // (the wizards keep putting wood on it)
        if (f) this.fires.set(def.id, f);
    }

    /** (host) The library's scrolls on the reading table; a taken one is gone for good. */
    _library(def) {
        const g = this.game, I = g.items, L = def.library;
        if (!I || !L?.scrolls?.length) return;
        let list = this.scrolls.get(def.id);
        if (!list) { list = []; this.scrolls.set(def.id, list); }
        const taken = g._openedChests || (g._openedChests = new Set());
        L.scrolls.forEach((spell, k) => {
            const id = 'lib:' + def.id + ':' + k;
            if (taken.has(id)) return;
            const rec = list.find((r) => r.id === id);
            if (rec) {
                const it = I.loose.get(rec.uid);
                const p = it?.model?.position;
                if (!it || it.hover || Math.hypot(p.x - rec.x, p.z - rec.z) > SCROLL_TAKEN) { taken.add(id); list.splice(list.indexOf(rec), 1); }
                return;
            }
            const s = L.spots[k];
            if (!s) return;
            const at = new THREE.Vector3(s.x, s.y + 0.3, s.z);
            const it = I.spawnLoose(spellScroll(spell), at);
            if (!it) return;
            it.shelfAt = at.clone(); // (while it lies there it is the library's: not saved — LoreLibrary.onSpot, WorldSave)
            list.push({ id, uid: it.item.uid, x: s.x, y: s.y, z: s.z });
        });
    }

    /** (host) Everybody left: the scrolls nobody took are put away (they lie there again next time). */
    _putAway(siteId) {
        const g = this.game, I = g.items;
        for (const r of this.scrolls.get(siteId) || []) {
            const it = I?.loose.get(r.uid);
            const p = it?.model?.position;
            if (it && !it.hover && Math.hypot(p.x - r.x, p.z - r.z) <= SCROLL_TAKEN) { I.removeLoose(r.uid); g.sync?.itemGone?.(r.uid, null, null); }
            else (g._openedChests || (g._openedChests = new Set())).add(r.id);
        }
        this.scrolls.delete(siteId);
    }

    dispose() {
        for (const m of this.plaques.values()) this.game.scene.remove(m);
        this.plaques.clear();
    }
}

