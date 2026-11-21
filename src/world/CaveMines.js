/** Abandoned workings reached through a natural cave, with no independent entrance on the surface. */
import { createRng } from '../core/math.js';
import { Plan } from './Castles.js';
import { DUNGEON } from './DungeonRules.js';
import { dungeonRoll } from './Dungeons.js';
import { BLOCK, MIN_LAYER } from './Terrain.js';

const WIDTH = 9, LENGTH = 27;
const within = (site, x0, z0, x1, z1) =>
    site.x0 <= x1 && site.x1 >= x0 && site.z0 <= z1 && site.z1 >= z0;

function minePlan(cave, gx, gz, rng, terrain) {
    if (cave.F <= MIN_LAYER + 1) return null;
    const { CELL, MARGIN } = DUNGEON;
    const cellX = gx * CELL, cellZ = gz * CELL;
    const dirs = [0, 1, 2, 3].map(rot => new Plan(cave.kx, cave.kz, cave.F, rot));
    // Keep the workings behind the chamber instead of crossing its natural entrance.
    const back = p => (p.wx(0, 1) - p.X) * (p.X - cave.ex) + (p.wz(0, 1) - p.Z) * (p.Z - cave.ez);
    dirs.sort((a, b) => back(b) - back(a));
    for (const p of dirs) {
        const a = p.pt(-WIDTH, 3), b = p.pt(WIDTH, LENGTH);
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
        if (x0 < cellX + MARGIN || x1 >= cellX + CELL - MARGIN || z0 < cellZ + MARGIN || z1 >= cellZ + CELL - MARGIN) continue;
        const H = terrain.heightAt;
        let buried = true;
        for (let z = z0; z <= z1 && buried; z++) for (let x = x0; x <= x1; x++) {
            const h = H(x, z);
            if (H.water || H.sea || h < cave.F + 9 || terrain.sites?.landAt(x, z)) { buried = false; break; }
        }
        if (!buried) continue;
        const B = BLOCK;
        const gallery = (u0, u1, v0, v1) => {
            p.box(u0, u1, -1, -1, v0, v1, B.PATH);
            p.box(u0, u1, 0, 5, v0, v1, B.AIR);
        };
        gallery(-3, 3, 3, LENGTH);
        gallery(-WIDTH, WIDTH, 8, 13);
        gallery(-WIDTH, WIDTH, 15, 20);
        gallery(-5, 5, 23, LENGTH);
        for (const v of [5, 8, 14, 21, 26]) {
            for (const u of [-3, 3]) {
                p.box(u, u, 0, 4, v, v, B.PLANKS_DARK);
                p.box(u, u, -1, -1, v, v, B.COBBLE);
            }
            p.box(-3, 3, 5, 5, v, v, B.PLANKS_DARK);
        }
        for (let v = 6; v < LENGTH; v += 3) p.box(-1, 1, -1, -1, v, v, B.PLANKS_DARK);
        p.box(-8, -8, 3, 3, 9, 9, B.LANTERN);
        p.box(8, 8, 3, 3, 18, 18, B.LANTERN);
        p.box(-9, -9, 0, 1, 19, 20, B.GRAVEL);
        p.box(9, 9, 0, 1, 9, 10, B.COBBLE);
        p.box(4, 5, 0, 1, 27, 27, B.GRAVEL);
        const want = 3 + Math.floor(rng() * 3);
        const spots = [[-6, 11], [6, 17], [0, 25], [6, 11], [-6, 17]];
        const chests = spots.slice(0, want).map(([u, v], i) => ({
            x: p.wx(u, v), z: p.wz(u, v), y: cave.F,
            a: p.yaw(u ? Math.sign(-u) * Math.PI / 2 : Math.PI),
            look: i === 2 ? 'iron' : 'crate',
        }));
        return { id: 'mine:' + cave.id, caveId: cave.id, kind: 'dungeon', under: true, name: 'Заброшенная шахта',
            x: p.X, z: p.Z, F: cave.F, x0, x1, z0, z1, chests, parts: p.parts };
    }
    return null;
}

export class CaveMines {
    constructor(terrain, caveCell) {
        this.terrain = terrain;
        this.caveCell = caveCell;
        this.cells = new Map();
    }

    cellOf(gx, gz) {
        const key = gx + ',' + gz;
        if (!this.cells.has(key)) this.cells.set(key, this._choose(gx, gz));
        return this.cells.get(key);
    }

    _choose(gx, gz) {
        const t = this.terrain;
        const { under, allowed } = dungeonRoll(t.seed, gx, gz);
        if (!under || !allowed || !t.dungeons?.legacyUnderground(gx, gz)) return null;
        const C = DUNGEON.CELL, x = gx * C, z = gz * C, R = this.caveCell;
        const rng = createRng((Math.imul(gx, 192197) ^ Math.imul(gz, 344603) ^ t.seed ^ 519312) >>> 0);
        const cells = [];
        for (let cz = Math.floor((z - R) / R); cz <= Math.floor((z + C + R) / R); cz++) {
            for (let cx = Math.floor((x - R) / R); cx <= Math.floor((x + C + R) / R); cx++) cells.push([cx, cz, rng()]);
        }
        cells.sort((a, b) => a[2] - b[2]);
        for (const [cx, cz] of cells) {
            const cave = t.caveOf(cx, cz);
            if (!cave || cave.kx < x + WIDTH || cave.kx > x + C - WIDTH || cave.kz < z + WIDTH || cave.kz > z + C - WIDTH) continue;
            if (Math.hypot(cave.kx, cave.kz) < DUNGEON.MIN_SPAWN) continue;
            const site = minePlan(cave, gx, gz, rng, t);
            if (site) return site;
        }
        return null;
    }

    inBox(x0, z0, x1, z1, lazy = false) {
        const C = DUNGEON.CELL, out = [];
        for (let gz = Math.floor(z0 / C); gz <= Math.floor(z1 / C); gz++) {
            for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++) {
                if (lazy && this.terrain._cellLater(this.cells.has(gx + ',' + gz))) continue;
                const site = this.cellOf(gx, gz);
                if (site && within(site, x0, z0, x1, z1)) out.push(site);
            }
        }
        return out;
    }
}
