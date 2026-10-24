/**
 * Pentagranium.js — «Пентаграниум» (Pentagranium): black magic. The wand's ray draws on the ground; a circle, then a five-pointed
 * star inside it, make a pentagram — and on a pentagram the rite «дьявольской силы» can be made. The rules and the recognition
 * are in Pentagrams.js (pure, tested); the look — src/fx/PentagramFx.js.
 *
 *  - Only from a scroll (SpellBook: its own key); 20 mana at once, then 1 a second while drawing (HELD `Pentagranium`: the
 *    concentration — nothing else is said but «стоп»). It does not start (and costs nothing) while the hero has seen no
 *    drawing-scroll of any figure (Creative knows them all) — and a figure never seen is never counted, drawn right or not.
 *  - The trail: a dark glowing line where the wand points at the ground (a stitch every PENT.STEP m; the ray leaving the
 *    ground for a moment makes a new stroke). The figure is looked for in the stitches (Pentagrams.recognize), no more often
 *    than PENT.CHECK_EVERY s; counted → the pentagram stays lit (PENT.LIFE s of game time, or until the ground under it is
 *    changed), the spell ends, the mana's «first success» is counted and the black mage's level grows (Mana.success → DarkMagic).
 *  - The rite: the body of a killed wizard (not bones) whose power the hero already took is laid on the pentagram with
 *    «Вингардиум Левиоса» (let go inside the circle). The pentagram flares with hellfire, the body sinks into ash and the hero
 *    gets once more 25 % of (his maximum − 30) — once per body (`b.rit`), +1 to the black level. Who decides: the caster's computer
 *    (it knows whose power it took); the others see the same (`pgm` — the mark, `pgr` — the rite) and play it.
 *
 * Multiplayer: the pentagram and the rite go to everybody ('pgm' / 'pgr'); the host does not need to count anything — the
 * credit is local to the hero whose pentagram it is (the same as every first-success and kill credit: Mana.js).
 */

import * as THREE from 'three';
import { castingHand } from './WandAim.js';
import { PENT, RITE, figureOf, figureIds, Seen, riteBody, riteGain, RITE_HINT, inside } from './PentagramRules.js';
import { PENTAGRAMS as TABLE } from './Pentagrams.js';
import { CircleAssist, LineAssist, buildGraph, anchorsOf, turnAway, ASSIST_HINT } from './PentagramAssist.js';
import { USE, USE_HINT, mendPlan, mendPrice, pairUp } from './PentagramUse.js';
import { pieceMax } from './ArmorTypes.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';
import { PentagramFx } from '../fx/PentagramFx.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import { BLOCK } from '../world/Terrain.js';
import { addDark } from './DarkMagic.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3();

const PIECE_NAME = { helmet: 'шлем', chest: 'нагрудник', legs: 'поножи' };

const POINT_COLOR = { devil: 0xe0203c, teleport: 0x4aa8ff, life: 0x3fc84a, mend: 0xd0d8e8, enchant: 0xb07cff };

/** What to do on each pentagram (the line after it is lit). */
const USE_TEXT = {
    devil: 'Положите на неё тело убитого волшебника с помощью «Вингардиум Левиосы»: вы получите ещё часть его силы (нужно 50 маны)',
    teleport: 'Нарисуйте вторую такую же где угодно, потом встаньте на любую из них и простойте 3 секунды (50 маны) — вы окажетесь на другой',
    life: 'Встаньте на неё (50 маны) — здоровье восстановится целиком',
    mend: 'Встаньте на неё — надетая броня будет починена (у каждой части своя цена)',
    monster: 'Встаньте в круг (200 маны) — и на 10 минут вы огромный монстр',
};

export class Pentagranium {
    constructor(game) {
        this.game = game;
        this.seen = new Seen(); // the figures the hero has unrolled and looked at (saved: WorldSave)
        this.fx = new PentagramFx(game);
        this.draw = null; // {pts, strokes, t, nextCheck, lastN, last, gapT}
        this.marks = new Map(); // id → a lit pentagram {id, by, pent, x, y, z, r, rot, life, hell, fade, rites[], floor[], mine}
        this._n = 0;
        this._t = 0;
        this._groundT = 0;
        this._riteT = 0;
        this.aim = null; // (tests) {origin, dir}
        this._pending = []; // permanent pentagrams of the save not made yet (their land is not here)
        this._use = new Map(); // mark id → what standing on it does now {in, t, cd, hinted, from}
    }

