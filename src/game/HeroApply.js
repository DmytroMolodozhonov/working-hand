/**
 * HeroApply.js — «Настройки героя» Творческого мира, применённые к герою (правила и числа — HeroSetup.js).
 *
 * - `start()`: после загрузки мира. Мана (ячейки) — правило мира, действует всегда (ячейки + выжженные свитки силы);
 *   остальное — начальное: броня, мантия, чёрная магия, метка слома — только если это новый герой этого мира
 *   (вернувшийся с сохранением остаётся таким, каким ушёл); заклинания, дуэльная сила и устойчивость не «выдаются» —
 *   они читаются из `game.hero` на месте (SpellBook.knows, Duel._strength, Steadiness.effective).
 * - `respawn()`: смерть в Творческом (космос и т.п.) — герой возрождается с настройками заново.
 */

import { creativeFiniteMana, creativeMortal } from './HeroSetup.js';
import { makePiece, makeRobe, PIECES } from './ArmorTypes.js';
import { clampDark } from './DarkMagic.js';
import { spotTarget, safeNear, spawnLabel, farTarget, lairCells, spiderSpot, FAR_SPOT } from './SpawnSpots.js';
import { SPIDER_LAIR } from '../world/SpiderLairs.js';
import { testSeaCastleSpot } from '../world/Castles.js';
import { WATER_LEVEL_Y } from '../world/Terrain.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

/** Высота, на которой герой ждёт землю дальнего места (м): внутри дальности пробуждения кораблей и далеко от крыш. */
const HOVER_Y = 70;

export class HeroApply {
    constructor(game) { this.game = game; this.pending = null; }

    get on() { return this.game.config?.mode === 'creative'; }

    /** Ячейки маны: конечная мана в Творческом — своё число (+ свитки силы); бесконечная — как было. */
    applyMana() {
        const g = this.game, c = g.combat;
        if (!this.on || !c || !creativeFiniteMana(g)) return;
        c.maxFatigue = g.hero.cells + (g.bonus?.fatigue || 0) + (g.mana?.growth || 0); // (the cells set + burnt scrolls + what spells grew)
        c.fatigue = Math.min(c.fatigue ?? c.maxFatigue, c.maxFatigue);
        c._hudKey = ''; c._manaKey = '';
    }

    /**
     * «Где появиться» (SpawnSpots.js): новый герой мира и возрождение — рядом с выбранным боссом. Близкие места (площадка у старта) —
     * ждём землю и ставим; дальние (башня, арена, поселение, паучиха, порт, чёрный корабль) — герой зависает над точкой, пока воркеры
     * несут землю (в кадре землю не делаем), и потом встаёт на твёрдое. Не вышло — возвращаем туда, откуда взяли, и говорим почему.
     */
    requestSpawn() {
        const g = this.game, id = g.hero?.spawn;
        this.pending = null;
        if (!this.on || !id || id === 'start') return;
        const data = g.world?.terrain?.data;
        const gate = () => { const c = data?.castles?.cellOf?.(0, -1); return c?.gate ? { x: c.gate.x, z: c.gate.z, yaw: c.gateYaw } : null; };
        const port = () => { const sp = data?.test ? testSeaCastleSpot(data.seed) : null; return sp ? { x: sp.shore.x, z: sp.shore.z + 8 } : null; };
        this.pending = { id, age: 0, far: false, hold: null, origin: g.character?.group?.position?.clone?.() || null, cells: null, t: null };
        if (id === 'blackship') return;
        if (id === 'spider') { this.pending.cells = lairCells(SPIDER_LAIR.CELL, 6, g.character.group.position); return; }
        const t = id === 'tower' || id === 'arena' || id === 'village' || id === 'port' ? farTarget(id, data, { port }) : spotTarget(id, { castleGate: gate });
        if (!t) { this._fail(`в этом мире такого места нет — вы на начальной площадке`, id); return; }
        this.pending.t = t;
        this._far(t);
    }

    _fail(why, id = this.pending?.id) {
        const p = this.pending, g = this.game;
        this.pending = null;
        if (p?.hold && p.origin) { g.character.group.position.copy(p.origin); g.character.verticalVelocity = 0; } // (back from the sky)
        g.hud?.toast?.(`📍 «${spawnLabel(id)}»: ${why}`);
    }

    _far(t) {
        const me = this.game.character.group.position;
        this.pending.far = Math.hypot(t.x - me.x, t.z - me.z) > FAR_SPOT;
    }

    /** Зависнуть над (x, z): герой не падает и не двигается, пока земля внизу не готова (воркеры ведутся от героя). */
    _hover(x, z) {
        const g = this.game, me = g.character.group.position, p = this.pending;
        p.hold = true;
        me.set(x, HOVER_Y, z);
        g.character.verticalVelocity = 0;
        g.knockback?.set?.(0, 0, 0);
    }

    _dry(data) {
        return (x, z) => data.landMade(x, z) && !data.isSeaColumn(Math.round(x), Math.round(z)) && data.surfaceY(x, z) > WATER_LEVEL_Y + 0.5 && !data.isWaterAt(x, data.surfaceY(x, z), z);
    }

