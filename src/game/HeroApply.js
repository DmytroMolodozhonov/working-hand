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
import { spotTarget, safeNear, spawnLabel, farTarget, lairCells, spiderSpot, FAR_SPOT, standLayer, lairApproach, denSpot, queenApproach, lairUsable } from './SpawnSpots.js';
import { LAIR } from '../world/DragonLairs.js';
import { isCrewless } from './Sailors.js';
import { SPIDER_LAIR } from '../world/SpiderLairs.js';
import { testSeaCastleSpot } from '../world/Castles.js';
import { WATER_LEVEL_Y, BLOCK, isSolid } from '../world/Terrain.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

/** Высота, на которой герой ждёт землю дальнего места (м): внутри дальности пробуждения кораблей и далеко от крыш. */
const HOVER_Y = 70;
/** Корабль героя ставится на круг чёрного впереди него (м вдоль круга): так он идёт к кораблю сам, и встреча — через ~2 минуты (5 м/с). */
const MEET_AHEAD = 650, MEET_NEAR = 120;

export class HeroApply {
    constructor(game) { this.game = game; this.pending = null; }

    get on() { return this.game.config?.mode === 'creative'; }

    /** Ячейки маны: конечная мана в Творческом — своё число (+ свитки силы); бесконечная — как было. */
    applyMana() {
        const g = this.game, c = g.combat;
        if (this.on && g.mana && g.hero?.duelMastery > 0) g.mana.mastery = Math.max(g.mana.mastery || 0, g.hero.duelMastery); // (дуэльное мастерство из настроек мира: с самого начала и после возрождения)
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
        g.arenaDuels?.stopDuelMode?.();
        if (!this.on || !id || id === 'start') return;
        const data = g.world?.terrain?.data;
        const gate = () => { const c = data?.castles?.cellOf?.(0, -1); return c?.gate ? { x: c.gate.x, z: c.gate.z, yaw: c.gateYaw } : null; };
        const port = () => { const sp = data?.test ? testSeaCastleSpot(data.seed, data.bigHouses) : null; return sp ? { x: sp.shore.x, z: sp.shore.z + 8 } : null; };
        this.pending = { id, age: 0, far: false, hold: null, origin: g.character?.group?.position?.clone?.() || null, cells: null, t: null };
        if (id === 'blackship') return;
        if (id === 'dragon' && data?.deepCaves) { // (any Creative world: the nearest real lair far from the Ice Queen, found cell by cell — _stepLair)
            this.pending.cells = lairCells(LAIR.CELL, 20, { x: 0, z: 0 });
            return;
        }
        if (id === 'spider') { // (the author 30.10: «паучиха должна быть на природе, в тёмное время суток; пещеры там быть не должно» — the ordinary lair outside, at night)
            this.pending.cells = lairCells(SPIDER_LAIR.CELL, 6, g.character.group.position);
            if (g.spiders) g.spiders.lairMode = true; // (Creative: the night spiders are off, but at her place she comes out)
            return;
        }
        const iceApproach = () => { const P = data?.apart ? data.iceCastle?.plan : null; return P && !P.test ? queenApproach(P) : null; };
        const t = ['tower', 'arena', 'village', 'magevillage', 'magehut', 'port'].includes(id) ? farTarget(id, data, { port }) : spotTarget(id, { castleGate: gate, iceApproach, apart: !!data?.apart });
        if (!t) { this._fail(`в этом мире такого места нет — вы на начальной площадке`, id); return; }
        this.pending.t = t;
        this._far(t);
    }

    _fail(why, id = this.pending?.id) {
        const p = this.pending, g = this.game;
        this.pending = null;
        if (p?.hold && p.origin) { g.character.group.position.copy(p.origin); g.character.verticalVelocity = 0; } // (back from the sky)
        this._upright();
        g.hud?.toast?.(`📍 «${spawnLabel(id)}»: ${why}`);
    }

    _far(t) {
        const me = this.game.character.group.position;
        this.pending.far = Math.hypot(t.x - me.x, t.z - me.z) > FAR_SPOT;
    }

    /** Зависнуть над (x, z): герой не падает и не двигается, пока земля внизу не готова (воркеры ведутся от героя). */
    _hover(x, z, y = HOVER_Y) {
        const g = this.game, me = g.character.group.position, p = this.pending;
        p.hold = true;
        me.set(x, y, z);
        g.character.verticalVelocity = 0;
        g.knockback?.set?.(0, 0, 0);
    }

