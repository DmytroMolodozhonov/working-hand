/**
 * BoardRegistry.js — every surfboard of the world (plain data: network and save).
 * The host (or single player) decides who holds or rides a board: first come wins,
 * a held or ridden board is never taken from its owner.
 * Record: {id, wood, st: 'stand'|'rest'|'float'|'fall'|'held'|'ridden', p, q, v, owner, mode, beach}
 *   mode: 1 two hands, 2 one hand, 3 ride on the left foot, 4 on the right foot, 5 standing.
 */

export class BoardRegistry {
    constructor() { this.map = new Map(); this.beachTaken = new Set(); }

    add(rec) {
        if (!this.map.has(rec.id)) this.map.set(rec.id, { v: [0, 0, 0], owner: null, mode: 0, q: [0, 0, 0, 1], ...rec });
        return this.map.get(rec.id);
    }

    take(id, by, mode) {
        const b = this.map.get(id);
        if (!b || (b.owner && b.owner !== by)) return false;
        b.owner = by; b.mode = mode; b.st = mode >= 3 ? 'ridden' : 'held';
        if (b.beach) this.beachTaken.add(id);
        return true;
    }

    free(id, by, { p, q, v, st }) {
        const b = this.map.get(id);
        if (!b || (b.owner && b.owner !== by)) return false;
        Object.assign(b, { owner: null, mode: 0, p, q, v: v || [0, 0, 0], st });
        return true;
    }

    /** A player left: their boards fall where they were. */
    leave(playerId) {
        const out = [];
        for (const b of this.map.values()) if (b.owner === playerId) { b.owner = null; b.mode = 0; b.st = 'fall'; out.push(b.id); }
        return out;
    }

    remove(id) { this.map.delete(id); }

    /** Saved: held/ridden boards as falling there; untouched beach rack boards come back by themselves. */
    snapshot() {
        return [...this.map.values()]
            .filter((b) => !(b.beach && !this.beachTaken.has(b.id) && b.st === 'stand'))
            .map(({ id, wood, st, p, q, beach }) => ({ id, wood, st: st === 'held' || st === 'ridden' ? 'fall' : st, p, q, beach: beach || undefined }));
    }

    restore(list, beachTaken = []) {
        for (const s of list || []) this.add({ ...s, owner: null, mode: 0 });
        for (const id of beachTaken || []) this.beachTaken.add(id);
    }
}
