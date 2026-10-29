/**
 * GhostCastleLife.js — the Castle of Ghosts in the game: who has it in the land, its chests, who vanishes inside it, the achievement
 * (the blocks: world/GhostBuild.js; the places: world/GhostCastle.js; the rules and numbers: GhostRules.js; the ghosts: Ghosts.js).
 *
 * The author: «Его нельзя найти, пока у игрока нет зрения невидимого — он даже не генерируется в мире… В мультиплеере другие игроки просто проходят сквозь
 * замок, даже не видят его — для них пустое место, не взаимодействуют. Если они увидят, что игрок со зрением входит в замок — тот игрок пропадает (как бы невидимые
 * стены закрывают его внутри для тех, у кого нет способности)».
 *
 * How: each computer has its OWN land. `terrain.ghostSync(sees, x, z)` puts the castle's blocks into this computer's land while its hero sees the invisible
 * (SecondSight.js) and takes them out again when he does not (a death takes the sight): a computer without the sight has no blocks, no collisions, nothing drawn — an
 * empty place. A seer inside the castle's footprint is hidden from the ones who do not see it (his avatar is not drawn on their screens).
 *
 * What can go wrong (CLAUDE.md «а если»): the hero is INSIDE the footprint when the castle appears (he got the sight right there) — he is set down outside the
 * walls before the blocks come; sight lost inside (death) — the chests and the ghosts are put away with the castle; two seers — each has the castle in his own land,
 * each his own ghosts; a friend without sight inside the footprint — passes through it (an empty place for him) and the seer sees him walking through walls;
 * edits of a seer inside the castle do not reach the ones who do not see it (Builder.applyEdits); the hero in a duel / on the arena / on a ship / in space /
 * off the Earth — nothing is asked, and nothing of the castle is kept loaded beyond a few hundred metres (the chunks leave as all chunks do).
 */
import { seesInvisible, registerInvisibleStructure } from './Invisibles.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';
import { GHOST_CASTLE as GC } from './GhostRules.js';

export const GHOST_ACH = 'ghostCastle'; // the achievement (Achievements.ACHIEVEMENTS)

export class GhostCastleLife {
    constructor(game) {
        this.game = game;
        this.sees = false; // the local hero has the castle in his land (the flag the land follows)
        this.site = null; // the nearest shown castle within 140 m of the hero (footprint with a margin), or null
        this._t = 0;
        this._near = 0;
        this.log = []; // (tests) what happened
        registerInvisibleStructure({ id: 'ghostCastle', title: 'Замок призраков', at: (x, z) => !!this.data?.ghost?.insideAt(x, z) });
    }

    get data() { return this.game.world?.terrain?.data || null; }
    get view() { return this.game.world?.terrain || null; }
    get exists() { return !!this.data?.ghost; }

    _note(e) { this.log.push(e); if (this.log.length > 40) this.log.shift(); }

    /** May the local hero have the castle in his land right now (the world has it, he sees, he lives, he is on the Earth)? */
    _want() {
        const g = this.game;
        if (!this.exists || g.config?.map || g.config?.mode === 'test') return false;
        if (g.space?.offEarth) return false;
        if (g.isDeadLocal || g.combat?.dead) return false;
        return seesInvisible(g);
    }

    /** Is the point inside a castle that is in the land (its terrace, walls and stair), `m` metres of margin? */
    inside(pos, m = 0) { return !!this.data?.ghost?.insideAt(pos.x, pos.z, m); }

    /** The castle whose walls (the inner ±62 m) the point is in, or null: «in the castle» for the achievement and the ghosts. */
    within(pos) {
        const G = this.data?.ghost;
        const s = G?.insideAt(pos.x, pos.z, -(GC.HALF - 62));
        return s && pos.y > s.F - 4 ? s : null;
    }

