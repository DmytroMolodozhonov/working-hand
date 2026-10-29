/**
 * DivineCreation.js — «Да пусть создастся …»: the gods' spell said in Russian, the gods make what is described.
 *
 * The author: «Человек говорит «Да пусть создастся …» и описывает ЧТО: постройку (замок с описанием всем, дом, или вообще
 * что угодно — статую свиньи, колодец, мост, башню, корабль…) … Стоит 1000 маны. Создаётся не по заранее определённым
 * деталям, а через ЛОКАЛЬНУЮ GEMMA … Если отвечает долго — компенсировать КРАСИВОЙ анимацией. Это БОЖЕСТВЕННОЕ заклинание,
 * доступно ТОЛЬКО на Венере в библиотеке богов … от обычного дома до целого города по описанию. … ВТОРОЙ тип: создание
 * СВОЕГО СОБСТВЕННОГО СУЩЕСТВА или РАСТЕНИЯ».
 *
 *   How: the wand (or the hand, in Creative) towards the place, «Да пусть создастся замок из белого камня с шестью башнями
 *   и рвом» — the whole description in one phrase (or «Да пусть создастся» and the description in the next phrase, within
 *   10 s). −1000 mana at once (Creative: nothing); the scroll only from the gods' library on Venus (GodsTemple.TEMPLE_SCROLLS).
 *   1. The gods read the words (`seed`): a seed of light grows over the place where the wand points (DivineCreationFx.seed),
 *      their soft choir — while the local Gemma (llm_native.py, the video card) writes the RECIPE (CreationPrompt: a JSON
 *      held by a grammar). Its words coming in make the seed grow — a long answer is a grander light, not a dead wait.
 *      No network on this computer, or its answer broken twice: the gods read the words themselves (CreationRules.guessRecipe)
 *      — the same kind of recipe. Over 40 s: the light fades, the mana comes back.
 *   2. The recipe is checked and clamped (CreationRules.sanitizeRecipe — nothing in it can break the game), the seed bursts:
 *      - a building (anything from a well to a city): its front edge where the wand pointed, its front to the caster; the
 *        ground under it is sampled a little a frame, the place checked (no castle, village, magic house, ship, the gods'
 *        temple, enchanted stone, the sea); its blocks are planned in a worker (CreationBuild.js) and rise from the ground
 *        up, 8–48 s by their number, blocks of its colours flying in (DivineCreationFx.grow). Then its doors, beds, chests,
 *        glass are there (the houses inside — MagicHouse's, furnished the same way);
 *      - a creature: CustomCreatures.create — born out of light where the wand points (its own skeleton, gait, flight,
 *        abilities); a plant: CustomPlants.create — it sprouts there and spreads by itself.
 *   Instant (no concentration held: the gods do it — CLAUDE.md «Концентрация»): the hero may walk, fight, die meanwhile.
 *
 * «На кого и на что»: CreationRules.CREATION_TARGETS. Every «а если» is answered here (the report lists them):
 *   one creation at a time in the world (another is told to wait; nothing paid); the caster gone / silent — the host lets
 *   the seed fade after THINK_MAX + 6 s; the world saved while the gods think — the mana comes back on load; saved while it
 *   rises — its record is saved and it finishes on load (its blocks from the plan: _repair); a body where a block goes — it
 *   waits until they have gone; the caster standing inside the place — it moves away from him; too big — made smaller.
 *
 * Multiplayer: the host decides (the place, the blocks — they travel as block edits —, the doors, beds, chests' things, the
 * creatures and plants); the caster's own computer asks its Gemma and sends the recipe (the host cleans it again); every
 * computer sees the seed, the bloom, the building rising (messages 'dcr'). Saved with the world: the record (recipe, seed,
 * place, the ground's heights — the same plan on every computer) and what is in the chests.
 */

import * as THREE from 'three';
import { manaRules } from './HeroSetup.js';
import { BLOCK, isCastleBlock, isLeaves, TREE_KINDS } from '../world/Terrain.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import { faceTowards } from '../world/MagicHouse.js';
import { HouseMagic, HOUSE_MAGIC } from './HouseMagic.js';
import { Chest } from '../entities/Chest.js';
import { creationWords } from './CreationWords.js';
import { CREATION, MATERIALS, sanitizeRecipe, forbidden, kindOfDesc } from './CreationRules.js';
import { CREATION_SYSTEM, CREATION_SCHEMA, creationUser, creationRetry, parseAnswer, answerProblem } from './CreationPrompt.js';
import { creationPlan, recipeExtent, recipeRect } from '../world/CreationBuild.js';
import { DivineCreationFx, BLOCK_COLOR } from '../fx/DivineCreationFx.js';
import { breathable } from './Space.js';

const r2 = (v) => Math.round(v * 100) / 100;
const _v = new THREE.Vector3();
const TREE_WOOD = new Set(TREE_KINDS.map((k) => k.wood));
/** The land itself (what the gods clear away under a building — never what people built). */
const NATURAL = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SNOW, BLOCK.SAND, BLOCK.GRAVEL, BLOCK.DEEPSTONE, BLOCK.ICE, BLOCK.WATER, BLOCK.REGOLITH, BLOCK.PLANET_ROCK, BLOCK.PLANET_ICE, BLOCK.PLANET_DARK, BLOCK.PLANET_GRASS, BLOCK.PLANET_WOOD, BLOCK.PLANET_LEAF]);
const natural = (t) => NATURAL.has(t) || TREE_WOOD.has(t) || isLeaves(t);
const KIND_RU = { build: 'постройка', creature: 'существо', plant: 'растение' };

/** The ground's heights round the place, packed for the record (deltas from G in one byte, base64). */
export function packGrid(grid, G) {
    const n = grid.w * grid.d, b = new Uint8Array(n * 2);
    for (let i = 0; i < n; i++) {
        const v = grid.G[i];
        const d = v === -32768 ? 127 : Math.max(-126, Math.min(126, v - G));
        b[i] = d & 255;
        b[n + i] = grid.wet[i];
    }
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return { x0: grid.x0, z0: grid.z0, w: grid.w, d: grid.d, G, b: typeof btoa === 'function' ? btoa(s) : Buffer.from(b).toString('base64') };
}

/** …and back. */
export function unpackGrid(p) {
    if (!p || !(p.w > 0) || !(p.d > 0) || p.w * p.d > 300 * 300) return null;
    const n = p.w * p.d;
    let b;
    if (typeof atob === 'function') { const s = atob(p.b || ''); b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); } else b = new Uint8Array(Buffer.from(p.b || '', 'base64'));
    if (b.length < n * 2) return null;
    const G = new Int16Array(n), wet = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const d = (b[i] << 24) >> 24; G[i] = d === 127 ? -32768 : p.G + d; wet[i] = b[n + i]; }
    return { x0: p.x0, z0: p.z0, w: p.w, d: p.d, G, wet };
}

/** The colours of a building's own blocks (the flying ones): its walls, roof, trim. */
function coloursOf(recipe) {
    const out = [];
    const st = recipe?.style || {};
    for (const k of [st.wall, st.roof, st.trim]) { const b = MATERIALS[k]?.block; if (b != null && BLOCK_COLOR[b]) out.push(BLOCK_COLOR[b]); }
    return out.length ? out : [0x8a8a8a, 0xa83a2c, 0xece8e0];
}

export class DivineCreation extends HouseMagic {
    constructor(game) {
        super(game);
        this.netType = 'dcr';
        this.fx2 = new DivineCreationFx(game);
        this.mine = null; // (the caster's computer) my creation the gods are thinking over: {id, desc, t, u, ctl}
        this.listening = null; // the gods listen to the description: {until, parts, tail, quiet} (s of _clock)
        this._clock = 0; // s: the listening's own clock (the game's time)
        this._plans = new Map(); // id → plan | 'wait'
        this._worker = null;
        this._repairQ = [];
        this._lastBy = new Map(); // (host) player key → when their last creation began (COOLDOWN)
        this.testAsk = null; // (tests) async (desc) → raw recipe / text, instead of the network
        this.syncPlans = false; // (tests / no worker) plans made at once
        this.log = []; // (tests, the journal) what happened
    }

    _note(s) { this.log.push(s); if (this.log.length > 40) this.log.shift(); this.game.netLog?.(`✨ Да пусть создастся: ${s}`); }

