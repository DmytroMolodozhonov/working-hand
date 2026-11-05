/**
 * Bounty.js — the hunters for one's head (the rules: BountyRules.js; the parties are the roads' travellers — Travelers.js / Riders.js).
 *
 *  - CRIMES (host, CastleLife._offence): a killing in a settlement before witnesses who KNEW THE FACE (BountyRules.knowsFace: near enough,
 *    the hero neither invisible — he would not be a witness at all — nor under the potion of another face; a helmet hides it from most)
 *    heats that settlement's record of that player. Only that settlement sends hunters (the others know nothing of it).
 *  - THE ROLL (host): every 40–120 s (as the phoenix's) for each wanted player with no hunt after him: the chance — 50 % of the phoenix's
 *    out in the open, 70 % in his own house («Create a House» / his «Protection House» sphere), none in a cave (unless the hunters saw him
 *    run into it); the wizards' hunters ×1.15. Found — a party of 2–3 (knights or wizards, on foot or riding) comes from out of sight.
 *  - THE HUNT: they go to him (his place every second); in his house — to its door and knock (they never break in): he comes out — they
 *    talk; nobody — they go away after KNOCK_S. The peaceful ones stop before him and ask the ransom («заплачу» — paid, the record is
 *    cleared, they leave; «нет», silence for TALK_S, a blow — the fight); the others fall on him at once. He runs into a cave unseen —
 *    they lose him (they go to the last place they saw him and give up). Killed — the record stays: they will send again.
 *  - A player's death: a new life — the records of him are forgotten (as the castles' anger — CastleLife.playerDied).
 * Saved: the local player's records (WorldSave `bounty`).
 */

import { BOUNTY, settled, mageSite, knowsFace, crimeHeat, wanted, findChance, partyFor, fineOf, huntAnswer, HUNT_LINES, memoryOf, policeChance } from './BountyRules.js';
import { skinOf } from './DarkMagic.js';

const DAY_S = 24 * 60; // s of game a game day (Game.DAY_CYCLE_MS)

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

export class Bounty {
    constructor(game) {
        this.game = game;
        this.recs = new Map(); // pid → Map(defId → {heat, kills, name, x, z, mage, at})
        this.hunts = new Map(); // pid → hunt {P, pid, defId, rec, peaceful, phase, t, lastSeen, home}
        this.days = 0; // game days passed (the records' memory fades by them — saved)
        this._policeT = 0;
        this._rollT = rnd(...BOUNTY.ROLL);
        this._tickT = 0;
        this.log = [];
    }

    get life() { return this.game.castleLife; }
    get auth() { return this.game.authority; }

    _note(s) { this.log.push(s); if (this.log.length > 60) this.log.shift(); this.game.perf?.note?.('розыск: ' + s); }

    // ---------------------------------------------------------------- crimes
    /** (host, CastleLife._offence) `by` killed / hurt `victim` in `cs` before `witnesses` who knew it was him. */
    crime(cs, by, victim, killed, witnesses) {
        const g = this.game, def = cs?.def;
        if (!this.auth || !killed || !settled(def) || !witnesses?.length) return;
        if (g.arenaDuels?.peace?.()) return;
        const p = this.life?._playerPos?.(by);
        if (!p) return;
        const hero = this._heroLook(by);
        let known = 0;
        const knowers = [];
        for (const w of witnesses) if (knowsFace({ dist: Math.hypot(w.x - p.x, w.z - p.z) }, hero)) { known++; if (w.idx != null) knowers.push(w.idx); }
        const chief = victim && (victim.role === 'king' || victim.role === 'master' || victim.entry?.elder);
        const add = crimeHeat(true, chief, known);
        if (!add) { this._note(`«${def.name || def.id}»: убийство — лица не узнали (${hero.helmet ? 'шлем' : hero.disguised ? 'чужое лицо' : 'далеко'})`); return; }
        let m = this.recs.get(by);
        if (!m) this.recs.set(by, (m = new Map()));
        const r = m.get(def.id) || { heat: 0, kills: 0, name: def.name || 'поселение', x: def.x, z: def.z, mage: mageSite(def), at: 0, day: this.days, knowers: [], reported: false };
        r.heat += add; r.kills++; r.at = Date.now(); r.day = this.days; // (a new crime: the memory is fresh again)
        for (const k of knowers) if (!r.knowers.includes(k)) r.knowers.push(k);
        m.set(def.id, r);
        this._note(`«${r.name}»: убийство при свидетелях, узнали ${known} — жар ${r.heat}${wanted(r) ? ' (РОЗЫСК)' : ''}`);
    }

