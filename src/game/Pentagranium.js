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
import { PENT, RITE, RECOG, figureOf, figureIds, Seen, recognizeAny, recognizeHint, riteBody, riteGain, RITE_HINT, inside } from './PentagramRules.js';
import { PENTAGRAMS as TABLE } from './Pentagrams.js';
import { PentagramFx } from '../fx/PentagramFx.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import { BLOCK } from '../world/Terrain.js';
import { addDark, registerDark } from './DarkMagic.js';

registerDark('Pentagranium', true); // (black magic: the mark of a counted pentagram is always +1 — Mana.success → DarkMagic.onDarkCast)

const _o = new THREE.Vector3(), _d = new THREE.Vector3();

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
    }

    get on() { return !!this.draw; }
    get data() { return this.game.terrain?.data || null; }
    get creative() { return this.game.config?.mode === 'creative' || this.game.config?.mode === 'test'; }

    // ------------------------------------------------------------ the figures the hero knows
    /** Looked at the drawing of figure `id` (ScrollReading): remembered for good. */
    seeFigure(id) {
        if (!this.seen.add(id)) return false;
        if (id === 'breakward') this.game.breakward?.learn?.(); // (their mark's own «known» flag: the drawing is learnt)
        this.game.hud.setVoice?.(`🩸 Вы запомнили рисунок: «${figureOf(id).ru}» — теперь вы можете нарисовать её палочкой: скажите «Пентаграниум»`, true);
        return true;
    }

    /** The figures the hero can draw (Creative: all). */
    known() {
        const g = this.game;
        return figureIds().filter((k) => this.creative || this.seen.has(k) || !!g.bonus?.spells?.[TABLE[k]?.scroll] || (k === 'breakward' && !!g.breakward?.known)); // (a drawing seen on a drawing-scroll, or learnt by the other pentagrams' own scrolls)
    }

    snapshot() { return this.seen.set.size ? this.seen.snapshot() : null; }
    restore(list) { this.seen.restore(list); }

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
        if (!this.known().length) return hint('🩸 Вы не знаете, как выглядит ни одна пентаграмма — найдите свиток с рисунком и посмотрите на него');
        const tired = g.combat.check('Pentagranium');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('Pentagranium');
        this.begin();
        g.hud.setVoice('🩸 Водите палочкой по земле: сначала круг, потом внутри него пятиконечная звезда (1 мана в секунду, «стоп» — закончить)', true);
        return 'Pentagranium';
    }

    begin() {
        this.draw = { pts: [], strokes: 0, t: 0, nextCheck: 0, lastN: 0, last: null, gap: 0, lastHint: 0 };
        this.fx.trailBegin();
        this.game.perf?.note?.('🩸 Пентаграниум: рисование');
    }

    /** «стоп» / the mana is out / timeout / counted: the drawing ends (the trail is gone). True if it was on. */
    stop(why = 'stop') {
        const D = this.draw;
        if (!D) return false;
        this.draw = null;
        this.fx.trailEnd();
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
        for (const m of this.marks.values()) this._markStep(m, dt);
        if (this.marks.size) {
            this._riteT -= dt;
            if (this._riteT <= 0) { this._riteT = 0.25; this._findRites(); }
        }
    }

    _drawStep(dt) {
        const g = this.game, D = this.draw;
        D.t += dt;
        if (g.combat?.drain(PENT.DRAIN * dt, dt) === false) { this.stop('mana'); return; }
        if (D.t > PENT.DRAW_MAX) { this.stop('time'); return; }
        const p = this.groundAt();
        if (!p) { D.gap += dt; if (D.gap > 0.25) D.last = null; } // (the ray left the ground: the next stitch begins a new stroke)
        else {
            D.gap = 0;
            const l = D.last;
            if (!l || Math.hypot(p.x - l.x, p.z - l.z) >= PENT.STEP) {
                const far = D.pts.length && Math.hypot(p.x - D.pts[0][0], p.z - D.pts[0][1]) > PENT.SPREAD;
                if (!far && D.pts.length < PENT.MAX_PTS) {
                    const joined = !!l && Math.hypot(p.x - l.x, p.z - l.z) <= PENT.GAP;
                    D.pts.push([p.x, p.z]);
                    if (!joined) D.strokes++;
                    this.fx.trailAdd(p.x, p.y, p.z, joined);
                    if (Math.random() < 0.5) this.fx.trailSmoke(p.x, p.y, p.z);
                    D.last = { x: p.x, y: p.y, z: p.z };
                } else if (far && D.t - D.lastHint > 4) { D.lastHint = D.t; g.hud.setVoice('🩸 Далеко от начала — рисунок должен уместиться в круг', true); }
            }
        }
        // is it the figure?
        D.nextCheck -= dt;
        if (D.pts.length >= RECOG.MIN_PTS && D.nextCheck <= 0 && D.pts.length - D.lastN >= PENT.CHECK_MIN_NEW) {
            D.nextCheck = PENT.CHECK_EVERY; D.lastN = D.pts.length;
            const known = this.known();
            const r = recognizeAny(D.pts, new Set(known)); // (told apart from the other figures: the best fit, the known one first when drawings are alike; it counts only if the hero knows THIS drawing)
            if (r.ok && known.includes(r.id)) { this._counted(r.id, r); return; }
            const refusal = r.ok ? null : r.why === 'small' || r.why === 'large' || r.why === 'order' ? r.why : null;
            if (refusal && D.t - D.lastHint > 5) { D.lastHint = D.t; const h = recognizeHint(refusal); if (h) g.hud.setVoice(h, true); }
        }
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
        this._others(mark);
        g.sync?.pentagram?.({ k: 'mark', id: mark.id, by: g.localId, pent: id, x: cx, y, z: cz, r: r.r, rot: r.rot });
        g.mana?.success('Pentagranium'); // (the mark is made: the first success's cells, and +1 to the black mage's level — DarkMagic)
        g.castleLife?.alarm?.({ x: cx, y, z: cz }, 'dark', g.localId, 6);
        g.hud.setVoice(`🩸 «${figureOf(id).ru}» горит на земле! ${id === 'devil' ? 'Положите на неё тело убитого волшебника с помощью «Вингардиум Левиосы»: вы получите ещё часть его силы' : ''}`, true);
        g.sound?.playSpellFxAt?.('fxPentagram', origin, 1, 1, 14);
        for (let i = 0; i < 70; i++) {
            const a = (i / 70) * Math.PI * 2;
            g.fx?.spark(_o.set(cx + Math.cos(a) * mark.r, y + 0.2, cz + Math.sin(a) * mark.r), i % 2 ? 0xff2a44 : 0x8a0a1c, 0.18, _d.set(Math.cos(a) * 0.6, 1.6 + Math.random() * 1.5, Math.sin(a) * 0.6), 1.3);
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

    _height(x, z) {
        const d = this.data;
        return d ? d.topLayer(Math.round(x), Math.round(z)) - 0.5 : 0;
    }

    /** (every computer) A pentagram is lit. */
    _place(id, by, pent, x, y, z, r, rot) {
        if (this.marks.has(id) || !figureOf(pent)) return null;
        while (this.marks.size >= PENT.MAX_ALIVE) this._remove(this.marks.keys().next().value, 'old');
        const data = this.data;
        const R = Math.max(PENT.R_MIN * 0.9, Math.min(PENT.R_MAX * 1.05, r));
        const floor = [];
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2, fx = x + Math.cos(a) * R, fz = z + Math.sin(a) * R;
            floor.push([Math.round(fx), Math.round(fz), data ? data.topLayer(Math.round(fx), Math.round(fz)) : 0]);
        }
        const cl = data ? data.topLayer(Math.round(x), Math.round(z)) : 0;
        floor.push([Math.round(x), Math.round(z), cl]);
        const m = { id, by, pent, x, y, z, r: R, rot: rot || 0, life: PENT.LIFE, hell: 0, fade: 0, rites: [], floor, mine: false, t: 0 };
        this.marks.set(id, m);
        this.fx.add(id, x, y, z, R, m.rot, (px, pz) => (data ? data.topLayer(Math.round(px), Math.round(pz)) - 0.5 : y), pent);
        return m;
    }

    _remove(id, why = 'end') {
        const m = this.marks.get(id);
        if (!m) return;
        this.marks.delete(id);
        this.fx.remove(id);
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
            if (mk) mk.mine = false;
        } else if (m.k === 'rite') {
            const mk = this.marks.get(m.id), b = this.game.death?.bodies.get(m.body);
            if (mk && b && !mk.rites.some((r) => r.id === b.id)) this._riteBegin(mk, b, false);
        }
    }

    sampleModels() { return this.fx.sampleModels(); }

    /** Death / world change: nothing stays lit. */
    clear() { this.stop('stop'); for (const id of [...this.marks.keys()]) this._remove(id, 'old'); }
}
