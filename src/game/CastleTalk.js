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
import { isApology } from './BumpRules.js';
import { VillagerBrain, detectIntent } from './VillagerBrain.js';
import { Speech } from '../audio/Speech.js';
import { ITEM_INFO, itemValue, isMagicItem, newUid } from './ItemTypes.js';
import { makeMagicPouch } from './CoinBelt.js';
import { ARMOR, PIECES, makePiece, makeRobe, armorName } from './ArmorTypes.js';
import { TalkMind, fillerLine, fillerPool, isEnglishText, isShortFiller } from '../ai/TalkMind.js';
import { detectOrder, toolsFor, TOOLS, ORDER_LINES } from '../ai/TalkActions.js';
import { TalkTrace } from '../ai/TalkTrace.js';
import { quickOrder } from '../ai/TalkFlow.js';
import { ackFor, ackPool } from '../ai/TalkAcks.js';
import { inHall } from './ThroneHall.js';
import { matchSpell } from '../fx/SpellManager.js';
import { DANGERS } from './Danger.js';
import { stallTrade, counterZone } from './MarketGoods.js';
import { wizardGood, pawnPrice, fenceTakes } from './WizardMarket.js';
import { DealPrices, dealKey, overCounter, counterOffset } from './BuyerDeal.js';
import { BuyerSigns } from './BuyerSigns.js';
import { bookSpells } from './BookBirds.js';
import { magicStallGood } from './HamletLife.js';
import { pushOutOfRect } from '../world/Collision.js';
import { Attention, ATT, inSight } from './Attention.js';
import { wizardDetects, placeOf, shopRefuses, expelled, attitude, wizardLine, REFUSE_LINE, EXPEL_LINE } from './DarkMagic.js';
import { nameScore, namesGood, namedGood, chooseGood, labelGoods, askLine, LABEL } from './MarketChoice.js';

export const HEAR = 7; // m: a villager hears you this far
/** m: an order to the army is shouted — a knight of my castle hears it this far (a word to one: HEAR). */
export const SHOUT_HEAR = 35;
/** «рыцари!», «стража!», «все!», «войско!»: words to many. */
const GROUP_CALL = /(^| )(рыцари|стража|стражники|войско|армия|солдаты|воины|дружина|отряд|все|всем|братья)( |$)/;
/** Called by role at the start of the words: the one of that role answers. */
const ROLE_CALL = [[/^(эй )?(рыцарь|стражник|страж|воин|солдат)( |$)/, 'knight'], [/^(эй )?(торговец|торговка|купец)( |$)/, 'merchant'], [/^(эй )?(советник|визирь)( |$)/, 'advisor'], [/^(эй )?(строитель|каменщик)( |$)/, 'builder'], [/^(эй )?(фермер|крестьянин)( |$)/, 'farmer']];
const normalizeText = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const VOICE = 35; // m: a villager's voice carries this far
const SHOUT_RANGE = 60; // m: a battle cry / a call for help carries much farther
/** The master of cauldrons and potions (a wizards' house's stall): flasks and ingredients (the cauldron stands beside: Cauldrons.js). */
const POTION_GOODS = [{ kind: 'flask', price: 15, count: 3 }, { kind: 'apple', price: 35 }, { kind: 'crystal', price: 70 }];
/** … its third place: a crystal, or (now and then) a magic robe for 1000 coins, a piece of magic armour (ArmorTypes) (no coin pouch: it is nobody's good — CoinBelt). */
const WIZARD_RARE = [{ kind: 'crystal', price: 70 }, { kind: 'robe', price: ARMOR.ROBE_PRICE, fixed: true }, { kind: 'armor', price: ARMOR.PIECE_PRICE }];
const _v = new THREE.Vector3();
/** A villager's short line when something in a talk went wrong (the reason goes to the journal). */
const TALK_SORRY = ['Хм… прости, мысль убежала.', 'Ох, о чём это я… Давай потом.', 'Погоди-ка, сбилась мысль.', 'Повтори-ка потом, путник.'];
/** The spells in a villager's line: the whole line, and each word / pair of words of it (a one-word spell said in a sentence). */
export function spellsIn(text) {
    const out = new Set();
    const whole = matchSpell(text);
    if (whole) out.add(whole);
    const w = normalizeText(text).split(' ').filter(Boolean);
    for (let i = 0; i < w.length; i++) {
        const one = matchSpell(w[i]);
        if (one) out.add(one);
        const two = i + 1 < w.length && matchSpell(w[i] + ' ' + w[i + 1]);
        if (two) out.add(two);
    }
    return out;
}
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

