/**
 * SunkenWorld.js — the wrecks and the sunken temple raised round the player (SunkenSites.js decides where; the same on every computer).
 *
 * A wreck: the ship's own model (ShipModel, look 'sunk': silted wood, rotted rags of sail), lying on the sand heeled over, her masts
 * broken off and fallen over the side, holes stove in her low side; her decks, rails and holds are solid (a ShipCollider, flooded,
 * never moving), her chests where the crew left them (the captain's in his cabin) — rolled as a sunken ship's (Items.lootChest
 * 'wreck' / 'wreckCaptain'). The temple: SeaTempleModel on its foundation, its steps, columns, walls, altar solid (the world's boxes),
 * the offerings' chests (rich ones) in the cella, by the altar and in the back portico.
 *
 * Who / what (CLAUDE.md «на кого и на что»): the chests open for whoever swims up to them (a guest asks the host: `cave` set — NetSync
 * chest-ask); what was taken stays taken (the opened chests are saved — WorldSave). The wreck and the temple are scenery that never
 * breaks (spells pass over them: they are on the sea's bottom, out of the fights; a blast does not move them) — no Levitation, no
 * Bombardo: a sunken hull is part of the sea's floor now. Nothing hunts here but what lives in the sea (SeaLife).
 *
 * Cheap: a site is checked once its land is made (TerrainData.landMade — never makes land in the frame), raised one a frame, a wreck's
 * model built a little a frame (ShipModel lazy), put away beyond FAR m (its chests and boxes with it); the temple's geometry is one shared.
 */
import * as THREE from 'three';
import { SUNKEN, sunkenSitesNear, siteFits } from './SunkenSites.js';
import { buildLayout, keelY, hullHalfWidth } from './ShipLayout.js';
import { ShipModel } from '../entities/ShipModel.js';
import { ShipPose, ShipCollider } from './ShipCollision.js';
import { Chest } from '../entities/Chest.js';
import { seaTempleModel, templeSolids, templeGlow, TEMPLE, TEMPLE_CHESTS, templeGeometry, templeMaterials } from '../entities/SeaTempleModel.js';
import { waterAt } from './CreatureSwim.js';

const _o = { x: 0, y: 0, z: 0 };

export class SunkenWorld {
    constructor(game) {
        this.game = game;
        this.sites = new Map(); // id → raised site
        this.bad = new Map(); // id → {x, z}: tried, does not lie here (forgotten far away)
        this.t = 0;
        this._scan = 0;
        this._queue = [];
    }

    /** The sea at (x, z): {depth, floor} — null: no sea (or a lake); undefined: its land is not made yet (ask again later). */
    _seaAt(x, z) {
        const t = this.game.world?.terrain?.data;
        if (!t) return undefined;
        const ix = Math.round(x), iz = Math.round(z);
        if (t.landMade && !t.landMade(ix, iz)) return undefined;
        if (!t.isSeaColumn?.(ix, iz)) return null;
        const w = waterAt(t, ix, iz, t.topLayer(ix, iz) + 1);
        return w ? { depth: w.depth, floor: w.bottom } : null;
    }

    update(dt) {
        const g = this.game, me = g.character?.group?.position;
        this.t += dt;
        templeGlow(this.t);
        if (!me || g.hellGate?.inHell || (g.space?.realm && g.space.realm !== 'earth') || g.config?.map) { if (this.sites.size) this.clear(); return; }
        // build what is being built (a wreck's model a little a frame)
        for (const S of this.sites.values()) if (S.model && !S.model.ready && S.model.buildSome(1.5)) this._show(S);
        // put away the far ones
        for (const S of this.sites.values()) if (Math.hypot(S.x - me.x, S.z - me.z) > SUNKEN.FAR) this._remove(S);
        for (const [id, b] of this.bad) if (Math.hypot(b.x - me.x, b.z - me.z) > SUNKEN.FAR * 2) this.bad.delete(id);
        // the near ones: tried once a second (one raised a frame)
        this._scan -= dt;
        if (this._scan <= 0) {
            this._scan = 1;
            this._queue.length = 0;
            if ((g.sea?.s?.(me.x, me.z) ?? -1e9) > -SUNKEN.NEAR) sunkenSitesNear(me.x, me.z, SUNKEN.NEAR, g.seed | 0, (s) => { if (!this.sites.has(s.id) && !this.bad.has(s.id)) this._queue.push(s); });
        }
        const s = this._queue.shift();
        if (s) this._try(s);
    }

