"""
tools/voicegpu_check.py — проверка и включение нейросети голоса на видеокарте (вне браузера и игры).

Запуск из папки игры:
    python tools/voicegpu_check.py            (проверит; при необходимости поставит onnxruntime-directml в vendor/ort-gpu, один раз, ~25 МБ)
    python tools/voicegpu_check.py --no-install   (ничего не ставить, только проверить)

Печатает по шагам: что за система, есть ли нужный пакет, что отвечает программа видеокарты (с её настоящими сообщениями об ошибках —
в игре они скрыты), сколько мс на процессоре и на карте, совпадают ли буквы, и вердикт «карта подходит / не подходит, потому что …».
Присылайте этот вывод целиком, если карта не включается.
"""
import os
import platform
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)


def say(msg=""):
    print(msg, flush=True)


def main():
    install = "--no-install" not in sys.argv
    say("== Голос на видеокарте: проверка ==")
    say(f"Система: {platform.platform()} · Python {platform.python_version()} · {sys.executable}")
    try:
        import numpy as np
        import onnxruntime as ort
        say(f"onnxruntime {ort.__version__}, провайдеры процесса игры: {ort.get_available_providers()}")
    except Exception as e:  # noqa: BLE001
        say(f"ОШИБКА: нет numpy/onnxruntime ({e}). Запустите игру один раз — она их ставит.")
        return 1

    import voice_native as vn
    from voice_native import CtcNet, VoiceNet, GpuCtc, gpu_verdict, models_dir, gpu_model_for

    d = models_dir()
    ctc_dir = os.path.join(d, vn.MODEL_DIR)
    if not os.path.isdir(ctc_dir):
        old = os.path.join(d, vn.MODEL_OLD_DIR)
        ctc_dir = old if os.path.isdir(old) else ctc_dir
    say(f"Модели голоса: {ctc_dir} — {'есть' if os.path.isfile(os.path.join(ctc_dir, 'model.int8.onnx')) else 'НЕТ (запустите игру: она их скачает)'}")
    if not os.path.isfile(os.path.join(ctc_dir, "model.int8.onnx")):
        return 1

    ort_dir = None
    if sys.platform.startswith("win"):
        have = os.path.isdir(os.path.join(vn.ORT_GPU_DIR, "onnxruntime"))
        say(f"vendor/ort-gpu (onnxruntime-directml): {'есть' if have else 'нет'}")
        if have:
            ort_dir = vn.ORT_GPU_DIR
        elif install:
            say("Ставлю onnxruntime-directml (один раз)…")
            try:
                from hand_v5 import ort_gpu_dir
                ort_dir = ort_gpu_dir(say)
                say("Установлено.")
            except Exception as e:  # noqa: BLE001
                say(f"НЕ УДАЛОСЬ ПОСТАВИТЬ: {e}\n  → без этого пакета карта не используется. Проверьте интернет/pip и запустите снова.")
                return 2
        else:
            say("Пакета нет, а --no-install: карта использоваться не будет.")
            return 2
    else:
        say("Не Windows: используется обычный onnxruntime (CUDA на NVIDIA / CoreML на Mac), если он их поддерживает.")

    # 1) the video card's program, with its real messages (the game hides its stderr)
    say("\nЗапускаю программу видеокарты (voice_gpu.py) …")
    t0 = time.time()
    p = subprocess.run([sys.executable, os.path.join(ROOT, "voice_gpu.py"), ctc_dir, ort_dir or "", gpu_model_for(ctc_dir, say) or ""], input=b"", capture_output=True, timeout=180)
    say(f"  завершилась за {time.time() - t0:.1f} с, код {p.returncode}")
    err = (p.stderr or b"").decode("utf-8", "replace").strip()
    if err:
        say("  её сообщения об ошибках:\n    " + "\n    ".join(err.splitlines()[-12:]))
    head = p.stdout[:400]
    if b"HELO" in head:
        i = head.index(b"HELO") + 8
        say("  её ответ о себе: " + head[i:].split(b"}")[0].decode("utf-8", "replace") + "}")

    # 2) the same check the game does
    say("\nСравнение процессора и видеокарты (как делает игра) …")
    cpu = VoiceNet(CtcNet(ctc_dir, threads=int(os.environ.get("ZNS_VOICE_THREADS") or vn.voice_threads())))
    try:
        gm = gpu_model_for(ctc_dir, say)
        say(f"  модель для карты: {gm or 'сжатая (model.int8.onnx)'}")
        g = GpuCtc(ctc_dir, ort_dir, model=gm)
    except Exception as e:  # noqa: BLE001
        say(f"ВИДЕОКАРТА НЕ ПОДХОДИТ: {e}")
        return 3
    rng = np.random.default_rng(7)
    feats = [rng.normal(-6, 3, (n, 64)).astype(np.float32) for n in (120, 300)]

    def best(run):
        ts = []
        for _ in range(7):
            t = time.perf_counter()
            run(feats[1])
            ts.append((time.perf_counter() - t) * 1000)
        return sorted(ts)[3]
    cpu_ms, gpu_ms = best(cpu.cpu.run), best(g.run)
    use, why = gpu_verdict(np, cpu.cpu.run, g.run, feats, cpu_ms, gpu_ms)
    say(f"  провайдер видеокарты: {g.info.get('provider', '?')} (доступные: {g.info.get('providers')})")
    say(f"  процессор: {cpu_ms:.0f} мс · видеокарта: {gpu_ms:.0f} мс на 3 с звука")
    say(("  ВЕРДИКТ: карта подходит — " if use else "  ВЕРДИКТ: карта НЕ используется — ") + why)
    g.close()
    if use:
        say("\nВсё хорошо: игра сама возьмёт карту при следующем запуске голоса.")
        return 0
    say("\nПришлите этот вывод целиком.")
    return 4


if __name__ == "__main__":
    sys.exit(main())
