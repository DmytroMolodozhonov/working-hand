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
 * With «Умные жители» on, a small neural net (src/ai/TalkMind.js) understands
 * any words and calls game actions (follow, stay, show the way, gather the
 * army, attack, defend the castle…); the villager says «Хм…» while it
 * thinks. The king's orders are obeyed, a stranger's orders to the army are
 * refused; VillagerOrders carries them out (on the host). In multiplayer a
 * guest without the net of their own asks the host's net (NetSync 'vask').
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
import { VillagerBrain, detectIntent } from './VillagerBrain.js';
import { Speech } from '../audio/Speech.js';
import { ITEM_INFO, itemValue, isMagicItem, newUid } from './ItemTypes.js';
import { TalkMind, thinkingLine } from '../ai/TalkMind.js';
import { detectOrder, toolsFor } from '../ai/TalkActions.js';
import { matchSpell } from '../fx/SpellManager.js';

export const HEAR = 7; // m: a villager hears you this far
const VOICE = 18; // m: a villager's voice carries this far
const SHOUT_RANGE = 55; // m: a battle cry / a call for help carries much farther
/** The master of cauldrons and potions (a wizards' house's stall): flasks and ingredients (the cauldron stands beside: Cauldrons.js). */
const POTION_GOODS = [{ kind: 'flask', price: 15, count: 3 }, { kind: 'apple', price: 35 }, { kind: 'crystal', price: 70 }];
const GOODS = [
    { kind: 'bread', price: 3 }, { kind: 'cheese', price: 4 }, { kind: 'pie', price: 6 }, { kind: 'steak', price: 6 },
    { kind: 'apple', price: 30 }, { kind: 'arrows', price: 8, count: 10 }, { kind: 'shield', price: 25, type: 0 }, { kind: 'bow', price: 30, type: 0 },
];
const _v = new THREE.Vector3();

/**
 * What is left of the whole answer after the part already said while the net wrote it
 * (compared by letters: the tidying may change a quote or a space). '' when it does not match — never said twice.
 */
export function restAfter(reply, head) {
    const key = (c) => c.toLowerCase().replace('ё', 'е');
    const letters = [...String(head)].filter((c) => /[\p{L}\p{N}]/u.test(c)).map(key);
    let k = 0, i = 0;
    const r = String(reply);
    for (; i < r.length && k < letters.length; i++) {
        if (!/[\p{L}\p{N}]/u.test(r[i])) continue;
        if (key(r[i]) !== letters[k]) return '';
        k++;
    }
    if (k < letters.length) return '';
    return r.slice(i).replace(/^[\s.,!?…;:—–]+/, '').trim();
}

const nameOf = (it) => (it.kind === 'weapon' ? (it.type === 'axe' ? 'топор' : 'меч') : (ITEM_INFO[it.kind]?.name || 'вещь')).toLowerCase();

