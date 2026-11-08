/**
 * WaterPart.js — «Aquadivide» («Акводивиде»): the water stands aside, as the sea for Moses. Only from a scroll; 300 mana at once, then 3 mana a second (held: concentration).
 *
 * The author 07.11: by a lake, a river or the sea the wizard says the spell — the water parts; the sea may be vast, so there is a limit; the wand held straight; the hero
 * walks in, and behind him the water slams shut; the strip before and behind him stays dry while he holds the spell; 300 mana, minus 3 a second.
 *
 * How it plays: the wand raised and pointing ahead (not into the sky) → the corridor's axis is where the wand points (horizontally). A MOVING WINDOW of the corridor is dry round the
 * caster: `PART.AHEAD` m before him, `PART.BEHIND` m behind, `PART.WIDTH` wide; everything beyond it is water again — as he walks on, the water far behind slams shut and the dry strip
 * before him opens (a wave of parting runs out from him). While the arm is raised the axis turns after the wand (at most `PART.TURN` rad/s: a river's bend can be followed); lowered —
 * the axis stays. «Стоп» / no mana / a stun / death → the whole corridor shuts at once (a slam from the far end to the caster). In the window every water block of the column is taken
 * away (top down, `OPEN_LAYERS` a tick) — the sea bed is the floor, nothing is a trick of the mind: real ground, real walls of water to the sides (the terrain draws a water face towards
 * air), the sea's moving sheet is cut out of the picture there (SeaSurface.setCuts). Closing fills the column from the bed up (`CLOSE_LAYERS` a tick): whoever is in it swims.
 *
 * It is a LOCAL change on every computer (never `_sendEdits`: nothing goes into the saved edits or the net's block list — a closed game / a crash cannot leave a hole in the sea):
 * the cast goes to everybody (`spell WaterPart`), every computer carves the window round the caster's body (its avatar) along the axis he sends (`wpat`, a few times a second);
 * «стоп» (`stop`) / the caster leaving → everybody closes. A late joiner sees the sea (no corridor). Guards: `MAX_T` seconds at most, `MAX_COLS` columns at most.
 *
 * ON WHOM AND ON WHAT: see PART_TARGETS. «А если» (CLAUDE.md): cast swimming / flying / on a board / in another body → not cast (a hint, nothing paid); no water in the window → not
 * cast (nothing paid); under a ship / a boat → its water is not taken (the keel would hang in the air); a bridge or a pier over water: only water directly above the bed is taken, the
 * deck stays; a house's sphere of protection: water inside it is not taken; the Gods' temple ground: refused by `data.set`, the column is left (and not tried again); the chunk not
 * yet made (`landMade`) → not touched now (no ground made in the frame); two casters → each their own window, a column shut only when NOBODY wants it open; the caster dies / goes
 * to space / leaves the world → closes; the second word while on → «already», nothing paid; space / planets: `data` has water only where a planet has (terraformed: it works there too);
 * night, rain, dive in the corridor: nothing special (it is dry ground with walls of water); a block put into the corridor stays when it closes (only AIR is filled).
 */
import * as THREE from 'three';
import { BLOCK, MIN_LAYER } from '../world/Terrain.js';
import { castingHand } from './WandAim.js';

export const PART = {
    DRAIN: 3, // mana a second while it is on (the cost at once: Combat.SPELL_COST.WaterPart — 300)
    WIDTH: 11, // m (cells) of the dry strip
    AHEAD: 50, // m before the caster (the sea is vast: a limit)
    BEHIND: 22, // m behind him
    TURN: 0.9, // rad/s: how fast the axis turns after the wand
    PITCH_MIN: -0.9, PITCH_MAX: 0.62, // rad: the wand must point ahead — not at the ground, not into the sky (the author: «палочку прямо»)
    NEED_COLS: 14, // water columns in the window to cast at all
    WAVE: 38, // m/s: the wave of parting runs out from the caster at this speed (the delay of a column = its distance / WAVE)
    OPEN_LAYERS: 3, // layers taken off a column per tick (top down)
    CLOSE_LAYERS: 6, // layers put back per tick (the slam: fast)
    TICK: 0.1, // s between two steps of the carve
    SCAN: 0.2, // s between two scans of the window
    BUDGET: 1800, // cells set at most per tick (no long work in the frame)
    MAX_COLS: 3200, // columns open at most (all casters together)
    MAX_T: 900, // s: nothing holds for ever (a guard)
    SHIP_R: 24, BOAT_R: 7, // m round a ship / a boat whose water is not taken
    FIRST: 6, // cells of the mana maximum the first time the corridor really opened (Mana.FIRST_SPELL.WaterPart)
    LOW_MANA: 20, // mana left in the middle of a sea: warned once
};

