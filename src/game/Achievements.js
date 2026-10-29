/**
 * Achievements.js — the player's achievements («ачивки») and the status «Высший маг».
 *
 * Seven deeds (ACHIEVEMENTS; the last one is not a boss: to find the Castle of Ghosts and walk in — GhostCastleLife._deeds): kill a castle's king, the Ice Queen, the giant spider, a dragon,
 * Captain Black Moustache (the pirate on his black ship), and destroy a wizards' tower (its Master killed AND the tower itself really pulled down —
 * TOWER.LEFT: no more than a third of its walls still standing).
 *   • Each one: + to the mana maximum by its own number (ACHIEVEMENTS `mana` — the author: the king
 *     +50, the Ice Queen +100, the spider +100, a dragon +150, a tower +200, Captain Black Moustache
 *     +75) and +15 % to how fast
 *     the mana comes back (ACH.REGEN).
 *   • All of them: the status «Высший маг» — +1000 more to the maximum, +100 % more to the speed,
 *     and the High Mage's suit (ArmorTypes.makeArchmageSuit): it comes into a slot (or at the
 *     feet) with a golden flash; put on by hand like any robe; every spell does 40 % less harm.
 *   • Death takes them (the author: «смерть их забирает»): all the achievements, their mana cells,
 *     their quicker mana and «Высший маг» go (onDeath) — as the mana grown with practice does
 *     (Mana.onDeath). They lie in the body (Legacy.js: its owner takes them back) or are won again by
 *     beating the bosses again. The High Mage's suit is given once only: on death it drops by the
 *     body as any thing (Death.takeEverything); only a High Mage can put it on (Armor.js).
 *     They live with the player (WorldSave.playerSnapshot → `ach`), as the mana and the things do.
 *
 * Who gets it (the author: «убийство Королевы можно втроём, и будет считаться всем» — the same
 * rule for all of them): every player who took part — struck it / hit it with a spell in the last
 * ACH.WINDOW (60 s) before its death, struck the last blow, or was near (ACH.NEAR m) and
 * fighting there (struck any castle person / boss in the last 60 s). For a tower: whoever pulled
 * down its blocks (in the last TOWER.WINDOW) and whoever took part in killing its Master.
 *
 * The host decides (it sees every blow): `hit(kind, key, by)` on each blow, `killed(kind, key, by,
 * pos)` on the death (Spider, Dragons, CastleLife — the king, the Master, the Ice Queen), tower
 * blocks via `towerWrecked(def, by)` (CastleLife.damaged). A guest is told by 'achc'; each player's
 * own computer counts it and tells the others ('ach' {a: 'got'}) — «X получил ачивку».
 *
 * The Ice Queen: IceQueen.js calls `hit('iceQueen', …)` / `killed('iceQueen', …)`. Captain Black
 * Moustache (made in another work): counted as soon as he is a sailor with `blackbeard: true` (or
 * `boss: 'blackbeard'`) — Sailors.js — or his own code calls `hit/killed('blackbeard', id, by, pos)`.
 * Every new boss: a line in ACHIEVEMENTS (CLAUDE.md: every boss is an achievement).
 */

import { makeArchmageSuit } from './ArmorTypes.js';

export const ACH = {
    REGEN: 0.15, // + to the mana regeneration speed for each (15 %)
    HIGH_MANA: 1000, // «Высший маг»: + this much more (the author: 1000)
    HIGH_REGEN: 1.0, // … and +100 % more speed
    WINDOW: 60000, // ms: a blow this recent counts as taking part
    NEAR: 40, // m: near the death and fighting there — taking part too
};

export const TOWER = {
    LEFT: 0.35, // the tower counts as destroyed when no more than this share of its walls stands
    WINDOW: 30 * 60000, // ms: pulling its blocks down this recently counts as taking part
};

