/**
 * PotionLair.js — «Логово зельевара» (Творческий, «Где появиться»): игровая часть. План зала — src/world/PotionLairPlan.js (чистый).
 *
 * Что здесь: перенос героя (виснет над залом, пока воркеры несут землю → зал строится блоками по кусочку за кадр → котёл с водой и огнём,
 * вещи на полках → герой встаёт у входа), свет (комната «освещённая», но затемнённая: Game берёт `darkness()`), котёл над костром
 * (костёр держится, пока его не потушили «Firefighting»: тогда вода потихоньку остывает — Cauldrons), «бесконечные» полки (взяли вещь —
 * на её место через пару секунд ложится такая же: это песочница для зелий).
 *
 * Что может пойти не так (учтено):
 *  - земля зала ещё не принесена воркерами → герой ждёт в воздухе (до 40 с), потом возвращается туда, откуда его взяли (с причиной);
 *  - зал уже построен (повторный вход, загрузка) → метка очага найдена, блоки не строятся заново, котёл/костёр/вещи достраиваются;
 *  - сохранение хранит только последние правки блоков, поэтому зал строится ЗАНОВО при каждом выборе «Логово зельевара» (если метки нет);
 *    котёл и вещи без зала не висят: их ставят только когда метка очага есть;
 *  - гость в чужом мире (не хозяин) → не строит (блоки через сеть не шлём): «только в своём мире»;
 *  - потушили костёр / вылили воду / взяли все колбы → ничего не чиним сами, кроме полок (вещи возвращаются) и воды при повторном входе;
 *  - герой умер или вышел во время стройки → стройка доделывается без него (зал целиком), состояние сбрасывается;
 *  - дуэль/арена/космос/ад — «Где появиться» ведёт только из своего места: зал в небе Земли; вне Земли не строим.
 */

import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';
import { LAIR, layout } from '../world/PotionLairPlan.js';
import { INGREDIENT_RU, RECIPES, CAULDRON, newBrew } from './Potions.js';
import { newUid } from './ItemTypes.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export const LAIR_RULES = {
    WAIT_MAX: 40, // с ждать землю
    SLICE: 2600, // блоков за кадр
    KEEP_R: 70, // м от зала: полки и огонь поддерживаются
    FIRE_LEFT: 420, // с, на сколько подкидывается костёр, пока он горит (потушили — не разжигаем)
    DARK: 0.5, // насколько затемнён зал (0 — день, 1 — глубокая пещера): «светло, но затемнено»
    REFILL_EVERY: 2, // с
    REFILL_DELAY: 2.5, // с: пустое место ждёт, прежде чем получить новую вещь (чтобы вещь в руке успели рассмотреть)
    HOVER: 8, // м над полом
};

/** Ингредиенты мира (всё, что можно бросить в котёл): без свитка и рыбы (не вещи). */
export function lairIngredients() {
    const set = new Set([...Object.keys(INGREDIENT_RU), ...RECIPES.flatMap((r) => Object.keys(r.ingredients))]);
    for (const k of ['scroll', 'fish']) set.delete(k);
    return [...set].sort();
}

/** Цвет зелья по номеру рецепта: ровно по кругу тонов, видно издали. */
export function potionColor(i, n) {
    const c = new THREE.Color().setHSL((i / Math.max(1, n)) % 1, 0.7, 0.62);
    return c.getHex();
}

/** Что лежит на каком месте: слоты плана → [{slot, item}…] (вещи — шаблоны без uid). */
export function stockFor(slots) {
    const ing = lairIngredients(), out = [];
    ing.forEach((k, i) => slots.ing[i] && out.push({ slot: slots.ing[i], item: { kind: k } }));
    RECIPES.forEach((r, i) => slots.potion[i] && out.push({ slot: slots.potion[i], item: { kind: 'potion', rec: r.id, color: potionColor(i, RECIPES.length) } }));
    slots.flask.forEach((s) => out.push({ slot: s, item: { kind: 'flask', count: 1 } }));
    return out;
}

export class PotionLair {
    constructor(game) {
        this.game = game;
        this.state = null; // { phase: 'wait'|'build'|'place', t, origin, plan, i }
        this.plan = null;
        this.stock = null;
        this._t = 0;
        this._emptyAt = new Map(); // слот → когда увидели пустым
        this._chkT = 0;
        this._hooked = false;
        this.inLair = false;
        this.rect = null;
    }

