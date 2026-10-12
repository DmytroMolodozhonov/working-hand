/**
 * WorldSave.js — worlds are saved by themselves, all the time.
 *
 * A world is kept on the computer of the one who created it (the host, or
 * the single player) in the browser's database (IndexedDB): the seed it was
 * generated from plus everything that changed — built and destroyed blocks,
 * craters, gathered and burnt trees, ice, opened chests, things lying around,
 * the time of day — and every player's own things: what is in their slots,
 * the spells they learned from books, where they were, their health.
 * Nothing to press: it is written every few seconds and when the tab closes.
 * In the menu the world can be continued (single player, or as a server).
 *
 * Players are remembered by their own lasting id (kept by their browser), not
 * by name: a friend who comes back to the same server gets their things back,
 * and two players who both call themselves «Игрок» never get each other's
 * things or learned spells. (Old saves keyed by name still work once.)
 */

import { keepIn } from './HouseWards.js';

const DB_NAME = 'zns-worlds';
const STORE = 'worlds';
const SAVE_EVERY = 8; // seconds

/** The version of the game running now (from /api/version): written into every save. */
export const GAME_VERSION = { date: '', sha: '' };
export function setGameVersion(v) {
    GAME_VERSION.date = v?.date || '';
    GAME_VERSION.sha = v?.sha || '';
}

/** What the menu says about a saved world's version (old: saved by another version of the game). */
export function worldVersionLabel(w, cur = GAME_VERSION) {
    const v = w?.version;
    if (!v || (!v.date && !v.sha)) return { text: 'версия неизвестна (сохранён до обновления)', old: true };
    return { text: `версия от ${v.date || '?'}${v.sha ? ` (${v.sha})` : ''}`, old: !!(cur?.sha && v.sha && cur.sha !== v.sha) };
}

let _db = null;
function db() {
    if (_db) return _db;
    _db = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    _db.catch(() => { _db = null; });
    return _db;
}

function tx(mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const st = t.objectStore(STORE);
        const req = fn(st);
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
    }));
}

/** All saved worlds, newest first: [{id, name, mode, seed, updated, players}] (without the heavy parts). */
export async function listWorlds() {
    try {
        const all = await tx('readonly', (st) => st.getAll());
        return (all || []).map((w) => ({ id: w.id, name: w.name, mode: w.mode, seed: w.seed, updated: w.updated, created: w.created, version: w.version || null, players: Object.entries(w.players || {}).map(([k, p]) => p?.name || k) }))
            .sort((a, b) => b.updated - a.updated);
    } catch (e) { return []; }
}

export async function loadWorld(id) {
    try { return await tx('readonly', (st) => st.get(id)); } catch (e) { return null; }
}

export async function deleteWorld(id) {
    try { await tx('readwrite', (st) => st.delete(id)); } catch (e) { /* ignore */ }
}

export async function putWorld(w) {
    await tx('readwrite', (st) => st.put(w));
}

