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
 *   boom     host→all     explosion (terrain + effects)
 *   chest    host→all     chest opened;  wspawn: reward weapon
 *   grab/rel client→host  weapon picked up / thrown;  wown: owner changed
 *   w        host→all     free weapon poses 10×/s
 *   bite     host→player  zombie bit you;  win: someone reached the finish
 *   wb       player→all   water ball in hand (10×/s);  wdrop: ball dropped
 *   ice      player→all   ice blocks built with water forming
 *   phit     player→all   my fist/weapon hit player `to` (Свободный мир)
 *   pdead    player→all   I was killed (by `killer`)
 *   duel     caster→all   a duel charge flies (dend: it hit / was blocked / fizzled)
 *   clash    host→all     two charges are pushing (meeting point p); clashend: result
 */

import * as THREE from 'three';
import { RemoteAvatar } from './RemoteAvatar.js';
import { playerSnapshot, applyPlayerSnapshot } from '../game/WorldSave.js';

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
        if (this.net.isHost) {
            const msg = this.welcomeMessage();
            msg.you = this.game.keeper?.players[name] || null; // a player coming back gets their things
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
            campfires: g.campfires?.snapshot() || [],
            beds: g.beds?.snapshot() || [],
            castles: g.castleLife?.snapshot() || {},
            weather: g.storm && g.storm.until > performance.now() ? Math.round((g.storm.until - performance.now()) / 1000) : 0,
            edits: g.blockEdits || [],
            treesGone: g.world.trees ? g.world.trees.filter((t) => !t.alive).map((t) => t.index) : [],
        };
    }

    /** Client: apply the host's world state after our own world was generated from the same seed. */
    applyWelcome(msg) {
        const g = this.game;
        if (Array.isArray(msg.edits) && msg.edits.length) g.builder?.applyEdits(msg.edits.slice(-30000));
        for (const i of msg.treesGone || []) { const t = g.world.trees?.find((x) => x.index === i); if (t && t.alive) g.world.removeTree(t); }
        if (msg.dayStart) { g.dayStart = msg.dayStart; if (g.dayCycle) g.world.setDayPhase(g.dayPhase()); }
        if (msg.weather > 0) g.gear?.startWeather(msg.weather);
        if (msg.doors) g.doors?.restore(msg.doors);
        if (msg.campfires) g.campfires?.restore(msg.campfires);
        if (msg.beds) g.beds?.restore(msg.beds);
        if (msg.castles) g.castleLife?.restore(msg.castles);
        for (const e of msg.explosions || []) {
            g.world.explode(vec(e.p), e.r);
            g.explosions.push(e);
        }
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
        if (msg.you && !this._gotMine) { this._gotMine = true; applyPlayerSnapshot(g, msg.you); g.hud.update(g.playerHP, g.maxHP, g.killCount, g.punchCount); }
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
        if (this.pTimer >= 0.05) {
            this.pTimer = 0;
            const held = [];
            for (const hs of g.weapons.heldWeapons()) held.push(hs.held.serialize());
            for (const w of g.weapons.stuckWeapons()) held.push(w.serialize()); // stuck in a zombie: still mine
            const floating = g.levitation?.heldWeapon();
            if (floating) held.push(floating.serialize());
            this.net.send({
                t: 'p', id: this.me, s: g.character.serializePose(), hp: g.combat.enabled ? g.combat.hp : g.playerHP,
                c: g.combat.serialize(), ft: Math.round(g.combat.fatigue * 10) / 10, dc: g.duel.myContact(), w: held,
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

    bookGone(id, to) {
        if (this.net.isHost) this.net.send({ t: 'bgone', id, to }, true);
    }

    brainrot(zid) {
        this.net.send({ t: 'brainrot', id: zid, by: this.me });
    }

    zombieSand(z) {
        if (this.net.isHost) this.net.send({ t: 'zsand', id: z.id });
    }

    sendHit(z, dmg, dir, isWeapon, hit = null) {
        this.net.send({ t: 'hit', id: z.id, dmg, dir: [r3(dir.x), r3(dir.y), r3(dir.z)], w: isWeapon ? 1 : 0, h: hit ? [r3(hit.y), hit.side, r3(hit.speed)] : null });
    }

    spell(name, origin, dir, side) {
        this.net.send({ t: 'spell', by: this.me, name, o: [r3(origin.x), r3(origin.y), r3(origin.z)], d: [r3(dir.x), r3(dir.y), r3(dir.z)], side }, true);
    }

    waterDrop(b) {
        this.net.send({ t: 'wdrop', by: this.me, p: [r3(b.pos.x), r3(b.pos.y), r3(b.pos.z)], v: [r3(b.vel.x), r3(b.vel.y), r3(b.vel.z)], r: r3(b.r), f: b.frozen ? 1 : 0 }, true);
    }

    ice(cells) {
        this.net.send({ t: 'ice', by: this.me, c: cells }, true);
    }

    duelCast(b) {
        this.net.send({ t: 'duel', id: b.id, by: b.by, s: b.spell, side: b.side, tk: b.tk, tid: b.tid, o: [r3(b.o.x), r3(b.o.y), r3(b.o.z)], d: [r3(b.dir.x), r3(b.dir.y), r3(b.dir.z)] }, true);
    }

    duelEnd(id, res) {
        this.net.send({ t: 'dend', id, res }, true);
    }

    duelClash(a, b, p) {
        if (this.net.isHost) this.net.send({ t: 'clash', a, b, p: Math.round(p * 1000) / 1000 });
    }

    duelClashEnd(a, b, loser) {
        if (this.net.isHost) this.net.send({ t: 'clashend', a, b, loser });
    }

    playerHit(to, dmg, magic = false, hit = null) {
        const r = (v) => Math.round(v * 100) / 100;
        const h = hit && Number.isFinite(hit.lx) ? [r(hit.lx), r(hit.y), r(hit.lz)] : undefined;
        this.net.send({ t: 'phit', by: this.me, to, dmg, mg: magic ? 1 : 0, h }, true);
    }

    /** A light cut on me (everybody draws it on my body). */
    cut(h) {
        this.net.send({ t: 'cut', by: this.me, h }, true);
    }

    died(killer) {
        this.net.send({ t: 'pdead', by: this.me, killer: killer || null }, true);
    }

    /** I'm back in the game. */
    respawned() {
        this.net.send({ t: 'prespawn', by: this.me }, true);
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
    villagerTalk(id) { this.net.send({ t: 'vtalk', id }); }
    tradeSell(uid, wid, price, p) { this.net.send({ t: 'tsell', uid, wid, price, p }); }
    animalHit(id, dmg, dir, fire) { this.net.send({ t: 'ahit', id, dmg, d: dir ? [r3(dir.x), r3(dir.y), r3(dir.z)] : null, f: fire ? 1 : 0, by: this.me }); }
    animalMeat(id, side) { this.net.send({ t: 'ameat', id, side }); }
    animalMeatTo(to, item, side) { this.net.send({ t: 'agive', to, item, side }, true); }
    animalGather(id) { this.net.send({ t: 'agath', id }); }
    applePick(key, i, side) { this.net.send({ t: 'apick', key, i, side }); }
    appleGone(key, i, until) { if (this.net.isHost) this.net.send({ t: 'agone', key, i, until }, true); }
    animalFeed(id) { this.net.send({ t: 'afeed', id }); }
    animalRide(id, on) { this.net.send({ t: 'aride', id, on: on ? 1 : 0, by: this.me }, true); }
    animalPos(id, p) { this.net.send({ t: 'apos', id, p }); }
    animalButt(to, dmg, p) { this.net.send({ t: 'abutt', to, dmg, p: [r3(p.x), r3(p.y), r3(p.z)] }, true); }

    // ---- the spider (host)
    bosses(list) { if (this.net.isHost) this.net.send({ t: 'boss', l: list }); }
    bossHit(id, dmg, kind) { this.net.send({ t: 'bhit', id, dmg, kind }); }
    bossShot(kind, from, to) { if (this.net.isHost) this.net.send({ t: 'bshot', kind, o: [r3(from.x), r3(from.y), r3(from.z)], to }, true); }
    bossGrab(id, to) { if (this.net.isHost) this.net.send({ t: 'bgrab', id, to }, true); }
    bossFree(id) { this.net.send({ t: 'bfree', id }, true); }
    bossNotice() { if (this.net.isHost) this.net.send({ t: 'bnote' }, true); }

    door(d) { this.net.send({ t: 'door', d }, true); }
    /** Campfires: {t:'cf'} host → all, {t:'cfask'|'cfwood'} guest → host. */
    campfire(msg) { this.net.send(msg); }
    /** Beds (Beds.js): {a: set | create | color | msg | lie | sleep, …}; `to`: only that player (host). */
    bed(m, to = null) { if (to) this.net.sendTo(to, { t: 'bed', ...m }); else this.net.send({ t: 'bed', ...m }, true); }
    doorAngle(id, a) { this.net.send({ t: 'dang', id, a: Math.round(a * 100) / 100 }, true); }

    /** My hero's look, for everybody (on start and whenever somebody joins). */
    sendLook() {
        const look = this.game.character.look;
        if (look) this.net.send({ t: 'look', by: this.me, look }, true);
    }

    impale(to, wid) {
        this.game.bleeding?.noteImpale(wid, to);
        this.net.send({ t: 'impale', w: wid, to }, true);
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

    arrow(from, dir, dmg) {
        const v = dir.clone();
        this.net.send({ t: 'arrow', by: this.me, o: [r3(from.x), r3(from.y), r3(from.z)], v: [r3(v.x), r3(v.y), r3(v.z)], d: Math.round(dmg * 10) / 10 }, true);
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

    itemThrow(item, p, v) {
        this.net.send({ t: 'ithrow', item, p: [r3(p.x), r3(p.y), r3(p.z)], v: [r3(v.x), r3(v.y), r3(v.z)] });
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
                for (const ws of m.w || []) {
                    const w = g.weapons.byId.get(ws[0]);
                    if (w && !w.holder) { w.setRemoteTarget(ws); w.hover = null; }
                }
                break;
            }
            case 'z': if (!this.net.isHost) this._applyZombies(m.l, m.rm); break;
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
            case 'pstate': if (this.net.isHost && m.s) this.game.keeper?.notePlayer(this.net.players.get(m.from)?.name || m.name, m.s); break;
            case 'birds': if (!this.net.isHost) g.books?.applyNet(m.l, m.b); break;
            case 'btake': if (this.net.isHost) g.books?._take(m.id, m.from); break;
            case 'bgone': if (!this.net.isHost) g.books?.netGone(m.id, m.to); break;
            case 'brainrot': if (this.net.isHost) g.applyBrainrot(m.id, m.from || m.by); break;
            case 'spell': {
                if (m.by === this.me) break;
                g.spells.cast(m.name, vec(m.o), vec(m.d), m.side, m.by);
                break;
            }
            case 'boom': if (!this.net.isHost) { g.applyExplosion(vec(m.p), m.r, false, m.k || 1, m.by || null); g.explosions.push({ p: m.p, r: m.r }); } break;
            case 'chest': {
                (g._openedChests = g._openedChests || new Set()).add(m.id);
                const c = g.chests.find((x) => x.id === m.id);
                if (c && !this.net.isHost) g.openChest(c);
                break;
            }
            case 'boss': if (!this.net.isHost) g.spiders?.applyNet(m.l); break;
            case 'bhit': if (this.net.isHost) { const sp = g.spiders?.list.find((x) => x.id === m.id); if (sp) g.spiders.hit(sp, Math.min(40, m.dmg || 1), m.kind); } break;
            case 'bshot': if (!this.net.isHost) g.spiders?._fire(m.kind, vec(m.o), m.to); break;
            case 'bgrab': if (m.to === this.me) { const sp = g.spiders?.list.find((x) => x.id === m.id); if (sp) { sp.holding = this.me; g.spiders._seized(sp); } } break;
            case 'bfree': { const sp = g.spiders?.list.find((x) => x.id === m.id); if (sp) sp.holding = null; break; }
            case 'bnote': g.hud.notify?.('🕷️ Из темноты выходит гигантская паучиха...'); break;
            case 'door': if (m.d) g.doors?.applyNet(m.d); break;
            case 'dang': g.doors?.applyAngle(m.id, m.a); break;
            case 'cf': case 'cfask': case 'cfwood': g.campfires?.onNet(m); break;
            case 'bed': g.beds?.onNet(m); break;
            case 'look': {
                if (m.by === this.me || !m.look) break;
                this.looks = this.looks || new Map();
                this.looks.set(m.by, m.look);
                g.remotes.get(m.by)?.setLook(m.look);
                break;
            }
            case 'an': if (!this.net.isHost) g.animals?.applyNet(m.l); break;
            case 'vil': if (!this.net.isHost) g.castleLife?.applyNet(m.l); break;
            case 'vhit': if (this.net.isHost && m.by !== this.me) { const v = g.castleLife?.byId.get(m.id); if (v) g.castleLife.hit(v, Math.min(30, +m.dmg || 1), Array.isArray(m.d) ? new THREE.Vector3(m.d[0], 0, m.d[1]) : null, m.by, { magic: !!m.mg }); } break;
            case 'vstr': if (m.to === this.me) g.castleLife?.struck(Math.min(10, +m.dmg || 1), +m.x || 0, +m.z || 0, String(m.who || 'Рыцарь').slice(0, 30)); break;
            case 'vsay': if (m.by !== this.me) g.castleLife?.heard(m.id, String(m.text || '').slice(0, 200)); break;
            case 'valarm': if (m.to === this.me) g.hud.setVoice('⚔️ Вас заметили! Стража замка идёт за вами', true); break;
            case 'cst': if (!this.net.isHost && m.s) g.castleLife?.applyState(m.id, m.s); break;
            case 'vtalk': if (this.net.isHost) { const v = g.castleLife?.byId.get(m.id); if (v && !v.foe) { v.talking = 5; v.talkTo = m.from; } } break;
            case 'vcrime': if (this.net.isHost) { const v = g.castleLife?.byId.get(m.id); if (v) g.castleLife.reportCrime(v, m.from, String(m.kind || '')); } break;
            case 'tsell': if (this.net.isHost && Array.isArray(m.p)) g.castleLife?.talk.sellNow(m.uid || null, m.wid || null, Math.min(2000, +m.price || 1), vec(m.p)); break;
            case 'ahit': if (this.net.isHost) { const a = g.animals?.byId.get(m.id); if (a) g.animals.hit(a, Math.min(30, m.dmg || 1), m.d ? vec(m.d) : null, m.from || m.by, !!m.f); } break;
            case 'ameat': if (this.net.isHost) { const a = g.animals?.byId.get(m.id); if (a) g.animals._takeMeat(a, m.from, m.side); } break;
            case 'agath': if (this.net.isHost) { const a = g.animals?.byId.get(m.id); if (a) { const n = a.meat; for (let i = 0; i < n; i++) g.animals._takeMeat(a, m.from, null); } } break;
            case 'agive': if (m.to === this.me && m.item) g.animals?._give(m.item, m.side); break;
            case 'apick': if (this.net.isHost) { const tr = g.animals?.trees.get(m.key); if (tr) g.animals._pickApple(tr, m.i, m.from, m.side); } break;
            case 'agone': if (!this.net.isHost) { const tr = g.animals?.trees.get(m.key); if (tr && tr.apples[m.i]) tr.apples[m.i].until = Date.now() + Math.max(0, (m.until || 0) - Date.now()); } break;
            case 'afeed': if (this.net.isHost) { const a = g.animals?.byId.get(m.id); if (a) a.apples = Math.min(3, a.apples + 1); } break;
            case 'aride': { const a = g.animals?.byId.get(m.id); if (a && m.by !== this.me) { a.rider = m.on ? m.by : null; if (m.on) a.tamed = m.by; a.state = m.on ? 'ridden' : 'graze'; if (a.model.userData.saddle) a.model.userData.saddle.visible = !!m.on; } break; }
            case 'apos': if (this.net.isHost) { const a = g.animals?.byId.get(m.id); if (a && Array.isArray(m.p)) { a.group.position.set(m.p[0], m.p[1], m.p[2]); a.group.rotation.y = m.p[3]; } } break;
            case 'abutt': if (m.to === this.me) { if (g.combat.enabled) g.combat.damage(m.dmg || 1, null, 'animal'); else g.damageLocalPlayer(m.dmg || 1); } break;
            case 'impale': g.bleeding?.noteImpale(m.w, m.to); break;
            case 'unimpale': g.bleeding?.noteUnimpale(m.w); break;
            case 'pullout': { const w = g.weapons.byId.get(m.w); if (w && w.stuckIn) g.weapons._unstick(w, true); break; }
            case 'bleed': if (m.by !== this.me) g.bleeding?.remote.set(m.by, m.r || 0); break;
            case 'rescue': if (m.to === this.me && g.bleeding) { for (const wid of g.bleeding._bladesInMe()) g.bleeding.pullOut(wid); g.bleeding.stop(); } break;
            case 'arrow': if (m.by !== this.me) g.gear?.fire(vec(m.o), vec(m.v), m.d || 3, m.by); break;
            case 'weather': g.gear?.startWeather(Math.min(400, m.s || 120)); break;
            // ---- things (wands, scrolls, shields…)
            case 'inew': if (!this.net.isHost && m.item) g.items?.spawnLoose(m.item, vec(m.p), { vel: m.v ? vec(m.v) : null, hover: !!m.h, broadcast: false }); break;
            case 'ipos': if (!this.net.isHost) g.items?.applyPositions(m.l); break;
            case 'itake': if (this.net.isHost) g.items?.pickUp(m.uid, m.from, m.side === 'left' ? 'left' : 'right'); break;
            case 'igone': {
                if (this.net.isHost) break;
                const it = g.items?.removeLoose(m.uid);
                if (m.to === this.me && it) g.items._gotItem(it, m.side === 'left' ? 'left' : 'right');
                break;
            }
            case 'ithrow': if (this.net.isHost && m.item) { const L = g.items?.spawnLoose(m.item, vec(m.p), { vel: vec(m.v) }); if (L) L.thrower = m.from; } break;
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
            case 'ice': if (m.by !== this.me && Array.isArray(m.c)) g.applyIce(m.c.slice(0, 2000)); break;
            case 'duel': if (m.by !== this.me) g.duel.remoteCast(m); break;
            case 'dend': g.duel.remoteEnd(m.id, m.res); break;
            case 'clash': if (!this.net.isHost) g.duel.remoteClash(m); break;
            case 'clashend': if (!this.net.isHost) g.duel.remoteClashEnd(m); break;
            case 'phit': if (m.to === this.me) g.combat.meleeHit(Math.min(8, Math.round(m.dmg) || 1), m.by, !!m.mg, Array.isArray(m.h) ? m.h.slice(0, 3).map(Number) : null); break;
            case 'cut': {
                const r = m.by !== this.me && g.remotes.get(m.by);
                if (r && Array.isArray(m.h)) g.bleeding?.addCut(r.character, m.h.slice(0, 3).map((v) => Math.max(-3, Math.min(3, Number(v)))));
                break;
            }
            case 'pdead': {
                if (m.by === this.me) break;
                g.castleLife?.playerDied(m.by);
                const r = g.remotes.get(m.by);
                if (r) r.setDead(true);
                const who = r ? r.name : 'Игрок';
                const killer = m.killer === this.me ? 'вы' : (g.remotes.get(m.killer)?.name || null);
                if (m.killer === this.me) g.killCount++;
                g.hud.setVoice(killer ? `💀 ${escapeHtml(who)} побеждён (${escapeHtml(killer)})` : `💀 ${escapeHtml(who)} погиб`, true);
                break;
            }
            case 'prespawn': {
                const r = g.remotes.get(m.by);
                if (r) { r.setDead(false); r.hp = null; g.hud.notify?.(`✨ ${r.name} возродился`); }
                break;
            }
            case 'bite': g.damageLocalPlayer(m.dmg || 1); break;
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
                if (g.sound) g.sound.playDeath(z.group.position);
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
    };
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