    /** What the witnesses could see of this player: invisible, another face (the potion), a helmet on. */
    _heroLook(by) {
        const g = this.game, me = by === g.localId;
        const invisible = !!g.invis?.hidden?.(by);
        const disguised = me ? !!g.potionFx?.has?.('disguise') : !!g.remotes?.get(by)?.disguised;
        const helmet = me ? !!g.armor?.worn?.helmet : !!(g.armor?.remote?.get?.(by)?.h > 0);
        return { invisible, disguised, helmet };
    }

    /** The worst record of a player (the settlement that wants him most). */
    _worst(pid) {
        this._prune(pid);
        let best = null, id = null;
        for (const [k, r] of this.recs.get(pid) || []) if (wanted(r) && (!best || r.heat > best.heat)) { best = r; id = k; }
        return best ? { id, rec: best } : null;
    }

    /**
     * Records that no longer stand: forgotten (FORGET_DAYS game days since the last time they knew of him — a new crime, a hunter who ran
     * home and told), or nobody left alive who knew his face and nobody told anyone (the author: «убил всех — никто не может доложить»).
     */
    _prune(pid) {
        const m = this.recs.get(pid), L = this.life;
        if (!m) return;
        for (const [k, r] of m) {
            if (memoryOf(r, this.days) <= 0) { m.delete(k); this._note(`«${r.name}» забыло (прошло ${BOUNTY.FORGET_DAYS} игровых дней)`); continue; }
            if (!r.reported && r.knowers?.length && L?.state) {
                const killed = L.state(k)?.killed;
                if (killed && r.knowers.every((i) => killed.has(i))) { m.delete(k); this._note(`«${r.name}»: все, кто знал лицо, мертвы — доложить некому`); }
            }
        }
        if (!m.size) this.recs.delete(pid);
    }

    _skin(pid) { return pid === this.game.localId ? skinOf(this.game.dark || {}) : 0; }

    playerDied(pid) {
        this.recs.delete(pid);
        const H = this.hunts.get(pid);
        if (H) this._end(H, null);
    }

    // ---------------------------------------------------------------- where is he
    _where(pid, pos) {
        const g = this.game;
        if (pid === g.localId ? !!g._inCave : false) return 'cave';
        if (this._homeOf(pid, pos)) return 'home';
        return 'open';
    }

    /** His own «Protection House» sphere he is in (or null). */
    _wardOf(pid, pos) {
        const g = this.game, wk = g.wards?.keyOf?.(pid);
        for (const w of g.wards?.list?.values?.() || []) if (w.owner === wk && Math.hypot(w.c.x - pos.x, w.c.z - pos.z) <= w.r) return w;
        return null;
    }

    /** Is his sphere plainly black magic (a dark mage that far gone — or the true dark mage)? */
    _blackWard(pid) { return this._skin(pid) >= BOUNTY.WARD_BLACK || !!this.game.darkLord?.isLord?.(pid); }

    /** His own house he is in (a «Create a House» house, or his «Protection House» sphere) → {x, z, r} or null. */
    _homeOf(pid, pos) {
        const g = this.game;
        const hm = g.houseMagic, key = hm?._key?.(pid);
        for (const rec of hm?.list?.values?.() || []) if (rec.owner === key && Math.hypot(rec.x - pos.x, rec.z - pos.z) < 14) return { x: rec.x, z: rec.z, r: 14 };
        const wk = g.wards?.keyOf?.(pid);
        for (const w of g.wards?.list?.values?.() || []) if (w.owner === wk && Math.hypot(w.c.x - pos.x, w.c.z - pos.z) <= w.r) return { x: w.c.x, z: w.c.z, r: w.r };
        return null;
    }

    // ---------------------------------------------------------------- the loop (host)
    update(dt) {
        if (!this.auth || !this.life?.enabled) return;
        this.days += dt / DAY_S;
        this._policeT -= dt;
        if (this._policeT <= 0) { this._policeT = BOUNTY.POLICE_S; this._police(); }
        this._rollT -= dt;
        if (this._rollT <= 0) { this._rollT = rnd(...BOUNTY.ROLL); this._roll(); }
        this._tickT -= dt;
        if (this._tickT > 0) return;
        this._tickT = 0.5;
        for (const H of [...this.hunts.values()]) this._hunt(H, 0.5);
    }

