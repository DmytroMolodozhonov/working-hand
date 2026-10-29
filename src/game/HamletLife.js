/**
 * HamletLife.js — the life of the hamlets (src/world/Hamlets.js): the lone wizard's house, the hermit's
 * hut, the small villages of wizards and of ordinary folk. A part of CastleLife: the people are castle
 * people of the hamlet's site (blows, spells, fear, talk, the network, the dead stay dead — all as in a
 * castle); here only what is the hamlets' own:
 *
 *  - who lives there (hamletRoster): a lone wizard / a hermit; in a wizards' village weak and middling
 *    wizards (the author: 60 % of the world's wizards are weak, 35 % middling, 5 % strong — the strong
 *    ones never live in a hamlet; every seller is weak) and 3–4 sellers of magic things; in a folk
 *    village farmers and builders and one watchman;
 *  - the day: the sellers at their stalls, the farmers in the fields, the watchman about the fire,
 *    the others come out of their houses and walk about (CastleLife._crowd);
 *  - the night (NightLife._castle): most go home to bed, but somebody keeps watch even here — the
 *    watchman with a torch, in a wizards' village a wizard with «Люмос» walking round the fire;
 *  - the round fire in the middle of a village: a real campfire (Campfires.js) while a player is near —
 *    its people keep it burning; out of everybody's reach it goes out (nothing is kept far away);
 *  - the lone wizard's house stands under «Protection House» (HouseWards.js): a sphere only he may
 *    pass (players, zombies, animals… are held off; spells from outside stop at it). Broken (Bombardo,
 *    Total Destruction…) or its wizard dead — it is gone for good (WARD_DOWN in the site's saved state).
 *  - what the wizards' sellers sell (magicStallGood): scrolls, flasks, crystals, now and then a wand.
 *
 * «На кого и на что»: the people are villagers / wizards (CastleLife, WizardLife: every spell and blow
 * that works on castle people works on them); their houses are blocks of the world (blasts, fire,
 * Levitation Maxima…) and the builders' Rebuild does not come here (no castle builders so far away).
 * The host decides everything; the guests see the people (CastleLife net), the fire (Campfires net)
 * and the sphere (HouseWards net).
 */

import { createRng } from '../core/math.js';
import { rollMana } from './WizardAI.js';
import { CAMPFIRE } from './Campfires.js';
import { newUid } from './ItemTypes.js';
import { settlePawn } from '../world/PawnStall.js';
import { rollShopScroll, scrollShopPrice } from './WizardShop.js';

/** A marker in the site's `killed` set (saved with the world): the lone wizard's sphere is gone for good. */
export const WARD_DOWN = -9;
export const HAMLET_LIFE = {
    WARD_R: 13, // m: the lone wizard's sphere (the house and its garden)
    FIRE_KEEP: 10, // s between the fire's wood checks
    FIRE_AGAIN: 90, // s: put out by a player — lit again after this
    WEAK: 0.63, // of the hamlets' wizards: weak (60 : 35 of the world's weak and middling)
};

const MALE = ['Альвин', 'Бертран', 'Гвидо', 'Дамиан', 'Корнелий', 'Лаврентий', 'Мартин', 'Ноэль', 'Орест', 'Родион', 'Северин', 'Тристан', 'Ульрих', 'Эмиль', 'Яромир', 'Добромир'];
const FEMALE = ['Агата', 'Бланка', 'Виола', 'Гелена', 'Дарина', 'Илона', 'Лорелея', 'Мелисса', 'Нимуэ', 'Ривка', 'Сабина', 'Тамара', 'Эвелина', 'Ясмина', 'Лада', 'Мирослава'];
const FOLK_M = ['Иван', 'Фёдор', 'Степан', 'Яков', 'Тимофей', 'Матвей', 'Захар', 'Остап', 'Мирон', 'Демьян', 'Игнат', 'Кузьма', 'Прохор', 'Ефим'];
const FOLK_F = ['Мария', 'Анна', 'Дарья', 'Агафья', 'Марфа', 'Ульяна', 'Аксинья', 'Пелагея', 'Олеся', 'Любава', 'Варвара', 'Фёкла'];

function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/**
 * Who is person number `idx` of a hamlet (always the same, on every computer): 1…knights the watchman,
 * then the sellers (one a stall), then the people of the houses (each house gets its own).
 */