export const ACHIEVEMENTS = [
    // mana: + to the mana maximum for it (the rewards' table: change here)
    { id: 'king', mana: 50, icon: '👑', title: 'Убить короля', desc: 'Убить короля (или королеву) любого замка' },
    { id: 'iceQueen', mana: 100, icon: '❄️', title: 'Убить Ледяную Королеву', desc: 'Победить Снежную (Ледяную) Королеву в её ледяном замке' },
    { id: 'spider', mana: 100, icon: '🕷️', title: 'Убить паучиху', desc: 'Победить гигантскую паучиху' },
    { id: 'dragon', mana: 150, icon: '🐉', title: 'Убить дракона', desc: 'Победить любого дракона' },
    { id: 'blackbeard', mana: 75, icon: '🏴‍☠️', title: 'Убить капитана Чёрные Усы', desc: 'Победить пирата капитана Чёрные Усы на его чёрном корабле' },
    { id: 'tower', mana: 200, icon: '🏚️', title: 'Уничтожить башню волшебников', desc: 'Убить Мастера башни и по-настоящему разрушить саму башню (снести не меньше двух третей её стен)' },
    { id: 'ghostCastle', mana: 100, icon: '👻', title: 'Замок призраков', desc: 'Найти замок призраков (его видит только тот, кто видит невидимое) и войти в его стены' },
];
export const ACH_IDS = ACHIEVEMENTS.map((a) => a.id);
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** What these achievements (ids) give: {mana: + to the maximum, regen: × the speed, high}. */
export function achBonus(done = []) {
    const ids = ACH_IDS.filter((id) => [...done].includes(id));
    const high = ids.length === ACH_IDS.length;
    const mana = ids.reduce((s, id) => s + ACH_BY_ID[id].mana, 0) + (high ? ACH.HIGH_MANA : 0);
    return { mana, regen: 1 + ids.length * ACH.REGEN + (high ? ACH.HIGH_REGEN : 0), high };
}

/**
 * The points of a wizards' tower's walls the check looks at: the drum (r 15…17 m round the
 * tower's centre, the walls between) at 48 angles, every 4th layer from the ground floor up.
 * → [[ix, L, iz]] (world block cells).
 */
export function towerSamples(def) {
    const out = [];
    const F = def.F | 0;
    for (let l = 1; l <= 37; l += 4) {
        for (let k = 0; k < 48; k++) {
            const a = (k + 0.5) / 48 * Math.PI * 2;
            out.push([Math.round(def.x + Math.cos(a) * 16), F + 1 + l, Math.round(def.z + Math.sin(a) * 16)]);
        }
    }
    return out;
}

/**
 * How much of the tower's walls still stands, 0…1 (null: its ground is not loaded here).
 * `get(ix, L, iz)` → a block (0 air), `loaded(ix, iz)` → is that ground here.
 * The windows and doors are counted out: the share is of what stood when it was whole (`whole`:
 * a whole tower measured 0.954 on every seed tried).
 */
export function towerLeft(def, get, loaded = () => true, whole = 0.95) {
    let n = 0, solid = 0;
    for (const [x, L, z] of towerSamples(def)) {
        if (!loaded(x, z)) return null;
        n++;
        const b = get(x, L, z);
        if (b && b !== WATER) solid++;
    }
    return n ? Math.min(1, solid / n / whole) : null;
}
const WATER = 8; // (Terrain BLOCK.WATER: water poured in is not a wall)

/** Players who took part: the blows in the window, the last blow, and the fighters near. */
export function participants({ hits, by = null, now = Date.now(), near = [], window = ACH.WINDOW }) {
    const out = new Set();
    for (const [id, t] of hits || []) if (now - t <= window) out.add(id);
    if (by != null) out.add(by);
    for (const id of near) out.add(id);
    return out;
}