export class CastleTalk {
    constructor(game, life) {
        this.game = game;
        this.life = life;
        this.speech = new Speech({
            engine: game.config?.villagerVoiceEngine === 'system' ? 'system' : 'neural',
            master: () => this.game.sound?.talkVolume ?? 1, // (their own slider: «Громкость голосов жителей»)
            onStatus: (st) => this._voiceStatus(st),
        });
        this.brains = new Map(); // villager id -> brain (lives while the villager is out)
        this.memories = new Map(); // villager id -> brain memory (for the next time)
        this.offer = null; // {v, kind:'buy'|'sell', price, uid?, wid?, item}
        this.stalls = new Map(); // stall key -> {goods: [uid], restockAt}
        this._scanT = 0;
        this._greetT = new Map();
        this.llm = null;
        this.mind = new TalkMind();
        this.hostSmart = false; // (a guest) the host's net answers for me
        this._asks = new Map(); // villager id -> time I asked the host (a guest)
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
                { id: v.id, name: v.name, role: this._trader(v) ? 'merchant' : v.role, female: v.entry.female, castleName: def.name, kingName: def.king, seed: v.entry.seed },
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
            nearbyGoods: this._trader(v) ? this._goodsOf(v) : [],
            heldItem: null,
            players: this._players(),
            selfId: g.localId,
            following: v.follow === g.localId,
            danger: v.cs.hostile.size > 0 || !!g.isNight,
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
        if (this._mute) return;
        // in a talk with me only my partner is heard: others' chatter never cuts the answer
        const P = this._partner;
        if (P && P !== v && !shout && !this._urgent && performance.now() - (P.talkedAt || -1e9) < 15000) return;
        this._lastSpoken = text;
        // a spell's word said aloud (a wizard practising, a cry in a duel): my microphone may hear it
        // from the speakers — it must not cast that spell from my hand (VoiceGate echo, until it is said)
        const sp = matchSpell(text);
        if (sp) this.game.voiceGate?.noteRemote(sp, performance.now() + Math.min(8000, 400 + text.length * 70));
        // an answer in a talk: what is written over the head is what you hear — now, not after older lines
        if (this._urgent) this.speech.cancel();
        const now = performance.now();
        this._spoken = (this._spoken || []).filter((l) => now - l.at < 12000);
        this._spoken.push({ text, at: now });
        // (× the game's sound volume inside Speech; a woman always with a female voice, a man with a male one)
        this.speech.say(text, { voiceKey: v.id, role: v.role, female: !!v.entry.female, volume, shout, append: !!this._more });
    }

    /** A line of the conversation with me: said at once (cutting what was being said), no chatter over it. */
    _sayReply(v, text, seconds = 5, broadcast = true) {
        if (!text) return;
        v.talkedAt = performance.now();
        this._partner = v;
        this._urgent = true;
        try { this.life._say(v, text, seconds, broadcast, true); } finally { this._urgent = false; }
    }

    /** The rest of an answer: after what the villager is saying now (not cutting it). */
    _sayMore(v, text, broadcast = true) {
        if (!text) return;
        v.talkedAt = performance.now();
        this._partner = v;
        this._more = true; // (said right after the line before it, nothing dropped)
        try { this.life._say(v, text, 5, broadcast, true); } finally { this._more = false; }
    }

    /** (host) a line of the answer to a guest: everybody near hears it; my own talk is not touched. */
    _sayForGuest(v, text, more = false) {
        if (!text) return;
        v.talkedAt = performance.now();
        this._more = more;
        try { this.life._say(v, text, 5, true, true); } finally { this._more = false; }
    }

    /**
     * (a guest) a villager I asked says a line of the host's answer: it is my talk — said at once,
     * cutting the «Хм…», the next lines after it. Returns false for any other line.
     */
    hostAnswer(v, text) {
        const a = this._asks.get(v.id);
        if (!a || !text) return false;
        if (!a.got) { a.got = true; this._sayReply(v, text, 5, false); } else this._sayMore(v, text, false);
        if (a.t0 && !a.logged) { a.logged = true; console.info(`[CastleTalk] host answered in ${Math.round(performance.now() - a.t0)} ms: «${text}»`); }
        return true;
    }

    /** «Хм…» while the net thinks: over the head only. */
    _sayThinking(v) {
        v.talkedAt = performance.now();
        this._partner = v;
        this._urgent = true; // (a short «Хм…» aloud; the answer cuts it)
        try { this.life._say(v, thinkingLine(v.role), 3); } finally { this._urgent = false; }
    }

    /** Am I in a talk with somebody right now (the last 15 s)? */
    inTalk() {
        const P = this._partner;
        return !!P && !P.dead && performance.now() - (P.talkedAt || -1e9) < 15000;
    }

    /**
     * Will this line be heard aloud by me? Then no words over the head (the author: the talk is by voice);
     * the words show only when no voice says them (voices off / still loading / too far to hear a word).
     */
    voiceCarries(v, shout = false) {
        if (this.game.config.villagerText === 'always' || !this.voiceOn || !this.speech.supported) return false;
        const sp = this.speech;
        const neural = sp.engine === 'neural' && sp.neural && sp.neural.state !== 'failed';
        if (neural && !sp.neural.ready) return false;
        // (the computer's voices: only if one of this villager's gender exists — else the words must show)
        if (!neural && !sp.pickVoice?.(v.id, !!v.entry?.female)) return false;
        const me = this.game.character.group.position;
        return Math.hypot(v.x - me.x, v.z - me.z) <= (shout ? SHOUT_RANGE : VOICE);
    }