export function hamletRoster(def, idx) {
    const seed = (strHash(def.id) ^ Math.imul(idx + 1, 2654435761)) >>> 0;
    const rng = createRng(seed);
    const S = def.stalls.length, K = def.knights | 0, H = def.houses.length;
    const first = K + 1 + S;
    const female = rng() < (idx >= 1 && idx <= K ? 0.1 : 0.45);
    if (def.mage) {
        const seller = idx >= 1 && idx <= S;
        const role = seller ? 'seller' : 'mage';
        const name = (female ? FEMALE : MALE)[Math.floor(rng() * (female ? FEMALE : MALE).length)];
        // (a wizards' village: def.homes — the house of every one living there, sellers first; past them the strangers, homeless)
        const stranger = !!def.homes && idx > def.homes.length;
        const home = def.homes ? (stranger ? -1 : def.homes[idx - 1]) : !H ? -1 : seller ? (idx - 1) % H : ((idx - first) % H + H) % H;
        const brave = rng();
        const robe = rng() < 0.15;
        const rr = createRng((seed ^ strHash('rank:' + String(def.wseed ?? ''))) >>> 0);
        // (the author: weak or middling only; every seller weak)
        const rank = seller || rr() < HAMLET_LIFE.WEAK ? 'novice' : 'adept';
        const mana = rollMana(rank, rr);
        return { idx, role, female, name, home, stall: seller ? idx - 1 : -1, seed, brave, wizard: true, robe, rank, mana, ...(stranger ? { stranger: true } : {}) };
    }
    const watch = idx >= 1 && idx <= K;
    // (generation 11: a folk village's shops — the smithy, the bakery, the tavern, the herbalist — have their merchants, who live there)
    const shop = !watch && idx > K && idx <= K + S ? idx - K - 1 : -1;
    const role = watch ? 'knight' : shop >= 0 ? 'merchant' : def.type === 'hermit' ? 'farmer' : rng() < 0.55 ? 'farmer' : 'builder';
    const name = (female ? FOLK_F : FOLK_M)[Math.floor(rng() * (female ? FOLK_F : FOLK_M).length)];
    const home = !H ? -1 : watch ? 0 : shop >= 0 ? (def.stalls[shop].houseOf ?? 0) : ((idx - first) % H + H) % H;
    return { idx, role, female, name, home, stall: shop, seed, hermit: def.type === 'hermit', watchman: watch };
}

/** The k-th of 3 things on a wizards' seller's counter (n: a roll that changes now and then): {item, price}. */
export function magicStallGood(n, k) {
    const r = createRng(((n * 2654435761) ^ (k * 40503)) >>> 0);
    const thing = (kind, count = 1) => ({ kind, uid: newUid(), count });
    if (k === 0) {
        const it = rollShopScroll(r);
        return { item: it, price: Math.round((scrollShopPrice(it) || 100) * 0.9) };
    }
    if (k === 1) return r() < 0.6 ? { item: thing('flask', 3), price: 15 } : { item: thing('crystal'), price: 70 };
    const x = r();
    if (x < 0.15) return { item: { kind: 'wand', uid: newUid(), plain: true, model: 0, color: 0x6b4426, dir: null, fav: null, power: 0 }, price: 120 };
    if (x < 0.55) return { item: thing('crystal'), price: 70 };
    return { item: thing('apple'), price: 35 };
}

export class HamletLife {
    constructor(life) {
        this.life = life;
        this.game = life.game;
        this._t = 0;
        this.log = []; // (tests) what happened, the last few
    }

    get auth() { return this.game.authority; }

    _log(o) { this.log.push(o); if (this.log.length > 40) this.log.shift(); }

    // ---------------------------------------------------------- wake / sleep (host)
    /** (host, CastleLife._wake) A hamlet comes to life near a player. */
    wake(cs) {
        const L = this.life;
        if (!(L.night?.staffNight(cs))) this.staffDay(cs); // (at night: the watch only — NightLife._watch → mageWatch)
        this._fire(cs);
        this._ward(cs);
        this._log({ ev: 'wake', id: cs.def.id });
    }

    /** (CastleLife._sleep) Nobody near any more: the fire goes out, the sphere is put away (it comes again with the house). */
    sleep(cs) {
        const g = this.game;
        if (cs.fireId) { const f = g.campfires?.list.get(cs.fireId); if (f && this.auth) g.campfires._out(f); cs.fireId = null; }
        const w = cs.wardId && g.wards?.list.get(cs.wardId);
        if (w && this.auth) { g.wards._remove(w.id); g.wards._changed(w.id); }
        cs.wardId = null;
    }

