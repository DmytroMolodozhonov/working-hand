// The cost of a titan fight (the author 08.11: «просадка FPS при сражении»): the hero is put near a titan on its planet, the titan wakes and fights; for FIGHT_S seconds the
// JS time of every titan method per frame is summed (mean / worst / spikes over 4 ms) and the renderer's calls / triangles / geometries / textures / programs are watched.
//   node tools/shot.mjs titan-perf [--args '{"only":["saturn","venus"],"secs":20}']   (prints only; no pictures)
export default async function (h, args) {
    const g = h.g, Ti = g.titans;
    const { TITANS } = await import('/src/game/TitanRules.js');
    const { slotRect } = await import('/src/world/Planets.js');
    const ids = args?.only || ['saturn', 'venus', 'neptune', 'jupiter'];
    const secs = args?.secs || 20;
    for (const id of ids) {
        for (const k of [...Ti.active.keys()]) Ti._drop(k);
        const def = TITANS[id], home = Ti.home(id);
        if (!home) { h.log(id, 'no home'); continue; }
        await h.go(home.x + 120, 400, home.z + 120, true);
        await h.go(home.x + 60, 400, home.z + 60, true);
        await h.until(() => g.space?.realm === def.planet, 25000);
        await h.frames(90);
        if (!Ti.active.get(id)) Ti._build(id, { x: home.x, y: 0, z: home.z });
        const T = Ti.active.get(id);
        if (!T) { h.log(id, 'not built'); continue; }
        // what the body itself costs: parts, triangles, shadow casters (a body of many separate parts is one draw call each — and again in the shadow pass)
        { let meshes = 0, tris = 0, casters = 0, skinned = 0, transp = 0;
          T.model.traverse((o) => { if (!o.isMesh) return; meshes++; const gm = o.geometry; tris += (gm.index ? gm.index.count : gm.attributes.position.count) / 3; if (o.castShadow) casters++; if (o.isSkinnedMesh) skinned++; if (o.material?.transparent) transp++; });
          h.log(id, 'BODY meshes', meshes, 'tris', Math.round(tris), 'shadow casters', casters, 'skinned', skinned, 'transparent', transp); }
        // wrap the titan methods with timers
        const names = ['update', '_think', '_draw', '_stepFx', '_netSend', 'hit'];
        const acc = {}; const orig = {};
        for (const n of names) {
            if (typeof Ti[n] !== 'function') continue;
            acc[n] = { sum: 0, max: 0, spikes: 0, calls: 0 };
            orig[n] = Ti[n];
            Ti[n] = function (...a) { const t0 = performance.now(); const r = orig[n].apply(this, a); const d = performance.now() - t0; const A = acc[n]; A.sum += d; A.calls++; if (d > A.max) A.max = d; if (d > 4) A.spikes++; return r; };
        }
        const info = g.renderer.info;
        const before = { calls: info.render.calls, tris: info.render.triangles, geo: info.memory.geometries, tex: info.memory.textures, prog: info.programs?.length };
        // the hero stands near it; the titan wakes (its foe) and fights; now and then the hero shoots it with a spell so the hit paths run too
        g.character.group.position.set(T.pos.x + def.radius * 2.2, T.pos.y + 3, T.pos.z + def.radius * 2.2);
        let frames = 0, worst = 0, sumFrame = 0, last = performance.now(), peakCalls = 0, peakTris = 0, shot = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < secs * 1000) {
            await h.frames(1);
            const now = performance.now(); const d = now - last; last = now; frames++; sumFrame += d; if (d > worst) worst = d;
            peakCalls = Math.max(peakCalls, info.render.calls); peakTris = Math.max(peakTris, info.render.triangles);
            if (frames % 45 === 0 && T.mode !== 'dying') { Ti.hit(T, 5, 'Bombardo', g.localId, null, T.pos.clone()); shot++; }
        }
        const after = { calls: info.render.calls, tris: info.render.triangles, geo: info.memory.geometries, tex: info.memory.textures, prog: info.programs?.length };
        for (const n of Object.keys(orig)) Ti[n] = orig[n];
        h.log(id, 'mode', T.mode, 'stage', T.stage, 'hp', Math.round(T.hp), '| frames', frames, 'mean frame', (sumFrame / frames).toFixed(1), 'worst', worst.toFixed(0), 'ms | shots', shot);
        h.log(id, 'draw calls', before.calls, '→ peak', peakCalls, ' tris', before.tris, '→ peak', peakTris, ' geometries', before.geo, '→', after.geo, ' textures', before.tex, '→', after.tex, ' programs', before.prog, '→', after.prog);
        for (const [n, A] of Object.entries(acc)) h.log(id, n.padEnd(9), 'mean', (A.sum / Math.max(1, frames)).toFixed(2), 'ms/frame  worst', A.max.toFixed(1), ' spikes>4ms', A.spikes, ' calls', A.calls);
    }
}
