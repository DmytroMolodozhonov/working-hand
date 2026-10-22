/**
 * OwlBosses.js — what the clever owl (Owls.js) can find: the bosses, by name, and where the nearest
 * living one of a kind is.
 *
 * The list of bosses is the achievements' list (Achievements.ACHIEVEMENTS — CLAUDE.md: every boss is an
 * achievement). A new boss: its line there, its words in BOSS_WORDS (else the words of its title are
 * used) and its finder in BOSS_FINDERS (else the owl shakes its head: it doesn't know where).
 *
 *   bossOfWords(text)          the boss a phrase asks for («я хочу найти паучиху», «где дракон?») or null
 *   bossTo(id)                 «к паучихе» — for the lines on the screen
 *   BOSS_FINDERS[id](g, from, job)   one step of the search: undefined — still looking (a little a
 *                              frame: the castles far off are planned in the workers), null — none
 *                              alive, {x, z, live?()} — there (live(): where it is now, for a moving one)
 */

import { ACHIEVEMENTS } from './Achievements.js';

// ------------------------------------------------------------------ the words
/** How each boss is called (Russian stems; the speech network writes words as it hears them). */
export const BOSS_WORDS = {
    // (before the king: «Ледяная / Снежная королева» is not a castle's queen)
    iceQueen: [/(лед|лёд|снеж|ледов|зимн)\S*\s+(\S+\s+)?корол/, /корол\S*\s+(\S+\s+)?(льда|лёда|снег|снеж|лед|лёд|зим)/, /ледян\S*\s+(\S+\s+)?(цариц|ведьм|госпож)/],
    blackbeard: [/ч[её]рн\S*\s+ус/, /ч[её]рнобор|ч[её]рн\S*\s+бород/, /пират/, /капитан/],
    tower: [/башн/, /мастер/, /волшебник/, /чародей/, /(^|\s)маг(а|у|ом)?(\s|$)/, /магистр/],
    spider: [/пауч/, /паук/],
    dragon: [/дракон/, /драко/],
    king: [/корол/, /(^|\s)цар/],
};
/** In this order (the more particular first). */
const ORDER = ['iceQueen', 'blackbeard', 'tower', 'spider', 'dragon', 'king'];

/** «Find / show / lead / where…»: the phrase is a request, not a word in a talk. */
const ASK = /(найд|найт|наход|ищ|иска|отыщ|покаж|показ|где|веди|отвед|провод|приведи|отнеси|лети|полет|хочу|нужн|ищу)/;

const norm = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-яё0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

/** The words of a future boss nobody wrote BOSS_WORDS for: the stems of its title («Убить X Y» → X, Y). */
function titleWords(a) {
    const ws = norm(a.title).split(' ').slice(1).filter((w) => w.length >= 4);
    return ws.map((w) => new RegExp(w.slice(0, Math.max(4, w.length - 2))));
}

/** Every boss (achievement) with its words: [[id, [RegExp]]]. */
export function bossWords() {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    const out = ORDER.filter((id) => ids.includes(id)).map((id) => [id, BOSS_WORDS[id]]);
    for (const a of ACHIEVEMENTS) if (!ORDER.includes(a.id)) out.push([a.id, BOSS_WORDS[a.id] || titleWords(a)]);
    return out;
}

/**
 * The boss a phrase asks for, or null. It must sound like a request («найди», «где», «хочу найти»…)
 * or be the name alone (two or three words: «паучиха», «Ледяная королева»).
 */
export function bossOfWords(text) {
    const t = norm(text);
    if (!t) return null;
    const short = t.split(' ').length <= 3;
    if (!short && !ASK.test(t)) return null;
    for (const [id, res] of bossWords()) if (res.some((re) => re.test(t))) return id;
    return null;
}

/** «к паучихе» — to whom it leads (a new boss: «к цели …»). */
export const BOSS_TO = {
    king: 'к королю', iceQueen: 'к Ледяной Королеве', spider: 'к гигантской паучихе', dragon: 'к дракону',
    blackbeard: 'к капитану Чёрные Усы', tower: 'к Мастеру башни волшебников',
};
export function bossTo(id) {
    if (BOSS_TO[id]) return BOSS_TO[id];
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    return a ? `к цели «${a.title.replace(/^\S+\s+/, '')}»` : 'к цели';
}

