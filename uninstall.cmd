@echo off
chcp 65001 >nul
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0native\bootstrap.ps1" uninstall %*
set "OJ_BRIDGE_EXIT=%ERRORLEVEL%"
echo.
if not defined OJ_BRIDGE_NO_PAUSE pause
exit /b %OJ_BRIDGE_EXIT%
