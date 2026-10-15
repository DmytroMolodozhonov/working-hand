#!/usr/bin/env node
/**
 * neighborbench.mjs — how much the game loses when it shares the browser's process with another
 * tab that draws (a video, another 3D page): the reason for the game's own engine process
 * (launcher/zns_browser.py, docs/plans/desktop.md). Run: node tools/neighborbench.mjs [--seconds 15]
 *
 *   один         — the game alone;
 *   общий        — the game + a drawing tab in the SAME browser process (as the game opened before
 *                  when the user's Chrome was already running: one GPU process for both);
 *   свой процесс — the game in its own browser process, the drawing tab in another one (as now).
 * Here the picture is drawn by the processor (SwiftShader): the numbers show the share, not real FPS.
 */
import { startServer, launch, openPage, startFromMenu, sleep } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const SECONDS = Number(args[args.indexOf('--seconds') + 1]) || 15;
const PORT = 8161;
// a tab that draws all the time on the video card (a heavy full-window shader, every frame)
const NEIGHBOR = 'data:text/html,' + encodeURIComponent(`<canvas id=c width=1280 height=720 style="width:100vw;height:100vh"></canvas><script>
const gl=c.getContext('webgl');const s=(t,x)=>{const o=gl.createShader(t);gl.shaderSource(o,x);gl.compileShader(o);return o};
const p=gl.createProgram();gl.attachShader(p,s(gl.VERTEX_SHADER,'attribute vec2 a;void main(){gl_Position=vec4(a,0,1);}'));
gl.attachShader(p,s(gl.FRAGMENT_SHADER,'precision highp float;uniform float t;void main(){vec2 u=gl_FragCoord.xy/400.;float v=0.;for(int i=0;i<60;i++){u=abs(u)/dot(u,u)-.7+.01*sin(t);v+=length(u);}gl_FragColor=vec4(v*.01,v*.02,v*.03,1);}'));
gl.linkProgram(p);gl.useProgram(p);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);const u=gl.getUniformLocation(p,'t');
(function f(t){gl.uniform1f(u,t/1000);gl.drawArrays(gl.TRIANGLES,0,3);requestAnimationFrame(f)})(0);</script>`);

async function gameFps(page) {
    return page.evaluate((sec) => new Promise((res) => {
        const d = []; let last = performance.now(); const end = last + sec * 1000;
        (function f() { const now = performance.now(); d.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else {
            d.shift(); d.sort((a, b) => a - b); const avg = d.reduce((a, b) => a + b, 0) / d.length;
            res({ fps: +(1000 / avg).toFixed(1), p95ms: +d[Math.floor(d.length * 0.95)].toFixed(1), frames: d.length });
        } })();
        requestAnimationFrame(() => { last = performance.now(); });
    }), SECONDS);
}

async function run(name, withNeighbor, sameProcess) {
    const game = await launch();
    let other = null;
    if (withNeighbor) {
        const host = sameProcess ? game : (other = await launch());
        const n = await host.newPage({ viewport: { width: 1280, height: 720 } });
        await n.goto(NEIGHBOR);
    }
    const { page } = await openPage(game, `http://localhost:${PORT}/`, { noCamera: true, viewport: { width: 640, height: 360 } });
    await startFromMenu(page, 'creative');
    await sleep(8000); // (the world around is built)
    const r = await gameFps(page);
    await game.close(); await other?.close();
    console.log(`${name.padEnd(14)} FPS ${String(r.fps).padStart(5)}   95% кадров быстрее ${r.p95ms} мс   (${r.frames} кадров)`);
    return r;
}

const srv = await startServer(PORT);
try {
    await run('один', false, false);
    await run('общий', true, true);
    await run('свой процесс', true, false);
} finally { srv.stop(); }
