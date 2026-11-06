// ONE picture of the apples in the hand: the old and the new (AppleModel.js draft) — red and golden; three views of each (3/4, from above, from below).
// Usage: node tools/apple-item-screenshot.mjs [--out docs/media/apples-new.png]   (ZNS_CHROME=/path/to/chrome)
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media/apples-new.png'));
const srv = await startServer(Number(arg('--port', 8895)));
const browser = await launch();
const guard = setTimeout(() => process.exit(1), 150000);
try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(srv.url + 'tools/tree-view.html');
    const url = await page.evaluate(async () => {
        const THREE = await import('three');
        const { newAppleModel } = await import('/src/game/AppleModel.js');
        const { makeItemModel } = await import('/src/game/ItemTypes.js');
        const W = 1000, H = 1000, cols = 2, rows = 3, cw = W / cols, ch = H / rows;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
        r.setScissorTest(true);
        const models = [() => makeItemModel({ kind: "redApple" }), () => makeItemModel({ kind: "apple" })];
        const views = [[0.34, 0.24, 0.42, 0, 0.02, 0], [0.04, 0.55, 0.16, 0, 0.1, 0], [0.12, -0.5, 0.2, 0, -0.04, 0]];
        r.setClearColor(0x2a2f3c);
        for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) {
            const s = new THREE.Scene();
            s.background = new THREE.Color(row % 2 ? 0x30364a : 0x363d52);
            s.add(new THREE.HemisphereLight(0xdfeaff, 0x4a3a2a, 0.75));
            const key = new THREE.DirectionalLight(0xfff0d8, 1.1); key.position.set(0.6, 1.2, 0.9); s.add(key);
            const rim = new THREE.DirectionalLight(0x9fc0ff, 0.45); rim.position.set(-1, 0.4, -0.8); s.add(rim);
            const m = models[c](); s.add(m);
            const v = views[row], cam = new THREE.PerspectiveCamera(34, cw / ch, 0.05, 10);
            cam.position.set(v[0], v[1], v[2]); cam.lookAt(v[3], v[4], v[5]);
            const x = c * cw, y = H - (row + 1) * ch;
            r.setViewport(x, y, cw, ch); r.setScissor(x, y, cw, ch);
            r.render(s, cam);
        }
        return cv.toDataURL('image/png');
    });
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    console.log('saved', out);
} finally { clearTimeout(guard); await browser.close(); srv.stop?.(); }
process.exit(0);
