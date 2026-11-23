import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseService } from '../../src/input/PoseService.js';

function camera(readyState) {
    const track = { readyState, stop() { this.readyState = 'ended'; } };
    return { getTracks: () => [track], getVideoTracks: () => [track] };
}

test('a browser camera is replaced after the hardware stream ends, not while it sends frames', async () => {
    const documentBefore = globalThis.document;
    globalThis.document = { hidden: false };
    try {
        const svc = new PoseService();
        svc.isRunning = true;
        svc.stream = camera('live');
        svc._cameraFrameAt = 1000;
        const replacement = camera('live');
        let opened = 0, pumped = 0;
        svc._openCamera = async () => { opened++; return replacement; };
        svc._pump = () => pumped++;
        await svc._checkCapture(5000);
        assert.equal(opened, 0);
        svc.stream.getTracks()[0].stop();
        await Promise.all([svc._checkCapture(5100), svc._checkCapture(5101)]);
        assert.equal(svc.stream, replacement);
        assert.equal(opened, 1);
        assert.equal(pumped, 1);
        svc.stop();
        await svc._checkCapture(90000);
        assert.equal(opened, 1);
    } finally { globalThis.document = documentBefore; }
});

test('a silent native stream reopens and keeps the active game session', async () => {
    const documentBefore = globalThis.document, eventBefore = globalThis.EventSource;
    globalThis.document = { hidden: false };
    globalThis.EventSource = { CLOSED: 2 };
    try {
        const svc = new PoseService();
        svc.isRunning = true;
        svc.native = { quality: 1 };
        svc._cameraFrameAt = 1000;
        let closed = 0, opened = 0;
        svc._native = { readyState: 1, close: () => closed++ };
        svc._startNative = async () => { opened++; return true; };
        await svc._checkCapture(8300);
        assert.equal(closed, 1);
        assert.equal(opened, 1);
        assert.equal(svc.isRunning, true);
    } finally { globalThis.document = documentBefore; globalThis.EventSource = eventBefore; }
});

test('leaving the page cancels an EventSource still waiting for the first image', async () => {
    const eventBefore = globalThis.EventSource;
    let es;
    globalThis.EventSource = class {
        constructor() { es = this; }
        addEventListener() {}
        close() { this.closed = true; }
    };
    try {
        const svc = new PoseService();
        svc.native = { quality: 1 };
        const opened = svc._startNative();
        svc.stop();
        assert.equal(await opened, false);
        assert.equal(es.closed, true);
        es.onmessage({ data: '{}' });
        assert.ok(!svc._native);
    } finally { globalThis.EventSource = eventBefore; }
});

test('after two failed native reconnects the active game switches to browser capture', async () => {
    const documentBefore = globalThis.document;
    globalThis.document = { hidden: false };
    try {
        const svc = new PoseService();
        svc.isRunning = true;
        svc.native = { quality: 2 };
        const browser = camera('live');
        let attempts = 0, pumped = 0;
        svc._startNative = async () => { attempts++; return false; };
        svc._startBrowserModels = async (quality) => { assert.equal(quality, 2); svc.native = null; };
        svc._openCamera = async () => browser;
        svc._pump = () => pumped++;
        await svc._checkCapture(10000);
        assert.equal(svc.stream, null);
        svc._captureRetryAt = 0;
        await svc._checkCapture(20000);
        assert.equal(attempts, 2);
        assert.equal(svc.stream, browser);
        assert.equal(pumped, 1);
        assert.equal(svc.isRunning, true);
    } finally { globalThis.document = documentBefore; }
});

test('buffered native poses do not mask loss of fresh frames', () => {
    const svc = new PoseService();
    svc._cameraFrameAt = 123;
    svc._onNative({ t: Date.now() - 1200 });
    assert.equal(svc._cameraFrameAt, 123);
    assert.equal(svc.stats.nativeRejected, 1);
});

test('a stalled browser frame callback falls back to polling without stopping capture', async () => {
    const documentBefore = globalThis.document;
    globalThis.document = { hidden: false };
    try {
        const svc = new PoseService();
        svc.isRunning = true;
        svc.stream = camera('live');
        svc._cameraFrameAt = 1000;
        svc._lastVideoTime = 1;
        svc.videoElement = { currentTime: 2, paused: false, readyState: 2 };
        let read = 0, pumps = 0;
        svc._onVideoFrame = () => read++;
        svc._pump = () => pumps++;
        await svc._checkCapture(9000);
        assert.equal(svc.stream.getVideoTracks()[0].readyState, 'live');
        assert.equal(svc._timerVideo, true);
        assert.equal(read, 1);
        assert.equal(pumps, 1);
    } finally { globalThis.document = documentBefore; }
});
