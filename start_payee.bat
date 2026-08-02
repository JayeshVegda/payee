@echo off
title Payee Payment Ledger (http://127.0.0.1:4782)
cd /d "%~dp0"
set PATH=%~dp0..\important_sites\node;%PATH%
set PAYMENT_LEDGER_DATA_DIR=%~dp0
set NODE_OPTIONS=--max-old-space-size=1536
echo.
echo ========================================================
echo   Starting Payee Payment Ledger on http://127.0.0.1:4782
echo ========================================================
echo.
start http://127.0.0.1:4782
node --env-file-if-exists=.env scripts/start-production.mjs
pause
