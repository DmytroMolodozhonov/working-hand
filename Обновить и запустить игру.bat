@echo off
chcp 65001 >nul
title ZOMBI NE SPYAT - obnovlenie
cd /d "%~dp0"
set REPO=https://github.com/DmytroMolodozhonov/working-hand.git
set BRANCH=main-fbxy0j
set ZIP=https://github.com/DmytroMolodozhonov/working-hand/archive/refs/heads/main-fbxy0j.zip
set DIR=ZombieNeSpyat

rem ---- Python is needed to run the game
rem (really run it: the Microsoft Store "python" stub only opens the Store)
set PY=
python -c "import sys" 1>nul 2>&1 && set PY=python
if not defined PY py -3 -c "import sys" 1>nul 2>&1 && set PY=py -3
if not defined PY (
    echo Python ne najden. Ustanovite Python 3: https://www.python.org/downloads/windows/
    echo Pri ustanovke postavte galochku "Add python.exe to PATH", potom zapustite etot fajl snova.
    pause
    exit /b 1
)

rem ---- With Git: download / update; without Git: download the zip archive
where git 1>nul 2>&1
if errorlevel 1 goto nogit
rem Downloaded as an archive earlier: keep updating it that way
if exist "%DIR%\server.py" if not exist "%DIR%\.git" goto nogit
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
rem ---- Without Git: the zip archive, downloaded only when there is a new version
set NEWVER=
set OLDVER=
set VLINE=
rem Latest version number: 1) git refs via curl.exe (built into Windows 10/11), 2) GitHub API
for /f "delims=" %%a in ('curl.exe -s -m 20 "https://github.com/DmytroMolodozhonov/working-hand/info/refs?service=git-upload-pack" 2^>nul ^| findstr /c:"refs/heads/%BRANCH%"') do set "VLINE=%%a"
if defined VLINE set "NEWVER=%VLINE:~4,40%"
if defined NEWVER goto havever
if exist "%TEMP%\zns_ver.txt" del "%TEMP%\zns_ver.txt"
powershell -NoProfile -Command "try { (Invoke-RestMethod -UseBasicParsing -Uri 'https://api.github.com/repos/DmytroMolodozhonov/working-hand/branches/%BRANCH%').commit.sha | Set-Content -Encoding Ascii -Path '%TEMP%\zns_ver.txt' } catch { }" 1>nul 2>&1
if exist "%TEMP%\zns_ver.txt" set /p NEWVER=<"%TEMP%\zns_ver.txt"
:havever
if exist "%DIR%\.zns-version" set /p OLDVER=<"%DIR%\.zns-version"
echo Versiya na kompyutere: %OLDVER%
echo Versiya na GitHub:     %NEWVER%
if exist "%DIR%\server.py" if defined NEWVER if "%NEWVER%"=="%OLDVER%" (
    echo Igra uzhe svezhaya, zapuskayu.
    goto rundir
)
rem Unknown latest version: download anyway (if that fails, the old version starts)
echo Skachivayu svezhuyu versiyu igry (okolo 150 MB), podozhdite...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $z=Join-Path $env:TEMP 'zns_game.zip'; $t=Join-Path $env:TEMP 'zns_game'; Invoke-WebRequest -Uri '%ZIP%' -OutFile $z -UseBasicParsing; if (Test-Path $t) { Remove-Item $t -Recurse -Force }; New-Item -ItemType Directory -Force -Path $t | Out-Null; tar -xf $z -C $t; if ($LASTEXITCODE -ne 0) { throw 'unzip' }; $src=(Get-ChildItem $t | Select-Object -First 1).FullName; New-Item -ItemType Directory -Force -Path '%DIR%' | Out-Null; Copy-Item -Path (Join-Path $src '*') -Destination '%DIR%' -Recurse -Force; Remove-Item $z, $t -Recurse -Force"
if errorlevel 1 (
    if exist "%DIR%\server.py" (
        echo Ne udalos obnovit - zapuskayu uzhe skachannuyu versiyu.
        goto rundir
    )
    echo Ne udalos skachat igru. Proverte internet i povtorite.
    pause
    exit /b 1
)
if defined NEWVER >"%DIR%\.zns-version" echo %NEWVER%

:rundir
cd "%DIR%"

:run
echo.
echo Gotovo! Zapuskayu igru... Esli zakryli vkladku - otkrojte http://localhost:8000 poka eto okno otkryto.
%PY% server.py
pause