    _roll() {
        const L = this.life;
        for (const pl of L._players?.() || []) {
            if (this.hunts.has(pl.id)) continue;
            const w = this._worst(pl.id);
            if (!w) continue;
            const where = this._where(pl.id, pl.p);
            const stayed = !!w.rec.lastSeen && Math.hypot(pl.p.x - w.rec.lastSeen.x, pl.p.z - w.rec.lastSeen.z) < BOUNTY.STAYED_R; // (a hunter ran home and told where: one who stays there is found easier)
            const ch = findChance(where, w.rec.mage, false, { mem: memoryOf(w.rec, this.days), skin: this._skin(pl.id), stayed });
            const hit = Math.random() < ch;
            this._note(`бросок: «${w.rec.name}» ищет (${where}, шанс ${(ch * 100).toFixed(1)} %) — ${hit ? 'НАШЛИ' : 'нет'}`);
            if (hit) this._send(pl, w, where);
        }
    }

    /** A party of hunters after player `pl` (from out of sight, as the roads' travellers). */
    /**
     * The town guard of the very settlement (the author: «вернулся в тот же город — тебя могут найти прямо в городе, но это уже не охотники,
     * а стража»): a fighter of that place who sees the wanted one inside its land may know him — the fresher the memory, the heavier the crime,
     * the darker the mage, the likelier; a helmet hides it from most, another face (the potion) and invisibility — from all.
     */
    _police() {
        const L = this.life;
        for (const pl of L._players?.() || []) {
            this._prune(pl.id);
            const m = this.recs.get(pl.id);
            if (!m) continue;
            const look = this._heroLook(pl.id), skin = this._skin(pl.id);
            for (const [defId, r] of m) {
                const cs = L.castles?.get(defId);
                if (!cs?.awake || !L._inLand?.(cs.def, pl.p, 4)) continue;
                if (cs.hostile.get(pl.id) > Date.now()) continue; // (they are already after him)
                const ch = policeChance(r, memoryOf(r, this.days), look, skin);
                if (ch <= 0) continue;
                for (const v of cs.active.values()) {
                    if (v.dead || v.foe || v.sleep || !L._fights?.(v)) continue;
                    if (Math.hypot(v.x - pl.p.x, v.z - pl.p.z) > BOUNTY.POLICE_R || !(L._sees ? L._sees(v, pl.p) : true)) continue;
                    if (Math.random() >= ch) continue;
                    cs.hostile.set(pl.id, Date.now() + 180000);
                    v.foe = pl.id; v.path = null;
                    L._say(v, pick(HUNT_LINES.police), 4);
                    if (pl.id === this.game.localId) this.game.hud?.setVoice?.(`🚨 Стража «${r.name}» узнала вас — вас помнят`, true);
                    this._note(`«${r.name}»: стража узнала (шанс ${(ch * 100).toFixed(0)} %)`);
                    break;
                }
            }
        }
    }

    _send(pl, w, where) {
        const g = this.game, T = g.travelers;
        if (!T?.spawnNear) return null;
        const home = where === 'home' ? this._homeOf(pl.id, pl.p) : null;
        const pty = partyFor(w.rec, where);
        const dest = home ? { x: home.x, z: home.z, r: home.r + 3, into: null, name: 'дом' } : { x: pl.p.x, z: pl.p.z, r: BOUNTY.FIND_R, into: null, name: 'охота' };
        const P = T.spawnNear(pty.kind, { player: pl, dest, n: pty.n });
        if (!P) { this._note('отряд не нашёл места появиться — в другой раз'); return null; }
        const H = { P, pid: pl.id, defId: w.id, rec: w.rec, peaceful: pty.peaceful, phase: home ? 'door' : 'track', t: 0, phaseT: 0, home, seenAt: 0, last: { x: pl.p.x, z: pl.p.z } };
        P.hunt = H;
        for (const v of P.members) { v.title = w.rec.mage ? 'Маг-охотник за головами' : 'Охотник за головами'; v.hunter = H; }
        this.hunts.set(pl.id, H);
        this._note(`отряд «${w.rec.name}»: ${P.members.length} ${pty.mounted ? 'верхом' : 'пешком'}, ${pty.peaceful ? 'мирные' : 'немирные'}${home ? ', к дому' : ''}`);
        return H;
    }

    _alive(H) { return H.P.members.filter((v) => !v.dead); }