    /** After a move across the world: no fall counted from the old place (the hover was 70 m up — landing from it laid the hero down). */
    _upright() {
        const g = this.game, ch = g.character;
        ch.airTop = null; ch.landing = null;
        g.knock?.reset?.();
    }

    _dry(data) {
        return (x, z) => data.landMade(x, z) && !data.isSeaColumn(Math.round(x), Math.round(z)) && data.surfaceY(x, z) > WATER_LEVEL_Y + 0.5 && !data.isWaterAt(x, data.surfaceY(x, z), z);
    }

    _land(at, t) {
        const g = this.game, data = g.world.terrain.data, me = g.character.group.position;
        this.pending = null;
        const L = t.layer != null ? this._stand(data, at.x, at.z, t) : null; // (a cave's floor: not the mountain's top above it)
        me.set(at.x, (L != null ? L - 0.5 : data.surfaceY(at.x, at.z)) + PLAYER_GROUND_OFFSET + 0.1, at.z);
        g.faceYaw((t.yaw || 0) + Math.PI); // (t.yaw is a bearing atan2(dx, dz); the hero looks along −Z at 0)
        g.character.verticalVelocity = 0;
        g.knockback?.set?.(0, 0, 0);
        this._upright();
        if (t.spider) this._makeNight(); // (her place: the dark time of day, she is out at night)
        if (t.duel) g.arenaDuels?.startDuelMode?.(t.arenaId, g.hero?.foe); // (the arena: a fight in ten seconds — ArenaDuels)
    }

    /** Solo only (the clock is shared by the players): put the day to night so the spider is out and the place is dark; the day goes on from there. */
    _makeNight() {
        const g = this.game;
        if (!g.dayCycle || g.remotes?.size || g.isNight) return;
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.82; // (DAY_CYCLE_MS of Game.js: not imported — a cycle)
        g.world.setDayPhase(g.dayPhase());
    }