// ------------------------------------------------------------------ where (the host)
const CELL = 480; // m: a castle's / a tower's / a lair's cell (Castles.js, WizardTowers.js, DragonLairs.js)
export const SEARCH = { R0: 960, MAX_R: 2880, LAIR_R: 1920, STEP_MS: 2, WAIT_MS: 9000 };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const d2 = (a, x, z) => (a.x - x) ** 2 + (a.z - z) ** 2;

/** Are the castles and towers within R round `from` planned? (asks the workers — or plans a little a frame) */
function sitesReady(g, from, R) {
    const S = g.terrain?.data?.sites;
    if (!S?.castles?.cells || !S.towers?.cells) return true;
    const view = g.world?.terrain;
    if (view?.warmSites) view.warmSites(from.x, from.z, R, CELL);
    else S.warm?.(from.x, from.z, R, CELL, SEARCH.STEP_MS);
    const g0x = Math.floor((from.x - R) / CELL), g1x = Math.floor((from.x + R) / CELL);
    const g0z = Math.floor((from.z - R) / CELL), g1z = Math.floor((from.z + R) / CELL);
    for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) if (!planned(S, gx, gz)) return false;
    return true;
}
const planned = (S, gx, gz) => S.castles.cells.has(S.castles._key(gx, gz)) && S.towers.cells.has(S.towers._key(gx, gz)) && (!S.villages || S.villages.cells.has(S.villages._key(gx, gz)));

/**
 * The castles and towers within job.R round `from` are planned (in the workers, or a little a
 * frame); then the nearest living one in `idx` is chosen. Not planned in time (WAIT_MS): what is known.
 * Nothing alive within R: a ring further, up to MAX_R.
 */
function siteSearch(g, from, job, pick, alive) {
    const S = g.terrain?.data?.sites;
    const idx = S && pick(S);
    if (!idx?.cells) return null;
    job.R = job.R || SEARCH.R0;
    job.t0 = job.t0 || now();
    if (!sitesReady(g, from, job.R) && now() - job.t0 < SEARCH.WAIT_MS) return undefined;
    let best = null;
    for (const def of idx.cells.values()) {
        if (!def || !Number.isFinite(def.x) || d2(def, from.x, from.z) > job.R * job.R || !alive(def)) continue;
        if (!best || d2(def, from.x, from.z) < d2(best, from.x, from.z)) best = def;
    }
    if (best) return best;
    if (job.R >= SEARCH.MAX_R) return null;
    job.R += CELL; job.t0 = now();
    return undefined;
}

/** A spawned creature's place now (a king walking in his castle, the Master at his throne). */
const liveVillager = (g, def, i, role) => () => {
    const v = g.castleLife?.castles?.get(def.id)?.active?.get(i);
    return v && !v.dead && (!role || v.role === role) ? { x: v.x, z: v.z } : null;
};

