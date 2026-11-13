# Root cause of disappearing spell launches

Introduced with the separate horse neck/head/leg capsules in a09ddb5, during elemental work. The torso capsule used current coordinates, but the new neck/leg capsules mixed a fresh parent world position with a stale descendant `matrixWorld`: `getWorldPosition()` updates the queried node and its parents, not its children; Three.js r128 `localToWorld()` does not update matrices. Thus a horse moving before rendering, or frozen/hidden by LOD, could acquire an invisible capsule spanning from its present limb to its previous position.

Minimal reproduction: move a horse from (0,0,-50) to (100,0,-100) without rendering. Before the fix: neck capsule 111.55 m, four leg capsules 111.81–111.82 m. They intercept unrelated rays, point-blank selection and spells near players across that span.

Real Creative replay with actual synthetic camera landmarks through PoseService, a held wand and the entire Game.frame pipeline (no ray/picking/collision overrides): Jolt aimed toward the earth mage selected animal cH1 and hit it immediately (16 ms), with the head still at the launch position. Avada aimed at the air mage likewise selected cH1, hit in 8 ms, and left the mage at 32 HP. Earlier tests overwrote `_myRay` and did not reproduce this moving-descendant case. Rendering was replaced by explicit scene/camera matrix updates during accelerated simulation; this is a gameplay/collision replay, not a GPU performance benchmark.

Fix: explicitly update the head/lower-leg world matrices immediately before transforming those capsule endpoints. The same `_bodies` feeds target selection, point-blank launch and swept projectile hits, so all use compact actual horse bodies.

After the fix, same real pose/wand pipeline with a forward aim: Jolt selected creative-earth:1 and hit in 561 ms; Avada selected creative-air:1 while the air NPC had fly=true after takeoff, and killed it in 315 ms. No page errors. The test asserts both targets/outcomes. Two regression tests cover moved, rotated, hidden/frozen and grazing horses; unrelated mid-span spells remain clear. 46 focused horse/duel/creature-state tests passed.

This addresses the confirmed spell-blocking regression. The earth mage's long mana-recovery waits and battle movement are separate work; do not report them fixed by this collision patch.