export class Achievements {
    constructor(game) {
        this.game = game;
        this.done = new Set(); // my achievements (ids)
        this.suitGiven = false; // the High Mage's suit came to me once (never again)
        this._bonusOn = { mana: 0 };
        this.hits = new Map(); // (host) 'kind:key' → Map(player → last blow ms)
        this.fighting = new Map(); // (host) player → ms of the last blow on anyone worth fighting
        this.towers = new Map(); // (host) tower site id → {wreck: Map(player → ms), master: Set|null, done}
        this.remoteHigh = new Set(); // other players with the status
        this.remoteCount = new Map(); // other players → how many achievements
        this._towerT = new Map();
        this._titleN = 0;
        this.log = []; // (tests)
    }

    /** Creative (and the test ground): no achievements at all — it is all for trying things (the author). */
    get off() { const m = this.game.config?.mode; return m === 'creative' || m === 'test'; }

    get count() { return this.done.size; }
    get high() { return ACH_IDS.every((id) => this.done.has(id)); }
    /** × the mana regeneration (Combat). */
    get regenK() { return achBonus(this.done).regen; }

    // ------------------------------------------------------------ the host: who took part
    _isPlayer(id) {
        const g = this.game;
        return id != null && (id === g.localId || id === 'local' || !!g.remotes?.has?.(id));
    }
    _id(id) { return id === 'local' ? this.game.localId ?? 'local' : id; }
    get _auth() { return this.game.authority ?? true; }

    /** A blow / a spell on something worth an achievement (or on anyone in that fight). */
    hit(kind, key, by) {
        if (!this._isPlayer(by)) return;
        by = this._id(by);
        const now = Date.now();
        this.fighting.set(by, now);
        if (!kind) return;
        const k = kind + ':' + key;
        let m = this.hits.get(k);
        if (!m) this.hits.set(k, (m = new Map()));
        m.set(by, now);
    }

    /** Fighting there (a blow on any castle person, a boss…): counts for «near and fighting». */
    fought(by) { if (this._isPlayer(by)) this.fighting.set(this._id(by), Date.now()); }

    _playerPos(id) {
        const g = this.game;
        if (id === g.localId || id === 'local') return g.character?.group?.position || null;
        return g.remotes?.get?.(id)?.position || null;
    }

    _nearFighters(pos, now) {
        const out = [];
        if (!pos) return out;
        for (const [id, t] of this.fighting) {
            if (now - t > ACH.WINDOW) continue;
            const p = this._playerPos(id);
            if (p && Math.hypot(p.x - pos.x, p.z - pos.z) <= ACH.NEAR && Math.abs((p.y ?? 0) - (pos.y ?? 0)) < ACH.NEAR) out.push(id);
        }
        return out;
    }

    /** Who took part in the death of `kind:key` (and forget its blows). */
    _takers(kind, key, by, pos) {
        const k = kind + ':' + key, now = Date.now();
        const set = participants({ hits: this.hits.get(k), by: this._isPlayer(by) ? this._id(by) : null, now, near: this._nearFighters(pos, now) });
        this.hits.delete(k);
        return set;
    }

    /** (host) Something worth an achievement died: everyone who took part gets it. */
    killed(kind, key, by, pos = null) {
        if (!ACH_BY_ID[kind] || kind === 'tower' || !this._auth) return [];
        const ids = [...this._takers(kind, key, by, pos)];
        this.award(kind, ids);
        return ids;
    }

    /** (host) Give `kind` to these players: mine here, the others' told to their computers. */
    award(kind, ids) {
        const g = this.game;
        this.log.push({ kind, ids: [...ids] });
        for (const id of ids) {
            if (id === g.localId || id === 'local') this.gain(kind);
            else if (g.remotes?.has?.(id)) g.sync?.achCredit?.(id, kind);
        }
    }

    // ------------------------------------------------------------ the host: a wizards' tower
    _tower(def) {
        let t = this.towers.get(def.id);
        if (!t) this.towers.set(def.id, (t = { wreck: new Map(), master: null, masterDead: false, done: false }));
        return t;
    }