    /**
     * Корабль в море: герой на палубе ОБЫЧНОГО корабля (флейт), а чёрный корабль Чёрных Усов идёт по своему кругу и подходит
     * сам — встреча через пару минут. Корабль ставится на круг чёрного впереди него (`MEET_AHEAD` м по ходу), без моряков на
     * борту чёрного — рядом (`MEET_NEAR`): ждать некого. Сначала герой висит над точкой, пока корабль не проснётся сам.
     */
    _stepShip(p, dt) {
        const g = this.game, S = g.ships, bb = g.blackbeard, black = bb?._ensure?.();
        if (!black || !bb.spot) { if (bb?._none || p.age > 8) this._fail('в этом мире нет открытого моря — вы на начальной площадке'); return; }
        if (!p.mine) {
            const P = bb.spot, a = bb.angle + (isCrewless() ? MEET_NEAR : MEET_AHEAD) / P.R;
            const x = P.cx + Math.cos(a) * P.R, z = P.cz + Math.sin(a) * P.R;
            p.t = { x, z };
            if (!g.terrain?.data?.landMade(x, z)) { this._hover(x, z); return; }
            p.mine = S.spawn('fluyt', Math.round(x), Math.round(z), Math.atan2(-Math.sin(a), -Math.cos(a)) + Math.PI, { wake: false });
            if (!p.mine) { this._fail('корабль не удалось поставить — вы на начальной площадке'); return; }
            // (the hero is the master of this ship: her crew serves and defends him, never turns on him; her chests are not the captain's locked ones — Ships.loyalTo)
            p.mine.owner = g.localId; p.mine.ownerName = g.keeper?.myName || g.net?.name || null; p.mine.changed = true; p.mine.hostile.clear();
        }
        const s = p.mine, st = s.st;
        if (!s.awake || !s.model) { this._hover(st.x, st.z); return; } // (it wakes itself when the hero is near: no ship built in one frame)
        const L = s.layout, m = L.masts?.find((q) => q.id === 'main') || { z: 0 };
        const lz = Math.min(L.L / 2 - 6, (m.z ?? 0) + 7), o = { x: 0, y: 0, z: 0 };
        s.pose.toWorld(3, L.deck + PLAYER_GROUND_OFFSET + 0.6, lz, o);
        this.pending = null;
        g.character.group.position.set(o.x, o.y, o.z);
        g.character.group.rotation.y = s.pose.yaw ?? st.yaw ?? 0;
        g.character.verticalVelocity = 0;
        g.knockback?.set?.(0, 0, 0);
        this._upright();
        if (!isCrewless()) g.hud?.toast?.('⚓ Вы в открытом море. Смотрите по сторонам: где-то рядом ходит чёрный корабль');
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

    /** Слой пола у цели в пещере/на уступе (SpawnSpots.standLayer): твёрдый блок, над ним 6 слоёв воздуха. Земля столбца уже должна быть (landMade). */
    _stand(data, x, z, t) {
        return standLayer((ix, L, iz) => isSolid(data.get(ix, L, iz)), (ix, L, iz) => data.get(ix, L, iz) === BLOCK.AIR, x, z, t.layer - (t.down ?? 4), t.layer + (t.up ?? 4));
    }

    /** Сколько слоёв воздуха над полом зала (слой `floor`) в столбце — высота свода; землю столбца уже принесли (`landMade`). */
    _headroom(data, x, z, floor) {
        const ix = Math.round(x), iz = Math.round(z);
        let n = 0;
        while (n < 16 && data.get(ix, floor + 1 + n, iz) === BLOCK.AIR) n++;
        return n;
    }

    /** Настоящее логово дракона (миры с раздельными местами): ячейки от ближней к дальней, сколько успеем за 3 мс кадра (землю не делаем). */
    _stepLair(p) {
        const data = this.game.world.terrain.data, end = performance.now() + 3;
        while (p.cells.length && performance.now() < end) {
            const { gx, gz } = p.cells.shift();
            const S = data.lairOf(gx, gz);
            if (!S?.lair || !lairUsable(S.lair, data)) continue; // (not by the Ice Queen's palace nor by the spider's cave: the places are apart)
            const t = lairApproach(S.lair, data.heightAt); // (open ground 60–120 m off, the cave's mouth in plain sight)
            if (!t) continue;
            p.cells.length = 0;
            p.t = t;
            this._far(p.t);
            return;
        }
        if (!p.cells.length) this._fail('логово дракона рядом не нашлось — вы на начальной площадке');
    }

    /**
     * Герой снова с настройками мира: что он вырастил или выиграл с тех пор (ячейки от первых заклинаний и побеждённых, дуэльное
     * мастерство) снимается, мана и здоровье полные. Для дуэльного режима и для повтора боя с боссом.
     */
    resetToSettings() {
        const g = this.game, ma = g.mana, c = g.combat;
        if (ma) { ma.growth = 0; ma.mastery = 0; ma.beaten?.clear?.(); ma.duelsWon?.clear?.(); }
        if (g.bonus) { g.bonus.fatigue = 0; g.bonus.hp = 0; }
        this.applyMana(); this.applyHealth();
        if (c) { c.fatigue = c.maxFatigue || c.fatigue; c.hp = c.maxHp || c.hp; g.playerHP = c.hp; c._hudKey = ''; c._manaKey = ''; }
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
            if (!p.t && p.cells && p.id === 'dragon') { this._stepLair(p); return; }
            if (p.id === 'spider' && !p.t) { this._stepSpider(p); return; }
            const t = p.t;
            if (!t) return;
            // (the stand and everything round it made: a cave is dug chunk by chunk — no ground made in a frame)
            if (!data.landMade(t.x, t.z) || (t.need && !t.need.every((q) => data.landMade(q.x, q.z)))) { if (p.far) this._hover(t.x, t.z, t.layer != null ? t.layer + 30 : HOVER_Y); return; }
            if (t.refine && !p.refined) { // (a cave whose ground is here now: the exact spots by the dome's height — the same as the spider's)
                p.refined = true;
                p.t = t.refine((x, z) => this._headroom(data, x, z, t.layer));
                if (!p.t.boss) { this._fail('в пещере нет места', p.id); return; }
                return; // (next frame: its own ground made too)
            }
            const dry = this._dry(data);
            const at = t.layer != null
                ? safeNear(t, (x, z) => data.landMade(x, z) && this._stand(data, x, z, t) != null && !data.isSeaColumn(Math.round(x), Math.round(z)), { rings: [0, 2, 4, 6], around: 8 })
                : safeNear(t, dry);
            if (!at) { this._fail('рядом нет сухой земли — вы остались на месте'); return; }
            this._land(at, t);
        } catch (e) { this.pending = null; console.error('HeroApply:', p.id, e); this._fail(`ошибка при переносе (${e?.message || e}) — вы остались на месте`, p.id); }
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
        if (!this.game._playerRestored) {
            if (creativeFiniteMana(this.game) && this.game.combat) this.game.combat.fatigue = this.game.combat.maxFatigue;
            this.initial(); this.requestSpawn();
        }
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

