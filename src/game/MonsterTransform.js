/**
 * MonsterTransform.js — игровая часть «Пентаграммы страшного монстра» (правила и числа — MonsterForm.js, тело —
 * entities/MonsterBody.js). `game.monster`.
 *
 *  begin()     — встал на нарисованную пентаграмму: 200 маны (в Творческом даром), +1 тьмы, всё удерживаемое
 *                прекращается (концентрация, Империус, полёт, щит), вещи из рук падают, палочка прячется (слот тот же),
 *                здоровье человека запоминается — у монстра своё, 500. Превращение 5 с: судороги, рост толчками ×1 → ×7,
 *                рёв (мелодия thMonster + fxMonsterRoar — у всех рядом).
 *  10 минут    — счётчик на экране (Hud.setMonsterTimer: время, полоса, здоровье монстра).
 *  end()       — обратное превращение 4 с на том же месте; человек ставится туда, где помещается (MonsterForm.freeSpot:
 *                не в потолке, не в земле), палочка — снова в руке, здоровье — прежнее.
 *  fell()      — монстра убили: тело зверя опадает за 1,5 с, человек с четвертью прежнего здоровья, сбит с ног.
 *
 * Мир: корпус на ходу сносит построенное и деревья (`smashAt` — из Game._resolveMe, до стен), кулак — любой блок в шаре
 * у руки (кроме бедрока, заколдованного камня, даров богов); снятые блоки → builder._sendEdits(.., true) → прочность
 * зданий (Collapse/Structure: что потеряло опору — рушится цепочкой), сеть, сохранение. Шаги проседают землю (следы
 * ступни, с пределом частоты), прыжок с высоты — воронка. Кулак бьёт всех существ (FIST_TARGETS), жители боятся
 * (Danger 'monster'), стража — на героя, если видели.
 * Сеть: поза несёт `mo` (размер, превращение, рёв) — у других игроков та же модель, масштаб группы.
 */

import { manaRules } from './HeroSetup.js';
import * as THREE from 'three';
import { MONSTER, FIST, FIST_TARGETS, STOMP, GRAB, growAt, fmtLeft, hpAfterFall, spellOnMonster, knocksMonster, fistPower, fistBreaks, bodyBreaks, softGround, footprint, crater, freeSpot } from './MonsterForm.js';
import { MonsterLook } from '../entities/MonsterBody.js';
import { BlockSwarmFx } from '../fx/GroundVortexFx.js';
import { addDark } from './DarkMagic.js';
import { isDivine } from './ProtectionGods.js';
import { BLOCK, BASE_COLORS, isCastleBlock } from '../world/Terrain.js';
import { kindOf } from './CreatureImpact.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const PGO = 2.0; // Character.PLAYER_GROUND_OFFSET (ноги героя под серединой тела)
const r2 = (v) => Math.round(v * 100) / 100;

export class MonsterTransform {
    constructor(game) {
        this.game = game;
        this.phase = null; // null | 'grow' | 'on' | 'shrink'
        this.t = 0;
        this.left = 0;
        this.origHp = 0; this.origMax = 0;
        this.roar = 0;
        this.look = null;
        this._fist = { left: 0, right: 0 };
        this._stepD = 0; this._foot = 1; this._lastDent = -1e9; this._dents = 0;
        this._smashAt = null; this._smashSize = 0;
        this._budget = 0;
        this._edits = []; this._debris = []; this._castle = 0; this._castleAt = null;
        this._alarmT = 0;
        this._fellHp = null;
        this.carry = { left: null, right: null }; // блоки в лапе (поднятый кусок стены)
        this.flying = []; // брошенные блоки: летят, падают, ложатся
        this._curl = { left: 0, right: 0 };
        this.blockFx = null;
        this._col = new THREE.Color(); this._sq = new THREE.Quaternion(); this._se = new THREE.Euler();
    }

    get active() { return this.phase != null; }
    /** Палочки в руке нет всё превращение (и пока растёт, и пока уменьшается). */
    get hidesWand() { return this.phase != null; }
    /** Видно дальше (туман, чанки, тень — как в полёте), пока тело большое. */
    get viewBoost() { return this.phase ? MONSTER.VIEW_BOOST * Math.min(1, ((this.game.character?.size || 1) - 1) / (MONSTER.SCALE - 1)) : 0; }

    // ------------------------------------------------------------------ начало

    /** Почему нельзя (null — можно). */
    whyNot() {
        const g = this.game;
        if (this.phase) return 'вы уже монстр';
        if (g.combat?.dead || g.isDeadLocal) return 'вы мертвы';
        if (!this.prepaid && manaRules(g) && (g.combat.fatigue || 0) < MONSTER.COST) return `не хватает маны: нужно ${MONSTER.COST}, есть ${Math.floor(g.combat.fatigue || 0)}`;
        // (под каменным сводом — в пещере, под скалой — 24-метровому телу не встать)
        const T = g.terrain?.data, p = g.character.group.position;
        if (T?.ceilingAbove) {
            const feetL = Math.floor(p.y - PGO + 1.5);
            const L = T.ceilingAbove(Math.round(p.x), Math.round(p.z), feetL + 4);
            if (L !== Infinity && L - feetL < MONSTER.BODY_H) {
                const t = T.get(Math.round(p.x), L, Math.round(p.z));
                if (!bodyBreaks(t)) return 'здесь тесно — над головой скала; выйдите под открытое небо';
            }
        }
        return null;
    }