export { nameScore, namesGood, namedGood };

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
        this._choice = null; // {v, uids, at}: the merchant asked which of these goods
        this._labelOff = new Set(); // stall keys whose labels are off until the coins leave the counter (after a purchase)
        this._labelText = new Map(); // good uid -> label text (rebuilt by _watchMarket)
        this._labCache = new Map(); // text -> {tex, mat, refs}
        this._greetT = new Map();
        this.attention = new Attention(); // whom I look at, walk to, talk with — he hears my words, he notices me (Attention.js)
        this._attT = 0;
        this._attPrev = null;
        this.llm = null;
        this.mind = new TalkMind();
        this.hostSmart = false; // (a guest) the host's net answers for me
        this._asks = new Map(); // villager id -> time I asked the host (a guest)
        this.prepaid = new Set(); // goods paid by word, on their way to my hand
        // the talk's stopwatch: one «разговор: …» line per turn in the performance diary (zns-perf.log)
        this.trace = new TalkTrace({ sink: (line) => { game.perf?.talk?.(line); console.info('[Жители]', line); } });
        this._turn = 0; // (a newer turn of my talk: the older one's late answer is not said)
        this.replyAt = -1e9; // when a villager last began answering my words (Game._duckVoices: no quiet for it)
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
            if (v.guest && !this.memories.has(v.id)) b._mood = Math.max(b._mood || 0, 0.6); // (the Creative guest is glad to see me: he is here to be talked to — CreativeGuest.js)
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
        // (the town's own news — a blast, a fire, the dead, the king fallen — and whether I did it: TownNews.js)
        ctx.news = this.life.news?.told(v.cs.def.id, g.localId) || [];
        ctx.status = this._status(v);
        ctx.guest = !!v.guest;
        ctx.doing = this._doing(v);
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
        // (nor a shout of another — the army's «За короля!» after my order: one voice would cut the other; while my
        // partner's answer is heard, the others' words show over their heads — false: CastleLife shows the bubble)
        if (P && P !== v && !this._urgent && this.speech.speaking && performance.now() - (P.talkedAt || -1e9) < 4000) return false;
        this._lastSpoken = text;
        // a spell's word said aloud (a wizard practising, a cry in a duel): my microphone may hear it
        // from the speakers — it must not cast that spell from my hand (VoiceGate echo, until it is said)
        // (and a spell that is one word of the line: «Дай подумать…» — the microphone may catch only «дай», and «Дай» kills)
        const until = performance.now() + Math.min(8000, 400 + text.length * 70);
        for (const sp of spellsIn(text)) this.game.voiceGate?.noteRemote(sp, until);
        // an answer in a talk: what is written over the head is what you hear — now, not after older lines
        if (this._urgent) this.speech.cancel();
        const now = performance.now();
        this._spoken = (this._spoken || []).filter((l) => now - l.at < 12000);
        this._spoken.push({ text, at: now });
        // (× the game's sound volume inside Speech; a woman always with a female voice, a man with a male one)
        const tr = this.trace.current, mine = !!tr && tr.v === v && (this._urgent || this._more);
        const reply = !!(this._urgent || this._more);
        if (reply) this.replyAt = now;
        this.speech.say(text, { voiceKey: v.id, role: v.role, female: !!v.entry.female, volume, shout, append: !!this._more, live: () => this._loud(v, shout),
            // (an answer to my words: said now, not held while «I speak»; in danger made in fewer steps — heard sooner)
            reply, ...(reply && this._danger(v) ? { steps: 3 } : {}),
            ...(mine ? { onStart: (at) => this._voiceHeard(tr, text, at) } : {}) });
    }

    /**
     * Who I am to this villager (Attitude.STATUS): the king of his castle, a king elsewhere, a wanted man, the
     * High Mage in his robe, a knight in armour, a wizard with a wand in hand — or just a traveller.
     */
    _status(v) {
        const g = this.game, me = g.localId;
        if (this.life.state(v.cs.def.id).owner === me) return 'king';
        if ((this.life.wantedLevel?.(me) || 0) >= 2) return 'outlaw';
        for (const st of this.life.states.values()) if (st.owner === me) return 'foreignKing';
        const w = g.armor?.worn || {};
        if (w.robe?.archmage) return 'archmage';
        if (w.chest && w.helmet) return 'knight';
        if (g.items?.heldOf?.('wand') || w.robe) return 'wizard';
        return 'traveller';
    }

    /** Did I raise my voice just now (the microphone's loudest in the last 2.5 s well over its background)? */
    _shouting() {
        const vs = this.game.voice;
        const L = vs?._levels;
        if (!L?.length || !Number.isFinite(vs.noiseFloor)) return false;
        const t = performance.now() - 2500;
        let peak = -Infinity;
        for (let i = L.length - 1; i >= 0 && L[i][0] >= t; i--) if (L[i][1] > peak) peak = L[i][1];
        return peak - vs.noiseFloor >= 30;
    }

    /**
     * (a few times a second) Whom I look at, walk to, talk with — and the one who notices me turns to me: from across
     * the street if I look at him and come, not only when I bump into him (the author).
     */
    _attend(dt, now) {
        const g = this.game;
        const cam = g.camera, me = g.character.group.position;
        if (!cam) return;
        cam.getWorldDirection(_v);
        const look = { x: _v.x, y: _v.y, z: _v.z };
        const eye = { x: me.x, y: me.y + 1.3, z: me.z };
        const prev = this._attPrev;
        const vel = prev && dt > 0 ? { x: (me.x - prev.x) / dt, z: (me.z - prev.z) / dt } : null;
        this._attPrev = { x: me.x, z: me.z };
        const near = this._attNear || (this._attNear = []);
        near.length = 0;
        const col = g.collision;
        if (!this._losCache) {
            this._losCache = new Map();
            this._losOf = (v) => { const p = this.game.character.group.position; return this.game.collision.lineOfSight(p.x, p.y + 1.4, p.z, v.x, v.y + 3.2, v.z, 0.45); };
        }
        for (const v of this.life.byId.values()) {
            if (v.dead || Math.abs(v.x - me.x) > 45 || Math.abs(v.z - me.z) > 45) continue;
            // (only one I can really see: a wall between us — he neither notices my look nor is «looked at», even when
            // «Visible Godi» shows him to me through the wall)
            if (col?.lineOfSight && !inSight(v, this._losOf, this._losCache, now)) continue;
            near.push({ id: v.id, x: v.x, y: v.y + 1.3, z: v.z });
        }
        this.attention.update(eye, look, vel, near, dt, now);
        // he notices me: stops what he does a moment and looks at me (not in a fight, asleep, busy at a task for the king)
        for (const [id, a] of this.attention.of) {
            if (a.score < ATT.NOTICE || a.d > ATT.TALK + 3) continue;
            const v = this.life.byId.get(id);
            if (!v || v.dead || v.foe || v.sleep || v.follow || v.order || v.fleeT > 0 || v.job === 'king') continue;
            if (!(v.talking > 0)) v.talkTo = g.localId;
            if (v.talkTo === g.localId) v.talking = Math.max(v.talking || 0, 1.2);
            v.noticedAt = now;
        }
    }

    /** Something I did changed how this villager takes me (a blow: −12) — Attitude.js. */
    feel(v, delta) { this.brain(v).feel(this.game.localId, delta); }

    /** What this villager is doing now, in words for the net — he goes on from it, not from nothing. */
    _doing(v) {
        const me = this.game.localId;
        if (v.guard && v.follow === me) return 'ты охраняешь собеседника: идёшь рядом и бьёшь любого, кто на него нападёт';
        if (v.follow === me) return 'ты идёшь следом за собеседником';
        if (v.guiding || v.guide) return 'ты ведёшь собеседника туда, куда он просил';
        const o = v.order;
        if (o?.kind === 'hunt') return `по приказу ты охотишься на врагов (${{ zombies: 'зомби', spider: 'паука', animals: 'зверей' }[o.what] || 'всех врагов'})`;
        if (o?.kind === 'defend') return 'по приказу ты защищаешь замок на стенах и у ворот';
        if (o?.kind === 'leave') return 'тебе велели уйти с глаз';
        if (v.foe != null) return v.foe === me ? 'ты дерёшься с собеседником' : 'ты дерёшься с врагом';
        if (v.fleeT > 0) return 'ты убегаешь';
        return '';
    }

    /** Danger round this villager now (a fight, zombies, a blast): short, quick words. */
    _danger(v) { return !!(v?.cs?.hostile?.size > 0 || v?.fear?.danger || v?.foe); }

    /** The stopwatch: a line of this turn is heard (a quick word / the answer itself). */
    _voiceHeard(tr, text, at) {
        this.trace.mark(tr, 'ack', at);
        if (tr.quick === text) return; // (only the quick word: the answer is still to come)
        this.trace.mark(tr, 'voice', at);
        if (tr.kind !== 'net' || tr.at.done != null) this.trace.done(tr);
    }

    /** A talk turn starts: the stopwatch (from the speech's end, if the voice program told it). */
    _traceTurn(v, text, info = {}) {
        const kind = quickOrder(text, this._players()) ? (v.ship ? 'crew' : 'order') : 'talk';
        const tr = this.trace.begin(text, { end: info.end, kind, who: `${v.ship ? 'моряк' : v.role || 'житель'} ${v.name || ''}`.trim(), how: info.early ? `по тишине ${info.why === 'stable' ? '(приказ)' : ''}`.trim() : info.how || '' });
        tr.v = v;
        // (nothing heard of him within 15 s — voices off, too far: the line is written anyway)
        setTimeout(() => this.trace.done(tr), 15000);
        return tr;
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

    /**
     * Чёрная магия (DarkMagic.js): волшебник (и только он) замечает тьму героя с 41. Презрение — реплика раз в 90 с;
     * лавка мага отказывает (в половине случаев при 41…80, всегда при 81…100 в башне и городах; в малых поселениях
     * — у кого какая терпимость); изгой в башне и городе — «Уходи». Ответ: true — слова приняты, дальше не идёт.
     */
    _darkGate(v, tradeOnly = false) {
        const g = this.game, lvl = g.dark?.level || 0;
        if (!v.wizard || !wizardDetects(lvl)) return false;
        const place = placeOf(v.cs?.def, v.entry), now = performance.now();
        const memo = (this._dark = this._dark || new Map());
        const m = memo.get(v.id) || { refuse: null, until: 0, scornAt: -1e9 };
        memo.set(v.id, m);
        if (now > m.until) { m.refuse = this._trader(v) ? shopRefuses(lvl, place, Math.random, v.id) : false; m.until = now + 120000; }
        if (!tradeOnly && expelled(lvl, place)) { this._sayReply(v, EXPEL_LINE, 4); return true; }
        if (m.refuse && this._trader(v)) { this._sayReply(v, REFUSE_LINE, 4); return true; }
        if (!tradeOnly && attitude(lvl, place, v.id) === 'scorn' && now - m.scornAt > 90000) { m.scornAt = now; this._sayReply(v, wizardLine(lvl, place, v.id), 5); return true; }
        return false;
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
    _sayThinking(v, text = '', intent = '', again = false) {
        v.talkedAt = performance.now();
        this._partner = v;
        // (his own words while he thinks — by role, a woman's own, by the question, in my language; never the same
        // twice running; those already made in his voice first: heard at once, not after a wait)
        const vo = this._voiceOpts(v);
        const line = fillerLine({ role: v.role, female: vo.female, wizard: !!v.wizard, text, intent, last: v.lastFiller || this._lastFiller, ready: (l) => this.speech.isReady?.(l, vo), short: !!(this.mind?.llm && this.mind.quickNet && !again) }, Math.random);
        v.lastFiller = line; this._lastFiller = line;
        this._filler = { v, at: performance.now() };
        const tr = this.trace.current;
        if (tr && tr.v === v) tr.quick = line;
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
        if (!this.voiceOn || !sp?.prepare || !sp.neural?.ready) return;
        const g = this.game, me = g.character.group.position;
        const lang = this._en ? 'en' : 'ru';
        const net = !!this.llm?.ready;
        const d = (v) => Math.hypot(v.x - me.x, v.z - me.z);
        const alive = this.life.targets().filter((v) => !v.dead);
        // the two nearest (whoever I may speak to) and — when I am the king — the two nearest knights within a shout
        // (a call to the army is answered by one of them: «Есть! Строимся!» must be heard at once)
        const near = alive.filter((v) => d(v) < 12).sort((a, b) => d(a) - d(b)).slice(0, 2);
        const knights = alive.filter((v) => (v.role === 'knight' || v.role === 'advisor') && d(v) < 40 && this.life.state(v.cs.def.id).owner === g.localId)
            .sort((a, b) => d(a) - d(b)).slice(0, 2);
        for (const v of new Set([...near, ...knights])) {
            const king = this.life.state(v.cs.def.id).owner === g.localId;
            const key = `${lang}|${king ? 'k' : ''}|${net ? 'n' : ''}`;
            if (v._fillersMade === key) continue;
            v._fillersMade = key;
            const vo = this._voiceOpts(v);
            const base = { role: v.role, female: vo.female, wizard: !!v.wizard, lang };
            const take = (kind, n) => fillerPool({ ...base, kind }).sort(() => Math.random() - 0.5).slice(0, n);
            // his quick words (orders, alarm) and his answers to orders — said the moment he hears (TalkAcks)
            // (first his short «Хм…» / «Ага…»: with a quick net the answer follows them at once)
            const lines = [...take(null, 12).filter(isShortFiller).slice(0, 2), ...(lang === 'ru' ? ackPool({ role: v.role, king, female: vo.female }) : [])];
            if (lang === 'ru' && (v.role === 'knight' || v.role === 'advisor')) lines.push(...(king ? ORDER_LINES.obey : ORDER_LINES.refuse)[v.role === 'advisor' ? 'advisor' : 'knight'].slice(0, 2));
            // his thinking words, by the kind of question (the net thinks; a rules' answer not made yet follows them)
            lines.push(...take(null, 2), ...take('question', 1), ...take('request', 1), ...take(v.role === 'merchant' ? 'trade' : 'greet', 1));
            // (few: each is made by the voice program on the processor — the game, the camera and the speech share it)
            sp.prepare(lines.slice(0, 10), vo);
        }
        // the sailor I would speak to: his «Есть!», «Есть поднять паруса!», «На абордаж!» (TalkAcks.CREW_ACKS)
        const s = g.ships?.crew?._listener?.();
        if (s && lang === 'ru' && s._acksMade !== 'ru' && s.role !== 'blackbeard') {
            s._acksMade = 'ru';
            sp.prepare([...ackPool({ role: 'sailor' }), ...fillerPool({ role: 'knight', lang }).slice(0, 2)], this._voiceOpts(s));
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
        if (this._forceText) return false; // (a price is shown in words too, whatever the voice does)
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
        else if (st.state === 'ready') {
            console.info('[CastleTalk]', st.text);
            const d = this.speech?.neural?.device;
            journal(`голоса жителей готовы: ${d === 'webgpu' ? 'на видеокарте (WebGPU)' : d === 'native' ? 'программа на компьютере (процессор)' : 'в браузере на процессоре'}`);
        }
    }

    /**
     * The microphone heard a sentence (not a spell). Returns true if a villager heard it.
     * A talk never breaks the game: any error in it — the villager says a short line, the reason goes to the journal.
     */
    hear(text, info = {}) {
        try { return this._hear(text, info || {}); } catch (e) {
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

    _hear(text, info = {}) {
        const g = this.game;
        if (!text || !this.life.enabled) return false;
        if (this._echo(text)) return false; // (a villager's own voice from the speakers in the microphone)
        text = this._unecho(text); // (and his words caught with mine in one phrase: «я человек простой… а ты можешь со мной пойти»)
        if (!text) return false;
        if (isApology(text) && this.life.forgive?.(g.localId)) return true; // («извините» to the one I knocked: calmed)
        const v = this._listener(text);
        if (!v) return false;
        this._en = isEnglishText(text); // (my language: the thinking words made in advance follow it)
        if (this._darkGate(v)) return true; // (чёрный маг: волшебник презирает, не продаёт, гонит — DarkMagic.js)
        if (this.life.night?.heard(v, text)) return true; // (asleep: a mumble; a merchant at night: «come in the morning»)
        // (a coin pouch on his counter and a good named: the purchase — VillagerBrain is not asked)
        if (this._trader(v) && this._payByName(v, text)) { v.talking = 4; v.talkTo = g.localId; return true; }
        const b = this.brain(v);
        const ctx = this._ctx(v);
        // (the same villager, my words went on after he began to answer — «рыцарь… иди за мной»: he stops
        // what he was saying and answers the whole phrase; his older answer, still being thought, is dropped)
        if (info.refine && this._partner === v) this.speech.cancelKey?.(v.id);
        this.llm?.stopWarm?.(); // (the processor is the answer's now: its voice must not wait for a warm-up)
        const turn = ++this._turn;
        this.attention?.talkedWith(v.id, performance.now()); // (my next words go on to him, even if I look away a moment)
        const tr = this._traceTurn(v, text, info);
        v.talking = 4;
        v.talkTo = g.localId;
        // (he turns to me at once — the moment he hears, not after his answer is thought of)
        const me = g.character.group.position;
        if (!v.foe) v.yaw = Math.atan2(-(me.x - v.x), -(me.z - v.z));
        this.trace.mark(tr, 'act');
        if (!g.authority) g.sync?.villagerTalk?.(v.id); // (the host stops them for the talk)
        const done = (res) => { if (turn !== this._turn) return; try { this._apply(v, res); } catch (e) { this._talkFailed(e, v); } };
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
        this.trace.mark(tr, 'rules');
        if (first.done) {
            this._talkLog(text, first.res, 'правила', 0);
            this._quickWord(v, first.res, text, ctx); // (his answer not ready in his voice yet: a short word of his first)
            done(first.res);
            return true;
        } // (the rules: at once)
        this.trace.kind(tr, 'net');
        const thinking = () => { if (turn === this._turn) this._sayThinking(v, text, first.res?.intent); };
        const t0 = performance.now();
        // (the first sentence of the net's answer is said as soon as it is written)
        const onSentence = (line, i) => {
            if (turn !== this._turn) return;
            if (i === 0) this.trace.mark(tr, 'sent');
            return i > 0 ? this._sayMore(v, line) : this._sayAnswer(v, line);
        };
        this.trace.mark(tr, 'net');
        // (a long think — open talk, a complex phrase — gets a second «сейчас скажу…» if the answer is still not there)
        if (this.mind._weak?.(first.res, text)) setTimeout(() => { if (turn === this._turn && this._asking && tr.at.sent == null) this._sayThinking(v, text, first.res?.intent, true); }, 2800);
        this._asking = true;
        this.mind.ask(b, text, ctx, first, { onThinking: thinking, onSentence, onToken: () => this.trace.mark(tr, 'tok') }).then((res) => {
            this._asking = false;
            this.trace.mark(tr, 'done');
            if (tr.at.voice != null) this.trace.done(tr); else setTimeout(() => this.trace.done(tr), 4000);
            if (turn !== this._turn) return; // (a newer word of mine: this answer is not said)
            // (the net failed: the rules answered — the reason in the journal, not too often)
            if (this.mind.lastError && (this._netErrLogged = (this._netErrLogged || 0) + 1) <= 20) journal(`нейросеть не ответила: ${this.mind.lastError} — ответили готовые фразы`);
            // (too slow on this computer: say so now and then — the answer came from the rules)
            if (this.mind.lastTimedOut) {
                this._slow = (this._slow || 0) + 1;
                if (this._slow >= 2 && performance.now() - (this._slowT || -1e9) > 180000) { this._slowT = performance.now(); journal('нейросеть не успевает ответить вовремя — отвечают готовые фразы'); }
            } else this._slow = 0;
            this._talkLog(text, res, res.smart ? 'нейросеть' : this.mind.lastTimedOut ? 'правила (нейросеть не успела)' : 'правила (ответ нейросети не подошёл)', performance.now() - t0);
            done(res);
        }, (e) => { this._asking = false; journal(`ошибка в ответе нейросети: ${String(e?.message || e).slice(0, 200)}`); done(first.res); }).catch((e) => this._talkFailed(e, v));
        return true;
    }

    /**
     * A person answers an order with a word at once («Слушаюсь!», «Иду!»), a question with «Хм…»: when the answer
     * itself is not yet made in his voice (made: heard at once — then nothing before it), a short word of his,
     * made in advance, is said first, and the answer follows it without a gap (tools/talkbench.mjs: the first
     * sound 0.4 s after my words, not 1–2 s).
     */
    _quickWord(v, res, text, ctx) {
        const sp = this.speech;
        if (!res?.reply || !this.voiceOn || !sp?.neural?.ready || !sp.isReady) return false;
        const vo = this._voiceOpts(v);
        if (sp.isReady(res.reply, vo) || (res.action === 'trade_yes')) return false;
        const order = quickOrder(text, this._players());
        let line = null;
        if (order || res.order) {
            line = ackFor({ order: order || res.action, role: v.role, king: !!ctx.playerIsKing, danger: this._danger(v), female: vo.female }, Math.random, (l) => sp.isReady(l, vo));
            if (res.refused || /^(нет|не )/i.test(res.reply)) line = null; // (a refusal: his own words only)
        } else {
            line = fillerLine({ role: v.role, female: vo.female, wizard: !!v.wizard, text, intent: res.intent, last: v.lastFiller || this._lastFiller, ready: (l) => sp.isReady(l, vo) });
        }
        if (!line || !sp.isReady(line, vo) || line === res.reply) return false;
        v.lastFiller = line; this._lastFiller = line;
        this._filler = { v, at: performance.now() };
        const tr = this.trace.current;
        if (tr && tr.v === v) tr.quick = line;
        this._urgent = true;
        try { if (v.ship) this.game.ships?.crew?._say?.(v, line, 2); else this.life._say(v, line, 2); } finally { this._urgent = false; }
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
        const L = this.life.enabled ? this._listener(text) : null;
        if (!L) return false;
        const spell = matchSpell(text);
        if (spell === 'Stand') return false; // («стоп» stops my spells first; with nothing to stop the villager hears it)
        // (paying: a good named to the merchant with my coins on his counter)
        if (this._trader(L) && this._pursePay(L) && (this._choiceOpen(L) || this._goodsOf(L).some((x) => namesGood(text, x.item)))) return true;
        // (in a talk with him, the hand down: what I say is to him — not a spell, unless it is one)
        if (!spell && this.inTalk() && this._partner === L && !this.game.isMagicActive) return true;
        if (detectOrder(text, this._players())) return true;
        const intent = detectIntent(text).intent;
        // («Бомбардо», «Инферно» said alone are spells, even if villagers like to talk about magic)
        if (spell && (intent === 'magic' || intent === 'unknown')) return false;
        return intent !== 'unknown';
    }

    /**
     * My words without the villagers' words caught with them. A little of his voice gets past the echo canceller
     * and the phrase heard was half his («я человек простойдел свое а ты можешь со мной пойти» — «Я человек простой»
     * was his): two or more words in a row the same, in the same order, as a line said in the last seconds are his.
     */
    _unecho(text) {
        const now = performance.now();
        const lines = (this._spoken || []).filter((l) => now - l.at < 12000).map((l) => normalizeText(l.text).split(' ').filter(Boolean));
        if (!lines.length) return text;
        const hw = normalizeText(text).split(' ').filter(Boolean);
        // (a heard word is his word: the same, or his word glued to the next — «простойдел»)
        const same = (h, w) => h === w || (w.length >= 4 && h.startsWith(w) && h.length - w.length <= 5);
        const his = new Array(hw.length).fill(false);
        for (const sw of lines) {
            for (let i = 0; i < hw.length; i++) {
                for (let j = 0; j < sw.length; j++) {
                    let n = 0;
                    while (i + n < hw.length && j + n < sw.length && same(hw[i + n], sw[j + n])) n++;
                    if (n >= 2) for (let k = 0; k < n; k++) his[i + k] = true;
                }
            }
        }
        if (!his.some(Boolean)) return text;
        return hw.filter((_, i) => !his[i]).join(' ');
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

    /**
     * Who hears me: the nearest villager within earshot, the one in front first — or, by the words (`text`):
     *  - called by role («рыцарь, …», «торговец, …», «советник…»): the nearest of that role a little farther too;
     *  - an order to the army / a call to all («рыцари!», «стража, к оружию!», «все в атаку!»): it is SHOUTED — a
     *    knight of my castle within a shout hears it (the order goes to the whole army: VillagerOrders).
     */
    _listener(text = null) {
        // (the one I address — looked at, walked to, just talked with; across a yard if I shout — Attention.js;
        // in a crowd the one I look at, not whoever stands nearest)
        const id = this.attention?.addressee((i) => { const v = this.life.byId.get(i); return !!v && !v.dead && Math.abs(v.y - (this.game.character.group.position.y - 1.95)) < 8; }, this._shouting());
        const best = (id && this.life.byId.get(id)) || this._nearest();
        if (!text) return best;
        const t = normalizeText(text);
        const role = ROLE_CALL.find(([re]) => re.test(t))?.[1];
        if (role) {
            const r = this._nearest((v) => (role === 'knight' ? v.role === 'knight' : v.role === role || (role === 'merchant' && this._trader(v))), HEAR * 2);
            if (r) return r;
        }
        const army = detectOrder(t, this._players());
        if ((army && army.name !== 'dismiss') || GROUP_CALL.test(t)) {
            if (best && (best.role === 'knight' || best.role === 'advisor')) return best;
            const k = this._nearest((v) => (v.role === 'knight' || v.role === 'advisor') && this.life.state(v.cs.def.id).owner === this.game.localId, SHOUT_HEAR);
            if (k) return k;
        }
        return best;
    }

    /** The nearest villager within `range` (the one in front first) that `ok` accepts. */
    _nearest(ok = null, range = HEAR) {
        const g = this.game;
        const me = g.character.group.position;
        const yaw = g.character.group.rotation.y;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        let best = null, bs = Infinity;
        for (const v of this.life.byId.values()) {
            if (v.dead) continue;
            const dx = v.x - me.x, dz = v.z - me.z;
            const d = Math.hypot(dx, dz);
            if (ok && !ok(v)) continue;
            if ((d > range && !(v.order?.kind === 'door' && inHall(v.cs.def, me, 0))) || Math.abs(v.y - (me.y - 1.95)) > (range > HEAR ? 8 : 3)) continue; // (the vizier at the doors hears the king anywhere in the throne room)
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
    _goodsOf(v) { return this._goodsAt(this._stallKey(v.cs.def, v.entry.stall)); }

    _goodsAt(key) {
        const s = this.stalls.get(key);
        if (!s) return [];
        const out = [];
        for (const uid of s.goods) {
            const L = this.game.items.loose.get(uid);
            if (L && L.item.shop && !L.item.shop.paid) out.push({ name: nameOf(L.item), price: L.item.shop.price, uid, item: L.item, pos: L.model.position });
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
                    L.perch = c; // (its counter is its floor — Items._floorUnder)
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
        { // (чёрный маг: лавка мага не продаёт — товар остаётся на прилавке, как до разговора)
            const [cid0, s0] = String(item.shop?.stall || '').split(':s');
            const cs0 = this.life.castles.get(cid0), v0 = cs0 ? this._merchantOf(cs0.def, +s0) : null;
            if (v0 && this._darkGate(v0, true)) return;
        }
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
        this.game.hud.setVoice?.(`💰 ${item.shop.price} монет. «Да» — купить (у вас ${this.game.inventory.coins()})`, true);
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

    /** The merchant asked «which one?» a moment ago and waits for the answer. */
    _choiceOpen(v) {
        const c = this._choice;
        return !!c && c.v === v && performance.now() - c.at < 40000 && !!this._pursePay(v);
    }

    /**
     * I named a good with my coins on the counter: pay for it from the pouch (the host decides). Several goods fit —
     * the merchant asks which (never picks one himself); the answer («вторую», «левую») is read here, before any net.
     */
    _payByName(v, text) {
        const C = this._pursePay(v);
        if (!C) { this._choice = null; return false; }
        const key = this._stallKey(v.cs.def, v.entry.stall), stall = v.cs.def.stalls?.[v.entry.stall];
        const goods = this._goodsOf(v);
        const res = chooseGood(text, goods, stall, this._choiceOpen(v) ? this._choice.uids : null);
        if (!res) return false;
        const g = this.game;
        if (res.good) {
            this._choice = null;
            if (g.authority) this.pay(C.item.uid, res.good.uid, g.localId);
            else g.sync?.tradePay?.(C.item.uid, res.good.uid);
            return true;
        }
        this._choice = { v, uids: res.ask.map((x) => x.uid), at: performance.now() };
        this._labelOff.delete(key); // (the words over the goods are there while he asks)
        this._scanT = Math.min(this._scanT, 0.05);
        const labels = labelGoods(stall, goods);
        this._sayReply(v, askLine(res.ask, labels), 6);
        g.hud.setVoice?.('🛒 Над товарами подписи — назовите нужный: «первая», «вторая»… или «левая», «правая»', true);
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
        this._labelOff.add(G.item.shop.stall);
        g.sync?.tradePaid?.(goodUid);
        this._sayForGuestOrMe(v, by, rest > 0 ? `Беру ${price}. Остаток твой — забирай. И ${name} забирай, он твой!` : `Беру ${price}. Забирай, ${name} твой!`);
        this._tradeNote(by, `💰 Списано ${price} монет за: ${name}${rest > 0 ? ` (в мешочке осталось ${rest} — заберите его)` : ''}. Товар можно забрать`);
        if (this.purse?.uid === coinUid) this.purse = null;
    }

    /** (everybody) a good was paid for: its price card goes, the hand may take it. */
    paidGood(uid) {
        const L = this.game.items.loose.get(uid);
        if (L?.item.shop) { L.item.shop.paid = true; this._labelOff.add(L.item.shop.stall); }
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
        // (one pouch with the whole sum: the pouch has no limit; picked up, its coins go into mine)
        g.items.spawnLoose(makeMagicPouch(newUid(), Math.max(1, Math.round(price))), new THREE.Vector3(p.x, p.y + 0.3, p.z));
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

    /** A line for the journal at most once per `ms` (the same text is not repeated). */
    _dbg(line, ms = 1500) {
        const now = performance.now();
        if (line === this._dbgLast && now - (this._dbgAt || 0) < ms) return;
        this._dbgLast = line; this._dbgAt = now;
        journal(line);
    }

    /** (journal) what a buyer's counter sees: who stands behind it, every loose thing near it and where it lies against it. */
    _watchLog(cs, stall, i, key, dist) {
        const g = this.game, c = stall.counter, now = performance.now();
        if (now - (this._wlAt || 0) < 2000) return;
        this._wlAt = now;
        const v = this._merchantOf(cs.def, i);
        const f = (n) => (typeof n === 'number' ? n.toFixed(2) : n);
        const parts = [`скупщик ${key}: до прилавка ${f(dist)} м, ${stall.pawn ? 'ломбард' : 'тайный'}; прилавок x ${f(c.x0)}…${f(c.x1)} z ${f(c.z0)}…${f(c.z1)} верх ${f(c.top)}; продавец ${v ? `${v.name || v.id} (враг ${!!v.foe}, мёртв ${!!v.dead})` : 'НЕ НАЙДЕН'}; замок враждебен ${cs.hostile.get(g.localId) > Date.now()}; сцена спит ${!cs.awake}; предложение ${this.offer ? `${this.offer.price} за ${this.offer.uid || this.offer.wid}` : 'нет'}`];
        for (const L of g.items.loose.values()) {
            const p = L.model.position;
            if (Math.hypot(p.x - (c.x0 + c.x1) / 2, p.z - (c.z0 + c.z1) / 2) > 7) continue;
            parts.push(`  вещь ${L.item.kind} ${L.item.uid}: (${f(p.x)}, ${f(p.y)}, ${f(p.z)}) на прилавке ${onCounter(stall, p)}, скорость² ${f(L.vel.lengthSq())}, парит ${!!L.hover}, цена-карточка ${!!L.item.shop}, лежит ${!!L.rest}`);
        }
        for (const w of g.weapons.weapons) {
            const p = w.position;
            if (Math.hypot(p.x - (c.x0 + c.x1) / 2, p.z - (c.z0 + c.z1) / 2) > 7) continue;
            parts.push(`  оружие ${w.type} #${w.id}: (${f(p.x)}, ${f(p.y)}, ${f(p.z)}) на прилавке ${onCounter(stall, p)}, в руке ${!!w.holder}, спит ${!!w.sleeping}`);
        }
        journal(parts.join('\n'));
    }

    /** The buyer looks at a thing lying on his counter: refuses it, or names the (kept) sum. found: {uid|wid, item, pos} */
    _offerSell(v, stall, key, found) {
        const g = this.game;
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
        this._forceText = true;
        try { this._sayReply(v, line, 6); } finally { this._forceText = false; }
        g.hud.setVoice?.(`💰 Скупщик даёт ${price} монет. «Да» — отдать вещь, убрать её с прилавка — передумать`, true); // (no «скажите»: the hint policy shows such hints once only — the price must show every time)
    }

    /** Things put on a counter (to sell) and things carried away unpaid (stolen). */
    _watchMarket() {
        const g = this.game;
        const me = g.character.group.position;
        if (performance.now() - (this._wcAt || 0) > 5000) { // (journal: does the scan see the buyers' places at all?)
            this._wcAt = performance.now();
            const near = [];
            for (const cs of this.life.castles.values()) cs.def.stalls.forEach((st, i) => { if ((st.pawn || st.fence) && Math.hypot((st.counter.x0 + st.counter.x1) / 2 - me.x, (st.counter.z0 + st.counter.z1) / 2 - me.z) < 40) near.push(`${cs.def.id}:s${i} ${st.pawn ? 'ломбард' : 'тайный'} ${cs.awake ? 'проснулось' : 'СПИТ'}`); });
            if (near.length) journal(`скупщики рядом (до 40 м): ${near.join('; ')}`);
        }
        const texts = new Map();
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            cs.def.stalls.forEach((stall, i) => {
                const c = stall.counter;
                const key = this._stallKey(cs.def, i);
                const dist = Math.hypot((c.x0 + c.x1) / 2 - me.x, (c.z0 + c.z1) / 2 - me.z);
                const buyer = !!(stall.pawn || stall.fence);
                if (buyer && dist < 14) this._watchLog(cs, stall, i, key, dist);
                if (dist > 9) { this._labelOff.delete(key); return; }
                const v = this._merchantOf(cs.def, i);
                if (!v || v.foe || cs.hostile.get(g.localId) > Date.now()) return;
                const on = (p) => onCounter(stall, p);
                let found = null;
                // my pouch of coins put down on the counter: «what do you want?» (not at a buyer's: he sells nothing — coins there mean nothing to him)
                let coins = false;
                if (!stall.pawn && !stall.fence) for (const L of g.items.loose.values()) {
                    if (L.item.kind !== 'coins' || L.item.shop || !(L.item.count > 0) || L.hover || !on(L.model.position) || L.vel.lengthSq() > 0.05) continue;
                    coins = true;
                    if (this.purse?.uid !== L.item.uid) {
                        this.purse = { uid: L.item.uid, v };
                        if (performance.now() - (v.talkedAt || -1e9) < 6000) break; // (the change he just left: no new question)
                        v.talking = 4;
                        this._sayReply(v, `Вижу монеты — ${L.item.count}. Что желаешь купить?`, 6);
                        g.hud.setVoice?.(`💰 На прилавке ${L.item.count} монет — назовите товар (цена — на карточке рядом с ним)`, true);
                    }
                    break;
                }
                // (the words over the goods: while my coins lie on his counter and I stand near — gone after the purchase)
                if (!coins) this._labelOff.delete(key);
                else if (dist <= 8 && !this._labelOff.has(key) && !stall.pawn && !stall.fence) {
                    for (const [uid, lb] of labelGoods(stall, this._goodsAt(key))) texts.set(uid, lb.text);
                }
                for (const L of g.items.loose.values()) {
                    if (L.item.shop || L.item.kind === 'coins' || L.hover) continue;
                    const sp = L.model.position;
                    if (!on(sp) || L.vel.lengthSq() > 0.6) continue; // (lying, or nearly)
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
                if (this.offer && (this.offer.uid ? this.offer.uid === found.uid : this.offer.wid === found.wid)) { if (buyer) this._dbg(`скупщик ${key}: вещь ${found.uid || found.wid} уже в предложении (цена ${this.offer.price}), молчу`, 3000); return; }
                if (buyer) this._dbg(`скупщик ${key}: нашёл вещь ${found.uid || found.wid} (${found.item.kind}) → называю цену`, 1000);
                // (only the settlement's pawnshop (anything, 40 % under) and a town's shady buyer (only plain things) buy — every other seller only sells: WizardMarket.js)
                if (!stall.pawn && !stall.fence) return;
                this._offerSell(v, stall, key, found);
            });
        }
        this._labelText = texts;
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
     * The off hand just laid a thing on a buyer's counter (Items / Weapons): he looks at it at once — no waiting
     * for it to settle — and names the sum.
     */
    laid(st, found) {
        const p = found.pos;
        journal(`скупщик: положено рукой ${found.uid || found.wid} (${found.item?.kind}) в (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}); прилавок x ${st.counter.x0.toFixed(2)}…${st.counter.x1.toFixed(2)} z ${st.counter.z0.toFixed(2)}…${st.counter.z1.toFixed(2)} верх ${st.counter.top.toFixed(2)}; на прилавке ${onCounter(st, p)}`);
        // (a new laying starts a new look: whatever offer hung before is void; the usual watch of the counters —
        // the one that always worked — sees the thing as soon as it lies, and he names the sum)
        this.offer = null;
        this._refused = null;
        this._scanT = Math.min(this._scanT, 0.3);
    }

    /** (a hint while the hand is held out near a buyer's counter) where the hand is against it, or null when no buyer is near. */
    buyerDiag(p) {
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            for (const st of cs.def.stalls) {
                if (!st.pawn && !st.fence) continue;
                const o = counterOffset(st, p);
                if (o.side < 4 && Math.abs(o.up) < 4) return o;
            }
        }
        return null;
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
        let made = 0;
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
            // the hologram over the card (the words of the purchase: «Первая палочка», «Крыло феникса»)
            const word = this._labelText.get(L.item.uid);
            if (word && (!t.lab || t.lab.text !== word)) {
                if (t.lab) this._dropLabel(t);
                if (made < 1) { made++; t.lab = this._makeLabel(word); } // (one texture a frame)
            } else if (!word && t.lab) this._dropLabel(t);
            if (t.lab) {
                t.lab.sp.position.set(p.x, p.y + t.top + LABEL.UP, p.z);
                t.lab.sp.visible = t.sp.visible;
            }
        }
        for (const [uid, t] of T) if (!want.has(uid)) { this._dropLabel(t); g.scene.remove(t.sp); t.tex.dispose(); t.sp.material.dispose(); T.delete(uid); }
    }

    /** A hologram sprite with this text (the texture and material shared by text, counted). */
    _makeLabel(text) {
        let e = this._labCache.get(text);
        if (!e) {
            const c = document.createElement('canvas');
            c.width = 256; c.height = 64;
            const x = c.getContext('2d');
            x.fillStyle = 'rgba(8,30,48,0.78)'; x.fillRect(0, 0, 256, 64);
            x.strokeStyle = '#7fe9ff'; x.lineWidth = 4; x.strokeRect(2, 2, 252, 60);
            x.fillStyle = '#d8fbff'; x.textAlign = 'center'; x.textBaseline = 'middle';
            let px = 34;
            x.font = `bold ${px}px sans-serif`;
            while (px > 14 && x.measureText(text).width > 236) { px -= 2; x.font = `bold ${px}px sans-serif`; }
            x.fillText(text, 128, 34);
            const tex = new THREE.CanvasTexture(c);
            e = { tex, mat: new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), refs: 0 };
            this._labCache.set(text, e);
        }
        e.refs++;
        const sp = new THREE.Sprite(e.mat);
        sp.renderOrder = 31;
        sp.scale.set(LABEL.W, LABEL.H, 1);
        this.game.scene.add(sp);
        return { sp, text };
    }

    _dropLabel(t) {
        const l = t.lab;
        if (!l) return;
        t.lab = null;
        this.game.scene.remove(l.sp);
        const e = this._labCache.get(l.text);
        if (e && --e.refs <= 0 && this._labCache.size > 24) { e.tex.dispose(); e.mat.dispose(); this._labCache.delete(l.text); }
    }

    // ---------------------------------------------------------- greetings
    _greetings(now) {
        const g = this.game;
        const me = g.character.group.position;
        for (const v of this.life.byId.values()) {
            // (one who just noticed me stands facing me — that is no talk yet: he may greet me)
            const noticed = now - (v.noticedAt || -1e9) < 400;
            if (v.dead || v.foe || (v.talking > 0 && !noticed) || now - (v.talkedAt || -1e9) < 600000 || this.inTalk()) continue; // (no new «привет» from one I talked with lately, nor in the middle of a talk)
            const d = Math.hypot(v.x - me.x, v.z - me.z);
            // (near — or he noticed me looking at him and coming: a greeting from across the street, not at the door — Attention.js)
            if (d > 5 && !(this.attention?.score(v.id) >= ATT.NOTICE && d < ATT.TALK + 3)) continue;
            // (a wall between us: he does not know I am here — no «привет» through it)
            if (g.collision?.lineOfSight && this._losOf && !inSight(v, this._losOf, this._losCache, now)) continue;
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
        this._attT += dt;
        if (this._attT >= 0.1) { this._attend(this._attT, now); this._attT = 0; }
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
            // (no warm-up of the net while I come near: on the author's processor it took the cores the voice and the
            // speech program need — words heard 3 s late, «Джолт» 3–4 s, frames lost; TalkMind.warmRequest stays for tests)
            // (always on — loaded in the background soon after the start; meanwhile the rules answer)
            if (g.config.villagerAI !== 'off' && !this.llm && !this._llmTried && this.life.enabled && (this._age >= 15 || close)) { this._llmTried = true; this._loadLLM(g.config.villagerAI || 'auto'); }
        }
        for (const v of this.life.byId.values()) if (v.talking > 0) v.talking -= dt;
        this._tags();
        // (my partner stays with me for the whole talk — also while the net thinks — not only 4 s)
        // (not one who is doing what I asked — following me, showing the way, carrying out an order: he answers on the way)
        const P = this._partner;
        if (this.inTalk() && P.talking < 1 && !P.foe && !P.follow && !(P.guiding > 0) && !P.order && !(P.fleeT > 0)) { P.talking = 1; P.talkTo = g.localId; }
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
                journal(`✅ ГОТОВА: ${mk.label} ${nat ? 'отдельной программой на компьютере (llama.cpp, на видеокарте)' : `на ${info.device === 'webgpu' ? `видеокарте${info.gpuName ? ` (${info.gpuName})` : ''}` : 'процессоре'}`}, ${info.dtype}, загрузка ${((performance.now() - t0) / 1000).toFixed(1)} с`
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