    _try(site) {
        let pending = false;
        const fit = siteFits(site, (x, z) => { const w = this._seaAt(x, z); if (w === undefined) pending = true; return w || null; });
        if (pending) return; // (its land not made yet: tried again next second)
        if (!fit) { this.bad.set(site.id, { x: site.x, z: site.z }); return; }
        if (site.kind === 'temple') this._raiseTemple(site, fit); else this._raiseWreck(site, fit);
    }

    // ------------------------------------------------------------------------------------------------ a wreck
    _raiseWreck(site, fit) {
        const g = this.game, layout = buildLayout(site.cls);
        const pose = new ShipPose();
        const bottom = (fit.floor + fit.top) / 2;
        pose.set(site.x, bottom - keelY(layout, 0) - SUNKEN.BURY, site.z, site.yaw, site.roll, site.pitch);
        const collider = new ShipCollider(layout);
        collider.flooded = true; // (water inside: no dry hull, swimming everywhere)
        // the masts broken off: their stumps only (nothing invisible standing up to the surface)
        collider.solids = layout.solids.map((b) => {
            if (b.kind !== 'mast') return b;
            const m = layout.masts.find((x) => Math.abs(x.z - (b.z0 + b.z1) / 2) < 0.01);
            return m ? { ...b, y1: Math.min(b.y1, Math.min(m.top - 4, m.deck + 2.5)) } : b;
        });
        collider.setPose(pose);
        g.collision.addMover(collider);
        const S = { id: site.id, kind: 'wreck', site, x: site.x, z: site.z, layout, pose, collider, model: new ShipModel(layout, { look: 'sunk', lazy: true, name: '' }), chests: [], shown: false };
        this.sites.set(site.id, S);
        // her chests where the crew left them
        layout.chests.forEach((c, k) => {
            const id = site.id + ':ch' + k;
            const chest = new Chest(g.scene, new THREE.Vector3(), 'loot', 0, id, { style: 'pirate' });
            pose.toWorld(c.x, c.y, c.z, _o);
            chest.mesh.position.set(_o.x, _o.y, _o.z);
            chest.mesh.rotation.set(pose.pitch, pose.yaw + c.yaw, pose.roll, 'YXZ');
            chest.room = c.room === 'captain' ? 'wreckCaptain' : 'wreck';
            chest.sunk = true; chest.cave = 'sea'; // (a guest asks the host to open it — NetSync chest-ask)
            if (g._openedChests?.has(id)) chest.setOpenInstant();
            S.chests.push(chest);
            g.chests.push(chest);
        });
    }

    _show(S) {
        if (S.shown) return;
        S.shown = true;
        const g = this.game, m = S.model;
        g.scene.add(m.group);
        m.setPose(S.pose);
        const side = S.site.roll > 0 ? 1 : -1;
        for (const M of S.layout.masts) m.breakMast(M.id, -side, true); // (fallen over the high side… and lying on the sand)
        // holes stove in her low side, below the waterline she once had
        for (let i = 0; i < S.site.holes; i++) {
            const lz = (-0.3 + 0.6 * ((i + 0.5) / S.site.holes)) * S.layout.L, ly = -S.layout.draft * 0.45;
            m.addHole(-side * (hullHalfWidth(S.layout, lz, ly) || 1), ly, lz, 1.6 + (i % 2) * 0.8, false);
        }
        m.setNight?.(false);
    }

