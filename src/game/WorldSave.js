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
 * Players are remembered by name: a friend who comes back to the same server
 * gets their things back.
 */

const DB_NAME = 'zns-worlds';
const STORE = 'worlds';
const SAVE_EVERY = 8; // seconds

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
        return (all || []).map((w) => ({ id: w.id, name: w.name, mode: w.mode, seed: w.seed, updated: w.updated, created: w.created, players: Object.keys(w.players || {}) }))
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
    if (game.books?.inHand) {
        const i = slots.findIndex((s) => !s);
        if (i >= 0) slots[i] = { ...game.books.inHand.item };
    }
    const p = game.character.group.position;
    return {
        slots,
        extraSlots: inv ? Math.max(0, inv.slots.length - 5) : 0,
        learned: game.books ? [...game.books.learned] : [],
        pos: [r2(p.x), r2(p.y), r2(p.z)],
        hp: game.playerHP,
        bonus: game.bonus || null, // scrolls burnt: more health / strength for good
        gear: game.items?.snapshot() || null, // what is in the hands, the backpack worn
    };
}

/** Give a player their things back. */
export function applyPlayerSnapshot(game, s) {
    if (!s) return;
    const inv = game.inventory;
    if (inv && Array.isArray(s.slots)) {
        if (s.extraSlots && inv.setExtraSlots) inv.setExtraSlots(s.extraSlots);
        for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = s.slots[i] ? { ...s.slots[i] } : null;
        inv.selected = -1;
        inv._render?.();
    }
    if (game.books && Array.isArray(s.learned)) for (const k of s.learned) game.books.learned.add(k);
    if (Array.isArray(s.pos) && s.pos.every(Number.isFinite)) game.character.group.position.set(s.pos[0], s.pos[1] + 0.5, s.pos[2]);
    if (Number.isFinite(s.hp) && s.hp > 0) game.playerHP = Math.min(game.maxHP, s.hp);
    if (s.bonus) {
        game.bonus = { ...s.bonus };
        if (s.bonus.hp) { game.maxHP += s.bonus.hp; game.playerHP = Math.min(game.maxHP, game.playerHP + s.bonus.hp); }
        if (s.bonus.fatigue) game.combat.addMaxFatigue?.(s.bonus.fatigue);
    }
    if (s.gear) game.items?.restore(s.gear);
}

/**
 * Keeps the current game's world saved (host or single player only).
 */
export class WorldKeeper {
    constructor(game, { id, name, mode, seed, created, players } = {}) {
        this.game = game;
        this.id = id || newWorldId();
        this.name = name || 'Мир';
        this.mode = mode || game.config.mode;
        this.seed = seed ?? game.seed;
        this.created = created || Date.now();
        this.players = players || {}; // name -> snapshot (guests and the host)
        this._t = 0;
        this._saving = false;
        this._onHide = () => this.save();
        if (typeof window !== 'undefined') window.addEventListener('pagehide', this._onHide);
    }

    get myName() {
        return this.game.net?.name || 'Игрок';
    }

    /** A guest's things arrived (they send them now and then). */
    notePlayer(name, snap) {
        if (!name || !snap) return;
        this.players[String(name).slice(0, 16)] = snap;
    }

    snapshot() {
        const g = this.game;
        this.players[this.myName] = playerSnapshot(g);
        const DAY = g.constructor.DAY_CYCLE_MS || 24 * 60 * 1000;
        return {
            id: this.id,
            name: this.name,
            mode: this.mode,
            seed: this.seed,
            created: this.created,
            updated: Date.now(),
            dayPhase: g.dayPhase ? g.dayPhase() : 0,
            dayMs: DAY,
            explosions: g.explosions.slice(-4000),
            edits: (g.blockEdits || []).slice(-30000),
            treesGone: g.world.trees ? g.world.trees.filter((t) => !t.alive).map((t) => t.index) : [],
            ice: g.iceCells || [],
            chests: [...new Set([...(g.chests || []).filter((c) => c.isOpen).map((c) => c.id), ...(g._openedChests || [])])],
            items: g.items ? [...g.items.loose.values()].map((L) => ({ item: L.item, p: [r2(L.model.position.x), r2(L.model.position.y), r2(L.model.position.z)], h: L.hover ? 1 : 0 })) : [],
            weapons: g.weapons.weapons.filter((w) => !w.holder).map((w) => w.serialize()),
            animals: g.animals?.snapshot() || [],
            doors: g.doors?.snapshot() || [],
            castles: g.castleLife?.snapshot() || {},
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
        g.world.explode(new THREE.Vector3(e.p[0], e.p[1], e.p[2]), e.r);
        g.explosions.push(e);
    }
    if (save.ice && save.ice.length) g.applyIce(save.ice);
    for (const id of save.chests || []) { (g._openedChests = g._openedChests || new Set()).add(id); const c = g.chests?.find((x) => x.id === id); if (c) c.setOpenInstant(); }
    for (const e of save.items || []) g.items?.spawnLoose(e.item, new THREE.Vector3(e.p[0], e.p[1], e.p[2]), { hover: !!e.h, broadcast: false });
    if (save.animals) g.animals?.restore(save.animals);
    if (save.doors) g.doors?.restore(save.doors);
    if (save.castles) g.castleLife?.restore(save.castles);
    if (Number.isFinite(save.dayPhase)) g.dayStart = Date.now() - save.dayPhase * (save.dayMs || 24 * 60 * 1000);
    if (g.dayCycle) g.world.setDayPhase(g.dayPhase());
    // things lying around: exactly what was there (a sword taken into a slot is not on its pedestal any more)
    if (Array.isArray(save.weapons)) {
        const keep = new Set(save.weapons.map((s) => s[0]));
        const inSlots = new Set();
        for (const p of Object.values(save.players || {})) for (const s of p.slots || []) if (s && s.kind === 'weapon') inSlots.add(s.id);
        for (const w of [...g.weapons.weapons]) if (!keep.has(w.id) || inSlots.has(w.id)) g.weapons.remove(w);
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
