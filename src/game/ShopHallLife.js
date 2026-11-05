/**
 * ShopHallLife.js — the big shops of a wizards' settlement at work (the halls: src/world/ShopHalls.js; prices and words: ShopHallGoods.js).
 * The author 05.11: «игрок прям заходит в здание… обслуживающий продавец: может и подойти, может позвать, может указать на зелье, сказать,
 * сколько стоит»; then: «хочешь купить — подходишь, говоришь; он это зелье с помощью Вингардиум Левиоса сам перетаскивает на прилавок, ты
 * подходишь к прилавку, оплачиваешь, как обычно у нас оплата, он даёт сдачу»; «два продавца и маг-охранник — смотреть, чтобы ты ничего не
 * стырил и никак не навредил; маги среднего уровня»; «купил — на следующий день на этом же месте такое же: они постоянно варят новые».
 *
 *  - the SHELVES (host): every good is a real thing on its place (`item.shop = {stall, price, hall}`, `rest`); a place emptied (bought, stolen)
 *    is filled again the NEXT DAY (a morning after it, or a whole day's time — DAY); what was sold is remembered while the game runs (the hero
 *    flying away and back doesn't refill it). All the unpaid goods are put away when the hero goes far / the settlement sleeps (never saved);
 *    the show of bottles / rolled scrolls — a few instanced meshes (ShopHallModels.js);
 *  - the SELLERS (the potion hall's, the ingredients' room's, the scroll hall's — each a seller of the settlement with his stall's `hall`):
 *    greets the hero who comes in and comes up; walks near him while he looks round (helps); calls him over when he keeps silent far off;
 *    the hero names a good — he walks towards its shelf, says «Вингардиум Левиоса!» and the good flies in an arc to HIS COUNTER (sparks after
 *    it), then he goes behind the counter and names the price. The payment is the game's usual one (CastleTalk.pay): a pouch of coins on the
 *    counter and the good named (or «беру» / «да») — he takes the price, the change lies on the counter. A good on the counter not paid for —
 *    back to its shelf the same way when the hero leaves the shop or after COUNTER_WAIT;
 *  - the GUARD (the potion hall's stall with `guard`): a mage at the door; while the hero is in the shop he walks near him, watching; a good
 *    moved off its shelf by anything but the sellers (Акцио, «Левиоса», a blast) — «не трогайте товар», it flies back to its place; carried
 *    out of the shop unpaid — «Вор!», the crime is the settlement's (CastleLife.reportCrime: the guard and the wizards go for the thief).
 *    Hurting the staff: the usual fight (a wizard of the middle rank fights back — CastleLife / WizardFight).
 * What can go wrong: no money in the pouch — the usual «не хватает» of CastleTalk.pay; the good taken meanwhile — «нет на полке»; the seller
 * killed / scared / stunned / lifted mid-way — his flight ends where it is and the good falls (unpaid: the guard watches it — back on its
 * shelf); two goods asked at once — one after the other; the night — the sellers go home (NightLife), the counter's goods are put away (its
 * place refills next day); a guest of another's world — the host's seller doesn't walk for him: the coins of his purse, the good into his hand.
 */

import * as THREE from 'three';
import { newUid, ITEM_INFO } from './ItemTypes.js';
import { RECIPES } from './Potions.js';
import { spellTitle } from './Mana.js';
import { isDark } from './DarkMagic.js';
import { matchSpell } from '../fx/SpellManager.js';
import { frontEdge } from './CastleTalk.js';
import { potionStock, scrollStock, ingredientStock, parseHallWords, listLine, HALL_LINES, HALL_PRICE, NOT_SOLD, ingredientName } from './ShopHallGoods.js';
import { bottleShow, scrollShow, disposeShow, hallSign } from './ShopHallModels.js';