export const BOSS_FINDERS = {
    // the king of the nearest castle whose king still lives (CastleLife state: kingDead)
    king(g, from, job) {
        const def = siteSearch(g, from, job, (S) => S.castles, (c) => !g.castleLife?.states?.get(c.id)?.kingDead);
        return def ? { x: def.x, z: def.z, live: liveVillager(g, def, 0, 'king') } : def;
    },
    // the Master of the nearest wizards' tower whose Master still lives (roster index 0 — WizardAI)
    tower(g, from, job) {
        const def = siteSearch(g, from, job, (S) => S.towers, (t) => !g.castleLife?.states?.get(t.id)?.killed?.has(0) && !g.achievements?.towers?.get?.(t.id)?.masterDead);
        return def ? { x: def.x, z: def.z, live: liveVillager(g, def, 0, 'master') } : def;
    },
    // the Ice Queen: one palace in the world (none in some worlds)
    iceQueen(g) {
        const L = g.iceCastle, plan = L?.plan;
        if (!plan || L.state?.queenDead) return null;
        const at = plan.throne && Number.isFinite(plan.throne.x) ? plan.throne : plan;
        return { x: at.x, z: at.z, live: () => { const q = L.queen; return q ? { x: q.model.position.x, z: q.model.position.z } : null; } };
    },
    // the giant spider: she comes out only at night, for the night — the one there is now
    spider(g, from) {
        let best = null;
        for (const s of g.spiders?.targets?.() || []) { const p = s.model.position; if (!best || d2(p, from.x, from.z) < d2(best.p, from.x, from.z)) best = { s, p }; }
        if (!best) return null;
        const s = best.s;
        return { x: best.p.x, z: best.p.z, live: () => (s.dead ? null : { x: s.model.position.x, z: s.model.position.z }) };
    },
    // a dragon: one flying about now, or the nearest lair whose dragons still live (Dragons.state)
    dragon(g, from, job) {
        const D = g.dragons, data = g.terrain?.data;
        let live = null;
        for (const d of D?.targets?.() || []) { const p = d.model.position; if (!live || d2(p, from.x, from.z) < d2(live.p, from.x, from.z)) live = { d, p }; }
        if (live && d2(live.p, from.x, from.z) < 600 * 600) { const d = live.d; return { x: live.p.x, z: live.p.z, live: () => (d.dead ? null : { x: d.model.position.x, z: d.model.position.z }) }; }
        if (!data?.lairOf) return live ? { x: live.p.x, z: live.p.z } : null;
        // (a lair's mountain is measured on the castles' land: that land is planned first, in the
        //  workers; a lair whose land is not planned yet is left out — never a long frame here)
        const S = data.sites;
        if (!job.sites) {
            job.t0 = job.t0 || now();
            job.R = SEARCH.LAIR_R;
            if (!sitesReady(g, from, job.R) && now() - job.t0 < SEARCH.WAIT_MS) return undefined;
            job.sites = true;
        }
        if (!job.cells) {
            job.cells = [];
            const n = Math.ceil(job.R / CELL), fx = Math.floor(from.x / CELL), fz = Math.floor(from.z / CELL);
            for (let gz = fz - n; gz <= fz + n; gz++) for (let gx = fx - n; gx <= fx + n; gx++) job.cells.push([gx, gz]);
            job.cells.sort((a, b) => ((a[0] - fx) ** 2 + (a[1] - fz) ** 2) - ((b[0] - fx) ** 2 + (b[1] - fz) ** 2));
            job.i = 0; job.best = null;
        }
        const t0 = now();
        while (job.i < job.cells.length && now() - t0 < SEARCH.STEP_MS) {
            const [gx, gz] = job.cells[job.i++];
            if (S?.castles?.cells && !(planned(S, gx, gz) && planned(S, gx - 1, gz) && planned(S, gx + 1, gz) && planned(S, gx, gz - 1) && planned(S, gx, gz + 1))) continue;
            const L = data.lairOf(gx, gz);
            if (!L) continue;
            const st = D?.state?.[L.id];
            if (st?.d?.length && st.d.every((q) => q.dead)) continue; // (all its dragons killed)
            const at = L.mouth || L;
            if (!job.best || d2(at, from.x, from.z) < d2(job.best, from.x, from.z)) job.best = { x: at.x, z: at.z };
        }
        if (job.i < job.cells.length) return undefined;
        const lair = job.best;
        if (live && (!lair || d2(live.p, from.x, from.z) < d2(lair, from.x, from.z))) { const d = live.d; return { x: live.p.x, z: live.p.z, live: () => (d.dead ? null : { x: d.model.position.x, z: d.model.position.z }) }; }
        return lair;
    },
    // Captain Black Moustache: his black ship on its round on the sea (Blackbeard.js)
    blackbeard(g) {
        const B = g.blackbeard, ship = B?.ship;
        if (ship) {
            if (B.taken || ship.state === 'wreck' || ship.state === 'sinking' || g.ships?.crew?.captainAlive?.(ship) === false) return null;
            const at = () => (ship.st && Number.isFinite(ship.st.x) ? { x: ship.st.x, z: ship.st.z } : null);
            const p = at();
            return p ? { ...p, live: at } : null;
        }
        const s = B?.spot;
        return s && Number.isFinite(s.x) ? { x: s.x, z: s.z } : null;
    },
};