    /** (host) The people at their day places: the sellers, the watchman, the farmers. */
    staffDay(cs) {
        const L = this.life, def = cs.def;
        settlePawn(L.game.world?.terrain?.data, def);
        def.stalls.forEach((s, i) => (!s.probe || s.settled) && !s.off && L._activate(cs, (def.knights | 0) + 1 + i, { ...s.back, yaw: s.yaw }, 'stall', { post: { ...s.back, yaw: s.yaw } }));
        for (let k = 1; k <= (def.knights | 0); k++) {
            const yard = cs.graph.tagged('yard')[0];
            const n = yard != null ? cs.graph.nodes[yard] : def.gateIn;
            if (n) L._activate(cs, k, { x: n.x, y: n.y, z: n.z }, 'yard');
        }
        for (const field of def.fields.slice(0, 2)) {
            const idx = L._freeCommoner(cs, 'farmer');
            if (idx < 0) break;
            const v = L._activate(cs, idx, { x: field.x, y: field.y, z: field.z }, 'farm');
            if (v) v.fieldNode = field.node;
        }
    }

    /** (host, NightLife._watch) A wizards' village keeps watch too: one wizard with «Люмос» goes round the fire. */
    mageWatch(cs) {
        const L = this.life, def = cs.def;
        if (def.type !== 'magevillage') return;
        for (const v of cs.active.values()) if (v.watch && !v.dead) return;
        let v = [...cs.active.values()].find((o) => !o.dead && o.role === 'mage' && !o.sleep && !o.foe);
        if (!v) {
            const idx = L._freeCommoner(cs, 'mage');
            const n = cs.graph.nodes[cs.graph.tagged('yard')[0] ?? 0];
            if (idx < 0 || !n) return;
            v = L._activate(cs, idx, { x: n.x, y: n.y, z: n.z }, 'yard');
            if (!v) return;
        }
        v.watch = true; v.job = 'rounds'; v.path = null; v.rounds = { t: 0 };
        this._log({ ev: 'watch', id: def.id, who: v.id });
    }

    // ---------------------------------------------------------- the fire
    _fire(cs) {
        const g = this.game, def = cs.def, C = g.campfires;
        if (!def.fire || !C || !this.auth) return;
        const id = 'hf' + def.id;
        cs.fireId = id;
        let f = C.list.get(id);
        if (f) return;
        if (cs.fireOutAt && performance.now() - cs.fireOutAt < HAMLET_LIFE.FIRE_AGAIN * 1000) return;
        f = C._place({ id, x: def.fire.x, y: def.fire.y, z: def.fire.z, left: CAMPFIRE.MAX });
        C._send(f);
    }

    // ---------------------------------------------------------- the lone wizard's sphere
    _ward(cs) {
        const g = this.game, def = cs.def, W = g.wards;
        if (def.type !== 'magehut' || !W || !this.auth) return;
        const st = this.life.state(def.id);
        const id = 'site:' + def.id;
        if (st.killed.has(WARD_DOWN) || st.killed.has(1)) return;
        cs.wardId = id;
        if (W.list.has(id)) return;
        const h = def.houses[0];
        W._add({ id, owner: 'site:' + def.id, ownerName: 'Волшебник', c: { x: h.c.x, y: h.c.y, z: h.c.z }, r: HAMLET_LIFE.WARD_R, n: 0, inv: false, grant: [], grantNames: [], hp: 100, setting: false });
        W._changed();
        this._log({ ev: 'ward', id: def.id });
    }

    // ---------------------------------------------------------- frame (host)
    update(dt) {
        if (!this.auth) return;
        this._t -= dt;
        if (this._t > 0) return;
        this._t = HAMLET_LIFE.FIRE_KEEP;
        const g = this.game, L = this.life;
        for (const cs of L.castles.values()) {
            if (!cs.awake || cs.def.kind !== 'hamlet') continue;
            // the fire: kept burning by its people; put out — lit again after a while
            if (cs.fireId) {
                const f = g.campfires?.list.get(cs.fireId);
                if (f && f.left < CAMPFIRE.BURN) { f.left = CAMPFIRE.MAX; g.campfires._send(f); }
                if (!f) { if (!cs.fireOutAt) cs.fireOutAt = performance.now(); this._fire(cs); if (g.campfires?.list.has(cs.fireId)) cs.fireOutAt = 0; }
            }
            // the sphere: broken, or its wizard dead — gone for good
            if (cs.wardId) {
                const st = L.state(cs.def.id);
                const w = g.wards?.list.get(cs.wardId);
                if (!w || st.killed.has(1)) {
                    if (w) { g.wards._remove(w.id); g.wards._changed(w.id); }
                    st.killed.add(WARD_DOWN);
                    L._sendState?.(cs);
                    cs.wardId = null;
                    this._log({ ev: 'wardDown', id: cs.def.id });
                }
            }
        }
    }
}
