@echo off
cd /d "%~dp0"
node scripts\publish-rankings.cjs %*
echo.
pause