    /** The neural voices download once: show its progress, then that they are ready. */
    _voiceStatus(st) {
        const hud = this.game.hud;
        const now = performance.now();
        if (st.state === 'loading') {
            if (now - (this._voiceNoteT || -1e9) < 4000) return;
            this._voiceNoteT = now;
            hud?.setVoice?.(`🗣️ ${st.text}${st.fraction != null ? ` (${Math.round(st.fraction * 100)}%)` : ''}`, true);
        } else if (st.state === 'ready') hud?.notify?.('🗣️ Голоса жителей готовы — у каждого свой голос');
        else if (st.state === 'failed') {
            console.warn('[CastleTalk]', st.text);
            hud?.notify?.('🗣️ Голоса жителей не загрузились — говорят голоса компьютера');
        }
    }

    /** The microphone heard a sentence (not a spell). Returns true if a villager heard it. */
    hear(text) {
        const g = this.game;
        if (!text || !this.life.enabled) return false;
        if (this._echo(text)) return false; // (a villager's own voice from the speakers in the microphone)
        const v = this._listener();
        if (!v) return false;
        const b = this.brain(v);
        const ctx = this._ctx(v);
        v.talking = 4;
        v.talkTo = g.localId;
        if (!g.authority) g.sync?.villagerTalk?.(v.id); // (the host stops them for the talk)
        const done = (res) => this._apply(v, res);
        // a guest without a net of their own: the host's net answers (not the market — that is mine)
        if (!g.authority && this.hostSmart && !this.llm?.ready && g.sync?.villagerAsk && this.offer?.v !== v) {
            const ask = { t0: performance.now(), got: false };
            this._asks.set(v.id, ask);
            this._sayThinking(v);
            g.sync.villagerAsk(v.id, text, { coins: ctx.coins, heldItem: ctx.heldItem, hostile: ctx.hostile });
            // (no answer in time: my own rules answer; the host already speaking: just stop waiting)
            setTimeout(() => { if (this._asks.get(v.id) !== ask) return; this._asks.delete(v.id); if (!ask.got) done(b.hear(text, ctx)); }, 12000);
            return true;
        }
        this.mind.llm = this.llm?.ready ? this.llm : null;
        if (!this.mind.llm) this._whyNoNet();
        const first = this.mind.first(b, text, ctx);
        if (first.done) { done(first.res); return true; } // (the rules: at once)
        const thinking = () => this._sayThinking(v);
        const t0 = performance.now();
        // (the first sentence of the net's answer is said as soon as it is written)
        const onSentence = (line, i) => (i > 0 ? this._sayMore(v, line) : this._sayReply(v, line));
        this.mind.ask(b, text, ctx, first, { onThinking: thinking, onSentence }).then((res) => {
            // (too slow on this computer: say so now and then — the answer came from the rules)
            if (this.mind.lastTimedOut) {
                this._slow = (this._slow || 0) + 1;
                if (this._slow >= 2 && performance.now() - (this._slowT || -1e9) > 180000) { this._slowT = performance.now(); g.hud.notify?.('🧠 Нейросеть жителей не успевает отвечать на этом компьютере — отвечают готовыми фразами'); }
            } else this._slow = 0;
            console.info(`[CastleTalk] ${res.smart ? 'net' : 'rules'} ${Math.round(performance.now() - t0)} ms: «${text}» → «${res.reply}»${res.action ? ` [${res.action}]` : ''}`);
            done(res);
        }, () => done(first.res));
        return true;
    }

    /** Players in the game (for orders by name: «атакуйте Олега»). */
    _players() {
        const g = this.game;
        const out = [{ id: g.localId, name: g.playerName?.(g.localId) || 'Вы' }];
        for (const [id, r] of g.remotes || []) out.push({ id, name: r.name || '' });
        return out.filter((p) => p.name);
    }

