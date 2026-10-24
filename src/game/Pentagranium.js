/**
 * Pentagranium.js — «Pentagranium <Name>»: pentagrams on the ground. The author: «Такие сложные пентаграммы никто рисовать не сможет. Теперь
 * рисовать пентаграммы вообще не надо. Ты направляешь палочку на землю и произносишь пентаграмму. В этот момент снимается мана…
 * Человек произносит — и она сама рисуется». Every pentagram is a spell of its own (a phrase: the first word «Pentagranium» and the
 * pentagram's English name — PentagramWords.js); the lone «Pentagranium» is no spell. Rules — Pentagrams.js / PentagramRules.js (pure,
 * tested); the look — src/fx/PentagramFx.js.
 *
 *  - Known only after burning ITS scroll (`stat: 'pentagram'`, `pent: id` — Items.applyScroll → learnFigure); Creative knows all.
 *  - The cast (instant, not held): the wand points at the ground → the figure lies THERE (apex away from the hero, radius PENT.R) and
 *    DRAWS ITSELF (a bright tip runs round the ring and along the lines, sparks, light, a sound — `_animStep`); the mana is taken at the word
 *    (`CAST_COST`: not enough — nothing is made). Black ones (`dark`) alarm the people; the rite of the devil one is over the body of a killed
 *    wizard (`_findRites`: the body inside the circle, 50 mana, +25 % of his power, +1 to the black level).
 *  - The good ones stay for good (teleport, life, mend: saved, `pentMarks`); a mark is bound to its pentagram by `id`, never by its picture.
 *
 * Multiplayer: the pentagram and the rite go to everybody ('pgm' `mark` / `rite`): each computer draws the lines itself from the mark.
 * The credit is local to the hero whose pentagram it is (the same as every first-success and kill credit: Mana.js).
 */

import { manaRules } from './HeroSetup.js';
import * as THREE from 'three';
import { castingHand } from './WandAim.js';
import { PENT, RITE, CAST_COST, figureOf, figureLines, figureIds, Seen, riteBody, riteGain, RITE_HINT, inside, turnAway } from './PentagramRules.js';
import { pentagramWords, pentagramSpell } from './PentagramWords.js';
import { PENTAGRAMS as TABLE } from './Pentagrams.js';
import { USE, USE_HINT, mendPlan, mendPrice, pairUp } from './PentagramUse.js';
import { pieceMax } from './ArmorTypes.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';
import { PartnerSearch } from './PentagramWorld.js';
import { TELEPORT } from '../world/WizardVillages.js';
import { PENT_STAND_FROM_GEN } from '../world/Terrain.js';
import { PentagramFx } from '../fx/PentagramFx.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import { BLOCK } from '../world/Terrain.js';
import { addDark } from './DarkMagic.js';

/** ms: a pentagram's name still being said must hold this long unchanged before it casts (the author: «после Pentagranium подождать полсекунды»). */
export const PAUSE_MS = 500;

const _o = new THREE.Vector3(), _d = new THREE.Vector3();

const PIECE_NAME = { helmet: 'шлем', chest: 'нагрудник', legs: 'поножи' };

/** What to do on each pentagram (the line after it is lit). */
/** Why an effect that starts at the word refused (what the player is told: «why», in plain words). */
const USE_WHY = {
    off: () => '🜏 Горгульи сейчас не выпускаются в этом мире',
    realm: () => '🜏 Здесь, вне земли, пентаграмма горгулий молчит — встаньте на землю',
    spent: () => '🜏 Здесь пентаграмма уже выжжена: горгульи вылетали отсюда — выберите другое место',
    mana: (r) => `🜏 Нужно ${r.need ?? 150} маны — пока не хватает, пентаграмма не появилась`,
    busy: () => '🜏 Рядом уже идёт ритуал горгулий — подождите, пока он закончится',
};

const USE_TEXT = {
    devil: 'Положите на неё тело убитого волшебника с помощью «Вингардиум Левиосы»: вы получите ещё часть его силы (нужно 50 маны)',
    teleport: 'Создайте вторую такую же где угодно, потом встаньте на любую из них и простойте 3 секунды (50 маны) — вы окажетесь на другой',
    life: 'Встаньте на неё (50 маны) — здоровье восстановится целиком',
    mend: 'Встаньте на неё — надетая броня будет починена (у каждой части своя цена)',
    monster: 'Встаньте в круг — и на 10 минут вы огромный монстр',
};

export class Pentagranium {
    constructor(game) {
        this.game = game;
        this.seen = new Seen(); // the figures the hero has unrolled and looked at (saved: WorldSave)
        this.fx = new PentagramFx(game);
        this.marks = new Map(); // id → a lit pentagram {id, by, pent, x, y, z, r, rot, life, hell, fade, rites[], floor[], mine, anim}
        this._n = 0;
        this._t = 0;
        this._groundT = 0;
        this._riteT = 0;
        this._castId = null; this._castAt = 0; // (the phrase just cast: its repeats are the same cast)
        this.aim = null; // (tests) {origin, dir}
        this._pending = []; // permanent pentagrams of the save not made yet (their land is not here)
        this._jobs = new Map(); // settlement id → {def, search, spot, partner} (the world's ready pairs: PentagramWorld.js)
        this._worldGone = new Set(); // settlements whose pentagram was spoilt (the ground changed): not made again while the place is awake
        this._use = new Map(); // mark id → what standing on it does now {in, t, cd, hinted, from}
    }

    get data() { return this.game.terrain?.data || null; }
    get creative() { return this.game.config?.mode === 'creative' || this.game.config?.mode === 'test'; }