    get on() { return !!this.draw; }
    get data() { return this.game.terrain?.data || null; }
    get creative() { return this.game.config?.mode === 'creative' || this.game.config?.mode === 'test'; }

    // ------------------------------------------------------------ the figures the hero knows
    /** The drawing-scroll of figure `id` is burnt (Items.applyScroll): the figure is learnt for good (the author: looking at the scroll teaches nothing). */
    learnFigure(id) {
        if (!this.seen.add(id)) { this.game.hud.setVoice?.(`📜🔥 Свиток сгорел: рисунок «${figureOf(id)?.ru || id}» вы уже знали`, true); return false; }
        if (id === 'breakward') this.game.breakward?.learn?.(); // (their mark's own «known» flag: the drawing is learnt)
        this.game.hud.setVoice?.(`📜🔥 Свиток сгорел: теперь вы знаете рисунок «${figureOf(id).ru}» — нарисуйте его палочкой: скажите «Пентаграниум»`, true);
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
        const out = [...this.marks.values()].filter((m) => m.perm && (m.mine || this.game.authority)).map((m) => ({ id: m.id, by: m.by, pent: m.pent, x: m.x, y: m.y, z: m.z, r: m.r, rot: m.rot, pair: m.pair || null }));
        return out.length ? out.concat(this._pending.filter((p) => !out.some((o) => o.id === p.id))) : this._pending.length ? this._pending.slice() : null;
    }
    marksRestore(list) { this._pending = (Array.isArray(list) ? list : []).filter((m) => m && figureOf(m.pent) && TABLE[m.pent]?.permanent).slice(0, USE.PERM_MAX); }

    // ------------------------------------------------------------ the cast
    /** Voice on my computer. `aim` ({origin, dir}) is for tests. */
    cast(isFinal, aim = null) {
        const g = this.game;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (this.draw) return hint('🩸 Вы уже рисуете. «Стоп» — закончить');
        if (aim) this.aim = aim;
        const hand = this.aim ? { side: 'right', origin: this.aim.origin, dir: this.aim.dir } : castingHand(g);
        if (!hand) return hint('🩸 Поднимите палочку (руку), направьте на землю и скажите «Пентаграниум»');
        if (g.swim?.underwater) return hint('🩸 Под водой рисунок не держится');
        if (!this.known().length) return hint('🩸 Вы не знаете ни одной пентаграммы — найдите свиток с рисунком и сожгите его («Инферно»): так вы выучите рисунок');
        const tired = g.combat.check('Pentagranium');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('Pentagranium');
        this.begin();
        g.hud.setVoice('✨ Обведите палочкой круг на земле — ровно рисовать не нужно, он ляжет сам. Потом появятся светящиеся точки: ведите палочку от одной к другой (1 мана в секунду, «стоп» — закончить)', true);
        return 'Pentagranium';
    }

    begin() {
        this.draw = { phase: 'circle', circle: new CircleAssist(), line: null, t: 0, gap: 0, hint: {}, stitched: false, idle: 0 };
        this.fx.trailBegin();
        this.game.perf?.note?.('🩸 Пентаграниум: рисование');
    }

    /** «стоп» / the mana is out / timeout / counted: the drawing ends (the trail is gone). True if it was on. */
    stop(why = 'stop') {
        const D = this.draw;
        if (!D) return false;
        this.draw = null;
        this.fx.trailEnd();
        this.fx.anchorsHide();
        const g = this.game;
        if (why === 'mana') g.hud.setVoice('🩸 Мана кончилась — рисунок рассеялся', true);
        else if (why === 'time') g.hud.setVoice('🩸 Слишком долго — след рассеялся', true);
        else if (why === 'stop') g.hud.setVoice('🩸 Рисунок не закончен — след рассеялся', true);
        g.perf?.note?.('🩸 Пентаграниум: конец (' + why + ')');
        return true;
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
        if (this.draw) this._drawStep(dt);
        this._pendingStep(dt);
        for (const m of this.marks.values()) { this._markStep(m, dt); if (m.perm && this.marks.has(m.id)) this._useStep(m, dt); }
        if (this.marks.size) {
            this._riteT -= dt;
            if (this._riteT <= 0) { this._riteT = 0.25; this._findRites(); }
        }
    }