export const HALL_LIFE = {
    NEAR: 130, // m: the shelves and the show are kept while the hero is this near the hall
    DAY: 1440, // s of game: a whole day — an emptied place refills by then at the latest (else at the next morning)
    STEP: 6, // goods laid out at most per look (a model each)
    GREET_AGAIN: 120, // s: a hero who comes in again after this is greeted again
    CALL_AFTER: 25, // s inside, far from the seller and silent: he calls him over
    OFFER_TIME: 90, // s an offer stands
    COUNTER_WAIT: 150, // s a good waits on the counter unpaid before it goes back to its shelf
    LEV_REACH: 7, // m: from this near the seller lifts the good
    FLY_T: 1.9, // s of a good's flight
    ASTRAY: 1.2, // m off its place: a good was moved
    WALK: 3.2, RUN: 4.2, // m/s in the aisles
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ease = (k) => k * k * (3 - 2 * k);
const recName = (id) => RECIPES.find((r) => r.id === id)?.name || 'Зелье';
const flasksWord = (n) => (n === 1 ? 'колба' : n < 5 ? 'колбы' : 'колб');

export class ShopHallLife {
    constructor(game) {
        this.game = game;
        this.states = new Map(); // def.id:kind → state
        this.sold = new Map(); // def.id:kind → Map(place → {day, t}) — the places emptied, filled again the next day
        this.flights = []; // {L, from, to, t, T, caster, end}
        this.offer = null; // { S, kind: 'good'|'flask'|'cauldron', uids?, id?, price, name, n?, at }
        this.day = 0; // mornings seen while the game runs
        this._wasNight = null;
        this._t = 0;
        this._scanT = 0;
    }

    get life() { return this.game.castleLife; }

    // ---------------------------------------------------------------- the halls near
    update(dt) {
        this._t += dt;
        const g = this.game, life = this.life, me = g.character?.group.position;
        if (!life?.castles || !me) return;
        const night = !!g.isNight;
        if (this._wasNight === true && !night) this.day++; // (a morning: the brewers have brewed again)
        this._wasNight = night;
        this._scanT -= dt;
        if (this._scanT <= 0) {
            this._scanT = 0.3;
            const seen = new Set();
            for (const cs of life.castles.values()) {
                const halls = cs.def.halls;
                if (!halls?.length) continue;
                for (const h of halls) {
                    const key = cs.def.id + ':' + h.kind;
                    const cx = (h.room.x0 + h.room.x1) / 2, cz = (h.room.z0 + h.room.z1) / 2;
                    if (!cs.awake || Math.hypot(me.x - cx, me.z - cz) > HALL_LIFE.NEAR) continue;
                    seen.add(key);
                    let S = this.states.get(key);
                    if (!S) { S = this._make(cs, h, key); this.states.set(key, S); }
                    S.cs = cs;
                    if (!S.show) this._showOn(S);
                    if (g.authority) { this._restock(S); this._watch(S, me); this._counterWait(S, me); }
                }
            }
            for (const [key, S] of this.states) if (!seen.has(key)) { this._drop(S); this.states.delete(key); }
            if (this.offer && (this._t - this.offer.at > HALL_LIFE.OFFER_TIME || !this.states.has(this.offer.S.key))) this.offer = null;
        }
        this._fly(dt);
        for (const S of this.states.values()) this._marks(S, dt);
    }

    _make(cs, h, key) {
        return {
            key, cs, h, def: cs.def, stallKey: cs.def.id + ':s' + h.stall, goods: new Map(), stock: null, show: null, astray: new Map(),
            job: null, gjob: null, mark: null, inside: false, greetAt: -1e9, cameAt: -1e9, calledAt: -1e9, heardAt: -1e9, warnAt: -1e9, watchAt: -1e9,
        };
    }

    _soldOf(S) { let m = this.sold.get(S.key); if (!m) this.sold.set(S.key, (m = new Map())); return m; }

    /** The show of bottles / scrolls over the shelves (a few instanced meshes) and the painted sign. */
    _showOn(S) {
        const g = this.game, seed = (S.def.gx * 7919 + S.def.gz * 104729 + S.h.kind.length) >>> 0;
        const m = (S.h.kind !== 'scrolls' ? bottleShow(S.h.decor, seed) : scrollShow(S.h.decor, seed)) || new THREE.Group();
        const sign = hallSign(S.h);
        if (sign) m.add(sign);
        g.scene?.add(m);
        S.show = m;
    }

    /** The hero went far / the settlement sleeps: the show and the goods not paid for go (what was sold stays remembered). */
    _drop(S) {
        if (S.show && S.show !== true) disposeShow(S.show);
        S.show = null;
        const g = this.game, items = g.items;
        const own = new Set(S.goods.values());
        this.flights = this.flights.filter((f) => !own.has(f.L.item.uid));
        if (g.authority && items) {
            for (const uid of S.goods.values()) {
                const L = items.loose.get(uid);
                if (L && L.item.shop && !L.item.shop.paid) { items.removeLoose(uid); g.sync?.itemGone?.(uid, null, null); }
            }
        }
        S.goods.clear();
        S.job = null; S.gjob = null;
        if (this.offer?.S === S) this.offer = null;
    }

    /** (host) Every place of the shelves holds its good (a few a look); an emptied one — the next day. */
    _restock(S) {
        const g = this.game, items = g.items, land = g.world?.terrain?.data;
        if (!items?.loose) return;
        if (!S.stock) {
            const kf = g.knownScrollFn?.();
            S.stock = S.h.kind === 'potions' ? potionStock(S.h.slots, S.h.flasks) : S.h.kind === 'ingredients' ? ingredientStock(S.h.slots)
                : scrollStock(S.h.slots, kf ? (sp) => !!kf({ kind: 'scroll', stat: 'spell', spell: sp }) : null);
        }
        const sold = this._soldOf(S);
        let n = 0;
        for (let i = 0; i < S.stock.length && n < HALL_LIFE.STEP; i++) {
            const e = S.stock[i], uid = S.goods.get(i);
            if (uid != null) {
                const L = items.loose.get(uid);
                if (L && L.item.shop) continue; // (on its place, on the counter, or flying)
                S.goods.delete(i); this._unlist(S, uid);
                sold.set(i, { day: this.day, t: this._t }); // (bought and taken — or stolen: an empty place till tomorrow)
                continue;
            }
            const s0 = sold.get(i);
            if (s0 && s0.day >= this.day && this._t - s0.t < HALL_LIFE.DAY) continue;
            if (land?.landMade && !land.landMade(e.slot.x, e.slot.z)) continue;
            sold.delete(i);
            const item = { ...e.item, uid: newUid(), shop: { stall: S.stallKey, price: e.price, hall: S.h.kind } };
            const L = items.spawnLoose(item, _v.set(e.slot.x, e.slot.y + 0.1, e.slot.z));
            if (!L) continue;
            L.rest = true; L.vel?.set(0, 0, 0); L.spin?.set(0, 0, 0);
            S.goods.set(i, item.uid);
            n++;
        }
    }

    // ---------------------------------------------------------------- whose hall
    /** The state of the hall this seller sells in (or null; the guard is not a seller). */
    stateOf(v) {
        const st = v?.role === 'seller' ? v.cs?.def?.stalls?.[v.entry?.stall] : null;
        if (!st?.hall || st.guard) return null;
        return this.states.get(v.cs.def.id + ':' + st.hall) || null;
    }

    /** The hall a guard guards (or null). */
    guardOf(v) {
        const st = v?.role === 'seller' ? v.cs?.def?.stalls?.[v.entry?.stall] : null;
        if (!st?.guard) return null;
        return this.states.get(v.cs.def.id + ':' + st.hall) || null;
    }

    isKeeper(v) { return !!this.stateOf(v) || !!this.guardOf(v); }

    _keeper(S) { return this.life?.talk?._merchantOf?.(S.def, S.h.stall) || null; }

    _guard(S) {
        const gi = S.h.guard;
        if (gi == null) return null;
        for (const v of this.life?.byId?.values?.() || []) if (v.cs?.def === S.def && v.entry?.stall === gi && !v.dead) return v;
        return null;
    }

    _inRoom(h, p, m = 0.6) {
        const R = h.room;
        return p.x > R.x0 - m && p.x < R.x1 + m && p.z > R.z0 - m && p.z < R.z1 + m && p.y > R.y - 2 && p.y < R.y + 12;
    }

    /** Is the point in this shop (the potion hall and its ingredients' room are one shop)? */
    _inShop(S, p, m = 0.6) {
        for (const h of S.def.halls || []) if ((h === S.h || this._oneShop(h.kind, S.h.kind)) && this._inRoom(h, p, m)) return true;
        return false;
    }

    _oneShop(a, b) { const P = (k) => k === 'potions' || k === 'ingredients'; return a === b || (P(a) && P(b)); }

    /** A good of this hall lying on its shelf for sale. */
    _goodsOf(S, test) {
        const items = this.game.items, out = [];
        for (const uid of S.goods.values()) {
            const L = items?.loose.get(uid);
            if (L && L.item.shop && !L.item.shop.paid && !L.hover && !L.onCounter && test(L.item)) out.push(L);
        }
        return out;
    }

    /** The goods of this hall lying on its counter (not paid for). */
    _onCounter(S) {
        const items = this.game.items, out = [];
        for (const uid of S.goods.values()) { const L = items?.loose.get(uid); if (L?.onCounter && L.item.shop && !L.item.shop.paid) out.push(L); }
        return out;
    }

    _nameOf(it) {
        return it.kind === 'potion' ? recName(it.rec) : it.kind === 'scroll' ? `свиток «${spellTitle(it.spell)}»` : it.kind === 'flask' ? `${it.count || 1} ${flasksWord(it.count || 1)}`
            : ingredientName(it.kind) || (ITEM_INFO[it.kind]?.name || 'вещь').toLowerCase();
    }

    // ---------------------------------------------------------------- the words
    /** The hero's words to a seller (a string — his answer; true — done, he spoke himself; null — not his business: the usual talk). */
    hear(v, text) {
        const G = this.guardOf(v);
        if (G) {
            const r = parseHallWords(text, 'potions');
            return r && r.do !== 'yes' && r.do !== 'no' ? pick(HALL_LINES.guardWatch) : null;
        }
        const S = this.stateOf(v);
        if (!S) return null;
        S.heardAt = this._t;
        const talk = this.life?.talk, purse = talk?._pursePay?.(v);
        const r = parseHallWords(text, S.h.kind, matchSpell);
        if (!r) {
            if (S.h.kind === 'scrolls') { const sp = matchSpell(String(text || '').toLowerCase()); if (sp && isDark(sp)) return HALL_LINES.dark; }
            return null;
        }
        switch (r.do) {
            case 'list': return listLine(S.h.kind, S.stock ? S.stock.map((e) => e.item.spell).filter(Boolean) : null);
            case 'no':
                if (this.offer?.S === S) { this.offer = null; return pick(HALL_LINES.no); }
                return null;
            case 'yes': return this._yes(v, S, purse);
            case 'ask': {
                // (a pouch on the counter and the good named lies there: the usual payment — CastleTalk._payByName)
                if (purse && this._onCounter(S).some((L) => this._matches(L.item, r.good))) return null;
                return this._ask(v, S, r);
            }
            default: return null;
        }
    }

    _matches(it, G) {
        if (G.kind === 'potion') return it.kind === 'potion' && it.rec === G.rec;
        if (G.kind === 'scroll') return it.kind === 'scroll' && it.spell === G.spell;
        if (G.kind === 'ingredient') return it.kind === G.item;
        return it.kind === G.kind;
    }

    _ask(v, S, r) {
        const g = this.game, me = g.character.group.position, G = r.good;
        if (G.kind === 'dragonEgg') return HALL_LINES.noEgg;
        if (G.kind === 'potion' && NOT_SOLD.has(G.rec)) return HALL_LINES.notSold;
        if (G.kind === 'cauldron') {
            let c = null;
            for (const x of g.cauldrons?.list?.values?.() || []) if (x.shop?.stall === S.stallKey) c = x;
            if (!c) return HALL_LINES.soldOut;
            const price = c.shop.price || HALL_PRICE.CAULDRON;
            this.offer = { S, kind: 'cauldron', id: c.id, price, name: 'котёл', at: this._t };
            S.mark = { p: new THREE.Vector3(c.x, c.y + 1.2, c.z), t: 6 };
            return HALL_LINES.cauldron(price);
        }
        if (G.kind === 'scroll') {
            const kf = g.knownScrollFn?.(g.localId);
            if (kf && kf({ kind: 'scroll', stat: 'spell', spell: G.spell })) return HALL_LINES.known;
        }
        // already on the counter: the price, pay
        const there = this._onCounter(S).find((L) => this._matches(L.item, G));
        if (there) return HALL_LINES.onIts(this._nameOf(there.item), there.item.shop.price);
        const list = this._goodsOf(S, (it) => this._matches(it, G));
        if (!list.length) return G.kind === 'scroll' && !S.stock?.some((e) => e.item.spell === G.spell) ? HALL_LINES.nothing.scrolls : HALL_LINES.soldOut;
        list.sort((a, b) => a.model.position.distanceToSquared(me) - b.model.position.distanceToSquared(me));
        const n = G.kind === 'flask' ? Math.min(r.count || 1, list.length, 5) : 1;
        const L = list[0], price = n * L.item.shop.price;
        const name = G.kind === 'flask' ? `${n} ${flasksWord(n)}` : this._nameOf(L.item);
        this.offer = { S, kind: G.kind === 'flask' ? 'flask' : 'good', uids: list.slice(0, n).map((x) => x.item.uid), price, name, n, at: this._t };
        S.mark = { p: L.model.position.clone(), t: 5 };
        g.hud?.setVoice?.(`💰 ${name} — ${price} монет. Продавец перенесёт на прилавок: положите мешочек с монетами на прилавок и скажите «беру»`, true);
        if (g.authority && this._keeper(S) === v) {
            this._levitate(v, S, this.offer);
            return `${name[0].toUpperCase() + name.slice(1)} — ${price} монет${(r.count || 1) > 5 && G.kind === 'flask' ? ' (больше пяти за раз — нет)' : ''}. Сейчас перенесу на прилавок.`;
        }
        return HALL_LINES.offer(name, price);
    }

    /** «Да / беру». */
    _yes(v, S, purse) {
        const g = this.game, o = this.offer?.S === S ? this.offer : null, talk = this.life?.talk;
        const counter = this._onCounter(S);
        // (a pouch on the counter: the good there is paid the usual way — the price taken, the change laid on the counter)
        if (purse && counter.length) {
            const G = (o && counter.find((L) => o.uids?.includes(L.item.uid))) || counter[0];
            if (g.authority) talk.pay(purse.item.uid, G.item.uid, g.localId);
            else g.sync?.tradePay?.(purse.item.uid, G.item.uid);
            this.offer = null;
            return true;
        }
        if (!o) return counter.length ? HALL_LINES.putCoins : null;
        if (o.kind === 'cauldron') {
            const have = g.inventory?.coins?.() ?? 0;
            if (have < o.price || !g.inventory.spendCoins(o.price)) return HALL_LINES.noMoney(o.price - have);
            g.cauldrons?.paid?.(o.id);
            this.offer = null;
            g.inventory._render?.();
            g.hud?.setVoice?.(`💰 Котёл куплен за ${o.price} (осталось ${g.inventory.coins()}) — он ваш, тащите его домой`, true);
            return HALL_LINES.cauldronPaid;
        }
        const Ls = o.uids.map((u) => g.items.loose.get(u)).filter((L) => L && L.item.shop && !L.item.shop.paid);
        if (!Ls.length) { this.offer = null; return HALL_LINES.soldOut; }
        if (Ls.some((L) => L.onCounter)) return HALL_LINES.putCoins;
        if (g.authority && this._keeper(S) === v) { // (still on its shelf: to the counter first)
            if (!S.job || S.job.do !== 'lev') this._levitate(v, S, o);
            return 'Сейчас перенесу на прилавок.';
        }
        // a guest (the host's seller does not walk for him): the coins of his purse, the good into his hand
        const have = g.inventory?.coins?.() ?? 0;
        if (have < o.price || !g.inventory.spendCoins(o.price)) return HALL_LINES.noMoney(o.price - have);
        for (const L of Ls) L.item.shop.paid = true;
        this.offer = null;
        g.inventory._render?.();
        this._handOver(Ls);
        return pick(HALL_LINES.sold);
    }

    /** The hero's hand reached an unpaid good of a hall (Items._shopHint): the seller names it — «перенести на прилавок?». True: a hall's. */
    handAt(L) {
        const g = this.game, sh = L?.item?.shop;
        if (!sh?.hall) return false;
        let S = null;
        for (const s of this.states.values()) if (s.stallKey === sh.stall) S = s;
        if (!S) return false;
        if (this.offer?.uids?.includes(L.item.uid)) return true;
        const v = this._keeper(S), it = L.item, name = this._nameOf(it);
        if (L.onCounter) { g.hud?.setVoice?.(`💰 ${name} — ${sh.price} монет. Положите мешочек с монетами на прилавок и скажите «беру»`, true); return true; }
        if (it.kind === 'scroll') {
            const kf = g.knownScrollFn?.(g.localId);
            if (kf && kf(it)) { if (v) this.life._say(v, HALL_LINES.known, 5); return true; }
        }
        this.offer = { S, kind: it.kind === 'flask' ? 'flask' : 'good', uids: [it.uid], price: sh.price, name, n: 1, at: this._t };
        S.mark = { p: L.model.position.clone(), t: 4 };
        g.hud?.setVoice?.(`💰 ${name} — ${sh.price} монет. Скажите «да» — продавец перенесёт на прилавок`, true);
        if (v) {
            this.life._say(v, `${HALL_LINES.offer(name, sh.price)} Перенести на прилавок?`, 6);
            v.talking = 4; v.talkTo = g.localId;
        }
        return true;
    }

    // ---------------------------------------------------------------- «Вингардиум Левиоса»: shelf → counter
    _levitate(v, S, o) {
        const L = this.game.items.loose.get(o.uids[0]);
        if (!L) return;
        S.job = { do: 'lev', t: 0, path: null, o, L, phase: 'walk' };
    }

    /** A free place on the counter's buyer's edge (three along it). */
    _counterSpot(S) {
        const st = S.def.stalls[S.h.stall], c = st.counter, along = c.x1 - c.x0 >= c.z1 - c.z0, items = this.game.items;
        for (const f of [0.5, 0.2, 0.8]) {
            const x = along ? c.x0 + (c.x1 - c.x0 + 1) * f - 0.5 : frontEdge(st, 0.35);
            const z = along ? frontEdge(st, 0.35) : c.z0 + (c.z1 - c.z0 + 1) * f - 0.5;
            let free = true;
            for (const L of items.loose.values()) { const p = L.model.position; if (Math.abs(p.x - x) < 0.45 && Math.abs(p.z - z) < 0.45 && Math.abs(p.y - c.top) < 1.2) { free = false; break; } }
            for (const fl of this.flights) if (Math.abs(fl.to.x - x) < 0.45 && Math.abs(fl.to.z - z) < 0.45) free = false;
            if (free) return new THREE.Vector3(x, c.top + 0.12, z);
        }
        return null;
    }

    /** A good flies along an arc (host): `end` when it is there. */
    _flight(L, to, caster, end) {
        this.flights = this.flights.filter((f) => f.L !== L);
        L.hover = L.model.position.clone(); L.rest = false;
        this.flights.push({ L, from: L.model.position.clone(), to: to.clone(), t: 0, T: HALL_LIFE.FLY_T, caster, end });
    }

    _fly(dt) {
        if (!this.flights.length) return;
        const g = this.game, items = g.items;
        this.flights = this.flights.filter((f) => {
            const L = f.L;
            if (items.loose.get(L.item.uid) !== L) return false; // (taken in the air)
            const c = f.caster;
            if (c && (c.dead || c.stunT > 0 || c.lev || c.carriedBy || c.foe)) { L.hover = null; return false; } // (the seller hit: the spell breaks — it falls)
            f.t += dt;
            const k = Math.min(1, f.t / f.T), e = ease(k);
            L.hover.copy(f.from).lerp(f.to, e);
            L.hover.y += Math.sin(Math.PI * e) * (1.4 + f.from.distanceTo(f.to) * 0.08);
            if (c) { c.mode = 'cast'; this._aim(c, L.hover); this._face(c, L.hover.x, L.hover.z, dt); }
            if (Math.random() < dt * 24) g.fx?.spark?.(_w.copy(L.hover), 0xb9a0ff, 0.09, _u.set((Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4), 0.6);
            if (k < 1) return true;
            L.hover = null;
            L.model.position.copy(f.to);
            L.vel?.set(0, 0, 0); L.spin?.set(0, 0, 0);
            L.rest = true; L.sentRest = false;
            f.end?.(L);
            return false;
        });
    }

    /** It lands on the counter: listed as the stall's good (CastleTalk: «беру», the pouch, the change). */
    _onCounterLanded(S, L, o) {
        const st = S.def.stalls[S.h.stall];
        L.onCounter = true; L.perch = st.counter; L.counterAt = this._t;
        if (o?.kind === 'flask' && o.n > 1) { // (the flasks asked: one bundle of n at n × 20; the others off the table — their places refill tomorrow)
            for (const u of o.uids.slice(1)) {
                const X = this.game.items.loose.get(u);
                if (X && X !== L && X.item.shop && !X.item.shop.paid) { this.game.items.removeLoose(u); this.game.sync?.itemGone?.(u, null, null); }
            }
            L.item.count = o.n; L.item.shop.price = o.n * HALL_PRICE.FLASK;
        }
        const talk = this.life?.talk;
        if (talk?.stalls) {
            let s = talk.stalls.get(S.stallKey);
            if (!s) { s = { goods: [], restockAt: Infinity }; talk.stalls.set(S.stallKey, s); }
            if (!s.goods.includes(L.item.uid)) s.goods.push(L.item.uid);
        }
    }

    _unlist(S, uid) {
        const s = this.life?.talk?.stalls?.get(S.stallKey);
        if (s) s.goods = s.goods.filter((u) => u !== uid);
    }

    /** Back to its place on the shelf (the seller's spell, or the guard's). */
    _toShelf(S, L, caster) {
        let slot = null;
        for (const [i, uid] of S.goods) if (uid === L.item.uid) slot = S.stock?.[i]?.slot;
        if (!slot) return;
        L.onCounter = false; L.perch = null;
        this._unlist(S, L.item.uid);
        if (caster) this.life._say(caster, HALL_LINES.levitate, 2.5);
        this._flight(L, _v.set(slot.x, slot.y + 0.1, slot.z), caster, null);
    }

    /** (host) Goods waiting on the counter unpaid: back on their shelves when the hero has left the shop or after COUNTER_WAIT. */
    _counterWait(S, me) {
        const out = !this._inShop(S, me, 3);
        for (const L of this._onCounter(S)) {
            if (out || this._t - (L.counterAt || 0) > HALL_LIFE.COUNTER_WAIT) {
                const v = this._keeper(S);
                if (v && !out) this.life._say(v, HALL_LINES.backToShelf, 3);
                this._toShelf(S, L, v && !v.foe ? v : null);
            }
        }
    }

    // ---------------------------------------------------------------- the guard's eye
    /** (host) A good off its place by anything but the sellers: back it goes; out of the shop unpaid — a thief. */
    _watch(S, me) {
        const g = this.game, items = g.items;
        if (!S.stock) return;
        for (const [i, uid] of S.goods) {
            const L = items.loose.get(uid);
            if (!L || !L.item.shop || L.item.shop.paid || L.onCounter || this.flights.some((f) => f.L === L)) { S.astray.delete(uid); continue; }
            const slot = S.stock[i]?.slot, p = L.model.position;
            if (!slot || Math.hypot(p.x - slot.x, p.z - slot.z) < HALL_LIFE.ASTRAY && Math.abs(p.y - slot.y) < 1.2) { S.astray.delete(uid); continue; }
            const who = this._guard(this._mainState(S)) || this._keeper(S);
            if (!this._inShop(S, p, 1.5)) { // (carried out unpaid: stolen)
                S.goods.delete(i);
                this._soldOf(S).set(i, { day: this.day, t: this._t });
                delete L.item.shop; L.rest = false;
                if (who) { this.life._say(who, pick(HALL_LINES.thief), 4); this.life.reportCrime?.(who, g.localId, 'theft'); }
                g.hud?.setVoice?.('🚨 Вы вынесли товар, не заплатив! Охрана лавки зовёт на помощь', true);
                continue;
            }
            const t0 = S.astray.get(uid);
            if (t0 == null) {
                S.astray.set(uid, this._t);
                if (who && this._t - S.warnAt > 8) { S.warnAt = this._t; this.life._say(who, pick(HALL_LINES.noTouch), 4); const MS = this._mainState(S); if (MS && !MS.gjob) MS.gjob = { do: 'come', t: 0, path: null, near: 2.6 }; }
            } else if (this._t - t0 > 3 && !L.hover) {
                S.astray.delete(uid);
                const c = (who && !who.foe ? who : null);
                if (c) this.life._say(c, HALL_LINES.levitate, 2.5);
                this._flight(L, _v.set(slot.x, slot.y + 0.1, slot.z), c, null);
            }
        }
    }

    _mainState(S) { return S.h.kind === 'ingredients' ? this.states.get(S.def.id + ':potions') || S : S; }

    // ---------------------------------------------------------------- the seller
    /** (host, CastleLife) A seller / the guard of a hall at work. True: this step is his. */
    step(v, dt) {
        const g = this.game;
        if (!g.authority) return false;
        const GS = this.guardOf(v);
        if (GS) return this._guardStep(v, GS, dt);
        const S = this.stateOf(v), life = this.life;
        if (!S) return false;
        if (v.foe || v.dead || v.stunT > 0 || v.lev || v.carriedBy || v.pack > 0 || v.sleep || v.fleeT > 0) { S.job = null; return false; }
        const me = g.character?.group.position;
        const inside = !!me && !g.combat?.dead && this._inRoom(S.h, me);
        if (inside && !S.inside) { // (the hero came in: greeted, the seller comes up)
            S.cameAt = this._t;
            if (this._t - S.greetAt > HALL_LIFE.GREET_AGAIN) {
                S.greetAt = this._t;
                life._say(v, pick(HALL_LINES.welcome[S.h.kind]), 6);
                if (!S.job) S.job = { do: 'come', t: 0, path: null, near: 2.6 };
            }
        }
        S.inside = inside;
        if (S.job) return this._jobStep(v, S, dt, me, inside);
        const waiting = this._onCounter(S).length > 0;
        const home = S.h.walk[S.h.home];
        if (waiting) { // (a good on his counter: he waits behind it for the coins)
            if (Math.hypot(home.x - v.x, home.z - v.z) > 0.9) { S.job = { do: 'home', t: 0, path: null }; return this._jobStep(v, S, dt, me, inside); }
            if (me) this._face(v, me.x, me.z, dt);
            v.speed = 0; v.mode = v.giveT > 0 ? 'offer' : v.talking > 0 ? 'talk' : 'idle';
            life._ground(v);
            return v.giveT > 0 ? false : true; // (his hand out for the coins: CastleLife's own pose)
        }
        if (inside) {
            const d = Math.hypot(me.x - v.x, me.z - v.z);
            if (d > 9 && this._t - S.heardAt > HALL_LIFE.CALL_AFTER && this._t - S.calledAt > 60 && this._t - S.cameAt > 8) {
                S.calledAt = this._t; // (far inside, silent a while: he calls him over and comes)
                life._say(v, pick(HALL_LINES.call[S.h.kind]), 5);
                S.job = { do: 'come', t: 0, path: null, near: 2.6 };
                return this._jobStep(v, S, dt, me, inside);
            }
            if (d > 7 && this._t - S.cameAt > 4) { S.job = { do: 'come', t: 0, path: null, near: 3.5 }; return this._jobStep(v, S, dt, me, inside); } // (he keeps near the buyer: helps)
            this._face(v, me.x, me.z, dt);
            v.speed = 0; v.mode = v.talking > 0 ? 'talk' : 'idle';
            life._ground(v);
            return true;
        }
        if (Math.hypot(home.x - v.x, home.z - v.z) > 0.9) { S.job = { do: 'home', t: 0, path: null }; return this._jobStep(v, S, dt, me, inside); }
        return false;
    }

    _jobStep(v, S, dt, me, inside) {
        const life = this.life, J = S.job;
        J.t += dt;
        switch (J.do) {
            case 'come': {
                if (!inside || J.t > 20) { S.job = null; break; }
                if (!J.path || J.t - (J.at || 0) > 1) { J.path = this._route(S, v, me); J.at = J.t; }
                const d = this._follow(v, J.path, dt, HALL_LIFE.WALK, J.near || 2.4, me);
                if (d <= (J.near || 2.4) + 0.2) { S.job = null; this._face(v, me.x, me.z, dt); }
                break;
            }
            case 'lev': {
                const L = J.L, items = this.game.items;
                if (items.loose.get(L.item.uid) !== L || !L.item.shop || L.item.shop.paid) { S.job = null; break; }
                const p = L.model.position;
                if (J.phase === 'walk') {
                    if (!J.stand) J.stand = this._stand(S, p);
                    if (Math.hypot(p.x - v.x, p.z - v.z) <= HALL_LIFE.LEV_REACH && J.t > 0.4) { J.phase = 'cast'; J.t = 0; v.speed = 0; break; }
                    if (!J.path) J.path = this._route(S, v, J.stand);
                    const d = this._follow(v, J.path, dt, HALL_LIFE.RUN, 0.35, J.stand);
                    if (d < 0.6 || J.t > 16) { J.phase = 'cast'; J.t = 0; }
                } else if (J.phase === 'cast') {
                    v.speed = 0; v.mode = 'cast';
                    this._face(v, p.x, p.z, dt); this._aim(v, p);
                    if (J.t > 0.55) {
                        const to = this._counterSpot(S);
                        if (!to) { life._say(v, 'Прилавок занят — заберите сначала то, что на нём.', 4); S.job = null; break; }
                        life._say(v, HALL_LINES.levitate, 2.5);
                        const o = J.o;
                        this._flight(L, to, v, (X) => this._onCounterLanded(S, X, o));
                        J.phase = 'fly'; J.t = 0;
                    }
                } else if (J.phase === 'fly') {
                    v.speed = 0;
                    if (!this.flights.some((f) => f.L === L)) {
                        if (L.onCounter) life._say(v, HALL_LINES.onIts(this._nameOf(L.item), L.item.shop.price), 6);
                        S.job = { do: 'home', t: 0, path: null };
                    }
                }
                break;
            }
            case 'home': {
                const home = S.h.walk[S.h.home];
                if (J.t > 25) { S.job = null; break; }
                if (!J.path) J.path = this._route(S, v, home);
                const d = this._follow(v, J.path, dt, HALL_LIFE.WALK, 0.3, home);
                if (d < 0.5) { S.job = null; v.yaw = S.def.stalls[S.h.stall].yaw ?? v.yaw; }
                break;
            }
            default: S.job = null;
        }
        life._ground(v);
        return true;
    }

    // ---------------------------------------------------------------- the guard
    _guardStep(v, S, dt) {
        const g = this.game, life = this.life;
        if (v.foe || v.dead || v.stunT > 0 || v.lev || v.carriedBy || v.pack > 0 || v.sleep) { S.gjob = null; return false; }
        const me = g.character?.group.position;
        const inside = !!me && !g.combat?.dead && this._inShop(S, me);
        const post = S.def.stalls[S.h.guard].back;
        const J = S.gjob;
        if (J) {
            J.t += dt;
            if (!inside || J.t > 18) S.gjob = null;
            else {
                if (!J.path || J.t - (J.at || 0) > 1) { J.path = this._routeAll(S, v, me); J.at = J.t; }
                const d = this._follow(v, J.path, dt, HALL_LIFE.WALK, J.near, me);
                if (d <= J.near + 0.2) { S.gjob = null; life._say(v, HALL_LINES.guardWarn, 3); }
                life._ground(v);
                return true;
            }
        }
        if (inside) {
            const d = Math.hypot(me.x - v.x, me.z - v.z);
            if (d > 9) { S.gjob = { do: 'keep', t: 0, path: null, near: 6 }; return this._guardStep(v, S, 0); } // (he keeps the buyer in sight)
            this._face(v, me.x, me.z, dt);
            v.speed = 0; v.mode = 'idle';
            if (this._t - S.watchAt > 90 && d < 7) { S.watchAt = this._t; life._say(v, pick(HALL_LINES.guardWatch), 4); }
            life._ground(v);
            return true;
        }
        if (Math.hypot(post.x - v.x, post.z - v.z) > 0.9) {
            life._steer(v, post.x, post.z, HALL_LIFE.WALK, dt, 0.3);
            v.mode = v.speed > 0 ? 'walk' : 'idle';
            life._ground(v);
            return true;
        }
        return false;
    }

    /** A route for the guard: through both rooms of the shop (the potion hall's aisles; the ingredients' room's when the hero is there). */
    _routeAll(S, v, to) {
        const IS = this.states.get(S.def.id + ':ingredients');
        if (IS && this._inRoom(IS.h, to) && !this._inRoom(IS.h, v)) { const door = IS.h.walk[IS.h.entry]; return [...this._route(S, v, door), ...this._route(IS, door, to)]; }
        if (IS && this._inRoom(IS.h, v)) return this._route(IS, v, to);
        return this._route(S, v, to);
    }

    // ---------------------------------------------------------------- walking
    /** Where to stand before a place on a shelf: the nearest point of the aisle before it. */
    _stand(S, p) {
        let best = null, bd = Infinity;
        for (const s of [...S.h.slots, ...S.h.flasks]) {
            const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
            if (d < bd) { bd = d; best = s; }
        }
        const f = best?.face || { x: 0, z: 0 }, fl = Math.hypot(f.x, f.z) || 1;
        if (!best || bd > 4 || Math.hypot(f.x, f.z) < 0.5) { // (a table, the cauldron: the walking point nearest to it)
            let w = null, wd = Infinity;
            for (const q of S.h.walk) { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < wd) { wd = d; w = q; } }
            const dx = p.x - w.x, dz = p.z - w.z, dl = Math.hypot(dx, dz) || 1, k = Math.max(0, dl - 1.6) / dl;
            return { x: w.x + dx * k, y: w.y, z: w.z + dz * k };
        }
        return { x: best.x + f.x / fl * 1.6, y: S.h.room.y, z: best.z + f.z / fl * 1.6 };
    }

    /** A path through the aisles' waypoints: from the one nearest to the walker to the one nearest to the target, then the target. */
    _route(S, v, to) {
        const W = S.h.walk, n = W.length, near = (x, z) => { let b = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = (W[i].x - x) ** 2 + (W[i].z - z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
        const a = near(v.x, v.z), b = near(to.x, to.z);
        const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
        dist[a] = 0;
        for (let k = 0; k < n; k++) {
            let u = -1;
            for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
            if (u < 0 || dist[u] === Infinity) break;
            done[u] = true;
            for (const [p, q] of S.h.links) {
                const o = p === u ? q : q === u ? p : -1;
                if (o < 0) continue;
                const d = dist[u] + Math.hypot(W[u].x - W[o].x, W[u].z - W[o].z);
                if (d < dist[o]) { dist[o] = d; prev[o] = u; }
            }
        }
        const path = [];
        for (let i = b; i >= 0; i = prev[i]) { path.unshift(W[i]); if (i === a) break; }
        if (path.length > 1 && Math.hypot(path[1].x - v.x, path[1].z - v.z) < Math.hypot(path[1].x - path[0].x, path[1].z - path[0].z)) path.shift();
        const L = path.length;
        if (L > 1 && Math.hypot(to.x - path[L - 2].x, to.z - path[L - 2].z) < Math.hypot(path[L - 1].x - path[L - 2].x, path[L - 1].z - path[L - 2].z)) path.pop();
        path.push({ x: to.x, y: to.y, z: to.z });
        return path;
    }

    /** Walk along a path; → the distance left to its end (`end`: the live target, e.g. the hero). */
    _follow(v, path, dt, speed, stopAt, end) {
        const life = this.life;
        while (path.length > 1 && Math.hypot(path[0].x - v.x, path[0].z - v.z) < 0.8) path.shift();
        const last = path.length === 1;
        const t = last && end ? end : path[0];
        const d = life._steer(v, t.x, t.z, speed, dt, last ? stopAt : 0);
        v.mode = v.speed > 3.6 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
        return last ? d : d + 5;
    }

    _face(v, x, z, dt) {
        const want = Math.atan2(-(x - v.x), -(z - v.z));
        let d = want - v.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        v.yaw += d * Math.min(1, dt * 8);
    }

    _aim(v, p) {
        const dx = p.x - v.x, dz = p.z - v.z, dy = p.y - (v.y + 2.9);
        if (v.model) v.model.aimPitch = Math.max(-0.9, Math.min(1.1, Math.atan2(dy, Math.hypot(dx, dz))));
    }

    /** Into the hero's hand (the other one, a slot, else at his feet — Items._gotItem). A guest's purchase. */
    _handOver(Ls) {
        const g = this.game, items = g.items;
        for (const L of Ls) {
            if (items.loose.get(L.item.uid) !== L) continue;
            L.hover = null;
            const side = !items.held.right ? 'right' : !items.held.left ? 'left' : 'slot';
            items.pickUp(L.item.uid, g.localId, side);
        }
    }

    /** The place shown sparkles (everybody looking sees it). */
    _marks(S, dt) {
        const m = S.mark, g = this.game;
        if (!m) return;
        m.t -= dt;
        if (m.t <= 0) { S.mark = null; return; }
        m.k = (m.k || 0) + dt;
        if (m.k < 0.05) return;
        m.k = 0;
        g.fx?.spark?.(_w.set(m.p.x + (Math.random() - 0.5) * 0.45, m.p.y + Math.random() * 0.7, m.p.z + (Math.random() - 0.5) * 0.45), 0xffd86a, 0.12, _u.set(0, 0.6, 0), 0.8);
        g.fireLights?.want?.(m.p.x, m.p.y + 0.5, m.p.z, 0.45);
    }

    dispose() { for (const S of this.states.values()) this._drop(S); this.states.clear(); this.flights = []; this.offer = null; }
}
