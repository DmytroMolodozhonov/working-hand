I followed the computed task, which asked for a read-only design of the sea, sea castles, port and ships (backlog item #117). The user request relayed for this run is a different one: rename fatigue to mana and let the maximum grow with practice (#123). The two don't conflict. Ship spells report their successes through one hook (§14) so the mana feature can count them. I changed no repo files. The tuning numbers below come from three scratch scripts in `/tmp/claude-0/-home-user-working-hand/c56317fb-a629-5b40-ba8b-0996403aa7d1/scratchpad/bf/`: `sim.mjs` and `sim2.mjs` (ship speed and turning) and `sea.mjs` (sea rarity and size).

# Design: sea, sea castles, port, 17th-century ships

## 0. Facts from the code this design relies on

- **Scale.** The hero is about 4.6 m tall: `PLAYER_GROUND_OFFSET` is 2.0, shoulders are about 3.25 m above the feet, and the arm reaches about 2.3 m. Castles use 5–6 m doors and floors 8 layers apart. Ships are built to the same scale, about 2.2 times real size.
- **Terrain.**
  - Block layer L spans y ∈ [L−1.5, L−0.5].
  - Water fills up to layer 0 and is drawn at `WATER_LEVEL_Y = -0.62`.
  - `MIN_LAYER = -9` is bedrock, and lakes are at most 7 deep.
  - `createHeightField` returns the top layer and sets `fn.water`.
  - `TerrainData.generate` wraps it with `CastleIndex.landAt` to level castle land.
- **How things stand and collide.**
  - Everything stands through `CollisionWorld.groundAt(x,z,reachY)`: `Character.update`, `Zombie`, `CastleLife._ground/_fallStep`, `Items._physics`, `Beds`, `Campfires.aim`.
  - Bodies are pushed by `resolveCylinder`, projectiles and line of sight use `pointBlocked`, and weapons use `contactAgainstWorld` in `Weapon.js` (`surfaceY` plus axis-aligned boxes).
  - All of these are world-static and axis-aligned, so ships need a new "mover" layer in the collision code.
  - `Animals._ride` uses `groundY`, not `groundAt`. This must change, or a horse on deck falls to the seabed.
- **Local player yaw** comes from `g.cameraBaseRotation` (drifting mode) or `g.smoothBody`, and is written into `group.rotation.y` every frame. A ship turn must add its yaw change to those two fields.
- **Hand-interaction patterns to reuse:**
  - Weapons grab timing: `CLOSE_CURL` 0.55 within 900 ms of `OPEN_CURL` 0.35; release after 160 ms below 0.28.
  - `ch.getGripCurl(side)` uses the tracked fingers, not the drawn ones.
  - `g.weapons.palmFrame(side).G` gives the grip point.
  - `hand.setGrip(curl)` closes the drawn fingers on a handle.
  - `BookReading._pushOut` pushes `hand.group.position` out of things, clamped to 0.6 m.
  - `BookReading.input` is a test hook that replaces tracked hands.
- **Host authority** follows the `CastleLife` pattern: the host simulates people and sends `vil` snapshots; guests send `vhit`; strikes arrive as `vstr` and are handled by `castleLife.struck`.
- **Saves.** `WorldKeeper.snapshot`, `restoreWorld` and `applyPlayerSnapshot`, which runs after `restoreWorld` in `Game.init`. The welcome message mirrors the save.
- **Minimap.** Hud draws water depth capped at 8. It stays untouched (author's rule); seas show up as deep water automatically.
- **Running in e2e.** Shoulder bob in synthetic poses gives `runIntensity = (Σ|Δshoulder.y| − 0.02)/0.13` over 8 frames. `bob: ±0.006` walks, `±0.02` runs.

## 1. Architecture

**New files**

| File | Role | Pure (Node-testable) |
|---|---|---|
| `src/world/Sea.js` | `SeaIndex`, `SEA`, `seaDepth`, `WAVES`, `waveAmp`, `seaWaveHeight`, `waveGlsl()` | yes |
| `src/fx/SeaSurface.js` | wave mesh around the camera, shore-distance texture, material | no |
| `src/game/ShipTypes.js` | `SHIP_CLASSES`, names, crew, physics constants | yes |
| `src/game/ShipLayout.js` | `buildLayout(cls)`: hull profile, floors, ramps, solids, masts and sails, helm, gangway, ladders, cabins, chests, crew graph | yes |
| `src/game/ShipCollision.js` | `ShipPose`, `ShipCollider` (mover), `PlankCollider` (mover), layout queries | yes |
| `src/game/ShipPhysics.js` | `stepShip`, `sailForce`, `waveResponse`, `groundContacts`, `mooringForces`, `decayWind` | yes |
| `src/game/ShipDamage.js` | blast damage, holes, leaks, fire spread, sinking stages | yes |
| `src/game/HelmMath.js` | wheel polar angle, unwrap, `steer`, rim distance | yes |
| `src/game/Helm.js` | hands on the wheel (grab, hold, release, push-out, net) | no |
| `src/game/Climb.js` | hand-over-hand rope-ladder climbing | no (math part pure) |
| `src/game/Sailors.js` | crew simulation (host), view (guests), fight, hits | no |
| `src/entities/ShipModel.js` | hull loft, decks, cabins, masts, yards, rigging, `SailMesh`, wheel, plank, ropes, flags, LOD | no |
| `src/game/Ships.js` | the system: registry, wake/sleep, simulate/interpolate, carry/attach riders, spells, weather, moorings, plank, net, save | no |

**Touched files:**
- `Terrain.js`, `World.js`, `Castles.js`, `Collision.js`, `Weapon.js`
- `Game.js`, `Swimming.js`, `Animals.js`, `Builder.js`, `Campfires.js`, `Levitation.js`
- `SpellManager.js`, `Combat.js`, `ItemTypes.js`, `Codex.js`, `VillagerModel.js`, `CastleLife.js` (small)
- `NetSync.js`, `RemoteAvatar.js`, `WorldSave.js`, `main.js`
- `tests/e2e/poses.mjs`, `tests/unit/terrain.test.js` (one assertion)

**Frame order in `Game.frame`** (new calls marked NEW):

```js
this.ships?.update(dt);        // NEW: ships move (host physics / guest interpolation),
                               //      colliders get the new pose, riders are carried
this._updatePlayer(dt);        // walks on the deck via collision.groundAt (movers)
...                            // levitation, swim, items, animals, zombies, weapons…
for (const r of this.remotes.values()) r.update(dt, this.ships);   // CHANGED: ship-frame avatars
this._keepBodiesApart();
this.ships?.attach();          // NEW: who stands on which ship now → local coords
if (this.sync) this.sync.update(dt);   // pose 'p' carries sh:[shipId, lx, ly, lz, lyaw]
```

---

## Phase 0: world-generation version and deeper bedrock

Seas change the height field kilometres from spawn. Old saves and old servers must keep their exact world.

- **`Terrain.js`**
  - `export const MIN_LAYER = -17;` and `export const WORLD_GEN = 2;`
  - `TerrainData.generate({ seed, mountains, seas = false })` sets `this.bedrockTop = (mountains && seas) ? MIN_LAYER : -9`.
  - In `_generateChunk`, change `if (L === MIN_LAYER)` to `if (L <= this.bedrockTop) type = BLOCK.BEDROCK`. Gen-1 and flat worlds therefore keep bedrock at −9 and dig exactly as before; `removeSphere` already skips bedrock by type.
- **`tests/unit/terrain.test.js` line 55:** `assert.equal(d.surfaceY(0, 0), d.bedrockTop - 0.5)`. This is the only existing assertion that changes.
- **`World.js`:** `new VoxelWorld(scene, {seed, mountains, map, seas})` passes `seas` to `new Terrain(...)` and on to `data.generate`.
- **`Game.init`:** `seas: (config.gen ?? 1) >= 2`.
- **`main.js`:**
  - New single-player and host games use `gen: WORLD_GEN`.
  - A saved world continues with `gen: w.gen ?? 1` (lines 595, 762, 782).
  - A guest uses `gen: msg.config.gen ?? 1` (line 839).
- **`NetSync.sanitizeConfig`:** add `gen: c.gen ?? 1`.
- **`WorldKeeper`:** keeps `gen` in the constructor and `snapshot()`.
- **`Swimming.waterAt`:** raise the loop limit `n < 12` to `n < 24`.

---

## Phase 1: sea terrain (big low basins, rare, beaches)

### `src/world/Sea.js`

```js
export const SEA = {
  CELL: 2048, CHANCE: 0.42, MARGIN: 940, MIN_SPAWN: 1100,
  R_MIN: 380, R_MAX: 640, N: 512,                // radius profile samples
  BEACH: 16, TAPER: 40, SHELF: 30, DEEP: 170, MAX_DEPTH: 16, ISLANDS: 2,
};
export class SeaIndex {
  constructor(seed) { this.seed = seed; this.noise = createNoise2D(seed ^ 0x51ed270b); this.cells = new Map(); this._last = null; }
  /** {id:'sea'+gx+'_'+gz, gx, gz, x, z, r0, prof: Float32Array(N), islands:[{x,z,r}]} | null — deterministic */
  cellOf(gx, gz) {
    // hash01(gx*11+5, gz*7+3, seed+7001) < CHANCE; centre within [g*CELL+MARGIN, (g+1)*CELL-MARGIN];
    // r0 ∈ [R_MIN,R_MAX]; reject if hypot(x,z) - 1.4*r0 < MIN_SPAWN;
    // prof[i] = r0*(1 + 0.24*n(cos a*1.3 + gx*7.1, sin a*1.3 + gz*3.3) + 0.09*n(cos a*4+17+gx, sin a*4-9+gz))
    // islands: 0..2 circles r 30..80 placed at 0.2..0.6 r0 from the centre
  }
  seaAt(x, z) { return this.cellOf(Math.floor(x / SEA.CELL), Math.floor(z / SEA.CELL)); }  // (cached last cell)
  radiusAt(sea, a) { /* linear interp of prof by angle */ }
  /** > 0 inside the sea (m from the shore), < 0 on land; -1e9 when this cell has no sea */
  signedDist(x, z) {
    const sea = this.seaAt(x, z); if (!sea) return -1e9;
    const dx = x - sea.x, dz = z - sea.z;
    let s = this.radiusAt(sea, Math.atan2(dz, dx)) - Math.hypot(dx, dz);
    for (const i of sea.islands) s = Math.min(s, Math.hypot(x - i.x, z - i.z) - i.r);
    return s;
  }
  pointAt(sea, a, s) { const R = this.radiusAt(sea, a) - s; return { x: sea.x + Math.cos(a) * R, z: sea.z + Math.sin(a) * R }; } // tests, castles
  near(x, z, r) { /* seas of the cells overlapping the square */ }
  nearest(x, z, maxCells = 6) { /* ring search */ }
}
/** water layers at signed distance s (0 on land) */
export function seaDepth(s, jitter = 0) {
  if (s <= 0) return 0;
  if (s <= 6) return 1;
  if (s <= SEA.SHELF) return 1 + Math.round((s - 6) / (SEA.SHELF - 6) * 2);
  return Math.max(3, Math.min(SEA.MAX_DEPTH, 3 + Math.round((s - SEA.SHELF) / (SEA.DEEP - SEA.SHELF) * (SEA.MAX_DEPTH - 3)) + jitter));
}
```

The scratch run of `sea.mjs` found seas in 24–31 of 64 cells for 5 seeds. Radii ran from 277 to 826 m, which stays inside the cell because 826 < 940. The nearest shore to spawn was about 2.7 km. That makes seas rare but findable.

### `createHeightField(seed, mountains, seas = null)`

Additions inside `fn`, after the mountain height `h` and before the river and lake code:

```js
fn.water = 0; fn.sea = false; fn.beach = false;            // (set at the top of fn)
...
if (seas) {
  const s = seas.signedDist(ix, iz);
  if (s > -SEA.TAPER) {
    if (s > 0) {
      const j = s > SEA.SHELF ? Math.round(noise(ix / 37 + 91, iz / 37 - 13) * 1.2) : 0;
      const d = seaDepth(s, j); fn.water = d; fn.sea = true; return -d;
    }
    h = Math.min(h, Math.floor(-s / (s > -SEA.BEACH ? 6 : 5)));   // land tapers to the shore
    fn.beach = s > -SEA.BEACH;
  }
}
// rivers unchanged (a river reaching the beach cuts its mouth); lakes: `if (h <= 1 && !fn.beach)`
```

### `TerrainData` changes

- `generate`: `this.seas = (mountains && seas) ? new SeaIndex(seed) : null; const raw = createHeightField(seed, mountains, this.seas); new CastleIndex(seed, raw, this.seas)`. The wrapper `fn` copies `raw.sea` and `raw.beach` (§Phase 3).
- `_generateChunk`:
  - Top block: `else if (L === h && this.heightAt.beach) type = BLOCK.SAND;`
  - Seabed: already SAND (`water && L === h`). Under the sea, layers from h−3 to h are SAND, then STONE.
  - Sea mask: `if (this.heightAt.sea) (seaMask ||= new Uint8Array(CHUNK*CHUNK))[col] = 1;` then `c.sea = seaMask || null`.
- `isSeaColumn(ix, iz)` reads `chunk.sea`.
- `_plantTrees`: skip when `this.seas?.signedDist(tx, tz) > -SEA.BEACH - 2`.
- `buildChunkArrays`: with `this.skipSeaTop`, which `Terrain` sets when a `SeaSurface` exists, the layer-0 water top face of sea columns is not emitted:

```js
} else if (a === BLOCK.WATER && (bRaw === BLOCK.AIR || bRaw === BLOCK.ICE_SHAPE)) {
  if (!(this.skipSeaTop && d === 1 && c.sea && c.sea[az * CHUNK + ax] && ay + lowest === 0)) { key = ...; kind = 2; }
}
```

Node tests keep `skipSeaTop = false`, so existing mesh tests are unaffected.

---

## Phase 2: waves (small near the shore, bigger further out)

### Shared wave definition (single source, `Sea.js`)

```js
export const WAVES = {
  ampShore: 0.12, ampOpen: 0.9, openAt: 120, storm: 0.8,
  open: [ [0.090, 0.040, 0.95, 0.0, 0.55], [-0.050, 0.110, 1.20, 1.7, 0.30], [0.170, -0.130, 1.90, 4.1, 0.15] ], // kx,kz,ω,φ,w
  shore: { k: 0.45, omega: 1.6, w: 0.6 },          // crests parallel to the shore, running in (phase = k·s + ω·t)
};
export function waveAmp(s, storm = 0) { if (s <= -2) return 0; const k = Math.min(1, Math.max(0, s / WAVES.openAt)); const o = k * k * (3 - 2 * k); return (WAVES.ampShore + (WAVES.ampOpen - WAVES.ampShore) * o) * (1 + WAVES.storm * storm); }
export function seaWaveHeight(x, z, t, s, storm = 0) {
  const A = waveAmp(s, storm); if (!A) return 0;
  const k = Math.min(1, Math.max(0, s / WAVES.openAt)), open = k * k * (3 - 2 * k);
  let swell = 0; for (const [kx, kz, w, p, a] of WAVES.open) swell += a * Math.sin(kx * x + kz * z - w * t + p);
  const shore = Math.sin(WAVES.shore.k * s + WAVES.shore.omega * t);
  return A * (open * swell + (1 - open) * (WAVES.shore.w * shore + (1 - WAVES.shore.w) * swell));
}
export function waveGlsl() { /* builds the identical GLSL function from WAVES numbers */ }
```

The shore wave's phase velocity is ds/dt = −ω/k ≈ −3.6 m/s, so waves run toward the beach.

**Shared clock.** `Game.seaTime()` returns `((Date.now() - this.dayStart) % 3_600_000) / 1000`. `dayStart` is already synced in the welcome message, so every player sees the same waves. Ship heave is computed from the same function.

### `src/fx/SeaSurface.js`

- **Mesh.** A radial grid of ring radii `2·1.06^i` up to `R = max(400, viewDistance·1.2)`, 128 segments, about 11k vertices.
  - Centred on the camera and snapped to 2 m.
  - At `WATER_LEVEL_Y`, `DoubleSide`, `renderOrder 1`, `depthWrite false`, fog on.
- **Shore texture.** 256×256 texels, RG8, covering 1024 m at 4 m per texel.
  - R = `clamp(s+32, 0, 255)`, G = `depthLayers*15`.
  - Rebuilt when the player has moved more than 128 m, in 4096-sample slices per frame, from `SeaIndex.signedDist`.
- **Material.** `MeshPhongMaterial` with `onBeforeCompile`, like `WaterMaterial.js`. Uniforms: `uTime, uOrigin, uTexSize, uStorm, uShore (sampler)`.
  - Vertex: `y += seaWave(x, z, uTime, s)`, with the normal from finite differences.
  - Fragment: `discard if s < -3`. Colour lerps from shallow `0x3fb7c9` to deep `0x1d4f8f` by G. Foam is white where `s < 5 && shoreCrest > 0.7`, plus a fresnel rim.
  - The sand at y = −0.5 hides the plane over land; small crests lap onto the sand.
- **Activation.** Only while `seas.near(player, viewDistance+200)` is non-empty; otherwise invisible and not updated.
- **Exposed API.** `seaSurface.amp(s)`, `seaSurface.uniforms`, `world.seaWave(x, z)`.

### `Swimming.js`

- `waterAt` also returns `sea: data.isSeaColumn(ix, iz)`.
- In `update`, a sea swimmer floats at `surface + world.seaWave(x, z)` and bobs on the waves.
- `const w = w0 && g.ships?.dryAt(p.x, p.y - FEET + 0.2, p.z) ? null : w0;`. Inside a floating hull is dry; inside a flooded wreck it is water.

---

## Phase 3: sea castle and port

### Site selection (`Castles.js`)

`CastleIndex` constructor becomes `(seed, rawHeight, seas)`. `_makeCastle(gx, gz)` tries the sea variant first when a sea's shore crosses the cell:

```js
const sea = this.seas && this.seas.near(gx * CASTLE_CELL + CASTLE_CELL / 2, gz * CASTLE_CELL + CASTLE_CELL / 2, CASTLE_CELL)[0];
if (sea) { const c = this._makeSeaCastle(gx, gz, s, rng, sea, zone); if (c) return c; }
// … existing land search unchanged

_makeSeaCastle(gx, gz, s, rng, sea, zone) {
  for (let t = 0; t < 10; t++) {
    const a = rng() * Math.PI * 2, P = this.seas.pointAt(sea, a, 0);          // a shore point
    if (Math.floor(P.x / CASTLE_CELL) !== gx || Math.floor(P.z / CASTLE_CELL) !== gz) continue;
    const rot = rotFacing(sea.x - P.x, sea.z - P.z);                        // local +v → towards the sea
    const vShore = s.D - 8;                                                 // back 8 m of the castle in the water
    const [dx, dz] = V_DIR[rot];                                            // [[0,1],[-1,0],[0,-1],[1,0]]
    const X = Math.round(P.x - dx * vShore), Z = Math.round(P.z - dz * vShore);
    if (Math.hypot(X, Z) < MIN_SPAWN_DIST + zone) continue;
    // land half (v < vShore-10): ≤10% wet, gentle (same 10–90 percentile rule ≤ 7); sea half (port rect): ≥80% sea, depth ≥ 2
    if (!this._seaSiteOk(X, Z, rot, s, vShore)) continue;
    return this._buildCastle(gx, gz, X, Z, 2, s, rng, zone, { rot, sea: sea.id, vShore });
  }
  return null;
}
```

`rotFacing(nx, nz)` picks the rotation r whose `V_DIR[r]` has the largest dot product with (nx, nz).

### Plan and port

- **`_buildCastle(..., opts)`**: uses `opts.rot` instead of a random rotation, sets `s.sea = opts` and `F = 2`. Order: `buildVillage`, `buildCastle`, then `if (s.sea) { buildSeaWorks(...); buildPort(...); }`.
- **Village clipping** (sea variant):
  - `free(u, v, r)` also rejects `v + r > vShore - 4`.
  - `road()` clamps `v1 = min(v1, vShore - 3)` and skips empty boxes.
  - `roadNodes` skips points with `v > vShore - 3`.
  - The north spoke is clipped the same way.
- **`buildSeaWorks`**:
  - A stone plinth under the back of the castle: `p.box(-W-ts, W+ts, -F-16, -4, vShore, D+ts, s.stone)`.
  - A round sea tower at (0, D+24), r 7, from l −F−16 to l 20.
  - A bridge on arches from the back wall walk to the tower at `walk`, with arch holes `box(..., 0)` under it.
- **`buildPort`** writes `out.port`:
  - **Rect.** u ∈ [W+ts+10, W+ts+10+portW], with portW 70/100/130 for 1/2/3 ships.
  - **Quay.** Cobble at l = −1 for v ∈ [vShore−6, vShore], plus a stone facing `box(u0, u1, -F-16, -1, vShore, vShore, s.stone)`.
  - **Pier k**, one per ship:
    - Deck at `pl = pierLayer(cls) - F - 1`, PLANKS, width 7 (u_k ± 3), v ∈ [vShore, vShore + L_cls + 14].
    - Beams PLANKS_DARK at pl−1.
    - Pile pairs every 6 m from the seabed to pl−1.
    - Bollards 1×1×2 at (u_k ± 3, pl+1..pl+2) every 10 m.
    - Stairs from the quay up to the pier.
    - A LANTERN post at the end.
  - **Pier layer by class** puts the pier top about 1 m under the main deck:

    | Class | Pier layer L | Pier top y | Main deck world y |
    |---|---|---|---|
    | pinnace | 3 | 2.5 | 3.98 |
    | fluyt | 4 | 3.5 | 4.78 |
    | galleon | 5 | 4.5 | 5.38 |

  - **Harbour basin.** The sea side of the port rect is dredged to at least 8 layers.
  - **Extras.** A warehouse (planks), crates and barrels, and a lighthouse (`roundTower` with a lantern top) on the longest pier's end.
  - **Berths:** `{ cls, pier: k, x, z, yaw, side }`.
    - Ship centre at u = u_k + 3 + 1.5 + B/2, v = vShore + 7 + L/2.
    - The bow points out to sea: `yaw = Math.atan2(-fx, -fz)`, where (fx, fz) is the world direction of local +v.
    - `side`: which of the ship's sides faces the pier.
  - **Plank and bollards.** `plankA` = the pier edge point at midships. `bollards` = the two bollards nearest the bow and stern bitts.
  - **Walking graph.** Nodes tagged `quay`, `pier` join the village roads.
- **Ships by style:**

  | Style | Ships |
  |---|---|
  | grand | galleon, fluyt, pinnace |
  | fortress | galleon, pinnace |
  | compact | fluyt or pinnace (rng) |

- **Castle record** gains `variant: 'sea'`, `sea`, `port`.

### Land levelling (`landAt` and `TerrainData.generate`)

`landAt` returns `{ castle, w, side, harbour }` for sea castles. Local (u, v) come from the inverse plan transform:

```js
// r0: u=dx, v=dz; r1: u=dz, v=-dx; r2: u=-dx, v=-dz; r3: u=-dz, v=dx
side = (v > k.port.vShore && !(Math.abs(u) <= k.port.keepU && v <= k.port.keepV)) ? 'sea' : 'land';
harbour = side === 'sea' && inRect(k.port.basin, u, v);
```

In `TerrainData.generate`:

```js
if (land.side === 'sea') {                       // beyond the quay: the sea (dug out in the harbour)
  const d = Math.max(raw.sea ? raw.water : 0, land.harbour ? k.port.depth : 0, 1);
  fn.water = d; fn.sea = true; fn.beach = false; return -d;
}
// land side: existing levelling (reclaims any bit of sea behind the quay)
```

### `CastleLife` (small)

- Port nodes tagged `pier` and `quay` join commoner trips.
- `state(id).owner`, set when the castle is captured, is read by `Ships` to decide crew loyalty.

---

## Phase 4: ship data, model, deck collision (at berth)

### `ShipTypes.js`

Ship-local axes: x is starboard, y is up from the waterline, z points aft. The bow is −z, the same convention as the hero, who faces −Z.

| | pinnace | fluyt | galleon |
|---|---|---|---|
| ru | Пинас | Флейт | Галеон |
| L × B (m) | 44 × 12 | 60 × 15 | 80 × 20 |
| draft | 3.2 | 4.0 | 5.0 |
| main deck y | 4.6 | 5.4 | 6.0 |
| lower deck y | — | 0.6 | 0.6 |
| quarterdeck y (z range) | 10.2 (+8..+22) | 11.2 (+12..+30) | 12.0 (+14..+40), poop 17.6 (+29..+40) |
| forecastle y (z range) | — | 10.6 (−30..−21) | 11.6 (−40..−27) |
| masts (z, height above main deck) | fore −9 h34, main +3 h40 | fore −16 h44, main +1 h52, mizzen +19 h30 | fore −22 h56, main −1 h66, mizzen +23 h36, bowsprit |
| crew | captain + 3 | captain, boatswain + 4 | captain, boatswain + 8 |
| hull hp / flood volume | 160 / 0.35 | 260 / 0.6 | 420 / 1.0 |
| sailK, c1, c2 | 0.0045, 0.015, 0.00138 | 0.003, 0.015, 0.00116 | 0.002, 0.02, 0.00022 |
| kRud, yawD1 | 0.0026, 0.30 | 0.0016, 0.24 | 0.0011, 0.20 |
| waveLag (s) | 0.8 | 1.1 | 1.5 |

Simulated behaviour from `sim2.mjs` (Wind Maxima = 14 m/s gust, plain Wind = 7 m/s):

| | pinnace | fluyt | galleon |
|---|---|---|---|
| Wind Maxima from astern: u at 5 / 20 / 40 s, top | 3.2 / 6.6 / 7.4, top 7.5 | 2.3 / 5.4 / 6.5, top 6.8 | 1.6 / 4.2 / 5.4, top 6.0 |
| Plain Wind steady speed | 3.3 | 2.8 | 2.2 |
| Coasting from 5 to 1 m/s | 88 s | 90 s | 78 s |
| Full wheel at 4 m/s: 90° turn | 22 s | 28 s | 34 s |

The bulwark (rail) is 2.4 m above every deck. Galleon yards (y above the main deck, width, sail height):
- fore course +24, 28, 14; fore topsail +40, 20, 13
- main course +27, 32, 17; main topsail +46, 23, 15
- mizzen lateen: pivot quarterdeck +12, yard 30 m at 40°
- spritsail 18 × 9

Galleon total sail area is about 1850 m². Ship names come from a list such as «Золотая Лань», «Морская Звезда», «Буревестник», «Святая Анна», «Северный Ветер», «Чёрный Лебедь», «Королева Моря»…

### `ShipLayout.js` (pure)

```js
export function buildLayout(cls) → {
  cls, L, B, draft, deck, rail: 2.4,
  hullHalfWidth(lz, ly),        // plan: (B/2)·(1-|t|^p), p=2.2 bow / 4 stern, transom 0.6·B/2; section: below WL ·(1-(ly/draft)^2)^0.4, above ·(1-0.08·ly/deck)
  floors: [{ id, name, y, x0, x1, z0, z1, holes: [{x0,x1,z0,z1}] }],   // main, lower, quarter, poop, fore — clipped by hull outline - 0.2
  ramps:  [{ ax, ay, az, bx, by, bz, half }],                          // stairs main↔quarter (both sides), main↔fore, hatch main↔lower
  solids: [{ x0,x1,y0,y1,z0,z1, kind }],                              // masts 2×2, bulkheads with door gaps 3.2×5.5, capstan, cannons, chests, wheel pedestal, cabin furniture
  openings: [{ side: ±1, z0, z1, deck: 'main' }],                      // gangways both sides, z ∈ gangZ±2 (rail gap)
  ladders: [{ side: ±1, z, top: deck, bottom: -1, rung: 0.9 }],        // Jacob's ladders at the gangways
  helm: { x: 0, y: quarter + 1.9, z, rimR: 1.45, handleR: 1.85, spokes: 8, stand: { x: 0, y: quarter, z: z + 1.1 } },
  masts: [{ id, z, base, top, yards: [{ y, w, h, kind: 'square'|'lateen' }] }],
  sails: [{ id, mast, yard, w, h, area, center: {x,y,z}, normal: {x:0,y:0,z:-1} }],
  bitts: [{ id: 'bow', x, y, z }, { id: 'stern', ... }],
  rooms: [{ name: 'Каюта капитана'|'Кубрик'|'Кладовая', x0,x1,z0,z1, y }],
  chests: [{ x, y, z, yaw, room, locked: 'captain' }],
  nodes: [{ id, x, y, z, tag }], edges: [[a, b]],                      // tags: helm, captain, bow, rig:fore|main, capstan, gangway:±1, hatch, hammock, cabin
};
export function floorAt(L, lx, lz, reachLy) → ly | null   // highest floor/ramp ≤ reachLy containing (lx,lz), not in a hole, inside hull
export function roomAt(L, lx, ly, lz) → room | null
```

### `ShipCollision.js` (pure; mover interface)

```js
export class ShipPose {   // world ⇄ ship-local; roll > 0: starboard side up; pitch > 0: bow up
  set(x, y, z, yaw, roll = 0, pitch = 0) { /* cache cos/sin */ return this; }
  toWorld(lx, ly, lz, out) { out.x = this.x + lx * this._c + lz * this._s; out.z = this.z - lx * this._s + lz * this._c; out.y = this.y + ly + lx * this._sr - lz * this._sp; return out; }
  toLocal(wx, wy, wz, out) { const dx = wx - this.x, dz = wz - this.z; out.x = dx * this._c - dz * this._s; out.z = dx * this._s + dz * this._c; out.y = wy - this.y - out.x * this._sr + out.z * this._sp; return out; }
}
// The model uses group.rotation.set(pitch, yaw, roll, 'YXZ') — the same to first order.

export class ShipCollider {                  // registered with CollisionWorld.addMover
  constructor(layout) { this.L = layout; this.pose = new ShipPose(); this.aabb = {}; this.flooded = false; this._side = new WeakMap(); }
  setPose(p) { /* copy; aabb = rotated L×B rect + 2 m */ }
  hasXZ(x, z, pad = 0) { /* aabb */ }
  floorAt(x, z, reachY) { /* local xz → floorAt(L, ..., reachY - pose.yAt) → world y | null */ }
  pushCylinder(pos, r, feetY, h, step) {
    // local; INSIDE (remembered per pos object in _side, so a fast walker can't tunnel through the rail):
    //   if feet < railTop(floor) and not in an opening: clamp |lx| ≤ hullHalfWidth - 0.4 - r; ends likewise
    // OUTSIDE (a swimmer, the pier): push out of the shell between keel and railTop
    // solids: pushOutOfRect in local xz where the vertical spans overlap; back to world; return moved
  }
  sphereDepth(p, r, n) { /* floors as 0.4 m slabs, shell, solids → depth + world normal */ }
  pointBlocked(x, y, z) { /* inside a solid, the shell, or the closed hold (below the lowest floor inside the hull) */ }
  insideHull(x, z) {}
  dryAt(x, y, z) { /* inside outline, -draft < ly < deck + rail, !flooded */ }
}
export class PlankCollider { /* world ramp A→B, half 1.2, 0.15 thick: hasXZ, floorAt, sphereDepth; push/pointBlocked: no-ops */ }
```

### `Collision.js` changes

```js
this.movers = [];
addMover(m) { if (!this.movers.includes(m)) this.movers.push(m); }
removeMover(m) { const i = this.movers.indexOf(m); if (i >= 0) this.movers.splice(i, 1); }
groundAt(x, z, reachY) {
  let y = (!this.terrain || !this.terrain.floorBelow) ? this.groundY(x, z) : this.terrain.floorBelow(Math.round(x), Math.round(z), Math.floor(reachY + 1.5)) - 0.5;
  for (let i = 0; i < this.movers.length; i++) { const m = this.movers[i]; if (!m.hasXZ(x, z)) continue; const f = m.floorAt(x, z, reachY); if (f !== null && f > y) y = f; }
  return y;
}
// supportY: same mover loop with reachY = fromY + 0.35
// resolveCylinder: inside the pass loop after terrain: for movers with hasXZ(pos.x, pos.z, radius): if (m.pushCylinder(pos, radius, feetY, height, stepHeight)) moved = true;
// pointBlocked: for movers: if (m.hasXZ(x, z) && m.pointBlocked(x, y, z)) return true;
```

**`Weapon.js contactAgainstWorld`:** after the boxes, loop `collision.movers` with `sphereDepth`. **`Animals._ride`:** change `groundY` to `groundAt(x, z, a.group.position.y + 1)`.

### `ShipModel.js`

- **Hull loft.** 32 stations × 2×14 ring points from keel to rail top, triangle strips, vertex colours:
  - antifouling below WL+0.3
  - wales at WL+1.5 and deck−1
  - a castle-colour band at gunport level
  - gold trim at the stern
  - transom with stern windows (emissive at night), beakhead
- **Structures.** Deck plank surfaces (canvas plank texture); sterncastle and forecastle boxes; gunports with lids, cannons inside on the lower deck; hatch gratings, capstan, ladders and stairs matching the ramps.
- **Cabins.** Bulkheads with door gaps; captain's table and chairs; hammocks and barrels below.
- **Masts and rigging.** Tapered masts with tops; yards in a group per yard, rotated by the brace angle about the mast. `LineSegments` for shrouds (6 per side per mast), ratlines every 1.5 m, and stays.
- **`SailMesh`**:

  ```js
  class SailMesh {          // PlaneGeometry(w, h, 10, 8) hanging from the yard; furl bundle = cylinder along the yard
    setState(unfurl /*0..1*/, fill /*0..1*/, side /*±1 wind side*/, burnt /*0..1*/, t) {
      // visible cloth height = unfurl·h; bundle radius = r0·(1-unfurl) + 0.1, at the cloth's lower edge (rolls down like a blind)
      // vertex (u∈[0,1] across, v∈[0,1] from the yard): z = side·fill·0.18·w·(1-(2u-1)^2)·sin(π·min(1, v·1.15))
      // luffing when 0.02 < fill < 0.2: + 0.3·sin(10t + 6u)·u at the leech; corners of a course fixed to the deck (clews)
      // burnt: vertex alpha / discard by a burn mask growing from the fire point; burnt = 1 → hidden, bundle hidden
    }
  }
  ```

- **Wheel.** `TorusGeometry(rimR, 0.08)`, 8 spokes extended to `handleR` with knobs, hub, two posts and a drum. `wheel.rotation.z = -ship.wheel`.
- **Other parts.**
  - Gangplank: box 2.4 × 0.15 × length with cleats.
  - Mooring ropes: 8-segment sagging lines.
  - Jacob's ladders: two rope lines with rungs.
  - Flags in the castle colour, fluttering along the apparent wind (a cue for wind direction).
  - Stern lanterns: one `PointLight` only for the nearest ship at night.
- **LOD.** `setDetail(dist)`: beyond 220 m hide rigging, ratlines, interior and cannons; beyond 600 m hide everything. Shadows only near (`setNearShadow`).

### At berth (phase deliverable)

- The ship is static at its berth pose: collider registered, plank laid (`PlankCollider` from `port.plankA` to the gangway), ladders hung.
- Ship chests are `Chest` entities with `chest.ship`, `chest.local` and no `boxId`; the layout's solids block them. Their position is updated every frame by `Ships`. `locked = captainAlive`.
- Chest ids `${shipId}:ch${k}` reuse the existing `_openedChests` save path. The loot table is `'ship'`: coins 30–150, wands and scrolls; leave a high-chance slot for the fishing rod (#126).
- Building, doors and beds on deck are blocked:
  - `Builder._place`: `if (g.ships?.footprintAt(x, y, z)) hint '⚓ На корабле строить нельзя'`
  - `Doors.stand`: the same check
- `Campfires.aim` sets `hit.ship = g.ships?.shipAt(hit.x, hit.y, hit.z)` and computes `hit.water` only when there is no ship. If `cast` targets a ship, `g.ships.ignite(ship, hit, by)`: a campfire on a wooden deck sets the deck on fire, with the hint '🔥 Палуба загорелась!'.
- `Levitation._softWater`: a fall onto a deck is not a soft water landing (`g.ships?.shipAt(...)`).

---

## Phase 5: moving frame (physics core, carrying everyone aboard)

### `ShipPhysics.js` (pure)

```js
export function stepShip(st, cls, env, dt) {      // st: {x, z, yaw, u, v, r, wheel, spellWind:{x,z}, tau, heave, roll, pitch, forced?}
  const H = 1 / 30; for (let t = 0; t < dt - 1e-9; t += H) sub(Math.min(H, dt - t));
  function sub(h) {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    const fx = -s, fz = -c, rx = c, rz = -s;                 // forward, starboard (world)
    const W = { x: env.wind.x + st.spellWind.x, z: env.wind.z + st.spellWind.z };
    const vx = fx * st.u + rx * st.v, vz = fz * st.u + rz * st.v;
    const ax = W.x - vx, az = W.z - vz;                      // apparent wind
    const along = ax * fx + az * fz, across = ax * rx + az * rz;
    const { Fu, Fv, N } = sailForce(cls, env.openFrac, along, across);  // per unit mass
    const M = mooringForces(st, cls, env.moorings);          // springs (body frame) + yaw torque; marks strain
    const delta = 0.61 * st.wheel / HELM_LOCK;               // rudder ±35°
    st.u += (Fu + M.u - cls.c1 * st.u - cls.c2 * st.u * Math.abs(st.u)) * h;
    st.v += (Fv + M.v - 10 * (cls.c1 * st.v + cls.c2 * st.v * Math.abs(st.v))) * h;
    st.r += (-cls.kRud * delta * st.u * Math.abs(st.u) + N + M.r - cls.yawD1 * st.r) * h;   // wheel>0 (clockwise) → starboard → yaw decreases
    if (st.forced) { st.u = st.forced.u ?? st.u; st.r = st.forced.r ?? st.r; }                  // (tests)
    st.x += (fx * st.u + rx * st.v) * h; st.z += (fz * st.u + rz * st.v) * h; st.yaw += st.r * h;
    groundContacts(st, cls, env.solidAt, h, env.onHit);      // hull samples vs terrain.solidIn → stop, bounce e=0.2, damage (|vn|-1.5)·12
    decayWind(st, h);                                         // spellWind *= exp(-h/τ)
  }
}
export function sailForce(cls, openFrac, along, across) {
  const va2 = along * along + across * across, ang = Math.atan2(across, along), co = Math.cos(ang);
  const eff = Math.max(0, (co + 0.35) / 1.35);               // braced yards: useful to ~110° off the stern
  const aback = co < -0.5 ? -(-co - 0.5) : 0;                // wind from ahead pushes astern
  const q = cls.sailK * openFrac * va2;
  return { Fu: q * (eff + aback), Fv: q * 0.3 * Math.sin(ang) * Math.max(eff, 0.2), N: 0.15 * q * cls.lateenFrac * Math.sin(ang) };
}
export function waveResponse(st, cls, sample /*(lx,lz)→h*/, dt, heelFv) { /* heave=mean, pitch=atan((hb-hs)/0.8L), roll=atan((hst-hp)/0.9B)+heel; low-pass by waveLag */ }
```

- **Ground contacts.** About 16 hull sample points: the keel line at `ly = -draft·(1 - 0.4·(2lz/L)^4)` and waterline-ring points at |lx| = w(lz). Contact is `terrain.solidIn(ix, iz, Lp, Lp)` at the point's layer. Piers and piles block the hull; a bridge arch over the water does not.
- **Ship against ship.** Three circles of radius B/2 per hull; overlapping hulls are pushed apart and damaged by relative speed.

### `Ships.js` core

```js
export class Ships {
  constructor(game) {
    this.game = game; this.enabled = !game.config.map && game.config.mode !== 'test';
    this.list = new Map(); this.awake = new Set(); this.riders = new Map(); this.me = null;
    this.wind = { x: 0, z: 0 }; this.calm = false;           // (tests: no waves / weather)
    this.helm = new Helm(game, this); this.crew = new Sailors(game, this); this.climb = new Climb(game, this);
  }
  get auth() { return this.game.authority; }
  update(dt) {
    if ((this._scanT -= dt) <= 0) { this._scanT = 1; this._scan(); }  // ships from castle ports within 600 m of any player;
                                                                      // awake if any player < 300 m; sleep > 400 m (state kept)
    if (this.auth && !this.calm) this._weather(dt);
    const t = this.game.seaTime();
    for (const s of this.awake) {
      _prev.copy(s.pose);
      if (this.auth) this._simulate(s, dt); else this._interpolate(s, dt);  // stepShip + damage/fire/sink + moorings + plank
      this._waves(s, t, dt);                                              // heave/roll/pitch (0 when calm)
      s.pose.set(s.x, WATER_LEVEL_Y + s.heave - s.sinkY, s.z, s.yaw, s.roll, s.pitch);
      s.collider.setPose(s.pose); s.plank?.update();
      this._carry(s, _prev);
      s.model.setPose(s.pose); s.model.update(dt, s);                     // sails, wheel, flags, fires, ropes
      for (const ch of s.chests) ch.mesh.position.copy(s.pose.toWorld(ch.local.x, ch.local.y, ch.local.z, _v)), ch.mesh.rotation.y = s.yaw + ch.local.yaw;
    }
    this.helm.update(dt); this.climb.update(dt); this.crew.update(dt);
    this._hands();                                                         // hands never through rails/masts/wheel
    if (this.game.sync) this._net(dt);
  }
  _carry(s, prev) {
    const dyaw = angleDiff(s.yaw, prev.yaw);
    for (const r of this.riders.values()) {
      if (r.ship !== s) continue;
      s.pose.toWorld(r.l.x, r.l.y, r.l.z, r.ent.pos);   // x, z and y (heave) — feet stay on the deck
      if (dyaw) r.ent.turn(dyaw);
    }
  }
  attach() {                                           // after everything moved this frame
    for (const ent of this._entities()) {              // cached adapters (no per-frame allocation)
      const s = ent.free() ? this._shipUnder(ent.pos, ent.feet()) : null;
      if (!s) { this.riders.delete(ent.key); continue; }
      const r = this.riders.get(ent.key) || { ent, l: new THREE.Vector3() };
      r.ship = s; s.pose.toLocal(ent.pos.x, ent.pos.y, ent.pos.z, r.l); r.lyaw = ent.yaw() - s.yaw;
      this.riders.set(ent.key, r);
    }
    this.me = this.riders.get('me') || null;
  }
  _shipUnder(pos, feetY) {
    for (const s of this.awake) {
      if (!s.collider.hasXZ(pos.x, pos.z)) continue;
      const f = s.collider.floorAt(pos.x, pos.z, feetY + 1.1); if (f === null) continue;
      const above = feetY - f;
      if (above < 0.6 || (s.collider.insideHull(pos.x, pos.z) && above < 14)) {   // standing, or mid-jump above this deck
        if (s.flooded && f < WATER_LEVEL_Y) continue;                             // a sunk deck carries nobody
        return s;
      }
    }
    return null;
  }
}
```

**Entity adapters for `attach` and `_carry`:**

| Entity | `pos` | `turn(d)` | `free()` / notes |
|---|---|---|---|
| me | `ch.group.position` | `ch.group.rotation.y += d; g.cameraBaseRotation += d; g.smoothBody += d` | `!flight.active && !levitation.lifted && !swim.swimming && !isDeadLocal && !beds.lying && !animals.riding && !climb.on`; `feet = y - PLAYER_GROUND_OFFSET + (crouch ? 1 : 0)` |
| zombie (host) | `z.group.position` | rotation.y | `!z.lev` |
| animal (host) | `a.group.position` | rotation.y | `!a.lev`; a ridden horse carries its rider through `_ride` |
| loose item | `L.model.position` | rotation.y; also `L.hover` (chest loot floating up) | `!L.accio && !L.lev && !L.remote` |
| weapon (free) | `w.position` via `w.placeAt(pos, q)` (sleeping ones too) | yaw quaternion pre-multiply | `!w.holder && !w.remoteTarget` |
| ice balls (`water.resting`), a future corpse (#122) | same pattern | | |

- **Sailors** are simulated natively in ship-local coordinates and positioned with `toWorld` every frame, so they need no adapter.
- **Remote avatars** come from the network in the ship frame (Phase 10).

---

## Phase 6: sails and wind

### Spells

- **`SpellManager.matchSpell`**, inserted before the Wind line:

  ```js
  if (has('убрать парус', 'убери парус', 'свернуть парус', 'сверни парус') || (has('фёрл', 'ферл', 'furl', 'фурл') && !has('анф', 'энф', 'ан ф', 'unf'))) return 'Furl';
  if (has('анфёрл', 'анферл', 'анфёл', 'энфёрл', 'энферл', 'ан фёрл', 'ан ферл', 'unfurl', 'open sail', 'опен сейл', 'поднять парус', 'подними парус', 'открыть парус', 'паруса'))
      return has('макс', 'max', 'мах') ? 'UnfurlMaxima' : 'Unfurl';
  ```

  «раскрой паруса» is deliberately not supported, because «раскрой» is the Reveal token checked first.
- **`Combat.SPELL_COST`:** `Unfurl: 6, UnfurlMaxima: 14, Furl: 3`.
- **`ItemTypes.SPELL_RU`:** `Unfurl: 'Анфёрл', Furl: 'Фёрл'`. These are not in `SCROLL_SPELL_COLOR`, so they are known by default.
- **`Codex.js`** entries:
  - «Анфёрл»: point at the furled sails; the sails of that mast unroll. Maxima: all sails.
  - «Фёрл»: roll them up.
- **`Game.castLocalSpell`**, after the duel block: `if (name === 'Unfurl' || name === 'UnfurlMaxima' || name === 'Furl') return this.ships ? this.ships.castSails(name, text, isFinal) : null;`

### `castSails` and `windGust`

```js
castSails(name, text, isFinal) {
  const g = this.game, ch = g.character;
  const pref = g.magicHand || g.lastMagicHand || 'right';
  const side = ch.isArmRaised(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised(s));
  const say = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
  if (!side) return say('⛵ Поднимите руку к парусам и скажите «Анфёрл»');
  const tired = g.combat.check(name); if (tired) { g.hud.setVoice(tired, true); return null; }
  const o = g.castOrigin(side), d = g.items?.heldOf('wand')?.side === side ? g.wandMagic.dir(_d) : ch.getHandDirection(side, _d);
  const hit = this.raySails(o, d, 90);                       // nearest sail box (inflated 2 m) of awake ships
  if (!hit) return say('⛵ Покажите рукой (палочкой) на свёрнутые паруса');
  const open = name !== 'Furl' ? 1 : 0;
  const ids = (name === 'UnfurlMaxima' ? hit.ship.sails : hit.ship.sails.filter((s) => s.mast === hit.sail.mast)).filter((s) => s.target !== open && s.burnt < 1).map((s) => s.id);
  if (!ids.length) return say(open ? '⛵ Эти паруса уже раскрыты' : '⛵ Эти паруса уже свёрнуты');
  g.combat.pay(name); this._sparkLine(o, hit.point);
  if (this.auth) this.setSails(hit.ship, ids, open, g.localId); else g.sync?.send?.({ t: 'sunf', id: hit.ship.id, s: ids, o: open });
  g.spellSucceeded?.(name);                                  // mana practice (§14)
  return name;
}
// setSails (host): s.target = open for ids; hostility if the crew is alive and not loyal; shipev {k:'sails', s, o} to all
// each machine animates sail.open toward target at 1/3 per second (3 s to unroll)

windGust(origin, dir, power, casterId) {                     // hook from SpellManager.castWind (every machine)
  for (const s of this.awake) {
    let hitA = 0, furledHit = false;
    for (const sl of s.sails) {
      const c = s.pose.toWorld(sl.center.x, sl.center.y, sl.center.z, _v), to = _w.subVectors(c, origin), dist = to.length();
      if (dist > (power > 1 ? 80 : 45) || (dist > 3 && dir.angleTo(to.normalize()) > 0.7)) continue;
      if (sl.open < 0.5 || sl.burnt >= 1) { furledHit = true; continue; }
      hitA += sl.area * sl.open * (1 - sl.burnt); sl.gust = 1;                       // visible billow at once (all machines)
    }
    if (!hitA) { if (furledHit && (casterId === 'local' || casterId === this.game.localId)) this.game.hud.setVoice('🌬️ Паруса свёрнуты — ветру не во что дуть. Скажите «Анфёрл»', true); continue; }
    if (this.auth) {
      const gain = (power > 1 ? 14 : 7) * Math.min(1, hitA / (0.5 * s.sailArea));
      s.spellWind.x += dir.x / Math.hypot(dir.x, dir.z) * gain; s.spellWind.z += dir.z / Math.hypot(dir.x, dir.z) * gain;
      clampLen(s.spellWind, 16); s.tau = power > 1 ? 45 : 25;                       // «the wind dies down — cast again»
      if (!s.loyalTo(casterId)) this.crew.provoke(s, casterId);
    }
    if (casterId === 'local' || casterId === this.game.localId) this.game.spellSucceeded?.(power > 1 ? 'WindMaxima' : 'Wind');
  }
}
```

**`SpellManager.castWind`:** add at the end `this.hooks.windShips?.(origin, direction, power, casterId);`. The Game hook is `windShips: (o, d, p, c) => this.ships?.windGust(o, d, p, c)`. Guests' Wind arrives on the host through the existing `'spell'` message, so the host's hook applies their gust.

**Sail fill** is computed on every machine from the same inputs (`ships` snapshot `w`, ship `u`, `v`, `yaw`):

```js
sail.fillTarget = clamp(dot(Va, sailNormalWorld)² / 64, 0, 1) + sail.gust·0.5
sail.fill → fillTarget at 1.5/s; sail.gust decays 1/s
side = sign(dot(Va, n))
```

**Natural wind (host `_weather`).** Every 90 s while calm, a breeze starts with probability 0.3: 3–6 m/s from a random direction for 2–5 min, ramping over 20 s. While a Storm or weather is active, 9 m/s gusty. Sent in the `ships` snapshot. When the player is aboard: '🌬️ Подул ветер'.

**Moorings** (`ship.lines`):
- Each line: `{ bollard: world, bitt: local, L0, state: 'tied'|'free'|'cut', strain }`.
- `mooringForces`: a spring `k(d−L0)` along the rope at the bitt, with yaw torque `τ = lz·Fx − lx·Fz` divided by `L²/12`.
- A line snaps after more than 3 s at tension above 0.3 m/s² equivalent. Wind Maxima on full sails (≈0.39) snaps it ('🪢 Канаты лопнули!'); plain Wind (≈0.10) never does.
- A line is cut by a fast blade crossing it (§Phase 7), by Inferno along it (burns in 2 s), or by a Bombardo within its radius.
- While any line is tied, the hint is '⚓ Корабль привязан к причалу — снимите петлю каната с кнехта или перережьте канат'.

**Gangplank states:** `laid | aboard | fallen`. A laid plank whose ends are more than `length + 0.5` apart falls (splash, `shipev plank fallen`) and is gone after 10 s. If the crew is alive and loyal, it pulls the plank aboard when sails are set, and lays it when the ship stops within 3 m of a pier, parallel to it.

---

## Phase 7: hands (wheel, rope ladders, mooring eyes; hands never pass through)

### `HelmMath.js` (pure)

```js
export const HELM = { GRAB_R: 0.45, CLOSE_CURL: 0.55, OPEN_CURL: 0.35, RELEASE_CURL: 0.28, RELEASE_MS: 160, CLOSE_WINDOW_MS: 900,
                      LOCK: 2.5 * Math.PI /* ±1.25 turns */, MAX_RATE: 2.4, SLIP: 0.9, RETURN: 0.04 };
/** helm-local (x starboard, y up, looking along -z): 0 = top, + = clockwise as the helmsman sees it */
export const polar = (x, y) => Math.atan2(x, y);
export function unwrap(prev, a) { let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return prev + d; }
export function rimDist(x, y, z, rimR, handleR) { const r = Math.hypot(x, y); return Math.hypot(Math.max(0, Math.min(r - rimR, 0) + Math.max(0, r - handleR)), z); } // (on the rim…handle band, |z| off the plane)
export function steer(wheel, holds, dt, speed) {
  if (!holds.length) return wheel - Math.sign(wheel) * Math.min(Math.abs(wheel), HELM.RETURN * Math.abs(speed) * dt);  // rudder load eases it back
  let want = 0; for (const h of holds) want += h.w0 + (h.a - h.a0); want /= holds.length;
  const rate = HELM.MAX_RATE / (1 + Math.abs(speed) / 4);
  return Math.max(-HELM.LOCK, Math.min(HELM.LOCK, wheel + Math.max(-rate * dt, Math.min(rate * dt, want - wheel))));
}
```

### `Helm.js`

The `input` test hook mirrors `BookReading`.

- **Grab** (per side, same timing as Weapons):
  - Conditions: the hand is free (no weapon, item or book cover); the ship's `helmBy` is null or me; the fingers close within 900 ms of being open; and `rimDist(G_local) < GRAB_R`.
  - Effect: `held[side] = { a0: polar(G), w0: ship.wheel, a: a0 }`, `hand.setGrip(0.7)`, `ship.helmBy = me`.
  - Not loyal and crew alive: `crew.provoke(ship, me)` and '🏴 Матросы заметили, что вы взяли штурвал! К бою!'.
  - No crew left: `ships.capture(ship, me)`.
- **Hold:** `h.a = unwrap(h.a, polar(G))`, then `ship.wheel = steer(...)` on the host. A guest sends `shelm` at 10 Hz and the host applies the same `steer`.
- **Release:**
  - Open hand for 160 ms, or the hand more than `SLIP` from the rim: `setGrip(null)`. When both hands are free, `helmBy = null` and the guest sends `shelm` with `on: 0`.
  - Also released on death, flight, being lifted, or the ship flooding.
- **Drawing:**
  - A held hand is moved (`hand.group.position`, clamped to 0.45, as in `_pushHandBack`) so its grip point sits on the rim at angle `ship.wheel + (a0 − w0)`.
  - A free hand whose palm or fingertip points enter the rim torus, spoke capsules or hub is pushed out along the shortest exit, clamped to 0.6 (`BookReading._pushOut` technique).
- **Diagnostics for tests:** `reach(side)` (rim distance), `planeDist(side)`, `penetration(side)`.

### `Climb.js` (rope ladder, hand over hand)

- **Grab:** within 1.4 m of a ladder (swimming, on the pier, or on deck at the top), a closing fist within 0.35 m of a rung holds it. The rung is fixed in the ship frame.
- **On the ladder:** gravity and swimming are off, and the body moves by the hand's error: `body.y -= (handWorld.y − rungWorld.y)`, clamped to 1.5 m/s. The horizontal part keeps the body 0.9 m off the hull. Pulling the holding hand down raises the body; reaching up with the free hand and closing on a higher rung lets you climb.
- **Top:** when the feet are above the rail level, the body steps 1.2 m inboard onto the deck (attach).
- **Down:** lower the body by raising the hands. Letting go with both hands drops you.
- **Sailors** use ladders with a scripted climb, 8 s.

### Mooring eye by hand

A fist closing within 0.4 m of the eye on a bollard top, then the hand rising more than 0.6 m above the grab point within 2 s, lifts the eye off: `line.state = 'free'`, the rope drops and dangles from the bitt. A guest sends `smoor`.

**Blade cut:** in `Weapons.checkHits`, a held blade segment moving faster than 3.2 m/s whose swept segment passes within 0.15 m of a rope segment (`segmentSegmentDistSq`) cuts it (`smoor` with `how: 'cut'`).

### `_hands()`

Palm and fingertip points of both visible hands, in ship-local coordinates, are tested against layout solids (rails, masts, bulkheads, chests). They are pushed out (clamp 0.6) unless that hand holds the wheel, a rung or an eye.

---

## Phase 8: sailors and capture (`Sailors.js`)

- **Roster.** Deterministic from the ship id: names from the CastleLife lists, roles `captain`, `boatswain`, `sailor`.

  | Role | hp | armor | dmg |
  |---|---|---|---|
  | captain | 20 | 30 | 3 |
  | boatswain | 14 | 10 | 3 |
  | sailor | 10 | 0 | 2 |

  Looks: `VillagerModel` roles `'sailor'` (striped shirt, scarf or bandana, cutlass) and `'captain'` (tricorne, coat in the castle colour, cutlass). This means a new `tool: 'cutlass'` in `setHeldTool` and a new `hat: 'tricorne'`.
- **Sailor record:** `{ id: ship.id + ':c' + idx, ship, idx, role, name, title, model, group, isSailor: true, hp, armor, dead, damageCooldown, l: Vector3, lyaw, mode, path, foe, stunT, vy, overboard }`.
- **Movement and placement.** World pose each frame is `ship.pose.toWorld(l)`, `rotation.y = ship.yaw + lyaw`. They walk on the layout graph; ground is `floorAt(layout, l.x, l.z, l.y + 1.1)`, entirely ship-local. They never use world collision, so they cannot be "left behind".
- **Jobs.**
  - Captain near the helm on the quarterdeck (never holding it).
  - Bow lookout; rigging and capstan stations; patrol between stations.
  - At night, hammocks on the lower deck with one watchman awake.
- **Hostility** (`ship.hostile`: playerId → expiry): grabbing the wheel, Unfurl/Furl, Wind on its sails, hitting a sailor, damaging the ship (blast, fire), opening a ship chest, or lifting or cutting a line.

  Exception: crews of a ship whose port castle is owned by that player (`castleLife.state(castleId).owner`), or ships already captured by them, obey and are never provoked by their owner.
- **Fight** (host). Same ring of slots as `CastleLife._fight`, but in local coordinates.
  - The foe's local position comes from `ships.riders` (local player) or the remote avatar's `sh`.
  - A foe on the pier within 20 m of the gangway: sailors line up at the gangway and shout. Sailors never leave the ship.
  - Strikes reuse `castleLife.struck(dmg, x, z, title)` locally, or `sync.villagerStrike(foe, …)` (the existing `vstr` message).
- **Hits on sailors.**
  - Melee: `Game.onLocalHit` adds `if (z.isSailor) { this.ships.crew.hit(z, dmg, dir, this.localId, { magic: !!weapon?.magic }); return; }`. Guests send `shit`.
  - Targets for weapons: `this.ships.crew.targets()` is appended in `weapons.checkHits(...)`.
  - Spells: `Ships.hitRay` and `hitAt` are called from the `birdRay`, `lightningAt` and `applyExplosion` hooks.
- **Wind on sailors.** Pushed like zombies; above 6 m/s toward a rail within 3 m, they go overboard. Overboard sailors switch to world coordinates, swim to a ladder and climb back (8 s) if the ship is within 25 m and slower than 1.5 m/s. Otherwise they drown after 20 s.
- **Capture.** When the last crew member dies: `ship.owner` = whoever holds the wheel, else the last attacker; `ownerName` is saved; hostility is cleared; chests unlock; `shipev owner`; '⚓ Корабль ваш!'.
- **Network.**
  - Host sends `screw` at 8 Hz for ships with a player within 120 m: `[[idx, lx, ly, lz, lyaw, modeCode, hp, armor, dead]]`.
  - Guests render the crew.
  - Killed indices are saved; a re-spawned crew skips them.

---

## Phase 9: damage, fire, sinking, wreck (`ShipDamage.js` pure + `Ships`)

```js
export const DMG = { HOLE_K: 0.35, HOLE_MAX: 3, LEAK_K: 0.006, FIRE_GROW: 0.1, SPREAD_R: 7, SPREAD_P: 0.3, SPREAD_T: 4,
                     FIRE_DPS: 0.5, SAIL_BURN: 0.12, MAX_FIRES: 24, SINK_V0: 0.15, SINK_V1: 0.8, LIST_MAX: 0.38, PITCH_MAX: 0.1 };
export function blastDamage(dHull, radius, power) { const reach = radius + 3; if (!(dHull < reach)) return 0; return Math.round(35 * Math.pow(power, 0.8) * (1 - dHull / reach)); }
export const holeRadius = (radius) => Math.min(DMG.HOLE_MAX, DMG.HOLE_K * radius);
export function leakRate(holes, wlY, vol) { let L = 0; for (const h of holes) if (h.wy < wlY + 0.3) L += h.r * h.r * DMG.LEAK_K; return L / vol; }
export function stepFire(st, dt, rng, wet /*rain 3×, wave/waterball handled by events*/) { /* grow, spread (seeded), sails burn, return {hull, events} */ }
export function stepSinking(st, cls, dt, seabedY) { /* sinkY speed SINK_V0→SINK_V1, roll→side·LIST_MAX over 25 s, pitch→-PITCH_MAX;
   flooded when main-deck world y < water − 0.3; wreck when keel ≤ seabed + 0.3 */ }
```

- **Bombardo** (`Game.applyExplosion`, host authoritative): `ships.blast(pos, radius, power, casterId)`.
  - Hull distance via local coordinates gives the damage.
  - Within 2 m of the hull: a hole `{lx, ly, lz, r}` with a decal and splinters.
  - Fire with probability 0.6 (Maxima: 1).
  - Debris via `fx.debrisFrom` in plank colours.
  - Crew provoked.
  - Events `shipev hole` and `fire`.
  - A Bombardo orb hits the hull because `pointBlocked` now includes movers.
- **Inferno.** The `ignite` hook gains `this.ships?.igniteAlong(o, d, len, casterId)`: a ray against sails sets a sail on fire; against the hull or deck sets a deck fire. Lightning Strike hitting a mast: fire at the top and 25 damage. Thunderwave, Sapira and Sands: 5 damage, no fire.
- **Putting fire out.**
  - Rain: decay three times faster.
  - Wave Attack: a wave passing over a ship puts out fires within its width and gives the ship a push impulse.
  - A water ball splash: fires within 4 m.
  - Standing in a fire: 1 HP/s (`combat.damage` or `damageLocalPlayer`).
- **Leaks and fire damage.**
  - Leaks: holes below the waterline (recomputed each second with the current roll and sink) add flooding. A Bombardo hole at the waterline sinks a galleon in about 105 s; a Maxima hole in about 35 s.
  - Fire: hull damage `FIRE_DPS × Σ intensity` (10 spots on a galleon ≈ 80 s).
  - hp ≤ 0 adds 0.03/s flooding.
- **Sinking** starts when `flood ≥ 1`: '🌊 Корабль тонет!'.
  - The ship settles, lists and pitches bow down.
  - Riders whose floor drops below the water detach: players swim (`dryAt` is false once flooded), items fall through the water to the seabed, sailors drown or swim, animals swim.
  - When the keel reaches the seabed the ship becomes a wreck: frozen pose, colliders kept static (walkable underwater with Air Bubble), masts may stick out of shallow water, chests remain.
  - The wreck is saved.
- **Grounding:** '🪨 Корабль сел на мель'.

---

## Phase 10: multiplayer (host runs the ships)

| t | Direction | Payload | Rate |
|---|---|---|---|
| `ships` | host → all | `l: [[id, x, z, yaw, u, v, r, wheel, sinkY, flags, hp, flood100], …]`, `w: [wx, wz]`. Flags: 1 moored, 2 sinking, 4 wreck, 8 plank laid, 16 plank fallen, 32 flooded | 10 Hz (relayed: 6 Hz), awake ships only |
| `shipev` | host → all, reliable | `{ id, k: 'sails' \| 'hole' \| 'fire' \| 'fireout' \| 'burnt' \| 'line' \| 'plank' \| 'owner' \| 'sink' \| 'wreck' \| 'aground', … }` | on change |
| `screw` | host → all | `{ id, l: [[idx, lx, ly, lz, lyaw, mode, hp, armor, dead]] }` | 8 Hz |
| `shelm` | guest → host | `{ id, a, on }` | 10 Hz while holding; `on: 0` on release |
| `sunf` | guest → host | `{ id, s: [sailIds], o: 1\|0 }` | on cast |
| `smoor` | guest → host | `{ id, k, how: 'lift' \| 'cut' \| 'burn' }` | on action |
| `shit` | guest → host | `{ id: sailorId, dmg, d: [x, z], mg }` | on hit |
| `p` (extended) | everyone | `sh: [shipId, lx, ly, lz, lyaw]` while aboard | with the pose |
| `welcome` (extended) | host → guest | `ships: g.ships.snapshot()`, `config.gen` | once |

- **`NetSync._onMessage`** adds the matching cases:
  - `ships`, `screw`, `shipev`: applied only when not host.
  - `shelm`, `sunf`, `smoor`, `shit`: applied only on the host, with the sender from `m.from`, values clamped (dmg ≤ 30, |a| ≤ `HELM.LOCK`), and checked (helm owner, distance under 40 m to the ship).
- **Guest interpolation.** Snapshots are buffered; the ship is drawn at `now − 120 ms` (lerp x, z; angle-lerp yaw), with up to 300 ms extrapolation from u, v, r. Wave heave, roll and pitch, sail unfurl animation and fill are computed locally from the same inputs.
- **`RemoteAvatar.update(dt, ships)`:** with `s.sh` and a known ship, the avatar keeps its own local coordinates, lerps them toward the received ones, and gets its world pose each frame from this machine's view of the ship. This means no jitter and nobody slides off. Without `sh`, the old world path is used.
- **Zombies and animals on a moving deck** (host-simulated): their snapshot arrays get an optional trailing `[shipIdx, lx, ly, lz]` so guests place them in the ship frame.
- **Who keeps ships awake.** The host keeps a ship awake if any player is near it (`CastleLife._players` pattern). The host's terrain generates chunks under far ships lazily; unmodified chunks are evicted and regenerate identically.

---

## Phase 11: saving

- **`WorldKeeper.snapshot`** adds `gen` and `ships: g.ships?.snapshot()`. Only ships changed from their generated state are saved:

  ```js
  { id, cls, x, z, yaw, hp, flood, holes: [[lx, ly, lz, r]], burnt: [sailIds], open: [sailIds], owner, ownerName,
    crewKilled: [idx], lines: ['tied'|'free'|'cut', …], plank: 'laid'|'aboard'|'fallen', state: 'moored'|'free'|'sinking'|'wreck',
    sink: { y, roll, pitch } | null, fires: [[lx, ly, lz, k]] }
  ```

- **`restoreWorld`:** `if (save.ships) g.ships?.restore(save.ships)`, before the player snapshot is applied. This already runs earlier in `Game.init`.
- **`playerSnapshot`** adds `ship: me ? [id, lx, ly, lz] : null`. **`applyPlayerSnapshot`:** if the ship exists, the player is placed at `toWorld(l)` and the ship is woken.
- **Ownership by name:** `ownerName` is resolved to the current id when that player joins.
- **Welcome** sends the same snapshot plus all generated-but-awake state.

---

## 14. Mana hook (#123) and backlog items #126, #128

- **Mana practice.** Ships call `this.game.spellSucceeded?.(name)` only on real effects:
  - Unfurl, UnfurlMaxima or Furl that changed at least one sail
  - Wind or WindMaxima that filled at least one sail
  - Bombardo or Inferno that damaged or ignited a ship

  The mana feature decides the +1 rule and which spells count as "strong" for the one-time +3 (WindMaxima and BombardoMaxima are the obvious ones). Costs go through `g.combat.check/pay`, or their renamed mana equivalents.
- **Fishing rod (#126).** The ship chest loot table has a slot reserved for the rod.
- **Ships sailing between castles (#128).** AI captains drive the same API: `ship.wheel` set directly (no hands) and `setSails`. Sea castles already provide port berths as destinations. Boarding reuses rope ladders and crew fights.

---

## 15. Edge cases

1. **Tunnelling through the rail** at 7.5 m/s × 0.1 s: inside/outside is remembered per position object in `ShipCollider._side`. Riders stay inside unless their feet are above the rail top.
2. **Jumping on a moving deck:** the player is carried while above the hull footprint (`above < 14`) and lands on the same spot. In flight or while lifted by Leviosa, nobody is carried.
3. **Ship turning:** the yaw change goes to `cameraBaseRotation` and `smoothBody` too; otherwise the player's body would snap back to the old heading next frame.
4. **Heave:** carrying sets y from `toWorld`, so the 0.6 m falling threshold in `Character.update` is never tripped by waves.
5. **Lower deck below water when rolling or heaving:** `Swimming` uses `dryAt`, so no false drowning. Once flooded, it is real water.
6. **Standing on the gangplank** is not riding the ship. The plank end moves with heave; ground following handles it.
7. **Pier piles and the sea-tower bridge:** grounding uses `solidIn` at sample layers, so arches let the hull pass.
8. **Horse on deck:** carried; `_ride` uses `groundAt`.
9. **Chests and their loot** move with the ship. Floating loot is carried through `L.hover`.
10. **Building, doors, beds and campfires on deck** are refused or turned into a deck fire. Breakthrough under a ship raises the seabed into the hull, causing grounding and damage.
11. **Dying on a ship:** `onLocalDeath` calls `ships.onLocalDeath()`: release the wheel and rungs, detach. Respawn happens on land.
12. **Ship sails beyond awake range:** it sleeps (frozen) with its state kept and saved. Its model and collider are removed when it sleeps and re-added when it wakes.
13. **Old saves and old servers** use gen 1: no seas, bedrock at −9. Guests take `gen` from the host's config.
14. **Minimap** is untouched. A seed whose sea is far away costs nothing: `SeaSurface` stays inactive.
15. **Tests mode and custom maps:** `Ships.enabled = false`.
16. **Two players reaching for the wheel:** the first `helmBy` wins. The second player's hand is still pushed out of the wheel.
17. **Host leaves:** nothing new. The existing session end applies.
18. **Wind cast from ahead** fills the sails aback and pushes the ship astern, as physics says.
19. **Sails furled while moving:** thrust drops to zero and the ship coasts for 80–90 s (inertia).

---

## 16. Tests

### `tests/e2e/poses.mjs` additions (to `frame()`)

```js
// turn: rad — arms 'forward': both wrists rotated about their midpoint; > 0 = clockwise as the PERSON sees it
//   (image is not mirrored: the person's left hand (image right) goes up). Image rotation by θ = -turn:
//   x' = mx + dx·cos(-turn) - dy·sin(-turn); y' = my + dx·sin(-turn) + dy·cos(-turn)
// leftArm / rightArm: 'up' | 'forward' | 'down' | 'hang' — per-arm override (ladder climbing)
```

### Unit tests (`node --test`)

**`tests/unit/sea.test.js`**
- **Determinism.** Two `SeaIndex(4242)` give equal `cellOf` for the 8×8 cells around the origin. Two `TerrainData` with `generate({ seed: 4242, mountains: true, seas: true })` give equal `topLayer` at 400 sample points on sea and shore.
- **Rarity.** For seeds [12345, 777, 4242, 1, 7], 20–60% of 64 cells hold a sea. No sea point (s > −SEA.TAPER) lies within 1100 m of spawn: `signedDist` < −40 on a 50 m grid within r 1100.
- **Depth.**
  - `seaDepth(5) === 1`, `seaDepth(40)` ∈ [3, 6].
  - In the terrain, for a sea point with s ≥ 200: water layers ≥ 12 and `topLayer ≤ -12`, deeper than any lake (≤ 7).
  - The bedrock layer stays BEDROCK.
- **Beach.** For 50 shore angles, the column at s = −6 has top block SAND, height ∈ [0, 2], and no LEAVES or WOOD within 16 m inland.
- **Old world identical.** With `seas: false`, `topLayer` equals the pre-change height field at 400 sample points (store a fixture of 400 heights for seed 12345, generated before the change). With `seas: true`, columns with `signedDist < -40` equal the `seas: false` heights.
- **Waves.**
  - `max_t |seaWaveHeight(x, z, t, 4)| ≤ 0.2`, `max_t … (s=200) ≥ 0.6`, and `waveAmp(-3) === 0`.
  - The shore crest moves toward the shore: the zero crossing of `sin(0.45 s + 1.6 t)` at t+0.5 lies at smaller s.
- **Mesh skip.** With `skipSeaTop = true`, `buildChunkArrays` for an all-sea chunk has no water quads with normal +y at y ≈ −0.62. With the flag false, it has them (existing behaviour).

**`tests/unit/sea-castle.test.js`**
- At least one `variant: 'sea'` castle among cells ±6 for seeds 12345, 777 and 4242.
- **Quay level and water.** `topLayer` at the quay equals F = 2. A point 5 m seaward of the quay, outside piers and castle, is water.
- **Castle and port footprint.** All castle-wall-rect columns are solid at F. The back wall reaches the water: `v_back > vShore`.
- **Harbour depth.** Every berth's 6 hull-footprint sample points have water depth ≥ draft + 2 layers.
- **Piers.** Each pier's deck top = `pierLayer − 0.5` ± 0. Its far end reaches the berth's bow.
- **Village.** Every `house.door` column is dry (no water). The existing "every path can be walked" check passes for sea castles too.
- **Ship mix.** `port.ships.length` matches style (grand 3, fortress 2, compact 1). Classes are as in the table.

**`tests/unit/ship-layout.test.js`**
- Every floor lies inside the hull outline at its height. `floorAt` at each node returns the node's y ± 0.05. The graph is connected.
- **Path checks.**
  - From `gangway:+1` to `helm` and to `cabin`, every edge's midpoint has a floor (or ramp) within a 1.05 step.
  - The helm stand is on the quarterdeck.
  - Door gaps are ≥ 3.2 × 5.5.
  - Headroom (floor to the floor above) is ≥ 5.4.
- **Hero fits the helm.** Hands at shoulder height (stand.y + 3.25) are within `HELM.GRAB_R` + 0.6 of the rim top.

**`tests/unit/ship-collision.test.js`**
- `ShipPose` toWorld/toLocal round trip < 1e-9 for random poses. `toWorld(0, 0, -1)` with yaw π/2 gives (−1, ·, 0) relative to the origin (bow direction = hero forward).
- `floorAt` on the main deck midline returns `pose.y + deck`. Under the quarterdeck with `reachY = deck + 1` it returns the main deck, not the quarterdeck.
- **Rail.** A cylinder inside walking outward 0.9 m per call for 10 calls stays inside (`|lx| ≤ w − 0.4 − r`). In a gangway opening it exits. A swimmer outside walking inward stays outside.
- `pointBlocked` inside the hold is true; above the deck in the open it is false. `sphereDepth` on a deck gives a +y normal.
- **`CollisionWorld` with a mover.** `groundAt` over the deck is the deck; beside the hull it is the seabed. `resolveCylinder` pushes out of a mast.

**`tests/unit/ship-physics.test.js`** (galleon unless noted; fixed dt 1/30)
- **Wind Maxima from astern** (spellWind 14, τ = ∞, all sails open): u(5 s) ∈ [1.0, 2.0], u(20 s) ∈ [3.6, 4.8], u(60 s) ∈ [5.6, 6.2].
- **Plain Wind 7:** steady u ∈ [1.8, 2.6]. Pinnace steady top with Maxima ∈ [7.0, 7.8].
- **Coasting:** from u = 5 with no wind, u > 1 at 60 s and u < 1 at 100 s.
- **Rudder:** at u = 4 with wheel = +LOCK, yaw decreases (starboard) by π/2 within 25–45 s. At u = 0 with full wheel, |Δyaw| < 0.01 over 20 s. Wheel = −LOCK turns the other way.
- **Aback:** wind from ahead (W = −14·fwd) on a ship at rest gives u < 0 after 10 s.
- **Furled:** `openFrac = 0` gives zero thrust.
- **Wind decay:** with τ = 45, |spellWind(6 s)| / |w0| ∈ [0.83, 0.92].
- **Grounding:** heading at 5 m/s into a solid wall (`solidAt` returns true for x > 50) stops with u < 1, `onHit` called with damage ≥ (5 − 1.5)·12·0.9, and no point penetrates more than 0.5 m.
- **Moorings:** with lines tied, plain Wind drifts the ship < 1.5 m in 60 s and no line breaks. Maxima on full sails breaks a line between 3 and 8 s.
- **`waveResponse`:** with `calm` (sample = 0), roll = pitch = heave = 0. With a sample that is higher on the starboard side, roll > 0.

**`tests/unit/helm.test.js`**
- `polar(0, 1) = 0`, `polar(1, 0) = +π/2` (clockwise).
- `unwrap` across ±π continues smoothly (3.1 → −3.1 gives ≈ 3.18).
- `steer`: one hand moved +1 rad from its grab gives a wheel +1 after 1 s at speed 0 (rate 2.4). At speed 8, the rate is ≤ 0.8 rad/s. The lock is clamped at ±2.5π.
- Two hands averaged: one at +0.4 and one at +0.2 give +0.3. With no hands and speed 4, |wheel| decreases.
- `rimDist` is 0 on the rim and 0.3 for a point 0.3 m off the plane.

**`tests/unit/ship-damage.test.js`**
- `blastDamage(0, 3.6, 1) = 35`, `(0, 6.2, 3) ≈ 84`, and 0 beyond `radius + 3`. `holeRadius(3.6) = 1.26`, `(6.2) = 2.17`.
- `leakRate` for one waterline hole of r 1.26 with vol 1 is ≈ 0.0095/s. A hole 2 m above the waterline gives 0, but becomes > 0 when roll brings it under.
- Fire with a seeded rng: from one spot, the spot count grows and is ≤ 24. A sail with a spot reaches burnt = 1 within 7–10 s. `wet` (rain) shortens a spot's life by at least 2.5 times.
- `stepSinking`: flooded becomes true when the deck goes under; wreck becomes true when the keel ≤ seabed + 0.3; |roll| ≤ `LIST_MAX`.

**`tests/unit/ship-net.test.js` and spells**
- `packShip`/`unpackShip` round trip (2 decimals).
- `matchSpell`:
  - 'анфёрл', 'Анферл!', 'unfurl', 'open sails', 'подними паруса' → Unfurl
  - 'анфёрл максима' → UnfurlMaxima
  - 'фёрл', 'убрать паруса' → Furl
  - 'вайнд' → Wind, 'бомбардо максима' → BombardoMaxima, 'даст' → Sands, 'раскрой свои секреты' → Reveal (unchanged)
- `SPELL_COST` has Unfurl/UnfurlMaxima/Furl.

### E2E tests (Playwright; `frames()` as in `castles.test.mjs`)

Shared test hooks used below: `g.ships.calm = true`, `ship.forced = { u, r }`, and `g.ships.wake(id)`. Constants (such as `BLOCK.SAND = 9`) come from `window.__zns`.

**`tests/e2e/sea.test.mjs`** (creative)
- Teleport to `sea.pointAt(sea, 0.7, 200)`, `flushAround`, 30 frames.
- Terrain: `topLayer ≤ -12` there; the s = −6 column top is SAND.
- `world.seaSurface.mesh.visible`; `amp(4) < 0.2`, `amp(200) > 0.6`; `uTime` increases between two reads.
- Swimming: player at y = −1 in deep sea: after 2 s `swim.swimming === true`. Its float y follows `seaWave` within 0.3 over 40 frames: it bobs, and the y range over 2 s is > 0.1.
- `realErrors(errors)` is empty.

**`tests/e2e/port.test.mjs`** (creative)
- Find the nearest sea castle and teleport to the quay.
- **Ships at berth:** `ships.list` holds `port.ships.length` ships within 10 frames, each `state === 'moored'`, all sails `target === 0`, plank `'laid'`, `crew.alive(ship) === crew size`.
- **Walk aboard:**
  - Put the player on the pier 6 m before `plankA`, `cameraBaseRotation` facing along the plank.
  - Feed `{ arms: 'hang', bob: i % 2 ? 0.006 : -0.006 }` until `g.ships.me?.ship.id === ship.id` (≤ 300 frames).
  - Assert feet y within 0.3 of `pose.toWorld(0, deck, 0).y`.
- **Rail:** keep walking toward the far side for 120 frames. Still a rider, local |x| ≤ B/2 − 0.4.
- **Captain's cabin:** teleport to the cabin door outside, face aft, walk 90 frames. `roomAt(local) === 'Каюта капитана'` and the floor above the head is the quarterdeck. The chest there has `locked === true`.

**`tests/e2e/ships-sail.test.mjs`** (creative, `ships.calm = true`)
- Release the lines through `ships.debugRelease(ship)`. The hand path is covered in the helm/ladder test.
- **Unfurl:**
  - Stand on the quarterdeck facing the main mast; feed `{ arms: 'up' }` × 15.
  - `castLocalSpell('анфёрл', true) === 'Unfurl'`.
  - After 4 s: main-mast sails `open ≥ 0.99`, the sail mesh bounding box height ≥ 0.9·spec h, fore sails still `target 0`.
- **Wind:**
  - Face the bow, arm raised; `castLocalSpell('вайнд максима', true) === 'WindMaxima'`.
  - Within 1 s: |spellWind| > 6; main course `fill > 0.5`; its maximum vertex displacement > 1.0 m with sign = sign(dot(wind, sail normal)).
- **Heavy:** at 5 s, 0.2 < u < 2.2; at 25 s, u > 2.5. Decay: |spellWind(t + 6)| / |spellWind(t)| ∈ [0.8, 0.95].
- **Carry sync:**
  - `ship.forced = { r: 0.03 }` for 4 s.
  - Player (no input), a loose item spawned on deck, and a sleeping zombie on deck: |Δlocal| < 0.15 / 0.1 / 0.2.
  - (Player yaw − ship yaw) changes by less than 0.02.
- **Inertia:** set `spellWind` to 0, `forced = null`. After 10 s, u > 0.6·u0.
- **Furl:** `castLocalSpell('фёрл', true)` pointing at the main mast. After 4 s, `open ≤ 0.01`.

**`tests/e2e/helm.test.mjs`** (creative)
- Teleport to `layout.helm.stand` (world), yaw = ship yaw.
- **Align:** feed forward arms with curl 0, searching `wristOffset[1]` in −0.08..0.08 step 0.02 and shifting the player along ship-forward by `-planeDist`, until `helm.reach('left') < 0.4 && helm.reach('right') < 0.4`. Assert alignment was found.
- **Grab:** feed curl 1 × 10. `helm.held.left && helm.held.right`, `ship.helmBy === g.localId`, drawn grip points within 0.12 of the rim.
- **Turn:** for i = 1..15, feed `{ arms: 'forward', turn: 0.04 * i, leftCurl: 1, rightCurl: 1 }` × 2. Then `ship.wheel > 0.35` and the wheel model `rotation.z ≈ -ship.wheel` (± 0.01).
- **Effect:** `ship.forced = { u: 4 }`; after 3 s, Δyaw < −0.05. Turn back to −0.6; after 3 s, yaw rate > 0.
- **Release:** curl 0 × 10. Both hands released, `helmBy === null`, `gripOverride === null`.
- **No pass-through:** open hands pushed forward (`forward: 0.15`). `helm.penetration('right') < 0.05`.
- **Ladder:**
  - Teleport into the water at the ladder.
  - Alternate `{ leftArm: 'up', leftCurl: 1, rightCurl: 0 }`, then `{ leftArm: 'forward', leftCurl: 1 }` (pull), then the mirrored right-hand pair, for 6 cycles.
  - Body y rises by ≥ 3 rungs (2.7 m). At the top, the player becomes a rider.

**`tests/e2e/sailors.test.mjs`** (freeworld)
- Board and grab the wheel (or `helm._grab` through the `input` hook).
- `ship.hostile.has(localId)`. Within 6 s, some sailor `mode` is `'run'` or `'attack'`.
- Within 15 s, `combat.hp < 20` ('⚔️ … ударил вас').
- Kill the crew: loop `g.onLocalHit(sailor, 12, null, true)` with `damageCooldown = 0`. Then `ship.owner === localId`, `hostile.size === 0`, ship chests `locked === false`.
- **Wind overboard:** in a fresh ship, `castLocalSpell('вайнд максима')` at a sailor near the rail. That sailor's `overboard !== null` within 2 s.

**`tests/e2e/ship-damage.test.mjs`** (creative, damage enabled on ships)
- **Bombardo:** `g.explode(hullPointAtWaterline, 3.6, 'local', 1)`. Then `hp ≤ 420 − 30`, `holes.length === 1`, `flood > 0` after 3 s.
- **Inferno:** `castLocalSpell('инферно')` at the unfurled main course. Within 10 s, `burnt === 1` and the sail mesh is hidden.
- **Sinking:**
  - Set `ship.hp = 0`; place the player on deck.
  - Within 40 s, `state === 'sinking'` and pose y decreases monotonically.
  - When flooded, `swim.swimming === true` and the player is not a rider.
  - Eventually `state === 'wreck'` and keel y ≤ seabed + 0.5.
  - An item that was on deck rests on the seabed (y < −3).

**`tests/e2e/multiplayer.test.mjs`** (new test, same harness)
- Host and guest. The guest teleports onto the host's galleon deck. The host forces `{ u: 3, r: 0.02 }` for 5 s.
- **Guest screen:** `ships.me.ship.id === id` and local Δ < 0.2.
- **Host screen:** the guest avatar is within 0.4 m of `ship.pose.toWorld(sh)`.
- **Guest helm:** the guest grabs the wheel through the `helm.input` hook and turns to +0.5. Within 2 s, the host's `ship.wheel > 0.4` and `helmBy === guestId`.
- **Guest Unfurl:** on the host, `sails[...].target === 1` within 1 s; on the guest, `open → 1`.
- **Guest hits a sailor:** the host's `hp` decreases.

**`tests/e2e/world.test.mjs`** (save, added case)
- Move, capture and partly burn a ship; `keeper.snapshot()` includes the ship.
- Reload and continue the saved world: ship pose within 0.5 m, `owner`, `open`, `burnt`, `crewKilled`, `holes` restored, and the player is back on deck (rider).
- A gen-1 saved world fixture continues with no `seas` and `bedrockTop === -9`.

---

## 17. Order of work and risks

- **Order:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Each phase ships with its own unit and e2e tests. Phases 10 and 11 items (`sh` in `p`, snapshot fields) should be wired as each phase lands, so multiplayer never breaks in between.
- **Tuning knobs:** `SEA.CHANCE`, `WAVES.ampOpen`, `SHIP_CLASSES` (`sailK`, `c1`, `c2`, `kRud`, `yawD1`), wind gains 7/14 and τ 25/45, `HELM.MAX_RATE`, `DMG.*`.
- **Risks:**
  - Shore texture cost (sliced over frames).
  - Swiftshader test speed with the sea mesh and a ship. Use LOD, and `calm` in tests.
  - The Unfurl voice tokens need checking against real speech-to-text output.
  - The test-alignment search depends on synthetic-pose arm geometry, hence the `reach`/`planeDist` loop rather than fixed offsets.