    /** Встал на пентаграмму монстра (PentagramMonster): начать превращение. true — началось. */
    begin({ free = false } = {}) {
        const g = this.game, why = this.whyNot();
        if (why) { g.hud?.setVoice?.(`🐺 ${why}`, true); return false; }
        const c = g.combat;
        if (!this.prepaid && !free && c?.enabled && g.config?.mode !== 'creative') c.fatigue = Math.max(0, c.fatigue - MONSTER.COST);
        addDark(g.dark || g, MONSTER.DARK, 'ritual'); // (чёрная магия: +1 за каждое превращение)
        // всё удерживаемое прекращается; ничего другого держать огромные лапы не будут
        try { g.imperius?.active && g.imperius.stop('stop'); } catch { /* (не вселён) */ }
        g.stopSpells?.();
        g.burning?.me && g.burning._outMe?.('monster'); // (огонь гаснет: шерсть монстра не горит)
        g.flight?.busy && g.flight.land('monster');
        g.animals?.riding && g.animals.dismount?.();
        g.beds?.lying && g.beds.standUp?.();
        g.boards?.mounted && g.boards.dismount?.('land');
        g.dragonRide?.busy && g.dragonRide.stop?.('stop');
        g.ledge?.active && g.ledge.letGo?.();
        g.ships?.rigging?.climbing && g.ships.rigging.letGo?.();
        for (const side of ['left', 'right']) {
            const h = g.items?.held?.[side];
            if (h && h.item.kind !== 'wand') g.items._throw(side, _v.set(0, 0, 0), { why: 'монстр' });
            if (g.weapons?.hands?.[side]?.held) g.weapons.release(side);
        }
        // палочка прячется (её слот и предмет на месте): у других игроков её тоже нет
        for (const side of ['left', 'right']) { const h = g.items?.held?.[side]; if (h?.item.kind === 'wand') { h.model.visible = false; g.sync?.itemHold?.(side, null); } }
        // здоровье: у человека — своё (ждёт), у монстра — 500
        if (c?.enabled) { this.origHp = c.hp; this.origMax = c.maxHp || 0; c.maxHp = MONSTER.HP; c.hp = MONSTER.HP; }
        else { this.origHp = g.playerHP; this.origMax = g.maxHP; g.maxHP = MONSTER.HP; g.playerHP = MONSTER.HP; }
        this.phase = 'grow'; this.t = 0; this.left = MONSTER.DURATION;
        this._dents = 0; this._fellHp = null;
        const ch = g.character;
        if (!this.look) this.look = new MonsterLook(ch);
        ch.sizeRun = 1; ch.jumpK = 1;
        g.sound?.spellCast?.('MonsterForm', ch.group.position);
        g.sync?.castSound?.('MonsterForm', ch.group.position);
        this._alarm(true);
        g.hud?.setVoice?.('🐺 <span style="color:#ff7a5a">Тело рвётся и растёт…</span>', true);
        return true;
    }

    // ------------------------------------------------------------------ конец

    /** Обратное превращение (время вышло / «стоп» не снимает — только время, смерть, выход). `instant` — сразу. */
    end(why = 'time', instant = false) {
        if (!this.phase) return;
        if (instant) { this._finish(why); return; }
        if (this.phase === 'shrink') return;
        this._why = why;
        this.phase = 'shrink'; this.t = 0; this._shrinkS = why === 'fell' ? 1.5 : MONSTER.SHRINK_S;
        const g = this.game;
        g.sound?.spellCast?.('MonsterBack', g.character.group.position);
        g.sync?.castSound?.('MonsterBack', g.character.group.position);
        g.hud?.setVoice?.(why === 'fell' ? '🐺 <span style="color:#ff7a5a">Тело монстра не выдержало — вы снова человек</span>' : '🐺 Сила пентаграммы уходит — вы снова человек', true);
    }

    _finish(why) {
        const g = this.game, ch = g.character, c = g.combat;
        const was = this.phase;
        for (const side of ['left', 'right']) if (this.carry[side]) this._let(side, true);
        this.phase = null;
        if (this.look) this.look.setOn(false);
        // ноги — где стоял монстр: человек туда, где помещается
        const feet = ch.group.position.y - PGO * (ch.size || 1);
        ch.setSize(1); ch.sizeRun = 1; ch.jumpK = 1;
        ch.group.position.y = feet + PGO;
        if (was) this._unstick();
        // здоровье — прежнее (монстра убили — четверть)
        const hp = this._fellHp != null ? this._fellHp : this.origHp;
        if (c?.enabled) { c.maxHp = this.origMax || undefined; if (!c.dead) c.hp = Math.min(hp, c.maxHp || 20); }
        else { g.maxHP = this.origMax; if (!g.isDeadLocal) g.playerHP = Math.min(hp, g.maxHP); }
        // палочка — снова в руке
        for (const side of ['left', 'right']) { const h = g.items?.held?.[side]; if (h?.item.kind === 'wand') { h.model.visible = true; g.sync?.itemHold?.(side, h.item); } }
        g.hud?.setMonsterTimer?.(null);
        this._flushEdits();
        if (why === 'fell' && !c?.dead && !g.isDeadLocal) g.knock?.knock?.({ dir: 'back', kind: 'fall', strength: 0.6 });
        this._fellHp = null;
    }

