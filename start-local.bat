@echo off
setlocal

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1" -Menu

if errorlevel 1 (
    echo.
    echo Start failed. Press any key to close this window.
    pause >nul
)