    _land(at, t) {
        const g = this.game, data = g.world.terrain.data, me = g.character.group.position;
        this.pending = null;
        me.set(at.x, data.surfaceY(at.x, at.z) + PLAYER_GROUND_OFFSET + 0.1, at.z);
        g.character.group.rotation.y = t.yaw || 0;
        g.character.verticalVelocity = 0;
        g.knockback?.set?.(0, 0, 0);
    }

    /** Чёрный корабль: над ним, пока он не проснулся (сам, как только герой рядом), потом на палубу. */
    _stepShip(p, dt) {
        const g = this.game, s = g.blackbeard?._ensure?.();
        if (!s) { if (g.blackbeard?._none || p.age > 8) this._fail('в этом мире нет открытого моря с чёрным кораблём — вы на начальной площадке'); return; }
        const st = s.st;
        if (!g.terrain?.data?.landMade(st.x, st.z)) { this._hover(st.x, st.z); p.t = { x: st.x, z: st.z }; return; }
        if (!s.awake || !s.model) { this._hover(st.x, st.z); return; } // (it wakes itself when the hero is near: no ship built in one frame)
        const L = s.layout, m = L.masts?.find((q) => q.id === 'main') || { z: 0 };
        const lx = 3, lz = Math.min(L.L / 2 - 6, (m.z ?? 0) + 7), o = { x: 0, y: 0, z: 0 };
        s.pose.toWorld(lx, L.deck + PLAYER_GROUND_OFFSET + 0.6, lz, o);
        this.pending = null;
        g.character.group.position.set(o.x, o.y, o.z);
        g.character.group.rotation.y = s.pose.yaw ?? st.yaw ?? 0;
        g.character.verticalVelocity = 0;
        g.knockback?.set?.(0, 0, 0);
    }

    /** Паучиха: ячейки вокруг по одной за кадр (каждая может строить пещеры), потом как дальнее место. */
    _stepSpider(p) {
        const g = this.game;
        if (p.cells.length) {
            const { gx, gz } = p.cells.shift();
            const L = g.spiders?._lairOf?.(gx, gz);
            if (L) { p.cells.length = 0; const from = g.character.group.position; p.t = spiderSpot(L, { x: from.x, z: from.z }); this._far(p.t); }
            else if (!p.cells.length) this._fail('логово паучихи рядом не нашлось — вы на начальной площадке');
        }
    }

    /** Каждый кадр: ждём землю у цели и ставим героя (один раз). */
    step(dt) {
        const p = this.pending, g = this.game;
        if (!p || !g.active || g.isDeadLocal) return;
        p.age += dt;
        const data = g.world?.terrain?.data;
        if (!data) { this.pending = null; return; }
        if (p.age > (p.far || p.id === 'blackship' ? 60 : 25)) { this._fail('место не загрузилось — вы остались на месте'); return; }
        try {
            if (p.id === 'blackship') { this._stepShip(p, dt); return; }
            if (p.id === 'spider' && !p.t) { this._stepSpider(p); return; }
            const t = p.t;
            if (!t) return;
            if (!data.landMade(t.x, t.z)) { if (p.far) this._hover(t.x, t.z); return; }
            const at = safeNear(t, this._dry(data));
            if (!at) { this._fail('рядом нет сухой земли — вы остались на месте'); return; }
            this._land(at, t);
        } catch (e) { this.pending = null; }
    }

    /** Обычное здоровье в Творческом: своё число HP (+ свитки здоровья); урон и смерть — как в Свободном мире (Combat.enabled). */
    applyHealth() {
        const g = this.game, c = g.combat;
        if (!this.on || !c?.enabled || !creativeMortal(g)) return;
        c.maxHp = g.hero.maxHp + (g.bonus?.hp || 0);
        c.hp = Math.min(c.hp ?? c.maxHp, c.maxHp);
        g.maxHP = c.maxHp; g.playerHP = c.hp; c._hudKey = '';
    }

    /** Броня и мантия: в пустые места (то, что герой уже носит, не трогаем). */
    dress() {
        const a = this.game.armor, h = this.game.hero;
        if (!a || !h) return;
        if (h.armor) for (const p of PIECES) if (!a.worn[p]) a.wear(makePiece(p, { magic: true }), { quiet: true });
        if (h.robe && !a.worn.robe) a.wear(makeRobe(true), { quiet: true });
    }

    /** Новый герой этого мира: начальные значения. */
    initial() {
        const g = this.game, h = g.hero;
        this.dress();
        if (h.dark > 0 && g.dark) {
            const n = clampDark(h.dark);
            if (n > g.dark.level) g.dark.restore({ level: n, skin: n }); // (quietly: no «something dark stirs» at the world's start)
        }
        if (h.breakward && g.breakward && !g.breakward.marked) { g.breakward.marked = true; g.breakward.known = true; g.breakward._hud?.(); }
    }

    start() {
        if (!this.on) return;
        this.applyMana();
        this.applyHealth();
        if (!this.game._playerRestored) { this.initial(); this.requestSpawn(); }
    }

    respawn() {
        if (!this.on) return;
        const g = this.game, c = g.combat;
        this.applyMana();
        this.applyHealth();
        if (c && creativeMortal(g)) { c.hp = c.maxHp; g.playerHP = c.hp; }
        if (c && creativeFiniteMana(g)) c.fatigue = c.maxFatigue;
        this.requestSpawn();
        g.dark?.onDeath?.();
        g.breakward?.onDeath?.();
        this.initial();
    }
}