    /** Монстра убили (HP 0): форма падает, человек жив. */
    fell(by, kind) {
        if (!this.phase) return;
        this._fellHp = hpAfterFall(this.origHp);
        const g = this.game;
        if (g.combat?.enabled) g.combat.hp = 1; else g.playerHP = 1;
        this.end('fell');
    }

    /** Combat.die пришёл в форме монстра: «Дай» (богов) — убивает и монстра, и человека; всё прочее рвёт только зверя. */
    saves(how, by) {
        if (how === 'die' || isDivine(how)) { this.end('dead', true); return false; }
        this.fell(by, how);
        return true;
    }

    // ------------------------------------------------------------------ что действует

    filterDamage(amount, kind, by) {
        const r = spellOnMonster(kind);
        if (r.breaks) { this.fell(by, kind); return 0; }
        if (r.k <= 0) { this._spark(); return 0; }
        return amount * r.k;
    }
    stuns(kind) { return isDivine(kind); }
    knocks(kind, cause) { return knocksMonster(kind) || knocksMonster(cause); }
    pushedBy(o) { return spellOnMonster(o?.spell || o?.kind).push; }

    _spark() {
        const g = this.game, now = performance.now();
        if (now - (this._sparkAt || 0) < 250) return;
        this._sparkAt = now;
        const p = g.character.group.position;
        for (let i = 0; i < 8; i++) g.fx?.spark?.(_v.set(p.x + (Math.random() - 0.5) * 5, p.y + (Math.random() - 0.2) * 8, p.z + (Math.random() - 0.5) * 5), 0xffb060, 0.5, _w.set((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6), 0.5);
    }

    /** Где стоит человек (для сохранения, пока форма): ноги монстра + рост человека. */
    humanPos() {
        const ch = this.game.character, p = ch.group.position;
        return { x: p.x, y: p.y - PGO * (ch.size || 1) + PGO, z: p.z };
    }

    // ------------------------------------------------------------------ каждый кадр

    update(dt) {
        if (!this.phase) return;
        const g = this.game, ch = g.character;
        this.t += dt;
        let st = null;
        if (this.phase === 'grow') {
            const k = this.t / MONSTER.GROW_S;
            st = growAt(k);
            this.roar = k > 0.86 ? Math.min(1, (k - 0.86) / 0.06) * (k < 1 ? 1 : 0) : 0;
            if (k >= 1) { this.phase = 'on'; this.t = 0; st = growAt(1); this.roar = 0.9; this._roarT = 1.2; ch.sizeRun = MONSTER.RUN_K; ch.jumpK = MONSTER.JUMP_K; }
        } else if (this.phase === 'shrink') {
            const k = this.t / (this._shrinkS || MONSTER.SHRINK_S);
            st = growAt(k, true);
            this.roar = k < 0.3 ? 0.6 : 0;
            ch.sizeRun = 1; ch.jumpK = 1;
            if (k >= 1) { this._finish(this._why || 'time'); return; }
        } else {
            st = growAt(1);
            this.left -= dt;
            if (this._roarT > 0) { this._roarT -= dt; this.roar = Math.max(0, this._roarT / 1.2) * 0.9; } else this.roar = 0;
            if (this.left <= 0) { this.left = 0; this.end('time'); }
        }
        ch.setSize(st.size);
        if (this.look) {
            this.look.setOn(st.beast > 0.1);
            this.look.update(dt, st.beast, this.roar);
            if (this.look.on && ch._fpv !== this._fpvSeen) { this._fpvSeen = ch._fpv; this.look.layers(); }
        }
        if (st.shake > 0) g.fx.shake = Math.max(g.fx.shake || 0, st.shake * 0.5);
        // счётчик
        const hp = g.combat?.enabled ? g.combat.hp : g.playerHP;
        if (this.phase === 'on') g.hud?.setMonsterTimer?.(fmtLeft(this.left), this.left / MONSTER.DURATION, hp, MONSTER.HP);
        else g.hud?.setMonsterTimer?.(this.phase === 'grow' ? '…' : '0:00', this.phase === 'grow' ? Math.min(1, this.t / MONSTER.GROW_S) : 0, null, null, this.phase === 'grow' ? 'превращение' : 'возвращение');
        if (this.phase === 'on' && !g.combat?.dead && !g.isDeadLocal) {
            this._steps(dt);
            this._grabs(dt);
            this._fists(dt);
            this._alarmT -= dt;
            if (this._alarmT <= 0) this._alarm();
        }
        this._budget = Math.min(STOMP.BREAK_PER_S, this._budget + STOMP.BREAK_PER_S * dt);
        this._drawBlocks(dt);
        this._flushEdits();
    }

    /** Жители: страшное существо рядом (Danger 'monster'); виновник — герой, если видели. */
    _alarm(loud = false) {
        const g = this.game, p = this.humanPos();
        this._alarmT = loud ? 1 : 2.5;
        g.castleLife?.alarm?.(_v.set(p.x, p.y - PGO, p.z), 'monster', g.localId, 14);
    }

    // ------------------------------------------------------------------ шаги: тяжесть, следы, воронки

    _steps(dt) {
        const g = this.game, ch = g.character, S = ch.size || 1, p = ch.group.position;
        const last = this._stepFrom || (this._stepFrom = p.clone());
        const d = Math.hypot(p.x - last.x, p.z - last.z);
        last.copy(p);
        // приземление с высоты: воронка и толчок земли
        const L = ch.landing;
        if (L && L.at !== this._landSeen) {
            this._landSeen = L.at;
            if (L.drop > STOMP.LAND_DROP) {
                g.fx.shake = Math.max(g.fx.shake || 0, Math.min(1.2, 0.3 + L.drop / 30));
                g.sound?.playGiantStep?.(this.humanPos(), 1.6);
                this._dent(p.x, p.z, crater(Math.round(Math.min(5, STOMP.CRATER_R + L.drop / 15))), true);
            }
        }
        if (!ch.onGround || ch.swimY != null || d > 8) return;
        this._stepD += d;
        const stride = 0.85 * S * (0.75 + 0.5 * (ch.runIntensity || 0)); // (шаг ×7: ~4,5 м шагом, ~7,5 м бегом)
        if (this._stepD < stride) return;
        this._stepD = 0;
        this._foot = -this._foot;
        const yaw = ch.group.rotation.y, side = 0.42 * S * this._foot;
        const fx = p.x + Math.cos(yaw) * side, fz = p.z - Math.sin(yaw) * side;
        const run = ch.isRunning ? ch.runIntensity || 0 : 0;
        g.sound?.playGiantStep?.(_w.set(fx, p.y - PGO * S, fz), 0.6 + 0.5 * run);
        g.fx.shake = Math.max(g.fx.shake || 0, 0.12 + 0.2 * run);
        // след — не каждый шаг (предел по частоте и по числу): правки мира идут по сети и в сохранение
        const now = performance.now() / 1000;
        if (run >= STOMP.RUN_MIN && now - this._lastDent >= STOMP.EVERY && this._dents < STOMP.MAX) {
            this._lastDent = now;
            this._dent(fx, fz, footprint(yaw, run > 0.7));
        }
    }

    /** Вмятина: верхние блоки мягкой земли под клетками проседают (не заколдованное, не дары богов, не чужая сфера дома). */
    _dent(x, z, cells, any = false) {
        const g = this.game, T = g.terrain?.data;
        if (!T?.topLayer) return;
        const feet = g.character.group.position.y - PGO * (g.character.size || 1);
        let n = 0;
        for (const c of cells) {
            const ix = Math.round(x) + c.dx, iz = Math.round(z) + c.dz;
            if (T.landMade && !T.landMade(ix, iz)) continue;
            let L = T.floorBelow ? T.floorBelow(ix, iz, Math.floor(feet + 2.5)) : T.topLayer(ix, iz);
            if (!Number.isFinite(L) || Math.abs(L - 0.5 - feet) > 2.5) continue;
            for (let k = 0; k < c.depth; k++, L--) {
                const t = T.get(ix, L, iz);
                if (!(softGround(t) || (any && fistBreaks(t) && t !== BLOCK.BEDROCK))) break;
                if (g.wards?.protects?.(ix, L - 1, iz)) break;
                if (!this._take(T, ix, L, iz, t)) break;
                n++;
            }
        }
        this._dents += n ? 1 : 0;
    }

    // ------------------------------------------------------------------ корпус: сносит стены

    /** (Game._resolveMe, до стен) Корпус монстра сносит построенное и деревья там, где встал; что не ломается — стена. */
    smashAt(p) {
        const g = this.game, ch = g.character, S = ch.size || 1, T = g.terrain?.data;
        if (!T?.get || S < 1.5) return;
        const sm = this._smashAt;
        if (sm && Math.abs(sm.x - p.x) < 0.35 && Math.abs(sm.z - p.z) < 0.35 && Math.abs(sm.y - p.y) < 0.5 && Math.abs(this._smashSize - S) < 0.15) return;
        if (this._budget < 1) return;
        (this._smashAt || (this._smashAt = new THREE.Vector3())).copy(p);
        this._smashSize = S;
        const R = 0.48 * S + 0.35, feet = p.y - PGO * S;
        const now = performance.now();
        if (now - (this._treeAt || 0) > 150) { this._treeAt = now; this._treesAt(p.x, feet + 0.5, feet + 3.5 * S, p.z, R); }
        const L0 = Math.floor(feet + 1.5) + 1, L1 = Math.floor(feet + 3.5 * S + 1.5);
        const x0 = Math.round(p.x - R), x1 = Math.round(p.x + R), z0 = Math.round(p.z - R), z1 = Math.round(p.z + R);
        for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
            const dx = ix - p.x, dz = iz - p.z;
            if (dx * dx + dz * dz > R * R) continue;
            if (T.landMade && !T.landMade(ix, iz)) continue;
            if (T.topLayer && T.topLayer(ix, iz) < L0) continue; // (над этим столбом пусто)
            for (let L = L0; L <= L1; L++) {
                const t = T.get(ix, L, iz);
                if (t === BLOCK.AIR || !bodyBreaks(t)) continue;
                if (g.wards?.protects?.(ix, L - 1, iz)) continue;
                if (this._budget < 1) return;
                this._take(T, ix, L, iz, t);
            }
        }
    }

