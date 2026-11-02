// Снимок подсказок карманов в окне камеры: node tools/pocket-hints-screenshots.mjs → docs/media/pocket-hints.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('..', import.meta.url)); // (works on Windows too: a URL's pathname there is «/C:/…»)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); });
await new Promise((ok) => srv.listen(0, ok));
const b = await chromium.launch({ executablePath: process.env.ZNS_CHROME || undefined }), p = await b.newPage({ viewport: { width: 1700, height: 330 } });
p.on('pageerror', (e) => console.error(e));
await p.goto(`http://localhost:${srv.address().port}/tools/pocket-hints-view.html`);
await p.waitForFunction(() => window.__ready);
fs.mkdirSync(path.join(root, 'docs/media'), { recursive: true });
await p.screenshot({ path: path.join(root, 'docs/media/pocket-hints.png') });
await b.close(); srv.close();