    get on() { return this.game.config?.mode === 'creative'; }
    get data() { return this.game.world?.terrain?.data || null; }
    get cx() { return LAIR.CX; }
    get cz() { return LAIR.CZ; }
    get auth() { return this.game.authority !== false; }

    // ------------------------------------------------------------------ вход («Где появиться»)
    /** → true: перенос начался. false: нельзя (причина в `why`). */
    start() {
        const g = this.game;
        this.why = '';
        if (!this.on) { this.why = 'только в Творческом режиме'; return false; }
        if (!this.auth) { this.why = 'логово можно построить только в своём мире (не гостем)'; return false; }
        if (!this.data) { this.why = 'мир ещё не готов'; return false; }
        if (this.state) return true;
        this._hook();
        this.game.potionMaster?.reset(); // (the master stands up again and drops any old work)
        this.state = { phase: 'wait', t: 0, origin: g.character.group.position.clone(), i: 0 };
        return true;
    }

    /** Свет «комнаты»: зал считается освещённым помещением, а не тёмной пещерой (Game: litLand → built; HouseMagic._hookLight — тот же приём). */
    _hook() {
        const data = this.data;
        if (!data || data._lairLit) return;
        data._lairLit = true;
        const R = { x0: LAIR.CX + (-LAIR.A - LAIR.SHELL - 1), x1: LAIR.CX + LAIR.A + LAIR.SHELL + 1, z0: LAIR.CZ - LAIR.B - LAIR.SHELL - 1, z1: LAIR.CZ + LAIR.B + LAIR.SHELL + 1 };
        this.rect = R;
        const prev = data.litLand;
        data.litLand = (x, z) => (prev?.(x, z)) || (x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1);
        const prevS = data._litPair === prev ? data.litShapes : null;
        data.litShapes = (x0, z0, x1, z1, out) => {
            prevS?.(x0, z0, x1, z1, out);
            if (R.x1 >= x0 && R.x0 <= x1 && R.z1 >= z0 && R.z0 <= z1) out.push(R);
            return out;
        };
        data._litPair = prev && !prevS ? null : data.litLand;
    }

    /** Герой в зале (по границам и высоте): свет затемняется. */
    inside(p) {
        if (!this.rect) return false;
        return p.x >= this.rect.x0 && p.x <= this.rect.x1 && p.z >= this.rect.z0 && p.z <= this.rect.z1 && p.y > LAIR.F - 4 && p.y < LAIR.F + 22;
    }

    darkness() { return this.inLair ? LAIR_RULES.DARK : 0; }

    _built() {
        const d = this.data;
        return !!d && d.landMade(LAIR.CX, LAIR.CZ) && d.get(LAIR.CX + LAIR.MARKER.x, LAIR.F, LAIR.CZ + LAIR.MARKER.z) === BLOCK.COBBLE;
    }

    // ------------------------------------------------------------------ по кадру
    update(dt) {
        const g = this.game;
        if (!this.on || !this.data) return;
        this._t += dt;
        const me = g.character?.group.position;
        if (me) this.inLair = this.inside(me) && !!this.rect;
        if (me && this.plan?.torches && Math.hypot(me.x - LAIR.CX, me.z - LAIR.CZ) < LAIR_RULES.KEEP_R && this._built()) this._flames(dt, me);
        const s = this.state;
        if (s) { this._step(s, dt); return; }
        if (!this.plan) return;
        // поддержка: полки, огонь (пока рядом)
        this._chkT -= dt;
        if (this._chkT > 0 || !me || Math.hypot(me.x - LAIR.CX, me.z - LAIR.CZ) > LAIR_RULES.KEEP_R) return;
        this._chkT = LAIR_RULES.REFILL_EVERY;
        if (this._built()) { const cc = this.game.cauldrons?.list.get('potion_lair_cauldron'); if (cc) cc.fixed = true; this._feedFire(); this.game.potionMaster?.ensure(); const k = this._shelves(this._fresh); if (k > 0) this._chkT = 0.2; else this._fresh = false; } // (идёт наполнение — следующая порция скоро)
    }

