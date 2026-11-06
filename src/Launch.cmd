@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
node "%~dp0launch.cjs"
if errorlevel 1 pause