    /** (host) a guest talks to a villager: my net (or rules) answers, the orders are carried out here. */
    answerGuest(from, id, text, gctx = {}) {
        const g = this.game;
        const v = this.life.byId.get(id);
        if (!v || v.dead || !text) return;
        const b = this.brain(v);
        const st = this.life.state(v.cs.def.id);
        const ctx = {
            playerName: g.playerName?.(from) || null,
            playerIsKing: st.owner === from,
            hostile: v.cs.hostile.get(from) > Date.now(),
            coins: +gctx.coins || 0,
            nearbyGoods: this._trader(v) ? this._goodsOf(v) : [],
            heldItem: gctx.heldItem && typeof gctx.heldItem === 'object' ? { name: String(gctx.heldItem.name || '').slice(0, 30), magic: !!gctx.heldItem.magic, value: +gctx.heldItem.value || 0 } : null,
            players: this._players(),
            selfId: from,
            following: v.follow === from,
            danger: v.cs.hostile.size > 0 || !!g.isNight,
        };
        v.talking = 5; v.talkTo = from;
        this.mind.llm = this.llm?.ready ? this.llm : null;
        const send = (res) => {
            if (!res || v.dead) return;
            if (res.reply) {
                // (the start went to the guest already while the net wrote: only the rest now)
                const head = res.spoken;
                if (head) this._sayForGuest(v, restAfter(res.reply, head), true);
                else this._sayForGuest(v, res.reply);
            }
            if (res.action) this._act(v, res, from);
            g.sync?.villagerAnswer?.(from, id, { action: res.action || null, offer: res.offer || null });
        };
        const first = this.mind.first(b, text, ctx);
        if (first.done) send(first.res);
        // (the first sentence goes to the guest as soon as the net has written it — not after the whole answer)
        else this.mind.ask(b, text, ctx, first, { onSentence: (line, i) => this._sayForGuest(v, line, i > 0) }).then(send, () => send(first.res));
    }

    /** (a guest) the host's net answered: the line is already said; the market part is mine. */
    answered(id, res = {}) {
        const a = this._asks.get(id);
        if (!a) return;
        this._asks.delete(id);
        const v = this.life.byId.get(id);
        if (!v || v.dead) return;
        if (res.action === 'trade_yes' || res.action === 'trade_no') this._apply(v, { reply: '', action: res.action, offer: res.offer || null });
    }

    /** A villager hears me and these are words of a talk (an order, a greeting, a question…), not a spell. */
    claims(text) {
        if (!this.life.enabled || !this._listener()) return false;
        const spell = matchSpell(text);
        if (spell === 'Stand') return false; // («стоп» stops my spells first; with nothing to stop the villager hears it)
        if (detectOrder(text, this._players())) return true;
        const intent = detectIntent(text).intent;
        // («Бомбардо», «Инферно» said alone are spells, even if villagers like to talk about magic)
        if (spell && (intent === 'magic' || intent === 'unknown')) return false;
        return intent !== 'unknown';
    }

    /** Is what the microphone heard just the villager's own words from the speakers? */
    _echo(text) {
        const norm = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        const heard = norm(text);
        if (!heard) return false;
        const hw = heard.split(' ');
        // (the lines said in the last seconds: the neural voice speaks a little after the bubble, the microphone hears it later still)
        // Only a real echo: the heard words are a piece of what the villager said, in the same order —
        // never my own answer that repeats some of his words («Меня зовут Мария» → «меня зовут Дима»)
        const now = performance.now();
        for (const l of this._spoken || []) {
            if (now - l.at > 12000) continue;
            const said = norm(l.text);
            if (!said) continue;
            if (` ${said} `.includes(` ${heard} `) && (hw.length >= 2 || said === heard)) return true;
            const sw = new Set(said.split(' '));
            if (hw.length >= 4 && hw.filter((w) => sw.has(w)).length >= hw.length * 0.9) return true;
        }
        return false;
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
        if (res.reply) {
            // (the start was said already while the net wrote: only the rest now, after it)
            const head = res.spoken;
            if (head) { const rest = restAfter(res.reply, head); if (rest) this._sayMore(v, rest); }
            else this._sayReply(v, res.reply);
        }
        if ((res.offer && res.action !== 'trade_yes') || res.action === 'offer_goods') this._pitch = { v, at: performance.now() };
        const me = g.character.group.position;
        switch (res.action) {
            case 'trade_yes': this._tradeYes(v, res); break;
            case 'trade_no': if (this.offer?.v === v) this.offer.declined = true; break;
            default: if (res.action) this._act(v, res, g.localId);
        }
        v.yaw = Math.atan2(-(me.x - v.x), -(me.z - v.z));
    }

