# Swan preview and waterline correction

The previous natural-flock screenshot showed morphing wings with hidden bodies. The screenshot moved its camera while gameplay was paused, so Animals._lookFar had not cleared the old matFrozen flag. FarBatch correctly suppressed those bodies while the separate morph wings still rendered. This was a paused snapshot preparation error, not proof that the game had spawned wing items instead of birds.

The shared shot helper now refreshes the camera matrix, ordinary animal visibility, scene matrices and FarBatch bounds before rendering. Both distant and close natural-flock screenshots show complete bodies, necks, heads and bills. No forced model visibility or replacement spawns are used.

The close view also exposed a real half-metre floating offset: floatY added 0.5 to waterAt's already computed surface. That addition is removed; the model's WATERLINE now lies on the actual water surface. Nine swan tests passed, including exact waterline alignment, actual automatic flocks and blocked-takeoff escape. The final real-browser replay produced three inspected images with no page errors.
