/**
 * MagicPack.js — the golden MAGIC backpack: a bottomless bag for what does not fit the cells.
 *
 * (The author: «вещи, которые не зашли в основной интерфейс, кладутся туда; в интерфейсе их не видно; подсказка, что положилось в магический
 *  рюкзак. Носить как обычный. Достать: снять, кинуть на землю и сказать «Акцио» и название — предмет приземлится в руку; «Акцио» без названия —
 *  рюкзак в руку; нет такого предмета — ничего, подсказка «такого предмета нет».»)
 *
 * It is an ordinary backpack item with `magic: true` and `store: [items]` (so it is worn, thrown, dropped at death, saved and sold like one).
 *   - Wearing it adds no cells. Putting a thing in: take it in a hand and put that hand BEHIND THE BACK for a moment (`Items._stash`) — never by itself, never through
 *     the ordinary interface (the author 06.11: «чтобы положить вещь, нужно именно потянуться назад, а не в обычный интерфейс»).
 *   - Taking out: the pack lies on the ground near me, I say «Акцио <вещь>» → that thing flies out of it into my free hand. The words come
 *     here from main.js (`hear`) before the usual speech handling, because «Акцио меч» is not a one-word spell.
 *   - What can go wrong, decided here: a second backpack never goes inside (no bag in a bag); the bag holds at most CAP things;
 *     no free hand → nothing leaves it; the thing was gone → the hint; the pack is far → nothing (it is only heard near, REACH).
 */

import * as THREE from 'three';
import { namedGoods, normWords } from './MarketChoice.js';

export const MAGIC_PACK = {
    CAP: 120, // things inside at most
    REACH: 30, // m: the pack on the ground must be this near (the arm points at it, but «Акцио» + a name needs no aim)
};

/** «Акцио <name>» → {name} (name may be ''), or null when these are not that. Tolerates how the recogniser writes «Акцио». */
export function parseAccioName(text) {
    const t = normWords(text).join(' ');
    const m = /^(?:(?:ну|эй|так|давай)\s+)*(?:ак[цсз]ио|окцио|акцию|аксио|accio|акциё)(?:\s+(.*))?$/.exec(t);
    if (!m) return null;
    const rest = (m[1] || '').replace(/^(?:мне|пожалуйста|пж|давай|ка)\s+/, '').trim();
    return { name: rest };
}

/** Can the pack take this thing? (Never a backpack: no bag inside a bag.) */
export function packAccepts(pack, item) {
    return !!pack?.magic && !!item && item.kind !== 'backpack' && (pack.store?.length || 0) < MAGIC_PACK.CAP;
}

/** Put a thing inside. True if it went. */
export function packPut(pack, item) {
    if (!packAccepts(pack, item)) return false;
    (pack.store || (pack.store = [])).push(item);
    return true;
}

/** The thing in the pack that this text names (the best name; of equals — the first put in). Not removed. */
export function packFind(pack, text) {
    const goods = (pack?.store || []).map((item) => ({ item }));
    const r = namedGoods(text, goods);
    return r.length ? r[0].item : null;
}

/** Take the named thing out. → the item, or null. */
export function packTake(pack, text) {
    const it = packFind(pack, text);
    if (!it) return null;
    pack.store.splice(pack.store.indexOf(it), 1);
    return it;
}

export const PACK_TEXT = {
    put: '🎒 Вещь убрана в магический рюкзак',
    fullWithPack: '🎒 Все ячейки заняты. Вещь можно убрать в магический рюкзак: заведите руку с ней за спину',
    packFull: '🎒 Магический рюкзак полон',
    none: '🎒 Такого предмета нет',
    empty: '🎒 В магическом рюкзаке пусто',
    handBusy: '🎒 Освободите руку — вещь прилетит в неё',
    dropIt: '🎒 Чтобы достать вещь, снимите рюкзак (пустая рука за спиной), бросьте на землю и скажите «Акцио» и название',
};

const _v = new THREE.Vector3();

export class MagicPack {
    constructor(game) { this.game = game; }

    /** The magic pack I wear (or null). */
    worn() {
        const b = this.game.items?.worn?.backpack?.item;
        return b?.magic ? b : null;
    }

    /** The nearest magic pack lying on the ground within REACH → loose entry or null. */
    nearest() {
        const g = this.game, me = g.character?.group?.position;
        if (!me) return null;
        let best = null, bd = MAGIC_PACK.REACH;
        for (const L of g.items?.loose.values() || []) {
            if (L.item?.kind !== 'backpack' || !L.item.magic || L.accio || L.swarm) continue;
            const d = L.model.position.distanceTo(me);
            if (d < bd) { bd = d; best = L; }
        }
        return best;
    }

    /**
     * The words I said (a finished phrase). True: they were for the pack (nothing else should handle them).
     * Only «Акцио» + a name is ours; bare «Акцио» is the spell (the pack on the ground flies to the hand like any thing).
     */
    hear(text) {
        const g = this.game;
        if (!g.active || !g.items?.auth) return false;
        const p = parseAccioName(text);
        if (!p || !p.name) return false;
        const L = this.nearest();
        if (!L) {
            if (this.worn()) { g.hud?.toast?.(PACK_TEXT.dropIt, 4200); return true; } // (it is on my back: it must be taken off and thrown first)
            return false; // (no magic pack at all: «Акцио меч» is the ordinary spell/talk)
        }
        const pack = L.item;
        if (!(pack.store || []).length) { g.hud?.toast?.(PACK_TEXT.empty, 2600); return true; }
        const found = packFind(pack, p.name);
        if (!found) { g.hud?.toast?.(PACK_TEXT.none, 2600); return true; }
        if (g.accio?.active) return true; // (another thing is flying: this word is lost, the first one is not interrupted)
        const tired = g.combat?.check?.('Accio');
        if (tired) { g.hud?.setVoice?.(tired, true); return true; }
        const sec = g.dom === 'left' ? 'right' : 'left';
        const free = (sd) => !g.weapons?.hands?.[sd]?.held && !g.items?.held?.[sd] && !g.boards?.handBusy?.(sd);
        const side = free(sec) ? sec : free(g.dom) ? g.dom : null;
        if (!side) { g.hud?.toast?.(PACK_TEXT.handBusy, 3000); return true; }
        packTake(pack, p.name);
        const pos = L.model.position;
        for (let i = 0; i < 18; i++) g.fx?.spark?.(pos, i % 2 ? 0xffd860 : 0xfff2b8, 0.1, _v.set((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3), 0.6);
        if (!found.uid) found.uid = 'it' + Math.random().toString(36).slice(2, 10);
        const out = g.items.spawnLoose(found, new THREE.Vector3(pos.x, pos.y + 0.9, pos.z), { hover: false });
        if (!out) { packPut(pack, found); return true; } // (could not appear: it stays inside)
        g.combat?.pay?.('Accio');
        g.accio._castItem(out, side);
        g.accio._lastMagic = performance.now();
        return true;
    }
}