    _hunt(H, dt) {
        const L = this.life, g = this.game, P = H.P;
        H.t += dt; H.phaseT += dt;
        const alive = this._alive(H);
        if (!g.travelers?.parties?.has(P.id) || !alive.length) { this._end(H, null); return; } // (gone, or every hunter dead: the record stays — they will send again)
        const p = L._playerPos(H.pid);
        if (!p || H.t > BOUNTY.HUNT_S) { this._end(H, HUNT_LINES.gaveUp); return; }
        // do they see him (one of them, near, by sight)?
        const lead = alive[0];
        const sees = alive.some((v) => Math.hypot(v.x - p.x, v.z - p.z) < 45 && (L._sees ? L._sees(v, p) : true));
        if (sees) { H.seenAt = H.t; H.last = { x: p.x, z: p.z }; }
        const where = this._where(H.pid, p);
        const lostInCave = where === 'cave' && H.t - H.seenAt > BOUNTY.SEEN_CAVE_S;
        const d = Math.hypot(lead.x - p.x, lead.z - p.z);
        switch (H.phase) {
            case 'door': { // (at his house: they knock, they never break in)
                if (where !== 'home') { H.phase = 'track'; H.phaseT = 0; break; }
                const ward = this._wardOf(H.pid, p);
                if (ward && this._blackWard(H.pid) && H.rec.mage && Math.hypot(lead.x - ward.c.x, lead.z - ward.c.z) < ward.r + 14) {
                    // (a plainly black sphere — and they came for him: no doubt who he is; the wizards break it and fall on him. A blue one is never touched)
                    if (!H.breaking) { H.breaking = true; L._say(lead, HUNT_LINES.breakWard, 4); }
                    P.state = 'arrived';
                    if ((H.hitT = (H.hitT || 0) - dt) <= 0) {
                        H.hitT = BOUNTY.WARD_HIT_S;
                        for (const v of alive) {
                            const dx = v.x - ward.c.x, dz = v.z - ward.c.z, dl = Math.hypot(dx, dz) || 1;
                            v.mode = 'cast'; v.yaw = Math.atan2(dx, dz);
                            g.wards?.struck?.({ x: ward.c.x + dx / dl * ward.r, y: ward.c.y + 1.5, z: ward.c.z + dz / dl * ward.r }, 0.5, 'Bombardo', null);
                        }
                    }
                    if (!g.wards?.list?.has?.(ward.id)) this._attack(H, 'Защита пала! Взять его!');
                    break;
                }
                if (P.state === 'arrived' || Math.hypot(lead.x - P.dest.x, lead.z - P.dest.z) < P.dest.r + 2) {
                    P.state = 'arrived';
                    if ((H.knockT = (H.knockT || 0) - dt) <= 0) { H.knockT = 10; L._say(lead, pick(HUNT_LINES.knock).replace('{place}', H.rec.name), 4); g.sound?.playDoorKnock?.(lead); }
                    if ((H.waitT = (H.waitT || 0) + dt) > BOUNTY.KNOCK_S) { this._end(H, HUNT_LINES.leaveDoor); return; }
                }
                break;
            }
            case 'track': {
                if (lostInCave) { // (he ran into a cave out of their sight: they go to the last place they saw him, and give up there)
                    P.dest = { x: H.last.x, z: H.last.z, r: 6, into: null, name: 'след' };
                    if (Math.hypot(lead.x - H.last.x, lead.z - H.last.z) < 8) { this._end(H, HUNT_LINES.gaveUp); return; }
                    break;
                }
                if (where === 'home' && !sees) { const hm = this._homeOf(H.pid, p); if (hm) { H.home = hm; H.phase = 'door'; H.phaseT = 0; P.dest = { x: hm.x, z: hm.z, r: hm.r + 3, into: null, name: 'дом' }; P.state = 'go'; break; } }
                P.dest = { x: p.x, z: p.z, r: BOUNTY.FIND_R, into: null, name: 'охота' };
                if (P.state === 'arrived') P.state = 'go';
                if (d < BOUNTY.FIND_R + 4 && sees) {
                    if (H.peaceful) this._talk(H, lead);
                    else this._attack(H, pick(HUNT_LINES.attack).replace('{place}', H.rec.name));
                }
                break;
            }
            case 'talk': {
                P.state = 'arrived'; // (they stand before him)
                for (const v of alive) { v.yaw = Math.atan2(-(p.x - v.x), -(p.z - v.z)); }
                if (alive.some((v) => v.foe === H.pid) || P.cs.hostile.get(H.pid) > Date.now()) { this._attack(H, null); break; } // (he hit one of them)
                if (H.phaseT > BOUNTY.TALK_S || d > 40) this._attack(H, 'Молчишь? Тогда по-плохому!');
                break;
            }
            case 'fight': {
                if (lostInCave) { this._end(H, HUNT_LINES.gaveUp, true); return; }
                // (the last one left of several, hurt: he runs home to tell — the record is fresh, the place where he saw him remembered)
                if (H.P.members.length >= 2 && alive.length === 1 && (alive[0].hp < (alive[0].maxHp || alive[0].hp) * 0.6 || H.phaseT > 40)) { this._end(H, HUNT_LINES.report, true); return; }
                if (alive.every((v) => v.foe !== H.pid)) for (const v of alive) if (L._fights?.(v)) v.foe = H.pid; // (they don't give up the fight for a step aside)
                P.cs.hostile.set(H.pid, Date.now() + 120000);
                break;
            }
            default: break;
        }
    }