    // ============================================================== the plan
    /** A record's plan (null until the worker made it). */
    plan(rec) {
        const p = this._plans.get(rec.id);
        if (p && p !== 'wait') return p;
        if (p === 'wait') return null;
        const o = { recipe: rec.recipe, seed: rec.seed, x: rec.x, z: rec.z, face: rec.face, grid: unpackGrid(rec.grid), G: rec.G };
        if (typeof Worker === 'undefined' || this.syncPlans) { const r = creationPlan(o); this._plans.set(rec.id, r); return r; }
        this._plans.set(rec.id, 'wait');
        try {
            if (!this._worker) {
                this._worker = new Worker(new URL('../world/creation.worker.js', import.meta.url), { type: 'module' });
                this._worker.onmessage = (e) => { const d = e.data; if (!d?.id) return; if (d.plan) this._plans.set(d.id, d.plan); else this._plans.delete(d.id); };
                this._worker.onerror = () => { this.syncPlans = true; for (const [k, v] of this._plans) if (v === 'wait') this._plans.delete(k); };
            }
            this._worker.postMessage({ id: rec.id, o });
        } catch (e) { this.syncPlans = true; this._plans.delete(rec.id); }
        return null;
    }

    _rectOf(rec) { return rec.rect; }

    houseNear(p, r = 0) {
        let best = null;
        for (const rec of this.list.values()) {
            const rc = rec.rect;
            const d = Math.hypot(Math.max(rc.x0 - p.x, 0, p.x - rc.x1), Math.max(rc.z0 - p.z, 0, p.z - rc.z1));
            if (d <= r && (!best || d < best.d)) best = { rec, d };
        }
        return best?.rec || null;
    }

    /** (the terrain's light: its rooms lit as a house's — chained with the others' own) */
    _hookLight() {
        const data = this.data;
        if (!data || this._lit) return;
        this._lit = true;
        const was = data.litLand;
        data.litLand = (x, z) => {
            if (was?.(x, z)) return true;
            for (const rec of this.list.values()) { const rc = rec.rect; if (x >= rc.x0 && x <= rc.x1 && z >= rc.z0 && z <= rc.z1) return true; }
            return false;
        };
        const prevS = data._litPair === was ? data.litShapes : null;
        data.litShapes = (x0, z0, x1, z1, out) => {
            prevS?.(x0, z0, x1, z1, out);
            for (const rec of this.list.values()) { const rc = rec.rect; if (rc.x1 >= x0 && rc.x0 <= x1 && rc.z1 >= z0 && rc.z0 <= z1) out.push(rc); }
            return out;
        };
        data._litPair = was && !prevS ? null : data.litLand;
    }

    _relight(rec) {
        const data = this.data, rc = rec?.rect;
        if (!data?._markDirty || !rc) return;
        for (let x = Math.floor(rc.x0) - 1; x <= Math.ceil(rc.x1) + 9; x += 8) for (let z = Math.floor(rc.z0) - 1; z <= Math.ceil(rc.z1) + 9; z += 8) data._markDirty(Math.min(x, Math.ceil(rc.x1) + 1), Math.min(z, Math.ceil(rc.z1) + 1));
    }

    // =================================================================== the spell
    /**
     * «Да пусть создастся …» (Game.castLocalSpell). Only a finished phrase (the description must be whole).
     * @returns {'DivineCreation'|null}
     */
    cast(isFinal = true, text = '') {
        const g = this.game;
        const w = creationWords(text);
        if (!w) return null;
        const say = (t) => { if (isFinal && t) g.hud?.setVoice?.(t, true); return null; };
        // (the words are still being said: the gods listen at once — the seed of light shows at the wand from the first word)
        if (!isFinal) { this._listen(); if (w.desc.length < 3) g.hud?.setVoice?.('🙏 Боги слушают…', true); return null; }
        const now = Date.now();
        if (now - this._lastCast < 1500) return null;
        if (!w.desc || w.desc.replace(/[^a-zа-яё0-9]/gi, '').length < 3) {
            this._listen(true);
            return say('🙏 Боги слушают — опишите, что создать (например: «замок из белого камня с шестью башнями», «существо с крыльями», «дерево с синими листьями»)');
        }
        // (the description may go on in the next phrase — the recognizer cuts a long one: the gods wait for the quiet)
        const no = this._check(w.desc);
        if (no) { if (this.listening) this._unlisten(null); return say(no); }
        this._listen();
        const L = this.listening;
        if (!L) return this._begin(w.desc, say);
        L.parts = [w.desc];
        L.tail = '';
        L.quiet = this._clock + CREATION.DESC_QUIET;
        L.until = Math.max(L.until, this._clock + 8);
        g._manaLater = true; // (paid when the gods say yes — DivineCreation._think)
        return 'DivineCreation';
    }

    /** The phrase after a lone «Да пусть создастся» (within LISTEN s): the description. 'DivineCreation' — begun, true — taken (refused or still being said), false — not a description. */
    hearDesc(text, isFinal) {
        const L = this.listening;
        if (!L) return false;
        if (this._clock > L.until && !L.parts.length) { this._unlisten('🌫️ Боги не услышали описания'); return false; }
        const words = String(text || '').trim();
        if (words.replace(/[^a-zа-яё0-9]/gi, '').length < 2) return false;
        // («стоп» alone: the gods stop listening)
        if (isFinal && !L.parts.length && /^(стоп|стой|отмена|не надо|хватит)[.!]?$/i.test(words)) { this._unlisten('🌫️ Боги больше не слушают'); return true; }
        if (!isFinal) { L.tail = words; L.quiet = this._clock + CREATION.DESC_QUIET; L.until = Math.max(L.until, this._clock + 8); return true; } // (the description is still being said)
        // (the recognizer cuts a long description into phrases: all of them are kept until the speaker is quiet)
        L.parts.push(words);
        L.tail = '';
        L.quiet = this._clock + CREATION.DESC_QUIET;
        L.until = Math.max(L.until, this._clock + 8);
        if (L.parts.join(' ').length >= CREATION.DESC_MAX) this._heard();
        return true;
    }

    /** The gods begin to listen (the seed of light at the wand at once). `fresh` — a lone «Да пусть создастся»: the description may come later. */
    _listen(fresh = false) {
        const now = this._clock;
        const L = this.listening;
        if (L) { L.until = Math.max(L.until, now + (fresh ? CREATION.LISTEN : 8)); return; }
        if (this.mine || this.magic) return;
        this.listening = { until: now + (fresh ? CREATION.LISTEN : 12), parts: [], tail: '', quiet: 0, t: 0, aimT: 0, at: null };
        this.game.sound?.spellCast?.('DivineCreation', this.game.character?.group?.position);
    }

    _unlisten(msg) {
        const L = this.listening;
        this.listening = null;
        if (L?.at) this.game.sync?.net?.send({ t: this.netType, a: 'lis', on: 0 });
        if (msg) this.game.hud?.setVoice?.(msg, true);
    }

    /** The speaker fell quiet: what was heard is the description. */
    _heard() {
        const L = this.listening;
        if (!L) return;
        const desc = [...L.parts, L.tail].filter(Boolean).join(' ').trim();
        this._unlisten(null);
        if (desc.replace(/[^a-zа-яё0-9]/gi, '').length < 3) { this.game.hud?.setVoice?.('🌫️ Боги не услышали описания', true); return; }
        const g = this.game;
        this._begin(desc, (t) => { if (t) g.hud?.setVoice?.(t, true); return null; });
    }