    /** (host, CastleLife.damaged) a player pulled blocks of a wizards' tower down. */
    towerWrecked(def, by) {
        if (!def || !this._isPlayer(by)) return;
        const t = this._tower(def);
        t.wreck.set(this._id(by), Date.now());
        // (looked at no more than once a second: a blast breaks many blocks in a row)
        const now = Date.now();
        if (now - (this._towerT.get(def.id) || 0) < 1000) { this._towerSoon = def; return; }
        this._towerT.set(def.id, now);
        this.checkTower(def);
    }

    /** (host, CastleLife._die) the tower's Master killed: who took part is kept until the tower falls. */
    masterKilled(def, key, by, pos) {
        if (!def || !this._auth) return;
        const t = this._tower(def);
        t.masterDead = true;
        const ids = this._takers('master', key, by, pos);
        t.master = new Set([...(t.master || []), ...ids]);
        this.checkTower(def);
    }

    /** Is the Master of this tower dead (now or before: the castle's saved state)? */
    _masterDead(def) {
        if (this._tower(def).masterDead) return true;
        const st = this.game.castleLife?.states?.get?.(def.id);
        return !!st?.killed?.has?.(0); // (WizardAI.wizardRoster: the Master is the tower's person 0)
    }

    /** How much of the tower stands here (null: not loaded). */
    towerLeftHere(def) {
        const data = this.game.world?.terrain?.data;
        if (!data) return null;
        return towerLeft(def, (x, L, z) => data.get(x, L, z), (x, z) => data.hasChunk?.(x >> 5, z >> 5) ?? true); // (32-block chunks: Terrain.CHUNK)
    }

    /** Both done (the Master dead, the tower down)? → the achievement to all who took part. */
    checkTower(def, left = undefined) {
        if (!this._auth) return false;
        const t = this._tower(def);
        if (t.done || !this._masterDead(def)) return false;
        const share = left === undefined ? this.towerLeftHere(def) : left;
        if (share == null || share > TOWER.LEFT) return false;
        t.done = true;
        const now = Date.now();
        const ids = new Set(t.master || []);
        for (const [id, at] of t.wreck) if (now - at <= TOWER.WINDOW) ids.add(id);
        this.award('tower', [...ids]);
        this.game.hud?.notify?.(`🏚️ Башня волшебников «${def.name || ''}» уничтожена`);
        return true;
    }

    // ------------------------------------------------------------ mine
    /**
     * An achievement is mine (on my own computer): the bonus, a golden banner, a sound; the
     * others are told. All of them: «Высший маг».
     * @returns {boolean} new
     */
    gain(kind, { quiet = false } = {}) {
        if (!ACH_BY_ID[kind] || this.done.has(kind) || this.off) return false;
        const wasHigh = this.high;
        this.done.add(kind);
        this._applyBonus();
        const g = this.game;
        if (!quiet) {
            const a = ACH_BY_ID[kind];
            this._banner(`${a.icon} Ачивка: ${a.title}`, `+${a.mana} ячеек маны · мана восстанавливается на ${Math.round(ACH.REGEN * 100)}% быстрее · ${this.count} из ${ACH_IDS.length}`);
            g.sound?.playMagic?.(null, 1);
            this._sparkle(0xffd36e, 40);
            g.sync?.ach?.({ a: 'got', k: kind, n: this.count, hi: this.high ? 1 : 0 });
        }
        this._mirror();
        if (this.high && !wasHigh) this._becameHigh(quiet);
        return true;
    }

    /** The bonus of the achievements on the mana bar (only what is new: never twice; taken off when they are lost). */
    _applyBonus() {
        const c = this.game.combat;
        const want = achBonus(this.done).mana;
        const dm = want - this._bonusOn.mana;
        if (dm > 0 && c) {
            if (c.addMaxFatigue) c.addMaxFatigue(dm);
            else { c.maxFatigue = (c.maxFatigue || 30) + dm; c.fatigue = Math.min(c.maxFatigue, (c.fatigue || 0) + dm); }
            c._hudKey = '';
        } else if (dm < 0 && c) {
            c.maxFatigue = Math.max(1, (c.maxFatigue || 30) + dm);
            c.fatigue = Math.min(c.fatigue || 0, c.maxFatigue);
            c._hudKey = '';
        }
        if (c || !dm) this._bonusOn.mana = want;
    }

