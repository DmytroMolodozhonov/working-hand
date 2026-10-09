/**
 * vision.worker.js — MediaPipe inference off the main thread.
 * Protocol:
 *   main -> worker  {type:'init', baseUrl, quality}
 *   worker -> main  {type:'ready', delegate, poseModel} | {type:'error', message}
 *   main -> worker  {type:'frame', bitmap, ts}   (bitmap is transferred)
 *   worker -> main  {type:'result', result}
 */

import { VisionRunner } from './VisionRunner.js';

let runner = null;

self.onmessage = async (event) => {
    const msg = event.data;
    try {
        if (msg.type === 'init') {
            if (msg.delegate) self.__ZNS_DELEGATE__ = msg.delegate;
            runner = new VisionRunner(msg.baseUrl);
            if (msg.allowCpuHolistic) self.__ZNS_ALLOW_CPU_HOLISTIC__ = true;
            const info = await runner.init({ quality: msg.quality, useModule: true, handsOnly: !!msg.handsOnly, holistic: !!msg.holistic });
            self.postMessage({ type: 'ready', ...info });
        } else if (msg.type === 'frame') {
            if (!runner) { msg.bitmap?.close?.(); return; }
            const result = runner.detect(msg.bitmap, msg.ts);
            msg.bitmap.close?.();
            self.postMessage({ type: 'result', result });
        } else if (msg.type === 'close') {
            runner?.close();
            runner = null;
        }
    } catch (e) {
        msg.bitmap?.close?.();
        self.postMessage({ type: 'error', message: String(e?.message || e), during: msg.type });
    }
};