    _talk(H, lead) {
        const L = this.life;
        H.phase = 'talk'; H.phaseT = 0;
        H.P.state = 'arrived';
        H.fine = fineOf(H.rec);
        L._say(lead, HUNT_LINES.demand(H.rec.name, H.rec.kills, H.fine), 9);
        if (H.pid === this.game.localId) this.game.hud?.setVoice?.(`⚖️ Охотники за головами из «${H.rec.name}»: выкуп ${H.fine} монет. Скажите «заплачу» — или будет бой`, true);
        this._note(`мирный разговор: выкуп ${H.fine}`);
    }

    _attack(H, line) {
        const g = this.game, L = this.life, P = H.P;
        H.phase = 'fight'; H.phaseT = 0;
        P.state = 'go';
        P.cs.hostile.set(H.pid, Date.now() + 120000);
        g.travelers?.trouble?.(P, H.pid); // (they get down from their horses and fight — CastleLife / WizardFight)
        const lead = this._alive(H)[0];
        if (line && lead) L._say(lead, line, 4);
        this._note('бой');
    }

    /** The hunt is over: they go their way (as ordinary travellers far beyond). */
    _end(H, line, report = false) {
        const P = H.P, L = this.life;
        this.hunts.delete(H.pid);
        // (one of them got away and tells: the record is fresh again, and where they saw him is known)
        if (report && P.members.some((v) => !v.dead)) {
            const r = this.recs.get(H.pid)?.get(H.defId);
            if (r) { r.day = this.days; r.reported = true; r.lastSeen = { ...H.last }; }
        }
        P.hunt = null;
        for (const v of P.members) { v.hunter = null; if (v.foe === H.pid) v.foe = null; }
        P.cs.hostile.delete(H.pid);
        const lead = P.members.find((v) => !v.dead);
        if (lead && line) L?._say(lead, line, 4);
        if (lead) { const a = Math.random() * Math.PI * 2; P.dest = { x: lead.x + Math.cos(a) * 700, z: lead.z + Math.sin(a) * 700, r: 12, into: null }; P.state = 'go'; }
        this._note('охота окончена' + (line ? ': ' + line : ''));
    }

    // ---------------------------------------------------------------- words
    /** The hero's words to a hunter (CastleTalk._hear): the ransom. → the answer, or null. */
    hear(v, text) {
        const H = v?.hunter;
        if (!H || H.pid !== this.game.localId || H.phase !== 'talk') return null;
        const a = huntAnswer(text);
        if (a === 'refuse') { this._attack(H, null); return 'Как знаешь. Взять его!'; }
        if (a !== 'pay') return null;
        const g = this.game, have = g.inventory?.coins?.() ?? 0;
        if (have < H.fine || !g.inventory.spendCoins(H.fine)) { this._attack(H, null); return HUNT_LINES.noCoins(H.fine - have); }
        g.inventory._render?.();
        g.hud?.setVoice?.(`💰 Выкуп ${H.fine} монет отдан — «${H.rec.name}» больше не ищет вас`, true);
        this.recs.get(H.pid)?.delete(H.defId);
        this._end(H, null);
        return HUNT_LINES.paid;
    }

    // ---------------------------------------------------------------- save
    snapshot() {
        const m = this.recs.get(this.game.localId);
        if (!m || !m.size) return null;
        return { days: Math.round(this.days * 1000) / 1000, recs: Object.fromEntries([...m].map(([k, r]) => [k, { ...r }])) };
    }

    restore(s) {
        if (!s) return;
        const recs = s.recs || s; // (an older save: the records alone)
        if (s.recs) this.days = +s.days || 0;
        this.recs.set(this.game.localId, new Map(Object.entries(recs).map(([k, r]) => [k, { day: this.days, knowers: [], ...r }])));
    }

    dispose() { for (const H of [...this.hunts.values()]) this._end(H, null); }
}