    update(dt) {
        this._t -= dt;
        if (this._t > 0) return;
        this._t = 0.4;
        const g = this.game, d = this.data, v = this.view;
        if (!d?.ghost || !v) return;
        const p = g.character?.group?.position;
        if (!p) return;
        const want = this._want();
        // the castle comes in only when the cells round the hero are known and he is not inside its footprint (he would be in the stone)
        if (want && !d.ghost.on) {
            v.ghostAsk?.(p.x, p.z);
            if (!d.ghost.has9(p.x, p.z) && v._workers) return;
            const s = d.ghost.near(p.x, p.z, 0)[0];
            if (s && s.covers(p.x, p.z, 1) && !this._eject(s, p)) return;
        }
        v.ghostSync(want, p.x, p.z);
        if (this.sees !== want) { this.sees = want; this._note({ ev: want ? 'on' : 'off' }); if (!want) this._putAway(); }
        if (!want && this._hazeK) { this._hazeK = 0; this.game.world?.setGhostHaze?.(0); }
        // the cells round the seers on the other computers are wanted too: to hide them when they walk into a castle I do not see
        if (!d.ghost.on && g.remotes?.size) for (const r of g.remotes.values()) if (r.sees && r.position) v.ghostAsk?.(r.position.x, r.position.z);
        this._site(p);
        this._haze(p);
        this._hide();
        this._deeds(p);
    }

    /** The hero is set down outside the walls (the nearest side, a few metres from the footprint's edge, on the ground there). */
    _eject(s, p) {
        const g = this.game, d = this.data;
        if (!g.character || g.flight?.active) return true; // (a hero in flight over it: the castle comes in under him — he is above the spires or he lands on them)
        const m = GC.HALF + 4;
        const dx = p.x - s.x, dz = p.z - s.z;
        let x = p.x, z = p.z;
        if (Math.abs(dx) > Math.abs(dz)) x = s.x + Math.sign(dx || 1) * m; else z = s.z + Math.sign(dz || 1) * m;
        const y = g.collision?.groundY ? g.collision.groundY(x, z) : d.heightAt(Math.round(x), Math.round(z));
        if (d.landMade && !d.landMade(x, z)) return false; // (the ground there is not made yet: not in a frame)
        g.character.group.position.set(x, y + PLAYER_GROUND_OFFSET + 0.1, z);
        g.character.velocity?.set?.(0, 0, 0);
        this._note({ ev: 'eject' });
        return true;
    }

    /** The nearest castle in the land within 140 m: what the ghosts read their places from. */
    _site(p) {
        const G = this.data?.ghost;
        if (!G?.on) { this.site = null; return; }
        this.site = this.data.ghostNear(p.x, p.z, 140)[0] || null;
    }

    /** The haze of the place (a cold mist round the castle, thickest inside): only for a hero who has the castle in his land. */
    _haze(p) {
        const w = this.game.world, s = this.site;
        let k = 0;
        if (s) {
            const d = Math.max(Math.abs(p.x - s.x), Math.abs(p.z - s.z)); // (the square's distance from the middle: 0…96 in the footprint)
            k = d <= GC.TERRACE ? 1 : Math.max(0, 1 - (d - GC.TERRACE) / 150);
        }
        this._hazeK = (this._hazeK || 0) + (k - (this._hazeK || 0)) * 0.35; // (it comes and goes slowly: the check is 2.5 times a second)
        w?.setGhostHaze?.(this._hazeK < 0.02 ? 0 : this._hazeK);
    }

    /** The castle goes out of the land (the sight is gone): its chests are put away with it (what was opened is remembered by id). */
    _putAway() {
        const g = this.game;
        if (!g.chests) return;
        for (let i = g.chests.length - 1; i >= 0; i--) {
            const c = g.chests[i];
            if (typeof c.cave !== 'string' || !c.cave.startsWith('gc')) continue;
            if (c.isOpen) (g._openedChests = g._openedChests || new Set()).add(c.id);
            if (c.boxId != null) g.collision?.removeBox(c.boxId);
            g._caveChests?.delete(c.cave);
            c.dispose();
            g.chests.splice(i, 1);
        }
        this.site = null;
    }

    /** Seers who walk into a castle that THIS computer does not see are not drawn here: «as if invisible walls shut them in». */
    _hide() {
        const g = this.game, G = this.data?.ghost;
        if (!g.remotes?.size) return;
        for (const r of g.remotes.values()) {
            if (!r?.character?.group || !r.position) continue;
            let hide = false;
            if (r.sees && !r.dead && !G?.on) hide = !!G?.list().some((s) => s.covers(r.position.x, r.position.z, 0) && r.position.y > s.lo - 6);
            if (hide === !!r.ghostHidden) continue;
            r.ghostHidden = hide;
            r.character.group.visible = !hide && !r.dead;
        }
    }

    /** The first time the hero stands inside the walls: the achievement. */
    _deeds(p) {
        const g = this.game;
        if (!this.site || g.achievements?.done?.has(GHOST_ACH)) return;
        if (this.within(p)) g.achievements?.gain?.(GHOST_ACH);
    }

    dispose() { this._putAway(); }
}
