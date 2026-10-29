/**
 * Invisibles.js — the world of the invisible: ONE registry for everything that only a hero who sees the invisible can see
 * (the author: «общий признак `invisible` / "мир невидимого" в одном реестре; будущие невидимые существа учитывай заранее»).
 *
 * Who is in it now:
 *   player    — a player under «Invisibility» (Invisibility.js): to a seer he is drawn see-through (not hidden);
 *   spencer   — the bird of Spencer (SpencerBirds.js), always invisible; pink and glowing;
 *   beslan    — Beslan's grass (BeslanGrass.js, InvisibleFlora.js), a plant that grows in drifts;
 *   items     — Spencer's feather and a sheaf of Beslan's grass lying on the ground (ITEM_KINDS);
 *   (later)   — the Castle of Ghosts and its ghosts: `registerInvisibleStructure` (a hook only; the castle is another task).
 *
 * Who sees: `seesInvisible(game, viewer)` — the hero who has gone through the pentagram of seeing (SecondSight.js: «Pentagranium
 * Spectris»), for ever (until death: a death takes it away; «Give Me My Power» brings it back). Others do not see them at all (in a
 * game with friends each one's own computer draws them only for the one who sees).
 *
 * What a seer sees: every invisible thing stays ~15 % transparent (alpha `GHOST.ALPHA` 0.85 with a slight shimmer, as if from another
 * world). A new invisible kind registers itself here (`registerInvisible`) and draws itself with `ghostAlpha`.
 *
 * ON WHOM / ON WHAT (CLAUDE.md): see INVISIBLE_WORLD below (who sees, who is seen by whom, what the registry does to everyone else).
 */

/** The ghost look: how see-through (the author: ~15 %) and how much it shimmers. */
export const GHOST = { ALPHA: 0.85, SHIMMER: 0.04 };

/** The look of "another world" at time `t` (s) for a thing with its own `seed`: an alpha a little under / over 0.85. */
export const ghostAlpha = (t, seed = 0) => GHOST.ALPHA + GHOST.SHIMMER * Math.sin(t * 2.3 + seed * 7.1) * Math.cos(t * 0.9 + seed);

/** Loose things that are invisible too (their kinds): only a seer sees them lying on the ground. */
export const ITEM_KINDS = new Set(['spencerFeather', 'beslanGrass']);
export const isGhostItem = (it) => !!it && ITEM_KINDS.has(it.kind);

const KINDS = new Map();
/** A kind of the invisible world registers itself: id, a Russian name, what it is (for the codex) and `does`: how the registry treats it. */
export function registerInvisible(id, def) { KINDS.set(id, { id, ...def }); return KINDS.get(id); }
export const invisibleKinds = () => [...KINDS.keys()];
export const invisibleInfo = (id) => KINDS.get(id) || null;

registerInvisible('player', { ru: 'игрок под «Invisibility»', does: 'ghost', why: 'видящий видит его полупрозрачным (на ~15 %), остальные — не видят' });
registerInvisible('spencer', { ru: 'птичка Спенсера', does: 'ghost', why: 'всегда невидима; видящему — розовая и светящаяся' });
registerInvisible('beslan', { ru: 'трава Беслана', does: 'ghost', why: 'растёт для видящего; остальным — просто пустое место' });
registerInvisible('items', { ru: 'перо птички Спенсера, пучок травы Беслана', does: 'ghost', why: 'на земле видны только видящему; в руке и в сумке — как обычные вещи' });
registerInvisible('ghost', { ru: 'призрак Замка призраков', does: 'ghost', why: 'живёт только в Замке призраков и только для видящего: у каждого видящего на его компьютере свои призраки (Ghosts.js); остальные не видят ни замка, ни призраков' });

// ------------------------------------------------------------ structures (a hook for the Castle of Ghosts: another task)
const STRUCTS = new Map();
/**
 * A structure of the invisible world (the Castle of Ghosts: huge, black, spired, 15 % transparent; found only by a seer; in a game with friends the
 * others pass through it as through empty air). `def`: { id, title, at(x, z) → bool (is the point inside it), … }. Only the registry is here.
 */