    // ------------------------------------------------------------ the figures the hero knows
    /** The drawing-scroll of figure `id` is burnt (Items.applyScroll): the figure is learnt for good (the author: looking at the scroll teaches nothing). */
    learnFigure(id) {
        if (!this.seen.add(id)) { this.game.hud.setVoice?.(`📜🔥 Свиток сгорел: «${figureOf(id)?.ru || id}» вы уже знали`, true); return false; }
        if (id === 'breakward') this.game.breakward?.learn?.(); // (their mark's own «known» flag: the drawing is learnt)
        this.game.hud.setVoice?.(`📜🔥 Свиток сгорел: теперь вы знаете «${figureOf(id).ru}»: направьте палочку на землю и скажите «${pentagramSpell(id)}»`, true);
        return true;
    }

    /** The figures the hero can draw (Creative: all). */
    known() {
        const g = this.game;
        return figureIds().filter((k) => this.creative || this.seen.has(k) || !!g.bonus?.spells?.[TABLE[k]?.scroll] || (k === 'breakward' && !!g.breakward?.known)); // (a drawing seen on a drawing-scroll, or learnt by the other pentagrams' own scrolls)
    }

    snapshot() { return this.seen.set.size ? this.seen.snapshot() : null; }
    restore(list) { this.seen.restore(list); }

    /** The permanent pentagrams (good ones, drawn once): saved with the world; made again when their land is there (nothing is built in the frame the world loads in). */
    marksSnapshot() {
        const out = [...this.marks.values()].filter((m) => m.perm && !m.world && (m.mine || this.game.authority)).map((m) => ({ id: m.id, by: m.by, pent: m.pent, x: m.x, y: m.y, z: m.z, r: m.r, rot: m.rot, pair: m.pair || null }));
        return out.length ? out.concat(this._pending.filter((p) => !out.some((o) => o.id === p.id))) : this._pending.length ? this._pending.slice() : null;
    }
    marksRestore(list) { this._pending = (Array.isArray(list) ? list : []).filter((m) => m && figureOf(m.pent) && TABLE[m.pent]?.permanent).slice(0, USE.PERM_MAX); }

    // ------------------------------------------------------------ the cast
    /** Voice on my computer: `text` is the phrase heard («Pentagranium Teleportis»). `aim` ({origin, dir}) is for tests. */
    cast(isFinal, text, aim = null) {
        const g = this.game;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        const id = pentagramWords(text);
        if (!id || !figureOf(id)) return null; // (the first word alone is no spell: nothing is said, nothing is paid)
        const now = performance.now();
        if (id === this._castId && now - this._castAt < 2500) return null;
        // (a name caught while the phrase is still being said may be only its first sounds, read as another pentagram: while it is heard, it must hold — the same
        // name on two looks ≥ PAUSE_MS apart — or the phrase must end; a full name said clearly is final at once)
        if (!isFinal) {
            const w = this._pending;
            if (!w || w.id !== id || now - w.at > 3000) { this._pending = { id, at: now }; return null; }
            if (now - w.at < PAUSE_MS) return null;
        }
        this._pending = null; // (the microphone repeats an unfinished phrase: one pentagram per phrase)
        const name = pentagramSpell(id);
        if (aim) this.aim = aim;
        const hand = this.aim ? { side: 'right', origin: this.aim.origin, dir: this.aim.dir } : castingHand(g);
        if (!this.known().includes(id)) return hint(`🩸 Вы не знаете «${figureOf(id).ru}» — найдите её свиток и сожгите («Инферно»): тогда её можно будет создать`);
        if (!hand) return hint(`🩸 Поднимите палочку (руку), направьте на землю и скажите «${name}»`);
        if (g.swim?.underwater) return hint('🩸 Под водой пентаграмма не держится');
        const p = this.groundAt();
        if (!p) return hint('🩸 Направьте палочку на землю — пентаграмма ляжет туда, куда вы указываете');
        const origin = _o.set(p.x, this._height(p.x, p.z), p.z);
        if (g.wards?.forbids?.(origin, origin)) return hint('🛡️ Здесь чужая защита дома — пентаграмма не держится');
        const cost = CAST_COST[id] || 0, c = g.combat;
        if (cost && manaRules(g) && (c?.fatigue || 0) < cost) return hint(`🩸 Нужно ${cost} маны — у вас ${Math.floor(c?.fatigue || 0)}`);
        const def = TABLE[id], center = { x: p.x, y: origin.y, z: p.z };
        const r = this._use1(def, center);
        if (r && r.ok === false) return hint(USE_WHY[r.why] ? USE_WHY[r.why](r) : '🩸 Пентаграмма не получилась'); // (gargoyles: the ritual takes the mana and starts at once; it may refuse — then nothing is made, and why is said)
        if (cost && manaRules(g) && c) { c.fatigue -= cost; c._hudKey = ''; }
        const me = g.character.group.position, rot = turnAway(p.x, p.z, me.x, me.z);
        const mark = this._place(`${g.localId}:${Date.now().toString(36)}${this._n++}`, g.localId, id, p.x, center.y, p.z, PENT.R, rot, true);
        if (!mark) return null;
        this._castId = id; this._castAt = now;
        mark.mine = true; mark.prepaid = cost > 0;
        this._permanent(mark);
        this._others(mark);
        g.sync?.pentagram?.({ k: 'mark', id: mark.id, by: g.localId, pent: id, x: p.x, y: center.y, z: p.z, r: PENT.R, rot, perm: mark.perm ? 1 : 0, pair: mark.pair || null });
        if (def.darkBonus) addDark(g.dark || g, def.darkBonus, 'ritual'); // (united power: at once +30 to the dark level, 100 at most — DarkMagic.addDark clamps)
        g.mana?.success('Pentagranium'); // (the first success's cells; making a pentagram is no black magic — only the devil one's rite adds darkness)
        if (def?.dark) g.castleLife?.alarm?.({ x: p.x, y: center.y, z: p.z }, 'dark', g.localId, 6); // (only a black pentagram frightens people)
        g.hud.setVoice(`✨ «${figureOf(id).ru}» рисуется на земле… ${USE_TEXT[id] || ''}`, true);
        g.perf?.note?.(`🩸 ${name}`);
        return 'Pentagranium';
    }

