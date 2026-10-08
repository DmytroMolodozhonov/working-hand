@echo off
chcp 65001 >nul
title ZOMBI NE SPYAT - obnovlenie
cd /d "%~dp0"
set REPO=https://github.com/DmytroMolodozhonov/working-hand.git
set BRANCH=main-fbxy0j
set ZIP=https://github.com/DmytroMolodozhonov/working-hand/archive/refs/heads/main-fbxy0j.zip
set DIR=ZombieNeSpyat

rem ---- Python is needed to run the game
set PY=
where python 1>nul 2>&1 && set PY=python
if not defined PY where py 1>nul 2>&1 && set PY=py
if not defined PY (
    echo Python ne najden. Ustanovite Python 3: https://www.python.org/downloads/windows/
    echo Pri ustanovke postavte galochku "Add python.exe to PATH", potom zapustite etot fajl snova.
    pause
    exit /b 1
)

rem ---- With Git: download / update; without Git: download the zip archive
where git 1>nul 2>&1
if errorlevel 1 goto nogit
if exist "%DIR%\.git" (
    echo Obnovlyayu igru...
    cd "%DIR%"
    git fetch origin %BRANCH%
    git checkout -q %BRANCH%
    rem Saved maps / settings must never block the update
    git stash -q -u >nul 2>&1
    git pull --ff-only origin %BRANCH%
    git stash pop -q >nul 2>&1
) else (
    echo Skachivayu igru pervyj raz, eto zajmet minutu...
    git clone -b %BRANCH% %REPO% "%DIR%"
    cd "%DIR%"
)
if errorlevel 1 (
    echo Ne udalos obnovit. Proverte internet i povtorite.
    pause
    exit /b 1
)
echo.
echo Versiya igry:
git log -1 --format="  %%cd  %%s" --date=format:"%%d.%%m.%%Y %%H:%%M"
goto run

:nogit
echo Git ne najden - skachivayu igru arhivom (okolo 150 MB), podozhdite...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $z=Join-Path $env:TEMP 'zns_game.zip'; $t=Join-Path $env:TEMP 'zns_game'; Invoke-WebRequest -Uri '%ZIP%' -OutFile $z -UseBasicParsing; if (Test-Path $t) { Remove-Item $t -Recurse -Force }; Expand-Archive -Path $z -DestinationPath $t -Force; $src=(Get-ChildItem $t | Select-Object -First 1).FullName; New-Item -ItemType Directory -Force -Path '%DIR%' | Out-Null; Copy-Item -Path (Join-Path $src '*') -Destination '%DIR%' -Recurse -Force; Remove-Item $z, $t -Recurse -Force"
if errorlevel 1 (
    echo Ne udalos skachat igru. Proverte internet i povtorite.
    pause
    exit /b 1
)
cd "%DIR%"

:run
echo.
echo Gotovo! Zapuskayu igru...
%PY% server.py
pause