    /** Факелы: пламя рисуют искры (мягкие светящиеся точки из общего пула), свет — три ближайших огня (FireLights.want: новых ламп нет). */
    _flames(dt, me) {
        const g = this.game, fx = g.fx;
        const T = this.plan.torches, v = _v, w = _w;
        this._flameT = (this._flameT || 0) + dt;
        for (const t of T) {
            const x = LAIR.CX + t.x, z = LAIR.CZ + t.z, d = Math.hypot(x - me.x, z - me.z);
            if (d > 48) continue;
            const flick = 0.75 + 0.25 * Math.sin(this._t * 11 + x * 1.7 + z) + 0.1 * Math.sin(this._t * 27 + z);
            g.fireLights?.want(x, t.y, z, 0.55 * flick);
            if (!fx?.spark || d > 34) continue;
            // (пламя: ~14 искр в секунду на факел, в двух цветах — жёлтое ядро и оранжевый язык)
            const n = dt * 14 + (Math.random() < (dt * 14) % 1 ? 1 : 0);
            for (let i = 0; i < Math.floor(n); i++) {
                v.set(x + (Math.random() - 0.5) * 0.35, t.y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.35);
                w.set((Math.random() - 0.5) * 0.25, 1.1 + Math.random() * 1.1, (Math.random() - 0.5) * 0.25);
                fx.spark(v, i % 3 ? 0xff8a20 : 0xffd36a, 0.16 + Math.random() * 0.1, w, 0.45 + Math.random() * 0.25);
            }
        }
    }

    _step(s, dt) {
        const g = this.game, d = this.data, me = g.character.group.position;
        s.t += dt;
        const hold = () => { me.set(LAIR.CX, LAIR.F + LAIR_RULES.HOVER, LAIR.CZ + 2); g.character.verticalVelocity = 0; g.knockback?.set?.(0, 0, 0); };
        if (g.combat?.dead || g.isDeadLocal) { this.state = null; return; }
        if (s.phase === 'wait') {
            hold();
            const R = LAIR.A + LAIR.SHELL + 4, Rz = LAIR.B + LAIR.SHELL + 4;
            const ready = [[0, 0], [R, Rz], [-R, Rz], [R, -Rz], [-R, -Rz]].every(([x, z]) => d.landMade(LAIR.CX + x, LAIR.CZ + z));
            if (!ready) { if (s.t > LAIR_RULES.WAIT_MAX) this._fail('земля зала не загрузилась'); return; }
            if (!this.plan) this.plan = layout();
            if (this._built()) { s.phase = 'place'; return; }
            s.phase = 'build'; s.i = 0;
            return;
        }
        if (s.phase === 'build') {
            hold();
            const B = this.plan.blocks, end = Math.min(B.length, s.i + LAIR_RULES.SLICE);
            for (; s.i < end; s.i++) { const b = B[s.i]; d.set(LAIR.CX + b[0], b[1], LAIR.CZ + b[2], b[3], b[4]); }
            if (s.i >= B.length) {
                this._dirty();
                s.phase = 'place'; s.t = 0;
            }
            return;
        }
        if (s.phase === 'place') {
            hold();
            if (s.t < 0.4) return; // (блоки ушли в воркеры: хоть один кадр на сборку)
            this._objects();
            this._arrive();
            this.state = null;
        }
    }

    _dirty() {
        const d = this.data, R = this.rect;
        if (!d?._markDirty || !R) return;
        for (let x = R.x0; x <= R.x1 + 8; x += 8) for (let z = R.z0; z <= R.z1 + 8; z += 8) d._markDirty(Math.min(x, R.x1), Math.min(z, R.z1));
    }

    _fail(why) {
        const g = this.game, s = this.state;
        this.state = null;
        if (s?.origin) { g.character.group.position.copy(s.origin); g.character.verticalVelocity = 0; }
        g.hud?.toast?.(`📍 «Логово зельевара»: ${why} — вы там, откуда начали`);
    }

    /** Герой встаёт у входа лицом к котлу. */
    _arrive() {
        const g = this.game, d = this.data, h = LAIR.HERO;
        const x = LAIR.CX + h.x, z = LAIR.CZ + h.z;
        g.character.group.position.set(x, LAIR.F - 0.5 + PLAYER_GROUND_OFFSET + 0.1, z); // (surfaceY would give the roof: the floor is layer F)
        g.faceYaw?.(0); // (лицом на север, к котлу: −Z)
        g.character.verticalVelocity = 0;
        g.knockback?.set?.(0, 0, 0);
        g.heroApply?._upright?.();
        g.potionMaster?.greet(); // (he says hello when he is seated: PotionMasterLife.update)
        g.hud?.toast?.('🧪 Логово зельевара: на полках — все ингредиенты, колбы и по зелью каждого вида. «Fire» на котёл — разжечь, «Firefighting» — потушить');
    }