    /** A hint at most once in `every` s per kind. */
    _hint(key, text, every = 5) {
        const D = this.draw;
        if (!D || D.t - (D.hint[key] ?? -1e9) < every) return;
        D.hint[key] = D.t;
        this.game.hud.setVoice(text, true);
    }

    /** The drawing goes with help (PentagramAssist.js): first the circle (fitted perfect), then the wand is led from glowing point to point. */
    _drawStep(dt) {
        const g = this.game, D = this.draw;
        D.t += dt;
        if (g.combat?.drain(PENT.DRAIN * dt, dt) === false) { this.stop('mana'); return; }
        if (D.t > PENT.DRAW_MAX) { this.stop('time'); return; }
        const p = this.groundAt();
        const h = (x, z) => this._height(x, z);
        if (!p) { D.stitched = false; this.fx.trailBreak(); D.idle += dt; if (D.idle > 6) this._hint('aim', '🩸 Направьте палочку на землю', 8); return; }
        D.idle = 0;
        if (D.phase === 'circle') {
            const e = D.circle.add(p.x, p.z);
            if (!e) return;
            if (e.t === 'stitch') {
                this.fx.trailAdd(e.x, h(e.x, e.z), e.z, D.stitched); D.stitched = true;
                if (Math.random() < 0.4) this.fx.trailSmoke(e.x, h(e.x, e.z), e.z);
            } else if (e.t === 'bad') {
                this._hint('size', '🩸 ' + ASSIST_HINT[e.why], 4);
                D.circle = new CircleAssist(); D.stitched = false; this.fx.trailBegin(); // (start the circle again)
            } else if (e.t === 'closed') this._circleClosed(e);
            return;
        }
        const L = D.line;
        let hovering = false;
        for (const e of L.step(p.x, p.z)) {
            if (e.t === 'edges') for (const k of e.keys) this._edge(L, k);
            else if (e.t === 'refuse') this._hint('refuse', '🩸 ' + ASSIST_HINT.refuse, 3);
            else if (e.t === 'done') { this._counted(e.id, { cx: L.circle.cx, cz: L.circle.cz, r: L.circle.r, rot: L.circle.rot }); return; }
        }
        hovering = L.hover >= 0;
        this.fx.anchorsHover(L.hover, this._t);
        D.pointless = hovering ? 0 : (D.pointless || 0) + dt;
        if (D.pointless > 4) { D.pointless = 0; this._hint('lead', '🩸 ' + ASSIST_HINT.lead, 6); }
    }

