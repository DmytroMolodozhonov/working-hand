/**
 * NetSync.js — game-level multiplayer protocol.
 *
 * Authority: the host simulates zombies, chests, free weapons and explosions.
 * Every player simulates their own body and the weapons in their hands.
 *
 * Messages (JSON, `t` = type):
 *   welcome  host→client  config, seed, world edits, chests, weapons, zombies
 *   p        everyone     player pose 20×/s (relayed by the host) + held weapons
 *   z        host→all     zombie snapshots 12×/s;  zrem: removed zombies
 *   zhit     host→all     damage result (flash / limb / head / death) for visuals
 *   zsand    host→all     zombie turned to sand
 *   hit      client→host  my weapon/fist hit zombie X
 *   spell    caster→all   spell cast (visual everywhere, damage on host)
 *   stop     caster→all   «стоп»: the flames / ice beams / storm the caster holds end
 *   lev      caster→all   Leviosa holds / lets go a body (host carries it) or a wizard;  levno: host→caster, taken
 *   lift     wizard→all   I am held up by `by` (or let go / broke free)
 *   boom     host→all     explosion (terrain + effects)
 *   tdes     any→all      «Total Destruction» begins at a place (each computer ruins the same blocks)
 *   circ     any→all      «Circle Attack» (k: Maxima) at the caster's feet, with its rays (each computer: the same wave)
 *   insp     any→all      «Inspirius»: the ball launched (go), where it flies (at, 10×/s), where it burst (boom)
 *   chest    host→all     chest opened;  wspawn: reward weapon
 *   grab/rel client→host  weapon picked up / thrown;  wown: owner changed
 *   w        host→all     free weapon poses 10×/s
 *   bite     host→player  zombie bit you;  win: someone reached the finish
 *   wb       player→all   water ball in hand (10×/s);  wdrop: ball dropped
 *   vx       player→all   «Water Vortex» (its state 10×/s, launch, hit, bubble, freeze, burst) and «Fire Maxima»
 *   ice      player→all   ice blocks built with water forming
 *   phit     player→all   my fist/weapon hit player `to` (Свободный мир); with k/pt/i/lp: the blow's push
 *   ppush    player→all   my hands pushed / slapped / shoved player `to` (no harm: their body moves)
 *   cimp     host→all     creatures' bodies: fell (k), reeled (s), rose (r), head jolted (j) — CreatureImpact
 *   cstrike  client→host  my hands hit a creature: the host applies the push
 *   pdead    player→all   I was killed (by `killer`; `mm` my mana maximum: a duel won against me is worth it)
 *   mcred    host→player  your last blow killed a magical creature (kind) / a wizard you beat in a duel (wiz, mm): Mana.js
 *   achc     host→player  you took part in a kill worth an achievement (k): Achievements.js
 *   ach      player→all   my achievements: a new one (got) / how many I have (state) — «Высший маг» over my name
 *   dbody    any→all      a body stays where somebody died (Death.js; the host keeps the list; `lg`: its owner's legacy — Legacy.js)
 *   dblg     any→all      its owner took the legacy back from that body
 *   duel     caster→all   a duel charge flies (dend: it hit / was blocked / fizzled)
 *   clash    host→all     two charges are pushing (meeting point p); clashend: result
 *   dmcut / dmlimb / dmst / dmresc   a blade cut off a limb / the head (see Dismember.js)
 */

import * as THREE from 'three';
import { RemoteAvatar } from './RemoteAvatar.js';
import { playerSnapshot, applyPlayerSnapshot } from '../game/WorldSave.js';
import { keepIn } from '../game/HouseWards.js';
import { LUMOS } from '../game/WandMagic.js';
import { applyCredit } from '../game/Mana.js';

