# ЗОМБИ НЕ СПЯТ — установка на Windows одной командой (без .bat из интернета).
#
# Windows 11 («Интеллектуальное управление приложениями» / Smart App Control)
# блокирует скачанные .bat и неподписанные .exe. Команда, набранная в PowerShell,
# файлом из интернета не является, поэтому запуск идёт так. Откройте «Windows
# PowerShell» (Пуск → набрать PowerShell), вставьте строку и нажмите Enter:
#
#   irm https://raw.githubusercontent.com/DmytroMolodozhonov/working-hand/main-fbxy0j/install-windows.ps1 | iex
#
# Скрипт ставит Python (если его нет), скачивает игру в %LOCALAPPDATA%\ZombieNeSpyat,
# кладёт на рабочий стол «Зомби не спят.bat» (создан на этом компьютере —
# Windows его не блокирует; он же обновляет игру) и запускает игру.
# Только обычные команды PowerShell: работает и в защищённом режиме языка.

& {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue' # иначе скачивание идёт в разы медленнее
    $zipUrl = 'https://github.com/DmytroMolodozhonov/working-hand/archive/refs/heads/main-fbxy0j.zip'
    $base = Join-Path $env:LOCALAPPDATA 'ZombieNeSpyat'
    $game = Join-Path $base 'ZombieNeSpyat'

    function Test-Python($exe, $pre) {
        try {
            & $exe @pre -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' 2>$null | Out-Null
            return $LASTEXITCODE -eq 0
        } catch { return $false }
    }
    function Find-Python {
        if (Test-Python 'python' @()) { return @{ exe = 'python'; pre = @() } }
        if (Test-Python 'py' @('-3')) { return @{ exe = 'py'; pre = @('-3') } }
        foreach ($p in (Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Programs\Python') -Filter 'python.exe' -Recurse -Depth 1 -ErrorAction SilentlyContinue)) {
            if (Test-Python $p.FullName @()) { return @{ exe = $p.FullName; pre = @() } }
        }
        return $null
    }

    Write-Host ''
    Write-Host '=== ЗОМБИ НЕ СПЯТ: установка ===' -ForegroundColor Green

    # ---- Python
    $py = Find-Python
    if (-not $py) {
        Write-Host 'Python не найден — устанавливаю (1-2 минуты)...'
        try {
            winget install -e --id Python.Python.3.13 --scope user --accept-package-agreements --accept-source-agreements
        } catch { }
        # обновить PATH в этом окне
        $u = (Get-ItemProperty -Path 'HKCU:\Environment' -Name Path -ErrorAction SilentlyContinue).Path
        $m = (Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment' -Name Path -ErrorAction SilentlyContinue).Path
        $env:Path = "$m;$u"
        $py = Find-Python
    }
    if (-not $py) {
        Write-Host ''
        Write-Host 'Не получилось установить Python автоматически.' -ForegroundColor Yellow
        Write-Host 'Сейчас откроется сайт: скачайте Python, при установке поставьте галочку'
        Write-Host '"Add python.exe to PATH", потом снова выполните эту команду.'
        Start-Process 'https://www.python.org/downloads/windows/'
        return
    }

    # ---- Игра
    Write-Host 'Скачиваю игру (около 150 МБ), подождите...'
    $zip = Join-Path $env:TEMP 'zns_game.zip'
    $tmp = Join-Path $env:TEMP 'zns_game'
    try {
        Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
    } catch {
        Write-Host 'Не удалось скачать игру. Проверьте интернет и повторите команду.' -ForegroundColor Red
        return
    }
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    # tar.exe есть в Windows 10/11 и распаковывает zip (Expand-Archive в защищённом режиме не работает)
    tar -xf $zip -C $tmp
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Архив повреждён — повторите команду.' -ForegroundColor Red
        return
    }
    $src = (Get-ChildItem $tmp | Select-Object -First 1).FullName
    New-Item -ItemType Directory -Force -Path $game | Out-Null
    Copy-Item -Path (Join-Path $src '*') -Destination $game -Recurse -Force # свои карты (maps) остаются
    # Запускатель с обновлением (тот же, что «Обновить и запустить игру.bat»)
    # (ищем по содержимому: русские имена файлов при распаковке могут исказиться)
    $bat = Get-ChildItem -Path $src -Filter '*.bat' | Where-Object { Select-String -Path $_.FullName -Pattern 'set ZIP=' -Quiet } | Select-Object -First 1
    Copy-Item -Path $bat.FullName -Destination (Join-Path $base 'start.bat') -Force
    Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue

    # ---- Значок на рабочем столе (создан здесь — Windows его не блокирует)
    $desk = (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders' -Name Desktop -ErrorAction SilentlyContinue).Desktop
    if (-not $desk) { $desk = Join-Path $env:USERPROFILE 'Desktop' }
    Set-Content -Path (Join-Path $desk 'Зомби не спят.bat') -Encoding Ascii -Value @(
        '@echo off',
        'call "%LOCALAPPDATA%\ZombieNeSpyat\start.bat"'
    )

    Write-Host ''
    Write-Host 'Готово! На рабочем столе появился значок «Зомби не спят» —' -ForegroundColor Green
    Write-Host 'в следующий раз запускайте игру им (он сам обновляет игру).'
    Write-Host 'Сейчас откроется браузер с игрой. Не закрывайте это окно, пока играете.'
    Write-Host ''
    Set-Location $game
    & $py.exe @($py.pre) server.py
}