    /** Настоящие деревья (Trees.js — модели, не блоки): ствол в корпусе или в кулаке — дерево сломано, щепки и листья. */
    _treesAt(x, y0, y1, z, r) {
        const g = this.game, W = g.world;
        if (!W?.trees?.length) return 0;
        let n = 0;
        for (const t of W.trees) {
            if (!t.alive) continue;
            const dx = t.x - x, dz = t.z - z, rr = r + (t.r || 0.5);
            if (dx * dx + dz * dz > rr * rr) continue;
            const ty = t.y ?? 0, th = t.h ?? 6;
            if (ty + th < y0 || ty > y1) continue;
            if (W.forest?.godGift?.(t)) continue;
            W.removeTree(t);
            g.sync?.treeGone?.(t.index ?? t.id);
            const bark = [0x6b4a2e, 0xd9d4ca, 0x5a3d29, 0x6a3a34, 0x3d2b1d][t.kind] ?? 0x6b4a2e;
            const leaf = [0x3f8a30, 0x6a9f3a, 0x2f6238, 0xf2a6c8, 0x335c26][t.kind] ?? 0x3f8a30;
            for (let i = 0; i < 14 && this._debris.length < 120; i++) this._debris.push({ x: t.x + (Math.random() - 0.5) * 2, y: ty + Math.random() * th, z: t.z + (Math.random() - 0.5) * 2, color: i < 6 ? bark : leaf, size: 0.35 + Math.random() * 0.4 });
            n++;
        }
        if (n) { g.sound?.playCrack?.(_w.set(x, y0 + 3, z), 1.4); this._treesBroken = (this._treesBroken || 0) + n; }
        return n;
    }