const _v = new THREE.Vector3();
const r3 = (v) => Math.round(v * 1000) / 1000;
const vec = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export class NetSync {
    constructor(game, net) {
        this.game = game;
        this.net = net;
        this.pTimer = 0;
        this.zTimer = 0;
        this.wTimer = 0;
        this.wbTimer = 0;
        this._wbSent = null;
        this.hudTimer = 0;
        this.weaponOwners = new Map(); // weaponId -> playerId
        this.knownZombies = new Set();
        this._off = [
            net.on('message', (m) => this._onMessage(m)),
            net.on('peer-join', (p) => this._onJoin(p)),
            net.on('peer-leave', (p) => this._onLeave(p.id)),
            net.on('players', (list) => this._syncPlayerList(list)),
        ];
        const ws = game.weapons;
        ws.onGrab = (w, side) => this._localGrab(w, side);
        ws.onRelease = (w, side) => this._localRelease(w, side);
        this._syncPlayerList(net.playerList());
        this._announce = true; // from now on, joins/leaves are shown on screen
    }

    dispose() {
        try { this._sendMine(); } catch (e) { /* closing */ }
        for (const off of this._off) off();
    }

    get me() {
        return this.net.localId;
    }

    // ============================================================== players
    _syncPlayerList(list) {
        const ids = new Set(list.map((p) => p.id));
        for (const p of list) {
            if (p.id === this.me || this.game.remotes.has(p.id)) continue;
            const av = new RemoteAvatar(this.game.scene, p.id, p.name, p.color);
            this.game.remotes.set(p.id, av);
            if (this.looks?.has(p.id)) av.setLook(this.looks.get(p.id));
            if (this._announce) this.game.hud.notify?.(`🟢 Подключился: ${p.name}`);
            this._lookSoon = true; // a newcomer: tell them how I look
        }
        for (const id of [...this.game.remotes.keys()]) if (!ids.has(id)) this._onLeave(id);
    }

    _onJoin({ id, name }) {
        if (!this.game.remotes.has(id)) {
            const info = this.net.players.get(id);
            const av = new RemoteAvatar(this.game.scene, id, name, info?.color || 1);
            this.game.remotes.set(id, av);
            if (this.looks?.has(id)) av.setLook(this.looks.get(id));
            if (this._announce) this.game.hud.notify?.(`🟢 Подключился: ${name}`);
        }
        // Late joiner: send the whole world state
        this.sendLook();
        this.game.inventory?.purse?.resend(); // (the coin pouches on my belt)
        if (this.net.isHost) {
            const msg = this.welcomeMessage();
            msg.you = this.game.keeper?.playerFor(this.net.players.get(id)?.pid, this.net.players.get(id)?.name || name) || null; // a player coming back gets their things (by their own lasting id, not by a name someone else may have too)
            this.net.sendTo(id, msg);
        }
    }

    _onLeave(id) {
        const r = this.game.remotes.get(id);
        if (r) {
            if (this._announce) this.game.hud.notify?.(`🔴 Вышел: ${r.name}`);
            this.game.bleeding?.clearCuts(r.character);
            r.dispose();
            this.game.remotes.delete(id);
        }
        this.game.water?.applyRemote(id, null);
        this.game.levitation?.onLeave(id); // (what they held falls; if they held me, I fall)
        this.game.levMax?.onLeave(id);
        this.game.handHold?.onLeave(id); // (hands they held or that held mine: let go)
        this.game.boards?.onLeave(id); // (the surfboard they held or rode stays where it was)
        // Drop weapons they were holding
        for (const [wid, owner] of this.weaponOwners) {
            if (owner !== id) continue;
            this.weaponOwners.delete(wid);
            const w = this.game.weapons.byId.get(wid);
            if (w) { w.clearRemote(); w.holder = null; w.drive = null; w.wake(); }
        }
    }

    welcomeMessage() {
        const g = this.game;
        return {
            t: 'welcome',
            config: sanitizeConfig(g.config),
            explosions: g.explosions,
            chests: [...new Set([...g.chests.filter((c) => c.isOpen).map((c) => c.id), ...(g._openedChests || [])])],
            items: g.items ? [...g.items.loose.values()].map((L) => ({ item: L.item, p: [r3(L.model.position.x), r3(L.model.position.y), r3(L.model.position.z)], h: L.hover ? 1 : 0 })) : [],
            weapons: g.weapons.weapons.map((w) => ({ s: w.serialize(), owner: this.weaponOwners.get(w.id) || (w.holder ? this.me : null), hover: !!w.hover })),
            zombies: g.zombies.map((z) => z.serialize()),
            ice: g.iceCells,
            players: this.net.playerList(),
            dayStart: g.dayStart,
            doors: g.doors?.snapshot() || [],
            locks: g.locks?.snapshot() || null, // («Алохомора»: unlocked chests, doors, gates; the doors locked now)
            boards: g.boards?.snapshot() || null,
            campfires: g.campfires?.snapshot() || [],
            cauldrons: g.cauldrons?.snapshot() || null,
            houses: g.houses?.snapshot() || null,
            wards: g.wards?.netList() || [], // houses' spheres of protection
            mhouses: g.houseMagic?.netList() || [], // houses made by magic (HouseMagic.js)
            mcastles: g.castleMagic?.netList() || [], // castles made by magic (CastleMagic.js)
            icemagic: g.iceMagic?.netList() || [], // castles and bridges of ice (IceMagic.js)
            planets: g.space?.planets.toJSON() || null, // the planets (made, changed by spells: Space.js)
            beds: g.beds?.snapshot() || [],
            castles: g.castleLife?.snapshot() || {},
            rebuild: g.castleLife?.rebuild.snapshot() || null, // (what the builders put back: stands again after the blasts are replayed)
            bodies: g.death?.snapshot() || [],
            vai: !!g.castleLife?.talk?.llm?.ready, // (the host's villager net answers the guests too)
            weather: g.storm && g.storm.until > performance.now() ? Math.round((g.storm.until - performance.now()) / 1000) : 0,
            rain: g.storm?.rainLeft?.() || 0, // («Let it rain» still falling)
            edits: g.blockEdits || [],
            treesGone: g.world.trees ? g.world.trees.filter((t) => !t.alive).map((t) => t.index) : [],
            crystals: g.crystals?.snapshot() || [],
            ships: g.ships ? g.ships.snapshot(true) : [],
            guns: g.ships ? g.ships.cannons.snapshot() : [],
        };
    }

    /** Client: apply the host's world state after our own world was generated from the same seed. */
    applyWelcome(msg) {
        const g = this.game;
        if (Array.isArray(msg.edits) && msg.edits.length) g.builder?.applyEdits(msg.edits.slice(-30000));
        for (const i of msg.treesGone || []) { const t = g.world.trees?.find((x) => x.index === i); if (t && t.alive) g.world.removeTree(t); }
        if (msg.crystals) g.crystals?.restore(msg.crystals);
        if (msg.dayStart) { g.dayStart = msg.dayStart; if (g.dayCycle) g.world.setDayPhase(g.dayPhase()); }
        if (msg.weather > 0) g.gear?.startWeather(msg.weather);
        if (msg.rain > 0) g.storm?.startRain(msg.rain);
        if (msg.doors) g.doors?.restore(msg.doors);
        if (msg.locks) g.locks?.restore(msg.locks);
        if (msg.boards) g.boards?.restore(msg.boards);
        if (msg.campfires) g.campfires?.restore(msg.campfires);
        if (msg.cauldrons) g.cauldrons?.restore(msg.cauldrons);
        if (msg.houses) g.houses?.restore(msg.houses);
        if (msg.wards) g.wards?.applyNet(msg.wards);
        if (msg.beds) g.beds?.restore(msg.beds);
        if (msg.mhouses) g.houseMagic?.applyNet(msg.mhouses);
        if (msg.mcastles) g.castleMagic?.applyNet(msg.mcastles);
        if (msg.icemagic) g.iceMagic?.applyNet(msg.icemagic);
        if (msg.planets) g.space?.planets.applyJSON(msg.planets);
        if (msg.castles) g.castleLife?.restore(msg.castles);
        if (msg.ships) g.ships?.restore(msg.ships);
        if (msg.guns) g.ships?.cannons.restore(msg.guns);
        if (msg.bodies) g.death?.restore(msg.bodies);
        if (msg.vai && g.castleLife) g.castleLife.talk.hostSmart = true;
        for (const e of msg.explosions || []) {
            if (e.ruin) g.world.ruin(vec(e.p), e.r, keepIn(e.k), e.ri != null ? { inner: e.ri, full: e.rf } : null); // («Total Destruction»; ri: a band of a wave — «Circle Attack», «Inspirius»)
            else g.world.explode(vec(e.p), e.r, keepIn(e.k)); // (k: houses' spheres it could not eat into)
            g.explosions.push(e);
        }
        if (msg.rebuild) g.castleLife?.rebuild.restore(msg.rebuild); // (after the blasts: what was put back since)
        if (msg.ice && msg.ice.length) g.applyIce(msg.ice);
        for (const id of msg.chests || []) {
            (g._openedChests = g._openedChests || new Set()).add(id);
            const c = g.chests.find((x) => x.id === id);
            if (c) c.setOpenInstant();
        }
        for (const e of msg.items || []) g.items?.spawnLoose(e.item, vec(e.p), { hover: !!e.h, broadcast: false });
        const known = new Set(g.weapons.weapons.map((w) => w.id));
        for (const wd of msg.weapons || []) {
            let w = g.weapons.byId.get(wd.s[0]);
            if (!w) w = g.weapons.markMagic(g.weapons.spawn(wd.s[1], vec([wd.s[2], wd.s[3], wd.s[4]]), new THREE.Quaternion(wd.s[5], wd.s[6], wd.s[7], wd.s[8]), wd.s[0]), wd.s[10]);
            known.delete(wd.s[0]);
            w.setRemoteTarget(wd.s);
            if (wd.owner) this.weaponOwners.set(w.id, wd.owner);
        }
        // Weapons the host no longer has (e.g. destroyed) — remove
        for (const id of known) { const w = g.weapons.byId.get(id); if (w) g.weapons.remove(w); }
        this._applyZombies(msg.zombies || []);
        if (msg.players) {
            this.net.players = new Map(msg.players.map((p) => [p.id, { name: p.name, color: p.color }]));
            this._syncPlayerList(msg.players);
        }
        if (msg.you && !this._gotMine) { this._gotMine = true; applyPlayerSnapshot(g, msg.you); g.inventory?.ensureStarterWand(); g.hud.update(g.playerHP, g.maxHP, g.killCount, g.punchCount); }
    }

    /** Guests send their own things to the host now and then (the host keeps the world). */
    _sendMine() {
        if (this.net.isHost) return;
        this.net.send({ t: 'pstate', name: this.net.name, s: playerSnapshot(this.game) });
    }

    // ================================================================ update
    update(dt) {
        const g = this.game;
        if (this._lookSoon || !this._lookSent) { this._lookSoon = false; this._lookSent = true; this.sendLook(); }
        this._mineT = (this._mineT || 0) + dt;
        if (this._mineT > 8) { this._mineT = 0; this._sendMine(); }
        this.pTimer += dt;
        // (through the slow go-between: ~8 times a second instead of 20)
        if (this.pTimer >= (this.net.relayed ? 0.12 : 0.05)) {
            this.pTimer = 0;
            const held = [];
            for (const hs of g.weapons.heldWeapons()) held.push(hs.held.serialize());
            for (const w of g.weapons.stuckWeapons()) if (!w.holder?.side) held.push(w.serialize()); // stuck in a body: still mine (one still in my hand went above)
            const floating = g.levitation?.heldWeapon();
            if (floating) held.push(floating.serialize());
            this.net.send({
                t: 'p', id: this.me, s: g.character.serializePose(), hp: g.combat.enabled ? g.combat.hp : g.playerHP,
                c: g.combat.serialize(), ft: Math.round(g.combat.fatigue * 10) / 10, mm: Math.floor(g.combat.maxFatigue || 30), dc: g.duel.myContact(), w: held,
                bk: g.books?.reading?.netState() || undefined, // (my book open in the hands)
                lm: g.wandMagic?.light?.level || undefined, // (my wand's tip shines: everybody sees it, and is lit by it)
                sh: g.ships?.myNet(), // (standing on a ship: my place on its deck)
                bd: g.boards?.netMine(), // (the surfboard I carry or ride)
                bw: g.gear?.netBow(), // (an arrow on my bow's string, and how far it is drawn)
                dw: g.items?.wand?.dragon ? 1 : undefined, // (the dragon's wand in my hand: my fire spells are 60% stronger)
                sp: g.space?.netPos(), // (in space: my place there — the others draw me by it, Space.js)
            }, true);
        }
        // Water ball in my hand
        this.wbTimer += dt;
        if (this.wbTimer >= 0.1) {
            this.wbTimer = 0;
            const st = g.water.serialize();
            if (st || this._wbSent) this.net.send({ t: 'wb', by: this.me, s: st }, true);
            this._wbSent = st;
        }
        if (this.net.isHost) {
            this.zTimer += dt;
            if (this.zTimer >= 1 / 12) {
                this.zTimer = 0;
                const list = [];
                const alive = new Set();
                for (const z of g.zombies) { list.push(z.serialize()); alive.add(z.id); }
                const removed = [...this.knownZombies].filter((id) => !alive.has(id));
                this.knownZombies = alive;
                this.net.send({ t: 'z', l: list, rm: removed });
            }
            this.wTimer += dt;
            if (this.wTimer >= 0.1) {
                this.wTimer = 0;
                const list = [];
                for (const w of g.weapons.weapons) {
                    if (this.weaponOwners.has(w.id) || w.holder) continue;
                    if (!w.sleeping || w.hover || !w._sentSleep) {
                        list.push(w.serialize());
                        w._sentSleep = w.sleeping && !w.hover;
                    }
                }
                if (list.length) this.net.send({ t: 'w', l: list });
            }
        }
        this.hudTimer += dt;
        if (this.hudTimer > 0.5) {
            this.hudTimer = 0;
            const showHp = g.config.mode !== 'creative';
            const world = this.net.code && /WORLD/.test(this.net.code);
            const title = world ? '🌍 Общий сервер' : `🌐 Комната <b>${this.net.code}</b>`;
            const rows = [`<div class="mp-hud-title">${title} · игроков: <b>${g.remotes.size + 1}</b></div>`];
            const myHp = g.combat?.enabled ? g.combat.hp : null;
            rows.push(`<div class="mp-hud-row me"><span>${escapeHtml(this.net.name)} (вы)</span>${showHp && myHp != null ? `<span>${myHp} HP</span>` : ''}</div>`);
            for (const r of g.remotes.values()) {
                const col = '#' + (r.color ?? 0x3498db).toString(16).padStart(6, '0');
                rows.push(`<div class="mp-hud-row"><span><i style="background:${col}"></i>${escapeHtml(r.name)}</span>${showHp && r.hp != null ? `<span>${r.dead ? '💀' : r.hp + ' HP'}</span>` : ''}</div>`);
            }
            g.hud.setMultiplayer(rows.join(''));
        }
    }

    // ========================================================== outgoing
    zombieHit(z, res, by) {
        if (!this.net.isHost) return;
        this.net.send({ t: 'zhit', id: z.id, res, by });
    }

    /** Blocks I placed / removed (building, gathering, melting ice). */
    blocks(list) {
        for (let i = 0; i < list.length; i += 400) this.net.send({ t: 'blk', l: list.slice(i, i + 400) }, true);
    }

    /** A spawn-area tree was gathered. */
    treeGone(index) {
        this.net.send({ t: 'tree', i: index }, true);
    }

    /** Mana crystals broken off in a cave (gone for everybody) / one shattered in my hands. */
    crystalsGone(ids) {
        this.net.send({ t: 'mcg', l: ids }, true);
    }

    crystalFx(p) {
        this.net.send({ t: 'mcfx', p: [r3(p.x), r3(p.y), r3(p.z)] }, true);
    }

    /** A weapon went into my inventory (gone from the world) / came out of it. */
    weaponGone(w) {
        this.weaponOwners.delete(w.id);
        this.net.send({ t: 'wgone', w: w.id }, true);
    }

    weaponAppeared(w) {
        this.weaponOwners.set(w.id, this.me);
        this.net.send({ t: 'wnew', w: w.id, type: w.type, s: w.serialize(), owner: this.me }, true);
    }

    /** «Брейнрот» from a guest: the host makes the zombie a servant. */
    birds(list, books) {
        if (this.net.isHost) this.net.send({ t: 'birds', l: list, b: books });
    }

    bookTake(id) {
        this.net.send({ t: 'btake', id });
    }

    /** My Lumos light thrown: everybody sees it fly and fade. */
    lumosThrow(p, dir, level) {
        this.net.send({ t: 'lum', by: this.me, p: [r3(p.x), r3(p.y), r3(p.z)], d: [r3(dir.x), r3(dir.y), r3(dir.z)], l: level }, true);
    }

    /** My thrown light put out («Нокс» / «стоп»). */
    lumosOut() { this.net.send({ t: 'lumx', by: this.me }, true); }

    /** A guest's «Левиоса» caught a book-bird (on) / let it go; where its hand holds it. */
    // houses' spheres of protection (HouseWards.js): the host keeps the list, guests ask it to change it
    wards(list, gone = null) { if (this.net.isHost) this.net.send({ t: 'wards', l: list, ...(gone ? { g: gone } : {}) }); }
    wardOp(op) { if (!this.net.isHost) this.net.send({ t: 'wardop', op }); }
    /** (guest) My frozen ball hit a book-bird (the book of protection falls only to ice or fire). */
    birdIce(id) { if (!this.net.isHost) this.net.send({ t: 'bice', id }); }

    birdHold(id, on) { if (!this.net.isHost) this.net.send({ t: 'bhold', id, on: on ? 1 : 0 }); }
    birdAt(id, p) { if (!this.net.isHost) this.net.send({ t: 'bat', id, p: [r3(p.x), r3(p.y), r3(p.z)] }); }

    bookGone(id, to) {
        if (this.net.isHost) this.net.send({ t: 'bgone', id, to }, true);
    }

    brainrot(id, k = 'z') {
        this.net.send({ t: 'brainrot', id, k, by: this.me });
    }

    zombieSand(z) {
        if (this.net.isHost) this.net.send({ t: 'zsand', id: z.id });
    }

    sendHit(z, dmg, dir, isWeapon, hit = null) {
        this.net.send({ t: 'hit', id: z.id, dmg, dir: [r3(dir.x), r3(dir.y), r3(dir.z)], w: isWeapon ? 1 : 0, h: hit ? [r3(hit.y), hit.side, r3(hit.speed)] : null });
    }

    /** «Lightning Writing»: my wand's new points in the air (null: the line breaks) — the others draw them too. */
    draw(color, pts) {
        this.net.send({ t: 'draw', by: this.me, c: color, p: pts }, true);
    }

    /** My microphone heard me say a spell: the others are told at once (my voice from their speakers is not theirs). */
    say(name) {
        this.net.send({ t: 'say', by: this.me, name }, true);
    }

    spell(name, origin, dir, side) {
        this.net.send({ t: 'spell', by: this.me, name, o: [r3(origin.x), r3(origin.y), r3(origin.z)], d: [r3(dir.x), r3(dir.y), r3(dir.z)], side }, true);
    }

    /** «Вингардиум Левиоса» on a living body (k 'z' / 'a' / 'v') or on a wizard (k 'p'): held / let go. */
    lev(k, id, side, hold, on, gentle = false) {
        this.net.send({ t: 'lev', by: this.me, k, id, side, h: r3(hold), on: on ? 1 : 0, g: gentle ? 1 : 0 }, true);
    }

    /** My body is held up by `by` (or let go / I broke free). */
    lift(by, side, hold, on, free = false, why = null, mx = false) {
        this.net.send({ t: 'lift', by, to: this.me, side, h: r3(hold), on: on ? 1 : 0, f: free ? 1 : 0, ...(why ? { r: why } : {}), ...(mx ? { mx: 1 } : {}) }, true);
    }

    /** «Левиоса Максима» (LevitationMaxima.onNet): on / off / a player lifted / the host's big things. */
    levMax(m) {
        this.net.send({ t: 'lmx', by: this.me, ...m }, true);
    }

    /** (host) The houses and trees in the air (~10×/s). */
    levMaxState(l) {
        this.net.send({ t: 'lmxs', l });
    }

    /** (host) That body is held by someone else already. */
    levNo(to, k, id) {
        if (this.net.isHost) this.net.send({ t: 'levno', to, k, id }, true);
    }

    /** «Стоп»: the flames / ice beams / storm I hold end everywhere. */
    stopSpells() {
        this.net.send({ t: 'stop', by: this.me }, true);
    }

    /** «Drawdown»: where my wand points on the ground now (Drawdown.js — the pit follows it). */
    drawdownAt(p) {
        this.net.send({ t: 'ddat', by: this.me, p: [r3(p.x), r3(p.y), r3(p.z)] }, true);
    }

    /** «Invisibility»: I am invisible now / seen again (Invisibility.js). */
    invis(on) {
        this.net.send({ t: 'invis', by: this.me, on: on ? 1 : 0 }, true);
    }

    /** My «Let the Hellfire Come» fire (~10×/s; null: it went out) — see Hellfire.onNet. */
    hellfire(s, why = null) {
        this.net.send(why ? { t: 'hf', by: this.me, s, w: why } : { t: 'hf', by: this.me, s }, true);
    }

    /** My «Water Vortex Super Maxima» storm (~10×/s; null: it fell) — see WaterStorm.onNet. */
    waterStorm(s, why = null) {
        this.net.send(why ? { t: 'ws', by: this.me, s, w: why } : { t: 'ws', by: this.me, s }, true);
    }

    /** «Water Vortex» / «Fire Maxima» events and my vortex's state (see WaterVortex.onNet). */
    vortex(m) {
        this.net.send({ t: 'vx', by: this.me, ...m }, true);
    }

    waterDrop(b) {
        this.net.send({ t: 'wdrop', by: this.me, p: [r3(b.pos.x), r3(b.pos.y), r3(b.pos.z)], v: [r3(b.vel.x), r3(b.vel.y), r3(b.vel.z)], r: r3(b.r), f: b.frozen ? 1 : 0 }, true);
    }

    ice(cells) {
        this.net.send({ t: 'ice', by: this.me, c: cells }, true);
    }

    duelCast(b) {
        this.net.send({ t: 'duel', id: b.id, by: b.by, s: b.spell, side: b.side, tk: b.tk, tid: b.tid, ak: Math.round((b.ak ?? 0.5) * 100) / 100, o: [r3(b.o.x), r3(b.o.y), r3(b.o.z)], d: [r3(b.d0.x), r3(b.d0.y), r3(b.d0.z)], ...(b.up ? { up: 1 } : {}) }, true);
    }

    duelEnd(id, res) {
        this.net.send({ t: 'dend', id, res }, true);
    }

    duelClash(a, b, p, v = 0, k = 3) {
        if (this.net.isHost) this.net.send({ t: 'clash', a, b, p: Math.round(p * 1000) / 1000, v: Math.round(v * 1000) / 1000, k });
    }

    /** I shouted «Максима» in this clash (the host counts it in the push maths; all see it). */
    duelMaxima(a, b, by = this.me) { // (by: a tower's wizard — the host tells everybody)
        this.net.send({ t: 'dmax', a, b, by }, true);
    }

    duelClashEnd(a, b, loser) {
        if (this.net.isHost) this.net.send({ t: 'clashend', a, b, loser });
    }

    playerHit(to, dmg, magic = false, hit = null, x = null) {
        const r = (v) => Math.round(v * 100) / 100;
        const h = hit && Number.isFinite(hit.lx) ? [r(hit.lx), r(hit.y), r(hit.lz)] : undefined;
        // (x: the blow itself — what struck, where, the push: BodyImpact.onStrike on their computer)
        this.net.send({ t: 'phit', by: this.me, to, dmg, mg: magic ? 1 : 0, h, ...(x ? { k: x.k, pt: x.pt, i: x.i, lp: x.lp, s: x.s, sp: x.sp } : {}) }, true);
    }

    /** My hands pushed / slapped / shoved player `to` (never harm: only their body is moved). */
    playerPush(to, x) {
        this.net.send({ t: 'ppush', by: this.me, to, k: x.k, n: x.n || 1, pt: x.pt, i: x.i, lp: x.lp, s: x.s, sp: x.sp, c: x.c ? 1 : 0 }, true);
    }

    /** (host) what happened to the creatures' bodies: falls, staggers, rises, head jolts (CreatureImpact). */
    creatureImpacts(list) {
        if (this.net.isHost && list.length) this.net.send({ t: 'cimp', l: list });
    }

    /** (guest) my hands hit a creature: the host applies the blow to its body. */
    creatureStrike(m) {
        if (!this.net.isHost) this.net.send({ t: 'cstrike', ck: m.ck, id: m.id, k: m.k, i: m.i, h: m.h || 0 });
    }

    /** A light cut on me (everybody draws it on my body). */
    // hands holding hands (HandHold.js)
    handGrip(to, s, ts, on, facing) { this.net.send({ t: 'hgrip', by: this.me, to, s, ts, on: on ? 1 : 0, f: facing ? 1 : 0 }, true); }
    handFree(holder, s, ts, broke) { this.net.send({ t: 'hfree', by: this.me, holder, s, ts, f: broke ? 1 : 0 }, true); }
    villagerHand(id, on, p) { this.net.send({ t: 'vhand', by: this.me, id, on: on ? 1 : 0, p: p ? [r3(p.x), r3(p.y), r3(p.z)] : null }); }
    villagerFree(id, to) { if (this.net.isHost) this.net.send({ t: 'vfree', id, to }, true); }

    cut(h) {
        this.net.send({ t: 'cut', by: this.me, h }, true);
    }

    died(killer, mm = null) {
        this.net.send({ t: 'pdead', by: this.me, killer: killer || null, mm }, true);
    }

    /** (host) Mana for player `to`: his last blow killed a magical creature / a wizard he beat in a duel. */
    manaCredit(to, m) {
        if (this.net.isHost) this.net.sendTo(to, { t: 'mcred', kind: m.kind || null, wiz: m.wiz ?? null, mm: m.mm ?? null });
    }

    /** (host) An achievement for player `to`: they took part in the kill (Achievements.js). */
    achCredit(to, k) {
        if (this.net.isHost) this.net.sendTo(to, { t: 'achc', k });
    }

    /** My achievements: {a: 'got', k, n, hi} a new one / {a: 'state', n, hi} how many (a newcomer). */
    ach(m) { this.net.send({ t: 'ach', by: this.me, ...m }, true); }

    /** A body stays where somebody died (Death.js). */
    deathBody(b) {
        this.net.send({ t: 'dbody', b }, true);
    }

    /** I took my legacy back from my body (Legacy.js): it is empty now for everybody. */
    bodyLegacy(id) {
        this.net.send({ t: 'dblg', id }, true);
    }

    /** A body carried by my «Левиоса» (air) / where it landed. */
    bodyMove(b, q, air) {
        this.net.send({ t: 'bmv', id: b.id, x: r3(b.x), y: r3(b.y), z: r3(b.z), q: [r3(q.x), r3(q.y), r3(q.z), r3(q.w)], a: air ? 1 : 0 }, true);
    }

    /** I'm back in the game. */
    respawned() {
        this.net.send({ t: 'prespawn', by: this.me }, true);
    }

    /** «Total Destruction» of mine begins at `p`: every computer shakes and brings down the same blocks. */
    ruin(p, max = false) {
        this.net.send({ t: 'tdes', by: this.me, p: [r3(p.x), r3(p.y), r3(p.z)], k: max ? 1 : 0 }, true);
    }

    /** «Circle Attack» of mine at `p` (my feet): every computer runs the same wave, the same rays. */
    circleAttack(p, max = false, rays = []) {
        this.net.send({ t: 'circ', by: this.me, p: [r3(p.x), r3(p.y), r3(p.z)], k: max ? 1 : 0, rays }, true);
    }

    /** «Inspirius» of mine: {e: 'go'|'at'|'boom', …} (the flight 'at' 10×/s). */
    inspirius(m) {
        this.net.send({ t: 'insp', by: this.me, ...m }, true);
    }

    explosion(pos, radius, power = 1, casterId = null) {
        if (this.net.isHost) this.net.send({ t: 'boom', p: [r3(pos.x), r3(pos.y), r3(pos.z)], r: radius, k: power, by: casterId === 'local' ? this.me : casterId });
    }

    // ---- animals (the host owns them)
    animals(list) { if (this.net.isHost) this.net.send({ t: 'an', l: list }); }

    // castles: the host runs the people; guests send their hits
    villagers(list) { if (this.net.isHost) this.net.send({ t: 'vil', l: list }); }
    villagerHit(id, dmg, d, mg) { this.net.send({ t: 'vhit', by: this.me, id, dmg, d, mg }, true); }
    villagerStrike(to, dmg, x, z, who) { if (this.net.isHost) this.net.send({ t: 'vstr', to, dmg, x, z, who }); }
    villagerSay(id, text) { this.net.send({ t: 'vsay', by: this.me, id, text: String(text).slice(0, 200) }, true); }
    villagerAlarm(to, name) { if (this.net.isHost) this.net.send({ t: 'valarm', to, name }); }
    castleState(id, s) { if (this.net.isHost) this.net.send({ t: 'cst', id, s }); }
    villagerCrime(id, kind) { this.net.send({ t: 'vcrime', id, kind }); }
    /** A window pane broke (Houses.js): everybody's glass breaks. */
    glass(id) { this.net.send({ t: 'glass', id }, true); }
    villagerVandal(p, n, loud, r = null) { this.net.send({ t: 'vvand', p, n, l: loud, r }); }
    /** Something dangerous a guest did near a castle (a quake, «Breakthrough»): the host frightens its people. */
    villagerDanger(p, kind, r = null) { this.net.send({ t: 'vdng', p, k: kind, r }); }
    /** A villager's bucket of water on a fire (host): it goes out everywhere. */
    villagerDouse(p, r) { if (this.net.isHost) this.net.send({ t: 'vdouse', p, r }); }
    /** A castle's scaffolding and the builders' cart (host). */
    rebuildSite(id, s, c) { if (this.net.isHost) this.net.send({ t: 'vbuild', id, s, c }, true); }
    villagerTalk(id) { this.net.send({ t: 'vtalk', id }); }
    // villagers really talk (TalkMind): a guest's orders and questions go to the host
    villagerOrder(id, name, args) { this.net.send({ t: 'vord', id, name: String(name).slice(0, 30), args: args || {} }); }
    villagerAsk(id, text, ctx) { this.net.send({ t: 'vask', id, text: String(text).slice(0, 300), ctx: ctx || {} }); }
    villagerAnswer(to, id, res) { if (this.net.isHost) this.net.send({ t: 'vans', to, id, res }); }
    villagerAI(on) { if (this.net.isHost) this.net.send({ t: 'vai', on: !!on }); }
    tradeSell(uid, wid, price, p) { this.net.send({ t: 'tsell', uid, wid, price, p }); }
    /** I named a good with my coins on the counter (a guest): the host takes the price from the pouch. */
    tradePay(coin, good) { this.net.send({ t: 'tpay', coin, good }); }
    /** (host) a good was paid for: everybody lets the hand take it, its price card goes. */
    tradePaid(uid) { if (this.net.isHost) this.net.send({ t: 'tpaid', uid }, true); }
    /** (host) what the payment did, for the guest who paid. */
    tradeNote(to, text) { if (this.net.isHost) this.net.send({ t: 'tnote', to, text: String(text).slice(0, 200) }); }
    animalHit(id, dmg, dir, fire) { this.net.send({ t: 'ahit', id, dmg, d: dir ? [r3(dir.x), r3(dir.y), r3(dir.z)] : null, f: fire ? 1 : 0, by: this.me }); }
    animalMeat(id, side) { this.net.send({ t: 'ameat', id, side }); }
    animalMeatTo(to, item, side) { this.net.send({ t: 'agive', to, item, side }, true); }
    animalGather(id) { this.net.send({ t: 'agath', id }); }
    applePick(key, i, side) { this.net.send({ t: 'apick', key, i, side }); }
    appleGone(key, i, until) { if (this.net.isHost) this.net.send({ t: 'agone', key, i, until }, true); }
    animalFeed(id) { this.net.send({ t: 'afeed', id }); }
    animalRide(id, on) { this.net.send({ t: 'aride', id, on: on ? 1 : 0, by: this.me }, true); }
    animalPos(id, p) { this.net.send({ t: 'apos', id, p }); }
    animalButt(to, dmg, p, k = 6, down = 0) { this.net.send({ t: 'abutt', to, dmg, p: [r3(p.x), r3(p.y), r3(p.z)], k, down }, true); }

    // ---- the spider (host)
    bosses(list) { if (this.net.isHost) this.net.send({ t: 'boss', l: list }); }
    bossHit(id, dmg, kind) { this.net.send({ t: 'bhit', id, dmg, kind }); }
    bossShot(kind, from, to) { if (this.net.isHost) this.net.send({ t: 'bshot', kind, o: [r3(from.x), r3(from.y), r3(from.z)], to }, true); }
    bossGrab(id, to) { if (this.net.isHost) this.net.send({ t: 'bgrab', id, to }, true); }
    bossFree(id) { this.net.send({ t: 'bfree', id }, true); }
    bossNotice() { if (this.net.isHost) this.net.send({ t: 'bnote' }, true); }
    /** Dragons (Dragons.js): the host's state; a guest's blow, scoop; the host's word to a player. */
    dragon(m) { this.net.send({ t: 'drg', ...m }); }
    /** The Ice Castle (IceQueen.js): its creatures' state, shots, the queen's magic, the Ice Rod. */
    ice(m) { this.net.send({ t: 'ice', ...m }); }

    // ---- «Alive»: living trees (the host moves them), servants of «Брейнрот»
    livingTrees(list, servants) { if (this.net.isHost) this.net.send({ t: 'ltree', l: list, sv: servants }); }
    /** (guest) my «Alive» took this tree: the host makes it a monster. */
    aliveCast(d) { this.net.send({ t: 'alive', d: { x: r3(d.x), y: r3(d.y), z: r3(d.z), ry: r3(d.ry || 0), kind: d.kind | 0, trunk: d.trunk | 0, leaf: d.leaf | 0, h: d.h | 0, max: d.max ? 1 : 0, delay: r3(d.delay || 0), ...(d.skel ? { skel: 1, gid: String(d.gid || ''), ex: r3(d.ex), ez: r3(d.ez) } : {}) } }, true); }
    /** (guest) My blade / fist broke a skeleton's bones (LivingTrees._hitSkel): the host decides. */
    aliveHit(id, dmg, kind) { this.net.send({ t: 'alivehit', id, dmg: r3(dmg), kind: String(kind || '') }, true); }
    /** (guest) my living tree ends (my mana is gone / «стоп»). */
    aliveEnd(id, why) { this.net.send({ t: 'aliveend', id, why }, true); }
    /** (guest) «Атак»: my servants go for this one. */
    servantAttack(k, id) { this.net.send({ t: 'svatk', k, id }, true); }
    /** (host) A servant's blow (a living tree's branch) lands on player `to`. */
    servantHit(to, dmg, dir, by, kind) { this.net.send({ t: 'svhit', to, dmg, d: [Math.round(dir.x * 100) / 100, Math.round(dir.z * 100) / 100], by, k: kind }, true); }

    door(d) { this.net.send({ t: 'door', d }, true); }
    /** Campfires: {t:'cf'} host → all, {t:'cfask'|'cfwood'} guest → host. */
    campfire(msg) { this.net.send(msg); }

    cauldron(msg) { this.net.send(msg); }
    /** Beds (Beds.js): {a: set | create | color | msg | lie | sleep, …}; `to`: only that player (host). */
    bed(m, to = null) { if (to) this.net.sendTo(to, { t: 'bed', ...m }); else this.net.send({ t: 'bed', ...m }, true); }
    doorAngle(id, a) { this.net.send({ t: 'dang', id, a: Math.round(a * 100) / 100 }, true); }

    /** My hero's look, for everybody (on start and whenever somebody joins). */
    sendLook() {
        const look = this.game.character.look;
        if (look) this.net.send({ t: 'look', by: this.me, look }, true);
        this.game.armor?.resend(); // (and what armour I wear: Armor.js)
        this.game.achievements?.resend(); // (and how many achievements: «Высший маг» over the name)
    }

    /** Armour (Armor.js): {a: 'worn', w} what I wear; (host) {a: 'vstrip', id} a villager stripped by «Disarmor». */
    armor(m) { this.net.send({ t: 'arm', by: this.me, ...m }, true); }

    impale(to, wid, rel = null) {
        this.game.bleeding?.noteImpale(wid, to);
        this.net.send({ t: 'impale', w: wid, to, r: rel || undefined }, true);
    }

    unimpale(wid) {
        this.net.send({ t: 'unimpale', w: wid }, true);
    }

    pullOut(wid) {
        this.net.send({ t: 'pullout', w: wid }, true);
    }

    bleed(rate) {
        this.net.send({ t: 'bleed', by: this.me, r: rate }, true);
    }

    rescue(to) {
        this.net.send({ t: 'rescue', to }, true);
    }

    /** An arrow flies (mine; or, from the host, a castle knight's: `by` his id). */
    arrow(from, dir, dmg, by = this.me) {
        const v = dir.clone();
        this.net.send({ t: 'arrow', by, o: [r3(from.x), r3(from.y), r3(from.z)], v: [r3(v.x), r3(v.y), r3(v.z)], d: Math.round(dmg * 10) / 10 }, true);
    }

    weather(seconds) {
        if (this.net.isHost) this.net.send({ t: 'weather', s: Math.round(seconds) }, true);
    }

    chestOpenedLoot(chest) {
        if (this.net.isHost) this.net.send({ t: 'chest', id: chest.id });
    }

    itemNew(item, p, v, hover) {
        if (this.net.isHost) this.net.send({ t: 'inew', item, p: [r3(p.x), r3(p.y), r3(p.z)], v: v ? [r3(v.x), r3(v.y), r3(v.z)] : null, h: hover ? 1 : 0 }, true);
    }

    itemPositions(list) {
        if (this.net.isHost) this.net.send({ t: 'ipos', l: list });
    }

    itemTake(uid, side) {
        this.net.send({ t: 'itake', uid, side });
    }

    itemGone(uid, to, side) {
        if (this.net.isHost) this.net.send({ t: 'igone', uid, to, side }, true);
    }

    itemThrow(item, p, v, q = null, w = null) {
        // (q: how it was turned in the hand, w: its spin — it flies on as it left the hand)
        this.net.send({ t: 'ithrow', item, p: [r3(p.x), r3(p.y), r3(p.z)], v: [r3(v.x), r3(v.y), r3(v.z)], q: q ? [r3(q.x), r3(q.y), r3(q.z), r3(q.w)] : null, w: w ? [r3(w.x), r3(w.y), r3(w.z)] : null });
    }

    itemGive(to, item, side) {
        this.net.send({ t: 'igive', to, item, side }, true);
    }

    itemHold(side, item) {
        this.net.send({ t: 'ihold', by: this.me, side, item }, true);
    }

    chestOpened(chest, weapon) {
        if (!this.net.isHost) return;
        this.net.send({ t: 'chest', id: chest.id });
        this.net.send({ t: 'wspawn', s: weapon.serialize(), hover: [weapon.hover.base.x, weapon.hover.base.y, weapon.hover.base.z] });
    }

    bite(playerId) {
        if (this.net.isHost) this.net.sendTo(playerId, { t: 'bite', dmg: 1 });
    }

    victory(byId) {
        if (this.net.isHost) this.net.send({ t: 'win', by: byId });
    }

    _localGrab(w, side) {
        this.weaponOwners.set(w.id, this.me);
        w.clearRemote();
        if (this.net.isHost) this.net.send({ t: 'wown', w: w.id, owner: this.me });
        else this.net.send({ t: 'grab', w: w.id, side });
    }

    _localRelease(w) {
        this.weaponOwners.delete(w.id);
        const msg = { t: 'rel', w: w.id, s: w.serialize(), v: [r3(w.velocity.x), r3(w.velocity.y), r3(w.velocity.z)], av: [r3(w.angularVelocity.x), r3(w.angularVelocity.y), r3(w.angularVelocity.z)] };
        if (this.net.isHost) this.net.send({ t: 'wown', w: w.id, owner: null });
        else {
            this.net.send(msg);
            // Until the host's snapshots arrive we keep simulating locally; then we follow the host.
            setTimeout(() => { if (!this.weaponOwners.has(w.id) && !w.holder) w.setRemoteTarget(w.serialize()); }, 300);
        }
    }

    // ========================================================== incoming
    _onMessage(m) {
        const g = this.game;
        if (!g.active && m.t !== 'welcome') return;
        switch (m.t) {
            case 'p': {
                const r = g.remotes.get(m.id || m.from);
                if (r) r.applyState(m);
                g.boards?.remotePose(m.id || m.from, m.bd); // (the surfboard they carry or ride)
                for (const ws of m.w || []) {
                    const w = g.weapons.byId.get(ws[0]);
                    if (w && !w.holder) { w.setRemoteTarget(ws); w.hover = null; }
                }
                break;
            }
            case 'z': if (!this.net.isHost) this._applyZombies(m.l, m.rm); break;
            // ships (src/game/Ships.js): the host's ships and crews; guests' wheel, sails, blows, guns
            case 'ships': case 'shipev': case 'screw': case 'shelm': case 'smoor': case 'sblow': case 'sunf': case 'shit': case 'sfire': case 'scan': g.ships?.onNet(m, this.net.isHost); break;
            case 'zhit': if (!this.net.isHost) this._applyZombieHit(m); break;
            case 'zsand': {
                const z = g.zombieById.get(m.id);
                if (z && !this.net.isHost) z.turnToSand();
                break;
            }
            case 'hit': {
                if (!this.net.isHost) break;
                const z = g.zombieById.get(m.id);
                const h = Array.isArray(m.h) ? { y: +m.h[0] || 0, side: m.h[1] > 0 ? 1 : -1, speed: Math.min(40, +m.h[2] || 0) } : null;
                if (z && !z.isDead) g.damageZombie(z, Math.min(10, m.dmg | 0 || 1), !!m.w, vec(m.dir || [0, 0, 1]), m.from, h);
                break;
            }
            case 'blk': if (m.by !== this.me && Array.isArray(m.l)) g.builder?.applyEdits(m.l.slice(0, 400)); break;
            case 'mcg': g.crystals?.applyGone((m.l || []).slice(0, 50)); break;
            case 'mcfx': if (Array.isArray(m.p)) g.crystals?.shatterFx(vec(m.p)); break;
            case 'tree': { const t = g.world.trees?.find((x) => x.index === m.i); if (t && t.alive) g.world.removeTree(t); break; }
            case 'wgone': {
                const w = g.weapons.byId.get(m.w);
                if (w) { this.weaponOwners.delete(m.w); g.weapons.remove(w); }
                break;
            }
            case 'wnew': {
                if (g.weapons.byId.has(m.w)) break;
                const w = g.weapons.markMagic(g.weapons.spawn(m.type === 'axe' ? 'axe' : 'sword', vec(m.s.slice(2, 5)), new THREE.Quaternion(m.s[5], m.s[6], m.s[7], m.s[8]), m.w), m.s[10]);
                this.weaponOwners.set(m.w, m.owner || m.from);
                w.setRemoteTarget(m.s);
                break;
            }
            case 'pstate': if (this.net.isHost && m.s) this.game.keeper?.notePlayer(this.net.players.get(m.from)?.pid, this.net.players.get(m.from)?.name || m.name, m.s); break;
            case 'birds': if (!this.net.isHost) g.books?.applyNet(m.l, m.b); break;
            case 'rbcatch': case 'rbgot': case 'rbaccio': case 'rbtake': g.runner?.onNet(m); break; // (the running book)
            case 'btake': if (this.net.isHost) g.books?._take(m.id, m.from); break;
            case 'lum': if (m.by !== this.me && Array.isArray(m.p) && Array.isArray(m.d)) g.wandMagic?.addThrown(vec(m.p), vec(m.d).normalize().multiplyScalar(LUMOS.THROW_SPEED), Math.max(1, Math.min(6, +m.l || 2)), false, m.by); break;
            case 'lumx': if (m.by !== this.me) g.wandMagic?.outBy(m.by); break;
            case 'wards': if (!this.net.isHost) g.wards?.applyNet(m.l, m.g); break;
            case 'wardop': if (this.net.isHost) g.wards?.apply(m.op, m.from); break;
            case 'mcastle': g.castleMagic?.onNet(m, this.net.isHost); break; // («Create a Castle»)
            case 'mhouse': g.houseMagic?.onNet(m, this.net.isHost); break; // («Create a House», «Improve a House»)
            case 'icemagic': g.iceMagic?.onNet(m, this.net.isHost); break; // («Create an Ice Castle», «Ice Bridge»)
            case 'planets': g.space?.onNet(m, this.net.isHost); break; // (the planets: the host's, a guest's ask — Space.js)
            case 'bice': if (this.net.isHost) { const b = g.books?.birds.get(m.id); if (b) g.books.hitBird(b, 99, 'ice'); } break;
            case 'bhold': if (this.net.isHost) { const b = g.books?.birds.get(m.id); if (b) g.books.holdBird(b, !!m.on, m.from); } break;
            case 'bat': if (this.net.isHost && Array.isArray(m.p)) { const b = g.books?.birds.get(m.id); if (b && b.state === 'held') { b.model.position.set(+m.p[0] || 0, +m.p[1] || 0, +m.p[2] || 0); b.heldSeen = performance.now(); } } break;
            case 'bgone': if (!this.net.isHost) g.books?.netGone(m.id, m.to); break;
            case 'brainrot': if (this.net.isHost) { if (m.k && m.k !== 'z') g.servants?.make(m.k, m.id, m.from || m.by); else g.applyBrainrot(m.id, m.from || m.by); } break;
            case 'ltree': if (!this.net.isHost) { g.livingTrees?.applyNet(m.l); g.servants?.applyNet(m.sv); } break;
            case 'alivehit': if (this.net.isHost) { const t = g.livingTrees?.byId.get(m.id); if (t?.skel && Number.isFinite(+m.dmg)) g.livingTrees.hit(t, Math.min(20, Math.max(0, +m.dmg)), m.kind === 'fist' ? 'fist' : 'melee', m.from); } break;
            case 'alive': if (this.net.isHost && m.d?.skel && Number.isFinite(+m.d.x) && Number.isFinite(+m.d.z) && Number.isFinite(+m.d.ex) && Number.isFinite(+m.d.ez)) { if (!g.livingTrees?.list.some((t) => t.d.gid === m.d.gid)) g.livingTrees?.spawn({ skel: 1, gid: String(m.d.gid || ''), x: +m.d.x, y: +m.d.y || 0, z: +m.d.z, ry: +m.d.ry || 0, ex: +m.d.ex, ez: +m.d.ez, kind: 0, trunk: 0, leaf: 0, h: 2, max: m.d.max ? 1 : 0, delay: Math.min(3, Math.max(0, +m.d.delay || 0)) }, m.from); } else if (this.net.isHost && m.d && Number.isFinite(+m.d.x) && Number.isFinite(+m.d.z)) g.livingTrees?.spawn({ x: +m.d.x, y: +m.d.y || 0, z: +m.d.z, ry: +m.d.ry || 0, kind: m.d.kind | 0, trunk: m.d.trunk | 0, leaf: m.d.leaf | 0, h: Math.min(20, Math.max(5, m.d.h | 0)), max: m.d.max ? 1 : 0, delay: Math.min(3, Math.max(0, +m.d.delay || 0)) }, m.from); break;
            case 'aliveend': if (this.net.isHost) { const t = g.livingTrees?.byId.get(m.id); if (t && t.owner === m.from) g.livingTrees.end(t, m.why === 'mana' || m.why === 'far' || m.why === 'focus' ? m.why : 'stop'); } break;
            case 'svatk': if (this.net.isHost && m.k) g.servants?.command(m.from, { k: m.k, id: m.id }); break;
            case 'svhit': if (m.to === this.me && Array.isArray(m.d)) g.servants?.hitMe(Math.min(10, +m.dmg || 1), new THREE.Vector3(+m.d[0] || 0, 0, +m.d[1] || 1), m.by, m.k === 'tree' ? 'tree' : 'servant'); break;
            case 'lev': if (m.by !== this.me) g.levitation?.onNetLev(m); break;
            case 'lift': if (m.to !== this.me) g.levitation?.onNetLift(m); break;
            case 'levno': if (m.to === this.me) g.levitation?.onNetRefused(m); break;
            case 'lmx': if (m.from !== this.me) g.levMax?.onNet(m, this.net.isHost); break;
            case 'lmxs': if (!this.net.isHost) g.levMax?.onNetState(m.l); break;
            case 'stop':
                if (m.by === this.me) break;
                g.voiceGate?.noteRemote('Stand', performance.now()); // (their «стоп» from my speakers stops nothing of mine)
                g.spells.stopBy(m.by);
                break;
            case 'invis': if (m.by !== this.me) g.invis?.onNet(m.by, !!m.on); break;
            case 'ddat': if (m.by !== this.me && Array.isArray(m.p)) g.drawdown?.onNet(m.by, vec(m.p)); break;
            case 'say': if (m.by !== this.me && typeof m.name === 'string') g.voiceGate?.noteRemote(m.name, performance.now()); break;
            case 'draw': if (m.by !== this.me) g.wandMagic?.remoteDraw(m.by, m.c, m.p); break;
            case 'spell': {
                if (m.by === this.me) break;
                g.voiceGate?.noteRemote(m.name, performance.now()); // (my microphone may hear their voice)
                g.noteCaster?.(m.name, m.by);
                g.spells.cast(m.name, vec(m.o), vec(m.d), m.side, m.by);
                break;
            }
            case 'tdes': {
                if (m.by === this.me) break;
                g.voiceGate?.noteRemote(m.k ? 'TotalDestructionMaxima' : 'TotalDestruction', performance.now()); // (my microphone may hear their voice)
                g.destruction?.start(vec(m.p), m.by, false, !!m.k);
                break;
            }
            case 'circ': {
                if (m.by === this.me) break;
                g.voiceGate?.noteRemote(m.k ? 'CircleAttackMaxima' : 'CircleAttack', performance.now()); // (my microphone may hear their voice)
                g.circleAttack?.start(vec(m.p), m.by, false, !!m.k, Array.isArray(m.rays) ? m.rays.slice(0, 12) : []);
                break;
            }
            case 'insp': g.inspirius?.onNet(m); break;
            case 'boom': if (!this.net.isHost) { g.applyExplosion(vec(m.p), m.r, false, m.k || 1, m.by || null); g.explosions.push({ p: m.p, r: m.r }); } break;
            case 'chest': {
                (g._openedChests = g._openedChests || new Set()).add(m.id);
                const c = g.chests.find((x) => x.id === m.id);
                if (c && !this.net.isHost) g.openChest(c);
                break;
            }
            case 'boss': if (!this.net.isHost) g.spiders?.applyNet(m.l); break;
            case 'bhit': if (this.net.isHost) { const sp = g.spiders?.list.find((x) => x.id === m.id); if (sp) g.spiders.hit(sp, Math.min(40, m.dmg || 1), m.kind, m.from); } break;
            case 'bshot': if (!this.net.isHost) g.spiders?._fire(m.kind, vec(m.o), m.to); break;
            case 'bgrab': if (m.to === this.me) { const sp = g.spiders?.list.find((x) => x.id === m.id); if (sp) { sp.holding = this.me; g.spiders._seized(sp); } } break;
            case 'bfree': { const sp = g.spiders?.list.find((x) => x.id === m.id); if (sp) sp.holding = null; break; }
            case 'bnote': g.hud.notify?.('🕷️ Из темноты выходит гигантская паучиха...'); break;
            case 'drg': g.dragons?.onNet(m, m.from); break;
            case 'ice': g.iceCastle?.onNet(m, m.from); break; // (the Ice Castle: IceQueen.js)
            case 'bbd': g.blackbeard?.onNet(m, this.net.isHost); break; // (the black ship: its grapnels, the plank, the pistols — Blackbeard.js)
            case 'phx': g.phoenixes?.onNet(m, this.net.isHost); break; // (phoenixes: Phoenixes.js)
            case 'door': if (m.d) g.doors?.applyNet(m.d); break;
            case 'bdnew': case 'bds': case 'bdtake': case 'bdown': case 'bdfree': case 'bdgone': g.boards?.onNet(m); break; // (surfboards)
            case 'dang': g.doors?.applyAngle(m.id, m.a); break;
            case 'lock': case 'dlk': g.locks?.applyNet(m); break; // («Алохомора» — Alohomora.js)
            case 'cf': case 'cfask': case 'cfwood': g.campfires?.onNet(m); break;
            case 'cart': if (!this.net.isHost) g.carriages?.onNet(m); break; // (carts on the roads: Carriages.js)
            case 'caul': case 'caulmv': case 'caulfill': case 'caulfilled': case 'caulshop': g.cauldrons?.onNet(m); break; // (cauldrons and potions)
            case 'glass': if (typeof m.id === 'string') g.houses?.applyGlass(m.id); break;
            case 'bed': g.beds?.onNet(m); break;
            case 'arm': if (m.by !== this.me) g.armor?.onNet(m, m.by || m.from); break;
            case 'look': {
                if (m.by === this.me || !m.look) break;
                this.looks = this.looks || new Map();
                this.looks.set(m.by, m.look);
                g.remotes.get(m.by)?.setLook(m.look);
                break;
            }
            case 'an': if (!this.net.isHost) g.animals?.applyNet(m.l); break;
            case 'vil': if (!this.net.isHost) g.castleLife?.applyNet(m.l); break;
            case 'vhit': if (this.net.isHost && m.by !== this.me) { const v = g.castleLife?.byId.get(m.id); if (v) { const f = +m.mg || 0; g.castleLife.hit(v, Math.min(30, +m.dmg || 1), Array.isArray(m.d) ? new THREE.Vector3(m.d[0], 0, m.d[1]) : null, m.by, { magic: !!(f & 1), weapon: !!(f & 2), spell: !!(f & 4), pierce: !!(f & 8), hard: !!(f & 16) }); } } break;
            case 'vstr': if (m.to === this.me) g.castleLife?.struck(Math.min(10, +m.dmg || 1), +m.x || 0, +m.z || 0, String(m.who || 'Рыцарь').slice(0, 30)); break;
            case 'vsay': if (m.by !== this.me) g.castleLife?.heard(m.id, String(m.text || '').slice(0, 200)); break;
            case 'valarm': if (m.to === this.me) g.hud.setVoice('⚔️ Вас заметили! Стража замка идёт за вами', true); break;
            case 'cst': if (!this.net.isHost && m.s) g.castleLife?.applyState(m.id, m.s); break;
            case 'vtalk': if (this.net.isHost) { const v = g.castleLife?.byId.get(m.id); if (v && g.castleLife.night?.rouse(v, m.from)) break; if (v && !v.foe) { v.talking = 5; v.talkTo = m.from; } } break;
            case 'vvand': if (this.net.isHost && Array.isArray(m.p)) g.castleLife?.damaged({ x: +m.p[0], y: +m.p[1], z: +m.p[2] }, m.from, Math.min(500, +m.n || 0), !!m.l, { r: Number.isFinite(+m.r) && m.r != null ? Math.min(30, +m.r) : null }); break;
            case 'vdng': if (this.net.isHost && Array.isArray(m.p)) g.castleLife?.alarm({ x: +m.p[0], y: +m.p[1], z: +m.p[2] }, String(m.k || ''), m.from, Number.isFinite(+m.r) && m.r != null ? Math.min(30, +m.r) : null); break;
            case 'vdouse': if (!this.net.isHost && Array.isArray(m.p)) g.castleLife?.fright.splash({ x: +m.p[0], y: +m.p[1], z: +m.p[2] }, Math.min(4, +m.r || 2)); break;
            case 'vbuild': if (!this.net.isHost) g.castleLife?.rebuild.applyNet(m.id, m.s, m.c); break;
            case 'vcrime': if (this.net.isHost) { const v = g.castleLife?.byId.get(m.id); if (v) g.castleLife.reportCrime(v, m.from, String(m.kind || '')); } break;
            case 'vord': if (this.net.isHost) { const v = g.castleLife?.byId.get(m.id); if (v) g.castleLife.orders.run(v, String(m.name || ''), m.args && typeof m.args === 'object' ? m.args : {}, m.from); } break;
            case 'vask': if (this.net.isHost) g.castleLife?.talk.answerGuest(m.from, m.id, String(m.text || '').slice(0, 300), m.ctx && typeof m.ctx === 'object' ? m.ctx : {}); break;
            case 'vans': if (m.to === this.me) g.castleLife?.talk.answered(m.id, m.res || {}); break;
            case 'vai': if (!this.net.isHost && g.castleLife) g.castleLife.talk.hostSmart = !!m.on; break;
            case 'tpay': if (this.net.isHost) g.castleLife?.talk.pay(String(m.coin || ''), String(m.good || ''), m.from); break;
            case 'tpaid': if (!this.net.isHost) g.castleLife?.talk.paidGood(String(m.uid || '')); break;
            case 'tnote': if (m.to === this.me) g.hud.setVoice?.(String(m.text || ''), true); break;
            case 'tsell': if (this.net.isHost && Array.isArray(m.p)) g.castleLife?.talk.sellNow(m.uid || null, m.wid || null, Math.min(2000, +m.price || 1), vec(m.p)); break;
            case 'ahit': if (this.net.isHost) { const a = g.animals?.byId.get(m.id); if (a) g.animals.hit(a, Math.min(30, m.dmg || 1), m.d ? vec(m.d) : null, m.from || m.by, !!m.f); } break;
            case 'ameat': if (this.net.isHost) { const a = g.animals?.byId.get(m.id); if (a) g.animals._takeMeat(a, m.from, m.side); } break;
            case 'agath': if (this.net.isHost) { const a = g.animals?.byId.get(m.id); if (a) { const n = a.meat; for (let i = 0; i < n; i++) g.animals._takeMeat(a, m.from, null); } } break;
            case 'agive': if (m.to === this.me && m.item) g.animals?._give(m.item, m.side); break;
            case 'apick': if (this.net.isHost) { const tr = g.animals?.trees.get(m.key); if (tr) g.animals._pickApple(tr, m.i, m.from, m.side); } break;
            case 'agone': if (!this.net.isHost) { const tr = g.animals?.trees.get(m.key); if (tr && tr.apples[m.i]) tr.apples[m.i].until = Date.now() + Math.max(0, (m.until || 0) - Date.now()); } break;
            case 'afeed': if (this.net.isHost) { const a = g.animals?.byId.get(m.id); if (a) a.apples = Math.min(3, a.apples + 1); } break;
            case 'aride': { const a = g.animals?.byId.get(m.id); if (a && m.by !== this.me) { a.rider = m.on ? m.by : null; if (m.on && !a.pegasus) a.tamed = m.by; a.state = m.on ? 'ridden' : 'graze'; if (a.model.userData.saddle) a.model.userData.saddle.visible = !!m.on; } break; }
            case 'apos': if (this.net.isHost) { const a = g.animals?.byId.get(m.id); if (a && Array.isArray(m.p)) { a.group.position.set(m.p[0], m.p[1], m.p[2]); a.group.rotation.y = m.p[3]; a.flyCode = m.p[4] || 0; } } break; // (a Pegasus in flight: its wings)
            case 'abutt': if (m.to === this.me) {
                if (g.combat.enabled) g.combat.damage(m.dmg || 1, null, 'animal'); else g.damageLocalPlayer(m.dmg || 1);
                if (Array.isArray(m.p) && g.impact) { const from = vec(m.p); const k = Math.min(20, m.k || 6); g.impact.apply({ v: g.character.group.position.clone().sub(from).setY(0).normalize().multiplyScalar(k).setY(2 + k * 0.2), from, kind: 'butt', noShield: true, always: m.down ? { down: Math.min(4, m.down) } : null }); }
            } break;
            case 'impale': g.bleeding?.noteImpale(m.w, m.to, m.r); break;
            case 'unimpale': g.bleeding?.noteUnimpale(m.w); break;
            case 'pullout': { const w = g.weapons.byId.get(m.w); if (w && w.stuckIn) g.weapons._unstick(w, true); break; }
            case 'bleed': if (m.by !== this.me) g.bleeding?.remote.set(m.by, m.r || 0); break;
            case 'rescue': if (m.to === this.me && g.bleeding) { for (const wid of g.bleeding._bladesInMe()) g.bleeding.pullOut(wid); g.bleeding.stop(); } break;
            case 'arrow': if (m.by !== this.me) g.gear?.fire(vec(m.o), vec(m.v), m.d || 3, m.by); break;
            case 'weather': g.gear?.startWeather(Math.min(400, m.s || 120)); break;
            // ---- things (wands, scrolls, shields…)
            case 'inew': if (!this.net.isHost && m.item) g.items?.spawnLoose(m.item, vec(m.p), { vel: m.v ? vec(m.v) : null, hover: !!m.h, broadcast: false }); break;
            case 'ipos': if (!this.net.isHost) g.items?.applyPositions(m.l); break;
            case 'itake': if (this.net.isHost) g.items?.pickUp(m.uid, m.from, m.side === 'left' ? 'left' : m.side === 'slot' ? 'slot' : 'right'); break;
            case 'igone': {
                if (this.net.isHost) break;
                const it = g.items?.removeLoose(m.uid);
                if (m.to === this.me && it) g.items._gotItem(it, m.side === 'left' ? 'left' : m.side === 'slot' ? 'slot' : 'right');
                break;
            }
            case 'ithrow': if (this.net.isHost && m.item) { const L = g.items?.spawnLoose(m.item, vec(m.p), { vel: vec(m.v), quat: Array.isArray(m.q) ? new THREE.Quaternion().fromArray(m.q).normalize() : null, spin: Array.isArray(m.w) ? vec(m.w) : null }); if (L) L.thrower = m.from; } break;
            case 'igive': if (m.to === this.me && m.item) { if (!g.items.takeIntoHand(m.item, m.side === 'left' ? 'left' : 'right')) g.inventory.storeItem(m.item); g.hud.setVoice?.('🤝 Вам передали предмет', true); } break;
            case 'ihold': if (m.by !== this.me) g.items?.setRemoteHeld(m.by, m.side, m.item || null); break;
            case 'wspawn': {
                if (this.net.isHost || g.weapons.byId.has(m.s[0])) break;
                const w = g.weapons.markMagic(g.weapons.spawnHovering(m.s[1], vec(m.hover), m.s[0]), m.s[10]);
                w.setRemoteTarget(m.s);
                break;
            }
            case 'w': {
                if (this.net.isHost) break;
                for (const s of m.l) {
                    const w = g.weapons.byId.get(s[0]);
                    if (!w || w.holder || this.weaponOwners.get(w.id) === this.me) continue;
                    w.setRemoteTarget(s);
                    w.hover = null;
                }
                break;
            }
            case 'grab': {
                if (!this.net.isHost) break;
                const w = g.weapons.byId.get(m.w);
                if (!w) break;
                const owner = this.weaponOwners.get(m.w) || (w.holder ? this.me : null);
                if (owner && owner !== m.from) { this.net.sendTo(m.from, { t: 'wown', w: m.w, owner }); break; }
                this.weaponOwners.set(m.w, m.from);
                w.hover = null;
                w.drive = null;
                w.holder = null;
                this.net.send({ t: 'wown', w: m.w, owner: m.from });
                break;
            }
            case 'rel': {
                if (!this.net.isHost) break;
                const w = g.weapons.byId.get(m.w);
                if (!w || this.weaponOwners.get(m.w) !== m.from) break;
                this.weaponOwners.delete(m.w);
                w.clearRemote();
                w.position.set(m.s[2], m.s[3], m.s[4]);
                w.quaternion.set(m.s[5], m.s[6], m.s[7], m.s[8]);
                w.velocity.set(m.v[0], m.v[1], m.v[2]);
                w.angularVelocity.set(m.av[0], m.av[1], m.av[2]);
                w.wake();
                w._sentSleep = false;
                this.net.send({ t: 'wown', w: m.w, owner: null });
                break;
            }
            case 'wown': {
                const w = g.weapons.byId.get(m.w);
                if (!w) break;
                if (m.owner) this.weaponOwners.set(m.w, m.owner); else this.weaponOwners.delete(m.w);
                if (m.owner && m.owner !== this.me && w.holder?.levitate) {
                    g.levitation.state = null;
                    w.holder = null;
                    w.drive = null;
                } else if (m.owner && m.owner !== this.me && w.holder) {
                    // Someone else got it first: let go.
                    const side = w.holder.side;
                    g.weapons._forget(side, g.character.getActiveHands()[side]);
                    w.holder = null;
                    w.drive = null;
                }
                if (m.owner && m.owner !== this.me) w.hover = null;
                break;
            }
            case 'wb': if (m.by !== this.me) g.water.applyRemote(m.by, m.s); break;
            case 'wdrop': if (m.by !== this.me) g.water.remoteDrop(m); break;
            case 'vx': if (m.by !== this.me) g.vortex?.onNet(m); break;
            case 'hf': if (m.by !== this.me) g.hellfire?.onNet(m); break;
            case 'ws': if (m.by !== this.me) g.waterStorm?.onNet(m); break;
            case 'sburn': if (m.to === this.me && m.item) { if (m.item.kind === 'book') g.books?.learnBurnt?.(m.item); else g.items?.applyScroll?.(m.item); } break; // (my «Инферно» burnt a scroll / a book lying at the host's)
            case 'ice': if (m.by !== this.me && Array.isArray(m.c)) g.applyIce(m.c.slice(0, 2000)); break;
            case 'duel': if (m.by !== this.me) { g.voiceGate?.noteRemote(m.s, performance.now()); g.duel.remoteCast(m); } break;
            case 'dend': g.duel.remoteEnd(m.id, m.res); break;
            case 'clash': if (!this.net.isHost) g.duel.remoteClash(m); break;
            case 'clashend': if (!this.net.isHost) g.duel.remoteClashEnd(m); break;
            case 'dmcut': case 'dmlimb': case 'dmst': case 'dmresc': g.dismember?.onNet(m); break; // (cut-off limbs: Dismember.js)
            case 'phit': if (m.to === this.me) {
                const landed = g.combat.enabled ? g.combat.meleeHit(Math.min(8, Math.round(m.dmg) || 1), m.by, !!m.mg, Array.isArray(m.h) ? m.h.slice(0, 3).map(Number) : null) : true;
                if (m.k) g.impact?.onStrike(m, landed === false); // (the blow moves my body too)
            } break;
            case 'ppush': if (m.to === this.me) g.impact?.onStrike(m, false); break;
            case 'cimp': if (!this.net.isHost) g.creatureImpact?.onNet(m.l); break;
            case 'cstrike': if (this.net.isHost) g.creatureImpact?.onStrike(m, m.from); break;
            case 'dmax': if (m.by !== this.me) g.duel.applyMaxima(m.a, m.b, this.net.isHost ? (m.from || m.by) : m.by); break;
            case 'hgrip': case 'hfree': case 'vhand': case 'vfree': g.handHold?.onNet(m); break;
            case 'cut': {
                const r = m.by !== this.me && g.remotes.get(m.by);
                if (r && Array.isArray(m.h)) g.bleeding?.addCut(r.character, m.h.slice(0, 3).map((v) => Math.max(-3, Math.min(3, Number(v)))));
                break;
            }
            case 'dbody': if (m.b) g.death?.onNetBody(m.b); break;
            case 'dblg': if (typeof m.id === 'string') g.death?.onNetLegacy(m.id); break;
            case 'bmv': if (typeof m.id === 'string') g.death?.onNetMove(m); break;
            case 'pdead': {
                if (m.by === this.me) break;
                g.castleLife?.playerDied(m.by);
                const r = g.remotes.get(m.by);
                if (r) r.setDead(true);
                const who = r ? r.name : 'Игрок';
                const killer = m.killer === this.me ? 'вы' : (g.remotes.get(m.killer)?.name || null);
                if (m.killer === this.me) g.killCount++;
                if (m.killer === this.me) g.duel?.opponentDied?.(m.by, Number(m.mm) || 30); // (mana: a duel won for real)
                g.hud.setVoice(killer ? `💀 ${escapeHtml(who)} побеждён (${escapeHtml(killer)})` : `💀 ${escapeHtml(who)} погиб`, true);
                break;
            }
            case 'prespawn': {
                const r = g.remotes.get(m.by);
                if (r) { r.setDead(false); r.hp = null; g.hud.notify?.(`✨ ${r.name} возродился`); }
                break;
            }
            case 'bite': g.damageLocalPlayer(m.dmg || 1); break;
            case 'achc': if (!this.net.isHost && typeof m.k === 'string') g.achievements?.onCredit(m.k); break; // (an achievement: the host saw me take part)
            case 'ach': if (m.by !== this.me) g.achievements?.onNet(m, m.by); break;
            case 'mcred': if (!this.net.isHost) applyCredit(g, { kind: m.kind, wiz: m.wiz, mm: m.mm }); break; // (mana: my kill, the host decided)
            case 'win': g.victory(g.killCount * 100 + g.playerHP * 50); break;
            default: break;
        }
    }

    _applyZombies(list, removed = []) {
        const g = this.game;
        for (const s of list) {
            let z = g.zombieById.get(s[0]);
            if (!z) {
                z = g._createZombie(new THREE.Vector3(s[1], s[2], s[3]), s[0]);
                z.remote = true;
                z.group.position.set(s[1], s[2], s[3]);
                z.group.rotation.y = s[4];
                if (s[6]) {
                    // Already missing limbs (late join)
                    for (const bit of [2, 4, 8, 16]) if (s[6] & bit) { z.limbMask |= bit; ({ 2: z.leftArm, 4: z.rightArm, 8: z.leftLeg, 16: z.rightLeg })[bit].visible = false; }
                    if (s[6] & 1) { z.limbMask |= 1; z.head.visible = false; }
                }
            }
            z.applySnapshot(s);
        }
        for (const id of removed || []) {
            const z = g.zombieById.get(id);
            if (z) g.removeZombie(z);
        }
    }

    _applyZombieHit(m) {
        const g = this.game;
        const z = g.zombieById.get(m.id);
        if (!z) return;
        const res = m.res || {};
        z.hitFlashTimer = 0.15;
        z._setColor(0xff0000);
        if (res.shattered) {
            z.shatter();
        } else {
            if (res.severed >= 0) z.severLimb(Math.random, res.severed);
            if (res.decap) z.decapitate();
            if (res.died) {
                z.isDead = true;
                if (g.sound && !z.dummy) g.sound.playDeath(z.group.position);
            } else if (m.by !== this.me && g.sound) {
                g.sound.playHit();
            }
        }
        if (res.died && m.by === this.me) {
            g.killCount++;
            g.hud.update(g.playerHP, g.maxHP, g.killCount, g.punchCount);
        }
    }
}

function sanitizeConfig(c) {
    return {
        mode: c.mode,
        map: c.map || null,
        zombieCount: c.zombieCount || 0,
        seed: c.seed,
        gen: c.gen ?? 1, // world generation (an old host sends none: 1)
    };
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
