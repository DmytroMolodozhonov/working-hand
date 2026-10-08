/**
 * CameraPanel.js — when the camera doesn't start.
 *
 * Explains why in plain words (blocked by the browser or by Windows, busy in
 * another program, not found), lists the cameras of the computer to choose
 * from and keeps retrying by itself, so the game continues as soon as the
 * camera works. «Играть без камеры» closes it.
 */

import { PoseService } from '../input/PoseService.js';

const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
const isEdge = typeof navigator !== 'undefined' && /Edg\//.test(navigator.userAgent);

function reasonText(err) {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return {
            title: 'Камера запрещена',
            body: `Браузер или Windows не дают игре камеру.<br>
                1) Нажмите на значок 🔒 (или значок камеры) слева от адреса вверху → «Камера» → <b>Разрешить</b>${isEdge ? ' (в Edge: «Разрешения для этого сайта»)' : ''}.<br>
                ${isWindows ? '2) Windows: Пуск → Параметры → Конфиденциальность и защита → Камера → включите «Доступ к камере» и «Разрешить классическим приложениям доступ к камере».<br>' : ''}
                Игра попробует снова сама, как только камеру разрешат.`,
            settings: isWindows,
        };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError' || name === 'NoFramesError') {
        return {
            title: 'Камера занята или не отвечает',
            body: `Скорее всего, камеру держит другая программа: Telegram/Discord/Zoom (звонок), OBS, Skype, другая вкладка браузера.<br>
                Закройте её — игра подключит камеру сама. Или выберите другую камеру ниже.`,
        };
    }
    if (name === 'InsecureError') {
        return {
            title: 'Камера недоступна по этому адресу',
            body: 'Откройте игру по адресу <b>http://localhost:8000</b> (браузер даёт камеру только так).',
        };
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
        return {
            title: 'Камера не найдена',
            body: 'Подключите веб-камеру (или проверьте, что она включена кнопкой/шторкой на ноутбуке) — игра найдёт её сама.',
        };
    }
    return { title: 'Камера не включилась', body: 'Проверьте, что камера подключена и не занята другой программой.' };
}

/**
 * Shows the panel and resolves true when the camera works, false for «без камеры».
 * @param {PoseService} poseService  already initialized; start() failed with `error`
 */
export function showCameraPanel(poseService, error) {
    return new Promise((resolve) => {
        const el = document.createElement('div');
        el.id = 'camera-panel';
        el.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);font-family:inherit;padding:16px;';
        el.innerHTML = `
            <div style="background:#1e272e;color:#fff;max-width:560px;width:100%;border-radius:14px;padding:22px 24px;box-shadow:0 10px 40px rgba(0,0,0,.6);border:2px solid #ff4757">
                <h2 id="cp-title" style="margin:0 0 10px;color:#ff6b81;font-size:22px">📷</h2>
                <div id="cp-body" style="line-height:1.5;font-size:15px;color:#dfe6e9"></div>
                <div style="margin-top:16px">
                    <label style="display:block;margin-bottom:6px;color:#a4b0be">Камера:</label>
                    <select id="cp-select" style="width:100%;padding:8px;border-radius:8px;font-size:15px"></select>
                </div>
                <div id="cp-status" style="margin-top:12px;color:#55efc4;min-height:20px;font-size:14px"></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
                    <button id="cp-retry" style="flex:1;min-width:150px;padding:10px;border:0;border-radius:8px;background:#27ae60;color:#fff;font-size:15px;cursor:pointer">🔄 Попробовать снова</button>
                    <a id="cp-settings" href="ms-settings:privacy-webcam" style="display:none;flex:1;min-width:150px;padding:10px;border-radius:8px;background:#2f3542;color:#fff;font-size:15px;text-align:center;text-decoration:none">⚙️ Настройки камеры Windows</a>
                    <button id="cp-skip" style="flex:1;min-width:150px;padding:10px;border:0;border-radius:8px;background:#57606f;color:#fff;font-size:15px;cursor:pointer">Играть без камеры</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        const $ = (id) => el.querySelector('#' + id);
        let done = false, busy = false, timer = null, perm = null, lastErr = error?.name;

        const show = (err) => {
            const r = reasonText(err);
            $('cp-title').textContent = '📷 ' + r.title;
            $('cp-body').innerHTML = r.body;
            $('cp-settings').style.display = r.settings ? 'block' : 'none';
        };
        const fillList = async () => {
            const sel = $('cp-select');
            const cams = await PoseService.listCameras();
            const keep = sel.value;
            sel.innerHTML = '<option value="">Любая (автоматически)</option>' +
                cams.map((c, i) => `<option value="${c.deviceId}">${(c.label || 'Камера ' + (i + 1)).replace(/</g, '&lt;')}</option>`).join('');
            if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
        };
        const finish = (ok) => {
            if (done) return;
            done = true;
            clearInterval(timer);
            if (perm) perm.onchange = null;
            el.remove();
            resolve(ok);
        };
        const attempt = async (manual) => {
            if (busy || done) return;
            busy = true;
            if (manual) $('cp-status').textContent = 'Включаю камеру...';
            try {
                poseService.cameraId = $('cp-select').value || null;
                await poseService.start();
                finish(true);
            } catch (e) {
                lastErr = e?.name;
                show(e);
                if (manual) $('cp-status').textContent = 'Пока не получилось — игра продолжает пробовать сама.';
                fillList();
            }
            busy = false;
        };

        show(error);
        fillList();
        $('cp-retry').onclick = () => attempt(true);
        $('cp-select').onchange = () => attempt(true);
        $('cp-skip').onclick = () => finish(false);
        // Keeps trying by itself (the other program closed, the camera plugged in...)
        // (not while the camera is forbidden: that would keep re-asking — the permission change below covers it)
        timer = setInterval(() => { if (lastErr !== 'NotAllowedError') attempt(false); }, 4000);
        // ...and at once when the camera gets allowed
        navigator.permissions?.query({ name: 'camera' }).then((p) => {
            perm = p;
            p.onchange = () => { if (p.state === 'granted') attempt(true); };
        }).catch(() => {});
        navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (!done) { fillList(); attempt(false); } });
    });
}

/** Start the camera; if it fails, the panel helps until it works or the player skips. */
export async function startCamera(poseService) {
    try {
        await poseService.start();
        return true;
    } catch (e) {
        console.warn('Camera start failed:', e?.name, e?.message);
        return showCameraPanel(poseService, e);
    }
}