export function registerInvisibleStructure(def) { if (def?.id) STRUCTS.set(def.id, def); return def; }
export const invisibleStructures = () => [...STRUCTS.values()];
/** Is the point inside a structure of the invisible world (nobody but a seer feels it)? */
export const invisibleStructureAt = (x, z) => [...STRUCTS.values()].find((s) => s.at?.(x, z)) || null;

// ------------------------------------------------------------ who sees
/**
 * Does this viewer see the invisible? `viewer`: 'local' (me) or a player's id. A remote player's flag arrives with his state (RemoteAvatar.sees).
 */
export function seesInvisible(game, viewer = 'local') {
    if (!game) return false;
    if (viewer === 'local' || viewer === game.localId) return !!game.sight?.sees;
    return !!game.remotes?.get?.(viewer)?.sees;
}

/** The seers among the players: [{id, pos}] (mine first) — where birds and grass are worth making. */
export function seers(game) {
    const out = [];
    if (game?.sight?.sees && game.character?.group?.position && !game.isDeadLocal && !game.combat?.dead) out.push({ id: game.localId, pos: game.character.group.position });
    for (const [id, r] of game?.remotes || []) if (r.sees && !r.dead && r.position) out.push({ id, pos: r.position });
    return out;
}

/**
 * Makes `root` see-through: its materials are cloned ONCE (the originals are shared with other creatures and must never turn faint for them)
 * and set to `alpha`. Returns { set(alpha), restore() }.
 */
export function ghostify(root, alpha = GHOST.ALPHA) {
    const list = [], clones = new Map();
    root?.traverse?.((o) => {
        if (!o.material) return;
        const one = (m) => {
            let c = clones.get(m);
            if (!c) { c = m.clone(); c.transparent = true; c.depthWrite = false; c.userData.base = m.opacity ?? 1; clones.set(m, c); }
            return c;
        };
        const orig = o.material;
        o.material = Array.isArray(orig) ? orig.map(one) : one(orig);
        list.push({ o, orig });
    });
    const set = (a) => { for (const c of clones.values()) c.opacity = (c.userData.base ?? 1) * a; };
    set(alpha);
    return {
        set,
        restore() { for (const f of list) f.o.material = f.orig; for (const c of clones.values()) c.dispose(); clones.clear(); list.length = 0; },
    };
}

/** ON WHOM / ON WHAT: what the world of the invisible is to each kind of creature (CLAUDE.md). `does`: sees | none | ghost. */
export const INVISIBLE_WORLD = {
    me: { does: 'sees', why: 'герой, прошедший пентаграмму видения невидимых («Pentagranium Spectris»), видит всё невидимое до смерти; смерть забирает, «Give Me My Power» возвращает' },
    players: { does: 'sees', why: 'у каждого игрока своё зрение на его компьютере: видит тот, кто прошёл пентаграмму; остальные не видят птичек, траву и перья' },
    zombies: { does: 'none', why: 'зомби невидимого не замечают и не делают разницы' },
    castlePeople: { does: 'none', why: 'жители не видят невидимого мира; невидимого игрока они и так не видят (Invisibility)' },
    animals: { does: 'none', why: 'животные не замечают птичек и траву' },
    sailors: { does: 'none', why: 'моряки не видят' },
    spider: { does: 'none', why: 'паучиха видит игрока под «Invisibility» (она босс), но невидимых птичек и траву — нет' },
    livingTrees: { does: 'none', why: 'не замечают' },
    bookBirds: { does: 'none', why: 'книги-птицы птичек Спенсера не замечают' },
    dragon: { does: 'none', why: 'драконы не видят невидимого мира' },
    iceCastle: { does: 'none', why: 'не видят' },
    phoenix: { does: 'none', why: 'феникс не видит птичек Спенсера' },
    owl: { does: 'none', why: 'сова не видит невидимого' },
    gargoyle: { does: 'none', why: 'не видят' },
    items: { does: 'ghost', why: 'перо и трава на земле видны только видящему' },
    ghosts: { does: 'ghost', why: 'призраки Замка призраков видны и слышны только видящему (у каждого — свои, на его компьютере, по сети не идут); пугают, редко пролетают сквозь видящего (−1 ХП и холод); жители, звери и другие существа их не видят' },
    structures: { does: 'ghost', why: 'невидимые постройки (Замок призраков — отдельная задача): реестр registerInvisibleStructure; видит только видящий, другие игроки проходят сквозь' },
};
