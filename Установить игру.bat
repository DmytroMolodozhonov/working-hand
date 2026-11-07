@echo off
rem Volshebstvo tolko nachinaetsya - ustanovka odnim failom: dvazhdy shchelknut. Delaet to zhe, chto stroka iz README (Win+R), i potom sam sebya udalyaet.
rem Esli Windows 11 pishet "Smart App Control zablokiroval prilozhenie" - eti fajly iz interneta on ne puskaet: vmesto fajla vstavte stroku iz README v okno Win+R.
title Volshebstvo tolko nachinaetsya - ustanovka
echo.
echo Ustanavlivayu igru. Sejchas otkroetsya okno igry - vyberite v nem papku dlya igry.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/DmytroMolodozhonov/working-hand/main-fbxy0j/install-windows.ps1 | iex"
rem the launcher is installed: this file is not needed any more (the desktop icon does everything); not installed: stays, to be run again
if exist "%LOCALAPPDATA%\Volshebstvo\launcher\launcher.pyw" (goto) 2>nul & del "%~f0"
exit /b
