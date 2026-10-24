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
import { spotTarget, safeNear, spawnLabel } from './SpawnSpots.js';
import { WATER_LEVEL_Y } from '../world/Terrain.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

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
     * «Где появиться» (SpawnSpots.js): новый герой мира и возрождение — рядом с выбранным боссом. Земля там уже есть (площадка
     * у старта); пока воркеры её не принесли (`landMade`), ждём и в кадре землю не делаем. Не вышло за 25 с — остаёмся где были.
     */
    requestSpawn() {
        const g = this.game, id = g.hero?.spawn;
        this.pending = null;
        if (!this.on || !id || id === 'start') return;
        const data = g.world?.terrain?.data;
        const t = spotTarget(id, { castleGate: () => { const c = data?.castles?.cellOf?.(0, -1); return c?.gate ? { x: c.gate.x, z: c.gate.z, yaw: c.gateYaw } : null; } });
        if (!t) { g.hud?.toast?.(`📍 «${spawnLabel(id)}»: здесь такой точки нет — вы на начальной площадке`); return; }
        this.pending = { t, age: 0 };
    }

    /** Каждый кадр: ждём землю у цели и ставим героя (один раз). */
    step(dt) {
        const p = this.pending, g = this.game;
        if (!p || !g.active || g.isDeadLocal) return;
        p.age += dt;
        const data = g.world?.terrain?.data;
        if (!data) { this.pending = null; return; }
        if (p.age > 25) { this.pending = null; g.hud?.toast?.('📍 Место появления не загрузилось — вы остались на месте'); return; }
        try {
            if (!data.landMade(p.t.x, p.t.z)) return;
            const dry = (x, z) => data.landMade(x, z) && !data.isSeaColumn(Math.round(x), Math.round(z)) && data.surfaceY(x, z) > WATER_LEVEL_Y + 0.5 && !data.isWaterAt(x, data.surfaceY(x, z), z);
            const at = safeNear(p.t, dry);
            this.pending = null;
            if (!at) { g.hud?.toast?.('📍 У места появления не нашлось сухой земли — вы остались на месте'); return; }
            const me = g.character.group.position;
            me.set(at.x, data.surfaceY(at.x, at.z) + PLAYER_GROUND_OFFSET + 0.1, at.z);
            g.character.group.rotation.y = p.t.yaw || 0;
            g.character.verticalVelocity = 0;
            g.knockback?.set?.(0, 0, 0);
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

