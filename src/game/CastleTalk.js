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
 *  - Buy: every good has a little card with its price beside it, and lies
 *    on the counter until it is paid for (the hand can't take it before).
 *    Put a pouch of coins on the counter — the merchant asks what you want;
 *    name the good («щит», «хлеб»): its price is taken from the pouch (all
 *    of it — he takes the pouch with his hand; more — the rest stays there
 *    for you), the price card goes and the good is yours to take. Not
 *    enough coins in the pouch — he says so: choose something else.
 *  - Sell: put a thing (or a sword / an axe) on the counter — the merchant
 *    names a price (magic things are dear); say «да»: the thing is taken and
 *    a pouch of coins lies there — take it by hand. Up to 500 coins in a slot.
 */

import * as THREE from 'three';
import { VillagerBrain, detectIntent } from './VillagerBrain.js';
import { Speech } from '../audio/Speech.js';
import { ITEM_INFO, itemValue, isMagicItem, newUid } from './ItemTypes.js';
import { MAGIC_POUCH_PRICE, makeMagicPouch } from './CoinBelt.js';
import { ARMOR, PIECES, makePiece, makeRobe, armorName } from './ArmorTypes.js';
import { TalkMind, fillerLine, fillerPool, isEnglishText } from '../ai/TalkMind.js';
import { detectOrder, toolsFor, TOOLS } from '../ai/TalkActions.js';
import { matchSpell } from '../fx/SpellManager.js';
import { DANGERS } from './Danger.js';
import { stallTrade, counterZone } from './MarketGoods.js';
import { wizardGood, pawnPrice, fenceTakes } from './WizardMarket.js';
import { DealPrices, dealKey, overCounter } from './BuyerDeal.js';
import { BuyerSigns } from './BuyerSigns.js';
import { bookSpells } from './BookBirds.js';
import { magicStallGood } from './HamletLife.js';
import { pushOutOfRect } from '../world/Collision.js';

export const HEAR = 7; // m: a villager hears you this far
const VOICE = 35; // m: a villager's voice carries this far
const SHOUT_RANGE = 60; // m: a battle cry / a call for help carries much farther
/** The master of cauldrons and potions (a wizards' house's stall): flasks and ingredients (the cauldron stands beside: Cauldrons.js). */
const POTION_GOODS = [{ kind: 'flask', price: 15, count: 3 }, { kind: 'apple', price: 35 }, { kind: 'crystal', price: 70 }];
/** … its third place: a crystal, or (now and then) a magic robe for 1000 coins, a piece of magic armour (ArmorTypes), a magic coin pouch (CoinBelt). */
const WIZARD_RARE = [{ kind: 'crystal', price: 70 }, { kind: 'robe', price: ARMOR.ROBE_PRICE, fixed: true }, { kind: 'armor', price: ARMOR.PIECE_PRICE }, { kind: 'magicPouch', price: MAGIC_POUCH_PRICE, fixed: true }];
const _v = new THREE.Vector3();
/** A villager's short line when something in a talk went wrong (the reason goes to the journal). */
const TALK_SORRY = ['Хм… прости, мысль убежала.', 'Ох, о чём это я… Давай потом.', 'Погоди-ка, сбилась мысль.', 'Повтори-ка потом, путник.'];
const pickLine = (arr) => arr[Math.floor(Math.random() * arr.length) % arr.length];

/**
 * A line about the villagers' net for the game's journal (settings → «Журнал», via server.py) and the
 * console — never for the player on the screen. Not served by the game's own server: only the console.
 */
export function journal(line) {
    console.info('[Жители]', line);
    try {
        if (typeof fetch !== 'function' || typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;
        fetch('/api/gamelog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: 'Жители', line: String(line) }) }).catch(() => {});
    } catch (_) { /* ignore */ }
}
const GOOD_IN = 0.35, PAID_IN = 0.2; // m from the counter's front edge: a good lying there; a paid one pushed to the buyer

/** Across a stall's counter: the line `inset` m behind its front edge (the buyer's side). */
export function frontEdge(stall, inset) {
    const c = stall.counter;
    const along = c.x1 - c.x0 >= c.z1 - c.z0; // (the counter long in x: its front is across z)
    const lo = along ? c.z0 : c.x0, hi = along ? c.z1 : c.x1;
    const mid = (lo + hi) / 2, f = along ? stall.front.z : stall.front.x;
    return f >= mid ? hi + 0.5 - inset : lo - 0.5 + inset;
}

/** Is this point lying on (just above) the stall's counter top? */
export function onCounter(stall, p) {
    const c = stall.counter;
    return p.x >= c.x0 - 0.7 && p.x <= c.x1 + 0.7 && p.z >= c.z0 - 0.7 && p.z <= c.z1 + 0.7 && p.y > c.top - 0.3 && p.y < c.top + 1.2;
}

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

/** Words a good is called by (its name's words, and what people say for it). */
const ALIAS = { armor: ['шлем', 'нагруд', 'понож', 'доспех', 'брон'], magicPouch: ['мешоч', 'магич', 'кошел', 'кошел'], steak: ['мяс', 'стейк', 'жарен'], meat: ['сыро'], redApple: ['яблок', 'красн'], wool: ['шерст', 'пряж'], glass: ['стекл', 'осколк'], flask: ['колб', 'фляг', 'бутыл', 'склян'], crystal: ['кристал'], apple: ['яблок', 'золот'], arrows: ['стрел'], bow: ['лук'], shield: ['щит'], cheese: ['сыр'], bread: ['хлеб'], pie: ['пирог', 'пирож'] };
const normWords = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
/** How well this text names this good: the letters of its words matched (0 — not named). */
export function nameScore(text, item) {
    const words = normWords(text);
    const kind = item.kind === 'coins' && item.magic ? 'magicPouch' : item.kind;
    const stems = [...(ALIAS[kind] || normWords(ITEM_INFO[item.kind]?.name || '').filter((w) => w.length >= 3).map((w) => w.slice(0, Math.max(3, w.length - 2))))];
    if (item.kind === 'weapon') stems.push(item.type === 'axe' ? 'топор' : 'меч');
    let n = 0;
    for (const st of stems) if (words.some((w) => w.startsWith(st) && (st.length > 3 || w.length <= st.length + 2))) n += st.length;
    return n;
}
/** Does this text name this good? */
export const namesGood = (text, item) => nameScore(text, item) > 0;
/** The good this text names best ({item, price}…); a tie — the cheaper (a plain apple, not the golden one). */
export function namedGood(text, goods) {
    let best = null, bs = 0;
    for (const g of goods) {
        const sc = nameScore(text, g.item);
        if (sc > bs || (sc === bs && sc > 0 && g.price < best.price)) { bs = sc; best = g; }
    }
    return best;
}

const nameOf = (it) => (it.kind === 'coins' && it.magic ? 'магический мешочек' : it.kind === 'armor' || it.kind === 'robe' ? armorName(it).toLowerCase() : it.kind === 'weapon' ? (it.type === 'axe' ? 'топор' : 'меч') : (ITEM_INFO[it.kind]?.name || 'вещь')).toLowerCase();

const _tagBox = new THREE.Box3();
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
        this.deals = new DealPrices(); // the sums named by the pawnshop / the shady buyer: the same thing, the same sum (BuyerDeal.js)
        this.signs = new BuyerSigns(game); // the «Скупка» plaques
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
                { id: v.id, name: v.name, role: this._trader(v) ? 'merchant' : v.role, female: v.entry.female, castleName: def.name, kingName: def.king, seed: v.entry.seed, wizardRank: v.wizard ? v.entry.rank : undefined, wanderer: v.role === 'wanderer', town: !!v.entry?.town, elder: !!v.entry?.elder },
                () => ({ castleName: def.name, kingName: life.state(def.id).kingDead ? (life.state(def.id).ownerName || def.king) : def.king, playerIsKing: life.state(def.id).owner === this.game.localId, kingDead: !!life.state(def.id).kingDead, timeOfDay: this.game.isNight ? 'night' : 'day', danger: v.cs.hostile.size > 0 }),
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
            coins: (g.inventory?.coins?.() ?? 0) + (this._trader(v) ? this._counterCoins(v.cs.def, v.entry.stall).reduce((n, L) => n + (L.item.count || 0), 0) : 0), // (a pouch on his counter pays too)
            nearbyGoods: this._trader(v) ? this._goodsOf(v) : [],
            heldItem: null,
            players: this._players(),
            selfId: g.localId,
            following: v.follow === g.localId,
            danger: v.cs.hostile.size > 0 || !!g.isNight,
            buys: !!(v.cs.def.stalls?.[v.entry?.stall]?.pawn || v.cs.def.stalls?.[v.entry?.stall]?.fence), // (who buys things at all: the pawnshop, the shady buyer)
        };
        const held = g.items?.held.right || g.items?.held.left;
        if (held) ctx.heldItem = { name: nameOf(held.item), magic: isMagicItem(held.item), value: itemValue(held.item) };
        // (a buyer names only the sum of the code — the one kept for this thing at his stall — never an invented one)
        if (ctx.buys) {
            const o = this.offer, sold = o && o.v === v && o.kind === 'sell';
            const thing = sold ? o.item : held?.item;
            if (thing) {
                const sk = this._stallKey(v.cs.def, v.entry.stall);
                const price = sold ? o.price : (thing.uid ? this.deals.peek(sk, 'u' + thing.uid, performance.now()) : null) ?? pawnPrice(thing);
                ctx.heldItem = { name: nameOf(thing), magic: isMagicItem(thing), value: itemValue(thing), price };
            }
        }
        if (this.offer && this.offer.v === v) ctx.lastOffer = { item: { name: nameOf(this.offer.item) }, price: this.offer.price, kind: this.offer.kind };
        // (what just happened round him: the net answers about it — «что это грохнуло?»)
        const fk = v.fear?.danger?.kind;
        if (fk && DANGERS[fk]) ctx.recent = `рядом ${DANGERS[fk].ru}${v.fear.state === 'look' ? ' — ты насторожился' : ' — тебе страшно'}`;
        return ctx;
    }

    // ---------------------------------------------------------- speaking
    /** A villager says a line: over the head, and aloud for those close enough. */
    voice(v, text, shout = false) {
        if (!this.voiceOn || !this.speech.supported || !text) return;
        if (v.dead || v.stunT > 0) return; // (the dead and the knocked out say nothing)
        const me = this.game.character.group.position;
        const d = Math.hypot(v.x - me.x, v.z - me.z);
        const range = shout ? SHOUT_RANGE : VOICE;
        if (d > range) return;
        // a shout carries far and stays loud; a word is quiet beyond a few metres
        const volume = this._loud(v, shout).volume;
        if (volume < 0.03) return;
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
        this.speech.say(text, { voiceKey: v.id, role: v.role, female: !!v.entry.female, volume, shout, append: !!this._more, live: () => this._loud(v, shout) });
    }

    /** How loud the villager is for me right now: by distance from where he stands, dull through a wall, from his side. */
    _loud(v, shout) {
        if (v.dead || v.stunT > 0) return { volume: 0 };
        const g = this.game, me = g.character.group.position;
        const dx = v.x - me.x, dz = v.z - me.z;
        const d = Math.hypot(dx, dz, ((v.y ?? me.y) - me.y) * 0.5);
        const range = shout ? SHOUT_RANGE : VOICE;
        if (d > range) return { volume: 0 };
        // (falls off to nothing at the limit; a shout stays louder)
        const k = Math.max(0, Math.min(1, 1 - (d - 4) / (range - 4)));
        let volume = shout ? Math.max(0.12, k) : k * k;
        const c = g.collision;
        const muffled = !!(c?.lineOfSight && d > 3 && !c.lineOfSight(v.x, (v.y ?? me.y) + 1.6, v.z, me.x, me.y + 0.5, me.z, 0.6));
        if (muffled) volume *= 0.45;
        const yaw = g.character.group.rotation.y;
        const pan = d > 1 ? (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d * 0.8 : 0;
        return { volume, muffled, pan };
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
        if (!a.got) { a.got = true; this._sayAnswer(v, text, false); } else this._sayMore(v, text, false);
        if (a.t0 && !a.logged) { a.logged = true; console.info(`[CastleTalk] host answered in ${Math.round(performance.now() - a.t0)} ms: «${text}»`); }
        return true;
    }

    /** «Хм…» while the net thinks: over the head only. */
    _sayThinking(v, text = '', intent = '') {
        v.talkedAt = performance.now();
        this._partner = v;
        // (his own words while he thinks — by role, a woman's own, by the question, in my language; never the same
        // twice running; those already made in his voice first: heard at once, not after a wait)
        const vo = this._voiceOpts(v);
        const line = fillerLine({ role: v.role, female: vo.female, wizard: !!v.wizard, text, intent, last: v.lastFiller || this._lastFiller, ready: (l) => this.speech.isReady?.(l, vo) }, Math.random);
        v.lastFiller = line; this._lastFiller = line;
        this._filler = { v, at: performance.now() };
        this._urgent = true; // (said at once, cutting other talk; the answer follows it)
        try { this.life._say(v, line, 3); } finally { this._urgent = false; }
    }

    /** How this villager's voice is chosen (the same for a line said and a line made in advance). */
    _voiceOpts(v) { return { voiceKey: v.id, role: v.role, female: !!v.entry?.female }; }

    /**
     * The thinking words of the villagers near me are made in their own voices in advance (a few each, of every
     * kind: a question, a request, a trade, a greeting) — so «Хм…» / «Я понял…» is heard the moment I stop speaking.
     */
    _prepareFillers() {
        const sp = this.speech;
        if (!this.voiceOn || !sp?.prepare || !sp.neural?.ready || !this.llm?.ready) return;
        const me = this.game.character.group.position;
        const lang = this._en ? 'en' : 'ru';
        const near = this.life.targets().filter((v) => !v.dead && Math.hypot(v.x - me.x, v.z - me.z) < 12)
            .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z)).slice(0, 2);
        for (const v of near) {
            if (v._fillersMade === lang) continue;
            v._fillersMade = lang;
            const vo = this._voiceOpts(v);
            const base = { role: v.role, female: vo.female, wizard: !!v.wizard, lang };
            const take = (kind, n) => fillerPool({ ...base, kind }).sort(() => Math.random() - 0.5).slice(0, n);
            sp.prepare([...take(null, 4), ...take('question', 3), ...take('request', 3), ...take(v.role === 'merchant' ? 'trade' : 'greet', 2)], vo);
        }
    }

    /** The answer's first words: right after his «Дай-ка подумать…» (no cut, no gap) — or at once. */
    _sayAnswer(v, text, broadcast = true) {
        const F = this._filler;
        if (F && F.v === v && performance.now() - F.at < 5000) { this._filler = null; this._sayMore(v, text, broadcast); }
        else this._sayReply(v, text, 5, broadcast);
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
        // (the voices load quietly in the background: nothing for the player to read in the game — the author)
        if (st.state === 'failed') console.warn('[CastleTalk]', st.text);
        else if (st.state === 'ready') console.info('[CastleTalk]', st.text);
    }

    /**
     * The microphone heard a sentence (not a spell). Returns true if a villager heard it.
     * A talk never breaks the game: any error in it — the villager says a short line, the reason goes to the journal.
     */
    hear(text) {
        try { return this._hear(text); } catch (e) {
            this._talkFailed(e);
            return true;
        }
    }

    /** Something in a talk went wrong: a short line from the villager I talk to, the reason in the journal. */
    _talkFailed(e, v = this._partner) {
        const why = String(e?.message || e || 'ошибка').slice(0, 200);
        console.warn('[CastleTalk] a talk failed:', e);
        if ((this._failLogged = (this._failLogged || 0) + 1) <= 20) journal(`ошибка в разговоре (житель ответил заготовленной фразой): ${why}`);
        try { if (v && !v.dead) this._sayReply(v, pickLine(TALK_SORRY)); } catch (_) { /* (nothing more to do) */ }
    }

    _hear(text) {
        const g = this.game;
        if (!text || !this.life.enabled) return false;
        if (this._echo(text)) return false; // (a villager's own voice from the speakers in the microphone)
        const v = this._listener();
        if (!v) return false;
        this._en = isEnglishText(text); // (my language: the thinking words made in advance follow it)
        if (this.life.night?.heard(v, text)) return true; // (asleep: a mumble; a merchant at night: «come in the morning»)
        // (a coin pouch on his counter and a good named: the purchase — VillagerBrain is not asked)
        if (this._trader(v) && this._payByName(v, text)) { v.talking = 4; v.talkTo = g.localId; return true; }
        const b = this.brain(v);
        const ctx = this._ctx(v);
        v.talking = 4;
        v.talkTo = g.localId;
        if (!g.authority) g.sync?.villagerTalk?.(v.id); // (the host stops them for the talk)
        const done = (res) => { try { this._apply(v, res); } catch (e) { this._talkFailed(e, v); } };
        // a guest without a net of their own: the host's net answers (not the market — that is mine)
        if (!g.authority && this.hostSmart && !this.llm?.ready && g.sync?.villagerAsk && this.offer?.v !== v) {
            const ask = { t0: performance.now(), got: false };
            this._asks.set(v.id, ask);
            this._sayThinking(v, text);
            g.sync.villagerAsk(v.id, text, { coins: ctx.coins, heldItem: ctx.heldItem, hostile: ctx.hostile });
            // (no answer in time: my own rules answer; the host already speaking: just stop waiting)
            setTimeout(() => { if (this._asks.get(v.id) !== ask) return; this._asks.delete(v.id); if (!ask.got) done(b.hear(text, ctx)); }, 12000);
            return true;
        }
        this.mind.llm = this.llm?.ready ? this.llm : null;
        if (!this.mind.llm) this._whyNoNet();
        const first = this.mind.first(b, text, ctx);
        if (first.done) { this._talkLog(text, first.res, 'правила', 0); done(first.res); return true; } // (the rules: at once)
        const thinking = () => this._sayThinking(v, text, first.res?.intent);
        const t0 = performance.now();
        // (the first sentence of the net's answer is said as soon as it is written)
        const onSentence = (line, i) => (i > 0 ? this._sayMore(v, line) : this._sayAnswer(v, line));
        this.mind.ask(b, text, ctx, first, { onThinking: thinking, onSentence }).then((res) => {
            // (the net failed: the rules answered — the reason in the journal, not too often)
            if (this.mind.lastError && (this._netErrLogged = (this._netErrLogged || 0) + 1) <= 20) journal(`нейросеть не ответила: ${this.mind.lastError} — ответили готовые фразы`);
            // (too slow on this computer: say so now and then — the answer came from the rules)
            if (this.mind.lastTimedOut) {
                this._slow = (this._slow || 0) + 1;
                if (this._slow >= 2 && performance.now() - (this._slowT || -1e9) > 180000) { this._slowT = performance.now(); journal('нейросеть не успевает ответить вовремя — отвечают готовые фразы'); }
            } else this._slow = 0;
            this._talkLog(text, res, res.smart ? 'нейросеть' : this.mind.lastTimedOut ? 'правила (нейросеть не успела)' : 'правила (ответ нейросети не подошёл)', performance.now() - t0);
            done(res);
        }, (e) => { journal(`ошибка в ответе нейросети: ${String(e?.message || e).slice(0, 200)}`); done(first.res); }).catch((e) => this._talkFailed(e, v));
        return true;
    }

    /** Who answered what (the first lines of a game, while the net is on): for the journal. */
    _talkLog(text, res, by, ms) {
        if (!this.llm || (this._talkLogged = (this._talkLogged || 0) + 1) > 40) return;
        journal(`«${text}» → «${res?.reply || ''}»${res?.action ? ` [${res.action}]` : ''} — ${by}${ms ? `, ${(ms / 1000).toFixed(1)} с` : ''}`);
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
        const L = this.life.enabled ? this._listener() : null;
        if (!L) return false;
        const spell = matchSpell(text);
        if (spell === 'Stand') return false; // («стоп» stops my spells first; with nothing to stop the villager hears it)
        // (paying: a good named to the merchant with my coins on his counter)
        if (this._trader(L) && this._pursePay(L) && this._goodsOf(L).some((x) => namesGood(text, x.item))) return true;
        // (in a talk with him, the hand down: what I say is to him — not a spell, unless it is one)
        if (!spell && this.inTalk() && this._partner === L && !this.game.isMagicActive) return true;
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
        // a villager's voice is in the air right now (or was a moment ago) and my mouth did not move:
        // the microphone heard him, not me (the camera sees the lips — as for spells, VoiceGate)
        const now0 = performance.now();
        const last = (this._spoken || []).at(-1);
        const airborne = this.speech.speaking || (last && now0 - last.at < 1500 + String(last.text).length * 75);
        if (airborne) {
            const lips = this.game.voiceGate?.lipsMoved?.(now0);
            if (lips === false) return true;
            // (the mouth unseen: half of the words his — it is him)
            if (lips == null && last) { const sw = new Set(norm(last.text).split(' ')); if (hw.filter((w) => sw.has(w)).length >= Math.max(1, hw.length * 0.5)) return true; }
        }
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
        // («да» to buy at a stall: the merchant says «держи» only when the deal really happens — _tradeYes
        // says what came of it; never «да-да» and nothing given)
        const deal = res.action === 'trade_yes' && res.offer?.kind === 'buy' && this._trader(v) && !(this.offer?.v === v && this.offer.kind === 'sell');
        if (res.reply && !deal) {
            // (the start was said already while the net wrote: only the rest now, after it)
            const head = res.spoken;
            if (head) { const rest = restAfter(res.reply, head); if (rest) this._sayMore(v, rest); }
            else this._sayAnswer(v, res.reply);
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
            if (L && L.item.shop && !L.item.shop.paid) out.push({ name: nameOf(L.item), price: L.item.shop.price, uid, item: L.item });
        }
        return out;
    }

    /** Pouches of coins lying still on this stall's counter (the loose things). */
    _counterCoins(def, i) {
        const st = def.stalls?.[i], out = [];
        if (!st?.counter) return out;
        for (const L of this.game.items.loose.values()) {
            if (L.item.kind === 'coins' && !L.item.shop && !L.hover && !L.accio && onCounter(st, L.model.position) && L.vel.lengthSq() <= 0.05) out.push(L);
        }
        return out;
    }

    /**
     * The buyer's body stays a little before every counter near it (MarketGoods.counterZone): the
     * arms reach the counter top, the body doesn't press against it. Only a body standing on the
     * market's floor (not one on top of the counter, flying, or up on a roof). → moved?
     */
    keepOffCounters(pos, r, feetY) {
        let moved = false;
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            for (const st of cs.def.stalls || []) {
                const c = st.counter;
                if (!c || Math.abs((c.x0 + c.x1) / 2 - pos.x) > 8 || Math.abs((c.z0 + c.z1) / 2 - pos.z) > 8) continue;
                if (feetY >= c.top - 0.2 || feetY < c.top - 3) continue;
                const z = counterZone(st);
                if (pushOutOfRect(pos, r, z.minX, z.maxX, z.minZ, z.maxZ)) moved = true;
            }
        }
        return moved;
    }

    _merchantOf(def, i) {
        for (const v of this.life.byId.values()) if (v.cs.def === def && this._trader(v) && v.entry.stall === i && !v.dead) return v;
        return null;
    }

    /** Sells and buys at a stall: a market merchant, the wizards' master of cauldrons and potions, a settlement's seller (WizardMarket.js). */
    _trader(v) {
        const st = v.role === 'seller' ? v.cs?.def?.stalls?.[v.entry?.stall] : null;
        return v.role === 'merchant' || (!!st && (!!st.potions || !!st.trade || !!st.magic)); // (st.magic: a hamlet's seller of magic things — HamletLife)
    }

    /** (host) keep goods on the counters of the markets near players. */
    _restock(now) {
        const g = this.game;
        if (this.life.night?.closed()) return; // (the market is shut from an hour before the night till the morning)
        let budget = 6; // (goods laid out at most in one go: a whole market at once — a model each — was a long frame; the rest at the next look)
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            cs.def.stalls.forEach((stall, i) => {
                if (budget <= 0 || stall.fence || stall.pawn || !this._merchantOf(cs.def, i)) return; // (the shady buyer and the pawnshop only buy)
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
                    const wiz = stall.magic ? magicStallGood(n, k) // (a hamlet's seller of magic things — HamletLife.js)
                        : stall.trade && !stall.potions ? wizardGood(stall.trade, k, n) : null; // (a settlement's shop: its own trade — WizardMarket.js)
                    // (a market stall sells its own trade's goods — the baker bread and pies, the bowyer bows and arrows: MarketGoods)
                    const pick = wiz ? { kind: wiz.item.kind, price: wiz.price, fixed: true } : stall.potions ? (k === 2 ? WIZARD_RARE[((n % WIZARD_RARE.length) + WIZARD_RARE.length) % WIZARD_RARE.length] : POTION_GOODS[k % POTION_GOODS.length]) : stallTrade(cs.def.id, i, cs.def.stalls.length).goods[k];
                    const price = pick.fixed ? pick.price : Math.max(1, Math.round(pick.price * (0.85 + ((i * 37 + k * 11) % 30) / 100)));
                    // (the wizards' magic robe / a magic armour piece: a real thing of its own — ArmorTypes)
                    const item = wiz ? { ...wiz.item, shop: { stall: key, price } }
                        : pick.kind === 'magicPouch' ? { ...makeMagicPouch(newUid()), shop: { stall: key, price } }
                        : pick.kind === 'robe' ? { ...makeRobe(true), shop: { stall: key, price } }
                        : pick.kind === 'armor' ? { ...makePiece(PIECES[((n % 3) + 3) % 3], { magic: true }), shop: { stall: key, price } }
                            : { kind: pick.kind, uid: newUid(), count: pick.count || 1, shop: { stall: key, price } };
                    if (wiz && item.kind === 'book') item.spells = bookSpells(item.id);
                    if (!wiz && pick.kind === 'shield') { item.type = pick.type || 0; item.magic = false; item.max = 0; delete item.count; }
                    if (!wiz && pick.kind === 'bow') { item.type = 0; item.magic = false; item.bonus = 0; item.arrows = 5; delete item.count; }
                    const f = (k + 0.5) / 3;
                    // (by the buyer's edge of the counter, not in its middle: a hand reaches it from the front)
                    const x = along ? c.x0 + (c.x1 - c.x0 + 1) * f - 0.5 : frontEdge(stall, GOOD_IN);
                    const z = along ? frontEdge(stall, GOOD_IN) : c.z0 + (c.z1 - c.z0 + 1) * f - 0.5;
                    const L = g.items.spawnLoose(item, new THREE.Vector3(x, c.top + 0.3, z));
                    s.goods.push(L.item.uid);
                    budget--;
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
        if (this.prepaid.delete(item.uid) || item.shop?.paid) { delete item.shop; return; } // (paid for: mine)
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
        const yes = res?.reply || 'Держи!';
        // «да» to what the merchant named by word: paid from the pouch on the counter (its own words then)
        if ((!o || o.v !== v) && res?.offer?.kind === 'buy') {
            const fresh = this._pitch?.v === v && performance.now() - this._pitch.at < 30000;
            this._pitch = null;
            if (fresh || this._pursePay(v)) this._buyByWord(v, res.offer);
            else this._sayReply(v, 'Что именно берёшь? Положи монеты на прилавок и назови товар.', 4);
            return;
        }
        if (!o || o.v !== v) return;
        if (o.kind === 'buy' && o.cauldron) {
            // the big cauldron I am moving away from the master's stall
            if (!g.inventory.spendCoins(o.price)) { this._sayReply(v, this.brain(v).noMoneyLine(this._ctx(v))); return; }
            this._sayReply(v, yes, 4);
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
            this._sayReply(v, yes, 4);
            delete item.shop;
            g.inventory._render?.();
            g.hud.setVoice?.(`💰 Куплено: ${nameOf(item)} за ${o.price} (осталось ${g.inventory.coins()})`, true);
            this.offer = null;
            return;
        }
        // sell: the merchant takes the thing, a pouch of coins lies in its place
        const p = o.pos;
        this.deals.close(o.stall, dealKey(o)); // (sold: the deal is over)
        if (g.authority) this.sellNow(o.uid, o.wid, o.price, p);
        else g.sync?.tradeSell?.(o.uid, o.wid, o.price, [p.x, p.y, p.z]);
        g.hud.setVoice?.(`💰 Продано за ${o.price} монет — возьмите мешочек с прилавка`, true);
        this.offer = null;
    }

    /** «да» to what the merchant offered by word: the good comes off the counter into my hand. */
    _buyByWord(v, offer) {
        const want = String(offer.item?.name || offer.item || '').toLowerCase();
        if (this._payByName(v, want)) return;
        if (this._pursePay(v)) { this._sayReply(v, 'Такого у меня на прилавке нет. Назови, что лежит, — цена на карточке.', 4); return; }
        this._sayReply(v, 'Клади монеты на прилавок — и скажи, что берёшь.', 4);
        this.game.hud.setVoice?.('💰 Положите мешочек с монетами на прилавок и назовите товар', true);
    }

    /** A pouch of coins lying still on this merchant's counter (the loose thing), or null. */
    _pursePay(v) {
        const P = this.purse;
        const L = P && P.v === v ? this.game.items.loose.get(P.uid) : null;
        if (L && L.item.kind === 'coins' && !L.item.shop) return L;
        // (any pouch lying still on his counter: the one he greeted may have been taken back, another put)
        return this._trader(v) ? this._counterCoins(v.cs.def, v.entry.stall)[0] || null : null;
    }

    /** I named a good with my coins on the counter: pay for it from the pouch (the host decides). */
    _payByName(v, text) {
        const C = this._pursePay(v);
        if (!C) return false;
        const good = namedGood(text, this._goodsOf(v));
        if (!good) return false;
        const g = this.game;
        if (g.authority) this.pay(C.item.uid, good.uid, g.localId);
        else g.sync?.tradePay?.(C.item.uid, good.uid);
        return true;
    }

    /**
     * (host) The price of a good taken from a pouch lying on the counter: the merchant takes the pouch
     * (all of it spent) or what it costs (the rest stays lying there); the good is free to take.
     */
    pay(coinUid, goodUid, by) {
        const g = this.game, I = g.items;
        const C = I.loose.get(coinUid), G = I.loose.get(goodUid);
        if (!C || !G || C.item.kind !== 'coins' || C.item.shop || !G.item.shop || G.item.shop.paid) return;
        const [cid, s] = G.item.shop.stall.split(':s');
        const cs = this.life.castles.get(cid);
        const v = cs ? this._merchantOf(cs.def, +s) : null;
        if (!v || v.dead || v.foe) return;
        // (all the pouches lying on his counter count: a second one put to add what was missing)
        const purses = [C, ...this._counterCoins(cs.def, +s).filter((L) => L !== C)];
        const price = G.item.shop.price, have = purses.reduce((n, L) => n + (L.item.count || 0), 0), name = nameOf(G.item);
        v.yaw = Math.atan2(-(C.model.position.x - v.x), -(C.model.position.z - v.z));
        if (have < price) {
            this._sayForGuestOrMe(v, by, `${name[0].toUpperCase() + name.slice(1)} стоит ${price}, а тут только ${have}. Добавь ещё ${price - have} — или выбери что-нибудь другое.`);
            this._tradeNote(by, `💰 Не хватает ${price - have} монет: ${name} — ${price}, в мешочке ${have}`);
            return;
        }
        // he takes the money with his hand (the whole pouch — or what it costs, the rest left lying)
        // (a magic pouch is never his: he takes the coins out of it, and it stays lying there with the change in it)
        const at = C.model.position.clone(), magic = purses.find((L) => L.item.magic), mAt = magic?.model.position.clone();
        const others = purses.filter((L) => L !== magic && L.item.magic);
        for (const L of purses) I.pickUp(L.item.uid, '#merchant', 'right');
        const rest = have - price;
        if (magic) {
            I.spawnLoose(makeMagicPouch(newUid(), rest), mAt);
            for (const L of others) I.spawnLoose(makeMagicPouch(newUid(), 0), L.model.position.clone()); // (two magic pouches put there: both stay his buyer's)
        } else if (rest > 0) I.spawnLoose({ kind: 'coins', uid: newUid(), count: rest }, at);
        v.giveT = 1.2;
        G.item.shop.paid = true;
        // he pushes it to the very edge of the counter, before the buyer: there a hand takes it
        const st = cs.def.stalls?.[+s];
        if (st?.counter) {
            const c = st.counter, along = c.x1 - c.x0 >= c.z1 - c.z0, P = G.model.position;
            if (along) P.z = frontEdge(st, PAID_IN); else P.x = frontEdge(st, PAID_IN);
            P.y = Math.max(P.y, c.top + 0.3);
            G.vel?.set(0, 0, 0);
            G.rest = false; G.sentRest = false; // (its new place goes to the others)
        }
        g.sync?.tradePaid?.(goodUid);
        this._sayForGuestOrMe(v, by, rest > 0 ? `Беру ${price}. Остаток твой — забирай. И ${name} забирай, он твой!` : `Беру ${price}. Забирай, ${name} твой!`);
        this._tradeNote(by, `💰 Списано ${price} монет за: ${name}${rest > 0 ? ` (в мешочке осталось ${rest} — заберите его)` : ''}. Товар можно забрать`);
        if (this.purse?.uid === coinUid) this.purse = null;
    }

    /** (everybody) a good was paid for: its price card goes, the hand may take it. */
    paidGood(uid) {
        const L = this.game.items.loose.get(uid);
        if (L?.item.shop) L.item.shop.paid = true;
    }

    _sayForGuestOrMe(v, by, text) {
        if (by === this.game.localId) this._sayReply(v, text, 6);
        else this._sayForGuest(v, text);
    }

    _tradeNote(by, text) {
        const g = this.game;
        if (by === g.localId) g.hud.setVoice?.(text, true);
        else g.sync?.tradeNote?.(by, text);
    }

    /** (host) the sale happens: the thing is gone, coins lie on the counter. */
    sellNow(uid, wid, price, p) {
        const g = this.game;
        if (uid && g.items.loose.has(uid)) g.items.pickUp(uid, '#merchant', 'right');
        else if (wid) { const w = g.weapons.byId.get(wid); if (w) { g.weapons.remove(w); g.sync?.weaponGone?.(w); } }
        else return;
        // (a pouch holds 500 at most: a bigger sum is several pouches)
        let left = Math.max(1, Math.round(price)), k = 0;
        while (left > 0) {
            const n = Math.min(500, left);
            left -= n;
            g.items.spawnLoose({ kind: 'coins', uid: newUid(), count: n }, new THREE.Vector3(p.x + (k % 2) * 0.35, p.y + 0.3 + Math.floor(k / 2) * 0.3, p.z + (k % 2 ? 0.2 : 0)));
            k++;
        }
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
                const on = (p) => onCounter(stall, p);
                let found = null;
                // my pouch of coins put down on the counter: «what do you want?»
                for (const L of g.items.loose.values()) {
                    if (L.item.kind !== 'coins' || L.item.shop || !(L.item.count > 0) || L.hover || !on(L.model.position) || L.vel.lengthSq() > 0.05) continue;
                    if (this.purse?.uid !== L.item.uid) {
                        this.purse = { uid: L.item.uid, v };
                        if (performance.now() - (v.talkedAt || -1e9) < 6000) break; // (the change he just left: no new question)
                        v.talking = 4;
                        this._sayReply(v, `Вижу монеты — ${L.item.count}. Что желаешь купить?`, 6);
                        g.hud.setVoice?.(`💰 На прилавке ${L.item.count} монет — назовите товар (цена — на карточке рядом с ним)`, true);
                    }
                    break;
                }
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
                // (only the settlement's pawnshop (anything, 40 % under) and a town's shady buyer (only plain things) buy — every other seller only sells: WizardMarket.js)
                if (!stall.pawn && !stall.fence) return;
                if (stall.fence && !fenceTakes(found.item)) {
                    if (this._refused === (found.uid || found.wid)) return;
                    this._refused = found.uid || found.wid;
                    v.talking = 4;
                    this._sayReply(v, 'Не-не, магическое не беру. Неси такое волшебникам — у них в поселении есть скупка.', 6);
                    return;
                }
                const price = stall.pawn || stall.fence ? this.deals.price(key, dealKey(found), () => pawnPrice(found.item), performance.now()) : Math.max(1, itemValue(found.item));
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

    /**
     * The pawnshop's / shady buyer's deals: the thing taken back from the counter ends the offer (no scolding;
     * the sum named is kept for ~10 min — the same thing put again costs the same), a far walk forgets them,
     * and the «Скупка» plaques are kept up.
     */
    _buyerDeals(now) {
        const g = this.game, me = g.character.group.position;
        const o = this.offer;
        if (o && o.kind === 'sell' && o.stall) {
            const [cid, s] = o.stall.split(':s');
            const st = this.life.castles.get(cid)?.def.stalls[+s];
            let still = false;
            if (st && o.uid) { const L = g.items.loose.get(o.uid); still = !!L && !L.hover && onCounter(st, L.model.position); }
            else if (st) { const w = g.weapons.byId.get(o.wid); still = !!w && !w.holder && onCounter(st, w.position); }
            if (!still) this.offer = null;
        }
        this.deals.sweep(now);
        for (const k of new Set([...this.deals.m.values()].map((e) => e.stall))) {
            const [cid, s] = k.split(':s');
            const st = this.life.castles.get(cid)?.def.stalls[+s];
            if (!st || Math.hypot((st.counter.x0 + st.counter.x1) / 2 - me.x, (st.counter.z0 + st.counter.z1) / 2 - me.z) > 40) this.deals.leave(k);
        }
        this.signs.update([...this.life.castles.values()]);
    }

    /**
     * The stall of a buyer (pawnshop / shady) whose counter this point is over — a hand held out there and
     * opened lays the thing on it (Items / Weapons, the off hand). null elsewhere.
     */
    buyerCounterAt(p) {
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            const stalls = cs.def.stalls;
            for (let i = 0; i < stalls.length; i++) {
                const st = stalls[i];
                if ((st.pawn || st.fence) && overCounter(st, p)) {
                    const v = this._merchantOf(cs.def, i);
                    if (v && !v.dead && !v.foe && !(cs.hostile.get(this.game.localId) > Date.now())) return st;
                }
            }
        }
        return null;
    }

    /** A little card with the price beside every unpaid good on a counter near me. */
    _tags() {
        const g = this.game;
        if (typeof document === 'undefined' || !g.scene) return;
        const T = this._tagMap || (this._tagMap = new Map());
        const me = g.character.group.position;
        const want = new Set();
        for (const L of g.items.loose.values()) {
            const sh = L.item.shop;
            if (!sh || sh.paid || L.hover) continue;
            const p = L.model.position;
            if (Math.abs(p.x - me.x) > 30 || Math.abs(p.z - me.z) > 30) continue;
            want.add(L.item.uid);
            let t = T.get(L.item.uid);
            if (!t) {
                const c = document.createElement('canvas');
                c.width = 128; c.height = 72;
                const x = c.getContext('2d');
                x.fillStyle = '#e6d3a3'; x.fillRect(0, 0, 128, 72);
                x.strokeStyle = '#7a5a2e'; x.lineWidth = 5; x.strokeRect(3, 3, 122, 66);
                x.fillStyle = '#3a2410'; x.textAlign = 'center';
                x.font = 'bold 40px sans-serif'; x.fillText(String(sh.price), 64, 42);
                x.font = '16px sans-serif'; x.fillText('монет', 64, 63);
                const tex = new THREE.CanvasTexture(c);
                // (never sunk into a bulky good — a robe, an armour: drawn over it, with its own offset, above its top)
                const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
                sp.renderOrder = 30;
                sp.scale.set(0.46, 0.26, 1);
                g.scene.add(sp);
                t = { sp, tex, top: 0.42, topAt: 0 };
                T.set(L.item.uid, t);
            }
            if (performance.now() - t.topAt > 1500) { // (the good's real height: a robe or a staff is taller than a flask)
                t.topAt = performance.now();
                _tagBox.setFromObject(L.model);
                if (!_tagBox.isEmpty()) t.top = Math.min(1.6, Math.max(0.3, _tagBox.max.y - p.y + 0.16));
            }
            t.sp.position.set(p.x, p.y + t.top, p.z);
            t.sp.visible = Math.hypot(p.x - me.x, p.z - me.z) < 12; // (a card is read near; far ones are not drawn through walls)
        }
        for (const [uid, t] of T) if (!want.has(uid)) { g.scene.remove(t.sp); t.tex.dispose(); t.sp.material.dispose(); T.delete(uid); }
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
            this._buyerDeals(now);
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
                this._setLLMState('loading', 'перезапускается…');
                journal(`нейросеть упала посреди игры (${L.error?.message || 'без причины'}) — перезапускаю`);
                L.load().then(() => { this._setLLMState('ready', `${L.model.label} — готова`); journal('перезапущена'); }, (e) => { journal(`не перезапустилась: ${e?.message || e}`); this._setLLMState('failed', 'не перезапустилась'); });
            }
            // The heavy nets wait for the first seconds of play (their loading competes with the
            // game for the graphics card and the processor exactly when the world appears) —
            // unless somebody is already close enough to talk to.
            this._age = (this._age || 0) + 0.5;
            const close = this._age < 20 && this.life.targets().some((v) => Math.hypot(v.x - g.character.group.position.x, v.z - g.character.group.position.z) < 25);
            // (the neural voices load as soon as people are near — before anybody speaks, so nobody speaks with the computer's voice first)
            if (this.voiceOn && this.life.castles.size && (this._age >= 8 || close)) this.speech.preload?.();
            this._prepareFillers();
            // (always on — loaded in the background soon after the start; meanwhile the rules answer)
            if (g.config.villagerAI !== 'off' && !this.llm && !this._llmTried && this.life.enabled && (this._age >= 15 || close)) { this._llmTried = true; this._loadLLM(g.config.villagerAI || 'auto'); }
        }
        for (const v of this.life.byId.values()) if (v.talking > 0) v.talking -= dt;
        this._tags();
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
        this._setLLMState('loading', 'готовится');
        try { ({ LocalLLM } = await import('../ai/LocalLLM.js')); } catch (e) { this._setLLMState('failed', 'не загрузилась'); journal(`не загрузился код нейросети: ${e?.message || e}`); return; }
        if (!LocalLLM.supported) { this._setLLMState('failed', 'этот браузер её не умеет'); journal('браузер не умеет Web Worker / WebAssembly — жители говорят готовыми фразами'); return; }
        let gpu = false, gpuWhy = '';
        // ('auto': a real graphics adapter, not only the word WebGPU in the browser — the same one the net asks for)
        if (setting === 'auto') {
            if (!navigator.gpu) gpuWhy = 'в окне игры нет WebGPU';
            else {
                try { gpu = !!(await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })); } catch (e) { gpuWhy = `WebGPU: ${e?.message || e}`; }
                if (!gpu && !gpuWhy) gpuWhy = 'WebGPU есть, но видеокарту браузер не дал';
            }
        }
        let key = LocalLLM.pick(setting, gpu);
        if (!key) { this._setLLMState('failed', 'выключена'); return; }
        journal(`настройка «${setting}»${setting === 'auto' ? (gpu ? ': видеокарта есть → Gemma 4' : `: ${gpuWhy} → модель для процессора`) : ''}`);
        const tried = [];
        while (key) {
            const llm = new LocalLLM({ model: key });
            this.llm = llm;
            const m = LocalLLM.MODELS[key];
            const name = LocalLLM.describe(key, m.gpuOnly ? 'webgpu' : (gpu || LocalLLM.hasWebGPU ? 'webgpu' : 'wasm'));
            journal(`загружаю ${name}${m.gpuOnly ? ' (только видеокарта)' : ''}…`);
            const t0 = performance.now();
            let last = 0;
            this._setLLMState('loading', `${m.label}: загружается…`, key);
            try {
                const info = await llm.load((f, text) => {
                    const now = performance.now();
                    if (now - last < 1500 && f !== 1) return;
                    last = now;
                    this._setLLMState('loading', `${m.label}: загружается${f != null ? ` (${Math.round(f * 100)}%)` : '…'}`, key);
                });
                if (this.llm !== llm) return; // (disposed meanwhile)
                // (the program on this computer — llm_native.py — runs Gemma 4 whatever was asked: its own name then)
                const nat = info.device === 'native', mk = LocalLLM.MODELS[llm.modelKey] || m;
                const on = nat ? 'отдельная программа на компьютере' : info.device === 'webgpu' ? 'видеокарта' : 'процессор';
                this._setLLMState('ready', `${LocalLLM.describe(llm.modelKey || key, info.device)} — готова (${on})`, key);
                this._llmWasReady = true;
                this._warmLLM(llm);
                journal(`✅ ГОТОВА: ${mk.label} ${nat ? 'отдельной программой на компьютере (llama.cpp, процессор — видеокарта остаётся игре)' : `на ${info.device === 'webgpu' ? `видеокарте${info.gpuName ? ` (${info.gpuName})` : ''}` : 'процессоре'}`}, ${info.dtype}, загрузка ${((performance.now() - t0) / 1000).toFixed(1)} с`
                    + `${info.why ? `; ${info.why}` : ''}${llm.nativeWhy ? `; программа на компьютере не подошла (${llm.nativeWhy.slice(0, 160)}) — работает браузерная` : ''}${tried.length ? `; до неё не загрузились: ${tried.join('; ')}` : ''}`
                    + `${llm.strong ? ' — отвечает на любые слова' : ' — отвечает на то, что не поняли готовые правила'}`);
                console.info('[CastleTalk]', '🧠 Нейросеть жителей готова — они понимают ваши слова и выполняют просьбы');
                g.sync?.villagerAI?.(true);
                return;
            } catch (e) {
                const err = String(e?.message || e).slice(0, 300);
                journal(`❌ ${m.label} не загрузилась за ${((performance.now() - t0) / 1000).toFixed(1)} с: ${err}${m.fallback ? ` → пробую ${LocalLLM.MODELS[m.fallback]?.label}` : ''}`);
                tried.push(`${m.label} (${err.slice(0, 120)})`);
                llm.dispose?.();
                if (this.llm === llm) this.llm = null;
                key = m.fallback || null;
            }
        }
        this._setLLMState('failed', 'не загрузилась — жители говорят готовыми фразами');
        journal('нейросеть не загрузилась — жители говорят готовыми фразами (приказы всё равно понимают)');
    }

    /** The net's state: for the settings («загружается…», «готова») and remembered for the next start. */
    _setLLMState(state, text, key = this.llmState?.key) {
        this.llmState = { state, text, key };
        try {
            window.dispatchEvent(new CustomEvent('zns-llm-state', { detail: this.llmState }));
            if (state !== 'loading') localStorage.setItem('zns-llm-state', JSON.stringify({ ...this.llmState, at: Date.now() }));
        } catch (_) { /* (node tests, private window) */ }
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
        // (the same common words and actions every question begins with: the program reads them now and keeps them)
        llm.chat({
            system: this.mind.basePrompt(),
            context: b ? this.mind.persona(b, ctx) : '',
            history: [],
            user: 'Привет, как дела?',
            tools: llm.strong ? TOOLS : toolsFor(b?.role || 'farmer', ctx),
            maxTokens: 3,
        }).then(() => console.info(`[CastleTalk] the net warmed up in ${Math.round(performance.now() - t0)} ms`), () => {});
    }

    /** I talk to a villager without the net (still loading): the rules answer — nothing is written about it. */
    _whyNoNet() {}

    dispose() {
        this.speech.cancel();
        this.llm?.dispose?.();
    }
}