export function newWorldId() {
    return 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

const r2 = (v) => Math.round(v * 100) / 100;

/** One player's own things (works for the local player; guests send theirs). */
export function playerSnapshot(game) {
    const inv = game.inventory;
    const slots = inv ? inv.slots.map((s) => (s ? { ...s, stack: undefined } : null)) : [];
    // what is in the hand belongs to the slots too
    const h = inv?.inHand;
    if (h && h.kind === 'weapon' && h.weapon) {
        const i = slots.findIndex((s) => !s);
        if (i >= 0) slots[i] = { kind: 'weapon', type: h.weapon.type, id: h.weapon.id };
    }
    const p = game.character.group.position;
    return {
        slots,
        extraSlots: inv ? Math.max(0, inv.slots.length - 5) : 0,
        purse: inv?.purse?.count || 0, // the coins in the pouches on the belt (CoinBelt)
        learned: game.books ? [...game.books.learned] : [],
        pos: [r2(p.x), r2(p.y), r2(p.z)],
        hp: game.playerHP,
        bonus: game.bonus || null, // scrolls burnt: more health / strength for good
        gear: game.items?.snapshot() || null, // what is in the hands, the backpack worn
        mana: game.mana?.snapshot() || null, // the mana maximum grown, the spells / magical creatures already counted
        limbs: game.dismember?.snapshot() || null, // cut off (until death): no healing by leaving
        bleed: game.bleeding?.rate || 0,
        ship: game.ships?.playerSnap() || null, // standing on a ship: [ship id, place on its deck]
        bed: game.beds?.home || null, // the bed they come back to life at
    };
}

/** Give a player their things back. */
export function applyPlayerSnapshot(game, s) {
    if (!s) return;
    game._playerRestored = true; // (a player of this world before: their own things, no starting gifts)
    const inv = game.inventory;
    if (inv && Array.isArray(s.slots)) {
        if (s.extraSlots && inv.setExtraSlots) inv.setExtraSlots(s.extraSlots);
        for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = s.slots[i] ? { ...s.slots[i] } : null;
        inv.selected = -1;
        if (inv.purse) inv.purse.count = 0;
        if (inv.purse && Number.isFinite(s.purse) && s.purse > 0) { const rest = inv.purse.add(s.purse); if (rest > 0) inv.storeItem({ kind: 'coins', uid: 'c' + Date.now().toString(36), count: rest }); }
        inv._render?.();
    }
    if (game.books && Array.isArray(s.learned)) for (const k of s.learned) game.books.learned.add(k);
    if (Array.isArray(s.pos) && s.pos.every(Number.isFinite)) game.character.group.position.set(s.pos[0], s.pos[1] + 0.5, s.pos[2]);
    if (Number.isFinite(s.hp) && s.hp > 0) game.playerHP = Math.min(game.maxHP, s.hp);
    if (s.bonus) {
        game.bonus = { ...s.bonus };
        if (s.bonus.hp) {
            game.maxHP += s.bonus.hp; game.playerHP = Math.min(game.maxHP, game.playerHP + s.bonus.hp);
            if (game.combat?.enabled) game.combat.addMaxHp?.(s.bonus.hp);
        }
        if (s.bonus.fatigue) game.combat.addMaxFatigue?.(s.bonus.fatigue);
    }
    if (s.gear) game.items?.restore(s.gear);
    if (s.mana) game.mana?.restore(s.mana);
    if (s.limbs && Number.isFinite(s.hp) && s.hp > 0) game.dismember?.restoreMine(s.limbs, s.bleed || 0);
    if (s.bed) game.beds?.setHome(s.bed);
    if (s.ship) game.ships?.applyPlayerSnap(s.ship); // (back on the ship's deck, wherever it sailed)
}

/**
 * Keeps the current game's world saved (host or single player only).
 */
export class WorldKeeper {
    constructor(game, { id, name, mode, seed, created, players, gen, createdVersion } = {}) {
        this.game = game;
        this.id = id || newWorldId();
        this.name = name || 'Мир';
        this.mode = mode || game.config.mode;
        this.seed = seed ?? game.seed;
        this.gen = gen ?? game.gen ?? 1; // world generation (seas from 2)
        this.created = created || Date.now();
        this.createdVersion = createdVersion || { ...GAME_VERSION };
        this.players = players || {}; // 'id:'+lasting id (or an old name) -> snapshot (guests and the host)
        this._t = 0;
        this._saving = false;
        this._onHide = () => this.save();
        if (typeof window !== 'undefined') window.addEventListener('pagehide', this._onHide);
    }

    get myName() {
        return this.game.net?.name || 'Игрок';
    }

    /** Where a player's things are kept: under their lasting id (or, without one, their name). */
    static key(pid, name) {
        return pid ? 'id:' + String(pid).slice(0, 40) : String(name || 'Игрок').slice(0, 16);
    }

    get myKey() {
        return WorldKeeper.key(this.game.net?.pid, this.myName);
    }

    /** A guest's things arrived (they send them now and then). */
    notePlayer(pid, name, snap) {
        if (!snap || (!pid && !name)) return;
        this.players[WorldKeeper.key(pid, name)] = { ...snap, name: String(name || '').slice(0, 16) };
    }

    /**
     * A player's saved things: by their lasting id; an old save kept by name is
     * used (once — it moves to the id) only if it is not the host's own name
     * (`self`: the host / single player looking up their own).
     */
    playerFor(pid, name, { self = false } = {}) {
        const byId = pid ? this.players[WorldKeeper.key(pid)] : null;
        if (byId) return byId;
        const nk = WorldKeeper.key(null, name);
        const legacy = this.players[nk];
        if (!legacy || (!self && nk === WorldKeeper.key(null, this.myName))) return null;
        if (pid) delete this.players[nk];
        return legacy;
    }

    snapshot() {
        const g = this.game;
        this.players[this.myKey] = { ...playerSnapshot(g), name: this.myName };
        const DAY = g.constructor.DAY_CYCLE_MS || 24 * 60 * 1000;
        return {
            id: this.id,
            name: this.name,
            mode: this.mode,
            seed: this.seed,
            gen: this.gen,
            created: this.created,
            updated: Date.now(),
            version: { ...GAME_VERSION }, // the game that wrote it last
            createdVersion: this.createdVersion,
            dayPhase: g.dayPhase ? g.dayPhase() : 0,
            dayMs: DAY,
            explosions: g.explosions.slice(-4000),
            edits: (g.blockEdits || []).slice(-30000),
            treesGone: g.world.trees ? g.world.trees.filter((t) => !t.alive).map((t) => t.index) : [],
            ice: g.iceCells || [],
            chests: [...new Set([...(g.chests || []).filter((c) => c.isOpen).map((c) => c.id), ...(g._openedChests || [])])],
            items: g.items ? [...g.items.loose.values()].map((L) => ({ item: L.item, p: [r2(L.model.position.x), r2(L.model.position.y), r2(L.model.position.z)], h: L.hover ? 1 : 0 })) : [],
            weapons: g.weapons.weapons.filter((w) => !w.holder).map((w) => w.serialize()),
            fixedWeapons: g.fixedWeapons || [], // the weapons the world starts with (a newer game may add more)
            animals: g.animals?.snapshot() || [],
            doors: g.doors?.snapshot() || [],
            locks: g.locks?.snapshot() || null, // («Алохомора»: what was unlocked, the gates)
            boards: g.boards?.snapshot() || null,
            campfires: g.campfires?.snapshot() || [],
            cauldrons: g.cauldrons?.snapshot() || null,
            houses: g.houses?.snapshot() || null,
            wards: g.wards?.snapshot() || [], // houses' spheres of protection (HouseWards.js)
            beds: g.beds?.snapshot() || [],
            castles: g.castleLife?.snapshot() || {},
            rebuild: g.castleLife?.rebuild.snapshot() || null, // what the builders put back (Rebuild.js)
            bodies: g.death?.snapshot() || [],
            crystals: g.crystals?.snapshot() || [],
            dragons: g.dragons?.snapshot() || {}, // dragons' lairs: the gold left, their dragons' health (Dragons.js)
            ships: g.ships?.snapshot() || [], // ships that moved, burnt, sank, were captured…
            guns: g.ships?.cannons.snapshot() || [],
            players: this.players,
        };
    }

    async save() {
        if (this._saving || !this.game.active) return;
        this._saving = true;
        try { await putWorld(this.snapshot()); this.lastSaved = Date.now(); } catch (e) { console.warn('[WorldSave] not saved', e); }
        this._saving = false;
    }

    update(dt) {
        this._t += dt;
        if (this._t >= SAVE_EVERY) { this._t = 0; this.save(); }
    }

    dispose() {
        if (typeof window !== 'undefined') window.removeEventListener('pagehide', this._onHide);
    }
}

/** Put a saved world back into a freshly generated game (same seed). */
export function restoreWorld(game, save, THREE) {
    const g = game;
    if (!save) return;
    if (Array.isArray(save.edits) && save.edits.length) { g.builder?.applyEdits(save.edits); }
    for (const i of save.treesGone || []) { const t = g.world.trees?.find((x) => x.index === i); if (t && t.alive) g.world.removeTree(t); }
    for (const e of save.explosions || []) {
        // (k: the houses' spheres of protection it could not eat into — HouseWards.js)
        if (e.ruin) g.world.ruin(new THREE.Vector3(e.p[0], e.p[1], e.p[2]), e.r, keepIn(e.k)); // («Total Destruction»)
        else g.world.explode(new THREE.Vector3(e.p[0], e.p[1], e.p[2]), e.r, keepIn(e.k));
        g.explosions.push(e);
    }
    if (save.rebuild) g.castleLife?.rebuild.restore(save.rebuild); // (after the blasts: what the builders put back since)
    if (save.ice && save.ice.length) g.applyIce(save.ice);
    for (const id of save.chests || []) { (g._openedChests = g._openedChests || new Set()).add(id); const c = g.chests?.find((x) => x.id === id); if (c) c.setOpenInstant(); }
    for (const e of save.items || []) g.items?.spawnLoose(e.item, new THREE.Vector3(e.p[0], e.p[1], e.p[2]), { hover: !!e.h, broadcast: false });
    if (save.animals) g.animals?.restore(save.animals);
    if (save.doors) g.doors?.restore(save.doors);
    if (save.locks) g.locks?.restore(save.locks);
    if (save.boards) g.boards?.restore(save.boards);
    if (save.campfires) g.campfires?.restore(save.campfires);
    if (save.cauldrons) g.cauldrons?.restore(save.cauldrons);
    if (save.houses) g.houses?.restore(save.houses);
    if (save.wards) g.wards?.restore(save.wards); // houses' spheres of protection
    if (save.beds) g.beds?.restore(save.beds);
    if (save.castles) g.castleLife?.restore(save.castles);
    if (save.bodies) g.death?.restore(save.bodies);
    if (save.crystals) g.crystals?.restore(save.crystals);
    if (save.dragons) g.dragons?.restore(save.dragons);
    if (save.ships) g.ships?.restore(save.ships);
    if (save.guns) g.ships?.cannons.restore(save.guns);
    if (Number.isFinite(save.dayPhase)) g.dayStart = Date.now() - save.dayPhase * (save.dayMs || 24 * 60 * 1000);
    if (g.dayCycle) g.world.setDayPhase(g.dayPhase());
    // things lying around: exactly what was there (a sword taken into a slot is not on its pedestal any more)
    if (Array.isArray(save.weapons)) {
        const keep = new Set(save.weapons.map((s) => s[0]));
        const inSlots = new Set();
        for (const p of Object.values(save.players || {})) for (const s of p.slots || []) if (s && s.kind === 'weapon') inSlots.add(s.id);
        // (a start weapon the save never knew — added by a newer game — stays on its pedestal)
        const known = new Set(save.fixedWeapons || ['tA', 'tS']), fresh = (id) => (g.fixedWeapons || []).includes(id) && !known.has(id);
        for (const w of [...g.weapons.weapons]) if ((!keep.has(w.id) && !fresh(w.id)) || inSlots.has(w.id)) g.weapons.remove(w);
        for (const s of save.weapons) {
            if (inSlots.has(s[0])) continue;
            let w = g.weapons.byId.get(s[0]);
            const pos = new THREE.Vector3(s[2], s[3], s[4]);
            const q = new THREE.Quaternion(s[5], s[6], s[7], s[8]);
            if (!w) { w = g.weapons.markMagic(g.weapons.spawn(s[1], pos, q, s[0]), s[10]); w.wake(); }
            else if (!w.hover) w.placeAt(pos, q);
        }
    }
}