    /** (every frame) The listening: its light at where the wand points, the description taken when the speaker is quiet. */
    _listenStep(dt) {
        const L = this.listening, g = this.game;
        const now = (this._clock += dt);
        if (L) {
            if ((L.parts.length || L.tail) && (now > L.quiet || now > L.until)) this._heard();
            else if (now > L.until) this._unlisten('🌫️ Боги не услышали описания');
        }
        const M = this.listening;
        if (M) {
            M.t += dt;
            M.aimT -= dt;
            if (M.aimT <= 0 && g.character?.getHandWorldPosition) {
                M.aimT = 0.2;
                try {
                    const at = this._aim();
                    if (at) {
                        const moved = !M.at || Math.hypot(at.x - M.at.x, at.z - M.at.z) > 1.5;
                        M.at = { x: at.x, y: at.y, z: at.z };
                        if (moved) g.sync?.net?.send({ t: this.netType, a: 'lis', on: 1, x: r2(at.x), y: r2(at.y), z: r2(at.z) });
                    }
                    const side = g.wandSide?.() || g.magicHand || 'right';
                    const h = g.character.getHandWorldPosition(side, new THREE.Vector3());
                    M.wand = { x: h.x, y: h.y, z: h.z };
                } catch (e) { /* (no hands yet) */ }
            }
            if (M.at) this.fx2.seed({ x: M.at.x, y: M.at.y, z: M.at.z, t: M.t, u: 0, wand: M.wand || null, listen: true }, dt);
        }
        // (another player's gods listening: their small seed where their wand points)
        if (this._lisOf?.size) for (const [k, o] of this._lisOf) {
            o.t += dt;
            if (o.t > CREATION.LISTEN + 10) { this._lisOf.delete(k); continue; }
            this.fx2.seed({ x: o.x, y: o.y, z: o.z, t: o.t, u: 0, wand: null, listen: true }, dt);
        }
    }

    /** Checks, then the host is asked (the mana is paid when it says yes). */
    /** Why it can't begin now (null — it can). */
    _check(desc) {
        const g = this.game;
        const bad = forbidden(desc);
        if (bad) return `🚫 ${bad}`;
        if (this.mine) return '✨ Боги ещё думают над вашим прошлым творением — подождите';
        if (this.magic) return '✨ Боги заняты другим творением — подождите, пока оно закончится';
        if (!this.free && !g.items?.heldOf?.('wand') && !this.testAim) return '🪄 Возьмите палочку в руку и направьте её туда, где боги должны создать';
        if (manaRules(g) && !this.free && g.combat.fatigue < CREATION.COST) return `😮‍💨 Не хватает маны: нужно ${CREATION.COST}, есть ${Math.floor(g.combat.fatigue)}`;
        const kind = kindOfDesc(desc);
        if (kind !== 'build' && !this._air()) return `🌌 Здесь нет воздуха — ${kind === 'plant' ? 'растение' : 'существо'} здесь не выживет. Постройку создать можно`;
        return null;
    }

    _begin(desc, say) {
        const g = this.game;
        desc = desc.slice(0, CREATION.DESC_MAX);
        const no = this._check(desc);
        if (no) return say(no);
        const kind = kindOfDesc(desc);
        const at = this._aim();
        if (!at) return say('🪄 Направьте палочку на землю, где боги должны создать');
        const me = g.character.group.position;
        const side = g.wandSide?.() || g.magicHand || 'right';
        const hand = g.character.getHandWorldPosition?.(side, new THREE.Vector3()) || me.clone();
        const ask = { desc, at: [r2(at.x), r2(at.y), r2(at.z)], c: [r2(me.x), r2(me.y), r2(me.z)], wand: [r2(hand.x), r2(hand.y), r2(hand.z)], kind };
        if (!this.auth) { g.sync?.net?.send({ t: this.netType, a: 'ask', ...ask }); say('🙏 …'); }
        else { const res = this._hostAsk(ask, g.localId); if (res !== true) return say(res); }
        this._lastCast = Date.now();
        g._manaLater = true; // (the cells grow when it is made — mana.success in _made)
        return 'DivineCreation';
    }

    /** Is there air here (a creature, a plant: Earth, or a planet one can breathe on)? */
    _air() {
        const sp = this.game.space;
        if (!sp || sp.realm === 'earth') return true;
        if (sp.realm === 'space') return false;
        return breathable(sp.planets?.get?.(sp.realm));
    }

    /** Where the wand points: the ground it reaches (≤ REACH), or ahead of the hero. */
    _aim() {
        const g = this.game;
        if (this.testAim) return new THREE.Vector3(this.testAim.x, this.testAim.y ?? g.collision.groundY(this.testAim.x, this.testAim.z), this.testAim.z);
        const side = g.wandSide?.() || g.magicHand || 'right';
        const hand = g.character.getHandWorldPosition(side, new THREE.Vector3());
        const dir = g.character.getHandDirection(side, new THREE.Vector3());
        for (let k = 1; k < CREATION.REACH; k += 0.5) {
            const p = _v.copy(hand).addScaledVector(dir, k);
            const gy = g.collision.groundAt ? g.collision.groundAt(p.x, p.z, p.y) : g.collision.groundY(p.x, p.z);
            if (p.y <= gy + 0.2) return new THREE.Vector3(p.x, gy, p.z);
        }
        const h = Math.hypot(dir.x, dir.z), ry = g.character.group.rotation.y;
        const fx = h > 0.2 ? dir.x / h : -Math.sin(ry), fz = h > 0.2 ? dir.z / h : -Math.cos(ry);
        const me = g.character.group.position;
        const x = me.x + fx * 14, z = me.z + fz * 14;
        return new THREE.Vector3(x, g.collision.groundY(x, z), z);
    }

    // ============================================================ the host: begin
    /** (host) Someone asks the gods: one at a time, a pause between a player's creations. @returns {true|string} */
    _hostAsk(ask, by) {
        const g = this.game;
        if (this.magic) return '✨ Боги заняты другим творением — подождите, пока оно закончится';
        const key = this._key(by);
        const last = this._lastBy.get(key) || 0;
        if (!this.free && Date.now() - last < CREATION.COOLDOWN * 1000) return `⏳ Боги отдыхают — следующее творение через ${Math.ceil(CREATION.COOLDOWN - (Date.now() - last) / 1000)} с`;
        const at = (ask.at || []).map(Number), c = (ask.c || []).map(Number);
        if (at.length < 3 || !at.every(Number.isFinite) || c.length < 2 || !c.every(Number.isFinite)) return '✨ …';
        if (Math.hypot(at[0] - c[0], at[2] - c[2]) > CREATION.REACH + 20) return '🪄 Слишком далеко — подойдите ближе';
        const desc = String(ask.desc || '').slice(0, CREATION.DESC_MAX);
        if (forbidden(desc)) return '🚫 Боги не создают такого';
        if (g.terrain?.data?.godGiftAt?.(Math.round(at[0]), Math.round(at[1]), Math.round(at[2]))) return '✨ Это храм богов — здесь творят только они сами';
        const id = 'dc' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        const y = g.collision?.groundY?.(at[0], at[2]) ?? at[1];
        const dx = at[0] - c[0], dz = at[2] - c[2], dl = Math.hypot(dx, dz) || 1;
        const wand = Array.isArray(ask.wand) && ask.wand.length === 3 && ask.wand.every((v) => Number.isFinite(+v)) ? ask.wand.map(Number) : null;
        this.magic = { id, by, key, phase: 'seed', t: 0, u: 0, x: at[0], y, z: at[2], c, dir: [dx / dl, dz / dl], desc, seed: (Math.random() * 0x7fffffff) | 0, wand: wand ? { x: wand[0], y: wand[1], z: wand[2] } : null, beat: 0, progT: 0 };
        this._lastBy.set(key, Date.now());
        g.sync?.net?.send({ t: this.netType, a: 'seed', id, by, x: r2(at[0]), y: r2(y), z: r2(at[2]), wand });
        this._seedStart(this.magic);
        g.castleLife?.alarm?.({ x: at[0], y, z: at[2] }, 'creation', by, 20);
        if (by === g.localId) this._think(id, desc);
        else g.sync?.net?.send({ t: this.netType, a: 'think', to: by, id, desc });
        this._note(`«${desc.slice(0, 80)}» — боги читают`);
        return true;
    }

    /** (every computer) The seed of light appears; the gods' choir. */
    _seedStart(m) {
        this.game.fx?.lightFlash?.({ x: m.x, y: m.y + 4, z: m.z }, 0xffd98a, 4, 0.8, 60);
        this.game.sound?.spellCast?.('DivineCreation', new THREE.Vector3(m.x, m.y + 4, m.z));
    }

