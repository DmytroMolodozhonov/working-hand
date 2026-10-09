/**
 * CastleTalk.js — talking to the castle people, and the market.
 *
 * Talking: say anything (no raised hand needed) to a villager near you —
 * only one within earshot (HEAR m) hears you, the one you face first. The
 * conversation brain (VillagerBrain) answers by the villager's role and mood
 * and remembers you; an optional local neural network re-phrases the answers.
 * The answer shows over the head and is spoken aloud; the farther the
 * villager, the quieter (nothing beyond VOICE m) — so do the shouts and the
 * chatter of the crowd.
 *
 * The market (every castle has one, before the gate): food lies on the stall
 * counters (sometimes arrows or a plain shield / bow; never magic).
 *  - Buy: take a thing from the counter — the merchant names the price;
 *    say «да» and the coins are paid, «нет» — put it back. Walk away with it
 *    unpaid and the merchant shouts «Вор!» (the guard comes).
 *  - Sell: put a thing (or a sword / an axe) on the counter — the merchant
 *    names a price (magic things are dear); say «да»: the thing is taken and
 *    a pouch of coins lies there — take it by hand. Up to 500 coins in a slot.
 */

import * as THREE from 'three';
import { VillagerBrain } from './VillagerBrain.js';
import { Speech } from '../audio/Speech.js';
import { ITEM_INFO, itemValue, isMagicItem, newUid } from './ItemTypes.js';

export const HEAR = 7; // m: a villager hears you this far
const VOICE = 18; // m: a villager's voice carries this far
const SHOUT_RANGE = 55; // m: a battle cry / a call for help carries much farther
const GOODS = [
    { kind: 'bread', price: 3 }, { kind: 'cheese', price: 4 }, { kind: 'pie', price: 6 }, { kind: 'steak', price: 6 },
    { kind: 'apple', price: 30 }, { kind: 'arrows', price: 8, count: 10 }, { kind: 'shield', price: 25, type: 0 }, { kind: 'bow', price: 30, type: 0 },
];
const _v = new THREE.Vector3();

const nameOf = (it) => (it.kind === 'weapon' ? (it.type === 'axe' ? 'топор' : 'меч') : (ITEM_INFO[it.kind]?.name || 'вещь')).toLowerCase();

export class CastleTalk {
    constructor(game, life) {
        this.game = game;
        this.life = life;
        this.speech = new Speech();
        this.brains = new Map(); // villager id -> brain (lives while the villager is out)
        this.memories = new Map(); // villager id -> brain memory (for the next time)
        this.offer = null; // {v, kind:'buy'|'sell', price, uid?, wid?, item}
        this.stalls = new Map(); // stall key -> {goods: [uid], restockAt}
        this._scanT = 0;
        this._greetT = new Map();
        this.llm = null;
        this.prepaid = new Set(); // goods paid by word, on their way to my hand
    }

    get voiceOn() { return this.game.config.villagerVoice !== false; }

    // ---------------------------------------------------------- brains
    brain(v) {
        let b = this.brains.get(v.id);
        if (!b) {
            const def = v.cs.def;
            const life = this.life;
            b = new VillagerBrain(
                { id: v.id, name: v.name, role: v.role, female: v.entry.female, castleName: def.name, kingName: def.king, seed: v.entry.seed },
                () => ({ castleName: def.name, kingName: life.state(def.id).kingDead ? (life.state(def.id).ownerName || def.king) : def.king, playerIsKing: life.state(def.id).owner === this.game.localId, timeOfDay: this.game.isNight ? 'night' : 'day', danger: v.cs.hostile.size > 0 }),
                { memory: this.memories.get(v.id) },
            );
            this.brains.set(v.id, b);
        }
        return b;
    }

    forget(v) {
        const b = this.brains.get(v.id);
        if (b) { this.memories.set(v.id, b.memory); this.brains.delete(v.id); }
    }

    _ctx(v) {
        const g = this.game;
        const st = this.life.state(v.cs.def.id);
        const ctx = {
            playerName: g.net?.active ? g.net.name : null,
            playerIsKing: st.owner === g.localId,
            hostile: v.cs.hostile.get(g.localId) > Date.now(),
            coins: g.inventory?.coins?.() ?? 0,
            nearbyGoods: v.role === 'merchant' ? this._goodsOf(v) : [],
            heldItem: null,
        };
        const held = g.items?.held.right || g.items?.held.left;
        if (held) ctx.heldItem = { name: nameOf(held.item), magic: isMagicItem(held.item), value: itemValue(held.item) };
        if (this.offer && this.offer.v === v) ctx.lastOffer = { item: { name: nameOf(this.offer.item) }, price: this.offer.price, kind: this.offer.kind };
        return ctx;
    }

