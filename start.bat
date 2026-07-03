@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AudioCut server (port 7000) - DO NOT close this window

rem --- find a Python launcher once ---
set "PYCMD="
where python >nul 2>nul && set "PYCMD=python"
if not defined PYCMD ( where py >nul 2>nul && set "PYCMD=py" )
if not defined PYCMD (
  echo Python not found - install from python.org
  pause
  goto :eof
)

echo Starting local server on http://localhost:7000
echo מפעיל שרת מקומי - השאירו חלון זה פתוח
echo.

start "" http://localhost:7000/index.html

:serve
rem --- free port 7000 if a previous/stuck server is still holding it, so the
rem     restart below can actually bind instead of failing forever ---
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":7000 .*LISTENING"') do (
  echo Freeing port 7000 from stale process %%p
  taskkill /f /pid %%p >nul 2>nul
)

echo [%date% %time%] Serving http://localhost:7000  (leave this window open)
%PYCMD% serve.py
echo.
echo ^<^<^< Server stopped. Restarting in 2 seconds. Close this window to stop it. ^>^>^>
timeout /t 2 /nobreak >nul
goto serve