    // ============================================================ the caster: the gods think
    /** (the caster's computer) The host said yes: the mana is paid, the gods (the network) read the words. */
    _think(id, desc) {
        const g = this.game;
        if (this.mine) return;
        if (manaRules(g) && !this.free) {
            if (g.combat.fatigue < CREATION.COST) { g.hud?.setVoice?.(`😮‍💨 Мана кончилась — нужно ${CREATION.COST}`, true); this._sendFade(id, false); return; }
            g.combat.fatigue -= CREATION.COST;
            if (g.combat) g.combat.paidCount = (g.combat.paidCount || 0) + 1;
        }
        const ctl = { stop: false, ac: null };
        this.mine = { id, desc, t: 0, u: 0, ctl, paid: manaRules(g) && !this.free ? CREATION.COST : 0, sentU: 0 };
        g.hud?.setVoice?.('✨ Боги читают ваши слова…', true);
        this._ask(desc, (u) => { if (this.mine?.id === id) this.mine.u = Math.max(this.mine.u, u); }, ctl).then((res) => this._answered(id, res)).catch((e) => this._answered(id, { recipe: null, why: String(e?.message || e) }));
    }

    /**
     * The gods' answer: the local Gemma on the video card (the program llm_native.py; started with the best model this
     * computer has if it is not running), else the villagers' net in the page, else the words read by the rules.
     * Broken twice (or no answer in time) → the rules' reading. @returns {Promise<{recipe, via, why}>}
     */
    async _ask(desc, onU, ctl) {
        const seed = (Math.random() * 0x7fffffff) | 0;
        const t0 = Date.now(), deadline = t0 + CREATION.THINK_MAX * 1000 - 2500;
        let text = null, via = 'rules', why = '';
        const messages = (user) => [{ role: 'system', content: CREATION_SYSTEM }, { role: 'user', content: user }];
        const once = async (user) => {
            if (this.testAsk) { via = 'test'; const r = await this.testAsk(desc, user); return r == null ? null : typeof r === 'string' ? r : JSON.stringify(r); }
            if (await this._nativeOk(deadline, ctl)) { via = 'gemma'; return this._nativeGen(messages(user), deadline, onU, ctl); }
            const llm = this.game.castleLife?.talk?.llm;
            if (llm?.ready) { via = 'gemma (браузер)'; return llm.generate({ system: CREATION_SYSTEM, user, maxTokens: 900, temperature: 0.35, timeoutMs: Math.max(3000, deadline - Date.now()) }); }
            via = 'rules';
            return null;
        };
        try { text = await once(creationUser(desc)); } catch (e) { why = String(e?.message || e); }
        if (ctl.stop) return { recipe: null, via, why: 'остановлено' };
        let obj = parseAnswer(text), prob = text == null ? 'нет ответа' : answerProblem(obj);
        if (prob && via !== 'rules' && deadline - Date.now() > 9000) {
            try { text = await once(creationRetry(desc, prob)); obj = parseAnswer(text); prob = text == null ? 'нет ответа' : answerProblem(obj); } catch (e) { why = String(e?.message || e); }
        }
        if (prob) { why = why || prob; obj = null; if (via !== 'rules') via = 'rules (нейросеть: ' + why + ')'; }
        return { recipe: sanitizeRecipe(obj, desc, seed), via, why, ms: Date.now() - t0 };
    }