/** ON WHOM / ON WHAT (CLAUDE.md «кто/что × как действует»). Checked by tests/unit/spell-targets.test.js. */
export const PART_TARGETS = {
    water: { does: 'part', why: 'вода озера, реки и моря в полосе вокруг героя: блоки воды убираются сверху вниз, дно — пол; по бокам стоит стена воды' },
    me: { does: 'walk', why: 'заклинатель идёт по дну между стенами воды; 300 маны сразу и 3 в секунду; снизу — настоящая земля, ничего не мерещится' },
    players: { does: 'none', why: 'на игроков не действует; все видят раздвинутую воду (каждый компьютер сам убирает воду вокруг тела заклинателя); кто окажется в полосе, идёт по дну, а когда вода сомкнётся — плывёт' },
    zombies: { does: 'none', why: 'не действует; вода уходит из-под них — они стоят на дне' }, castlePeople: { does: 'none', why: 'не действует; люди на дне идут как по земле' },
    animals: { does: 'none', why: 'не действует; плывущие стоят на дне' }, sailors: { does: 'none', why: 'не действует' },
    ships: { does: 'skip', why: 'вода вокруг корабля (24 м) и лодки (7 м) не раздвигается — киль не повиснет в воздухе' },
    fish: { does: 'none', why: 'рыбы и морские существа не трогаются: вода уходит, они остаются в стене воды' },
    blocks: { does: 'none', why: 'камень, песок, постройки, мост и причал над водой остаются; убирается только вода над дном, и только пустые клетки заполняются обратно' },
    wards: { does: 'skip', why: 'в купол защиты дома вода не раздвигается' },
    gods: { does: 'skip', why: 'земля Храма богов — дар богов: вода там остаётся (set отказывает)' },
    spells: { does: 'none', why: 'другие заклинания идут как обычно (кроме тех, что требуют концентрации: «сначала стоп»)' },
    space: { does: 'none', why: 'в космосе воды нет — не колдуется (Space.spaceSpellBlock); на планете с водой работает как на Земле' },
    nonwater: { does: 'none', why: 'лава, ад, лёд: не вода — не трогаются' },
};

/** Is the point inside the moving window: the axis (ax, az) through (px, pz); `s` along it (−behind … ahead), `t` across (±width/2). Pure. */
export function inWindow(px, pz, ax, az, x, z, width = PART.WIDTH, ahead = PART.AHEAD, behind = PART.BEHIND) {
    const dx = x - px, dz = z - pz;
    const s = dx * ax + dz * az, t = -dx * az + dz * ax;
    return s >= -behind && s <= ahead && Math.abs(t) <= width / 2;
}

/** The axis turned from (ax, az) towards (bx, bz) by at most `max` rad; unit in, unit out. Pure. */
export function turnAxis(ax, az, bx, bz, max) {
    const a = Math.atan2(az, ax), b = Math.atan2(bz, bx);
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const k = Math.max(-max, Math.min(max, d)) + a;
    return { ax: Math.cos(k), az: Math.sin(k) };
}

/** The cells of the window (bounding box walked): [{x, z, s}] with their distance along the axis. Pure (the box is cut by `inWindow`). */
export function windowCells(px, pz, ax, az, width = PART.WIDTH, ahead = PART.AHEAD, behind = PART.BEHIND) {
    const R = Math.ceil(Math.max(ahead, behind) + width / 2 + 1), out = [];
    const cx = Math.round(px), cz = Math.round(pz);
    // (only the box round the window's corners, not the whole circle)
    const xs = [px + ax * ahead + -az * width / 2, px + ax * ahead + az * width / 2, px - ax * behind + -az * width / 2, px - ax * behind + az * width / 2];
    const zs = [pz + az * ahead + ax * width / 2, pz + az * ahead - ax * width / 2, pz - az * behind + ax * width / 2, pz - az * behind - ax * width / 2];
    const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), z0 = Math.floor(Math.min(...zs)), z1 = Math.ceil(Math.max(...zs));
    if (!(x1 - x0 < 2 * R + 4 && z1 - z0 < 2 * R + 4) || (cx | cz) === Infinity) return out;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (inWindow(px, pz, ax, az, x, z, width, ahead, behind)) out.push({ x, z, s: (x - px) * ax + (z - pz) * az });
    return out;
}

