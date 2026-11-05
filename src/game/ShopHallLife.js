/**
 * ShopHallLife.js — the two big shops of a wizards' settlement at work (the halls: src/world/ShopHalls.js; prices and words: ShopHallGoods.js).
 * The author 05.11: «игрок прям заходит в здание, и там будет продавец… обслуживающий: может и подойти, может позвать, может указать на
 * какое-то конкретно зелье, которое ему нужно, сказать, сколько стоит, обслужить».
 *
 *  - the SHELVES (host): every good for sale is a real thing lying on its place (`item.shop = {stall, price, hall}`), not moving (`rest`);
 *    a place emptied (bought, taken after paying) is filled again after REFILL s; all of them are put away when the hero goes far / the
 *    settlement sleeps (the goods not paid for are never saved — WorldSave). The show of bottles / rolled scrolls over the rest of the shelves:
 *    a few instanced meshes (ShopHallModels.js), made when the hero comes near, disposed of when he goes away;
 *  - the KEEPER (a seller of the settlement, his stall's `hall`): by day he stands behind his counter; the hero comes in — he greets him and
 *    comes up (`come`); the hero names a good («сколько стоит зелье удачи», «покажи свиток Лайтнинг Страйк», «дай пять колб», «котёл») —
 *    he walks the aisles to its shelf, points at it (it sparkles), says the price («…Берёте?»); «да» — the coins are taken, he takes the good
 *    off the shelf and brings it into the hero's hand (`fetch`); the hand of the hero reaching for an unpaid good — he comes and names it too;
 *    the hero far inside the hall and silent for a while — he calls him over;
 *  - the words go before the conversation brain (CastleTalk._hear → hear): the rules, at once.
 * What can go wrong (and what is done): no money — «не хватает N»; the good taken / bought meanwhile — «нет на полке» (refilled later); the
 * hero left the hall while the keeper brings the good — it is laid on the counter, paid, his; the keeper killed / scared / stunned / lifted
 * mid-way — the job is dropped (a paid good he carried falls and is the hero's: no shop on it); the hands full — into a slot, else at the
 * feet; a scroll the hero knows already — not sold («вы его уже знаете»); a dark spell asked for — «чёрной магии здесь нет»; the night —
 * the keeper is gone home (NightLife), the goods stay on the shelves (not paid — not taken); a guest of another's world — he buys at once
 * (the coins his, the good into his hand: the host's keeper does not walk for him).
 */

import * as THREE from 'three';
import { newUid, ITEM_INFO } from './ItemTypes.js';
import { RECIPES } from './Potions.js';
import { spellTitle } from './Mana.js';
import { isDark } from './DarkMagic.js';
import { matchSpell } from '../fx/SpellManager.js';
import { potionStock, scrollStock, ingredientStock, parseHallWords, listLine, HALL_LINES, HALL_PRICE } from './ShopHallGoods.js';
import { bottleShow, scrollShow, disposeShow, hallSign } from './ShopHallModels.js';