    /** Is the program on this computer there and ready (started with the best model it has, if not running)? */
    async _nativeOk(deadline, ctl) {
        if (typeof fetch === 'undefined' || typeof location === 'undefined') return false;
        const base = location.href;
        try {
            let st = await (await fetch(new URL('api/llm/status', base), { cache: 'no-store' })).json();
            if (!st.available) return false;
            if (st.state !== 'ready' && st.state !== 'loading' && st.state !== 'downloading') {
                const model = (st.have || []).includes('gemma4big') ? 'gemma4big' : 'gemma4';
                // (only a model already on this computer: a 3 GB download in the middle of a spell is no answer)
                if (!(st.have || []).length) return false;
                await fetch(new URL('api/llm/load', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
                this._note(`запускаю нейросеть на видеокарте (${model === 'gemma4big' ? 'Gemma 4 E4B' : 'Gemma 4 E2B'})`);
            }
            while (st.state !== 'ready' && Date.now() < deadline - 8000 && !ctl.stop) {
                if (st.state === 'error') return false;
                await new Promise((r) => setTimeout(r, 700));
                st = await (await fetch(new URL('api/llm/status', base), { cache: 'no-store' })).json();
            }
            return st.state === 'ready';
        } catch (e) { return false; }
    }

    /** One answer of the program (streamed: its words make the seed grow). */
    async _nativeGen(messages, deadline, onU, ctl) {
        const ac = new AbortController();
        ctl.ac = ac;
        const timer = setTimeout(() => ac.abort(), Math.max(1000, deadline - Date.now()));
        const id = 'dcr' + Date.now();
        try {
            const r = await fetch(new URL('api/llm/generate', location.href), { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
                body: JSON.stringify({ id, messages, maxTokens: 1000, temperature: 0.35, long: true, raw: true, stream: true, schema: CREATION_SCHEMA }) });
            if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
            const reader = r.body.getReader(), dec = new TextDecoder();
            let buf = '', got = 0, text = null;
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                let k;
                while ((k = buf.indexOf('\n\n')) >= 0) {
                    const line = buf.slice(0, k).trim();
                    buf = buf.slice(k + 2);
                    if (!line.startsWith('data:')) continue;
                    const m = JSON.parse(line.slice(5));
                    if (m.type === 'partial') { got += String(m.text || '').length; onU?.(Math.min(0.95, got / 900)); }
                    else if (m.type === 'result') text = String(m.text || '');
                    else if (m.type === 'gen_error') throw new Error(m.message || 'ошибка нейросети');
                }
            }
            return text;
        } catch (e) {
            if (ac.signal.aborted) { fetch(new URL('api/llm/interrupt', location.href), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {}); throw new Error('нейросеть думала слишком долго'); }
            throw e;
        } finally { clearTimeout(timer); }
    }

    /** (the caster's computer) The gods answered: the recipe goes to the host. */
    _answered(id, res) {
        const g = this.game, me = this.mine;
        if (!me || me.id !== id) return;
        if (!res?.recipe) { this._giveBack(me, `🌫️ Боги не поняли описание — мана возвращена${res?.why ? ` (${res.why})` : ''}`); return; }
        me.done = true;
        this._note(`рецепт «${res.recipe.name}» (${KIND_RU[res.recipe.type]}) — ${res.via}${res.ms ? `, ${(res.ms / 1000).toFixed(1)} с` : ''}`);
        if (/^rules \(/.test(res.via)) g.hud?.setVoice?.(`✨ Нейросеть не ответила как надо — боги поняли вас по словам: «${res.recipe.name}»`, true);
        else g.hud?.setVoice?.(`✨ Боги поняли: «${res.recipe.name}» — ${KIND_RU[res.recipe.type]}`, true);
        if (this.auth) this._hostRecipe(id, res.recipe, g.localId);
        else g.sync?.net?.send({ t: this.netType, a: 'recipe', id, recipe: res.recipe });
    }

    /** (the caster's computer) The mana back, the seed fades. */
    _giveBack(me, msg) {
        const g = this.game;
        if (me.paid && g.combat) g.combat.fatigue = Math.min(g.combat.maxFatigue || Infinity, g.combat.fatigue + me.paid);
        me.ctl.stop = true;
        try { me.ctl.ac?.abort(); } catch (e) { /* (gone) */ }
        this.mine = null;
        if (msg) g.hud?.setVoice?.(msg, true);
        this._sendFade(me.id, true);
    }

    _sendFade(id, paid) {
        if (this.auth) this._hostFade(id, null, false);
        else this.game.sync?.net?.send({ t: this.netType, a: 'fade', id, paid });
    }

    // ============================================================ the host: the recipe
    /** (host) The recipe came: a creature, a plant — their own systems; a building — its place, then its blocks. */
    _hostRecipe(id, raw, by) {
        const g = this.game, m = this.magic;
        if (!m || m.id !== id || m.phase !== 'seed' || m.by !== by) return;
        // (the seed of light grows its GESTATE_MIN seconds however fast the answer came: the rules answer at once)
        if (m.t < CREATION.GESTATE_MIN) { m.held = { raw, by }; return; }
        const recipe = sanitizeRecipe(raw, m.desc, m.seed); // (the host cleans it again: a guest's recipe is only a wish)
        m.recipe = recipe;
        g.sync?.net?.send({ t: this.netType, a: 'bloom', id, kind: recipe.type, name: recipe.name });
        this._bloom(m);
        const at = { x: m.x, y: m.y, z: m.z };
        if (recipe.type === 'creature' || recipe.type === 'plant') {
            const sys = recipe.type === 'creature' ? g.customCreatures : g.customPlants;
            const res = sys ? sys.create(recipe, at, by, { dir: m.dir, key: m.key }) : 'Боги не могут создать это здесь';
            if (res !== true) { this._hostFade(id, `🌫️ ${res} — мана возвращена`, true); return; }
            this.magic = null;
            this._made(by, recipe);
            return;
        }
        this._place(m, recipe);
    }

    /** (host) Where the building stands: its front edge where the wand pointed, its front to the caster. */
    _place(m, recipe) {
        const ext = recipeExtent(recipe);
        const fx = m.dir[0], fz = m.dir[1];
        let face = faceTowards(-fx, -fz);
        const along = face === 1 || face === 3 ? ext.A : ext.B; // (the half depth the way the caster looks)
        let x = Math.round(m.x + fx * (along + 1)), z = Math.round(m.z + fz * (along + 1));
        let rect = recipeRect(recipe, x, z, face);
        // (the caster never inside it: further away until he is out)
        for (let k = 0; k < 12 && m.c[0] >= rect.x0 - 2 && m.c[0] <= rect.x1 + 2 && m.c[2] >= rect.z0 - 2 && m.c[2] <= rect.z1 + 2; k++) {
            x = Math.round(x + fx * 4); z = Math.round(z + fz * 4); rect = recipeRect(recipe, x, z, face);
        }
        face = faceTowards(m.c[0] - x, m.c[2] - z);
        rect = recipeRect(recipe, x, z, face);
        for (const o of this.list.values()) {
            const q = o.rect;
            if (rect.x0 < q.x1 + CREATION.NEAR_OTHER && rect.x1 > q.x0 - CREATION.NEAR_OTHER && rect.z0 < q.z1 + CREATION.NEAR_OTHER && rect.z1 > q.z0 - CREATION.NEAR_OTHER) { this._hostFade(m.id, '🏛️ Здесь уже стоит другое творение богов — выберите свободное место. Мана возвращена', true); return; }
        }
        if (this.list.size >= CREATION.MAX_BUILDS) { this._hostFade(m.id, '🏛️ В этом мире уже слишком много творений богов. Мана возвращена', true); return; }
        // the ground sampled a little a frame (the grid, and the place's checks with it)
        const x0 = Math.floor(rect.x0) - 2, z0 = Math.floor(rect.z0) - 2, w = Math.ceil(rect.x1) - x0 + 3, d = Math.ceil(rect.z1) - z0 + 3;
        m.phase = 'site';
        m.place = { x, z, face, rect, grid: { x0, z0, w, d, G: new Int16Array(w * d).fill(-32768), wet: new Uint8Array(w * d) }, i: 0, built: 0, holy: 0, sea: 0, n: 0, ship: 0, ward: false };
        const ward = this.game.wards;
        if (ward?.list?.size && ward.forbids?.(new THREE.Vector3(m.c[0], m.c[1] ?? m.y, m.c[2]), new THREE.Vector3(x, m.y + 1, z))) { this._hostFade(m.id, '🛡️ Там чужая защита дома. Мана возвращена', true); }
    }

    /** (host) A slice of the ground's sampling (≤ 2 ms a frame). */
    _siteStep(m) {
        const P = m.place, data = this.data, g = this.game;
        if (!data) return;
        const t0 = performance.now(), grid = P.grid, N = grid.w * grid.d;
        for (; P.i < N && performance.now() - t0 < 2; P.i++) {
            const x = grid.x0 + (P.i % grid.w), z = grid.z0 + Math.floor(P.i / grid.w);
            if (data.landMade && !data.landMade(x, z)) { P.wait = (P.wait || 0) + 1; if (P.wait < 400) return; } // (the land not made yet: wait for the workers)
            let L = data.topLayer(x, z), wet = 0;
            for (let k = 0; k < 60; k++) {
                const t = data.get(x, L, z);
                if (t === BLOCK.WATER || t === BLOCK.ICE) wet = 1;
                if (t === BLOCK.AIR || t === BLOCK.WATER || TREE_WOOD.has(t) || isLeaves(t)) { L--; continue; }
                break;
            }
            grid.G[P.i] = L;
            grid.wet[P.i] = wet || (data.isSeaColumn?.(x, z) ? 1 : 0);
            const inside = x >= P.rect.x0 && x <= P.rect.x1 && z >= P.rect.z0 && z <= P.rect.z1;
            if (!inside) continue;
            P.n++;
            if (grid.wet[P.i]) P.sea++;
            if (data.godGiftAt?.(x, L, z)) P.holy++;
            for (let q = L - 1; q <= L + 14; q += 1) { const t = data.get(x, q, z); if (isEnchanted(t)) { P.holy++; break; } if (isCastleBlock(t)) { P.built++; break; } }
            if ((P.i & 7) === 0 && g.ships?.footprintAt?.(x, L, z)) P.ship++;
        }
        if (P.i < N) return;
        // the checks
        const main = m.recipe.parts[0]?.kind;
        const water = main === 'bridge' || main === 'ship';
        let why = null;
        if (P.holy) why = '✨ Там дар богов или заколдованный камень — их не перестроить';
        else if (P.ship) why = '⚓ Там корабль';
        else if (P.built > Math.max(3, P.n * 0.01)) why = '🏘️ Там уже построено (замок, деревня, дом) — богам нужно свободное место';
        else if (!water && P.sea > P.n * 0.35) why = '🌊 Там вода — выберите сушу';
        if (why) { this._hostFade(m.id, `${why}. Мана возвращена`, true); return; }
        // its floor: the middle of the ground under it
        const hs = [];
        for (let i = 0; i < N; i += 3) if (grid.G[i] !== -32768 && !grid.wet[i]) hs.push(grid.G[i]);
        hs.sort((a, b) => a - b);
        const G = hs.length ? hs[hs.length >> 1] : Math.round(m.y) - 1;
        const owner = this._key(m.by), name = this._name(m.by);
        const rec = { id: m.id, recipe: m.recipe, seed: m.seed, x: P.x, z: P.z, face: P.face, G, grid: packGrid(grid, G), rect: P.rect, owner, name, t: Date.now(), building: true, level: 1 };
        m.rec = rec;
        m.phase = 'plan';
        this.plan(rec);
    }

    /** (host) The plan is made: the building begins (its record kept at once — a save now finishes it on load). */
    _growStart(m, P) {
        const g = this.game;
        if (P.full && !m.shrunk) {
            // (too big for one creation: the gods make it a little smaller)
            m.shrunk = (m.shrunk || 0) + 1;
            for (const p of m.recipe.parts) p.size = p.size.map((v, i) => Math.max(3, Math.round(v * (i === 2 ? 0.9 : 0.78))));
            if (p0(m.recipe).kind === 'city') p0(m.recipe).houses = Math.max(4, Math.round((p0(m.recipe).houses || 16) * 0.6));
            this._plans.delete(m.rec.id);
            m.rec.recipe = m.recipe;
            this.plan(m.rec);
            return;
        }
        const rec = m.rec;
        rec.rect = P.rect;
        rec.top = P.top;
        this.list.set(rec.id, rec);
        this._hookLight();
        m.phase = 'grow';
        m.T = Math.min(CREATION.BUILD_MAX, Math.max(CREATION.BUILD_MIN, P.n / CREATION.BLOCKS_PER_S + 6));
        m.t = 0; m.ci = 0; m.cy = 0; m.fi = 0; m.pi = 0; m.bi = 0; m.wait = [];
        m.rect = P.rect; m.G = rec.G; m.top = P.top; m.colors = coloursOf(m.recipe);
        m.cz = { b: 0, x: null, z: null }; // (the clearing: box, column)
        g.sync?.net?.send({ t: this.netType, a: 'grow', id: m.id, rect: P.rect, G: rec.G, top: P.top, colors: m.colors, T: m.T });
        g.sound?.playHouseHum?.(new THREE.Vector3(rec.x, rec.G + 4, rec.z), m.T);
        g.castleLife?.alarm?.({ x: rec.x, y: rec.G, z: rec.z }, 'creation', m.by, Math.max(20, (P.rect.x1 - P.rect.x0) / 2 + 10));
        this._note(`строится «${m.recipe.name}»: ${P.n} блоков, ${m.T.toFixed(0)} с`);
    }

    /**
     * (host) The blocks, by the time (≤ 2.5 ms a frame): the place cleared (0–12 %), the foundation (to 22 %), the streets,
     * then the building from the ground up (its own order: the lowest layers first, outwards from the middle).
     */
    _build(m) {
        const g = this.game, data = this.data;
        const P = this.plan(m.rec);
        if (!P || !data) return;
        const t0 = performance.now(), busy = () => performance.now() - t0 > 2.5;
        const f = Math.min(1, m.t / (m.T * 0.96));
        const air = [], put = [];
        // the clearing first: every box column by column, top down (only what is not the gods' and not enchanted) —
        // nothing is laid before it is done (it would clear the new blocks away)
        while (m.cz.b < P.clear.length && !busy()) {
            const B = P.clear[m.cz.b];
            if (m.cz.x == null) { m.cz.x = B.x0; m.cz.z = B.z0; }
            for (let L = Math.min(B.L1, data.topLayer(m.cz.x, m.cz.z) + 1); L >= B.L0; L--) {
                const t = data.get(m.cz.x, L, m.cz.z);
                if (t === BLOCK.AIR || t === BLOCK.BEDROCK || isEnchanted(t) || data.godGiftAt?.(m.cz.x, L, m.cz.z)) continue;
                data.set(m.cz.x, L, m.cz.z, BLOCK.AIR); air.push([m.cz.x, L, m.cz.z, BLOCK.AIR]);
            }
            if (++m.cz.z > B.z1) { m.cz.z = B.z0; if (++m.cz.x > B.x1) { m.cz.b++; m.cz.x = null; } }
        }
        const cleared = m.cz.b >= P.clear.length;
        const FL = P.fill, nF = FL.length / 4;
        const goF = cleared ? Math.floor(Math.min(1, Math.max(0, (f - 0.05) / 0.17)) * nF) : 0;
        for (; m.fi < goF && !busy(); m.fi++) {
            const i = m.fi * 4, t = data.get(FL[i], FL[i + 1], FL[i + 2]);
            if (t !== BLOCK.AIR && t !== BLOCK.WATER) continue;
            data.set(FL[i], FL[i + 1], FL[i + 2], FL[i + 3]); put.push([FL[i], FL[i + 1], FL[i + 2], FL[i + 3]]);
        }
        const PA = P.paths, nP = PA.length / 3;
        const goP = cleared ? Math.floor(Math.min(1, Math.max(0, (f - 0.1) / 0.15)) * nP) : 0;
        for (; m.pi < goP && !busy(); m.pi++) {
            const x = PA[m.pi * 3], z = PA[m.pi * 3 + 1], t = PA[m.pi * 3 + 2];
            const L = data.topLayer(x, z), cur = data.get(x, L, z);
            if (!natural(cur) || cur === BLOCK.WATER || TREE_WOOD.has(cur) || isLeaves(cur)) continue;
            data.set(x, L, z, t); put.push([x, L, z, t]);
        }
        const C = P.cells, n = P.n;
        const goB = cleared ? Math.floor(Math.max(0, (f - 0.15) / 0.85) * n) : 0;
        const bodies = m.bi < goB ? this._bodies() : null;
        for (; m.bi < goB && !busy(); m.bi++) {
            const i = m.bi * 5, x = C[i], L = C[i + 1], z = C[i + 2], t = C[i + 3], sh = C[i + 4];
            if (data.get(x, L, z) === t && (data.shapeAt?.(x, L, z) | 0) === sh) continue;
            if (data.godGiftAt?.(x, L, z) || isEnchanted(data.get(x, L, z))) continue;
            if (t !== BLOCK.AIR && this._occupied(x, L, z, bodies)) { m.wait.push(sh ? [x, L, z, t, sh] : [x, L, z, t]); continue; }
            data.set(x, L, z, t, sh);
            (t === BLOCK.AIR ? air : put).push(sh ? [x, L, z, t, sh] : [x, L, z, t]);
        }
        if (air.length) g.builder?._sendEdits(air, true); // (what the cleared blocks held may come down — Structure.js)
        if (put.length) g.builder?._sendEdits(put);
        m.u = n ? m.bi / n : 1;
        if (m.t >= m.T && m.bi >= n && m.fi >= nF && m.pi >= nP && m.cz.b >= P.clear.length) this._done(m);
    }

    /** (host) Done: its doors, beds, chests, glass — and the record for good. */
    _done(m) {
        const g = this.game;
        this.magic = null;
        const rec = this.list.get(m.id) || m.rec;
        delete rec.building;
        rec.t = Date.now();
        rec.store = rec.store || {};
        if (m.wait.length) (this._waiting = this._waiting || []).push(...m.wait);
        this.list.set(rec.id, rec);
        this._relight(rec);
        this._furnish(rec, true);
        g.sync?.net?.send({ t: this.netType, a: 'done', rec: this._net(rec), by: m.by });
        this._finished(rec, m.by);
        this._made(m.by, m.recipe);
    }

    /** (every computer) It is whole: the last ring of light, the chord. */
    _finished(rec, by) {
        const g = this.game;
        this.magic = null;
        if (rec?.rect) this.fx2.whole(rec.rect, rec.G, rec.top ?? rec.G + 20);
        g.sound?.stopHouseHum?.();
        g.sound?.playSpellFx?.('fxCreationBloom', new THREE.Vector3(rec.x, rec.G + 6, rec.z), 1.2);
        if (by === g.localId) g.hud?.setVoice?.(`🏛️ «${rec.recipe?.name || 'Творение'}» создано! Двери открываются рукой, в сундуки можно складывать вещи`, true);
    }

    /** (host) The creation is made: the caster's cells grow (the first time — the gods' 100). */
    _made(by, recipe) {
        const g = this.game;
        if (by === g.localId) { this._myMade(recipe); return; }
        g.sync?.net?.send({ t: this.netType, a: 'made', to: by, kind: recipe.type, name: recipe.name });
    }

    _myMade(recipe) {
        const g = this.game;
        this.mine = null;
        g.mana?.success?.('DivineCreation');
        if (recipe && recipe.type !== 'build') g.hud?.setVoice?.(`✨ ${recipe.type === 'creature' ? 'Существо' : 'Растение'} «${recipe.name}» создано!`, true);
    }

    /** (host) The seed fades: the gods turned away (the reason to the caster; `refund` — his mana back). */
    _hostFade(id, msg, refund) {
        const g = this.game, m = this.magic;
        if (!m || m.id !== id) return;
        this.magic = null;
        if (m.rec && this.list.get(m.rec.id)?.building) this.list.delete(m.rec.id);
        this._plans.delete(id);
        g.sync?.net?.send({ t: this.netType, a: 'faded', id });
        this._faded(m);
        if (m.by === g.localId) {
            if (refund && this.mine?.id === id) { const me = this.mine; me.ctl.stop = true; this.mine = null; if (me.paid && g.combat) g.combat.fatigue = Math.min(g.combat.maxFatigue || Infinity, g.combat.fatigue + me.paid); }
            else if (this.mine?.id === id) this.mine = null;
            if (msg) g.hud?.setVoice?.(msg, true);
        } else g.sync?.net?.send({ t: this.netType, a: 'back', to: m.by, id, refund: !!refund, msg: msg ? String(msg).slice(0, 200) : '' });
        this._note(`не создано: ${msg || 'отменено'}`);
    }

    _faded(m) {
        this.fx2.fade(m);
        this.game.sound?.creationHum?.(0);
        this.game.sound?.breakHouseTheme?.(new THREE.Vector3(m.x, m.y + 4, m.z));
    }

    /** (every computer) The seed bursts: the recipe is there. */
    _bloom(m) {
        this.fx2.bloom(m);
        this.game.sound?.playSpellFx?.('fxCreationBloom', new THREE.Vector3(m.x, m.y + 6, m.z), 1.4);
    }

    // =================================================================== frame
    update(dt) {
        const g = this.game;
        if (this._repairAfter > 0 && (this._repairAfter -= dt) <= 0) this._repair();
        if (this._repairQ.length) this._repairStep();
        if (this._refundLater > 0 && (this._refundAt -= dt) <= 0 && g.combat) { g.combat.fatigue = Math.min(g.combat.maxFatigue || Infinity, g.combat.fatigue + this._refundLater); g.hud?.setVoice?.(`✨ Боги не успели создать ваше творение до сохранения — ${this._refundLater} маны возвращено`, true); this._refundLater = 0; }
        // my own wait: the gods think too long → the mana back
        const me = this.mine;
        if (me?.done) { me.t += dt; if (me.t > CREATION.THINK_MAX + CREATION.BUILD_MAX + 90) this.mine = null; } // (the host never told: not waited for ever)
        else if (me) {
            me.t += dt;
            if (me.t > CREATION.THINK_MAX) this._giveBack(me, '🌫️ Боги думали слишком долго — творение не случилось, мана возвращена');
            else if (this.auth && this.magic?.id === me.id) this.magic.u = me.u;
            else if (!this.auth && me.u - me.sentU > 0.08) { me.sentU = me.u; g.sync?.net?.send({ t: this.netType, a: 'u', id: me.id, u: r2(me.u) }); }
        }
        const m = this.magic;
        if (!m) { this.look.idle(dt, g.fx); g.sound?.creationHum?.(0); }
        else {
            m.t += dt;
            const pos = g.character?.group?.position;
            const d = pos ? Math.hypot(pos.x - m.x, pos.z - m.z) : 0;
            if (m.phase === 'seed' || m.phase === 'site' || m.phase === 'plan') {
                // (the light keeps growing while the place is sampled and planned)
                if (m.phase !== 'seed') m.u = Math.min(1, (m.u || 0.9) + dt * 0.05);
                else if (!m.u || m.u < Math.min(0.6, m.t / 25)) m.u = Math.max(m.u || 0, Math.min(0.6, m.t / 25) * 0.6);
                this.fx2.seed(m, dt);
                g.sound?.creationHum?.(Math.max(0, 1 - d / 140));
            } else {
                g.sound?.creationHum?.(0);
                if (m.phase === 'grow') this.fx2.grow(m, dt, this.look);
            }
            if (this.auth && this.magic === m) {
                if (m.phase === 'seed' && m.held) { if (m.t >= CREATION.GESTATE_MIN) { const h = m.held; m.held = null; this._hostRecipe(m.id, h.raw, h.by); } }
                else if (m.phase === 'seed' && m.t > CREATION.THINK_MAX + 6 && m.by !== g.localId) this._hostFade(m.id, '🌫️ Боги не дождались ответа', false);
                else if (m.phase === 'site') this._siteStep(m);
                else if (m.phase === 'plan') { const P = this.plan(m.rec); if (P) this._growStart(m, P); else if (m.t > CREATION.THINK_MAX + 60) this._hostFade(m.id, '🌫️ Боги не смогли задумать эту постройку. Мана возвращена', true); }
                else if (m.phase === 'grow') this._build(m);
                m.progT -= dt;
                if (m.progT <= 0 && g.sync && this.magic === m) { m.progT = 0.5; g.sync.net?.send({ t: this.netType, a: 'prog', id: m.id, u: r2(m.u || 0) }); }
            }
        }
        this._listenStep(dt);
        if (this._pendingFurnish?.size) for (const id of [...this._pendingFurnish]) { const rec = this.list.get(id); if (!rec) { this._pendingFurnish.delete(id); continue; } if (this.plan(rec)) { this._pendingFurnish.delete(id); this._furnish(rec, this.auth); } }
        if (this.auth) {
            this._sweepT -= dt;
            if (this._sweepT <= 0) { this._sweepT = 0.4; this._chestsTick(); }
            this._ruinT -= dt;
            if (this._ruinT <= 0) { this._ruinT = 2.5; this._ruinCheck(); }
            if (this._waiting?.length) this._placeWaiting();
        }
    }

    /** Concentration lost: nothing to break — the gods do it (an instant spell). */
    breakMine() { return false; }

    // ============================================================== furnishing
    _furnish(rec, host = false) {
        const g = this.game;
        const p = this.plan(rec);
        if (!p) { (this._pendingFurnish || (this._pendingFurnish = new Set())).add(rec.id); return; }
        if (g.doors) p.doors.forEach((d, k) => {
            const id = rec.id + 'd' + k;
            const was = g.doors.list.get(id);
            g.doors._place({ x: d.x, y: d.y, z: d.z, ry: d.ry, w: d.w, h: d.h, id, color: d.color ?? 0x6b4424, a: was?.a || 0, gen: true });
        });
        if (host && g.beds) p.beds.forEach((b, k) => {
            const id = rec.id + 'b' + k;
            if (!g.beds.list.has(id)) g.beds.spawnBed({ x: b.x, y: b.y, z: b.z }, b.yaw, k % 3 === 2 ? 'red' : 'white', { id });
        });
        for (const c of this._chestsOf(rec.id)) this._dropChest(c);
        for (const c of p.chests) {
            const id = rec.id + 'c' + c.k;
            const chest = new Chest(g.scene, new THREE.Vector3(c.x, c.y, c.z), 'loot', c.yaw + Math.PI, id, { scale: c.scale || 2 });
            chest.setWallGap?.(c.gap ?? 0.15);
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision.addBox(chest.getCollisionBox());
            chest.store = { house: rec.id, k: c.k, divine: true };
            chest.locked = true; chest.setAjar?.();
            this.chests.set(id, chest);
            g.chests.push(chest);
        }
        g.houses?.setExtraPanes?.(rec.id, p.windows.map((w, k) => ({ id: `${rec.id}w${k}`, ...w })));
    }

    _unfurnish(rec) {
        const g = this.game;
        const p = this._plans.get(rec.id);
        const nd = p && p !== 'wait' ? p.doors.length : 64, nb = p && p !== 'wait' ? p.beds.length : 64;
        for (let k = 0; k < nd; k++) g.doors?.remove?.(rec.id + 'd' + k);
        for (let k = 0; k < nb; k++) { const id = rec.id + 'b' + k; if (g.beds?.list.has(id) && g.beds.lying !== id) g.beds.removeBed?.(id); }
        for (const c of this._chestsOf(rec.id)) this._dropChest(c);
        g.houses?.setExtraPanes?.(rec.id, []);
    }

    // ============================================================== «Левиоса Максима»: too big to lift whole
    houseOfBlock() { return null; }
    blocksOf() { return []; }

    // ================================================================== ruins
    /** (host) Blown down to less than a third of its blocks: a ruin — its chests spill (one creation a check). */
    _ruinCheck() {
        const data = this.data, g = this.game;
        if (!data || this.magic || !this.list.size || this._repairQ.length || this._repairAfter > 0) return;
        const all = [...this.list.values()].filter((r) => !r.building);
        if (!all.length) return;
        const rec = all[(this._ruinI = (this._ruinI || 0) + 1) % all.length];
        const pts = [g.character.group.position, ...[...(g.remotes?.values() || [])].map((r) => r.position).filter(Boolean)];
        if (!pts.some((p) => Math.hypot(p.x - rec.x, p.z - rec.z) < 200)) return;
        const P = this.plan(rec);
        if (!P) return;
        let have = 0, n = 0;
        const C = P.cells;
        for (let i = 0; i < P.n; i += 5) {
            const t = C[i * 5 + 3];
            if (t === BLOCK.AIR) continue;
            n++;
            if (data.get(C[i * 5], C[i * 5 + 1], C[i * 5 + 2]) !== BLOCK.AIR) have++;
        }
        if (!n || have >= n * HOUSE_MAGIC.RUIN) return;
        this._ruin(rec);
        g.sync?.net?.send({ t: this.netType, a: 'gone', id: rec.id });
    }

    // ============================================================ net / save
    scrollFor() { return []; }

    _missing(rec) {
        const data = this.data;
        if (!data || rec.building || (this.magic && this.magic.id === rec.id)) return rec.miss || [];
        const P = this.plan(rec);
        if (!P) return rec.miss || [];
        const out = [], C = P.cells;
        for (let i = 0; i < P.n; i++) {
            const t = C[i * 5 + 3];
            if (t === BLOCK.AIR) continue;
            if (data.get(C[i * 5], C[i * 5 + 1], C[i * 5 + 2]) !== t) { out.push(C[i * 5] + ',' + C[i * 5 + 1] + ',' + C[i * 5 + 2]); if (out.length >= 8000) break; }
        }
        return out;
    }

    /** After a load / a join: every creation's ground cleared again and its blocks put back — a little a frame. */
    _repair() {
        for (const rec of this.list.values()) if (!this._repairQ.some((q) => q.rec === rec)) this._repairQ.push({ rec, stage: 0, i: 0, b: 0, x: null, z: null, miss: null });
        return 0;
    }

    _repairStep() {
        const data = this.data, q = this._repairQ[0];
        if (!data || !q) return;
        if (!this.list.has(q.rec.id)) { this._repairQ.shift(); return; }
        const P = this.plan(q.rec);
        if (!P) return;
        if (!q.miss) q.miss = new Set(q.rec.miss || []);
        const t0 = performance.now(), busy = () => performance.now() - t0 > 2, edits = [];
        // 0: the ground cleared again (only the land itself: what people built since stays)
        while (q.stage === 0 && !busy()) {
            const B = P.clear[q.b];
            if (!B) { q.stage = 1; q.i = 0; break; }
            if (q.x == null) { q.x = B.x0; q.z = B.z0; }
            for (let L = Math.min(B.L1, data.topLayer(q.x, q.z) + 1); L >= B.L0; L--) {
                const t = data.get(q.x, L, q.z);
                if (t === BLOCK.AIR || !natural(t)) continue;
                data.set(q.x, L, q.z, BLOCK.AIR); edits.push([q.x, L, q.z, BLOCK.AIR]);
            }
            if (++q.z > B.z1) { q.z = B.z0; if (++q.x > B.x1) { q.b++; q.x = null; } }
        }
        // 1: the foundation; 2: the blocks (not the ones that were really gone)
        if (q.stage === 1) {
            const FL = P.fill;
            for (; q.i < FL.length / 4 && !busy(); q.i++) {
                const i = q.i * 4, t = data.get(FL[i], FL[i + 1], FL[i + 2]);
                if (t === BLOCK.AIR || t === BLOCK.WATER) { data.set(FL[i], FL[i + 1], FL[i + 2], FL[i + 3]); edits.push([FL[i], FL[i + 1], FL[i + 2], FL[i + 3]]); }
            }
            if (q.i >= FL.length / 4) { q.stage = 2; q.i = 0; }
        }
        if (q.stage === 2) {
            const C = P.cells;
            for (; q.i < P.n && !busy(); q.i++) {
                const i = q.i * 5, x = C[i], L = C[i + 1], z = C[i + 2], t = C[i + 3], sh = C[i + 4];
                if (q.miss.has(x + ',' + L + ',' + z)) continue;
                if (data.get(x, L, z) === t && (!data.shapeAt || (data.shapeAt(x, L, z) | 0) === sh)) continue;
                if (t === BLOCK.AIR && !natural(data.get(x, L, z))) continue;
                data.set(x, L, z, t, sh); edits.push(sh ? [x, L, z, t, sh] : [x, L, z, t]);
            }
        }
        if (edits.length) { if (this.auth) this.game.builder?._sendEdits(edits); else this.game.blockEdits?.push?.(...edits); }
        if (q.stage === 2 && q.i >= P.n) {
            this._repairQ.shift();
            this._relight(q.rec);
            // (a creation saved half-built is whole now)
            if (q.rec.building) { delete q.rec.building; if (this.auth) this._furnish(q.rec, true); }
        }
    }

    _accept(r) {
        if (!r || !r.id || !r.recipe || !r.rect) return;
        this._hookLight();
        const was = this.list.get(r.id);
        const rec = { ...r, recipe: sanitizeRecipe(r.recipe, '', r.seed), level: 1, store: was?.store || r.store || {}, miss: Array.isArray(r.miss) ? r.miss.slice(0, 8000) : was?.miss || [] };
        rec.recipe.name = String(r.recipe.name || rec.recipe.name).slice(0, 40); // (its name as it was)
        this.list.set(rec.id, rec);
        this.plan(rec);
        if (!was) this._relight(rec);
        if (!was || !this._chestsOf(rec.id).length) this._furnish(rec, false);
    }

    onNet(m, isHost) {
        const g = this.game;
        const from = m.from;
        switch (m.a) {
            case 'lis': { // (another player's gods listen: their seed of light where their wand points)
                if (from == null || from === g.localId) break;
                const map = this._lisOf || (this._lisOf = new Map());
                if (!m.on) map.delete(from);
                else if ([m.x, m.y, m.z].every((v) => Number.isFinite(+v))) { const o = map.get(from); map.set(from, { x: +m.x, y: +m.y, z: +m.z, t: o?.t || 0 }); }
                if (map.size > 8) map.delete(map.keys().next().value);
                break;
            }
            case 'ask': {
                if (!isHost || typeof m.desc !== 'string') break;
                const res = this._hostAsk({ desc: m.desc, at: m.at, c: m.c, wand: m.wand, kind: m.kind }, from);
                if (res !== true) g.sync?.net?.send({ t: this.netType, a: 'no', to: from, msg: String(res).slice(0, 200) });
                break;
            }
            case 'no': if (m.to === g.localId) g.hud?.setVoice?.(m.msg, true); break;
            case 'think': if (m.to === g.localId && !this.mine) this._think(m.id, String(m.desc || '').slice(0, CREATION.DESC_MAX)); break;
            case 'recipe': if (isHost && m.recipe && typeof m.recipe === 'object') this._hostRecipe(m.id, m.recipe, from); break;
            case 'u': if (isHost && this.magic?.id === m.id && this.magic.by === from) this.magic.u = Math.max(this.magic.u || 0, Math.min(1, +m.u || 0)); break;
            case 'fade': if (isHost && this.magic?.id === m.id && this.magic.by === from) this._hostFade(m.id, null, false); break;
            case 'seed': if (!isHost) { this.magic = { id: m.id, by: m.by, phase: 'seed', t: 0, u: 0, x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, wand: Array.isArray(m.wand) ? { x: m.wand[0], y: m.wand[1], z: m.wand[2] } : null, progT: 0 }; this._seedStart(this.magic); } break;
            case 'prog': if (!isHost && this.magic?.id === m.id) this.magic.u = Math.min(1, +m.u || 0); break;
            case 'bloom': if (!isHost && this.magic?.id === m.id) { this._bloom(this.magic); if (m.kind !== 'build') this.magic = null; else this.magic.phase = 'site'; } break;
            case 'grow': if (!isHost && this.magic?.id === m.id && m.rect) Object.assign(this.magic, { phase: 'grow', t: 0, u: 0, rect: m.rect, G: +m.G || 0, top: +m.top || 0, colors: Array.isArray(m.colors) ? m.colors.slice(0, 6) : [], T: +m.T || 20 }); break;
            case 'faded': if (!isHost && this.magic?.id === m.id) { const mm = this.magic; this.magic = null; this._faded(mm); } break;
            case 'back': if (m.to === g.localId && this.mine?.id === m.id) { const me = this.mine; me.ctl.stop = true; this.mine = null; if (m.refund && me.paid && g.combat) g.combat.fatigue = Math.min(g.combat.maxFatigue || Infinity, g.combat.fatigue + me.paid); if (m.msg) g.hud?.setVoice?.(m.msg, true); } break;
            case 'made': if (m.to === g.localId) this._myMade({ type: m.kind, name: String(m.name || '').slice(0, 40) }); break;
            case 'done': if (!isHost && m.rec) { this._accept(m.rec); this._finished(this.list.get(m.rec.id) || m.rec, m.by); } break;
            case 'gone': if (!isHost) { const r = this.list.get(m.id); if (r) this._ruin(r); } break;
            case 'close': if (!isHost) { const c = this.chests.get(m.cid); if (c) this._shut(c); } break;
        }
    }

    snapshot() {
        return {
            list: [...this.list.values()].map((r) => ({ ...r, store: r.store || {}, miss: this._missing(r) })),
            // (my mana, paid while the gods were still thinking: it comes back on load — the creation never happened)
            refund: this.mine && !this.mine.done ? this.mine.paid || 0 : 0,
        };
    }

    restore(s) {
        if (!s) return;
        for (const r of s.list || []) this._accept(r);
        if (this.auth) for (const r of this.list.values()) if (!r.building) this._furnish(r, true);
        this._repair();
        this._repairAfter = 2;
        this._sweepT = 2;
        if (s.refund > 0) { this._refundLater = Math.min(CREATION.COST, +s.refund || 0); this._refundAt = 3; }
        setTimeout(() => { if (this.auth) for (const c of this.chests.values()) if (!c.isOpen) this._sweep(c, true); }, 1500);
    }

    sampleModels() { return []; }
}

const p0 = (recipe) => recipe.parts[0] || {};