    /** What the villager agreed to do: movement and orders go to VillagerOrders (the host carries them out). */
    _act(v, res, by) {
        const a = res.action;
        if (a === 'hostile') { if (v.role === 'knight' || v.role === 'king') this.life.reportCrime(v, by, 'threat'); return; }
        if (a === 'call_guards') { this.life.reportCrime(v, by, 'threat'); return; }
        if (a === 'ignore' || a === 'offer_goods' || a.startsWith('trade_')) return;
        this.life.orders?.run(v, a, res.args || {}, by);
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
        for (const v of this.life.byId.values()) if (v.cs.def === def && this._trader(v) && v.entry.stall === i && !v.dead) return v;
        return null;
    }

    /** Sells and buys at a stall: a market merchant, or the wizards' master of cauldrons and potions. */
    _trader(v) {
        return v.role === 'merchant' || (v.role === 'seller' && !!v.cs?.def?.stalls?.[v.entry?.stall]?.potions);
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
                    const pick = stall.potions ? POTION_GOODS[k % POTION_GOODS.length] : GOODS[((n % GOODS.length) + GOODS.length) % GOODS.length];
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

    /** I started moving the master's cauldron away: he names its price. True if somebody sells it. */
    offerCauldron(c) {
        const [cid, s] = String(c.shop?.stall || '').split(':s');
        const cs = this.life.castles.get(cid);
        const v = cs ? this._merchantOf(cs.def, +s) : null;
        if (!v || v.foe) return false;
        this.offer = { v, kind: 'buy', price: c.shop.price, cauldron: c.id, item: { kind: 'cauldron' }, stall: c.shop.stall };
        const line = this.brain(v).priceLine({ name: 'котёл' }, c.shop.price, 'buy', this._ctx(v));
        v.talking = 4;
        this._sayReply(v, line, 6);
        this.game.hud.setVoice?.(`💰 Котёл — ${c.shop.price} монет: скажите «да», чтобы купить (у вас ${this.game.inventory.coins()})`, true);
        return true;
    }

    /** I dragged the master's cauldron far away unpaid: «Вор!» (nobody there to see — it is just mine). */
    cauldronStolen(c) {
        const [cid, s] = String(c.shop?.stall || '').split(':s');
        const cs = this.life.castles.get(cid);
        const v = cs ? this._merchantOf(cs.def, +s) : null;
        if (this.offer?.cauldron === c.id) this.offer = null;
        if (!v) return;
        this.life._say(v, 'Вор! Держи вора! Мой котёл!', 5);
        this.life.reportCrime(v, this.game.localId, 'theft');
        this.game.hud.setVoice?.('🚨 Вы утащили котёл, не заплатив! Мастер зовёт на помощь', true);
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
        this._sayReply(v, line, 6);
        this.game.hud.setVoice?.(`💰 ${item.shop.price} монет — скажите «да», чтобы купить (у вас ${this.game.inventory.coins()})`, true);
    }

    _tradeYes(v, res = null) {
        const g = this.game;
        const o = this.offer;
        // «да» right after the merchant named a good and its price (not to an old offer, not by chance)
        if ((!o || o.v !== v) && res?.offer?.kind === 'buy') {
            if (this._pitch?.v === v && performance.now() - this._pitch.at < 30000) { this._pitch = null; this._buyByWord(v, res.offer); }
            return;
        }
        if (!o || o.v !== v) return;
        if (o.kind === 'buy' && o.cauldron) {
            // the big cauldron I am moving away from the master's stall
            if (!g.inventory.spendCoins(o.price)) { this._sayReply(v, this.brain(v).noMoneyLine(this._ctx(v))); return; }
            g.cauldrons?.paid(o.cauldron);
            g.inventory._render?.();
            g.hud.setVoice?.(`💰 Котёл куплен за ${o.price} (осталось ${g.inventory.coins()}) — он ваш, тащите его домой`, true);
            this.offer = null;
            return;
        }
        if (o.kind === 'buy') {
            const item = this._findMine(o.uid);
            if (!item) { this.offer = null; return; }
            if (!g.inventory.spendCoins(o.price)) { this._sayReply(v, this.brain(v).noMoneyLine(this._ctx(v))); return; }
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
        if (!good) { this._sayReply(v, 'Ой, это уже разобрали...', 4); return; }
        if (!g.inventory.spendCoins(good.price)) { this._sayReply(v, this.brain(v).noMoneyLine(this._ctx(v))); return; }
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
                this._sayReply(v, line, 6);
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
                this.life._say(v, 'Вор! Держи вора!', 5);
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
            if (v.dead || v.foe || v.talking > 0 || now - (v.talkedAt || -1e9) < 600000 || this.inTalk()) continue; // (no new «привет» from one I talked with lately, nor in the middle of a talk)
            const d = Math.hypot(v.x - me.x, v.z - me.z);
            if (d > 5) continue;
            if (now - (this._greetT.get(v.id) || 0) < 90000) continue;
            this._greetT.set(v.id, now);
            // (the people of a house greet whoever comes in: a visit is no theft)
            if (v.role !== 'merchant' && v.role !== 'king' && v.job !== 'home' && Math.random() < 0.6) continue;
            const b = this.brain(v);
            const line = b.greet(this._ctx(v));
            if (line) {
                v.talking = 3;
                this.life._say(v, line, 5);
                if (b.lastAction === 'bow') v.bowing = 1.6;
                if (b.lastAction === 'offer_goods' && this._trader(v)) {
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
            // the net crashed in the middle of the game (the graphics card lost it…): start it again, at most 3 times
            const L = this.llm;
            if (L && this._llmWasReady && !L.ready && !L.loading && (this._llmRestarts || 0) < 3) {
                this._llmRestarts = (this._llmRestarts || 0) + 1;
                this.llmState = { state: 'loading', text: 'перезапускается' };
                g.hud.notify?.('🧠 Нейросеть жителей сбилась — перезапускаю (из памяти браузера, без скачивания)');
                L.load().then(() => { this.llmState = { state: 'ready', text: 'готова' }; g.hud.notify?.('🧠 Нейросеть жителей снова готова'); }, (e) => { console.warn('[CastleTalk] LLM restart failed:', e?.message || e); this.llmState = { state: 'failed', text: 'не перезапустилась' }; });
            }
            // (the neural voices load as soon as people are near — before anybody speaks, so nobody speaks with the computer's voice first)
            if (this.voiceOn && this.life.castles.size) this.speech.preload?.();
            if (g.config.villagerAI && g.config.villagerAI !== 'off' && !this.llm && !this._llmTried && this.life.castles.size) { this._llmTried = true; this._loadLLM(g.config.villagerAI); }
        }
        for (const v of this.life.byId.values()) if (v.talking > 0) v.talking -= dt;
        // (my partner stays with me for the whole talk — also while the net thinks — not only 4 s)
        if (this.inTalk() && this._partner.talking < 1 && !this._partner.foe) { this._partner.talking = 1; this._partner.talkTo = g.localId; }
        for (const [id] of this.brains) if (!this.life.byId.has(id)) this.forget({ id });
    }

    /**
     * Loads the villagers' net once (downloaded the first time — with progress —
     * then from the browser cache). 'auto' = only when the computer has a GPU
     * for the browser (on the processor it is too slow for a game).
     */
    async _loadLLM(setting) {
        const g = this.game;
        let LocalLLM;
        this.llmState = { state: 'loading', text: 'готовится' };
        try { ({ LocalLLM } = await import('../ai/LocalLLM.js')); } catch (e) { this.llmState = { state: 'failed', text: 'не загрузилась' }; return; }
        if (!LocalLLM.supported) { this.llmState = { state: 'failed', text: 'этот браузер её не умеет' }; return; }
        let gpu = false;
        // ('auto': a real graphics adapter, not only the word WebGPU in the browser)
        if (setting === 'auto') { try { gpu = !!(await navigator.gpu?.requestAdapter?.()); } catch (e) { gpu = false; } }
        let key = LocalLLM.pick(setting, gpu);
        if (!key) { this.llmState = { state: 'nogpu', text: 'не включилась: браузер не видит видеокарту (в настройках звука можно включить её вручную)' }; return; }
        while (key) {
            const llm = new LocalLLM({ model: key });
            this.llm = llm;
            const m = LocalLLM.MODELS[key];
            g.hud.notify?.(`🧠 Загружаю нейросеть жителей (${m.label}, один раз)...`);
            let last = 0;
            try {
                await llm.load((f, text) => {
                    const now = performance.now();
                    if (now - last < 1500 && f !== 1) return;
                    last = now;
                    this.llmState = { state: 'loading', text: `ещё скачивается${f != null ? ` (${Math.round(f * 100)}%)` : ''}` };
                    g.hud.setVoice?.(`🧠 ${text || 'Нейросеть жителей'}${f != null ? ` ${Math.round(f * 100)}%` : ''}`, true);
                });
                if (this.llm !== llm) return; // (disposed meanwhile)
                this.llmState = { state: 'ready', text: `готова (${m.label}, ${llm.device === 'webgpu' ? 'видеокарта' : 'процессор'})` };
                this._llmWasReady = true;
                this._warmLLM(llm);
                g.hud.notify?.('🧠 Нейросеть жителей готова — они понимают ваши слова и выполняют просьбы');
                g.sync?.villagerAI?.(true);
                return;
            } catch (e) {
                console.warn('[CastleTalk] no villager LLM:', key, e?.message || e);
                llm.dispose?.();
                if (this.llm === llm) this.llm = null;
                key = m.fallback || null;
            }
        }
        this.llmState = { state: 'failed', text: 'не загрузилась' };
        g.hud.notify?.('🧠 Нейросеть не загрузилась — жители говорят готовыми фразами (приказы всё равно понимают)');
    }

    /**
     * The first real question is slow (the graphics card prepares its work for a prompt of this size):
     * ask one in the background now, before anybody talks — a villager near, its role, the game actions.
     */
    _warmLLM(llm) {
        const v = [...this.life.byId.values()].find((x) => !x.dead);
        const b = v ? this.brain(v) : null;
        const ctx = v ? this._ctx(v) : {};
        const t0 = performance.now();
        llm.chat({
            system: b ? this.mind.systemPrompt(b, ctx) : 'Ты житель средневекового замка. Отвечай по-русски, коротко.',
            history: [],
            user: 'Привет, как дела?',
            tools: toolsFor(b?.role || 'farmer', ctx),
            maxTokens: 3,
        }).then(() => console.info(`[CastleTalk] the net warmed up in ${Math.round(performance.now() - t0)} ms`), () => {});
    }

    /** I talk to a villager without the net: say once in a while why (still downloading, no graphics card, failed, off). */
    _whyNoNet() {
        const g = this.game;
        if (this.llm?.ready || this.hostSmart) return;
        const now = performance.now();
        if (now - (this._whyT || -1e9) < 120000) return;
        this._whyT = now;
        const st = g.config.villagerAI === 'off' ? { text: 'выключена в настройках звука' } : this.llmState || { text: 'ещё не начала загружаться (подойдите к замку)' };
        g.hud.notify?.(`🧠 Нейросеть жителей ${st.text} — пока они отвечают готовыми фразами`);
    }

    dispose() {
        this.speech.cancel();
        this.llm?.dispose?.();
    }
}