/** A column's water: { bot, top } layers (bot = the first water layer above the bed, top = the last of the unbroken run), or null (no water right above the bed). Pure on `data`. */
export function waterRun(data, x, z) {
    const bed = data.topLayer(x, z);
    let L = bed + 1, n = 0;
    while (n < 80 && data.get(x, L, z) === BLOCK.WATER) { L++; n++; }
    return n ? { bot: bed + 1, top: L - 1 } : null;
}

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const FOAM = [0xe8fbff, 0xbfeaff, 0x9fd8ff, 0xffffff];
const key = (x, z) => x * 65536 + z; // (|x|, |z| < 32768: the world's area)

export class WaterPart {
    constructor(game) {
        this.game = game;
        this.parts = new Map(); // caster id → { by, mine, ax, az, wax, waz, px, pz, on, t, ownerSeen, lastSend }
        this.cols = new Map(); // key → { x, z, bot, top, cur, mode: 'wait' | 'open' | 'closing', at, want, blocked }
        this._tick = 0; this._scan = 0; this._fx = 0;
        this.on = false; // MY corridor is on
        this._first = false; this._warned = false; this._opened = false;
    }

    get active() { return this.parts.size > 0 || this.cols.size > 0; }

    // ============================================================ my side: the word
    /** Voice on my computer. → 'WaterPart' (cast) | null. */
    cast(isFinal) {
        const g = this.game, ch = g.character;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (this.on) return hint('🌊 Вода уже расступилась. «Стоп» — сомкнуть её');
        const aim = castingHand(g);
        if (!aim || !ch.isArmRaised(aim.side)) return hint('🌊 Поднимите руку с палочкой и направьте её вперёд, на воду — и скажите «Aquadivide»');
        if (ch.swimming || ch.swimY != null) return hint('🌊 Встаньте на берег или на дно — вода расступится впереди вас');
        if (g.flight?.active || ch.flying) return hint('🌊 Вы летите — а вода внизу и так далеко');
        if (g.boards?.mounted || g.boats?.riding) return hint('🌊 Сойдите с доски или лодки, чтобы раздвинуть воду');
        if (g.imperius?.active || g.dragonForm?.active || g.monster?.active) return hint('🌊 В этом теле воду не раздвинуть');
        if (g.space?.handles) return hint('🌊 В космосе воды нет');
        const dir = aim.dir.clone();
        const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y / (dir.length() || 1))));
        if (pitch < PART.PITCH_MIN || pitch > PART.PITCH_MAX) return hint('🌊 Держите палочку прямо перед собой — не в небо и не в землю');
        let ax = dir.x, az = dir.z;
        const hl = Math.hypot(ax, az);
        if (hl < 0.05) return hint('🌊 Направьте палочку вперёд, на воду');
        ax /= hl; az /= hl;
        const p = ch.group.position;
        // is there water to part ahead?
        const data = g.terrain?.data;
        if (!data) return null;
        let wet = 0;
        for (const c of windowCells(p.x, p.z, ax, az)) { if (data.landMade && !data.landMade(c.x, c.z)) continue; if (waterRun(data, c.x, c.z)) wet++; if (wet >= PART.NEED_COLS) break; }
        if (wet < PART.NEED_COLS) return hint('🌊 Впереди нет воды — встаньте у озера, реки или моря и направьте палочку на воду');
        const tired = g.combat.check('WaterPart');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('WaterPart');
        this.on = true; this._warned = false; this._opened = false;
        const o = _v.set(p.x, p.y - 1.9, p.z).clone();
        g.spells.cast('WaterPart', o, new THREE.Vector3(ax, 0, az), aim.side, g.localId);
        g.sync?.spell('WaterPart', o, new THREE.Vector3(ax, 0, az), aim.side);
        g.hud.setVoice('🌊 Вода расступается перед вами. Идите — позади она сомкнётся. «Стоп» — сомкнуть сейчас', true);
        return 'WaterPart';
    }

    /** «стоп» / a broken concentration / no mana: true when mine was on. */
    stop(why = 'stop') {
        if (!this.on) return false;
        this._end(why);
        return true;
    }

    _end(why) {
        const g = this.game;
        this.on = false;
        const mine = this.parts.get(g.localId);
        if (mine) mine.on = false;
        g.perf?.note?.('🌊 Aquadivide: выключена' + (why ? ' (' + why + ')' : ''));
        if (why === 'mana') g.hud.setVoice('🌊 Мана кончилась — вода сомкнулась', true);
        else if (why === 'stop') g.hud.setVoice('🌊 Вода сомкнулась', true);
        this._slam(g.character.group.position);
        if (why !== 'dispose') g.sync?.stopSpells?.();
    }

    // ============================================================ every computer
    /** The cast arrives: `o` — the caster's feet, `d` — the axis (unit, horizontal), `casterId` (or 'local'). */
    fire(o, d, casterId, side) {
        const g = this.game, by = casterId === 'local' || casterId == null ? g.localId : casterId;
        const hl = Math.hypot(d.x, d.z) || 1;
        const ax = d.x / hl, az = d.z / hl;
        this.parts.set(by, { by, mine: by === g.localId, ax, az, wax: ax, waz: az, px: o.x, pz: o.z, on: true, t: 0, seen: performance.now(), sent: -1e9, side: side || 'right', dirSent: [ax, az] });
        if (by === g.localId) this.on = true;
        this._cast(o, ax, az);
        if (by !== g.localId) g.sound?.spellCast?.('WaterPart', _v.set(o.x, o.y + 1.6, o.z)); // (mine is played by the cast itself)
    }

    /** Another computer's axis (wpat): the wand's yaw now. */
    onNet(by, a) {
        const P = this.parts.get(by);
        if (!P || P.mine || !Array.isArray(a)) return;
        const hl = Math.hypot(a[0], a[1]);
        if (!(hl > 0.01)) return;
        P.wax = a[0] / hl; P.waz = a[1] / hl; P.seen = performance.now();
    }

    /** A player's «стоп» / a player leaving: his corridor closes. */
    stopBy(id) {
        const P = this.parts.get(id);
        if (!P) return false;
        P.on = false;
        if (!P.mine) this._slam(_v.set(P.px, 0, P.pz));
        return true;
    }

    update(dt) {
        const g = this.game;
        if (!this.active) return;
        // mine: the guards
        if (this.on) {
            const ch = g.character;
            if (g.combat?.dead || g.isDeadLocal) { this._end('dead'); }
            else if (g.flight?.active || g.imperius?.active || g.space?.handles) { this._end('stop'); }
            else if (g.combat?.drain(PART.DRAIN * dt, dt) === false) { this._end('mana'); }
            else {
                const c = g.combat;
                if (c?.enabled && !this._warned && c.fatigue > 0 && c.fatigue <= PART.LOW_MANA) { this._warned = true; g.hud.setVoice('🌊 Мана на исходе — выходите на берег: вода скоро сомкнётся', true); }
                const P = this.parts.get(g.localId);
                if (P) this._mineStep(P, ch, dt);
            }
        }
        const now = performance.now();
        for (const [by, P] of this.parts) {
            P.t += dt;
            if (!P.mine) {
                const r = g.remotes?.get(by);
                if (r?.position) { P.px = r.position.x; P.pz = r.position.z; P.seen = now; }
                else if (now - P.seen > 10000) P.on = false; // (the caster is gone)
                // the axis follows the sent one, as mine does
                const t = turnAxis(P.ax, P.az, P.wax, P.waz, PART.TURN * dt * 1.6);
                P.ax = t.ax; P.az = t.az;
            }
            if (P.t > PART.MAX_T) P.on = false;
        }
        this._scan -= dt; this._tick -= dt;
        if (this._scan <= 0) { this._scan = PART.SCAN; this._rescan(now); }
        if (this._tick <= 0) { this._tick = PART.TICK; this._stepCols(now); }
        this._fxStep(dt, now);
        // parts that have ended and whose columns are all shut are forgotten
        for (const [by, P] of this.parts) if (!P.on && !this._anyCols()) this.parts.delete(by);
        this._cuts();
    }

    _anyCols() { return this.cols.size > 0; }

    /** My own window: my feet, the axis turned after the wand while the arm is up, and told to the others. */
    _mineStep(P, ch, dt) {
        const g = this.game, p = ch.group.position;
        P.px = p.x; P.pz = p.z;
        const aim = castingHand(g);
        if (aim && ch.isArmRaised(aim.side)) {
            const d = aim.dir, hl = Math.hypot(d.x, d.z);
            const pitch = Math.asin(Math.max(-1, Math.min(1, d.y / (d.length() || 1))));
            if (hl > 0.2 && pitch >= PART.PITCH_MIN && pitch <= PART.PITCH_MAX) { const t = turnAxis(P.ax, P.az, d.x / hl, d.z / hl, PART.TURN * dt); P.ax = t.ax; P.az = t.az; }
        }
        const now = performance.now();
        if (now - P.sent > 250 && (Math.abs(P.ax - P.dirSent[0]) + Math.abs(P.az - P.dirSent[1]) > 0.01 || now - P.sent > 2000)) {
            P.sent = now; P.dirSent = [P.ax, P.az];
            g.sync?.waterPartAxis?.([Math.round(P.ax * 1000) / 1000, Math.round(P.az * 1000) / 1000]);
        }
    }

    /** Which columns the windows want open now (every ~0.2 s): marks the wanted ones, starts new ones. */
    _rescan(now) {
        const g = this.game, data = g.terrain?.data;
        if (!data) return;
        for (const P of this.parts.values()) {
            if (!P.on) continue;
            for (const c of windowCells(P.px, P.pz, P.ax, P.az)) {
                const k = key(c.x, c.z);
                let col = this.cols.get(k);
                if (col) { col.want = now; if (col.mode === 'closing') { col.mode = 'opening'; col.cur = col.top; } continue; }
                if (this.cols.size >= PART.MAX_COLS || (data.landMade && !data.landMade(c.x, c.z))) continue;
                const run = waterRun(data, c.x, c.z);
                if (!run || run.bot < MIN_LAYER + 1) continue;
                if (g.wards?.protects?.(c.x, run.bot, c.z) || this._ship(c.x, c.z)) continue;
                const dist = Math.hypot(c.x - P.px, c.z - P.pz);
                this.cols.set(k, { x: c.x, z: c.z, bot: run.bot, top: run.top, cur: run.top, mode: 'wait', at: now + dist / PART.WAVE * 1000, want: now, sea: !!data.isSeaColumn?.(c.x, c.z) });
            }
        }
    }

    /** A ship / a boat nearby: its water is not taken. */
    _ship(x, z) {
        const g = this.game;
        if (g.ships?.list) for (const s of g.ships.list.values()) { const p = s.pos || s.group?.position || (s.x != null ? s : null); if (p && Math.hypot(p.x - x, p.z - z) < PART.SHIP_R) return true; }
        if (g.boats?.list) for (const b of g.boats.list.values()) if (Math.hypot(b.x - x, b.z - z) < PART.BOAT_R) return true;
        return false;
    }

    /** Carve / fill the columns (a budget of cells a tick). */
    _stepCols(now) {
        const g = this.game, data = g.terrain?.data;
        if (!data) { this.cols.clear(); return; }
        let budget = PART.BUDGET;
        for (const [k, c] of this.cols) {
            if (budget <= 0) break;
            const wanted = now - c.want < 450;
            if (!wanted && c.mode !== 'closing') { c.mode = 'closing'; }
            if (c.mode === 'wait') { if (now >= c.at) c.mode = 'opening'; else continue; }
            if (c.mode === 'opening' || c.mode === 'open') {
                if (c.cur < c.bot) { c.mode = 'open'; if (!this._opened) this._firstOpen(); continue; }
                // (top down: a swimmer is carried down with the surface)
                const stop = Math.max(c.bot, c.cur - PART.OPEN_LAYERS + 1);
                for (let L = c.cur; L >= stop; L--) {
                    if (data.get(c.x, L, c.z) === BLOCK.WATER) {
                        data.set(c.x, L, c.z, BLOCK.AIR);
                        if (data.get(c.x, L, c.z) === BLOCK.WATER) { c.cur = c.bot - 1; c.blocked = true; break; } // (refused — the Gods' ground: left as it is)
                    }
                    budget--;
                }
                if (!c.blocked) c.cur = stop - 1;
                if (c.cur < c.bot) { c.mode = 'open'; }
            } else if (c.mode === 'closing') {
                // from the bed up: the water comes back (only empty cells)
                const from = c.cur + 1, to = Math.min(c.top, c.cur + PART.CLOSE_LAYERS);
                for (let L = from; L <= to; L++) { if (data.get(c.x, L, c.z) === BLOCK.AIR) data.set(c.x, L, c.z, BLOCK.WATER); budget--; }
                c.cur = Math.max(c.cur, to);
                if (c.cur >= c.top || c.blocked) { this.cols.delete(k); }
            }
        }
    }

    _firstOpen() {
        this._opened = true;
        const g = this.game;
        if (this.on && !this._first) { this._first = true; g.mana?.success?.('WaterPart'); }
    }

    // ============================================================ the picture
    /** The sea's moving sheet is cut out of the picture over the windows (SeaSurface.setCuts). */
    _cuts() {
        const S = this.game.seaSurface;
        if (!S?.setCuts) return;
        const list = [];
        for (const P of this.parts.values()) if (P.on && P.t > 0.4) list.push({ px: P.px, pz: P.pz, ax: P.ax, az: P.az, w: PART.WIDTH, ahead: PART.AHEAD, behind: PART.BEHIND, from: P.t * PART.WAVE });
        S.setCuts(list);
    }

    /** The cast: a pillar of light and a ring of spray from the feet, a wave of foam running out along the axis. */
    _cast(o, ax, az) {
        const g = this.game, fx = g.fx;
        if (!fx) return;
        const y = o.y + 0.1;
        for (let i = 0; i < 56; i++) {
            const a = (i / 56) * Math.PI * 2;
            fx.spark(_v.set(o.x, y, o.z), FOAM[i % 4], 0.15, _d.set(Math.cos(a) * 5.5, 0.4, Math.sin(a) * 5.5), 0.9);
        }
        for (let i = 0; i < 40; i++) { // the first wave of the parting runs out ahead
            const s = 2 + i * 1.3, side = (i & 1 ? 1 : -1) * (PART.WIDTH / 2);
            fx.spark(_v.set(o.x + ax * s - az * side, y + 0.3, o.z + az * s + ax * side), 0xcdf3ff, 0.18, _d.set(-az * side * 0.4, 1.8 + Math.random() * 2, ax * side * 0.4), 1.1);
        }
        fx.lightFlash?.(_v.set(o.x, y + 1.2, o.z), 0x7fd8ff, 3.2, 0.7, 20);
        fx.shake = Math.max(fx.shake || 0, 0.18);
    }

    /** The slam: the water comes back — a burst of spray over the strip, a shake near it. */
    _slam(at) {
        const g = this.game, fx = g.fx;
        g.sound?.playSpellFx?.('fxWaterSlam', null, 0.9, 1);
        if (!fx || !at) return;
        const me = g.character.group.position, d = Math.hypot(me.x - at.x, me.z - at.z);
        if (d < 60) fx.shake = Math.max(fx.shake || 0, 0.3 * (1 - d / 60));
    }

    /** Sustained: spray along the walls near the hero, foam where columns close (the shared spark pool, a handful a tick). */
    _fxStep(dt, now) {
        const g = this.game, fx = g.fx;
        this._fx -= dt;
        if (!fx || this._fx > 0) return;
        this._fx = 0.14;
        const cam = g.character.group.position;
        for (const P of this.parts.values()) {
            if (!P.on || Math.hypot(P.px - cam.x, P.pz - cam.z) > 120) continue;
            for (let i = 0; i < 4; i++) { // mist off the walls round the caster
                const s = -PART.BEHIND * 0.6 + Math.random() * (PART.AHEAD * 0.5), side = (Math.random() < 0.5 ? 1 : -1) * (PART.WIDTH / 2 - 0.2);
                const x = P.px + P.ax * s - P.az * side, z = P.pz + P.az * s + P.ax * side, y = cam.y - 1.9 + Math.random() * 6;
                fx.spark(_v.set(x, y, z), FOAM[(Math.random() * 4) | 0], 0.09, _d.set(-P.az * Math.sign(side) * 0.3, 0.3 + Math.random() * 0.6, P.ax * Math.sign(side) * 0.3), 0.8);
            }
        }
        let n = 0;
        for (const c of this.cols.values()) { // foam where the water comes back
            if (c.mode !== 'closing' || n > 8) continue;
            n++;
            fx.spark(_v.set(c.x, c.cur + 0.2, c.z), 0xffffff, 0.2, _d.set((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3), 0.9);
        }
    }

    /** Everything shut at once (the world closes / the game ends): water back, nothing kept. */
    dispose() {
        const g = this.game, data = g.terrain?.data;
        this.on = false;
        if (data) for (const c of this.cols.values()) for (let L = c.cur + 1; L <= c.top; L++) if (data.get(c.x, L, c.z) === BLOCK.AIR) data.set(c.x, L, c.z, BLOCK.WATER);
        this.cols.clear(); this.parts.clear();
        g.seaSurface?.setCuts?.([]);
    }
}