    // ------------------------------------------------------------------------------------------------ the temple
    _raiseTemple(site, fit) {
        const g = this.game;
        const group = seaTempleModel();
        const base = (fit.floor + fit.top) / 2 - 0.3; // (its foundation goes 4 m down into the sand: no gap under it)
        group.position.set(site.x, base, site.z);
        group.rotation.y = site.yaw;
        g.scene.add(group);
        const c = Math.round(Math.cos(site.yaw)), s = Math.round(Math.sin(site.yaw)); // (turned by a quarter: the boxes stay axis-aligned)
        const toW = (lx, lz) => [site.x + lx * c + lz * s, site.z - lx * s + lz * c];
        const boxes = [];
        for (const b of templeSolids()) {
            const [ax, az] = toW(b.x0, b.z0), [bx, bz] = toW(b.x1, b.z1);
            boxes.push(g.collision.addBox({ minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minY: base + b.y0, maxY: base + b.y1, minZ: Math.min(az, bz), maxZ: Math.max(az, bz), kind: 'temple' }));
        }
        const S = { id: site.id, kind: 'temple', site, x: site.x, z: site.z, group, boxes, chests: [] };
        TEMPLE_CHESTS.forEach((cs, k) => {
            const id = site.id + ':ch' + k;
            const [wx, wz] = toW(cs.x, cs.z);
            const chest = new Chest(g.scene, new THREE.Vector3(wx, base + TEMPLE.TOP, wz), 'loot', site.yaw + cs.yaw, id, { style: 'rich', scale: 1.5 });
            chest.room = cs.room;
            chest.sunk = true; chest.cave = 'sea';
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision.addBox(chest.getCollisionBox());
            if (g._openedChests?.has(id)) chest.setOpenInstant();
            S.chests.push(chest);
            g.chests.push(chest);
        });
        this.sites.set(site.id, S);
    }

    // ------------------------------------------------------------------------------------------------ away
    _remove(S) {
        const g = this.game;
        for (const ch of S.chests) {
            if (ch.isOpen) (g._openedChests || (g._openedChests = new Set())).add(ch.id);
            if (ch.boxId != null) g.collision.removeBox(ch.boxId);
            const i = g.chests.indexOf(ch); if (i >= 0) g.chests.splice(i, 1);
            ch.dispose();
        }
        if (S.kind === 'wreck') {
            g.collision.removeMover(S.collider);
            if (S.shown) g.scene.remove(S.model.group);
            S.model.dispose();
        } else {
            for (const id of S.boxes) g.collision.removeBox(id);
            g.scene.remove(S.group); // (its geometry and materials are shared: kept)
        }
        this.sites.delete(S.id);
    }

    clear() { for (const S of [...this.sites.values()]) this._remove(S); this._queue.length = 0; }

    /** Is (x, z) under a raised wreck or the temple? (SeaFloor grows no weed through them.) */
    covers(x, z) {
        for (const S of this.sites.values()) {
            if (S.kind === 'wreck') { if (S.collider.hasXZ(x, z) && S.collider.insideHull(x, z)) return true; continue; }
            const dx = x - S.x, dz = z - S.z, c = Math.cos(S.site.yaw), s = Math.sin(S.site.yaw);
            const lx = dx * c - dz * s, lz = dx * s + dz * c;
            if (Math.abs(lx) < TEMPLE.W / 2 + 0.5 && Math.abs(lz) < TEMPLE.L / 2 + 0.5) return true;
        }
        return false;
    }

    /** For Game.prewarm: the temple's stone and glow (its shaders at the loading screen; a wreck is a ship: its shaders are the ships'). */
    samples() {
        const { stone, glow } = templeGeometry(), M = templeMaterials();
        return [new THREE.Mesh(stone, M.stone), new THREE.Mesh(glow, M.glow)];
    }
}