    /** I died: the achievements are lost — their cells, their quicker mana, «Высший маг» (won again by beating the bosses again). */
    onDeath() {
        if (!this.done.size) return;
        this.done.clear();
        this._applyBonus();
        this._mirror();
        this.resend(); // (the others: no more «Высший маг» over my name)
    }

    _becameHigh(quiet) {
        const g = this.game;
        if (!quiet) {
            this._banner('🌟 Вы — Высший маг!', `+${ACH.HIGH_MANA} ячеек маны · восстановление ещё на ${Math.round(ACH.HIGH_REGEN * 100)}% быстрее · костюм Высшего мага`, true);
            this._sparkle(0xfff2b0, 90);
            const p = this._myPos(1.2);
            if (p) { g.fx?.lightFlash?.(p, 0xffd36e, 3, 0.6, 18); g.sound?.playHouseDone?.(p); } // (a great chord, here)
        }
        if (!this.suitGiven) this._giveSuit(quiet);
    }

    /** The High Mage's suit: into a slot (no room — at the feet), with a golden flash. */
    _giveSuit(quiet = false) {
        const g = this.game;
        const it = makeArchmageSuit();
        this.suitGiven = true;
        if (g.armor?._stow) g.armor._stow(it); else g.inventory?.storeItem?.(it);
        g.inventory?._render?.();
        if (!quiet) {
            this._sparkle(0xffe08a, 60);
            g.hud?.setVoice?.('🌟 Костюм Высшего мага у вас! Возьмите его в руку и приложите к груди — он наденется', true);
        }
        this._mirror();
    }

    _myPos(up = 0) {
        const p = this.game.character?.group?.position;
        return p?.clone ? p.clone().setY(p.y + up) : null; // (no THREE here: node-testable — the hero's own vector)
    }

