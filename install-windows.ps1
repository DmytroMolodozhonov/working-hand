# «Волшебство только начинается» — установка на Windows одной командой (без .bat из интернета).
#
# Windows 11 («Интеллектуальное управление приложениями» / Smart App Control)
# блокирует скачанные .bat и неподписанные .exe. Команда, набранная в PowerShell,
# файлом из интернета не является, поэтому запуск идёт так. Откройте «Windows
# PowerShell» (Пуск → набрать PowerShell), вставьте строку и нажмите Enter:
#
#   irm https://raw.githubusercontent.com/DmytroMolodozhonov/working-hand/main-fbxy0j/install-windows.ps1 | iex
#
# Скрипт ставит Python (если его нет), кладёт маленький запускатор игры в
# %LOCALAPPDATA%\Volshebstvo\launcher и открывает его окно. Дальше всё — в этом окне:
# выбор папки для игры, скачивание, значок на рабочем столе, запуск.
# Запускатор работает через pythonw.exe (подписан разработчиками Python) — без чёрного окна.
# Только обычные команды PowerShell: работает и в защищённом режиме языка.

& {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue' # иначе скачивание идёт в разы медленнее
    $raw = 'https://raw.githubusercontent.com/DmytroMolodozhonov/working-hand/main-fbxy0j'
    $home2 = Join-Path $env:LOCALAPPDATA 'Volshebstvo'
    $ldir = Join-Path $home2 'launcher'

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
    Write-Host '=== Волшебство только начинается: установка ===' -ForegroundColor Yellow

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
    # настоящий путь к python.exe (а не к «py»), рядом с ним pythonw.exe — он без чёрного окна
    $exe = (& $py.exe @($py.pre) -c 'import sys; print(sys.executable)').Trim()
    $pyw = Join-Path (Split-Path $exe) 'pythonw.exe'
    if (-not (Test-Path $pyw)) { $pyw = $exe }

    # ---- Запускатор (несколько маленьких файлов; саму игру он скачает в своём окне)
    Write-Host 'Скачиваю запускатор игры...'
    New-Item -ItemType Directory -Force -Path $ldir | Out-Null
    $files = @(
        @('launcher/launcher.pyw', 'launcher.pyw'),
        @('launcher/zns_launcher.py', 'zns_launcher.py'),
        @('launcher/loading.html', 'loading.html'),
        @('assets/logo/logo.ico', 'logo.ico'),
        @('assets/logo/logo-256.png', 'logo.png')
    )
    foreach ($f in $files) {
        try {
            Invoke-WebRequest -Uri "$raw/$($f[0])" -OutFile (Join-Path $ldir $f[1]) -UseBasicParsing
        } catch {
            if ($f[1] -like 'logo*') { continue } # без значка тоже работает
            Write-Host 'Не удалось скачать запускатор. Проверьте интернет и повторите команду.' -ForegroundColor Red
            return
        }
    }

    Write-Host ''
    Write-Host 'Готово! Сейчас откроется окно игры: выберите в нём папку для игры —' -ForegroundColor Green
    Write-Host 'дальше оно само скачает игру и положит значок на рабочий стол.'
    Write-Host 'Это окно PowerShell можно закрыть.'
    Write-Host ''
    Start-Process -FilePath $pyw -ArgumentList ('"' + (Join-Path $ldir 'launcher.pyw') + '"') -WorkingDirectory $ldir
}