    // ---------------------------------------------------------- speaking
    /** A villager says a line: over the head, and aloud for those close enough. */
    voice(v, text, shout = false) {
        if (!this.voiceOn || !this.speech.supported || !text) return;
        const me = this.game.character.group.position;
        const d = Math.hypot(v.x - me.x, v.z - me.z);
        const range = shout ? SHOUT_RANGE : VOICE;
        if (d > range) return;
        // a shout carries far and stays loud; a word is quiet beyond a few metres
        const volume = shout ? Math.max(0.3, Math.min(1, 1 - (d - 8) / (range - 8) * 0.7)) : Math.max(0, Math.min(1, 1 - (d - 4) / (VOICE - 4)));
        this._lastSpoken = text;
        const extra = shout ? this.speech.voiceParams({ voiceKey: v.id, role: v.role, female: v.entry.female }) : null;
        this.speech.say(text, { voiceKey: v.id, role: v.role, female: v.entry.female, volume, ...(extra ? { pitch: Math.min(2, extra.pitch + 0.12), rate: Math.min(2, extra.rate * 1.15) } : {}) });
    }

    /** The microphone heard a sentence (not a spell). Returns true if a villager heard it. */
    hear(text) {
        const g = this.game;
        if (!text || !this.life.enabled) return false;
        if (this.speech.speaking && this._echo(text)) return false; // (the villager's own voice in the microphone)
        const v = this._listener();
        if (!v) return false;
        const b = this.brain(v);
        const ctx = this._ctx(v);
        v.talking = 4;
        v.talkTo = g.localId;
        if (!g.authority) g.sync?.villagerTalk?.(v.id); // (the host stops them for the talk)
        const done = (res) => this._apply(v, res);
        if (this.llm?.ready) b.hearSmart(text, ctx, this.llm).then(done, () => done(b.hear(text, ctx)));
        else done(b.hear(text, ctx));
        return true;
    }

    /** Is what the microphone heard just the villager's own words from the speakers? */
    _echo(text) {
        const words = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
        const heard = words(text), said = new Set(words(this._lastSpoken));
        if (!heard.length || !said.size) return false;
        return heard.filter((w) => said.has(w)).length >= Math.max(1, heard.length * 0.6);
    }

    /** Who hears me: the nearest villager within earshot, the one in front first. */
    _listener() {
        const g = this.game;
        const me = g.character.group.position;
        const yaw = g.character.group.rotation.y;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        let best = null, bs = Infinity;
        for (const v of this.life.byId.values()) {
            if (v.dead) continue;
            const dx = v.x - me.x, dz = v.z - me.z;
            const d = Math.hypot(dx, dz);
            if (d > HEAR || Math.abs(v.y - (me.y - 1.95)) > 3) continue;
            const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
            let s = d - 2.5 * facing;
            if (this.offer && this.offer.v === v) s -= 3; // (the merchant we are bargaining with)
            if (s < bs) { bs = s; best = v; }
        }
        return best;
    }

    _apply(v, res) {
        if (!res || v.dead) return;
        const g = this.game;
        if (res.reply) { this.life._say(v, res.reply, 5); }
        const me = g.character.group.position;
        switch (res.action) {
            case 'trade_yes': this._tradeYes(v, res); break;
            case 'trade_no': if (this.offer?.v === v) this.offer.declined = true; break;
            case 'flee': v.fleeFrom = g.localId; v.fleeT = 10; v.fleeing = false; v.path = null; break;
            case 'bow': v.bowing = 1.6; break;
            case 'hostile':
                if (v.role === 'knight' || v.role === 'king') this.life.reportCrime(v, g.localId, 'threat');
                break;
            case 'call_guards': this.life.reportCrime(v, g.localId, 'threat'); break;
            case 'follow': if (v.job === 'wander') { v.follow = g.localId; v.followT = 90; v.path = null; } break;
            case 'stop_follow': v.follow = null; break;
            default:
                if (res.action?.startsWith('guide:') && v.job === 'wander') {
                    const tag = { 'guide:market': 'market', 'guide:throne': 'throneFront', 'guide:gate': 'gateOut' }[res.action];
                    const list = v.cs.graph.tagged(tag);
                    if (list.length) { v.waitT = 0; v.purpose = tag; this.life._goTo(v, list[0]); v.guiding = 30; }
                }
        }
        v.yaw = Math.atan2(-(me.x - v.x), -(me.z - v.z));
    }