    _sparkle(color, n) {
        const g = this.game, ch = g.character?.group?.position;
        if (!g.fx?.spark || !ch?.clone) return;
        const _v = (this._v ||= ch.clone()), _v2 = (this._v2 ||= ch.clone());
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 6, r = 0.6 + (i % 5) * 0.12;
            g.fx.spark(_v.set(ch.x + Math.cos(a) * (r + 0.4), ch.y + 0.1 + i / n * 1.6, ch.z + Math.sin(a) * (r + 0.4)), i % 3 ? color : 0xffffff, 0.05, _v2.set(Math.cos(a) * 0.6, 1.5 + Math.random(), Math.sin(a) * 0.6), 1.2);
        }
    }

    /** The golden banner in the middle of the screen (an action of the player's: worth showing). */
    _banner(title, sub, big = false) {
        const g = this.game;
        if (typeof document === 'undefined') { g.hud?.notify?.(`${title} — ${sub}`); return; }
        let el = document.getElementById('ach-banner');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ach-banner';
            document.body.appendChild(el);
        }
        el.className = big ? 'big' : '';
        el.innerHTML = `<div class="ach-t">${title}</div><div class="ach-s">${sub}</div>`;
        el.classList.remove('show');
        void el.offsetWidth; // (the animation again)
        el.classList.add('show');
        clearTimeout(this._bannerT);
        this._bannerT = setTimeout(() => el.classList.remove('show'), big ? 7000 : 5000);
    }

    // ------------------------------------------------------------ the network
    /** (a guest) the host says: this achievement is mine. */
    onCredit(kind) { this.gain(String(kind)); }

    /** Tell the others how many I have (a newcomer: on joining). */
    resend() { this.game.sync?.ach?.({ a: 'state', n: this.count, hi: this.high ? 1 : 0 }); }

    onNet(m, from) {
        const g = this.game;
        if (!from || from === g.localId) return;
        const hi = !!m.hi;
        this.remoteCount.set(from, Math.max(0, Math.min(ACH_IDS.length, m.n | 0)));
        if (hi) this.remoteHigh.add(from); else this.remoteHigh.delete(from);
        g.remotes?.get?.(from)?.setTitle?.(hi ? 'Высший маг' : null);
        if (m.a === 'got' && ACH_BY_ID[m.k]) {
            const name = g.playerName?.(from) || 'Игрок';
            g.hud?.notify?.(`🏆 ${name} получил ачивку «${ACH_BY_ID[m.k].title}»${hi ? ' — и стал Высшим магом! 🌟' : ''}`);
        }
    }

    /** Every frame (cheap): a tower whose last blocks fell within the second is looked at again. */
    update() {
        // (a title told before the avatar was made: put on it — every ~2 s, cheap)
        if (this.remoteHigh.size && ++this._titleN % 120 === 0) for (const id of this.remoteHigh) this.game.remotes?.get?.(id)?.setTitle?.('Высший маг');
        if (!this._towerSoon) return;
        const def = this._towerSoon;
        if (Date.now() - (this._towerT.get(def.id) || 0) < 1000) return;
        this._towerSoon = null;
        this._towerT.set(def.id, Date.now());
        this.checkTower(def);
    }

    // ------------------------------------------------------------ the save
    snapshot() { return { done: [...this.done], suit: this.suitGiven }; }

    restore(s) {
        if (!s || this.off) return;
        const wasHigh = this.high;
        for (const k of Array.isArray(s.done) ? s.done : []) if (ACH_BY_ID[k]) this.done.add(k);
        if (s.suit) this.suitGiven = true;
        this._applyBonus();
        if (this.high && !wasHigh && !this.suitGiven) this._giveSuit(true);
        this._mirror();
    }

    /** (the main menu shows the last world's achievements) */
    _mirror() {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem('zns-achievements', JSON.stringify({ world: this.game.config?.worldName || this.game.keeper?.name || '', done: [...this.done] }));
        } catch (e) { /* (no storage: the menu just shows the list) */ }
    }
}

/** The list for the menus (pause, main): done or not, what each gave. */
export function achievementsHtml(done = new Set(), { world = '' } = {}) {
    const n = ACH_IDS.filter((id) => done.has(id)).length;
    const high = n === ACH_IDS.length;
    const b = achBonus(done);
    const rows = ACHIEVEMENTS.map((a) => {
        const ok = done.has(a.id);
        return `<div class="ach-row${ok ? ' done' : ''}"><span class="ach-ic">${ok ? a.icon : '🔒'}</span><div class="ach-body"><b>${a.title}</b><span>${a.desc}</span>`
            + `<span class="ach-gift">${ok ? '✅ Получено: ' : 'Даст: '}+${a.mana} ячеек маны, восстановление +${Math.round(ACH.REGEN * 100)}%</span></div></div>`;
    }).join('');
    return `<div class="ach-head">🏆 Ачивки: <b>${n} из ${ACH_IDS.length}</b>${world ? ` <span class="ach-world">(мир «${world}»)</span>` : ''}</div>`
        + `<div class="ach-sum">Сейчас дают: +${b.mana} ячеек маны, восстановление ×${b.regen.toFixed(2).replace(/\.?0+$/, '')}. Смерть их не отнимает.</div>`
        + rows
        + `<div class="ach-row high${high ? ' done' : ''}"><span class="ach-ic">${high ? '🌟' : '✨'}</span><div class="ach-body"><b>Высший маг</b><span>Все ачивки: ещё +${ACH.HIGH_MANA} ячеек маны, восстановление ещё на ${Math.round(ACH.HIGH_REGEN * 100)}% быстрее и костюм Высшего мага (любое заклинание ранит на 40% слабее)</span><span class="ach-gift">${high ? '✅ Получено' : 'Нужны все'}</span></div></div>`;
}
