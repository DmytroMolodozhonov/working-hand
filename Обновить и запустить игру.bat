@echo off
chcp 65001 >nul
title ZOMBI NE SPYAT - obnovlenie
cd /d "%~dp0"
set REPO=https://github.com/DmytroMolodozhonov/working-hand.git
set BRANCH=main-fbxy0j
set DIR=ZombieNeSpyat
where git 1>nul 2>&1
if errorlevel 1 (
    echo Git ne najden. Ustanovite Git: https://git-scm.com/download/win
    pause
    exit /b 1
)
if exist "%DIR%\.git" (
    echo Obnovlyayu igru...
    cd "%DIR%"
    git fetch origin %BRANCH%
    git checkout -q %BRANCH%
    git pull --ff-only origin %BRANCH%
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
echo Gotovo! Zapuskayu igru...
where python 1>nul 2>&1
if errorlevel 1 (
    py server.py
) else (
    python server.py
)
pause