    // ------------------------------------------------------------------ поднять кусок стены, бросить

    /**
     * Лапа у стены (у земли, у крыши) сжалась в кулак — кусок в ней: до GRAB.MAX блоков в шаре у ладони снимаются из
     * мира (с прочностью зданий: что держалось на них — падает) и идут за рукой, как в настоящей руке (повёрнуты с
     * ладонью). Разжал — куски летят со скоростью руки (резкий взмах — бросок), падают и ложатся блоками там, где
     * упали; по пути бьют тех, в кого попали.
     */
    _grabs(dt) {
        const g = this.game, ch = g.character, T = g.terrain?.data;
        for (const side of ['left', 'right']) {
            const curl = ch.getGripCurl?.(side) || 0, was = this._curl[side];
            this._curl[side] = curl;
            if (this.carry[side]) { if (curl < GRAB.OPEN) this._let(side); continue; }
            if (!(was < GRAB.OPEN && curl >= GRAB.CLOSE) || !T?.get || ch.handLost?.(side)) continue;
            const at = ch.getHandWorldPosition(side, _v);
            this._grab(side, at, T);
        }
    }

    _grab(side, at, T) {
        const g = this.game, ch = g.character;
        const R = GRAB.R, list = [];
        const grip = ch.getGripObject(side);
        grip.updateWorldMatrix(true, false);
        const inv = grip.getWorldQuaternion(new THREE.Quaternion()).invert();
        const cells = [];
        for (let iy = Math.round(at.y - R); iy <= Math.round(at.y + R); iy++) for (let iz = Math.round(at.z - R); iz <= Math.round(at.z + R); iz++) for (let ix = Math.round(at.x - R); ix <= Math.round(at.x + R); ix++) {
            const d2 = (ix - at.x) ** 2 + (iy - at.y) ** 2 + (iz - at.z) ** 2;
            if (d2 <= R * R) cells.push([d2, ix, iy, iz]);
        }
        cells.sort((a, b) => a[0] - b[0]); // (ближние к ладони — первыми)
        for (const [, ix, iy, iz] of cells) {
            if (list.length >= GRAB.MAX) break;
            if (T.landMade && !T.landMade(ix, iz)) continue;
            const L = iy + 1, t = T.get(ix, L, iz);
            if (t === BLOCK.AIR || t === BLOCK.WATER || !fistBreaks(t) || t === BLOCK.BEDROCK) continue;
            if (g.wards?.protects?.(ix, iy, iz) || g.temple?.wards?.(_d.set(ix, iy, iz))) continue;
            const f = (top) => this._col.setHex(T.faceColor ? T.faceColor(t, ix, L, iz, top) : (BASE_COLORS[t] ?? 0x888888));
            const c1 = f(false), sideC = [c1.r, c1.g, c1.b], c2 = f(true), top = [c2.r, c2.g, c2.b];
            if (!this._take(T, ix, L, iz, t, true)) continue;
            list.push({ t, cx: ix, cy: iy, cz: iz, side: sideC, top, off: new THREE.Vector3(ix - at.x, iy - at.y, iz - at.z).applyQuaternion(inv) });
        }
        if (!list.length) return;
        this.carry[side] = list;
        g.sound?.playCrack?.(at, 1.4);
        g.fx.shake = Math.max(g.fx.shake || 0, 0.25);
        g.castleLife?.alarm?.(at, 'uproot', g.localId, 8);
    }