    // ------------------------------------------------------------------ котёл, огонь, полки
    _objects() {
        const g = this.game;
        const cx = LAIR.CX + LAIR.CAULDRON.x, cz = LAIR.CZ + LAIR.CAULDRON.z, y = LAIR.F - 0.5;
        const st = { ...newBrew(), phase: 'water', water: CAULDRON.FULL, heat: 1 };
        if (!g.cauldrons.list.has('potion_lair_cauldron')) g.cauldrons.spawn({ id: 'potion_lair_cauldron', x: cx, y, z: cz, yaw: 0, st });
        const cc = g.cauldrons.list.get('potion_lair_cauldron');
        if (cc) cc.fixed = true; // (fastened on its holder over the fire: no «Левиоса», no pushing, no blast moves it)
        const fire = this._fire(cx, cz);
        if (!fire) { const f = g.campfires?.kindle(cx, y, cz); if (f) f.left = LAIR_RULES.FIRE_LEFT; }
        this._chkT = 0; this._fresh = true; // (полки наполняются порциями — update)
    }

    _fire(cx, cz) {
        for (const f of this.game.campfires?.list.values() || []) if (Math.hypot(f.x - cx, f.z - cz) < 1.2) return f;
        return null;
    }

    /** Пока костёр горит — он не гаснет сам (потушили заклинанием — остаётся потушенным). */
    _feedFire() {
        const f = this._fire(LAIR.CX + LAIR.CAULDRON.x, LAIR.CZ + LAIR.CAULDRON.z);
        if (f && f.left > 0 && f.left < LAIR_RULES.FIRE_LEFT * 0.5) f.left = LAIR_RULES.FIRE_LEFT;
    }

    /** Вещи с полок, оказавшиеся на полу зала (скатились в прежней версии / сохранены в мире), убираются при наполнении: на полках им место. */
    _sweepFloor() {
        const items = this.game.items, R = this.rect;
        if (!items?.loose || !R) return;
        for (const [uid, L] of [...items.loose]) {
            const p = L.model?.position;
            if (!L.item?.lair || !p || p.x < R.x0 || p.x > R.x1 || p.z < R.z0 || p.z > R.z1) continue;
            if (p.y < LAIR.F + 0.4 && !L.inCaul && !L.hover) items.removeLoose(uid);
        }
    }

    /** Полки: пустое место получает такую же вещь (после REFILL_DELAY); первый раз — сразу. */
    _shelves(first = false) {
        let n = 0;
        const g = this.game, items = g.items, d = this.data;
        if (!items?.loose || !this.plan) return 0;
        if (!this.stock) this.stock = stockFor(this.plan.slots);
        // (что лежит где: по клетке — высоты вещей в ней)
        const cell = new Map();
        for (const L of items.loose.values()) {
            const p = L.model?.position;
            if (!p) continue;
            const k = Math.round(p.x) + ',' + Math.round(p.z);
            (cell.get(k) || cell.set(k, []).get(k)).push(p.y);
        }
        const pos = new THREE.Vector3();
        if (first) this._sweepFloor();
        for (const e of this.stock) {
            const sx = LAIR.CX + e.slot.x, sz = LAIR.CZ + e.slot.z;
            if (!d.landMade(sx, sz)) continue;
            // (вещь лежит на доске: в её клетке, от доски до метра над ней)
            const ys = cell.get(Math.round(sx) + ',' + Math.round(sz));
            const here = !!ys && ys.some((y) => y > e.slot.y - 0.3 && y < e.slot.y + 1.2);
            const id = sx + ',' + sz + ',' + e.slot.y;
            if (here) { this._emptyAt.delete(id); continue; }
            if (!first) {
                const t0 = this._emptyAt.get(id);
                if (t0 == null) { this._emptyAt.set(id, this._t); continue; }
                if (this._t - t0 < LAIR_RULES.REFILL_DELAY) continue;
            }
            this._emptyAt.delete(id);
            if (++n > 12) break; // (по несколько за кадр: модели вещей не делаются все разом)
            // (стоит на доске сразу и неподвижно: падая с 0,3 м, круглые вещи — золотое яблоко — скатывались с края доски на пол, и полка казалась пустой, а мест «пусто» — вещи сыпались снова)
            const L0 = items.spawnLoose({ ...e.item, uid: newUid(), lair: 1 }, pos.set(sx, e.slot.y + 0.1, sz), { broadcast: false });
            if (L0) { L0.rest = true; L0.vel?.set(0, 0, 0); L0.spin?.set(0, 0, 0); }
        }
        return n;
    }

    dispose() { this.state = null; }
}