    // ------------------------------------------------------------ the ground under the wand
    /** Where the wand's ray meets the ground: {x, y, z} | null (water, a wall far away, up in the sky). */
    groundAt() {
        const g = this.game, data = this.data;
        if (!data) return null;
        let origin, dir;
        if (this.aim) { origin = this.aim.origin; dir = this.aim.dir; }
        else {
            const hand = castingHand(g);
            if (!hand) return null;
            origin = hand.origin; dir = hand.dir;
        }
        if (dir.y > -0.03) return null;
        const hit = data.raycast(origin, dir, PENT.REACH);
        if (!hit) return null;
        const x = Math.round(hit.x), z = Math.round(hit.z), L = data.topLayer(x, z);
        if (Math.abs(hit.y - (L - 0.5)) > 1.6) return null; // (the side of a wall, a tree, a house: not the ground)
        const under = data.get(x, L - 1, z);
        if (under === BLOCK.WATER || under === BLOCK.AIR) return null;
        if (isEnchanted(under) || data.godGiftAt?.(x, L - 1, z)) return null; // (enchanted stone and the gods' gifts keep no black drawing)
        if (g.ships?.footprintAt?.(x, L - 1, z)) return null;
        return { x: hit.x, y: hit.y, z: hit.z };
    }

    // ------------------------------------------------------------ per frame
    update(dt) {
        this._t += dt;
        this.fx.trailPulse(this._t);
        this._pendingStep(dt);
        this._worldStep(dt);
        for (const m of this.marks.values()) { this._markStep(m, dt); if (m.perm && this.marks.has(m.id)) this._useStep(m, dt); }
        if (this.marks.size) {
            this._riteT -= dt;
            if (this._riteT <= 0) { this._riteT = 0.25; this._findRites(); }
        }
    }

    /** The effect that starts at the word (`def.use`: a function, or 'system.method' of the game — gargoyles): its answer, or undefined if there is none. */
    _use1(def, center) {
        const g = this.game, by = g.localId;
        if (typeof def.use === 'function') return def.use(g, { center, by });
        if (typeof def.use === 'string') { const [sys, fn] = def.use.split('.'); return g[sys]?.[fn]?.(center, { by, silent: true }); }
        return undefined;
    }