    /** Разжал лапу: куски летят со скоростью ладони. `drop` — просто падают (форма кончилась). */
    _let(side, drop = false) {
        const g = this.game, ch = g.character, list = this.carry[side];
        this.carry[side] = null;
        if (!list) return;
        const grip = ch.getGripObject(side);
        const q = grip.getWorldQuaternion(new THREE.Quaternion());
        const at = ch.getHandWorldPosition(side, new THREE.Vector3());
        const v = drop ? new THREE.Vector3() : (ch.handVelocity?.[side] || new THREE.Vector3()).clone();
        for (const b of list) {
            if (this.flying.length >= GRAB.FLY_MAX) { this._land(b, at.clone().add(b.off.clone().applyQuaternion(q))); continue; }
            b.p = at.clone().add(b.off.applyQuaternion(q));
            b.v = v.clone().add(_w.set((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2));
            b.q = q.clone(); b.spin = new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
            b.ft = 0; // (s in the air)
            this.flying.push(b);
        }
    }

    /** Кусок лёг: блок там, где упал (над тем, во что упал), если там пусто. */
    _land(b, p) {
        const g = this.game, T = g.terrain?.data;
        if (!T?.get) return;
        const ix = Math.round(p.x), iz = Math.round(p.z);
        let L = Math.floor(p.y + 1.5);
        for (let k = 0; k < 6 && T.get(ix, L, iz) !== BLOCK.AIR; k++) L++;
        if (T.get(ix, L, iz) !== BLOCK.AIR || (T.landMade && !T.landMade(ix, iz))) return;
        T.set(ix, L, iz, b.t);
        if (T.get(ix, L, iz) === b.t) this._edits.push([ix, L, iz, b.t]);
    }

    /** Блоки в лапах и в полёте — блоками мира (BlockSwarmFx: тот же шейдер, что у Ground Vortex). */
    _drawBlocks(dt) {
        const g = this.game, ch = g.character;
        const any = this.carry.left || this.carry.right || this.flying.length;
        if (!any && !this._drew) return;
        if (!this.blockFx && g.scene) this.blockFx = new BlockSwarmFx(g.scene);
        const fx = this.blockFx;
        fx?.begin();
        for (const side of ['left', 'right']) {
            const list = this.carry[side];
            if (!list) continue;
            const grip = ch.getGripObject(side);
            const q = grip.getWorldQuaternion(this._gq || (this._gq = new THREE.Quaternion()));
            const at = ch.getHandWorldPosition(side, _v);
            for (const b of list) fx?.add(b, _w.copy(b.off).applyQuaternion(q).add(at), q, 1);
        }
        const T = g.terrain?.data, G = 20;
        for (let i = this.flying.length - 1; i >= 0; i--) {
            const b = this.flying[i];
            b.ft += dt;
            b.v.y -= G * dt;
            b.p.addScaledVector(b.v, dt);
            _d.copy(b.spin).multiplyScalar(dt);
            b.q.multiply(this._sq.setFromEuler(this._se.set(_d.x, _d.y, _d.z)));
            const sp = b.v.length();
            if (sp > GRAB.HIT_SPEED) this._flyHit(b, sp);
            const t = T?.get ? T.get(Math.round(b.p.x), Math.floor(b.p.y + 1.5), Math.round(b.p.z)) : 0;
            if ((t !== BLOCK.AIR && t !== BLOCK.WATER) || b.ft > 8 || b.p.y < -60) {
                this._land(b, b.p.clone().setY(b.p.y + 0.5));
                this.flying.splice(i, 1);
                continue;
            }
            fx?.add(b, b.p, b.q, 1);
        }
        fx?.end();
        this._drew = !!any;
    }

    /** Брошенный кусок по существу на пути: урон и толчок (как удар). */
    _flyHit(b, sp) {
        if ((b._hitT || 0) > b.ft) return;
        const g = this.game;
        for (const c of this._targets()) {
            if (c.isDead || c.dead) continue;
            const cp = c.group?.position || c.position;
            if (!cp) continue;
            const big = c.isDragon || c.isBoss ? 5 : 1.4;
            if ((cp.x - b.p.x) ** 2 + (cp.z - b.p.z) ** 2 > big * big || Math.abs(cp.y - b.p.y) > big + 1.5) continue;
            const dir = b.v.clone().setY(0).normalize();
            if (c.isDragon) g.dragons?.hit?.(c, GRAB.HIT_DMG, 'thrown', g.localId);
            else g.onLocalHit?.(c, GRAB.HIT_DMG, dir, false, null);
            const ck = kindOf(c);
            if (ck && g.authority !== false) g.creatureImpact?.apply?.(c, { v: dir.multiplyScalar(Math.min(30, sp)).setY(6), by: g.localId, kind: 'thrown', fly: true });
            b._hitT = b.ft + 0.5;
            b.v.multiplyScalar(0.4);
            return;
        }
    }

    // ------------------------------------------------------------------ кулаки

    _targets() {
        const g = this.game, out = this._tl || (this._tl = []);
        out.length = 0;
        const add = (l) => { if (l) for (const c of l) out.push(c); };
        add(g.zombies); add(g.combat?.enabled ? g.combat.meleeTargets?.() : null); add(g.animals?.targets?.()); add(g.spiders?.targets?.());
        add(g.dragons?.targets?.()); add(g.phoenixes?.targets?.()); add(g.castleLife?.targets?.()); add(g.livingTrees?.targets?.());
        add(g.ships?.crew?.targets?.()); add(g.owls?.targets?.()); add(g.iceCastle?.targets?.());
        return out;
    }

    _fists(dt) {
        const g = this.game, ch = g.character;
        for (const side of ['left', 'right']) {
            this._fist[side] = Math.max(0, this._fist[side] - dt);
            if (this._fist[side] > 0 || ch.handLost?.(side) || this.carry[side]) continue;
            // (the hand's own speed against the body — a run carries both hands along, that is no blow — in metres: ×size)
            const rel = ch.handRelVelocity?.[side];
            if (!rel) continue;
            ch.group.getWorldQuaternion(this._q || (this._q = new THREE.Quaternion()));
            const vel = this._vel || (this._vel = new THREE.Vector3());
            vel.copy(rel).applyQuaternion(this._q).multiplyScalar(ch.size || 1);
            const speed = vel.length(), pow = fistPower(speed);
            if (pow <= 0) continue;
            const fist = (ch.getGripCurl?.(side) || 0) > 0.45;
            const at = ch.getHandWorldPosition(side, _v);
            const dir = _d.copy(vel).normalize();
            const hit = this._punchCreatures(at, dir, pow, fist) + this._punchBlocks(at, dir, pow, fist);
            if (hit) {
                this._fist[side] = FIST.COOLDOWN;
                g.fx.shake = Math.max(g.fx.shake || 0, 0.2 + 0.3 * pow);
            }
        }
    }

    /** Кулак по существам рядом с ним (FIST_TARGETS). @returns сколько попало */
    _punchCreatures(at, dir, pow, fist) {
        const g = this.game, me = g.localId, S = g.character.size || 1;
        let n = 0;
        for (const c of this._targets()) {
            if (c.isDead || c.dead) continue;
            const cp = c.group?.position || c.position;
            if (!cp) continue;
            const big = c.isDragon || c.isBoss ? 6 : 1.4;
            const dx = cp.x - at.x, dz = cp.z - at.z, dy = cp.y - at.y;
            const reach = FIST.REACH * (S / MONSTER.SCALE) + big;
            if (dx * dx + dz * dz > reach * reach || Math.abs(dy) > reach + 2.5) continue;
            const row = c.isPlayer ? FIST_TARGETS.player : c.isDragon ? FIST_TARGETS.dragon : c.isBoss ? FIST_TARGETS.spider : c.isIce ? FIST_TARGETS.ice
                : c.isPhoenix ? FIST_TARGETS.phoenix : c.isOwl ? FIST_TARGETS.owl : c.isLivingTree ? FIST_TARGETS.tree : c.isSailor ? FIST_TARGETS.sailor
                : c.isAnimal ? FIST_TARGETS.animal : c.isVillager ? FIST_TARGETS.villager : FIST_TARGETS.zombie;
            const dmg = Math.round(row.dmg * pow * (fist ? 1 : 0.5));
            const flat = _w.set(dir.x, 0, dir.z);
            if (flat.lengthSq() < 1e-6) flat.set(dx, 0, dz);
            flat.normalize();
            if (c.isDragon) g.dragons?.hit?.(c, dmg, 'fist', me); // (обида дракона — Dragons.hit → _anger)
            else g.onLocalHit?.(c, dmg, flat.clone(), false, c.isVillager ? { hard: true } : null);
            // толчок: вверх и прочь — существо отлетает (масса — CREATURE_BODY)
            if (row.push > 0) {
                const ck = kindOf(c);
                const imp = flat.clone().multiplyScalar(row.push * pow).setY(row.push * pow * 0.45);
                if (ck && g.authority !== false) g.creatureImpact?.apply?.(c, { v: imp, by: me, kind: 'punch', toss: 6 * pow, fly: true });
                else if (ck) g.sync?.creatureStrike?.({ ck, id: c.id, k: 'punch', i: imp.toArray().map(r2) });
            }
            n++;
            if (n >= 3) break;
        }
        if (n) g.sound?.playHit?.();
        return n;
    }

    /** Кулак по блокам: шар у кулака (меньше — открытая ладонь). @returns сколько снято */
    _punchBlocks(at, dir, pow, fist) {
        const g = this.game, T = g.terrain?.data;
        if (!T?.get) return 0;
        const R = FIST.BLOCK_R * (fist ? 1 : 0.6) * (0.6 + 0.4 * pow);
        const c = _w.copy(at).addScaledVector(dir, 0.8);
        let n = 0, max = Math.round(FIST.BLOCKS_MAX * pow);
        const x0 = Math.round(c.x - R), x1 = Math.round(c.x + R), z0 = Math.round(c.z - R), z1 = Math.round(c.z + R);
        const y0 = Math.round(c.y - R), y1 = Math.round(c.y + R);
        let solid = false;
        for (let iy = y0; iy <= y1 && n < max; iy++) for (let iz = z0; iz <= z1 && n < max; iz++) for (let ix = x0; ix <= x1 && n < max; ix++) {
            const dx = ix - c.x, dy = iy - c.y, dz = iz - c.z;
            if (dx * dx + dy * dy + dz * dz > R * R) continue;
            if (T.landMade && !T.landMade(ix, iz)) continue;
            const L = iy + 1, t = T.get(ix, L, iz);
            if (t === BLOCK.AIR || t === BLOCK.WATER) continue;
            solid = true;
            if (!fistBreaks(t) || g.wards?.protects?.(ix, iy, iz)) continue;
            if (g.temple?.wards?.(_d.set(ix, iy, iz))) { g.temple.wardHit?.(_d, 2); continue; } // (дар богов: золотая защита)
            if (this._take(T, ix, L, iz, t, true)) n++;
        }
        n += this._treesAt(c.x, c.y - R, c.y + R, c.z, R);
        if (n) g.sound?.playCrack?.(c, 1.2);
        else if (solid) { g.sound?.playLand?.(0.8); return 1; } // (неразрушимое: кулак упёрся)
        return n;
    }

    // ------------------------------------------------------------------ блоки: снять, отправить, обломки

    /** Снять блок (data.set сам не тронет дар богов и заколдованный камень). true — снят. */
    _take(T, ix, L, iz, t, free = false) {
        T.set(ix, L, iz, BLOCK.AIR);
        if (T.get(ix, L, iz) !== BLOCK.AIR) return false;
        if (!free) this._budget -= 1;
        this._edits.push([ix, L, iz, BLOCK.AIR]);
        if (this._debris.length < 120) this._debris.push({ x: ix, y: L - 1, z: iz, color: BASE_COLORS[t] ?? 0x8a7a6a, size: 0.6 + Math.random() * 0.3 });
        if (isCastleBlock(t)) { this._castle++; (this._castleAt || (this._castleAt = new THREE.Vector3())).set(ix, L - 1, iz); }
        return true;
    }

    _flushEdits() {
        const g = this.game, E = this._edits;
        if (!E.length) return;
        const T = g.terrain?.data;
        const holes = E.map(([x, L, z]) => ({ x, y: L - 1, z }));
        for (const f of T?._flood?.(holes) || []) E.push([f[0], f[1], f[2], BLOCK.WATER]);
        g.builder?._sendEdits?.(E.slice(), true); // (прочность зданий: что потеряло опору — падает цепочкой)
        const p = g.character.group.position;
        if (this._debris.length) g.fx?.debrisFrom?.(this._debris, _v.set(p.x, p.y - PGO * (g.character.size || 1) + 4, p.z), 80);
        if (this._castle) {
            g.castleLife?.damaged?.(this._castleAt, g.localId, this._castle, true, { kind: 'monster' });
            g.castleLife?.breakWays?.(this._castleAt, 10);
        }
        if (E.length > 6) g.sound?.playCollapse?.(this._castleAt || p, E.length);
        E.length = 0; this._debris.length = 0; this._castle = 0;
    }

    /** После обратного превращения: человек не в потолке и не в земле — туда, где помещается. */
    _unstick() {
        const g = this.game, ch = g.character, p = ch.group.position, col = g.collision, T = g.terrain?.data;
        if (!col || !T?.solidIn) return;
        const fits = (x, feet, z) => !T.solidIn(Math.round(x), Math.round(z), Math.floor(feet + 1.5), Math.floor(feet + 3.5 + 1.5 - 1e-3)) && !col.pointBlocked?.(x, feet + 2.0, z);
        const floor = (x, z, fromY) => {
            const L = T.floorBelow ? T.floorBelow(Math.round(x), Math.round(z), Math.floor(fromY + 1.5)) : T.topLayer(Math.round(x), Math.round(z));
            return Number.isFinite(L) && L > -1e6 ? L - 0.5 : null;
        };
        const s = freeSpot(fits, floor, p.x, p.y - PGO, p.z);
        if (s) { p.set(s.x, s.y + PGO, s.z); ch.verticalVelocity = 0; }
        g._lastFree?.copy?.(p);
    }

    // ------------------------------------------------------------------ сеть

    /** Поза: [размер, превращение 0…1, рёв 0…1] (у других игроков — та же модель масштабом). */
    netFlag() {
        if (!this.phase) return undefined;
        const ch = this.game.character;
        return [r2(ch.size || 1), r2(this.look?.beast ?? 0), r2(this.roar)];
    }

    dispose() {
        if (this.phase) this._finish('exit');
        for (const b of this.flying.splice(0)) this._land(b, b.p);
        this._flushEdits();
        this.blockFx?.dispose(); this.blockFx = null;
        this.look?.dispose();
        this.look = null;
    }
}

/** (RemoteAvatar) Другой игрок в форме монстра: `mo` из его позы → модель на его костях, масштаб группы. */
export function applyRemoteMonster(avatar, mo, dt = 1 / 60) {
    const ch = avatar.character;
    if (!ch) return;
    if (!mo) {
        if (avatar._monster?.on) avatar._monster.setOn(false);
        if ((ch.size || 1) !== 1) ch.setSize(1);
        return;
    }
    const [size, beast, roar] = mo;
    ch.setSize(size || 1);
    if (!avatar._monster) avatar._monster = new MonsterLook(ch);
    avatar._monster.setOn(beast > 0.1);
    avatar._monster.update(dt, beast, roar);
}
