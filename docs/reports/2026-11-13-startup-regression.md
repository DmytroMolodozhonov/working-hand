# Startup regression hotfix

The published 91c6e24 build reproduced the entry exception `TypeError: this.waves.sampleModel is not a function` during Game's full prewarm. `sampleModel()` had accidentally been inserted into Spray rather than WaveAttacks. Fast screenshot scenes skip full prewarm, so gameplay screenshots passed without exercising this interface.

Moved the method to WaveAttacks; regression test calls it before any live wave exists. An isolated checkout of the published build first failed, then completed the entire prewarm object/sample construction path (504 render/compile calls substituted with no-ops to keep the software renderer from dominating the test). This verifies construction/interfaces, not driver performance. The new wave/guard/refraction shader renders were checked separately in actual game scenes.

Startup exceptions no longer reload away after four seconds. Their bounded diagnostic record is kept separately from world saves, with persistent in-game details/copy/back-to-menu controls. The previous error is visible on the next menu visit, and only a successful world entry clears it. A failed partial world stays inactive and its save-on-hide listener is detached. Existing graphical-context recovery records its reason too.

Checks: wave/source/startup persistence tests, code-health (14 passing checks in the combined run), actual browser fault injection (message remains after the former four-second timeout, survives reload, failed game inactive), full prewarm sample-construction probe.
