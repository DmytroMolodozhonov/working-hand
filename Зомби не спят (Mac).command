#!/bin/bash
# ЗОМБИ НЕ СПЯТ — запуск на Mac (двойной клик).
# Скачивает свежую версию игры (или обновляет уже скачанную) и запускает её.
# Если двойной клик не срабатывает: откройте «Терминал», напишите  bash  и пробел,
# перетащите этот файл в окно Терминала и нажмите Enter.

cd "$(dirname "$0")" || exit 1
ZIP_URL="https://github.com/DmytroMolodozhonov/working-hand/archive/refs/heads/main-fbxy0j.zip"
DIR="ZombieNeSpyat"

pause() { echo; read -r -p "Нажмите Enter, чтобы закрыть окно..." _; }

# ---- Python нужен для запуска игры
PY=""
for c in python3 /usr/local/bin/python3 /opt/homebrew/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >/dev/null 2>&1; then
        PY="$c"; break
    fi
done
if [ -z "$PY" ]; then
    echo "Python не найден. Сейчас откроется страница загрузки:"
    echo "скачайте «macOS 64-bit universal2 installer», установите его и запустите этот файл снова."
    open "https://www.python.org/downloads/macos/"
    pause
    exit 1
fi

# ---- Скачать / обновить игру (архив с GitHub, Git не нужен)
echo "Скачиваю свежую версию игры (около 150 МБ), подождите..."
TMP="$(mktemp -d)"
if ! curl -fL --progress-bar -o "$TMP/game.zip" "$ZIP_URL"; then
    rm -rf "$TMP"
    if [ -f "$DIR/server.py" ]; then
        echo "Не удалось обновить (нет интернета?) — запускаю уже скачанную версию."
    else
        echo "Не удалось скачать игру. Проверьте интернет и попробуйте снова."
        pause
        exit 1
    fi
else
    unzip -q "$TMP/game.zip" -d "$TMP/x" || { echo "Архив повреждён, попробуйте снова."; rm -rf "$TMP"; pause; exit 1; }
    SRC="$(find "$TMP/x" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    mkdir -p "$DIR"
    # Поверх старой версии: ваши собственные карты (папка maps) остаются
    cp -R "$SRC/." "$DIR/"
    rm -rf "$TMP"
fi

cd "$DIR" || exit 1
echo
echo "Готово! Запускаю игру — откроется браузер (лучше Chrome)."
echo "Не закрывайте это окно, пока играете."
"$PY" server.py
pause
