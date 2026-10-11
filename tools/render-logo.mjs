// Renders assets/logo/logo.svg to PNGs (several sizes) with Chromium; ICO/ICNS come from tools/make-ico.py.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'logo');
const svg = readFileSync(path.join(dir, 'logo.svg'), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const page = await browser.newPage();
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="display:block;width:${size}px;height:${size}px" `)}</body></html>`);
  const out = path.join(dir, size === 512 ? 'logo.png' : `logo-${size}.png`);
  await page.screenshot({ path: out, omitBackground: true });
}
await browser.close();
