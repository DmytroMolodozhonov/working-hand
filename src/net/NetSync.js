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
            this.game.remotes.set(p.id, new RemoteAvatar(this.game.scene, p.id, p.name, p.color));
            if (this._announce) this.game.hud.notify?.(`🟢 Подключился: ${p.name}`);
        }
        for (const id of [...this.game.remotes.keys()]) if (!ids.has(id)) this._onLeave(id);
    }

    _onJoin({ id, name }) {
        if (!this.game.remotes.has(id)) {
            const info = this.net.players.get(id);
            this.game.remotes.set(id, new RemoteAvatar(this.game.scene, id, name, info?.color || 1));
            if (this._announce) this.game.hud.notify?.(`🟢 Подключился: ${name}`);
        }
        // Late joiner: send the whole world state
        if (this.net.isHost) this.net.sendTo(id, this.welcomeMessage());
    }

    _onLeave(id) {
        const r = this.game.remotes.get(id);
        if (r) {
            if (this._announce) this.game.hud.notify?.(`🔴 Вышел: ${r.name}`);
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
            chests: g.chests.filter((c) => c.isOpen).map((c) => c.id),
            weapons: g.weapons.weapons.map((w) => ({ s: w.serialize(), owner: this.weaponOwners.get(w.id) || (w.holder ? this.me : null), hover: !!w.hover })),
            zombies: g.zombies.map((z) => z.serialize()),
            ice: g.iceCells,
            players: this.net.playerList(),
            dayStart: g.dayStart,
        };
    }

    /** Client: apply the host's world state after our own world was generated from the same seed. */
    applyWelcome(msg) {
        const g = this.game;
        if (msg.dayStart) { g.dayStart = msg.dayStart; if (g.dayCycle) g.world.setDayPhase(g.dayPhase()); }
        for (const e of msg.explosions || []) {
            g.world.explode(vec(e.p), e.r);
            g.explosions.push(e);
        }
        if (msg.ice && msg.ice.length) g.applyIce(msg.ice);
        for (const id of msg.chests || []) {
            const c = g.chests.find((x) => x.id === id);
            if (c) c.setOpenInstant();
        }
        const known = new Set(g.weapons.weapons.map((w) => w.id));
        for (const wd of msg.weapons || []) {
            let w = g.weapons.byId.get(wd.s[0]);
            if (!w) w = g.weapons.spawn(wd.s[1], vec([wd.s[2], wd.s[3], wd.s[4]]), new THREE.Quaternion(wd.s[5], wd.s[6], wd.s[7], wd.s[8]), wd.s[0]);
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
    }

    // ================================================================ update
    update(dt) {
        const g = this.game;
        this.pTimer += dt;
        if (this.pTimer >= 0.05) {
            this.pTimer = 0;
            const held = [];
            for (const hs of g.weapons.heldWeapons()) held.push(hs.held.serialize());
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

    /** «Брейнрот» from a guest: the host makes the zombie a servant. */
    brainrot(zid) {
        this.net.send({ t: 'brainrot', id: zid, by: this.me });
    }

    zombieSand(z) {
        if (this.net.isHost) this.net.send({ t: 'zsand', id: z.id });
    }

    sendHit(z, dmg, dir, isWeapon) {
        this.net.send({ t: 'hit', id: z.id, dmg, dir: [r3(dir.x), r3(dir.y), r3(dir.z)], w: isWeapon ? 1 : 0 });
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

    playerHit(to, dmg) {
        this.net.send({ t: 'phit', by: this.me, to, dmg }, true);
    }

    died(killer) {
        this.net.send({ t: 'pdead', by: this.me, killer: killer || null }, true);
    }

    explosion(pos, radius, power = 1, casterId = null) {
        if (this.net.isHost) this.net.send({ t: 'boom', p: [r3(pos.x), r3(pos.y), r3(pos.z)], r: radius, k: power, by: casterId === 'local' ? this.me : casterId });
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
                if (z && !z.isDead) g.damageZombie(z, Math.min(10, m.dmg | 0 || 1), !!m.w, vec(m.dir || [0, 0, 1]), m.from);
                break;
            }
            case 'brainrot': if (this.net.isHost) g.applyBrainrot(m.id, m.from || m.by); break;
            case 'spell': {
                if (m.by === this.me) break;
                g.spells.cast(m.name, vec(m.o), vec(m.d), m.side, m.by);
                break;
            }
            case 'boom': if (!this.net.isHost) { g.applyExplosion(vec(m.p), m.r, false, m.k || 1, m.by || null); g.explosions.push({ p: m.p, r: m.r }); } break;
            case 'chest': {
                const c = g.chests.find((x) => x.id === m.id);
                if (c && !this.net.isHost) g.openChest(c);
                break;
            }
            case 'wspawn': {
                if (this.net.isHost || g.weapons.byId.has(m.s[0])) break;
                const w = g.weapons.spawnHovering(m.s[1], vec(m.hover), m.s[0]);
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
            case 'phit': if (m.to === this.me) g.combat.meleeHit(Math.min(5, m.dmg | 0 || 1), m.by); break;
            case 'pdead': {
                if (m.by === this.me) break;
                const r = g.remotes.get(m.by);
                if (r) r.setDead(true);
                const who = r ? r.name : 'Игрок';
                const killer = m.killer === this.me ? 'вы' : (g.remotes.get(m.killer)?.name || null);
                if (m.killer === this.me) g.killCount++;
                g.hud.setVoice(killer ? `💀 ${escapeHtml(who)} побеждён (${escapeHtml(killer)})` : `💀 ${escapeHtml(who)} погиб`, true);
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
