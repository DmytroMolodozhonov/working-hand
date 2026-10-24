/**
 * PentagramWorld.js — the ready-made pairs of teleportation pentagrams between the wizards' settlements (pure; the game part is
 * Pentagranium.worldWake / worldSleep). The author: «между городами магов стоят готовые парные пентаграммы телепортации: от города к
 * ближайшему другому городу магов… так что можно ходить между ними» (worlds of generation PENT_STAND_FROM_GEN and later).
 *
 * Every settlement has its pentagram on the plaza (VillageIndex.tpSpot — worked out from the cell alone, without building the settlement, so
 * the one end can name the other end's place). Its pair is the nearest other settlement in a window of ±TELEPORT.WINDOW cells — if that one's
 * nearest is this one too (mutual: every pair is two-way; a settlement whose nearest has a nearer friend stays without a pair). Worked out
 * ONE CELL A FRAME (a cell may have to make a castle's plan to be told «not free»): `PartnerSearch.step()`.
 */
import { TELEPORT } from '../world/WizardVillages.js';

/** The cells round (gx, gz), nearest first (not the cell itself). */
export function windowCells(gx, gz, W = TELEPORT.WINDOW) {
    const out = [];
    for (let j = -W; j <= W; j++) for (let i = -W; i <= W; i++) if (i || j) out.push([gx + i, gz + j]);
    return out.sort((a, b) => Math.hypot(a[0] - gx, a[1] - gz) - Math.hypot(b[0] - gx, b[1] - gz) || a[0] - b[0] || a[1] - b[1]);
}

/**
 * The search for the partner of the settlement in cell (gx, gz): `step()` looks at one cell; `done` when it knows.
 * `index.tpSpot(gx, gz)` → {id, x, z, gx, gz} | null.
 */
export class PartnerSearch {
    constructor(index, gx, gz) {
        this.index = index; this.gx = gx; this.gz = gz;
        this.me = index.tpSpot(gx, gz);
        this.done = !this.me;
        this.partner = null;
        this.phase = 0; // 0: round me, 1: round my nearest
        this.queue = this.done ? [] : windowCells(gx, gz);
        this.best = null; this.target = null;
        this.n = 0;
    }

    /** One cell. @returns this.done */
    step() {
        if (this.done) return true;
        const c = this.queue.shift();
        if (c) {
            const s = this.index.tpSpot(c[0], c[1]);
            this.n++;
            const from = this.phase === 0 ? this.me : this.target;
            if (s && s.id !== from.id) {
                const d = Math.hypot(s.x - from.x, s.z - from.z);
                if (!this.best || d < this.best.d || (d === this.best.d && s.id < this.best.s.id)) this.best = { s, d };
            }
        }
        if (this.queue.length) return false;
        if (this.phase === 0) {
            if (!this.best) { this.done = true; return true; } // (alone)
            this.target = this.best.s; this.myNearest = this.best.s;
            this.phase = 1; this.best = null;
            this.queue = windowCells(this.target.gx, this.target.gz);
            // (the cell of A is in B's window: A itself is a candidate for B)
            return false;
        }
        // is the nearest of my nearest me? (mutual)
        this.done = true;
        if (this.best && this.best.s.id === this.me.id) this.partner = this.myNearest;
        return true;
    }

    /** Run to the end at once (tests, tools). */
    run() { let k = 0; while (!this.step() && k++ < 400); return this.partner; }
}
