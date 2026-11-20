// Liquid volume is stored in 1/256 m³ units. Unchanged water uses the implicit full cell.
export const WATER_FULL = 256;
const DIR = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
const LIMIT = 110000; // keep a single interconnected basin's transient search bounded
const keyOf = (x, l, z) => `${x},${l},${z}`;

/**
 * Find communicating cavities below a breach. Traverse from low sills to high ones, so a
 * pocket behind a sill can receive water only while the supply still reaches that sill.
 * Open sea supplies water at its own level. Inland water is paid for, top layers first.
 */
export function* waterBreach(data, cells, { AIR, WATER, bottom, top }, keep) {
    let steps = 0;
    const removed = new Set(), changes = [];
    const openings = Array.from({ length: top - bottom }, () => []);
    for (const c of cells) {
        const [x, l, z] = Array.isArray(c) ? c : [c.x, Math.round(c.y + 1), c.z];
        if (Number.isInteger(x) && Number.isInteger(z) && Number.isInteger(l) && l > bottom && l <= top) openings[l - bottom - 1].push([x, l, z]);
        if ((++steps & 63) === 0) yield;
    }
    for (const layer of openings) for (const [x, l, z] of layer) {
        if ((++steps & 63) === 0) yield;
        const start = keyOf(x, l, z);
        if (removed.has(start)) continue;
        while (data.floodGroundReady?.(x, z) === false) yield 'ground';
        if (data.get(x, l, z) !== AIR) continue;
        let ceiling = 0, water = false;
        for (const [dx, dl, dz] of DIR) {
            const nx = x + dx, nz = z + dz, nl = l + dl;
            if (data.get(nx, nl, nz) !== WATER) continue;
            water = true;
            let h = nl;
            while (h < top && data.get(nx, h + 1, nz) === WATER) h++;
            ceiling = Math.max(ceiling, h);
        }
        if (!water || l > ceiling || l <= bottom) continue;
        const seen = new Set(), levels = ceiling - bottom;
        const frontier = Array.from({ length: levels }, () => []);
        const sinks = Array.from({ length: levels }, () => []);
        const donors = Array.from({ length: levels }, () => []);
        const allDonors = Array.from({ length: levels }, () => []);
        const leveled = new Uint8Array(levels);
        let count = 0, supply = -Infinity, naturalSea = false;
        function add(nx, nl, nz, crest) {
            if (nl <= bottom || nl > ceiling) return;
            const k = keyOf(nx, nl, nz);
            if (seen.has(k)) return;
            seen.add(k);
            const t = data.get(nx, nl, nz);
            if (t !== AIR && t !== WATER || keep?.(nx, nl - 1, nz)) return;
            frontier[Math.max(nl, crest) - bottom - 1].push([nx, nl, nz, t]);
        }
        add(x, l, z, l);
        for (let i = l - bottom - 1; i < levels && count < LIMIT; i++) {
            const crest = i + bottom + 1, queue = frontier[i];
            for (let at = 0; at < queue.length && count < LIMIT; at++, count++) {
                if ((++steps & 63) === 0) yield;
                const [nx, nl, nz, t] = queue[at], j = nl - bottom - 1;
                while (data.floodGroundReady?.(nx, nz) === false) yield 'ground';
                const source = t === WATER && nl <= 0 ? data.waterFeed(nx, nl, nz) : 0;
                if (source) {
                    // Ocean and flowing rivers are inlets, not basins to traverse and drain.
                    supply = Math.max(supply, 0);
                    naturalSea ||= source === 2;
                    for (const [dx, dl, dz] of DIR) if (data.get(nx + dx, nl + dl, nz + dz) === AIR) add(nx + dx, nl + dl, nz + dz, crest);
                    continue;
                }
                if (t === AIR) {
                    removed.add(keyOf(nx, nl, nz));
                    sinks[j].push({ x: nx, l: nl, z: nz, crest, before: 0, amount: 0 });
                } else if (nl >= crest) {
                    const amount = data.waterAmount(nx, nl, nz);
                    const cell = { x: nx, l: nl, z: nz, before: amount, amount };
                    donors[j].push(cell);
                    allDonors[j].push(cell);
                }
                for (const [dx, dl, dz] of DIR) add(nx + dx, nl + dl, nz + dz, crest);
            }
        }

        const save = cell => {
            if (cell.amount !== cell.before) changes.push([cell.x, cell.l, cell.z, cell.amount, cell.sea ? 1 : 0, cell.before, !!cell.supplied]);
        };
        let donorTop = levels - 1;
        const currentDonor = min => {
            while (donorTop >= min && !donors[donorTop].at(-1)) donorTop--;
            return donorTop >= min ? donors[donorTop].at(-1) : null;
        };
        function* take(min, limit) {
            let n = 0, d;
            while (n < limit && (d = currentDonor(min))) {
                const k = Math.min(d.amount, limit - n);
                d.amount -= k; n += k;
                if (!d.amount) donors[donorTop].pop();
                if ((++steps & 63) === 0) yield;
            }
            return n;
        }
        // Low cells have first use of the water. The final layer shares its remaining amount
        // across both banks, leaving a level surface instead of a checkerboard of full blocks.
        for (let i = 0; i < levels; i++) {
            const to = sinks[i], layer = i + bottom + 1;
            if (!to.length) continue;
            if (layer <= supply) {
                for (const c of to) if (c.crest <= supply) {
                    c.amount = WATER_FULL; c.sea = naturalSea && layer === 0; c.supplied = true; save(c);
                    if ((++steps & 63) === 0) yield;
                }
                continue;
            }
            let j = 0;
            while (j < to.length) {
                const crest = to[j].crest, min = Math.max(i + 1, crest - bottom - 1);
                let end = j + 1;
                while (end < to.length && to[end].crest === crest) end++;
                const total = yield* take(min, (end - j) * WATER_FULL);
                const same = crest === layer && total < (end - j) * WATER_FULL ? allDonors[i] : [];
                if (same.length) leveled[i] = 1;
                let volume = total;
                for (const d of same) { volume += d.amount; if ((++steps & 63) === 0) yield; }
                const n = end - j + same.length, whole = Math.floor(volume / n), extra = volume % n;
                for (let k = 0; k < n; k++) {
                    const cell = k < end - j ? to[j + k] : same[k - (end - j)];
                    cell.amount = whole + (k < extra ? 1 : 0);
                    if (k < end - j) save(cell);
                    if ((++steps & 63) === 0) yield;
                }
                j = end;
            }
        }
        for (let i = levels - 1; i >= 0; i--) {
            const layer = allDonors[i];
            if (layer.length && !leveled[i] && donors[i].length && (donors[i].length !== layer.length || donors[i].at(-1).amount !== donors[i].at(-1).before)) {
                let volume = 0;
                for (const cell of layer) { volume += cell.amount; if ((++steps & 63) === 0) yield; }
                const height = Math.floor(volume / layer.length), extra = volume % layer.length;
                for (let j = 0; j < layer.length; j++) layer[j].amount = height + (j < extra ? 1 : 0);
            }
            for (const cell of layer) {
                save(cell);
                if ((++steps & 63) === 0) yield;
            }
        }
    }
    // A wide blast often uncovers several wet cells. Show the stream at the actual shaft,
    // even if the first contact found by the solver was on a solid ledge next to it.
    let inlet = null, drop = 0;
    if (changes.length) for (const layer of openings) for (const [x, l, z] of layer) {
        if ((++steps & 63) === 0) yield;
        if (!removed.has(keyOf(x, l, z)) || data.get(x, l + 1, z) !== WATER) continue;
        let below = l - 1;
        while (below > Math.max(bottom, l - 32) && data.get(x, below, z) === AIR) below--;
        if (l - below > drop) { drop = l - below; inlet = { x, l, z, bottom: below }; }
    }
    return { changes, inlet };
}

/** Apply paired transfers so a block built while the flood is active cannot create water. */
export function* applyWaterBreach(data, changes) {
    const donors = [];
    let scanned = 0;
    for (const cell of changes) {
        if (cell[3] < cell[5]) donors.push(cell);
        if ((++scanned & 63) === 0) yield;
    }
    let i = 0;
    for (const [x, l, z, target, sea, before, supplied] of changes) {
        if (target <= before) continue;
        let amount = data.waterAmount(x, l, z);
        if (amount < 0) { yield; continue; } // a solid was built while the water was moving
        if (supplied) {
            data.setFloodAmount(x, l, z, target, sea);
            yield;
            continue;
        }
        while (amount < target && i < donors.length) {
            const [dx, dl, dz, left] = donors[i];
            const have = data.waterAmount(dx, dl, dz);
            if (have <= left) { i++; yield; continue; }
            const moved = Math.min(have - left, target - amount);
            data.setFloodAmount(dx, dl, dz, have - moved);
            data.setFloodAmount(x, l, z, amount += moved, sea);
            if (have - moved === left) i++;
            yield;
        }
        yield;
    }
}
