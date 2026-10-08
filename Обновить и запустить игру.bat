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
    rem Always take the published version as is. Your own new maps are separate
    rem files and stay; a stuck earlier update is cleaned up here.
    git reset -q --hard >nul 2>&1
    git fetch origin %BRANCH%
    if errorlevel 1 goto fail
    git checkout -q -B %BRANCH% FETCH_HEAD
    git reset -q --hard FETCH_HEAD
) else (
    echo Skachivayu igru pervyj raz, eto zajmet minutu...
    git clone -b %BRANCH% %REPO% "%DIR%"
    cd "%DIR%"
)
if errorlevel 1 goto fail
echo.
echo Versiya igry:
git log -1 --format="  %%cd  %%s" --date=format:"%%d.%%m.%%Y %%H:%%M"
goto run

:fail
echo Ne udalos obnovit. Proverte internet i povtorite.
pause
exit /b 1

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