    /** (from CastleLife) a line to say by itself, now and then. */
    ambientLine(v) {
        const b = this.brain(v);
        return b.ambient(this._ctx(v));
    }

    // ---------------------------------------------------------- market
    _stallKey(def, i) { return def.id + ':s' + i; }

    /** The goods lying on this merchant's counter, with prices. */
    _goodsOf(v) {
        const s = this.stalls.get(this._stallKey(v.cs.def, v.entry.stall));
        if (!s) return [];
        const out = [];
        for (const uid of s.goods) {
            const L = this.game.items.loose.get(uid);
            if (L && L.item.shop) out.push({ name: nameOf(L.item), price: L.item.shop.price, uid });
        }
        return out;
    }

    _merchantOf(def, i) {
        for (const v of this.life.byId.values()) if (v.cs.def === def && v.role === 'merchant' && v.entry.stall === i && !v.dead) return v;
        return null;
    }

    /** (host) keep goods on the counters of the markets near players. */
    _restock(now) {
        const g = this.game;
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            cs.def.stalls.forEach((stall, i) => {
                if (!this._merchantOf(cs.def, i)) return;
                const key = this._stallKey(cs.def, i);
                let s = this.stalls.get(key);
                if (!s) { s = { goods: [], restockAt: 0 }; this.stalls.set(key, s); }
                s.goods = s.goods.filter((uid) => g.items.loose.has(uid));
                if (s.goods.length >= 3 || now < s.restockAt) return;
                s.restockAt = now + (s.goods.length ? 90000 : 0);
                const c = stall.counter;
                const along = c.x1 - c.x0 >= c.z1 - c.z0;
                for (let k = s.goods.length; k < 3; k++) {
                    const n = cs.def.gx * 7 + cs.def.gz * 13 + i * 5 + k * 3 + Math.floor(now / 600000);
                    const pick = GOODS[((n % GOODS.length) + GOODS.length) % GOODS.length];
                    const price = Math.max(1, Math.round(pick.price * (0.85 + ((i * 37 + k * 11) % 30) / 100)));
                    const item = { kind: pick.kind, uid: newUid(), count: pick.count || 1, shop: { stall: key, price } };
                    if (pick.kind === 'shield') { item.type = pick.type; item.magic = false; item.max = 0; delete item.count; }
                    if (pick.kind === 'bow') { item.type = 0; item.magic = false; item.bonus = 0; item.arrows = 5; delete item.count; }
                    const f = (k + 0.5) / 3;
                    const x = along ? c.x0 + (c.x1 - c.x0 + 1) * f - 0.5 : (c.x0 + c.x1) / 2;
                    const z = along ? (c.z0 + c.z1) / 2 : c.z0 + (c.z1 - c.z0 + 1) * f - 0.5;
                    const L = g.items.spawnLoose(item, new THREE.Vector3(x, c.top + 0.3, z));
                    s.goods.push(L.item.uid);
                }
            });
        }
    }

    /** I took a good from a counter: the merchant names its price. */
    tookGood(item) {
        if (this.prepaid.delete(item.uid)) { delete item.shop; return; }
        const key = item.shop.stall;
        const [cid, s] = key.split(':s');
        const cs = this.life.castles.get(cid);
        const v = cs ? this._merchantOf(cs.def, +s) : null;
        if (!v) { delete item.shop; return; } // (nobody sells it any more)
        this.offer = { v, kind: 'buy', price: item.shop.price, uid: item.uid, item, stall: key };
        const line = this.brain(v).priceLine({ name: nameOf(item) }, item.shop.price, 'buy', this._ctx(v));
        v.talking = 4;
        this.life._say(v, line, 6);
        this.game.hud.setVoice?.(`💰 ${item.shop.price} монет — скажите «да», чтобы купить (у вас ${this.game.inventory.coins()})`, true);
    }

    _tradeYes(v, res = null) {
        const g = this.game;
        const o = this.offer;
        if ((!o || o.v !== v) && res?.offer?.kind === 'buy') { this._buyByWord(v, res.offer); return; }
        if (!o || o.v !== v) return;
        if (o.kind === 'buy') {
            const item = this._findMine(o.uid);
            if (!item) { this.offer = null; return; }
            if (!g.inventory.spendCoins(o.price)) { this.life._say(v, this.brain(v).noMoneyLine(this._ctx(v)), 5); return; }
            delete item.shop;
            g.inventory._render?.();
            g.hud.setVoice?.(`💰 Куплено: ${nameOf(item)} за ${o.price} (осталось ${g.inventory.coins()})`, true);
            this.offer = null;
            return;
        }
        // sell: the merchant takes the thing, a pouch of coins lies in its place
        const p = o.pos;
        if (g.authority) this.sellNow(o.uid, o.wid, o.price, p);
        else g.sync?.tradeSell?.(o.uid, o.wid, o.price, [p.x, p.y, p.z]);
        g.hud.setVoice?.(`💰 Продано за ${o.price} монет — возьмите мешочек с прилавка`, true);
        this.offer = null;
    }

    /** «да» to what the merchant offered by word: the good comes off the counter into my hand. */
    _buyByWord(v, offer) {
        const g = this.game;
        const want = String(offer.item?.name || offer.item || '').toLowerCase();
        const good = this._goodsOf(v).find((x) => x.name === want || want.includes(x.name.slice(0, 4))) || null;
        if (!good) { this.life._say(v, 'Ой, это уже разобрали...', 4); return; }
        if (!g.inventory.spendCoins(good.price)) { this.life._say(v, this.brain(v).noMoneyLine(this._ctx(v)), 5); return; }
        this.prepaid.add(good.uid);
        const side = g.items.held.right ? 'left' : 'right';
        if (g.authority) {
            const L = g.items.loose.get(good.uid);
            if (L) delete L.item.shop;
            g.items.pickUp(good.uid, g.localId, side);
        } else g.sync?.itemTake?.(good.uid, side);
        g.hud.setVoice?.(`💰 Куплено: ${good.name} за ${good.price} (осталось ${g.inventory.coins()})`, true);
    }

    /** (host) the sale happens: the thing is gone, coins lie on the counter. */
    sellNow(uid, wid, price, p) {
        const g = this.game;
        if (uid && g.items.loose.has(uid)) g.items.pickUp(uid, '#merchant', 'right');
        else if (wid) { const w = g.weapons.byId.get(wid); if (w) { g.weapons.remove(w); g.sync?.weaponGone?.(w); } }
        else return;
        g.items.spawnLoose({ kind: 'coins', uid: newUid(), count: Math.max(1, Math.min(500, Math.round(price))) }, new THREE.Vector3(p.x, p.y + 0.3, p.z));
    }

    /** A thing of mine in my hands or slots, by uid. */
    _findMine(uid) {
        const g = this.game;
        for (const side of ['right', 'left']) if (g.items.held[side]?.item.uid === uid) return g.items.held[side].item;
        return g.inventory.slots.find((s) => s && s.uid === uid) || null;
    }

    _unpaid() {
        const g = this.game;
        const out = [];
        for (const side of ['right', 'left']) { const it = g.items.held[side]?.item; if (it?.shop) out.push(it); }
        for (const s of g.inventory.slots) if (s && s.shop) out.push(s);
        return out;
    }

    /** Things put on a counter (to sell) and things carried away unpaid (stolen). */
    _watchMarket() {
        const g = this.game;
        const me = g.character.group.position;
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            cs.def.stalls.forEach((stall, i) => {
                const c = stall.counter;
                const key = this._stallKey(cs.def, i);
                if (Math.hypot((c.x0 + c.x1) / 2 - me.x, (c.z0 + c.z1) / 2 - me.z) > 9) return;
                const v = this._merchantOf(cs.def, i);
                if (!v || v.foe || cs.hostile.get(g.localId) > Date.now()) return;
                const on = (p) => p.x >= c.x0 - 0.7 && p.x <= c.x1 + 0.7 && p.z >= c.z0 - 0.7 && p.z <= c.z1 + 0.7 && p.y > c.top - 0.3 && p.y < c.top + 1.2;
                let found = null;
                for (const L of g.items.loose.values()) {
                    if (L.item.shop || L.item.kind === 'coins' || L.hover) continue;
                    const sp = L.model.position;
                    if (!on(sp) || L.vel.lengthSq() > 0.05) continue;
                    found = { uid: L.item.uid, item: L.item, pos: sp.clone() };
                    break;
                }
                if (!found) {
                    for (const w of g.weapons.weapons) {
                        if (w.holder || w.hover || w.stuckIn || !w.sleeping || !on(w.position)) continue;
                        found = { wid: w.id, item: { kind: 'weapon', type: w.type, magic: !!w.magic, bonus: w.bonus || 0 }, pos: w.position.clone() };
                        break;
                    }
                }
                if (!found) return;
                if (this.offer && (this.offer.uid ? this.offer.uid === found.uid : this.offer.wid === found.wid)) return;
                const price = Math.max(1, itemValue(found.item));
                this.offer = { v, kind: 'sell', price, ...found, stall: key };
                const line = this.brain(v).priceLine({ name: nameOf(found.item), magic: isMagicItem(found.item) }, price, 'sell', this._ctx(v));
                v.talking = 4;
                this.life._say(v, line, 6);
                g.hud.setVoice?.(`💰 Торговец даёт ${price} монет — скажите «да», чтобы продать`, true);
            });
        }
        // walked away with an unpaid good: «Вор!»
        for (const it of this._unpaid()) {
            const [cid, s] = it.shop.stall.split(':s');
            const cs = this.life.castles.get(cid);
            const stall = cs?.def.stalls[+s];
            if (!stall) { delete it.shop; continue; }
            if (Math.hypot(stall.front.x - me.x, stall.front.z - me.z) < 14) continue;
            const v = this._merchantOf(cs.def, +s);
            delete it.shop;
            if (this.offer?.uid === it.uid) this.offer = null;
            if (v) {
                this.life._say(v, 'Вор! Держи вора! Стража!', 5);
                this.life.reportCrime(v, g.localId, 'theft');
                g.hud.setVoice?.('🚨 Вы ушли, не заплатив! Торговец зовёт стражу', true);
            }
        }
    }

    // ---------------------------------------------------------- greetings
    _greetings(now) {
        const g = this.game;
        const me = g.character.group.position;
        for (const v of this.life.byId.values()) {
            if (v.dead || v.foe || v.talking > 0) continue;
            const d = Math.hypot(v.x - me.x, v.z - me.z);
            if (d > 5) continue;
            if (now - (this._greetT.get(v.id) || 0) < 90000) continue;
            this._greetT.set(v.id, now);
            if (v.role !== 'merchant' && v.role !== 'king' && Math.random() < 0.6) continue;
            const b = this.brain(v);
            const line = b.greet(this._ctx(v));
            if (line) {
                v.talking = 3;
                this.life._say(v, line, 5);
                if (b.lastAction === 'bow') v.bowing = 1.6;
                if (b.lastAction === 'offer_goods' && v.role === 'merchant') {
                    // (a plain «да» now buys what was offered — the merchant hands it over from the counter)
                    this._pitch = { v, at: now };
                }
            }
        }
    }

    // ---------------------------------------------------------- frame
    update(dt) {
        const g = this.game;
        const now = performance.now();
        this._scanT -= dt;
        if (this._scanT <= 0) {
            this._scanT = 0.5;
            if (g.authority) this._restock(now);
            this._watchMarket();
            this._greetings(now);
            // offers expire when you walk away
            if (this.offer) {
                const me = g.character.group.position;
                if (this.offer.v.dead || Math.hypot(this.offer.v.x - me.x, this.offer.v.z - me.z) > 16) this.offer = null;
            }
            if (g.config.villagerAI && g.config.villagerAI !== 'off' && !this.llm && this.life.castles.size) this._loadLLM(g.config.villagerAI);
        }
        for (const v of this.life.byId.values()) if (v.talking > 0) v.talking -= dt;
        for (const [id] of this.brains) if (!this.life.byId.has(id)) this.forget({ id });
    }

    async _loadLLM(model) {
        const g = this.game;
        try {
            const { LocalLLM } = await import('../ai/LocalLLM.js');
            if (!LocalLLM.supported) return;
            this.llm = new LocalLLM({ model });
            g.hud.notify?.('🧠 Загружаю нейросеть жителей (один раз)...');
            let last = 0;
            await this.llm.load((f, text) => {
                const now = performance.now();
                if (now - last < 4000) return;
                last = now;
                g.hud.setVoice?.(`🧠 ${text || 'Нейросеть жителей'}${f != null ? ` ${Math.round(f * 100)}%` : ''}`, true);
            });
            g.hud.notify?.('🧠 Нейросеть жителей готова — они отвечают своими словами');
        } catch (e) {
            console.warn('[CastleTalk] no villager LLM:', e?.message || e);
            g.hud.notify?.('🧠 Нейросеть не загрузилась — жители говорят готовыми фразами');
        }
    }

    dispose() {
        this.speech.cancel();
        this.llm?.dispose?.();
    }
}