    /** The circle is closed (perfect, by the fit): it is laid whole, and the guiding points of the learnt figures light up inside it. */
    _circleClosed(c) {
        const g = this.game, D = this.draw, h = (x, z) => this._height(x, z);
        const me = g.character.group.position;
        const known = this.known().sort((a, b) => (a === 'devil' ? -1 : b === 'devil' ? 1 : 0));
        const rot = turnAway(c.cx, c.cz, me.x, me.z);
        D.line = new LineAssist(buildGraph(known), { cx: c.cx, cz: c.cz, r: c.r, rot });
        D.phase = 'lines';
        this.fx.trailBegin();
        this.fx.trailRing(c.cx, c.cz, c.r, h);
        const color = (ids) => POINT_COLOR[ids[0]] ?? TABLE[ids[0]]?.glow ?? 0xffb800; // (strong colours: the points are seen on bright grass)
        this.fx.anchorsShow(anchorsOf(D.line).map((a, i) => ({ x: a.x, y: h(a.x, a.z), z: a.z, color: color(D.line.graph.nodes[i].ids) })));
        g.hud.setVoice('✨ Круг готов. Ведите палочку от одной светящейся точки к другой: линии лягут ровно, дрожать рукой не страшно', true);
        g.sound?.playSpellFxAt?.('fxPentagram', _o.set(c.cx, h(c.cx, c.cz), c.cz), 0.8, 1.2, 14);
        for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; g.fx?.spark(_o.set(c.cx + Math.cos(a) * c.r, h(c.cx, c.cz) + 0.2, c.cz + Math.sin(a) * c.r), i % 2 ? 0xfff0b8 : 0xffc860, 0.14, _d.set(0, 1.2 + Math.random(), 0), 1); }
        g.sync?.pentagram?.({ k: 'ring', x: c.cx, y: h(c.cx, c.cz), z: c.cz, r: c.r });
    }

    /** One line between two points is laid ruler-straight; a spray of sparks along it; the others see it too. */
    _edge(L, key) {
        const ends = L.edgeEnds(key);
        if (!ends) return;
        const h = (x, z) => this._height(x, z), g = this.game;
        this.fx.trailLine(ends[0], ends[1], h);
        this._sparkLine(ends[0], ends[1], h(ends[0][0], ends[0][1]));
        g.sync?.pentagram?.({ k: 'seg', a: [ends[0][0], ends[0][1]], b: [ends[1][0], ends[1][1]], y: h(ends[0][0], ends[0][1]) });
    }

    _sparkLine(a, b, y) {
        const fx = this.game.fx;
        if (!fx) return;
        const n = Math.max(4, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.35));
        for (let i = 0; i <= n; i++) fx.spark(_o.set(a[0] + (b[0] - a[0]) * i / n, y + 0.2, a[1] + (b[1] - a[1]) * i / n), i % 2 ? 0xfff0b8 : 0xffc860, 0.1, _d.set((Math.random() - 0.5) * 0.4, 0.8 + Math.random(), (Math.random() - 0.5) * 0.4), 0.8);
    }

    // ------------------------------------------------------------ a figure is counted
    _counted(id, r) {
        const g = this.game, data = this.data;
        const cx = r.cx, cz = r.cz;
        const y = this._height(cx, cz);
        const origin = _o.set(cx, y, cz);
        if (g.wards?.forbids?.(origin, origin)) { this.stop('stop'); g.hud.setVoice('🛡️ Здесь чужая защита дома — пентаграмма не держится', true); return; }
        this.stop('done');
        const mark = this._place(`${g.localId}:${Date.now().toString(36)}${this._n++}`, g.localId, id, cx, y, cz, r.r, r.rot);
        if (!mark) return;
        mark.mine = true;
        this._permanent(mark);
        this._others(mark);
        g.sync?.pentagram?.({ k: 'mark', id: mark.id, by: g.localId, pent: id, x: cx, y, z: cz, r: r.r, rot: r.rot, perm: mark.perm ? 1 : 0, pair: mark.pair || null });
        g.mana?.success('Pentagranium'); // (the mark is made: the first success's cells; drawing a pentagram is no black magic — only the devil one's rite adds darkness)
        if (TABLE[id]?.dark) g.castleLife?.alarm?.({ x: cx, y, z: cz }, 'dark', g.localId, 6); // (only a black pentagram frightens people)
        g.hud.setVoice(`✨ «${figureOf(id).ru}» засветилась на земле! ${USE_TEXT[id] || ''}`, true);
        g.sound?.playSpellFxAt?.('fxPentagram', origin, 1, 1, 14);
        for (let i = 0; i < 70; i++) {
            const a = (i / 70) * Math.PI * 2;
            g.fx?.spark(_o.set(cx + Math.cos(a) * mark.r, y + 0.2, cz + Math.sin(a) * mark.r), mark.dark ? (i % 2 ? 0xff2a44 : 0x8a0a1c) : (i % 2 ? 0xfff0b8 : TABLE[id]?.glow ?? 0xffd98a), 0.18, _d.set(Math.cos(a) * 0.6, 1.6 + Math.random() * 1.5, Math.sin(a) * 0.6), 1.3);
        }
    }

    /**
     * The other sessions' pentagrams (the shared table, Pentagrams.js): what happens when their drawing is counted. Gargoyles — their
     * ritual starts at the centre (`def.use`); enchanting — their circle is laid (EnchantCircles.add: it draws itself); «слом защиты» —
     * stepping into the circle puts the mark on (BreakwardMark.activate), then the drawing goes out (`once`).
     */
    _others(m) {
        const g = this.game, def = TABLE[m.pent], c = { x: m.x, y: m.y, z: m.z };
        if (!def || m.pent === 'devil') return;
        if (m.pent === 'enchant') { g.enchantCircles?.add?.(c.x, c.y, c.z); this._remove(m.id, 'old'); return; }
        if (typeof def.use === 'function') { def.use(g, { center: c, by: g.localId }); if (def.once) m.life = Math.min(m.life, 6); }
    }

    /** A good pentagram (`permanent` in the table) stays for good: the oldest permanent one goes when there are too many; teleport ones are paired. */
    _permanent(m) {
        if (!TABLE[m.pent]?.permanent) return;
        m.perm = true; m.life = Infinity;
        const perms = () => [...this.marks.values()].filter((o) => o.perm);
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
            const to = m.pair && this.marks.get(m.pair);
            if (!to) return hint('🌀 ' + USE_HINT.noPair);
            if (mana < USE.COST) return hint('🌀 ' + USE_HINT.noMana);
            if (Math.hypot(me.x - s.from.x, me.z - s.from.z) > USE.STILL) { s.from = { x: me.x, z: me.z }; s.t = 0; }
            if (s.t === 0) g.hud.setVoice?.('🌀 Стойте на месте — через 3 секунды вы окажетесь на другой пентаграмме', true);
            s.t += dt;
            if (Math.random() < dt * 30) this._ring(m, s.t / USE.TELEPORT_HOLD);
            if (s.t < USE.TELEPORT_HOLD) return;
            if (!this.data?.landMade?.(Math.round(to.x), Math.round(to.z))) { s.t = USE.TELEPORT_HOLD - 0.5; return hint('🌀 ' + USE_HINT.noLand); }
            if (pays) { c.fatigue -= USE.COST; c._hudKey = ''; }
            this._useFx('teleport', m, true);
            me.set(to.x, to.y + PLAYER_GROUND_OFFSET + 0.1, to.z);
            g.character.verticalVelocity = 0;
            g.knockback?.set?.(0, 0, 0);
            this._useFx('teleport', to, true);
            s.t = 0; s.in = false;
            const ts = this._use.get(to.id) || { in: false, t: 0, cd: 0, hinted: false, locked: false, from: null };
            ts.in = true; ts.locked = true; ts.t = 0; this._use.set(to.id, ts); // (arrived: it does not jump back until the hero steps off)
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
    _place(id, by, pent, x, y, z, r, rot) {
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
        const m = { id, by, pent, perm: false, pair: null, dark: !!TABLE[pent]?.dark, x, y, z, r: R, rot: rot || 0, life: PENT.LIFE, hell: 0, fade: 0, rites: [], floor, mine: false, t: 0 };
        this.marks.set(id, m);
        this.fx.add(id, x, y, z, R, m.rot, (px, pz) => (data ? data.topLayer(Math.round(px), Math.round(pz)) - 0.5 : y), pent, !!TABLE[pent]?.dark, TABLE[pent]?.glow ?? 0xffd98a);
        return m;
    }

    _remove(id, why = 'end') {
        const m = this.marks.get(id);
        if (!m) return;
        this.marks.delete(id);
        this.fx.remove(id);
        if (m.pair) { const o = this.marks.get(m.pair); if (o) o.pair = null; }
        this._use.delete(id);
        for (const r of m.rites) if (r.b && !r.done) this._riteEnd(m, r, true);
        const g = this.game;
        if (why === 'ground' && m.mine) g.hud.setVoice('🩸 Земля под рисунком изменилась — пентаграмма погасла', true);
        if (why !== 'old') for (let i = 0; i < 16; i++) g.fx?.spark(_o.set(m.x + (Math.random() - 0.5) * m.r * 1.6, m.y + 0.2, m.z + (Math.random() - 0.5) * m.r * 1.6), 0x6a0a18, 0.2, _d.set(0, 0.8, 0), 1);
    }

    _markStep(m, dt) {
        const g = this.game;
        m.t += dt;
        m.life -= dt;
        // lit: it comes up in a second, flares on a rite, goes out in its last 6 s
        const rite = m.rites.find((r) => !r.done);
        const hellWant = rite ? 1 : 0;
        m.hell += (hellWant - m.hell) * Math.min(1, dt * (hellWant ? 3 : 1.2));
        m.fade = Math.min(1, m.t / 1.2, Math.max(0, m.life / 6));
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
            if (stand(g, m, dt, inCircle)) { this._remove(m.id, 'old'); return; }
        }
        if (m.mine && m.pent === 'breakward' && g.breakward && Math.hypot(g.character.group.position.x - m.x, g.character.group.position.z - m.z) < m.r) {
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
            if (!m.mine || m.fade < 0.9 || m.rites.some((r) => !r.done)) continue; // (one rite at a time; only the pentagram's own caster makes it)
            for (const b of death.bodies.values()) {
                if (b.lev || death.falling.has(b.id) || b.netAt && performance.now() - b.netAt < 800) continue;
                if (!inside(m, b.x, b.z, RITE.REACH_K) || Math.abs(b.y - m.y) > 3) continue;
                const took = !!g.mana?.duelsWon?.has?.(String(b.who)) && g.mana.duelsWon.get(String(b.who)) === 'kill';
                const ok = riteBody({ ...b, bones: !!b.bones && !b.model }, m.pent, { took, free: !g.combat?.enabled });
                if (!ok.ok) {
                    if (!b._pgHint && (b.model || b.bones)) { b._pgHint = true; g.hud.setVoice(RITE_HINT[ok.why] || RITE_HINT['no-power'], true); }
                    continue;
                }
                const cost = TABLE.devil?.rite?.cost || 0;
                if (g.combat?.enabled && g.combat.fatigue < cost) { if (!b._pgMana) { b._pgMana = true; g.hud.setVoice(`🩸 Нужно ${cost} маны — тело лежит, пока её не хватает`, true); } continue; }
                if (g.combat?.enabled) { g.combat.fatigue -= cost; g.combat._hudKey = ''; }
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
        if (M && g.combat?.enabled && r.mm > 0) {
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
    /** Another computer: a pentagram was lit ('mark') or a rite is made on it ('rite'). */
    onNet(by, m) {
        if (!m) return;
        if (m.k === 'mark') {
            if (typeof m.id !== 'string' || !figureOf(m.pent)) return;
            const mk = this._place(m.id, by, m.pent, +m.x || 0, +m.y || 0, +m.z || 0, Math.max(PENT.R_MIN, Math.min(PENT.R_MAX, +m.r || 3.5)), +m.rot || 0);
            if (mk) {
                mk.mine = false;
                if (m.perm && TABLE[m.pent]?.permanent) { mk.perm = true; mk.life = Infinity; mk.t = 5; mk.pair = typeof m.pair === 'string' ? m.pair : null; const o = mk.pair && this.marks.get(mk.pair); if (o) o.pair = mk.id; }
            }
        } else if (m.k === 'ring') {
            const x = +m.x || 0, z = +m.z || 0, r = Math.min(PENT.R_MAX, +m.r || 4), y = +m.y || 0, fx = this.game.fx;
            if (fx) for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; fx.spark(_o.set(x + Math.cos(a) * r, y + 0.2, z + Math.sin(a) * r), i % 2 ? 0xfff0b8 : 0xffc860, 0.14, _d.set(0, 1.2 + Math.random(), 0), 1); }
        } else if (m.k === 'seg') {
            if (Array.isArray(m.a) && Array.isArray(m.b)) this._sparkLine([+m.a[0] || 0, +m.a[1] || 0], [+m.b[0] || 0, +m.b[1] || 0], +m.y || 0);
        } else if (m.k === 'fx') {
            if (['teleport', 'life', 'mend'].includes(m.kind)) this._useFx(m.kind, { x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, r: Math.min(PENT.R_MAX, +m.r || 3.5) });
        } else if (m.k === 'rite') {
            const mk = this.marks.get(m.id), b = this.game.death?.bodies.get(m.body);
            if (mk && b && !mk.rites.some((r) => r.id === b.id)) this._riteBegin(mk, b, false);
        }
    }

    sampleModels() { return this.fx.sampleModels(); }

    /** Death / world change: nothing stays lit. */
    clear() { this.stop('stop'); for (const id of [...this.marks.keys()]) this._remove(id, 'old'); }
}