export const HALL_LIFE = {
    NEAR: 130, // m: the shelves and the show are kept while the hero is this near the hall
    REFILL: 60, // s before an emptied place gets a new good
    STEP: 6, // goods laid out at most per look (a model each)
    GREET_AGAIN: 120, // s: a hero who comes in again after this is greeted again
    CALL_AFTER: 25, // s inside, far from the keeper and silent: he calls him over
    OFFER_TIME: 60, // s an offer stands
    WALK: 3.2, RUN: 4.2, // m/s in the aisles
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const recName = (id) => RECIPES.find((r) => r.id === id)?.name || 'Зелье';
const flasksWord = (n) => (n === 1 ? 'колба' : n < 5 ? 'колбы' : 'колб');

export class ShopHallLife {
    constructor(game) {
        this.game = game;
        this.states = new Map(); // def.id:kind → state
        this.offer = null; // { S, kind: 'good'|'flask'|'cauldron', uids?, id?, price, name, at }
        this._t = 0;
        this._scanT = 0;
    }

    get life() { return this.game.castleLife; }

    // ---------------------------------------------------------------- the halls near
    update(dt) {
        this._t += dt;
        const g = this.game, life = this.life, me = g.character?.group.position;
        if (!life?.castles || !me) return;
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
                    if (g.authority) this._restock(S);
                }
            }
            for (const [key, S] of this.states) if (!seen.has(key)) { this._drop(S); this.states.delete(key); }
            if (this.offer && (this._t - this.offer.at > HALL_LIFE.OFFER_TIME || !this.states.has(this.offer.S.key))) this.offer = null;
        }
        for (const S of this.states.values()) this._marks(S, dt);
    }

    _make(cs, h, key) {
        return {
            key, cs, h, def: cs.def, stallKey: cs.def.id + ':s' + h.stall, goods: new Map(), emptyAt: new Map(), stock: null, show: null,
            job: null, mark: null, inside: false, greetAt: -1e9, cameAt: -1e9, calledAt: -1e9, heardAt: -1e9,
        };
    }

    /** The show of bottles / scrolls over the shelves (a few instanced meshes). */
    _showOn(S) {
        const g = this.game, seed = (S.def.gx * 7919 + S.def.gz * 104729 + (S.h.kind === 'potions' ? 1 : 2)) >>> 0;
        const m = (S.h.kind !== 'scrolls' ? bottleShow(S.h.decor, seed) : scrollShow(S.h.decor, seed)) || new THREE.Group();
        const sign = hallSign(S.h);
        if (sign) m.add(sign);
        g.scene?.add(m);
        S.show = m;
    }

    /** The hero went far / the settlement sleeps: the show and the goods not paid for go. */
    _drop(S) {
        if (S.show && S.show !== true) disposeShow(S.show);
        S.show = null;
        const g = this.game, items = g.items;
        if (g.authority && items) {
            for (const uid of S.goods.values()) {
                const L = items.loose.get(uid);
                if (L && L.item.shop && !L.item.shop.paid) { items.removeLoose(uid); g.sync?.itemGone?.(uid, null, null); }
            }
        }
        S.goods.clear();
        if (S.job?.L) S.job.L.hover = null;
        S.job = null;
        if (this.offer?.S === S) this.offer = null;
    }

    /** (host) Every place of the shelves holds its good (a few a look; an emptied one after REFILL s). */
    _restock(S) {
        const g = this.game, items = g.items, land = g.world?.terrain?.data;
        if (!items?.loose) return;
        if (!S.stock) {
            const kf = g.knownScrollFn?.();
            S.stock = S.h.kind === 'potions' ? potionStock(S.h.slots, S.h.flasks) : S.h.kind === 'ingredients' ? ingredientStock(S.h.slots)
                : scrollStock(S.h.slots, kf ? (sp) => !!kf({ kind: 'scroll', stat: 'spell', spell: sp }) : null);
        }
        let n = 0;
        for (let i = 0; i < S.stock.length && n < HALL_LIFE.STEP; i++) {
            const e = S.stock[i], uid = S.goods.get(i);
            if (uid != null) {
                if (items.loose.has(uid)) continue; // (on its place — or paid and on its way)
                S.goods.delete(i); S.emptyAt.set(i, this._t);
                continue;
            }
            const t0 = S.emptyAt.get(i);
            if (t0 != null && this._t - t0 < HALL_LIFE.REFILL) continue;
            if (land?.landMade && !land.landMade(e.slot.x, e.slot.z)) continue;
            S.emptyAt.delete(i);
            const item = { ...e.item, uid: newUid(), shop: { stall: S.stallKey, price: e.price, hall: S.h.kind } };
            const L = items.spawnLoose(item, _v.set(e.slot.x, e.slot.y + 0.1, e.slot.z));
            if (!L) continue;
            L.rest = true; L.vel?.set(0, 0, 0); L.spin?.set(0, 0, 0);
            S.goods.set(i, item.uid);
            n++;
        }
    }

    // ---------------------------------------------------------------- whose hall
    /** The state of the hall this keeper keeps (or null). */
    stateOf(v) {
        const st = v?.role === 'seller' ? v.cs?.def?.stalls?.[v.entry?.stall] : null;
        if (!st?.hall || st.guard) return null;
        return this.states.get(v.cs.def.id + ':' + st.hall) || null;
    }

    isKeeper(v) { return !!this.stateOf(v); }

    _keeper(S) { return this.life?.talk?._merchantOf?.(S.def, S.h.stall) || null; }

    _inRoom(h, p) {
        const R = h.room;
        return p.x > R.x0 - 0.6 && p.x < R.x1 + 0.6 && p.z > R.z0 - 0.6 && p.z < R.z1 + 0.6 && p.y > R.y - 2 && p.y < R.y + 12;
    }

    /** A good of this hall lying for sale: by its item. */
    _goodsOf(S, test) {
        const items = this.game.items, out = [];
        for (const uid of S.goods.values()) {
            const L = items?.loose.get(uid);
            if (L && L.item.shop && !L.item.shop.paid && !L.hover && test(L.item)) out.push(L);
        }
        return out;
    }

    // ---------------------------------------------------------------- the words
    /** The hero's words to a keeper → his answer (or null: not his business — the usual talk). */
    hear(v, text) {
        const S = this.stateOf(v);
        if (!S) return null;
        S.heardAt = this._t;
        const r = parseHallWords(text, S.h.kind, matchSpell);
        if (!r) {
            if (S.h.kind === 'scrolls') { const sp = matchSpell(String(text || '').toLowerCase()); if (sp && isDark(sp)) return HALL_LINES.dark; }
            return null;
        }
        switch (r.do) {
            case 'list': return listLine(S.h.kind, S.stock ? S.stock.map((e) => e.item.spell).filter(Boolean) : null);
            case 'no': if (this.offer?.S === S) { this.offer = null; return pick(HALL_LINES.no); } return null;
            case 'yes': return this.offer?.S === S ? this._buy(v, S) : null;
            case 'ask': return this._ask(v, S, r);
            default: return null;
        }
    }

    _ask(v, S, r) {
        const g = this.game, me = g.character.group.position, G = r.good;
        if (G.kind === 'cauldron') {
            let c = null;
            for (const x of g.cauldrons?.list?.values?.() || []) if (x.shop?.stall === S.stallKey) c = x;
            if (!c) return HALL_LINES.soldOut;
            const price = c.shop.price || HALL_PRICE.CAULDRON;
            this.offer = { S, kind: 'cauldron', id: c.id, price, name: 'котёл', at: this._t };
            this._point(v, S, { x: c.x, y: c.y + 1.2, z: c.z });
            return HALL_LINES.cauldron(price);
        }
        if (G.kind === 'flask') {
            const list = this._goodsOf(S, (it) => it.kind === 'flask');
            if (!list.length) return HALL_LINES.soldOut;
            const n = Math.min(r.count || 1, list.length, 5);
            const price = n * HALL_PRICE.FLASK;
            this.offer = { S, kind: 'flask', uids: list.slice(0, n).map((L) => L.item.uid), price, name: `${n} ${flasksWord(n)}`, at: this._t };
            this._point(v, S, list[0].model.position);
            return `${n} ${flasksWord(n)} — ${price} монет${list.length < (r.count || 1) ? ` (больше нет: на столе ${list.length})` : ''}${(r.count || 1) > 5 ? ' — больше пяти за раз не унесёте' : ''}. Берёте?`;
        }
        if (G.kind === 'scroll') {
            const kf = g.knownScrollFn?.(g.localId);
            if (kf && kf({ kind: 'scroll', stat: 'spell', spell: G.spell })) return HALL_LINES.known;
        }
        const test = G.kind === 'potion' ? (it) => it.kind === 'potion' && it.rec === G.rec : (it) => it.kind === 'scroll' && it.spell === G.spell;
        const list = this._goodsOf(S, test);
        if (!list.length) return G.kind === 'scroll' && !S.stock?.some((e) => e.item.spell === G.spell) ? HALL_LINES.nothing.scrolls : HALL_LINES.soldOut;
        list.sort((a, b) => a.model.position.distanceToSquared(me) - b.model.position.distanceToSquared(me));
        const L = list[0];
        const name = G.kind === 'potion' ? recName(G.rec) : `свиток «${spellTitle(G.spell)}»`;
        this.offer = { S, kind: 'good', uids: [L.item.uid], price: L.item.shop.price, name, at: this._t };
        this._point(v, S, L.model.position);
        g.hud?.setVoice?.(`💰 ${name} — ${L.item.shop.price} монет. «Да» — купить (у вас ${g.inventory?.coins?.() ?? 0})`, true);
        return HALL_LINES.offer(name, L.item.shop.price);
    }

    /** «Да»: the coins are taken; the keeper brings the good (or, a guest, it comes into the hand at once). */
    _buy(v, S) {
        const g = this.game, o = this.offer, have = g.inventory?.coins?.() ?? 0;
        if (have < o.price) return HALL_LINES.noMoney(o.price - have);
        if (o.kind === 'cauldron') {
            if (!g.inventory.spendCoins(o.price)) return HALL_LINES.noMoney(o.price - have);
            g.cauldrons?.paid?.(o.id);
            this.offer = null;
            g.inventory._render?.();
            g.hud?.setVoice?.(`💰 Котёл куплен за ${o.price} (осталось ${g.inventory.coins()}) — он ваш, тащите его домой`, true);
            return HALL_LINES.cauldronPaid;
        }
        const Ls = o.uids.map((u) => g.items.loose.get(u)).filter((L) => L && L.item.shop && !L.item.shop.paid);
        if (Ls.length < o.uids.length) { this.offer = null; return HALL_LINES.soldOut; }
        if (!g.inventory.spendCoins(o.price)) return HALL_LINES.noMoney(o.price - have);
        for (const L of Ls) L.item.shop.paid = true;
        this.offer = null;
        g.inventory._render?.();
        g.hud?.setVoice?.(`💰 Куплено: ${o.name} за ${o.price} (осталось ${g.inventory.coins()})`, true);
        this.life?.rel?.bump?.(v, g.localId, { f: 0.8 }); // (a fair deal: he thinks a little better of me)
        if (g.authority && this._keeper(S) === v) {
            if (S.job?.L) S.job.L.hover = null;
            S.job = { do: 'fetch', Ls, phase: 'go', t: 0, path: null };
            return pick(['Сейчас принесу!', 'Минутку — несу.', 'Отличный выбор! Несу.']);
        }
        this._handOver(Ls);
        return pick(HALL_LINES.sold);
    }

    /** The hero's hand reached an unpaid good of a hall (Items._shopHint): the keeper names it and comes. True: it is a hall's. */
    handAt(L) {
        const g = this.game, sh = L?.item?.shop;
        if (!sh?.hall) return false;
        let S = null;
        for (const s of this.states.values()) if (s.stallKey === sh.stall) S = s;
        if (!S) return false;
        if (this.offer?.uids?.includes(L.item.uid)) return true;
        const v = this._keeper(S);
        const it = L.item;
        const name = it.kind === 'potion' ? recName(it.rec) : it.kind === 'scroll' ? `свиток «${spellTitle(it.spell)}»` : it.kind === 'flask' ? '1 колба' : (ITEM_INFO[it.kind]?.name || 'вещь').toLowerCase();
        if (it.kind === 'scroll') {
            const kf = g.knownScrollFn?.(g.localId);
            if (kf && kf(it)) { if (v) this.life._say(v, HALL_LINES.known, 5); return true; }
        }
        this.offer = { S, kind: it.kind === 'flask' ? 'flask' : 'good', uids: [it.uid], price: sh.price, name, at: this._t };
        S.mark = { p: L.model.position.clone(), t: 4 };
        g.hud?.setVoice?.(`💰 ${name} — ${sh.price} монет. Скажите «да», чтобы купить (у вас ${g.inventory?.coins?.() ?? 0})`, true);
        if (v) {
            this.life._say(v, HALL_LINES.offer(name, sh.price), 6);
            v.talking = 4; v.talkTo = g.localId;
            if (g.authority && !S.job) S.job = { do: 'come', t: 0, path: null, near: 2.4 };
        }
        return true;
    }

    // ---------------------------------------------------------------- the keeper
    /** (host, CastleLife) The keeper of a hall at his work. True: this step is his. */
    step(v, dt) {
        const S = this.stateOf(v), g = this.game, life = this.life;
        if (!S || !g.authority) return false;
        if (v.cs.def.stalls[v.entry.stall]?.guard) return false; // (the guard: at his post by the door for now)
        if (v.foe || v.dead || v.stunT > 0 || v.lev || v.carriedBy || v.pack > 0 || v.sleep || v.fleeT > 0) { this._abort(S); return false; }
        const me = g.character?.group.position;
        const inside = !!me && !g.combat?.dead && this._inRoom(S.h, me);
        // (the hero came in: greeted, the keeper comes up to him)
        if (inside && !S.inside) {
            S.cameAt = this._t;
            if (this._t - S.greetAt > HALL_LIFE.GREET_AGAIN) {
                S.greetAt = this._t;
                life._say(v, pick(HALL_LINES.welcome[S.h.kind]), 6);
                if (!S.job) S.job = { do: 'come', t: 0, path: null, near: 2.6 };
            }
        }
        S.inside = inside;
        if (S.job) return this._jobStep(v, S, dt, me, inside);
        if (inside) {
            const d = Math.hypot(me.x - v.x, me.z - v.z);
            // (far inside, silent a while: he calls him over and comes)
            if (d > 9 && this._t - S.heardAt > HALL_LIFE.CALL_AFTER && this._t - S.calledAt > 60 && this._t - S.cameAt > 8) {
                S.calledAt = this._t;
                life._say(v, pick(HALL_LINES.call[S.h.kind]), 5);
                S.job = { do: 'come', t: 0, path: null, near: 2.6 };
                return this._jobStep(v, S, dt, me, inside);
            }
            this._face(v, me.x, me.z, dt);
            v.speed = 0; v.mode = v.talking > 0 ? 'talk' : 'idle';
            life._ground(v);
            return true;
        }
        // (nobody in the shop: back behind his counter)
        const home = S.h.walk[S.h.home];
        if (Math.hypot(home.x - v.x, home.z - v.z) > 0.9) {
            S.job = { do: 'home', t: 0, path: null };
            return this._jobStep(v, S, dt, me, inside);
        }
        return false;
    }

    _jobStep(v, S, dt, me, inside) {
        const g = this.game, life = this.life, J = S.job;
        J.t += dt;
        switch (J.do) {
            case 'come': {
                if (!inside || J.t > 20) { S.job = null; break; }
                if (!J.path || J.t - (J.at || 0) > 1) { J.path = this._route(S, v, me); J.at = J.t; }
                const d = this._follow(v, J.path, dt, HALL_LIFE.WALK, J.near || 2.4, me);
                if (d <= (J.near || 2.4) + 0.2) { S.job = null; this._face(v, me.x, me.z, dt); }
                break;
            }
            case 'show': {
                if (J.phase === 'walk') {
                    if (!J.path) J.path = this._route(S, v, J.stand);
                    const d = this._follow(v, J.path, dt, HALL_LIFE.WALK, 0.35, J.stand);
                    if (d < 0.6 || J.t > 16) { J.phase = 'point'; J.t = 0; life._say(v, pick(HALL_LINES.here), 3); }
                } else {
                    v.speed = 0;
                    this._face(v, J.p.x, J.p.z, dt);
                    this._aim(v, J.p);
                    v.mode = 'cast';
                    if (J.t > 4.5) S.job = null;
                }
                break;
            }
            case 'fetch': {
                const L = J.Ls.find((x) => this.game.items.loose.get(x.item.uid) === x);
                if (!L) { S.job = null; break; } // (taken from the shelf by the hero himself — paid: his)
                if (J.phase === 'go') {
                    const p = L.model.position;
                    if (!J.stand) J.stand = this._stand(S, p);
                    if (!J.path) J.path = this._route(S, v, J.stand);
                    const d = this._follow(v, J.path, dt, HALL_LIFE.RUN, 0.35, J.stand);
                    if (d < 0.6 || J.t > 18) { J.phase = 'take'; J.t = 0; }
                } else if (J.phase === 'take') {
                    v.speed = 0; v.mode = 'work';
                    this._face(v, L.model.position.x, L.model.position.z, dt);
                    if (J.t > 0.6) {
                        for (const x of J.Ls) { if (g.items.loose.get(x.item.uid) === x) { x.hover = x.model.position.clone(); x.rest = false; } }
                        J.phase = 'bring'; J.t = 0; J.path = null;
                    }
                } else { // bring
                    this._carry(v, J.Ls);
                    if (!inside || J.t > 30 || g.combat?.dead) { this._toCounter(v, S, J.Ls); S.job = null; break; }
                    if (!J.path || J.t - (J.at || 0) > 1) { J.path = this._route(S, v, me); J.at = J.t; }
                    const d = this._follow(v, J.path, dt, HALL_LIFE.WALK, 1.9, me);
                    if (d <= 2.2) {
                        this._handOver(J.Ls);
                        life._say(v, pick(HALL_LINES.sold), 4);
                        S.job = null;
                    }
                }
                break;
            }
            case 'home': {
                const home = S.h.walk[S.h.home];
                if (inside || J.t > 25) { S.job = null; break; }
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

    /** The keeper's job dropped (scared, hit, lifted, killed): a good he carried falls where it is (paid: the hero's). */
    _abort(S) {
        const J = S.job;
        if (J?.Ls) for (const L of J.Ls) { if (L.hover) { L.hover = null; L.rest = false; } }
        S.job = null;
    }

    /** Show a place: the keeper walks to it and points (host); the sparks for everybody looking. */
    _point(v, S, p) {
        S.mark = { p: new THREE.Vector3(p.x, p.y, p.z), t: 7 };
        if (!this.game.authority || this._keeper(S) !== v) return;
        if (S.job?.do === 'fetch') return;
        S.job = { do: 'show', phase: 'walk', t: 0, path: null, p: S.mark.p, stand: this._stand(S, p) };
    }

    /** Where to stand before a place on a shelf: the nearest point of the aisle before it. */
    _stand(S, p) {
        let best = null, bd = Infinity;
        for (const s of [...S.h.slots, ...S.h.flasks]) {
            const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
            if (d < bd) { bd = d; best = s; }
        }
        const f = best?.face || { x: 0, z: 0 }, fl = Math.hypot(f.x, f.z) || 1;
        if (!best || bd > 4 || fl < 0.5) { // (a table, the cauldron: the walking point nearest to it)
            let w = null, wd = Infinity;
            for (const q of S.h.walk) { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < wd) { wd = d; w = q; } }
            const dx = p.x - w.x, dz = p.z - w.z, dl = Math.hypot(dx, dz) || 1, k = Math.max(0, dl - 1.6) / dl;
            return { x: w.x + dx * k, y: w.y, z: w.z + dz * k };
        }
        return { x: best.x + f.x / fl * 1.6, y: S.h.room.y, z: best.z + f.z / fl * 1.6 };
    }

    /** A path through the aisles' waypoints: from the one nearest to the keeper to the one nearest to the target, then the target. */
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
        // (the first waypoint behind the keeper, the last beyond the target: skipped when the next is as near)
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

    /** The goods in the keeper's hands, before his chest. */
    _carry(v, Ls) {
        const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
        Ls.forEach((L, i) => {
            if (!L.hover) return;
            const side = (i - (Ls.length - 1) / 2) * 0.22;
            L.hover.set(v.x - s * 0.62 + c * side, v.y + 2.05, v.z - c * 0.62 - s * side);
        });
    }

    /** Into the hero's hand (the other one, a slot, else at his feet — Items._gotItem). */
    _handOver(Ls) {
        const g = this.game, items = g.items;
        for (const L of Ls) {
            if (items.loose.get(L.item.uid) !== L) continue;
            L.hover = null;
            const side = !items.held.right ? 'right' : !items.held.left ? 'left' : 'slot';
            items.pickUp(L.item.uid, g.localId, side);
        }
    }

    /** The hero went away while the keeper brought it: the paid good lies on the counter — his. */
    _toCounter(v, S, Ls) {
        const c = S.def.stalls[S.h.stall].counter;
        Ls.forEach((L, i) => {
            if (this.game.items.loose.get(L.item.uid) !== L) return;
            L.hover = null;
            L.model.position.set((c.x0 + c.x1) / 2 + (i - (Ls.length - 1) / 2) * 0.3, c.top + 0.15, (c.z0 + c.z1) / 2);
            L.vel?.set(0, 0, 0); L.rest = true; L.perch = c;
            delete L.item.shop; // (paid: anybody's hand may take it now — the hero's)
        });
        this.life._say(v, HALL_LINES.onCounter, 5);
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

    dispose() { for (const S of this.states.values()) this._drop(S); this.states.clear(); this.offer = null; }
}