    // ------------------------------------------------------------ the figure draws itself
    /** The lines of the drawing in order: the ring round, then the figure's lines one by one — pieces of ≤ 0.8 m on the ground (world [x, z] pairs). */
    _plan(m) {
        const segs = [], push = (a, b, ring) => { segs.push({ a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]), ring }); };
        const N = 48, at = (a) => [m.x + Math.cos(a) * m.r, m.z + Math.sin(a) * m.r];
        const a0 = Math.atan2(Math.cos(m.rot), -Math.sin(m.rot)); // (the ring begins at the figure's apex and goes round)
        for (let i = 0; i < N; i++) push(at(a0 + (i / N) * Math.PI * 2), at(a0 + ((i + 1) / N) * Math.PI * 2), true);
        for (const poly of figureLines(m.pent, m.rot)) {
            const pts = poly.map(([x, z]) => [m.x + x * m.r, m.z + z * m.r]);
            const n = pts.length === 2 ? 1 : pts.length; // (a two-point line is one stroke; a polygon is closed)
            for (let k = 0; k < n; k++) {
                const a = pts[k], b = pts[(k + 1) % pts.length], pcs = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.8));
                for (let i = 0; i < pcs; i++) push([a[0] + (b[0] - a[0]) * i / pcs, a[1] + (b[1] - a[1]) * i / pcs], [a[0] + (b[0] - a[0]) * (i + 1) / pcs, a[1] + (b[1] - a[1]) * (i + 1) / pcs], false);
            }
        }
        return { segs, total: segs.reduce((t, q) => t + q.len, 0) };
    }

    /** A bright tip runs round the ring and along every line (a ribbon of light behind it), sparks fly off it, a flash lights the ground; at the end the figure fades in. */
    _animStep(m, dt) {
        const A = m.anim, g = this.game, h = (x, z) => this._height(x, z), fx = g.fx;
        if (!A.plan) { A.plan = this._plan(m); A.i = 0; A.done = 0; this.fx.trailBegin(); this.fx.trailBreak(); g.sound?.playSpellFxAt?.('fxPentagram', _o.set(m.x, m.y, m.z), 0.9, 1.1, 14); }
        A.t += dt;
        const P = A.plan, target = Math.min(1, A.t / PENT.DRAW_T) * P.total;
        let tip = null;
        while (A.i < P.segs.length) {
            const q = P.segs[A.i];
            if (A.done + q.len <= target + 1e-6) { this.fx.trailLine(q.a, q.b, h); A.done += q.len; A.i++; tip = q.b; continue; }
            const u = (target - A.done) / (q.len || 1);
            tip = [q.a[0] + (q.b[0] - q.a[0]) * u, q.a[1] + (q.b[1] - q.a[1]) * u];
            break;
        }
        if (tip) {
            const y = h(tip[0], tip[1]);
            const dark = m.dark;
            if (fx) for (let i = 0; i < 4; i++) fx.spark(_o.set(tip[0] + (Math.random() - 0.5) * 0.3, y + 0.15, tip[1] + (Math.random() - 0.5) * 0.3), i % 2 ? (dark ? 0xff3a50 : 0xfff0b8) : (TABLE[m.pent]?.glow ?? 0xffc860), 0.14, _d.set((Math.random() - 0.5) * 1.4, 1 + Math.random() * 2, (Math.random() - 0.5) * 1.4), 0.9);
            if ((A._fT = (A._fT || 0) - dt) <= 0) { A._fT = 0.12; fx?.lightFlash?.(_o.set(tip[0], y + 1, tip[1]), TABLE[m.pent]?.glow ?? 0xffc860, 1.6, 0.2, 14); }
        }
        if (A.i >= P.segs.length && A.t >= PENT.DRAW_T) {
            this.fx.trailEnd();
            m.anim = null;
            if (fx) for (let i = 0; i < 70; i++) { const a = (i / 70) * Math.PI * 2; fx.spark(_o.set(m.x + Math.cos(a) * m.r, m.y + 0.2, m.z + Math.sin(a) * m.r), m.dark ? (i % 2 ? 0xff2a44 : 0x8a0a1c) : (i % 2 ? 0xfff0b8 : TABLE[m.pent]?.glow ?? 0xffd98a), 0.18, _d.set(Math.cos(a) * 0.6, 1.6 + Math.random() * 1.5, Math.sin(a) * 0.6), 1.3); }
        }
    }

    _sparkLine(a, b, y) {
        const fx = this.game.fx;
        if (!fx) return;
        const n = Math.max(4, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.35));
        for (let i = 0; i <= n; i++) fx.spark(_o.set(a[0] + (b[0] - a[0]) * i / n, y + 0.2, a[1] + (b[1] - a[1]) * i / n), i % 2 ? 0xfff0b8 : 0xffc860, 0.1, _d.set((Math.random() - 0.5) * 0.4, 0.8 + Math.random(), (Math.random() - 0.5) * 0.4), 0.8);
    }

    /**
     * The other sessions' pentagrams (the shared table, Pentagrams.js): what happens when their pentagram is made. Gargoyles — their
     * ritual has started at the centre (`def.use`, at the word); enchanting — their circle is laid (EnchantCircles.add: it draws itself); «слом защиты» —
     * stepping into the circle puts the mark on (BreakwardMark.activate), then the drawing goes out (`once`).
     */
    _others(m) {
        const g = this.game, def = TABLE[m.pent], c = { x: m.x, y: m.y, z: m.z };
        if (!def || m.pent === 'devil') return;
        if (m.pent === 'enchant') { g.enchantCircles?.add?.(c.x, c.y, c.z); this._remove(m.id, 'old'); return; }
        if (def.once && typeof def.use === 'function') m.life = Math.min(m.life, 6); // (the gargoyles' ritual began at the word: the picture burns out)
    }

    /** A good pentagram (`permanent` in the table) stays for good: the oldest permanent one goes when there are too many; teleport ones are paired. */
    _permanent(m) {
        if (!TABLE[m.pent]?.permanent) return;
        m.perm = true; m.life = Infinity;
        const perms = () => [...this.marks.values()].filter((o) => o.perm && !o.world);
        while (perms().length > USE.PERM_MAX) this._remove(perms()[0].id, 'old');
        if (m.pent === 'teleport') {
            const mate = pairUp([...this.marks.values()], m);
            if (m.mine) this.game.hud.setVoice?.(mate ? '🌀 Две пентаграммы телепортации связаны: встаньте на любую и простойте 3 секунды (50 маны)' : '🌀 Это первая точка. Нарисуйте вторую пентаграмму телепортации где угодно — они свяжутся', true);
        }
    }

    /** The save's permanent pentagrams come back when their land is there (once a second; a few at a time). */
    _pendingStep(dt) {
        if (!this._pending.length) return;
        this._pendT = (this._pendT || 0) - dt;
        if (this._pendT > 0) return;
        this._pendT = 1;
        const g = this.game, data = this.data, me = g.character.group.position;
        if (!data) return;
        for (const p of this._pending.slice()) {
            if (Math.hypot(me.x - p.x, me.z - p.z) > PENT.FAR || !data.landMade?.(Math.round(p.x), Math.round(p.z))) continue;
            this._pending.splice(this._pending.indexOf(p), 1);
            const m = this._place(p.id, p.by, p.pent, p.x, p.y, p.z, p.r, p.rot);
            if (!m) continue;
            m.mine = p.by === g.localId; m.perm = true; m.life = Infinity; m.t = 5; m.pair = p.pair || null;
            return; // (one a second: nothing heavy at once)
        }
    }

    // ------------------------------------------------------------ the world's ready pairs (PentagramWorld.js)
    /** A wizards' settlement wakes: its partner is looked for (a cell a frame), then its teleportation pentagram is lit on the plaza. */
    worldWake(def) {
        const g = this.game, idx = this.data?.villages;
        if (def?.kind !== 'wizvillage' || (g.gen ?? 1) < PENT_STAND_FROM_GEN || !idx?.tpSpot || this._jobs.has(def.id) || !figureOf('teleport')) return;
        this._jobs.set(def.id, { def, search: new PartnerSearch(idx, def.gx, def.gz), made: false, t: 0 });
    }

    /** The settlement falls asleep: its pentagram is put out (made again when it wakes). */
    worldSleep(def) {
        if (!def || !this._jobs.delete(def.id)) return;
        this._worldGone.delete(def.id);
        for (const m of [...this.marks.values()]) if (m.world === def.id) this._remove(m.id, 'old');
    }

    _worldStep(dt) {
        if (!this._jobs.size) return;
        for (const J of this._jobs.values()) {
            if (!J.search.done) { J.search.step(); return; } // (one cell a frame, for one settlement at a time)
            if (J.made || !J.search.partner || this._worldGone.has(J.def.id)) continue;
            J.t -= dt;
            if (J.t > 0) continue;
            J.t = 1;
            const data = this.data, me = J.search.me, to = J.search.partner;
            if (!data?.landMade?.(Math.round(me.x), Math.round(me.z))) continue;
            const y = this._height(me.x, me.z), id = 'w:' + me.id;
            const m = this._place(id, 'world', 'teleport', me.x, y, me.z, TELEPORT.R, 0);
            if (!m) { J.made = true; continue; }
            m.world = J.def.id; m.perm = true; m.life = Infinity; m.t = 5; m.mine = false; m.pairSpot = { id: to.id, x: to.x, z: to.z };
            J.made = true;
            const p = this.game.character.group.position;
            if (Math.hypot(p.x - me.x, p.z - me.z) <= m.r * USE.INSIDE_K) this._use.set(id, { in: true, t: 0, cd: 0, hinted: true, locked: true, from: null }); // (it lit under the hero's feet: no jump until he steps off)
            return;
        }
    }

    // ------------------------------------------------------------ standing on a good pentagram
    _useStep(m, dt) {
        const g = this.game, me = g.character.group.position;
        let s = this._use.get(m.id);
        if (!s) this._use.set(m.id, (s = { in: false, t: 0, cd: 0, hinted: false, locked: false, from: null }));
        s.cd = Math.max(0, s.cd - dt);
        const inside = m.fade > 0.9 && Math.hypot(me.x - m.x, me.z - m.z) <= m.r * USE.INSIDE_K && Math.abs(me.y - PLAYER_GROUND_OFFSET - m.y) < 3;
        if (!inside) { if (s.in && m.pent === 'teleport' && s.t > 0) g.hud.setVoice?.('🌀 ' + USE_HINT.stepped, true); s.in = false; s.t = 0; s.locked = false; return; }
        if (!s.in) { s.in = true; s.hinted = false; s.t = 0; s.from = { x: me.x, z: me.z }; }
        if (s.locked) return;
        const c = g.combat, pays = !!c?.enabled;
        const hint = (t) => { if (!s.hinted) { s.hinted = true; g.hud.setVoice?.(t, true); } };
        const mana = pays ? c.fatigue : Infinity;
        if (m.pent === 'life') {
            if (s.cd > 0) return;
            if (!pays || c.hp >= (c.maxHp || 0) - 1e-6) return hint('💚 ' + USE_HINT.full);
            if (mana < USE.COST) return hint('💚 ' + USE_HINT.noMana);
            c.fatigue -= USE.COST; c.hp = c.maxHp; c._hudKey = ''; g.playerHP = c.hp;
            g.bleeding?.stop?.();
            s.cd = USE.LIFE_CD; s.hinted = false;
            g.hud.setVoice?.('💚 Пентаграмма жизни: здоровье восстановлено', true);
            this._useFx('life', m, true);
        } else if (m.pent === 'mend') {
            if (s.cd > 0) return;
            const worn = g.armor?.worn || {};
            const plan = mendPlan(worn, mana, pieceMax, !pays);
            if (!plan.fix.length && !plan.short.length) return hint('🛡️ ' + USE_HINT.whole);
            if (!plan.fix.length) return hint(`🛡️ Не хватило маны на: ${plan.short.map((k) => PIECE_NAME[k] || k).join(', ')}`);
            if (pays) c.fatigue -= plan.cost;
            if (pays) c._hudKey = '';
            for (const k of plan.fix) worn[k].hp = pieceMax(worn[k]);
            g.armor?._renderCells?.();
            s.cd = USE.MEND_CD; s.hinted = false;
            g.hud.setVoice?.(`🛡️ Броня починена: ${plan.fix.map((k) => PIECE_NAME[k] || k).join(', ')}${plan.short.length ? `. Не хватило маны на: ${plan.short.map((k) => PIECE_NAME[k] || k).join(', ')}` : ''}${pays ? ` (−${plan.cost} маны)` : ''}`, true);
            this._useFx('mend', m, true);
        } else if (m.pent === 'teleport') {
            const to = (m.pair && this.marks.get(m.pair)) || (m.pairSpot && { id: 'virtual', x: m.pairSpot.x, z: m.pairSpot.z, y: null, r: m.r }); // (a settlement's ready pair: the other end may not be made here yet)
            if (!to) return hint('🌀 ' + USE_HINT.noPair);
            if (mana < USE.COST) return hint('🌀 ' + USE_HINT.noMana);
            if (Math.hypot(me.x - s.from.x, me.z - s.from.z) > USE.STILL) { s.from = { x: me.x, z: me.z }; s.t = 0; }
            if (s.t === 0) g.hud.setVoice?.('🌀 Стойте на месте — через 3 секунды вы окажетесь на другой пентаграмме', true);
            s.t += dt;
            if (Math.random() < dt * 30) this._ring(m, s.t / USE.TELEPORT_HOLD);
            if (s.t < USE.TELEPORT_HOLD) return;
            if (!this.data?.landMade?.(Math.round(to.x), Math.round(to.z))) { s.t = USE.TELEPORT_HOLD - 0.5; return hint('🌀 ' + USE_HINT.noLand); }
            if (to.y == null) to.y = this._height(to.x, to.z); // (the land there is made: checked above)
            if (pays) { c.fatigue -= USE.COST; c._hudKey = ''; }
            this._useFx('teleport', m, true);
            me.set(to.x, to.y + PLAYER_GROUND_OFFSET + 0.1, to.z);
            g.character.verticalVelocity = 0;
            g.knockback?.set?.(0, 0, 0);
            this._useFx('teleport', to, true);
            s.t = 0; s.in = false;
            const toId = to.id === 'virtual' ? 'w:' + m.pairSpot.id : to.id;
            const ts = this._use.get(toId) || { in: false, t: 0, cd: 0, hinted: false, locked: false, from: null };
            ts.in = true; ts.locked = true; ts.t = 0; this._use.set(toId, ts); // (arrived: it does not jump back until the hero steps off)
            g.hud.setVoice?.('🌀 Вы перенеслись на парную пентаграмму', true);
        }
    }

    /** Rings of light rising round a pentagram while the teleport gathers (cheap: the shared spark pool). */
    _ring(m, k) {
        const fx = this.game.fx;
        if (!fx) return;
        const a = Math.random() * Math.PI * 2, r = m.r * (0.5 + 0.5 * Math.random());
        fx.spark(_o.set(m.x + Math.cos(a) * r, m.y + 0.15, m.z + Math.sin(a) * r), Math.random() < 0.5 ? 0xe8f4ff : 0xb8d8ff, 0.12 + 0.06 * k, _d.set(0, 1.5 + 4 * k, 0), 0.9);
    }

    /** The glow of a use: a pillar of sparks, a ring spreading, a flash (the shared flash light) and a sound; shown to everybody (`pgm` fx). */
    _useFx(kind, m, send = false) {
        const g = this.game, fx = g.fx, col = { teleport: [0xe8f4ff, 0x9fd0ff], life: [0xb8f5a0, 0xffe58a], mend: [0xeef2f8, 0xffd36e] }[kind] || [0xffffff, 0xffe9a8];
        if (fx) {
            for (let i = 0; i < 60; i++) {
                const a = (i / 60) * Math.PI * 2;
                fx.spark(_o.set(m.x + Math.cos(a) * m.r * 0.9, m.y + 0.2, m.z + Math.sin(a) * m.r * 0.9), col[i % 2], 0.16, _d.set(-Math.cos(a) * 1.2, 2 + Math.random() * 3, -Math.sin(a) * 1.2), 1.3);
            }
            for (let i = 0; i < 40; i++) fx.spark(_o.set(m.x + (Math.random() - 0.5) * 1.6, m.y + 0.2, m.z + (Math.random() - 0.5) * 1.6), col[i % 2], 0.2, _d.set((Math.random() - 0.5) * 0.6, 4 + Math.random() * 6, (Math.random() - 0.5) * 0.6), 1.6);
            fx.lightFlash?.(_o.set(m.x, m.y + 1.5, m.z), col[1], 3, 0.5, m.r * 4 + 10);
        }
        g.sound?.playSpellFxAt?.(kind === 'teleport' ? 'fxTeleport' : kind === 'life' ? 'fxLife' : 'fxMend', _o.set(m.x, m.y, m.z), 1, 1, 18);
        if (send) g.sync?.pentagram?.({ k: 'fx', kind, x: m.x, y: m.y, z: m.z, r: m.r });
    }

    _height(x, z) {
        const d = this.data;
        return d ? d.topLayer(Math.round(x), Math.round(z)) - 0.5 : 0;
    }

    /** (every computer) A pentagram is lit. */
    _place(id, by, pent, x, y, z, r, rot, anim = false) {
        if (this.marks.has(id) || !figureOf(pent)) return null;
        const temp = () => [...this.marks.values()].filter((o) => !o.perm);
        while (temp().length >= PENT.MAX_ALIVE) this._remove(temp()[0].id, 'old'); // (the lit ones of a rite: the oldest goes; the permanent ones are counted apart)
        const data = this.data;
        const R = Math.max(PENT.R_MIN * 0.9, Math.min(PENT.R_MAX * 1.05, r));
        const floor = [];
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2, fx = x + Math.cos(a) * R, fz = z + Math.sin(a) * R;
            floor.push([Math.round(fx), Math.round(fz), data ? data.topLayer(Math.round(fx), Math.round(fz)) : 0]);
        }
        const cl = data ? data.topLayer(Math.round(x), Math.round(z)) : 0;
        floor.push([Math.round(x), Math.round(z), cl]);
        const m = { id, by, pent, perm: false, pair: null, dark: !!TABLE[pent]?.dark, x, y, z, r: R, rot: rot || 0, life: PENT.LIFE, hell: 0, fade: 0, rites: [], floor, mine: false, t: 0, drawT: anim ? PENT.DRAW_T : 0, anim: anim ? { t: 0, plan: null } : null };
        this.marks.set(id, m);
        this.fx.add(id, x, y, z, R, m.rot, (px, pz) => (data ? data.topLayer(Math.round(px), Math.round(pz)) - 0.5 : y), pent, !!TABLE[pent]?.dark, TABLE[pent]?.glow ?? 0xffd98a);
        return m;
    }

    _remove(id, why = 'end') {
        const m = this.marks.get(id);
        if (!m) return;
        this.marks.delete(id);
        this.fx.remove(id);
        if (m.anim) this.fx.trailEnd();
        if (m.pair) { const o = this.marks.get(m.pair); if (o) o.pair = null; }
        this._use.delete(id);
        for (const r of m.rites) if (r.b && !r.done) this._riteEnd(m, r, true);
        const g = this.game;
        if (why === 'ground' && m.world) this._worldGone.add(m.world);
        if (why === 'ground' && m.mine) g.hud.setVoice('🩸 Земля под рисунком изменилась — пентаграмма погасла', true);
        if (why !== 'old') for (let i = 0; i < 16; i++) g.fx?.spark(_o.set(m.x + (Math.random() - 0.5) * m.r * 1.6, m.y + 0.2, m.z + (Math.random() - 0.5) * m.r * 1.6), 0x6a0a18, 0.2, _d.set(0, 0.8, 0), 1);
    }

    _markStep(m, dt) {
        const g = this.game;
        m.t += dt;
        m.life -= dt;
        // lit: it comes up in a second, flares on a rite, goes out in its last 6 s
        const rite = m.rites.find((r) => !r.done);
        const hellWant = Math.max(rite ? 1 : 0, m.unityHell || 0); // (the rite of united power pulses the lines too: UnitedPower.js)
        m.hell += (hellWant - m.hell) * Math.min(1, dt * (hellWant ? 3 : 1.2));
        if (m.anim) this._animStep(m, dt);
        m.fade = Math.min(1, Math.max(0, (m.t - m.drawT) / 1.2), Math.max(0, m.life / 6));
        this.fx.set(m.id, m.fade, m.hell, this._t);
        const near = Math.hypot(g.character.group.position.x - m.x, g.character.group.position.z - m.z) < PENT.FAR;
        if (near) this.fx.ambient(m, dt, m.hell);
        if (m.hell > 0.2 && near && (m._flashT = (m._flashT || 0) - dt) <= 0) { m._flashT = 0.12; g.fx?.lightFlash?.(_o.set(m.x, m.y + 1.2, m.z), 0xff3a12, 3.2 * m.hell * (0.7 + 0.3 * Math.random()), 0.25, m.r * 4 + 10); }
        for (const r of m.rites) if (!r.done) this._riteStep(m, r, dt);
        // (a pentagram that works when its drawer stands in it — the monster one: PentagramMonster.stand)
        const stand = TABLE[m.pent]?.stand;
        if (m.mine && typeof stand === 'function' && m.fade > 0.9) {
            const me = g.character.group.position, S = g.character.size || 1;
            const inCircle = Math.hypot(me.x - m.x, me.z - m.z) <= m.r * USE.INSIDE_K && Math.abs(me.y - PLAYER_GROUND_OFFSET * S - m.y) < 3 && !!g.character.onGround;
            if (g.monster) g.monster.prepaid = !!m.prepaid; // (its 200 mana were taken at the word)
            if (stand(g, m, dt, inCircle)) { this._remove(m.id, 'old'); return; }
        }
        if (m.mine && m.pent === 'breakward' && g.breakward && Math.hypot(g.character.group.position.x - m.x, g.character.group.position.z - m.z) < m.r) {
            g.breakward.prepaid = !!m.prepaid; // (its 50 mana were taken at the word)
            const why = g.breakward.activate(); // (stepped on: the mark is put on once, the drawing goes out; no mana — a hint — leaves it)
            if (why === null || why === 'защита уже сломана') { this._remove(m.id, 'old'); return; }
        }
        m.rites = m.rites.filter((r) => !r.done);
        if (m.life <= 0) { this._remove(m.id, 'time'); return; }
        // the ground under the ring changed (broken, built, a crater)
        if ((m._gT = (m._gT || 0) - dt) <= 0) {
            m._gT = 1;
            const data = this.data;
            if (data) for (const [fx, fz, L] of m.floor) if (Math.abs(data.topLayer(fx, fz) - L) >= PENT.FLOOR_DIFF) { this._remove(m.id, 'ground'); return; }
        }
    }

    // ------------------------------------------------------------ the rite
    /** Bodies at rest inside a lit pentagram: the rite starts (my pentagram), or a hint (my pentagram, once per body). */
    _findRites() {
        const g = this.game, death = g.death;
        if (!death) return;
        for (const m of this.marks.values()) {
            if (m.pent !== 'devil' || !m.mine || m.fade < 0.9 || m.rites.some((r) => !r.done)) continue; // (one rite at a time; only the pentagram's own caster makes it)
            for (const b of death.bodies.values()) {
                if (b.lev || death.falling.has(b.id) || b.netAt && performance.now() - b.netAt < 800) continue;
                if (!inside(m, b.x, b.z, RITE.REACH_K) || Math.abs(b.y - m.y) > 3) continue;
                const took = !!g.mana?.duelsWon?.has?.(String(b.who)) && g.mana.duelsWon.get(String(b.who)) === 'kill';
                const ok = riteBody({ ...b, bones: !!b.bones && !b.model }, m.pent, { took, free: !manaRules(g) });
                if (!ok.ok) {
                    if (!b._pgHint && (b.model || b.bones)) { b._pgHint = true; g.hud.setVoice(RITE_HINT[ok.why] || RITE_HINT['no-power'], true); }
                    continue;
                }
                const cost = TABLE.devil?.rite?.cost || 0;
                if (manaRules(g) && g.combat.fatigue < cost) { if (!b._pgMana) { b._pgMana = true; g.hud.setVoice(`🩸 Нужно ${cost} маны — тело лежит, пока её не хватает`, true); } continue; }
                if (manaRules(g)) { g.combat.fatigue -= cost; g.combat._hudKey = ''; }
                this._riteBegin(m, b, true);
                return;
            }
        }
    }

    /** (every computer) The body `b` lies on the pentagram: it burns. `mine`: I make the rite (my power, my credit). */
    _riteBegin(m, b, mine) {
        const g = this.game;
        b.rit = 1;
        const r = { b, id: b.id, t: 0, done: false, mine, gave: false, mm: b.mm, x: b.x, y: b.y, z: b.z, scale0: b.model?.scale?.x || 1, y0: b.model?.position?.y ?? b.y };
        m.rites.push(r);
        if (mine) {
            g.sync?.pentagram?.({ k: 'rite', id: m.id, body: b.id });
            g.hud.setVoice('🩸 Пентаграмма вспыхнула адским огнём — тело оседает в пепел…', true);
        }
        g.sound?.playSpellFxAt?.('thRite', _o.set(m.x, m.y, m.z), 1, 1, 18);
        g.castleLife?.alarm?.({ x: m.x, y: m.y, z: m.z }, 'dark', mine ? g.localId : null, 10);
        g.perf?.note?.('🩸 Пентаграмма: ритуал над телом ' + b.id);
    }

    _riteStep(m, r, dt) {
        const g = this.game, b = r.b;
        r.t += dt;
        const u = Math.min(1, r.t / RITE.BURN);
        const o = b?.model;
        if (o) {
            // sinks and shrinks into ash: it settles low, then goes
            const k = 1 - 0.85 * u * u;
            o.scale.setScalar(r.scale0 * (0.6 + 0.4 * k));
            o.scale.y = r.scale0 * k;
            o.position.y = r.y0 - u * 0.5;
            o.rotation.z = Math.sin(r.t * 20) * 0.02 * (1 - u);
        }
        // hellfire over the body, ash, smoke
        const fx = g.fx;
        if (fx) {
            const n = Math.min(6, 2 + Math.floor(u * 5));
            for (let i = 0; i < n; i++) {
                _o.set(r.x + (Math.random() - 0.5) * 2.4, r.y + 0.1 + Math.random() * 0.4, r.z + (Math.random() - 0.5) * 2.4);
                const hot = Math.random() < 0.6;
                fx.spark(_o, hot ? (Math.random() < 0.5 ? 0xff5a14 : 0xffb04a) : (Math.random() < 0.5 ? 0x2a2420 : 0x6a0a18), hot ? 0.34 : 0.26, _d.set((Math.random() - 0.5) * 1.2, 2.2 + Math.random() * 3.2, (Math.random() - 0.5) * 1.2), 1 + Math.random() * 0.8);
            }
            if (u > 0.55 && Math.random() < 0.3) fx.spark(_o.set(r.x, r.y + 0.3, r.z), 0xd8d0bc, 0.2, _d.set((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2), 1.6); // (ash)
        }
        // halfway the power goes to the one who made the rite
        if (r.mine && !r.gave && u > 0.45) { r.gave = true; this._give(m, r); }
        if (r.t >= RITE.BURN + 0.3) this._riteEnd(m, r, false);
    }

    _give(m, r) {
        const g = this.game, M = g.mana;
        let n = 0;
        if (M && manaRules(g) && r.mm > 0) {
            n = riteGain(r.mm);
            M.grow(n, 'ritual');
            M.powerFlow?.([r.x, r.y, r.z], n, 'duel');
            M._say?.(`🩸 Пентаграмма отдала ещё силы убитого: +${n} к максимуму маны`);
        } else g.hud.setVoice('🩸 Обряд свершён', true);
        addDark(g.dark || g, RITE.DARK, 'ritual'); // (black magic: +1 to the black mage's level)
    }

    _riteEnd(m, r, early) {
        r.done = true;
        const g = this.game, death = g.death;
        if (r.mine && !r.gave) { r.gave = true; this._give(m, r); } // (the pentagram went out in the middle: the power is not lost)
        if (death?.bodies.has(r.id)) death.removeBody(r.id, false);
        for (let i = 0; i < 30; i++) g.fx?.spark(_o.set(r.x + (Math.random() - 0.5) * 2, r.y + 0.2, r.z + (Math.random() - 0.5) * 2), i % 3 ? 0xd8d0bc : 0xff8a3a, 0.18, _d.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), 1.4);
        // the rite is done: the pentagram burns on a little and goes out
        if (!early) m.life = Math.min(m.life, RITE.EMBERS);
    }

    // ------------------------------------------------------------ network
    /** Another computer: a pentagram was made ('mark') or a rite is made on it ('rite'). */
    onNet(by, m) {
        if (!m) return;
        if (m.k === 'mark') {
            if (typeof m.id !== 'string' || !figureOf(m.pent)) return;
            const mk = this._place(m.id, by, m.pent, +m.x || 0, +m.y || 0, +m.z || 0, Math.max(PENT.R_MIN, Math.min(PENT.R_MAX, +m.r || PENT.R)), +m.rot || 0, true); // (every computer draws the lines itself)
            if (mk) {
                mk.mine = false;
                if (m.perm && TABLE[m.pent]?.permanent) { mk.perm = true; mk.life = Infinity; mk.t = 5; mk.pair = typeof m.pair === 'string' ? m.pair : null; const o = mk.pair && this.marks.get(mk.pair); if (o) o.pair = mk.id; }
            }
        } else if (m.k === 'fx') {
            if (['teleport', 'life', 'mend'].includes(m.kind)) this._useFx(m.kind, { x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, r: Math.min(PENT.R_MAX, +m.r || 3.5) });
        } else if (m.k === 'uni') {
            this.game.united?.onNet(m);
        } else if (m.k === 'rite') {
            const mk = this.marks.get(m.id), b = this.game.death?.bodies.get(m.body);
            if (mk && b && !mk.rites.some((r) => r.id === b.id)) this._riteBegin(mk, b, false);
        }
    }

    sampleModels() { return [...this.fx.sampleModels(), ...(this.game.united?.sampleModels?.() || [])]; }

    /** Death / world change: nothing stays lit. */
    clear() { this.fx.trailEnd(); for (const id of [...this.marks.keys()]) this._remove(id, 'old'); }
}
