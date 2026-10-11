@echo off
chcp 65001 >nul
title VOLSHEBSTVO TOLKO NACHINAETSYA
cd /d "%~dp0"
where python 1>nul 2>&1
if %errorlevel%==0 (
    python server.py
) else (
    py server.py
)
pause
